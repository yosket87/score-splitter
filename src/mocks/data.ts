/**
 * モックモード用のサンプルデータ
 * 開発時にCloudflare Worker API無しでアプリを動作確認するためのシードデータ
 */

interface MockRow {
  [key: string]: unknown
  id: string
  month: string
  label: string
  amount: number
  person: 'husband' | 'wife'
  created_at: string
  updated_at: string
}

function ts(dateStr: string): string {
  return new Date(dateStr).toISOString()
}

// 2026年2月のデータ
const incomes202602: MockRow[] = [
  {
    id: '11111111-1111-1111-1111-000000000001',
    month: '202602',
    label: '給料',
    amount: 350000,
    person: 'husband',
    created_at: ts('2026-02-01T09:00:00'),
    updated_at: ts('2026-02-01T09:00:00'),
  },
  {
    id: '11111111-1111-1111-1111-000000000002',
    month: '202602',
    label: '給料',
    amount: 280000,
    person: 'wife',
    created_at: ts('2026-02-01T09:01:00'),
    updated_at: ts('2026-02-01T09:01:00'),
  },
  {
    id: '11111111-1111-1111-1111-000000000003',
    month: '202602',
    label: '副業',
    amount: 50000,
    person: 'husband',
    created_at: ts('2026-02-05T10:00:00'),
    updated_at: ts('2026-02-05T10:00:00'),
  },
]

const expenses202602: MockRow[] = [
  {
    id: '22222222-2222-2222-2222-000000000001',
    month: '202602',
    label: '家賃',
    amount: -120000,
    person: 'husband',
    is_carryover: false,
    created_at: ts('2026-02-01T10:00:00'),
    updated_at: ts('2026-02-01T10:00:00'),
  },
  {
    id: '22222222-2222-2222-2222-000000000002',
    month: '202602',
    label: '光熱費',
    amount: -15000,
    person: 'husband',
    is_carryover: false,
    created_at: ts('2026-02-01T10:01:00'),
    updated_at: ts('2026-02-01T10:01:00'),
  },
  {
    id: '22222222-2222-2222-2222-000000000003',
    month: '202602',
    label: '食費',
    amount: -50000,
    person: 'wife',
    is_carryover: false,
    created_at: ts('2026-02-01T10:02:00'),
    updated_at: ts('2026-02-01T10:02:00'),
  },
  {
    id: '22222222-2222-2222-2222-000000000004',
    month: '202602',
    label: '日用品',
    amount: -8000,
    person: 'wife',
    is_carryover: false,
    created_at: ts('2026-02-01T10:03:00'),
    updated_at: ts('2026-02-01T10:03:00'),
  },
  {
    id: '22222222-2222-2222-2222-000000000005',
    month: '202602',
    label: '通信費',
    amount: -12000,
    person: 'husband',
    is_carryover: false,
    created_at: ts('2026-02-01T10:04:00'),
    updated_at: ts('2026-02-01T10:04:00'),
  },
]

const carryovers202602: MockRow[] = [
  {
    id: '33333333-3333-3333-3333-000000000001',
    month: '202602',
    label: '前月繰越',
    amount: -5000,
    person: 'husband',
    is_cleared: false,
    created_at: ts('2026-02-01T08:00:00'),
    updated_at: ts('2026-02-01T08:00:00'),
  },
]

// 2026年1月のデータ
const incomes202601: MockRow[] = [
  {
    id: '11111111-1111-1111-1111-000000000011',
    month: '202601',
    label: '給料',
    amount: 350000,
    person: 'husband',
    created_at: ts('2026-01-01T09:00:00'),
    updated_at: ts('2026-01-01T09:00:00'),
  },
  {
    id: '11111111-1111-1111-1111-000000000012',
    month: '202601',
    label: '給料',
    amount: 280000,
    person: 'wife',
    created_at: ts('2026-01-01T09:01:00'),
    updated_at: ts('2026-01-01T09:01:00'),
  },
]

const expenses202601: MockRow[] = [
  {
    id: '22222222-2222-2222-2222-000000000011',
    month: '202601',
    label: '家賃',
    amount: -120000,
    person: 'husband',
    is_carryover: false,
    created_at: ts('2026-01-01T10:00:00'),
    updated_at: ts('2026-01-01T10:00:00'),
  },
  {
    id: '22222222-2222-2222-2222-000000000012',
    month: '202601',
    label: '食費',
    amount: -45000,
    person: 'wife',
    is_carryover: false,
    created_at: ts('2026-01-01T10:01:00'),
    updated_at: ts('2026-01-01T10:01:00'),
  },
]

const carryovers202601: MockRow[] = []

export const seedData = {
  incomes: [...incomes202601, ...incomes202602],
  expenses: [...expenses202601, ...expenses202602],
  carryovers: [...carryovers202601, ...carryovers202602],
  passkey_credentials: [],
}
