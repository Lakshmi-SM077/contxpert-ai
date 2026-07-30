const cron = require('node-cron');
const pool = require('../config/database');
const { sendTextMessage } = require('./whatsappService');

const THRESHOLD = parseInt(process.env.ATTENDANCE_ALERT_THRESHOLD || 75);

// Run every day at 9:00 AM
function startCronJobs() {
  console.log('[Cron] Starting scheduled jobs...');

  // Daily attendance check
  cron.schedule('0 9 * * *', async () => {
    console.log('[Cron] Running daily attendance check...');
    await checkAttendanceAlerts();
  }, {
    timezone: 'Asia/Kolkata'
  });

  console.log('[Cron] Jobs scheduled (daily at 9:00 AM IST)');
}

async function checkAttendanceAlerts() {
  try {
    // Find students below threshold
    const students = await pool.query(`
      SELECT 
        s.id, s.name, s.phone_number, s.usn,
        ROUND(SUM(a.attended_classes)::float / NULLIF(SUM(a.total_classes), 0) * 100, 1) as overall_pct,
        SUM(a.total_classes) as total,
        SUM(a.attended_classes) as attended
      FROM students s
      JOIN attendance a ON s.id = a.student_id
      WHERE s.phone_number IS NOT NULL
      GROUP BY s.id
      HAVING ROUND(SUM(a.attended_classes)::float / NULLIF(SUM(a.total_classes), 0) * 100, 1) < $1
    `, [THRESHOLD]);

    console.log(`[Cron] Found ${students.rows.length} students below ${THRESHOLD}%`);

    for (const student of students.rows) {
      const needed = Math.ceil((THRESHOLD * student.total / 100) - student.attended);

      await sendTextMessage(student.phone_number,
        `⚠️ *Attendance Alert*\n\n` +
        `Hi ${student.name}, your overall attendance is *${student.overall_pct}%*, ` +
        `which is below the ${THRESHOLD}% threshold.\n\n` +
        `You need to attend *${needed}* more classes to reach the minimum requirement.\n\n` +
        `Please attend regularly to avoid detention. 📚`);

      console.log(`[Cron] Alert sent to ${student.usn} (${student.overall_pct}%)`);
    }

  } catch (error) {
    console.error('[Cron] Error:', error);
  }
}

module.exports = { startCronJobs };
