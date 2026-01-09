import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import api from '../utils/api';
import {
  Inbox as InboxIcon,
  Search,
  Filter,
  Clock,
  User,
  MessageCircle,
  CheckCircle,
  AlertCircle,
  ChevronRight,
  Users
} from 'lucide-react';
import toast from 'react-hot-toast';

const statusColors = {
  open: 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  pending: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  closed: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400'
};

const statusIcons = {
  open: <AlertCircle className="w-3.5 h-3.5" />,
  pending: <Clock className="w-3.5 h-3.5" />,
  closed: <CheckCircle className="w-3.5 h-3.5" />
};

export default function Inbox() {
  const { user } = useAuth();
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [stats, setStats] = useState({ open_count: 0, pending_count: 0, unassigned_count: 0, unread_conversations_count: 0 });

  useEffect(() => {
    fetchConversations();
    fetchStats();
    // Auto-refresh every 15 seconds
    const interval = setInterval(() => {
      fetchConversations();
      fetchStats();
    }, 15000);
    return () => clearInterval(interval);
  }, [filter, search]);

  const fetchConversations = async () => {
    try {
      const params = new URLSearchParams();
      if (filter !== 'all') params.append('status', filter);
      if (search) params.append('search', search);

      const response = await api.get(`/support/conversations?${params}`);
      setConversations(response.data);
    } catch (error) {
      toast.error('Failed to fetch conversations');
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await api.get('/support/inbox/stats');
      setStats(response.data);
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    }
  };

  const formatTime = (timestamp) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;

    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
    return date.toLocaleDateString();
  };

  const filters = [
    { key: 'all', label: 'All', count: null },
    { key: 'open', label: 'Open', count: stats.open_count },
    { key: 'pending', label: 'Pending', count: stats.pending_count },
    { key: 'unassigned', label: 'Unassigned', count: stats.unassigned_count },
    { key: 'closed', label: 'Closed', count: null }
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-3">
            <div className="p-2 bg-purple-50 dark:bg-purple-900/30 rounded-xl">
              <InboxIcon className="w-6 h-6 text-purple-600 dark:text-purple-400" />
            </div>
            Inbox
            {stats.unread_conversations_count > 0 && (
              <span className="px-2.5 py-1 bg-red-500 text-white text-sm font-bold rounded-full animate-pulse">
                {stats.unread_conversations_count} unread
              </span>
            )}
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            Manage customer conversations from all channels
          </p>
        </div>
      </div>

      {/* Filters and Search */}
      <div className="card p-4">
        <div className="flex flex-col lg:flex-row gap-4">
          {/* Filter buttons */}
          <div className="flex flex-wrap gap-2">
            {filters.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                  filter === f.key
                    ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/25'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600'
                }`}
              >
                {f.label}
                {f.count !== null && f.count > 0 && (
                  <span className={`ml-2 px-2 py-0.5 rounded-full text-xs ${
                    filter === f.key
                      ? 'bg-white/20 text-white'
                      : 'bg-slate-200 text-slate-600 dark:bg-slate-600 dark:text-slate-300'
                  }`}>
                    {f.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="flex-1 lg:max-w-xs lg:ml-auto">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search conversations..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="input pl-10"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Conversations List */}
      <div className="card divide-y divide-slate-100 dark:divide-slate-700">
        {loading ? (
          <div className="p-8 text-center">
            <div className="w-8 h-8 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin mx-auto" />
            <p className="text-slate-500 dark:text-slate-400 mt-3">Loading conversations...</p>
          </div>
        ) : conversations.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-16 h-16 bg-slate-100 dark:bg-slate-700 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <MessageCircle className="w-8 h-8 text-slate-400" />
            </div>
            <h3 className="text-lg font-semibold text-slate-800 dark:text-white mb-2">No conversations</h3>
            <p className="text-slate-500 dark:text-slate-400">
              {filter === 'all'
                ? 'Messages from your Telegram groups will appear here'
                : `No ${filter} conversations found`}
            </p>
          </div>
        ) : (
          conversations.map((conv) => {
            const isUnread = parseInt(conv.unread_count) > 0;
            return (
              <Link
                key={conv.id}
                to={`/inbox/${conv.id}`}
                className={`flex items-center gap-4 p-4 transition-colors relative ${
                  isUnread
                    ? 'bg-blue-50/50 dark:bg-blue-900/10 hover:bg-blue-50 dark:hover:bg-blue-900/20 border-l-4 border-l-blue-500'
                    : 'hover:bg-slate-50 dark:hover:bg-slate-700/50'
                }`}
              >
                {/* Group Icon */}
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-white flex-shrink-0 ${
                  isUnread
                    ? 'bg-gradient-to-br from-blue-500 to-blue-700 shadow-lg shadow-blue-500/25'
                    : 'bg-gradient-to-br from-blue-400 to-blue-600'
                }`}>
                  <Users className="w-6 h-6" />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  {/* Line 1: Group Name */}
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className={`truncate ${isUnread ? 'font-extrabold text-slate-900 dark:text-white' : 'font-bold text-slate-800 dark:text-white'}`}>
                      {conv.channel_title || 'Unknown Group'}
                    </span>
                    {isUnread && (
                      <span className="px-2 py-0.5 bg-blue-500 text-white text-xs font-bold rounded-full animate-pulse">
                        {conv.unread_count > 1 ? `${conv.unread_count} NEW` : 'NEW'}
                      </span>
                    )}
                  </div>
                  {/* Line 2: From User */}
                  <div className={`flex items-center gap-1 text-sm mb-1 ${isUnread ? 'text-slate-700 dark:text-slate-200 font-medium' : 'text-slate-600 dark:text-slate-300'}`}>
                    <span className="text-slate-400 dark:text-slate-500">From:</span>
                    <span className={isUnread ? 'font-semibold' : 'font-medium'}>{conv.customer_name || 'Unknown'}</span>
                    {conv.telegram_username && (
                      <span className="text-slate-500 dark:text-slate-400">@{conv.telegram_username}</span>
                    )}
                  </div>
                  {/* Line 3: Message Preview */}
                  <p className={`text-sm truncate ${isUnread ? 'text-slate-700 dark:text-slate-300 font-medium' : 'text-slate-500 dark:text-slate-400'}`}>
                    {conv.last_message || 'No messages'}
                  </p>
                  {/* Assigned to */}
                  {conv.assigned_name && (
                    <div className="flex items-center gap-1 mt-1 text-xs text-slate-400 dark:text-slate-500">
                      <User className="w-3 h-3" />
                      Assigned to {conv.assigned_name}
                    </div>
                  )}
                </div>

                {/* Meta */}
                <div className="flex flex-col items-end gap-2 flex-shrink-0">
                  <span className={`text-xs ${isUnread ? 'text-blue-600 dark:text-blue-400 font-semibold' : 'text-slate-400 dark:text-slate-500'}`}>
                    {formatTime(conv.last_message_time || conv.updated_at)}
                  </span>
                  <span className={`badge ${statusColors[conv.status]}`}>
                    {statusIcons[conv.status]}
                    {conv.status}
                  </span>
                </div>

                <ChevronRight className={`w-5 h-5 flex-shrink-0 ${isUnread ? 'text-blue-400 dark:text-blue-500' : 'text-slate-300 dark:text-slate-600'}`} />
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}
