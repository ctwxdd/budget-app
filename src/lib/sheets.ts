import type { Expense, SheetMeta } from './types'

type SheetsAuth = { getToken: () => Promise<string>; onUnauthorized?: () => void }
let auth: SheetsAuth = { getToken: async () => localStorage.getItem('budget.token') || '' }

export class SheetsHttpError extends Error {
  status: number
  retryAfterMs?: number

  constructor(status: number, message: string, retryAfterMs?: number) {
    super(message)
    this.name = 'SheetsHttpError'
    this.status = status
    this.retryAfterMs = retryAfterMs
  }
}

export function isRateLimitError(error: unknown) {
  return error instanceof SheetsHttpError && error.status === 429
}

export function setSheetsAuth(next: SheetsAuth) {
  auth = next
}

async function sheetsFetch<T>(url: string, init: RequestInit = {}): Promise<T> {
  const token = await auth.getToken()
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  })
  if (response.status === 401) {
    auth.onUnauthorized?.()
    throw new Error('Google authorization expired. Please sign in again.')
  }
  if (!response.ok) {
    const body = await response.text()
    const retryAfter = Number(response.headers.get('retry-after'))
    const retryAfterMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : undefined
    const message = response.status === 429
      ? 'Google Sheets is temporarily rate-limiting requests. Wait a moment, then try again.'
      : body || `Google Sheets request failed (${response.status})`
    throw new SheetsHttpError(response.status, message, retryAfterMs)
  }
  return response.json() as Promise<T>
}

const base = (sheetId: string) => `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}`

export async function getSheet(sheetId: string, range: string): Promise<{ values: string[][] }> {
  return sheetsFetch(`${base(sheetId)}/values/${encodeURIComponent(range)}`)
}

export async function getSheets(sheetId: string, ranges: string[]): Promise<Array<{ values?: string[][] }>> {
  const params = new URLSearchParams()
  ranges.forEach((range) => params.append('ranges', range))
  const response = await sheetsFetch<{ valueRanges?: Array<{ values?: string[][] }> }>(`${base(sheetId)}/values:batchGet?${params}`)
  return response.valueRanges || []
}

export async function appendRow(sheetId: string, range: string, row: unknown[]) {
  return sheetsFetch<{ tableRange?: string; updates?: { updatedRange?: string } }>(`${base(sheetId)}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, {
    method: 'POST',
    body: JSON.stringify({ values: [row] }),
  })
}

export async function updateRow(sheetId: string, range: string, row: unknown[]) {
  return sheetsFetch(`${base(sheetId)}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`, {
    method: 'PUT',
    body: JSON.stringify({ values: [row] }),
  })
}

export async function addSheetTab(sheetId: string, title: string, headers: string[] = []) {
  const newSheetId = 1 + Math.floor(Date.now() % 1_000_000_000)
  return sheetsFetch(`${base(sheetId)}:batchUpdate`, {
    method: 'POST',
    body: JSON.stringify({
      requests: [
        { addSheet: { properties: { title, sheetId: newSheetId } } },
        ...(headers.length
          ? [{
            updateCells: {
              start: { sheetId: newSheetId, rowIndex: 0, columnIndex: 0 },
              rows: [{ values: headers.map((header) => ({ userEnteredValue: { stringValue: header }, userEnteredFormat: { textFormat: { bold: true } } })) }],
              fields: 'userEnteredValue,userEnteredFormat.textFormat.bold',
            },
          }]
          : []),
      ],
      includeSpreadsheetInResponse: false,
    }),
  })
}

type ExpenseFieldUpdates = Partial<Pick<Expense, 'date' | 'amount' | 'description' | 'category' | 'paymentMethod' | 'reimbursement'>>
const expenseColumns: Record<keyof ExpenseFieldUpdates, string> = {
  date: 'A',
  amount: 'B',
  description: 'C',
  category: 'D',
  paymentMethod: 'E',
  reimbursement: 'F',
}

export async function batchUpdateExpenseFields(
  sheetId: string,
  sheetName: string,
  updates: Array<{ rowIndex: number; updates: ExpenseFieldUpdates }>,
): Promise<void> {
  const data = updates.flatMap((item) =>
    (Object.entries(item.updates) as Array<[keyof ExpenseFieldUpdates, string | number | undefined]>)
      .filter(([, value]) => value !== undefined)
      .map(([field, value]) => ({
        range: `${sheetName}!${expenseColumns[field]}${item.rowIndex}`,
        values: [[value]],
      })),
  )
  if (!data.length) return
  await sheetsFetch(`${base(sheetId)}/values:batchUpdate`, {
    method: 'POST',
    body: JSON.stringify({ valueInputOption: 'USER_ENTERED', data }),
  })
}

export async function clearRange(sheetId: string, range: string) {
  return sheetsFetch(`${base(sheetId)}/values/${encodeURIComponent(range)}:clear`, { method: 'POST', body: JSON.stringify({}) })
}

export async function getSheetMeta(sheetId: string): Promise<SheetMeta> {
  const response = await sheetsFetch<{ sheets: { properties: { title: string; sheetId: number } }[] }>(`${base(sheetId)}?fields=sheets.properties(title,sheetId)`)
  return { sheets: response.sheets.map((sheet) => ({ title: sheet.properties.title, sheetId: sheet.properties.sheetId })) }
}

export async function deleteRow(sheetId: string, sheetGid: number, rowIndex: number) {
  return sheetsFetch(`${base(sheetId)}:batchUpdate`, {
    method: 'POST',
    body: JSON.stringify({
      requests: [{ deleteDimension: { range: { sheetId: sheetGid, dimension: 'ROWS', startIndex: rowIndex, endIndex: rowIndex + 1 } } }],
    }),
  })
}

export async function deleteRows(sheetId: string, sheetGid: number, rowIndexes: number[]) {
  const uniqueRows = Array.from(new Set(rowIndexes)).sort((a, b) => b - a)
  if (!uniqueRows.length) return
  return sheetsFetch(`${base(sheetId)}:batchUpdate`, {
    method: 'POST',
    body: JSON.stringify({
      requests: uniqueRows.map((rowIndex) => ({
        deleteDimension: { range: { sheetId: sheetGid, dimension: 'ROWS', startIndex: rowIndex - 1, endIndex: rowIndex } },
      })),
    }),
  })
}

export type CardSheetRow = {
  rowIndex: number
  name: string
  issuer: string
  last4: string
  active: boolean
  note: string
}

export type CardSheetInput = Omit<CardSheetRow, 'rowIndex'>

export const cardsHeaders = ['Name', 'Issuer', 'Last4', 'Active', 'Note']

export function cardToRow(card: CardSheetInput | CardSheetRow): (string | boolean)[] {
  return [card.name, card.issuer, card.last4, card.active, card.note]
}

export async function createCardsTab(sheetId: string) {
  return addSheetTab(sheetId, 'Cards', cardsHeaders)
}

export async function addCard(sheetId: string, card: CardSheetInput) {
  return appendRow(sheetId, 'Cards!A:E', cardToRow(card))
}

export async function updateCard(sheetId: string, card: CardSheetRow) {
  return updateRow(sheetId, `Cards!A${card.rowIndex}:E${card.rowIndex}`, cardToRow(card))
}

export async function deleteCard(sheetId: string, sheetGid: number, rowIndex: number) {
  return deleteRow(sheetId, sheetGid, rowIndex - 1)
}
