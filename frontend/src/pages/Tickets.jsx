import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../utils/api';
import {
  Ticket,
  Search,
  Filter,
  Clock,
  AlertTriangle,
  CheckCircle,
  XCircle,
  User,
  MessageSquare,
  ArrowUpDown
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

const priorityColors = {
  low: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  medium: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  high: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  urgent: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
};

const statusColors = {
  new: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  in_progress: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  waiting_customer: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  resolved: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  closed: 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300'
};

const statusLabels = {
  new: 'New',
  in_progress: 'In Progress',
  waiting_customer: 'Waiting',
  resolved: 'Resolved',
  closed: 'Closed'
};

const slaStatusColors = {
  on_track: 'text-green-600 dark:text-green-400',
  at_risk: 'text-yellow-600 dark:text-yellow-400',
  breached: 'text-red-600 dark:text-red-400',
  met: 'text-green-600 dark:text-green-400'
};

const SLAIndicator = ({ status, dueTime, label }) => {
  if (!status) return null;

  const Icon = status === 'breached' ? XCircle : status === 'at_risk' ? AlertTriangle : CheckCircle;
  const timeLeft = dueTime ? formatDistanceToNow(new Date(dueTime), { addSuffix: true }) : '';

  return (
    <div className={`flex items-center gap-1 text-xs ${slaStatusColors[status]}`}>
      <Icon className="w-3 h-3" />
      <span>{label}: {status === 'breached' ? 'Breached' : status === 'met' ? 'Met' : timeLeft}</span>
    </div>
  );
};

export default function Tickets() {
  const [tickets, setTickets] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    status: 'all',
    priority: 'all',
    assigned: '',
    sort: 'newest'
  });
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetchTickets();
    fetchStats();
  }, [filters]);

  const fetchTickets = async () => {
    try {
      const params = new URLSearchParams();
      if (filters.status !== 'all') params.append('status', filters.status);
      if (filters.priority !== 'all') params.append('priority', filters.priority);
      if (filters.assigned) params.append('assigned', filters.assigned);
      params.append('sort', filters.sort);

      const response = await api.get(`/tickets?${params.toString()}`);
      setTickets(response.data);
    } catch (error) {
      console.error('Error fetching tickets:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await api.get('/tickets/stats');
      setStats(response.data);
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  const filteredTickets = tickets.filter(ticket => {
    if (!search) return true;
    const searchLower = search.toLowerCase();
    return (
      ticket.subject?.toLowerCase().includes(searchLower) ||
      ticket.customer_name?.toLowerCase().includes(searchLower) ||
      ticket.id.toString().includes(searchLower)
    );
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-3">
            <div className="p-2 bg-purple-50 dark:bg-purple-900/30 rounded-xl">
              <Ticket className="w-6 h-6 text-purple-600 dark:text-purple-400" />
            </div>
            Tickets
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            Manage support tickets and track SLA compliance
          </p>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          <div className="card p-4">
            <p className="text-xs text-slate-500 dark:text-slate-400">Open</p>
            <p className="text-2xl font-bold text-slate-800 dark:text-white">{stats.open_count || 0}</p>
          </div>
          <div className="card p-4">
            <p className="text-xs text-slate-500 dark:text-slate-400">Urgent</p>
            <p className="text-2xl font-bold text-red-600 dark:text-red-400">{stats.urgent_count || 0}</p>
          </div>
          <div className="card p-4">
            <p className="text-xs text-slate-500 dark:text-slate-400">Breached</p>
            <p className="text-2xl font-bold text-red-600 dark:text-red-400">{stats.breached_count || 0}</p>
          </div>
          <div className="card p-4">
            <p className="text-xs text-slate-500 dark:text-slate-400">Avg Response</p>
            <p className="text-2xl font-bold text-slate-800 dark:text-white">
              {stats.avg_first_response_hours ? `${stats.avg_first_response_hours.toFixed(1)}h` : '-'}
            </p>
          </div>
          <div className="card p-4">
            <p className="text-xs text-slate-500 dark:text-slate-400">Response SLA</p>
            <p className="text-2xl font-bold text-green-600 dark:text-green-400">{stats.sla_first_response_compliance || 100}%</p>
          </div>
          <div className="card p-4">
            <p className="text-xs text-slate-500 dark:text-slate-400">Resolution SLA</p>
            <p className="text-2xl font-bold text-green-600 dark:text-green-400">{stats.sla_resolution_compliance || 100}%</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="card p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search tickets..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input pl-10 w-full"
            />
          </div>

          <select
            value={filters.status}
            onChange={(e) => setFilters({ ...filters, status: e.target.value })}
            className="input min-w-[140px]"
          >
            <option value="all">All Status</option>
            <option value="new">New</option>
            <option value="in_progress">In Progress</option>
            <option value="waiting_customer">Waiting</option>
            <option value="resolved">Resolved</option>
            <option value="closed">Closed</option>
          </select>

          <select
            value={filters.priority}
            onChange={(e) => setFilters({ ...filters, priority: e.target.value })}
            className="input min-w-[140px]"
          >
            <option value="all">All Priority</option>
            <option value="urgent">Urgent</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>

          <select
            value={filters.sort}
            onChange={(e) => setFilters({ ...filters, sort: e.target.value })}
            className="input min-w-[140px]"
          >
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
            <option value="priority">By Priority</option>
            <option value="updated">Last Updated</option>
          </select>
        </div>
      </div>

      {/* Tickets Table */}
      {loading ? (
        <div className="card p-8 text-center">
          <div className="w-8 h-8 border-2 border-purple-500/30 border-t-purple-500 rounded-full animate-spin mx-auto" />
          <p className="text-slate-500 dark:text-slate-400 mt-3">Loading tickets...</p>
        </div>
      ) : filteredTickets.length === 0 ? (
        <div className="card p-12 text-center">
          <div className="w-16 h-16 bg-slate-100 dark:bg-slate-700 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Ticket className="w-8 h-8 text-slate-400" />
          </div>
          <h3 className="text-lg font-semibold text-slate-800 dark:text-white mb-2">No tickets found</h3>
          <p className="text-slate-500 dark:text-slate-400">
            Tickets will appear here when created from conversations
          </p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 dark:bg-slate-800/50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">ID</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Subject</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Customer</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Priority</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Assigned</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">SLA</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                {filteredTickets.map((ticket) => (
                  <tr
                    key={ticket.id}
                    className="hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors"
                    onClick={() => window.location.href = `/tickets/${ticket.id}`}
                  >
                    <td className="px-4 py-3">
                      <span className="text-sm font-mono text-slate-600 dark:text-slate-300">#{ticket.id}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div>
                        <p className="text-sm font-medium text-slate-800 dark:text-white truncate max-w-[200px]">
                          {ticket.subject}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {ticket.channel_title}
                        </p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 bg-slate-200 dark:bg-slate-600 rounded-full flex items-center justify-center">
                          <User className="w-4 h-4 text-slate-500 dark:text-slate-300" />
                        </div>
                        <span className="text-sm text-slate-700 dark:text-slate-300">{ticket.customer_name || 'Unknown'}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${priorityColors[ticket.priority]}`}>
                        {ticket.priority}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[ticket.status]}`}>
                        {statusLabels[ticket.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-slate-600 dark:text-slate-300">
                        {ticket.assigned_name || '-'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="space-y-1">
                        <SLAIndicator
                          status={ticket.sla_first_response_status}
                          dueTime={ticket.sla_first_response_due}
                          label="Response"
                        />
                        <SLAIndicator
                          status={ticket.sla_resolution_status}
                          dueTime={ticket.sla_resolution_due}
                          label="Resolution"
                        />
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 text-sm text-slate-500 dark:text-slate-400">
                        <Clock className="w-3 h-3" />
                        {formatDistanceToNow(new Date(ticket.created_at), { addSuffix: true })}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
