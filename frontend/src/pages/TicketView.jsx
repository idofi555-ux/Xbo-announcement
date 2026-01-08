import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { useAuth } from '../hooks/useAuth';
import {
  Ticket,
  ArrowLeft,
  Clock,
  User,
  MessageSquare,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Send,
  Tag,
  Calendar,
  Activity,
  Edit2
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import toast from 'react-hot-toast';

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
  waiting_customer: 'Waiting for Customer',
  resolved: 'Resolved',
  closed: 'Closed'
};

const slaStatusConfig = {
  on_track: { color: 'text-green-600 dark:text-green-400', bg: 'bg-green-50 dark:bg-green-900/20', label: 'On Track', Icon: CheckCircle },
  at_risk: { color: 'text-yellow-600 dark:text-yellow-400', bg: 'bg-yellow-50 dark:bg-yellow-900/20', label: 'At Risk', Icon: AlertTriangle },
  breached: { color: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-900/20', label: 'Breached', Icon: XCircle },
  met: { color: 'text-green-600 dark:text-green-400', bg: 'bg-green-50 dark:bg-green-900/20', label: 'Met', Icon: CheckCircle }
};

export default function TicketView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [ticket, setTicket] = useState(null);
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState([]);
  const [replyContent, setReplyContent] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    fetchTicket();
    fetchUsers();
  }, [id]);

  const fetchTicket = async () => {
    try {
      const response = await api.get(`/tickets/${id}`);
      setTicket(response.data);
    } catch (error) {
      console.error('Error fetching ticket:', error);
      toast.error('Failed to load ticket');
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async () => {
    try {
      const response = await api.get('/auth/users');
      setUsers(response.data);
    } catch (error) {
      console.error('Error fetching users:', error);
    }
  };

  const updateTicket = async (updates) => {
    try {
      await api.patch(`/tickets/${id}`, updates);
      fetchTicket();
      toast.success('Ticket updated');
    } catch (error) {
      toast.error('Failed to update ticket');
    }
  };

  const sendReply = async () => {
    if (!replyContent.trim() || !ticket.conversation_id) return;

    setSending(true);
    try {
      await api.post(`/support/conversations/${ticket.conversation_id}/reply`, {
        content: replyContent
      });

      // Record first response if not yet recorded
      if (!ticket.first_response_at) {
        await api.post(`/tickets/${id}/first-response`);
      }

      setReplyContent('');
      fetchTicket();
      toast.success('Reply sent');
    } catch (error) {
      toast.error('Failed to send reply');
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-purple-500/30 border-t-purple-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="text-center py-12">
        <p className="text-slate-500 dark:text-slate-400">Ticket not found</p>
        <Link to="/tickets" className="text-blue-600 hover:underline mt-2 inline-block">
          Back to Tickets
        </Link>
      </div>
    );
  }

  const SLACard = ({ title, status, dueTime, completedAt }) => {
    if (!status) return null;
    const config = slaStatusConfig[status] || slaStatusConfig.on_track;
    const Icon = config.Icon;

    return (
      <div className={`p-3 rounded-lg ${config.bg}`}>
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-500 dark:text-slate-400">{title}</span>
          <Icon className={`w-4 h-4 ${config.color}`} />
        </div>
        <p className={`text-sm font-medium mt-1 ${config.color}`}>{config.label}</p>
        {dueTime && (
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {completedAt ? (
              <>Completed {format(new Date(completedAt), 'MMM d, HH:mm')}</>
            ) : (
              <>Due {formatDistanceToNow(new Date(dueTime), { addSuffix: true })}</>
            )}
          </p>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate('/tickets')}
          className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-slate-600 dark:text-slate-300" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <span className="text-sm font-mono text-slate-500 dark:text-slate-400">#{ticket.id}</span>
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${priorityColors[ticket.priority]}`}>
              {ticket.priority}
            </span>
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[ticket.status]}`}>
              {statusLabels[ticket.status]}
            </span>
          </div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-white mt-1">{ticket.subject}</h1>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Messages */}
          <div className="card">
            <div className="p-4 border-b border-slate-200 dark:border-slate-700">
              <h2 className="font-semibold text-slate-800 dark:text-white flex items-center gap-2">
                <MessageSquare className="w-4 h-4" />
                Conversation
              </h2>
            </div>
            <div className="p-4 space-y-4 max-h-[500px] overflow-y-auto">
              {ticket.messages?.length === 0 ? (
                <p className="text-slate-500 dark:text-slate-400 text-center py-8">No messages yet</p>
              ) : (
                ticket.messages?.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex ${msg.direction === 'out' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[80%] rounded-2xl px-4 py-2 ${
                        msg.direction === 'out'
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-white'
                      }`}
                    >
                      <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                      <div className={`text-xs mt-1 ${msg.direction === 'out' ? 'text-blue-200' : 'text-slate-400'}`}>
                        {msg.sender_name} - {format(new Date(msg.timestamp), 'MMM d, HH:mm')}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Reply Box */}
            {ticket.status !== 'closed' && (
              <div className="p-4 border-t border-slate-200 dark:border-slate-700">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={replyContent}
                    onChange={(e) => setReplyContent(e.target.value)}
                    placeholder="Type your reply..."
                    className="input flex-1"
                    onKeyPress={(e) => e.key === 'Enter' && sendReply()}
                  />
                  <button
                    onClick={sendReply}
                    disabled={sending || !replyContent.trim()}
                    className="btn btn-primary"
                  >
                    {sending ? (
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Activity Timeline */}
          <div className="card">
            <div className="p-4 border-b border-slate-200 dark:border-slate-700">
              <h2 className="font-semibold text-slate-800 dark:text-white flex items-center gap-2">
                <Activity className="w-4 h-4" />
                Activity
              </h2>
            </div>
            <div className="p-4">
              {ticket.activity?.length === 0 ? (
                <p className="text-slate-500 dark:text-slate-400 text-center py-4">No activity yet</p>
              ) : (
                <div className="space-y-3">
                  {ticket.activity?.map((activity) => (
                    <div key={activity.id} className="flex items-start gap-3">
                      <div className="w-2 h-2 bg-blue-500 rounded-full mt-2" />
                      <div className="flex-1">
                        <p className="text-sm text-slate-700 dark:text-slate-300">
                          <span className="font-medium">{activity.user_name || 'System'}</span>
                          {' - '}
                          {activity.action.replace('_', ' ')}
                          {activity.new_value && (
                            <span className="text-slate-500 dark:text-slate-400">
                              : {activity.new_value}
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-slate-400 dark:text-slate-500">
                          {format(new Date(activity.created_at), 'MMM d, yyyy HH:mm')}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* SLA Status */}
          <div className="card p-4">
            <h3 className="font-semibold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
              <Clock className="w-4 h-4" />
              SLA Status
            </h3>
            <div className="space-y-3">
              <SLACard
                title="First Response"
                status={ticket.sla_first_response_status}
                dueTime={ticket.sla_first_response_due}
                completedAt={ticket.first_response_at}
              />
              <SLACard
                title="Resolution"
                status={ticket.sla_resolution_status}
                dueTime={ticket.sla_resolution_due}
                completedAt={ticket.resolved_at}
              />
            </div>
          </div>

          {/* Details */}
          <div className="card p-4">
            <h3 className="font-semibold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
              <Edit2 className="w-4 h-4" />
              Details
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Status</label>
                <select
                  value={ticket.status}
                  onChange={(e) => updateTicket({ status: e.target.value })}
                  className="input w-full"
                >
                  <option value="new">New</option>
                  <option value="in_progress">In Progress</option>
                  <option value="waiting_customer">Waiting for Customer</option>
                  <option value="resolved">Resolved</option>
                  <option value="closed">Closed</option>
                </select>
              </div>

              <div>
                <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Priority</label>
                <select
                  value={ticket.priority}
                  onChange={(e) => updateTicket({ priority: e.target.value })}
                  className="input w-full"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>

              <div>
                <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Category</label>
                <select
                  value={ticket.category || 'support'}
                  onChange={(e) => updateTicket({ category: e.target.value })}
                  className="input w-full"
                >
                  <option value="support">Support</option>
                  <option value="sales">Sales</option>
                  <option value="technical">Technical</option>
                  <option value="billing">Billing</option>
                </select>
              </div>

              <div>
                <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Assigned To</label>
                <select
                  value={ticket.assigned_to || ''}
                  onChange={(e) => updateTicket({ assigned_to: e.target.value || null })}
                  className="input w-full"
                >
                  <option value="">Unassigned</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Customer Info */}
          <div className="card p-4">
            <h3 className="font-semibold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
              <User className="w-4 h-4" />
              Customer
            </h3>
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-slate-200 dark:bg-slate-600 rounded-full flex items-center justify-center">
                  <User className="w-5 h-5 text-slate-500 dark:text-slate-300" />
                </div>
                <div>
                  <p className="font-medium text-slate-800 dark:text-white">{ticket.customer_name || 'Unknown'}</p>
                  {ticket.customer_username && (
                    <p className="text-sm text-slate-500 dark:text-slate-400">@{ticket.customer_username}</p>
                  )}
                </div>
              </div>
              {ticket.conversation_id && (
                <Link
                  to={`/inbox/${ticket.conversation_id}`}
                  className="text-sm text-blue-600 dark:text-blue-400 hover:underline block mt-2"
                >
                  View full conversation
                </Link>
              )}
            </div>
          </div>

          {/* Timestamps */}
          <div className="card p-4">
            <h3 className="font-semibold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              Timeline
            </h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-slate-400">Created</span>
                <span className="text-slate-700 dark:text-slate-300">
                  {format(new Date(ticket.created_at), 'MMM d, yyyy HH:mm')}
                </span>
              </div>
              {ticket.first_response_at && (
                <div className="flex justify-between">
                  <span className="text-slate-500 dark:text-slate-400">First Response</span>
                  <span className="text-slate-700 dark:text-slate-300">
                    {format(new Date(ticket.first_response_at), 'MMM d, yyyy HH:mm')}
                  </span>
                </div>
              )}
              {ticket.resolved_at && (
                <div className="flex justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Resolved</span>
                  <span className="text-slate-700 dark:text-slate-300">
                    {format(new Date(ticket.resolved_at), 'MMM d, yyyy HH:mm')}
                  </span>
                </div>
              )}
              {ticket.closed_at && (
                <div className="flex justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Closed</span>
                  <span className="text-slate-700 dark:text-slate-300">
                    {format(new Date(ticket.closed_at), 'MMM d, yyyy HH:mm')}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
