const express = require('express');
const db = require('../models/database');
const { recordClick } = require('../utils/linkTracker');

const router = express.Router();

// Redirect tracked links
router.get('/:code', (req, res) => {
  try {
    const { code } = req.params;

    const link = db.prepare('SELECT * FROM tracked_links WHERE short_code = ?').get(code);

    if (!link) {
      return res.status(404).send('Link not found');
    }

    // Record the click
    recordClick(code, {
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
