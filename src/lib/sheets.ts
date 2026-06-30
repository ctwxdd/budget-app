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
    let apiMessage = ''
    try {
      const parsed = JSON.parse(body) as { error?: { message?: string; status?: string } }
      apiMessage = parsed?.error?.message || ''
    } catch {
      apiMessage = body
    }
    let message: string
    if (response.status === 429) {
      message = 'Google Sheets is temporarily rate-limiting requests. Wait a moment, then try again.'
    } else if (response.status === 403) {
      message = "You don't have access to this spreadsheet with the Google account you're signed in with. Ask the owner to share it with your account, or switch to a Google account that already has access."
    } else if (response.status === 404) {
      message = "Spreadsheet not found. Double-check the link or ID."
    } else {
      message = apiMessage || `Google Sheets request failed (${response.status})`
    }
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

export async function insertRow(sheetId: string, sheetGid: number, rowIndex: number) {
  return sheetsFetch(`${base(sheetId)}:batchUpdate`, {
    method: 'POST',
    body: JSON.stringify({
      requests: [{
        insertDimension: {
          range: { sheetId: sheetGid, dimension: 'ROWS', startIndex: rowIndex, endIndex: rowIndex + 1 },
          inheritFromBefore: rowIndex > 1,
        },
      }],
    }),
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

type ExpenseFieldUpdates = Partial<Pick<Expense, 'date' | 'amount' | 'description' | 'category' | 'paymentMethod' | 'reimbursement' | 'tags'>>
const expenseColumns: Record<keyof ExpenseFieldUpdates, string> = {
  date: 'A',
  amount: 'B',
  description: 'C',
  category: 'D',
  paymentMethod: 'E',
  reimbursement: 'F',
  tags: 'H',
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
  const response = await sheetsFetch<{ properties?: { title?: string }; sheets: { properties: { title: string; sheetId: number } }[] }>(`${base(sheetId)}?fields=properties.title,sheets.properties(title,sheetId)`)
  return { title: response.properties?.title || '', sheets: response.sheets.map((sheet) => ({ title: sheet.properties.title, sheetId: sheet.properties.sheetId })) }
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
  annualFee: number
  subRequired: number
  subStart: string
  subDeadline: string
  subBonus: string
}

export type CardSheetInput = Omit<CardSheetRow, 'rowIndex'>

export const cardsHeaders = ['Name', 'Issuer', 'Last4', 'Active', 'Note', 'Annual Fee', 'SUB Required', 'SUB Start', 'SUB Deadline', 'SUB Bonus']

function moneyCell(value: number): string {
  const amount = Number(value) || 0
  if (!amount) return ''
  return `$${amount.toLocaleString(undefined, {
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  })}`
}

// Writes touch A:J — the in-app dialog now edits the SUB fields too.
// Columns K+ (the user's progress formulas, if any) are left untouched.
export function cardToRow(card: CardSheetInput | CardSheetRow): (string | number | boolean)[] {
  return [
    card.name,
    card.issuer,
    card.last4,
    card.active,
    card.note,
    moneyCell(card.annualFee),
    card.subRequired || '',
    card.subStart || '',
    card.subDeadline || '',
    card.subBonus || '',
  ]
}

export async function createCardsTab(sheetId: string) {
  return addSheetTab(sheetId, 'Cards', cardsHeaders)
}

export async function addCard(sheetId: string, card: CardSheetInput) {
  return appendRow(sheetId, 'Cards!A:J', cardToRow(card))
}

export async function updateCard(sheetId: string, card: CardSheetRow) {
  return updateRow(sheetId, `Cards!A${card.rowIndex}:J${card.rowIndex}`, cardToRow(card))
}

export async function deleteCard(sheetId: string, sheetGid: number, rowIndex: number) {
  return deleteRow(sheetId, sheetGid, rowIndex - 1)
}

// --- New spreadsheet bootstrap ----------------------------------------------

const EXPENSE_GID = 1
const CARDS_GID = 2
const GIFTCARD_GID = 3
const CARD_BENEFITS_GID = 4

const EXPENSE_HEADERS = ['Date', 'Expense', 'Description', 'Category', 'Payment Method', 'Reimbursement', '', 'Tags']
const GIFTCARD_HEADERS_LEFT = ['Card', 'Date', 'Paid', 'Face', 'Vendor', 'Direct', 'Pool', 'Cum Before', 'FIFO', 'Balance']
const GIFTCARD_HEADERS_RIGHT = ['Merchant', 'Cards', 'Purchased', 'Spent', 'Balance', 'Active']
export const cardBenefitsHeaders = ['Card', 'Benefit', 'Amount', 'Period', 'Category', 'Merchant/Tag', 'Start Date', 'End Date', 'Active']

function headerCell(text: string) {
  return {
    userEnteredValue: { stringValue: text },
    userEnteredFormat: {
      backgroundColorStyle: { rgbColor: { red: 0.96, green: 0.58, blue: 0.52 } },
      textFormat: { bold: true, foregroundColorStyle: { rgbColor: { red: 1, green: 1, blue: 1 } } },
      horizontalAlignment: 'CENTER',
      verticalAlignment: 'MIDDLE',
      padding: { top: 4, bottom: 4, left: 8, right: 8 },
    },
  }
}

function headerRow(headers: string[]) {
  return { values: headers.map((header) => headerCell(header)) }
}

function buildSheet(sheetId: number, title: string, columnCount: number, headerData: Array<{ startColumn: number; headers: string[] }>) {
  return {
    properties: { sheetId, title, gridProperties: { rowCount: 1000, columnCount, frozenRowCount: 1 } },
    data: headerData.map(({ startColumn, headers }) => ({ startRow: 0, startColumn, rowData: [headerRow(headers)] })),
    protectedRanges: [{
      range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
      description: 'Header row — do not edit; the app relies on these column names.',
      warningOnly: true,
    }],
  }
}

function listValidation(sheetGid: number, columnIndex: number, values: string[], strict = false) {
  return {
    setDataValidation: {
      range: { sheetId: sheetGid, startRowIndex: 1, startColumnIndex: columnIndex, endColumnIndex: columnIndex + 1 },
      rule: {
        condition: { type: 'ONE_OF_LIST', values: values.filter(Boolean).map((value) => ({ userEnteredValue: value })) },
        showCustomUi: true,
        strict,
      },
    },
  }
}

function dateValidation(sheetGid: number, columnIndex: number) {
  return {
    setDataValidation: {
      range: { sheetId: sheetGid, startRowIndex: 1, startColumnIndex: columnIndex, endColumnIndex: columnIndex + 1 },
      rule: { condition: { type: 'DATE_IS_VALID' }, strict: false, showCustomUi: true },
    },
  }
}

function nonNegativeNumberValidation(sheetGid: number, columnIndex: number) {
  return {
    setDataValidation: {
      range: { sheetId: sheetGid, startRowIndex: 1, startColumnIndex: columnIndex, endColumnIndex: columnIndex + 1 },
      rule: { condition: { type: 'NUMBER_GREATER_THAN_EQ', values: [{ userEnteredValue: '0' }] }, strict: false, showCustomUi: true },
    },
  }
}

function booleanCheckbox(sheetGid: number, columnIndex: number) {
  return {
    setDataValidation: {
      range: { sheetId: sheetGid, startRowIndex: 1, startColumnIndex: columnIndex, endColumnIndex: columnIndex + 1 },
      rule: { condition: { type: 'BOOLEAN' }, strict: true, showCustomUi: true },
    },
  }
}

function dateFormat(sheetGid: number, columnIndex: number) {
  return {
    repeatCell: {
      range: { sheetId: sheetGid, startRowIndex: 1, startColumnIndex: columnIndex, endColumnIndex: columnIndex + 1 },
      cell: { userEnteredFormat: { numberFormat: { type: 'DATE', pattern: 'yyyy-mm-dd' } } },
      fields: 'userEnteredFormat.numberFormat',
    },
  }
}

function currencyFormat(sheetGid: number, columnIndex: number) {
  return {
    repeatCell: {
      range: { sheetId: sheetGid, startRowIndex: 1, startColumnIndex: columnIndex, endColumnIndex: columnIndex + 1 },
      cell: { userEnteredFormat: { numberFormat: { type: 'CURRENCY', pattern: '"$"#,##0.00' } } },
      fields: 'userEnteredFormat.numberFormat',
    },
  }
}

export async function createSpreadsheet({ title, categories, paymentMethods, reimbursements }: { title: string; categories: string[]; paymentMethods: string[]; reimbursements: string[] }) {
  const created = await sheetsFetch<{ spreadsheetId: string; properties: { title: string }; spreadsheetUrl: string }>(`https://sheets.googleapis.com/v4/spreadsheets`, {
    method: 'POST',
    body: JSON.stringify({
      properties: { title, locale: 'en_US' },
      sheets: [
        buildSheet(EXPENSE_GID, 'Expense', EXPENSE_HEADERS.length, [{ startColumn: 0, headers: EXPENSE_HEADERS }]),
        buildSheet(CARDS_GID, 'Cards', cardsHeaders.length, [{ startColumn: 0, headers: cardsHeaders }]),
        buildSheet(GIFTCARD_GID, 'Giftcard', 17, [
          { startColumn: 0, headers: GIFTCARD_HEADERS_LEFT },
          { startColumn: 11, headers: GIFTCARD_HEADERS_RIGHT },
        ]),
        buildSheet(CARD_BENEFITS_GID, 'CardBenefits', cardBenefitsHeaders.length, [{ startColumn: 0, headers: cardBenefitsHeaders }]),
      ],
    }),
  })

  await sheetsFetch(`${base(created.spreadsheetId)}:batchUpdate`, {
    method: 'POST',
    body: JSON.stringify({
      requests: [
        // Expense formatting + validation
        dateFormat(EXPENSE_GID, 0),
        currencyFormat(EXPENSE_GID, 1),
        dateValidation(EXPENSE_GID, 0),
        listValidation(EXPENSE_GID, 3, categories),
        listValidation(EXPENSE_GID, 4, paymentMethods),
        listValidation(EXPENSE_GID, 5, reimbursements),
        // Cards: Active as checkbox, Annual Fee + SUB Required as currency,
        // SUB Start/Deadline as dates.
        booleanCheckbox(CARDS_GID, 3),
        currencyFormat(CARDS_GID, 5),
        nonNegativeNumberValidation(CARDS_GID, 5),
        currencyFormat(CARDS_GID, 6),
        nonNegativeNumberValidation(CARDS_GID, 6),
        dateFormat(CARDS_GID, 7),
        dateValidation(CARDS_GID, 7),
        dateFormat(CARDS_GID, 8),
        dateValidation(CARDS_GID, 8),
        // Giftcard: date + currency formats, non-negative validation
        dateFormat(GIFTCARD_GID, 1),
        currencyFormat(GIFTCARD_GID, 2),
        currencyFormat(GIFTCARD_GID, 3),
        currencyFormat(GIFTCARD_GID, 5),
        currencyFormat(GIFTCARD_GID, 6),
        currencyFormat(GIFTCARD_GID, 7),
        currencyFormat(GIFTCARD_GID, 8),
        currencyFormat(GIFTCARD_GID, 9),
        currencyFormat(GIFTCARD_GID, 13),
        currencyFormat(GIFTCARD_GID, 14),
        currencyFormat(GIFTCARD_GID, 15),
        dateValidation(GIFTCARD_GID, 1),
        nonNegativeNumberValidation(GIFTCARD_GID, 2),
        nonNegativeNumberValidation(GIFTCARD_GID, 3),
        booleanCheckbox(GIFTCARD_GID, 16),
        // Card benefits
        currencyFormat(CARD_BENEFITS_GID, 2),
        nonNegativeNumberValidation(CARD_BENEFITS_GID, 2),
        listValidation(CARD_BENEFITS_GID, 3, ['monthly', 'quarterly', 'semiannual', 'annual']),
        dateFormat(CARD_BENEFITS_GID, 6),
        dateValidation(CARD_BENEFITS_GID, 6),
        dateFormat(CARD_BENEFITS_GID, 7),
        dateValidation(CARD_BENEFITS_GID, 7),
        booleanCheckbox(CARD_BENEFITS_GID, 8),
      ],
    }),
  })

  return { spreadsheetId: created.spreadsheetId, title: created.properties.title, url: created.spreadsheetUrl }
}
