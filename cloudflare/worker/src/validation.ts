import { HttpError } from './http'

export type Person = 'husband' | 'wife'
export type RecordType = 'income' | 'expense' | 'carryover'

export function assertObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpError('リクエスト形式が不正です', 400)
  }
  return value as Record<string, unknown>
}

export function parseString(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new HttpError(`${name}が不正です`, 400)
  }
  return value
}

export function parseNullablePerson(value: unknown): Person | null {
  if (value === null || value === undefined) {
    return null
  }
  return parsePerson(value)
}

export function parsePerson(value: unknown): Person {
  if (value !== 'husband' && value !== 'wife') {
    throw new HttpError('personが不正です', 400)
  }
  return value
}

export function parseMonth(value: unknown): string {
  const month = parseString(value, 'month')
  if (!/^\d{6}$/.test(month)) {
    throw new HttpError('monthが不正です', 400)
  }
  return month
}

export function parseInteger(value: unknown, name: string): number {
  if (!Number.isInteger(value)) {
    throw new HttpError(`${name}が不正です`, 400)
  }
  return value as number
}

export function parseBoolean(value: unknown, name: string): boolean {
  if (typeof value !== 'boolean') {
    throw new HttpError(`${name}が不正です`, 400)
  }
  return value
}

export function parseStringArray(value: unknown, name: string): string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
    throw new HttpError(`${name}が不正です`, 400)
  }
  return value
}

export function assertRecordAmount(type: RecordType, amount: number): void {
  if (type === 'income' && amount <= 0) {
    throw new HttpError('amountが不正です', 400)
  }
  if ((type === 'expense' || type === 'carryover') && amount >= 0) {
    throw new HttpError('amountが不正です', 400)
  }
}
