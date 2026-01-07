import { useState, useEffect } from 'react';
import { getDetailedAnalytics, getCampaigns } from '../utils/api';
import { 
  BarChart3, Eye, MousePointerClick, TrendingUp, 
  Calendar, Filter, Download
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { format, subDays } from 'date-fns';
import toast from 'react-hot-toast';

export default function Analytics() {
  const [data, setData] = useState({ announcements: [], channels: [] });
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    start_date: format(subDays(new Date(), 30), 'yyyy-MM-dd'),
    end_date: format(new Date(), 'yyyy-MM-dd'),
    campaign_id: ''
  });

  useEffect(() => {
    loadData();
  }, [filters]);

  useEffect(() => {
    loadCampaigns();
  }, []);

  const loadCampaigns = async () => {
    try {
      const { data } = await getCampaigns();
      setCampaigns(data.campaigns);
    } catch (error) {
      console.error('Failed to load campaigns');
    }
  };

  const loadData = async () => {
    try {
      const { data } = await getDetailedAnalytics(filters);
      setData(data);
    } catch (error) {
      toast.error('Failed to load analytics');
    } finally {
      setLoading(false);
    }
  };

  const totalViews = data.announcements.reduce((sum, a) => sum + (a.views || 0), 0);
  const totalClicks = data.announcements.reduce((sum, a) => sum + (a.clicks || 0), 0);
  const avgCTR = totalViews > 0 ? ((totalClicks / totalViews) * 100).toFixed(2) : 0;

  const COLORS = ['#22c55e', '#3b82f6', '#a855f7', '#f59e0b', '#ef4444', '#06b6d4'];

  const channelData = data.channels
    .filter(c => c.total_views > 0)
    .slice(0, 6)
    .map((c, i) => ({
      name: c.title.length > 15 ? c.title.substring(0, 15) + '...' : c.title,
      value: c.total_views,
      color: COLORS[i % COLORS.length]
    }));

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white">Analytics</h1>
          <p className="text-dark-400 mt-1">Track your announcement performance</p>
        </div>
      </div>

      {/* Filters */}
      <div className="card p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-dark-500" />
            <input
              type="date"
              value={filters.start_date}
              onChange={(e) => setFilters(prev => ({ ...prev, start_date: e.target.value }))}
              className="input py-1.5 w-auto"
            />
            <span className="text-dark-500">to</span>
            <input
              type="date"
              value={filters.end_date}
              onChange={(e) => setFilters(prev => ({ ...prev, end_date: e.target.value }))}
              className="input py-1.5 w-auto"
            />
          </div>
          <select
            value={filters.campaign_id}
            onChange={(e) => setFilters(prev => ({ ...prev, campaign_id: e.target.value }))}
            className="input py-1.5 w-auto"
          >
            <option value="">All Campaigns</option>
            {campaigns.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="stat-card">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/10">
              <Eye className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <p className="text-2xl font-semibold text-white">{totalViews.toLocaleString()}</p>
              <p className="text-sm text-dark-400">Total Views</p>
            </div>
          </div>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-500/10">
              <MousePointerClick className="w-5 h-5 text-green-400" />
            </div>
            <div>
              <p className="text-2xl font-semibold text-white">{totalClicks.toLocaleString()}</p>
              <p className="text-sm text-dark-400">Total Clicks</p>
            </div>
          </div>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-purple-500/10">
              <TrendingUp className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <p className="text-2xl font-semibold text-white">{avgCTR}%</p>
              <p className="text-sm text-dark-400">Avg. CTR</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Announcements Performance */}
        <div className="card p-6">
          <h3 className="text-lg font-medium text-white mb-4">Announcement Performance</h3>
          {data.announcements.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={data.announcements.slice(0, 10)}>
                <XAxis 
                  dataKey="title" 
                  stroke="#64748b" 
                  fontSize={11}
                  tickFormatter={(val) => val.length > 10 ? val.substring(0, 10) + '...' : val}
                />
                <YAxis stroke="#64748b" fontSize={12} />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#1e293b', 
                    border: '1px solid #334155',
                    borderRadius: '8px'
                  }}
                  labelStyle={{ color: '#f1f5f9' }}
                />
                <Bar dataKey="views" fill="#3b82f6" name="Views" radius={[4, 4, 0, 0]} />
                <Bar dataKey="clicks" fill="#22c55e" name="Clicks" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-64 flex items-center justify-center text-dark-500">
              No data for selected period
            </div>
          )}
        </div>

        {/* Channel Distribution */}
        <div className="card p-6">
          <h3 className="text-lg font-medium text-white mb-4">Views by Channel</h3>
          {channelData.length > 0 ? (
            <div className="flex items-center gap-4">
              <ResponsiveContainer width="50%" height={200}>
                <PieChart>
                  <Pie
                    data={channelData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {channelData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#1e293b', 
                      border: '1px solid #334155',
                      borderRadius: '8px'
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-2">
                {channelData.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <div 
                      className="w-3 h-3 rounded-full" 
                      style={{ backgroundColor: item.color }}
                    />
                    <span className="text-sm text-dark-300 flex-1 truncate">{item.name}</span>
                    <span className="text-sm text-dark-500">{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="h-48 flex items-center justify-center text-dark-500">
              No channel data
            </div>
          )}
        </div>
      </div>

      {/* Detailed Table */}
      <div className="card overflow-hidden">
        <div className="p-4 border-b border-dark-800">
          <h3 className="text-lg font-medium text-white">Announcement Details</h3>
        </div>
        {loading ? (
          <div className="p-8 text-center text-dark-500">Loading...</div>
        ) : data.announcements.length === 0 ? (
          <div className="p-8 text-center text-dark-500">No announcements in this period</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Announcement</th>
                  <th>Campaign</th>
                  <th>Sent</th>
                  <th className="text-right">Views</th>
                  <th className="text-right">Clicks</th>
                  <th className="text-right">Unique</th>
                  <th className="text-right">CTR</th>
                </tr>
              </thead>
              <tbody>
                {data.announcements.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <span className="text-dark-100 font-medium">{item.title}</span>
                    </td>
                    <td>
                      {item.campaign_name ? (
                        <span className="badge badge-info">{item.campaign_name}</span>
                      ) : (
                        <span className="text-dark-600">—</span>
                      )}
                    </td>
                    <td className="text-dark-400">
                      {item.sent_at ? format(new Date(item.sent_at), 'MMM d, h:mm a') : '—'}
                    </td>
                    <td className="text-right text-dark-100">{item.views || 0}</td>
                    <td className="text-right text-dark-100">{item.clicks || 0}</td>
                    <td className="text-right text-dark-400">{item.unique_clicks || 0}</td>
                    <td className="text-right">
                      <span className={`font-medium ${
                        parseFloat(item.ctr) > 5 ? 'text-green-400' : 
                        parseFloat(item.ctr) > 2 ? 'text-yellow-400' : 'text-dark-400'
                      }`}>
                        {item.ctr}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
