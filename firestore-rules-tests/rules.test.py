#!/usr/bin/env python3
"""
Firestore security-rules tests for bk2.

Runs against the Firestore emulator and exercises the rules in firestore.rules
across anonymous, tenant-A user, tenant-B admin, ownership, and list-query
scenarios. The emulator does NOT verify JWT signatures, so authenticated callers
are simulated with unsigned tokens.

Run:
    ./firestore-rules-tests/run.sh
  or:
    firebase emulators:exec --only firestore --project bkaiser-org \
        "python3 firestore-rules-tests/rules.test.py"

Exits non-zero if any case fails. See firestore-rules-tests/README.md.
"""
import os, json, base64, urllib.request, urllib.error

HOST = os.environ.get("FIRESTORE_EMULATOR_HOST")
if not HOST:
    raise SystemExit("FIRESTORE_EMULATOR_HOST not set — run via firebase emulators:exec (see README).")
PROJ = os.environ.get("RULES_TEST_PROJECT", "bkaiser-org")
BASE = f"http://{HOST}/v1/projects/{PROJ}/databases/(default)/documents"
OWNER = "owner"   # emulator super-user: bypasses rules, used only for seeding


# ---------------------------------------------------------------- helpers ----
def _b64u(d):
    return base64.urlsafe_b64encode(json.dumps(d).encode()).rstrip(b"=").decode()

def jwt(uid, email="u@test.ch"):
    """Unsigned token accepted by the emulator (signature is ignored)."""
    header = _b64u({"alg": "none", "typ": "JWT"})
    payload = _b64u({
        "iss": f"https://securetoken.google.com/{PROJ}", "aud": PROJ,
        "sub": uid, "user_id": uid, "email": email,
        "auth_time": 1700000000, "iat": 1700000000, "exp": 4100000000,
        "firebase": {"identities": {}, "sign_in_provider": "password"},
    })
    return f"{header}.{payload}.fakesig"

def _val(v):
    if isinstance(v, bool):  return {"booleanValue": v}
    # bool is a subclass of int — this branch must stay BELOW the bool one.
    if isinstance(v, int):   return {"integerValue": str(v)}
    if isinstance(v, str):   return {"stringValue": v}
    if isinstance(v, list):  return {"arrayValue": {"values": [_val(x) for x in v]}}
    if isinstance(v, dict):  return {"mapValue": {"fields": {k: _val(x) for k, x in v.items()}}}
    raise ValueError(v)

def body(d):
    return {"fields": {k: _val(v) for k, v in d.items()}}

def req(method, path, token=None, data=None, mask=None):
    url = f"{BASE}/{path}"
    if mask:
        url += "?" + "&".join(f"updateMask.fieldPaths={m}" for m in mask)
    hdr = {"Content-Type": "application/json"}
    if token:
        hdr["Authorization"] = f"Bearer {token}"
    payload = json.dumps(data).encode() if data is not None else None
    r = urllib.request.Request(url, data=payload, headers=hdr, method=method)
    try:
        return urllib.request.urlopen(r).status
    except urllib.error.HTTPError as e:
        return e.code

def seed(path, d):
    coll, _, docid = path.rpartition("/")
    code = req("POST", f"{coll}?documentId={docid}", token=OWNER, data=body(d))
    assert code in (200, 201), f"seed {path} failed: {code}"

def parent_query(parentKey, token=None, tenant=None):
    """Addresses query by parentKey. The owner needs no tenant filter (ownsParent is
    provable from the parentKey constraint alone); privileged readers query with the
    tenant filter like getSystemQuery does (tenantRead must be provable)."""
    filters = [{"fieldFilter": {"field": {"fieldPath": "parentKey"},
                                "op": "EQUAL", "value": {"stringValue": parentKey}}}]
    if tenant is not None:
        filters.append({"fieldFilter": {"field": {"fieldPath": "tenants"},
                                        "op": "ARRAY_CONTAINS", "value": {"stringValue": tenant}}})
    where = filters[0] if len(filters) == 1 else {"compositeFilter": {"op": "AND", "filters": filters}}
    sq = {"from": [{"collectionId": "addresses"}], "where": where}
    hdr = {"Content-Type": "application/json"}
    if token:
        hdr["Authorization"] = f"Bearer {token}"
    r = urllib.request.Request(f"{BASE}:runQuery",
                               data=json.dumps({"structuredQuery": sq}).encode(),
                               headers=hdr, method="POST")
    try:
        return urllib.request.urlopen(r).status
    except urllib.error.HTTPError as e:
        return e.code

def list_query(coll, tenant=None, token=None):
    """Mirrors getSystemQuery(tenant): isArchived==false [+ tenants array-contains tenant]."""
    filters = [{"fieldFilter": {"field": {"fieldPath": "isArchived"},
                                "op": "EQUAL", "value": {"booleanValue": False}}}]
    if tenant is not None:
        filters.append({"fieldFilter": {"field": {"fieldPath": "tenants"},
                                        "op": "ARRAY_CONTAINS", "value": {"stringValue": tenant}}})
    where = filters[0] if len(filters) == 1 else {"compositeFilter": {"op": "AND", "filters": filters}}
    sq = {"from": [{"collectionId": coll}], "where": where}
    hdr = {"Content-Type": "application/json"}
    if token:
        hdr["Authorization"] = f"Bearer {token}"
    r = urllib.request.Request(f"{BASE}:runQuery",
                               data=json.dumps({"structuredQuery": sq}).encode(),
                               headers=hdr, method="POST")
    try:
        return urllib.request.urlopen(r).status
    except urllib.error.HTTPError as e:
        return e.code


