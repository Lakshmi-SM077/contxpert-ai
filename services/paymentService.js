const axios = require('axios');
const crypto = require('crypto');

const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID;
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;

async function createPaymentLink(amount, description, studentId) {
  if (!RAZORPAY_KEY_ID || RAZORPAY_KEY_ID === 'your_razorpay_key_id') {
    // Mock payment link for development
    const mockId = 'mock_' + Math.random().toString(36).substring(2, 10);
    return {
      success: true,
      mock: true,
      link: `https://razorpay.me/contxpert/pay/${mockId}`,
      linkId: mockId,
      amount
    };
  }

  try {
    const response = await axios.post(
      'https://api.razorpay.com/v1/payment_links',
      {
        amount: amount * 100, // paise
        currency: 'INR',
        description,
        callback_url: `${process.env.PUBLIC_BASE_URL}/payment/callback`,
        notify: { sms: true, email: true }
      },
      {
        auth: { username: RAZORPAY_KEY_ID, password: RAZORPAY_KEY_SECRET }
      }
    );

    return {
      success: true,
      link: response.data.short_url,
      linkId: response.data.id,
      amount
    };
  } catch (error) {
    console.error('[Payment] Error:', error.response?.data || error.message);
    return { success: false, error: error.message };
  }
}

function verifyWebhookSignature(body, signature, secret) {
  if (!secret || secret === 'your_razorpay_webhook_secret') return true;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(body, 'utf8')
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature, 'hex'),
    Buffer.from(expected, 'hex')
  );
}

module.exports = {
  createPaymentLink,
  verifyWebhookSignature
};
