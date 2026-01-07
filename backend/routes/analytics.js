const express = require('express');
const { pool } = require('../models/database');
const { authenticate, logActivity } = require('../middleware/auth');

const router = express.Router();

// ==================== CAMPAIGNS ====================

// Get all campaigns
router.get('/campaigns', authenticate, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        c.*,
        u.name as created_by_name,
        (SELECT COUNT(*) FROM announcements WHERE campaign_id = c.id) as announcement_count,
        (SELECT COUNT(*) FROM announcements WHERE campaign_id = c.id AND status = 'sent') as sent_count
      FROM campaigns c
      LEFT JOIN users u ON c.created_by = u.id
      ORDER BY c.created_at DESC
    `);

    res.json({ campaigns: result.rows });
  } catch (error) {
    console.error('Error fetching campaigns:', error);
    res.status(500).json({ error: 'Failed to fetch campaigns' });
  }
});

// Create campaign
router.post('/campaigns', authenticate, async (req, res) => {
  try {
    const { name, description } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Campaign name required' });
    }

    const result = await pool.query(
      'INSERT INTO campaigns (name, description, created_by) VALUES ($1, $2, $3) RETURNING id',
      [name, description || null, req.user.id]
    );

    await logActivity(req.user.id, 'campaign_created', { campaign_id: result.rows[0].id, name });

    res.status(201).json({
      message: 'Campaign created',
      campaign: { id: result.rows[0].id, name, description }
    });
  } catch (error) {
    console.error('Error creating campaign:', error);
    res.status(500).json({ error: 'Failed to create campaign' });
  }
});

// Update campaign
router.put('/campaigns/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description } = req.body;

    const campaignResult = await pool.query('SELECT * FROM campaigns WHERE id = $1', [id]);
    if (campaignResult.rows.length === 0) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    const campaign = campaignResult.rows[0];

    await pool.query(
      'UPDATE campaigns SET name = $1, description = $2 WHERE id = $3',
      [name || campaign.name, description !== undefined ? description : campaign.description, id]
    );

    res.json({ message: 'Campaign updated' });
  } catch (error) {
    console.error('Error updating campaign:', error);
    res.status(500).json({ error: 'Failed to update campaign' });
  }
});

// Delete campaign
router.delete('/campaigns/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    // Set announcements to no campaign
    await pool.query('UPDATE announcements SET campaign_id = NULL WHERE campaign_id = $1', [id]);
    await pool.query('DELETE FROM campaigns WHERE id = $1', [id]);

    res.json({ message: 'Campaign deleted' });
  } catch (error) {
    console.error('Error deleting campaign:', error);
    res.status(500).json({ error: 'Failed to delete campaign' });
  }
});

// ==================== ANALYTICS ====================

// Dashboard overview
router.get('/analytics/overview', authenticate, async (req, res) => {
  try {
    const totalAnnouncements = await pool.query('SELECT COUNT(*) as count FROM announcements');
    const sentAnnouncements = await pool.query('SELECT COUNT(*) as count FROM announcements WHERE status = $1', ['sent']);
    const scheduledAnnouncements = await pool.query('SELECT COUNT(*) as count FROM announcements WHERE status = $1', ['scheduled']);
    const totalChannels = await pool.query('SELECT COUNT(*) as count FROM channels WHERE is_active = 1');
    const totalClicks = await pool.query('SELECT COUNT(*) as count FROM link_clicks');
    const totalViews = await pool.query('SELECT COALESCE(SUM(views), 0) as sum FROM announcement_targets');

    const stats = {
      total_announcements: parseInt(totalAnnouncements.rows[0].count),
      sent_announcements: parseInt(sentAnnouncements.rows[0].count),
      scheduled_announcements: parseInt(scheduledAnnouncements.rows[0].count),
      total_channels: parseInt(totalChannels.rows[0].count),
      total_clicks: parseInt(totalClicks.rows[0].count),
      total_views: parseInt(totalViews.rows[0].sum)
    };

    // Recent activity
    const recentResult = await pool.query(`
      SELECT a.id, a.title, a.status, a.sent_at, a.created_at,
             (SELECT COALESCE(SUM(views), 0) FROM announcement_targets WHERE announcement_id = a.id) as views,
             (SELECT COUNT(*) FROM link_clicks lc
              JOIN tracked_links tl ON lc.link_id = tl.id
              WHERE tl.announcement_id = a.id) as clicks
      FROM announcements a
      ORDER BY COALESCE(a.sent_at, a.created_at) DESC
      LIMIT 5
    `);

    // Clicks over last 7 days
    const clicksTimelineResult = await pool.query(`
      SELECT DATE(clicked_at) as date, COUNT(*) as clicks
      FROM link_clicks
      WHERE clicked_at >= NOW() - INTERVAL '7 days'
      GROUP BY DATE(clicked_at)
      ORDER BY date
    `);

    // Top performing announcements
    const topResult = await pool.query(`
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
    `);

    res.json({
      stats,
      recentAnnouncements: recentResult.rows,
      clicksTimeline: clicksTimelineResult.rows,
      topAnnouncements: topResult.rows
    });
  } catch (error) {
    console.error('Error fetching analytics:', error);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

// Detailed analytics for date range
router.get('/analytics/detailed', authenticate, async (req, res) => {
  try {
    const { start_date, end_date, campaign_id } = req.query;

    let query = `
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
      WHERE a.status = 'sent'
    `;

    const params = [];
    let paramIndex = 1;

    if (start_date) {
      query += ` AND a.sent_at >= $${paramIndex++}`;
      params.push(start_date);
    }
    if (end_date) {
      query += ` AND a.sent_at <= $${paramIndex++}`;
      params.push(end_date);
    }
    if (campaign_id) {
      query += ` AND a.campaign_id = $${paramIndex++}`;
      params.push(campaign_id);
    }

    query += ' GROUP BY a.id, c.name ORDER BY a.sent_at DESC';

    const announcementsResult = await pool.query(query, params);

    // Calculate CTR
    const announcementsWithCTR = announcementsResult.rows.map(a => ({
      ...a,
      views: parseInt(a.views),
      clicks: parseInt(a.clicks),
      unique_clicks: parseInt(a.unique_clicks),
      ctr: parseInt(a.views) > 0 ? ((parseInt(a.clicks) / parseInt(a.views)) * 100).toFixed(2) : 0
    }));

    // Channel performance
    const channelsResult = await pool.query(`
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
    `);

    res.json({ announcements: announcementsWithCTR, channels: channelsResult.rows });
  } catch (error) {
    console.error('Error fetching detailed analytics:', error);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

// Activity log
router.get('/analytics/activity', authenticate, async (req, res) => {
  try {
    const { limit = 50 } = req.query;

    const result = await pool.query(`
      SELECT
        al.*,
        u.name as user_name,
        u.email as user_email
      FROM activity_log al
      LEFT JOIN users u ON al.user_id = u.id
      ORDER BY al.created_at DESC
      LIMIT $1
    `, [parseInt(limit)]);

    res.json({ activities: result.rows });
  } catch (error) {
    console.error('Error fetching activity:', error);
    res.status(500).json({ error: 'Failed to fetch activity' });
  }
});

module.exports = router;
