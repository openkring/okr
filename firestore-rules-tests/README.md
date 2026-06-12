# Firestore security-rules tests

Emulator-based tests for [`firestore.rules`](../firestore.rules). They verify
tenant isolation, role-escalation blocking, ownership, the public-read carve-outs,
and — critically — that the app's `getSystemQuery` list shape
(`where('tenants','array-contains', tenantId)`) is permitted while unfiltered and
cross-tenant queries are denied.

## Run

```sh
./firestore-rules-tests/run.sh
```

This wraps `firebase emulators:exec --only firestore`, which loads the rules,
starts the emulator, runs the tests, and tears everything down. Exit code is
non-zero if any case fails.

Requirements: the Firebase CLI (`npx firebase`), a JDK (for the emulator), and
`python3` (standard library only — no extra packages).

## How it works

- The Firestore emulator does **not** verify JWT signatures, so authenticated
  callers are simulated with unsigned tokens (`jwt(uid)` in `rules.test.py`).
- Seeding uses the emulator super-user (`Authorization: Bearer owner`), which
  bypasses rules.
- Each case asserts an HTTP status: `200/201` (or `404` on GET = allowed but
  absent) means the rule allowed the operation; `403` means denied.

## When to update

Add a case whenever you add or change a collection rule. If you add a new
collection to `firestore.rules`, add at least a same-tenant allow and a
cross-tenant deny case. Keep this green before `firebase deploy --only firestore:rules`.

> Note: tests run against a project id (default `bkaiser-org`, override with
> `RULES_TEST_PROJECT`) but only ever touch the local emulator — no production
> data is read or written.
