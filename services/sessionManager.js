const pool = require('../config/database');
const { normalizePhone, studentSessionData } = require('./identityService');

async function getSession(phoneNumber) {
  const result = await pool.query(
    'SELECT * FROM sessions WHERE phone_number = $1',
    [phoneNumber]
  );
  return result.rows[0] || null;
}

async function createSession(phoneNumber, state = 'unregistered', data = {}) {
  await pool.query(
    `INSERT INTO sessions (phone_number, state, data, last_activity)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (phone_number) DO UPDATE
     SET state = $2, data = $3, last_activity = NOW()`,
    [phoneNumber, state, JSON.stringify(data)]
  );
}

async function updateSession(phoneNumber, state, data = {}) {
  const existing = await getSession(phoneNumber);
  const mergedData = { ...existing?.data, ...data };

  await pool.query(
    `UPDATE sessions SET state = $1, data = $2, last_activity = NOW()
     WHERE phone_number = $3`,
    [state, JSON.stringify(mergedData), phoneNumber]
  );
}

async function addToHistory(phoneNumber, role, content, intent = null) {
  const session = await getSession(phoneNumber);
  const history = session?.data?.history || [];
  history.push({ role, content, intent, timestamp: new Date().toISOString() });

  // Keep last 20 messages
  if (history.length > 20) history.shift();

  await pool.query(
    `UPDATE sessions SET data = jsonb_set(data::jsonb, '{history}', $1::jsonb)
     WHERE phone_number = $2`,
    [JSON.stringify(history), phoneNumber]
  );
}

async function getHistory(phoneNumber) {
  const session = await getSession(phoneNumber);
  return session?.data?.history || [];
}

async function clearSession(phoneNumber) {
  await pool.query(
    'DELETE FROM sessions WHERE phone_number = $1',
    [phoneNumber]
  );
}

async function restoreVerifiedSession(phoneNumber) {
  const normalizedPhone = normalizePhone(phoneNumber);
  const result = await pool.query(
    `SELECT id, usn, name, department, section, semester
     FROM students WHERE phone_number = $1`,
    [normalizedPhone]
  );
  if (!result.rows[0]) return null;

  const data = studentSessionData(result.rows[0]);
  await createSession(normalizedPhone, 'registered', data);
  return getSession(normalizedPhone);
}

module.exports = {
  getSession,
  createSession,
  updateSession,
  addToHistory,
  getHistory,
  clearSession,
  restoreVerifiedSession
};
