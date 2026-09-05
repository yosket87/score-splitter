import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// migration名と追加される業務表を明示し、未知schemaは安全側で拒否する。
export const BACKUP_MIGRATIONS = Object.freeze([
  {
    name: '0001_initial.sql',
    tables: ['incomes', 'expenses', 'carryovers', 'sessions', 'passkey_credentials', 'webauthn_challenges'],
  },
  { name: '0002_add_carryover_unique_index.sql', tables: [] },
  { name: '0003_add_login_attempts.sql', tables: ['login_attempts'] },
  { name: '0004_add_waitlist_entries.sql', tables: ['waitlist_entries'] },
  { name: '0005_add_ai_diagnosis.sql', tables: ['ai_diagnoses'] },
  { name: '0006_add_ai_execution_guard.sql', tables: ['ai_execution_guard'] },
  { name: '0007_add_ai_source_revision.sql', tables: ['ai_diagnosis_source_revision'] },
  {
    name: '0008_add_payment_records.sql',
    tables: ['month_payment_revisions', 'payment_operations', 'payment_records', 'payment_voids'],
  },
  // 定義だけを先行させ、実行時はmigrationファイルの存在も要求する。
  { name: '0009_add_households.sql', tables: ['households'] },
  { name: '0010_backfill_households.sql', tables: [] },
  { name: '0011_scope_household_data.sql', tables: [] },
].map((migration) => Object.freeze({ ...migration, tables: Object.freeze(migration.tables) })))

// SQLite予約表と、D1が使用する既知の内部表だけを除外する。
export const SCHEMA_TABLES_SQL = "SELECT name FROM sqlite_schema WHERE type = 'table' ORDER BY name;"
export const SCHEMA_MIGRATIONS_SQL = 'SELECT name FROM d1_migrations ORDER BY id;'
const internalTables = new Set(['_cf_KV', 'd1_migrations'])
const knownTables = new Set(BACKUP_MIGRATIONS.flatMap((migration) => migration.tables))

export function validateTableNames(tables) {
  if (
    !Array.isArray(tables) || tables.length === 0 || new Set(tables).size !== tables.length ||
    tables.some((name) => typeof name !== 'string' || !/^[a-z][a-z0-9_]*$/.test(name) || !knownTables.has(name))
  ) {
    throw new Error('schemaの対象テーブルが不正です')
  }
  return tables
}

export function resolveBackupSchema(tables, migrations) {
  if (
    !Array.isArray(migrations) || migrations.length < 4 || migrations.length > BACKUP_MIGRATIONS.length ||
    migrations.some((name, index) => name !== BACKUP_MIGRATIONS[index].name)
  ) {
    throw new Error('適用済みmigrationが既知の連続した段階ではありません')
  }
  if (
    !Array.isArray(tables) || tables.some((name) => typeof name !== 'string') ||
    new Set(tables).size !== tables.length
  ) {
    throw new Error('schemaのテーブル一覧が不正です')
  }
  const businessTables = tables.filter((name) => !name.startsWith('sqlite_') && !internalTables.has(name)).sort()
  const expected = BACKUP_MIGRATIONS.slice(0, migrations.length).flatMap((migration) => migration.tables).sort()
  if (JSON.stringify(businessTables) !== JSON.stringify(expected)) {
    throw new Error('schemaの業務テーブル集合が適用済みmigrationと一致しません')
  }
  return { stage: String(migrations.length).padStart(4, '0'), migrations: [...migrations], tables: businessTables }
}

export function validateSchemaEvidence(value) {
  if (!value || typeof value !== 'object') throw new Error('schema検証情報がありません')
  const normalized = resolveBackupSchema(value.tables, value.migrations)
  if (value.stage !== normalized.stage || JSON.stringify(value.tables) !== JSON.stringify(normalized.tables)) {
    throw new Error('schema段階または対象テーブルが不一致です')
  }
  return normalized
}

export function verifyForeignKeyCheck(rows) {
  if (!Array.isArray(rows) || rows.length !== 0) {
    throw new Error('SQLite foreign_key_checkが正常ではありません')
  }
  return []
}

export function buildCountSql(tables) {
  const expressions = validateTableNames(tables).map(
    (name) => `(SELECT COUNT(*) FROM ${name}) AS ${name}`
  )
  return `SELECT ${expressions.join(',\n')};`
}

export function normalizeSchemaRows(rows) {
  if (!Array.isArray(rows) || rows.some((row) => !row || typeof row.name !== 'string')) {
    throw new Error('schemaの一覧取得結果が不正です')
  }
  return rows.map((row) => row.name)
}

export function readBackupSchema(query, migrationExists = existsSync) {
  const tables = normalizeSchemaRows(query(SCHEMA_TABLES_SQL))
  if (!tables.includes('d1_migrations')) throw new Error('migration管理表がありません')
  const migrations = normalizeSchemaRows(query(SCHEMA_MIGRATIONS_SQL))
  const schema = resolveBackupSchema(tables, migrations)
  for (const migration of schema.migrations) {
    if (!migrationExists(path.join(repositoryRoot, 'cloudflare/worker/migrations', migration))) {
      throw new Error(`適用済みmigrationがリポジトリにありません: ${migration}`)
    }
  }
  return schema
}
