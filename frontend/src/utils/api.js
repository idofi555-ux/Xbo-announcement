import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || '/api';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('xbo_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle auth errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('xbo_token');
      localStorage.removeItem('xbo_user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Auth
export const login = (email, password) => api.post('/auth/login', { email, password });
export const getMe = () => api.get('/auth/me');
export const getUsers = () => api.get('/auth/users');
export const createUser = (data) => api.post('/auth/register', data);
export const updateUser = (id, data) => api.put(`/auth/users/${id}`, data);
export const deleteUser = (id) => api.delete(`/auth/users/${id}`);
export const changePassword = (data) => api.put('/auth/password', data);

// Channels
export const getChannels = () => api.get('/channels');
export const getChannel = (id) => api.get(`/channels/${id}`);
export const createChannel = (data) => api.post('/channels', data);
export const updateChannel = (id, data) => api.put(`/channels/${id}`, data);
export const deleteChannel = (id) => api.delete(`/channels/${id}`);
export const refreshChannel = (id) => api.post(`/channels/${id}/refresh`);

// Announcements
export const getAnnouncements = (params) => api.get('/announcements', { params });
export const getAnnouncement = (id) => api.get(`/announcements/${id}`);
export const createAnnouncement = (data) => api.post('/announcements', data);
export const updateAnnouncement = (id, data) => api.put(`/announcements/${id}`, data);
export const deleteAnnouncement = (id) => api.delete(`/announcements/${id}`);
export const sendAnnouncement = (id) => api.post(`/announcements/${id}/send`);
export const duplicateAnnouncement = (id) => api.post(`/announcements/${id}/duplicate`);

// Campaigns
export const getCampaigns = () => api.get('/campaigns');
export const createCampaign = (data) => api.post('/campaigns', data);
export const updateCampaign = (id, data) => api.put(`/campaigns/${id}`, data);
export const deleteCampaign = (id) => api.delete(`/campaigns/${id}`);

// Analytics
export const getOverview = () => api.get('/analytics/overview');
export const getDetailedAnalytics = (params) => api.get('/analytics/detailed', { params });
export const getActivity = (params) => api.get('/analytics/activity', { params });
export const getClickDetails = (params) => api.get('/analytics/clicks', { params });
export const getViewDetails = (params) => api.get('/analytics/views', { params });
export const getButtonClicks = (params) => api.get('/analytics/button-clicks', { params });
export const getAggregatedAnalytics = (params) => api.get('/analytics/aggregated', { params });
export const exportClicks = (params) => api.get('/analytics/export/clicks', { params, responseType: 'blob' });

// Insights
export const getBestTimeInsights = () => api.get('/analytics/insights/best-time');
export const getCampaignInsights = () => api.get('/analytics/insights/campaigns');
export const getChannelInsights = () => api.get('/analytics/insights/channels');
export const getRecommendations = () => api.get('/analytics/insights/recommendations');

// User details
export const getUserDetails = (telegramUserId) => api.get(`/analytics/user/${telegramUserId}`);

// Health check
export const healthCheck = () => api.get('/health');

// System Logs
export const getLogs = (params) => api.get('/logs', { params });
export const getLog = (id) => api.get(`/logs/${id}`);
export const cleanupLogs = (days = 30) => api.delete('/logs/cleanup', { params: { days } });

export default api;
