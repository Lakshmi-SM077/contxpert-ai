const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const path = require('path');
require('dotenv').config();

const app = express();

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Session middleware for admin
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev_secret_change_me',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 8 * 60 * 60 * 1000 } // 8 hours
}));

// Global error handler - prevents server crashes
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Routes
// Provide a useful entry point when opening the server in a browser.
app.get('/', (req, res) => {
  res.redirect('/admin/login');
});

app.use('/webhook', require('./routes/webhook'));
app.use('/payment', require('./routes/payment'));
app.use('/admin', require('./routes/admin'));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', ai: true, timestamp: new Date().toISOString() });
});

// Start cron jobs
require('./services/cronService').startCronJobs();

const DEFAULT_PORT = 3000;
const MAX_FALLBACK_PORT = 3010;
const requestedPort = parseInt(process.env.PORT, 10) || DEFAULT_PORT;

function startServer(port) {
  const server = app.listen(port, () => {
    console.log(`\n🎓 ContXpert AI Server running on port ${port}`);
    console.log(`📱 Webhook: http://localhost:${port}/webhook`);
    console.log(`💻 Admin:   http://localhost:${port}/admin`);
    console.log(`🤖 AI Mode: LLM-powered intent detection + response generation\n`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      if (port < MAX_FALLBACK_PORT) {
        const nextPort = port + 1;
        console.warn(`Port ${port} is in use, trying port ${nextPort}...`);
        startServer(nextPort);
      } else {
        console.error(`All ports from ${DEFAULT_PORT} to ${MAX_FALLBACK_PORT} are in use. Please free a port or set PORT.`);
        process.exit(1);
      }
    } else {
      console.error('Server error:', err);
      process.exit(1);
    }
  });
}

startServer(requestedPort);
