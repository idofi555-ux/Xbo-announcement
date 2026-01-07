import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { changePassword, healthCheck } from '../utils/api';
import { Settings as SettingsIcon, Key, Server, CheckCircle, XCircle } from 'lucide-react';
import toast from 'react-hot-toast';

export default function Settings() {
  const { user } = useAuth();
  const [health, setHealth] = useState(null);
  const [passwords, setPasswords] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    checkHealth();
  }, []);

  const checkHealth = async () => {
    try {
      const { data } = await healthCheck();
      setHealth(data);
    } catch (error) {
      setHealth({ status: 'error', bot: 'error' });
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    
    if (passwords.newPassword !== passwords.confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    if (passwords.newPassword.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }

    setSaving(true);
    try {
      await changePassword({
        currentPassword: passwords.currentPassword,
        newPassword: passwords.newPassword
      });
      toast.success('Password updated');
      setPasswords({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to change password');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in max-w-2xl">
      <div>
        <h1 className="text-2xl font-semibold text-white">Settings</h1>
        <p className="text-dark-400 mt-1">Manage your account and system settings</p>
      </div>

      {/* System Status */}
      <div className="card p-6">
        <div className="flex items-center gap-3 mb-4">
          <Server className="w-5 h-5 text-dark-400" />
          <h2 className="text-lg font-medium text-white">System Status</h2>
        </div>
        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 bg-dark-800/50 rounded-lg">
            <span className="text-dark-300">API Server</span>
            <div className="flex items-center gap-2">
              {health?.status === 'ok' ? (
                <><CheckCircle className="w-4 h-4 text-blue-400" /> <span className="text-blue-400">Connected</span></>
              ) : (
                <><XCircle className="w-4 h-4 text-red-400" /> <span className="text-red-400">Error</span></>
              )}
            </div>
          </div>
          <div className="flex items-center justify-between p-3 bg-dark-800/50 rounded-lg">
            <span className="text-dark-300">Telegram Bot</span>
            <div className="flex items-center gap-2">
              {health?.bot === 'connected' ? (
                <><CheckCircle className="w-4 h-4 text-blue-400" /> <span className="text-blue-400">Connected</span></>
              ) : (
                <><XCircle className="w-4 h-4 text-yellow-400" /> <span className="text-yellow-400">Not configured</span></>
              )}
            </div>
          </div>
        </div>
        {health?.bot !== 'connected' && (
          <p className="text-sm text-dark-500 mt-3">
            Configure your Telegram bot token in the .env file to enable bot features.
          </p>
        )}
      </div>

      {/* Change Password */}
      <div className="card p-6">
        <div className="flex items-center gap-3 mb-4">
          <Key className="w-5 h-5 text-dark-400" />
          <h2 className="text-lg font-medium text-white">Change Password</h2>
        </div>
        <form onSubmit={handleChangePassword} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-dark-300 mb-2">Current Password</label>
            <input
              type="password"
              value={passwords.currentPassword}
              onChange={(e) => setPasswords(prev => ({ ...prev, currentPassword: e.target.value }))}
              className="input"
              placeholder="••••••••"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-dark-300 mb-2">New Password</label>
            <input
              type="password"
              value={passwords.newPassword}
              onChange={(e) => setPasswords(prev => ({ ...prev, newPassword: e.target.value }))}
              className="input"
              placeholder="••••••••"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-dark-300 mb-2">Confirm New Password</label>
            <input
              type="password"
              value={passwords.confirmPassword}
              onChange={(e) => setPasswords(prev => ({ ...prev, confirmPassword: e.target.value }))}
              className="input"
              placeholder="••••••••"
              required
            />
          </div>
          <button type="submit" disabled={saving} className="btn btn-primary">
            {saving ? 'Saving...' : 'Update Password'}
          </button>
        </form>
      </div>

      {/* Account Info */}
      <div className="card p-6">
        <div className="flex items-center gap-3 mb-4">
          <SettingsIcon className="w-5 h-5 text-dark-400" />
          <h2 className="text-lg font-medium text-white">Account Info</h2>
        </div>
        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 bg-dark-800/50 rounded-lg">
            <span className="text-dark-300">Email</span>
            <span className="text-dark-100">{user?.email}</span>
          </div>
          <div className="flex items-center justify-between p-3 bg-dark-800/50 rounded-lg">
            <span className="text-dark-300">Name</span>
            <span className="text-dark-100">{user?.name}</span>
          </div>
          <div className="flex items-center justify-between p-3 bg-dark-800/50 rounded-lg">
            <span className="text-dark-300">Role</span>
            <span className="text-dark-100 capitalize">{user?.role}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
