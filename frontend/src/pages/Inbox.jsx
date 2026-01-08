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
  ChevronRight
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
  const [stats, setStats] = useState({ open_count: 0, pending_count: 0, unassigned_count: 0 });

  useEffect(() => {
    fetchConversations();
    fetchStats();
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
          conversations.map((conv) => (
            <Link
              key={conv.id}
              to={`/inbox/${conv.id}`}
              className="flex items-center gap-4 p-4 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
            >
              {/* Avatar */}
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-400 to-purple-600 flex items-center justify-center text-white font-semibold flex-shrink-0">
                {conv.customer_name?.charAt(0).toUpperCase() || '?'}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-semibold text-slate-800 dark:text-white truncate">
                    {conv.customer_name || 'Unknown'}
                  </span>
                  {conv.telegram_username && (
                    <span className="text-sm text-slate-500 dark:text-slate-400 truncate">
                      @{conv.telegram_username}
                    </span>
                  )}
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-300 truncate">
                  {conv.last_message || 'No messages'}
                </p>
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-xs text-slate-400 dark:text-slate-500">
                    {conv.channel_title}
                  </span>
                  {conv.assigned_name && (
                    <span className="text-xs text-slate-400 dark:text-slate-500 flex items-center gap-1">
                      <User className="w-3 h-3" />
                      {conv.assigned_name}
                    </span>
                  )}
                </div>
              </div>

              {/* Meta */}
              <div className="flex flex-col items-end gap-2 flex-shrink-0">
                <span className="text-xs text-slate-400 dark:text-slate-500">
                  {formatTime(conv.last_message_time || conv.updated_at)}
                </span>
                <span className={`badge ${statusColors[conv.status]}`}>
                  {statusIcons[conv.status]}
                  {conv.status}
                </span>
              </div>

              <ChevronRight className="w-5 h-5 text-slate-300 dark:text-slate-600 flex-shrink-0" />
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
