import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import api from '../utils/api';
import {
  ArrowLeft,
  Send,
  User,
  Clock,
  Tag,
  FileText,
  MoreVertical,
  CheckCircle,
  AlertCircle,
  MessageSquare,
  Zap,
  UserPlus,
  X,
  Ticket,
  Plus
} from 'lucide-react';
import toast from 'react-hot-toast';

const statusColors = {
  open: 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  pending: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  closed: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400'
};

export default function ConversationView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [conversation, setConversation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [quickReplies, setQuickReplies] = useState([]);
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const [users, setUsers] = useState([]);
  const [showActions, setShowActions] = useState(false);
  const [ticket, setTicket] = useState(null);
  const [showTicketModal, setShowTicketModal] = useState(false);
  const [ticketForm, setTicketForm] = useState({ subject: '', category: 'support', priority: 'medium' });
  const [creatingTicket, setCreatingTicket] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const actionsRef = useRef(null);

  // Click outside handler for dropdown
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (actionsRef.current && !actionsRef.current.contains(event.target)) {
        setShowActions(false);
      }
    };

    if (showActions) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showActions]);

  useEffect(() => {
    fetchConversation();
    fetchQuickReplies();
    fetchUsers();
    fetchTicket();
  }, [id]);

  useEffect(() => {
    scrollToBottom();
  }, [conversation?.messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const fetchConversation = async () => {
    try {
      const response = await api.get(`/support/conversations/${id}`);
      setConversation(response.data);
    } catch (error) {
      toast.error('Failed to load conversation');
      navigate('/inbox');
    } finally {
      setLoading(false);
    }
  };

  const fetchQuickReplies = async () => {
    try {
      const response = await api.get('/support/quick-replies');
      setQuickReplies(response.data);
    } catch (error) {
      console.error('Failed to fetch quick replies:', error);
    }
  };

  const fetchUsers = async () => {
    try {
      const response = await api.get('/auth/users');
      setUsers(response.data);
    } catch (error) {
      console.error('Failed to fetch users:', error);
    }
  };

  const fetchTicket = async () => {
    try {
      const response = await api.get(`/tickets/by-conversation/${id}`);
      setTicket(response.data);
    } catch (error) {
      console.error('Failed to fetch ticket:', error);
    }
  };

  const createTicket = async (e) => {
    e.preventDefault();
    if (!ticketForm.subject.trim()) {
      toast.error('Subject is required');
      return;
    }

    setCreatingTicket(true);
    try {
      console.log('Creating ticket for conversation:', id);
      const response = await api.post('/tickets', {
        conversation_id: parseInt(id),
        subject: ticketForm.subject,
        category: ticketForm.category,
        priority: ticketForm.priority
      });
      console.log('Ticket created:', response.data);
      setTicket(response.data);
      setShowTicketModal(false);
      setTicketForm({ subject: '', category: 'support', priority: 'medium' });
      toast.success('Ticket created');
    } catch (error) {
      console.error('Failed to create ticket:', error.response?.data || error);
      const errorMsg = error.response?.data?.error || 'Failed to create ticket';
      toast.error(errorMsg);
    } finally {
      setCreatingTicket(false);
    }
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!message.trim() || sending) return;

    setSending(true);
    try {
      await api.post(`/support/conversations/${id}/reply`, { content: message });
      setMessage('');
      fetchConversation();
      toast.success('Message sent');
    } catch (error) {
      toast.error('Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const handleStatusChange = async (e, status) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await api.patch(`/support/conversations/${id}/status`, { status });
      setConversation({ ...conversation, status });
      setShowActions(false);
      toast.success(`Status changed to ${status}`);
    } catch (error) {
      console.error('Failed to update status:', error);
      toast.error('Failed to update status');
    }
  };

  const handleAssign = async (e, userId) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await api.patch(`/support/conversations/${id}/assign`, { user_id: userId });
      fetchConversation();
      setShowActions(false);
      toast.success(userId ? 'Conversation assigned' : 'Assignment removed');
    } catch (error) {
      console.error('Failed to assign conversation:', error);
      toast.error('Failed to assign conversation');
    }
  };

  const handleQuickReply = (content) => {
    setMessage(content);
    setShowQuickReplies(false);
    inputRef.current?.focus();
  };

  const formatTime = (timestamp) => {
    if (!timestamp) return '';
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return '';
    return new Date(timestamp).toLocaleDateString();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="w-8 h-8 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!conversation) {
    return null;
  }

  const customerTags = conversation.customer_tags ? JSON.parse(conversation.customer_tags) : [];

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col lg:flex-row gap-6">
      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col card overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-4 p-4 border-b border-slate-100 dark:border-slate-700">
          <button
            onClick={() => navigate('/inbox')}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-slate-600 dark:text-slate-400" />
          </button>

          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-400 to-purple-600 flex items-center justify-center text-white font-semibold">
            {conversation.customer_name?.charAt(0).toUpperCase() || '?'}
          </div>

          <div className="flex-1 min-w-0">
            <h2 className="font-semibold text-slate-800 dark:text-white truncate">
              {conversation.customer_name || 'Unknown'}
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 truncate">
              {conversation.channel_title}
              {conversation.telegram_username && ` - @${conversation.telegram_username}`}
            </p>
          </div>

          <span className={`badge ${statusColors[conversation.status]}`}>
            {conversation.status}
          </span>

          {/* Ticket Button */}
          {ticket ? (
            <Link
              to={`/tickets/${ticket.id}`}
              className="flex items-center gap-1 px-3 py-1.5 bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 rounded-lg text-sm font-medium hover:bg-purple-100 dark:hover:bg-purple-900/50 transition-colors"
            >
              <Ticket className="w-4 h-4" />
              #{ticket.id}
            </Link>
          ) : (
            <button
              onClick={() => setShowTicketModal(true)}
              className="flex items-center gap-1 px-3 py-1.5 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-sm font-medium hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Create Ticket
            </button>
          )}

          <div className="relative" ref={actionsRef}>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setShowActions(!showActions);
              }}
              className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition-colors"
            >
              <MoreVertical className="w-5 h-5 text-slate-600 dark:text-slate-400" />
            </button>

            {showActions && (
              <div
                className="absolute right-0 top-12 w-56 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 py-2 z-50"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="px-3 py-2 text-xs font-semibold text-slate-400 uppercase">Status</div>
                {['open', 'pending', 'closed'].map((status) => (
                  <button
                    key={status}
                    type="button"
                    onClick={(e) => handleStatusChange(e, status)}
                    className={`w-full px-4 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-700 capitalize ${
                      conversation.status === status ? 'text-blue-600 dark:text-blue-400 font-medium' : 'text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {status}
                  </button>
                ))}

                <div className="border-t border-slate-100 dark:border-slate-700 my-2" />
                <div className="px-3 py-2 text-xs font-semibold text-slate-400 uppercase">Assign to</div>
                <button
                  type="button"
                  onClick={(e) => handleAssign(e, null)}
                  className="w-full px-4 py-2 text-left text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
                >
                  Unassigned
                </button>
                {users.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={(e) => handleAssign(e, u.id)}
                    className={`w-full px-4 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-700 ${
                      conversation.assigned_to === u.id ? 'text-blue-600 dark:text-blue-400 font-medium' : 'text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {u.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {conversation.messages?.map((msg, idx) => {
            const isOutgoing = msg.direction === 'out';
            const showDate = idx === 0 || formatDate(msg.timestamp) !== formatDate(conversation.messages[idx - 1]?.timestamp);

            return (
              <div key={msg.id}>
                {showDate && (
                  <div className="flex justify-center my-4">
                    <span className="px-3 py-1 bg-slate-100 dark:bg-slate-700 rounded-full text-xs text-slate-500 dark:text-slate-400">
                      {formatDate(msg.timestamp)}
                    </span>
                  </div>
                )}
                <div className={`flex ${isOutgoing ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[75%] ${isOutgoing ? 'order-2' : ''}`}>
                    <div
                      className={`px-4 py-3 rounded-2xl ${
                        isOutgoing
                          ? 'bg-blue-500 text-white rounded-br-md'
                          : 'bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-white rounded-bl-md'
                      }`}
                    >
                      <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                    </div>
                    <div className={`flex items-center gap-2 mt-1 ${isOutgoing ? 'justify-end' : ''}`}>
                      <span className="text-xs text-slate-400 dark:text-slate-500">
                        {formatTime(msg.timestamp)}
                      </span>
                      {msg.sender_name && (
                        <span className="text-xs text-slate-400 dark:text-slate-500">
                          - {msg.sender_name}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        {/* Reply Box */}
        <form onSubmit={handleSend} className="p-4 border-t border-slate-100 dark:border-slate-700">
          <div className="flex items-end gap-3">
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowQuickReplies(!showQuickReplies)}
                className="p-3 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-xl transition-colors"
                title="Quick replies"
              >
                <Zap className="w-5 h-5 text-slate-600 dark:text-slate-400" />
              </button>

              {showQuickReplies && quickReplies.length > 0 && (
                <div className="absolute bottom-14 left-0 w-72 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 py-2 z-10 max-h-64 overflow-y-auto">
                  <div className="px-3 py-2 text-xs font-semibold text-slate-400 uppercase flex items-center justify-between">
                    Quick Replies
                    <button onClick={() => setShowQuickReplies(false)}>
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  {quickReplies.map((qr) => (
                    <button
                      key={qr.id}
                      type="button"
                      onClick={() => handleQuickReply(qr.content)}
                      className="w-full px-4 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-700"
                    >
                      <div className="font-medium text-sm text-slate-800 dark:text-white">/{qr.shortcut}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 truncate">{qr.title}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex-1">
              <textarea
                ref={inputRef}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend(e);
                  }
                }}
                placeholder="Type your message..."
                rows={1}
                className="input resize-none min-h-[48px] max-h-32"
              />
            </div>

            <button
              type="submit"
              disabled={!message.trim() || sending}
              className="btn btn-primary p-3"
            >
              {sending ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <Send className="w-5 h-5" />
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Customer Sidebar */}
      <div className="w-full lg:w-80 card p-6 space-y-6 overflow-y-auto h-full">
        <div className="text-center">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-purple-400 to-purple-600 flex items-center justify-center text-white text-2xl font-bold mx-auto mb-4">
            {conversation.customer_name?.charAt(0).toUpperCase() || '?'}
          </div>
          <h3 className="text-lg font-semibold text-slate-800 dark:text-white">
            {conversation.customer_name || 'Unknown'}
          </h3>
          {conversation.telegram_username && (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              @{conversation.telegram_username}
            </p>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 bg-slate-50 dark:bg-slate-700/50 rounded-xl text-center">
            <p className="text-2xl font-bold text-slate-800 dark:text-white">
              {conversation.messages?.length || 0}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">Messages</p>
          </div>
          <div className="p-3 bg-slate-50 dark:bg-slate-700/50 rounded-xl text-center">
            <p className="text-2xl font-bold text-slate-800 dark:text-white">
              {customerTags.length}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">Tags</p>
          </div>
        </div>

        {/* Info */}
        <div className="space-y-3">
          <div className="flex items-center gap-3 text-sm">
            <Clock className="w-4 h-4 text-slate-400" />
            <span className="text-slate-600 dark:text-slate-300">
              First seen: {formatDate(conversation.first_seen)}
            </span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <Clock className="w-4 h-4 text-slate-400" />
            <span className="text-slate-600 dark:text-slate-300">
              Last seen: {formatDate(conversation.last_seen)}
            </span>
          </div>
          {conversation.assigned_name && (
            <div className="flex items-center gap-3 text-sm">
              <User className="w-4 h-4 text-slate-400" />
              <span className="text-slate-600 dark:text-slate-300">
                Assigned to: {conversation.assigned_name}
              </span>
            </div>
          )}
        </div>

        {/* Tags */}
        {customerTags.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold text-slate-600 dark:text-slate-400 mb-2 flex items-center gap-2">
              <Tag className="w-4 h-4" />
              Tags
            </h4>
            <div className="flex flex-wrap gap-2">
              {customerTags.map((tag, idx) => (
                <span
                  key={idx}
                  className="px-2 py-1 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-lg text-xs"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Notes */}
        {conversation.customer_notes && (
          <div>
            <h4 className="text-sm font-semibold text-slate-600 dark:text-slate-400 mb-2 flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Notes
            </h4>
            <p className="text-sm text-slate-600 dark:text-slate-300 whitespace-pre-wrap">
              {conversation.customer_notes}
            </p>
          </div>
        )}

        {/* View Full Profile */}
        <Link
          to={`/customers/${conversation.customer_id}`}
          className="btn btn-secondary w-full"
        >
          <User className="w-4 h-4" />
          View Full Profile
        </Link>
      </div>

      {/* Create Ticket Modal */}
      {showTicketModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowTicketModal(false)} />
          <div className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-700">
              <h2 className="text-lg font-semibold text-slate-800 dark:text-white flex items-center gap-2">
                <Ticket className="w-5 h-5 text-purple-600" />
                Create Ticket
              </h2>
              <button
                onClick={() => setShowTicketModal(false)}
                className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            <form onSubmit={createTicket} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Subject *
                </label>
                <input
                  type="text"
                  value={ticketForm.subject}
                  onChange={(e) => setTicketForm({ ...ticketForm, subject: e.target.value })}
                  placeholder="Brief description of the issue"
                  className="input w-full"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Category
                </label>
                <select
                  value={ticketForm.category}
                  onChange={(e) => setTicketForm({ ...ticketForm, category: e.target.value })}
                  className="input w-full"
                >
                  <option value="support">Support</option>
                  <option value="sales">Sales</option>
                  <option value="technical">Technical</option>
                  <option value="billing">Billing</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Priority
                </label>
                <select
                  value={ticketForm.priority}
                  onChange={(e) => setTicketForm({ ...ticketForm, priority: e.target.value })}
                  className="input w-full"
                >
                  <option value="low">Low - 48 hour resolution</option>
                  <option value="medium">Medium - 24 hour resolution</option>
                  <option value="high">High - 8 hour resolution</option>
                  <option value="urgent">Urgent - 2 hour resolution</option>
                </select>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowTicketModal(false)}
                  className="btn btn-secondary flex-1"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingTicket || !ticketForm.subject.trim()}
                  className="btn btn-primary flex-1"
                >
                  {creatingTicket ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <Ticket className="w-4 h-4" />
                  )}
                  Create Ticket
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
