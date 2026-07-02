# Calendar Events (CalEvent)

## Public Calendar

The `/public/calendar` route shows calendar events without requiring authentication.
Route config: `data: { listId: 'public', view: 'list', showMenu: false }`.

### Why a Cloud Function instead of direct Firestore access

Firestore security rules require authentication for `calevents`. Relaxing them for
unauthenticated access is not straightforward because:

- `getSystemQuery` already uses `array-contains` on the `tenants` field.
- Firestore does not allow two `array-contains` operators in the same query.
- We cannot combine `.where('tenants', 'array-contains', tenantId)` with
  `.where('calendars', 'array-contains', 'public')`.

A Cloud Function using the Firebase Admin SDK bypasses security rules and handles
the two-array-contains limitation by filtering on `tenantId` in JavaScript after
the `calendars` query.

### `getPublicCalEvents` Cloud Function

**Source:** `apps/functions/src/calendar/public-calevents.ts`

**Endpoint:** `GET https://europe-west6-bkaiser-org.cloudfunctions.net/getPublicCalEvents?tenantId=<tenant>`

**What it does:**
1. Queries `calevents` where `calendars array-contains 'public'` and `isArchived == false`.
2. Post-filters results by `tenants.includes(tenantId)` in JavaScript.
3. Returns a JSON array of `CalEventDoc` objects.
4. Sets `Cache-Control: public, max-age=60, s-maxage=300` (60 s client, 5 min CDN).

**Making an event appear in the public calendar:**
Add `'public'` to the event's `calendars` array when creating or editing it.

### How the store calls it

`CalEventStore.caleventsResource` (`libs/calevent/feature/src/lib/calevent.store.ts`):

- If the user is authenticated → standard Firestore query (unchanged).
- If unauthenticated and `calendarName === 'public'` → fetches from `getPublicCalEvents` CF.
- If unauthenticated and any other calendar name → returns empty (no Firestore access).
