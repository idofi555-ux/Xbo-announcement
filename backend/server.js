require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const cron = require('node-cron');

// Initialize database
const { pool, initDatabase } = require('./models/database');

// Initialize Telegram bot
const { initBot } = require('./utils/telegram');

// Import routes
const authRoutes = require('./routes/auth');
const channelRoutes = require('./routes/channels');
const announcementRoutes = require('./routes/announcements');
const analyticsRoutes = require('./routes/analytics');
const trackerRoutes = require('./routes/tracker');

const app = express();
const PORT = process.env.PORT || 3001;

// Security middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: { error: 'Too many requests, please try again later' }
});
app.use('/api/', limiter);

// CORS
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
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

// Link tracker (short URLs)
app.use('/t', trackerRoutes);

// Health check
let bot = null;
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    bot: bot ? 'connected' : 'not configured',
    timestamp: new Date().toISOString()
  });
});

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../frontend/dist')));

  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api') && !req.path.startsWith('/t/')) {
      res.sendFile(path.join(__dirname, '../frontend/dist/index.html'));
    }
  });
}

// Scheduled announcements cron job (runs every minute)
cron.schedule('* * * * *', async () => {
  try {
    const result = await pool.query(`
      SELECT a.*
      FROM announcements a
      WHERE a.status = 'scheduled'
        AND a.scheduled_at <= NOW()
    `);

    for (const announcement of result.rows) {
      console.log(`Sending scheduled announcement: ${announcement.title}`);

      // Update status
      await pool.query(
        `UPDATE announcements SET status = 'sent', sent_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [announcement.id]
      );
    }
  } catch (error) {
    console.error('Cron job error:', error);
  }
});

// Error handling
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
const startServer = async () => {
  try {
    // Initialize database
    await initDatabase();

    // Initialize Telegram bot
    bot = initBot();

    app.listen(PORT, () => {
      console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   🚀 XBO Announcements Server                             ║
║                                                           ║
║   Server:    http://localhost:${PORT}                      ║
║   API:       http://localhost:${PORT}/api                  ║
║   Tracker:   http://localhost:${PORT}/t/{code}             ║
║                                                           ║
║   Bot Status: ${bot ? '✅ Connected' : '⚠️  Not configured'}                        ║
║                                                           ║
║   Default Login:                                          ║
║   Email:    admin@xbo.com                                 ║
║   Password: admin123                                      ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
      `);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

module.exports = app;
