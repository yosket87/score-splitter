import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { createFirebaseSqlite, firebaseMigration } from '../../helpers/firebase-sqlite'
import { identitySnapshot } from '../../helpers/identity-sqlite'

describe('Firebase migration', () => {
  it('0013の非空fixtureの全既存列・保存値と外部キーを維持する', () => {
    const { sqlite, applyFirebase } = createFirebaseSqlite({ migrate: false })
    const before = identitySnapshot(sqlite)
    applyFirebase()
    for (const table of before.rows) {
      const columns = table.rows.length ? Object.keys(table.rows[0]) : sqlite.prepare(`PRAGMA table_info(${table.table})`).all().map(column => String(column.name))
      expect(sqlite.prepare(`SELECT ${columns.join(',')} FROM ${table.table} ORDER BY rowid`).all()).toEqual(table.rows)
    }
    expect(sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([])
    sqlite.close()
  })
  it('未知DDLと途中失敗は全schemaと全値をrollbackする', () => {
    const { sqlite, applyFirebase } = createFirebaseSqlite({ migrate: false })
    sqlite.exec('CREATE INDEX unexpected ON sessions(person)')
    const unexpected = identitySnapshot(sqlite)
    expect(() => applyFirebase()).toThrow()
    expect(identitySnapshot(sqlite)).toEqual(unexpected)
    sqlite.exec('DROP INDEX unexpected')
    const before = identitySnapshot(sqlite)
    const sql = readFileSync(`cloudflare/worker/migrations/${firebaseMigration}`, 'utf8')
    for (const marker of ['DROP TABLE payment_voids;', 'DROP TABLE payment_operations;', 'ALTER TABLE sessions_new RENAME TO sessions;']) {
      expect(() => applyFirebase(sql.replace(marker, `${marker}\nINSERT INTO _firebase_migration_assert VALUES(0);`))).toThrow()
      expect(identitySnapshot(sqlite)).toEqual(before)
    }
    applyFirebase()
    sqlite.close()
  })
})
