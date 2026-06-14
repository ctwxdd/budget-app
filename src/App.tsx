import React from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/auth'
import { SHEET_ID_KEY } from './lib/defaults'
import { ToastProvider } from './components/ui/Toast'
import { AppLayout } from './components/layout/AppLayout'
import { LoginPage } from './pages/LoginPage'
import { SetupPage } from './pages/SetupPage'
import { OverviewPage } from './pages/OverviewPage'
import { ExpensesPage } from './pages/ExpensesPage'
import { AnalyticsPage } from './pages/AnalyticsPage'
import { GiftcardsPage } from './pages/Giftcards'
import { CardsPage } from './pages/Cards'
import { SettingsPage } from './pages/SettingsPage'

function ProtectedRoute({ children }: { children: React.ReactElement }) {
  const { isAuthenticated } = useAuth()
  const location = useLocation()
  const sheetId = localStorage.getItem(SHEET_ID_KEY)
  if (!isAuthenticated) return <Navigate to="/login" state={{ from: location }} replace />
  if (!sheetId && location.pathname !== '/setup') return <Navigate to="/setup" replace />
  return children
}

function MissingConfigScreen() {
  return <div className="grid min-h-screen place-items-center p-6"><div className="max-w-lg rounded-xl border bg-card p-6 text-center shadow-soft"><h1 className="text-2xl font-bold">Setup required</h1><p className="mt-3 text-muted-foreground">VITE_GOOGLE_CLIENT_ID is missing. Follow README, create .env.local, then restart Vite.</p></div></div>
}

export default function App() {
  const missingClientId = !import.meta.env.VITE_GOOGLE_CLIENT_ID
  if (missingClientId) return <MissingConfigScreen />
  return <ToastProvider><AuthProvider><Routes><Route path="/login" element={<LoginPage />} /><Route path="/setup" element={<ProtectedRoute><SetupPage /></ProtectedRoute>} /><Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}><Route index element={<OverviewPage />} /><Route path="expenses" element={<ExpensesPage />} /><Route path="giftcards" element={<GiftcardsPage />} /><Route path="cards" element={<CardsPage />} /><Route path="analytics" element={<AnalyticsPage />} /><Route path="settings" element={<SettingsPage />} /></Route><Route path="*" element={<Navigate to="/" replace />} /></Routes></AuthProvider></ToastProvider>
}
