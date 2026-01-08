const express = require('express');
const router = express.Router();
const { pool, USE_POSTGRES } = require('../models/database');
const { authenticate: auth } = require('../middleware/auth');

// SLA Configuration (in hours)
const SLA_CONFIG = {
  firstResponse: 1, // 1 hour for first response
  resolution: {
    low: 48,
    medium: 24,
    high: 8,
    urgent: 2
  }
};

// Helper to calculate SLA due times
const calculateSLADueTimes = (priority, createdAt = new Date()) => {
  const created = new Date(createdAt);
  const firstResponseDue = new Date(created.getTime() + SLA_CONFIG.firstResponse * 60 * 60 * 1000);
  const resolutionHours = SLA_CONFIG.resolution[priority] || SLA_CONFIG.resolution.medium;
  const resolutionDue = new Date(created.getTime() + resolutionHours * 60 * 60 * 1000);
  return { firstResponseDue, resolutionDue };
};

// Helper to get SLA status
const getSLAStatus = (dueTime, completedAt = null) => {
  if (completedAt) {
    return new Date(completedAt) <= new Date(dueTime) ? 'met' : 'breached';
  }
  const now = new Date();
  const due = new Date(dueTime);
  const timeLeft = due - now;
  const totalTime = due - new Date(due.getTime() - SLA_CONFIG.firstResponse * 60 * 60 * 1000);

  if (timeLeft < 0) return 'breached';
  if (timeLeft < totalTime * 0.25) return 'at_risk';
  return 'on_track';
};

