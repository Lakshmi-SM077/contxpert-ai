const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { sendTextMessage } = require('../services/whatsappService');

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

// Middleware: check admin auth
function requireAuth(req, res, next) {
  if (req.session && req.session.isAdmin) {
    return next();
  }
  res.redirect('/admin/login');
}

// Login page
router.get('/login', (req, res) => {
  if (req.session.isAdmin) return res.redirect('/admin');
  res.render('admin/login', { error: null });
});

router.post('/login', (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    req.session.isAdmin = true;
    return res.redirect('/admin');
  }
  res.render('admin/login', { error: 'Invalid password' });
});

router.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/admin/login');
});

// Main admin dashboard
router.get('/', requireAuth, async (req, res) => {
  try {
    const awaiting = await pool.query(
      `SELECT cr.*, s.name, s.usn, s.department, s.section
       FROM certificate_requests cr
       JOIN students s ON cr.student_id = s.id
       WHERE cr.status = 'awaiting_payment'
       ORDER BY cr.created_at DESC`
    );

    const processing = await pool.query(
      `SELECT cr.*, s.name, s.usn, s.department, s.section
       FROM certificate_requests cr
       JOIN students s ON cr.student_id = s.id
       WHERE cr.status = 'processing'
       ORDER BY cr.created_at DESC`
    );

    const ready = await pool.query(
      `SELECT cr.*, s.name, s.usn, s.department, s.section
       FROM certificate_requests cr
       JOIN students s ON cr.student_id = s.id
       WHERE cr.status = 'ready'
       ORDER BY cr.ready_at DESC LIMIT 50`
    );

    res.render('admin/dashboard', {
      awaiting: awaiting.rows,
      processing: processing.rows,
      ready: ready.rows,
      counts: {
        awaiting: awaiting.rows.length,
        processing: processing.rows.length,
        ready: ready.rows.length
      }
    });
  } catch (error) {
    console.error('[Admin] Dashboard error:', error);
    res.status(500).render('admin/error', { message: 'Database error' });
  }
});

// Mark certificate ready
router.post('/api/certificates/:id/ready', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const certReq = await pool.query(
      `UPDATE certificate_requests 
       SET status = 'ready', ready_at = NOW()
       WHERE id = $1 AND status = 'processing'
       RETURNING *`,
      [id]
    );

    if (certReq.rows.length === 0) {
      return res.status(404).json({ error: 'Request not found or not in processing state' });
    }

    const request = certReq.rows[0];

    // Notify student via WhatsApp
    const student = await pool.query(
      'SELECT phone_number, name FROM students WHERE id = $1',
      [request.student_id]
    );

    if (student.rows.length > 0) {
      const { phone_number, name } = student.rows[0];
      const typeNames = {
        'bonafide': 'Bonafide Certificate',
        'fee_structure': 'Fee Structure Certificate',
        'migration': 'Migration Certificate'
      };

      await sendTextMessage(phone_number,
        `🎓 Your ${typeNames[request.type] || request.type} is ready for collection!\n\n` +
        `At the CSE department office (10 AM–4 PM, Mon–Sat).\n` +
        `Bring your college ID card.\n\n` +
        `— ContXpert AI`);
    }

    res.json({ success: true, message: 'Marked as ready and student notified' });

  } catch (error) {
    console.error('[Admin] Mark ready error:', error);
    res.status(500).json({ error: 'Internal error' });
  }
});

// Filter API
router.get('/api/certificates', requireAuth, async (req, res) => {
  try {
    const { status } = req.query;
    const validStatuses = ['awaiting_payment', 'processing', 'ready'];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const result = await pool.query(
      `SELECT cr.*, s.name, s.usn, s.department, s.section
       FROM certificate_requests cr
       JOIN students s ON cr.student_id = s.id
       WHERE cr.status = $1
       ORDER BY cr.created_at DESC`,
      [status]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('[Admin] Filter error:', error);
    res.status(500).json({ error: 'Internal error' });
  }
});

module.exports = router;
