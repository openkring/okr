#!/usr/bin/env python3
"""
Firebase Storage security-rules tests for bk2 (storage.rules).

Runs against the Storage + Firestore emulators together (the rules call
firestore.get to read the caller's users/{uid} doc). Verifies tenant isolation
across the three storage prefixes (tenant/, tenants/, bare {tenantId}/.../documents/),
the public logo/ assets, function-owned generated-docs/, and default-deny.

Run via firestore-rules-tests/run.sh, or directly:
    firebase emulators:exec --only firestore,storage --project bkaiser-org \
        "python3 firestore-rules-tests/storage.test.py"

Note: content-type allowlisting is intentionally not enforced by the rules
(see the NOTE in storage.rules), and the Storage emulator does not populate
request.resource.contentType anyway — so these tests cover tenant isolation,
the size-gated write path, prefix routing, and default-deny.
"""
import os, json, base64, urllib.request, urllib.error, urllib.parse

FS = os.environ.get("FIRESTORE_EMULATOR_HOST")
ST = os.environ.get("FIREBASE_STORAGE_EMULATOR_HOST")
if not FS or not ST:
    raise SystemExit("Run via firebase emulators:exec --only firestore,storage (see README).")
PROJ = os.environ.get("RULES_TEST_PROJECT", "bkaiser-org")
BUCKET = f"{PROJ}.appspot.com"
FS_BASE = f"http://{FS}/v1/projects/{PROJ}/databases/(default)/documents"


def b64u(d): return base64.urlsafe_b64encode(json.dumps(d).encode()).rstrip(b"=").decode()
def jwt(uid):
    h = b64u({"alg": "none", "typ": "JWT"})
    p = b64u({"iss": f"https://securetoken.google.com/{PROJ}", "aud": PROJ, "sub": uid,
              "user_id": uid, "email": "u@test.ch", "iat": 1700000000, "exp": 4100000000,
              "firebase": {"identities": {}, "sign_in_provider": "password"}})
    return f"{h}.{p}.sig"

def fsval(v):
    if isinstance(v, bool): return {"booleanValue": v}
    if isinstance(v, str): return {"stringValue": v}
    if isinstance(v, list): return {"arrayValue": {"values": [fsval(x) for x in v]}}
    if isinstance(v, dict): return {"mapValue": {"fields": {k: fsval(x) for k, x in v.items()}}}

def seed_user(uid, d):
    body = {"fields": {k: fsval(v) for k, v in d.items()}}
    r = urllib.request.Request(f"{FS_BASE}/users?documentId={uid}", data=json.dumps(body).encode(),
                               headers={"Content-Type": "application/json", "Authorization": "Bearer owner"},
                               method="POST")
    try:
        urllib.request.urlopen(r)
    except urllib.error.HTTPError as e:
        raise SystemExit(f"seed {uid} failed {e.code}: {e.read().decode()}")

def get_obj(path, token=None):
    enc = urllib.parse.quote(path, safe="")
    hdr = {"Authorization": f"Bearer {token}"} if token else {}
    r = urllib.request.Request(f"http://{ST}/v0/b/{BUCKET}/o/{enc}", headers=hdr, method="GET")
    try: return urllib.request.urlopen(r).status
    except urllib.error.HTTPError as e: return e.code

def put_obj(path, token=None, ctype="image/png"):
    enc = urllib.parse.quote(path, safe="")
    hdr = {"Content-Type": ctype}
    if token: hdr["Authorization"] = f"Bearer {token}"
    r = urllib.request.Request(f"http://{ST}/v0/b/{BUCKET}/o?name={enc}", data=b"x", headers=hdr, method="POST")
    try: return urllib.request.urlopen(r).status
    except urllib.error.HTTPError as e: return e.code


seed_user("uidA", {"tenants": ["t1"], "roles": {}})
seed_user("uidB", {"tenants": ["t2"], "roles": {"admin": True}})
A, B = jwt("uidA"), jwt("uidB")

# read: allowed -> 404 (missing) ; denied -> 403
read_cases = [
    ("anon GET tenant/t1 -> DENY",            False, "tenant/t1/x.pdf", None),
    ("uidA GET tenant/t1 (own) -> ALLOW",     True,  "tenant/t1/x.pdf", A),
    ("uidA GET tenant/t2 (other) -> DENY",    False, "tenant/t2/x.pdf", A),
    ("uidB(admin t2) GET tenant/t2 -> ALLOW", True,  "tenant/t2/x.pdf", B),
    ("uidB(admin t2) GET tenant/t1 -> DENY",  False, "tenant/t1/x.pdf", B),
    ("uidA GET tenants/t1 esign -> ALLOW",    True,  "tenants/t1/esign/x.pdf", A),
    ("uidA GET t1/p/k/documents -> ALLOW",    True,  "t1/person/k/documents/x.pdf", A),
    ("uidA GET t2/p/k/documents -> DENY",     False, "t2/person/k/documents/x.pdf", A),
    ("anon GET logo (public) -> ALLOW",       True,  "logo/icons/x.svg", None),
    ("uidA GET unknown prefix -> DENY",       False, "random/x", A),
    ("uidA GET generated-docs/t1 -> ALLOW",   True,  "generated-docs/t1/u/x.pdf", A),
]
# write(create): allowed -> 200 ; denied -> 403
write_cases = [
    ("uidA PUT tenant/t1 -> ALLOW",         True,  "tenant/t1/a.png", A),
    ("uidA PUT tenant/t2 -> DENY",          False, "tenant/t2/a.png", A),
    ("anon PUT tenant/t1 -> DENY",          False, "tenant/t1/a.png", None),
    ("uidA PUT tenants/t1 esign -> ALLOW",  True,  "tenants/t1/esign/a.pdf", A),
    ("uidA PUT t1/p/k/documents -> ALLOW",  True,  "t1/person/k/documents/a.pdf", A),
    ("uidA PUT forms/fk -> ALLOW",          True,  "forms/fk/a.enc", A),
    ("uidA PUT logo (not priv) -> DENY",    False, "logo/icons/a.svg", A),
    ("uidB(admin) PUT logo -> ALLOW",       True,  "logo/icons/a.svg", B),
    ("uidA PUT generated-docs -> DENY",     False, "generated-docs/t1/u/a.pdf", A),
    ("uidA PUT unknown prefix -> DENY",     False, "random/a", A),
]

passed = failed = 0
for label, expect, path, tok in read_cases:
    c = get_obj(path, tok); ok = (c == 404) == expect
    passed += ok; failed += not ok
    print(f"{'PASS' if ok else 'FAIL'} [{c}] {label}")
for label, expect, path, tok in write_cases:
    c = put_obj(path, tok); ok = (c == 200) == expect
    passed += ok; failed += not ok
    print(f"{'PASS' if ok else 'FAIL'} [{c}] {label}")

print(f"\n{passed} passed, {failed} failed")
raise SystemExit(1 if failed else 0)
