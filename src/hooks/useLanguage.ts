import { useEffect, useMemo, useState } from 'react'
import { LANGUAGE_KEY } from '../lib/defaults'
import type { Language } from '../lib/types'

const LANGUAGE_CHANGE_EVENT = 'budget-language-change'

const zh: Record<string, string> = {
  'nav.home': '首頁',
  'nav.overview': '總覽',
  'nav.expenses': '支出',
  'nav.giftcards': '禮品卡',
  'nav.cards': '信用卡',
  'nav.analytics': '分析',
  'nav.settings': '設定',
  'app.subtitle': '個人支出記帳',
  'app.addExpense': '新增支出',
  'app.toggleTheme': '切換深淺色',
  'app.openNavigation': '開啟選單',
  'app.tipTitle': '小提示',
  'app.tipText': '點 + 快速新增一筆支出。',

  'settings.spreadsheet': '試算表',
  'settings.spreadsheetDescription': 'Google Sheets 資料庫連線。',
  'settings.connectedSheet': '目前連接的試算表',
  'settings.openSheets': '在 Google Sheets 開啟 ↗',
  'settings.changeSpreadsheet': '更換試算表',
  'settings.account': '帳號',
  'settings.accountDescription': '已使用 Google 登入。',
  'settings.profileUnavailable': '無法取得帳號 email',
  'settings.signOut': '登出',
  'settings.appearance': '外觀',
  'settings.appearanceDescription': '選擇配色、深淺色與語言。設定會儲存在這台裝置。',
  'settings.language': '語言',
  'settings.english': 'English',
  'settings.chinese': '中文',
  'settings.brightness': '深淺色',
  'settings.light': '淺色',
  'settings.dark': '深色',
  'settings.system': '跟隨系統',
  'settings.dataCounts': '資料數量',
  'settings.total': '總筆數',
  'settings.oldest': '最早',
  'settings.newest': '最新',

  'theme.coral.description': '原本溫暖活潑的配色',
  'theme.chamomile.description': '柔和洋甘菊、奶油與杏桃色',
  'theme.sea.description': '平靜的海玻璃與海藍色',
  'theme.milk-tea.description': '溫暖焦糖與奶茶米色',
  'theme.lavender.description': '柔和薰衣草與莓果色',
  'theme.matcha.description': '清新的抹茶綠與鼠尾草綠',

  'expense.addTitle': '新增支出',
  'expense.editTitle': '編輯支出',
  'expense.savedToSheet': '直接儲存到你的 Google Sheet',
  'expense.date': '日期',
  'expense.today': '今天',
  'expense.yesterday': '昨天',
  'expense.twoDaysAgo': '前天',
  'expense.description': '描述',
  'expense.descriptionPlaceholder': '超市、房租、咖啡...',
  'expense.addNote': '+ 新增備註',
  'expense.removeNote': '移除備註',
  'expense.notePlaceholder': '備註：信用卡回饋、分帳晚餐...',
  'expense.amount': '金額',
  'expense.costPaid': '支付成本',
  'expense.category': '分類',
  'expense.categoryPlaceholder': '選擇或輸入分類',
  'expense.paymentMethod': '付款方式',
  'expense.card': '信用卡',
  'expense.giftcard': '禮品卡',
  'expense.cash': '現金',
  'expense.splitPayments': '拆分成多種付款方式',
  'expense.tags': '標籤',
  'expense.cancel': '取消',
  'expense.saveChanges': '儲存變更',
  'expense.addExpense': '新增支出',
  'expense.saving': '儲存中...',
  'expense.updated': '支出已更新',
  'expense.added': '支出已新增',
  'expense.amountRequired': '請輸入金額。',
  'expense.paymentRequired': '請選擇付款方式。',
  'expense.descriptionRequired': '請輸入描述。',

  'card.addTitle': '新增信用卡',
  'card.editTitle': '編輯信用卡',
  'card.description': '儲存信用卡設定到 Google Sheets 的 Cards 分頁。',
  'card.name': '名稱',
  'card.issuer': '發卡銀行',
  'card.last4': '末四碼',
  'card.annualFee': '年費',
  'card.openDate': '開卡日期',
  'card.active': '啟用',
  'card.note': '備註',
  'card.notePlaceholder': '權益、提醒事項...',
  'card.subTracking': '開卡禮追蹤',
  'card.optional': '選填',
  'card.targetSpend': '消費門檻',
  'card.period': '期間（月）',
  'card.bonus': '開卡禮',
  'card.deadline': '截止日',
  'card.subHint': '填寫上方開卡日期、消費門檻與期間即可啟用開卡禮追蹤。',
  'card.nameRequired': '請輸入信用卡名稱。',
  'card.addCard': '新增信用卡',
  'card.cardAdded': '信用卡已新增',
  'card.cardUpdated': '信用卡已更新',
  'card.saveCardError': '無法儲存信用卡',
}

function readLanguage(): Language {
  return localStorage.getItem(LANGUAGE_KEY) === 'zh' ? 'zh' : 'en'
}

export function useLanguage() {
  const [language, setLanguageState] = useState<Language>(readLanguage)

  useEffect(() => {
    const sync = () => setLanguageState(readLanguage())
    window.addEventListener('storage', sync)
    window.addEventListener(LANGUAGE_CHANGE_EVENT, sync)
    return () => {
      window.removeEventListener('storage', sync)
      window.removeEventListener(LANGUAGE_CHANGE_EVENT, sync)
    }
  }, [])

  const setLanguage = (next: Language) => {
    localStorage.setItem(LANGUAGE_KEY, next)
    setLanguageState(next)
    window.dispatchEvent(new Event(LANGUAGE_CHANGE_EVENT))
  }

  const t = useMemo(() => (key: string, fallback: string) => language === 'zh' ? (zh[key] || fallback) : fallback, [language])

  return { language, setLanguage, t }
}
