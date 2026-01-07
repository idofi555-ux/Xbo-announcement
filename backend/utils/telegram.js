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

  if (!token || token === 'your-telegram-bot-token') {
    console.warn('⚠️  Telegram bot token not configured. Bot features disabled.');
    return null;
  }

  try {
    const isProduction = process.env.NODE_ENV === 'production';
    const webhookUrl = process.env.WEBHOOK_URL;

    // Bot options
    const botOptions = {
      polling: false // Start with polling disabled
    };

    bot = new TelegramBot(token, botOptions);

    // Use webhooks in production if WEBHOOK_URL is set, otherwise use polling with error handling
    if (isProduction && webhookUrl) {
      // Webhook mode for production
      console.log('Setting up Telegram webhook at:', webhookUrl);
      bot.setWebHook(`${webhookUrl}/bot${token}`);
      console.log('✅ Telegram bot initialized with webhook');
    } else {
      // Polling mode with error handling
      console.log('Starting Telegram bot in polling mode...');

      // Start polling with error handling
      bot.startPolling({
        restart: true,
        onlyFirstMatch: true
      });

      // Handle polling errors
      bot.on('polling_error', (error) => {
        console.error('Telegram polling error:', error.code, error.message);

        // Don't crash on ETELEGRAM errors (e.g., conflict with another instance)
        if (error.code === 'ETELEGRAM') {
          console.error('Another bot instance may be running. Stopping polling...');
          bot.stopPolling();
        }
      });

      bot.on('error', (error) => {
        console.error('Telegram bot error:', error.message);
      });

      console.log('✅ Telegram bot initialized with polling');
    }

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

// Send announcement to a channel
const sendAnnouncement = async (channelId, announcement, trackedLinks = []) => {
  if (!bot) {
    throw new Error('Telegram bot not initialized');
  }

  const channelResult = await pool.query(
    'SELECT * FROM channels WHERE id = $1',
    [channelId]
  );

  if (channelResult.rows.length === 0) {
    throw new Error('Channel not found');
  }

  const channel = channelResult.rows[0];

  // Replace URLs with tracked versions
  let content = announcement.content;
  trackedLinks.forEach(link => {
    content = content.replace(link.original_url, link.tracked_url);
  });

  // Parse buttons if any
  let replyMarkup = null;
  if (announcement.buttons) {
    try {
      const buttons = JSON.parse(announcement.buttons);
      if (buttons.length > 0) {
        // Replace button URLs with tracked versions
        const trackedButtons = buttons.map(btn => {
          const trackedLink = trackedLinks.find(l => l.original_url === btn.url);
          return {
            text: btn.text,
            url: trackedLink ? trackedLink.tracked_url : btn.url
          };
        });

        replyMarkup = {
          inline_keyboard: trackedButtons.map(btn => [btn])
        };
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

  // Send with or without image
  if (announcement.image_url) {
    message = await bot.sendPhoto(channel.telegram_id, announcement.image_url, {
      caption: content,
      ...options
    });
  } else {
    message = await bot.sendMessage(channel.telegram_id, content, options);
  }

  return message;
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
  sendAnnouncement,
  updateChannelStats,
  processUpdate,
  stopBot
};
