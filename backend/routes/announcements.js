const express = require('express');
const { pool } = require('../models/database');
const { authenticate, logActivity } = require('../middleware/auth');
const { sendAnnouncement } = require('../utils/telegram');
const { processContentLinks, getLinkStats, getClickTimeline } = require('../utils/linkTracker');

const router = express.Router();

// Get all announcements
router.get('/', authenticate, async (req, res) => {
  try {
    const { status, campaign_id, limit = 50, offset = 0 } = req.query;

    let query = `
      SELECT
        a.*,
        u.name as created_by_name,
        c.name as campaign_name,
        (SELECT COUNT(*) FROM announcement_targets WHERE announcement_id = a.id) as target_count,
        (SELECT COALESCE(SUM(views), 0) FROM announcement_targets WHERE announcement_id = a.id) as total_views,
        (SELECT COUNT(*) FROM link_clicks lc
         JOIN tracked_links tl ON lc.link_id = tl.id
         WHERE tl.announcement_id = a.id) as total_clicks
      FROM announcements a
      LEFT JOIN users u ON a.created_by = u.id
      LEFT JOIN campaigns c ON a.campaign_id = c.id
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;

    if (status) {
      query += ` AND a.status = $${paramIndex++}`;
      params.push(status);
    }

    if (campaign_id) {
      query += ` AND a.campaign_id = $${paramIndex++}`;
      params.push(campaign_id);
    }

    query += ` ORDER BY a.created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    params.push(parseInt(limit), parseInt(offset));

    const result = await pool.query(query, params);

    // Get total count
    let countQuery = 'SELECT COUNT(*) as count FROM announcements WHERE 1=1';
    const countParams = [];
    let countIndex = 1;

    if (status) {
      countQuery += ` AND status = $${countIndex++}`;
      countParams.push(status);
    }
    if (campaign_id) {
      countQuery += ` AND campaign_id = $${countIndex++}`;
      countParams.push(campaign_id);
    }

    const countResult = await pool.query(countQuery, countParams);

    res.json({ announcements: result.rows, total: parseInt(countResult.rows[0].count) });
  } catch (error) {
    console.error('Error fetching announcements:', error);
    res.status(500).json({ error: 'Failed to fetch announcements' });
  }
});

// Get single announcement with full stats
router.get('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    const announcementResult = await pool.query(`
      SELECT
        a.*,
        u.name as created_by_name,
        c.name as campaign_name
      FROM announcements a
      LEFT JOIN users u ON a.created_by = u.id
      LEFT JOIN campaigns c ON a.campaign_id = c.id
      WHERE a.id = $1
    `, [id]);

    if (announcementResult.rows.length === 0) {
      return res.status(404).json({ error: 'Announcement not found' });
    }

    // Get targets
    const targetsResult = await pool.query(`
      SELECT
        at.*,
        ch.title as channel_title,
        ch.telegram_id
      FROM announcement_targets at
      JOIN channels ch ON at.channel_id = ch.id
      WHERE at.announcement_id = $1
    `, [id]);

    // Get link stats
    const linkStats = await getLinkStats(id);

    // Get click timeline
    const clickTimeline = await getClickTimeline(id);

    res.json({
      announcement: announcementResult.rows[0],
      targets: targetsResult.rows,
      linkStats,
      clickTimeline
    });
  } catch (error) {
    console.error('Error fetching announcement:', error);
    res.status(500).json({ error: 'Failed to fetch announcement' });
  }
});

// Create announcement
router.post('/', authenticate, async (req, res) => {
  try {
    const { title, content, image_url, buttons, campaign_id, channel_ids, scheduled_at } = req.body;

    if (!title || !content) {
      return res.status(400).json({ error: 'Title and content required' });
    }

    if (!channel_ids || channel_ids.length === 0) {
      return res.status(400).json({ error: 'At least one channel required' });
    }

    const status = scheduled_at ? 'scheduled' : 'draft';

    const result = await pool.query(
      `INSERT INTO announcements (title, content, image_url, buttons, campaign_id, status, scheduled_at, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [
        title,
        content,
        image_url || null,
        buttons ? JSON.stringify(buttons) : null,
        campaign_id || null,
        status,
        scheduled_at || null,
        req.user.id
      ]
    );

    const announcementId = result.rows[0].id;

    // Add targets
    for (const channelId of channel_ids) {
      await pool.query(
        'INSERT INTO announcement_targets (announcement_id, channel_id) VALUES ($1, $2)',
        [announcementId, channelId]
      );
    }

    await logActivity(req.user.id, 'announcement_created', { announcement_id: announcementId, title });

    res.status(201).json({
      message: 'Announcement created',
      announcement: { id: announcementId, title, status }
    });
  } catch (error) {
    console.error('Error creating announcement:', error);
    res.status(500).json({ error: 'Failed to create announcement' });
  }
});

