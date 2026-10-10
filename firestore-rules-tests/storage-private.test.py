#!/usr/bin/env python3
"""
Firebase Storage security-rules tests for the private bucket (storage-private.rules,
spec 1.74 / 1.82 §4).

Clients never read the private bucket (delivery is signed URLs from Cloud Functions);
the only client write is creating an album video under a section or a room-less
folder. Verifies: no client read, update or delete anywhere; the album-video create
path with its tenant, modelType, folder-room, renderings and extension gates; and
default-deny elsewhere.

The Storage emulator applies one ruleset to every bucket, so run.sh runs this file in
its own emulator pass with storage-private.rules. Directly:
    firebase emulators:exec --only firestore,storage --project bkaiser-org \
        --config <firebase.json copy with "storage": {"rules": "storage-private.rules"}> \
        "python3 firestore-rules-tests/storage-private.test.py"

Not covered:
- the 200 MB size cap (would need a 200 MB upload);
- overwriting an existing object. Production evaluates that as an update, which the
  rules deny, but the emulator evaluates every upload as a create (firebase-tools
  lib/emulator/storage/files.js uploadObject), so it would wrongly pass here.
"""
import os, json, base64, urllib.request, urllib.error, urllib.parse

FS = os.environ.get("FIRESTORE_EMULATOR_HOST")
ST = os.environ.get("FIREBASE_STORAGE_EMULATOR_HOST")
if not FS or not ST:
    raise SystemExit("Run via firebase emulators:exec --only firestore,storage (see run.sh).")
PROJ = os.environ.get("RULES_TEST_PROJECT", "bkaiser-org")
BUCKET = f"{PROJ}-private"
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

def seed_doc(coll, doc_id, d):
    body = {"fields": {k: fsval(v) for k, v in d.items()}}
    r = urllib.request.Request(f"{FS_BASE}/{coll}?documentId={doc_id}", data=json.dumps(body).encode(),
                               headers={"Content-Type": "application/json", "Authorization": "Bearer owner"},
                               method="POST")
    try:
        urllib.request.urlopen(r)
    except urllib.error.HTTPError as e:
        raise SystemExit(f"seed {coll}/{doc_id} failed {e.code}: {e.read().decode()}")

def obj_url(path): return f"http://{ST}/v0/b/{BUCKET}/o/{urllib.parse.quote(path, safe='')}"

def call(req):
    try: return urllib.request.urlopen(req).status
    except urllib.error.HTTPError as e: return e.code

def auth(token): return {"Authorization": f"Bearer {token}"} if token else {}

def get_obj(path, token=None):
    return call(urllib.request.Request(obj_url(path), headers=auth(token), method="GET"))

def put_obj(path, token=None, ctype="video/mp4"):
    enc = urllib.parse.quote(path, safe="")
    hdr = {"Content-Type": ctype, **auth(token)}
    return call(urllib.request.Request(f"http://{ST}/v0/b/{BUCKET}/o?name={enc}", data=b"x",
                                       headers=hdr, method="POST"))

def delete_obj(path, token=None):
    return call(urllib.request.Request(obj_url(path), headers=auth(token), method="DELETE"))


seed_doc("users", "uidA", {"tenants": ["t1"], "roles": {}})
seed_doc("users", "uidB", {"tenants": ["t2"], "roles": {"admin": True}})
A, B = jwt("uidA"), jwt("uidB")
NODOC = jwt("uidNoDoc")                                         # authenticated, no users/{uid}

seed_doc("folders", "fPlain", {"name": "plain"})                # legacy: no matrixRoomId
seed_doc("folders", "fEmpty", {"matrixRoomId": ""})
seed_doc("folders", "fRoom", {"matrixRoomId": "!room:matrix.test"})

# An existing video, seeded with the owner token (rules-bypassing, like the Admin SDK),
# so read/update/delete denials run against an object that actually exists.
EXISTING = "tenant/t1/section/s1/album/a/existing.mp4"
if put_obj(EXISTING, "owner") != 200:
    raise SystemExit("could not seed the existing private video")

