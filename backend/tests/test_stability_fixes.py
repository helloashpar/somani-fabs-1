"""
Stability / production-500-fix regression tests for Somani Fabs.

Focus (from review_request):
1. /api/display/{secret}/state versioning (ETag)
   - first call: returns version + previews + idle_image (no unchanged flag)
   - second call with same v: returns unchanged:true + version, NO heavy image payload
   - wrong / absent v: full state
2. Login stability: correct creds -> 200 + token, wrong -> 401 (not 500)
3. GET /api/sessions/active repeat 10x, all 200
4. GET /api/sessions/{sid} returns trials WITHOUT garments[].fabric_b64
   but WITH generated_image and fabric_thumb
5. GET /api/customers returns stats obj; /api/customers/export -> 200 xlsx
6. Hammer key GETs (settings, sessions/active, display state) 20x -> no 5xx
"""
import os
import io
import time
import base64
import concurrent.futures as cf

import pytest
import requests
from PIL import Image

BASE_URL = os.environ.get(
    "REACT_APP_BACKEND_URL",
    "https://unstitched-tryon-app.preview.emergentagent.com",
).rstrip("/")
API = f"{BASE_URL}/api"

SUPER_USER = "superashwini"
SUPER_PASS = "6Lr£1Wp2VD`Q"


def _jpeg_b64(color=(180, 60, 60), size=(256, 256)):
    img = Image.new("RGB", size, color)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=70)
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()


# ---------------- fixtures ----------------
@pytest.fixture(scope="module")
def super_token():
    r = requests.post(
        f"{API}/auth/login",
        json={"username": SUPER_USER, "password": SUPER_PASS},
        timeout=30,
    )
    assert r.status_code == 200, f"super login failed {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def super_h(super_token):
    return {"Authorization": f"Bearer {super_token}"}


@pytest.fixture(scope="module")
def display_secret(super_h):
    r = requests.get(f"{API}/settings", headers=super_h, timeout=30)
    assert r.status_code == 200
    s = r.json()
    assert s.get("display_secret"), "settings must expose display_secret"
    return s["display_secret"]


@pytest.fixture(scope="module")
def seeded_session_with_trial(super_h):
    """Create a session + real Gemini-generated trial, and push it to live preview."""
    mobile = f"98{int(time.time()) % 100000000:08d}"
    body = {
        "customer_name": "TEST_Stability",
        "mobile": mobile,
        "mobile2": "",
        "photo": _jpeg_b64((200, 180, 160)),
        "extra": {},
    }
    r = requests.post(f"{API}/sessions", headers=super_h, json=body, timeout=60)
    assert r.status_code == 200, r.text
    sid = r.json()["id"]

    fabric_b64 = _jpeg_b64((30, 90, 200))
    gen_body = {
        "type": "Top Wear",
        "garments": [
            {
                "slot": "top",
                "garment_type": "Full Sleeve Shirt",
                "fabric_b64": fabric_b64,
            }
        ],
    }
    r = requests.post(
        f"{API}/sessions/{sid}/trials/generate",
        headers=super_h,
        json=gen_body,
        timeout=180,
    )
    assert r.status_code == 200, f"Gemini trial failed: {r.status_code} {r.text[:400]}"
    tid = r.json()["id"]

    # push to live preview so /display/state has content
    r = requests.post(
        f"{API}/display/preview", headers=super_h, json={"trial_id": tid}, timeout=30
    )
    assert r.status_code == 200

    yield {"session_id": sid, "trial_id": tid, "fabric_b64": fabric_b64}

    # teardown - clear preview and delete session (also removes trials)
    try:
        requests.delete(f"{API}/display/preview", headers=super_h, timeout=30)
        requests.delete(f"{API}/sessions/{sid}", headers=super_h, timeout=30)
    except Exception:
        pass


