import { z } from 'zod'
import type { WorkerRouteContext } from './ai-diagnosis-router'
import { HttpError, json, readJson } from './http'
import { parseMonth } from './validation'
import { getSession } from './sessions'
import { correctPayment, getPaymentOperation, getPaymentStatus, recordPayment } from './payment-status'

export async function routePaymentStatus(context: WorkerRouteContext): Promise<Response | null> {
  const { request, env, runtime, parts } = context
  if (parts[0] !== 'months' || !['payment-status', 'payments', 'payment-corrections', 'payment-operations'].includes(parts[2])) return null
  const month = parseMonth(parts[1])
  const token = request.headers.get('x-household-session')
  const session = token ? await getSession(env.DB, token) : null
  if (!session || !(Date.parse(session.expiresAt) > runtime.now().getTime())) {
    throw new HttpError('ログインし直してください。', 401)
  }
  if (parts.length === 3 && request.method === 'GET' && parts[2] === 'payment-status') {
    return json({ data: await getPaymentStatus(env.DB, month) })
  }
  if (parts.length === 4 && request.method === 'GET' && parts[2] === 'payment-operations') {
    if (!z.string().uuid().safeParse(parts[3]).success) throw new HttpError('操作IDが不正です。', 400)
    return json({ data: await getPaymentOperation(env.DB, month, parts[3]) })
  }
  if (parts.length === 3 && request.method === 'POST' && ['payments', 'payment-corrections'].includes(parts[2])) {
    const body = await readJson(request)
    if (!body || typeof body !== 'object' || !('month' in body) || body.month !== month) {
      throw new HttpError('対象の月が一致しません。', 400)
    }
    const actor = { person: session.person, authMethod: session.authMethod }
    const mutate = parts[2] === 'payments' ? recordPayment : correctPayment
    return json({ data: await mutate(env.DB, runtime, body, actor) })
  }
  return null
}
