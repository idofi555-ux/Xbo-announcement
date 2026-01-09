const { pool } = require('../models/database');

// Log types
const LOG_TYPES = {
  ERROR: 'error',
  WARNING: 'warning',
  INFO: 'info',
  SUCCESS: 'success'
};

// Log categories
const LOG_CATEGORIES = {
  TELEGRAM: 'telegram',
  API: 'api',
  SYSTEM: 'system',
  AUTH: 'auth',
  CHANNEL: 'channel',
  SUPPORT: 'support'
};

/**
 * Create a system log entry
 */
const createLog = async (type, category, message, options = {}) => {
  try {
    const { details, announcement_id, user_id, channel_id } = options;

    await pool.query(
      `INSERT INTO system_logs (type, category, message, details, announcement_id, user_id, channel_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        type,
        category,
        message,
        details ? JSON.stringify(details) : null,
        announcement_id || null,
        user_id || null,
        channel_id || null
      ]
    );
  } catch (error) {
    console.error('Failed to create log entry:', error.message);
  }
};

// Convenience methods
const logError = (category, message, options = {}) => createLog(LOG_TYPES.ERROR, category, message, options);
const logWarning = (category, message, options = {}) => createLog(LOG_TYPES.WARNING, category, message, options);
const logInfo = (category, message, options = {}) => createLog(LOG_TYPES.INFO, category, message, options);
const logSuccess = (category, message, options = {}) => createLog(LOG_TYPES.SUCCESS, category, message, options);

// Telegram-specific logging
const logTelegramSuccess = (message, announcementId, channelId, details = {}) => {
  return logSuccess(LOG_CATEGORIES.TELEGRAM, message, {
    announcement_id: announcementId,
    channel_id: channelId,
    details
  });
};

const logTelegramError = (message, announcementId, channelId, details = {}) => {
  return logError(LOG_CATEGORIES.TELEGRAM, message, {
    announcement_id: announcementId,
    channel_id: channelId,
    details
  });
};

// Auth logging
const logLoginSuccess = (userId, email) => {
  return logInfo(LOG_CATEGORIES.AUTH, `User logged in: ${email}`, { user_id: userId });
};

const logLoginFailed = (email, reason) => {
  return logWarning(LOG_CATEGORIES.AUTH, `Login failed for: ${email}`, { details: { reason } });
};

// Channel logging
const logChannelRegistered = (channelTitle, channelId) => {
  return logInfo(LOG_CATEGORIES.CHANNEL, `Channel registered: ${channelTitle}`, { channel_id: channelId });
};

const logChannelError = (message, channelId, details = {}) => {
  return logError(LOG_CATEGORIES.CHANNEL, message, { channel_id: channelId, details });
};

// API error logging
const logApiError = (endpoint, error, userId = null) => {
  return logError(LOG_CATEGORIES.API, `API error on ${endpoint}: ${error.message}`, {
    user_id: userId,
    details: { endpoint, error: error.message, stack: error.stack?.substring(0, 500) }
  });
};

// System logging
const logSystemEvent = (message, details = {}) => {
  return logInfo(LOG_CATEGORIES.SYSTEM, message, { details });
};

// Support logging
const logSupportEvent = (message, details = {}) => {
  return logInfo(LOG_CATEGORIES.SUPPORT, message, { details });
};

const logSupportError = (message, details = {}) => {
  return logError(LOG_CATEGORIES.SUPPORT, message, { details });
};

const logConversationEvent = (action, conversationId, userId = null, details = {}) => {
  return logInfo(LOG_CATEGORIES.SUPPORT, `Conversation ${action}`, {
    user_id: userId,
    details: { conversation_id: conversationId, action, ...details }
  });
};

const logMessageEvent = (action, conversationId, userId = null, details = {}) => {
  return logInfo(LOG_CATEGORIES.SUPPORT, `Message ${action}`, {
    user_id: userId,
    details: { conversation_id: conversationId, action, ...details }
  });
};

module.exports = {
  LOG_TYPES,
  LOG_CATEGORIES,
  createLog,
  logError,
  logWarning,
  logInfo,
  logSuccess,
  logTelegramSuccess,
  logTelegramError,
  logLoginSuccess,
  logLoginFailed,
  logChannelRegistered,
  logChannelError,
  logApiError,
  logSystemEvent,
  logSupportEvent,
  logSupportError,
  logConversationEvent,
  logMessageEvent
};