# ------------------------------------------------------------------- seed ----
seed("users/uidA", {"tenants": ["t1"], "roles": {}, "firstName": "A", "personKey": "pA"})
seed("users/uidB", {"tenants": ["t2"], "roles": {"admin": True}, "firstName": "B", "personKey": "pB"})
seed("users/uidC", {"tenants": ["t1"], "roles": {"contentAdmin": True}, "firstName": "C", "personKey": "pC"})
seed("users/uidD", {"tenants": ["t1"], "roles": {"admin": True}, "firstName": "D", "personKey": "pD"})
# privacy 1.19 Phase 4 (addresses lock): plain member E, memberAdmin M, privileged P
seed("users/uidE", {"tenants": ["t1"], "roles": {}, "firstName": "E", "personKey": "pE"})
seed("users/uidM", {"tenants": ["t1"], "roles": {"memberAdmin": True}, "firstName": "M", "personKey": "pM"})
seed("users/uidP", {"tenants": ["t1"], "roles": {"privileged": True}, "firstName": "P"})
seed("persons/pA", {"tenants": ["t1"], "isArchived": False, "lastName": "AA"})
seed("persons/pB", {"tenants": ["t2"], "isArchived": False, "lastName": "BB"})
seed("memberships/mA", {"tenants": ["t1"], "isArchived": False, "x": "1"})
seed("sessions/sX", {"isActive": True, "userKey": "", "tenants": ["t1"]})
seed("invoices/iA", {"tenants": ["t1"], "isArchived": False, "amount": "100"})
# M-7: orgs/resources/tags are no longer public — tenant-scoped read.
seed("orgs/oA",      {"tenants": ["t1"], "isArchived": False, "name": "Org A"})
seed("orgs/oB",      {"tenants": ["t2"], "isArchived": False, "name": "Org B"})
seed("resources/rA", {"tenants": ["t1"], "isArchived": False, "name": "Res A"})
seed("tags/tgA",     {"tenants": ["t1"], "isArchived": False, "tagModel": "x"})
# CMS content stays public-readable.
seed("pages/home",   {"tenants": ["t1"], "isArchived": False, "title": "Home"})
seed("sections/secA",{"tenants": ["t1"], "isArchived": False, "type": "article"})
# fork-on-edit (D-BB-8): shared catalogue-owned menu docs a tenant may detach itself from.
seed("menuItems/shared1", {"tenants": ["t1", "t2"], "isArchived": False, "name": "shared1", "label": "L"})
seed("menuItems/shared2", {"tenants": ["t1", "t2"], "isArchived": False, "name": "shared2", "label": "L"})
seed("menuItems/shared3", {"tenants": ["t1", "t2"], "isArchived": False, "name": "shared3", "label": "L"})
# privacy 1.19 Phase 4: address-directory projection — CF-written, tenant-readable.
seed("address-directory/t1_person.pA", {"tenants": ["t1"], "isArchived": False,
                                        "parentKey": "person.pA", "favEmail": "a@t1.ch"})
seed("address-directory/t2_person.pB", {"tenants": ["t2"], "isArchived": False,
                                        "parentKey": "person.pB", "favEmail": "b@t2.ch"})
# privacy 1.19 Phase 4 (the lock): raw addresses — owner pA, other person pO, cross-tenant pX
seed("addresses/adrA_email", {"tenants": ["t1"], "isArchived": False, "isFavorite": True,
                              "parentKey": "person.pA", "addressChannel": "email", "email": "a@t1.ch"})
seed("addresses/adrA_ssn",   {"tenants": ["t1"], "isArchived": False, "isFavorite": False,
                              "parentKey": "person.pA", "addressChannel": "ssn", "ssn": "7561111111111"})
seed("addresses/adrO_email", {"tenants": ["t1"], "isArchived": False, "isFavorite": True,
                              "parentKey": "person.pO", "addressChannel": "email", "email": "o@t1.ch"})
seed("addresses/adrO_ssn",   {"tenants": ["t1"], "isArchived": False, "isFavorite": False,
                              "parentKey": "person.pO", "addressChannel": "ssn", "ssn": "7562222222222"})
seed("addresses/adrO_dod",   {"tenants": ["t1"], "isArchived": False, "isFavorite": False,
                              "parentKey": "person.pO", "addressChannel": "dod", "dod": "20240115"})
seed("addresses/adrX_email", {"tenants": ["t2"], "isArchived": False, "isFavorite": True,
                              "parentKey": "person.pX", "addressChannel": "email", "email": "x@t2.ch"})
# D-P4-3: competition-levels keep full dateOfBirth — privileged-only read
seed("competition-levels/clA", {"tenants": ["t1"], "isArchived": False,
                                "personKey": "pA", "dateOfBirth": "20000101"})
