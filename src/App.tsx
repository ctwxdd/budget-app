import React from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/auth'
import { SHEET_ID_KEY } from './lib/defaults'
import { ToastProvider } from './components/ui/Toast'
import { AppLayout } from './components/layout/AppLayout'
import { SkeletonCards } from './components/layout/Skeletons'
import { LoginPage } from './pages/LoginPage'

const SetupPage = React.lazy(() => import('./pages/SetupPage').then((module) => ({ default: module.SetupPage })))
const OverviewPage = React.lazy(() => import('./pages/OverviewPage').then((module) => ({ default: module.OverviewPage })))
const ExpensesPage = React.lazy(() => import('./pages/ExpensesPage').then((module) => ({ default: module.ExpensesPage })))
const AnalyticsPage = React.lazy(() => import('./pages/AnalyticsPage').then((module) => ({ default: module.AnalyticsPage })))
const GiftcardsPage = React.lazy(() => import('./pages/Giftcards').then((module) => ({ default: module.GiftcardsPage })))
const CardsPage = React.lazy(() => import('./pages/Cards').then((module) => ({ default: module.CardsPage })))
const SettingsPage = React.lazy(() => import('./pages/SettingsPage').then((module) => ({ default: module.SettingsPage })))

function ProtectedRoute({ children }: { children: React.ReactElement }) {
  const { isAuthenticated, isAuthenticating } = useAuth()
  const location = useLocation()
  const sheetId = localStorage.getItem(SHEET_ID_KEY)
  if (!isAuthenticated && isAuthenticating) return <PageFallback />
  if (!isAuthenticated) return <Navigate to="/login" state={{ from: location }} replace />
  if (!sheetId && location.pathname !== '/setup') return <Navigate to="/setup" replace />
  return children
}

function MissingConfigScreen() {
  return <div className="grid min-h-screen place-items-center p-6"><div className="max-w-lg rounded-xl border bg-card p-6 text-center shadow-soft"><h1 className="text-2xl font-bold">Setup required</h1><p className="mt-3 text-muted-foreground">VITE_GOOGLE_CLIENT_ID is missing. Follow README, create .env.local, then restart Vite.</p></div></div>
}

function PageFallback() {
  return <div className="px-4 py-6 md:px-6"><SkeletonCards /></div>
}

export default function App() {
  const missingClientId = !import.meta.env.VITE_GOOGLE_CLIENT_ID
  if (missingClientId) return <MissingConfigScreen />
  return <ToastProvider><AuthProvider><React.Suspense fallback={<PageFallback />}><Routes><Route path="/login" element={<LoginPage />} /><Route path="/setup" element={<ProtectedRoute><SetupPage /></ProtectedRoute>} /><Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}><Route index element={<OverviewPage />} /><Route path="expenses" element={<ExpensesPage />} /><Route path="giftcards" element={<GiftcardsPage />} /><Route path="cards" element={<CardsPage />} /><Route path="analytics" element={<AnalyticsPage />} /><Route path="settings" element={<SettingsPage />} /></Route><Route path="*" element={<Navigate to="/" replace />} /></Routes></React.Suspense></AuthProvider></ToastProvider>
}
