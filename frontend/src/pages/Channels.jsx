import { useState, useEffect } from 'react';
import { getChannels, createChannel, updateChannel, deleteChannel, refreshChannel } from '../utils/api';
import { 
  Plus, Radio, Users, Eye, Megaphone, MoreVertical, 
  Trash2, Edit2, RefreshCw, Check, X
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function Channels() {
  const [channels, setChannels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingChannel, setEditingChannel] = useState(null);
  const [form, setForm] = useState({ telegram_id: '', title: '', type: 'channel' });
  const [activeMenu, setActiveMenu] = useState(null);

  useEffect(() => {
    loadChannels();
  }, []);

  const loadChannels = async () => {
    try {
      const { data } = await getChannels();
      setChannels(data.channels);
    } catch (error) {
      toast.error('Failed to load channels');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingChannel) {
        await updateChannel(editingChannel.id, form);
        toast.success('Channel updated');
      } else {
        await createChannel(form);
        toast.success('Channel added');
      }
      setShowModal(false);
      setEditingChannel(null);
      setForm({ telegram_id: '', title: '', type: 'channel' });
      loadChannels();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to save channel');
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this channel?')) return;
    try {
      await deleteChannel(id);
      toast.success('Channel deleted');
      loadChannels();
    } catch (error) {
      toast.error('Failed to delete');
    }
    setActiveMenu(null);
  };

  const handleToggleActive = async (channel) => {
    try {
      await updateChannel(channel.id, { is_active: !channel.is_active });
      toast.success(channel.is_active ? 'Channel deactivated' : 'Channel activated');
      loadChannels();
    } catch (error) {
      toast.error('Failed to update');
    }
    setActiveMenu(null);
  };

  const handleRefresh = async (id) => {
    try {
      await refreshChannel(id);
      toast.success('Stats refreshed');
      loadChannels();
    } catch (error) {
      toast.error('Failed to refresh');
    }
    setActiveMenu(null);
  };

  const openEdit = (channel) => {
    setEditingChannel(channel);
    setForm({ 
      telegram_id: channel.telegram_id, 
      title: channel.title, 
      type: channel.type 
    });
    setShowModal(true);
    setActiveMenu(null);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800 dark:text-white">Channels</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Manage your Telegram channels and groups</p>
        </div>
        <button onClick={() => setShowModal(true)} className="btn btn-primary">
          <Plus className="w-4 h-4" />
          Add Channel
        </button>
      </div>

      {/* Info Box */}
      <div className="card p-4 bg-blue-500/5 border-blue-500/20">
        <p className="text-sm text-blue-300">
          <strong>Tip:</strong> The easiest way to add channels is to add @YourBotName to your channel/group as admin, 
          then send <code className="bg-dark-800 px-1 rounded">/register</code> in that chat.
        </p>
      </div>

      {/* Channels Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-40 skeleton rounded-xl" />
          ))}
        </div>
      ) : channels.length === 0 ? (
        <div className="card p-12 text-center">
          <div className="w-16 h-16 rounded-full bg-dark-800 flex items-center justify-center mx-auto mb-4">
            <Radio className="w-8 h-8 text-dark-600" />
          </div>
          <h3 className="text-lg font-medium text-slate-800 dark:text-white mb-2">No channels yet</h3>
          <p className="text-slate-500 dark:text-slate-400 mb-4">Add your first Telegram channel or group</p>
          <button onClick={() => setShowModal(true)} className="btn btn-primary">
            <Plus className="w-4 h-4" />
            Add Channel
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {channels.map((channel) => (
            <div 
              key={channel.id} 
              className={`card p-5 transition-colors ${
                channel.is_active ? 'hover:border-dark-700' : 'opacity-60'
              }`}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${
                    channel.is_active ? 'bg-brand-500/10' : 'bg-dark-800'
                  }`}>
                    <Radio className={`w-5 h-5 ${
                      channel.is_active ? 'text-brand-400' : 'text-dark-500'
                    }`} />
                  </div>
                  <div>
                    <h3 className="font-medium text-slate-800 dark:text-white">{channel.title}</h3>
                    <p className="text-xs text-dark-500">{channel.type}</p>
                  </div>
                </div>
                
                <div className="relative">
                  <button
                    onClick={() => setActiveMenu(activeMenu === channel.id ? null : channel.id)}
                    className="p-1.5 hover:bg-dark-800 rounded text-dark-400 hover:text-dark-100"
                  >
                    <MoreVertical className="w-4 h-4" />
                  </button>
                  
                  {activeMenu === channel.id && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setActiveMenu(null)} />
                      <div className="absolute right-0 top-full mt-1 w-40 py-1 bg-dark-800 border border-dark-700 rounded-lg shadow-xl z-20">
                        <button
                          onClick={() => openEdit(channel)}
                          className="flex items-center gap-2 w-full px-3 py-2 text-sm text-dark-200 hover:bg-dark-700"
                        >
                          <Edit2 className="w-4 h-4" />
                          Edit
                        </button>
                        <button
                          onClick={() => handleRefresh(channel.id)}
                          className="flex items-center gap-2 w-full px-3 py-2 text-sm text-dark-200 hover:bg-dark-700"
                        >
                          <RefreshCw className="w-4 h-4" />
                          Refresh Stats
                        </button>
                        <button
                          onClick={() => handleToggleActive(channel)}
                          className="flex items-center gap-2 w-full px-3 py-2 text-sm text-dark-200 hover:bg-dark-700"
                        >
                          {channel.is_active ? (
                            <><X className="w-4 h-4" /> Deactivate</>
                          ) : (
                            <><Check className="w-4 h-4" /> Activate</>
                          )}
                        </button>
                        <button
                          onClick={() => handleDelete(channel.id)}
                          className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-400 hover:bg-dark-700"
                        >
                          <Trash2 className="w-4 h-4" />
                          Delete
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-2 bg-dark-800/50 rounded-lg">
                  <Users className="w-4 h-4 text-dark-500 mx-auto mb-1" />
                  <p className="text-lg font-semibold text-slate-800">{channel.member_count || 0}</p>
                  <p className="text-xs text-dark-500">Members</p>
                </div>
                <div className="p-2 bg-dark-800/50 rounded-lg">
                  <Megaphone className="w-4 h-4 text-dark-500 mx-auto mb-1" />
                  <p className="text-lg font-semibold text-slate-800">{channel.total_announcements || 0}</p>
                  <p className="text-xs text-dark-500">Sent</p>
                </div>
                <div className="p-2 bg-dark-800/50 rounded-lg">
                  <Eye className="w-4 h-4 text-dark-500 mx-auto mb-1" />
                  <p className="text-lg font-semibold text-slate-800">{channel.total_views || 0}</p>
                  <p className="text-xs text-dark-500">Views</p>
                </div>
              </div>

              <p className="text-xs text-dark-600 mt-3 truncate">
                ID: {channel.telegram_id}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="card p-6 w-full max-w-md animate-slide-up">
            <h2 className="text-xl font-semibold text-slate-800 dark:text-white mb-4">
              {editingChannel ? 'Edit Channel' : 'Add Channel'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              {!editingChannel && (
                <div>
                  <label className="block text-sm font-medium text-dark-300 mb-2">
                    Telegram Chat ID
                  </label>
                  <input
                    type="text"
                    value={form.telegram_id}
                    onChange={(e) => setForm(prev => ({ ...prev, telegram_id: e.target.value }))}
                    className="input"
                    placeholder="-1001234567890"
                    required
                  />
                  <p className="text-xs text-dark-500 mt-1">
                    Get this by sending /start to @userinfobot in your channel
                  </p>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-dark-300 mb-2">
                  Channel Name
                </label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm(prev => ({ ...prev, title: e.target.value }))}
                  className="input"
                  placeholder="My Telegram Channel"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-dark-300 mb-2">
                  Type
                </label>
                <select
                  value={form.type}
                  onChange={(e) => setForm(prev => ({ ...prev, type: e.target.value }))}
                  className="input"
                >
                  <option value="channel">Channel</option>
                  <option value="group">Group</option>
                  <option value="supergroup">Supergroup</option>
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false);
                    setEditingChannel(null);
                    setForm({ telegram_id: '', title: '', type: 'channel' });
                  }}
                  className="btn btn-secondary flex-1"
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary flex-1">
                  {editingChannel ? 'Save' : 'Add Channel'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
