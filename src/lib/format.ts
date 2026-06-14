import { addMonths, endOfMonth, endOfYear, format, isValid, isWithinInterval, parseISO, startOfMonth, startOfYear, subMonths } from 'date-fns'
import type * as React from 'react'
import * as Icons from 'lucide-react'
import type { DatePreset, Expense } from './types'

export const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
export const chartPalette = ['#FF8E72', '#FFB199', '#34D399', '#7DD3FC', '#C4B5FD', '#FCD34D', '#F472B6', '#9BC7A8']

export function categoryName(value: string) {
  return (value || '').trim() || 'Uncategorized'
}

const categorySwatches = [
  { bg: '#FFF1ED', text: '#C2410C', border: '#FFD8CC', hex: '#FF8E72' },
  { bg: '#FFF7ED', text: '#C05621', border: '#FED7AA', hex: '#FFB199' },
  { bg: '#ECFDF5', text: '#047857', border: '#A7F3D0', hex: '#34D399' },
  { bg: '#F0F9FF', text: '#0369A1', border: '#BAE6FD', hex: '#7DD3FC' },
  { bg: '#F5F3FF', text: '#6D28D9', border: '#DDD6FE', hex: '#C4B5FD' },
  { bg: '#FFFBEB', text: '#B45309', border: '#FDE68A', hex: '#FCD34D' },
  { bg: '#FDF2F8', text: '#BE185D', border: '#FBCFE8', hex: '#F472B6' },
  { bg: '#F0FDF4', text: '#3F6212', border: '#BBF7D0', hex: '#9BC7A8' },
]

export function categoryColor(name: string) {
  const key = name || 'Uncategorized'
  let hash = 0
  for (let index = 0; index < key.length; index += 1) hash = (hash * 31 + key.charCodeAt(index)) >>> 0
  return categorySwatches[hash % categorySwatches.length]
}

type IconComponent = React.ComponentType<{ className?: string; strokeWidth?: number | string }>

const categoryIconMap: Record<string, IconComponent> = {
  food: Icons.Utensils,
  '外食': Icons.UtensilsCrossed,
  diningout: Icons.UtensilsCrossed,
  restaurant: Icons.UtensilsCrossed,
  coffee: Icons.Coffee,
  groceries: Icons.ShoppingBasket,
  transportation: Icons.Bus,
  transit: Icons.Bus,
  '日用': Icons.ShoppingBasket,
  shopping: Icons.ShoppingBag,
  entertainment: Icons.Clapperboard,
  car: Icons.Car,
  baby: Icons.Baby,
  house: Icons.Home,
  home: Icons.Home,
  gardening: Icons.Sprout,
  '電信': Icons.Smartphone,
  telecom: Icons.Smartphone,
  phone: Icons.Smartphone,
  '保險': Icons.ShieldCheck,
  insurance: Icons.ShieldCheck,
  '規費': Icons.FileText,
  fee: Icons.FileText,
  medical: Icons.Stethoscope,
  health: Icons.HeartPulse,
  travel: Icons.Plane,
  rent: Icons.Building2,
  furniture: Icons.Sofa,
  utility: Icons.Zap,
  utilities: Icons.Zap,
  electricity: Icons.Zap,
  water: Icons.Droplets,
  internet: Icons.Wifi,
  'card annual fee': Icons.CreditCard,
  card: Icons.CreditCard,
  other: Icons.CircleDashed,
  gift: Icons.Gift,
  tax: Icons.Landmark,
  giftcard: Icons.TicketPercent,
  'free shopping': Icons.Sparkles,
  '代購': Icons.Package,
  savings: Icons.PiggyBank,
  work: Icons.Briefcase,
  income: Icons.Wallet,
  subscription: Icons.RefreshCw,
  fitness: Icons.Dumbbell,
  beauty: Icons.Sparkles,
  pet: Icons.PawPrint,
  education: Icons.GraduationCap,
  book: Icons.BookOpen,
  music: Icons.Music,
  uncategorized: Icons.HelpCircle,
}

export function categoryIcon(name: string): IconComponent | null {
  const key = (name || '').trim().toLocaleLowerCase()
  if (!key) return Icons.HelpCircle
  if (categoryIconMap[key]) return categoryIconMap[key]
  for (const [token, icon] of Object.entries(categoryIconMap)) {
    if (key.includes(token) || token.includes(key)) return icon
  }
  return null
}

function safeParseISO(date: string) {
  if (!date) return null
  const parsed = parseISO(date)
  return isValid(parsed) ? parsed : null
}

export function displayDate(date: string) {
  const parsed = safeParseISO(date)
  return parsed ? format(parsed, 'MMM d, yyyy') : 'Unknown date'
}

export function monthKey(date: string) {
  const parsed = safeParseISO(date)
  return parsed ? format(parsed, 'yyyy-MM') : ''
}

export function sumExpenses(expenses: Expense[]) {
  return expenses.reduce((sum, expense) => sum + expense.amount, 0)
}

export function getPresetRange(preset: DatePreset, customStart = '', customEnd = '') {
  const now = new Date()
  if (preset === 'thisMonth') return { start: format(startOfMonth(now), 'yyyy-MM-dd'), end: format(endOfMonth(now), 'yyyy-MM-dd') }
  if (preset === 'lastMonth') {
    const last = subMonths(now, 1)
    return { start: format(startOfMonth(last), 'yyyy-MM-dd'), end: format(endOfMonth(last), 'yyyy-MM-dd') }
  }
  if (preset === 'thisYear') return { start: format(startOfYear(now), 'yyyy-MM-dd'), end: format(endOfYear(now), 'yyyy-MM-dd') }
  if (preset === 'custom') return { start: customStart, end: customEnd }
  return { start: '', end: '' }
}

export function filterByDateRange(expenses: Expense[], start = '', end = '') {
  if (!start && !end) return expenses
  const min = safeParseISO(start) ?? new Date(-8640000000000000)
  const max = safeParseISO(end) ?? new Date(8640000000000000)
  return expenses.filter((expense) => {
    const parsed = safeParseISO(expense.date)
    return parsed ? isWithinInterval(parsed, { start: min, end: max }) : false
  })
}

export function groupTotals(expenses: Expense[], field: keyof Pick<Expense, 'category' | 'paymentMethod'>) {
  const totals = new Map<string, number>()
  expenses.forEach((expense) => {
    const rawValue = expense[field]
    const name = field === 'category' ? categoryName(rawValue) : rawValue.trim() || 'Uncategorized'
    totals.set(name, (totals.get(name) || 0) + expense.amount)
  })
  return Array.from(totals, ([name, total]) => ({ name, total })).sort((a, b) => b.total - a.total)
}

export function monthlyTotals(expenses: Expense[]) {
  const totals = new Map<string, number>()
  expenses.forEach((expense) => {
    const key = monthKey(expense.date)
    if (key) totals.set(key, (totals.get(key) || 0) + expense.amount)
  })
  return Array.from(totals, ([month, total]) => ({ month, total })).sort((a, b) => a.month.localeCompare(b.month))
}

export function monthsForYear(year: number, expenses: Expense[]) {
  const safeYear = Number.isFinite(year) && year > 0 ? year : new Date().getFullYear()
  return Array.from({ length: 12 }, (_, index) => {
    const date = addMonths(new Date(safeYear, 0, 1), index)
    const key = format(date, 'yyyy-MM')
    return { month: format(date, 'MMM'), value: sumExpenses(expenses.filter((expense) => monthKey(expense.date) === key)) }
  })
}
