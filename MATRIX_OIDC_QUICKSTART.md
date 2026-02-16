# Matrix OIDC Integration - Quick Start Guide

This guide will help you set up Matrix chat with Firebase OIDC authentication.

## 🎯 What You Need

- ✅ Matrix dependencies installed (`matrix-js-sdk`, `@angular/cdk`)
- ✅ Matrix homeserver at `bkchat.etke.host` (or your domain)
- ✅ Admin access to the Matrix server
- ✅ Firebase project `bkaiser-org`

## 📋 Implementation Checklist

### Phase 1: Matrix Server Configuration (15-30 minutes)

1. **Configure Synapse for OIDC**
   - [x] SSH into your Matrix server
   - [x] Edit `/etc/matrix-synapse/homeserver.yaml`. -> /matrix/synapse/config/homeserver.yaml
   - [x] Add Firebase OIDC provider configuration (see MATRIX_OIDC_SETUP.md)
   - [x] Restart Synapse: `sudo systemctl restart matrix-synapse`

Systemd is managing the docker container, restart it after config changes with:
systemctl restart matrix-synapse
journalctl -u matrix-synapse -f   # Watch it start successfully

2. **Verify OIDC Setup**
   ```bash
   curl https://bkchat.etke.host/_matrix/client/v3/login
   # Should show "m.login.sso" with Firebase provider
   ```

3. **Generate Admin Token**
   ```bash
   # Create admin user if needed
   register_new_matrix_user -c /path/to/homeserver.yaml https://bkchat.etke.host
   
   # Login to get token
   curl -X POST https://bkchat.etke.host/_matrix/client/v3/login \
     -H "Content-Type: application/json" \
     -d '{"type":"m.login.password","identifier":{"type":"m.id.user","user":"admin"},"password":"your-password"}'
   ```

   -> admin token


4. **Store Admin Token in Firebase**
   ```bash
   cd /Users/bruno/proj/bkaiser/bk2
   firebase functions:secrets:set MATRIX_ADMIN_TOKEN
   # Paste the access_token from previous step
   ```

write token into a file token.txt
firebase functions:secrets:set MATRIX_ADMIN_TOKEN --data-file token.txt 
✔  Created a new secret version projects/502368729998/secrets/MATRIX_ADMIN_TOKEN/versions/1
bruno@Mac bk2 % firebase functions:secrets:access MATRIX_ADMIN_TOKEN  

### Phase 2: Firebase Configuration (10 minutes)

1. **Update Authorized Domains**
   - [X] Go to Firebase Console → Authentication → Settings
   - [X] Add authorized domains:
     - `bkchat.etke.host`
     - Your app domains (seeclub.org, etc.)

2. **Set Redirect URIs**
   - [ ] Add redirect URIs:
     - `https://bkchat.etke.host/_synapse/client/oidc/callback`
     - `https://seeclub.org/auth/matrix-callback`

3. **Update Environment Config**
   ```typescript
   // apps/scs-app/src/environments/environment.ts
   services: {
     // ...
     matrixHomeserver: 'https://bkchat.etke.host'
   }
   ```

### Phase 3: Application Setup (5 minutes)

1. **Add Matrix Callback Route**
   
   In your app's routing module (usually `app.routes.ts`):
   
   ```typescript
   import { MatrixOidcCallbackComponent } from '@bk2/auth-feature';
   
   export const routes: Route[] = [
     // ... existing routes
     {
       path: 'auth/matrix-callback',
       component: MatrixOidcCallbackComponent,
     },
   ];
   ```

No need to add an OpenID Connect provider to Firebase Auth. The flow works the opposite way:
- Matrix is the OIDC client (consumer)
- Firebase/Google is the OIDC provider (identity provider)
Matrix uses Firebase's existing authentication, so we just need to configure authorized domains in Firebase Console:
- matrix.bkchat.etke.host
- bkchat.etke.host
- app domains
When users authenticate, 
1. matrix redirects to Google/Firebase OIDC endpoints
2. User logs in with Firebase (email/password)
3. Firebase issues an ID token
4. Matrix verifies the token and creates/logs in the user
OIDC endpoints are configured in Matrix's homeserver.yaml.

2. **Deploy Cloud Functions**
   ```bash
   cd /Users/bruno/proj/bkaiser/bk2
  [x] nx build functions
  [x] firebase deploy --only functions
   ```

### Phase 4: Testing (10 minutes)

1. **Test Basic Login**
   - [x] Start app: `nx serve scs-app`
   - [x] Login with Firebase credentials
   - [x] Navigate to a page with chat section
   - [ ] Should redirect to Matrix SSO
   - [ ] Should redirect to Firebase for auth
   - [ ] Should return to your app with Matrix logged in

2. **Verify in Browser Console**
   ```javascript
   // Check localStorage for Matrix tokens
   console.log(localStorage.getItem('matrix_access_token'));
   console.log(localStorage.getItem('matrix_user_id'));
   ```

