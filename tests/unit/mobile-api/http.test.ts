import { describe, expect, it } from 'vitest'
import { bearerToken, readJson, MobileApiError, recordInput } from '@/lib/mobile-api/http'

describe('モバイルAPI入力境界', () => {
 it('CookieをBearerとして認証しない', () => {
  expect(() => bearerToken(new Request('https://app.test', { headers: { cookie: `household_session=${'a'.repeat(64)}` } }))).toThrow(MobileApiError)
 })
 it('Bearerを厳密に検証する', () => {
  expect(bearerToken(new Request('https://app.test', { headers: { authorization: `Bearer ${'a'.repeat(64)}` } }))).toBe('a'.repeat(64))
  expect(() => bearerToken(new Request('https://app.test', { headers: { authorization: 'Bearer expired' } }))).toThrow()
 })
 it('本文実測でサイズ超過を拒否する', async () => {
  await expect(readJson(new Request('https://app.test', { method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({value:'a'.repeat(21000)}) }))).rejects.toMatchObject({status:413})
 })
 it('不正JSONを拒否する', async () => {
  await expect(readJson(new Request('https://app.test',{method:'POST',headers:{'content-type':'application/json'},body:'{'}))).rejects.toMatchObject({status:400})
 })
 it('支出金額を負数へ変換し世帯注入を拒否する', () => {
  const input = {month:'202610',label:'食費',amount:100,person:'wife'}
  expect(recordInput('expense',input,true).amount).toBe(-100)
  expect(() => recordInput('income',{...input,householdId:'other'},true)).toThrow()
  expect(() => recordInput('income',{...input,amount:-1},true)).toThrow()
  expect(() => recordInput('income',{...input,month:'202613'},true)).toThrow()
 })
})
