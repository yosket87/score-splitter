import { chmodSync } from 'node:fs'
import { buildCountSql, readBackupSchema, verifyForeignKeyCheck } from './backup-schema.mjs'

// 新規バックアップと切替直前の再検証で同じSQLite検査を行う。
export function restoreAndInspectBackup(sql, databasePath, commandRunner) {
  commandRunner('sqlite3', ['-safe', '-bail', databasePath], {
    input: sql,
    label: 'SQLiteへのバックアップ復元',
  })
  chmodSync(databasePath, 0o600)
  const integrityCheck = commandRunner(
    'sqlite3', ['-safe', databasePath, 'PRAGMA integrity_check;'],
    { label: 'SQLite integrity_check' }
  ).trim()
  if (integrityCheck !== 'ok') throw new Error('SQLite integrity_checkがokではありません')
  const query = (command) => {
    const output = commandRunner('sqlite3', ['-safe', '-json', databasePath, command], {
      label: '復元SQLiteの検証',
    })
    // sqlite3は0行の結果を空文字として返す。
    try {
      return JSON.parse(output.trim() || '[]')
    } catch {
      throw new Error('復元SQLiteの検証結果が有効なJSONではありません')
    }
  }
  const schema = readBackupSchema(query)
  const foreignKeyCheck = verifyForeignKeyCheck(query('PRAGMA foreign_key_check;'))
  const countRows = query(buildCountSql(schema.tables))
  return { schema, foreignKeyCheck, integrityCheck, countRows }
}
