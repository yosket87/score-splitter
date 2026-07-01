'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type {
  CopyMonthOptions,
  CopyMonthResult,
  CopyMonthPreview,
  CopyItem,
  ActionResult,
} from '@/types'

type CarryoverInsertItem = {
  month: string
  label: string
  amount: number
  person: string
}

function getCarryoverCopyKey(item: Omit<CarryoverInsertItem, 'month'>): string {
  return `${item.label}|${item.amount}|${item.person}`
}

/**
 * コピー操作のプレビューを取得
 * 収入・支出の項目リストと繰越件数を返す
 */
export async function getCopyMonthPreview(
  sourceMonth: string,
  targetMonth: string
): Promise<ActionResult<CopyMonthPreview>> {
  const supabase = await createClient()

  const [incomes, expenses, carryovers, existingCounts] = await Promise.all([
    supabase
      .from('incomes')
      .select('id, label, amount, person')
      .eq('month', sourceMonth)
      .order('amount', { ascending: false })
      .order('id', { ascending: true }),
    supabase
      .from('expenses')
      .select('id, label, amount, person, is_carryover')
      .eq('month', sourceMonth)
      .order('amount', { ascending: true })
      .order('id', { ascending: true }),
    supabase
      .from('carryovers')
      .select('*', { count: 'exact', head: true })
      .eq('month', sourceMonth),
    Promise.all([
      supabase
        .from('incomes')
        .select('*', { count: 'exact', head: true })
        .eq('month', targetMonth),
      supabase
        .from('expenses')
        .select('*', { count: 'exact', head: true })
        .eq('month', targetMonth),
      supabase
        .from('carryovers')
        .select('*', { count: 'exact', head: true })
        .eq('month', targetMonth),
    ]),
  ])

  if (incomes.error || expenses.error || carryovers.error) {
    console.error('月コピープレビュー取得エラー:', {
      incomes: incomes.error,
      expenses: expenses.error,
      carryovers: carryovers.error,
    })
    return { success: false, error: 'プレビューデータの取得に失敗しました' }
  }

  // 繰越フラグ付き支出はリストから除外し、繰越の一括コピーに含める
  const expenseData = expenses.data ?? []
  const regularExpenses = expenseData.filter((item) => !item.is_carryover)
  const carryoverExpenseCount = expenseData.filter((item) => item.is_carryover).length

  const items: CopyItem[] = [
    ...(incomes.data ?? []).map((item) => ({
      id: item.id,
      label: item.label,
      amount: item.amount,
      person: item.person,
      type: 'income' as const,
    })),
    ...regularExpenses.map((item) => ({
      id: item.id,
      label: item.label,
      amount: item.amount,
      person: item.person,
      type: 'expense' as const,
    })),
  ]

  const existingCount =
    (existingCounts[0].count ?? 0) +
    (existingCounts[1].count ?? 0) +
    (existingCounts[2].count ?? 0)

  return {
    success: true,
    data: {
      sourceMonth,
      targetMonth,
      items,
      carryoverCount: (carryovers.count ?? 0) + carryoverExpenseCount,
      existingCount,
    },
  }
}

/**
 * 繰越を一括コピー
 */
async function copyCarryovers(
  supabase: Awaited<ReturnType<typeof createClient>>,
  sourceMonth: string,
  targetMonth: string,
  mode: 'add' | 'skip' | 'replace'
): Promise<{ copied: number; skipped: number }> {
  // 繰越テーブルのレコードと、繰越フラグ付き支出の両方を取得
  const [carryoverResult, carryoverExpenseResult] = await Promise.all([
    supabase
      .from('carryovers')
      .select('label, amount, person, is_cleared')
      .eq('month', sourceMonth),
    supabase
      .from('expenses')
      .select('label, amount, person')
      .eq('month', sourceMonth)
      .eq('is_carryover', true),
  ])

  if (carryoverResult.error || carryoverExpenseResult.error) {
    throw new Error('繰越の取得に失敗しました')
  }

  let copied = 0
  let skipped = 0

  let existingKeys = new Set<string>()
  if (mode === 'skip') {
    const { data: existingData } = await supabase
      .from('carryovers')
      .select('label, amount, person')
      .eq('month', targetMonth)

    existingKeys = new Set(
      (existingData ?? []).map((d) => getCarryoverCopyKey(d))
    )
  }

  const itemsToInsert: CarryoverInsertItem[] = []
  const insertingKeys = new Set<string>()

  const appendCarryover = (item: Omit<CarryoverInsertItem, 'month'>): void => {
    const key = getCarryoverCopyKey(item)

    if (existingKeys.has(key) || insertingKeys.has(key)) {
      skipped++
      return
    }

    insertingKeys.add(key)
    itemsToInsert.push({
      month: targetMonth,
      label: item.label,
      amount: item.amount,
      person: item.person,
    })
    copied++
  }

  // 繰越テーブルのレコードを処理（清算済みはスキップ）
  for (const item of carryoverResult.data ?? []) {
    if (item.is_cleared) {
      skipped++
      continue
    }

    appendCarryover(item)
  }

  // 繰越フラグ付き支出も繰越としてコピー
  for (const item of carryoverExpenseResult.data ?? []) {
    appendCarryover(item)
  }

  if (itemsToInsert.length > 0) {
    const { error: upsertError } = await supabase
      .from('carryovers')
      .upsert(itemsToInsert, {
        onConflict: 'month,label,amount,person',
        ignoreDuplicates: true,
      })

    if (upsertError) {
      throw new Error(`繰越の挿入に失敗: ${upsertError.message}`)
    }
  }

  return { copied, skipped }
}