# spec 1.22: event image folders
seed("folders/fOpen",   {"tenants": ["t1"], "isArchived": False, "name": "Event",  "membersMayUpload": True,  "ownerKey": "pC"})
seed("folders/fClosed", {"tenants": ["t1"], "isArchived": False, "name": "Closed", "membersMayUpload": False, "ownerKey": "pC"})
seed("folders/fMine",   {"tenants": ["t1"], "isArchived": False, "name": "Mine",   "membersMayUpload": True,  "ownerKey": "pA"})
seed("docs/dOwnA",   {"tenants": ["t1"], "isArchived": False, "authorKey": "pA", "folderKeys": ["fOpen"], "fullPath": "a.jpg"})
seed("docs/dOtherC", {"tenants": ["t1"], "isArchived": False, "authorKey": "pC", "folderKeys": ["fOpen"], "fullPath": "c.jpg"})
seed("docs/dInMine", {"tenants": ["t1"], "isArchived": False, "authorKey": "pC", "folderKeys": ["fMine"], "fullPath": "m.jpg"})
# fix-review: doc owned/authored by neither userC (contentAdmin) nor userD (admin) —
# authorKey pA, folder fMine owned by pA — so the delete-asymmetry test isolates the
# isAdmin()-only bypass (see task-4-report.md fix-report deviation note).
seed("docs/dForD",  {"tenants": ["t1"], "isArchived": False, "authorKey": "pA", "folderKeys": ["fMine"], "fullPath": "d.jpg"})
seed("folders/fT2", {"tenants": ["t2"], "isArchived": False, "name": "T2", "membersMayUpload": True, "ownerKey": "pB"})
# privacy 1.19 Phase 5B: erasure-log — CF-written evidence, tenant-admin read only.
seed("erasure-log/elA", {"tenants": ["t1"], "isArchived": False, "tenantId": "t1",
                         "executedAt": "20260729120000", "pseudonym": "Gel\u00f6schtes Mitglied #abc12345",
                         "counts": {"sessions": 3}, "trigger": "self"})
# feature-building-blocks (2026-08-01): feature-rollout is GLOBAL, no tenants[] field \u2014
# operator-owned, CF-only write. featureEvents is its append-only audit trail, same shape.
seed("feature-rollout/blockX", {"availability": "beta", "allowTenants": ["t1"], "denyTenants": [],
                                "reason": "In geschlossener Beta", "updatedAt": "20260801000000", "updatedBy": "op"})
seed("featureEvents/evA", {"tenantId": "t1", "block": "blockX", "op": "enable",
                           "at": "20260801000000", "by": "op"})

A, B, C, D = jwt("uidA"), jwt("uidB"), jwt("uidC"), jwt("uidD")
E, M, P = jwt("uidE"), jwt("uidM"), jwt("uidP")
GET, PATCH, POST, DELETE = "GET", "PATCH", "POST", "DELETE"


