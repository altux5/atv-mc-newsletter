import * as client from 'openid-client'
import type { LocalOidc } from './localAuth.js'

export function createLocalOidc(clientId: string, request?: client.CustomFetch): LocalOidc {
  let configuration: Promise<client.Configuration> | undefined
  const getConfiguration = () => {
    configuration ??= client.discovery(new URL('https://sso.infineon.com'), clientId, undefined, client.None(), {
      timeout: 10,
      ...(request ? { [client.customFetch]: request } : {}),
    }).catch((error: unknown) => { configuration = undefined; throw error })
    return configuration
  }
  return {
    authorize: async (attempt) => {
      const config = await getConfiguration()
      return client.buildAuthorizationUrl(config, {
        redirect_uri: attempt.redirectUri,
        scope: 'openid email profile',
        code_challenge: await client.calculatePKCECodeChallenge(attempt.verifier),
        code_challenge_method: 'S256',
        state: attempt.state,
        nonce: attempt.nonce,
      }).href
    },
    authenticate: async (callback, attempt) => {
      const config = await getConfiguration()
      if (`${callback.origin}${callback.pathname}` !== attempt.redirectUri) throw new Error('Unexpected callback URL')
      const tokens = await client.authorizationCodeGrant(config, callback, {
        expectedState: attempt.state,
        expectedNonce: attempt.nonce,
        pkceCodeVerifier: attempt.verifier,
        idTokenExpected: true,
      })
      const claims = tokens.claims()
      if (!claims?.sub) throw new Error('Missing subject')
      const info = await client.fetchUserInfo(config, tokens.access_token, claims.sub)
      if (typeof info.email !== 'string' || info.email_verified === false) throw new Error('Corporate email unavailable')
      return {
        email: info.email.trim().toLowerCase(),
        name: typeof info.name === 'string' ? info.name : undefined,
        preferred_username: typeof info.preferred_username === 'string' ? info.preferred_username : undefined,
      }
    },
  }
}