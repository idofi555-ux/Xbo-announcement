const express = require('express');
const { pool } = require('../models/database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// Get user's notifications
router.get('/', authenticate, async (req, res) => {
  try {
    const { limit = 20, unread_only = false } = req.query;

    let query = `
      SELECT id, type, title, message, link, is_read, created_at
      FROM notifications
      WHERE user_id = $1
    `;
    const params = [req.user.id];

    if (unread_only === 'true') {
      query += ' AND is_read = 0';
    }

    query += ' ORDER BY created_at DESC LIMIT $2';
    params.push(parseInt(limit));

    const result = await pool.query(query, params);

    res.json({
      notifications: result.rows,
      total: result.rows.length
    });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

// Get unread count
router.get('/count', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT COUNT(*) as count FROM notifications WHERE user_id = $1 AND is_read = 0',
      [req.user.id]
    );

    res.json({ count: parseInt(result.rows[0].count) || 0 });
  } catch (error) {
    console.error('Error fetching notification count:', error);
    res.status(500).json({ error: 'Failed to fetch notification count' });
  }
});

// Mark notification as read
router.put('/:id/read', authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    await pool.query(
      'UPDATE notifications SET is_read = 1 WHERE id = $1 AND user_id = $2',
      [id, req.user.id]
    );

    res.json({ message: 'Notification marked as read' });
  } catch (error) {
    console.error('Error marking notification as read:', error);
    res.status(500).json({ error: 'Failed to mark notification as read' });
  }
});

// Mark all notifications as read
router.put('/read-all', authenticate, async (req, res) => {
  try {
    await pool.query(
      'UPDATE notifications SET is_read = 1 WHERE user_id = $1',
      [req.user.id]
    );

    res.json({ message: 'All notifications marked as read' });
  } catch (error) {
    console.error('Error marking all notifications as read:', error);
    res.status(500).json({ error: 'Failed to mark all notifications as read' });
  }
});

// Delete a notification
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    await pool.query(
      'DELETE FROM notifications WHERE id = $1 AND user_id = $2',
      [id, req.user.id]
    );

    res.json({ message: 'Notification deleted' });
  } catch (error) {
    console.error('Error deleting notification:', error);
    res.status(500).json({ error: 'Failed to delete notification' });
  }
});

// Clear all notifications
router.delete('/', authenticate, async (req, res) => {
  try {
    await pool.query(
      'DELETE FROM notifications WHERE user_id = $1',
      [req.user.id]
    );

    res.json({ message: 'All notifications cleared' });
  } catch (error) {
    console.error('Error clearing notifications:', error);
    res.status(500).json({ error: 'Failed to clear notifications' });
  }
});

// Update notification settings for user
router.put('/settings', authenticate, async (req, res) => {
  try {
    const { notify_email } = req.body;

    await pool.query(
      'UPDATE users SET notify_email = $1 WHERE id = $2',
      [notify_email ? 1 : 0, req.user.id]
    );

    res.json({ message: 'Notification settings updated' });
  } catch (error) {
    console.error('Error updating notification settings:', error);
    res.status(500).json({ error: 'Failed to update notification settings' });
  }
});

// Get notification settings
router.get('/settings', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT notify_email FROM users WHERE id = $1',
      [req.user.id]
    );

    res.json({
      notify_email: result.rows[0]?.notify_email === 1
    });
  } catch (error) {
    console.error('Error fetching notification settings:', error);
    res.status(500).json({ error: 'Failed to fetch notification settings' });
  }
});

// Helper function to create notification (exported for use in other routes)
const createNotification = async (userId, type, title, message, link = null) => {
  try {
    await pool.query(
      'INSERT INTO notifications (user_id, type, title, message, link) VALUES ($1, $2, $3, $4, $5)',
      [userId, type, title, message, link]
    );
    return true;
  } catch (error) {
    console.error('Error creating notification:', error);
    return false;
  }
};

// Helper function to notify all users with a specific role
const notifyUsersByRole = async (role, type, title, message, link = null) => {
  try {
    const users = await pool.query('SELECT id FROM users WHERE role = $1', [role]);
    for (const user of users.rows) {
      await createNotification(user.id, type, title, message, link);
    }
    return true;
  } catch (error) {
    console.error('Error notifying users by role:', error);
    return false;
  }
};

// Helper to check if email notifications should be sent
const shouldSendEmail = async (userId) => {
  try {
    const result = await pool.query(
      'SELECT notify_email FROM users WHERE id = $1',
      [userId]
    );
    return result.rows[0]?.notify_email === 1;
  } catch (error) {
    console.error('Error checking email notification setting:', error);
    return false;
  }
};

module.exports = router;
module.exports.createNotification = createNotification;
module.exports.notifyUsersByRole = notifyUsersByRole;
module.exports.shouldSendEmail = shouldSendEmail;