// Update announcement
router.put('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, content, image_url, buttons, campaign_id, channel_ids, scheduled_at } = req.body;

    const announcementResult = await pool.query('SELECT * FROM announcements WHERE id = $1', [id]);
    if (announcementResult.rows.length === 0) {
      return res.status(404).json({ error: 'Announcement not found' });
    }

    const announcement = announcementResult.rows[0];

    if (announcement.status === 'sent') {
      return res.status(400).json({ error: 'Cannot edit sent announcement' });
    }

    const status = scheduled_at ? 'scheduled' : 'draft';

    await pool.query(
      `UPDATE announcements
       SET title = $1, content = $2, image_url = $3, buttons = $4, campaign_id = $5, status = $6, scheduled_at = $7
       WHERE id = $8`,
      [
        title || announcement.title,
        content || announcement.content,
        image_url !== undefined ? image_url : announcement.image_url,
        buttons ? JSON.stringify(buttons) : announcement.buttons,
        campaign_id !== undefined ? campaign_id : announcement.campaign_id,
        status,
        scheduled_at || null,
        id
      ]
    );

    // Update targets if provided
    if (channel_ids) {
      await pool.query('DELETE FROM announcement_targets WHERE announcement_id = $1', [id]);

      for (const channelId of channel_ids) {
        await pool.query(
          'INSERT INTO announcement_targets (announcement_id, channel_id) VALUES ($1, $2)',
          [id, channelId]
        );
      }
    }

    await logActivity(req.user.id, 'announcement_updated', { announcement_id: id });

    res.json({ message: 'Announcement updated' });
  } catch (error) {
    console.error('Error updating announcement:', error);
    res.status(500).json({ error: 'Failed to update announcement' });
  }
});

