import { z } from 'zod'
import { HttpError } from './http'
import type { D1DatabaseLike, D1PreparedStatementLike } from './d1'
export { randomSecret, hashSecret, expiresIn, opaque } from './google-auth-shared'
export const firebaseSecret = z.string().regex(/^[a-f0-9]{64}$/)
export const firebaseIdentitySchema = z.object({
  projectId: z.string().min(1).max(512), uid: z.string().min(1).max(128).regex(/^[^\u0000-\u001f\u007f]+$/),
  provider: z.enum(['google.com','apple.com']), email: z.string().email().nullable(),
  authTime: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  issuedAt: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER), expiresAt: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
})
export class FirebaseAuthError extends HttpError {
  constructor() { super('認証手続きを完了できません。もう一度ログインしてください。',401); this.name='FirebaseAuthError' }
}
export async function firebaseOperation<T>(operation:()=>Promise<T>):Promise<T> {
  try { return await operation() } catch { throw new FirebaseAuthError() }
}
export async function firebaseAtomic(db:D1DatabaseLike, statements:D1PreparedStatementLike[]) {
  const results=await db.batch(statements)
  if(results.some(result=>!result.success)) throw new FirebaseAuthError()
}
