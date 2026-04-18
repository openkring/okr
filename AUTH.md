# Authentication Policy

## Session Persistence

Firebase Auth is initialized with `[indexedDBLocalPersistence, browserLocalPersistence]` (IndexedDB preferred, localStorage as fallback). Both are "local" persistence — the auth token survives browser restarts and tab closures.

**Result: users stay logged in permanently on their device.**

## When a user must re-login

- They explicitly sign out
- They clear browser storage (cookies / localStorage / IndexedDB)
- They use a private/incognito window (each session starts fresh)
- Firebase revokes the refresh token:
  - Password reset
  - Account disabled
  - Manual session revocation in Firebase Console

## Token lifetime

Firebase refresh tokens have no expiration by default. There is no configured idle timeout or maximum session duration.

## Implementation

- Auth initialization: `libs/shared/config/src/lib/auth.ts` (`authFactory`)
- Auth service login: `libs/auth/data-access/src/lib/auth.service.ts`
- Auth method: email and password only (no OAuth popup/redirect flows)
- `browserPopupRedirectResolver` is intentionally omitted to prevent the Firebase auth cross-domain iframe (`authIframe.js`) from loading reCAPTCHA on every page.

---

## Password Reset Email

### Architecture

Firebase Auth email templates are per-project only — all apps in the same Firebase project share one template. To support per-app branding, password reset emails are sent via a Cloud Function instead of the Firebase client SDK. The reset link points to a custom in-app page (not Firebase's default UI) to avoid spam flags and provide a consistent UX.

**Flow:**

1. User enters their email on `/auth/pwdreset`
2. Frontend calls the `sendEmail` Cloud Function with `{ to, appId, provider: 'mailtrap_api', template: 'scs_password_reset' }`
3. Cloud Function calls `admin.auth().generatePasswordResetLink(email, { url: continueUrl })` to generate a secure one-time code
4. Cloud Function sends a branded email via Mailtrap API using the `scs_password_reset` template, with `{{ url }}` and `{{ email }}` as template variables
5. User clicks the link in the email → lands on `/auth/confirm?oobCode=XXX&continueUrl=/auth/login`
6. User enters a new password; frontend calls `confirmPasswordReset(auth, oobCode, newPassword)` directly
7. On success → redirect to `/auth/login`

### Cloud Function

- Location: `apps/functions/src/auth/index.ts`
- Name: `sendEmail`
- AppCheck: enforced
- Auth: not required for `template === 'scs_password_reset'` (user is logged out when requesting a reset)
- Input: `{ to: string[], appId: string, provider: string, template: string }`
- Per-app config (from, continueUrl, appName): `apps/functions/src/auth/email-templates.ts`

### Email sending

- Provider: Mailtrap API (`mailtrap_api`)
- Template name: `scs_password_reset` — UUID configured in `apps/functions/src/auth/email-transport.ts` → `MAILTRAP_TEMPLATE_UUIDS`
- Template variables: `{{ url }}` (reset link), `{{ email }}` (recipient), `{{ app_name }}`
- Fallback html (for SMTP providers): plain text link

### Custom action URL (anti-spam)

The Firebase action URL uses the app's custom domain instead of `firebaseapp.com` to avoid spam filters:

- Set in: Firebase Console → Authentication → Templates → Password reset → Customize action URL
- Value: `https://seeclub.org/__/auth/action` (routes through Firebase Hosting on custom domain)

### Custom confirm page

A custom Angular page handles the `oobCode` from the reset link, replacing Firebase's default hosted UI:

- Route: `/auth/confirm?oobCode=XXX&continueUrl=/auth/login`
- Component: `libs/auth/feature/src/lib/confirm-password-reset.page.ts`
- Shows a new-password form; calls `confirmPasswordReset(auth, oobCode, newPassword)` on submit
- On success: shows confirmation toast and redirects to `continueUrl`
- On invalid/expired code: shows error message

To make email links go directly to this page instead of `/__/auth/action`, update the Firebase Console action URL to `https://seeclub.org/auth/confirm`.

### Frontend

- `AuthService.resetPassword()` — calls `sendEmail` CF; in `libs/auth/data-access/src/lib/auth.service.ts`
- `AuthService.confirmPasswordReset()` — calls Firebase `confirmPasswordReset()`; same file

### Deployment

Before deploying, set all required secrets:

```sh
firebase functions:secrets:set MAILGUN_SMTP_PASSWORD
firebase functions:secrets:set MAILTRAP_APIKEY
firebase functions:secrets:set NETZONE_SMTP_PASSWORD
firebase functions:secrets:set MAILTRAP_TEST_USER
firebase functions:secrets:set MAILTRAP_TEST_PASS
```

Then deploy:

```sh
pnpm run deploy:functions
pnpm nx build scs-app --configuration production && firebase deploy --only hosting:scs-app-54aef
```

---

## CORS Setup (Cloud Functions)

### Allowed origins

CORS is configured in `apps/functions/src/main.ts` using the `cors` Express middleware. The following origins are whitelisted:

| Origin | Purpose |
| --- | --- |
| `http://localhost:4200` | Local dev (default app port) |
| `http://localhost:4201` | Local dev (alternate port, e.g. second app) |
| `https://scs-app-54aef.web.app` | Firebase Hosting (scs-app) |
| `https://scs-app-54aef.firebaseapp.com` | Firebase Hosting (scs-app, legacy domain) |
| `https://bkaiser-org.web.app` | Firebase Hosting (bkaiser-org) |
| `https://bkaiser-org.firebaseapp.com` | Firebase Hosting (bkaiser-org, legacy domain) |
| `https://seeclub.org` | Production (seeclub) |
| `https://bkaiser.ch` | Production (bkaiser.ch) |
| `https://bkaiser.com` | Production (bkaiser.com) |
| `https://bkaiser.org` | Production (bkaiser.org) |
| `https://p13.ch` | Production (p13.ch) |
| `https://kwa.ch` | Production (kwa.ch) |
| `https://silcrest7.ch` | Production (silcrest7.ch) |

### How callable functions handle CORS

Firebase `onCall` functions (used for all Bexio, Auth, Matrix, etc. integrations) handle CORS automatically when called via the Firebase SDK (`httpsCallable`). The Express-level CORS middleware covers any additional HTTP endpoints (`onRequest`).

### Diagnosing "No Access-Control-Allow-Origin" errors

A CORS error on an `onCall` function almost always means one of:

1. **Function not deployed** — the URL returns a 404 without any CORS headers. Deploy with `firebase deploy --only functions:<name>`.
2. **AppCheck rejection** — `enforceAppCheck: true` causes the function to reject the preflight before setting CORS headers if the AppCheck token is missing or invalid (common in local dev against production).
3. **Wrong origin** — the calling origin is not in the Express CORS allowlist above (only relevant for `onRequest` functions).

### Adding a new allowed origin

Edit the `origin` array in `apps/functions/src/main.ts`, then redeploy all functions:

```sh
firebase deploy --only functions
```

---

## Passkey Authentication (Future Consideration)

Firebase Auth supports passkeys natively since late 2024 via `signInWithPasskey()` and `linkWithPasskey()` in the JS SDK (thin WebAuthn wrapper). On web, the implementation effort is moderate. The Capacitor/Ionic mobile setup adds significant complexity.

### Challenges in this stack

- **Capacitor WebView**: WebAuthn is not available out of the box. Native plugins are required (`@capawesome-team/capacitor-android-fido2` for Android, `ASAuthorizationPasskeyRequest` for iOS via a custom Capacitor bridge).
- **App association files**: `/.well-known/apple-app-site-association` (iOS) and `/.well-known/assetlinks.json` (Android) must be served from the production domain — requires `firebase.json` rewrite entries.
- **RPID**: The Relying Party ID must match the production domain (`seeclub.org`) exactly.
- **Fallback**: Email/password must remain as fallback — both auth flows must coexist.

### Effort estimate

| Scope | Effort |
| --- | --- |
| Web-only passkey login | ~2–3 days |
| Web + Android + iOS (Capacitor) | ~2–3 weeks |
| Full passkey + password fallback + enrollment UX | add ~1 week |

### Recommendation

Feasible for web-only usage. For mobile (Capacitor), defer until the native tooling matures.

---

### Custom sender domain

- From address: `app@seeclub.org` (Mailgun custom domain)
- SPF/DKIM/DMARC configured on `seeclub.org` for `mail.seeclub.org` via Mailgun ✓
