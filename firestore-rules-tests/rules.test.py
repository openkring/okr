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
seed("users/uidA", {"tenants": ["t1"], "roles": {}, "firstName": "A"})
seed("users/uidB", {"tenants": ["t2"], "roles": {"admin": True}, "firstName": "B"})
seed("persons/pA", {"tenants": ["t1"], "isArchived": False, "lastName": "AA"})
seed("persons/pB", {"tenants": ["t2"], "isArchived": False, "lastName": "BB"})
seed("memberships/mA", {"tenants": ["t1"], "isArchived": False, "x": "1"})
seed("sessions/sX", {"isActive": True, "userKey": "", "tenants": ["t1"]})
seed("invoices/iA", {"tenants": ["t1"], "isArchived": False, "amount": "100"})

A, B = jwt("uidA"), jwt("uidB")
GET, PATCH, POST = "GET", "PATCH", "POST"


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
    # default deny for unknown collection
    ("userA read unknown coll -> DENY", False, GET, "totallyUnknownColl/x", A, None, None),
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

print(f"\n{passed} passed, {failed} failed")
raise SystemExit(1 if failed else 0)
