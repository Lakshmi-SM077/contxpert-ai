const pool = require('../config/database');
const { sendTextMessage } = require('../services/whatsappService');
const { updateSession } = require('../services/sessionManager');

async function handleTimetable(phoneNumber, text, session) {
  const studentData = session.data;
  const today = new Date().getDay(); // 0=Sun, 1=Mon...
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  try {
    const timetable = await pool.query(
      `SELECT period, subject_name, room, time_slot
       FROM timetable 
       WHERE department = $1 AND section = $2 AND semester = $3 AND day = $4
       ORDER BY period`,
      [studentData.dept, studentData.section, studentData.semester, dayNames[today]]
    );

    if (timetable.rows.length === 0) {
      await sendTextMessage(phoneNumber, 
        `No classes scheduled for ${dayNames[today]}. Enjoy your day off! 🎉`);
      return;
    }

    let response = `🗓 *Today's Schedule (${dayNames[today]})*\n\n`;
    timetable.rows.forEach(row => {
      response += `${row.period}. ${row.time_slot}\n`;
      response += `   ${row.subject_name} — Room ${row.room}\n\n`;
    });

    await sendTextMessage(phoneNumber, response);
    await updateSession(phoneNumber, 'menu_shown', session.data);

  } catch (error) {
    console.error('[Timetable] Error:', error);
    await sendTextMessage(phoneNumber, "Couldn't fetch timetable. Try again later.");
  }
}

module.exports = { handleTimetable };
