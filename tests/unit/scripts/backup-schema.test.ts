import { describe, expect, it } from 'vitest'
import { BACKUP_MIGRATIONS, normalizeSchemaObjects, normalizeSchemaSql, resolveBackupSchema, validateCanonicalSchemaObjects, verifyForeignKeyCheck, verifyMatchingSchemaObjects } from '../../../scripts/backup-schema.mjs'
import { normalizeLocalCounts, verifyMatchingCounts } from '../../../scripts/backup-production-d1.mjs'

const names = BACKUP_MIGRATIONS.map((migration) => migration.name)
const tables = (stage: number) => BACKUP_MIGRATIONS.slice(0, stage).flatMap((migration) => migration.tables)
const schema = (stage: number) => resolveBackupSchema(tables(stage), names.slice(0, stage))

describe('適用migrationとバックアップ対象schema', () => {
  it.each([4, 5, 6, 7, 8, 9])('000%sまでの業務テーブルを全て検証する', (stage) => {
    expect(schema(stage)).toEqual({ stage: String(stage).padStart(4, '0'), migrations: names.slice(0, stage), tables: tables(stage).sort(), objects: [] })
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
    expect(resolveBackupSchema([...tables(8), 'sqlite_sequence', '_cf_KV', '_cf_METADATA', 'd1_migrations'], names.slice(0, 8))).toEqual(schema(8))
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

  it('引用外の空白・コメント・末尾semicolonだけを無視する', () => {
    expect(normalizeSchemaSql(`CREATE /* 説明 */ TABLE items (id TEXT); -- end`))
      .toBe(normalizeSchemaSql('CREATE TABLE items(id TEXT)'))
  })

  it('引用内の空白とコメント文字列は保持する', () => {
    expect(normalizeSchemaSql("CREATE TABLE t (value TEXT DEFAULT 'a b')"))
      .not.toBe(normalizeSchemaSql("CREATE TABLE t (value TEXT DEFAULT 'ab')"))
    expect(normalizeSchemaSql("CREATE TABLE t (value TEXT DEFAULT '--x')"))
      .not.toBe(normalizeSchemaSql("CREATE TABLE t (value TEXT DEFAULT '--y')"))
  })

  it('NBSPをSQLite空白として捨てず識別子境界を保持する', () => {
    expect(normalizeSchemaSql('CREATE TABLE t(label TEXT)'))
      .not.toBe(normalizeSchemaSql('CREATE TABLE t(label\u00a0TEXT)'))
  })

  it('内部objectと自動indexを除外し、明示objectを整列する', () => {
    expect(normalizeSchemaObjects([
      { type: 'trigger', name: 'z', tbl_name: 'incomes', sql: 'CREATE TRIGGER z AFTER INSERT ON incomes BEGIN SELECT 1; END' },
      { type: 'index', name: 'sqlite_autoindex_incomes_1', tbl_name: 'incomes', sql: null },
      { type: 'table', name: 'd1_migrations', tbl_name: 'd1_migrations', sql: 'CREATE TABLE d1_migrations(id)' },
      { type: 'table', name: '_cf_METADATA', tbl_name: '_cf_METADATA', sql: 'CREATE TABLE _cf_METADATA(key, value)' },
      { type: 'table', name: 'incomes', tbl_name: 'incomes', sql: 'CREATE TABLE incomes(id)' },
    ])).toEqual([
      { type: 'table', name: 'incomes', tableName: 'incomes', sql: 'CREATE TABLE incomes ( id )' },
      { type: 'trigger', name: 'z', tableName: 'incomes', sql: 'CREATE TRIGGER z AFTER INSERT ON incomes BEGIN SELECT 1 ; END' },
    ])
  })

  it('欠落・同名改変・未知objectをobject名付きで拒否する', () => {
    const expected = normalizeSchemaObjects([{ type: 'trigger', name: 'immutable', tableName: 'payment_records', sql: 'CREATE TRIGGER immutable BEFORE UPDATE ON payment_records BEGIN SELECT RAISE(ABORT,\'IMMUTABLE\'); END' }])
    expect(verifyMatchingSchemaObjects(expected, expected)).toEqual(expected)
    const altered = normalizeSchemaObjects([{ ...expected[0], sql: expected[0].sql.replace('UPDATE', 'DELETE') }])
    expect(() => verifyMatchingSchemaObjects(expected, altered)).toThrow(/schema objectが不一致.*immutable/)
    const unknown = normalizeSchemaObjects([...expected, { type: 'view', name: 'unknown_view', tableName: 'unknown_view', sql: 'CREATE VIEW unknown_view AS SELECT 1' }])
    expect(() => verifyMatchingSchemaObjects(expected, unknown)).toThrow(/schema objectが不一致.*unknown_view/)
    expect(() => verifyMatchingSchemaObjects(expected, [])).toThrow(/空/)
  })

  it('不正な型・空SQL・重複objectを拒否する', () => {
    expect(() => normalizeSchemaObjects({})).toThrow(/配列/)
    expect(() => normalizeSchemaObjects([{ type: 'table', name: 'x', tableName: 'x', sql: '' }])).toThrow(/SQL/)
    const object = { type: 'table', name: 'x', tableName: 'x', sql: 'CREATE TABLE x(id)' }
    expect(() => normalizeSchemaObjects([object, object])).toThrow(/重複/)
  })

  it('manifest objectは必須field・canonical SQL・並び順を厳格検証する', () => {
    const table = normalizeSchemaObjects([{ type: 'table', name: 't', tbl_name: 't', sql: 'CREATE TABLE t(id TEXT);' }])[0]
    expect(validateCanonicalSchemaObjects([table])).toEqual([table])
    expect(validateCanonicalSchemaObjects(validateCanonicalSchemaObjects([table]))).toEqual([table])
    for (const objects of [
      [{ type: 'table', name: ' ', tableName: ' ', sql: '/*comment*/' }],
      [{ type: 'table', name: 't', tbl_name: 't', sql: table.sql }],
      [{ ...table, sql: 'CREATE TABLE t ( id TEXT );' }],
      [{ ...table, sql: ';' }],
      [{ type: 'trigger', name: 'z', tableName: 't', sql: 'CREATE TRIGGER z AFTER INSERT ON t BEGIN SELECT 1 ; END' }, table],
    ]) expect(() => validateCanonicalSchemaObjects(objects)).toThrow(/schema object|並び順/)
  })
})
