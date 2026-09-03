import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('AI診断deployment gate', () => {
  it('remote migration成功後だけAPI Workerをdeployする', () => {
    const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as {
      scripts: Record<string, string>
    }

    expect(packageJson.scripts['migrate:worker:remote']).toContain(
      'd1 migrations apply score-splitter --remote'
    )
    expect(packageJson.scripts['deploy:worker']).toMatch(
      /^npm run migrate:worker:remote && wrangler deploy /
    )
  })

  it('開発のmigrationとpreviewは明示的にdev環境だけを対象とする', () => {
    const { scripts } = JSON.parse(readFileSync('package.json', 'utf8')) as {
      scripts: Record<string, string>
    }
    expect(scripts['migrate:dev']).toBe('wrangler d1 migrations apply score-splitter-db-dev --remote --env dev')
    expect(scripts['upload:dev']).toBe('opennextjs-cloudflare build --env dev && opennextjs-cloudflare upload --env dev')
  })

  it('runbookにdevとproduction双方のpending・secret・smoke確認を固定する', () => {
    const runbook = readFileSync('docs/deployment.md', 'utf8')

    expect(runbook).toContain('OPENAI_API_KEY')
    expect(runbook).toContain('pending 0件')
    expect(runbook).toContain('score-splitter-dev')
    expect(runbook).toContain('バックアップ・実体検証')
    expect(runbook).toContain('production')
    expect(runbook).toContain('通常の支出更新')
    expect(runbook).toContain('AI診断')
  })
})
