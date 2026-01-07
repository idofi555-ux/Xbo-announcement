const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

// Check if DATABASE_URL is set
if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable is not set!');
  console.error('Please add a PostgreSQL database to your Railway project.');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 30000,
  max: 10
});

// Handle pool errors
pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL pool error:', err);
});

// Initialize database tables
const initDatabase = async () => {
  if (!process.env.DATABASE_URL) {
    console.error('❌ Skipping database initialization - DATABASE_URL not set');
    return;
  }

  let client;
  try {
    console.log('Connecting to PostgreSQL...');
    client = await pool.connect();
    console.log('✅ Connected to PostgreSQL');

    await client.query(`
      -- Users table
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        name TEXT NOT NULL,
        role TEXT DEFAULT 'user' CHECK(role IN ('admin', 'user')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_login TIMESTAMP
      );

      -- Telegram channels/groups
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

      -- Campaigns (group of announcements)
      CREATE TABLE IF NOT EXISTS campaigns (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Announcements
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

      -- Announcement targets (which channels to send to)
      CREATE TABLE IF NOT EXISTS announcement_targets (
        id SERIAL PRIMARY KEY,
        announcement_id INTEGER REFERENCES announcements(id) ON DELETE CASCADE,
        channel_id INTEGER REFERENCES channels(id),
        telegram_message_id TEXT,
        views INTEGER DEFAULT 0,
        sent_at TIMESTAMP,
        error TEXT
      );

      -- Tracked links
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

      -- Link clicks
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

      -- Activity log
      CREATE TABLE IF NOT EXISTS activity_log (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        action TEXT NOT NULL,
        details TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Create indexes for better performance
      CREATE INDEX IF NOT EXISTS idx_announcements_status ON announcements(status);
      CREATE INDEX IF NOT EXISTS idx_announcements_scheduled ON announcements(scheduled_at);
      CREATE INDEX IF NOT EXISTS idx_link_clicks_link ON link_clicks(link_id);
      CREATE INDEX IF NOT EXISTS idx_tracked_links_code ON tracked_links(short_code);
    `);

    // Create default admin user if none exists
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

    console.log('✅ Database initialized');
  } catch (error) {
    console.error('Database initialization error:', error);
    throw error;
  } finally {
    if (client) {
      client.release();
    }
  }
};

module.exports = { pool, initDatabase };
