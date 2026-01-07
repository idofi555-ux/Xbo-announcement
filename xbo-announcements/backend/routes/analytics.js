const express = require('express');
const db = require('../models/database');
const { authenticate, logActivity } = require('../middleware/auth');

const router = express.Router();

// ==================== CAMPAIGNS ====================

// Get all campaigns
router.get('/campaigns', authenticate, (req, res) => {
  try {
    const campaigns = db.prepare(`
      SELECT 
        c.*,
        u.name as created_by_name,
        (SELECT COUNT(*) FROM announcements WHERE campaign_id = c.id) as announcement_count,
        (SELECT COUNT(*) FROM announcements WHERE campaign_id = c.id AND status = 'sent') as sent_count
      FROM campaigns c
      LEFT JOIN users u ON c.created_by = u.id
      ORDER BY c.created_at DESC
    `).all();

    res.json({ campaigns });
  } catch (error) {
    console.error('Error fetching campaigns:', error);
    res.status(500).json({ error: 'Failed to fetch campaigns' });
  }
});

// Create campaign
router.post('/campaigns', authenticate, (req, res) => {
  try {
    const { name, description } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Campaign name required' });
    }

    const result = db.prepare(`
      INSERT INTO campaigns (name, description, created_by)
      VALUES (?, ?, ?)
    `).run(name, description || null, req.user.id);

    logActivity(req.user.id, 'campaign_created', { campaign_id: result.lastInsertRowid, name });

    res.status(201).json({ 
      message: 'Campaign created',
      campaign: { id: result.lastInsertRowid, name, description }
    });
  } catch (error) {
    console.error('Error creating campaign:', error);
    res.status(500).json({ error: 'Failed to create campaign' });
  }
});

// Update campaign
router.put('/campaigns/:id', authenticate, (req, res) => {
  try {
    const { id } = req.params;
    const { name, description } = req.body;

    const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(id);
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    db.prepare(`
      UPDATE campaigns SET name = ?, description = ? WHERE id = ?
    `).run(name || campaign.name, description !== undefined ? description : campaign.description, id);

    res.json({ message: 'Campaign updated' });
  } catch (error) {
    console.error('Error updating campaign:', error);
    res.status(500).json({ error: 'Failed to update campaign' });
  }
});

// Delete campaign
router.delete('/campaigns/:id', authenticate, (req, res) => {
  try {
    const { id } = req.params;

    // Set announcements to no campaign
    db.prepare('UPDATE announcements SET campaign_id = NULL WHERE campaign_id = ?').run(id);
    db.prepare('DELETE FROM campaigns WHERE id = ?').run(id);

    res.json({ message: 'Campaign deleted' });
  } catch (error) {
    console.error('Error deleting campaign:', error);
    res.status(500).json({ error: 'Failed to delete campaign' });
  }
});

// ==================== ANALYTICS ====================

