// Load environment variables FIRST
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const cron = require('node-cron');

// Log startup info
console.log('=== XBO Telegram Manager Server Starting ===');
console.log('Time:', new Date().toISOString());
console.log('Node version:', process.version);
console.log('Environment:', process.env.NODE_ENV || 'development');
console.log('Port:', process.env.PORT || 3001);

// Initialize database
const { pool, initDatabase, USE_POSTGRES } = require('./models/database');

// Initialize Telegram bot
const { initBot, processUpdate, stopBot, getBotStatus } = require('./utils/telegram');

// Import routes
const authRoutes = require('./routes/auth');
const channelRoutes = require('./routes/channels');
const announcementRoutes = require('./routes/announcements');
const analyticsRoutes = require('./routes/analytics');
const trackerRoutes = require('./routes/tracker');
const supportRoutes = require('./routes/support');

const app = express();
const PORT = process.env.PORT || 3001;

// Security middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Too many requests, please try again later' }
});
app.use('/api/', limiter);

// CORS - allow multiple origins
const allowedOrigins = [
  process.env.FRONTEND_URL,
  'http://localhost:5173',
  'http://localhost:3000',
  'https://xbo-announcement.up.railway.app'
].filter(Boolean);

app.use(cors({
  origin: function(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(null, true); // Allow all origins in production for now
    }
  },
  credentials: true
}));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Trust proxy for accurate IP addresses
app.set('trust proxy', 1);

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/channels', channelRoutes);
app.use('/api/announcements', announcementRoutes);
app.use('/api', analyticsRoutes);
app.use('/api/support', supportRoutes);

// Link tracker (short URLs)
app.use('/t', trackerRoutes);

// Telegram webhook endpoint (for production)
app.post('/webhook/:token', (req, res) => {
  try {
    console.log('Received webhook update');
    processUpdate(req.body);
    res.sendStatus(200);
  } catch (error) {
    console.error('Webhook error:', error);
    res.sendStatus(500);
  }
});

// Health check
let bot = null;
let dbConnected = false;

app.get('/api/health', async (req, res) => {
  let dbStatus = 'unknown';

  try {
    if (USE_POSTGRES) {
      await pool.query('SELECT 1');
      dbStatus = 'postgresql: connected';
      dbConnected = true;
    } else {
      // SQLite check
      await pool.query('SELECT 1');
      dbStatus = 'sqlite: connected';
      dbConnected = true;
    }
  } catch (err) {
    dbStatus = 'error: ' + err.message;
    dbConnected = false;
  }

  const botStatus = getBotStatus();

  res.json({
    status: dbConnected ? 'ok' : 'degraded',
    database: dbStatus,
    databaseType: USE_POSTGRES ? 'postgresql' : 'sqlite',
    bot: botStatus.hasBot ? 'connected' : 'not configured',
    botDetails: botStatus,
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString()
  });
});

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  const staticPath = path.join(__dirname, '../frontend/dist');
  console.log('Serving static files from:', staticPath);
  app.use(express.static(staticPath));

  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api') && !req.path.startsWith('/t/') && !req.path.startsWith('/bot')) {
      res.sendFile(path.join(staticPath, 'index.html'));
    }
  });
}

// Scheduled announcements cron job (runs every minute)
cron.schedule('* * * * *', async () => {
  if (!dbConnected) return;

  try {
    // Use database-specific date function
    const dateFunc = USE_POSTGRES ? 'NOW()' : "datetime('now')";
    const result = await pool.query(`
      SELECT a.*
      FROM announcements a
      WHERE a.status = 'scheduled'
        AND a.scheduled_at <= ${dateFunc}
    `);

    for (const announcement of result.rows) {
      console.log(`Processing scheduled announcement: ${announcement.title}`);

      await pool.query(
        `UPDATE announcements SET status = 'sent', sent_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [announcement.id]
      );
    }
  } catch (error) {
    console.error('Cron job error:', error.message);
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('=== Server Error ===');
  console.error('Path:', req.path);
  console.error('Method:', req.method);
  console.error('Error:', err.message);
  console.error('Stack:', err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  stopBot();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully...');
  stopBot();
  process.exit(0);
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('=== Uncaught Exception ===');
  console.error(err);
  // Don't exit - try to keep running
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('=== Unhandled Rejection ===');
  console.error('Reason:', reason);
  // Don't exit - try to keep running
});

// Start server
const startServer = async () => {
  console.log('\n=== Initializing Services ===');

  // Initialize database
  try {
    await initDatabase();
    dbConnected = true;
    console.log('Database: Ready');
  } catch (error) {
    console.error('Database initialization failed:', error.message);
    console.error('Server will start but database features will not work.');
    dbConnected = false;
  }

  // Initialize Telegram bot
  try {
    bot = initBot();
    console.log('Telegram bot:', bot ? 'Ready' : 'Not configured');
  } catch (error) {
    console.error('Telegram bot initialization failed:', error.message);
  }

  // Start HTTP server
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   🚀 XBO Telegram Manager Server                          ║
║                                                           ║
║   URL:        http://0.0.0.0:${PORT}                        ║
║   Health:     http://0.0.0.0:${PORT}/api/health             ║
║                                                           ║
║   Database:   ${dbConnected ? '✅ Connected (' + (USE_POSTGRES ? 'PostgreSQL' : 'SQLite') + ')' : '❌ Not connected'}${dbConnected ? '' : '          '}
║   Bot:        ${bot ? '✅ Connected' : '⚠️  Not configured'}                        ║
║                                                           ║
║   Default Login:                                          ║
║   Email:      admin@xbo.com                               ║
║   Password:   admin123                                    ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
    `);
  });
};

startServer();

module.exports = app;