# read: no client read, ever (denied -> 403 even though the object exists)
read_cases = [
    ("uidA GET own-tenant album video -> DENY",  EXISTING, A),
    ("uidB(admin t2) GET t1 album video -> DENY", EXISTING, B),
    ("anon GET album video -> DENY",             EXISTING, None),
    ("uidA GET finance doc -> DENY",             "tenant/t1/finance/x.pdf", A),
]
# create: allowed -> 200 ; denied -> 403
write_cases = [
    ("uidA create section album video -> ALLOW",       True,  "tenant/t1/section/s1/album/a/v1.mp4", A),
    ("uidA create .mov (case-insensitive) -> ALLOW",   True,  "tenant/t1/section/s1/album/a/V2.MOV", A),
    ("uidA create .avi -> ALLOW",                      True,  "tenant/t1/section/s1/album/a/v3.avi", A),
    ("uidA create nested path in album -> ALLOW",      True,  "tenant/t1/section/s1/album/a/b/c/v4.mp4", A),
    ("uidA create in legacy folder (no room) -> ALLOW", True, "tenant/t1/folder/fPlain/album/a/v5.mp4", A),
    ("uidA create in folder with empty room -> ALLOW", True,  "tenant/t1/folder/fEmpty/album/a/v6.mp4", A),
    ("uidA create in chat-room folder -> DENY",        False, "tenant/t1/folder/fRoom/album/a/v7.mp4", A),
    ("uidA create in missing folder -> DENY",          False, "tenant/t1/folder/fMissing/album/a/v8.mp4", A),
    ("uidA create into renderings/ -> DENY",           False, "tenant/t1/section/s1/album/renderings/v9.mp4", A),
    ("uidA create non-video (.png) -> DENY",           False, "tenant/t1/section/s1/album/a/img.png", A),
    ("uidA create .mp4 in the middle only -> DENY",    False, "tenant/t1/section/s1/album/a/v.mp4.exe", A),
    ("uidA create other modelType (person) -> DENY",   False, "tenant/t1/person/p1/album/a/v.mp4", A),
    ("uidA create into other tenant t2 -> DENY",       False, "tenant/t2/section/s1/album/a/v.mp4", A),
    ("uidB(admin t2) create into t1 -> DENY",          False, "tenant/t1/section/s1/album/a/vb.mp4", B),
    ("anon create album video -> DENY",                False, "tenant/t1/section/s1/album/a/vanon.mp4", None),
    ("user without users doc create -> DENY",          False, "tenant/t1/section/s1/album/a/vnodoc.mp4", NODOC),
    ("uidA create outside album -> DENY",              False, "tenant/t1/section/s1/v.mp4", A),
    ("uidA create into private exports -> DENY",       False, "tenant/t1/private/exports/uidA/x.zip", A),
    ("uidA create unknown prefix -> DENY",             False, "random/v.mp4", A),
]
# delete: denied -> 403
delete_cases = [
    ("uidA DELETE own-tenant album video -> DENY",   EXISTING, A),
    ("uidB(admin t2) DELETE album video -> DENY",    EXISTING, B),
]

passed = failed = 0
def report(ok, code, label):
    global passed, failed
    passed += ok; failed += not ok
    print(f"{'PASS' if ok else 'FAIL'} [{code}] {label}")

for label, path, tok in read_cases:
    c = get_obj(path, tok); report(c == 403, c, label)
for label, expect, path, tok in write_cases:
    c = put_obj(path, tok); report((c == 200) == expect, c, label)
for label, path, tok in delete_cases:
    c = delete_obj(path, tok); report(c == 403, c, label)
# the denied deletes must have left the object in place
c = get_obj(EXISTING, "owner"); report(c == 200, c, "existing video survives the denied deletes")

print(f"\n{passed} passed, {failed} failed")
raise SystemExit(1 if failed else 0)
