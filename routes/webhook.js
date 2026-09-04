const express = require('express');
const router = express.Router();
const crypto = require('crypto');

const { getSession, createSession, updateSession, addToHistory, getHistory, restoreVerifiedSession } = require('../services/sessionManager');
const { detectIntent, detectIntentWithContext, generateResponse, retrieveContext } = require('../services/aiEngine');
const { sendTextMessage } = require('../services/whatsappService');

const { handleRegistration } = require('../controllers/registrationController');
const { showMenu, handleMenuSelection } = require('../controllers/menuController');
const { handleAttendance } = require('../controllers/attendanceController');
const { handleCIE } = require('../controllers/cieController');
const { handleExamHistory } = require('../controllers/examHistoryController');
const { handleFee } = require('../controllers/feeController');
const { handleTimetable } = require('../controllers/timetableController');
const { handleCertificate } = require('../controllers/certificateController');
const { handleNotifications } = require('../controllers/notificationController');

const { normalizePhone } = require('../services/identityService');
const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || 'contXpert_verify_123';

// Webhook Verification (Meta requires this - kept for backward compatibility)
router.get('/', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('[Webhook] Verified');
    return res.status(200).send(challenge);
  }

  if (mode || token || challenge) {
    return res.status(403).send('Forbidden: webhook verification failed. Check your verify token and query parameters.');
  }

  res.status(200).send(
    'WhatsApp webhook endpoint. Using Twilio API. ' +
    'Configure your Twilio webhook URL to point to this endpoint.'
  );
});

// Main Webhook Handler - AI-Powered State Machine (Twilio format)
router.post('/', async (req, res) => {
  // Twilio expects a response within 15 seconds
  res.setHeader('Content-Type', 'text/xml');
  res.send('<Response></Response>');

  try {
    // Twilio webhook format
    const phoneNumber = req.body.From || req.body.from;
    // Taps on a native WhatsApp list return the stable item id as ButtonPayload.
    const text = req.body.ButtonPayload || req.body.buttonPayload || req.body.ButtonText || req.body.buttonText || req.body.Body || req.body.body || '';

    if (!phoneNumber || !text) {
      console.log('[Webhook] Missing phone number or message body');
      return;
    }

    // Clean phone number (remove 'whatsapp:' prefix if present)
    const cleanPhone = normalizePhone(phoneNumber);

    console.log(`[Webhook] From: ${phoneNumber}, Text: "${text.substring(0, 50)}"`);

    let session = await getSession(cleanPhone);
    if (!session) {
      // A verified number remains logged in even if its temporary session is
      // cleared or the service restarts. A number can only belong to one USN.
      session = await restoreVerifiedSession(cleanPhone);
      if (!session) {
        await createSession(cleanPhone, 'unregistered');
        session = await getSession(cleanPhone);
      }
    }

    const intentResult = detectIntentWithContext(text, session.data?.history || []);
    await addToHistory(cleanPhone, 'user', text, intentResult.intent);

    console.log(`[AI] Intent: ${intentResult.intent} (conf: ${intentResult.confidence})`);

    await routeMessage(cleanPhone, text, session, intentResult);

  } catch (error) {
    console.error('[Webhook] Error:', error);
  }
});

