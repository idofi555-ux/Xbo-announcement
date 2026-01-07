import { useState, useEffect } from 'react';
import { getClickDetails, getViewDetails, getButtonClicks, getAggregatedAnalytics, exportClicks, getAnnouncements } from '../utils/api';
import {
  MousePointerClick, Eye, Users, Globe, Smartphone, Monitor,
  Tablet, Clock, Download, Calendar, ChevronLeft, ChevronRight,
  AtSign, TrendingUp, UserCheck, Activity
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { format, subDays, isToday } from 'date-fns';
import toast from 'react-hot-toast';

const COLORS = ['#3b82f6', '#8b5cf6', '#f59e0b', '#10b981', '#ef4444', '#06b6d4', '#ec4899', '#84cc16'];

const DeviceIcon = ({ type }) => {
  switch (type?.toLowerCase()) {
    case 'mobile': return <Smartphone className="w-4 h-4" />;
    case 'tablet': return <Tablet className="w-4 h-4" />;
    default: return <Monitor className="w-4 h-4" />;
  }
};

export default function ClickDetails() {
  const [activeTab, setActiveTab] = useState('users');
  const [data, setData] = useState({ clicks: [], views: [], buttonClicks: [] });
  const [aggregated, setAggregated] = useState(null);
  const [summaryStats, setSummaryStats] = useState({ uniqueUsers: 0, clicksToday: 0, mostActiveUser: null });
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pagination, setPagination] = useState({ total: 0, limit: 50, offset: 0 });
  const [filters, setFilters] = useState({
    start_date: format(subDays(new Date(), 29), 'yyyy-MM-dd'),
    end_date: format(new Date(), 'yyyy-MM-dd'),
    announcement_id: ''
  });

  useEffect(() => {
    loadAnnouncements();
  }, []);

  useEffect(() => {
    loadData();
    loadAggregated();
  }, [filters, activeTab, pagination.offset]);

  const loadAnnouncements = async () => {
    try {
      const { data } = await getAnnouncements({ status: 'sent' });
      setAnnouncements(data.announcements || []);
    } catch (error) {
      console.error('Failed to load announcements');
    }
  };

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = {
        ...filters,
        limit: pagination.limit,
        offset: pagination.offset
      };

      if (activeTab === 'clicks') {
        const { data } = await getClickDetails(params);
        setData(prev => ({ ...prev, clicks: data.clicks || [] }));
        setPagination(prev => ({ ...prev, total: data.total || 0 }));
      } else if (activeTab === 'views') {
        const { data } = await getViewDetails(params);
        setData(prev => ({ ...prev, views: data.views || [] }));
        setPagination(prev => ({ ...prev, total: data.total || 0 }));
      } else if (activeTab === 'users') {
        const { data } = await getButtonClicks(params);
        const buttonClicks = data.buttonClicks || [];
        setData(prev => ({ ...prev, buttonClicks }));
        setPagination(prev => ({ ...prev, total: data.total || 0 }));

        // Calculate summary stats
        const uniqueUserIds = new Set(buttonClicks.map(c => c.telegram_user_id));
        const todayClicks = buttonClicks.filter(c => c.clicked_at && isToday(new Date(c.clicked_at)));

        // Find most active user
        const userCounts = {};
        buttonClicks.forEach(c => {
          const key = c.telegram_user_id;
          if (!userCounts[key]) {
            userCounts[key] = { count: 0, name: c.telegram_first_name, username: c.telegram_username };
          }
          userCounts[key].count++;
        });
        const mostActive = Object.entries(userCounts).sort((a, b) => b[1].count - a[1].count)[0];

        setSummaryStats({
          uniqueUsers: uniqueUserIds.size,
          clicksToday: todayClicks.length,
          mostActiveUser: mostActive ? { ...mostActive[1], id: mostActive[0] } : null
        });
      }
    } catch (error) {
      console.error('Failed to load data:', error);
      setError('Failed to load data. The database tables may be updating - please try again.');
    } finally {
      setLoading(false);
    }
  };

  const loadAggregated = async () => {
    try {
      const { data } = await getAggregatedAnalytics(filters);
      setAggregated(data);
    } catch (error) {
      console.error('Failed to load aggregated data');
    }
  };

  const handleExport = async () => {
    try {
      const response = await exportClicks(filters);
      const blob = new Blob([response.data], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `clicks_export_${format(new Date(), 'yyyy-MM-dd')}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success('Export downloaded');
    } catch (error) {
      toast.error('Failed to export data');
    }
  };

  const totalPages = Math.ceil(pagination.total / pagination.limit);
  const currentPage = Math.floor(pagination.offset / pagination.limit) + 1;

  const goToPage = (page) => {
    setPagination(prev => ({ ...prev, offset: (page - 1) * prev.limit }));
  };

  const tabs = [
    { id: 'users', label: 'Telegram Users', icon: Users },
    { id: 'clicks', label: 'Link Clicks', icon: MousePointerClick },
    { id: 'views', label: 'Pixel Views', icon: Eye }
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800 dark:text-white">Click Details</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Detailed tracking data for views and clicks</p>
        </div>
        <button
          onClick={handleExport}
          className="btn btn-secondary flex items-center gap-2"
        >
          <Download className="w-4 h-4" />
          Export CSV
        </button>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
              <UserCheck className="w-5 h-5 text-blue-500" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-800 dark:text-white">{summaryStats.uniqueUsers}</p>
              <p className="text-xs text-slate-500">Unique Users</p>
            </div>
          </div>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-green-500" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-800 dark:text-white">{summaryStats.clicksToday}</p>
              <p className="text-xs text-slate-500">Clicks Today</p>
            </div>
          </div>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center">
              <Activity className="w-5 h-5 text-purple-500" />
            </div>
            <div>
              {summaryStats.mostActiveUser ? (
                <>
                  <p className="text-lg font-bold text-slate-800 dark:text-white truncate">
                    {summaryStats.mostActiveUser.name || 'Unknown'}
                  </p>
                  <p className="text-xs text-slate-500">
                    Most Active ({summaryStats.mostActiveUser.count} clicks)
                  </p>
                </>
              ) : (
                <>
                  <p className="text-lg font-bold text-slate-500">-</p>
                  <p className="text-xs text-slate-500">Most Active User</p>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="card p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-slate-500" />
            <input
              type="date"
              value={filters.start_date}
              onChange={(e) => setFilters(prev => ({ ...prev, start_date: e.target.value }))}
              className="input py-1.5 w-auto"
            />
            <span className="text-slate-500">to</span>
            <input
              type="date"
              value={filters.end_date}
              onChange={(e) => setFilters(prev => ({ ...prev, end_date: e.target.value }))}
              className="input py-1.5 w-auto"
            />
          </div>
          <select
            value={filters.announcement_id}
            onChange={(e) => setFilters(prev => ({ ...prev, announcement_id: e.target.value }))}
            className="input py-1.5 w-auto"
          >
            <option value="">All Messages</option>
            {announcements.map(a => (
              <option key={a.id} value={a.id}>{a.title}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Charts */}
      {aggregated && (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-4">
          {/* Clicks by Country */}
          <div className="card p-4">
            <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2">
              <Globe className="w-4 h-4" />
              Clicks by Country
            </h3>
            {aggregated.clicks?.byCountry?.length > 0 ? (
              <ResponsiveContainer width="100%" height={150}>
                <PieChart>
                  <Pie
                    data={aggregated.clicks.byCountry.slice(0, 5)}
                    cx="50%"
                    cy="50%"
                    innerRadius={30}
                    outerRadius={50}
                    dataKey="count"
                    nameKey="country"
                  >
                    {aggregated.clicks.byCountry.slice(0, 5).map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                    formatter={(value, name) => [value, name]}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[150px] flex items-center justify-center text-slate-500 text-sm">No data</div>
            )}
            <div className="mt-2 space-y-1">
              {aggregated.clicks?.byCountry?.slice(0, 5).map((item, idx) => (
                <div key={idx} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[idx % COLORS.length] }} />
                    <span className="text-slate-600 dark:text-slate-400">{item.country}</span>
                  </div>
                  <span className="text-slate-800 dark:text-slate-200 font-medium">{item.count}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Clicks by Device */}
          <div className="card p-4">
            <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2">
              <Smartphone className="w-4 h-4" />
              Clicks by Device
            </h3>
            {aggregated.clicks?.byDevice?.length > 0 ? (
              <ResponsiveContainer width="100%" height={150}>
                <BarChart data={aggregated.clicks.byDevice} layout="vertical">
                  <XAxis type="number" hide />
                  <YAxis dataKey="device_type" type="category" width={60} tick={{ fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                  />
                  <Bar dataKey="count" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[150px] flex items-center justify-center text-slate-500 text-sm">No data</div>
            )}
          </div>

          {/* Clicks by Browser */}
          <div className="card p-4">
            <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2">
              <Globe className="w-4 h-4" />
              Clicks by Browser
            </h3>
            {aggregated.clicks?.byBrowser?.length > 0 ? (
              <ResponsiveContainer width="100%" height={150}>
                <BarChart data={aggregated.clicks.byBrowser.slice(0, 5)} layout="vertical">
                  <XAxis type="number" hide />
                  <YAxis dataKey="browser" type="category" width={60} tick={{ fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                  />
                  <Bar dataKey="count" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[150px] flex items-center justify-center text-slate-500 text-sm">No data</div>
            )}
          </div>

          {/* Clicks by Hour */}
          <div className="card p-4">
            <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Clicks by Hour
            </h3>
            {aggregated.clicks?.byHour?.length > 0 ? (
              <ResponsiveContainer width="100%" height={150}>
                <BarChart data={aggregated.clicks.byHour}>
                  <XAxis dataKey="hour" tick={{ fontSize: 10 }} tickFormatter={(h) => `${h}:00`} />
                  <YAxis hide />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                    labelFormatter={(h) => `${h}:00 - ${h}:59`}
                  />
                  <Bar dataKey="count" fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[150px] flex items-center justify-center text-slate-500 text-sm">No data</div>
            )}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="card overflow-hidden">
        <div className="border-b border-slate-200 dark:border-slate-700">
          <div className="flex">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id);
                  setPagination(prev => ({ ...prev, offset: 0 }));
                }}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {error ? (
          <div className="p-8 text-center">
            <p className="text-red-500 mb-2">{error}</p>
            <button onClick={loadData} className="btn btn-secondary">Try Again</button>
          </div>
        ) : loading ? (
          <div className="p-8 text-center text-slate-500">Loading...</div>
        ) : (
          <>
            {/* Telegram Users Table */}
            {activeTab === 'users' && (
              <div className="overflow-x-auto">
                <table className="table">
                  <thead>
                    <tr>
                      <th>User</th>
                      <th>Telegram</th>
                      <th>Action</th>
                      <th>Message</th>
                      <th>Date & Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.buttonClicks.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="text-center text-slate-500 py-8">No user data found</td>
                      </tr>
                    ) : (
                      data.buttonClicks.map((click) => (
                        <tr key={click.id}>
                          <td>
                            <div className="flex items-center gap-2">
                              <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center">
                                <Users className="w-4 h-4 text-blue-500" />
                              </div>
                              <div>
                                <p className="font-medium text-slate-800 dark:text-white">
                                  {click.telegram_first_name || 'Unknown User'}
                                </p>
                                <p className="text-xs text-slate-500">ID: {click.telegram_user_id}</p>
                              </div>
                            </div>
                          </td>
                          <td>
                            {click.telegram_username ? (
                              <a
                                href={`https://t.me/${click.telegram_username}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1 text-blue-500 hover:underline"
                              >
                                <AtSign className="w-3 h-3" />
                                {click.telegram_username}
                              </a>
                            ) : (
                              <span className="text-slate-500">-</span>
                            )}
                          </td>
                          <td>
                            <span className="badge badge-info">{click.button_text}</span>
                          </td>
                          <td className="text-slate-700 dark:text-slate-300 max-w-[200px] truncate">
                            {click.announcement_title || '-'}
                          </td>
                          <td className="text-slate-500 text-sm whitespace-nowrap">
                            {click.clicked_at ? format(new Date(click.clicked_at), 'MMM d, yyyy h:mm a') : '-'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* Link Clicks Table */}
            {activeTab === 'clicks' && (
              <div className="overflow-x-auto">
                <table className="table">
                  <thead>
                    <tr>
                      <th>IP Address</th>
                      <th>Location</th>
                      <th>Device</th>
                      <th>Browser</th>
                      <th>Link</th>
                      <th>Date & Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.clicks.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="text-center text-slate-500 py-8">No click data found</td>
                      </tr>
                    ) : (
                      data.clicks.map((click) => (
                        <tr key={click.id}>
                          <td>
                            <span className="font-mono text-xs text-slate-600 dark:text-slate-400">
                              {click.ip_address || 'Unknown'}
                            </span>
                          </td>
                          <td>
                            <div className="flex items-center gap-1">
                              <Globe className="w-3 h-3 text-slate-400" />
                              <span className="text-slate-700 dark:text-slate-300">{click.country || 'Unknown'}</span>
                              {click.city && click.city !== 'Unknown' && (
                                <span className="text-slate-500">, {click.city}</span>
                              )}
                            </div>
                          </td>
                          <td>
                            <div className="flex items-center gap-1.5">
                              <DeviceIcon type={click.device_type} />
                              <span className="capitalize text-slate-700 dark:text-slate-300">{click.device_type || 'Unknown'}</span>
                            </div>
                          </td>
                          <td className="text-slate-600 dark:text-slate-400">{click.browser || 'Unknown'}</td>
                          <td>
                            {click.original_url ? (
                              <a
                                href={click.original_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-500 hover:underline truncate max-w-[200px] block"
                                title={click.original_url}
                              >
                                {click.original_url.length > 30 ? click.original_url.substring(0, 30) + '...' : click.original_url}
                              </a>
                            ) : '-'}
                          </td>
                          <td className="text-slate-500 text-sm whitespace-nowrap">
                            {click.clicked_at ? format(new Date(click.clicked_at), 'MMM d, yyyy h:mm a') : '-'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pixel Views Table */}
            {activeTab === 'views' && (
              <div className="overflow-x-auto">
                <table className="table">
                  <thead>
                    <tr>
                      <th>IP Address</th>
                      <th>Location</th>
                      <th>Device</th>
                      <th>Browser</th>
                      <th>Channel</th>
                      <th>Date & Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.views.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="text-center text-slate-500 py-8">No view data found</td>
                      </tr>
                    ) : (
                      data.views.map((view) => (
                        <tr key={view.id}>
                          <td>
                            <span className="font-mono text-xs text-slate-600 dark:text-slate-400">
                              {view.ip_address || 'Unknown'}
                            </span>
                          </td>
                          <td>
                            <div className="flex items-center gap-1">
                              <Globe className="w-3 h-3 text-slate-400" />
                              <span className="text-slate-700 dark:text-slate-300">{view.country || 'Unknown'}</span>
                              {view.city && view.city !== 'Unknown' && (
                                <span className="text-slate-500">, {view.city}</span>
                              )}
                            </div>
                          </td>
                          <td>
                            <div className="flex items-center gap-1.5">
                              <DeviceIcon type={view.device_type} />
                              <span className="capitalize text-slate-700 dark:text-slate-300">{view.device_type || 'Unknown'}</span>
                            </div>
                          </td>
                          <td className="text-slate-600 dark:text-slate-400">{view.browser || 'Unknown'}</td>
                          <td className="text-slate-700 dark:text-slate-300">{view.channel_title || '-'}</td>
                          <td className="text-slate-500 text-sm whitespace-nowrap">
                            {view.viewed_at ? format(new Date(view.viewed_at), 'MMM d, yyyy h:mm a') : '-'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination */}
            {pagination.total > pagination.limit && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 dark:border-slate-700">
                <p className="text-sm text-slate-500">
                  Showing {pagination.offset + 1} to {Math.min(pagination.offset + pagination.limit, pagination.total)} of {pagination.total}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => goToPage(currentPage - 1)}
                    disabled={currentPage === 1}
                    className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <span className="text-sm text-slate-600 dark:text-slate-400">
                    Page {currentPage} of {totalPages}
                  </span>
                  <button
                    onClick={() => goToPage(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