# ------------------------------------------------------------------ cases ----
# (label, expect_allow, method, path, token, data, mask)
single_cases = [
    # C-2: persons no longer public
    ("anon GET persons/pA -> DENY", False, GET, "persons/pA", None, None, None),
    ("anon GET pages/none -> ALLOW(404)", True, GET, "pages/none", None, None, None),
    # M-8: session userKey can't be forged anonymously; heartbeat still works
    ("anon PATCH sessions forge userKey -> DENY", False, PATCH, "sessions/sX", None,
     body({"isActive": True, "userKey": "forged", "tenants": ["t1"]}), ["userKey"]),
    ("anon PATCH sessions heartbeat -> ALLOW", True, PATCH, "sessions/sX", None,
     body({"isActive": True, "userKey": "", "tenants": ["t1"]}), ["isActive"]),
    # privacy §7.1: sessions carry userEmail — read is admin-only, tenant-scoped
    ("anon GET sessions/sX -> DENY", False, GET, "sessions/sX", None, None, None),
    ("userA(no role) GET sessions/sX -> DENY (was signedIn)", False, GET, "sessions/sX", A, None, None),
    ("userB(admin t2) GET sessions/sX (t1) -> DENY (cross-tenant)", False, GET, "sessions/sX", B, None, None),
    ("userD(admin t1) GET sessions/sX -> ALLOW", True, GET, "sessions/sX", D, None, None),
    # C-1: tenant isolation
    ("userA GET persons/pA (own tenant) -> ALLOW", True, GET, "persons/pA", A, None, None),
    ("userA GET persons/pB (other tenant) -> DENY", False, GET, "persons/pB", A, None, None),
    ("userA GET memberships/mA -> ALLOW", True, GET, "memberships/mA", A, None, None),
    ("userA GET invoices/iA (read) -> ALLOW", True, GET, "invoices/iA", A, None, None),
    # C-1: self role-escalation blocked
    ("userA PATCH own roles.admin=true -> DENY", False, PATCH, "users/uidA", A,
     body({"roles": {"admin": True}}), ["roles"]),
    ("userA PATCH own firstName -> ALLOW", True, PATCH, "users/uidA", A,
     body({"firstName": "X"}), ["firstName"]),
    ("userA GET userB doc -> DENY", False, GET, "users/uidB", A, None, None),
    # admins are still tenant-scoped
    ("userB(admin t2) GET persons/pB -> ALLOW", True, GET, "persons/pB", B, None, None),
    ("userB(admin t2) GET persons/pA (t1) -> DENY", False, GET, "persons/pA", B, None, None),
    # fcmTokens ownership
    ("userA PUT own fcmToken -> ALLOW", True, PATCH, "users/uidA/fcmTokens/tokA", A,
     body({"token": "x"}), None),
    ("userA PUT userB fcmToken -> DENY", False, PATCH, "users/uidB/fcmTokens/tokB", A,
     body({"token": "x"}), None),
    # create tenant scoping
    ("userA create persons in t1 -> ALLOW", True, POST, "persons?documentId=pNew1", A,
     body({"tenants": ["t1"], "lastName": "N"}), None),
    ("userA create persons in t2 -> DENY", False, POST, "persons?documentId=pNew2", A,
     body({"tenants": ["t2"], "lastName": "N"}), None),
    # CF-only collection: client write denied
    ("userA write invoices -> DENY", False, PATCH, "invoices/iA", A,
     body({"amount": "999"}), ["amount"]),
    # M-7: CMS content writes require the content role (contentAdmin/privileged/admin)
    ("anon GET pages/none (public read) -> ALLOW(404)", True, GET, "pages/none", None, None, None),
    ("userA(no role) create pages -> DENY", False, POST, "pages?documentId=pg1", A,
     body({"tenants": ["t1"], "title": "T"}), None),
    ("userC(contentAdmin) create pages -> ALLOW", True, POST, "pages?documentId=pg2", C,
     body({"tenants": ["t1"], "title": "T"}), None),
    ("userA(no role) create categories -> DENY", False, POST, "categories?documentId=c1", A,
     body({"tenants": ["t1"], "name": "N"}), None),
    ("userC(contentAdmin) create sections -> ALLOW", True, POST, "sections?documentId=s1", C,
     body({"tenants": ["t1"], "type": "article"}), None),
    ("userC(contentAdmin) create pages cross-tenant t2 -> DENY", False, POST, "pages?documentId=pg3", C,
     body({"tenants": ["t2"], "title": "T"}), None),
    # fork-on-edit (D-BB-8): the detach half of the copy-on-write. A contentAdmin may drop
    # its OWN tenant from a shared menu doc — and nothing else, by any other means.
    ("userC(contentAdmin) detach own tenant from shared menu -> ALLOW", True, PATCH,
     "menuItems/shared1", C, body({"tenants": ["t2"]}), ["tenants"]),
    ("userC drops the OTHER tenant instead -> DENY", False, PATCH,
     "menuItems/shared2", C, body({"tenants": ["t1"]}), ["tenants"]),
    ("userC detaches AND edits the label in one write -> DENY", False, PATCH,
     "menuItems/shared3", C, body({"tenants": ["t2"], "label": "Renamed"}), ["tenants", "label"]),
    ("userA(no content role) detaches own tenant -> DENY", False, PATCH,
     "menuItems/shared3", A, body({"tenants": ["t2"]}), ["tenants"]),
    # M-7: orgs/resources/tags no longer public — anon DENY, tenant member ALLOW, cross-tenant DENY.
    ("anon GET orgs/oA -> DENY", False, GET, "orgs/oA", None, None, None),
    ("anon GET resources/rA -> DENY", False, GET, "resources/rA", None, None, None),
    ("anon GET tags/tgA -> DENY", False, GET, "tags/tgA", None, None, None),
    ("userA GET orgs/oA (own tenant) -> ALLOW", True, GET, "orgs/oA", A, None, None),
    ("userA GET orgs/oB (other tenant) -> DENY", False, GET, "orgs/oB", A, None, None),
    ("userA GET resources/rA (own tenant) -> ALLOW", True, GET, "resources/rA", A, None, None),
    ("userA GET tags/tgA (own tenant) -> ALLOW", True, GET, "tags/tgA", A, None, None),
    # CMS content stays public-readable (PWA anonymous landing renders it).
    ("anon GET pages/home (public) -> ALLOW", True, GET, "pages/home", None, None, None),
    ("anon GET sections/secA (public) -> ALLOW", True, GET, "sections/secA", None, None, None),
    # privacy 1.19 Phase 4: address-directory projection — tenant read, CF-only write
    ("anon GET address-directory (t1) -> DENY", False, GET, "address-directory/t1_person.pA", None, None, None),
    ("userA GET address-directory own tenant -> ALLOW", True, GET, "address-directory/t1_person.pA", A, None, None),
    ("userA GET address-directory other tenant -> DENY", False, GET, "address-directory/t2_person.pB", A, None, None),
    ("userA PATCH address-directory -> DENY (CF-only)", False, PATCH, "address-directory/t1_person.pA", A,
     body({"favEmail": "forged@x.ch"}), ["favEmail"]),
    ("userD(admin t1) PATCH address-directory -> DENY (CF-only)", False, PATCH, "address-directory/t1_person.pA", D,
     body({"favEmail": "forged@x.ch"}), ["favEmail"]),
    ("userA create address-directory -> DENY (CF-only)", False, POST, "address-directory?documentId=t1_person.pX", A,
     body({"tenants": ["t1"], "parentKey": "person.pX"}), None),
    # privacy 1.19 Phase 5B: erasure-log — admin-of-this-tenant read, nobody writes
    ("userD(admin t1) GET erasure-log -> ALLOW", True, GET, "erasure-log/elA", D, None, None),
    ("userA(plain member t1) GET erasure-log -> DENY", False, GET, "erasure-log/elA", A, None, None),
    ("userM(memberAdmin t1) GET erasure-log -> DENY (admin only)", False, GET, "erasure-log/elA", M, None, None),
    ("userB(admin t2) GET erasure-log (t1) -> DENY (cross-tenant)", False, GET, "erasure-log/elA", B, None, None),
    ("anon GET erasure-log -> DENY", False, GET, "erasure-log/elA", None, None, None),
    ("userD(admin t1) PATCH erasure-log -> DENY (CF-only)", False, PATCH, "erasure-log/elA", D,
     body({"pseudonym": "forged"}), ["pseudonym"]),
    ("userD(admin t1) create erasure-log -> DENY (CF-only)", False, POST, "erasure-log?documentId=elX", D,
     body({"tenants": ["t1"], "tenantId": "t1"}), None),
    ("userD(admin t1) DELETE erasure-log -> DENY (CF-only)", False, DELETE, "erasure-log/elA", D, None, None),
    # feature-building-blocks (2026-08-01): feature-rollout — global, any authenticated
    # user may read (the picker shows withheld blocks with their reason); no client,
    # including an admin, may write — applyFeatureSelection (Admin SDK) is the sole writer.
    ("userA(plain) GET feature-rollout -> ALLOW", True, GET, "feature-rollout/blockX", A, None, None),
    ("userD(admin t1) GET feature-rollout -> ALLOW", True, GET, "feature-rollout/blockX", D, None, None),
    ("anon GET feature-rollout -> DENY", False, GET, "feature-rollout/blockX", None, None, None),
    ("userD(admin t1) PATCH feature-rollout -> DENY (CF-only)", False, PATCH, "feature-rollout/blockX", D,
     body({"availability": "ga"}), ["availability"]),
    ("userD(admin t1) create feature-rollout -> DENY (CF-only)", False, POST, "feature-rollout?documentId=blockY", D,
     body({"availability": "ga", "allowTenants": [], "denyTenants": [], "reason": ""}), None),
    ("userD(admin t1) DELETE feature-rollout -> DENY (CF-only)", False, DELETE, "feature-rollout/blockX", D, None, None),
    # featureEvents — same shape: any authenticated user reads, nobody writes.
    ("userA(plain) GET featureEvents -> ALLOW", True, GET, "featureEvents/evA", A, None, None),
    ("anon GET featureEvents -> DENY", False, GET, "featureEvents/evA", None, None, None),
    ("userD(admin t1) PATCH featureEvents -> DENY (CF-only)", False, PATCH, "featureEvents/evA", D,
     body({"op": "disable"}), ["op"]),
    ("userD(admin t1) create featureEvents -> DENY (CF-only)", False, POST, "featureEvents?documentId=evX", D,
     body({"tenantId": "t1", "block": "blockX", "op": "enable", "at": "20260801000001", "by": "uidD"}), None),
    # ── privacy 1.19 Phase 4: addresses = PII vault, read owner ∨ privileged ──
    ("userE(plain) GET another's address -> DENY", False, GET, "addresses/adrO_email", E, None, None),
    ("userE(plain) GET another's ssn address -> DENY", False, GET, "addresses/adrO_ssn", E, None, None),
    ("userA(owner) GET own email address -> ALLOW", True, GET, "addresses/adrA_email", A, None, None),
    ("userA(owner) GET own ssn address -> ALLOW", True, GET, "addresses/adrA_ssn", A, None, None),
    ("userP(privileged) GET same-tenant address -> ALLOW", True, GET, "addresses/adrO_email", P, None, None),
    ("userP(privileged) GET cross-tenant address -> DENY", False, GET, "addresses/adrX_email", P, None, None),
    ("userD(admin t1) GET same-tenant address -> ALLOW", True, GET, "addresses/adrO_email", D, None, None),
    # D-P4-1 (amended 2026-07-27): memberAdmin edits member data, so it reads the
    # vault too — it could already obtain every value via getAddressView. Plain
    # members stay locked out (cases above).
    ("userM(memberAdmin) GET raw address -> ALLOW (D-P4-1 amended)", True, GET, "addresses/adrO_email", M, None, None),
    ("userM(memberAdmin) GET raw ssn address -> ALLOW (D-P4-1 amended)", True, GET, "addresses/adrO_ssn", M, None, None),
    ("userM(memberAdmin) GET cross-tenant address -> DENY", False, GET, "addresses/adrX_email", M, None, None),
    # sensitive-channel writes: owner ∨ privileged ∨ memberAdmin
    ("userE(plain) create ssn for another person -> DENY", False, POST, "addresses?documentId=adrNew1", E,
     body({"tenants": ["t1"], "isArchived": False, "isFavorite": False,
           "parentKey": "person.pO", "addressChannel": "ssn", "ssn": "7563333333333"}), None),
    ("userE(plain) update another's ssn -> DENY", False, PATCH, "addresses/adrO_ssn", E,
     body({"tenants": ["t1"], "isArchived": False, "isFavorite": False,
           "parentKey": "person.pO", "addressChannel": "ssn", "ssn": "7569999999999"}), ["ssn"]),
    ("userA(owner) update own ssn -> ALLOW", True, PATCH, "addresses/adrA_ssn", A,
     body({"tenants": ["t1"], "isArchived": False, "isFavorite": False,
           "parentKey": "person.pA", "addressChannel": "ssn", "ssn": "7564444444444"}), ["ssn"]),
    ("userE(plain) create own email address -> ALLOW (unchanged)", True, POST, "addresses?documentId=adrNew2", E,
     body({"tenants": ["t1"], "isArchived": False, "isFavorite": True,
           "parentKey": "person.pE", "addressChannel": "email", "email": "e@t1.ch"}), None),
    ("userM(memberAdmin) update ssn -> ALLOW (D9 editor)", True, PATCH, "addresses/adrO_ssn", M,
     body({"tenants": ["t1"], "isArchived": False, "isFavorite": False,
           "parentKey": "person.pO", "addressChannel": "ssn", "ssn": "7565555555555"}), ["ssn"]),
    # 'dod' (date of death) is a sensitive scalar channel like ssn/dob — persons keep
    # only the isDeceased flag.
    ("userE(plain) GET another's dod address -> DENY", False, GET, "addresses/adrO_dod", E, None, None),
    ("userM(memberAdmin) GET raw dod address -> ALLOW", True, GET, "addresses/adrO_dod", M, None, None),
    ("userM(memberAdmin) update dod -> ALLOW (D9 editor)", True, PATCH, "addresses/adrO_dod", M,
     body({"tenants": ["t1"], "isArchived": False, "isFavorite": False,
           "parentKey": "person.pO", "addressChannel": "dod", "dod": "20240116"}), ["dod"]),
    ("userE(plain) create dod for another person -> DENY", False, POST, "addresses?documentId=adrNew4", E,
     body({"tenants": ["t1"], "isArchived": False, "isFavorite": False,
           "parentKey": "person.pO", "addressChannel": "dod", "dod": "20240117"}), None),
    # resurrection guards: stripped fields must never reappear
    ("userD(admin) PATCH persons carrying ssnId -> DENY", False, PATCH, "persons/pA", D,
     body({"tenants": ["t1"], "isArchived": False, "lastName": "AA", "ssnId": "756"}), ["ssnId"]),
    ("userD(admin) PATCH persons carrying dateOfDeath -> DENY", False, PATCH, "persons/pA", D,
     body({"tenants": ["t1"], "isArchived": False, "lastName": "AA", "dateOfDeath": "20240101"}), ["dateOfDeath"]),
    ("userD(admin) create person carrying favEmail -> DENY", False, POST, "persons?documentId=pNew3", D,
     body({"tenants": ["t1"], "isArchived": False, "lastName": "N", "favEmail": "x@x.ch"}), None),
    ("userD(admin) PATCH orgs carrying favPhone -> DENY", False, PATCH, "orgs/oA", D,
     body({"tenants": ["t1"], "isArchived": False, "name": "Org A", "favPhone": "+4179"}), ["favPhone"]),
    ("userD(admin) PATCH persons w/o stripped keys -> ALLOW", True, PATCH, "persons/pA", D,
     body({"tenants": ["t1"], "isArchived": False, "lastName": "AB"}), ["lastName"]),
    # index guard: a stripped value must not sneak back inside the search-index string
    # (the legacy `dob:` elements that survived the Phase 4 strip until 2026-07-27).
    ("userD(admin) PATCH persons w/ dob in index -> DENY", False, PATCH, "persons/pA", D,
     body({"tenants": ["t1"], "isArchived": False, "lastName": "AA",
           "index": "n:AA z:8712 fn:A dob:19850101"}), ["index"]),
    ("userD(admin) PATCH persons w/ ssn in index -> DENY", False, PATCH, "persons/pA", D,
     body({"tenants": ["t1"], "isArchived": False, "lastName": "AA",
           "index": "n:AA ssn:7561111111111"}), ["index"]),
    ("userD(admin) create person w/ dob in index -> DENY", False, POST, "persons?documentId=pNew4", D,
     body({"tenants": ["t1"], "isArchived": False, "lastName": "N", "index": "n:N dob:19850101"}), None),
    ("userD(admin) PATCH persons w/ clean index -> ALLOW", True, PATCH, "persons/pA", D,
     body({"tenants": ["t1"], "isArchived": False, "lastName": "AA",
           "index": "n:AA z:8712 fn:A bx:476"}), ["index"]),
    # D-P4-3: competition-levels (full dateOfBirth) — privileged-only read
    ("userA(plain) GET competition-levels -> DENY (D-P4-3)", False, GET, "competition-levels/clA", A, None, None),
    ("userD(admin t1) GET competition-levels -> ALLOW", True, GET, "competition-levels/clA", D, None, None),
    # default deny for unknown collection
    ("userA read unknown coll -> DENY", False, GET, "totallyUnknownColl/x", A, None, None),
    # spec 1.22: docs — member upload into flagged folders only, author-scoped writes
    ("userA create doc in open folder as self -> ALLOW", True, POST, "docs?documentId=dN1", A,
     body({"tenants": ["t1"], "authorKey": "pA", "folderKeys": ["fOpen"], "fullPath": "n1"}), None),
    ("userA create doc in closed folder -> DENY", False, POST, "docs?documentId=dN2", A,
     body({"tenants": ["t1"], "authorKey": "pA", "folderKeys": ["fClosed"], "fullPath": "n2"}), None),
    ("userA create doc with forged authorKey -> DENY", False, POST, "docs?documentId=dN3", A,
     body({"tenants": ["t1"], "authorKey": "pC", "folderKeys": ["fOpen"], "fullPath": "n3"}), None),
    ("userA create doc without folder -> DENY", False, POST, "docs?documentId=dN4", A,
     body({"tenants": ["t1"], "authorKey": "pA", "folderKeys": [], "fullPath": "n4"}), None),
    ("userC(contentAdmin) create doc without folder -> ALLOW", True, POST, "docs?documentId=dN5", C,
     body({"tenants": ["t1"], "authorKey": "pC", "folderKeys": [], "fullPath": "n5"}), None),
    ("userA PATCH own doc -> ALLOW", True, PATCH, "docs/dOwnA", A,
     body({"fullPath": "a2.jpg"}), ["fullPath"]),
    ("userA PATCH foreign doc -> DENY", False, PATCH, "docs/dOtherC", A,
     body({"fullPath": "c2.jpg"}), ["fullPath"]),
    ("userA DELETE foreign doc -> DENY", False, DELETE, "docs/dOtherC", A, None, None),
    ("userA(folder owner) DELETE foreign doc in own folder -> ALLOW", True, DELETE, "docs/dInMine", A, None, None),
    ("userA DELETE own doc -> ALLOW", True, DELETE, "docs/dOwnA", A, None, None),
    # fix-review: delete asymmetry — contentAdmin alone (not author/folder-owner) is
    # NOT enough; only isAdmin() bypasses authorship/ownership on delete.
    ("userC(contentAdmin) DELETE foreign doc dForD -> DENY", False, DELETE, "docs/dForD", C, None, None),
    ("userD(admin t1) DELETE foreign doc dForD -> ALLOW", True, DELETE, "docs/dForD", D, None, None),
    # fix-review: cross-tenant folderData must not supply membersMayUpload/ownerKey
    ("userA create doc into cross-tenant folder fT2 -> DENY", False, POST, "docs?documentId=dN6", A,
     body({"tenants": ["t1"], "authorKey": "pA", "folderKeys": ["fT2"], "fullPath": "n6"}), None),
    # fix-review: nonexistent folderKey must fail closed, not error open
    ("userA create doc with nonexistent folderKey -> DENY", False, POST, "docs?documentId=dN7", A,
     body({"tenants": ["t1"], "authorKey": "pA", "folderKeys": ["fNope"], "fullPath": "n7"}), None),
    # fix-review: author cannot smuggle their doc into a folder they lack upload rights to
    ("userA PATCH own doc dN1 moving folderKeys -> DENY", False, PATCH, "docs/dN1", A,
     body({"folderKeys": ["fClosed"]}), ["folderKeys"]),
    # spec 1.22: folders — self-owned create, owner-or-contentManager write
    ("userA create self-owned folder -> ALLOW", True, POST, "folders?documentId=fN1", A,
     body({"tenants": ["t1"], "name": "N", "ownerKey": "pA", "membersMayUpload": False}), None),
    ("userA create folder with foreign owner -> DENY", False, POST, "folders?documentId=fN2", A,
     body({"tenants": ["t1"], "name": "N", "ownerKey": "pC"}), None),
    ("userA PATCH own folder -> ALLOW", True, PATCH, "folders/fMine", A,
     body({"name": "Mine2"}), ["name"]),
    ("userA PATCH foreign folder -> DENY", False, PATCH, "folders/fOpen", A,
     body({"name": "X"}), ["name"]),
    ("userC(contentAdmin) PATCH foreign folder -> ALLOW", True, PATCH, "folders/fOpen", C,
     body({"name": "Event2"}), ["name"]),
    ("userA DELETE foreign folder -> DENY", False, DELETE, "folders/fClosed", A, None, None),
    ("userA DELETE own folder -> ALLOW", True, DELETE, "folders/fMine", A, None, None),
    # privacy 1.19 D-P4-10: a person's avatar is a picture OF that person — only they,
    # memberAdmin or privileged may write it. Non-person avatars stay tenant content.
    ("userA create own avatar -> ALLOW", True, POST, "avatars?documentId=person.pA", A,
     body({"tenants": ["t1"], "isArchived": False, "storagePath": "tenant/t1/person/pA/avatar/a.jpg"}), None),
    ("userA create foreign person avatar -> DENY", False, POST, "avatars?documentId=person.pC", A,
     body({"tenants": ["t1"], "isArchived": False, "storagePath": "tenant/t1/person/pC/avatar/a.jpg"}), None),
    ("userM(memberAdmin) create foreign person avatar -> ALLOW", True, POST, "avatars?documentId=person.pE", M,
     body({"tenants": ["t1"], "isArchived": False, "storagePath": "tenant/t1/person/pE/avatar/a.jpg"}), None),
    ("userA create org avatar (not a person) -> ALLOW", True, POST, "avatars?documentId=org.oA", A,
     body({"tenants": ["t1"], "isArchived": False, "storagePath": "tenant/t1/org/oA/avatar/a.jpg"}), None),
    ("userA PATCH own avatar -> ALLOW", True, PATCH, "avatars/person.pA", A,
     body({"storagePath": "tenant/t1/person/pA/avatar/b.jpg"}), ["storagePath"]),
    ("userA PATCH foreign person avatar -> DENY", False, PATCH, "avatars/person.pE", A,
     body({"storagePath": "tenant/t1/person/pE/avatar/b.jpg"}), ["storagePath"]),
    ("userA DELETE foreign person avatar -> DENY", False, DELETE, "avatars/person.pE", A, None, None),
    ("userA DELETE own avatar -> ALLOW", True, DELETE, "avatars/person.pA", A, None, None),
]

