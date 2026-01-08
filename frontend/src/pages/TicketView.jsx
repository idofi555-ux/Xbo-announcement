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
  const [internalNote, setInternalNote] = useState('');
  const [addingNote, setAddingNote] = useState(false);

  useEffect(() => {
    fetchTicket();
    fetchUsers();
  }, [id]);

  const fetchTicket = async () => {
    try {
      const response = await api.get(`/tickets/${id}`);
      // Ensure messages and activity are arrays
      const ticketData = response.data;
      if (ticketData) {
        ticketData.messages = Array.isArray(ticketData.messages) ? ticketData.messages : [];
        ticketData.activity = Array.isArray(ticketData.activity) ? ticketData.activity : [];
      }
      setTicket(ticketData);
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
      // Ensure we always have an array
      setUsers(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.error('Error fetching users:', error);
      setUsers([]); // Set empty array on error
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

  const addInternalNote = async () => {
    if (!internalNote.trim()) return;

    setAddingNote(true);
    try {
      await api.post(`/tickets/${id}/note`, { content: internalNote });
      setInternalNote('');
      fetchTicket();
      toast.success('Note added');
    } catch (error) {
      toast.error('Failed to add note');
    } finally {
      setAddingNote(false);
    }
  };

  const closeTicket = async () => {
    try {
      await api.patch(`/tickets/${id}`, { status: 'closed' });
      fetchTicket();
      toast.success('Ticket closed');
    } catch (error) {
      toast.error('Failed to close ticket');
    }
  };

  const reopenTicket = async () => {
    try {
      await api.patch(`/tickets/${id}`, { status: 'in_progress' });
      fetchTicket();
      toast.success('Ticket reopened');
    } catch (error) {
      toast.error('Failed to reopen ticket');
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    try {
      return format(new Date(dateString), 'MMM d, HH:mm');
    } catch {
      return '-';
    }
  };

  const formatFullDate = (dateString) => {
    if (!dateString) return '-';
    try {
      return format(new Date(dateString), 'MMM d, yyyy HH:mm');
    } catch {
      return '-';
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

  const formatTimeRemaining = (dateString) => {
    if (!dateString) return '';
    try {
      return formatDistanceToNow(new Date(dateString), { addSuffix: true });
    } catch {
      return '';
    }
  };

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
              <>Completed {formatDate(completedAt)}</>
            ) : (
              <>Due {formatTimeRemaining(dueTime)}</>
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
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${priorityColors[ticket.priority] || priorityColors.medium}`}>
              {ticket.priority || 'medium'}
            </span>
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[ticket.status] || statusColors.new}`}>
              {statusLabels[ticket.status] || 'New'}
            </span>
          </div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-white mt-1">{ticket.subject}</h1>
        </div>

        {/* Quick Action Buttons */}
        <div className="flex items-center gap-2">
          {ticket.status === 'closed' ? (
            <button
              onClick={reopenTicket}
              className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
            >
              <CheckCircle className="w-4 h-4" />
              Reopen Ticket
            </button>
          ) : (
            <button
              onClick={closeTicket}
              className="px-4 py-2 bg-slate-500 hover:bg-slate-600 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
            >
              <XCircle className="w-4 h-4" />
              Close Ticket
            </button>
          )}
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
              {(!ticket.messages || ticket.messages.length === 0) ? (
                <p className="text-slate-500 dark:text-slate-400 text-center py-8">No messages yet</p>
              ) : (
                ticket.messages.map((msg) => {
                  const isOutgoing = msg.direction === 'out';
                  return (
                    <div
                      key={msg.id}
                      className={`flex ${isOutgoing ? 'justify-end' : 'justify-start'}`}
                    >
                      <div className={`max-w-[80%] ${isOutgoing ? '' : ''}`}>
                        {/* Show "Received in group" for incoming messages */}
                        {!isOutgoing && (
                          <div className="text-xs text-slate-400 mb-1 flex items-center gap-1">
                            <span>From user in {ticket.channel_title || 'group'}</span>
                          </div>
                        )}
                        <div
                          className={`rounded-2xl px-4 py-2 ${
                            isOutgoing
                              ? 'bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-white'
                              : 'bg-blue-600 text-white'
                          }`}
                        >
                          <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                          <div className={`text-xs mt-1 ${isOutgoing ? 'text-slate-500 dark:text-slate-400' : 'text-blue-200'}`}>
                            {msg.sender_name || (isOutgoing ? 'Admin' : 'User')} - {formatDate(msg.timestamp)}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
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

          {/* Internal Notes */}
          <div className="card">
            <div className="p-4 border-b border-slate-200 dark:border-slate-700">
              <h2 className="font-semibold text-slate-800 dark:text-white flex items-center gap-2">
                <Tag className="w-4 h-4" />
                Internal Notes
              </h2>
            </div>
            <div className="p-4">
              {/* Add Note */}
              <div className="flex gap-2 mb-4">
                <textarea
                  value={internalNote}
                  onChange={(e) => setInternalNote(e.target.value)}
                  placeholder="Add an internal note (not visible to customer)..."
                  className="input flex-1 min-h-[80px] resize-none"
                />
                <button
                  onClick={addInternalNote}
                  disabled={addingNote || !internalNote.trim()}
                  className="btn btn-secondary self-end"
                >
                  {addingNote ? (
                    <div className="w-4 h-4 border-2 border-slate-400/30 border-t-slate-400 rounded-full animate-spin" />
                  ) : (
                    'Add Note'
                  )}
                </button>
              </div>

              {/* Notes List - filter activity for notes */}
              {(!ticket.activity || ticket.activity.filter(a => a.action === 'note_added').length === 0) ? (
                <p className="text-slate-500 dark:text-slate-400 text-center py-4 text-sm">No internal notes yet</p>
              ) : (
                <div className="space-y-3">
                  {ticket.activity.filter(a => a.action === 'note_added').map((note) => (
                    <div key={note.id} className="p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
                      <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{note.new_value}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                        {note.user_name || 'System'} - {formatFullDate(note.created_at)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
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
              {(!ticket.activity || ticket.activity.length === 0) ? (
                <p className="text-slate-500 dark:text-slate-400 text-center py-4">No activity yet</p>
              ) : (
                <div className="space-y-3">
                  {ticket.activity.map((activity) => (
                    <div key={activity.id} className="flex items-start gap-3">
                      <div className="w-2 h-2 bg-blue-500 rounded-full mt-2" />
                      <div className="flex-1">
                        <p className="text-sm text-slate-700 dark:text-slate-300">
                          <span className="font-medium">{activity.user_name || 'System'}</span>
                          {' - '}
                          {activity.action.replace(/_/g, ' ')}
                          {activity.new_value && activity.action !== 'note_added' && (
                            <span className="text-slate-500 dark:text-slate-400">
                              : {activity.new_value}
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-slate-400 dark:text-slate-500">
                          {formatFullDate(activity.created_at)}
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
                  {(users || []).map((u) => (
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
                  {formatFullDate(ticket.created_at)}
                </span>
              </div>
              {ticket.first_response_at && (
                <div className="flex justify-between">
                  <span className="text-slate-500 dark:text-slate-400">First Response</span>
                  <span className="text-slate-700 dark:text-slate-300">
                    {formatFullDate(ticket.first_response_at)}
                  </span>
                </div>
              )}
              {ticket.resolved_at && (
                <div className="flex justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Resolved</span>
                  <span className="text-slate-700 dark:text-slate-300">
                    {formatFullDate(ticket.resolved_at)}
                  </span>
                </div>
              )}
              {ticket.closed_at && (
                <div className="flex justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Closed</span>
                  <span className="text-slate-700 dark:text-slate-300">
                    {formatFullDate(ticket.closed_at)}
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
