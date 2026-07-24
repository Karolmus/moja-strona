import atexit
import gzip
import json
import os
import shutil
import sqlite3
import tempfile
import time
import unittest


TEST_DIR = tempfile.mkdtemp(prefix="deltasigma-security-")
TEST_DB = os.path.join(TEST_DIR, "test.sqlite3")
atexit.register(shutil.rmtree, TEST_DIR, ignore_errors=True)

os.environ["DATABASE_PATH"] = TEST_DB
os.environ.pop("DATABASE_URL", None)
os.environ.pop("RENDER", None)
os.environ["SECRET_KEY"] = "test-secret-key-with-sufficient-randomness"
os.environ["CALCULATORS_ENABLED"] = "false"
os.environ["RATE_LIMIT_ENABLED"] = "true"
os.environ["CONTACT_FORM_MIN_SECONDS"] = "2"

import app as app_module  # noqa: E402
from app import _rate_limit_buckets, app  # noqa: E402
from auth_storage import create_parent_access_token, create_user  # noqa: E402


class SecurityTests(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()
        _rate_limit_buckets.clear()
        app_module.CALCULATORS_ENABLED = False

        with sqlite3.connect(TEST_DB) as connection:
            connection.execute("DELETE FROM site_analytics_daily")
            connection.execute("DELETE FROM site_analytics_visitors")
            connection.execute("DELETE FROM site_analytics_sessions")
            connection.execute("DELETE FROM speed_training_results")
            connection.execute("DELETE FROM task_review_items")
            connection.execute("DELETE FROM task_progress")
            connection.execute("DELETE FROM parent_access_tokens")
            connection.execute("DELETE FROM contact_messages")
            connection.execute("DELETE FROM users")
            connection.commit()

    def contact_count(self):
        with sqlite3.connect(TEST_DB) as connection:
            return connection.execute("SELECT COUNT(*) FROM contact_messages").fetchone()[0]

    def valid_contact_payload(self):
        return {
            "contact": "test@example.com",
            "message": "Proszę o kontakt.",
            "form_started_at": int((time.time() - 5) * 1000),
            "website": "",
        }

    def test_calculators_are_disabled_at_api_level(self):
        response = self.client.post(
            "/api/poly",
            json={"coeffs": [1, 0, -1]},
        )

        self.assertEqual(response.status_code, 404)

    def test_enabled_calculators_require_login_and_validate_input(self):
        app_module.CALCULATORS_ENABLED = True

        unauthenticated = self.client.post(
            "/api/bernoulli",
            json={"p": 0.5, "n": 5, "k": [2]},
        )
        self.assertEqual(unauthenticated.status_code, 401)

        with app.app_context():
            create_user(
                email="student@example.com",
                display_name="Uczeń",
                password="bezpieczne-haslo",
            )

        login = self.client.post(
            "/api/auth/login",
            json={
                "email": "student@example.com",
                "password": "bezpieczne-haslo",
            },
        )
        token = login.get_json()["token"]
        headers = {"Authorization": f"Bearer {token}"}

        invalid = self.client.post(
            "/api/bernoulli",
            json={"p": 0.5, "n": 10000, "k": [2]},
            headers=headers,
        )
        valid = self.client.post(
            "/api/angle",
            json={"a1": 0, "a2": 1},
            headers=headers,
        )

        self.assertEqual(invalid.status_code, 400)
        self.assertEqual(valid.status_code, 200)

    def test_honeypot_does_not_write_to_database(self):
        payload = self.valid_contact_payload()
        payload["website"] = "https://spam.example"

        response = self.client.post("/api/contact-messages", json=payload)

        self.assertEqual(response.status_code, 201)
        self.assertEqual(self.contact_count(), 0)

    def test_contact_form_rejects_submission_that_is_too_fast(self):
        payload = self.valid_contact_payload()
        payload["form_started_at"] = int(time.time() * 1000)

        response = self.client.post("/api/contact-messages", json=payload)

        self.assertEqual(response.status_code, 429)
        self.assertEqual(self.contact_count(), 0)

    def test_public_contact_form_accepts_empty_optional_fields(self):
        response = self.client.post(
            "/api/contact-messages",
            json={
                "contact": "",
                "preferred_term": "",
                "message": "",
                "form_started_at": int((time.time() - 5) * 1000),
                "website": "",
            },
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(self.contact_count(), 1)

    def test_contact_form_is_rate_limited(self):
        payload = self.valid_contact_payload()

        for _ in range(5):
            response = self.client.post("/api/contact-messages", json=payload)
            self.assertEqual(response.status_code, 201)

        response = self.client.post("/api/contact-messages", json=payload)

        self.assertEqual(response.status_code, 429)
        self.assertEqual(self.contact_count(), 5)

    def test_oversized_request_is_rejected(self):
        response = self.client.post(
            "/api/contact-messages",
            json={
                "contact": "test@example.com",
                "message": "x" * 40000,
            },
        )

        self.assertEqual(response.status_code, 413)

    def test_api_security_headers_are_present(self):
        response = self.client.get("/api/health")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers.get("Cache-Control"), "no-store, max-age=0")
        self.assertEqual(response.headers.get("X-Content-Type-Options"), "nosniff")
        self.assertEqual(response.headers.get("X-Frame-Options"), "DENY")

    def test_large_json_responses_are_compressed(self):
        payload = self.valid_contact_payload()
        payload["message"] = "x" * 2000

        response = self.client.post(
            "/api/contact-messages",
            json=payload,
            headers={"Accept-Encoding": "gzip"},
        )
        decoded = json.loads(gzip.decompress(response.data))

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.headers.get("Content-Encoding"), "gzip")
        self.assertEqual(decoded["message"]["contact"], "test@example.com")

    def test_public_contact_form_cannot_spoof_parent_origin(self):
        payload = self.valid_contact_payload()
        payload["origin"] = "parent"
        payload["user_id"] = 123

        response = self.client.post("/api/contact-messages", json=payload)

        self.assertEqual(response.status_code, 201)

        with sqlite3.connect(TEST_DB) as connection:
            row = connection.execute(
                "SELECT origin, user_id FROM contact_messages"
            ).fetchone()

        self.assertEqual(row, ("prospect", None))

    def test_parent_message_requires_valid_token_and_is_assigned_to_student(self):
        with app.app_context():
            student = create_user(
                email="parent-message-student",
                display_name="Uczeń Testowy",
                password="bezpieczne-haslo",
                level="egzamin_osmoklasisty",
            )
            _access, token = create_parent_access_token(student["id"])

        invalid = self.client.post(
            "/api/parent/messages",
            json={"token": "nieprawidlowy-token", "message": "Pytanie"},
        )
        valid = self.client.post(
            "/api/parent/messages",
            json={"token": token, "message": "Czy można przełożyć zajęcia?"},
        )

        self.assertEqual(invalid.status_code, 401)
        self.assertEqual(valid.status_code, 201)

        with sqlite3.connect(TEST_DB) as connection:
            row = connection.execute(
                "SELECT contact, message, origin, user_id FROM contact_messages"
            ).fetchone()

        self.assertEqual(row[0], "Rodzic ucznia: Uczeń Testowy")
        self.assertEqual(row[1], "Czy można przełożyć zajęcia?")
        self.assertEqual(row[2], "parent")
        self.assertEqual(row[3], student["id"])

    def test_pageviews_are_aggregated_and_visible_only_to_admin(self):
        pageview = {
            "path": "/index.html",
            "visitor_id": "visitor-00000001",
            "session_id": "session-00000001",
            "referrer_host": "",
            "device_type": "desktop",
        }
        headers = {
            "Origin": "https://deltasigma.pl",
            "User-Agent": "Mozilla/5.0",
        }

        first = self.client.post("/api/analytics/pageview", json=pageview, headers=headers)
        second = self.client.post("/api/analytics/pageview", json=pageview, headers=headers)
        another_visitor = self.client.post(
            "/api/analytics/pageview",
            json={
                **pageview,
                "visitor_id": "visitor-00000002",
                "path": "/zadania.html",
                "device_type": "mobile",
            },
            headers=headers,
        )
        unauthorized = self.client.get("/api/admin/analytics?days=7")

        self.assertEqual(first.status_code, 201)
        self.assertEqual(second.status_code, 201)
        self.assertEqual(another_visitor.status_code, 201)
        self.assertEqual(unauthorized.status_code, 401)

        with app.app_context():
            create_user(
                email="admin@example.com",
                display_name="Administrator",
                password="bezpieczne-haslo",
                role="admin",
                level=None,
            )

        login = self.client.post(
            "/api/auth/login",
            json={
                "email": "admin@example.com",
                "password": "bezpieczne-haslo",
            },
        )
        token = login.get_json()["token"]
        admin_pageview = self.client.post(
            "/api/analytics/pageview",
            json={
                **pageview,
                "visitor_id": "admin-visitor-0001",
                "session_id": "admin-session-0001",
            },
            headers={
                **headers,
                "Authorization": f"Bearer {token}",
            },
        )
        response = self.client.get(
            "/api/admin/analytics?days=7",
            headers={"Authorization": f"Bearer {token}"},
        )
        data = response.get_json()

        self.assertEqual(admin_pageview.status_code, 204)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(data["overview"]["views"], 3)
        self.assertEqual(data["overview"]["visitors"], 2)
        self.assertEqual(data["overview"]["sessions"], 1)
        self.assertEqual(data["pages"][0]["path"], "/")
        self.assertEqual(data["pages"][0]["views"], 2)

    def test_bots_and_foreign_origins_do_not_write_analytics(self):
        pageview = {
            "path": "/",
            "visitor_id": "visitor-00000001",
            "session_id": "session-00000001",
            "device_type": "desktop",
        }

        bot = self.client.post(
            "/api/analytics/pageview",
            json=pageview,
            headers={
                "Origin": "https://deltasigma.pl",
                "User-Agent": "ExampleBot/1.0",
            },
        )
        foreign = self.client.post(
            "/api/analytics/pageview",
            json=pageview,
            headers={
                "Origin": "https://spam.example",
                "User-Agent": "Mozilla/5.0",
            },
        )

        self.assertEqual(bot.status_code, 204)
        self.assertEqual(foreign.status_code, 204)

        with sqlite3.connect(TEST_DB) as connection:
            count = connection.execute(
                "SELECT SUM(page_views) FROM site_analytics_daily"
            ).fetchone()[0]

        self.assertIsNone(count)


if __name__ == "__main__":
    unittest.main()
