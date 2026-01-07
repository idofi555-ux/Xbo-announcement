import { useState, useEffect } from 'react';
import { getCampaigns, createCampaign, updateCampaign, deleteCampaign } from '../utils/api';
import { Plus, FolderKanban, Megaphone, MoreVertical, Trash2, Edit2 } from 'lucide-react';
import toast from 'react-hot-toast';

export default function Campaigns() {
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState(null);
  const [form, setForm] = useState({ name: '', description: '' });
  const [activeMenu, setActiveMenu] = useState(null);

  useEffect(() => {
    loadCampaigns();
  }, []);

  const loadCampaigns = async () => {
    try {
      const { data } = await getCampaigns();
      setCampaigns(data.campaigns);
    } catch (error) {
      toast.error('Failed to load campaigns');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingCampaign) {
        await updateCampaign(editingCampaign.id, form);
        toast.success('Campaign updated');
      } else {
        await createCampaign(form);
        toast.success('Campaign created');
      }
      setShowModal(false);
      setEditingCampaign(null);
      setForm({ name: '', description: '' });
      loadCampaigns();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to save campaign');
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this campaign? Announcements will be kept but unlinked.')) return;
    try {
      await deleteCampaign(id);
      toast.success('Campaign deleted');
      loadCampaigns();
    } catch (error) {
      toast.error('Failed to delete');
    }
    setActiveMenu(null);
  };

  const openEdit = (campaign) => {
    setEditingCampaign(campaign);
    setForm({ name: campaign.name, description: campaign.description || '' });
    setShowModal(true);
    setActiveMenu(null);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white">Campaigns</h1>
          <p className="text-dark-400 mt-1">Organize announcements into campaigns for tracking</p>
        </div>
        <button onClick={() => setShowModal(true)} className="btn btn-primary">
          <Plus className="w-4 h-4" />
          New Campaign
        </button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-32 skeleton rounded-xl" />
          ))}
        </div>
      ) : campaigns.length === 0 ? (
        <div className="card p-12 text-center">
          <div className="w-16 h-16 rounded-full bg-dark-800 flex items-center justify-center mx-auto mb-4">
            <FolderKanban className="w-8 h-8 text-dark-600" />
          </div>
          <h3 className="text-lg font-medium text-white mb-2">No campaigns yet</h3>
          <p className="text-dark-400 mb-4">Create campaigns to organize your announcements</p>
          <button onClick={() => setShowModal(true)} className="btn btn-primary">
            <Plus className="w-4 h-4" />
            Create Campaign
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {campaigns.map((campaign) => (
            <div key={campaign.id} className="card p-5 hover:border-dark-700 transition-colors">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-purple-500/10">
                    <FolderKanban className="w-5 h-5 text-purple-400" />
                  </div>
                  <div>
                    <h3 className="font-medium text-white">{campaign.name}</h3>
                    {campaign.description && (
                      <p className="text-xs text-dark-500 line-clamp-1">{campaign.description}</p>
                    )}
                  </div>
                </div>
                
                <div className="relative">
                  <button
                    onClick={() => setActiveMenu(activeMenu === campaign.id ? null : campaign.id)}
                    className="p-1.5 hover:bg-dark-800 rounded text-dark-400 hover:text-dark-100"
                  >
                    <MoreVertical className="w-4 h-4" />
                  </button>
                  
                  {activeMenu === campaign.id && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setActiveMenu(null)} />
                      <div className="absolute right-0 top-full mt-1 w-36 py-1 bg-dark-800 border border-dark-700 rounded-lg shadow-xl z-20">
                        <button
                          onClick={() => openEdit(campaign)}
                          className="flex items-center gap-2 w-full px-3 py-2 text-sm text-dark-200 hover:bg-dark-700"
                        >
                          <Edit2 className="w-4 h-4" />
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(campaign.id)}
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

              <div className="flex items-center gap-4 text-sm">
                <div className="flex items-center gap-1.5 text-dark-400">
                  <Megaphone className="w-4 h-4" />
                  <span>{campaign.announcement_count || 0} total</span>
                </div>
                <div className="text-dark-500">
                  {campaign.sent_count || 0} sent
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="card p-6 w-full max-w-md animate-slide-up">
            <h2 className="text-xl font-semibold text-white mb-4">
              {editingCampaign ? 'Edit Campaign' : 'New Campaign'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-dark-300 mb-2">
                  Campaign Name
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
                  className="input"
                  placeholder="Summer Sale 2024"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-dark-300 mb-2">
                  Description (optional)
                </label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm(prev => ({ ...prev, description: e.target.value }))}
                  className="input"
                  placeholder="Campaign description..."
                  rows={3}
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false);
                    setEditingCampaign(null);
                    setForm({ name: '', description: '' });
                  }}
                  className="btn btn-secondary flex-1"
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary flex-1">
                  {editingCampaign ? 'Save' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
