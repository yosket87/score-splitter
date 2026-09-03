import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const repositoryRoot = path.resolve(__dirname, '../../..')
const PRODUCTION_D1_ID = '7f8d3531-a833-4474-84d5-cee3ac98ee96'
const DEVELOPMENT_D1_ID = '51457bd5-8e0e-4645-ad34-86634285af2c'

type WranglerConfig = {
  d1_databases?: Array<{
    binding: string
    database_name: string
    database_id: string
    migrations_dir?: string
  }>
  env?: {
    dev?: {
      name: string
      compatibility_flags: string[]
      workers_dev: boolean
      routes: unknown[]
      d1_databases: Array<{
        binding: string
        database_name: string
        database_id: string
        migrations_dir?: string
      }>
      vars: Record<string, string>
    }
  }
  vars: Record<string, string>
}

function readWranglerConfig(): WranglerConfig {
  const configText = readFileSync(path.join(repositoryRoot, 'wrangler.jsonc'), 'utf8')
  const jsonText = configText.replace(/^\s*\/\/.*(?:\r?\n|$)/gm, '')

  return JSON.parse(jsonText) as WranglerConfig
}

describe('root Wrangler 開発環境設定', () => {
  it('本番Workerは本番D1をDB bindingとして持つ', () => {
    const config = readWranglerConfig()

    expect(config.d1_databases).toContainEqual({
      binding: 'DB',
      database_name: 'score-splitter',
      database_id: PRODUCTION_D1_ID,
      migrations_dir: 'cloudflare/worker/migrations',
    })
  })

  it('dev Workerは専用D1へbindingされ、固定Custom Domainを持たない', () => {
    const config = readWranglerConfig()
    const development = config.env?.dev

    expect(development).toMatchObject({
      name: 'score-splitter-dev',
      compatibility_flags: ['nodejs_compat'],
      workers_dev: true,
      routes: [],
    })
    expect(development?.d1_databases).toContainEqual({
      binding: 'DB',
      database_name: 'score-splitter-db-dev',
      database_id: DEVELOPMENT_D1_ID,
      migrations_dir: 'cloudflare/worker/migrations',
    })
    expect(development?.d1_databases[0]?.database_id).not.toBe(PRODUCTION_D1_ID)
  })

  it('dev環境には旧API Worker URLを定義しない', () => {
    const config = readWranglerConfig()

    expect(config.vars.CLOUDFLARE_WORKER_API_URL).toBe('https://api.yamawake.app')
    expect(config.env?.dev?.vars).not.toHaveProperty('CLOUDFLARE_WORKER_API_URL')
  })

  it('開発Worker向けのデプロイ、アップロード、migrationスクリプトを持つ', () => {
    const packageJson = JSON.parse(
      readFileSync(path.join(repositoryRoot, 'package.json'), 'utf8')
    ) as { scripts: Record<string, string> }

    expect(packageJson.scripts).toMatchObject({
      'deploy:dev': 'opennextjs-cloudflare build --env dev && opennextjs-cloudflare deploy --env dev',
      'upload:dev': 'opennextjs-cloudflare build --env dev && opennextjs-cloudflare upload --env dev',
      'migrate:dev': 'wrangler d1 migrations apply score-splitter-db-dev --remote --env dev',
    })
  })
})
