import { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../hooks/useTheme';
import api from '../utils/api';
import {
  LayoutDashboard,
  Megaphone,
  Radio,
  BarChart3,
  MousePointerClick,
  Lightbulb,
  Users,
  FolderKanban,
  Settings,
  LogOut,
  Menu,
  X,
  Zap,
  Bell,
  Search,
  Moon,
  Sun,
  Inbox,
  MessageSquare,
  UserCircle,
  Ticket,
  ScrollText,
  Volume2
} from 'lucide-react';

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Announcements', href: '/announcements', icon: Megaphone },
  { name: 'Channels', href: '/channels', icon: Radio },
  { name: 'Campaigns', href: '/campaigns', icon: FolderKanban },
  { name: 'Analytics', href: '/analytics', icon: BarChart3 },
  { name: 'Click Details', href: '/click-details', icon: MousePointerClick },
  { name: 'Insights', href: '/insights', icon: Lightbulb },
];

const supportNavigation = [
  { name: 'Inbox', href: '/inbox', icon: Inbox, badgeKey: 'inbox' },
  { name: 'Tickets', href: '/tickets', icon: Ticket, badgeKey: 'tickets' },
  { name: 'Customers', href: '/customers', icon: UserCircle },
  { name: 'Quick Replies', href: '/quick-replies', icon: MessageSquare },
  { name: 'Logs', href: '/logs', icon: ScrollText },
];

const adminNavigation = [
  { name: 'Team', href: '/users', icon: Users },
  { name: 'Settings', href: '/settings', icon: Settings },
];

