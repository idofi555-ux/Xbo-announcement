const express = require('express');
const { pool } = require('../models/database');
const { recordClick } = require('../utils/linkTracker');

const router = express.Router();

// 1x1 transparent GIF (base64 decoded)
const TRANSPARENT_GIF = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
);

// Pixel tracking endpoint for view counting
router.get('/pixel/:announcementId/:channelId', async (req, res) => {
  try {
    const { announcementId, channelId } = req.params;
    const ip = req.ip || req.headers['x-forwarded-for'] || req.connection?.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';

    // Create a unique identifier for this viewer
    const viewerHash = Buffer.from(`${ip}-${userAgent}`).toString('base64').substring(0, 32);

    // Check if this viewer already viewed this announcement on this channel
    const existingView = await pool.query(
      `SELECT id FROM pixel_views
       WHERE announcement_id = $1 AND channel_id = $2 AND viewer_hash = $3`,
      [announcementId, channelId, viewerHash]
    );

    if (existingView.rows.length === 0) {
      // Record new unique view
      await pool.query(
        `INSERT INTO pixel_views (announcement_id, channel_id, viewer_hash, ip_address, user_agent)
         VALUES ($1, $2, $3, $4, $5)`,
        [announcementId, channelId, viewerHash, ip, userAgent]
      );

      // Update view count in announcement_targets
      await pool.query(
        `UPDATE announcement_targets
         SET views = views + 1
         WHERE announcement_id = $1 AND channel_id = $2`,
        [announcementId, channelId]
      );

      console.log(`Pixel view recorded: announcement=${announcementId}, channel=${channelId}`);
    }

    // Return 1x1 transparent GIF
    res.set({
      'Content-Type': 'image/gif',
      'Content-Length': TRANSPARENT_GIF.length,
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
    res.send(TRANSPARENT_GIF);
  } catch (error) {
    console.error('Pixel tracking error:', error.message);
    // Still return the GIF even on error
    res.set('Content-Type', 'image/gif');
    res.send(TRANSPARENT_GIF);
  }
});

// Redirect tracked links
router.get('/:code', async (req, res) => {
  try {
    const { code } = req.params;

    const linkResult = await pool.query('SELECT * FROM tracked_links WHERE short_code = $1', [code]);

    if (linkResult.rows.length === 0) {
      return res.status(404).send('Link not found');
    }

    const link = linkResult.rows[0];

    // Record the click
    await recordClick(code, {
      ip: req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress,
      userAgent: req.headers['user-agent'],
      referer: req.headers['referer']
    });

    // Build redirect URL with UTM params if not already present
    let redirectUrl = link.original_url;

    try {
      const url = new URL(redirectUrl);

      // Add UTM params if they don't exist
      if (link.utm_source && !url.searchParams.has('utm_source')) {
        url.searchParams.set('utm_source', link.utm_source);
      }
      if (link.utm_medium && !url.searchParams.has('utm_medium')) {
        url.searchParams.set('utm_medium', link.utm_medium);
      }
      if (link.utm_campaign && !url.searchParams.has('utm_campaign')) {
        url.searchParams.set('utm_campaign', link.utm_campaign);
      }

      redirectUrl = url.toString();
    } catch (e) {
      // If URL parsing fails, just use original
    }

    res.redirect(302, redirectUrl);
  } catch (error) {
    console.error('Redirect error:', error);
    res.status(500).send('Error processing link');
  }
});

module.exports = router;
