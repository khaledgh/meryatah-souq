import { Navigate, Outlet } from 'react-router-dom'

import { useAuth } from '../features/auth/auth-context'
import { LoadingState } from './query-state'

export function ProtectedRoute() {
  const { isAuthenticated, isRestoring } = useAuth()

  // Wait for the initial refresh-token session restore before deciding —
  // otherwise a hard refresh redirects to /login while the session is still
  // being re-established.
  if (isRestoring) {
    return <LoadingState />
  }
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }
  return <Outlet />
}
