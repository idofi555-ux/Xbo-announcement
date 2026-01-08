import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../utils/api';
import {
  ArrowLeft,
  User,
  MessageCircle,
  Clock,
  Tag,
  FileText,
  Save,
  Plus,
  X,
  Edit2,
  Check
} from 'lucide-react';
import toast from 'react-hot-toast';

const statusColors = {
  open: 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  pending: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  closed: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400'
};

export default function CustomerDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [customer, setCustomer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState({ tags: [], notes: '', display_name: '' });
  const [newTag, setNewTag] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchCustomer();
  }, [id]);

  const fetchCustomer = async () => {
    try {
      const response = await api.get(`/support/customers/${id}`);
      setCustomer(response.data);
      const tags = response.data.tags ? JSON.parse(response.data.tags) : [];
      setEditData({
        tags,
        notes: response.data.notes || '',
        display_name: response.data.display_name || ''
      });
    } catch (error) {
      toast.error('Failed to load customer');
      navigate('/customers');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.patch(`/support/customers/${id}`, {
        tags: editData.tags,
        notes: editData.notes,
        display_name: editData.display_name
      });
      setCustomer({
        ...customer,
        tags: JSON.stringify(editData.tags),
        notes: editData.notes,
        display_name: editData.display_name
      });
      setEditing(false);
      toast.success('Customer updated');
    } catch (error) {
      toast.error('Failed to update customer');
    } finally {
      setSaving(false);
    }
  };

  const addTag = () => {
    if (newTag.trim() && !editData.tags.includes(newTag.trim())) {
      setEditData({ ...editData, tags: [...editData.tags, newTag.trim()] });
      setNewTag('');
    }
  };

  const removeTag = (tag) => {
    setEditData({ ...editData, tags: editData.tags.filter((t) => t !== tag) });
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return 'Never';
    return new Date(timestamp).toLocaleDateString();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="w-8 h-8 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!customer) {
    return null;
  }

  const tags = customer.tags ? JSON.parse(customer.tags) : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate('/customers')}
          className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-slate-600 dark:text-slate-400" />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white">Customer Profile</h1>
          <p className="text-slate-500 dark:text-slate-400">
            View and manage customer information
          </p>
        </div>
        {!editing ? (
          <button onClick={() => setEditing(true)} className="btn btn-secondary">
            <Edit2 className="w-4 h-4" />
            Edit
          </button>
        ) : (
          <div className="flex gap-2">
            <button onClick={() => setEditing(false)} className="btn btn-secondary">
              <X className="w-4 h-4" />
              Cancel
            </button>
            <button onClick={handleSave} disabled={saving} className="btn btn-primary">
              {saving ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              Save
            </button>
          </div>
        )}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Profile Card */}
        <div className="card p-6 space-y-6">
          <div className="text-center">
            <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-teal-400 to-teal-600 flex items-center justify-center text-white text-3xl font-bold mx-auto mb-4">
              {(editing ? editData.display_name : customer.display_name)?.charAt(0).toUpperCase() || '?'}
            </div>
            {editing ? (
              <input
                type="text"
                value={editData.display_name}
                onChange={(e) => setEditData({ ...editData, display_name: e.target.value })}
                className="input text-center text-lg font-semibold"
                placeholder="Display Name"
              />
            ) : (
              <h2 className="text-xl font-semibold text-slate-800 dark:text-white">
                {customer.display_name || 'Unknown'}
              </h2>
            )}
            {customer.telegram_username && (
              <p className="text-slate-500 dark:text-slate-400">
                @{customer.telegram_username}
              </p>
            )}
          </div>

          <div className="space-y-3 pt-4 border-t border-slate-100 dark:border-slate-700">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-500 dark:text-slate-400 flex items-center gap-2">
                <User className="w-4 h-4" />
                Telegram ID
              </span>
              <span className="text-slate-800 dark:text-white font-mono">
                {customer.telegram_user_id}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-500 dark:text-slate-400 flex items-center gap-2">
                <Clock className="w-4 h-4" />
                First Seen
              </span>
              <span className="text-slate-800 dark:text-white">
                {formatDate(customer.first_seen)}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-500 dark:text-slate-400 flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Last Seen
              </span>
              <span className="text-slate-800 dark:text-white">
                {formatDate(customer.last_seen)}
              </span>
            </div>
          </div>
        </div>

        {/* Tags & Notes */}
        <div className="card p-6 space-y-6">
          {/* Tags */}
          <div>
            <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-400 mb-3 flex items-center gap-2">
              <Tag className="w-4 h-4" />
              Tags
            </h3>
            <div className="flex flex-wrap gap-2 mb-3">
              {(editing ? editData.tags : tags).map((tag, idx) => (
                <span
                  key={idx}
                  className="px-3 py-1 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-lg text-sm flex items-center gap-1"
                >
                  {tag}
                  {editing && (
                    <button
                      onClick={() => removeTag(tag)}
                      className="hover:text-blue-900 dark:hover:text-blue-200"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </span>
              ))}
              {(editing ? editData.tags : tags).length === 0 && (
                <span className="text-sm text-slate-400 dark:text-slate-500">No tags</span>
              )}
            </div>
            {editing && (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addTag()}
                  placeholder="Add tag..."
                  className="input flex-1"
                />
                <button onClick={addTag} className="btn btn-secondary">
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          {/* Notes */}
          <div>
            <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-400 mb-3 flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Notes
            </h3>
            {editing ? (
              <textarea
                value={editData.notes}
                onChange={(e) => setEditData({ ...editData, notes: e.target.value })}
                placeholder="Add notes about this customer..."
                rows={5}
                className="input resize-none"
              />
            ) : (
              <p className="text-sm text-slate-600 dark:text-slate-300 whitespace-pre-wrap">
                {customer.notes || 'No notes'}
              </p>
            )}
          </div>
        </div>

        {/* Conversation History */}
        <div className="card p-6">
          <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-400 mb-4 flex items-center gap-2">
            <MessageCircle className="w-4 h-4" />
            Conversation History
          </h3>

          {customer.conversations?.length === 0 ? (
            <p className="text-sm text-slate-400 dark:text-slate-500">No conversations yet</p>
          ) : (
            <div className="space-y-3">
              {customer.conversations?.map((conv) => (
                <Link
                  key={conv.id}
                  to={`/inbox/${conv.id}`}
                  className="block p-3 bg-slate-50 dark:bg-slate-700/50 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-slate-800 dark:text-white">
                      {conv.channel_title}
                    </span>
                    <span className={`badge text-xs ${statusColors[conv.status]}`}>
                      {conv.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                    <span>{conv.message_count} messages</span>
                    <span>{formatDate(conv.created_at)}</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
