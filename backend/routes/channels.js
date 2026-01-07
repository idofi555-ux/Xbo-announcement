const express = require('express');
const db = require('../models/database');
const { authenticate, logActivity } = require('../middleware/auth');
const { updateChannelStats } = require('../utils/telegram');

const router = express.Router();

// Get all channels
router.get('/', authenticate, (req, res) => {
  try {
    const channels = db.prepare(`
      SELECT 
        c.*,
        u.name as added_by_name,
        (SELECT COUNT(*) FROM announcement_targets WHERE channel_id = c.id) as total_announcements,
        (SELECT SUM(views) FROM announcement_targets WHERE channel_id = c.id) as total_views
      FROM channels c
      LEFT JOIN users u ON c.added_by = u.id
      ORDER BY c.created_at DESC
    `).all();

    res.json({ channels });
  } catch (error) {
    console.error('Error fetching channels:', error);
    res.status(500).json({ error: 'Failed to fetch channels' });
  }
});

// Get single channel with stats
router.get('/:id', authenticate, (req, res) => {
  try {
    const { id } = req.params;

    const channel = db.prepare(`
      SELECT 
        c.*,
        u.name as added_by_name
      FROM channels c
      LEFT JOIN users u ON c.added_by = u.id
      WHERE c.id = ?
    `).get(id);

    if (!channel) {
      return res.status(404).json({ error: 'Channel not found' });
    }

    // Get recent announcements for this channel
    const announcements = db.prepare(`
      SELECT 
        a.id, a.title, a.status, at.views, at.sent_at
      FROM announcements a
      JOIN announcement_targets at ON a.id = at.announcement_id
      WHERE at.channel_id = ?
      ORDER BY at.sent_at DESC
      LIMIT 10
    `).all(id);

    res.json({ channel, announcements });
  } catch (error) {
    console.error('Error fetching channel:', error);
    res.status(500).json({ error: 'Failed to fetch channel' });
  }
});

// Add channel manually
router.post('/', authenticate, (req, res) => {
  try {
    const { telegram_id, title, type = 'channel' } = req.body;

    if (!telegram_id || !title) {
      return res.status(400).json({ error: 'Telegram ID and title required' });
    }

    // Check if already exists
    const existing = db.prepare('SELECT id FROM channels WHERE telegram_id = ?').get(telegram_id);
    if (existing) {
      return res.status(400).json({ error: 'Channel already registered' });
    }

    const result = db.prepare(`
      INSERT INTO channels (telegram_id, title, type, added_by)
      VALUES (?, ?, ?, ?)
    `).run(telegram_id, title, type, req.user.id);

    logActivity(req.user.id, 'channel_added', { channel_id: result.lastInsertRowid, title });

    res.status(201).json({ 
      message: 'Channel added',
      channel: { id: result.lastInsertRowid, telegram_id, title, type }
    });
  } catch (error) {
    console.error('Error adding channel:', error);
    res.status(500).json({ error: 'Failed to add channel' });
  }
});

// Update channel
router.put('/:id', authenticate, (req, res) => {
  try {
    const { id } = req.params;
    const { title, is_active } = req.body;

    const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(id);
    if (!channel) {
      return res.status(404).json({ error: 'Channel not found' });
    }

    db.prepare(`
      UPDATE channels 
      SET title = ?, is_active = ?
      WHERE id = ?
    `).run(
      title !== undefined ? title : channel.title,
      is_active !== undefined ? (is_active ? 1 : 0) : channel.is_active,
      id
    );

    logActivity(req.user.id, 'channel_updated', { channel_id: id });

    res.json({ message: 'Channel updated' });
  } catch (error) {
    console.error('Error updating channel:', error);
    res.status(500).json({ error: 'Failed to update channel' });
  }
});

// Delete channel
router.delete('/:id', authenticate, (req, res) => {
  try {
    const { id } = req.params;

    const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(id);
    if (!channel) {
      return res.status(404).json({ error: 'Channel not found' });
    }

    db.prepare('DELETE FROM channels WHERE id = ?').run(id);
    logActivity(req.user.id, 'channel_deleted', { title: channel.title });

    res.json({ message: 'Channel deleted' });
  } catch (error) {
    console.error('Error deleting channel:', error);
    res.status(500).json({ error: 'Failed to delete channel' });
  }
});

// Refresh channel stats
router.post('/:id/refresh', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    await updateChannelStats(id);
    
    const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(id);
    res.json({ channel });
  } catch (error) {
    console.error('Error refreshing channel:', error);
    res.status(500).json({ error: 'Failed to refresh channel stats' });
  }
});

module.exports = router;