// Dashboard overview
router.get('/analytics/overview', authenticate, (req, res) => {
  try {
    const stats = {
      total_announcements: db.prepare('SELECT COUNT(*) as count FROM announcements').get().count,
      sent_announcements: db.prepare('SELECT COUNT(*) as count FROM announcements WHERE status = ?').get('sent').count,
      scheduled_announcements: db.prepare('SELECT COUNT(*) as count FROM announcements WHERE status = ?').get('scheduled').count,
      total_channels: db.prepare('SELECT COUNT(*) as count FROM channels WHERE is_active = 1').get().count,
      total_clicks: db.prepare('SELECT COUNT(*) as count FROM link_clicks').get().count,
      total_views: db.prepare('SELECT COALESCE(SUM(views), 0) as sum FROM announcement_targets').get().sum,
    };

    // Recent activity
    const recentAnnouncements = db.prepare(`
      SELECT a.id, a.title, a.status, a.sent_at, a.created_at,
             (SELECT SUM(views) FROM announcement_targets WHERE announcement_id = a.id) as views,
             (SELECT COUNT(*) FROM link_clicks lc 
              JOIN tracked_links tl ON lc.link_id = tl.id 
              WHERE tl.announcement_id = a.id) as clicks
      FROM announcements a
      ORDER BY COALESCE(a.sent_at, a.created_at) DESC
      LIMIT 5
    `).all();

    // Clicks over last 7 days
    const clicksTimeline = db.prepare(`
      SELECT DATE(clicked_at) as date, COUNT(*) as clicks
      FROM link_clicks
      WHERE clicked_at >= datetime('now', '-7 days')
      GROUP BY DATE(clicked_at)
      ORDER BY date
    `).all();

    // Top performing announcements
    const topAnnouncements = db.prepare(`
      SELECT 
        a.id, a.title,
        COALESCE(SUM(at.views), 0) as views,
        (SELECT COUNT(*) FROM link_clicks lc 
         JOIN tracked_links tl ON lc.link_id = tl.id 
         WHERE tl.announcement_id = a.id) as clicks
      FROM announcements a
      LEFT JOIN announcement_targets at ON a.id = at.announcement_id
      WHERE a.status = 'sent'
      GROUP BY a.id
      ORDER BY clicks DESC
      LIMIT 5
    `).all();

    res.json({ stats, recentAnnouncements, clicksTimeline, topAnnouncements });
  } catch (error) {
    console.error('Error fetching analytics:', error);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

// Detailed analytics for date range
router.get('/analytics/detailed', authenticate, (req, res) => {
  try {
    const { start_date, end_date, campaign_id } = req.query;

    let dateFilter = '';
    const params = [];

    if (start_date) {
      dateFilter += ' AND a.sent_at >= ?';
      params.push(start_date);
    }
    if (end_date) {
      dateFilter += ' AND a.sent_at <= ?';
      params.push(end_date);
    }

    let campaignFilter = '';
    if (campaign_id) {
      campaignFilter = ' AND a.campaign_id = ?';
      params.push(campaign_id);
    }

    // Announcements performance
    const announcements = db.prepare(`
      SELECT 
        a.id, a.title, a.sent_at,
        c.name as campaign_name,
        COALESCE(SUM(at.views), 0) as views,
        (SELECT COUNT(*) FROM link_clicks lc 
         JOIN tracked_links tl ON lc.link_id = tl.id 
         WHERE tl.announcement_id = a.id) as clicks,
        (SELECT COUNT(DISTINCT lc.ip_address) FROM link_clicks lc 
         JOIN tracked_links tl ON lc.link_id = tl.id 
         WHERE tl.announcement_id = a.id) as unique_clicks
      FROM announcements a
      LEFT JOIN announcement_targets at ON a.id = at.announcement_id
      LEFT JOIN campaigns c ON a.campaign_id = c.id
      WHERE a.status = 'sent' ${dateFilter} ${campaignFilter}
      GROUP BY a.id
      ORDER BY a.sent_at DESC
    `).all(...params);

    // Calculate CTR
    const announcementsWithCTR = announcements.map(a => ({
      ...a,
      ctr: a.views > 0 ? ((a.clicks / a.views) * 100).toFixed(2) : 0
    }));

    // Channel performance
    const channels = db.prepare(`
      SELECT 
        ch.id, ch.title, ch.member_count,
        COUNT(DISTINCT at.announcement_id) as announcements_received,
        COALESCE(SUM(at.views), 0) as total_views
      FROM channels ch
      LEFT JOIN announcement_targets at ON ch.id = at.channel_id
      LEFT JOIN announcements a ON at.announcement_id = a.id AND a.status = 'sent'
      WHERE ch.is_active = 1
      GROUP BY ch.id
      ORDER BY total_views DESC
    `).all();

    res.json({ announcements: announcementsWithCTR, channels });
  } catch (error) {
    console.error('Error fetching detailed analytics:', error);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

// Activity log
router.get('/analytics/activity', authenticate, (req, res) => {
  try {
    const { limit = 50 } = req.query;

    const activities = db.prepare(`
      SELECT 
        al.*,
        u.name as user_name,
        u.email as user_email
      FROM activity_log al
      LEFT JOIN users u ON al.user_id = u.id
      ORDER BY al.created_at DESC
      LIMIT ?
    `).all(parseInt(limit));

    res.json({ activities });
  } catch (error) {
    console.error('Error fetching activity:', error);
    res.status(500).json({ error: 'Failed to fetch activity' });
  }
});

module.exports = router;
