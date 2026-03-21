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

Firebase Auth email templates are per-project only — all apps in the same Firebase project share one template. To support per-app branding, password reset emails are sent via a Cloud Function instead of the Firebase client SDK.

**Flow:**

1. User submits email on the password reset page
2. Frontend calls the `sendPasswordResetEmail` Cloud Function with `{ email, appId }`
3. Cloud Function calls `admin.auth().generatePasswordResetLink(email, actionCodeSettings)` to generate a secure reset link
4. Cloud Function selects the branded HTML template for the given `appId`
5. Cloud Function sends the email via the configured email service
6. The reset link's `continueUrl` points back to the correct app domain

### Cloud Function

- Location: `apps/functions/src/auth/index.ts`
- Name: `sendPasswordResetEmail`
- AppCheck: enforced
- Auth: public (user is logged out when requesting a reset)
- Input: `{ email: string, appId: string }`

### Email templates

- Location: `apps/functions/src/auth/email-templates/`
- One HTML file per app (e.g. `seeclub.html`, `bkaiser.html`)
- Fallback to a generic template for unknown `appId` values
- Known `appId` values: `seeclub`, `bkaiser`, `p13`, `kwa`, `silcrest7`

### Configuration

- Email service API key / SMTP credentials stored in GCP Secret Manager
- `appId` is defined in each app's `environment.ts` and typed in `BkEnvironment`
- `actionCodeSettings.url` is the app's login URL (e.g. `https://seeclub.org/login`)

### Frontend

- `AuthService.resetPassword()` in `libs/auth/data-access/src/lib/auth.service.ts`
- Calls `httpsCallable('sendPasswordResetEmail')` instead of Firebase SDK `sendPasswordResetEmail()`
- Passes `{ email, appId }` where `appId` comes from `environment.appId`

### Deployment

Before deploying, add the Mailgun SMTP password via the Firebase CLI (stores it in GCP Secret Manager):

```sh
firebase functions:secrets:set MAILGUN_SMTP_PASSWORD
# prompts for the value interactively — nothing is echoed to the terminal
```

Then deploy:

```sh
pnpm run deploy:functions
pnpm nx build scs-app --configuration production && firebase deploy --only hosting:scs-app-54aef
```

### Custom sender domain

- From address: `noreply@seeclub.org` (validated custom domain in Firebase Console)
- SPF: `include:_spf.firebasemail.com` ✓
- DKIM: `firebase1._domainkey.seeclub.org`, `firebase2._domainkey.seeclub.org` ✓
- DMARC: `p=REJECT` ✓
