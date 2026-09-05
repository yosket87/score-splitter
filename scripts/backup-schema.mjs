import { existsSync, readFileSync } from 'node:fs'
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
].map((migration) => Object.freeze({ ...migration, tables: Object.freeze(migration.tables) })))

// SQLite予約表と、D1が使用する既知の内部表だけを除外する。
export const SCHEMA_TABLES_SQL = "SELECT name FROM sqlite_schema WHERE type = 'table' ORDER BY name;"
export const SCHEMA_MIGRATIONS_SQL = 'SELECT name FROM d1_migrations ORDER BY id;'
export const SCHEMA_OBJECTS_SQL = `SELECT type, name, tbl_name, sql FROM sqlite_schema
WHERE type IN ('table', 'index', 'trigger', 'view') ORDER BY type, name;`
const internalTables = new Set(['_cf_KV', '_cf_METADATA', 'd1_migrations'])
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

export function resolveBackupSchema(tables, migrations, objects = []) {
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
  return {
    stage: String(migrations.length).padStart(4, '0'),
    migrations: [...migrations],
    tables: businessTables,
    objects: normalizeSchemaObjects(objects),
  }
}

export function validateSchemaEvidence(value) {
  if (!value || typeof value !== 'object') throw new Error('schema検証情報がありません')
  if (!Object.hasOwn(value, 'objects')) throw new Error('schema.objectsがありません')
  const objects = validateCanonicalSchemaObjects(value.objects)
  const normalized = resolveBackupSchema(value.tables, value.migrations, objects)
  if (value.stage !== normalized.stage || JSON.stringify(value.tables) !== JSON.stringify(normalized.tables)) {
    throw new Error('schema段階または対象テーブルが不一致です')
  }
  return normalized
}

function removeIgnoredSql(sql) {
  const tokens = []
  for (let index = 0; index < sql.length;) {
    const char = sql[index]
    const next = sql[index + 1]
    if (char === "'" || char === '"' || char === '`') {
      let token = char
      const quote = char
      index += 1
      for (;;) {
        if (index >= sql.length) throw new Error('schema SQLの引用符が閉じられていません')
        token += sql[index]
        if (sql[index] === quote) {
          if (sql[index + 1] === quote) {
            token += sql[index + 1]
            index += 2
            continue
          }
          index += 1
          break
        }
        index += 1
      }
      tokens.push(token)
      continue
    }
    if (char === '[') {
      const end = sql.indexOf(']', index + 1)
      if (end < 0) throw new Error('schema SQLの引用符が閉じられていません')
      tokens.push(sql.slice(index, end + 1))
      index = end + 1
      continue
    }
    if (char === '-' && next === '-') {
      index += 2
      while (index < sql.length && sql[index] !== '\n') index += 1
      continue
    }
    if (char === '/' && next === '*') {
      const end = sql.indexOf('*/', index + 2)
      if (end < 0) throw new Error('schema SQLのblock commentが閉じられていません')
      index = end + 2
      continue
    }
    if (/[\u0009-\u000d\u0020]/.test(char)) {
      index += 1
      continue
    }
    if (/[A-Za-z0-9_$]/.test(char) || char.codePointAt(0) > 0x7f) {
      let end = index + 1
      while (
        end < sql.length &&
        (/[A-Za-z0-9_$]/.test(sql[end]) || sql.codePointAt(end) > 0x7f)
      ) end += 1
      tokens.push(sql.slice(index, end))
      index = end
      continue
    }
    tokens.push(char)
    index += 1
  }
  if (tokens.at(-1) === ';') tokens.pop()
  return tokens.join(' ')
}

export function normalizeSchemaSql(sql) {
  if (typeof sql !== 'string' || sql.trim().length === 0) {
    throw new Error('schema objectのSQLが不正です')
  }
  const normalized = removeIgnoredSql(sql)
  if (normalized.length === 0) throw new Error('schema objectのSQLが空です')
  return normalized
}

export function normalizeSchemaObjects(rows) {
  if (!Array.isArray(rows)) throw new Error('schema.objectsが配列ではありません')
  const objects = []
  const keys = new Set()
  for (const row of rows) {
    const type = row?.type
    const name = row?.name
    const tableName = row?.tableName ?? row?.tbl_name
    const sql = row?.sql
    if (
      !['table', 'index', 'trigger', 'view'].includes(type) ||
      typeof name !== 'string' || name.trim().length === 0 ||
      typeof tableName !== 'string' || tableName.trim().length === 0
    ) throw new Error(`schema objectが不正です: ${String(name)}`)

    const owningTable = type === 'table' ? name : tableName
    if (owningTable.startsWith('sqlite_') || internalTables.has(owningTable)) continue
    if (sql === null && type === 'index' && name.startsWith('sqlite_autoindex_')) continue
    if (sql === null) throw new Error(`schema objectのSQLが空です: ${name}`)
    const key = `${type}\0${name}`
    if (keys.has(key)) throw new Error(`schema objectが重複しています: ${name}`)
    keys.add(key)
    objects.push({ type, name, tableName, sql: normalizeSchemaSql(sql) })
  }
  return objects.sort((left, right) => left.type.localeCompare(right.type) || left.name.localeCompare(right.name))
}

