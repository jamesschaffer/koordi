import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
import AuthCallback from './pages/AuthCallback';
import Setup from './pages/Setup';
import Calendars from './pages/Calendars';
import Children from './pages/Children';
import Settings from './pages/Settings';
import AcceptInvitation from './pages/AcceptInvitation';
import { Toaster } from '@/components/ui/sonner';

function App() {
  return (
    <>
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<Login />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/auth/error" element={<Login />} />

        {/* Setup route - protected but no layout */}
        <Route
          path="/setup"
          element={
            <ProtectedRoute>
              <Setup />
            </ProtectedRoute>
          }
        />

        {/* Protected routes with layout */}
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="/calendars" element={<Calendars />} />
          <Route path="/children" element={<Children />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/invitations/accept/:token" element={<AcceptInvitation />} />
          {/* More protected routes will be added here */}
        </Route>
      </Routes>
      <Toaster />
    </>
  );
}

export default App;
