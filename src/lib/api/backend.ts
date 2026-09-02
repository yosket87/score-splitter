import 'server-only'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import {
  createRuntime,
  type D1DatabaseLike,
  type Runtime,
} from '../../../cloudflare/worker/src/d1'
import { HttpError } from '../../../cloudflare/worker/src/http'
import { ApiError } from './client'

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

export async function runD1Operation<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    if (error instanceof HttpError) {
      throw new ApiError(error.message, error.status)
    }

    console.error('D1操作中に予期しないエラーが発生しました', error)
    throw new ApiError('内部エラーが発生しました', 500)
  }
}
