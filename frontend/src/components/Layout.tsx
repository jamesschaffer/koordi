import { Outlet, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

function Layout() {
  const { user, logout } = useAuth();
  const location = useLocation();

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-8">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Koordi</h1>
                <p className="text-sm text-gray-600">Family Scheduling Assistant</p>
              </div>

              {/* Navigation */}
              <nav className="flex gap-4">
                <Link
                  to="/"
                  className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    location.pathname === '/'
                      ? 'bg-blue-100 text-blue-700'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  Dashboard
                </Link>
                <Link
                  to="/calendars"
                  className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    location.pathname === '/calendars'
                      ? 'bg-blue-100 text-blue-700'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  Calendars
                </Link>
              </nav>
            </div>

            {/* User menu */}
            {user && (
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-3">
                  {user.avatar_url && (
                    <img
                      src={user.avatar_url}
                      alt={user.name}
                      className="w-8 h-8 rounded-full"
                    />
                  )}
                  <div className="text-right">
                    <p className="text-sm font-medium text-gray-900">{user.name}</p>
                    <p className="text-xs text-gray-500">{user.email}</p>
                  </div>
                </div>
                <button
                  onClick={logout}
                  className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
                >
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <p className="text-center text-sm text-gray-500">
            © 2024 Koordi. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}

export default Layout;
