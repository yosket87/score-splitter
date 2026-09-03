import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('0007 AI診断source revision migration', () => {
  const migration = readFileSync(
    'cloudflare/worker/migrations/0007_add_ai_source_revision.sql',
    'utf8'
  )

  it('3テーブルのinsert/update/deleteをtriggerで追跡する', () => {
    for (const table of ['income', 'expense', 'carryover']) {
      for (const operation of ['insert', 'update', 'delete']) {
        expect(migration).toContain(
          `CREATE TRIGGER increment_ai_revision_after_${table}_${operation}`
        )
      }
    }
  })

  it('診断入力fieldだけをUPDATE trigger対象にする', () => {
    expect(migration).toContain('AFTER UPDATE OF month, amount ON incomes')
    expect(migration).toContain(
      'AFTER UPDATE OF month, label, amount, is_carryover ON expenses'
    )
    expect(migration).toContain(
      'AFTER UPDATE OF month, amount, is_cleared ON carryovers'
    )
    expect(migration).not.toMatch(/UPDATE OF[^\n]*(person|ai_category)/)
  })
})
