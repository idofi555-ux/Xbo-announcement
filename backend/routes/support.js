const express = require('express');
const router = express.Router();
const { pool, USE_POSTGRES } = require('../models/database');
const { authenticate: auth } = require('../middleware/auth');
const { sendReplyMessage } = require('../utils/telegram');
const { logSupportError, logSupportEvent, logConversationEvent, logMessageEvent } = require('../utils/logger');

// Get all conversations with filters
router.get('/conversations', auth, async (req, res) => {
  try {
    const { status, assigned, search } = req.query;
    const userId = req.user.id;

    let query = `
      SELECT
        c.id,
        c.status,
        c.created_at,
        c.updated_at,
        ch.id as channel_id,
        ch.title as channel_title,
        ch.telegram_id as channel_telegram_id,
        cp.id as customer_id,
        cp.telegram_user_id,
        cp.telegram_username,
        cp.display_name as customer_name,
        cp.tags as customer_tags,
        u.name as assigned_name,
        (SELECT content FROM messages WHERE conversation_id = c.id ORDER BY timestamp DESC LIMIT 1) as last_message,
        (SELECT timestamp FROM messages WHERE conversation_id = c.id ORDER BY timestamp DESC LIMIT 1) as last_message_time,
        (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id) as message_count,
        cr.last_read_at,
        (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id AND direction = 'in' AND timestamp > COALESCE(cr.last_read_at, '1970-01-01')) as unread_count
      FROM conversations c
      JOIN channels ch ON c.channel_id = ch.id
      JOIN customer_profiles cp ON c.customer_id = cp.id
      LEFT JOIN users u ON c.assigned_to = u.id
      LEFT JOIN conversation_reads cr ON c.id = cr.conversation_id AND cr.user_id = $1
      WHERE 1=1
    `;

    const params = [userId];
    let paramIndex = 2;

    if (status && status !== 'all') {
      if (status === 'unassigned') {
        query += ` AND c.assigned_to IS NULL AND c.status != 'closed'`;
      } else {
        query += ` AND c.status = $${paramIndex}`;
        params.push(status);
        paramIndex++;
      }
    }

    if (assigned) {
      query += ` AND c.assigned_to = $${paramIndex}`;
      params.push(assigned);
      paramIndex++;
    }

    if (search) {
      if (USE_POSTGRES) {
        query += ` AND (cp.display_name ILIKE $${paramIndex} OR cp.telegram_username ILIKE $${paramIndex} OR EXISTS (SELECT 1 FROM messages m WHERE m.conversation_id = c.id AND m.content ILIKE $${paramIndex}))`;
      } else {
        query += ` AND (LOWER(cp.display_name) LIKE LOWER($${paramIndex}) OR LOWER(cp.telegram_username) LIKE LOWER($${paramIndex}) OR EXISTS (SELECT 1 FROM messages m WHERE m.conversation_id = c.id AND LOWER(m.content) LIKE LOWER($${paramIndex})))`;
      }
      params.push(`%${search}%`);
      paramIndex++;
    }

    // Sort by unread first, then by last message time
    query += ` ORDER BY unread_count DESC, c.updated_at DESC`;

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching conversations:', error);
    logSupportError(`Failed to fetch conversations: ${error.message}`, {
      error: error.message,
      stack: error.stack?.substring(0, 500),
      user_id: req.user?.id
    });
    res.status(500).json({ error: 'Failed to fetch conversations', details: error.message });
  }
});