# ---------------- 1. Display state versioning ----------------
class TestDisplayStateVersioning:
    def test_first_call_returns_version_and_previews(
        self, display_secret, seeded_session_with_trial
    ):
        r = requests.get(f"{API}/display/{display_secret}/state", timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert "version" in d and isinstance(d["version"], str) and len(d["version"]) > 0
        assert d.get("unchanged") is not True
        assert "previews" in d and isinstance(d["previews"], list)
        assert "idle_image" in d
        assert len(d["previews"]) >= 1, "expected our seeded live preview"
        p0 = d["previews"][0]
        assert p0.get("image", "").startswith("data:image/"), "full image expected on first call"

    def test_same_version_returns_unchanged_no_heavy_payload(
        self, display_secret, seeded_session_with_trial
    ):
        # get current version
        r1 = requests.get(f"{API}/display/{display_secret}/state", timeout=30)
        assert r1.status_code == 200
        v = r1.json()["version"]
        # 2nd call with ?v=<version>
        r2 = requests.get(
            f"{API}/display/{display_secret}/state", params={"v": v}, timeout=30
        )
        assert r2.status_code == 200
        d = r2.json()
        assert d.get("unchanged") is True
        assert d.get("version") == v
        # heavy payload must be absent
        assert "previews" not in d, f"previews should be omitted on unchanged, got keys {list(d.keys())}"
        assert "idle_image" not in d
        # sanity: response should be small
        assert len(r2.content) < 2000, f"unchanged response too big: {len(r2.content)} bytes"

    def test_wrong_version_returns_full_state(
        self, display_secret, seeded_session_with_trial
    ):
        r = requests.get(
            f"{API}/display/{display_secret}/state",
            params={"v": "not-a-real-version-hash"},
            timeout=30,
        )
        assert r.status_code == 200
        d = r.json()
        assert d.get("unchanged") is not True
        assert "previews" in d and len(d["previews"]) >= 1
        assert d["previews"][0]["image"].startswith("data:image/")

    def test_absent_version_returns_full_state(
        self, display_secret, seeded_session_with_trial
    ):
        r = requests.get(f"{API}/display/{display_secret}/state", timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert d.get("unchanged") is not True
        assert "previews" in d

    def test_wrong_secret_still_404(self):
        r = requests.get(f"{API}/display/definitely-wrong-secret/state", timeout=30)
        assert r.status_code == 404


# ---------------- 2. Login stability ----------------
class TestLoginStability:
    def test_correct_creds_returns_token(self):
        r = requests.post(
            f"{API}/auth/login",
            json={"username": SUPER_USER, "password": SUPER_PASS},
            timeout=30,
        )
        assert r.status_code == 200
        data = r.json()
        assert "token" in data and isinstance(data["token"], str) and len(data["token"]) > 20
        assert data["user"]["username"] == SUPER_USER

    def test_wrong_password_returns_401_not_500(self):
        for _ in range(3):
            r = requests.post(
                f"{API}/auth/login",
                json={"username": SUPER_USER, "password": "definitely-wrong-xyz"},
                timeout=30,
            )
            assert r.status_code == 401, f"expected 401, got {r.status_code} {r.text}"

    def test_login_repeated_ok(self):
        """5 back-to-back logins should all succeed (no pool starvation)."""
        for i in range(5):
            r = requests.post(
                f"{API}/auth/login",
                json={"username": SUPER_USER, "password": SUPER_PASS},
                timeout=30,
            )
            assert r.status_code == 200, f"login #{i} failed: {r.status_code}"


# ---------------- 3. Active sessions reliability ----------------
class TestActiveSessions:
    def test_active_sessions_10x(self, super_h, seeded_session_with_trial):
        results = []
        for _ in range(10):
            r = requests.get(f"{API}/sessions/active", headers=super_h, timeout=30)
            results.append(r.status_code)
        assert all(sc == 200 for sc in results), f"active sessions non-200s: {results}"

    def test_active_sessions_contains_seeded(self, super_h, seeded_session_with_trial):
        r = requests.get(f"{API}/sessions/active", headers=super_h, timeout=30)
        assert r.status_code == 200
        ids = [s["id"] for s in r.json()]
        assert seeded_session_with_trial["session_id"] in ids


# ---------------- 4. Session detail: fabric_b64 excluded ----------------
class TestSessionDetailProjection:
    def test_get_session_excludes_fabric_b64(self, super_h, seeded_session_with_trial):
        sid = seeded_session_with_trial["session_id"]
        r = requests.get(f"{API}/sessions/{sid}", headers=super_h, timeout=30)
        assert r.status_code == 200
        s = r.json()
        assert s["id"] == sid
        trials = s.get("trials")
        assert isinstance(trials, list) and len(trials) >= 1, "expected at least one trial"
        t = trials[0]
        # generated_image + fabric_thumb should be present
        assert t.get("generated_image", "").startswith("data:image/"), \
            "generated_image should be present in trial"
        assert t.get("fabric_thumb", "").startswith("data:image/"), \
            "fabric_thumb should be present in trial"
        # fabric_b64 MUST be excluded per projection
        for g in t.get("garments", []):
            assert "fabric_b64" not in g, \
                f"fabric_b64 leaked into session trial garment: keys={list(g.keys())}"

    def test_get_session_404(self, super_h):
        r = requests.get(f"{API}/sessions/does-not-exist-xyz", headers=super_h, timeout=30)
        assert r.status_code == 404


# ---------------- 5. Customers + export ----------------
class TestCustomersAndExport:
    def test_list_customers_has_stats(self, super_h, seeded_session_with_trial):
        r = requests.get(f"{API}/customers", headers=super_h, timeout=60)
        assert r.status_code == 200
        customers = r.json()
        assert isinstance(customers, list) and len(customers) >= 1
        # every customer must have the stats object w/ required keys
        required = {"total_sessions", "purchased_count", "not_purchased_count", "total_collected"}
        for c in customers:
            assert "stats" in c, f"customer missing stats: {c.get('id')}"
            missing = required - set(c["stats"].keys())
            assert not missing, f"stats missing keys {missing} for customer {c.get('id')}"

    def test_export_customers_xlsx(self, super_h):
        r = requests.get(f"{API}/customers/export", headers=super_h, timeout=60)
        assert r.status_code == 200
        ct = r.headers.get("content-type", "")
        assert "spreadsheet" in ct, f"unexpected content-type: {ct}"
        # xlsx = zip -> starts with PK
        assert r.content[:2] == b"PK", "xlsx magic bytes missing"


# ---------------- 6. Hammer key endpoints ----------------
class TestHammer:
    """Repeat key GETs 20x sequentially + burst-parallel to ensure no 5xx."""

    def _hammer_seq(self, url, headers=None, n=20):
        codes = []
        for _ in range(n):
            r = requests.get(url, headers=headers, timeout=30)
            codes.append(r.status_code)
        return codes

    def _hammer_parallel(self, url, headers=None, n=20, workers=10):
        def one():
            return requests.get(url, headers=headers, timeout=30).status_code

        with cf.ThreadPoolExecutor(max_workers=workers) as ex:
            return list(ex.map(lambda _: one(), range(n)))

    def test_settings_20x_no_5xx(self, super_h):
        codes = self._hammer_seq(f"{API}/settings", headers=super_h, n=20)
        assert all(200 <= c < 500 for c in codes), f"5xx from /settings: {codes}"
        assert codes.count(200) == 20, f"non-200 from /settings: {codes}"

    def test_sessions_active_20x_no_5xx(self, super_h):
        codes = self._hammer_seq(f"{API}/sessions/active", headers=super_h, n=20)
        assert all(200 <= c < 500 for c in codes), f"5xx from /sessions/active: {codes}"
        assert codes.count(200) == 20, f"non-200 from /sessions/active: {codes}"

    def test_display_state_20x_no_5xx(self, display_secret, seeded_session_with_trial):
        codes = self._hammer_seq(f"{API}/display/{display_secret}/state", n=20)
        assert all(200 <= c < 500 for c in codes), f"5xx from /display/state: {codes}"
        assert codes.count(200) == 20, f"non-200 from /display/state: {codes}"

    def test_display_state_parallel_no_5xx(self, display_secret, seeded_session_with_trial):
        """Simulate multiple LED boards polling concurrently."""
        codes = self._hammer_parallel(
            f"{API}/display/{display_secret}/state", n=20, workers=10
        )
        fivexx = [c for c in codes if c >= 500]
        assert not fivexx, f"got 5xx under parallel load: {codes}"
        assert codes.count(200) == 20, f"non-200 under parallel load: {codes}"

    def test_display_state_versioned_polling_is_light(
        self, super_h, display_secret, seeded_session_with_trial
    ):
        """Real client behaviour: first call gets version, then poll rapidly with ?v.

        Under steady state (before the 12s heartbeat cutoff expires) all subsequent
        calls with the same v MUST return unchanged:true with a small payload.
        We keep the preview alive across the window via heartbeat calls.
        """
        # ensure preview is fresh
        requests.post(
            f"{API}/display/preview",
            headers=super_h,
            json={"trial_id": seeded_session_with_trial["trial_id"]},
            timeout=30,
        )
        r0 = requests.get(f"{API}/display/{display_secret}/state", timeout=30)
        assert r0.status_code == 200
        version = r0.json()["version"]

        unchanged_count = 0
        heavy_bytes_seen = 0
        # tight loop, well inside the 12s heartbeat cutoff, ~1s total
        for _ in range(10):
            r = requests.get(
                f"{API}/display/{display_secret}/state",
                params={"v": version},
                timeout=30,
            )
            assert r.status_code == 200
            body = r.json()
            if body.get("unchanged"):
                unchanged_count += 1
                assert "previews" not in body
                assert len(r.content) < 2000
            else:
                heavy_bytes_seen += len(r.content)
        # allow at most 1 non-unchanged (in case preview expired mid-loop)
        assert unchanged_count >= 9, (
            f"expected >=9 unchanged, got {unchanged_count}; heavy={heavy_bytes_seen}"
        )
