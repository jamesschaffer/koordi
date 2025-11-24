# Tech Debt: Dual User Data Stores

**Date Identified:** 2025-11-24
**Severity:** Medium
**Estimated Fix Time:** 2-3 hours

## Problem Summary

The application currently maintains **two separate user data stores** that manage the same user information:

1. **AuthContext** (Custom React Context)
   - Location: `frontend/src/contexts/AuthContext.tsx`
   - Uses: `useState` with manual API calls to `/auth/me`
   - Referenced in: 10 files (Layout, ProtectedRoute, Login, etc.)

2. **React Query Cache**
   - Used in: `frontend/src/pages/Settings.tsx`, `frontend/src/pages/Setup.tsx`
   - Query key: `['user']`
   - Fetches from: `getMe(token)` (same `/auth/me` endpoint)

## How This Happened (Root Cause)

This is **evolutionary technical debt**, not poor initial design:

1. **Phase 1:** AuthContext was built first to handle authentication + user state
2. **Phase 2:** React Query was added for data fetching (calendars, events)
3. **Phase 3:** Developers started using React Query for user data in newer features
4. **Result:** No consolidation occurred, leading to two parallel systems

## Why This Is Problematic

### 1. Race Conditions
- **Bug Discovered:** Setup page updates React Query cache but Layout checks AuthContext
- User completes address setup → React Query updates → Navigation occurs → Layout sees stale AuthContext → Redirects back to setup
- **Current Workaround:** Manual synchronization via `refreshUser()` call

### 2. Maintenance Burden
- Two sources of truth = 2x places to update
- Confusing for developers ("which one should I use?")
- Increases onboarding time for new team members

### 3. Performance
- Risk of duplicate network requests
- Potential for unnecessary re-renders
- More complex state management overhead

### 4. Inconsistency Risk
- User data can be momentarily different between contexts
- Hard-to-debug synchronization issues
- Fragile update logic (must remember to sync both)

## Recommended Solution

**Consolidate to React Query** and keep AuthContext for auth-only operations.

### Why React Query?
✅ Built-in caching, refetching, and invalidation
✅ Industry standard pattern for modern React data fetching
✅ Already used extensively for other entities (calendars, events, children)
✅ Better DevTools and debugging experience
✅ Automatic background refetching and stale-while-revalidate

### Refactor Strategy

#### Step 1: Simplify AuthContext (Auth-Only)
```typescript
// frontend/src/contexts/AuthContext.tsx
interface AuthContextType {
  token: string | null;
  isAuthenticated: boolean;
  login: () => Promise<void>;
  logout: () => void;
  setToken: (token: string) => void;
}

// Remove: user state, fetchCurrentUser, refreshUser
```

#### Step 2: Create Dedicated User Hook
```typescript
// frontend/src/hooks/useUser.ts
import { useQuery } from '@tanstack/react-query';
import { getMe } from '../lib/api-users';
import { useAuth } from '../contexts/AuthContext';

export function useUser() {
  const { token, isAuthenticated } = useAuth();

  return useQuery({
    queryKey: ['user'],
    queryFn: () => getMe(token!),
    enabled: isAuthenticated && !!token,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
```

#### Step 3: Update All Consumers (10 files)

**Files to update:**
- `frontend/src/components/Layout.tsx` - Change `useAuth().user` → `useUser().data`
- `frontend/src/components/ProtectedRoute.tsx` - Change loading logic
- `frontend/src/pages/Setup.tsx` - Remove `refreshUser()` call, rely on React Query
- `frontend/src/pages/Settings.tsx` - Already using React Query ✅
- `frontend/src/pages/Login.tsx`
- `frontend/src/pages/Children.tsx`
- `frontend/src/pages/Calendars.tsx`
- `frontend/src/contexts/SocketContext.tsx`
- `frontend/src/pages/AuthCallback.tsx`

**Example migration:**
```typescript
// Before
const { user, loading } = useAuth();
if (loading) return <Spinner />;
if (!user) return <Navigate to="/login" />;

// After
const { isAuthenticated, loading: authLoading } = useAuth();
const { data: user, isLoading: userLoading } = useUser();
if (authLoading || userLoading) return <Spinner />;
if (!isAuthenticated) return <Navigate to="/login" />;
```

#### Step 4: Update Layout Redirect Logic
```typescript
// frontend/src/components/Layout.tsx
const { data: user, isLoading } = useUser();

useEffect(() => {
  if (!isLoading && user && !user.home_address) {
    navigate('/setup');
  }
}, [user, isLoading, navigate]);
```

## Migration Checklist

- [ ] Create `frontend/src/hooks/useUser.ts`
- [ ] Simplify AuthContext to remove user state
- [ ] Update Layout.tsx
- [ ] Update ProtectedRoute.tsx
- [ ] Update Setup.tsx
- [ ] Update Login.tsx
- [ ] Update Children.tsx
- [ ] Update Calendars.tsx
- [ ] Update SocketContext.tsx
- [ ] Update AuthCallback.tsx
- [ ] Remove `refreshUser` workaround from Setup.tsx
- [ ] Test authentication flow
- [ ] Test first-time setup flow
- [ ] Test settings page
- [ ] Update any tests

## Testing Strategy

1. **Auth Flow:** Login → Verify user loads → Logout
2. **First-Time Setup:** Login with fresh account → Complete address → Verify navigation to dashboard
3. **Settings:** Update address → Verify changes persist
4. **Navigation Guards:** Access protected routes without auth → Verify redirect to login
5. **Setup Guard:** Login with account missing address → Verify redirect to /setup

## Current Status

**Temporary Fix Applied:** Setup.tsx now calls `await refreshUser()` to manually sync AuthContext after updating address. This unblocks development but doesn't address the underlying architecture issue.

**Next Steps:** Schedule 2-3 hour refactor session to consolidate to React Query.

## References

- Current bandaid fix: `frontend/src/pages/Setup.tsx` lines 27-32
- AuthContext: `frontend/src/contexts/AuthContext.tsx`
- React Query usage: `frontend/src/pages/Settings.tsx` lines 41-44

---

**Priority:** Medium - Working with bandaid, but will cause issues as codebase/team grows
**Impact:** Developer experience, maintainability, potential bugs
**Effort:** 2-3 hours focused refactoring