// Get inbox stats (open/unassigned/unread count)
router.get('/inbox/stats', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    let query;
    if (USE_POSTGRES) {
      query = `
        SELECT
          COUNT(*) FILTER (WHERE status = 'open') as open_count,
          COUNT(*) FILTER (WHERE status = 'pending') as pending_count,
          COUNT(*) FILTER (WHERE assigned_to IS NULL AND status != 'closed') as unassigned_count,
          COUNT(*) FILTER (WHERE status != 'closed' AND (
            SELECT COUNT(*) FROM messages m
            WHERE m.conversation_id = c.id
            AND m.direction = 'in'
            AND m.timestamp > COALESCE(
              (SELECT last_read_at FROM conversation_reads WHERE conversation_id = c.id AND user_id = $1),
              '1970-01-01'
            )
          ) > 0) as unread_conversations_count,
          (SELECT COUNT(*) FROM messages m
            JOIN conversations c2 ON m.conversation_id = c2.id
            WHERE c2.status != 'closed'
            AND m.direction = 'in'
            AND m.timestamp > COALESCE(
              (SELECT last_read_at FROM conversation_reads WHERE conversation_id = c2.id AND user_id = $1),
              '1970-01-01'
            )
          ) as total_unread_messages
        FROM conversations c
      `;
    } else {
      query = `
        SELECT
          SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) as open_count,
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_count,
          SUM(CASE WHEN assigned_to IS NULL AND status != 'closed' THEN 1 ELSE 0 END) as unassigned_count,
          SUM(CASE WHEN status != 'closed' AND (
            SELECT COUNT(*) FROM messages m
            WHERE m.conversation_id = c.id
            AND m.direction = 'in'
            AND m.timestamp > COALESCE(
              (SELECT last_read_at FROM conversation_reads WHERE conversation_id = c.id AND user_id = $1),
              '1970-01-01'
            )
          ) > 0 THEN 1 ELSE 0 END) as unread_conversations_count,
          (SELECT COUNT(*) FROM messages m
            JOIN conversations c2 ON m.conversation_id = c2.id
            WHERE c2.status != 'closed'
            AND m.direction = 'in'
            AND m.timestamp > COALESCE(
              (SELECT last_read_at FROM conversation_reads WHERE conversation_id = c2.id AND user_id = $1),
              '1970-01-01'
            )
          ) as total_unread_messages
        FROM conversations c
      `;
    }
    const result = await pool.query(query, [userId]);
    const stats = result.rows[0] || {};

    // Ensure integer values (SQLite SUM can return strings or null)
    res.json({
      open_count: parseInt(stats.open_count) || 0,
      pending_count: parseInt(stats.pending_count) || 0,
      unassigned_count: parseInt(stats.unassigned_count) || 0,
      unread_conversations_count: parseInt(stats.unread_conversations_count) || 0,
      total_unread_messages: parseInt(stats.total_unread_messages) || 0
    });
  } catch (error) {
    console.error('Error fetching inbox stats:', error);
    logSupportError(`Failed to fetch inbox stats: ${error.message}`, {
      error: error.message,
      stack: error.stack?.substring(0, 500)
    });
    res.status(500).json({ error: 'Failed to fetch inbox stats', details: error.message });
  }
});

// Get single conversation with messages
router.get('/conversations/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Get conversation details
    const convResult = await pool.query(`
      SELECT
        c.*,
        ch.title as channel_title,
        ch.telegram_id as channel_telegram_id,
        cp.telegram_user_id,
        cp.telegram_username,
        cp.display_name as customer_name,
        cp.tags as customer_tags,
        cp.notes as customer_notes,
        cp.first_seen,
        cp.last_seen,
        u.name as assigned_name
      FROM conversations c
      JOIN channels ch ON c.channel_id = ch.id
      JOIN customer_profiles cp ON c.customer_id = cp.id
      LEFT JOIN users u ON c.assigned_to = u.id
      WHERE c.id = $1
    `, [id]);

    if (convResult.rows.length === 0) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    // Get messages
    const messagesResult = await pool.query(`
      SELECT * FROM messages
      WHERE conversation_id = $1
      ORDER BY timestamp ASC
    `, [id]);

    // Mark conversation as read (upsert)
    await pool.query(`
      INSERT INTO conversation_reads (conversation_id, user_id, last_read_at)
      VALUES ($1, $2, CURRENT_TIMESTAMP)
      ON CONFLICT (conversation_id, user_id)
      DO UPDATE SET last_read_at = CURRENT_TIMESTAMP
    `, [id, userId]);

    logConversationEvent('viewed', id, userId);

    res.json({
      ...convResult.rows[0],
      messages: messagesResult.rows
    });
  } catch (error) {
    console.error('Error fetching conversation:', error);
    logSupportError(`Failed to fetch conversation ${req.params.id}: ${error.message}`, {
      conversation_id: req.params.id,
      error: error.message
    });
    res.status(500).json({ error: 'Failed to fetch conversation' });
  }
});

// Mark conversation as read
router.post('/conversations/:id/read', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    await pool.query(`
      INSERT INTO conversation_reads (conversation_id, user_id, last_read_at)
      VALUES ($1, $2, CURRENT_TIMESTAMP)
      ON CONFLICT (conversation_id, user_id)
      DO UPDATE SET last_read_at = CURRENT_TIMESTAMP
    `, [id, userId]);

    res.json({ success: true });
  } catch (error) {
    console.error('Error marking conversation as read:', error);
    logSupportError(`Failed to mark conversation as read: ${error.message}`, {
      conversation_id: req.params.id
    });
    res.status(500).json({ error: 'Failed to mark conversation as read' });
  }
});

