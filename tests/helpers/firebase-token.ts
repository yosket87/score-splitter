import { importPKCS8, SignJWT } from 'jose'

// テスト専用の公開済み鍵。実環境では使用しない。
const privateKey = `-----BEGIN PRIVATE KEY-----
MIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQCo82Yg0HN/KESv
U2xXRW66s+zp1CTZilBeH6LUxySqSS4yDWDyt47UbIoVEnj1gEr2Lm04tev8mipP
9eApU+HNKqMMr0ZUT4f51JZveGFZuqGe64ElewumCSjyprIoyUIgyJqMNu0JTzrD
jAFYJnlKg6CtYLLewPHG5KOuAw8rsPFSUNObZqe3L1dOAK4HGwT3or7sKv/sAbvV
feqgoBc6i1okIIS28qowHmUiw7t3oNiqPUGagEIhD+1lkvV966XzaTAby80s2QJf
eo4/zvYpvuh8qz8Xa4Hugk70wuE30S2onh3tm52OCA3Ya0zL9W+3Lc/Voj/nYuDB
YiETOI7nAgMBAAECggEAC8C61weJMUxM0uF7xOpolIZVscJ3OcbcZl/PBPxBebMT
ipnRp7DLN83BIUwiq/lbvZpnMK2/F9hlnyBckqNqLsqLgyNiQhUyQVffiyuVohdQ
jOyXFFNl8QvsFE0yUZIGjp9F2QEtJhuj29yOb2Jlx6A2ejki2EoVx586H63IzWIp
rAeXYxw+bIa9i5KmDxXj2DkR6bTFf7ldm10+Xe5h892xt04/5WmRQwkE3nJKj2Pa
+73srCglk/QcBBO+QqWktbM+wgqjxk0cCPOFEzQhUHQRCldga6l1P30JJDfzkgvY
c8UF8FdDJlViHFath8uizmzTx7wvJ37na/15Y8wTaQKBgQDi5Nn7EBdNEEN8cLQi
eRb3MSrqYZINK2P//4EWBxHg5DrNaUH5EEEg0Gw0/niPbyYdujeAAZ9jqxhndNSs
ZN1+gz7YiUdA0Nw6XFyQdoLgptBJKflK0bfp2Cpp5QAGw8/bIlaDPQwk6N2ALWh0
FNHmxeNinhDUNExf7+yXFjgCjQKBgQC+n7TCRLDOHWTqg3GgZv4bBV0mbK+Q9nli
Zl1Q2xmIljx4dXdwGWMqcSTND/UW8AeYpqLZHt5pxRqCDi5KiTKTvMKaNZ5x6iwn
v8JK5kKtbYQ90bBlMW/vaF3Pw/MoDmbRgd+DemsAKgy2HRGtnqWbW3CZUkx4sFVJ
WGZbQQh0QwKBgCAeHxEgBPxeqf7qgUVD+NFC/30wFJmSo9QwGdjBZXF9PSmolbMo
7t8zQa36u5wqMq4QlxyinipgpNK4QgapPIVVFMdYH2L4bcRBIMU+UWZ1lpRUwboq
l6sdc1uMFAXhIAI4CSEIujhbUkd7pgaQj+nn5zklgOJZCNqnvsjgV0tdAoGARLDI
MjkOfTeaZed3ypVSe+oy5uXDXjlzBEJe3gQV72Iz6DRsFbkQQvsCh+J4LwvPsPJb
PGIjQ3oDU1pI1BMcZqBef7NSpTn9L1WqbdMLs/MC9EPbjJuD+oFhTL0Poh+ObXCf
WoGCjUyZyAYxmJ7Sjmkk6hr983+XPBbey4NjyIECgYA2RHZ0AZJcUbtY2iYFmNIQ
mmPB08O2zTPkX7UX3YWYtOtS22H5kPp9P/gcFYXmEqlkH2eh/1e1Pc88n2IQhxwb
74QVP9gkwKkRk4FXLrSvSDyUHgrD7RbwKn6QoWKpqxshrnOl4OCYycRzGyAhFZEl
siJHXwrm0HRBrhKVqoBKQQ==
-----END PRIVATE KEY-----
`
export const firebaseCertificate = `-----BEGIN CERTIFICATE-----
MIIDGzCCAgOgAwIBAgIUanX15/+pmHe9QgKN8L+UMP3AxLUwDQYJKoZIhvcNAQEL
BQAwHTEbMBkGA1UEAwwSZmlyZWJhc2UtdGVzdC1vbmx5MB4XDTI2MDkwNzAxMjEw
OFoXDTM2MDkwNDAxMjEwOFowHTEbMBkGA1UEAwwSZmlyZWJhc2UtdGVzdC1vbmx5
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAqPNmINBzfyhEr1NsV0Vu
urPs6dQk2YpQXh+i1MckqkkuMg1g8reO1GyKFRJ49YBK9i5tOLXr/JoqT/XgKVPh
zSqjDK9GVE+H+dSWb3hhWbqhnuuBJXsLpgko8qayKMlCIMiajDbtCU86w4wBWCZ5
SoOgrWCy3sDxxuSjrgMPK7DxUlDTm2anty9XTgCuBxsE96K+7Cr/7AG71X3qoKAX
OotaJCCEtvKqMB5lIsO7d6DYqj1BmoBCIQ/tZZL1feul82kwG8vNLNkCX3qOP872
Kb7ofKs/F2uB7oJO9MLhN9EtqJ4d7ZudjggN2GtMy/Vvty3P1aI/52LgwWIhEziO
5wIDAQABo1MwUTAdBgNVHQ4EFgQULi1Fe2bYxxHKeET0FN8M/t1lCrowHwYDVR0j
BBgwFoAULi1Fe2bYxxHKeET0FN8M/t1lCrowDwYDVR0TAQH/BAUwAwEB/zANBgkq
hkiG9w0BAQsFAAOCAQEAEUk2mp4dRbezlC35C3x0gCw8GGyRbL1pbUn+Ky+7/Ku9
wJAKDD0HCaz0glvicPi+aG5Mun5+8ew4QZYn1RBHOC4S9l9d7+LjX/xa9NolSGPp
kwe5faL/yFHFFOFcTfg0ECA9XOdXdFkzTwYwpuN7Qpgb0/VWuzgCkiSxWltYQHsu
qatxVRx8CPhY31aTPcEpaCNr9KypCnZ6Aa4ymAKP/e0Ni8vUxfYJbeAf4uG/yTeI
aw1wutQsNt+gyt+AEh1D+A+oAECy550UButYJfBR6ffiAxxCQlxZ/6ZyF6+C7HYt
eGZiYqr5giml6+q6ClxnblHqICvGIpzXEtfUJwP43Q==
-----END CERTIFICATE-----
`

