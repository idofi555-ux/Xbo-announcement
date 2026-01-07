// Load environment variables first
require('dotenv').config();

const bcrypt = require('bcryptjs');

// Determine which database to use
const DATABASE_URL = process.env.DATABASE_URL;
const USE_POSTGRES = !!DATABASE_URL;

console.log('=== Database Configuration ===');
console.log('DATABASE_URL:', DATABASE_URL ? 'SET (' + DATABASE_URL.substring(0, 30) + '...)' : 'NOT SET');
console.log('Using:', USE_POSTGRES ? 'PostgreSQL' : 'SQLite (fallback)');

let pool = null;
let db = null;

if (USE_POSTGRES) {
  // PostgreSQL setup
  const { Pool } = require('pg');

  pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000,
    max: 10
  });

  pool.on('error', (err) => {
    console.error('PostgreSQL pool error:', err.message);
  });

  pool.on('connect', () => {
    console.log('PostgreSQL client connected');
  });
} else {
  // SQLite fallback
  try {
    const Database = require('better-sqlite3');
    const path = require('path');
    const dbPath = path.join(__dirname, '../data/xbo.db');

    // Ensure data directory exists
    const fs = require('fs');
    const dataDir = path.join(__dirname, '../data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    console.log('SQLite database opened at:', dbPath);
  } catch (error) {
    console.error('Failed to initialize SQLite:', error.message);
    console.error('Install better-sqlite3: npm install better-sqlite3');
  }
}

// Database query wrapper that works with both PostgreSQL and SQLite
const query = async (sql, params = []) => {
  if (USE_POSTGRES && pool) {
    const result = await pool.query(sql, params);
    return result;
  } else if (db) {
    // Convert PostgreSQL $1, $2 style to SQLite ? style
    let sqliteSql = sql;
    let paramIndex = 1;
    while (sqliteSql.includes('$' + paramIndex)) {
      sqliteSql = sqliteSql.replace('$' + paramIndex, '?');
      paramIndex++;
    }

    // Handle different query types
    const trimmedSql = sqliteSql.trim().toUpperCase();
    if (trimmedSql.startsWith('SELECT') || trimmedSql.startsWith('RETURNING')) {
      const rows = db.prepare(sqliteSql).all(...params);
      return { rows };
    } else if (trimmedSql.startsWith('INSERT')) {
      const result = db.prepare(sqliteSql).run(...params);
      return { rows: [{ id: result.lastInsertRowid }], rowCount: result.changes };
    } else {
      const result = db.prepare(sqliteSql).run(...params);
      return { rows: [], rowCount: result.changes };
    }
  } else {
    throw new Error('No database connection available');
  }
};

// Initialize database tables
const initDatabase = async () => {
  console.log('Initializing database...');

  try {
    if (USE_POSTGRES && pool) {
      // PostgreSQL initialization
      const client = await pool.connect();
      console.log('Connected to PostgreSQL');

      try {
        await client.query(`
          CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            name TEXT NOT NULL,
            role TEXT DEFAULT 'user' CHECK(role IN ('admin', 'user')),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            last_login TIMESTAMP
          );

          CREATE TABLE IF NOT EXISTS channels (
            id SERIAL PRIMARY KEY,
            telegram_id TEXT UNIQUE NOT NULL,
            title TEXT NOT NULL,
            type TEXT CHECK(type IN ('channel', 'group', 'supergroup', 'private')),
            member_count INTEGER DEFAULT 0,
            is_active INTEGER DEFAULT 1,
            added_by INTEGER REFERENCES users(id),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          );

          CREATE TABLE IF NOT EXISTS campaigns (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT,
            created_by INTEGER REFERENCES users(id),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          );

          CREATE TABLE IF NOT EXISTS announcements (
            id SERIAL PRIMARY KEY,
            campaign_id INTEGER REFERENCES campaigns(id),
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            image_url TEXT,
            buttons TEXT,
            status TEXT DEFAULT 'draft' CHECK(status IN ('draft', 'scheduled', 'sent', 'failed')),
            scheduled_at TIMESTAMP,
            sent_at TIMESTAMP,
            created_by INTEGER REFERENCES users(id),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          );

          CREATE TABLE IF NOT EXISTS announcement_targets (
            id SERIAL PRIMARY KEY,
            announcement_id INTEGER REFERENCES announcements(id) ON DELETE CASCADE,
            channel_id INTEGER REFERENCES channels(id),
            telegram_message_id TEXT,
            views INTEGER DEFAULT 0,
            sent_at TIMESTAMP,
            error TEXT
          );

          CREATE TABLE IF NOT EXISTS tracked_links (
            id SERIAL PRIMARY KEY,
            short_code TEXT UNIQUE NOT NULL,
            original_url TEXT NOT NULL,
            announcement_id INTEGER REFERENCES announcements(id) ON DELETE CASCADE,
            utm_source TEXT,
            utm_medium TEXT,
            utm_campaign TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          );

          CREATE TABLE IF NOT EXISTS link_clicks (
            id SERIAL PRIMARY KEY,
            link_id INTEGER REFERENCES tracked_links(id),
            ip_address TEXT,
            user_agent TEXT,
            referer TEXT,
            country TEXT,
            city TEXT,
            clicked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          );

          CREATE TABLE IF NOT EXISTS activity_log (
            id SERIAL PRIMARY KEY,
            user_id INTEGER REFERENCES users(id),
            action TEXT NOT NULL,
            details TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          );

          CREATE INDEX IF NOT EXISTS idx_announcements_status ON announcements(status);
          CREATE INDEX IF NOT EXISTS idx_announcements_scheduled ON announcements(scheduled_at);
          CREATE INDEX IF NOT EXISTS idx_link_clicks_link ON link_clicks(link_id);
          CREATE INDEX IF NOT EXISTS idx_tracked_links_code ON tracked_links(short_code);
        `);

        // Create default admin
        const adminResult = await client.query(
          'SELECT COUNT(*) as count FROM users WHERE role = $1',
          ['admin']
        );

        if (parseInt(adminResult.rows[0].count) === 0) {
          const hashedPassword = bcrypt.hashSync('admin123', 10);
          await client.query(
            'INSERT INTO users (email, password, name, role) VALUES ($1, $2, $3, $4)',
            ['admin@xbo.com', hashedPassword, 'Admin', 'admin']
          );
          console.log('Default admin created: admin@xbo.com / admin123');
        }

        console.log('✅ PostgreSQL database initialized');
      } finally {
        client.release();
      }
    } else if (db) {
      // SQLite initialization
      db.exec(`
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          email TEXT UNIQUE NOT NULL,
          password TEXT NOT NULL,
          name TEXT NOT NULL,
          role TEXT DEFAULT 'user' CHECK(role IN ('admin', 'user')),
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          last_login DATETIME
        );

        CREATE TABLE IF NOT EXISTS channels (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          telegram_id TEXT UNIQUE NOT NULL,
          title TEXT NOT NULL,
          type TEXT CHECK(type IN ('channel', 'group', 'supergroup', 'private')),
          member_count INTEGER DEFAULT 0,
          is_active INTEGER DEFAULT 1,
          added_by INTEGER REFERENCES users(id),
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS campaigns (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          description TEXT,
          created_by INTEGER REFERENCES users(id),
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS announcements (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          campaign_id INTEGER REFERENCES campaigns(id),
          title TEXT NOT NULL,
          content TEXT NOT NULL,
          image_url TEXT,
          buttons TEXT,
          status TEXT DEFAULT 'draft' CHECK(status IN ('draft', 'scheduled', 'sent', 'failed')),
          scheduled_at DATETIME,
          sent_at DATETIME,
          created_by INTEGER REFERENCES users(id),
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS announcement_targets (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          announcement_id INTEGER REFERENCES announcements(id) ON DELETE CASCADE,
          channel_id INTEGER REFERENCES channels(id),
          telegram_message_id TEXT,
          views INTEGER DEFAULT 0,
          sent_at DATETIME,
          error TEXT
        );

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

        CREATE TABLE IF NOT EXISTS activity_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER REFERENCES users(id),
          action TEXT NOT NULL,
          details TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_announcements_status ON announcements(status);
        CREATE INDEX IF NOT EXISTS idx_announcements_scheduled ON announcements(scheduled_at);
        CREATE INDEX IF NOT EXISTS idx_link_clicks_link ON link_clicks(link_id);
        CREATE INDEX IF NOT EXISTS idx_tracked_links_code ON tracked_links(short_code);
      `);

      // Create default admin
      const adminResult = db.prepare('SELECT COUNT(*) as count FROM users WHERE role = ?').get('admin');
      if (adminResult.count === 0) {
        const hashedPassword = bcrypt.hashSync('admin123', 10);
        db.prepare('INSERT INTO users (email, password, name, role) VALUES (?, ?, ?, ?)').run(
          'admin@xbo.com', hashedPassword, 'Admin', 'admin'
        );
        console.log('Default admin created: admin@xbo.com / admin123');
      }

      console.log('✅ SQLite database initialized');
    } else {
      throw new Error('No database available');
    }
  } catch (error) {
    console.error('Database initialization error:', error);
    throw error;
  }
};

// Export pool for PostgreSQL compatibility with existing code
module.exports = {
  pool: USE_POSTGRES ? pool : { query },
  db,
  query,
  initDatabase,
  USE_POSTGRES
};
