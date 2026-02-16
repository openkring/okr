# Matrix Server Configuration for Firebase OIDC

This file contains the configuration needed for your Matrix Synapse homeserver (`bkchat.etke.host`) to integrate with Firebase Authentication using OpenID Connect (OIDC).

## Prerequisites

1. **Matrix Synapse server** running at `bkchat.etke.host`
2. **SSH/Admin access** to the Matrix server
3. **Firebase project** ID: `bkaiser-org`
4. **Matrix Admin Token** (generate one and store in Firebase secrets)

---

## Step 1: Configure Synapse for OIDC

Edit your Matrix Synapse configuration file (usually at `/etc/matrix-synapse/homeserver.yaml` or `/data/homeserver.yaml`):
-> /matrix/synapse/config/homeserver.yaml

### Add to `homeserver.yaml`:

```yaml
# OIDC Configuration for Firebase Authentication
oidc_providers:
  - idp_id: firebase
    idp_name: "Firebase"
    idp_brand: "firebase"
    
    # Use Firebase's well-known OIDC discovery endpoint
    discover: true
    issuer: "https://securetoken.google.com/bkaiser-org"
    
    # Your Firebase project configuration
    client_id: "bkaiser-org"  # Your Firebase project ID
    client_secret: "not_required_for_firebase"  # Firebase uses ID tokens, not client secrets
    
    # Authorization parameters
    client_auth_method: client_secret_post
    scopes: ["openid"]
    
    # User attribute mapping
    user_mapping_provider:
      config:
        # Use Firebase UID as the Matrix localpart
        localpart_template: "{{ user.sub }}"
        
        # Display name from Firebase
        display_name_template: "{{ user.name|default(user.email) }}"
        
        # Email from Firebase  
        email_template: "{{ user.email }}"
    
    # Allow automatic user registration on first login
    allow_existing_users: true
    
    # Optional: Require verified email
    # user_profile_method: "userinfo_endpoint"

# Enable registration via OIDC
enable_registration: true
```

### Alternative: Manual endpoint configuration

If auto-discovery doesn't work, use explicit endpoints:

```yaml
oidc_providers:
  - idp_id: firebase
    idp_name: "Firebase"
    discover: false
    
    issuer: "https://securetoken.google.com/bkaiser-org"
    client_id: "bkaiser-org"
    client_secret: "placeholder"
    
    # Explicit Firebase OIDC endpoints
    authorization_endpoint: "https://accounts.google.com/o/oauth2/v2/auth"
    token_endpoint: "https://oauth2.googleapis.com/token"
    userinfo_endpoint: "https://openidconnect.googleapis.com/v1/userinfo"
    jwks_uri: "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"
    
    scopes: ["openid", "profile", "email"]
    
    user_mapping_provider:
      config:
        subject_claim: "sub"
        localpart_template: "{{ user.sub }}"
        display_name_template: "{{ user.name }}"
        email_template: "{{ user.email }}"
```

---

## Step 2: Configure CORS and Security

Ensure your homeserver allows requests from your app domains:

```yaml
# In homeserver.yaml
public_baseurl: "https://bkchat.etke.host"

# Allow cross-origin requests from your app
web_client_location: "https://seeclub.org"

# Add your domains to trusted_third_party_id_servers if using identity server
# trusted_third_party_id_servers:
#   - matrix.org
```

---

## Step 3: Restart Synapse

After updating the configuration:

```bash
# For systemd
sudo systemctl restart matrix-synapse

# For Docker
docker restart matrix-synapse

# For docker-compose
docker-compose restart synapse
```

---

## Step 4: Verify OIDC Configuration

Test that OIDC is properly configured:

```bash
# Check if OIDC provider is listed
curl https://bkchat.etke.host/_matrix/client/v3/login

# Should include:
# {
#   "flows": [
#     {
#       "type": "m.login.sso",
#       "identity_providers": [
#         {
#           "id": "firebase",
#           "name": "Firebase"
#         }
#       ]
#     }
#   ]
# }
```

---

## Step 5: Generate Matrix Admin Token

You need an admin token for room management operations:

