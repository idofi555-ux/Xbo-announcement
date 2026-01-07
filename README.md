# XBO Announcements System

A powerful Telegram announcement system with web dashboard and analytics tracking for XBO.com marketing.

![Dashboard Preview](https://via.placeholder.com/800x400/0f172a/22c55e?text=XBO+Announcements+Dashboard)

## Features

### 📢 Announcement Management
- Create and schedule announcements
- Rich text formatting (HTML support)
- Image attachments
- Interactive buttons with links
- Multi-channel broadcasting
- Draft & schedule system

### 📊 Analytics & Tracking
- **Link Tracking**: All URLs are automatically wrapped for click tracking
- **UTM Parameters**: Automatic UTM tagging for Google Analytics
- **Real-time Stats**: Views, clicks, and CTR metrics
- **Campaign Grouping**: Organize announcements by campaigns
- **Performance Charts**: Visual analytics dashboard

### 🤖 Telegram Integration
- Bot-based channel registration
- Automatic member count sync
- Support for channels, groups, and supergroups
- Message status tracking

### 👥 Multi-User System
- Role-based access (Admin/User)
- Activity logging
- Secure JWT authentication

---

## Quick Start

### Prerequisites
- Node.js 18+
- npm or yarn
- A Telegram Bot Token (get from [@BotFather](https://t.me/BotFather))

### 1. Clone & Install

```bash
# Clone the repository
git clone <your-repo>
cd xbo-announcements

# Install all dependencies
npm run install:all
```

### 2. Configure Environment

```bash
# Copy environment template
cp backend/.env.example backend/.env
```

Edit `backend/.env`:
```env
PORT=3001
NODE_ENV=development
JWT_SECRET=generate-a-random-32-char-string-here
TELEGRAM_BOT_TOKEN=your-bot-token-from-botfather
FRONTEND_URL=http://localhost:5173
BASE_URL=http://localhost:3001
```

### 3. Run Development

```bash
# Terminal 1: Start backend
npm run dev:backend

# Terminal 2: Start frontend  
npm run dev:frontend
```

Open http://localhost:5173

**Default Login:**
- Email: `admin@xbo.com`
- Password: `admin123`

---

## Setting Up Telegram Bot

### 1. Create Bot
1. Message [@BotFather](https://t.me/BotFather) on Telegram
2. Send `/newbot` and follow prompts
3. Copy the bot token to your `.env` file

### 2. Add Bot to Channels
1. Add your bot as an **admin** to your channel/group
2. In the channel, send `/register`
3. The channel will appear in your dashboard

### 3. Bot Commands
- `/start` - Get started & see chat ID
- `/register` - Register current chat for announcements
- `/stats` - View channel statistics

---

## Deployment

### Option 1: Railway (Recommended)

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app)

1. Connect your GitHub repo
2. Add environment variables in Railway dashboard
3. Deploy!

Railway will automatically:
- Build the frontend
- Start the backend
- Provide a public URL

### Option 2: Render

1. Create a new **Web Service**
2. Connect your repo
3. Set build command: `cd frontend && npm install && npm run build && cd ../backend && npm install`
4. Set start command: `cd backend && npm start`
5. Add environment variables

### Option 3: VPS / Docker

```dockerfile
# Dockerfile
FROM node:18-alpine

WORKDIR /app
COPY . .

RUN cd frontend && npm install && npm run build
RUN cd backend && npm install

EXPOSE 3001
CMD ["npm", "start"]
```

---

## Project Structure

```
xbo-announcements/
├── backend/
│   ├── models/
│   │   └── database.js      # SQLite database setup
│   ├── routes/
│   │   ├── auth.js          # Authentication routes
│   │   ├── announcements.js # Announcement CRUD
│   │   ├── channels.js      # Channel management
│   │   ├── analytics.js     # Analytics & campaigns
│   │   └── tracker.js       # Link redirect handler
│   ├── middleware/
│   │   └── auth.js          # JWT middleware
│   ├── utils/
│   │   ├── telegram.js      # Telegram bot logic
│   │   └── linkTracker.js   # URL tracking
│   └── server.js            # Express server
│
├── frontend/
│   ├── src/
│   │   ├── components/      # React components
│   │   ├── pages/           # Page components
│   │   ├── hooks/           # Custom hooks
│   │   └── utils/           # API utilities
│   └── index.html
│
└── package.json             # Root package.json
```

---

## API Reference

### Authentication
```
POST /api/auth/login
POST /api/auth/register (admin only)
GET  /api/auth/me
GET  /api/auth/users (admin only)
```

### Announcements
```
GET    /api/announcements
POST   /api/announcements
GET    /api/announcements/:id
PUT    /api/announcements/:id
DELETE /api/announcements/:id
POST   /api/announcements/:id/send
POST   /api/announcements/:id/duplicate
```

### Channels
```
GET    /api/channels
POST   /api/channels
PUT    /api/channels/:id
DELETE /api/channels/:id
POST   /api/channels/:id/refresh
```

### Analytics
```
GET /api/analytics/overview
GET /api/analytics/detailed
GET /api/campaigns
```

### Link Tracking
```
GET /t/:shortCode  → Redirects & tracks click
```

---

## Customization

### Styling
The frontend uses Tailwind CSS. Modify `frontend/tailwind.config.js` for colors:

```js
colors: {
  brand: {
    500: '#22c55e', // Change primary color
  }
}
```

### Database
By default uses SQLite (zero config). For production, you can switch to PostgreSQL:

1. Install `pg` package
2. Update `backend/models/database.js` to use PostgreSQL
3. Update connection in `.env`

---

## Troubleshooting

### Bot not connecting
- Verify token is correct in `.env`
- Ensure bot is running (check server logs)
- Bot must be admin in channels

### Clicks not tracking
- Ensure `BASE_URL` in `.env` matches your deployed URL
- Check that links are being converted (they should start with your domain `/t/`)

### Login not working
- Clear localStorage and try again
- Check backend logs for errors
- Verify JWT_SECRET is set

---

## License

MIT License - feel free to use for your projects!

---

## Support

For issues or questions, contact the XBO development team.
