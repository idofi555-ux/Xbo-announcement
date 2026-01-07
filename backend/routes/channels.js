const express = require('express');
const { pool } = require('../models/database');
const { authenticate, logActivity } = require('../middleware/auth');
const { updateChannelStats } = require('../utils/telegram');

const router = express.Router();

// Get all channels
router.get('/', authenticate, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        c.*,
        u.name as added_by_name,
        (SELECT COUNT(*) FROM announcement_targets WHERE channel_id = c.id) as total_announcements,
        (SELECT COALESCE(SUM(views), 0) FROM announcement_targets WHERE channel_id = c.id) as total_views
      FROM channels c
      LEFT JOIN users u ON c.added_by = u.id
      ORDER BY c.created_at DESC
    `);

    res.json({ channels: result.rows });
  } catch (error) {
    console.error('Error fetching channels:', error);
    res.status(500).json({ error: 'Failed to fetch channels' });
  }
});

// Get single channel with stats
router.get('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    const channelResult = await pool.query(`
      SELECT
        c.*,
        u.name as added_by_name
      FROM channels c
      LEFT JOIN users u ON c.added_by = u.id
      WHERE c.id = $1
    `, [id]);

    if (channelResult.rows.length === 0) {
      return res.status(404).json({ error: 'Channel not found' });
    }

    // Get recent announcements for this channel
    const announcementsResult = await pool.query(`
      SELECT
        a.id, a.title, a.status, at.views, at.sent_at
      FROM announcements a
      JOIN announcement_targets at ON a.id = at.announcement_id
      WHERE at.channel_id = $1
      ORDER BY at.sent_at DESC
      LIMIT 10
    `, [id]);

    res.json({ channel: channelResult.rows[0], announcements: announcementsResult.rows });
  } catch (error) {
    console.error('Error fetching channel:', error);
    res.status(500).json({ error: 'Failed to fetch channel' });
  }
});

// Add channel manually
router.post('/', authenticate, async (req, res) => {
  try {
    const { telegram_id, title, type = 'channel' } = req.body;

    if (!telegram_id || !title) {
      return res.status(400).json({ error: 'Telegram ID and title required' });
    }

    // Check if already exists
    const existing = await pool.query('SELECT id FROM channels WHERE telegram_id = $1', [telegram_id]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Channel already registered' });
    }

    const result = await pool.query(
      'INSERT INTO channels (telegram_id, title, type, added_by) VALUES ($1, $2, $3, $4) RETURNING id',
      [telegram_id, title, type, req.user.id]
    );

    await logActivity(req.user.id, 'channel_added', { channel_id: result.rows[0].id, title });

    res.status(201).json({
      message: 'Channel added',
      channel: { id: result.rows[0].id, telegram_id, title, type }
    });
  } catch (error) {
    console.error('Error adding channel:', error);
    res.status(500).json({ error: 'Failed to add channel' });
  }
});

// Update channel
router.put('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, is_active } = req.body;

    const channelResult = await pool.query('SELECT * FROM channels WHERE id = $1', [id]);
    if (channelResult.rows.length === 0) {
      return res.status(404).json({ error: 'Channel not found' });
    }

    const channel = channelResult.rows[0];

    await pool.query(
      'UPDATE channels SET title = $1, is_active = $2 WHERE id = $3',
      [
        title !== undefined ? title : channel.title,
        is_active !== undefined ? (is_active ? 1 : 0) : channel.is_active,
        id
      ]
    );

    await logActivity(req.user.id, 'channel_updated', { channel_id: id });

    res.json({ message: 'Channel updated' });
  } catch (error) {
    console.error('Error updating channel:', error);
    res.status(500).json({ error: 'Failed to update channel' });
  }
});

// Delete channel
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    const channelResult = await pool.query('SELECT * FROM channels WHERE id = $1', [id]);
    if (channelResult.rows.length === 0) {
      return res.status(404).json({ error: 'Channel not found' });
    }

    const channel = channelResult.rows[0];

    await pool.query('DELETE FROM channels WHERE id = $1', [id]);
    await logActivity(req.user.id, 'channel_deleted', { title: channel.title });

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

    const channelResult = await pool.query('SELECT * FROM channels WHERE id = $1', [id]);
    res.json({ channel: channelResult.rows[0] });
  } catch (error) {
    console.error('Error refreshing channel:', error);
    res.status(500).json({ error: 'Failed to refresh channel stats' });
  }
});

module.exports = router;
