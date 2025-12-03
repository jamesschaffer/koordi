import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSocketEvents } from '../hooks/useSocketEvents';
import { getEvents } from '../lib/api-events';
import { Menu, LogOut, User as UserIcon } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetFooter,
} from './ui/sheet';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { Button } from './ui/button';

function Layout() {
  const { user, logout, loading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Enable WebSocket real-time updates
  useSocketEvents();

  // Fetch unassigned events count for nav badge
  // Uses same default filter as Dashboard: start_date = today, exclude_past = true
  const token = localStorage.getItem('auth_token') || '';
  const todayDate = new Date().toISOString().split('T')[0];
  const { data: unassignedEvents } = useQuery({
    queryKey: ['events', 'unassigned-count', 'nav', todayDate],
    queryFn: () => getEvents(token, { unassigned: true, start_date: todayDate, exclude_past: true }),
    enabled: !!token && !!user,
    refetchInterval: 60000, // Refresh every minute
  });
  const unassignedCount = unassignedEvents?.length || 0;

  // Redirect to setup if user doesn't have home address
  useEffect(() => {
    if (!loading && user && !user.home_address) {
      navigate('/setup');
    }
  }, [user, loading, navigate]);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-8">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Koordie</h1>
              </div>

              {/* Desktop Navigation */}
              <nav className="hidden md:flex gap-4">
                <Link
                  to="/"
                  className={`relative px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    location.pathname === '/'
                      ? 'bg-blue-100 text-blue-700'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  Events
                  {unassignedCount > 0 && (
                    <span className="absolute -top-2 -right-2 min-w-5 h-5 flex items-center justify-center rounded-full bg-red-500 text-white text-xs font-medium px-1.5">
                      {unassignedCount > 99 ? '99+' : unassignedCount}
                    </span>
                  )}
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
                <Link
                  to="/children"
                  className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    location.pathname === '/children'
                      ? 'bg-blue-100 text-blue-700'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  Family
                </Link>
                <Link
                  to="/settings"
                  className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    location.pathname === '/settings'
                      ? 'bg-blue-100 text-blue-700'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  Settings
                </Link>
              </nav>
            </div>

            {/* Mobile Menu Button */}
            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <SheetTrigger asChild className="md:hidden">
                <Button variant="ghost" size="icon">
                  <Menu className="h-6 w-6" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left">
                <SheetHeader>
                  <SheetTitle>Menu</SheetTitle>
                </SheetHeader>
                <nav className="flex flex-col gap-2 mt-6">
                  <Link
                    to="/"
                    onClick={() => setMobileMenuOpen(false)}
                    className={`relative px-3 py-3 rounded-md text-base font-medium transition-colors ${
                      location.pathname === '/'
                        ? 'bg-blue-100 text-blue-700'
                        : 'text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    Events
                    {unassignedCount > 0 && (
                      <span className="absolute top-1 right-1 min-w-5 h-5 flex items-center justify-center rounded-full bg-red-500 text-white text-xs font-medium px-1.5">
                        {unassignedCount > 99 ? '99+' : unassignedCount}
                      </span>
                    )}
                  </Link>
                  <Link
                    to="/calendars"
                    onClick={() => setMobileMenuOpen(false)}
                    className={`px-3 py-3 rounded-md text-base font-medium transition-colors ${
                      location.pathname === '/calendars'
                        ? 'bg-blue-100 text-blue-700'
                        : 'text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    Calendars
                  </Link>
                  <Link
                    to="/children"
                    onClick={() => setMobileMenuOpen(false)}
                    className={`px-3 py-3 rounded-md text-base font-medium transition-colors ${
                      location.pathname === '/children'
                        ? 'bg-blue-100 text-blue-700'
                        : 'text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    Family
                  </Link>
                  <Link
                    to="/settings"
                    onClick={() => setMobileMenuOpen(false)}
                    className={`px-3 py-3 rounded-md text-base font-medium transition-colors ${
                      location.pathname === '/settings'
                        ? 'bg-blue-100 text-blue-700'
                        : 'text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    Settings
                  </Link>
                </nav>
                {user && (
                  <SheetFooter className="mt-8 border-t pt-6">
                    <div className="flex flex-col gap-4 w-full">
                      <div className="flex items-center gap-3">
                        {user.avatar_url && (
                          <img
                            src={user.avatar_url}
                            alt={user.name}
                            className="w-10 h-10 rounded-full"
                          />
                        )}
                        <div>
                          <p className="text-sm font-medium text-gray-900">{user.name}</p>
                          <p className="text-xs text-gray-500">{user.email}</p>
                        </div>
                      </div>
                      <Button
                        onClick={() => {
                          logout();
                          setMobileMenuOpen(false);
                        }}
                        variant="outline"
                        className="w-full"
                      >
                        Logout
                      </Button>
                    </div>
                  </SheetFooter>
                )}
              </SheetContent>
            </Sheet>

            {/* Desktop User menu */}
            {user && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild className="hidden md:flex">
                  <button className="rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">
                    {user.avatar_url ? (
                      <img
                        src={user.avatar_url}
                        alt={user.name}
                        className="w-9 h-9 rounded-full hover:opacity-80 transition-opacity cursor-pointer"
                      />
                    ) : (
                      <div className="w-9 h-9 rounded-full bg-blue-500 flex items-center justify-center hover:bg-blue-600 transition-colors cursor-pointer">
                        <UserIcon className="w-5 h-5 text-white" />
                      </div>
                    )}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm font-medium text-gray-900">{user.name}</p>
                      <p className="text-xs text-gray-500">{user.email}</p>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={logout} className="cursor-pointer">
                    <LogOut className="w-4 h-4 mr-2" />
                    Logout
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <p className="text-center text-sm text-gray-500">
            © 2025 Koordie. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}

export default Layout;
