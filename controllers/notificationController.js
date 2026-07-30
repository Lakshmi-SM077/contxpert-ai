const pool = require('../config/database');
const { sendTextMessage } = require('../services/whatsappService');
const { updateSession } = require('../services/sessionManager');

async function handleNotifications(phoneNumber, text, session) {
  const studentId = session.data.studentId;

  try {
    const notifications = await pool.query(
      `SELECT title, message, type, created_at
       FROM notifications 
       WHERE (target_student_id = $1 OR target_student_id IS NULL)
       AND created_at > NOW() - INTERVAL '30 days'
       ORDER BY created_at DESC LIMIT 10`,
      [studentId]
    );

    if (notifications.rows.length === 0) {
      await sendTextMessage(phoneNumber, 
        "📭 No new notifications in the last 30 days. You're all caught up!");
      return;
    }

    let response = `🔔 *Notifications* (${notifications.rows.length} recent)\n\n`;

    notifications.rows.forEach((n, i) => {
      const icon = n.type === 'urgent' ? '🔴' : n.type === 'academic' ? '📚' : '📢';
      const date = new Date(n.created_at).toLocaleDateString('en-IN');
      response += `${icon} *${n.title}* (${date})\n${n.message}\n\n`;
    });

    await sendTextMessage(phoneNumber, response);
    await updateSession(phoneNumber, 'menu_shown', session.data);

  } catch (error) {
    console.error('[Notifications] Error:', error);
    await sendTextMessage(phoneNumber, "Couldn't fetch notifications. Try again later.");
  }
}

module.exports = { handleNotifications };
