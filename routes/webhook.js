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

module.exports = router;