// Send reply to conversation
router.post('/conversations/:id/reply', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { content } = req.body;

    // Get conversation and channel info
    const convResult = await pool.query(`
      SELECT c.*, ch.telegram_id as channel_telegram_id
      FROM conversations c
      JOIN channels ch ON c.channel_id = ch.id
      WHERE c.id = $1
    `, [id]);

    if (convResult.rows.length === 0) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    const conversation = convResult.rows[0];

    // Send message via Telegram
    const telegramMessage = await sendReplyMessage(conversation.channel_telegram_id, content);

    // Save message to database
    await pool.query(`
      INSERT INTO messages (conversation_id, telegram_message_id, direction, content, sender_name)
      VALUES ($1, $2, 'out', $3, $4)
    `, [id, telegramMessage.message_id.toString(), content, req.user.name]);

    // Update conversation timestamp
    await pool.query(`
      UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = $1
    `, [id]);

    logMessageEvent('sent', id, req.user.id, { content_length: content.length });

    res.json({ success: true, message_id: telegramMessage.message_id });
  } catch (error) {
    console.error('Error sending reply:', error);
    logSupportError(`Failed to send reply: ${error.message}`, {
      conversation_id: req.params.id,
      error: error.message
    });
    res.status(500).json({ error: 'Failed to send reply' });
  }
});

// Update conversation status
router.patch('/conversations/:id/status', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    await pool.query(`
      UPDATE conversations SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2
    `, [status, id]);

    logConversationEvent('status_changed', id, req.user.id, { new_status: status });

    res.json({ success: true });
  } catch (error) {
    console.error('Error updating conversation status:', error);
    logSupportError(`Failed to update conversation status: ${error.message}`, {
      conversation_id: req.params.id
    });
    res.status(500).json({ error: 'Failed to update status' });
  }
});

// Assign conversation
router.patch('/conversations/:id/assign', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { user_id } = req.body;

    await pool.query(`
      UPDATE conversations SET assigned_to = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2
    `, [user_id || null, id]);

    logConversationEvent('assigned', id, req.user.id, { assigned_to: user_id });

    res.json({ success: true });
  } catch (error) {
    console.error('Error assigning conversation:', error);
    logSupportError(`Failed to assign conversation: ${error.message}`, {
      conversation_id: req.params.id
    });
    res.status(500).json({ error: 'Failed to assign conversation' });
  }
});

// Get all customers
router.get('/customers', auth, async (req, res) => {
  try {
    const { search } = req.query;

    let query = `
      SELECT
        cp.*,
        (SELECT COUNT(*) FROM messages m JOIN conversations c ON m.conversation_id = c.id WHERE c.customer_id = cp.id) as total_messages,
        (SELECT COUNT(*) FROM conversations WHERE customer_id = cp.id) as total_conversations
      FROM customer_profiles cp
      WHERE 1=1
    `;

    const params = [];
    if (search) {
      if (USE_POSTGRES) {
        query += ` AND (cp.display_name ILIKE $1 OR cp.telegram_username ILIKE $1)`;
      } else {
        query += ` AND (LOWER(cp.display_name) LIKE LOWER($1) OR LOWER(cp.telegram_username) LIKE LOWER($1))`;
      }
      params.push(`%${search}%`);
    }

    query += ` ORDER BY cp.last_seen DESC`;

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching customers:', error);
    logSupportError(`Failed to fetch customers: ${error.message}`, { error: error.message });
    res.status(500).json({ error: 'Failed to fetch customers' });
  }
});

// Get single customer with history
router.get('/customers/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;

    const customerResult = await pool.query(`
      SELECT * FROM customer_profiles WHERE id = $1
    `, [id]);

    if (customerResult.rows.length === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    // Get conversation history
    const conversationsResult = await pool.query(`
      SELECT
        c.*,
        ch.title as channel_title,
        (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id) as message_count
      FROM conversations c
      JOIN channels ch ON c.channel_id = ch.id
      WHERE c.customer_id = $1
      ORDER BY c.created_at DESC
    `, [id]);

    res.json({
      ...customerResult.rows[0],
      conversations: conversationsResult.rows
    });
  } catch (error) {
    console.error('Error fetching customer:', error);
    logSupportError(`Failed to fetch customer: ${error.message}`, { customer_id: req.params.id });
    res.status(500).json({ error: 'Failed to fetch customer' });
  }
});

