'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatCurrency } from '@/lib/utils/format'
import { simulateSettlement, type SimulatorInput } from '../utils'
import { useSimulatorUsage } from './simulator-usage-provider'

const fields = [
  { key: 'myIncome', label: 'あなたの月収', placeholder: '300000' },
  { key: 'partnerIncome', label: 'パートナーの月収', placeholder: '200000' },
  { key: 'sharedExpense', label: '共通経費', placeholder: '180000' },
] as const

const initialInvalidFields: Record<keyof SimulatorInput, boolean> = {
  myIncome: false,
  partnerIncome: false,
  sharedExpense: false,
}

export function SettlementSimulator() {
  const { markSimulatorUsed } = useSimulatorUsage()
  const [input, setInput] = useState<SimulatorInput>({
    myIncome: 0,
    partnerIncome: 0,
    sharedExpense: 0,
  })
  const [invalidFields, setInvalidFields] =
    useState<Record<keyof SimulatorInput, boolean>>(initialInvalidFields)

  const result = simulateSettlement(input)

  const handleChange = (key: keyof SimulatorInput, rawValue: string) => {
    markSimulatorUsed()
    const value = Number(rawValue)
    // 空文字は0扱いで有効。数値として解釈でき0以上なら有効
    const isValid = rawValue === '' || (Number.isFinite(value) && value >= 0)
    setInvalidFields((previous) => ({ ...previous, [key]: !isValid }))
    setInput((previous) => ({
      ...previous,
      [key]: isValid ? value : 0,
    }))
  }

  return (
    <section className="px-6 py-16">
      <Card className="mx-auto max-w-2xl">
        <CardHeader>
          <CardTitle>ふたりの精算額を試してみる</CardTitle>
          <p className="text-sm text-muted-foreground">
            共通経費はあなたが支払った想定で計算します。
          </p>
          <p className="text-sm text-muted-foreground">
            入力した金額は保存も送信もされません。
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            {fields.map((field) => (
              <div key={field.key} className="space-y-2">
                <Label htmlFor={`simulator-${field.key}`}>{field.label}</Label>
                <Input
                  id={`simulator-${field.key}`}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  placeholder={field.placeholder}
                  aria-invalid={invalidFields[field.key] || undefined}
                  aria-describedby={
                    invalidFields[field.key]
                      ? `simulator-${field.key}-error`
                      : undefined
                  }
                  onChange={(event) => handleChange(field.key, event.target.value)}
                />
                {invalidFields[field.key] && (
                  <p
                    id={`simulator-${field.key}-error`}
                    className="text-xs text-destructive"
                  >
                    0以上の数値を入力してください
                  </p>
                )}
              </div>
            ))}
          </div>
          <div className="rounded-lg bg-muted p-6 text-center">
            <p className="text-sm text-muted-foreground">ひとりの取り分</p>
            <p className="text-2xl font-bold">{formatCurrency(result.allowance)}</p>
            <p className="mt-4 text-sm text-muted-foreground">今月の精算</p>
            <p className="text-lg font-semibold">
              {result.payer === 'me' ? 'あなた → パートナー' : 'パートナー → あなた'}
            </p>
            <p className="text-3xl font-bold text-primary">
              {formatCurrency(result.amount)}
            </p>
          </div>
        </CardContent>
      </Card>
    </section>
  )
}
