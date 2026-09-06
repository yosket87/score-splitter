import { routeAiDiagnosis, type WorkerRouteContext } from './ai-diagnosis-router'
import { routeAuthControlPlane, routeAuthManagement } from './auth-router'
import { routeAuthenticated } from './authenticated-router'
import { createRuntime, type Env, type RuntimeDeps } from './d1'
import { assertAuth, errorJson, HttpError, json, readJson } from './http'
import { registerWaitlistEntry } from './waitlist'
import { AiDiagnosisWireError } from '../../../src/features/ai-diagnosis/wire'

const worker = {
  fetch(request: Request, env: Env): Promise<Response> {
    return handleRequest(request, env)
  },
}

export default worker

export async function handleRequest(
  request: Request,
  env: Env,
  deps: RuntimeDeps = {}
): Promise<Response> {
  try {
    const runtime = createRuntime(deps)
    const url = new URL(request.url)
    const parts = url.pathname.split('/').filter(Boolean)
    if (isWaitlistPost(request, parts)) {
      const data = await registerWaitlistEntry(env.DB, runtime, await readJson(request))
      return json({ data }, { status: 201 })
    }

    assertAuth(request, env.WORKER_API_TOKEN)
    const context: WorkerRouteContext = { request, env, runtime, url, parts }
    return (
      (await routeAuthControlPlane(context)) ??
      (await routeAuthManagement(context)) ??
      (await routeAiDiagnosis(context)) ??
      (await routeAuthenticated(context)) ??
      errorJson('エンドポイントが見つかりません', 404)
    )
  } catch (error) {
    return handleRequestError(error)
  }
}

function isWaitlistPost(request: Request, parts: string[]): boolean {
  return parts.length === 1 && parts[0] === 'waitlist' && request.method === 'POST'
}

function handleRequestError(error: unknown): Response {
  if (error instanceof AiDiagnosisWireError) return errorJson(error.message, 400)
  if (error instanceof HttpError) return errorJson(error.message, error.status)
  console.error('[worker]', error)
  return errorJson('内部エラーが発生しました', 500)
}
