// Load environment variables (fallback in case not loaded yet)
require('dotenv').config();

const TelegramBot = require('node-telegram-bot-api');
const { pool } = require('../models/database');

let bot = null;
let botInitialized = false;

const initBot = () => {
  if (botInitialized) {
    console.log('Telegram bot already initialized, skipping...');
    return bot;
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;

  console.log('=== Bot Configuration ===');
  console.log('TELEGRAM_BOT_TOKEN env var:', token ? 'SET' : 'NOT SET');

  if (!token || token === 'your-telegram-bot-token') {
    console.warn('⚠️  Telegram bot token not configured. Bot features disabled.');
    console.warn('Set TELEGRAM_BOT_TOKEN environment variable in Railway.');
    return null;
  }

  console.log('Token length:', token.length);
  console.log('Token (first 10 chars):', token.substring(0, 10) + '...');

  try {
    // Create bot instance without polling initially
    bot = new TelegramBot(token, { polling: false });

    // Delete any existing webhook first to avoid conflicts
    console.log('Deleting any existing webhook...');
    bot.deleteWebHook()
      .then(() => {
        console.log('Webhook deleted successfully');
        // Start polling after webhook is deleted
        startPolling();
      })
      .catch(err => {
        console.error('Error deleting webhook:', err.message);
        // Try to start polling anyway
        startPolling();
      });

    function startPolling() {
      console.log('Starting Telegram bot polling...');
      try {
        bot.startPolling({
          restart: true,
          onlyFirstMatch: true
        });
        console.log('✅ Telegram bot polling started successfully');
      } catch (err) {
        console.error('Failed to start polling:', err.message);
      }
    }

    // Handle polling errors
    bot.on('polling_error', (error) => {
      console.error('Telegram polling error:', error.code, error.message);
      if (error.response && error.response.body) {
        console.error('Error details:', JSON.stringify(error.response.body));
      }
    });

    bot.on('error', (error) => {
      console.error('Telegram bot error:', error.message);
    });

    // Handle /start command
    bot.onText(/\/start/, (msg) => {
      const chatId = msg.chat.id;
      bot.sendMessage(chatId,
        `👋 Hello! I'm the XBO Announcements Bot.\n\n` +
        `To add me to your channel or group:\n` +
        `1. Add me as an admin to your channel/group\n` +
        `2. Use /register to register this chat\n\n` +
        `Chat ID: \`${chatId}\``,
        { parse_mode: 'Markdown' }
      ).catch(err => console.error('Error sending start message:', err.message));
    });

    // Handle /register command
    bot.onText(/\/register/, async (msg) => {
      const chat = msg.chat;

      try {
        // Check if already registered
        const existing = await pool.query(
          'SELECT id FROM channels WHERE telegram_id = $1',
          [chat.id.toString()]
        );

        if (existing.rows.length > 0) {
          bot.sendMessage(chat.id, '✅ This chat is already registered!');
          return;
        }

        // Get member count for channels
        let memberCount = 0;
        try {
          memberCount = await bot.getChatMemberCount(chat.id);
        } catch (e) {
          console.log('Could not get member count:', e.message);
        }

        // Register the channel
        await pool.query(
          `INSERT INTO channels (telegram_id, title, type, member_count)
           VALUES ($1, $2, $3, $4)`,
          [
            chat.id.toString(),
            chat.title || chat.username || 'Private Chat',
            chat.type,
            memberCount
          ]
        );

        bot.sendMessage(chat.id,
          `✅ Successfully registered!\n\n` +
          `📍 Chat: ${chat.title || 'Private'}\n` +
          `🆔 ID: ${chat.id}\n` +
          `👥 Members: ${memberCount}\n\n` +
          `You can now send announcements to this chat from the dashboard.`
        );
      } catch (error) {
        console.error('Registration error:', error);
        bot.sendMessage(chat.id, '❌ Error registering chat. Please try again.');
      }
    });

    // Handle /stats command
    bot.onText(/\/stats/, async (msg) => {
      const chatId = msg.chat.id;

      try {
        const channelResult = await pool.query(
          'SELECT * FROM channels WHERE telegram_id = $1',
          [chatId.toString()]
        );

        if (channelResult.rows.length === 0) {
          bot.sendMessage(chatId, '❌ This chat is not registered. Use /register first.');
          return;
        }

        const channel = channelResult.rows[0];

        const statsResult = await pool.query(
          `SELECT COUNT(*) as total_announcements,
                  COALESCE(SUM(views), 0) as total_views
           FROM announcement_targets
           WHERE channel_id = $1`,
          [channel.id]
        );

        const stats = statsResult.rows[0];

        bot.sendMessage(chatId,
          `📊 *Stats for ${channel.title}*\n\n` +
          `📢 Total Announcements: ${stats.total_announcements || 0}\n` +
          `👀 Total Views: ${stats.total_views || 0}`,
          { parse_mode: 'Markdown' }
        );
      } catch (error) {
        console.error('Stats error:', error);
        bot.sendMessage(chatId, '❌ Error fetching stats.');
      }
    });

    botInitialized = true;
    return bot;
  } catch (error) {
    console.error('Failed to initialize Telegram bot:', error.message);
    return null;
  }
};

// Check if bot is ready
const isBotReady = () => {
  return bot !== null && botInitialized;
};

// Get bot status for debugging
const getBotStatus = () => {
  return {
    initialized: botInitialized,
    hasBot: bot !== null,
    token: process.env.TELEGRAM_BOT_TOKEN ? 'SET (hidden)' : 'NOT SET'
  };
};

// Send announcement to a channel
const sendAnnouncement = async (channelId, announcement, trackedLinks = []) => {
  console.log('=== sendAnnouncement called ===');
  console.log('Bot status:', getBotStatus());

  if (!bot) {
    const status = getBotStatus();
    throw new Error(`Telegram bot not initialized. Token: ${status.token}`);
  }

  const channelResult = await pool.query(
    'SELECT * FROM channels WHERE id = $1',
    [channelId]
  );

  if (channelResult.rows.length === 0) {
    throw new Error(`Channel not found in database (id: ${channelId})`);
  }

  const channel = channelResult.rows[0];
  console.log('Sending to channel:', channel.title, 'Telegram ID:', channel.telegram_id);

  // Replace URLs with tracked versions
  let content = announcement.content;
  trackedLinks.forEach(link => {
    content = content.replace(link.original_url, link.tracked_url);
  });

  // Parse buttons if any
  let replyMarkup = null;
  if (announcement.buttons && announcement.buttons !== '[]' && announcement.buttons !== 'null') {
    try {
      console.log('Raw buttons from DB:', announcement.buttons);
      const buttons = JSON.parse(announcement.buttons);
      console.log('Parsed buttons:', JSON.stringify(buttons));

      if (Array.isArray(buttons) && buttons.length > 0) {
        // Filter out invalid buttons - must have non-empty text AND valid URL
        const validButtons = buttons.filter(btn => {
          // Check text exists and is not empty
          const text = btn && btn.text ? String(btn.text).trim() : '';
          // Check URL exists, is not empty, and looks like a URL
          const url = btn && btn.url ? String(btn.url).trim() : '';
          const hasValidText = text.length > 0;
          const hasValidUrl = url.length > 0 && (url.startsWith('http://') || url.startsWith('https://'));

          console.log(`Button check: text="${text}" url="${url}" hasValidText=${hasValidText} hasValidUrl=${hasValidUrl}`);
          return hasValidText && hasValidUrl;
        });

        console.log('Valid buttons count:', validButtons.length);

        // Only add reply markup if there are valid buttons
        if (validButtons.length > 0) {
          const trackedButtons = validButtons.map(btn => {
            const trackedLink = trackedLinks.find(l => l.original_url === btn.url);
            return {
              text: String(btn.text).trim(),
              url: trackedLink ? trackedLink.tracked_url : String(btn.url).trim()
            };
          });

          replyMarkup = {
            inline_keyboard: trackedButtons.map(btn => [btn])
          };
          console.log('Reply markup:', JSON.stringify(replyMarkup));
        } else {
          console.log('No valid buttons after filtering, skipping reply_markup');
        }
      }
    } catch (e) {
      console.error('Error parsing buttons:', e);
    }
  }

  const options = {
    parse_mode: 'HTML',
    disable_web_page_preview: false
  };

  if (replyMarkup) {
    options.reply_markup = replyMarkup;
  }

  let message;

  try {
    // Send with or without image
    if (announcement.image_url) {
      console.log('Sending photo to:', channel.telegram_id);
      message = await bot.sendPhoto(channel.telegram_id, announcement.image_url, {
        caption: content,
        ...options
      });
    } else {
      console.log('Sending message to:', channel.telegram_id);
      message = await bot.sendMessage(channel.telegram_id, content, options);
    }
    console.log('Message sent successfully, message_id:', message.message_id);
    return message;
  } catch (error) {
    console.error('=== Telegram Send Error ===');
    console.error('Channel:', channel.title, '(', channel.telegram_id, ')');
    console.error('Error code:', error.code);
    console.error('Error message:', error.message);
    console.error('Response:', error.response?.body || 'No response body');

    // Create more helpful error messages
    let userMessage = error.message;
    if (error.code === 'ETELEGRAM') {
      const desc = error.response?.body?.description || error.message;
      if (desc.includes('chat not found')) {
        userMessage = `Chat not found. Make sure the bot is added to the channel "${channel.title}" as an admin.`;
      } else if (desc.includes('bot was blocked')) {
        userMessage = `Bot was blocked by the user/channel "${channel.title}".`;
      } else if (desc.includes('not enough rights')) {
        userMessage = `Bot doesn't have permission to post in "${channel.title}". Make sure it's an admin with post rights.`;
      } else if (desc.includes('Forbidden')) {
        userMessage = `Access forbidden to "${channel.title}". Add the bot as an admin.`;
      } else {
        userMessage = desc;
      }
    }

    throw new Error(userMessage);
  }
};

// Get bot instance
const getBot = () => bot;

// Update channel stats
const updateChannelStats = async (channelId) => {
  if (!bot) return;

  const channelResult = await pool.query(
    'SELECT telegram_id FROM channels WHERE id = $1',
    [channelId]
  );

  if (channelResult.rows.length === 0) return;

  const channel = channelResult.rows[0];

  try {
    const count = await bot.getChatMemberCount(channel.telegram_id);
    await pool.query(
      'UPDATE channels SET member_count = $1 WHERE id = $2',
      [count, channelId]
    );
  } catch (error) {
    console.error('Error updating channel stats:', error.message);
  }
};

// Process webhook update (for production)
const processUpdate = (update) => {
  if (bot) {
    bot.processUpdate(update);
  }
};

// Stop bot polling (cleanup)
const stopBot = () => {
  if (bot && botInitialized) {
    bot.stopPolling();
    botInitialized = false;
    console.log('Telegram bot stopped');
  }
};

module.exports = {
  initBot,
  getBot,
  getBotStatus,
  isBotReady,
  sendAnnouncement,
  updateChannelStats,
  processUpdate,
  stopBot
};
