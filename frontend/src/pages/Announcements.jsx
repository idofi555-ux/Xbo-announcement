import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getAnnouncements, deleteAnnouncement, sendAnnouncement, duplicateAnnouncement } from '../utils/api';
import { 
  Plus, Search, Filter, MoreVertical, Send, Copy, Trash2, 
  Edit, Clock, CheckCircle, AlertCircle, Eye, MousePointerClick
} from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';

export default function Announcements() {
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [activeMenu, setActiveMenu] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    loadAnnouncements();
  }, [statusFilter]);

  const loadAnnouncements = async () => {
    try {
      const params = {};
      if (statusFilter) params.status = statusFilter;
      const { data } = await getAnnouncements(params);
      setAnnouncements(data.announcements);
    } catch (error) {
      toast.error('Failed to load announcements');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this announcement?')) return;
    try {
      await deleteAnnouncement(id);
      toast.success('Announcement deleted');
      loadAnnouncements();
    } catch (error) {
      toast.error('Failed to delete');
    }
    setActiveMenu(null);
  };

  const handleSend = async (id) => {
    if (!confirm('Send this announcement now?')) return;
    try {
      await sendAnnouncement(id);
      toast.success('Announcement sent!');
      loadAnnouncements();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to send');
    }
    setActiveMenu(null);
  };

  const handleDuplicate = async (id) => {
    try {
      const { data } = await duplicateAnnouncement(id);
      toast.success('Announcement duplicated');
      navigate(`/announcements/${data.id}`);
    } catch (error) {
      toast.error('Failed to duplicate');
    }
    setActiveMenu(null);
  };

  const getStatusBadge = (status) => {
    const badges = {
      draft: { class: 'badge bg-dark-700 text-dark-300', icon: Edit },
      scheduled: { class: 'badge-info', icon: Clock },
      sent: { class: 'badge-success', icon: CheckCircle },
      failed: { class: 'badge-error', icon: AlertCircle },
    };
    const badge = badges[status] || badges.draft;
    const Icon = badge.icon;
    return (
      <span className={`badge ${badge.class}`}>
        <Icon className="w-3 h-3 mr-1" />
        {status}
      </span>
    );
  };

  const filtered = announcements.filter(a => 
    a.title.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white">Announcements</h1>
          <p className="text-dark-400 mt-1">Manage your marketing messages</p>
        </div>
        <Link to="/announcements/new" className="btn btn-primary">
          <Plus className="w-4 h-4" />
          New Announcement
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-500" />
          <input
            type="text"
            placeholder="Search announcements..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input pl-10"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="input w-auto"
        >
          <option value="">All Status</option>
          <option value="draft">Draft</option>
          <option value="scheduled">Scheduled</option>
          <option value="sent">Sent</option>
          <option value="failed">Failed</option>
        </select>
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-20 skeleton rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="card p-12 text-center">
          <div className="w-16 h-16 rounded-full bg-dark-800 flex items-center justify-center mx-auto mb-4">
            <Search className="w-8 h-8 text-dark-600" />
          </div>
          <h3 className="text-lg font-medium text-white mb-2">No announcements found</h3>
          <p className="text-dark-400 mb-4">Create your first announcement to get started</p>
          <Link to="/announcements/new" className="btn btn-primary">
            <Plus className="w-4 h-4" />
            Create Announcement
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((announcement) => (
            <div key={announcement.id} className="card p-4 hover:border-dark-700 transition-colors">
              <div className="flex items-start gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2">
                    <Link 
                      to={`/announcements/${announcement.id}`}
                      className="text-lg font-medium text-white hover:text-brand-400 truncate"
                    >
                      {announcement.title}
                    </Link>
                    {getStatusBadge(announcement.status)}
                  </div>
                  <p className="text-sm text-dark-400 line-clamp-1 mb-3">
                    {announcement.content?.replace(/<[^>]*>/g, '').substring(0, 100)}...
                  </p>
                  <div className="flex items-center gap-4 text-sm text-dark-500">
                    <span className="flex items-center gap-1">
                      <Eye className="w-4 h-4" />
                      {announcement.total_views || 0} views
                    </span>
                    <span className="flex items-center gap-1">
                      <MousePointerClick className="w-4 h-4" />
                      {announcement.total_clicks || 0} clicks
                    </span>
                    <span>
                      {announcement.target_count} channel{announcement.target_count !== 1 ? 's' : ''}
                    </span>
                    {announcement.campaign_name && (
                      <span className="text-brand-400">{announcement.campaign_name}</span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="relative">
                  <button
                    onClick={() => setActiveMenu(activeMenu === announcement.id ? null : announcement.id)}
                    className="p-2 hover:bg-dark-800 rounded-lg text-dark-400 hover:text-dark-100"
                  >
                    <MoreVertical className="w-5 h-5" />
                  </button>
                  
                  {activeMenu === announcement.id && (
                    <>
                      <div 
                        className="fixed inset-0 z-10" 
                        onClick={() => setActiveMenu(null)}
                      />
                      <div className="absolute right-0 top-full mt-1 w-48 py-1 bg-dark-800 border border-dark-700 rounded-lg shadow-xl z-20">
                        <Link
                          to={`/announcements/${announcement.id}`}
                          className="flex items-center gap-2 px-4 py-2 text-sm text-dark-200 hover:bg-dark-700"
                          onClick={() => setActiveMenu(null)}
                        >
                          <Edit className="w-4 h-4" />
                          Edit
                        </Link>
                        {announcement.status !== 'sent' && (
                          <button
                            onClick={() => handleSend(announcement.id)}
                            className="flex items-center gap-2 w-full px-4 py-2 text-sm text-dark-200 hover:bg-dark-700"
                          >
                            <Send className="w-4 h-4" />
                            Send Now
                          </button>
                        )}
                        <button
                          onClick={() => handleDuplicate(announcement.id)}
                          className="flex items-center gap-2 w-full px-4 py-2 text-sm text-dark-200 hover:bg-dark-700"
                        >
                          <Copy className="w-4 h-4" />
                          Duplicate
                        </button>
                        <button
                          onClick={() => handleDelete(announcement.id)}
                          className="flex items-center gap-2 w-full px-4 py-2 text-sm text-red-400 hover:bg-dark-700"
                        >
                          <Trash2 className="w-4 h-4" />
                          Delete
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
