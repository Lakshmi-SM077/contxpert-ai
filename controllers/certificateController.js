const pool = require('../config/database');
const { sendTextMessage, sendInteractiveButtons } = require('../services/whatsappService');
const { updateSession } = require('../services/sessionManager');
const { createPaymentLink } = require('../services/paymentService');
const { detectIntent, generateResponse, retrieveContext } = require('../services/aiEngine');

const CERTIFICATE_TYPES = {
  'bonafide': { name: 'Bonafide Certificate', fee: 150 },
  'study': { name: 'Study Certificate', fee: 100 },
  'fee_structure': { name: 'Fee Structure Certificate', fee: 100 },
  'migration': { name: 'Migration Certificate', fee: 200 },
  'exam_history': { name: 'Exam History Certificate', fee: 150 }
};

async function handleCertificate(phoneNumber, text, session) {
  const state = session?.state || 'requesting_certificate';
  const studentData = session.data;

  const intentResult = detectIntent(text);
  const lowerText = text.toLowerCase();

  switch (state) {
    case 'requesting_certificate':
      // AI-enhanced: detect certificate type from natural language
      let selectedType = null;

      if (lowerText.includes('bonafide')) selectedType = 'bonafide';
      else if (lowerText.includes('study')) selectedType = 'study';
      else if (lowerText.includes('fee structure') || lowerText.includes('fee')) selectedType = 'fee_structure';
      else if (lowerText.includes('migration') || lowerText.includes('transfer')) selectedType = 'migration';
      else if (lowerText.includes('exam history') || lowerText.includes('marks card') || lowerText.includes('result')) selectedType = 'exam_history';

      if (!selectedType) {
        // Show options with AI context
        const kb = retrieveContext('certificate types', 1);
        let msg = `Which certificate do you need?

`;
        msg += `1️⃣ Bonafide Certificate — ₹150
`;
        msg += `2️⃣ Study Certificate — ₹100
`;
        msg += `3️⃣ Fee Structure Certificate — ₹100
`;
        msg += `4️⃣ Migration Certificate — ₹200
`;
        msg += `5️⃣ Exam History Certificate — ₹150

`;
        if (kb.length > 0) msg += `📌 ${kb[0].content}`;

        await sendTextMessage(phoneNumber, msg);
        await updateSession(phoneNumber, 'selecting_certificate_type', studentData);
        return;
      }

      await processCertificateRequest(phoneNumber, selectedType, studentData);
      break;

    case 'selecting_certificate_type':
      const typeMap = {
        '1': 'bonafide', 'bonafide': 'bonafide',
        '2': 'study', 'study': 'study',
        '3': 'fee_structure', 'fee structure': 'fee_structure', 'fee': 'fee_structure',
        '4': 'migration', 'migration': 'migration',
        '5': 'exam_history', 'exam history': 'exam_history', 'marks card': 'exam_history', 'result': 'exam_history'
      };

      const selected = typeMap[lowerText.trim()] || typeMap[intentResult.intent];

      if (!selected || !CERTIFICATE_TYPES[selected]) {
        await sendTextMessage(phoneNumber, 
          "Please select a valid option: 1 (Bonafide), 2 (Study), 3 (Fee Structure), 4 (Migration), or 5 (Exam History)");
        return;
      }

      await processCertificateRequest(phoneNumber, selected, studentData);
      break;

    case 'awaiting_payment':
      const certType = session.data.pendingCertificate;
      const cert = CERTIFICATE_TYPES[certType];

      if (lowerText.trim() === 'cancel') {
        await updateSession(phoneNumber, 'registered', studentData);
        await sendTextMessage(phoneNumber, 'Certificate request cancelled. Type "menu" to choose another service.');
        return;
      }

      const payment = await createPaymentLink(
        cert.fee,
        `${cert.name} for ${studentData.name} (${studentData.usn})`,
        studentData.studentId
      );

      if (payment.success) {
        const reqResult = await pool.query(
          `INSERT INTO certificate_requests (student_id, type, amount, payment_link_id, status)
           VALUES ($1, $2, $3, $4, 'awaiting_payment') RETURNING id`,
          [studentData.studentId, certType, cert.fee, payment.linkId]
        );

        await updateSession(phoneNumber, 'payment_pending', {
          ...studentData,
          certificateRequestId: reqResult.rows[0].id,
          paymentLink: payment.link
        });

        await sendTextMessage(phoneNumber,
          `${cert.name} — fee is ₹${cert.fee}.

` +
          `💳 Pay here to submit your request:
${payment.link}

` +
          `This link expires in 15 minutes. You'll get a confirmation once payment is received.`);
      } else {
        await sendTextMessage(phoneNumber, 
          "Sorry, I couldn't generate the payment link. Please try again later.");
      }
      break;

    case 'payment_pending':
      if (lowerText.trim() === 'cancel') {
        await updateSession(phoneNumber, 'registered', studentData);
        await sendTextMessage(phoneNumber, 'Certificate request cancelled. Type "menu" to choose another service.');
      } else if (studentData.paymentLink) {
        await sendTextMessage(phoneNumber, `Your payment link is:\n${studentData.paymentLink}`);
      }
      break;

    default:
      await sendTextMessage(phoneNumber, 
        "Your certificate request is being processed. I'll notify you when it's ready.");
  }
}

async function processCertificateRequest(phoneNumber, certType, studentData) {
  const cert = CERTIFICATE_TYPES[certType];

  // Check for existing pending request
  const existing = await pool.query(
    `SELECT * FROM certificate_requests 
     WHERE student_id = $1 AND type = $2 AND status IN ('awaiting_payment', 'processing')
     ORDER BY created_at DESC LIMIT 1`,
    [studentData.studentId, certType]
  );

  if (existing.rows.length > 0) {
    const req = existing.rows[0];
    const statusMsg = req.status === 'awaiting_payment' 
      ? `You already have a pending ${cert.name} request awaiting payment.`
      : `Your ${cert.name} request is already being processed.`;
    await sendTextMessage(phoneNumber, statusMsg);
    return;
  }

  await updateSession(phoneNumber, 'awaiting_payment', {
    ...studentData,
    pendingCertificate: certType
  });

  await sendTextMessage(phoneNumber,
    `You selected: *${cert.name}*
Fee: ₹${cert.fee}

` +
    `Reply "pay" to generate the payment link, or "cancel" to abort.`);
}

module.exports = { handleCertificate };