// Notification sound (base64 encoded short beep)
const NOTIFICATION_SOUND = 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YVoGAACBhYqFbF1mdJOlpq6tmZ+MkJKAfHtzfH6BgIF8d3F0enZ0dnZ4e3x8e3x5c3Z4fYCCgoGBfXx5d3Z5fH6BgoKBgH16eHh5fH+BgYODgX58enp6e32AgIKDgYB+fHx6ent+gIGCg4GBf318e3p7foCBgoKBgH59fHt7e36AgIGCgYB/fnx8e3t9f4CBgoKBgH5+fHx7e3+AgYGBgYB/fXx8fHt9f4CBgYGAgH9+fXx8e35/gICBgYCAf359fHt8fn+AgIGBgIB/fn58fHx+f4CAgIGAgH9+fn19fH5/gICBgYCAf35+fX18fn+AgICAgIB/fn5+fXx+f4CAgICAgH9/fn59fX5/gICAgICAgH9+fn19fn+AgICAgIB/f35+fX1+f4CAgICAgH9/fn59fX5/gICAgICAgH9+fn19fn+AgICAgICAf39+fn19fn+AgICAgICAf39+fn59fn+AgICAgICAf39+fn59fn+AgICAgICAf39+fn59fn+AgICAgICAf39+fn59fn+AgICAgICAf39+fn59fn+AgICAgICAf39+fn59fn+AgICAgICAf39+fn59fn+AgICAgICAf39+fn59fn+AgICAgICAf39+fn59fn+AgICAgICAf39+fn59fn+AgICAgICAf39+fn59fn+AgICAgICAf39+fn59fn+AgICAgICAf39+fn59fn+AgIB/f35+fn59fn9/f39/f35+fn59fn9/f39/f35+fn5+fn9/f39/f35+fn5+fn9/f39/f35+fn5+fn9/f39/f35+fn5+fn9/f39/f35+fn5+fn9/f39/f35+fn5+fn9/f39/f35+fn5+fn9/f39/f35+fn5+fn9/f39/f35+fn5+fn9/f39/f35+fn5+fn9/f39/f35+fn5+fn9/f39/f35+fn5+fn9/f39/f35+fn5+fn9/f39/f35+fn5+fn9/f39/f35+fn5+fn9/f39/f35+fn5+fn9/f39/f35+fn5+fn9/f39/f35+fn5+fn9/f39/f35+fn5+fn9/f39/f35+fn5+fn9/f39/f35+fn5+fn9/f39/f35+fn5+fn9/f39/f35+fn5+fn9/f39/f35+fn5+fn9/f39/f35+fn5+fn9/f39/f35+fn5+fn9/f39/f35+fn5+fn9/f39/f35+fn5+fn9/f39/f35+fn5+fn9/f39/f35+fn5+fn9/f39/f35+fn5+fn9/f39/f35+fn5+fn9/f39/f35+fn5+fn9/f39/f35+fn5+fn9/f39/f35+fn5+fn9/f39/f35+fn5+fn9/f39/f35+fn5+fn9/f39/f35+fn5+fn9/f39/f35+fn5+fn9/f39/f35+fn5+fn9/f39/f35+fn5+fn9/f39/f35+fn5+fn9/f39/f35+fn5+fn9/f39/f35+fn5+fn9/f39/f35+fn5+fn9/f39/f35+fn5+fn9/f39/f35+fn5+fn9/f39/f35+fn5+fn9/f39/f35+fn5+fn9/f39/f35+fn5+fn9/f39/f35+fn5+fn9/f39/f35+fn5+fn9/f39/f35+fn5+fn9/f39/f35+fn5+fn9/f39/f35+fn5+fn9/f39/f35+fn5+fn9/f39/f35+fn5+fn9/f39/f35+fn5+fn9/f39/f35+fn5+fn9/f39/f35+fn5+fn9/f39/f35+fn5+fn9/f39/f35+fn5+fn9/f39/f35+fn5+fn9/f39/f35+fn5+fn9/f39/f35+fn5+fn9/f39/f35+fn5+fn9/f39/f35+fn5+fn9/f39/f35+fn5+fn9/f39/f35+fn5+fn9/f39/f35+fn5+fn9/f39/f35+fn5+fn9/f39/f35+fn5+fn9/f39/f35+fn5+fn9/f39/f35+fn5+fn9/f39/f35+fn5+fn9/f39/f35+fn5+fn9/f39/f35+fn5+fn9/f39/f35+fn5+fn9/f39/f35+fn5+fn9/f39/f35+fn5+fn9/f39/f35+fn5+fn9/f39/f35+fn5+fn9/f39/f35+fn5+fn9/f39/f35+fn5+fn9/f39/f35+fn5+fn9/f39/f35+fn5+fn9/f39/f35+fn5+fn9/f39/f35+fn5+fn9/f35+fn5+fn9/f35+fn5+fn9/f35+fn5+fn9/f35+fn5+fn9/f35+fn5+fn9/f35+fn5+fn9/f35+fn5+fn9/f35+fn5+fn9/f35+fn5+fn9/f35+fn5+fn9/f35+fn5+fn9/f35+fn5+fn9/f35+fn5+fn9/f35+fn5+fn9/f35+fn5+fn9/f35+fn5+fn9/f35+fn5+fn9/f35+fn5+fn9/f35+fn5+fn9/f35+fn5+fn9/f35+fn5+fn8='