```bash
# Method 1: Using synapse admin API
# Register an admin user
register_new_matrix_user -c /path/to/homeserver.yaml https://bkchat.etke.host

# Method 2: Using existing admin user
curl -X POST https://bkchat.etke.host/_matrix/client/v3/login \
  -H "Content-Type: application/json" \
  -d '{
    "type": "m.login.password",
    "identifier": {
      "type": "m.id.user",
      "user": "admin"
    },
    "password": "your-admin-password"
  }'

# Save the access_token from response
```

---

## Step 6: Store Admin Token in Firebase

```bash
# Set the secret in Firebase
firebase functions:secrets:set MATRIX_ADMIN_TOKEN

# When prompted, enter the admin access token from previous step
```

---

## Step 7: Configure Firebase Auth Redirect URIs

In Firebase Console:

1. Go to **Authentication** > **Settings** > **Authorized domains**
2. Add: `bkchat.etke.host`
3. Go to **Authentication** > **Sign-in method** > **Authorized redirect URIs**
4. Add: 
   - `https://bkchat.etke.host/_synapse/client/oidc/callback`
   - `https://seeclub.org/auth/matrix-callback`

---

## Step 8: Update Application Environment

Update your Angular app's environment files:

```typescript
// apps/scs-app/src/environments/environment.ts
export const environment = {
  // ... existing config
  services: {
    // ... existing services
    matrixHomeserver: 'https://bkchat.etke.host'
  }
};
```

---

## Step 9: Deploy Cloud Functions

```bash
cd /Users/bruno/proj/bkaiser/bk2

# Deploy the Matrix functions
nx build functions
firebase deploy --only functions:getMatrixOidcConfig,functions:ensureMatrixUser,functions:ensureGroupRoom,functions:syncUserProfileToMatrix
```

---

## Step 10: Test the Integration

1. **Start your app**: `nx serve scs-app`
2. **Login with Firebase** credentials
3. **Navigate to a chat section** - should trigger OIDC flow
4. **You'll be redirected to** Matrix SSO endpoint
5. **Matrix redirects to** Firebase for authentication
6. **Firebase redirects back** with authentication
7. **Matrix creates/logs in** the user
8. **App receives** Matrix access token

---

## Troubleshooting

### OIDC Not Working

Check Synapse logs:
```bash
# For systemd
sudo journalctl -u matrix-synapse -f

# For Docker
docker logs -f matrix-synapse
```

Common issues:
- **Invalid issuer**: Ensure `issuer` matches Firebase project
- **CORS errors**: Add your app domain to allowed origins
- **Token validation fails**: Verify `jwks_uri` is accessible

### Test OIDC Flow Manually

```bash
# 1. Get Firebase ID token
# From browser console:
firebase.auth().currentUser.getIdToken().then(console.log)

# 2. Initiate Matrix login
curl -X POST https://bkchat.etke.host/_matrix/client/v3/login \
  -H "Content-Type: application/json" \
  -d '{
    "type": "m.login.sso",
    "device_display_name": "Test Device"
  }'

# 3. Follow the redirect URL
```

### Debug Mode

Enable debug logging in Synapse:

```yaml
# homeserver.yaml
loggers:
  synapse.handlers.oidc:
    level: DEBUG
```

---

## Security Considerations

1. **Use HTTPS** for all endpoints
2. **Validate redirect URIs** in both Firebase and Matrix
3. **Rotate admin tokens** regularly
4. **Monitor failed login attempts**
5. **Set up rate limiting** in Synapse
6. **Enable 2FA** for admin accounts

---

## Next Steps

After OIDC is working:

1. **Implement automatic room creation** for groups
2. **Sync user profiles** from Firebase to Matrix
3. **Set up push notifications** via FCM
4. **Add E2E encryption** (optional)
5. **Monitor performance** and optimize

---

## Resources

- [Synapse OIDC Documentation](https://matrix-org.github.io/synapse/latest/openid.html)
- [Firebase Authentication](https://firebase.google.com/docs/auth)
- [Matrix Client-Server API](https://spec.matrix.org/latest/client-server-api/)
- [OIDC Specification](https://openid.net/specs/openid-connect-core-1_0.html)
