const pool = require('../config/database');
const { sendTextMessage, sendInteractiveButtons } = require('../services/whatsappService');
const { updateSession, addToHistory } = require('../services/sessionManager');
const { detectIntent, generateResponse } = require('../services/aiEngine');

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
      const usn = text.trim().toUpperCase();
      const usnPattern = /^\d[A-Z]{2}\d{2}[A-Z]{2}\d{3}$/;

      if (!usnPattern.test(usn)) {
        await sendTextMessage(phoneNumber, 
          "That doesn't look like a valid USN. Please enter in format: 4MC22CS070");
        return;
      }

      // Check if USN exists
      const student = await pool.query(
        'SELECT * FROM students WHERE usn = $1',
        [usn]
      );

      if (student.rows.length === 0) {
        await sendTextMessage(phoneNumber, 
          "I couldn't find that USN in our records. Please double-check and try again, or contact the office.");
        return;
      }

      await updateSession(phoneNumber, 'awaiting_dob', { 
        usn, 
        studentId: student.rows[0].id,
        step: 'registration' 
      });
      await sendTextMessage(phoneNumber, 
        `Found ${student.rows[0].name} (${usn}).\n\nNow enter your Date of Birth (DD-MM-YYYY) to confirm:`);
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

      // Link phone number to student
      await pool.query(
        'UPDATE students SET phone_number = $1 WHERE id = $2',
        [phoneNumber, studentData.id]
      );

      await updateSession(phoneNumber, 'registered', {
        studentId: studentData.id,
        usn: studentData.usn,
        name: studentData.name,
        dept: studentData.department,
        section: studentData.section,
        semester: studentData.semester
      });

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
