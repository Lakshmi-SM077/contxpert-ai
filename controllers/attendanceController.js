const pool = require('../config/database');
const { sendTextMessage } = require('../services/whatsappService');
const { updateSession } = require('../services/sessionManager');
const { generateResponse, detectIntent, retrieveContext } = require('../services/aiEngine');

async function handleAttendance(phoneNumber, text, session) {
  const studentId = session.data.studentId;

  try {
    // Get attendance data
    const attendance = await pool.query(
      `SELECT subject_name, total_classes, attended_classes, 
              ROUND((attended_classes::float / NULLIF(total_classes, 0)) * 100, 1) as percentage
       FROM attendance WHERE student_id = $1 ORDER BY subject_name`,
      [studentId]
    );

    if (attendance.rows.length === 0) {
      await sendTextMessage(phoneNumber, 
        "No attendance records found. Please contact the office if this seems incorrect.");
      return;
    }

    // Calculate overall
    const totalClasses = attendance.rows.reduce((sum, r) => sum + parseInt(r.total_classes), 0);
    const totalAttended = attendance.rows.reduce((sum, r) => sum + parseInt(r.attended_classes), 0);
    const overallPercentage = ((totalAttended / totalClasses) * 100).toFixed(1);
    const threshold = parseInt(process.env.ATTENDANCE_ALERT_THRESHOLD || 75);
    const isBelowThreshold = parseFloat(overallPercentage) < threshold;

    // AI-enhanced response with contextual knowledge
    const kbContext = retrieveContext('attendance shortage rules', 1);

    let response = `📊 *Attendance Report*\n\n`;
    response += `Overall: ${totalAttended}/${totalClasses} = *${overallPercentage}%*\n`;
    response += isBelowThreshold ? `⚠️ Below ${threshold}% threshold!\n\n` : `✅ Above threshold\n\n`;

    response += `*Subject-wise:*\n`;
    attendance.rows.forEach(row => {
      const pct = row.percentage;
      const icon = parseFloat(pct) < threshold ? '⚠️' : '✅';
      response += `${icon} ${row.subject_name}: ${row.attended_classes}/${row.total_classes} (${pct}%)\n`;
    });

    if (isBelowThreshold) {
      const needed = Math.ceil((threshold * totalClasses / 100) - totalAttended);
      response += `\n⚠️ You need to attend *${needed}* more classes to reach ${threshold}%.`;
      if (kbContext.length > 0) {
        response += `\n\n📌 ${kbContext[0].content}`;
      }
    }

    await sendTextMessage(phoneNumber, response);
    await updateSession(phoneNumber, 'menu_shown', session.data);

  } catch (error) {
    console.error('[Attendance] Error:', error);
    await sendTextMessage(phoneNumber, 
      "Sorry, I couldn't fetch your attendance right now. Please try again later.");
  }
}

module.exports = { handleAttendance };
