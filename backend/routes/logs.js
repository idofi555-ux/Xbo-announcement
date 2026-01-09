const express = require('express');
const { pool } = require('../models/database');
const { authenticate, adminOnly } = require('../middleware/auth');

const router = express.Router();

// Get logs with filtering and pagination
router.get('/', authenticate, adminOnly, async (req, res) => {
  try {
    const {
      type,
      category,
      search,
      start_date,
      end_date,
      limit = 50,
      offset = 0
    } = req.query;

    let query = `
      SELECT
        l.*,
        a.title as announcement_title,
        u.name as user_name,
        c.title as channel_title
      FROM system_logs l
      LEFT JOIN announcements a ON l.announcement_id = a.id
      LEFT JOIN users u ON l.user_id = u.id
      LEFT JOIN channels c ON l.channel_id = c.id
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;

    if (type) {
      query += ` AND l.type = $${paramIndex++}`;
      params.push(type);
    }

    if (category) {
      query += ` AND l.category = $${paramIndex++}`;
      params.push(category);
    }

    if (search) {
      query += ` AND l.message ILIKE $${paramIndex++}`;
      params.push(`%${search}%`);
    }

    if (start_date) {
      query += ` AND l.timestamp >= $${paramIndex++}`;
      params.push(start_date);
    }

    if (end_date) {
      query += ` AND l.timestamp <= $${paramIndex++}`;
      params.push(end_date);
    }

    query += ` ORDER BY l.timestamp DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    params.push(parseInt(limit), parseInt(offset));

    const result = await pool.query(query, params);

    // Get total count
    let countQuery = 'SELECT COUNT(*) as count FROM system_logs l WHERE 1=1';
    const countParams = [];
    let countIndex = 1;

    if (type) {
      countQuery += ` AND l.type = $${countIndex++}`;
      countParams.push(type);
    }

    if (category) {
      countQuery += ` AND l.category = $${countIndex++}`;
      countParams.push(category);
    }

    if (search) {
      countQuery += ` AND l.message ILIKE $${countIndex++}`;
      countParams.push(`%${search}%`);
    }

    if (start_date) {
      countQuery += ` AND l.timestamp >= $${countIndex++}`;
      countParams.push(start_date);
    }

    if (end_date) {
      countQuery += ` AND l.timestamp <= $${countIndex++}`;
      countParams.push(end_date);
    }

    const countResult = await pool.query(countQuery, countParams);

    // Get stats
    const statsResult = await pool.query(`
      SELECT
        type,
        COUNT(*) as count
      FROM system_logs
      WHERE timestamp >= NOW() - INTERVAL '24 hours'
      GROUP BY type
    `);

    const stats = {
      error: 0,
      warning: 0,
      info: 0,
      success: 0
    };

    statsResult.rows.forEach(row => {
      stats[row.type] = parseInt(row.count);
    });

    res.json({
      logs: result.rows,
      total: parseInt(countResult.rows[0].count),
      stats
    });
  } catch (error) {
    console.error('Error fetching logs:', error);
    res.status(500).json({ error: 'Failed to fetch logs' });
  }
});

// Get single log with full details
router.get('/:id', authenticate, adminOnly, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(`
      SELECT
        l.*,
        a.title as announcement_title,
        u.name as user_name,
        c.title as channel_title
      FROM system_logs l
      LEFT JOIN announcements a ON l.announcement_id = a.id
      LEFT JOIN users u ON l.user_id = u.id
      LEFT JOIN channels c ON l.channel_id = c.id
      WHERE l.id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Log not found' });
    }

    res.json({ log: result.rows[0] });
  } catch (error) {
    console.error('Error fetching log:', error);
    res.status(500).json({ error: 'Failed to fetch log' });
  }
});

// Delete old logs (older than specified days)
router.delete('/cleanup', authenticate, adminOnly, async (req, res) => {
  try {
    const { days = 30 } = req.query;

    const result = await pool.query(
      `DELETE FROM system_logs WHERE timestamp < NOW() - INTERVAL '${parseInt(days)} days'`
    );

    res.json({
      message: `Deleted logs older than ${days} days`,
      deleted: result.rowCount || 0
    });
  } catch (error) {
    console.error('Error cleaning up logs:', error);
    res.status(500).json({ error: 'Failed to clean up logs' });
  }
});

module.exports = router;
