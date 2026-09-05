import { describe, expect, it } from 'vitest'
import { BACKUP_MIGRATIONS, resolveBackupSchema, verifyForeignKeyCheck } from '../../../scripts/backup-schema.mjs'
import { normalizeLocalCounts, verifyMatchingCounts } from '../../../scripts/backup-production-d1.mjs'

const names = BACKUP_MIGRATIONS.map((migration) => migration.name)
const tables = (stage: number) => BACKUP_MIGRATIONS.slice(0, stage).flatMap((migration) => migration.tables)
const schema = (stage: number) => resolveBackupSchema(tables(stage), names.slice(0, stage))

describe('適用migrationとバックアップ対象schema', () => {
  it.each([4, 5, 6, 7, 8, 9, 10, 11, 12])('000%sまでの業務テーブルを全て検証する', (stage) => {
    expect(schema(stage)).toEqual({ stage: String(stage).padStart(4, '0'), migrations: names.slice(0, stage), tables: tables(stage).sort() })
  })
  it.each(['ai_diagnoses', 'ai_execution_guard', 'ai_diagnosis_source_revision', 'payment_records', 'payment_operations', 'payment_voids', 'month_payment_revisions'])('%sの欠落を拒否する', (table) => {
    expect(() => resolveBackupSchema(tables(8).filter((name) => name !== table), names.slice(0, 8))).toThrow(/schema/)
  })
  it('未知表と未検証のSQL識別子を拒否する', () => {
    for (const table of ['unknown', 'incomes; DROP TABLE incomes', '_cf_unknown']) {
      expect(() => resolveBackupSchema([...tables(8), table], names.slice(0, 8))).toThrow(/schema/)
    }
  })
  it('内部表とmigration管理表を業務表と区別する', () => {
    expect(resolveBackupSchema([...tables(8), 'sqlite_sequence', '_cf_KV', 'd1_migrations'], names.slice(0, 8))).toEqual(schema(8))
  })
  it('migrationの欠番・重複・未知名とschema段階の不一致を拒否する', () => {
    for (const migrations of [names.slice(1, 8), [...names.slice(0, 8), names[7]], [...names.slice(0, 7), '0008_unknown.sql'], names.slice(0, 7)]) {
      expect(() => resolveBackupSchema(tables(8), migrations)).toThrow(/migration|schema/)
    }
  })
  it.each(['ai_diagnoses', 'payment_records'])('%sの件数欠落・不一致を拒否する', (table) => {
    const target = schema(8).tables
    const counts = Object.fromEntries(target.map((name) => [name, 1]))
    expect(normalizeLocalCounts([counts], target)).toEqual(counts)
    expect(() => normalizeLocalCounts([Object.fromEntries(Object.entries(counts).filter(([name]) => name !== table))], target)).toThrow(/件数/)
    expect(() => verifyMatchingCounts(counts, { ...counts, [table]: 2 }, target)).toThrow(table)
  })
  it('FK違反および結果不明を拒否する', () => {
    expect(verifyForeignKeyCheck([])).toEqual([])
    expect(() => verifyForeignKeyCheck([{ table: 'payment_records', rowid: 1, parent: 'payment_operations', fkid: 0 }])).toThrow(/foreign_key_check/)
    expect(() => verifyForeignKeyCheck(undefined)).toThrow(/foreign_key_check/)
  })
})
