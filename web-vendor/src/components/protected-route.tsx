import { Navigate, Outlet } from 'react-router-dom'

import { useAuth } from '../features/auth/auth-context'
import { LoadingState } from './query-state'

export function ProtectedRoute() {
  const { isAuthenticated, isRestoring } = useAuth()

  // Wait for the initial refresh-token session restore before deciding, so a
  // hard refresh doesn't redirect to /login mid-restore.
  if (isRestoring) {
    return <LoadingState />
  }
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }
  return <Outlet />
}
