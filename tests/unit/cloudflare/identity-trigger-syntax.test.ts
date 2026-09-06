import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import { assertD1RemoteTriggerSyntax } from '../../../scripts/identity-migration-sql.mjs'
import { createIdentitySqlite } from '../../helpers/identity-sqlite'

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite')

function trigger(body: string) {
  const sqlite = new DatabaseSync(':memory:')
  try {
    sqlite.exec(`CREATE TABLE sample(id INTEGER); CREATE TRIGGER sample_guard BEFORE INSERT ON sample BEGIN ${body} END;`)
    return sqlite.prepare("SELECT name,sql FROM sqlite_schema WHERE type='trigger'").all()
  } finally { sqlite.close() }
}

describe('D1 remote queryで失敗するtrigger構文の検査', () => {
  it('SQLiteが受け入れる括弧なしCASEをremote非互換として拒否する', () => {
    expect(() => assertD1RemoteTriggerSyntax(trigger('SELECT CASE WHEN NEW.id < 0 THEN RAISE(ABORT,\'negative\') END;')))
      .toThrow(/sample_guard.*CASE/)
  })

  it.each([
    "SELECT (CASE WHEN NEW.id < 0 THEN RAISE(ABORT,'negative') END);",
    "SELECT (CASE WHEN NEW.id < 0 THEN CASE WHEN TRUE THEN 1 END END);",
    "SELECT 'CASE ) -- ''quoted''', 1 AS \"CASE\", 2 AS [CASE], 3 AS `CASE`; -- CASE )\n /* CASE ( */ SELECT 1;",
  ])('SQLiteで有効な括弧付きCASE・引用値・コメントを誤検出しない', (body) => {
    expect(() => assertD1RemoteTriggerSyntax(trigger(body))).not.toThrow()
  })

  it('実0013の完成trigger全件に既知のremote非互換構文がない', () => {
    const { sqlite } = createIdentitySqlite()
    try {
      const triggers = sqlite.prepare("SELECT name,sql FROM sqlite_schema WHERE type='trigger'").all()
      expect(() => assertD1RemoteTriggerSyntax(triggers)).not.toThrow()
    } finally { sqlite.close() }
  })
})
