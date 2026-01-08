// Load environment variables (fallback in case not loaded yet)
require('dotenv').config();

const TelegramBot = require('node-telegram-bot-api');
const { pool, USE_POSTGRES } = require('../models/database');

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
        `👋 Hello! I'm the XBO Telegram Manager Bot.\n\n` +
        `*Setup Instructions:*\n` +
        `1. Add me as an admin to your channel/group\n` +
        `2. Use /register to register this chat\n\n` +
        `*IMPORTANT - Enable Message Access:*\n` +
        `To receive ALL messages (not just commands), you must disable Group Privacy:\n` +
        `1. Message @BotFather\n` +
        `2. Send /setprivacy\n` +
        `3. Select this bot\n` +
        `4. Choose "Disable"\n\n` +
        `I will:\n` +
        `- Send announcements to your channels\n` +
        `- Track messages from group members for CRM\n\n` +
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

    // Handle callback queries (inline button clicks)
    bot.on('callback_query', async (callbackQuery) => {
      try {
        const data = callbackQuery.data;
        const user = callbackQuery.from;
        const message = callbackQuery.message;

        // Check if this is a tracking callback
        if (data && data.startsWith('track_')) {
          const [, announcementId, channelId] = data.split('_');

          // Record button click
          await pool.query(
            `INSERT INTO button_clicks (announcement_id, channel_id, button_text, telegram_user_id, telegram_username, telegram_first_name)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [
              announcementId,
              channelId || null,
              'More Info',
              user.id.toString(),
              user.username || null,
              user.first_name || null
            ]
          );

          console.log(`Button click recorded: announcement=${announcementId}, user=${user.username || user.id}`);

          // Also record as a view (button click = user definitely saw the message)
          const viewerHash = `tg_${user.id}`;

          // Check if view already exists for this user
          const existingView = await pool.query(
            `SELECT id FROM pixel_views WHERE announcement_id = $1 AND viewer_hash = $2`,
            [announcementId, viewerHash]
          );

          if (existingView.rows.length === 0) {
            await pool.query(
              `INSERT INTO pixel_views (announcement_id, channel_id, viewer_hash, device_type, browser)
               VALUES ($1, $2, $3, $4, $5)`,
              [announcementId, channelId || null, viewerHash, 'mobile', 'Telegram']
            );

            // Update view count in announcement_targets
            if (channelId) {
              await pool.query(
                `UPDATE announcement_targets SET views = views + 1 WHERE announcement_id = $1 AND channel_id = $2`,
                [announcementId, channelId]
              );
            }

            console.log(`View recorded from button click: announcement=${announcementId}, user=${user.id}`);
          }

          // Answer the callback query with a notification
          await bot.answerCallbackQuery(callbackQuery.id, {
            text: 'Thanks for your interest!',
            show_alert: false
          });
        }
      } catch (error) {
        console.error('Callback query error:', error.message);
        try {
          await bot.answerCallbackQuery(callbackQuery.id);
        } catch (e) {
          // Ignore
        }
      }
    });

    // Handle ALL incoming messages for CRM
    bot.on('message', async (msg) => {
      const chat = msg.chat;
      const user = msg.from;
      const username = user.username ? `@${user.username}` : user.first_name || 'Unknown';

      // Log every incoming message for debugging
      console.log(`[BOT] Received message from ${username} in ${chat.title || chat.type} (${chat.id}): ${msg.text || '[non-text]'}`);

      // Skip commands (handled separately)
      if (msg.text && msg.text.startsWith('/')) {
        console.log(`[BOT] Skipping command message`);
        return;
      }
      // Skip bot's own messages
      if (msg.from.is_bot) {
        console.log(`[BOT] Skipping bot message`);
        return;
      }
      // Skip if no text content
      if (!msg.text) {
        console.log(`[BOT] Skipping non-text message`);
        return;
      }

      // Only track messages from groups/supergroups
      if (chat.type !== 'group' && chat.type !== 'supergroup') {
        console.log(`[BOT] Skipping message from ${chat.type} (not a group)`);
        return;
      }

      try {
        // Check if this chat/channel is registered
        const channelResult = await pool.query(
          'SELECT id FROM channels WHERE telegram_id = $1',
          [chat.id.toString()]
        );

        if (channelResult.rows.length === 0) {
          console.log(`[BOT] Skipping - group ${chat.title} is not registered`);
          return;
        }

        const channelId = channelResult.rows[0].id;

        // Create or update customer profile
        const displayName = [user.first_name, user.last_name].filter(Boolean).join(' ') || user.username || 'Unknown';

        let customerId;
        if (USE_POSTGRES) {
          const customerResult = await pool.query(
            `INSERT INTO customer_profiles (telegram_user_id, telegram_username, display_name, last_seen)
             VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
             ON CONFLICT (telegram_user_id)
             DO UPDATE SET telegram_username = $2, display_name = $3, last_seen = CURRENT_TIMESTAMP
             RETURNING id`,
            [user.id.toString(), user.username || null, displayName]
          );
          customerId = customerResult.rows[0].id;
        } else {
          // SQLite: Check if exists first, then insert or update
          const existingCustomer = await pool.query(
            `SELECT id FROM customer_profiles WHERE telegram_user_id = $1`,
            [user.id.toString()]
          );

          if (existingCustomer.rows.length > 0) {
            customerId = existingCustomer.rows[0].id;
            await pool.query(
              `UPDATE customer_profiles SET telegram_username = $1, display_name = $2, last_seen = CURRENT_TIMESTAMP WHERE id = $3`,
              [user.username || null, displayName, customerId]
            );
          } else {
            const insertResult = await pool.query(
              `INSERT INTO customer_profiles (telegram_user_id, telegram_username, display_name) VALUES ($1, $2, $3)`,
              [user.id.toString(), user.username || null, displayName]
            );
            customerId = insertResult.rows[0].id;
          }
        }

        // Find or create conversation for this customer in this channel
        let conversationResult = await pool.query(
          `SELECT id FROM conversations
           WHERE channel_id = $1 AND customer_id = $2 AND status != 'closed'
           ORDER BY created_at DESC LIMIT 1`,
          [channelId, customerId]
        );

        let conversationId;
        if (conversationResult.rows.length === 0) {
          // Create new conversation
          const newConv = await pool.query(
            `INSERT INTO conversations (channel_id, customer_id, status) VALUES ($1, $2, 'open')`,
            [channelId, customerId]
          );
          conversationId = newConv.rows[0].id;
        } else {
          conversationId = conversationResult.rows[0].id;
          // Update conversation timestamp
          await pool.query(
            `UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
            [conversationId]
          );
        }

        // Save the message
        await pool.query(
          `INSERT INTO messages (conversation_id, telegram_message_id, direction, content, sender_name)
           VALUES ($1, $2, 'in', $3, $4)`,
          [conversationId, msg.message_id.toString(), msg.text, displayName]
        );

        console.log(`[CRM] Message saved from ${displayName} in ${chat.title}`);
      } catch (error) {
        console.error('[CRM] Error saving message:', error.message);
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

  // Add tracking pixel for view counting
  const baseUrl = process.env.BASE_URL ||
    (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : null) ||
    'http://localhost:3001';
  const pixelUrl = `${baseUrl}/t/pixel/${announcement.id}/${channelId}`;
  // Add invisible link (zero-width space) that Telegram will fetch for preview
  content += `<a href="${pixelUrl}">\u200B</a>`;
  console.log('Tracking pixel URL:', pixelUrl);

  // Parse buttons and add tracking button
  let replyMarkup = null;
  const hasDefinedButtons = announcement.buttons && announcement.buttons !== '[]' && announcement.buttons !== 'null';

  if (hasDefinedButtons) {
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

          // Add tracking callback button for user engagement tracking
          const trackingButton = {
            text: '📩 More Info',
            callback_data: `track_${announcement.id}_${channelId}`
          };

          replyMarkup = {
            inline_keyboard: [
              ...trackedButtons.map(btn => [btn]),
              [trackingButton]
            ]
          };
          console.log('Reply markup:', JSON.stringify(replyMarkup));
        } else {
          // Add tracking button even without URL buttons
          replyMarkup = {
            inline_keyboard: [[{
              text: '📩 More Info',
              callback_data: `track_${announcement.id}_${channelId}`
            }]]
          };
          console.log('Added tracking-only button');
        }
      }
    } catch (e) {
      console.error('Error parsing buttons:', e);
    }
  }

  // Always add tracking button if not already set
  if (!replyMarkup) {
    replyMarkup = {
      inline_keyboard: [[{
        text: '📩 More Info',
        callback_data: `track_${announcement.id}_${channelId}`
      }]]
    };
    console.log('Added default tracking button');
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

// Send a reply message to a channel (for CRM)
const sendReplyMessage = async (channelTelegramId, content, replyToMessageId = null) => {
  if (!bot) {
    throw new Error('Telegram bot not initialized');
  }

  const options = {
    parse_mode: 'HTML'
  };

  if (replyToMessageId) {
    options.reply_to_message_id = replyToMessageId;
  }

  try {
    const message = await bot.sendMessage(channelTelegramId, content, options);
    return message;
  } catch (error) {
    console.error('Error sending reply:', error.message);
    throw error;
  }
};

module.exports = {
  initBot,
  getBot,
  getBotStatus,
  isBotReady,
  sendAnnouncement,
  sendReplyMessage,
  updateChannelStats,
  processUpdate,
  stopBot
};
