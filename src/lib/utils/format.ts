/**
 * 金額を日本円形式でフォーマットする
 * @param amount 金額（円）
 * @returns フォーマットされた文字列（例: ¥1,037,038）
 */
interface FormatCurrencyOptions {
  signed?: boolean
  absolute?: boolean
}

export function formatCurrency(
  amount: number,
  options: FormatCurrencyOptions = {}
): string {
  const value = options.absolute ? Math.abs(amount) : amount
  const intAmount = Math.floor(Math.abs(value))
  const formatted = intAmount.toLocaleString('ja-JP')

  if (value < 0) {
    return `−¥${formatted}`
  }
  if (options.signed && value > 0) {
    return `+¥${formatted}`
  }
  return `¥${formatted}`
}

/**
 * 月文字列を「YYYY年M月」形式に変換する
 * @param month 月文字列（例: 202601）
 * @returns フォーマットされた文字列（例: 2026年1月）
 */
export function formatMonth(month: string): string {
  const year = month.slice(0, 4)
  const m = parseInt(month.slice(4, 6), 10)
  return `${year}年${m}月`
}

/**
 * Dateオブジェクトを月文字列に変換する
 * @param date Dateオブジェクト
 * @returns 月文字列（例: 202601）
 */
export function parseMonth(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  return `${year}${month}`
}

/**
 * 指定月の1ヶ月前を返す
 * @param month 月文字列（例: 202602）
 * @returns 1ヶ月前の月文字列（例: 202601）
 */
export function getPreviousMonth(month: string): string {
  const year = parseInt(month.slice(0, 4), 10)
  const m = parseInt(month.slice(4, 6), 10)
  const date = new Date(year, m - 2, 1)
  return parseMonth(date)
}

/**
 * 月文字列が YYYYMM 形式（月は01-12）として有効か判定する
 * @param month 判定対象の文字列
 * @returns 有効ならtrue
 */
export function isValidMonth(month: string): boolean {
  if (!/^\d{6}$/.test(month)) return false
  const m = parseInt(month.slice(4, 6), 10)
  return m >= 1 && m <= 12
}

export function monthToPath(month: string): string {
  return `/${month.slice(0, 4)}/${month.slice(4, 6)}`
}

export function pathToMonth(year: string, month: string): string {
  return `${year}${month}`
}

export function isValidYear(year: string): boolean {
  return /^\d{4}$/.test(year)
}

export function isValidMonthParam(month: string): boolean {
  if (!/^\d{2}$/.test(month)) return false
  const m = parseInt(month, 10)
  return m >= 1 && m <= 12
}