# (label, expect_allow, collection, tenant, token)
list_cases = [
    ("userA LIST persons array-contains t1 (app query) -> ALLOW", True, "persons", "t1", A),
    ("userA LIST persons NO tenant filter -> DENY", False, "persons", None, A),
    ("userA LIST persons array-contains t2 (other tenant) -> DENY", False, "persons", "t2", A),
    ("userB(admin t2) LIST persons array-contains t2 -> ALLOW", True, "persons", "t2", B),
    ("userB(admin t2) LIST persons array-contains t1 -> DENY", False, "persons", "t1", B),
    ("anon LIST persons array-contains t1 -> DENY (C-2)", False, "persons", "t1", None),
    ("userA LIST memberships array-contains t1 -> ALLOW", True, "memberships", "t1", A),
    ("anon LIST pages array-contains t1 -> ALLOW (public)", True, "pages", "t1", None),
    # privacy 1.19 Phase 4: address-directory bulk stream (AppStore) — tenant-scoped
    ("userA LIST address-directory array-contains t1 -> ALLOW", True, "address-directory", "t1", A),
    ("userA LIST address-directory array-contains t2 -> DENY", False, "address-directory", "t2", A),
    ("anon LIST address-directory t1 -> DENY", False, "address-directory", "t1", None),
    # privacy 1.19 Phase 4: bulk addresses stream is DENIED for plain members —
    # they read the address-directory projection instead.
    ("userE(plain) LIST addresses array-contains t1 -> DENY (lock)", False, "addresses", "t1", E),
    ("userP(privileged) LIST addresses array-contains t1 -> ALLOW", True, "addresses", "t1", P),
    ("userM(memberAdmin) LIST addresses t1 -> ALLOW (D-P4-1 amended)", True, "addresses", "t1", M),
    ("userM(memberAdmin) LIST addresses t2 (cross-tenant) -> DENY", False, "addresses", "t2", M),
]

