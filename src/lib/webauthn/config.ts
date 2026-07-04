export function getWebAuthnConfig() {
  const rpID = process.env.WEBAUTHN_RP_ID
  const origin = process.env.WEBAUTHN_RP_ORIGIN

  if (!rpID || !origin) {
    throw new Error('WEBAUTHN_RP_ID と WEBAUTHN_RP_ORIGIN の環境変数が必要です')
  }

  return {
    rpID,
    rpName: process.env.WEBAUTHN_RP_NAME ?? 'Score Splitter',
    origin,
  }
}
