const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { sendTextMessage } = require('../services/whatsappService');
const { verifyWebhookSignature } = require('../services/paymentService');

// Razorpay webhook for payment confirmation
router.post('/webhook', async (req, res) => {
  const signature = req.headers['x-razorpay-signature'];
  const body = JSON.stringify(req.body);
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;

  if (!verifyWebhookSignature(body, signature, secret)) {
    console.error('[Payment] Invalid webhook signature');
    return res.status(400).json({ error: 'Invalid signature' });
  }

  try {
    const event = req.body.event;
    const payload = req.body.payload;

    if (event === 'payment_link.paid') {
      const paymentLinkId = payload.payment_link.entity.id;

      // Find certificate request
      const certReq = await pool.query(
        'SELECT * FROM certificate_requests WHERE payment_link_id = $1',
        [paymentLinkId]
      );

      if (certReq.rows.length === 0) {
        console.error('[Payment] Certificate request not found for link:', paymentLinkId);
        return res.status(404).json({ error: 'Request not found' });
      }

      const request = certReq.rows[0];

      // Update to processing
      await pool.query(
        `UPDATE certificate_requests 
         SET status = 'processing', paid_at = NOW(), payment_id = $1
         WHERE id = $2`,
        [payload.payment.entity.id, request.id]
      );

      // Notify student
      const student = await pool.query(
        'SELECT phone_number, name FROM students WHERE id = $1',
        [request.student_id]
      );

      if (student.rows.length > 0) {
        const { phone_number, name } = student.rows[0];
        await sendTextMessage(phone_number,
          `✅ Payment received — ₹${request.amount}\n` +
          `Your ${request.type} certificate request is now with the office.\n\n` +
          `You'll get a message here the moment it's ready for collection. 🎓`);
      }

      console.log('[Payment] Certificate request', request.id, 'moved to processing');
    }

    res.status(200).json({ status: 'ok' });

  } catch (error) {
    console.error('[Payment] Webhook error:', error);
    res.status(500).json({ error: 'Internal error' });
  }
});

// Callback route (fallback)
router.get('/callback', (req, res) => {
  res.send('Payment processed. Check WhatsApp for confirmation.');
});

module.exports = router;
