const express = require('express');
const db = require('../models/database');
const { authenticate, logActivity } = require('../middleware/auth');
const { sendAnnouncement } = require('../utils/telegram');
const { processContentLinks, getLinkStats, getClickTimeline } = require('../utils/linkTracker');

const router = express.Router();

// Get all announcements
router.get('/', authenticate, (req, res) => {
  try {
    const { status, campaign_id, limit = 50, offset = 0 } = req.query;

    let query = `
      SELECT 
        a.*,
        u.name as created_by_name,
        c.name as campaign_name,
        (SELECT COUNT(*) FROM announcement_targets WHERE announcement_id = a.id) as target_count,
        (SELECT SUM(views) FROM announcement_targets WHERE announcement_id = a.id) as total_views,
        (SELECT COUNT(*) FROM link_clicks lc 
         JOIN tracked_links tl ON lc.link_id = tl.id 
         WHERE tl.announcement_id = a.id) as total_clicks
      FROM announcements a
      LEFT JOIN users u ON a.created_by = u.id
      LEFT JOIN campaigns c ON a.campaign_id = c.id
      WHERE 1=1
    `;
    const params = [];

    if (status) {
      query += ' AND a.status = ?';
      params.push(status);
    }

    if (campaign_id) {
      query += ' AND a.campaign_id = ?';
      params.push(campaign_id);
    }

    query += ' ORDER BY a.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const announcements = db.prepare(query).all(...params);

    // Get total count
    let countQuery = 'SELECT COUNT(*) as count FROM announcements WHERE 1=1';
    const countParams = [];
    if (status) {
      countQuery += ' AND status = ?';
      countParams.push(status);
    }
    if (campaign_id) {
      countQuery += ' AND campaign_id = ?';
      countParams.push(campaign_id);
    }
    const { count } = db.prepare(countQuery).get(...countParams);

    res.json({ announcements, total: count });
  } catch (error) {
    console.error('Error fetching announcements:', error);
    res.status(500).json({ error: 'Failed to fetch announcements' });
  }
});

// Get single announcement with full stats
router.get('/:id', authenticate, (req, res) => {
  try {
    const { id } = req.params;

    const announcement = db.prepare(`
      SELECT 
        a.*,
        u.name as created_by_name,
        c.name as campaign_name
      FROM announcements a
      LEFT JOIN users u ON a.created_by = u.id
      LEFT JOIN campaigns c ON a.campaign_id = c.id
      WHERE a.id = ?
    `).get(id);

    if (!announcement) {
      return res.status(404).json({ error: 'Announcement not found' });
    }

    // Get targets
    const targets = db.prepare(`
      SELECT 
        at.*,
        ch.title as channel_title,
        ch.telegram_id
      FROM announcement_targets at
      JOIN channels ch ON at.channel_id = ch.id
      WHERE at.announcement_id = ?
    `).all(id);

    // Get link stats
    const linkStats = getLinkStats(id);

    // Get click timeline
    const clickTimeline = getClickTimeline(id);

    res.json({ 
      announcement, 
      targets, 
      linkStats,
      clickTimeline
    });
  } catch (error) {
    console.error('Error fetching announcement:', error);
    res.status(500).json({ error: 'Failed to fetch announcement' });
  }
});

