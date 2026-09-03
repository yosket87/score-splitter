import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { AI_CATEGORIES } from '@/features/ai-diagnosis/categories'

describe('AIカテゴリ契約', () => {
  it('軽量な単一ソースの14カテゴリとD1 migration制約が一致する', () => {
    const migration = readFileSync(
      'cloudflare/worker/migrations/0005_add_ai_diagnosis.sql',
      'utf8'
    )
    const categoryConstraint = migration.match(/ai_category IN \(([^)]+)\)/)?.[1]
    const migrationCategories =
      categoryConstraint?.match(/'([^']+)'/g)?.map((value) => value.slice(1, -1)) ?? []

    expect(AI_CATEGORIES).toHaveLength(14)
    expect(migrationCategories).toEqual([...AI_CATEGORIES])
  })
})
