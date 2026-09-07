import { chmodSync } from 'node:fs'
import { buildCountSql, readBackupSchema, verifyForeignKeyCheck } from './backup-schema.mjs'

function verifyOAuthSequence(query) {
  const sequences = query("SELECT seq, typeof(seq) AS value_type FROM sqlite_sequence WHERE name='oauth_login_attempts';")
  const [{ latest_attempt: latestAttempt, max_floor: maxFloor }] = query(`
    SELECT COALESCE((SELECT MAX(sequence) FROM oauth_login_attempts), 0) AS latest_attempt,
      COALESCE((SELECT MAX(oauth_attempt_floor) FROM users), 0) AS max_floor;
  `)
  const isSafeNonnegativeInteger = (value) => Number.isSafeInteger(value) && value >= 0
  if (!isSafeNonnegativeInteger(latestAttempt) || !isSafeNonnegativeInteger(maxFloor)) {
    throw new Error('OAuth採番の試行番号または失効下限が安全整数ではありません')
  }
  // 初期状態だけは内部表の行がなくても次の番号1を発行できる。
  if (sequences.length === 0) {
    if (latestAttempt === 0 && maxFloor === 0) return
    throw new Error('OAuth採番の高水位が復元されていません')
  }
  if (sequences.length !== 1 || sequences[0].value_type !== 'integer'
    || !isSafeNonnegativeInteger(sequences[0].seq)) {
    throw new Error('OAuth採番の高水位が一意な安全整数ではありません')
  }
  const highWater = sequences[0].seq
  // INSERTによる検査や補正は行わず、清掃前の履歴と全userのfloorを保護する。
  if (highWater < latestAttempt || highWater < maxFloor || highWater >= Number.MAX_SAFE_INTEGER) {
    throw new Error('OAuth採番の次の番号が失効下限を超える安全整数として発行できません')
  }
}

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
  if (schema.tables.includes('oauth_login_attempts')) verifyOAuthSequence(query)
  const foreignKeyCheck = verifyForeignKeyCheck(query('PRAGMA foreign_key_check;'))
  const countRows = query(buildCountSql(schema.tables))
  return { schema, foreignKeyCheck, integrityCheck, countRows }
}