3. **Test Room Creation**
   - [ ] Open browser console
   - [ ] Call function manually:
   ```javascript
   // Get Firebase token
   const idToken = await firebase.auth().currentUser.getIdToken();
   
   // Call Cloud Function
   const ensureGroupRoom = firebase.functions().httpsCallable('ensureGroupRoom');
   const result = await ensureGroupRoom({
     groupId: 'test-group-1',
     groupName: 'Test Group',
     memberUids: ['user1_uid', 'user2_uid']
   });
   console.log(result.data);
   ```

## 🔍 Verification Points

After setup, verify each integration point:

### 1. Matrix Server
```bash
# Check OIDC config
curl https://bkchat.etke.host/_matrix/client/v3/login | jq

# Should show Firebase in identity_providers
```

### 2. Firebase Functions
```bash
# Test OIDC config function
firebase functions:shell
> getMatrixOidcConfig()

# Should return homeserver URL and client ID
```

### 3. Client Application
```typescript
// In browser console after login
console.log('Has Matrix token:', !!localStorage.getItem('matrix_access_token'));
console.log('Matrix sync state:', document.querySelector('bk-matrix-chat-section'));
```

## 🚨 Common Issues & Solutions

### Issue: "No identity providers found"
**Solution:** Matrix server not configured properly
```bash
# Check Synapse logs
sudo journalctl -u matrix-synapse -n 100
# Look for OIDC configuration errors
```

### Issue: "CORS error during redirect"
**Solution:** Add domains to Matrix CORS config
```yaml
# In homeserver.yaml
cors_origins:
  - https://seeclub.org
  - http://localhost:4200
```

### Issue: "Invalid redirect URI"
**Solution:** Ensure URIs match exactly in both Firebase and Matrix

### Issue: "User not created in Matrix"
**Solution:** Check user mapping in homeserver.yaml
```yaml
user_mapping_provider:
  config:
    localpart_template: "{{ user.sub }}"  # Must match Firebase UID field
```

## 📊 Flow Diagram

```
User Login Flow:
┌─────────────────┐
│ User clicks     │
│ chat section    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Check if Matrix │
│ token exists    │
└────────┬────────┘
         │ No token
         ▼
┌─────────────────┐
│ Get OIDC config │
│ from Cloud Fn   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Redirect to     │
│ Matrix SSO      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Matrix redirects│
│ to Firebase Auth│
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Firebase verifies│
│ user identity   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Firebase returns│
│ to Matrix       │
└────────┬────────┘
         │
         ▼
┌─────── ────────┐
│ Matrix creates/ │
│ logs in user    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Redirect to app │
│ /auth/matrix-   │
│ callback        │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Exchange login  │
│ token for access│
│ token           │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Store tokens in │
│ localStorage    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Initialize      │
│ Matrix client   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ User can chat!  │
└─────────────────┘
```

## 🎓 Next Steps

After basic setup is working:

1. **Auto-create group rooms**
   ```typescript
   // In your group creation logic
   const ensureGroupRoom = httpsCallable(functions, 'ensureGroupRoom');
   await ensureGroupRoom({
     groupId: group.id,
     groupName: group.name,
     memberUids: group.members.map(m => m.uid)
   });
   ```

2. **Sync user profiles**
   ```typescript
   // After user updates their profile
   const syncProfile = httpsCallable(functions, 'syncUserProfileToMatrix');
   await syncProfile();
   ```

3. **Add message notifications** (see FCM integration)

4. **Enable E2E encryption** (optional, for enhanced security)

## 📚 Files Created

Your implementation includes:

- ✅ `/apps/functions/src/matrix/index.ts` - Cloud Functions
- ✅ `/libs/cms/section/data-access/src/lib/matrix-chat.service.ts` - Matrix SDK wrapper
- ✅ `/libs/cms/section/feature/src/lib/matrix-chat-section.store.ts` - State management
- ✅ `/libs/cms/section/feature/src/lib/matrix-chat-section.component.ts` - UI component  
- ✅ `/libs/auth/feature/src/lib/matrix-oidc-callback.component.ts` - OIDC callback handler
- ✅ `/libs/cms/section/ui/src/lib/matrix-*-*.component.ts` - UI sub-components
- ✅ `MATRIX_OIDC_SETUP.md` - Detailed setup guide

## 🔐 Security Checklist

- [ ] HTTPS enabled on all endpoints
- [ ] Redirect URIs validated in Firebase console
- [ ] Matrix admin token stored as Firebase secret
- [ ] Rate limiting enabled in Synapse
- [ ] CORS configured with specific origins (not *)
- [ ] Regular security updates for Matrix server

## 🚀 You're Ready!

Once all checkboxes are complete, your Matrix + Firebase OIDC integration should be working!

If you encounter issues, check:
1. Matrix server logs
2. Browser console for errors
3. Firebase Functions logs (`firebase functions:log`)
4. Network tab for redirect chain

Need help? Check `MATRIX_OIDC_SETUP.md` for detailed troubleshooting.
