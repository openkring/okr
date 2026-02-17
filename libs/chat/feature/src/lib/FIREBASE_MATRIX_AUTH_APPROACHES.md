# Firebase Auth → Matrix: Two Implementation Approaches

You correctly pointed out that supporting only Google accounts is too limiting. Here are two approaches to allow **all Firebase auth methods** (email, phone, Google, etc.) with Matrix.

## The Challenge

Firebase Auth doesn't expose full OIDC provider endpoints (authorization_endpoint, token_endpoint) that Matrix expects. We found this by checking:

```bash
curl https://securetoken.google.com/bkaiser-org/.well-known/openid-configuration
```

Result: Only `issuer` and `jwks_uri` - missing the endpoints Matrix needs for native SSO.

## Approach 1: Simple Token Exchange ⭐ RECOMMENDED

**Implementation:** [apps/functions/src/matrix-simple/index.ts](./src/matrix-simple/index.ts)

### How It Works

```
User → Firebase Auth (email/phone/Google) → App gets ID token 
→ Cloud Function validates & creates Matrix session → Matrix credentials returned
```

### Flow

1. User authenticates with Firebase in your web app (any method)
2. App calls `getMatrixCredentials()` Cloud Function
3. Function validates Firebase token via `request.auth`
4. Function creates/updates Matrix user via Synapse admin API
5. Function returns Matrix access token + user ID
6. App initializes Matrix client directly with credentials

### Pros ✅

- **Simple** - ~150 lines of code vs ~700 for OIDC
- **Reliable** - Fewer moving parts, less can break
- **Supports ALL Firebase auth methods** - Email, phone, Google, etc.
- **No HTML/UI in Functions** - Cleaner architecture
- **Automatic user creation** - Uses Synapse admin API
- **Profile syncing** - Keeps Firebase & Matrix profiles in sync
- **Better UX** - No redirects, seamless experience

### Cons ❌

- Matrix doesn't handle auth natively (app does)
- Not using Matrix's SSO capabilities
- Need to manage token refresh in app
- Requires admin API access (MATRIX_ADMIN_TOKEN)

### Usage in Your App

```typescript
// In your Matrix store
async initializeMatrix(): Promise<void> {
  const user = store.currentUser();
  if (!user) return;

  // Call Cloud Function to get Matrix credentials
  const getMatrixCredentialsFn = httpsCallable(
    getFunctions(getApp()), 
    'getMatrixCredentials'
  );

  const result = await getMatrixCredentialsFn();
  const credentials = result.data as MatrixAuthResponse;

  // Initialize Matrix client with credentials
  const client = createClient({
    baseUrl: credentials.homeserverUrl,
    accessToken: credentials.accessToken,
    userId: credentials.userId,
    deviceId: credentials.deviceId,
  });

  // Start syncing
  await client.startClient({ initialSyncLimit: 10 });
}
```

### Setup

1. **Deploy functions:**
   ```bash
   nx build functions
   firebase deploy --only functions:getMatrixCredentials,functions:syncFirebaseProfileToMatrix
   ```

2. **Set admin token:**
   ```bash
   firebase functions:config:set matrix.admin_token="YOUR_MATRIX_ADMIN_TOKEN"
   ```

3. **Update your app code** to call `getMatrixCredentials()` after Firebase auth

---

## Approach 2: Full OIDC Bridge (Complex)

**Implementation:** [apps/functions/src/oidc-bridge/index.ts](./src/oidc-bridge/index.ts)  
**Setup Guide:** [OIDC_BRIDGE_SETUP.md](./OIDC_BRIDGE_SETUP.md)

### How It Works

```
Matrix → OIDC Bridge (Cloud Functions) → Firebase Auth UI 
→ User authenticates → Bridge issues OIDC tokens → Matrix validates
```

### Flow

1. Matrix redirects user to bridge `/oidcAuthorize`
2. Bridge shows Firebase Auth UI (email, phone, Google)
3. User authenticates with preferred method
4. Bridge redirects to `/oidcCallback` with auth code
5. Matrix calls `/oidcToken` to exchange code for tokens
6. Matrix validates tokens and creates session

### Pros ✅

- **Native Matrix SSO** - Uses Matrix's standard auth flow
- **Standard OIDC protocol** - Follows OAuth 2.0 specs
- **Supports all Firebase auth methods**
- **Matrix handles everything** - No app-side token management