export const firebaseFixtureConfig = { projectId: 'fixture-project', apiKey: 'fixture-public-api-key' }
export const firebaseFixtureNow = 1800000000
export async function createFirebaseTokenFixture(options: {
  claims?: Record<string, unknown>; header?: Record<string, unknown>; invalidSignature?: boolean
} = {}) {
  const key = await importPKCS8(privateKey, 'RS256')
  const claims = {
    iss: `https://securetoken.google.com/${firebaseFixtureConfig.projectId}`,
    aud: firebaseFixtureConfig.projectId, sub: 'firebase-uid-123',
    iat: firebaseFixtureNow - 10, exp: firebaseFixtureNow + 3600, auth_time: firebaseFixtureNow - 20,
    firebase: { sign_in_provider: 'google.com' }, email: 'person@example.com', email_verified: true, ...options.claims,
  }
  let token = await new SignJWT(claims).setProtectedHeader({ alg: 'RS256', kid: 'fixture-key' }).sign(key)
  if (options.header) {
    const parts = token.split('.')
    parts[0] = btoa(JSON.stringify({ alg: 'RS256', kid: 'fixture-key', ...options.header }))
      .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
    token = parts.join('.')
  }
  if (options.invalidSignature) {
    const parts = token.split('.')
    parts[2] = (parts[2][0] === 'A' ? 'B' : 'A') + parts[2].slice(1)
    token = parts.join('.')
  }
  return token
}
export function createFirebaseFixtureFetch(options: {
  lookup?: unknown; certificates?: unknown; cacheControl?: string; age?: string
} = {}) {
  const requests: { url: string; init?: RequestInit }[] = []
  const fetcher: typeof fetch = async (input, init) => {
    const url = String(input)
    requests.push({ url, init })
    if (url === 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com') {
      return Response.json(options.certificates ?? { 'fixture-key': firebaseCertificate }, {
        headers: { 'cache-control': options.cacheControl ?? 'public, max-age=3600', age: options.age ?? '0' },
      })
    }
    if (url !== `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${firebaseFixtureConfig.apiKey}`) {
      throw new Error('予期しない通信先')
    }
    return Response.json(options.lookup ?? { users: [{ localId: 'firebase-uid-123', validSince: '0' }] })
  }
  return { fetch: fetcher, requests }
}
