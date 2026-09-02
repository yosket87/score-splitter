import 'server-only'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import {
  createRuntime,
  type D1DatabaseLike,
  type Runtime,
} from '../../../cloudflare/worker/src/d1'

export function isWorkerApiMockEnabled(): boolean {
  return process.env.USE_MOCKS === 'true'
}

export function getDatabase(): D1DatabaseLike {
  const database = (getCloudflareContext().env as unknown as { DB?: D1DatabaseLike }).DB
  if (!database) {
    throw new Error('D1データベースの設定が見つかりません')
  }

  return database
}

export function getRuntime(): Runtime {
  return createRuntime()
}