// Update customer profile
router.patch('/customers/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { tags, notes, display_name } = req.body;

    const updates = [];
    const params = [];
    let paramIndex = 1;

    if (tags !== undefined) {
      updates.push(`tags = $${paramIndex}`);
      params.push(JSON.stringify(tags));
      paramIndex++;
    }

    if (notes !== undefined) {
      updates.push(`notes = $${paramIndex}`);
      params.push(notes);
      paramIndex++;
    }

    if (display_name !== undefined) {
      updates.push(`display_name = $${paramIndex}`);
      params.push(display_name);
      paramIndex++;
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No updates provided' });
    }

    params.push(id);
    await pool.query(`
      UPDATE customer_profiles SET ${updates.join(', ')} WHERE id = $${paramIndex}
    `, params);

    logSupportEvent(`Customer profile updated`, { customer_id: id, updated_fields: updates });

    res.json({ success: true });
  } catch (error) {
    console.error('Error updating customer:', error);
    logSupportError(`Failed to update customer: ${error.message}`, { customer_id: req.params.id });
    res.status(500).json({ error: 'Failed to update customer' });
  }
});

// Quick Replies CRUD
router.get('/quick-replies', auth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT qr.*, u.name as created_by_name
      FROM quick_replies qr
      LEFT JOIN users u ON qr.created_by = u.id
      ORDER BY qr.shortcut ASC
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching quick replies:', error);
    logSupportError(`Failed to fetch quick replies: ${error.message}`, { error: error.message });
    res.status(500).json({ error: 'Failed to fetch quick replies' });
  }
});

router.post('/quick-replies', auth, async (req, res) => {
  try {
    const { shortcut, title, content } = req.body;

    const insertResult = await pool.query(`
      INSERT INTO quick_replies (shortcut, title, content, created_by)
      VALUES ($1, $2, $3, $4)
    `, [shortcut, title, content, req.user.id]);

    // Fetch the created record (SQLite doesn't support RETURNING *)
    const id = insertResult.rows[0]?.id || insertResult.lastInsertRowid;
    const result = await pool.query(`
      SELECT qr.*, u.name as created_by_name
      FROM quick_replies qr
      LEFT JOIN users u ON qr.created_by = u.id
      WHERE qr.id = $1
    `, [id]);

    logSupportEvent(`Quick reply created: ${shortcut}`, { user_id: req.user.id });

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error creating quick reply:', error);
    if (error.code === '23505' || error.message?.includes('UNIQUE constraint')) {
      return res.status(400).json({ error: 'Shortcut already exists' });
    }
    logSupportError(`Failed to create quick reply: ${error.message}`, { error: error.message });
    res.status(500).json({ error: 'Failed to create quick reply' });
  }
});

router.put('/quick-replies/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { shortcut, title, content } = req.body;

    const updateResult = await pool.query(`
      UPDATE quick_replies SET shortcut = $1, title = $2, content = $3
      WHERE id = $4
    `, [shortcut, title, content, id]);

    if (updateResult.rowCount === 0) {
      return res.status(404).json({ error: 'Quick reply not found' });
    }

    // Fetch the updated record (SQLite doesn't support RETURNING *)
    const result = await pool.query(`
      SELECT qr.*, u.name as created_by_name
      FROM quick_replies qr
      LEFT JOIN users u ON qr.created_by = u.id
      WHERE qr.id = $1
    `, [id]);

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating quick reply:', error);
    if (error.code === '23505' || error.message?.includes('UNIQUE constraint')) {
      return res.status(400).json({ error: 'Shortcut already exists' });
    }
    logSupportError(`Failed to update quick reply: ${error.message}`, { quick_reply_id: req.params.id });
    res.status(500).json({ error: 'Failed to update quick reply' });
  }
});

router.delete('/quick-replies/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(`
      DELETE FROM quick_replies WHERE id = $1
    `, [id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Quick reply not found' });
    }

    logSupportEvent(`Quick reply deleted`, { quick_reply_id: id, user_id: req.user.id });

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting quick reply:', error);
    logSupportError(`Failed to delete quick reply: ${error.message}`, { quick_reply_id: req.params.id });
    res.status(500).json({ error: 'Failed to delete quick reply' });
  }
});

module.exports = router;
