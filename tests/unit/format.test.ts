import { describe, it, expect } from 'vitest'
import {
  addMonths,
  formatCurrency,
  formatMonth,
  formatMonthDot,
  getDaysInMonth,
  isValidMonth,
  parseMonth,
} from '@/lib/utils/format'

describe('formatCurrency', () => {
  it('正の値をカンマ区切りで表示する', () => {
    expect(formatCurrency(1037038)).toBe('¥1,037,038')
  })

  it('負の値をカンマ区切りで表示する', () => {
    expect(formatCurrency(-833778)).toBe('−¥833,778')
  })

  it('0を正しく表示する', () => {
    expect(formatCurrency(0)).toBe('¥0')
  })

  it('小数点以下は切り捨てる', () => {
    expect(formatCurrency(101630.5)).toBe('¥101,630')
  })

  it('signed指定時は正の値にプラス記号を付ける', () => {
    expect(formatCurrency(1234, { signed: true })).toBe('+¥1,234')
  })

  it('signed指定時も負の値は数学マイナス記号で表示する', () => {
    expect(formatCurrency(-1234, { signed: true })).toBe('−¥1,234')
  })

  it('signed指定時でも0には符号を付けない', () => {
    expect(formatCurrency(0, { signed: true })).toBe('¥0')
  })

  it('absolute指定時は負の値も符号なしで表示する', () => {
    expect(formatCurrency(-833778, { absolute: true })).toBe('¥833,778')
  })
})

describe('formatMonth', () => {
  it('月文字列を年月形式に変換する', () => {
    expect(formatMonth('202601')).toBe('2026年1月')
  })

  it('月の先頭の0を除去する', () => {
    expect(formatMonth('202609')).toBe('2026年9月')
  })

  it('12月を正しく表示する', () => {
    expect(formatMonth('202612')).toBe('2026年12月')
  })
})

describe('parseMonth', () => {
  it('Dateオブジェクトを月文字列に変換する', () => {
    const date = new Date(2026, 0, 15) // 2026年1月15日
    expect(parseMonth(date)).toBe('202601')
  })

  it('月末の日付でも同じ月の文字列を返す', () => {
    const date = new Date(2026, 1, 28) // 2026年2月28日
    expect(parseMonth(date)).toBe('202602')
  })
})

describe('addMonths', () => {
  it('年跨ぎの翌月を返す', () => {
    expect(addMonths('202512', 1)).toBe('202601')
  })

  it('年跨ぎの前月を返す', () => {
    expect(addMonths('202601', -1)).toBe('202512')
  })

  it('12ヶ月後を返す', () => {
    expect(addMonths('202601', 12)).toBe('202701')
  })

  it('offsetが0なら同じ月を返す', () => {
    expect(addMonths('202601', 0)).toBe('202601')
  })
})

describe('formatMonthDot', () => {
  it('月文字列をYYYY.MM形式に変換する', () => {
    expect(formatMonthDot('202601')).toBe('2026.01')
  })
})

describe('getDaysInMonth', () => {
  it('閏年の2月の日数を返す', () => {
    expect(getDaysInMonth('202802')).toBe(29)
  })

  it('平年の2月の日数を返す', () => {
    expect(getDaysInMonth('202302')).toBe(28)
  })

  it('31日の月の日数を返す', () => {
    expect(getDaysInMonth('202601')).toBe(31)
  })

  it('30日の月の日数を返す', () => {
    expect(getDaysInMonth('202604')).toBe(30)
  })
})

describe('isValidMonth', () => {
  it('有効な月文字列（6桁、月が01-12）をtrueとする', () => {
    expect(isValidMonth('202601')).toBe(true)
    expect(isValidMonth('202604')).toBe(true)
    expect(isValidMonth('202612')).toBe(true)
    expect(isValidMonth('999912')).toBe(true)
  })

  it('6桁未満はfalseとする', () => {
    expect(isValidMonth('20260')).toBe(false)
    expect(isValidMonth('')).toBe(false)
  })

  it('6桁超過はfalseとする', () => {
    expect(isValidMonth('2026010')).toBe(false)
  })

  it('月部分が不正（00や13以上）はfalseとする', () => {
    expect(isValidMonth('202600')).toBe(false)
    expect(isValidMonth('202613')).toBe(false)
    expect(isValidMonth('202699')).toBe(false)
  })

  it('数字以外を含む場合はfalseとする', () => {
    expect(isValidMonth('abcdef')).toBe(false)
    expect(isValidMonth('2026-04')).toBe(false)
    expect(isValidMonth('2026/04')).toBe(false)
    expect(isValidMonth('20260a')).toBe(false)
  })
})
