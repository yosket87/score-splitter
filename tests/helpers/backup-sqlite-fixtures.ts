import { spawnSync } from 'node:child_process'
import { chmodSync, constants, copyFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll } from 'vitest'

let directory: string | undefined
const snapshots = new Map<string, string>()

// 同じSQLの生成だけを再利用し、各試験には別ファイルを渡す。
export function createSqliteFixture(sql: string, databasePath: string) {
  let snapshot = snapshots.get(sql)
  if (snapshot === undefined) {
    directory ??= mkdtempSync(path.join(tmpdir(), 'backup-sqlite-fixtures-'))
    snapshot = path.join(directory, `${snapshots.size}.sqlite`)
    const result = spawnSync('sqlite3', ['-safe', '-bail', snapshot], { input: sql, encoding: 'utf8' })
    if (result.status !== 0) {
      rmSync(snapshot, { force: true })
      throw new Error(result.stderr)
    }
    chmodSync(snapshot, 0o400)
    snapshots.set(sql, snapshot)
  }
  copyFileSync(snapshot, databasePath, constants.COPYFILE_EXCL)
  chmodSync(databasePath, 0o600)
}

afterAll(() => {
  if (directory !== undefined) rmSync(directory, { recursive: true, force: true })
})
