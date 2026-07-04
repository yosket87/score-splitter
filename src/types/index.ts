// Server Actionsの共通戻り値型
export interface ActionResult<T = unknown> {
  success: boolean
  data?: T
  error?: string
}

// 担当者
export type Person = 'husband' | 'wife'

// 入力項目種別
export type EntryType = 'income' | 'expense' | 'carryover'

// セッション
export interface Session {
  person: Person | null
  authMethod: 'password' | 'passkey'
}

// 収入
export interface Income {
  id: string
  month: string // YYYYMM形式
  label: string
  amount: number // 正の値
  person: Person
  createdAt?: string
}

// 支出
export interface Expense {
  id: string
  month: string // YYYYMM形式
  label: string
  amount: number // 負の値
  person: Person
  isCarryover: boolean // trueの場合、繰越扱いの支出（実績から除外）
  createdAt?: string
}

// 繰越（記録用、計算には含めない。清算済みの場合は精算に含む）
export interface Carryover {
  id: string
  month: string // YYYYMM形式
  label: string
  amount: number // 負の値
  person: Person
  isCleared: boolean // trueの場合、今月の黒字で清算（精算に含む）
  createdAt?: string
}

// 集計入力用の最小行（month + amount のみ保持）
// Income も Expense も month: string と amount: number を含むため共通互換
export type MonthlyAmountRow = Pick<Income, 'month' | 'amount'>

// 月別サマリー（月一覧カード表示用）
export interface MonthlySummary {
  month: string // YYYYMM形式
  incomeTotal: number // 収入合計（正値）
  expenseTotal: number // 支出合計（負値のまま）
  balance: number // incomeTotal + expenseTotal
}

// 計算結果
export interface CalculationResult {
  totalIncome: number // 収入合計
  totalExpense: number // 支出合計（負の値）
  husbandIncome: number // 夫の収入
  wifeIncome: number // 妻の収入
  husbandExpense: number // 夫の支出（負の値）
  wifeExpense: number // 妻の支出（負の値）
  husbandTotal: number // 夫の収支合計
  wifeTotal: number // 妻の収支合計
  allowance: number // お小遣い（1人あたり）
  settlement: number // 精算額（正: 夫→妻、負: 妻→夫）
}

// 月コピーの重複処理モード
export type CopyMode = 'add' | 'skip' | 'replace'

// 項目コピーモード
export type ItemCopyMode = 'withAmount' | 'labelOnly'

// コピー対象項目（収入・支出用）
export interface CopyItem {
  id: string
  label: string
  amount: number
  person: Person
  type: 'income' | 'expense'
}

// 選択されたコピー項目（コピーモード付き）
export interface SelectedCopyItem extends CopyItem {
  itemCopyMode: ItemCopyMode // 金額込み or 項目名のみ
}

// 月コピーのオプション
export interface CopyMonthOptions {
  sourceMonth: string // コピー元月
  targetMonth: string // コピー先月
  mode: CopyMode // 重複時の処理モード
  selectedItems: SelectedCopyItem[] // コピー対象の収入・支出項目
  includeCarryover: boolean // 繰越を一括コピーするか
}

// 月コピーの結果
export interface CopyMonthResult {
  success: boolean
  copied: {
    incomes: number
    expenses: number
    carryovers: number
  }
  skipped: {
    incomes: number
    expenses: number
    carryovers: number
  }
  error?: string
}

// 月コピーのプレビュー
export interface CopyMonthPreview {
  sourceMonth: string
  targetMonth: string
  items: CopyItem[] // 収入・支出の項目リスト
  carryoverCount: number // 繰越の件数
  existingCount: number // コピー先の既存データ件数
}
