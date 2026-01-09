import { useState, useEffect } from 'react';
import { getLogs, cleanupLogs } from '../utils/api';
import {
  AlertCircle, AlertTriangle, Info, CheckCircle,
  Search, Filter, Trash2, ChevronDown, ChevronUp,
  Calendar, RefreshCw, MessageSquare, Shield, Server, Radio
} from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';

const TYPE_CONFIG = {
  error: { icon: AlertCircle, color: 'text-red-500', bg: 'bg-red-100 dark:bg-red-900/30', badge: 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300' },
  warning: { icon: AlertTriangle, color: 'text-yellow-500', bg: 'bg-yellow-100 dark:bg-yellow-900/30', badge: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-300' },
  info: { icon: Info, color: 'text-blue-500', bg: 'bg-blue-100 dark:bg-blue-900/30', badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300' },
  success: { icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-100 dark:bg-green-900/30', badge: 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300' }
};

const CATEGORY_CONFIG = {
  telegram: { icon: MessageSquare, label: 'Telegram' },
  api: { icon: Server, label: 'API' },
  system: { icon: Radio, label: 'System' },
  auth: { icon: Shield, label: 'Auth' },
  channel: { icon: Radio, label: 'Channel' },
  support: { icon: MessageSquare, label: 'Support' }
};

export default function Logs() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ error: 0, warning: 0, info: 0, success: 0 });
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [expandedLog, setExpandedLog] = useState(null);
  const [filters, setFilters] = useState({
    type: '',
    category: '',
    search: '',
    start_date: '',
    end_date: ''
  });
  const [showFilters, setShowFilters] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const limit = 20;

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(loadLogs, 10000);
    return () => clearInterval(interval);
  }, [autoRefresh, page, filters]);

  useEffect(() => {
    loadLogs();
  }, [page, filters]);

  const loadLogs = async () => {
    try {
      setLoading(true);
      const params = {
        ...filters,
        limit,
        offset: page * limit
      };
      // Remove empty params
      Object.keys(params).forEach(key => {
        if (!params[key]) delete params[key];
      });

      const { data } = await getLogs(params);
      setLogs(data.logs);
      setTotal(data.total);
      setStats(data.stats);
    } catch (error) {
      toast.error('Failed to load logs');
    } finally {
      setLoading(false);
    }
  };

  const handleCleanup = async () => {
    if (!confirm('Delete all logs older than 30 days?')) return;

    try {
      const { data } = await cleanupLogs(30);
      toast.success(`Deleted ${data.deleted} old logs`);
      loadLogs();
    } catch (error) {
      toast.error('Failed to clean up logs');
    }
  };

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setPage(0);
  };

  const clearFilters = () => {
    setFilters({
      type: '',
      category: '',
      search: '',
      start_date: '',
      end_date: ''
    });
    setPage(0);
  };

  const totalPages = Math.ceil(total / limit);

  const parseDetails = (details) => {
    if (!details) return null;
    try {
      return typeof details === 'string' ? JSON.parse(details) : details;
    } catch {
      return null;
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800 dark:text-white">System Logs</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Monitor system events and errors</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={loadLogs}
            className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
          <button
            onClick={handleCleanup}
            className="flex items-center gap-2 px-4 py-2 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            Clear Old Logs
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Object.entries(TYPE_CONFIG).map(([type, config]) => {
          const Icon = config.icon;
          return (
            <div
              key={type}
              onClick={() => handleFilterChange('type', filters.type === type ? '' : type)}
              className={`p-4 rounded-xl border cursor-pointer transition-all ${
                filters.type === type
                  ? 'border-blue-500 ring-2 ring-blue-200 dark:ring-blue-800'
                  : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
              } bg-white dark:bg-slate-800`}
            >
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${config.bg}`}>
                  <Icon className={`w-5 h-5 ${config.color}`} />
                </div>
                <div>
                  <p className="text-2xl font-bold text-slate-800 dark:text-white">{stats[type] || 0}</p>
                  <p className="text-sm text-slate-500 dark:text-slate-400 capitalize">{type} (24h)</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
        <div className="flex flex-col md:flex-row gap-4">
          {/* Search */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search logs..."
              value={filters.search}
              onChange={(e) => handleFilterChange('search', e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-800 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Category Filter */}
          <select
            value={filters.category}
            onChange={(e) => handleFilterChange('category', e.target.value)}
            className="px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-800 dark:text-white focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Categories</option>
            {Object.entries(CATEGORY_CONFIG).map(([key, config]) => (
              <option key={key} value={key}>{config.label}</option>
            ))}
          </select>

          {/* Toggle Advanced Filters */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center gap-2 px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
          >
            <Filter className="w-4 h-4" />
            Filters
            {showFilters ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {(filters.type || filters.category || filters.search || filters.start_date || filters.end_date) && (
            <button
              onClick={clearFilters}
              className="px-4 py-2 text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white transition-colors"
            >
              Clear
            </button>
          )}
        </div>

        {/* Advanced Filters */}
        {showFilters && (
          <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Start Date
              </label>
              <input
                type="date"
                value={filters.start_date}
                onChange={(e) => handleFilterChange('start_date', e.target.value)}
                className="w-full px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-800 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                End Date
              </label>
              <input
                type="date"
                value={filters.end_date}
                onChange={(e) => handleFilterChange('end_date', e.target.value)}
                className="w-full px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-800 dark:text-white"
              />
            </div>
          </div>
        )}
      </div>

      {/* Logs Table */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-500 dark:text-slate-400">
            Loading logs...
          </div>
        ) : logs.length === 0 ? (
          <div className="p-8 text-center text-slate-500 dark:text-slate-400">
            No logs found
          </div>
        ) : (
          <div className="divide-y divide-slate-200 dark:divide-slate-700">
            {logs.map((log) => {
              const typeConfig = TYPE_CONFIG[log.type] || TYPE_CONFIG.info;
              const categoryConfig = CATEGORY_CONFIG[log.category] || CATEGORY_CONFIG.system;
              const TypeIcon = typeConfig.icon;
              const CategoryIcon = categoryConfig.icon;
              const details = parseDetails(log.details);
              const isExpanded = expandedLog === log.id;

              return (
                <div key={log.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                  <div
                    className="p-4 cursor-pointer"
                    onClick={() => setExpandedLog(isExpanded ? null : log.id)}
                  >
                    <div className="flex items-start gap-4">
                      {/* Type Icon */}
                      <div className={`p-2 rounded-lg ${typeConfig.bg} mt-0.5`}>
                        <TypeIcon className={`w-4 h-4 ${typeConfig.color}`} />
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${typeConfig.badge}`}>
                            {log.type}
                          </span>
                          <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300">
                            {categoryConfig.label}
                          </span>
                          {log.announcement_title && (
                            <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300">
                              {log.announcement_title}
                            </span>
                          )}
                          {log.channel_title && (
                            <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-cyan-100 text-cyan-700 dark:bg-cyan-900/50 dark:text-cyan-300">
                              {log.channel_title}
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-slate-800 dark:text-white">{log.message}</p>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                          {format(new Date(log.timestamp), 'MMM d, yyyy HH:mm:ss')}
                          {log.user_name && ` - by ${log.user_name}`}
                        </p>
                      </div>

                      {/* Expand Icon */}
                      {details && (
                        <div className="text-slate-400">
                          {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Expanded Details */}
                  {isExpanded && details && (
                    <div className="px-4 pb-4 ml-14">
                      <div className="p-4 bg-slate-50 dark:bg-slate-900 rounded-lg">
                        <h4 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Details</h4>
                        <pre className="text-xs text-slate-600 dark:text-slate-400 overflow-x-auto whitespace-pre-wrap">
                          {JSON.stringify(details, null, 2)}
                        </pre>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Showing {page * limit + 1} to {Math.min((page + 1) * limit, total)} of {total} logs
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                className="px-3 py-1 border border-slate-200 dark:border-slate-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
              >
                Previous
              </button>
              <button
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="px-3 py-1 border border-slate-200 dark:border-slate-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
