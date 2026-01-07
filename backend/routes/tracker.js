const express = require('express');
const { pool } = require('../models/database');
const { recordClick } = require('../utils/linkTracker');

const router = express.Router();

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
