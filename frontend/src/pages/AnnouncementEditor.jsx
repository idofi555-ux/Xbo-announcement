import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  getAnnouncement, createAnnouncement, updateAnnouncement, 
  sendAnnouncement, getChannels, getCampaigns 
} from '../utils/api';
import { 
  ArrowLeft, Send, Save, Plus, Trash2, Link as LinkIcon,
  Image, Eye, MousePointerClick, Clock
} from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

export default function AnnouncementEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = id === 'new';

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [channels, setChannels] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [stats, setStats] = useState(null);

  const [form, setForm] = useState({
    title: '',
    content: '',
    image_url: '',
    buttons: [],
    campaign_id: '',
    channel_ids: [],
    scheduled_at: '',
  });

  useEffect(() => {
    loadData();
  }, [id]);

  const loadData = async () => {
    try {
      const [channelsRes, campaignsRes] = await Promise.all([
        getChannels(),
        getCampaigns()
      ]);
      setChannels(channelsRes.data.channels);
      setCampaigns(campaignsRes.data.campaigns);

      if (!isNew) {
        const { data } = await getAnnouncement(id);
        setForm({
          title: data.announcement.title,
          content: data.announcement.content,
          image_url: data.announcement.image_url || '',
          buttons: data.announcement.buttons ? JSON.parse(data.announcement.buttons) : [],
          campaign_id: data.announcement.campaign_id || '',
          channel_ids: data.targets.map(t => t.channel_id),
          scheduled_at: data.announcement.scheduled_at || '',
        });
        setStats({
          targets: data.targets,
          linkStats: data.linkStats,
          clickTimeline: data.clickTimeline,
          status: data.announcement.status,
          sent_at: data.announcement.sent_at,
        });
      }
    } catch (error) {
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (sendNow = false) => {
    if (!form.title || !form.content) {
      toast.error('Title and content are required');
      return;
    }
    if (form.channel_ids.length === 0) {
      toast.error('Select at least one channel');
      return;
    }

    setSaving(true);
    try {
      let announcementId = id;
      
      const payload = {
        ...form,
        campaign_id: form.campaign_id || null,
        scheduled_at: form.scheduled_at || null,
      };

      if (isNew) {
        const { data } = await createAnnouncement(payload);
        announcementId = data.announcement.id;
        toast.success('Announcement created');
      } else {
        await updateAnnouncement(id, payload);
        toast.success('Announcement updated');
      }

      if (sendNow) {
        setSending(true);
        await sendAnnouncement(announcementId);
        toast.success('Announcement sent!');
      }

      navigate('/announcements');
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to save');
    } finally {
      setSaving(false);
      setSending(false);
    }
  };

  const addButton = () => {
    setForm(prev => ({
      ...prev,
      buttons: [...prev.buttons, { text: '', url: '' }]
    }));
  };

  const updateButton = (index, field, value) => {
    setForm(prev => ({
      ...prev,
      buttons: prev.buttons.map((btn, i) => 
        i === index ? { ...btn, [field]: value } : btn
      )
    }));
  };

  const removeButton = (index) => {
    setForm(prev => ({
      ...prev,
      buttons: prev.buttons.filter((_, i) => i !== index)
    }));
  };

  const toggleChannel = (channelId) => {
    setForm(prev => ({
      ...prev,
      channel_ids: prev.channel_ids.includes(channelId)
        ? prev.channel_ids.filter(id => id !== channelId)
        : [...prev.channel_ids, channelId]
    }));
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 skeleton rounded" />
        <div className="h-96 skeleton rounded-xl" />
      </div>
    );
  }

  const isSent = stats?.status === 'sent';

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/announcements')}
            className="p-2 hover:bg-dark-800 rounded-lg text-dark-400 hover:text-dark-100"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-semibold text-white">
              {isNew ? 'New Announcement' : form.title || 'Edit Announcement'}
            </h1>
            {stats?.sent_at && (
              <p className="text-dark-400 text-sm mt-1">
                Sent {format(new Date(stats.sent_at), 'MMM d, yyyy h:mm a')}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!isSent && (
            <>
              <button
                onClick={() => handleSave(false)}
                disabled={saving}
                className="btn btn-secondary"
              >
                <Save className="w-4 h-4" />
                Save Draft
              </button>
              <button
                onClick={() => handleSave(true)}
                disabled={saving || sending}
                className="btn btn-primary"
              >
                <Send className="w-4 h-4" />
                {sending ? 'Sending...' : 'Send Now'}
              </button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Editor */}
        <div className="lg:col-span-2 space-y-6">
          <div className="card p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-2">Title</label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm(prev => ({ ...prev, title: e.target.value }))}
                className="input"
                placeholder="Announcement title (internal)"
                disabled={isSent}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-dark-300 mb-2">Message</label>
              <textarea
                value={form.content}
                onChange={(e) => setForm(prev => ({ ...prev, content: e.target.value }))}
                className="input min-h-[200px]"
                placeholder="Write your announcement message..."
                disabled={isSent}
              />
              <p className="text-xs text-dark-500 mt-1">
                Supports HTML: &lt;b&gt;bold&lt;/b&gt;, &lt;i&gt;italic&lt;/i&gt;, &lt;a href=""&gt;link&lt;/a&gt;
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-dark-300 mb-2">
                <Image className="w-4 h-4 inline mr-1" />
                Image URL (optional)
              </label>
              <input
                type="url"
                value={form.image_url}
                onChange={(e) => setForm(prev => ({ ...prev, image_url: e.target.value }))}
                className="input"
                placeholder="https://example.com/image.jpg"
                disabled={isSent}
              />
            </div>

            {/* Buttons */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-dark-300">
                  <LinkIcon className="w-4 h-4 inline mr-1" />
                  Buttons (optional)
                </label>
                {!isSent && form.buttons.length < 3 && (
                  <button onClick={addButton} className="text-sm text-brand-400 hover:text-brand-300">
                    <Plus className="w-4 h-4 inline" /> Add Button
                  </button>
                )}
              </div>
              <div className="space-y-2">
                {form.buttons.map((btn, idx) => (
                  <div key={idx} className="flex gap-2">
                    <input
                      type="text"
                      value={btn.text}
                      onChange={(e) => updateButton(idx, 'text', e.target.value)}
                      className="input flex-1"
                      placeholder="Button text"
                      disabled={isSent}
                    />
                    <input
                      type="url"
                      value={btn.url}
                      onChange={(e) => updateButton(idx, 'url', e.target.value)}
                      className="input flex-1"
                      placeholder="https://..."
                      disabled={isSent}
                    />
                    {!isSent && (
                      <button
                        onClick={() => removeButton(idx)}
                        className="p-2 text-red-400 hover:bg-red-500/10 rounded-lg"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Stats (only for sent) */}
          {stats?.linkStats?.length > 0 && (
            <div className="card p-6">
              <h3 className="text-lg font-medium text-white mb-4">Link Performance</h3>
              <div className="space-y-3">
                {stats.linkStats.map((link) => (
                  <div key={link.id} className="flex items-center justify-between p-3 bg-dark-800/50 rounded-lg">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-dark-200 truncate">{link.original_url}</p>
                      <p className="text-xs text-dark-500">/{link.short_code}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-semibold text-white">{link.click_count}</p>
                      <p className="text-xs text-dark-500">{link.unique_clicks} unique</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {stats?.clickTimeline?.length > 0 && (
            <div className="card p-6">
              <h3 className="text-lg font-medium text-white mb-4">Clicks Over Time</h3>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={stats.clickTimeline}>
                  <XAxis 
                    dataKey="date" 
                    stroke="#64748b"
                    fontSize={12}
                    tickFormatter={(val) => format(new Date(val), 'MMM d')}
                  />
                  <YAxis stroke="#64748b" fontSize={12} />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#1e293b', 
                      border: '1px solid #334155',
                      borderRadius: '8px'
                    }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="clicks" 
                    stroke="#3b82f6" 
                    strokeWidth={2}
                    dot={{ fill: '#3b82f6', strokeWidth: 0 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Channels */}
          <div className="card p-6">
            <h3 className="text-sm font-medium text-dark-300 mb-3">Send to Channels</h3>
            {channels.length === 0 ? (
              <p className="text-sm text-dark-500">No channels registered yet</p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {channels.filter(c => c.is_active).map((channel) => (
                  <label
                    key={channel.id}
                    className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                      form.channel_ids.includes(channel.id) 
                        ? 'bg-brand-500/10 border border-brand-500/30' 
                        : 'bg-dark-800/50 hover:bg-dark-800'
                    } ${isSent ? 'pointer-events-none opacity-60' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={form.channel_ids.includes(channel.id)}
                      onChange={() => toggleChannel(channel.id)}
                      className="sr-only"
                      disabled={isSent}
                    />
                    <div className={`w-4 h-4 rounded border flex items-center justify-center ${
                      form.channel_ids.includes(channel.id)
                        ? 'bg-brand-500 border-brand-500'
                        : 'border-dark-600'
                    }`}>
                      {form.channel_ids.includes(channel.id) && (
                        <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-dark-100 truncate">{channel.title}</p>
                      <p className="text-xs text-dark-500">{channel.member_count || 0} members</p>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Campaign */}
          <div className="card p-6">
            <h3 className="text-sm font-medium text-dark-300 mb-3">Campaign (optional)</h3>
            <select
              value={form.campaign_id}
              onChange={(e) => setForm(prev => ({ ...prev, campaign_id: e.target.value }))}
              className="input"
              disabled={isSent}
            >
              <option value="">No campaign</option>
              {campaigns.map((campaign) => (
                <option key={campaign.id} value={campaign.id}>
                  {campaign.name}
                </option>
              ))}
            </select>
          </div>

          {/* Schedule */}
          {!isSent && (
            <div className="card p-6">
              <h3 className="text-sm font-medium text-dark-300 mb-3">
                <Clock className="w-4 h-4 inline mr-1" />
                Schedule (optional)
              </h3>
              <input
                type="datetime-local"
                value={form.scheduled_at}
                onChange={(e) => setForm(prev => ({ ...prev, scheduled_at: e.target.value }))}
                className="input"
              />
              <p className="text-xs text-dark-500 mt-2">
                Leave empty to save as draft
              </p>
            </div>
          )}

          {/* Channel Stats (for sent) */}
          {stats?.targets?.length > 0 && (
            <div className="card p-6">
              <h3 className="text-sm font-medium text-dark-300 mb-3">Delivery Stats</h3>
              <div className="space-y-2">
                {stats.targets.map((target) => (
                  <div key={target.id} className="flex items-center justify-between p-2 bg-dark-800/50 rounded">
                    <span className="text-sm text-dark-200 truncate">{target.channel_title}</span>
                    <div className="flex items-center gap-2 text-sm">
                      <span className="flex items-center gap-1 text-dark-400">
                        <Eye className="w-3 h-3" />
                        {target.views || 0}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
