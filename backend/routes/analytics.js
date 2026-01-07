const express = require('express');
const { pool, USE_POSTGRES } = require('../models/database');
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
      total_announcements: parseInt(totalAnnouncements.rows[0].count) || 0,
      sent_announcements: parseInt(sentAnnouncements.rows[0].count) || 0,
      scheduled_announcements: parseInt(scheduledAnnouncements.rows[0].count) || 0,
      total_channels: parseInt(totalChannels.rows[0].count) || 0,
      total_clicks: parseInt(totalClicks.rows[0].count) || 0,
      total_views: parseInt(totalViews.rows[0].sum) || 0
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

    // Parse recent announcements numbers
    const recentAnnouncements = recentResult.rows.map(a => ({
      ...a,
      views: parseInt(a.views) || 0,
      clicks: parseInt(a.clicks) || 0
    }));

    // Clicks over last 7 days - use database-specific query
    let clicksTimelineQuery;
    if (USE_POSTGRES) {
      clicksTimelineQuery = `
        SELECT DATE(clicked_at) as date, COUNT(*) as clicks
        FROM link_clicks
        WHERE clicked_at >= CURRENT_DATE - INTERVAL '7 days'
        GROUP BY DATE(clicked_at)
        ORDER BY date
      `;
    } else {
      // SQLite syntax
      clicksTimelineQuery = `
        SELECT DATE(clicked_at) as date, COUNT(*) as clicks
        FROM link_clicks
        WHERE clicked_at >= date('now', '-7 days')
        GROUP BY DATE(clicked_at)
        ORDER BY date
      `;
    }

    const clicksTimelineResult = await pool.query(clicksTimelineQuery);

    // Parse timeline numbers
    const clicksTimeline = clicksTimelineResult.rows.map(t => ({
      ...t,
      clicks: parseInt(t.clicks) || 0
    }));

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

    // Parse top announcements numbers
    const topAnnouncements = topResult.rows.map(a => ({
      ...a,
      views: parseInt(a.views) || 0,
      clicks: parseInt(a.clicks) || 0
    }));

    res.json({
      stats,
      recentAnnouncements,
      clicksTimeline,
      topAnnouncements
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
      if (USE_POSTGRES) {
        query += ` AND COALESCE(a.sent_at, a.created_at) >= $${paramIndex++}`;
      } else {
        query += ` AND COALESCE(a.sent_at, a.created_at) >= $${paramIndex++}`;
      }
      params.push(start_date);
    }
    if (end_date) {
      if (USE_POSTGRES) {
        query += ` AND COALESCE(a.sent_at, a.created_at) < date($${paramIndex++}) + INTERVAL '1 day'`;
      } else {
        query += ` AND COALESCE(a.sent_at, a.created_at) < date($${paramIndex++}, '+1 day')`;
      }
      params.push(end_date);
    }
    if (campaign_id) {
      query += ` AND a.campaign_id = $${paramIndex++}`;
      params.push(campaign_id);
    }

    query += ' GROUP BY a.id, c.name ORDER BY COALESCE(a.sent_at, a.created_at) DESC';

    const announcementsResult = await pool.query(query, params);

    // Calculate CTR
    const announcementsWithCTR = announcementsResult.rows.map(a => ({
      ...a,
      views: parseInt(a.views) || 0,
      clicks: parseInt(a.clicks) || 0,
      unique_clicks: parseInt(a.unique_clicks) || 0,
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

    // Parse channel numbers
    const channelsWithNumbers = channelsResult.rows.map(ch => ({
      ...ch,
      member_count: parseInt(ch.member_count) || 0,
      announcements_received: parseInt(ch.announcements_received) || 0,
      total_views: parseInt(ch.total_views) || 0
    }));

    res.json({ announcements: announcementsWithCTR, channels: channelsWithNumbers });
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

// ==================== CLICK DETAILS ====================

// Get detailed click data
router.get('/analytics/clicks', authenticate, async (req, res) => {
  try {
    const { announcement_id, start_date, end_date, limit = 100, offset = 0 } = req.query;

    let query = `
      SELECT
        lc.id,
        lc.ip_address,
        lc.country,
        lc.city,
        lc.device_type,
        lc.browser,
        lc.clicked_at,
        tl.original_url,
        tl.short_code,
        a.title as announcement_title,
        a.id as announcement_id
      FROM link_clicks lc
      JOIN tracked_links tl ON lc.link_id = tl.id
      LEFT JOIN announcements a ON tl.announcement_id = a.id
      WHERE 1=1
    `;

    const params = [];
    let paramIndex = 1;

    if (announcement_id) {
      query += ` AND tl.announcement_id = $${paramIndex++}`;
      params.push(announcement_id);
    }
    if (start_date) {
      query += ` AND lc.clicked_at >= $${paramIndex++}`;
      params.push(start_date);
    }
    if (end_date) {
      if (USE_POSTGRES) {
        query += ` AND lc.clicked_at < date($${paramIndex++}) + INTERVAL '1 day'`;
      } else {
        query += ` AND lc.clicked_at < date($${paramIndex++}, '+1 day')`;
      }
      params.push(end_date);
    }

    query += ` ORDER BY lc.clicked_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    params.push(parseInt(limit), parseInt(offset));

    const result = await pool.query(query, params);

    // Get total count for pagination
    let countQuery = `
      SELECT COUNT(*) as total
      FROM link_clicks lc
      JOIN tracked_links tl ON lc.link_id = tl.id
      WHERE 1=1
    `;
    const countParams = [];
    let countParamIndex = 1;

    if (announcement_id) {
      countQuery += ` AND tl.announcement_id = $${countParamIndex++}`;
      countParams.push(announcement_id);
    }
    if (start_date) {
      countQuery += ` AND lc.clicked_at >= $${countParamIndex++}`;
      countParams.push(start_date);
    }
    if (end_date) {
      if (USE_POSTGRES) {
        countQuery += ` AND lc.clicked_at < date($${countParamIndex++}) + INTERVAL '1 day'`;
      } else {
        countQuery += ` AND lc.clicked_at < date($${countParamIndex++}, '+1 day')`;
      }
      countParams.push(end_date);
    }

    const countResult = await pool.query(countQuery, countParams);

    res.json({
      clicks: result.rows,
      total: parseInt(countResult.rows[0].total) || 0,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    console.error('Error fetching click details:', error);
    res.status(500).json({ error: 'Failed to fetch click details' });
  }
});

// Get pixel view details
router.get('/analytics/views', authenticate, async (req, res) => {
  try {
    const { announcement_id, start_date, end_date, limit = 100, offset = 0 } = req.query;

    let query = `
      SELECT
        pv.id,
        pv.ip_address,
        pv.country,
        pv.city,
        pv.device_type,
        pv.browser,
        pv.viewed_at,
        a.title as announcement_title,
        a.id as announcement_id,
        ch.title as channel_title
      FROM pixel_views pv
      LEFT JOIN announcements a ON pv.announcement_id = a.id
      LEFT JOIN channels ch ON pv.channel_id = ch.id
      WHERE 1=1
    `;

    const params = [];
    let paramIndex = 1;

    if (announcement_id) {
      query += ` AND pv.announcement_id = $${paramIndex++}`;
      params.push(announcement_id);
    }
    if (start_date) {
      query += ` AND pv.viewed_at >= $${paramIndex++}`;
      params.push(start_date);
    }
    if (end_date) {
      if (USE_POSTGRES) {
        query += ` AND pv.viewed_at < date($${paramIndex++}) + INTERVAL '1 day'`;
      } else {
        query += ` AND pv.viewed_at < date($${paramIndex++}, '+1 day')`;
      }
      params.push(end_date);
    }

    query += ` ORDER BY pv.viewed_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    params.push(parseInt(limit), parseInt(offset));

    const result = await pool.query(query, params);

    // Get total count
    let countQuery = `SELECT COUNT(*) as total FROM pixel_views pv WHERE 1=1`;
    const countParams = [];
    let countParamIndex = 1;

    if (announcement_id) {
      countQuery += ` AND pv.announcement_id = $${countParamIndex++}`;
      countParams.push(announcement_id);
    }
    if (start_date) {
      countQuery += ` AND pv.viewed_at >= $${countParamIndex++}`;
      countParams.push(start_date);
    }
    if (end_date) {
      if (USE_POSTGRES) {
        countQuery += ` AND pv.viewed_at < date($${countParamIndex++}) + INTERVAL '1 day'`;
      } else {
        countQuery += ` AND pv.viewed_at < date($${countParamIndex++}, '+1 day')`;
      }
      countParams.push(end_date);
    }

    const countResult = await pool.query(countQuery, countParams);

    res.json({
      views: result.rows,
      total: parseInt(countResult.rows[0].total) || 0,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    console.error('Error fetching view details:', error);
    res.status(500).json({ error: 'Failed to fetch view details' });
  }
});

// Get button click details (Telegram user tracking)
router.get('/analytics/button-clicks', authenticate, async (req, res) => {
  try {
    const { announcement_id, start_date, end_date, limit = 100, offset = 0 } = req.query;

    let query = `
      SELECT
        bc.id,
        bc.button_text,
        bc.telegram_user_id,
        bc.telegram_username,
        bc.telegram_first_name,
        bc.clicked_at,
        a.title as announcement_title,
        a.id as announcement_id
      FROM button_clicks bc
      LEFT JOIN announcements a ON bc.announcement_id = a.id
      WHERE 1=1
    `;

    const params = [];
    let paramIndex = 1;

    if (announcement_id) {
      query += ` AND bc.announcement_id = $${paramIndex++}`;
      params.push(announcement_id);
    }
    if (start_date) {
      query += ` AND bc.clicked_at >= $${paramIndex++}`;
      params.push(start_date);
    }
    if (end_date) {
      if (USE_POSTGRES) {
        query += ` AND bc.clicked_at < date($${paramIndex++}) + INTERVAL '1 day'`;
      } else {
        query += ` AND bc.clicked_at < date($${paramIndex++}, '+1 day')`;
      }
      params.push(end_date);
    }

    query += ` ORDER BY bc.clicked_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    params.push(parseInt(limit), parseInt(offset));

    const result = await pool.query(query, params);

    // Get total count
    let countQuery = `SELECT COUNT(*) as total FROM button_clicks bc WHERE 1=1`;
    const countParams = [];
    let countParamIndex = 1;

    if (announcement_id) {
      countQuery += ` AND bc.announcement_id = $${countParamIndex++}`;
      countParams.push(announcement_id);
    }
    if (start_date) {
      countQuery += ` AND bc.clicked_at >= $${countParamIndex++}`;
      countParams.push(start_date);
    }
    if (end_date) {
      if (USE_POSTGRES) {
        countQuery += ` AND bc.clicked_at < date($${countParamIndex++}) + INTERVAL '1 day'`;
      } else {
        countQuery += ` AND bc.clicked_at < date($${countParamIndex++}, '+1 day')`;
      }
      countParams.push(end_date);
    }

    const countResult = await pool.query(countQuery, countParams);

    res.json({
      buttonClicks: result.rows,
      total: parseInt(countResult.rows[0].total) || 0,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    console.error('Error fetching button click details:', error);
    res.status(500).json({ error: 'Failed to fetch button click details' });
  }
});

// Get aggregated stats for charts
router.get('/analytics/aggregated', authenticate, async (req, res) => {
  try {
    const { start_date, end_date } = req.query;

    // Build date filter for each query
    let dateFilter = '';
    let dateFilterViews = '';
    const params = [];
    let paramIndex = 1;

    if (start_date) {
      dateFilter += ` AND lc.clicked_at >= $${paramIndex}`;
      dateFilterViews += ` AND pv.viewed_at >= $${paramIndex}`;
      params.push(start_date);
      paramIndex++;
    }
    if (end_date) {
      if (USE_POSTGRES) {
        dateFilter += ` AND lc.clicked_at < date($${paramIndex}) + INTERVAL '1 day'`;
        dateFilterViews += ` AND pv.viewed_at < date($${paramIndex}) + INTERVAL '1 day'`;
      } else {
        dateFilter += ` AND lc.clicked_at < date($${paramIndex}, '+1 day')`;
        dateFilterViews += ` AND pv.viewed_at < date($${paramIndex}, '+1 day')`;
      }
      params.push(end_date);
      paramIndex++;
    }

    // Clicks by country
    const countryQuery = `
      SELECT country, COUNT(*) as count
      FROM link_clicks lc
      WHERE country IS NOT NULL AND country != 'Unknown' ${dateFilter}
      GROUP BY country
      ORDER BY count DESC
      LIMIT 10
    `;
    const countryResult = await pool.query(countryQuery, params);

    // Clicks by device
    const deviceQuery = `
      SELECT device_type, COUNT(*) as count
      FROM link_clicks lc
      WHERE device_type IS NOT NULL ${dateFilter}
      GROUP BY device_type
      ORDER BY count DESC
    `;
    const deviceResult = await pool.query(deviceQuery, params);

    // Clicks by browser
    const browserQuery = `
      SELECT browser, COUNT(*) as count
      FROM link_clicks lc
      WHERE browser IS NOT NULL AND browser != 'unknown' ${dateFilter}
      GROUP BY browser
      ORDER BY count DESC
      LIMIT 10
    `;
    const browserResult = await pool.query(browserQuery, params);

    // Clicks by hour
    let hourQuery;
    if (USE_POSTGRES) {
      hourQuery = `
        SELECT EXTRACT(HOUR FROM clicked_at) as hour, COUNT(*) as count
        FROM link_clicks lc
        WHERE 1=1 ${dateFilter}
        GROUP BY EXTRACT(HOUR FROM clicked_at)
        ORDER BY hour
      `;
    } else {
      hourQuery = `
        SELECT strftime('%H', clicked_at) as hour, COUNT(*) as count
        FROM link_clicks lc
        WHERE 1=1 ${dateFilter}
        GROUP BY strftime('%H', clicked_at)
        ORDER BY hour
      `;
    }
    const hourResult = await pool.query(hourQuery, params);

    // Views by country
    const viewsCountryQuery = `
      SELECT country, COUNT(*) as count
      FROM pixel_views pv
      WHERE country IS NOT NULL AND country != 'Unknown' ${dateFilterViews}
      GROUP BY country
      ORDER BY count DESC
      LIMIT 10
    `;
    const viewsCountryResult = await pool.query(viewsCountryQuery, params);

    // Views by device
    const viewsDeviceQuery = `
      SELECT device_type, COUNT(*) as count
      FROM pixel_views pv
      WHERE device_type IS NOT NULL ${dateFilterViews}
      GROUP BY device_type
      ORDER BY count DESC
    `;
    const viewsDeviceResult = await pool.query(viewsDeviceQuery, params);

    res.json({
      clicks: {
        byCountry: countryResult.rows.map(r => ({ ...r, count: parseInt(r.count) })),
        byDevice: deviceResult.rows.map(r => ({ ...r, count: parseInt(r.count) })),
        byBrowser: browserResult.rows.map(r => ({ ...r, count: parseInt(r.count) })),
        byHour: hourResult.rows.map(r => ({ hour: parseInt(r.hour), count: parseInt(r.count) }))
      },
      views: {
        byCountry: viewsCountryResult.rows.map(r => ({ ...r, count: parseInt(r.count) })),
        byDevice: viewsDeviceResult.rows.map(r => ({ ...r, count: parseInt(r.count) }))
      }
    });
  } catch (error) {
    console.error('Error fetching aggregated analytics:', error);
    res.status(500).json({ error: 'Failed to fetch aggregated analytics' });
  }
});

// Export clicks to CSV
router.get('/analytics/export/clicks', authenticate, async (req, res) => {
  try {
    const { start_date, end_date, announcement_id } = req.query;

    let query = `
      SELECT
        lc.ip_address,
        lc.country,
        lc.city,
        lc.device_type,
        lc.browser,
        lc.clicked_at,
        tl.original_url,
        a.title as announcement_title
      FROM link_clicks lc
      JOIN tracked_links tl ON lc.link_id = tl.id
      LEFT JOIN announcements a ON tl.announcement_id = a.id
      WHERE 1=1
    `;

    const params = [];
    let paramIndex = 1;

    if (announcement_id) {
      query += ` AND tl.announcement_id = $${paramIndex++}`;
      params.push(announcement_id);
    }
    if (start_date) {
      query += ` AND lc.clicked_at >= $${paramIndex++}`;
      params.push(start_date);
    }
    if (end_date) {
      if (USE_POSTGRES) {
        query += ` AND lc.clicked_at < date($${paramIndex++}) + INTERVAL '1 day'`;
      } else {
        query += ` AND lc.clicked_at < date($${paramIndex++}, '+1 day')`;
      }
      params.push(end_date);
    }

    query += ' ORDER BY lc.clicked_at DESC';

    const result = await pool.query(query, params);

    // Build CSV
    const headers = ['IP Address', 'Country', 'City', 'Device', 'Browser', 'Time', 'URL', 'Announcement'];
    const rows = result.rows.map(r => [
      r.ip_address || '',
      r.country || '',
      r.city || '',
      r.device_type || '',
      r.browser || '',
      r.clicked_at ? new Date(r.clicked_at).toISOString() : '',
      r.original_url || '',
      r.announcement_title || ''
    ]);

    const csv = [headers.join(','), ...rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))].join('\n');

    res.set({
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="clicks_export_${new Date().toISOString().split('T')[0]}.csv"`
    });
    res.send(csv);
  } catch (error) {
    console.error('Error exporting clicks:', error);
    res.status(500).json({ error: 'Failed to export clicks' });
  }
});

module.exports = router;