# (label, expect_allow, parentKey, token, tenant) — addresses query by parentKey
parent_cases = [
    ("userA(owner) QUERY addresses by own parentKey -> ALLOW", True, "person.pA", A, None),
    ("userE(plain) QUERY addresses by another parentKey -> DENY", False, "person.pA", E, None),
    ("userP(privileged) QUERY addresses by parentKey+tenant -> ALLOW", True, "person.pO", P, "t1"),
    # the exact read-then-write query PersonService.upsertScalarChannel runs before
    # saving ssn/dob — it MUST succeed for memberAdmin, or the save silently creates
    # a duplicate vault doc instead of updating the existing one.
    ("userM(memberAdmin) QUERY addresses by parentKey+tenant -> ALLOW (upsert lookup)", True, "person.pO", M, "t1"),
]


# ------------------------------------------------------------------- run -----
passed = failed = 0
for label, expect, method, path, token, data, mask in single_cases:
    code = req(method, path, token=token, data=data, mask=mask)
    allowed = code in (200, 201) or (method == GET and code == 404)
    ok = allowed == expect
    passed += ok; failed += not ok
    print(f"{'PASS' if ok else 'FAIL'}  [{code}]  {label}")

for label, expect, coll, tenant, token in list_cases:
    code = list_query(coll, tenant=tenant, token=token)
    ok = (code == 200) == expect
    passed += ok; failed += not ok
    print(f"{'PASS' if ok else 'FAIL'}  [{code}]  {label}")

for label, expect, parentKey, token, tenant in parent_cases:
    code = parent_query(parentKey, token=token, tenant=tenant)
    ok = (code == 200) == expect
    passed += ok; failed += not ok
    print(f"{'PASS' if ok else 'FAIL'}  [{code}]  {label}")

print(f"\n{passed} passed, {failed} failed")
raise SystemExit(1 if failed else 0)
