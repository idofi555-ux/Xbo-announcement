import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getOverview } from '../utils/api';
import { 
  Megaphone, Radio, MousePointerClick, Eye, 
  TrendingUp, ArrowRight, Clock, Send, Plus,
  ArrowUpRight, ArrowDownRight, Bell
} from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { format } from 'date-fns';

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const { data } = await getOverview();
      setData(data);
    } catch (error) {
      console.error('Failed to load dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="h-8 w-48 skeleton" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-32 skeleton" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="h-80 skeleton" />
          <div className="h-80 skeleton" />
        </div>
      </div>
    );
  }

  const stats = [
    { 
      label: 'Total Sent', 
      value: data?.stats?.sent_announcements || 0,
      change: '+12%',
      up: true,
      icon: Megaphone,
      gradient: 'from-emerald-500 to-teal-600',
      shadow: 'shadow-emerald-500/25'
    },
    { 
      label: 'Channels', 
      value: data?.stats?.total_channels || 0,
      change: '+2',
      up: true,
      icon: Radio,
      gradient: 'from-violet-500 to-purple-600',
      shadow: 'shadow-violet-500/25'
    },
    { 
      label: 'Total Views', 
      value: data?.stats?.total_views || 0,
      change: '+18%',
      up: true,
      icon: Eye,
      gradient: 'from-blue-500 to-cyan-600',
      shadow: 'shadow-blue-500/25'
    },
    { 
      label: 'Total Clicks', 
      value: data?.stats?.total_clicks || 0,
      change: '+8%',
      up: true,
      icon: MousePointerClick,
      gradient: 'from-amber-500 to-orange-600',
      shadow: 'shadow-amber-500/25'
    },
  ];

  const formatNumber = (num) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
  };

  const StatusBadge = ({ status }) => {
    const config = {
      sent: { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
      scheduled: { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500' },
      draft: { bg: 'bg-slate-100', text: 'text-slate-600', dot: 'bg-slate-400' },
      failed: { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500' },
    };
    const c = config[status] || config.draft;
    return (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${c.bg} ${c.text}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`}></span>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  };

  return (
    <div className="space-y-6 lg:space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Dashboard</h1>
          <p className="text-slate-500 mt-1">Welcome back! Here's your performance overview.</p>
        </div>
        <div className="flex items-center gap-3">
          <button className="hidden lg:flex p-2.5 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-all relative">
            <Bell className="w-5 h-5" />
            <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full"></span>
          </button>
          <Link 
            to="/announcements/new" 
            className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-xl font-medium shadow-lg shadow-emerald-500/25 hover:shadow-xl hover:shadow-emerald-500/30 hover:-translate-y-0.5 transition-all duration-200"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">New Announcement</span>
            <span className="sm:hidden">New</span>
          </Link>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
        {stats.map((stat) => (
          <div key={stat.label} className="card p-4 lg:p-5 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
            <div className="flex items-start justify-between mb-3">
              <div className={`p-2 lg:p-2.5 rounded-xl bg-gradient-to-br ${stat.gradient} shadow-lg ${stat.shadow}`}>
                <stat.icon className="w-4 h-4 lg:w-5 lg:h-5 text-white" />
              </div>
              <span className={`flex items-center gap-0.5 text-xs font-medium ${stat.up ? 'text-emerald-600' : 'text-red-500'}`}>
                {stat.up ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                {stat.change}
              </span>
            </div>
            <p className="text-2xl lg:text-3xl font-bold text-slate-800">{formatNumber(stat.value)}</p>
            <p className="text-xs lg:text-sm text-slate-500 mt-0.5">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
        {/* Performance Chart */}
        <div className="card p-4 lg:p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-lg font-bold text-slate-800">Performance</h2>
              <p className="text-sm text-slate-500">Clicks over the last 7 days</p>
            </div>
          </div>
          {data?.clicksTimeline?.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={data.clicksTimeline}>
                <defs>
                  <linearGradient id="clicksGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis 
                  dataKey="date" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#94a3b8', fontSize: 12 }}
                  tickFormatter={(val) => format(new Date(val), 'MMM d')}
                />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'white', 
                    border: 'none',
                    borderRadius: '12px',
                    boxShadow: '0 10px 40px -10px rgba(0,0,0,0.15)',
                    padding: '12px 16px'
                  }}
                  labelStyle={{ color: '#1e293b', fontWeight: 600, marginBottom: 4 }}
                />
                <Area 
                  type="monotone" 
                  dataKey="clicks" 
                  stroke="#10b981" 
                  strokeWidth={2} 
                  fill="url(#clicksGradient)" 
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-52 flex items-center justify-center text-slate-400">
              <div className="text-center">
                <MousePointerClick className="w-12 h-12 mx-auto mb-2 text-slate-300" />
                <p>No click data yet</p>
              </div>
            </div>
          )}
        </div>

        {/* Top Performing */}
        <div className="card p-4 lg:p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-lg font-bold text-slate-800">Top Performing</h2>
              <p className="text-sm text-slate-500">Best announcements by clicks</p>
            </div>
            <Link to="/analytics" className="text-sm text-emerald-600 font-medium hover:text-emerald-700 flex items-center gap-1">
              View all <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
          <div className="space-y-3">
            {data?.topAnnouncements?.length > 0 ? (
              data.topAnnouncements.map((item, idx) => (
                <Link 
                  key={item.id}
                  to={`/announcements/${item.id}`}
                  className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 transition-colors group"
                >
                  <span className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center text-xs font-semibold text-slate-500 group-hover:bg-emerald-100 group-hover:text-emerald-600 transition-colors">
                    {idx + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate group-hover:text-emerald-600 transition-colors">
                      {item.title}
                    </p>
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-500">
                      <span className="flex items-center gap-1">
                        <Eye className="w-3 h-3" /> {formatNumber(item.views)}
                      </span>
                      <span className="flex items-center gap-1">
                        <MousePointerClick className="w-3 h-3" /> {item.clicks}
                      </span>
                    </div>
                  </div>
                </Link>
              ))
            ) : (
              <div className="py-8 text-center text-slate-400">
                <Megaphone className="w-12 h-12 mx-auto mb-2 text-slate-300" />
                <p>No announcements yet</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Recent Announcements */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between p-4 lg:p-6 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-bold text-slate-800">Recent Announcements</h2>
            <p className="text-sm text-slate-500">Track your latest campaigns</p>
          </div>
          <Link to="/announcements" className="text-sm text-emerald-600 font-medium hover:text-emerald-700 flex items-center gap-1">
            View all <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
        
        {data?.recentAnnouncements?.length > 0 ? (
          <div className="divide-y divide-slate-100">
            {data.recentAnnouncements.map((item) => (
              <Link
                key={item.id}
                to={`/announcements/${item.id}`}
                className="flex items-center gap-4 p-4 lg:px-6 hover:bg-slate-50 transition-colors"
              >
                <div className={`p-2.5 rounded-xl ${
                  item.status === 'sent' ? 'bg-emerald-100' : 
                  item.status === 'scheduled' ? 'bg-blue-100' : 'bg-slate-100'
                }`}>
                  {item.status === 'sent' ? (
                    <Send className="w-4 h-4 text-emerald-600" />
                  ) : item.status === 'scheduled' ? (
                    <Clock className="w-4 h-4 text-blue-600" />
                  ) : (
                    <Megaphone className="w-4 h-4 text-slate-500" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-slate-800 truncate">{item.title}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {item.sent_at ? format(new Date(item.sent_at), 'MMM d, h:mm a') : 'Draft'}
                  </p>
                </div>
                <div className="hidden sm:flex items-center gap-4 text-sm">
                  <span className="flex items-center gap-1.5 text-slate-600">
                    <Eye className="w-4 h-4 text-slate-400" />
                    {item.views || 0}
                  </span>
                  <span className="flex items-center gap-1.5 text-slate-600">
                    <MousePointerClick className="w-4 h-4 text-slate-400" />
                    {item.clicks || 0}
                  </span>
                </div>
                <StatusBadge status={item.status} />
              </Link>
            ))}
          </div>
        ) : (
          <div className="p-12 text-center">
            <Megaphone className="w-16 h-16 mx-auto mb-4 text-slate-200" />
            <h3 className="text-lg font-medium text-slate-800 mb-2">No announcements yet</h3>
            <p className="text-slate-500 mb-4">Create your first announcement to get started</p>
            <Link 
              to="/announcements/new" 
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-xl font-medium shadow-lg shadow-emerald-500/25 hover:shadow-xl transition-all"
            >
              <Plus className="w-4 h-4" />
              Create Announcement
            </Link>
          </div>
        )}
      </div>

      {/* Mobile FAB */}
      <Link
        to="/announcements/new"
        className="lg:hidden fixed bottom-6 right-6 w-14 h-14 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-2xl shadow-lg shadow-emerald-500/30 flex items-center justify-center hover:shadow-xl active:scale-95 transition-all z-30"
      >
        <Plus className="w-6 h-6" />
      </Link>
    </div>
  );
}
