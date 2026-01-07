import { useState, useEffect } from 'react';
import { getBestTimeInsights, getCampaignInsights, getChannelInsights, getRecommendations } from '../utils/api';
import {
  Lightbulb, Clock, Globe, Smartphone, Monitor, Users, TrendingUp, TrendingDown,
  BarChart3, Award, Target, Zap, AlertCircle
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import toast from 'react-hot-toast';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const getIcon = (iconName) => {
  const icons = {
    'clock': Clock,
    'globe': Globe,
    'smartphone': Smartphone,
    'monitor': Monitor,
    'users': Users,
    'trending-up': TrendingUp,
    'trending-down': TrendingDown
  };
  return icons[iconName] || Lightbulb;
};

const priorityColors = {
  high: 'bg-red-500/10 text-red-600 border-red-500/20',
  medium: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20',
  low: 'bg-green-500/10 text-green-600 border-green-500/20'
};

export default function Insights() {
  const [loading, setLoading] = useState(true);
  const [bestTime, setBestTime] = useState(null);
  const [campaigns, setCampaigns] = useState(null);
  const [channels, setChannels] = useState(null);
  const [recommendations, setRecommendations] = useState([]);

  useEffect(() => {
    loadAllInsights();
  }, []);

  const loadAllInsights = async () => {
    setLoading(true);
    try {
      const [bestTimeRes, campaignsRes, channelsRes, recsRes] = await Promise.all([
        getBestTimeInsights().catch(() => ({ data: null })),
        getCampaignInsights().catch(() => ({ data: null })),
        getChannelInsights().catch(() => ({ data: null })),
        getRecommendations().catch(() => ({ data: { recommendations: [] } }))
      ]);

      setBestTime(bestTimeRes.data);
      setCampaigns(campaignsRes.data);
      setChannels(channelsRes.data);
      setRecommendations(recsRes.data?.recommendations || []);
    } catch (error) {
      toast.error('Failed to load insights');
    } finally {
      setLoading(false);
    }
  };

  // Get max value for heatmap color scaling
  const getHeatmapMax = () => {
    if (!bestTime?.heatmap) return 1;
    return Math.max(...bestTime.heatmap.flat()) || 1;
  };

  // Get color intensity for heatmap cell
  const getHeatmapColor = (value) => {
    const max = getHeatmapMax();
    const intensity = value / max;
    if (intensity === 0) return 'bg-slate-100 dark:bg-slate-800';
    if (intensity < 0.25) return 'bg-blue-100 dark:bg-blue-900/30';
    if (intensity < 0.5) return 'bg-blue-200 dark:bg-blue-800/50';
    if (intensity < 0.75) return 'bg-blue-400 dark:bg-blue-600';
    return 'bg-blue-600 dark:bg-blue-500';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-500">Loading insights...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-semibold text-slate-800 dark:text-white flex items-center gap-2">
          <Lightbulb className="w-6 h-6 text-yellow-500" />
          Insights
        </h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1">
          Smart recommendations based on your engagement data
        </p>
      </div>

      {/* Smart Recommendations */}
      <div className="card p-6">
        <h2 className="text-lg font-semibold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
          <Zap className="w-5 h-5 text-yellow-500" />
          Smart Recommendations
        </h2>
        {recommendations.length > 0 ? (
          <div className="space-y-3">
            {recommendations.map((rec, idx) => {
              const Icon = getIcon(rec.icon);
              return (
                <div
                  key={idx}
                  className={`p-4 rounded-lg border ${priorityColors[rec.priority]} flex items-start gap-3`}
                >
                  <div className="w-10 h-10 rounded-lg bg-white dark:bg-slate-800 flex items-center justify-center shrink-0">
                    <Icon className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-medium text-slate-800 dark:text-white">{rec.title}</h3>
                    <p className="text-sm text-slate-600 dark:text-slate-300 mt-0.5">{rec.description}</p>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-8 text-slate-500">
            <AlertCircle className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>Not enough data for recommendations yet.</p>
            <p className="text-sm mt-1">Send more announcements to generate insights.</p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Best Time Heatmap */}
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
            <Clock className="w-5 h-5 text-blue-500" />
            Best Time to Send
          </h2>
          {bestTime?.heatmap ? (
            <>
              {bestTime.bestTime?.clicks > 0 && (
                <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                  <p className="text-sm text-blue-700 dark:text-blue-300">
                    <strong>Best time:</strong> {bestTime.bestTime.dayName} at {bestTime.bestTime.hour}:00
                    <span className="text-blue-500 ml-1">({bestTime.bestTime.clicks} clicks)</span>
                  </p>
                </div>
              )}
              <div className="overflow-x-auto">
                <div className="min-w-[600px]">
                  {/* Hour labels */}
                  <div className="flex mb-1">
                    <div className="w-10"></div>
                    {[0, 3, 6, 9, 12, 15, 18, 21].map(h => (
                      <div key={h} className="flex-1 text-xs text-slate-500 text-center">{h}:00</div>
                    ))}
                  </div>
                  {/* Heatmap rows */}
                  {DAYS.map((day, dayIdx) => (
                    <div key={day} className="flex items-center mb-1">
                      <div className="w-10 text-xs text-slate-500 font-medium">{day}</div>
                      <div className="flex-1 flex gap-0.5">
                        {Array.from({ length: 24 }, (_, hour) => (
                          <div
                            key={hour}
                            className={`flex-1 h-5 rounded-sm ${getHeatmapColor(bestTime.heatmap[dayIdx]?.[hour] || 0)}`}
                            title={`${DAY_NAMES[dayIdx]} ${hour}:00 - ${bestTime.heatmap[dayIdx]?.[hour] || 0} clicks`}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                  {/* Legend */}
                  <div className="flex items-center justify-end mt-3 gap-2 text-xs text-slate-500">
                    <span>Less</span>
                    <div className="flex gap-0.5">
                      <div className="w-4 h-4 rounded-sm bg-slate-100 dark:bg-slate-800" />
                      <div className="w-4 h-4 rounded-sm bg-blue-100 dark:bg-blue-900/30" />
                      <div className="w-4 h-4 rounded-sm bg-blue-200 dark:bg-blue-800/50" />
                      <div className="w-4 h-4 rounded-sm bg-blue-400 dark:bg-blue-600" />
                      <div className="w-4 h-4 rounded-sm bg-blue-600 dark:bg-blue-500" />
                    </div>
                    <span>More</span>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="text-center py-8 text-slate-500">No timing data available</div>
          )}
        </div>

        {/* Campaign Performance */}
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-purple-500" />
            Campaign Performance
          </h2>
          {campaigns?.campaigns?.length > 0 ? (
            <>
              {campaigns.bestCampaign && (
                <div className="mb-4 p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg flex items-center gap-2">
                  <Award className="w-5 h-5 text-purple-500" />
                  <p className="text-sm text-purple-700 dark:text-purple-300">
                    <strong>Top performer:</strong> {campaigns.bestCampaign.name}
                    <span className="text-purple-500 ml-1">({campaigns.bestCampaign.total_clicks} clicks)</span>
                  </p>
                </div>
              )}
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={campaigns.campaigns.slice(0, 5)} layout="vertical">
                  <XAxis type="number" hide />
                  <YAxis
                    dataKey="name"
                    type="category"
                    width={100}
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v) => v.length > 12 ? v.substring(0, 12) + '...' : v}
                  />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                    formatter={(value, name) => [value, name === 'total_clicks' ? 'Clicks' : name]}
                  />
                  <Bar dataKey="total_clicks" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
              <div className="mt-4 space-y-2">
                {campaigns.campaigns.slice(0, 3).map((c, idx) => (
                  <div key={c.id} className="flex items-center justify-between text-sm">
                    <span className="text-slate-600 dark:text-slate-300">{c.name}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-slate-500">{c.unique_users} users</span>
                      <span className="font-medium text-slate-800 dark:text-white">{c.ctr}% CTR</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="text-center py-8 text-slate-500">No campaign data available</div>
          )}
        </div>

        {/* Top Channels */}
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
            <Users className="w-5 h-5 text-green-500" />
            Channel Rankings
          </h2>
          {channels?.rankedChannels?.length > 0 ? (
            <div className="space-y-3">
              {channels.rankedChannels.slice(0, 5).map((ch, idx) => (
                <div key={ch.id} className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                    idx === 0 ? 'bg-yellow-500 text-white' :
                    idx === 1 ? 'bg-slate-400 text-white' :
                    idx === 2 ? 'bg-amber-600 text-white' :
                    'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                  }`}>
                    {idx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-800 dark:text-white truncate">{ch.title}</p>
                    <p className="text-xs text-slate-500">
                      {ch.member_count.toLocaleString()} members
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-slate-800 dark:text-white">{ch.engagement_rate}%</p>
                    <p className="text-xs text-slate-500">engagement</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-slate-500">No channel data available</div>
          )}
        </div>

        {/* Best Time Per Channel */}
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
            <Target className="w-5 h-5 text-orange-500" />
            Optimal Send Time by Channel
          </h2>
          {bestTime?.channelBestTimes?.length > 0 ? (
            <div className="space-y-3">
              {bestTime.channelBestTimes.slice(0, 5).map((ch, idx) => (
                <div key={ch.channel_id} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
                  <span className="font-medium text-slate-800 dark:text-white truncate max-w-[150px]">
                    {ch.channel_title}
                  </span>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-slate-500">{ch.dayName}</span>
                    <span className="font-bold text-orange-600 dark:text-orange-400">{ch.best_hour}:00</span>
                    <span className="text-xs text-slate-400">({ch.clicks} clicks)</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-slate-500">No channel timing data available</div>
          )}
        </div>
      </div>
    </div>
  );
}
