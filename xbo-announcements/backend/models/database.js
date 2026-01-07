const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');

const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '..', 'data', 'xbo.db');

// Ensure data directory exists
const fs = require('fs');
const dataDir = path.dirname(dbPath);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(dbPath);

// Enable foreign keys
db.pragma('foreign_keys = ON');

// Initialize tables
db.exec(`
  -- Users table
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT DEFAULT 'user' CHECK(role IN ('admin', 'user')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_login DATETIME
  );

  -- Telegram channels/groups
  CREATE TABLE IF NOT EXISTS channels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_id TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    type TEXT CHECK(type IN ('channel', 'group', 'supergroup')),
    member_count INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    added_by INTEGER REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Campaigns (group of announcements)
  CREATE TABLE IF NOT EXISTS campaigns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    created_by INTEGER REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Announcements
  CREATE TABLE IF NOT EXISTS announcements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id INTEGER REFERENCES campaigns(id),
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    image_url TEXT,
    buttons TEXT, -- JSON array of buttons [{text, url}]
    status TEXT DEFAULT 'draft' CHECK(status IN ('draft', 'scheduled', 'sent', 'failed')),
    scheduled_at DATETIME,
    sent_at DATETIME,
    created_by INTEGER REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Announcement targets (which channels to send to)
  CREATE TABLE IF NOT EXISTS announcement_targets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    announcement_id INTEGER REFERENCES announcements(id) ON DELETE CASCADE,
    channel_id INTEGER REFERENCES channels(id),
    telegram_message_id TEXT,
    views INTEGER DEFAULT 0,
    sent_at DATETIME,
    error TEXT
  );

  -- Tracked links
  CREATE TABLE IF NOT EXISTS tracked_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    short_code TEXT UNIQUE NOT NULL,
    original_url TEXT NOT NULL,
    announcement_id INTEGER REFERENCES announcements(id) ON DELETE CASCADE,
    utm_source TEXT,
    utm_medium TEXT,
    utm_campaign TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Link clicks
  CREATE TABLE IF NOT EXISTS link_clicks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    link_id INTEGER REFERENCES tracked_links(id),
    ip_address TEXT,
    user_agent TEXT,
    referer TEXT,
    country TEXT,
    city TEXT,
    clicked_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Activity log
  CREATE TABLE IF NOT EXISTS activity_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id),
    action TEXT NOT NULL,
    details TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Create indexes for better performance
  CREATE INDEX IF NOT EXISTS idx_announcements_status ON announcements(status);
  CREATE INDEX IF NOT EXISTS idx_announcements_scheduled ON announcements(scheduled_at);
  CREATE INDEX IF NOT EXISTS idx_link_clicks_link ON link_clicks(link_id);
  CREATE INDEX IF NOT EXISTS idx_tracked_links_code ON tracked_links(short_code);
`);

// Create default admin user if none exists
const adminExists = db.prepare('SELECT COUNT(*) as count FROM users WHERE role = ?').get('admin');
if (adminExists.count === 0) {
  const hashedPassword = bcrypt.hashSync('admin123', 10);
  db.prepare(`
    INSERT INTO users (email, password, name, role) 
    VALUES (?, ?, ?, ?)
  `).run('admin@xbo.com', hashedPassword, 'Admin', 'admin');
  console.log('Default admin created: admin@xbo.com / admin123');
}

module.exports = db;
