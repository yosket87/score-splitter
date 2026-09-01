export const validDiagnosisView = {
  month: '202601',
  summaryText: '診断結果',
  currentExpenseTotal: 120000,
  baselineExpenseAverage: 100000,
  unresolvedCarryoverTotal: 0,
  notableChanges: [],
  positivePoints: [],
  suggestions: [],
  dataSufficiency: 'full',
} as const

export interface InvalidAiWireCase {
  name: string
  path: string
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  body?: unknown
  rawBody?: string
}

export const invalidAiWireCases: InvalidAiWireCase[] = [
  {
    name: 'contextの不正月',
    path: '/ai-diagnoses/202613/context',
    method: 'GET',
  },
  {
    name: '保存済み取得の不正月',
    path: '/ai-diagnoses/202600',
    method: 'GET',
  },
  {
    name: 'lease取得の不正月',
    path: '/ai-diagnoses/2026-01/lease',
    method: 'POST',
    body: { runToken: 'run-1' },
  },
  {
    name: 'lease解放の不正月',
    path: '/ai-diagnoses/202613/lease',
    method: 'DELETE',
    body: { runToken: 'run-1' },
  },
  {
    name: '保存の不正月',
    path: '/ai-diagnoses/202600',
    method: 'PUT',
    body: {
      runToken: 'run-1',
      inputHash: 'hash-1',
      analysisVersion: 'v1',
      expectedSourceRevision: 0,
      diagnosis: { ...validDiagnosisView, month: '202600' },
    },
  },
  {
    name: 'leaseの壊れたJSON',
    path: '/ai-diagnoses/202601/lease',
    method: 'POST',
    rawBody: '{',
  },
  {
    name: 'leaseの未知キー',
    path: '/ai-diagnoses/202601/lease',
    method: 'POST',
    body: { runToken: 'run-1', person: 'husband' },
  },
  {
    name: 'leaseの必須フィールド欠落',
    path: '/ai-diagnoses/202601/lease',
    method: 'POST',
    body: {},
  },
  {
    name: '分類のトップレベル未知キー',
    path: '/ai-diagnoses/categories',
    method: 'PATCH',
    body: { assignments: [], person: 'wife' },
  },
  {
    name: '分類のfenceフィールド欠落',
    path: '/ai-diagnoses/categories',
    method: 'PATCH',
    body: {
      assignments: [{
        expenseIds: ['expense-1'],
        category: 'housing',
        expectedLabel: '家賃',
      }],
    },
  },
  {
    name: '分類assignmentの必須フィールド欠落',
    path: '/ai-diagnoses/categories',
    method: 'PATCH',
    body: {
      month: '202601',
      runToken: 'run-1',
      assignments: [{ expenseIds: ['expense-1'], category: 'housing' }],
    },
  },
  {
    name: '分類の支出ID重複',
    path: '/ai-diagnoses/categories',
    method: 'PATCH',
    body: {
      month: '202601',
      runToken: 'run-1',
      assignments: [
        { expenseIds: ['expense-1'], category: 'housing', expectedLabel: '家賃' },
        { expenseIds: ['expense-1'], category: 'dining', expectedLabel: '家賃' },
      ],
    },
  },
  {
    name: '分類assignmentのperson混入',
    path: '/ai-diagnoses/categories',
    method: 'PATCH',
    body: {
      month: '202601',
      runToken: 'run-1',
      assignments: [{
        expenseIds: ['expense-1'],
        category: 'housing',
        expectedLabel: '家賃',
        person: 'wife',
      }],
    },
  },
  {
    name: '診断のperson混入',
    path: '/ai-diagnoses/202601',
    method: 'PUT',
    body: {
      runToken: 'run-1',
      inputHash: 'hash-1',
      analysisVersion: 'v1',
      expectedSourceRevision: 0,
      diagnosis: { ...validDiagnosisView, person: 'husband' },
    },
  },
  {
    name: '診断の必須フィールド欠落',
    path: '/ai-diagnoses/202601',
    method: 'PUT',
    body: {
      runToken: 'run-1',
      inputHash: 'hash-1',
      analysisVersion: 'v1',
      expectedSourceRevision: 0,
      diagnosis: {
        ...validDiagnosisView,
        summaryText: undefined,
      },
    },
  },
  {
    name: 'URLと診断の月不一致',
    path: '/ai-diagnoses/202601',
    method: 'PUT',
    body: {
      runToken: 'run-1',
      inputHash: 'hash-1',
      analysisVersion: 'v1',
      expectedSourceRevision: 0,
      diagnosis: { ...validDiagnosisView, month: '202602' },
    },
  },
  {
    name: '保存metaの不正型',
    path: '/ai-diagnoses/202601',
    method: 'PUT',
    body: {
      runToken: 'run-1',
      inputHash: 123,
      analysisVersion: 'v1',
      expectedSourceRevision: 0,
      diagnosis: validDiagnosisView,
    },
  },
  {
    name: '保存source revisionの不正型',
    path: '/ai-diagnoses/202601',
    method: 'PUT',
    body: {
      runToken: 'run-1',
      inputHash: 'hash-1',
      analysisVersion: 'v1',
      expectedSourceRevision: -1,
      diagnosis: validDiagnosisView,
    },
  },
]
