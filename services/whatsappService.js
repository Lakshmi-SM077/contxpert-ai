const axios = require('axios');

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_WHATSAPP_NUMBER = process.env.TWILIO_WHATSAPP_NUMBER;
const BASE_URL = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}`;

async function sendTextMessage(to, text) {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_WHATSAPP_NUMBER) {
    console.log('[WhatsApp] Mock send to', to, ':', text.substring(0, 50) + '...');
    return { success: true, mock: true };
  }

  try {
    const response = await axios.post(
      `${BASE_URL}/Messages.json`,
      new URLSearchParams({
        From: TWILIO_WHATSAPP_NUMBER,
        To: to.startsWith('whatsapp:') ? to : `whatsapp:${to}`,
        Body: text
      }),
      {
        auth: {
          username: TWILIO_ACCOUNT_SID,
          password: TWILIO_AUTH_TOKEN
        },
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );
    return { success: true, messageId: response.data.sid };
  } catch (error) {
    console.error('[WhatsApp] Send error:', error.response?.data || error.message);
    return { success: false, error: error.message };
  }
}

async function sendInteractiveButtons(to, text, buttons) {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_WHATSAPP_NUMBER) {
    console.log('[WhatsApp] Mock buttons to', to);
    return { success: true, mock: true };
  }

  // Twilio doesn't support interactive buttons in the same way, send as text with options
  const buttonText = buttons.map((b, i) => `${i + 1}. ${b.title}`).join('\n');
  const fullText = `${text}\n\n${buttonText}\n\nReply with the number to select an option.`;

  return await sendTextMessage(to, fullText);
}

async function sendListMessage(to, text, sections) {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_WHATSAPP_NUMBER) {
    console.log('[WhatsApp] Mock list to', to);
    return { success: true, mock: true };
  }

  // Twilio doesn't support interactive lists in the same way, send as text with options
  let listText = text;
  sections.forEach((section, sIdx) => {
    listText += `\n\n${section.title}`;
    section.rows.forEach((row, rIdx) => {
      listText += `\n${sIdx + 1}.${rIdx + 1}. ${row.title}`;
      if (row.description) {
        listText += ` - ${row.description}`;
      }
    });
  });
  listText += '\n\nReply with the number to select an option.';

  return await sendTextMessage(to, listText);
}

module.exports = {
  sendTextMessage,
  sendInteractiveButtons,
  sendListMessage
};