/**
 * 月データをコピー
 */
export async function copyMonthData(
  options: CopyMonthOptions
): Promise<CopyMonthResult> {
  const supabase = await createClient()
  const targetMonth = options.targetMonth

  const result: CopyMonthResult = {
    success: true,
    copied: { incomes: 0, expenses: 0, carryovers: 0 },
    skipped: { incomes: 0, expenses: 0, carryovers: 0 },
  }

  try {
    // 置換モードの場合、先に既存データを削除
    if (options.mode === 'replace') {
      const hasIncome = options.selectedItems.some((i) => i.type === 'income')
      const hasExpense = options.selectedItems.some((i) => i.type === 'expense')

      if (hasIncome) {
        await supabase
          .from('incomes')
          .delete()
          .eq('month', targetMonth)
      }
      if (hasExpense) {
        await supabase
          .from('expenses')
          .delete()
          .eq('month', targetMonth)
      }
      if (options.includeCarryover) {
        await supabase
          .from('carryovers')
          .delete()
          .eq('month', targetMonth)
      }
    }

    // スキップモードの場合、既存データのキーを取得
    let existingKeys: Record<string, Set<string>> = {
      income: new Set(),
      expense: new Set(),
    }

    if (options.mode === 'skip' && options.selectedItems.length > 0) {
      const [existingIncomes, existingExpenses] = await Promise.all([
        supabase
          .from('incomes')
          .select('label, person')
          .eq('month', targetMonth),
        supabase
          .from('expenses')
          .select('label, person')
          .eq('month', targetMonth),
      ])

      existingKeys = {
        income: new Set(
          (existingIncomes.data ?? []).map((d) => `${d.label}|${d.person}`)
        ),
        expense: new Set(
          (existingExpenses.data ?? []).map((d) => `${d.label}|${d.person}`)
        ),
      }
    }

    // 収入・支出の項目をコピー
    const incomeItems: Array<{
      month: string
      label: string
      amount: number
      person: string
    }> = []
    const expenseItems: Array<{
      month: string
      label: string
      amount: number
      person: string
    }> = []

    for (const item of options.selectedItems) {
      const key = `${item.label}|${item.person}`

      if (options.mode === 'skip' && existingKeys[item.type].has(key)) {
        if (item.type === 'income') result.skipped.incomes++
        else result.skipped.expenses++
        continue
      }

      // itemCopyModeに応じて金額を決定
      // labelOnlyの場合、DB制約(収入は正、支出は負)を満たす最小値を設定
      let amount: number
      if (item.itemCopyMode === 'labelOnly') {
        amount = item.type === 'income' ? 1 : -1
      } else {
        amount = item.amount
      }

      const newItem = {
        month: targetMonth,
        label: item.label,
        amount,
        person: item.person,
      }

      if (item.type === 'income') {
        incomeItems.push(newItem)
        result.copied.incomes++
      } else {
        expenseItems.push(newItem)
        result.copied.expenses++
      }
    }

    if (incomeItems.length > 0) {
      const { error } = await supabase.from('incomes').insert(incomeItems)
      if (error) throw new Error(`収入の挿入に失敗: ${error.message}`)
    }

    if (expenseItems.length > 0) {
      const { error } = await supabase.from('expenses').insert(expenseItems)
      if (error) throw new Error(`支出の挿入に失敗: ${error.message}`)
    }

    // 繰越を一括コピー
    if (options.includeCarryover) {
      const carryoverResult = await copyCarryovers(
        supabase,
        options.sourceMonth,
        options.targetMonth,
        options.mode
      )
      result.copied.carryovers = carryoverResult.copied
      result.skipped.carryovers = carryoverResult.skipped
    }

    revalidatePath('/')
    return result
  } catch (error) {
    console.error('月データコピーエラー:', error)
    return {
      success: false,
      copied: { incomes: 0, expenses: 0, carryovers: 0 },
      skipped: { incomes: 0, expenses: 0, carryovers: 0 },
      error:
        error instanceof Error ? error.message : 'データのコピーに失敗しました',
    }
  }
}
