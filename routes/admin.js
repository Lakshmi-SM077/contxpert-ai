const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { sendTextMessage } = require('../services/whatsappService');
const { normalizePhone, normalizeUsn } = require('../services/identityService');

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

function whatsappMenuLink() {
  const number = normalizePhone(process.env.TWILIO_WHATSAPP_NUMBER || '');
  return number ? `https://wa.me/${number}?text=${encodeURIComponent('menu')}` : null;
}

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
      },
      botMenuLink: whatsappMenuLink()
    });
  } catch (error) {
    console.error('[Admin] Dashboard error:', error);
    res.status(500).render('admin/error', { message: 'Database error' });
  }
});

// Student identities are intentionally managed only from this authenticated area.
router.get('/students', requireAuth, async (req, res) => {
  try {
    const students = await pool.query(
      `SELECT id, usn, name, dob, department, section, semester, phone_number
       FROM students ORDER BY usn`
    );
    res.render('admin/students', { students: students.rows, saved: req.query.saved === '1', error: null, botMenuLink: whatsappMenuLink() });
  } catch (error) {
    console.error('[Admin] Students error:', error);
    res.status(500).render('admin/error', { message: 'Could not load students' });
  }
});

router.post('/students/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const usn = normalizeUsn(req.body.usn);
    const phone = normalizePhone(req.body.phone_number);
    const { name, department, section } = req.body;
    const semester = Number(req.body.semester);

    if (!/^\d[A-Z]{2}\d{2}[A-Z]{2}\d{3}$/.test(usn) || !name?.trim() || !department?.trim() || !section?.trim() || !Number.isInteger(semester) || semester < 1 || semester > 12) {
      return res.status(400).send('Invalid student details. Return to the students page and correct the form.');
    }
    if (phone && (phone.length < 10 || phone.length > 15)) {
      return res.status(400).send('Enter a valid mobile number including country code, or leave it blank to clear it.');
    }

    await pool.query(
      `UPDATE students
       SET usn = $1, name = $2, department = $3, section = $4, semester = $5, phone_number = NULLIF($6, '')
       WHERE id = $7`,
      [usn, name.trim(), department.trim().toUpperCase(), section.trim().toUpperCase(), semester, phone, id]
    );
    res.redirect('/admin/students?saved=1');
  } catch (error) {
    console.error('[Admin] Student update error:', error);
    const message = error.code === '23505'
      ? 'That USN or mobile number is already assigned to another student.'
      : 'Could not save this student.';
    res.status(400).send(message);
  }
});

// Save a notification and send it to all verified WhatsApp users or one selected student.
router.post('/notifications', requireAuth, async (req, res) => {
  try {
    const title = String(req.body.title || '').trim();
    const message = String(req.body.message || '').trim();
    const type = ['general', 'academic', 'urgent'].includes(req.body.type) ? req.body.type : 'general';
    const targetStudentId = req.body.target_student_id ? Number(req.body.target_student_id) : null;
    if (!title || !message || (req.body.target_student_id && !Number.isInteger(targetStudentId))) {
      return res.status(400).json({ error: 'Title and message are required.' });
    }

    await pool.query(
      `INSERT INTO notifications (title, message, type, target_student_id) VALUES ($1, $2, $3, $4)`,
      [title, message, type, targetStudentId]
    );
    const recipients = await pool.query(
      `SELECT name, phone_number FROM students
       WHERE phone_number IS NOT NULL AND ($1::integer IS NULL OR id = $1)`,
      [targetStudentId]
    );
    const icon = type === 'urgent' ? '🔴' : type === 'academic' ? '📚' : '📢';
    let sent = 0;
    for (const student of recipients.rows) {
      const result = await sendTextMessage(student.phone_number, `${icon} *${title}*\n\nHi ${student.name},\n${message}\n\n— ContXpert AI`);
      if (result.success) sent += 1;
    }
    res.json({ success: true, sent, total: recipients.rows.length });
  } catch (error) {
    console.error('[Admin] Notification error:', error);
    res.status(500).json({ error: 'Could not send the notification.' });
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
