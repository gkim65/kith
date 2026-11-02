// Google sign-in (Google Identity Services token model) and authorised requests to Google APIs.

/** OAuth client id (the same Google Cloud project as the PhD hours tracker). */
const CLIENT_ID = '324129188941-3lg1bpmhnu117761vv4binpah9sgtict.apps.googleusercontent.com';

/** Access only to files Kith itself creates in the user's Drive. */
const SCOPES = 'https://www.googleapis.com/auth/drive.file';

let tokenClient = null;
let token = null;
let expiresAt = 0;

/** Thrown when a request needs (re)connecting to Google first. */
export class AuthError extends Error {}

/**
 * loadGoogle() -> Promise<void>
 *
 * Load the Google Identity Services script once and prepare the token client.
 *
 * Resolves when sign-in is ready; rejects if the script cannot load (e.g. offline).
 */
export function loadGoogle() {
  if (loadGoogle.ready) return loadGoogle.ready;
  loadGoogle.ready = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => {
      tokenClient = window.google.accounts.oauth2.initTokenClient({ client_id: CLIENT_ID, scope: SCOPES, callback: () => {} });
      resolve();
    };
    s.onerror = () => { loadGoogle.ready = null; reject(new Error('could not load Google sign-in')); };
    document.head.appendChild(s);
  });
  return loadGoogle.ready;
}

/**
 * connect() -> Promise<void>
 *
 * Ask Google for an access token (opens Google's sign-in popup). Call from a click.
 *
 * Resolves once a token is held; rejects if the popup is closed or access is refused.
 */
export async function connect() {
  await loadGoogle();
  await new Promise((resolve, reject) => {
    tokenClient.callback = (resp) => {
      if (resp.error) { reject(new AuthError(resp.error)); return; }
      token = resp.access_token;
      expiresAt = Date.now() + Number(resp.expires_in || 3600) * 1000;
      resolve();
    };
    tokenClient.error_callback = (err) => reject(new AuthError(err?.type || 'popup closed'));
    tokenClient.requestAccessToken({ prompt: '' });
  });
}

/**
 * isConnected() -> boolean
 *
 * Whether a usable access token is held (with a minute to spare before it expires).
 */
export function isConnected() {
  return !!token && Date.now() < expiresAt - 60 * 1000;
}

/**
 * disconnect()
 *
 * Revoke and forget the access token. Data in this browser is left alone.
 */
export function disconnect() {
  if (token && window.google?.accounts?.oauth2) window.google.accounts.oauth2.revoke(token, () => {});
  token = null;
  expiresAt = 0;
}

/**
 * gfetch(url, options) -> Promise<object|null>
 *
 * Send an authorised request to a Google API and parse the JSON reply.
 *
 *   - `url`     — full API URL
 *   - `options` — fetch options; a JSON `body` string gets the JSON content type
 *
 * Returns the parsed reply (null for an empty reply). Throws `AuthError` when not connected or the
 * token was rejected, and an Error carrying `.status` for any other failed reply.
 */
export async function gfetch(url, options = {}) {
  if (!isConnected()) throw new AuthError('not connected');
  const res = await fetch(url, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, ...(options.body ? { 'Content-Type': 'application/json' } : {}) },
  });
  if (res.status === 401) { token = null; throw new AuthError('token rejected'); }
  if (!res.ok) {
    const err = new Error(`Google API ${res.status}: ${(await res.text()).slice(0, 300)}`);
    err.status = res.status;
    throw err;
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}
