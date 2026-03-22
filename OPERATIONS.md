# OPERATIONS.md

Operational notes for running and maintaining the bk2 platform.

---

## Firestore TTL Policies

### emailEvents (30-day auto-delete)

The `emailEvents` collection stores Mailtrap webhook events. Documents have an `expiresAt` field (Firestore Timestamp) set to 30 days after receipt. A Firestore TTL policy automatically deletes expired documents (checked roughly every 24 hours).

The TTL policy is defined in `firestore.indexes.json` (`fieldOverrides`) and deployed via:

```sh
firebase deploy --only firestore:indexes
```

If the policy is ever removed or needs to be reapplied, redeploy the indexes file. Documents are not deleted instantly — Firestore processes TTL deletions in the background within ~24 hours of expiry.
