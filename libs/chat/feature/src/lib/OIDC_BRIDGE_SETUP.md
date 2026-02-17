# Matrix OIDC Bridge Setup

This OIDC bridge allows Matrix to authenticate users via Firebase Auth, supporting all Firebase authentication methods (email, phone, Google OAuth, etc.).

## Architecture

```
Matrix → OIDC Bridge (Cloud Functions) → Firebase Auth → User
```

1. Matrix redirects to OIDC bridge `/oidcAuthorize`
2. Bridge shows Firebase Auth UI (email, phone, Google, etc.)
3. User authenticates with their preferred method
4. Bridge generates authorization code
5. Matrix exchanges code for access/ID tokens at `/oidcToken`
6. Matrix validates tokens and creates session

## Deployment

### 1. Deploy Cloud Functions

```bash
nx build functions
firebase deploy --only functions
```

This deploys:
- `oidcDiscovery` - OIDC discovery document at `/.well-known/openid-configuration`
- `oidcAuthorize` - Authorization endpoint
- `oidcCallback` - Callback handler after Firebase Auth
- `oidcExchange` - Exchange Firebase token for auth code
- `oidcToken` - Token endpoint
- `oidcUserInfo` - UserInfo endpoint

### 2. Get Function URL

After deployment, get the base URL for your functions:

```bash
firebase functions:config:get
```

The URL format will be:
```
https://europe-west6-bkaiser-org.cloudfunctions.net
```

### 3. Configure Matrix Synapse

Update your Matrix homeserver.yaml:

```yaml
oidc_providers:
  - idp_id: firebase
    idp_name: "Sign in with Firebase"
    idp_icon: "mxc://example.com/firebase-icon"
    
    discover: false  # We'll provide endpoints manually
    
    issuer: "https://europe-west6-bkaiser-org.cloudfunctions.net/oidcDiscovery"
    
    client_id: "bkaiser-org"  # Your Firebase project ID
    client_secret: "YOUR_SECRET_HERE"  # Generate a secret for Matrix
    
    authorization_endpoint: "https://europe-west6-bkaiser-org.cloudfunctions.net/oidcAuthorize"
    token_endpoint: "https://europe-west6-bkaiser-org.cloudfunctions.net/oidcToken"
    userinfo_endpoint: "https://europe-west6-bkaiser-org.cloudfunctions.net/oidcUserInfo"
    jwks_uri: "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"
    
    scopes: ["openid", "profile", "email"]
    
    user_mapping_provider:
      config:
        localpart_template: "{{ user.email.split('@')[0] }}"
        display_name_template: "{{ user.name }}"
        email_template: "{{ user.email }}"
    
    allow_existing_users: true
    enable_registration: true

# At root level
enable_registration: true
```

### 4. Test the Flow

1. Navigate to your Matrix homeserver in a browser
2. Click "Sign in with a different method"
3. Choose "Sign in with Firebase"
4. You'll see the Firebase Auth UI with options for:
   - Email/password
   - Phone number
   - Google account
5. Sign in with your preferred method
6. You'll be redirected back to Matrix with a session

## Security Considerations

### Current Implementation Status

⚠️ **This is a prototype implementation. Before production use:**

1. **Implement proper JWT signing** for ID tokens
   - Currently using base64-encoded JSON (NOT SECURE)
   - Need to implement RS256 signing with private/public key pair
   - Store private key securely in Cloud Secret Manager

2. **Use persistent storage for tokens**
   - Currently using in-memory Map (lost on function restart)
   - Migrate to Firestore for token storage
   - Implement proper expiration and cleanup

3. **Add client_secret validation**
   - Generate a secure client secret
   - Store in Firebase Functions config or Secret Manager
   - Validate on token endpoint

4. **Implement rate limiting**
   - Add rate limiting to prevent abuse
   - Use Firebase Extensions or Cloud Run

5. **Add PKCE support** (optional but recommended)
   - Adds extra security for authorization code flow

## Environment Variables

Add these to your Firebase Functions configuration:

```bash
firebase functions:config:set \
  oidc.client_secret="GENERATE_A_SECURE_SECRET" \
  oidc.issuer="https://europe-west6-bkaiser-org.cloudfunctions.net/oidcDiscovery"
```

Or use environment variables in functions:

```typescript
// In functions code
const CLIENT_SECRET = process.env.OIDC_CLIENT_SECRET || '';
```

## Troubleshooting

### Matrix shows "Invalid provider"
- Check that OIDC bridge functions are deployed
- Verify the URLs in homeserver.yaml match your function URLs
- Check Matrix logs: `journalctl -u matrix-synapse -f`

### Firebase Auth UI not loading
- Check browser console for CORS errors
- Verify Firebase config in oidcAuthorize function
- Ensure FirebaseUI CDN is accessible

### Token exchange fails
- Check that authorization code hasn't expired (5 min lifetime)
- Verify redirect_uri matches exactly
- Check Matrix synapse logs for detailed errors

### Users can't sign in with email
- Ensure Email/Password provider is enabled in Firebase Console
- Check that email verification is not required

## Next Steps

To make this production-ready:

1. [ ] Implement proper JWT signing for ID tokens
2. [ ] Migrate token storage to Firestore
3. [ ] Add client_secret validation
4. [ ] Add comprehensive error handling
5. [ ] Implement rate limiting
6. [ ] Add logging and monitoring
7. [ ] Create integration tests
8. [ ] Document recovery procedures
9. [ ] Set up alerts for failures
10. [ ] Add PKCE support

## Alternative: Simpler Token Exchange

If the full OIDC flow is too complex, consider a simpler approach:

1. Users authenticate with Firebase in the web app
2. App gets Firebase ID token
3. App calls a Cloud Function that:
   - Verifies Firebase token
   - Creates Matrix session via admin API
   - Returns Matrix credentials
4. App uses Matrix credentials directly

This avoids the OIDC complexity but requires the app to handle Matrix authentication directly.

See `ensureMatrixUser` function for an example.
