const pool = require('../config/database');
const { sendTextMessage, sendInteractiveButtons } = require('../services/whatsappService');
const { updateSession, addToHistory } = require('../services/sessionManager');
const { detectIntent, generateResponse } = require('../services/aiEngine');
const { normalizePhone, normalizeUsn, studentSessionData } = require('../services/identityService');

async function handleRegistration(phoneNumber, text, session) {
  const state = session?.state || 'unregistered';

  // AI intent detection for registration flow
  const intentResult = detectIntent(text);

  switch (state) {
    case 'unregistered':
      if (intentResult.intent === 'greeting' || text.toLowerCase().includes('hi')) {
        const welcome = await generateResponse(text, intentResult);
        await sendTextMessage(phoneNumber, welcome.text);
        await sendTextMessage(phoneNumber, 
          "To get started, I need to verify your identity.\n\nPlease enter your USN (e.g., 4MC22CS070):");
        await updateSession(phoneNumber, 'awaiting_usn', { step: 'registration' });
        await addToHistory(phoneNumber, 'assistant', welcome.text, 'greeting');
      } else {
        await sendTextMessage(phoneNumber, 
          "Hi there! I'm ContXpert, your AI student support assistant. Type 'hi' to get started.");
      }
      break;

    case 'awaiting_usn':
      const usn = normalizeUsn(text);
      const usnPattern = /^\d[A-Z]{2}\d{2}[A-Z]{2}\d{3}$/;

      if (!usnPattern.test(usn)) {
        await sendTextMessage(phoneNumber, 
          "That doesn't look like a valid USN. Please enter in format: 4MC22CS070");
        return;
      }

      // Check if USN exists
      const student = await pool.query(
        'SELECT * FROM students WHERE UPPER(usn) = $1',
        [usn]
      );

      if (student.rows.length === 0) {
        await sendTextMessage(phoneNumber, 
          "I couldn't find that USN in our records. Please double-check and try again, or contact the office.");
        return;
      }

      const matchedStudent = student.rows[0];
      const normalizedPhone = normalizePhone(phoneNumber);
      if (matchedStudent.phone_number && normalizePhone(matchedStudent.phone_number) !== normalizedPhone) {
        await sendTextMessage(phoneNumber,
          'This USN is already linked to another mobile number. Only an administrator can change the registered number.');
        return;
      }

      const mobileOwner = await pool.query(
        'SELECT usn FROM students WHERE phone_number = $1 AND id <> $2',
        [normalizedPhone, matchedStudent.id]
      );
      if (mobileOwner.rows.length > 0) {
        await sendTextMessage(phoneNumber,
          'This mobile number is already registered to another USN. Please use your registered number or contact the administrator.');
        return;
      }

      await updateSession(phoneNumber, 'awaiting_dob', {
        usn, 
        studentId: matchedStudent.id,
        step: 'registration' 
      });
      await sendTextMessage(phoneNumber, 
        `Found ${matchedStudent.name} (${usn}).\n\nNow enter your Date of Birth (DD-MM-YYYY) to confirm:`);
      break;

    case 'awaiting_dob':
      const dob = text.trim();
      const dobPattern = /^(\d{2})-(\d{2})-(\d{4})$/;
      const match = dob.match(dobPattern);

      if (!match) {
        await sendTextMessage(phoneNumber, 
          "Please enter DOB in DD-MM-YYYY format (e.g., 14-03-2004)");
        return;
      }

      const [, day, month, year] = match;
      const formattedDob = `${year}-${month}-${day}`;
      const usnFromSession = session.data.usn;

      const verify = await pool.query(
        'SELECT * FROM students WHERE usn = $1 AND dob = $2',
        [usnFromSession, formattedDob]
      );

      if (verify.rows.length === 0) {
        await sendTextMessage(phoneNumber, 
          "Date of birth doesn't match our records. Please try again.");
        return;
      }

      const studentData = verify.rows[0];

      // Atomically link the WhatsApp number. This protects both the USN and
      // mobile identity from being claimed by another student.
      const linked = await pool.query(
        `UPDATE students SET phone_number = $1
         WHERE id = $2 AND (phone_number IS NULL OR phone_number = $1)
         RETURNING *`,
        [normalizePhone(phoneNumber), studentData.id]
      );
      if (linked.rowCount === 0) {
        await sendTextMessage(phoneNumber,
          'This USN is already linked to another mobile number. Please contact the administrator.');
        return;
      }

      await updateSession(phoneNumber, 'registered', studentSessionData(studentData));

      await sendTextMessage(phoneNumber,
        `✅ Verified! Welcome, ${studentData.name} (${studentData.usn})\n` +
        `${studentData.department} · ${studentData.semester}th Sem · Section ${studentData.section}\n\n` +
        `You can now ask me anything naturally — attendance, marks, fees, timetable, certificates, or just say "menu" to see options.`);

      await addToHistory(phoneNumber, 'assistant', 'Registration complete', 'registration');
      break;

    default:
      await sendTextMessage(phoneNumber, 
        "You're already registered! Ask me anything or type 'menu' for options.");
  }
}

module.exports = { handleRegistration };
