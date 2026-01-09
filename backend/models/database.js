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
    const fs = require('fs');

    // Determine database path:
    // 1. Use SQLITE_PATH env var if set (explicit override)
    // 2. In production, default to /data/xbo.db (Railway mounted volume)
    // 3. In development, use local backend/data/xbo.db
    let dbPath;
    let dataDir;
    const isProduction = process.env.NODE_ENV === 'production';

    if (process.env.SQLITE_PATH) {
      // Explicit path from environment variable
      dbPath = process.env.SQLITE_PATH;
      dataDir = path.dirname(dbPath);
    } else if (isProduction) {
      // Production default: Railway mounted volume at /data
      dataDir = '/data';
      dbPath = '/data/xbo.db';
    } else {
      // Local development
      dataDir = path.join(__dirname, '../data');
      dbPath = path.join(dataDir, 'xbo.db');
    }

    console.log('');
    console.log('========================================');
    console.log('       SQLite Database Configuration    ');
    console.log('========================================');
    console.log('Environment:', isProduction ? 'PRODUCTION' : 'DEVELOPMENT');
    console.log('SQLITE_PATH env:', process.env.SQLITE_PATH || 'NOT SET');
    console.log('Database path:', dbPath);
    console.log('Data directory:', dataDir);
    console.log('========================================');
    console.log('');

    // Ensure data directory exists
    if (!fs.existsSync(dataDir)) {
      console.log('Creating data directory:', dataDir);
      fs.mkdirSync(dataDir, { recursive: true });
    }

    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');

    console.log('SQLite database opened successfully!');
    console.log('Database file exists:', fs.existsSync(dbPath));
  } catch (error) {
    console.error('Failed to initialize SQLite:', error.message);
    console.error('Full error:', error);
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

    // Strip RETURNING clause for SQLite (not supported in older versions)
    // Match RETURNING followed by anything until end of statement
    sqliteSql = sqliteSql.replace(/\s+RETURNING\s+[\w\s,*]+$/i, '');

    // Handle different query types
    const trimmedSql = sqliteSql.trim().toUpperCase();
    if (trimmedSql.startsWith('SELECT')) {
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
            device_type TEXT,
            browser TEXT,
            clicked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          );

          CREATE TABLE IF NOT EXISTS activity_log (
            id SERIAL PRIMARY KEY,
            user_id INTEGER REFERENCES users(id),
            action TEXT NOT NULL,
            details TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          );

          CREATE TABLE IF NOT EXISTS pixel_views (
            id SERIAL PRIMARY KEY,
            announcement_id INTEGER REFERENCES announcements(id) ON DELETE CASCADE,
            channel_id INTEGER REFERENCES channels(id) ON DELETE CASCADE,
            viewer_hash TEXT NOT NULL,
            ip_address TEXT,
            user_agent TEXT,
            country TEXT,
            city TEXT,
            device_type TEXT,
            browser TEXT,
            viewed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          );

          CREATE TABLE IF NOT EXISTS button_clicks (
            id SERIAL PRIMARY KEY,
            announcement_id INTEGER REFERENCES announcements(id) ON DELETE CASCADE,
            channel_id INTEGER,
            button_text TEXT NOT NULL,
            telegram_user_id TEXT,
            telegram_username TEXT,
            telegram_first_name TEXT,
            clicked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          );

          CREATE INDEX IF NOT EXISTS idx_announcements_status ON announcements(status);
          CREATE INDEX IF NOT EXISTS idx_announcements_scheduled ON announcements(scheduled_at);
          CREATE INDEX IF NOT EXISTS idx_link_clicks_link ON link_clicks(link_id);
          CREATE INDEX IF NOT EXISTS idx_tracked_links_code ON tracked_links(short_code);
          CREATE INDEX IF NOT EXISTS idx_pixel_views_unique ON pixel_views(announcement_id, channel_id, viewer_hash);
          CREATE INDEX IF NOT EXISTS idx_button_clicks_announcement ON button_clicks(announcement_id);

          -- CRM/Support Module Tables
          CREATE TABLE IF NOT EXISTS customer_profiles (
            id SERIAL PRIMARY KEY,
            telegram_user_id TEXT UNIQUE NOT NULL,
            telegram_username TEXT,
            display_name TEXT,
            tags TEXT DEFAULT '[]',
            notes TEXT,
            first_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          );

          CREATE TABLE IF NOT EXISTS conversations (
            id SERIAL PRIMARY KEY,
            channel_id INTEGER REFERENCES channels(id) ON DELETE CASCADE,
            customer_id INTEGER REFERENCES customer_profiles(id) ON DELETE CASCADE,
            status TEXT DEFAULT 'open' CHECK(status IN ('open', 'pending', 'closed')),
            assigned_to INTEGER REFERENCES users(id),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          );

          CREATE TABLE IF NOT EXISTS messages (
            id SERIAL PRIMARY KEY,
            conversation_id INTEGER REFERENCES conversations(id) ON DELETE CASCADE,
            telegram_message_id TEXT,
            direction TEXT CHECK(direction IN ('in', 'out')),
            content TEXT NOT NULL,
            sender_name TEXT,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          );

          CREATE TABLE IF NOT EXISTS quick_replies (
            id SERIAL PRIMARY KEY,
            shortcut TEXT UNIQUE NOT NULL,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            created_by INTEGER REFERENCES users(id),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          );

          CREATE TABLE IF NOT EXISTS tickets (
            id SERIAL PRIMARY KEY,
            conversation_id INTEGER REFERENCES conversations(id) ON DELETE CASCADE,
            subject TEXT NOT NULL,
            category TEXT DEFAULT 'support' CHECK(category IN ('support', 'sales', 'technical', 'billing')),
            status TEXT DEFAULT 'new' CHECK(status IN ('new', 'in_progress', 'waiting_customer', 'resolved', 'closed')),
            priority TEXT DEFAULT 'medium' CHECK(priority IN ('low', 'medium', 'high', 'urgent')),
            assigned_to INTEGER REFERENCES users(id),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            first_response_at TIMESTAMP,
            resolved_at TIMESTAMP,
            closed_at TIMESTAMP,
            sla_first_response_due TIMESTAMP,
            sla_resolution_due TIMESTAMP
          );

          CREATE TABLE IF NOT EXISTS ticket_activity (
            id SERIAL PRIMARY KEY,
            ticket_id INTEGER REFERENCES tickets(id) ON DELETE CASCADE,
            user_id INTEGER REFERENCES users(id),
            action TEXT NOT NULL,
            old_value TEXT,
            new_value TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          );

          CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
          CREATE INDEX IF NOT EXISTS idx_tickets_priority ON tickets(priority);
          CREATE INDEX IF NOT EXISTS idx_ticket_activity_ticket ON ticket_activity(ticket_id);

          CREATE INDEX IF NOT EXISTS idx_conversations_status ON conversations(status);
          CREATE INDEX IF NOT EXISTS idx_conversations_channel ON conversations(channel_id);
          CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
          CREATE INDEX IF NOT EXISTS idx_customer_profiles_telegram ON customer_profiles(telegram_user_id);

        -- Conversation read tracking table
        CREATE TABLE IF NOT EXISTS conversation_reads (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          conversation_id INTEGER REFERENCES conversations(id) ON DELETE CASCADE,
          user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
          last_read_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(conversation_id, user_id)
        );

        CREATE INDEX IF NOT EXISTS idx_conversation_reads_conv ON conversation_reads(conversation_id);
        CREATE INDEX IF NOT EXISTS idx_conversation_reads_user ON conversation_reads(user_id);

          -- System Logs Table
          CREATE TABLE IF NOT EXISTS system_logs (
            id SERIAL PRIMARY KEY,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            type TEXT NOT NULL CHECK(type IN ('error', 'warning', 'info', 'success')),
            category TEXT NOT NULL CHECK(category IN ('telegram', 'api', 'system', 'auth', 'channel', 'support')),
            message TEXT NOT NULL,
            details TEXT,
            announcement_id INTEGER REFERENCES announcements(id) ON DELETE SET NULL,
            user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
            channel_id INTEGER REFERENCES channels(id) ON DELETE SET NULL
          );

          CREATE INDEX IF NOT EXISTS idx_system_logs_timestamp ON system_logs(timestamp);
          CREATE INDEX IF NOT EXISTS idx_system_logs_type ON system_logs(type);
          CREATE INDEX IF NOT EXISTS idx_system_logs_category ON system_logs(category);
        `);

        // Run migrations to add missing columns
        console.log('Running migrations for missing columns...');

        const migrations = [
          'ALTER TABLE link_clicks ADD COLUMN IF NOT EXISTS country TEXT',
          'ALTER TABLE link_clicks ADD COLUMN IF NOT EXISTS city TEXT',
          'ALTER TABLE link_clicks ADD COLUMN IF NOT EXISTS device_type TEXT',
          'ALTER TABLE link_clicks ADD COLUMN IF NOT EXISTS browser TEXT',
          'ALTER TABLE pixel_views ADD COLUMN IF NOT EXISTS country TEXT',
          'ALTER TABLE pixel_views ADD COLUMN IF NOT EXISTS city TEXT',
          'ALTER TABLE pixel_views ADD COLUMN IF NOT EXISTS device_type TEXT',
          'ALTER TABLE pixel_views ADD COLUMN IF NOT EXISTS browser TEXT',
          'ALTER TABLE pixel_views ADD COLUMN IF NOT EXISTS ip_address TEXT',
          // Tickets table migrations
          "ALTER TABLE tickets ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'support'",
          'ALTER TABLE tickets ADD COLUMN IF NOT EXISTS sla_first_response_due TIMESTAMP',
          'ALTER TABLE tickets ADD COLUMN IF NOT EXISTS sla_resolution_due TIMESTAMP',
          'ALTER TABLE tickets ADD COLUMN IF NOT EXISTS first_response_at TIMESTAMP',
          'ALTER TABLE tickets ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMP',
          'ALTER TABLE tickets ADD COLUMN IF NOT EXISTS closed_at TIMESTAMP',
          'ALTER TABLE tickets ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP'
        ];

        for (const migration of migrations) {
          try {
            await client.query(migration);
            console.log('Migration applied:', migration);
          } catch (e) {
            // Column might already exist
          }
        }

        console.log('Migrations complete.');

        // Migration: Update admin email from admin@xbo.com to ido@xbo.com
        try {
          await client.query(
            'UPDATE users SET email = $1 WHERE email = $2',
            ['ido@xbo.com', 'admin@xbo.com']
          );
          console.log('Admin email migration checked (admin@xbo.com -> ido@xbo.com)');
        } catch (e) {
          // Ignore if already updated or doesn't exist
        }

        // Create default admin
        const adminResult = await client.query(
          'SELECT COUNT(*) as count FROM users WHERE role = $1',
          ['admin']
        );

        if (parseInt(adminResult.rows[0].count) === 0) {
          const hashedPassword = bcrypt.hashSync('admin123', 10);
          await client.query(
            'INSERT INTO users (email, password, name, role) VALUES ($1, $2, $3, $4)',
            ['ido@xbo.com', hashedPassword, 'Admin', 'admin']
          );
          console.log('Default admin created: ido@xbo.com / admin123');
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
          device_type TEXT,
          browser TEXT,
          clicked_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS activity_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER REFERENCES users(id),
          action TEXT NOT NULL,
          details TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS pixel_views (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          announcement_id INTEGER REFERENCES announcements(id) ON DELETE CASCADE,
          channel_id INTEGER REFERENCES channels(id) ON DELETE CASCADE,
          viewer_hash TEXT NOT NULL,
          ip_address TEXT,
          user_agent TEXT,
          country TEXT,
          city TEXT,
          device_type TEXT,
          browser TEXT,
          viewed_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS button_clicks (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          announcement_id INTEGER REFERENCES announcements(id) ON DELETE CASCADE,
          channel_id INTEGER,
          button_text TEXT NOT NULL,
          telegram_user_id TEXT,
          telegram_username TEXT,
          telegram_first_name TEXT,
          clicked_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_announcements_status ON announcements(status);
        CREATE INDEX IF NOT EXISTS idx_announcements_scheduled ON announcements(scheduled_at);
        CREATE INDEX IF NOT EXISTS idx_link_clicks_link ON link_clicks(link_id);
        CREATE INDEX IF NOT EXISTS idx_tracked_links_code ON tracked_links(short_code);
        CREATE INDEX IF NOT EXISTS idx_pixel_views_unique ON pixel_views(announcement_id, channel_id, viewer_hash);
        CREATE INDEX IF NOT EXISTS idx_button_clicks_announcement ON button_clicks(announcement_id);

        -- CRM/Support Module Tables
        CREATE TABLE IF NOT EXISTS customer_profiles (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          telegram_user_id TEXT UNIQUE NOT NULL,
          telegram_username TEXT,
          display_name TEXT,
          tags TEXT DEFAULT '[]',
          notes TEXT,
          first_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
          last_seen DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS conversations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          channel_id INTEGER REFERENCES channels(id) ON DELETE CASCADE,
          customer_id INTEGER REFERENCES customer_profiles(id) ON DELETE CASCADE,
          status TEXT DEFAULT 'open' CHECK(status IN ('open', 'pending', 'closed')),
          assigned_to INTEGER REFERENCES users(id),
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS messages (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          conversation_id INTEGER REFERENCES conversations(id) ON DELETE CASCADE,
          telegram_message_id TEXT,
          direction TEXT CHECK(direction IN ('in', 'out')),
          content TEXT NOT NULL,
          sender_name TEXT,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS quick_replies (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          shortcut TEXT UNIQUE NOT NULL,
          title TEXT NOT NULL,
          content TEXT NOT NULL,
          created_by INTEGER REFERENCES users(id),
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS tickets (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          conversation_id INTEGER REFERENCES conversations(id) ON DELETE CASCADE,
          subject TEXT NOT NULL,
          category TEXT DEFAULT 'support' CHECK(category IN ('support', 'sales', 'technical', 'billing')),
          status TEXT DEFAULT 'new' CHECK(status IN ('new', 'in_progress', 'waiting_customer', 'resolved', 'closed')),
          priority TEXT DEFAULT 'medium' CHECK(priority IN ('low', 'medium', 'high', 'urgent')),
          assigned_to INTEGER REFERENCES users(id),
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          first_response_at DATETIME,
          resolved_at DATETIME,
          closed_at DATETIME,
          sla_first_response_due DATETIME,
          sla_resolution_due DATETIME
        );

        CREATE TABLE IF NOT EXISTS ticket_activity (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          ticket_id INTEGER REFERENCES tickets(id) ON DELETE CASCADE,
          user_id INTEGER REFERENCES users(id),
          action TEXT NOT NULL,
          old_value TEXT,
          new_value TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
        CREATE INDEX IF NOT EXISTS idx_tickets_priority ON tickets(priority);
        CREATE INDEX IF NOT EXISTS idx_ticket_activity_ticket ON ticket_activity(ticket_id);
        CREATE INDEX IF NOT EXISTS idx_conversations_status ON conversations(status);
        CREATE INDEX IF NOT EXISTS idx_conversations_channel ON conversations(channel_id);
        CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
        CREATE INDEX IF NOT EXISTS idx_customer_profiles_telegram ON customer_profiles(telegram_user_id);

        -- Conversation read tracking table
        CREATE TABLE IF NOT EXISTS conversation_reads (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          conversation_id INTEGER REFERENCES conversations(id) ON DELETE CASCADE,
          user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
          last_read_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(conversation_id, user_id)
        );

        CREATE INDEX IF NOT EXISTS idx_conversation_reads_conv ON conversation_reads(conversation_id);
        CREATE INDEX IF NOT EXISTS idx_conversation_reads_user ON conversation_reads(user_id);

        -- System Logs Table
        CREATE TABLE IF NOT EXISTS system_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
          type TEXT NOT NULL CHECK(type IN ('error', 'warning', 'info', 'success')),
          category TEXT NOT NULL CHECK(category IN ('telegram', 'api', 'system', 'auth', 'channel', 'support')),
          message TEXT NOT NULL,
          details TEXT,
          announcement_id INTEGER REFERENCES announcements(id) ON DELETE SET NULL,
          user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
          channel_id INTEGER REFERENCES channels(id) ON DELETE SET NULL
        );

        CREATE INDEX IF NOT EXISTS idx_system_logs_timestamp ON system_logs(timestamp);
        CREATE INDEX IF NOT EXISTS idx_system_logs_type ON system_logs(type);
        CREATE INDEX IF NOT EXISTS idx_system_logs_category ON system_logs(category);
      `);

      // Run migrations to add missing columns to existing tables
      console.log('Running migrations for missing columns...');

      // Migration: Add missing columns to link_clicks
      const linkClicksMigrations = [
        'ALTER TABLE link_clicks ADD COLUMN country TEXT',
        'ALTER TABLE link_clicks ADD COLUMN city TEXT',
        'ALTER TABLE link_clicks ADD COLUMN device_type TEXT',
        'ALTER TABLE link_clicks ADD COLUMN browser TEXT'
      ];

      for (const migration of linkClicksMigrations) {
        try {
          db.exec(migration);
          console.log('Migration applied:', migration);
        } catch (e) {
          // Column already exists, ignore
        }
      }

      // Migration: Add missing columns to pixel_views
      const pixelViewsMigrations = [
        'ALTER TABLE pixel_views ADD COLUMN country TEXT',
        'ALTER TABLE pixel_views ADD COLUMN city TEXT',
        'ALTER TABLE pixel_views ADD COLUMN device_type TEXT',
        'ALTER TABLE pixel_views ADD COLUMN browser TEXT',
        'ALTER TABLE pixel_views ADD COLUMN ip_address TEXT'
      ];

      for (const migration of pixelViewsMigrations) {
        try {
          db.exec(migration);
          console.log('Migration applied:', migration);
        } catch (e) {
          // Column already exists, ignore
        }
      }

      console.log('Migrations complete.');

      // Migration: Update admin email from admin@xbo.com to ido@xbo.com
      try {
        db.prepare('UPDATE users SET email = ? WHERE email = ?').run('ido@xbo.com', 'admin@xbo.com');
        console.log('Admin email migration checked (admin@xbo.com -> ido@xbo.com)');
      } catch (e) {
        // Ignore if already updated or doesn't exist
      }

      // Create default admin
      const adminResult = db.prepare('SELECT COUNT(*) as count FROM users WHERE role = ?').get('admin');
      if (adminResult.count === 0) {
        const hashedPassword = bcrypt.hashSync('admin123', 10);
        db.prepare('INSERT INTO users (email, password, name, role) VALUES (?, ?, ?, ?)').run(
          'ido@xbo.com', hashedPassword, 'Admin', 'admin'
        );
        console.log('Default admin created: ido@xbo.com / admin123');
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
