const { customAlphabet } = require('nanoid');
const { pool } = require('../models/database');

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

// Record a click
const recordClick = async (shortCode, requestInfo = {}) => {
  const linkResult = await pool.query(
    'SELECT id FROM tracked_links WHERE short_code = $1',
    [shortCode]
  );

  if (linkResult.rows.length === 0) return null;

  const link = linkResult.rows[0];

  await pool.query(
    `INSERT INTO link_clicks (link_id, ip_address, user_agent, referer)
     VALUES ($1, $2, $3, $4)`,
    [
      link.id,
      requestInfo.ip || null,
      requestInfo.userAgent || null,
      requestInfo.referer || null
    ]
  );

  return link;
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
  const result = await pool.query(
    `SELECT
      DATE(lc.clicked_at) as date,
      COUNT(*) as clicks
    FROM link_clicks lc
    JOIN tracked_links tl ON lc.link_id = tl.id
    WHERE tl.announcement_id = $1
      AND lc.clicked_at >= NOW() - INTERVAL '${days} days'
    GROUP BY DATE(lc.clicked_at)
    ORDER BY date`,
    [announcementId]
  );
  return result.rows;
};

module.exports = {
  createTrackedLink,
  processContentLinks,
  recordClick,
  getLinkStats,
  getClickTimeline
};
