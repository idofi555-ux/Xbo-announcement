import { useState, useEffect, useRef } from 'react';
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
  X
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
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    fetchConversation();
    fetchQuickReplies();
    fetchUsers();
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

  const handleStatusChange = async (status) => {
    try {
      await api.patch(`/support/conversations/${id}/status`, { status });
      setConversation({ ...conversation, status });
      setShowActions(false);
      toast.success(`Status changed to ${status}`);
    } catch (error) {
      toast.error('Failed to update status');
    }
  };

  const handleAssign = async (userId) => {
    try {
      await api.patch(`/support/conversations/${id}/assign`, { user_id: userId });
      fetchConversation();
      setShowActions(false);
      toast.success(userId ? 'Conversation assigned' : 'Assignment removed');
    } catch (error) {
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

          <div className="relative">
            <button
              onClick={() => setShowActions(!showActions)}
              className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition-colors"
            >
              <MoreVertical className="w-5 h-5 text-slate-600 dark:text-slate-400" />
            </button>

            {showActions && (
              <div className="absolute right-0 top-12 w-56 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 py-2 z-10">
                <div className="px-3 py-2 text-xs font-semibold text-slate-400 uppercase">Status</div>
                {['open', 'pending', 'closed'].map((status) => (
                  <button
                    key={status}
                    onClick={() => handleStatusChange(status)}
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
                  onClick={() => handleAssign(null)}
                  className="w-full px-4 py-2 text-left text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
                >
                  Unassigned
                </button>
                {users.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => handleAssign(u.id)}
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
    </div>
  );
}
