"""
Backend tests for Somani Fabs API.
Covers: auth, admins, customers, sessions, trials (Gemini), display, stats, logs, config, export.
"""
import os
import io
import base64
import time
import pytest
import requests
from PIL import Image

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://unstitched-tryon-app.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

SUPER_USER = "superashwini"
SUPER_PASS = "6Lr£1Wp2VD`Q"

# ---------- Helpers ----------

def _jpeg_b64(color=(180, 60, 60), size=(256, 256)):
    """Synthetic solid color JPEG, base64 data url."""
    img = Image.new("RGB", size, color)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=70)
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()


@pytest.fixture(scope="session")
def super_token():
    r = requests.post(f"{API}/auth/login", json={"username": SUPER_USER, "password": SUPER_PASS}, timeout=30)
    assert r.status_code == 200, f"super login failed {r.status_code} {r.text}"
    data = r.json()
    assert "token" in data and data["user"]["role"] == "super"
    return data["token"]


@pytest.fixture(scope="session")
def super_h(super_token):
    return {"Authorization": f"Bearer {super_token}"}


@pytest.fixture(scope="session")
def shared_state():
    return {}


# ---------- Auth ----------
class TestAuth:
    def test_login_success(self, super_token):
        assert isinstance(super_token, str) and len(super_token) > 20

    def test_me(self, super_h):
        r = requests.get(f"{API}/auth/me", headers=super_h, timeout=30)
        assert r.status_code == 200
        u = r.json()
        assert u["username"] == SUPER_USER
        assert u["role"] == "super"

    def test_login_wrong_password(self):
        r = requests.post(f"{API}/auth/login", json={"username": SUPER_USER, "password": "wrong"}, timeout=30)
        assert r.status_code == 401

    def test_me_no_token(self):
        r = requests.get(f"{API}/auth/me", timeout=30)
        assert r.status_code == 401


# ---------- Config / Categories ----------
class TestConfig:
    def test_default_categories(self, super_h):
        r = requests.get(f"{API}/config/categories", headers=super_h, timeout=30)
        assert r.status_code == 200
        cats = r.json()
        labels = [c["label"] for c in cats]
        for needed in ["Top Wear", "Bottom Wear", "Top + Bottom", "Top + Bottom + 3rd"]:
            assert needed in labels, f"missing category {needed}"
        for c in cats:
            assert "slots" in c
            assert "items" in c and len(c["items"]) >= 1


# ---------- Admin management ----------
class TestAdmins:
    def test_create_admin_and_login(self, super_h, shared_state):
        uname = f"TEST_admin_{int(time.time())}"
        pw = "Pass1234!"
        r = requests.post(f"{API}/admins", headers=super_h, json={"username": uname, "password": pw}, timeout=30)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["username"] == uname and body["role"] == "admin"
        shared_state["admin_id"] = body["id"]
        shared_state["admin_user"] = uname
        shared_state["admin_pw"] = pw

        # list
        r = requests.get(f"{API}/admins", headers=super_h, timeout=30)
        assert r.status_code == 200
        assert any(a["username"] == uname for a in r.json())

        # login as new admin
        r = requests.post(f"{API}/auth/login", json={"username": uname, "password": pw}, timeout=30)
        assert r.status_code == 200
        tok = r.json()["token"]
        shared_state["admin_token"] = tok

    def test_non_super_forbidden(self, shared_state):
        h = {"Authorization": f"Bearer {shared_state['admin_token']}"}
        # adding category should be forbidden
        r = requests.post(f"{API}/config/categories", headers=h,
                          json={"label": "TEST_cat", "items": [], "order": 99}, timeout=30)
        assert r.status_code == 403
        # adding field forbidden
        r = requests.post(f"{API}/config/fields", headers=h,
                          json={"label": "TEST_field", "type": "text"}, timeout=30)
        assert r.status_code == 403


