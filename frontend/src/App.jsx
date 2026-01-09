import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { ThemeProvider } from './hooks/useTheme';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Announcements from './pages/Announcements';
import AnnouncementEditor from './pages/AnnouncementEditor';
import Channels from './pages/Channels';
import Campaigns from './pages/Campaigns';
import Analytics from './pages/Analytics';
import ClickDetails from './pages/ClickDetails';
import Insights from './pages/Insights';
import Users from './pages/Users';
import Settings from './pages/Settings';
import Inbox from './pages/Inbox';
import ConversationView from './pages/ConversationView';
import Customers from './pages/Customers';
import CustomerDetail from './pages/CustomerDetail';
import QuickReplies from './pages/QuickReplies';
import Tickets from './pages/Tickets';
import TicketView from './pages/TicketView';
import Logs from './pages/Logs';

function ProtectedRoute({ children, adminOnly = false, requiredPermission = null }) {
  const { user, loading, isAdmin, hasPermission } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-dark-950">
        <div className="w-8 h-8 border-2 border-brand-500/30 border-t-brand-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (adminOnly && !isAdmin) {
    return <Navigate to="/" replace />;
  }

  // Check for required permission
  if (requiredPermission && !hasPermission(requiredPermission)) {
    return <Navigate to="/" replace />;
  }

  return <Layout>{children}</Layout>;
}

function PublicRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-dark-950">
        <div className="w-8 h-8 border-2 border-brand-500/30 border-t-brand-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (user) {
    return <Navigate to="/" replace />;
  }

  return children;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />

      {/* Dashboard - all authenticated users */}
      <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />

      {/* Marketing routes - require marketing permissions */}
      <Route path="/announcements" element={<ProtectedRoute requiredPermission="announcements"><Announcements /></ProtectedRoute>} />
      <Route path="/announcements/:id" element={<ProtectedRoute requiredPermission="announcements"><AnnouncementEditor /></ProtectedRoute>} />
      <Route path="/channels" element={<ProtectedRoute requiredPermission="channels"><Channels /></ProtectedRoute>} />
      <Route path="/campaigns" element={<ProtectedRoute requiredPermission="campaigns"><Campaigns /></ProtectedRoute>} />
      <Route path="/analytics" element={<ProtectedRoute requiredPermission="analytics"><Analytics /></ProtectedRoute>} />
      <Route path="/click-details" element={<ProtectedRoute requiredPermission="click-details"><ClickDetails /></ProtectedRoute>} />
      <Route path="/insights" element={<ProtectedRoute requiredPermission="insights"><Insights /></ProtectedRoute>} />

      {/* Support routes - require support permissions */}
      <Route path="/inbox" element={<ProtectedRoute requiredPermission="inbox"><Inbox /></ProtectedRoute>} />
      <Route path="/inbox/:id" element={<ProtectedRoute requiredPermission="inbox"><ConversationView /></ProtectedRoute>} />
      <Route path="/customers" element={<ProtectedRoute requiredPermission="customers"><Customers /></ProtectedRoute>} />
      <Route path="/customers/:id" element={<ProtectedRoute requiredPermission="customers"><CustomerDetail /></ProtectedRoute>} />
      <Route path="/quick-replies" element={<ProtectedRoute requiredPermission="quick-replies"><QuickReplies /></ProtectedRoute>} />
      <Route path="/tickets" element={<ProtectedRoute requiredPermission="tickets"><Tickets /></ProtectedRoute>} />
      <Route path="/tickets/:id" element={<ProtectedRoute requiredPermission="tickets"><TicketView /></ProtectedRoute>} />
      <Route path="/logs" element={<ProtectedRoute requiredPermission="logs"><Logs /></ProtectedRoute>} />

      {/* Admin routes */}
      <Route path="/users" element={<ProtectedRoute adminOnly><Users /></ProtectedRoute>} />

      {/* Settings - all authenticated users */}
      <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <AppRoutes />
          <Toaster
          position="top-right"
          toastOptions={{
            style: {
              background: '#1e293b',
              color: '#f1f5f9',
              border: '1px solid #334155',
            },
            success: {
              iconTheme: {
                primary: '#3b82f6',
                secondary: '#f1f5f9',
              },
            },
            error: {
              iconTheme: {
                primary: '#ef4444',
                secondary: '#f1f5f9',
              },
            },
          }}
          />
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}
