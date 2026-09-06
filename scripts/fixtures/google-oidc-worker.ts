import { createGoogleAuthorizationRequest, GoogleOAuthError, verifyGoogleCallback } from '../../src/lib/auth/google-protocol'
import { createGoogleOidcFixture, googleCallbackUrl, googleFixtureConfig } from '../../tests/helpers/google-oidc'

const worker = {
  async fetch(): Promise<Response> {
    const attempt = await createGoogleAuthorizationRequest(googleFixtureConfig)
    const callback = googleCallbackUrl(attempt.state)
    const validFixture = await createGoogleOidcFixture(attempt)
    const validIdentity = await verifyGoogleCallback(googleFixtureConfig, callback, attempt, validFixture)
    const invalidFixture = await createGoogleOidcFixture(attempt, { invalidSignature: true })
    let invalidSignature = 'accepted'
    try {
      await verifyGoogleCallback(googleFixtureConfig, callback, attempt, invalidFixture)
    } catch (error) {
      if (!(error instanceof GoogleOAuthError)) throw error
      invalidSignature = error.code
    }
    return Response.json({ validIdentity, invalidSignature })
  },
}

export default worker
