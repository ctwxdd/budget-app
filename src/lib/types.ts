export type Expense = {
  rowIndex: number
  date: string
  amount: number
  description: string
  category: string
  paymentMethod: string
  reimbursement: string
}

export type SheetMeta = {
  title: string
  sheets: { title: string; sheetId: number }[]
}

export type DatePreset = 'thisMonth' | 'lastMonth' | 'thisYear' | 'all' | 'custom'
export type Theme = 'light' | 'dark' | 'system'
export type ColorTheme = 'coral' | 'chamomile' | 'sea' | 'milk-tea' | 'lavender' | 'matcha'
