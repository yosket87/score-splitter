import { validDiagnosisView } from './ai-diagnosis-wire-cases'

export interface SavedDiagnosisGetCase {
  name: string
  path: string
  seedMonth: string
  diagnosis: unknown
  inputHash: string | null
  analysisVersion: string | null
  expectedStatus: number
  expectedBody: unknown
}

export const savedDiagnosisGetCases: SavedDiagnosisGetCase[] = [
  {
    name: '正常な保存済み診断',
    path: '/ai-diagnoses/202601',
    seedMonth: '202601',
    diagnosis: validDiagnosisView,
    inputHash: 'hash-1',
    analysisVersion: 'v1',
    expectedStatus: 200,
    expectedBody: {
      data: {
        diagnosis: validDiagnosisView,
        inputHash: 'hash-1',
        analysisVersion: 'v1',
        updatedAt: '2026-01-20T12:00:00.000Z',
      },
    },
  },
  {
    name: 'personが混入した保存済み診断',
    path: '/ai-diagnoses/202601',
    seedMonth: '202601',
    diagnosis: { ...validDiagnosisView, person: 'husband' },
    inputHash: 'hash-1',
    analysisVersion: 'v1',
    expectedStatus: 500,
    expectedBody: { error: '内部エラーが発生しました' },
  },
  {
    name: 'input_hashがnullの保存済み診断',
    path: '/ai-diagnoses/202601',
    seedMonth: '202601',
    diagnosis: validDiagnosisView,
    inputHash: null,
    analysisVersion: 'v1',
    expectedStatus: 500,
    expectedBody: { error: '内部エラーが発生しました' },
  },
  {
    name: 'analysis_versionがnullの保存済み診断',
    path: '/ai-diagnoses/202601',
    seedMonth: '202601',
    diagnosis: validDiagnosisView,
    inputHash: 'hash-1',
    analysisVersion: null,
    expectedStatus: 500,
    expectedBody: { error: '内部エラーが発生しました' },
  },
  {
    name: '不正月の受信request',
    path: '/ai-diagnoses/202613',
    seedMonth: '202613',
    diagnosis: { ...validDiagnosisView, person: 'husband' },
    inputHash: null,
    analysisVersion: null,
    expectedStatus: 400,
    expectedBody: { error: 'monthが不正です' },
  },
]
