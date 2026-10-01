import { Navigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'

export default function ProtectedRoute({ children, roles }) {
  const { isAuthenticated, user } = useAuth()

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  if (roles && !roles.includes(user?.Role)) {
    // Redirect based on role
    if (user?.Role === 'customer') return <Navigate to="/my-account" replace />
    if (user?.Role === 'delivery_staff') return <Navigate to="/my-deliveries" replace />
    return <Navigate to="/" replace />
  }

  return children
}