# ---------- Full session-trial-display-stats flow (single class so xdist loadscope keeps state) ----------
class TestSessionFlow:
    def test_create_session_creates_customer(self, super_h, shared_state):
        mobile = f"99{int(time.time()) % 100000000:08d}"
        shared_state["mobile"] = mobile
        body = {
            "customer_name": "TEST_Ramesh",
            "mobile": mobile,
            "mobile2": "9100000000",
            "photo": _jpeg_b64((200, 180, 160)),
            "extra": {"city": "Delhi"},
        }
        r = requests.post(f"{API}/sessions", headers=super_h, json=body, timeout=60)
        assert r.status_code == 200, r.text
        s = r.json()
        assert s["status"] == "active"
        assert s["customer_name"] == "TEST_Ramesh"
        assert s["mobile"] == mobile
        shared_state["session_id"] = s["id"]
        shared_state["customer_id"] = s["customer_id"]

    def test_second_session_reuses_customer(self, super_h, shared_state):
        body = {
            "customer_name": "TEST_Ramesh Updated",
            "mobile": shared_state["mobile"],
            "mobile2": "9100000000",
            "photo": _jpeg_b64((100, 100, 100)),
            "extra": {"city": "Delhi"},
        }
        r = requests.post(f"{API}/sessions", headers=super_h, json=body, timeout=60)
        assert r.status_code == 200
        s2 = r.json()
        assert s2["customer_id"] == shared_state["customer_id"], "customer should be reused"
        shared_state["session_id_2"] = s2["id"]

    def test_search_customer(self, super_h, shared_state):
        prefix = shared_state["mobile"][:5]
        r = requests.get(f"{API}/customers/search", params={"q": prefix}, headers=super_h, timeout=30)
        assert r.status_code == 200
        results = r.json()
        assert any(c["mobile"] == shared_state["mobile"] for c in results)

    def test_active_sessions_and_get(self, super_h, shared_state):
        r = requests.get(f"{API}/sessions/active", headers=super_h, timeout=30)
        assert r.status_code == 200
        ids = [s["id"] for s in r.json()]
        assert shared_state["session_id"] in ids

        r = requests.get(f"{API}/sessions/{shared_state['session_id']}", headers=super_h, timeout=30)
        assert r.status_code == 200
        sd = r.json()
        assert sd["id"] == shared_state["session_id"]
        assert "trials" in sd
        assert sd["trials"] == []

    # Gemini try-on (real call ~ 10-25s)
    def test_generate_trial(self, super_h, shared_state):
        sid = shared_state["session_id"]
        body = {
            "type": "Top Wear",
            "garments": [{
                "slot": "top",
                "garment_type": "Full Sleeve Shirt",
                "fabric_b64": _jpeg_b64((40, 90, 180)),
            }],
        }
        r = requests.post(f"{API}/sessions/{sid}/trials/generate",
                          headers=super_h, json=body, timeout=180)
        assert r.status_code == 200, f"Gemini trial failed: {r.status_code} {r.text[:500]}"
        t = r.json()
        assert t["generated_image"].startswith("data:image/")
        assert len(t["generated_image"]) > 1000
        assert t["fabric_thumb"].startswith("data:image/")
        assert "Full Sleeve Shirt" in t["description"]
        shared_state["trial_id"] = t["id"]

    def test_settings_and_display_state(self, super_h, shared_state):
        r = requests.get(f"{API}/settings", headers=super_h, timeout=30)
        assert r.status_code == 200
        s = r.json()
        assert "display_secret" in s and s["display_secret"]
        shared_state["display_secret"] = s["display_secret"]

    def test_preview_flow(self, super_h, shared_state):
        tid = shared_state["trial_id"]
        r = requests.post(f"{API}/display/preview", headers=super_h, json={"trial_id": tid}, timeout=30)
        assert r.status_code == 200
        secret = shared_state["display_secret"]
        r = requests.get(f"{API}/display/{secret}/state", timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert "previews" in d and len(d["previews"]) >= 1
        assert d["previews"][0]["image"].startswith("data:image/")
        r = requests.get(f"{API}/display/wrong-secret/state", timeout=30)
        assert r.status_code == 404
        r = requests.delete(f"{API}/display/preview", headers=super_h, timeout=30)
        assert r.status_code == 200
        r = requests.get(f"{API}/display/{secret}/state", timeout=30)
        assert r.status_code == 200
        previews = r.json().get("previews", [])
        assert all(p.get("admin_username") != SUPER_USER for p in previews)

    def test_end_session_and_history(self, super_h, shared_state):
        sid = shared_state["session_id"]
        r = requests.post(f"{API}/sessions/{sid}/end", headers=super_h,
                          json={"purchased": True, "total_value": 5000,
                                "discount": 500, "final_paid": 4500}, timeout=30)
        assert r.status_code == 200
        r = requests.get(f"{API}/sessions/history", headers=super_h, timeout=30)
        assert r.status_code == 200
        match = [s for s in r.json() if s["id"] == sid]
        assert match and match[0]["status"] == "closed" and match[0]["final_paid"] == 4500

    def test_stats_reflects_earnings(self, super_h):
        r = requests.get(f"{API}/stats", headers=super_h, timeout=30)
        assert r.status_code == 200
        st = r.json()
        assert st["total_earnings"] >= 4500
        assert st["purchased"] >= 1

    def test_customer_profile_stats(self, super_h, shared_state):
        r = requests.get(f"{API}/customers/{shared_state['customer_id']}",
                         headers=super_h, timeout=30)
        assert r.status_code == 200
        c = r.json()
        assert c["stats"]["purchased_count"] >= 1
        assert c["stats"]["total_collected"] >= 4500
        assert isinstance(c["sessions"], list)

    def test_logs_present(self, super_h):
        r = requests.get(f"{API}/logs", headers=super_h, timeout=30)
        assert r.status_code == 200
        actions = {l["action"] for l in r.json()}
        for a in ["login", "create_session", "generate_trial", "end_session"]:
            assert a in actions, f"missing log action {a}; got {actions}"

    def test_zz_cleanup_sessions(self, super_h, shared_state):
        for k in ("session_id", "session_id_2"):
            sid = shared_state.get(k)
            if sid:
                requests.delete(f"{API}/sessions/{sid}", headers=super_h, timeout=30)


# ---------- Gemini Try-on (real call) ----------
class _OldTryOn:
    def _disabled_test_generate_trial(self, super_h, shared_state):
        sid = shared_state["session_id"]
        body = {
            "type": "Top Wear",
            "garments": [{
                "slot": "top",
                "garment_type": "Full Sleeve Shirt",
                "fabric_b64": _jpeg_b64((40, 90, 180)),
            }],
        }
        r = requests.post(f"{API}/sessions/{sid}/trials/generate",
                          headers=super_h, json=body, timeout=180)
        assert r.status_code == 200, f"Gemini trial failed: {r.status_code} {r.text[:500]}"
        t = r.json()
        assert t["generated_image"].startswith("data:image/")
        assert len(t["generated_image"]) > 1000
        assert t["fabric_thumb"].startswith("data:image/")
        assert "Full Sleeve Shirt" in t["description"]
        shared_state["trial_id"] = t["id"]


# ---------- Live Display (now part of TestSessionFlow) ----------
class _OldDisplay:
    def _x_test_settings_and_display_state(self, super_h, shared_state):
        pass

    def _x_test_preview_flow(self, super_h, shared_state):
        pass


# ---------- End session, stats, customer profile (merged into TestSessionFlow) ----------
class _OldEndAndStats:
    def _x_test_end_session_and_history(self, super_h, shared_state):
        pass

    def _x_test_stats_reflects_earnings(self, super_h):
        pass

    def _x_test_customer_profile_stats(self, super_h, shared_state):
        pass


# ---------- Config CRUD by super ----------
class TestConfigCRUD:
    def test_add_delete_category(self, super_h):
        r = requests.post(f"{API}/config/categories", headers=super_h,
                          json={"label": "TEST_cat_X", "description": "x", "items": [], "order": 99}, timeout=30)
        assert r.status_code == 200
        cid = r.json()["id"]
        r = requests.delete(f"{API}/config/categories/{cid}", headers=super_h, timeout=30)
        assert r.status_code == 200

    def test_add_delete_field(self, super_h):
        r = requests.post(f"{API}/config/fields", headers=super_h,
                          json={"label": "TEST_field", "type": "text", "required": False, "order": 5}, timeout=30)
        assert r.status_code == 200
        fid = r.json()["id"]
        r = requests.delete(f"{API}/config/fields/{fid}", headers=super_h, timeout=30)
        assert r.status_code == 200


# ---------- Excel export ----------
class TestExport:
    def test_export_xlsx(self, super_h):
        r = requests.get(f"{API}/customers/export", headers=super_h, timeout=60)
        assert r.status_code == 200
        ct = r.headers.get("content-type", "")
        assert "spreadsheet" in ct, ct
        assert r.content[:2] == b"PK"  # xlsx is zip


# ---------- Logs (was moved into TestSessionFlow for state sharing) ----------
class _OldLogs:
    def _x_test_logs_present(self, super_h):
        pass


# ---------- Cleanup ----------
class TestCleanup:
    def test_delete_test_admin(self, super_h, shared_state):
        if shared_state.get("admin_id"):
            r = requests.delete(f"{API}/admins/{shared_state['admin_id']}",
                                headers=super_h, timeout=30)
            assert r.status_code == 200
