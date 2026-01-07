const { customAlphabet } = require('nanoid');
const db = require('../models/database');

// Generate short codes (6 chars, URL-safe)
const generateShortCode = customAlphabet('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 6);

// Create a tracked link
const createTrackedLink = (originalUrl, announcementId, utmParams = {}) => {
  const shortCode = generateShortCode();
  const baseUrl = process.env.BASE_URL || 'http://localhost:3001';
  
  db.prepare(`
    INSERT INTO tracked_links (short_code, original_url, announcement_id, utm_source, utm_medium, utm_campaign)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    shortCode,
    originalUrl,
    announcementId,
    utmParams.utm_source || 'telegram',
    utmParams.utm_medium || 'announcement',
    utmParams.utm_campaign || null
  );

  return {
    short_code: shortCode,
    original_url: originalUrl,
    tracked_url: `${baseUrl}/t/${shortCode}`
  };
};

// Process content and create tracked links for all URLs
const processContentLinks = (content, announcementId, campaignName = null) => {
  const urlRegex = /(https?:\/\/[^\s<>"{}|\\^`\[\]]+)/g;
  const urls = content.match(urlRegex) || [];
  
  const trackedLinks = [];
  
  urls.forEach(url => {
    // Don't track internal links
    const baseUrl = process.env.BASE_URL || 'http://localhost:3001';
    if (url.startsWith(baseUrl)) return;
    
    const tracked = createTrackedLink(url, announcementId, {
      utm_campaign: campaignName
    });
    trackedLinks.push(tracked);
  });

  return trackedLinks;
};

// Record a click
const recordClick = (shortCode, requestInfo = {}) => {
  const link = db.prepare('SELECT id FROM tracked_links WHERE short_code = ?').get(shortCode);
  
  if (!link) return null;

  db.prepare(`
    INSERT INTO link_clicks (link_id, ip_address, user_agent, referer)
    VALUES (?, ?, ?, ?)
  `).run(
    link.id,
    requestInfo.ip || null,
    requestInfo.userAgent || null,
    requestInfo.referer || null
  );

  return link;
};

// Get link statistics
const getLinkStats = (announcementId) => {
  return db.prepare(`
    SELECT 
      tl.id,
      tl.short_code,
      tl.original_url,
      COUNT(lc.id) as click_count,
      COUNT(DISTINCT lc.ip_address) as unique_clicks
    FROM tracked_links tl
    LEFT JOIN link_clicks lc ON tl.id = lc.link_id
    WHERE tl.announcement_id = ?
    GROUP BY tl.id
  `).all(announcementId);
};

// Get click timeline for an announcement
const getClickTimeline = (announcementId, days = 7) => {
  return db.prepare(`
    SELECT 
      DATE(lc.clicked_at) as date,
      COUNT(*) as clicks
    FROM link_clicks lc
    JOIN tracked_links tl ON lc.link_id = tl.id
    WHERE tl.announcement_id = ?
      AND lc.clicked_at >= datetime('now', '-${days} days')
    GROUP BY DATE(lc.clicked_at)
    ORDER BY date
  `).all(announcementId);
};

module.exports = {
  createTrackedLink,
  processContentLinks,
  recordClick,
  getLinkStats,
  getClickTimeline
};
