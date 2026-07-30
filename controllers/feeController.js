const pool = require('../config/database');
const { sendTextMessage } = require('../services/whatsappService');
const { updateSession } = require('../services/sessionManager');
const { retrieveContext } = require('../services/aiEngine');

async function handleFee(phoneNumber, text, session) {
  const studentId = session.data.studentId;

  try {
    const fee = await pool.query(
      `SELECT total_amount, paid_amount, due_amount, last_payment_date, status
       FROM fee_status WHERE student_id = $1`,
      [studentId]
    );

    if (fee.rows.length === 0) {
      await sendTextMessage(phoneNumber, "No fee records found.");
      return;
    }

    const f = fee.rows[0];
    const kb = retrieveContext('fee payment deadline', 1);

    let response = `💳 *Fee Status*\n\n`;
    response += `Total: ₹${f.total_amount}\n`;
    response += `Paid: ₹${f.paid_amount}\n`;
    response += `Due: *₹${f.due_amount}*\n`;
    response += `Status: ${f.status === 'paid' ? '✅ Fully Paid' : f.status === 'partial' ? '⚠️ Partial' : '❌ Unpaid'}\n`;
    response += `Last Payment: ${f.last_payment_date ? new Date(f.last_payment_date).toLocaleDateString('en-IN') : 'N/A'}\n`;

    if (f.due_amount > 0 && kb.length > 0) {
      response += `\n📌 ${kb[0].content}`;
    }

    await sendTextMessage(phoneNumber, response);
    await updateSession(phoneNumber, 'menu_shown', session.data);

  } catch (error) {
    console.error('[Fee] Error:', error);
    await sendTextMessage(phoneNumber, "Couldn't fetch fee status. Try again later.");
  }
}

module.exports = { handleFee };