### Cons ❌

- **Complex** - ~700 lines, HTML pages, state management
- **More failure points** - Redirects, token storage, JWT signing
- **Requires production hardening:**
  - ⚠️ Current JWT signing is NOT SECURE (base64, not RS256)
  - ⚠️ Token storage is in-memory (lost on restart)
  - ⚠️ No client_secret validation
  - ⚠️ No rate limiting
- **Harder to debug** - Multiple redirects and endpoints
- **URL routing complexity** - Functions URLs vs custom paths

### What's Needed for Production

Before using the OIDC bridge in production:

1. **Implement proper JWT signing** (RS256 with private key)
2. **Use Firestore** for persistent token storage
3. **Add client_secret validation**
4. **Implement rate limiting**
5. **Add comprehensive error handling**
6. **Set up monitoring and alerts**
7. **Add PKCE support** for extra security
8. **Test thoroughly** with all auth methods

Estimated effort: **2-4 days** for a secure production implementation.

---

## Comparison

| Feature | Simple Token Exchange | OIDC Bridge |
|---------|----------------------|-------------|
| **Complexity** | Low (~150 LOC) | High (~700 LOC) |
| **Setup Time** | 30 minutes | 2-4 days to production-ready |
| **Supports All Firebase Auth** | ✅ Yes | ✅ Yes |
| **Matrix Native SSO** | ❌ No | ✅ Yes |
| **Production Ready** | ✅ Yes | ⚠️ Prototype only |
| **Maintenance** | Low | High |
| **User Experience** | Seamless (no redirects) | Standard OAuth (redirects) |
| **Token Management** | App handles | Matrix handles |
| **Debugging** | Easy | Complex |
| **Security** | Secure (uses Firebase + admin API) | Needs hardening |

---

## Recommendation

**Use Approach 1 (Simple Token Exchange)** unless you specifically need Matrix's native SSO for regulatory/compliance reasons.

### Why?

1. **You're already in the app** - User has authenticated with Firebase
2. **Simpler = more reliable** - Fewer things to break
3. **Better UX** - No redirects or additional auth screens
4. **Production ready** - Secure out of the box
5. **Easier to maintain** - Less code, fewer dependencies
6. **Same auth options** - Both approaches support all Firebase methods

The OIDC bridge is academically correct (standard protocol), but practically overkill for your use case.

---

## Current Implementation

Your current setup uses **Google OAuth directly** as the OIDC provider for Matrix:

```yaml
# homeserver.yaml
oidc_providers:
  - idp_id: firebase  # Misleading name - actually Google OAuth
    issuer: https://accounts.google.com
    client_id: YOUR_GOOGLE_CLIENT_ID
    client_secret: YOUR_GOOGLE_CLIENT_SECRET
```

This works but only for users with Google accounts.

---

## Migration Path

### Option A: Switch to Simple Token Exchange (Recommended)

1. Remove OIDC config from `homeserver.yaml`
2. Deploy `getMatrixCredentials` function
3. Update [matrix-chat-section.store.ts](../../libs/cms/section/feature/src/lib/matrix-chat-section.store.ts):
   - Remove `initiateMatrixOidcLogin()` method
   - Remove `handleMatrixOidcCallback()` method
   - Update `initializeMatrix()` to call `getMatrixCredentials()`
4. Remove [matrix-oidc-callback.component.ts](../../libs/auth/feature/src/lib/matrix-oidc-callback.component.ts)
5. Test with email, phone, and Google auth

### Option B: Implement Full OIDC Bridge

1. Complete the security hardening tasks (see OIDC_BRIDGE_SETUP.md)
2. Deploy all OIDC bridge functions
3. Update Matrix homeserver.yaml with bridge URLs
4. Test thoroughly with all auth methods
5. Set up monitoring and alerts

---

## Next Steps

**Which approach would you like to use?**

1. **Simple Token Exchange** - I'll update your app code to use `getMatrixCredentials()`
2. **OIDC Bridge** - I'll help you harden it for production (requires JWT implementation, Firestore setup, etc.)
3. **Hybrid** - Keep current Google OIDC, add Simple Token Exchange for non-Google users

Let me know your preference and I'll implement it!