async function routeMessage(phoneNumber, text, session, intentResult) {
  const state = session.state;
  const lowerText = text.toLowerCase().trim();

  // Global commands
  if (lowerText === 'menu' || lowerText === 'help' || lowerText === 'options') {
    if (session.data?.studentId) {
      await showMenu(phoneNumber, session.data);
    } else {
      await sendTextMessage(phoneNumber, 
        "Please complete registration first. Type 'hi' to start.");
    }
    return;
  }

  if (lowerText === 'bye' || lowerText === 'goodbye') {
    const goodbye = await generateResponse(text, intentResult, session.data);
    await sendTextMessage(phoneNumber, goodbye.text);
    await addToHistory(phoneNumber, 'assistant', goodbye.text, 'goodbye');
    return;
  }

  // A service command must always win over an unfinished flow. For example,
  // “attendance” exits certificate selection instead of being treated as a
  // certificate option. This also accepts the common “attendence” spelling.
  const selectedService = resolveService(text, intentResult.intent);
  const isCertificateInput =
    (state === 'selecting_certificate_type' && /^[1-5]$/.test(lowerText)) ||
    ((state === 'awaiting_payment' || state === 'payment_pending') && /^(pay|cancel)$/i.test(lowerText));
  if (isCertificateInput) {
    await handleCertificate(phoneNumber, text, session);
    return;
  }
  if (selectedService && session.data?.studentId) {
    await routeSelectedService(phoneNumber, text, session, selectedService);
    return;
  }

  // State-based routing
  switch (state) {
    case 'unregistered':
    case 'awaiting_usn':
    case 'awaiting_dob':
      await handleRegistration(phoneNumber, text, session);
      break;

    case 'registered':
    case 'menu_shown':
      const menuChoice = await handleMenuSelection(phoneNumber, text, session);

      switch (menuChoice) {
        case 'attendance': await handleAttendance(phoneNumber, text, session); break;
        case 'marks': await handleCIE(phoneNumber, text, session); break;
        case 'exam_history': await handleExamHistory(phoneNumber, text, session); break;
        case 'fee': await handleFee(phoneNumber, text, session); break;
        case 'timetable': await handleTimetable(phoneNumber, text, session); break;
        case 'certificate': await handleCertificate(phoneNumber, text, session); break;
        case 'notification': await handleNotifications(phoneNumber, text, session); break;
        case 'menu': break;
        case 'unknown':
          if (session.data?.studentId) {
            const aiResp = await generateResponse(text, intentResult, session.data, {
              history: session.data.history || []
            });
            await sendTextMessage(phoneNumber, aiResp.text);
            await addToHistory(phoneNumber, 'assistant', aiResp.text, aiResp.intent);
          }
          break;
      }
      break;

    case 'viewing_attendance':
      if (intentResult.intent === 'attendance' || lowerText.includes('attendance')) {
        await handleAttendance(phoneNumber, text, session);
      } else {
        await handleMenuSelection(phoneNumber, text, session);
      }
      break;

    case 'viewing_marks':
      if (intentResult.intent === 'marks' || lowerText.includes('mark') || lowerText.includes('cie')) {
        await handleCIE(phoneNumber, text, session);
      } else {
        await handleMenuSelection(phoneNumber, text, session);
      }
      break;

    case 'viewing_exam_history':
      if (intentResult.intent === 'exam_history' || lowerText.includes('exam') || lowerText.includes('result') || lowerText.includes('sgpa') || lowerText.includes('cgpa')) {
        await handleExamHistory(phoneNumber, text, session);
      } else {
        await handleMenuSelection(phoneNumber, text, session);
      }
      break;

    case 'viewing_fee':
      if (intentResult.intent === 'fee' || lowerText.includes('fee')) {
        await handleFee(phoneNumber, text, session);
      } else {
        await handleMenuSelection(phoneNumber, text, session);
      }
      break;

    case 'viewing_timetable':
      if (intentResult.intent === 'timetable' || lowerText.includes('timetable') || lowerText.includes('schedule')) {
        await handleTimetable(phoneNumber, text, session);
      } else {
        await handleMenuSelection(phoneNumber, text, session);
      }
      break;

    case 'requesting_certificate':
    case 'selecting_certificate_type':
    case 'awaiting_payment':
      await handleCertificate(phoneNumber, text, session);
      break;

    case 'viewing_notifications':
      await handleNotifications(phoneNumber, text, session);
      break;

    default:
      if (session.data?.studentId) {
        const aiResp = await generateResponse(text, intentResult, session.data, {
          history: session.data.history || []
        });
        await sendTextMessage(phoneNumber, aiResp.text);
        await addToHistory(phoneNumber, 'assistant', aiResp.text, aiResp.intent);
      } else {
        await sendTextMessage(phoneNumber, 
          "I'm not sure how to help with that. Type 'menu' for options or 'hi' to start.");
      }
  }
}

function resolveService(text, detectedIntent) {
  const value = text.toLowerCase().trim().replace(/\s+/g, ' ');
  const payloadServiceMap = {
    attendance: 'attendance', marks: 'marks', cie: 'marks',
    exam_history: 'exam_history', fee: 'fee', timetable: 'timetable',
    certificate: 'certificate', notification: 'notification'
  };
  if (payloadServiceMap[value]) return payloadServiceMap[value];
  if (/\b(attendance|attendence|attend|present)\b/.test(value)) return 'attendance';
  if (/\b(cie|marks?|internal)\b/.test(value)) return 'marks';
  if (/\b(exam history|results?|sgpa|cgpa)\b/.test(value)) return 'exam_history';
  if (/\b(fee|fees|payment|balance|due)\b/.test(value)) return 'fee';
  if (/\b(timetable|schedule|class)\b/.test(value)) return 'timetable';
  if (/\b(certificates?|bonafide|migration|transcript)\b/.test(value)) return 'certificate';
  if (/\b(notifications?|alerts?|announcements?)\b/.test(value)) return 'notification';
  return ['attendance', 'marks', 'exam_history', 'fee', 'timetable', 'certificate', 'notification'].includes(detectedIntent)
    ? detectedIntent
    : null;
}

async function routeSelectedService(phoneNumber, text, session, service) {
  const stateByService = {
    attendance: 'viewing_attendance', marks: 'viewing_marks',
    exam_history: 'viewing_exam_history', fee: 'viewing_fee',
    timetable: 'viewing_timetable', certificate: 'requesting_certificate',
    notification: 'viewing_notifications'
  };
  const nextState = stateByService[service];
  await updateSession(phoneNumber, nextState, session.data);
  const freshSession = { ...session, state: nextState };

  switch (service) {
    case 'attendance': return handleAttendance(phoneNumber, text, freshSession);
    case 'marks': return handleCIE(phoneNumber, text, freshSession);
    case 'exam_history': return handleExamHistory(phoneNumber, text, freshSession);
    case 'fee': return handleFee(phoneNumber, text, freshSession);
    case 'timetable': return handleTimetable(phoneNumber, text, freshSession);
    case 'certificate': return handleCertificate(phoneNumber, text, freshSession);
    case 'notification': return handleNotifications(phoneNumber, text, freshSession);
  }
}

module.exports = router;
