import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
import AuthCallback from './pages/AuthCallback';
import Calendars from './pages/Calendars';
import { Toaster } from '@/components/ui/sonner';

function App() {
  return (
    <>
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<Login />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/auth/error" element={<Login />} />

        {/* Protected routes */}
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
          {/* More protected routes will be added here */}
        </Route>
      </Routes>
      <Toaster />
    </>
  );
}

export default App;
