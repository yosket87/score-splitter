import { http } from 'msw'
import { mockGoogleFetch } from './google-provider'
export const googleProviderHandlers = [
  http.post('https://oauth2.googleapis.com/token', ({ request }) => mockGoogleFetch(request)),
  http.get('https://www.googleapis.com/oauth2/v3/certs', ({ request }) => mockGoogleFetch(request)),
]
