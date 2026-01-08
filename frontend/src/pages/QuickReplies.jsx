import { useState, useEffect } from 'react';
import api from '../utils/api';
import {
  Zap,
  Plus,
  Edit2,
  Trash2,
  X,
  Save,
  MessageSquare
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function QuickReplies() {
  const [replies, setReplies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({ shortcut: '', title: '', content: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchReplies();
  }, []);

  const fetchReplies = async () => {
    try {
      const response = await api.get('/support/quick-replies');
      setReplies(response.data);
    } catch (error) {
      toast.error('Failed to fetch quick replies');
    } finally {
      setLoading(false);
    }
  };

  const openModal = (reply = null) => {
    if (reply) {
      setEditingId(reply.id);
      setFormData({
        shortcut: reply.shortcut,
        title: reply.title,
        content: reply.content
      });
    } else {
      setEditingId(null);
      setFormData({ shortcut: '', title: '', content: '' });
    }
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingId(null);
    setFormData({ shortcut: '', title: '', content: '' });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.shortcut.trim() || !formData.title.trim() || !formData.content.trim()) {
      toast.error('All fields are required');
      return;
    }

    setSaving(true);
    try {
      if (editingId) {
        await api.put(`/support/quick-replies/${editingId}`, formData);
        toast.success('Quick reply updated');
      } else {
        await api.post('/support/quick-replies', formData);
        toast.success('Quick reply created');
      }
      fetchReplies();
      closeModal();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to save quick reply');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this quick reply?')) return;

    try {
      await api.delete(`/support/quick-replies/${id}`);
      toast.success('Quick reply deleted');
      fetchReplies();
    } catch (error) {
      toast.error('Failed to delete quick reply');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-3">
            <div className="p-2 bg-amber-50 dark:bg-amber-900/30 rounded-xl">
              <Zap className="w-6 h-6 text-amber-600 dark:text-amber-400" />
            </div>
            Quick Replies
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            Create template responses for faster customer support
          </p>
        </div>
        <button onClick={() => openModal()} className="btn btn-primary">
          <Plus className="w-4 h-4" />
          Add Quick Reply
        </button>
      </div>

      {/* Quick Replies Grid */}
      {loading ? (
        <div className="card p-8 text-center">
          <div className="w-8 h-8 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin mx-auto" />
          <p className="text-slate-500 dark:text-slate-400 mt-3">Loading quick replies...</p>
        </div>
      ) : replies.length === 0 ? (
        <div className="card p-12 text-center">
          <div className="w-16 h-16 bg-slate-100 dark:bg-slate-700 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <MessageSquare className="w-8 h-8 text-slate-400" />
          </div>
          <h3 className="text-lg font-semibold text-slate-800 dark:text-white mb-2">No quick replies yet</h3>
          <p className="text-slate-500 dark:text-slate-400 mb-4">
            Create template responses to speed up your customer support
          </p>
          <button onClick={() => openModal()} className="btn btn-primary mx-auto">
            <Plus className="w-4 h-4" />
            Create Your First Quick Reply
          </button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {replies.map((reply) => (
            <div key={reply.id} className="card p-5 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-1 bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded-lg text-sm font-mono">
                    /{reply.shortcut}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => openModal(reply)}
                    className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                  >
                    <Edit2 className="w-4 h-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300" />
                  </button>
                  <button
                    onClick={() => handleDelete(reply.id)}
                    className="p-2 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-4 h-4 text-slate-400 hover:text-red-600 dark:hover:text-red-400" />
                  </button>
                </div>
              </div>
              <h3 className="font-semibold text-slate-800 dark:text-white mb-2">{reply.title}</h3>
              <p className="text-sm text-slate-600 dark:text-slate-300 line-clamp-3 whitespace-pre-wrap">
                {reply.content}
              </p>
              {reply.created_by_name && (
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-3">
                  Created by {reply.created_by_name}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={closeModal} />
          <div className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-lg">
            <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-700">
              <h2 className="text-lg font-semibold text-slate-800 dark:text-white">
                {editingId ? 'Edit Quick Reply' : 'Create Quick Reply'}
              </h2>
              <button
                onClick={closeModal}
                className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Shortcut
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">/</span>
                  <input
                    type="text"
                    value={formData.shortcut}
                    onChange={(e) => setFormData({ ...formData, shortcut: e.target.value.toLowerCase().replace(/[^a-z0-9-_]/g, '') })}
                    placeholder="greeting"
                    className="input pl-7"
                  />
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Lowercase letters, numbers, dashes, and underscores only
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Title
                </label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="Welcome message"
                  className="input"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Content
                </label>
                <textarea
                  value={formData.content}
                  onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                  placeholder="Enter the reply content..."
                  rows={5}
                  className="input resize-none"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button type="button" onClick={closeModal} className="btn btn-secondary flex-1">
                  Cancel
                </button>
                <button type="submit" disabled={saving} className="btn btn-primary flex-1">
                  {saving ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  {editingId ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
