const { customAlphabet } = require('nanoid');
const { pool, USE_POSTGRES } = require('../models/database');
const { getTrackingData } = require('./geoip');

// Generate short codes (6 chars, URL-safe)
const generateShortCode = customAlphabet('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 6);

// Create a tracked link
const createTrackedLink = async (originalUrl, announcementId, utmParams = {}) => {
  const shortCode = generateShortCode();
  const baseUrl = process.env.BASE_URL || 'http://localhost:3001';

  await pool.query(
    `INSERT INTO tracked_links (short_code, original_url, announcement_id, utm_source, utm_medium, utm_campaign)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      shortCode,
      originalUrl,
      announcementId,
      utmParams.utm_source || 'telegram',
      utmParams.utm_medium || 'announcement',
      utmParams.utm_campaign || null
    ]
  );

  return {
    short_code: shortCode,
    original_url: originalUrl,
    tracked_url: `${baseUrl}/t/${shortCode}`
  };
};

// Process content and create tracked links for all URLs
const processContentLinks = async (content, announcementId, campaignName = null) => {
  const urlRegex = /(https?:\/\/[^\s<>"{}|\\^`\[\]]+)/g;
  const urls = content.match(urlRegex) || [];

  const trackedLinks = [];

  for (const url of urls) {
    // Don't track internal links
    const baseUrl = process.env.BASE_URL || 'http://localhost:3001';
    if (url.startsWith(baseUrl)) continue;

    const tracked = await createTrackedLink(url, announcementId, {
      utm_campaign: campaignName
    });
    trackedLinks.push(tracked);
  }

  return trackedLinks;
};

// Record a click with geolocation and device data
// Also records a view since link click = user saw the message
const recordClick = async (shortCode, requestInfo = {}) => {
  try {
    // Get link with announcement info
    const linkResult = await pool.query(
      `SELECT tl.id, tl.announcement_id,
              (SELECT at.channel_id FROM announcement_targets at WHERE at.announcement_id = tl.announcement_id LIMIT 1) as channel_id
       FROM tracked_links tl WHERE tl.short_code = $1`,
      [shortCode]
    );

    if (linkResult.rows.length === 0) {
      console.log(`[recordClick] Link not found for code: ${shortCode}`);
      return null;
    }

    const link = linkResult.rows[0];

    // Get geolocation and device data (with timeout protection)
    let trackingData = { country: 'Unknown', city: 'Unknown', deviceType: 'unknown', browser: 'unknown' };
    try {
      trackingData = await getTrackingData(requestInfo.ip, requestInfo.userAgent);
    } catch (geoError) {
      console.error(`[recordClick] Geolocation error (using defaults):`, geoError.message);
    }

    // Record the click
    await pool.query(
      `INSERT INTO link_clicks (link_id, ip_address, user_agent, referer, country, city, device_type, browser)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        link.id,
        requestInfo.ip || null,
        requestInfo.userAgent || null,
        requestInfo.referer || null,
        trackingData.country,
        trackingData.city,
        trackingData.deviceType,
        trackingData.browser
      ]
    );

    // Also record as a view (link click = user definitely saw the message)
    if (link.announcement_id) {
      const viewerHash = Buffer.from(`${requestInfo.ip || 'unknown'}-${requestInfo.userAgent || 'unknown'}`).toString('base64').substring(0, 32);
      const channelId = link.channel_id || null;

      // Check if view already exists
      const existingView = await pool.query(
        `SELECT id FROM pixel_views WHERE announcement_id = $1 AND viewer_hash = $2`,
        [link.announcement_id, viewerHash]
      );

      if (existingView.rows.length === 0) {
        await pool.query(
          `INSERT INTO pixel_views (announcement_id, channel_id, viewer_hash, ip_address, user_agent, country, city, device_type, browser)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            link.announcement_id,
            channelId,
            viewerHash,
            requestInfo.ip || null,
            requestInfo.userAgent || null,
            trackingData.country,
            trackingData.city,
            trackingData.deviceType,
            trackingData.browser
          ]
        );

        // Update view count in announcement_targets
        if (channelId) {
          await pool.query(
            `UPDATE announcement_targets SET views = views + 1 WHERE announcement_id = $1 AND channel_id = $2`,
            [link.announcement_id, channelId]
          );
        }

        console.log(`[recordClick] View recorded for announcement: ${link.announcement_id}`);
      }
    }

    console.log(`[recordClick] Click recorded for link_id: ${link.id}`);
    return link;
  } catch (error) {
    console.error(`[recordClick] Error recording click:`, error.message);
    throw error;
  }
};

// Get link statistics
const getLinkStats = async (announcementId) => {
  const result = await pool.query(
    `SELECT
      tl.id,
      tl.short_code,
      tl.original_url,
      COUNT(lc.id) as click_count,
      COUNT(DISTINCT lc.ip_address) as unique_clicks
    FROM tracked_links tl
    LEFT JOIN link_clicks lc ON tl.id = lc.link_id
    WHERE tl.announcement_id = $1
    GROUP BY tl.id`,
    [announcementId]
  );
  return result.rows;
};

// Get click timeline for an announcement
const getClickTimeline = async (announcementId, days = 7) => {
  let query;
  if (USE_POSTGRES) {
    query = `SELECT
      DATE(lc.clicked_at) as date,
      COUNT(*) as clicks
    FROM link_clicks lc
    JOIN tracked_links tl ON lc.link_id = tl.id
    WHERE tl.announcement_id = $1
      AND lc.clicked_at >= CURRENT_TIMESTAMP - INTERVAL '${days} days'
    GROUP BY DATE(lc.clicked_at)
    ORDER BY date`;
  } else {
    // SQLite syntax
    query = `SELECT
      DATE(lc.clicked_at) as date,
      COUNT(*) as clicks
    FROM link_clicks lc
    JOIN tracked_links tl ON lc.link_id = tl.id
    WHERE tl.announcement_id = $1
      AND lc.clicked_at >= datetime('now', '-${days} days')
    GROUP BY DATE(lc.clicked_at)
    ORDER BY date`;
  }

  const result = await pool.query(query, [announcementId]);
  return result.rows;
};

module.exports = {
  createTrackedLink,
  processContentLinks,
  recordClick,
  getLinkStats,
  getClickTimeline
};