export default function Layout({ children }) {
  const { user, logout, isAdmin } = useAuth();
  const { darkMode, toggleDarkMode } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [badges, setBadges] = useState({ inbox: 0, tickets: 0 });
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const prevBadgesRef = useRef({ inbox: 0, tickets: 0 });
  const audioRef = useRef(null);

  // Initialize audio element
  useEffect(() => {
    audioRef.current = new Audio(NOTIFICATION_SOUND);
    audioRef.current.volume = 0.5;
  }, []);

  // Request notification permission on mount
  useEffect(() => {
    if ('Notification' in window) {
      if (Notification.permission === 'granted') {
        setNotificationsEnabled(true);
      } else if (Notification.permission !== 'denied') {
        Notification.requestPermission().then(permission => {
          setNotificationsEnabled(permission === 'granted');
        });
      }
    }
  }, []);

  // Play notification sound
  const playNotificationSound = useCallback(() => {
    if (soundEnabled && audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(err => {
        console.log('Could not play notification sound:', err);
      });
    }
  }, [soundEnabled]);

  // Show browser notification
  const showNotification = useCallback((title, body, onClick) => {
    if (notificationsEnabled && 'Notification' in window && Notification.permission === 'granted') {
      const notification = new Notification(title, {
        body,
        icon: '/favicon.ico',
        badge: '/favicon.ico',
        tag: 'xbo-notification',
        renotify: true
      });
      notification.onclick = () => {
        window.focus();
        if (onClick) onClick();
        notification.close();
      };
    }
  }, [notificationsEnabled]);

  const fetchBadgeCounts = useCallback(async () => {
    try {
      const [inboxRes, ticketRes] = await Promise.all([
        api.get('/support/inbox/stats').catch((e) => {
          console.error('Failed to fetch inbox stats:', e);
          return { data: { open_count: 0, unread_conversations_count: 0 } };
        }),
        api.get('/tickets/stats').catch((e) => {
          console.error('Failed to fetch ticket stats:', e);
          return { data: { urgent_count: 0, breached_count: 0 } };
        })
      ]);

      // Convert to numbers and handle null/undefined/string values
      const unreadCount = parseInt(inboxRes.data?.unread_conversations_count) || 0;
      const urgentCount = parseInt(ticketRes.data?.urgent_count) || 0;
      const breachedCount = parseInt(ticketRes.data?.breached_count) || 0;
      const ticketBadge = urgentCount + breachedCount;

      // Check for new messages/tickets and notify
      if (prevBadgesRef.current.inbox < unreadCount) {
        const newMessages = unreadCount - prevBadgesRef.current.inbox;
        playNotificationSound();
        showNotification(
          'New Message',
          `You have ${newMessages} new unread ${newMessages === 1 ? 'message' : 'messages'}`,
          () => navigate('/inbox')
        );
      }
      if (prevBadgesRef.current.tickets < ticketBadge) {
        playNotificationSound();
        showNotification(
          'Ticket Alert',
          `You have ${ticketBadge} ${ticketBadge === 1 ? 'ticket' : 'tickets'} requiring attention`,
          () => navigate('/tickets')
        );
      }

      // Update previous values
      prevBadgesRef.current = { inbox: unreadCount, tickets: ticketBadge };

      // Badge shows unread conversations count
      setBadges({
        inbox: unreadCount,
        tickets: ticketBadge
      });
    } catch (error) {
      console.error('Failed to fetch badge counts:', error);
    }
  }, [playNotificationSound, showNotification, navigate]);

  useEffect(() => {
    fetchBadgeCounts();
    // Refresh count every 15 seconds
    const interval = setInterval(fetchBadgeCounts, 15000);
    return () => clearInterval(interval);
  }, [fetchBadgeCounts]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const toggleSound = () => {
    setSoundEnabled(!soundEnabled);
  };

  const NavLink = ({ item, mobile = false }) => {
    const isActive = location.pathname === item.href ||
      (item.href !== '/' && location.pathname.startsWith(item.href));
    const badgeCount = item.badgeKey ? badges[item.badgeKey] : 0;

    return (
      <Link
        to={item.href}
        onClick={() => mobile && setMobileMenuOpen(false)}
        className={`sidebar-link group ${
          isActive
            ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/25'
            : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700'
        }`}
      >
        <item.icon className={`w-5 h-5 ${isActive ? 'text-white' : 'text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300'}`} />
        <span className="font-medium text-sm flex-1">{item.name}</span>
        {badgeCount > 0 && (
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
            isActive
              ? 'bg-white/20 text-white'
              : item.badgeKey === 'tickets' ? 'bg-orange-500 text-white animate-pulse' : 'bg-red-500 text-white animate-pulse'
          }`}>
            {badgeCount > 99 ? '99+' : badgeCount}
          </span>
        )}
      </Link>
    );
  };

  const SidebarContent = ({ mobile = false }) => (
    <div className="flex flex-col h-full">
      {/* Logo - only on desktop */}
      {!mobile && (
        <div className="flex items-center gap-3 px-6 py-5">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/25">
            <Zap className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-lg text-slate-800 dark:text-white">XBO</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 -mt-0.5">Telegram Manager</p>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="px-4 mb-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search..."
            className="w-full pl-9 pr-4 py-2.5 bg-slate-100 dark:bg-slate-700 border-0 rounded-xl text-sm text-slate-700 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white dark:focus:bg-slate-600 transition-all"
          />
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        <p className="px-3 py-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Menu</p>
        {navigation.map((item) => (
          <NavLink key={item.name} item={item} mobile={mobile} />
        ))}

        <p className="px-3 py-2 mt-4 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Support</p>
        {supportNavigation.map((item) => (
          <NavLink key={item.name} item={item} mobile={mobile} />
        ))}

        {isAdmin && (
          <>
            <p className="px-3 py-2 mt-4 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Admin</p>
            {adminNavigation.map((item) => (
              <NavLink key={item.name} item={item} mobile={mobile} />
            ))}
          </>
        )}
      </nav>

      {/* User Card */}
      <div className="p-4">
        <div className="p-3 bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-700 dark:to-slate-800 rounded-2xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white font-semibold text-sm shadow-md">
              {user?.name?.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-800 dark:text-white truncate">{user?.name}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{user?.email}</p>
            </div>
            <button
              onClick={toggleSound}
              className={`p-2 rounded-lg transition-all ${
                soundEnabled
                  ? 'text-blue-500 hover:bg-blue-50 dark:hover:bg-slate-600'
                  : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-600'
              }`}
              title={soundEnabled ? 'Sound enabled' : 'Sound disabled'}
            >
              <Volume2 className="w-4 h-4" />
            </button>
            <button
              onClick={handleLogout}
              className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-white dark:hover:bg-slate-600 rounded-lg transition-all"
              title="Logout"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
        <p className="text-center text-xs text-slate-400 dark:text-slate-500 mt-3">v1.1.1</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50 dark:from-slate-900 dark:via-slate-900 dark:to-slate-900">
      {/* Mobile Header */}
      <header className="lg:hidden fixed top-0 left-0 right-0 z-40 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-b border-slate-200/50 dark:border-slate-700/50">
        <div className="flex items-center justify-between px-4 py-3">
          <button
            onClick={() => setMobileMenuOpen(true)}
            className="p-2 -ml-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl"
          >
            <Menu className="w-6 h-6" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center shadow-md shadow-blue-500/25">
              <Zap className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-slate-800 dark:text-white">XBO</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={toggleDarkMode}
              className="p-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl"
            >
              {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
            <button className="p-2 -mr-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl relative">
              <Bell className="w-5 h-5" />
              {(badges.inbox > 0 || badges.tickets > 0) && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/20 backdrop-blur-sm"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="absolute left-0 top-0 bottom-0 w-80 bg-white dark:bg-slate-800 shadow-2xl animate-slide-in">
            <div className="flex items-center justify-between px-4 py-4 border-b border-slate-100 dark:border-slate-700">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center shadow-md shadow-blue-500/25">
                  <Zap className="w-4 h-4 text-white" />
                </div>
                <span className="font-bold text-slate-800 dark:text-white">XBO</span>
              </div>
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <SidebarContent mobile />
          </div>
        </div>
      )}

      {/* Desktop Sidebar */}
      <aside className="hidden lg:block fixed left-0 top-0 bottom-0 w-64 bg-white dark:bg-slate-800 border-r border-slate-200/50 dark:border-slate-700/50">
        <SidebarContent />
      </aside>

      {/* Desktop Theme Toggle */}
      <button
        onClick={toggleDarkMode}
        className="hidden lg:flex fixed top-4 right-4 z-40 p-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm hover:shadow-md transition-all text-slate-600 dark:text-slate-400"
      >
        {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
      </button>

      {/* Main Content */}
      <main className="lg:ml-64 pt-16 lg:pt-0 min-h-screen">
        <div className="max-w-7xl mx-auto p-4 lg:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