// Send announcement now
router.post('/:id/send', authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    const announcementResult = await pool.query('SELECT * FROM announcements WHERE id = $1', [id]);
    if (announcementResult.rows.length === 0) {
      return res.status(404).json({ error: 'Announcement not found' });
    }

    const announcement = announcementResult.rows[0];

    if (announcement.status === 'sent') {
      return res.status(400).json({ error: 'Announcement already sent' });
    }

    // Get targets
    const targetsResult = await pool.query(`
      SELECT at.*, c.telegram_id, c.title as channel_title
      FROM announcement_targets at
      JOIN channels c ON at.channel_id = c.id
      WHERE at.announcement_id = $1 AND c.is_active = 1
    `, [id]);

    const targets = targetsResult.rows;

    if (targets.length === 0) {
      return res.status(400).json({ error: 'No active channels to send to' });
    }

    // Get campaign name for UTM
    let campaignName = null;
    if (announcement.campaign_id) {
      const campaignResult = await pool.query('SELECT name FROM campaigns WHERE id = $1', [announcement.campaign_id]);
      campaignName = campaignResult.rows[0]?.name;
    }

    // Process links in content and buttons
    const trackedLinks = await processContentLinks(announcement.content, id, campaignName);

    // Also process button URLs
    if (announcement.buttons) {
      try {
        const buttons = JSON.parse(announcement.buttons);
        for (const btn of buttons) {
          if (btn.url && !trackedLinks.find(l => l.original_url === btn.url)) {
            const tracked = await processContentLinks(btn.url, id, campaignName);
            trackedLinks.push(...tracked);
          }
        }
      } catch (e) {}
    }

    const results = [];

    // Send to each channel
    for (const target of targets) {
      try {
        const message = await sendAnnouncement(target.channel_id, announcement, trackedLinks);

        await pool.query(
          `UPDATE announcement_targets
           SET telegram_message_id = $1, sent_at = CURRENT_TIMESTAMP
           WHERE id = $2`,
          [message.message_id.toString(), target.id]
        );

        results.push({ channel: target.channel_title, success: true, message_id: message.message_id });
      } catch (error) {
        console.error(`Failed to send to ${target.channel_title}:`, error);

        await pool.query(
          'UPDATE announcement_targets SET error = $1 WHERE id = $2',
          [error.message, target.id]
        );

        results.push({ channel: target.channel_title, success: false, error: error.message });
      }
    }

    // Update announcement status
    const allFailed = results.every(r => !r.success);
    await pool.query(
      'UPDATE announcements SET status = $1, sent_at = CURRENT_TIMESTAMP WHERE id = $2',
      [allFailed ? 'failed' : 'sent', id]
    );

    await logActivity(req.user.id, 'announcement_sent', { announcement_id: id, results });

    res.json({ message: 'Announcement sent', results });
  } catch (error) {
    console.error('Error sending announcement:', error);
    res.status(500).json({ error: 'Failed to send announcement' });
  }
});

// Delete announcement
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    const announcementResult = await pool.query('SELECT * FROM announcements WHERE id = $1', [id]);
    if (announcementResult.rows.length === 0) {
      return res.status(404).json({ error: 'Announcement not found' });
    }

    const announcement = announcementResult.rows[0];

    await pool.query('DELETE FROM announcements WHERE id = $1', [id]);
    await logActivity(req.user.id, 'announcement_deleted', { title: announcement.title });

    res.json({ message: 'Announcement deleted' });
  } catch (error) {
    console.error('Error deleting announcement:', error);
    res.status(500).json({ error: 'Failed to delete announcement' });
  }
});

// Duplicate announcement
router.post('/:id/duplicate', authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    const announcementResult = await pool.query('SELECT * FROM announcements WHERE id = $1', [id]);
    if (announcementResult.rows.length === 0) {
      return res.status(404).json({ error: 'Announcement not found' });
    }

    const announcement = announcementResult.rows[0];

    const result = await pool.query(
      `INSERT INTO announcements (title, content, image_url, buttons, campaign_id, status, created_by)
       VALUES ($1, $2, $3, $4, $5, 'draft', $6) RETURNING id`,
      [
        `${announcement.title} (Copy)`,
        announcement.content,
        announcement.image_url,
        announcement.buttons,
        announcement.campaign_id,
        req.user.id
      ]
    );

    const newId = result.rows[0].id;

    // Copy targets
    const targetsResult = await pool.query(
      'SELECT channel_id FROM announcement_targets WHERE announcement_id = $1',
      [id]
    );

    for (const target of targetsResult.rows) {
      await pool.query(
        'INSERT INTO announcement_targets (announcement_id, channel_id) VALUES ($1, $2)',
        [newId, target.channel_id]
      );
    }

    await logActivity(req.user.id, 'announcement_duplicated', { original_id: id, new_id: newId });

    res.status(201).json({ message: 'Announcement duplicated', id: newId });
  } catch (error) {
    console.error('Error duplicating announcement:', error);
    res.status(500).json({ error: 'Failed to duplicate announcement' });
  }
});

module.exports = router;