// Create announcement
router.post('/', authenticate, (req, res) => {
  try {
    const { title, content, image_url, buttons, campaign_id, channel_ids, scheduled_at } = req.body;

    if (!title || !content) {
      return res.status(400).json({ error: 'Title and content required' });
    }

    if (!channel_ids || channel_ids.length === 0) {
      return res.status(400).json({ error: 'At least one channel required' });
    }

    const status = scheduled_at ? 'scheduled' : 'draft';

    const result = db.prepare(`
      INSERT INTO announcements (title, content, image_url, buttons, campaign_id, status, scheduled_at, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      title,
      content,
      image_url || null,
      buttons ? JSON.stringify(buttons) : null,
      campaign_id || null,
      status,
      scheduled_at || null,
      req.user.id
    );

    const announcementId = result.lastInsertRowid;

    // Add targets
    const insertTarget = db.prepare(`
      INSERT INTO announcement_targets (announcement_id, channel_id)
      VALUES (?, ?)
    `);

    channel_ids.forEach(channelId => {
      insertTarget.run(announcementId, channelId);
    });

    logActivity(req.user.id, 'announcement_created', { announcement_id: announcementId, title });

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
router.put('/:id', authenticate, (req, res) => {
  try {
    const { id } = req.params;
    const { title, content, image_url, buttons, campaign_id, channel_ids, scheduled_at } = req.body;

    const announcement = db.prepare('SELECT * FROM announcements WHERE id = ?').get(id);
    if (!announcement) {
      return res.status(404).json({ error: 'Announcement not found' });
    }

    if (announcement.status === 'sent') {
      return res.status(400).json({ error: 'Cannot edit sent announcement' });
    }

    const status = scheduled_at ? 'scheduled' : 'draft';

    db.prepare(`
      UPDATE announcements
      SET title = ?, content = ?, image_url = ?, buttons = ?, campaign_id = ?, status = ?, scheduled_at = ?
      WHERE id = ?
    `).run(
      title || announcement.title,
      content || announcement.content,
      image_url !== undefined ? image_url : announcement.image_url,
      buttons ? JSON.stringify(buttons) : announcement.buttons,
      campaign_id !== undefined ? campaign_id : announcement.campaign_id,
      status,
      scheduled_at || null,
      id
    );

    // Update targets if provided
    if (channel_ids) {
      db.prepare('DELETE FROM announcement_targets WHERE announcement_id = ?').run(id);
      
      const insertTarget = db.prepare(`
        INSERT INTO announcement_targets (announcement_id, channel_id)
        VALUES (?, ?)
      `);

      channel_ids.forEach(channelId => {
        insertTarget.run(id, channelId);
      });
    }

    logActivity(req.user.id, 'announcement_updated', { announcement_id: id });

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

    const announcement = db.prepare('SELECT * FROM announcements WHERE id = ?').get(id);
    if (!announcement) {
      return res.status(404).json({ error: 'Announcement not found' });
    }

    if (announcement.status === 'sent') {
      return res.status(400).json({ error: 'Announcement already sent' });
    }

    // Get targets
    const targets = db.prepare(`
      SELECT at.*, c.telegram_id, c.title as channel_title
      FROM announcement_targets at
      JOIN channels c ON at.channel_id = c.id
      WHERE at.announcement_id = ? AND c.is_active = 1
    `).all(id);

    if (targets.length === 0) {
      return res.status(400).json({ error: 'No active channels to send to' });
    }

    // Get campaign name for UTM
    let campaignName = null;
    if (announcement.campaign_id) {
      const campaign = db.prepare('SELECT name FROM campaigns WHERE id = ?').get(announcement.campaign_id);
      campaignName = campaign?.name;
    }

    // Process links in content and buttons
    const trackedLinks = processContentLinks(announcement.content, id, campaignName);
    
    // Also process button URLs
    if (announcement.buttons) {
      try {
        const buttons = JSON.parse(announcement.buttons);
        buttons.forEach(btn => {
          if (btn.url && !trackedLinks.find(l => l.original_url === btn.url)) {
            const tracked = processContentLinks(btn.url, id, campaignName);
            trackedLinks.push(...tracked);
          }
        });
      } catch (e) {}
    }

    const results = [];

    // Send to each channel
    for (const target of targets) {
      try {
        const message = await sendAnnouncement(target.channel_id, announcement, trackedLinks);
        
        db.prepare(`
          UPDATE announcement_targets 
          SET telegram_message_id = ?, sent_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(message.message_id.toString(), target.id);

        results.push({ channel: target.channel_title, success: true, message_id: message.message_id });
      } catch (error) {
        console.error(`Failed to send to ${target.channel_title}:`, error);
        
        db.prepare(`
          UPDATE announcement_targets 
          SET error = ?
          WHERE id = ?
        `).run(error.message, target.id);

        results.push({ channel: target.channel_title, success: false, error: error.message });
      }
    }

    // Update announcement status
    const allFailed = results.every(r => !r.success);
    db.prepare(`
      UPDATE announcements 
      SET status = ?, sent_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(allFailed ? 'failed' : 'sent', id);

    logActivity(req.user.id, 'announcement_sent', { announcement_id: id, results });

    res.json({ message: 'Announcement sent', results });
  } catch (error) {
    console.error('Error sending announcement:', error);
    res.status(500).json({ error: 'Failed to send announcement' });
  }
});

// Delete announcement
router.delete('/:id', authenticate, (req, res) => {
  try {
    const { id } = req.params;

    const announcement = db.prepare('SELECT * FROM announcements WHERE id = ?').get(id);
    if (!announcement) {
      return res.status(404).json({ error: 'Announcement not found' });
    }

    db.prepare('DELETE FROM announcements WHERE id = ?').run(id);
    logActivity(req.user.id, 'announcement_deleted', { title: announcement.title });

    res.json({ message: 'Announcement deleted' });
  } catch (error) {
    console.error('Error deleting announcement:', error);
    res.status(500).json({ error: 'Failed to delete announcement' });
  }
});

// Duplicate announcement
router.post('/:id/duplicate', authenticate, (req, res) => {
  try {
    const { id } = req.params;

    const announcement = db.prepare('SELECT * FROM announcements WHERE id = ?').get(id);
    if (!announcement) {
      return res.status(404).json({ error: 'Announcement not found' });
    }

    const result = db.prepare(`
      INSERT INTO announcements (title, content, image_url, buttons, campaign_id, status, created_by)
      VALUES (?, ?, ?, ?, ?, 'draft', ?)
    `).run(
      `${announcement.title} (Copy)`,
      announcement.content,
      announcement.image_url,
      announcement.buttons,
      announcement.campaign_id,
      req.user.id
    );

    const newId = result.lastInsertRowid;

    // Copy targets
    const targets = db.prepare('SELECT channel_id FROM announcement_targets WHERE announcement_id = ?').all(id);
    const insertTarget = db.prepare('INSERT INTO announcement_targets (announcement_id, channel_id) VALUES (?, ?)');
    targets.forEach(t => insertTarget.run(newId, t.channel_id));

    logActivity(req.user.id, 'announcement_duplicated', { original_id: id, new_id: newId });

    res.status(201).json({ message: 'Announcement duplicated', id: newId });
  } catch (error) {
    console.error('Error duplicating announcement:', error);
    res.status(500).json({ error: 'Failed to duplicate announcement' });
  }
});

module.exports = router;