export function validateCanonicalSchemaObjects(rows) {
  if (!Array.isArray(rows) || rows.length === 0) throw new Error('schema.objectsが空または不正です')
  const keys = new Set()
  let previousKey = ''
  return rows.map((row) => {
    const name = row?.name
    if (
      !row || typeof row !== 'object' || Array.isArray(row) ||
      !['table', 'index', 'trigger', 'view'].includes(row.type) ||
      typeof name !== 'string' || name.trim().length === 0 ||
      typeof row.tableName !== 'string' || row.tableName.trim().length === 0 ||
      typeof row.sql !== 'string'
    ) throw new Error(`schema objectが不正です: ${String(name)}`)
    const normalizedSql = normalizeSchemaSql(row.sql)
    if (normalizedSql !== row.sql) throw new Error(`schema objectが正規化形式ではありません: ${name}`)
    const key = `${row.type}\0${name}`
    if (keys.has(key)) throw new Error(`schema objectが重複しています: ${name}`)
    if (previousKey !== '' && previousKey.localeCompare(key) > 0) {
      throw new Error(`schema objectsの並び順が不正です: ${name}`)
    }
    keys.add(key)
    previousKey = key
    return { type: row.type, name, tableName: row.tableName, sql: row.sql }
  })
}

export function verifyMatchingSchemaObjects(expected, actual, labels = ['expected', 'actual']) {
  const left = validateCanonicalSchemaObjects(expected)
  const right = validateCanonicalSchemaObjects(actual)
  const byKey = (objects) => new Map(objects.map((object) => [`${object.type}\0${object.name}`, object]))
  const leftMap = byKey(left)
  const rightMap = byKey(right)
  for (const key of new Set([...leftMap.keys(), ...rightMap.keys()])) {
    const expectedObject = leftMap.get(key)
    const actualObject = rightMap.get(key)
    if (JSON.stringify(expectedObject) !== JSON.stringify(actualObject)) {
      const name = expectedObject?.name ?? actualObject?.name ?? '不明'
      throw new Error(`schema objectが不一致です: ${name} (${labels[0]} != ${labels[1]})`)
    }
  }
  return right
}

export function createExpectedBackupSchema(migrations, databasePath, commandRunner) {
  if (!Array.isArray(migrations)) throw new Error('適用済みmigrationが不正です')
  for (const name of migrations) {
    const migration = BACKUP_MIGRATIONS.find((candidate) => candidate.name === name)
    const migrationPath = path.join(repositoryRoot, 'cloudflare/worker/migrations', name)
    if (!migration || !existsSync(migrationPath)) {
      throw new Error(`適用済みmigrationがリポジトリにありません: ${name}`)
    }
    commandRunner('sqlite3', ['-safe', '-bail', databasePath], {
      input: readFileSync(migrationPath), label: `期待schema生成: ${name}`,
    })
  }
  commandRunner('sqlite3', ['-safe', databasePath, 'CREATE TABLE d1_migrations (id INTEGER PRIMARY KEY, name TEXT);'], { label: '期待migration表生成' })
  const inserts = migrations.map((name, index) =>
    `INSERT INTO d1_migrations VALUES (${index + 1}, '${name.replaceAll("'", "''")}');`
  ).join('')
  commandRunner('sqlite3', ['-safe', databasePath, inserts], { label: '期待migration履歴生成' })
  const query = (sql) => JSON.parse(commandRunner('sqlite3', ['-safe', '-json', databasePath, sql], { label: '期待schema取得' }).trim() || '[]')
  return readBackupSchema(query)
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
  const schemaWithoutObjects = resolveBackupSchema(tables, migrations)
  for (const migration of schemaWithoutObjects.migrations) {
    if (!migrationExists(path.join(repositoryRoot, 'cloudflare/worker/migrations', migration))) {
      throw new Error(`適用済みmigrationがリポジトリにありません: ${migration}`)
    }
  }
  return resolveBackupSchema(tables, migrations, query(SCHEMA_OBJECTS_SQL))
}