// Get all tickets with filters
router.get('/', auth, async (req, res) => {
  try {
    const { status, priority, assigned, sort = 'newest' } = req.query;

    let query = `
      SELECT
        t.*,
        c.id as conversation_id,
        ch.title as channel_title,
        cp.display_name as customer_name,
        cp.telegram_username as customer_username,
        u.name as assigned_name,
        (SELECT COUNT(*) FROM messages WHERE conversation_id = t.conversation_id) as message_count
      FROM tickets t
      LEFT JOIN conversations c ON t.conversation_id = c.id
      LEFT JOIN channels ch ON c.channel_id = ch.id
      LEFT JOIN customer_profiles cp ON c.customer_id = cp.id
      LEFT JOIN users u ON t.assigned_to = u.id
      WHERE 1=1
    `;

    const params = [];
    let paramIndex = 1;

    if (status && status !== 'all') {
      query += ` AND t.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (priority && priority !== 'all') {
      query += ` AND t.priority = $${paramIndex}`;
      params.push(priority);
      paramIndex++;
    }

    if (assigned) {
      if (assigned === 'unassigned') {
        query += ` AND t.assigned_to IS NULL`;
      } else {
        query += ` AND t.assigned_to = $${paramIndex}`;
        params.push(assigned);
        paramIndex++;
      }
    }

    // Sort
    switch (sort) {
      case 'oldest':
        query += ` ORDER BY t.created_at ASC`;
        break;
      case 'priority':
        query += ` ORDER BY CASE t.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 WHEN 'low' THEN 4 END, t.created_at DESC`;
        break;
      case 'updated':
        query += ` ORDER BY t.updated_at DESC`;
        break;
      default:
        query += ` ORDER BY t.created_at DESC`;
    }

    const result = await pool.query(query, params);

    // Add SLA status to each ticket
    const tickets = result.rows.map(ticket => ({
      ...ticket,
      sla_first_response_status: ticket.sla_first_response_due
        ? getSLAStatus(ticket.sla_first_response_due, ticket.first_response_at)
        : null,
      sla_resolution_status: ticket.sla_resolution_due
        ? getSLAStatus(ticket.sla_resolution_due, ticket.resolved_at)
        : null
    }));

    res.json(tickets);
  } catch (error) {
    console.error('Error fetching tickets:', error);
    res.status(500).json({ error: 'Failed to fetch tickets' });
  }
});

// Get ticket stats
router.get('/stats', auth, async (req, res) => {
  try {
    // Get counts by status
    const statusQuery = USE_POSTGRES ? `
      SELECT
        COUNT(*) FILTER (WHERE status = 'new') as new_count,
        COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress_count,
        COUNT(*) FILTER (WHERE status = 'waiting_customer') as waiting_count,
        COUNT(*) FILTER (WHERE status = 'resolved') as resolved_count,
        COUNT(*) FILTER (WHERE status = 'closed') as closed_count,
        COUNT(*) FILTER (WHERE status NOT IN ('resolved', 'closed')) as open_count,
        COUNT(*) FILTER (WHERE priority = 'urgent' AND status NOT IN ('resolved', 'closed')) as urgent_count,
        COUNT(*) FILTER (WHERE sla_resolution_due < NOW() AND status NOT IN ('resolved', 'closed')) as breached_count
      FROM tickets
    ` : `
      SELECT
        SUM(CASE WHEN status = 'new' THEN 1 ELSE 0 END) as new_count,
        SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress_count,
        SUM(CASE WHEN status = 'waiting_customer' THEN 1 ELSE 0 END) as waiting_count,
        SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END) as resolved_count,
        SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END) as closed_count,
        SUM(CASE WHEN status NOT IN ('resolved', 'closed') THEN 1 ELSE 0 END) as open_count,
        SUM(CASE WHEN priority = 'urgent' AND status NOT IN ('resolved', 'closed') THEN 1 ELSE 0 END) as urgent_count,
        SUM(CASE WHEN sla_resolution_due < datetime('now') AND status NOT IN ('resolved', 'closed') THEN 1 ELSE 0 END) as breached_count
      FROM tickets
    `;

    const statusResult = await pool.query(statusQuery);

    // Get priority breakdown
    const priorityQuery = USE_POSTGRES ? `
      SELECT priority, COUNT(*) as count
      FROM tickets
      WHERE status NOT IN ('resolved', 'closed')
      GROUP BY priority
    ` : `
      SELECT priority, COUNT(*) as count
      FROM tickets
      WHERE status NOT IN ('resolved', 'closed')
      GROUP BY priority
    `;
    const priorityResult = await pool.query(priorityQuery);

    // Get average response time (in hours)
    const avgResponseQuery = USE_POSTGRES ? `
      SELECT
        AVG(EXTRACT(EPOCH FROM (first_response_at - created_at)) / 3600) as avg_first_response_hours,
        AVG(EXTRACT(EPOCH FROM (resolved_at - created_at)) / 3600) as avg_resolution_hours
      FROM tickets
      WHERE first_response_at IS NOT NULL
    ` : `
      SELECT
        AVG((julianday(first_response_at) - julianday(created_at)) * 24) as avg_first_response_hours,
        AVG((julianday(resolved_at) - julianday(created_at)) * 24) as avg_resolution_hours
      FROM tickets
      WHERE first_response_at IS NOT NULL
    `;
    const avgResult = await pool.query(avgResponseQuery);

    // SLA compliance rate
    const slaQuery = USE_POSTGRES ? `
      SELECT
        COUNT(*) FILTER (WHERE first_response_at <= sla_first_response_due) as first_response_met,
        COUNT(*) FILTER (WHERE first_response_at IS NOT NULL) as first_response_total,
        COUNT(*) FILTER (WHERE resolved_at <= sla_resolution_due) as resolution_met,
        COUNT(*) FILTER (WHERE resolved_at IS NOT NULL) as resolution_total
      FROM tickets
    ` : `
      SELECT
        SUM(CASE WHEN first_response_at <= sla_first_response_due THEN 1 ELSE 0 END) as first_response_met,
        SUM(CASE WHEN first_response_at IS NOT NULL THEN 1 ELSE 0 END) as first_response_total,
        SUM(CASE WHEN resolved_at <= sla_resolution_due THEN 1 ELSE 0 END) as resolution_met,
        SUM(CASE WHEN resolved_at IS NOT NULL THEN 1 ELSE 0 END) as resolution_total
      FROM tickets
    `;
    const slaResult = await pool.query(slaQuery);

    const sla = slaResult.rows[0];
    const firstResponseCompliance = sla.first_response_total > 0
      ? Math.round((sla.first_response_met / sla.first_response_total) * 100)
      : 100;
    const resolutionCompliance = sla.resolution_total > 0
      ? Math.round((sla.resolution_met / sla.resolution_total) * 100)
      : 100;

    // Ensure integer values (SQLite SUM can return strings or null)
    const stats = statusResult.rows[0] || {};
    res.json({
      new_count: parseInt(stats.new_count) || 0,
      in_progress_count: parseInt(stats.in_progress_count) || 0,
      waiting_count: parseInt(stats.waiting_count) || 0,
      resolved_count: parseInt(stats.resolved_count) || 0,
      closed_count: parseInt(stats.closed_count) || 0,
      open_count: parseInt(stats.open_count) || 0,
      urgent_count: parseInt(stats.urgent_count) || 0,
      breached_count: parseInt(stats.breached_count) || 0,
      by_priority: priorityResult.rows.map(p => ({ ...p, count: parseInt(p.count) || 0 })),
      avg_first_response_hours: parseFloat(avgResult.rows[0]?.avg_first_response_hours) || 0,
      avg_resolution_hours: parseFloat(avgResult.rows[0]?.avg_resolution_hours) || 0,
      sla_first_response_compliance: firstResponseCompliance,
      sla_resolution_compliance: resolutionCompliance,
      sla_config: SLA_CONFIG
    });
  } catch (error) {
    console.error('Error fetching ticket stats:', error);
    res.status(500).json({ error: 'Failed to fetch ticket stats' });
  }
});

// Get single ticket with activity
router.get('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;

    const ticketResult = await pool.query(`
      SELECT
        t.*,
        c.id as conversation_id,
        c.channel_id,
        ch.title as channel_title,
        cp.id as customer_id,
        cp.display_name as customer_name,
        cp.telegram_username as customer_username,
        cp.telegram_user_id,
        u.name as assigned_name
      FROM tickets t
      LEFT JOIN conversations c ON t.conversation_id = c.id
      LEFT JOIN channels ch ON c.channel_id = ch.id
      LEFT JOIN customer_profiles cp ON c.customer_id = cp.id
      LEFT JOIN users u ON t.assigned_to = u.id
      WHERE t.id = $1
    `, [id]);

    if (ticketResult.rows.length === 0) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    // Get activity log
    const activityResult = await pool.query(`
      SELECT ta.*, u.name as user_name
      FROM ticket_activity ta
      LEFT JOIN users u ON ta.user_id = u.id
      WHERE ta.ticket_id = $1
      ORDER BY ta.created_at DESC
    `, [id]);

    // Get messages from conversation
    const messagesResult = await pool.query(`
      SELECT * FROM messages
      WHERE conversation_id = $1
      ORDER BY timestamp ASC
    `, [ticketResult.rows[0].conversation_id]);

    const ticket = ticketResult.rows[0];
    res.json({
      ...ticket,
      sla_first_response_status: ticket.sla_first_response_due
        ? getSLAStatus(ticket.sla_first_response_due, ticket.first_response_at)
        : null,
      sla_resolution_status: ticket.sla_resolution_due
        ? getSLAStatus(ticket.sla_resolution_due, ticket.resolved_at)
        : null,
      activity: activityResult.rows,
      messages: messagesResult.rows
    });
  } catch (error) {
    console.error('Error fetching ticket:', error);
    res.status(500).json({ error: 'Failed to fetch ticket' });
  }
});

// Create ticket
router.post('/', auth, async (req, res) => {
  try {
    const { conversation_id, subject, category = 'support', priority = 'medium' } = req.body;

    console.log('Creating ticket:', { conversation_id, subject, category, priority, user: req.user?.id });

    if (!conversation_id || !subject) {
      return res.status(400).json({ error: 'Conversation ID and subject are required' });
    }

    // Verify conversation exists
    const convCheck = await pool.query('SELECT id FROM conversations WHERE id = $1', [conversation_id]);
    if (convCheck.rows.length === 0) {
      console.error('Conversation not found:', conversation_id);
      return res.status(400).json({ error: 'Conversation not found' });
    }

    // Calculate SLA due times
    const { firstResponseDue, resolutionDue } = calculateSLADueTimes(priority);

    const insertResult = await pool.query(`
      INSERT INTO tickets (conversation_id, subject, category, priority, sla_first_response_due, sla_resolution_due)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id
    `, [conversation_id, subject, category, priority, firstResponseDue.toISOString(), resolutionDue.toISOString()]);

    // Get the ticket ID - handle both PostgreSQL and SQLite
    // PostgreSQL returns rows[0].id, SQLite wrapper returns rows[0].id from lastInsertRowid
    const ticketId = insertResult.rows?.[0]?.id;
    console.log('Insert result:', JSON.stringify(insertResult));
    console.log('Ticket created with ID:', ticketId);

    if (!ticketId) {
      console.error('Failed to get ticket ID from insert result:', insertResult);
      return res.status(500).json({ error: 'Failed to create ticket - no ID returned' });
    }

    // Log activity
    await pool.query(`
      INSERT INTO ticket_activity (ticket_id, user_id, action, new_value)
      VALUES ($1, $2, 'created', $3)
    `, [ticketId, req.user.id, `Created ticket: ${subject}`]);

    // Fetch the created ticket
    const result = await pool.query(`
      SELECT t.*, cp.display_name as customer_name
      FROM tickets t
      LEFT JOIN conversations c ON t.conversation_id = c.id
      LEFT JOIN customer_profiles cp ON c.customer_id = cp.id
      WHERE t.id = $1
    `, [ticketId]);

    console.log('Returning ticket:', result.rows[0]);
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error creating ticket:', error);
    console.error('Stack:', error.stack);
    res.status(500).json({ error: 'Failed to create ticket: ' + error.message });
  }
});

// Update ticket
router.patch('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, priority, assigned_to, subject, category } = req.body;

    // Get current ticket state
    const currentResult = await pool.query('SELECT * FROM tickets WHERE id = $1', [id]);
    if (currentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Ticket not found' });
    }
    const current = currentResult.rows[0];

    const updates = [];
    const params = [];
    let paramIndex = 1;
    const activities = [];

    if (status !== undefined && status !== current.status) {
      updates.push(`status = $${paramIndex}`);
      params.push(status);
      paramIndex++;
      activities.push({ action: 'status_changed', old: current.status, new: status });

      // Track resolution time
      if (status === 'resolved' && !current.resolved_at) {
        updates.push(`resolved_at = CURRENT_TIMESTAMP`);
      }
      if (status === 'closed' && !current.closed_at) {
        updates.push(`closed_at = CURRENT_TIMESTAMP`);
      }
    }

    if (priority !== undefined && priority !== current.priority) {
      updates.push(`priority = $${paramIndex}`);
      params.push(priority);
      paramIndex++;
      activities.push({ action: 'priority_changed', old: current.priority, new: priority });

      // Recalculate SLA resolution due
      const { resolutionDue } = calculateSLADueTimes(priority, current.created_at);
      updates.push(`sla_resolution_due = $${paramIndex}`);
      params.push(resolutionDue.toISOString());
      paramIndex++;
    }

    if (assigned_to !== undefined) {
      const newAssigned = assigned_to || null;
      if (newAssigned !== current.assigned_to) {
        updates.push(`assigned_to = $${paramIndex}`);
        params.push(newAssigned);
        paramIndex++;
        activities.push({ action: 'assigned', old: current.assigned_to?.toString(), new: newAssigned?.toString() });
      }
    }

    if (subject !== undefined && subject !== current.subject) {
      updates.push(`subject = $${paramIndex}`);
      params.push(subject);
      paramIndex++;
    }

    if (category !== undefined && category !== current.category) {
      updates.push(`category = $${paramIndex}`);
      params.push(category);
      paramIndex++;
      activities.push({ action: 'category_changed', old: current.category, new: category });
    }

    if (updates.length === 0) {
      return res.json(current);
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(id);

    await pool.query(`
      UPDATE tickets SET ${updates.join(', ')} WHERE id = $${paramIndex}
    `, params);

    // Log activities
    for (const activity of activities) {
      await pool.query(`
        INSERT INTO ticket_activity (ticket_id, user_id, action, old_value, new_value)
        VALUES ($1, $2, $3, $4, $5)
      `, [id, req.user.id, activity.action, activity.old, activity.new]);
    }

    // Return updated ticket
    const result = await pool.query(`
      SELECT t.*, u.name as assigned_name
      FROM tickets t
      LEFT JOIN users u ON t.assigned_to = u.id
      WHERE t.id = $1
    `, [id]);

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating ticket:', error);
    res.status(500).json({ error: 'Failed to update ticket' });
  }
});

// Record first response (called when agent sends first reply)
router.post('/:id/first-response', auth, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(`
      UPDATE tickets
      SET first_response_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND first_response_at IS NULL
    `, [id]);

    if (result.rowCount > 0) {
      await pool.query(`
        INSERT INTO ticket_activity (ticket_id, user_id, action, new_value)
        VALUES ($1, $2, 'first_response', 'First response sent')
      `, [id, req.user.id]);
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error recording first response:', error);
    res.status(500).json({ error: 'Failed to record first response' });
  }
});

// Add internal note to ticket
router.post('/:id/note', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { content } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'Note content is required' });
    }

    // Verify ticket exists
    const ticketCheck = await pool.query('SELECT id FROM tickets WHERE id = $1', [id]);
    if (ticketCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    // Add note as activity
    await pool.query(`
      INSERT INTO ticket_activity (ticket_id, user_id, action, new_value)
      VALUES ($1, $2, 'note_added', $3)
    `, [id, req.user.id, content.trim()]);

    // Update ticket timestamp
    await pool.query(`
      UPDATE tickets SET updated_at = CURRENT_TIMESTAMP WHERE id = $1
    `, [id]);

    res.json({ success: true });
  } catch (error) {
    console.error('Error adding note:', error);
    res.status(500).json({ error: 'Failed to add note' });
  }
});

// Get ticket by conversation ID
router.get('/by-conversation/:conversationId', auth, async (req, res) => {
  try {
    const { conversationId } = req.params;

    const result = await pool.query(`
      SELECT t.*, u.name as assigned_name
      FROM tickets t
      LEFT JOIN users u ON t.assigned_to = u.id
      WHERE t.conversation_id = $1
      ORDER BY t.created_at DESC
      LIMIT 1
    `, [conversationId]);

    if (result.rows.length === 0) {
      return res.json(null);
    }

    const ticket = result.rows[0];
    res.json({
      ...ticket,
      sla_first_response_status: ticket.sla_first_response_due
        ? getSLAStatus(ticket.sla_first_response_due, ticket.first_response_at)
        : null,
      sla_resolution_status: ticket.sla_resolution_due
        ? getSLAStatus(ticket.sla_resolution_due, ticket.resolved_at)
        : null
    });
  } catch (error) {
    console.error('Error fetching ticket by conversation:', error);
    res.status(500).json({ error: 'Failed to fetch ticket' });
  }
});

module.exports = router;
