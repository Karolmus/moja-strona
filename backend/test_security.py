import atexit
import gzip
import json
import os
import shutil
import sqlite3
import tempfile
import time
import unittest
from unittest.mock import patch


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
from auth_storage import (  # noqa: E402
    ANALYTICS_RESET_KEY,
    create_parent_access_token,
    create_user,
    get_student_credentials,
    init_auth_db,
)


class SecurityTests(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()
        _rate_limit_buckets.clear()
        app_module.CALCULATORS_ENABLED = False

        with app_module._schedule_cache_lock:
            app_module._schedule_cache["rows"] = None
            app_module._schedule_cache["updated_at"] = 0.0

        with sqlite3.connect(TEST_DB) as connection:
            connection.execute("DELETE FROM site_analytics_daily")
            connection.execute("DELETE FROM site_analytics_visitors")
            connection.execute("DELETE FROM site_analytics_sessions")
            connection.execute("DELETE FROM site_analytics_campaigns")
            connection.execute("DELETE FROM security_rate_limits")
            connection.execute("DELETE FROM speed_training_attempts")
            connection.execute("DELETE FROM speed_training_results")
            connection.execute("DELETE FROM task_review_items")
            connection.execute("DELETE FROM task_progress")
            connection.execute("DELETE FROM parent_access_tokens")
            connection.execute("DELETE FROM schedule_reservations")
            connection.execute("DELETE FROM contact_messages")
            connection.execute("DELETE FROM users")
            connection.commit()

    def contact_count(self):
        with sqlite3.connect(TEST_DB) as connection:
            return connection.execute("SELECT COUNT(*) FROM contact_messages").fetchone()[0]

    def reserved_terms(self):
        with sqlite3.connect(TEST_DB) as connection:
            return [row[0] for row in connection.execute(
                "SELECT term_label FROM schedule_reservations ORDER BY term_label"
            ).fetchall()]

    def valid_contact_payload(self):
        return {
            "contact": "+48 501 234 567",
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

    def test_schedule_proxy_returns_the_public_grid(self):
        class SheetResponse:
            def __enter__(self):
                return self

            def __exit__(self, _type, _value, _traceback):
                return False

            def read(self, _size):
                return b"Godz.,Pn.,Wt.\n8:00,,zajete\n9:00,zajete,\n"

        with patch.object(app_module, "urlopen", return_value=SheetResponse()) as mocked_urlopen:
            response = self.client.get(
                "/api/schedule",
                headers={"Origin": "https://deltasigma.pl"},
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.get_json()["schedule"],
            [
                ["Godz.", "Pn.", "Wt."],
                ["8:00", "", "zajete"],
                ["9:00", "zajete", ""],
            ],
        )
        self.assertEqual(
            response.headers.get("Access-Control-Allow-Origin"),
            "https://deltasigma.pl",
        )
        self.assertEqual(
            mocked_urlopen.call_args.args[0].full_url,
            app_module.SCHEDULE_SHEET_URL,
        )

    def test_schedule_proxy_uses_last_valid_schedule_if_google_is_unavailable(self):
        cached_rows = [["Godz.", "Pn."], ["8:00", ""]]

        with app_module._schedule_cache_lock:
            app_module._schedule_cache["rows"] = cached_rows
            app_module._schedule_cache["updated_at"] = 0.0

        with patch.object(app_module, "urlopen", side_effect=OSError("offline")):
            response = self.client.get("/api/schedule")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["schedule"], cached_rows)

    def test_contact_form_reserves_a_selected_schedule_term(self):
        class SheetResponse:
            def __enter__(self):
                return self

            def __exit__(self, _type, _value, _traceback):
                return False

            def read(self, _size):
                return b"Godz.,Pn.,Wt.\n8:00,,zajete\n9:00,zajete,\n"

        payload = self.valid_contact_payload()
        payload.update({
            "selected_terms": ["Pn. 8:00"],
            "sessions_per_week_count": 1,
        })

        with patch.object(app_module, "urlopen", return_value=SheetResponse()):
            first = self.client.post("/api/contact-messages", json=payload)
            schedule = self.client.get("/api/schedule")
            second = self.client.post("/api/contact-messages", json=payload)

        self.assertEqual(first.status_code, 201)
        self.assertEqual(first.get_json()["reserved_terms"], ["Pn. 8:00"])
        self.assertEqual(schedule.status_code, 200)
        self.assertEqual(schedule.get_json()["schedule"][1][1], "zarezerwowany")
        self.assertEqual(second.status_code, 409)
        self.assertEqual(self.contact_count(), 1)

    def test_contact_form_allows_agreeing_remaining_weekly_terms(self):
        rows = [["Godz.", "Pn.", "Wt."], ["8:00", "", ""], ["9:00", "", ""]]
        cases = [
            (2, ["Pn. 8:00"]),
            (3, ["Wt. 8:00"]),
            (3, ["Pn. 9:00", "Wt. 9:00"]),
        ]
        for count, terms in cases:
            with self.subTest(count=count, terms=terms):
                payload = self.valid_contact_payload()
                payload.update({"selected_terms": terms, "sessions_per_week_count": count})
                with patch.object(app_module, "schedule_rows", return_value=rows):
                    response = self.client.post("/api/contact-messages", json=payload)
                self.assertEqual(response.status_code, 201, response.get_json())
                self.assertEqual(response.get_json()["reserved_terms"], terms)

        self.assertEqual(self.contact_count(), 3)
        self.assertEqual(self.reserved_terms(), ["Pn. 8:00", "Pn. 9:00", "Wt. 8:00", "Wt. 9:00"])

    def test_contact_form_reserves_two_or_three_weekly_terms(self):
        rows = [["Godz.", "Pn.", "Wt.", "Sr."], ["8:00", "", "", ""], ["9:00", "", "", ""]]
        cases = [
            (2, ["Pn. 8:00", "Wt. 8:00"]),
            (3, ["Pn. 9:00", "Wt. 9:00", "Sr. 9:00"]),
        ]
        for count, terms in cases:
            with self.subTest(count=count):
                payload = self.valid_contact_payload()
                payload.update({"selected_terms": terms, "sessions_per_week_count": count})
                with patch.object(app_module, "schedule_rows", return_value=rows):
                    response = self.client.post("/api/contact-messages", json=payload)
                self.assertEqual(response.status_code, 201, response.get_json())
                self.assertEqual(response.get_json()["reserved_terms"], terms)

        self.assertEqual(self.contact_count(), 2)
        self.assertEqual(len(self.reserved_terms()), 5)

    def test_contact_form_allows_manual_availability_for_multiple_weekly_sessions(self):
        for count in (2, 3):
            with self.subTest(count=count):
                payload = self.valid_contact_payload()
                payload.update({
                    "selected_terms": [],
                    "sessions_per_week_count": count,
                    "preferred_term": "Do uzgodnienia telefonicznie",
                })
                response = self.client.post("/api/contact-messages", json=payload)
                self.assertEqual(response.status_code, 201, response.get_json())
                self.assertEqual(response.get_json()["reserved_terms"], [])
                self.assertEqual(response.get_json()["message"]["preferred_term"], payload["preferred_term"])

        self.assertEqual(self.contact_count(), 2)
        self.assertEqual(self.reserved_terms(), [])

    def test_contact_form_allows_skipping_the_schedule_step(self):
        for count in (1, 2, 3):
            with self.subTest(count=count):
                payload = self.valid_contact_payload()
                payload.update({
                    "selected_terms": [],
                    "sessions_per_week_count": count,
                    "preferred_term": "",
                })
                with patch.object(app_module, "schedule_rows") as schedule:
                    response = self.client.post("/api/contact-messages", json=payload)
                schedule.assert_not_called()
                self.assertEqual(response.status_code, 201, response.get_json())
                self.assertEqual(response.get_json()["reserved_terms"], [])
                self.assertIsNone(response.get_json()["message"]["preferred_term"])

        self.assertEqual(self.contact_count(), 3)
        self.assertEqual(self.reserved_terms(), [])

    def test_contact_form_rejects_excess_terms_or_invalid_weekly_frequency(self):
        rows = [["Godz.", "Pn.", "Wt.", "Sr."], ["8:00", "", "", ""]]
        cases = [
            (1, ["Pn. 8:00", "Wt. 8:00"]),
            (2, ["Pn. 8:00", "Wt. 8:00", "Sr. 8:00"]),
            (0, ["Pn. 8:00"]),
            (4, ["Pn. 8:00"]),
            (None, ["Pn. 8:00"]),
        ]
        for count, terms in cases:
            with self.subTest(count=count):
                payload = self.valid_contact_payload()
                payload.update({"selected_terms": terms, "sessions_per_week_count": count})
                with patch.object(app_module, "schedule_rows", return_value=rows):
                    response = self.client.post("/api/contact-messages", json=payload)
                self.assertEqual(response.status_code, 400, response.get_json())

        self.assertEqual(self.contact_count(), 0)
        self.assertEqual(self.reserved_terms(), [])

    def test_contact_form_rolls_back_all_terms_when_one_has_been_reserved(self):
        rows = [["Godz.", "Pn.", "Wt.", "Sr."], ["8:00", "", "", ""]]
        payload = self.valid_contact_payload()
        payload.update({"selected_terms": ["Wt. 8:00"], "sessions_per_week_count": 1})
        with patch.object(app_module, "schedule_rows", return_value=rows):
            first = self.client.post("/api/contact-messages", json=payload)
            payload.update({
                "selected_terms": ["Pn. 8:00", "Wt. 8:00", "Sr. 8:00"],
                "sessions_per_week_count": 3,
            })
            response = self.client.post("/api/contact-messages", json=payload)

        self.assertEqual(first.status_code, 201)
        self.assertEqual(response.status_code, 409)
        self.assertEqual(self.contact_count(), 1)
        self.assertEqual(self.reserved_terms(), ["Wt. 8:00"])

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

    def test_public_contact_form_requires_phone_number(self):
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

        self.assertEqual(response.status_code, 400)
        self.assertEqual(self.contact_count(), 0)

    def test_public_contact_form_rejects_non_phone_contact(self):
        payload = self.valid_contact_payload()
        payload["contact"] = "test@example.com"

        response = self.client.post("/api/contact-messages", json=payload)

        self.assertEqual(response.status_code, 400)
        self.assertEqual(self.contact_count(), 0)

    def test_contact_form_is_rate_limited(self):
        payload = self.valid_contact_payload()

        for _ in range(5):
            response = self.client.post("/api/contact-messages", json=payload)
            self.assertEqual(response.status_code, 201)

        _rate_limit_buckets.clear()
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
        self.assertEqual(response.headers.get("Referrer-Policy"), "no-referrer")
        self.assertEqual(
            response.headers.get("Permissions-Policy"),
            "camera=(), microphone=(), geolocation=()",
        )
        self.assertEqual(
            response.headers.get("Strict-Transport-Security"),
            "max-age=31536000; includeSubDomains",
        )

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
        self.assertEqual(decoded["message"]["contact"], "+48 501 234 567")

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
            "utm_source": "facebook",
            "utm_medium": "community",
            "utm_campaign": "rekrutacja_2026_27",
            "utm_content": "grupy_rodzicow",
            "utm_landing_path": "/zapisy.html",
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
        self.assertEqual(data["campaigns"][0]["source"], "facebook")
        self.assertEqual(data["campaigns"][0]["content"], "grupy_rodzicow")
        self.assertEqual(data["campaigns"][0]["clicks"], 1)

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

    def test_analytics_without_origin_is_ignored(self):
        response = self.client.post(
            "/api/analytics/pageview",
            json={
                "path": "/",
                "visitor_id": "visitor-without-origin",
                "session_id": "session-without-origin",
                "device_type": "desktop",
            },
            headers={"User-Agent": "Mozilla/5.0"},
        )

        self.assertEqual(response.status_code, 204)

        with sqlite3.connect(TEST_DB) as connection:
            count = connection.execute(
                "SELECT SUM(page_views) FROM site_analytics_daily"
            ).fetchone()[0]

        self.assertIsNone(count)

    def test_logout_and_password_reset_revoke_bearer_tokens(self):
        with app.app_context():
            student = create_user(
                email="revoke@example.com",
                display_name="Uczeń",
                password="bezpieczne-haslo",
            )

        first_login = self.client.post(
            "/api/auth/login",
            json={"email": student["email"], "password": "bezpieczne-haslo"},
        )
        first_headers = {
            "Authorization": f"Bearer {first_login.get_json()['token']}"
        }

        self.assertEqual(
            self.client.get("/api/progress/me", headers=first_headers).status_code,
            200,
        )
        self.client.post("/api/auth/logout", headers=first_headers)
        self.assertEqual(
            self.client.get("/api/progress/me", headers=first_headers).status_code,
            401,
        )

        second_login = self.client.post(
            "/api/auth/login",
            json={"email": student["email"], "password": "bezpieczne-haslo"},
        )
        second_headers = {
            "Authorization": f"Bearer {second_login.get_json()['token']}"
        }

        with app.app_context():
            app_module.reset_user_password(student["id"], "nowe-bezpieczne-haslo")

        self.assertEqual(
            self.client.get("/api/progress/me", headers=second_headers).status_code,
            401,
        )

    def test_training_result_requires_started_attempt(self):
        with app.app_context():
            student = create_user(
                email="training@example.com",
                display_name="Uczeń Testowy",
                password="bezpieczne-haslo",
            )

        login = self.client.post(
            "/api/auth/login",
            json={"email": student["email"], "password": "bezpieczne-haslo"},
        )
        headers = {"Authorization": f"Bearer {login.get_json()['token']}"}
        response = self.client.post(
            "/api/speed-training/results",
            headers=headers,
            json={
                "attempt_token": "",
                "level": "mp",
                "topic": "all",
                "difficulty": "mixed",
                "round_seconds": 120,
                "correct_count": 10000,
                "mistake_count": 0,
                "best_streak": 10000,
            },
        )

        self.assertEqual(response.status_code, 400)

        with sqlite3.connect(TEST_DB) as connection:
            count = connection.execute(
                "SELECT COUNT(*) FROM speed_training_results"
            ).fetchone()[0]

        self.assertEqual(count, 0)

    def test_progress_rejects_external_task_reference(self):
        with app.app_context():
            student = create_user(
                email="progress@example.com",
                display_name="Uczeń",
                password="bezpieczne-haslo",
            )

        login = self.client.post(
            "/api/auth/login",
            json={"email": student["email"], "password": "bezpieczne-haslo"},
        )
        headers = {"Authorization": f"Bearer {login.get_json()['token']}"}
        response = self.client.post(
            "/api/progress",
            headers=headers,
            json={
                "task_id": "https://attacker.example/tasks.json:image.png",
                "source_id": "https://attacker.example/tasks.json",
                "file": "image.png",
                "result": "good",
            },
        )

        self.assertEqual(response.status_code, 400)

    def test_course_progress_is_saved_and_available_immediately(self):
        with app.app_context():
            student = create_user(
                email="course-progress@example.com",
                display_name="Uczeń",
                password="bezpieczne-haslo",
                level="egzamin_osmoklasisty",
            )

        login = self.client.post(
            "/api/auth/login",
            json={"email": student["email"], "password": "bezpieczne-haslo"},
        )
        headers = {"Authorization": f"Bearer {login.get_json()['token']}"}
        source_id = "zadania/kurs/eo/lekcja_1/lekcja_1_odczytywanie_danych_i_procenty.json"
        task = {
            "task_id": f"{source_id}:zd_1.png",
            "source_id": source_id,
            "file": "zd_1.png",
            "topic": "Procenty",
            "result": "good",
            "earned_points": 1,
            "max_points": 1,
        }

        saved = self.client.post("/api/progress", headers=headers, json=task)
        progress = self.client.get("/api/progress/me", headers=headers)
        progress_data = progress.get_json()

        self.assertEqual(saved.status_code, 201)
        self.assertEqual(progress.status_code, 200)
        self.assertEqual(len(progress_data["progress"]), 1)
        self.assertEqual(progress_data["progress"][0]["task_id"], task["task_id"])
        self.assertEqual(progress_data["progress"][0]["level"], "egzamin_osmoklasisty")

    def test_student_can_read_own_review_history(self):
        with app.app_context():
            student = create_user(
                email="review-history@example.com",
                display_name="Uczeń",
                password="bezpieczne-haslo",
                level="egzamin_osmoklasisty",
            )

        unauthenticated = self.client.get("/api/review-tasks/me")
        login = self.client.post(
            "/api/auth/login",
            json={"email": student["email"], "password": "bezpieczne-haslo"},
        )
        headers = {"Authorization": f"Bearer {login.get_json()['token']}"}
        source_id = "zadania/kurs/eo/lekcja_1/lekcja_1_odczytywanie_danych_i_procenty.json"
        task = {
            "task_id": f"{source_id}:zd_1.png",
            "source_id": source_id,
            "file": "zd_1.png",
            "topic": "Procenty",
            "course_part": "praca_domowa",
        }

        created = self.client.post("/api/review-tasks", headers=headers, json=task)
        response = self.client.get("/api/review-tasks/me", headers=headers)
        data = response.get_json()

        self.assertEqual(unauthenticated.status_code, 401)
        self.assertEqual(created.status_code, 201)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(data["review_tasks"]), 1)
        self.assertEqual(data["review_tasks"][0]["task_id"], task["task_id"])

    def test_course_assets_require_login_and_assigned_level(self):
        path = "/api/course-assets/eo/lekcja_1/lekcja_1_odczytywanie_danych_i_procenty.json"
        unauthenticated = self.client.get(path)

        with app.app_context():
            student = create_user(
                email="course@example.com",
                display_name="Uczeń",
                password="bezpieczne-haslo",
                level="egzamin_osmoklasisty",
            )

        login = self.client.post(
            "/api/auth/login",
            json={"email": student["email"], "password": "bezpieczne-haslo"},
        )
        headers = {"Authorization": f"Bearer {login.get_json()['token']}"}
        assigned = self.client.get(path, headers=headers)
        other_level = self.client.get(
            "/api/course-assets/mp/zadania_kurs_mp.json",
            headers=headers,
        )

        self.assertEqual(unauthenticated.status_code, 401)
        self.assertEqual(assigned.status_code, 200)
        self.assertEqual(other_level.status_code, 403)
        assigned.close()

    def test_mp_student_can_load_first_lesson_and_images(self):
        path = "/api/course-assets/mp/lekcja_1/lekcja_1_potegi_i_pierwiastki.json"
        self.assertEqual(self.client.get(path).status_code, 401)

        with app.app_context():
            student = create_user(
                email="mp-course@example.com",
                display_name="Test MP",
                password="bezpieczne-haslo",
                level="matura_podstawowa",
            )

        login = self.client.post(
            "/api/auth/login",
            json={"email": student["email"], "password": "bezpieczne-haslo"},
        )
        headers = {"Authorization": f"Bearer {login.get_json()['token']}"}
        session_response = self.client.get("/api/auth/me", headers=headers)
        self.assertEqual(session_response.get_json()["user"]["level"], "matura_podstawowa")

        with self.client.get(path, headers=headers) as response:
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.headers["Cache-Control"], "private, no-store")
            tasks = response.get_json()
            self.assertEqual(len(tasks), 11)
            self.assertEqual(sum(task["coursePart"] == "praca_domowa" for task in tasks), 11)

        with self.client.get("/api/course-assets/mp/lekcja_1/zd1.png", headers=headers) as image:
            self.assertEqual(image.status_code, 200)
            self.assertEqual(image.mimetype, "image/png")

        self.assertEqual(self.client.get(
            "/api/course-assets/eo/lekcja_1/lekcja_1_odczytywanie_danych_i_procenty.json",
            headers=headers,
        ).status_code, 403)

        with tempfile.TemporaryDirectory() as empty_assets:
            with patch.object(app_module, "COURSE_ASSET_ROOT", empty_assets):
                missing = self.client.get(path, headers=headers)
        self.assertEqual(missing.status_code, 404)
        self.assertEqual(missing.mimetype, "application/json")
        self.assertEqual(missing.headers["Cache-Control"], "private, no-store")

    def test_mp_student_can_load_second_lesson_and_save_revision(self):
        source_id = "zadania/kurs/mp/lekcja_2/lekcja_2_logarytmy.json"
        path = "/api/course-assets/mp/lekcja_2/lekcja_2_logarytmy.json"
        self.assertEqual(self.client.get(path).status_code, 401)
        with app.app_context():
            student = create_user(
                email="mp-lesson2@example.com",
                display_name="Test MP",
                password="bezpieczne-haslo",
                level="matura_podstawowa",
            )
        login = self.client.post(
            "/api/auth/login",
            json={"email": student["email"], "password": "bezpieczne-haslo"},
        )
        headers = {"Authorization": f"Bearer {login.get_json()['token']}"}
        with self.client.get(path, headers=headers) as response:
            self.assertEqual(response.status_code, 200)
            tasks = response.get_json()
            self.assertEqual(len(tasks), 18)
            self.assertEqual(sum(t["coursePart"] == "praca_domowa" for t in tasks), 14)
            self.assertEqual(sum(t["coursePart"] == "zadania_powtorkowe" for t in tasks), 4)
        for file in ["zd12.png", "zd13.png", "zd14.png", "zp1.png", "zp4.png"]:
            with self.client.get(f"/api/course-assets/mp/lekcja_2/{file}", headers=headers) as response:
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.mimetype, "image/png")
        task = {
            "task_id": f"{source_id}:zp1.png", "source_id": source_id, "file": "zp1.png",
            "category": "kurs", "topic": "potęgi i pierwiastki", "result": "good",
            "earned_points": 1, "max_points": 1, "course_part": "zadania_powtorkowe",
        }
        self.assertEqual(self.client.post("/api/progress", headers=headers, json=task).status_code, 201)
        progress = self.client.get("/api/progress/me", headers=headers).get_json()["progress"]
        self.assertEqual(len(progress), 1)
        self.assertEqual(progress[0]["task_id"], task["task_id"])
        self.assertEqual(self.client.post("/api/review-tasks", headers=headers, json=task).status_code, 201)
        review = self.client.get("/api/review-tasks/me", headers=headers).get_json()["review_tasks"]
        self.assertEqual(review[0]["course_part"], "zadania_powtorkowe")

    def test_remembered_auth_expires_after_thirty_days(self):
        with app.app_context():
            student = create_user("remember@example.test", "Remember", "bezpieczne-haslo")
            now = time.time()
            with patch("time.time", return_value=now - 2 * 86400):
                ordinary = app_module.create_auth_token(student)
                remembered = app_module.create_auth_token(student, remember=True)
            self.assertIsNone(app_module.user_from_token(ordinary))
            self.assertEqual(app_module.user_from_token(remembered)["id"], student["id"])
            with patch("time.time", return_value=now + 30 * 86400):
                self.assertIsNone(app_module.user_from_token(remembered))
            login = self.client.post("/api/auth/login", json={
                "email":student["email"], "password":"bezpieczne-haslo", "remember":True
            })
            signed = app_module.auth_serializer().loads(login.get_json()["token"])
            self.assertIs(signed["remember"], True)
            self.assertIn("Expires=", login.headers.get("Set-Cookie", ""))
            app_module.revoke_user_auth(student["id"])
            self.assertIsNone(app_module.user_from_token(remembered))

    def test_only_admin_can_enable_full_course_and_revoke_access(self):
        with app.app_context():
            student = create_user("access@example.test", "Access", "bezpieczne-haslo")
            other = create_user("other@example.test", "Other", "bezpieczne-haslo")
            admin = create_user("admin-access@example.test", "Admin", "bezpieczne-haslo", role="admin")
            student_headers = {"Authorization": "Bearer " + app_module.create_auth_token(student)}
            other_headers = {"Authorization": "Bearer " + app_module.create_auth_token(other)}
            admin_headers = {"Authorization": "Bearer " + app_module.create_auth_token(admin)}
        root = "/api/course-assets/mp/lekcja_1/"
        manifest = root + "lekcja_1_potegi_i_pierwiastki.json"
        endpoint = f"/api/admin/students/{student['id']}"
        self.assertIs(self.client.get("/api/auth/me", headers=student_headers).get_json()["user"]["full_course_access"], False)
        self.assertEqual(self.client.get(root + "1.png", headers=student_headers).status_code, 403)
        self.assertEqual(self.client.get(root + "lekcja_1_potegi_i_pierwiastki.pdf", headers=student_headers).status_code, 403)
        self.assertEqual(len(self.client.get(manifest, headers=student_headers).get_json()), 11)
        self.assertEqual(self.client.patch(endpoint, headers=student_headers, json={"full_course_access": True}).status_code, 403)
        self.assertEqual(self.client.patch(endpoint, headers=admin_headers, json={"full_course_access": "true"}).status_code, 400)
        updated = self.client.patch(endpoint, headers=admin_headers, json={"full_course_access": True})
        self.assertIs(updated.get_json()["student"]["full_course_access"], True)
        with self.client.get(manifest, headers=student_headers) as response:
            self.assertEqual(len(response.get_json()), 29)
        with self.client.get(root + "1.png", headers=student_headers) as response:
            self.assertEqual(response.status_code, 200)
        self.assertEqual(self.client.get(root + "1.png", headers=other_headers).status_code, 403)
        source = "zadania/kurs/mp/lekcja_1/lekcja_1_potegi_i_pierwiastki.json"
        task = {"source_id":source, "file":"1.png", "task_id":source+":1.png", "result":"bad", "course_part":"praca_domowa"}
        self.assertEqual(self.client.post("/api/progress", headers=student_headers, json=task).status_code, 201)
        self.client.patch(endpoint, headers=admin_headers, json={"full_course_access":False})
        self.assertEqual(self.client.get(root + "1.png", headers=student_headers).status_code, 403)
        self.assertEqual(self.client.post("/api/progress", headers=student_headers, json=task).status_code, 400)
        self.assertEqual(self.client.post("/api/review-tasks", headers=student_headers, json=task).status_code, 400)
        with self.client.get(root + "zd1.png", headers=student_headers) as response:
            self.assertEqual(response.status_code, 200)

    def test_submitted_answers_are_saved_with_progress(self):
        with app.app_context():
            student = create_user("answer@example.test", "Answer", "bezpieczne-haslo")
            headers = {"Authorization": "Bearer " + app_module.create_auth_token(student)}
        source = "zadania/kurs/mp/lekcja_1/lekcja_1_potegi_i_pierwiastki.json"
        task = {"source_id":source, "file":"zd1.png", "task_id":source+":zd1.png", "result":"bad", "submitted_answer":"A"}
        response = self.client.post("/api/progress", headers=headers, json=task)
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.get_json()["progress"]["submitted_answer"], "A")
        saved = self.client.get("/api/progress/me", headers=headers).get_json()["progress"]
        self.assertEqual(saved[0]["submitted_answer"], "A")

    def test_all_homework_assets_and_eo_grading_remain_accessible(self):
        root = app_module.COURSE_ASSET_ROOT
        tested = 0
        for directory, _dirs, files in os.walk(root):
            for filename in files:
                if not filename.endswith(".json"):
                    continue
                relative = os.path.relpath(os.path.join(directory, filename), root)
                tasks = app_module.read_course_json(relative)
                if not isinstance(tasks, list):
                    continue
                for task in tasks:
                    if not app_module.is_homework_task(task):
                        continue
                    for reference in app_module.homework_asset_references(task):
                        if not reference.endswith((".png", ".webp", ".jpg")):
                            continue
                        asset = os.path.join(os.path.dirname(relative), reference)
                        with self.subTest(asset=asset):
                            self.assertTrue(app_module.homework_asset_allowed(asset))
                        tested += 1
        self.assertGreater(tested, 190)
        with app.app_context():
            student = create_user("grading@example.test", "Grading", "bezpieczne-haslo", level="egzamin_osmoklasisty")
            headers = {"Authorization": "Bearer " + app_module.create_auth_token(student)}
        response = self.client.get("/api/course-assets/eo/odpowiedzi_kurs_eo.json", headers=headers)
        self.assertEqual(response.status_code, 200)
        items = response.get_json()["items"]
        self.assertGreater(len(items), 0)
        for item in items:
            self.assertTrue(app_module.is_homework_task(item))
        self.assertTrue(any(item["taskFile"] == "zd_1.png" for item in items))

    def test_parent_access_token_expires(self):
        with app.app_context():
            student = create_user(
                email="expired-parent@example.com",
                display_name="Uczeń",
                password="bezpieczne-haslo",
            )
            _access, token = create_parent_access_token(student["id"])

        with sqlite3.connect(TEST_DB) as connection:
            connection.execute(
                "UPDATE parent_access_tokens SET expires_at = '2000-01-01T00:00:00+00:00'"
            )
            connection.commit()

        response = self.client.post(
            "/api/parent/progress",
            json={"token": token},
        )

        self.assertEqual(response.status_code, 401)

    def test_admin_can_reveal_persisted_student_credentials(self):
        with app.app_context():
            create_user(
                email="admin-credentials@example.com",
                display_name="Administrator",
                password="bezpieczne-haslo",
                role="admin",
                level=None,
            )

        login = self.client.post(
            "/api/auth/login",
            json={
                "email": "admin-credentials@example.com",
                "password": "bezpieczne-haslo",
            },
        )
        headers = {"Authorization": f"Bearer {login.get_json()['token']}"}
        created = self.client.post(
            "/api/admin/students",
            headers=headers,
            json={
                "email": "credential-student@example.com",
                "display_name": "Uczeń z danymi",
                "level": "matura_podstawowa",
                "password": "TrwaleHaslo123",
            },
        )

        self.assertEqual(created.status_code, 201)
        created_data = created.get_json()
        student_id = created_data["student"]["id"]
        initial_parent_token = created_data["parent_access_token"]

        listed = self.client.get("/api/admin/students", headers=headers)
        listed_student = next(
            student
            for student in listed.get_json()["students"]
            if student["id"] == student_id
        )

        self.assertTrue(listed_student["has_stored_password"])
        self.assertTrue(listed_student["has_parent_access"])
        self.assertNotIn("password", listed_student)
        self.assertNotIn("parent_access_token", listed_student)

        credentials = self.client.get(
            f"/api/admin/students/{student_id}/credentials",
            headers=headers,
        )
        credential_data = credentials.get_json()

        self.assertEqual(credentials.status_code, 200)
        self.assertEqual(credential_data["password"], "TrwaleHaslo123")
        self.assertEqual(credential_data["parent_access_token"], initial_parent_token)
        self.assertNotIn("token_hash", credential_data["parent_access"])
        self.assertNotIn("token_ciphertext", credential_data["parent_access"])

        repeated_link = self.client.post(
            f"/api/admin/students/{student_id}/parent-access",
            headers=headers,
            json={},
        )

        self.assertEqual(repeated_link.status_code, 200)
        self.assertEqual(repeated_link.get_json()["parent_access_token"], initial_parent_token)

        with sqlite3.connect(TEST_DB) as connection:
            password_ciphertext, token_ciphertext = connection.execute(
                """
                SELECT u.password_ciphertext, p.token_ciphertext
                FROM users u
                JOIN parent_access_tokens p ON p.user_id = u.id
                WHERE u.id = ?
                """,
                (student_id,),
            ).fetchone()

        self.assertNotIn("TrwaleHaslo123", password_ciphertext)
        self.assertNotIn(initial_parent_token, token_ciphertext)

        anonymous_client = app.test_client()
        unauthorized = anonymous_client.get(f"/api/admin/students/{student_id}/credentials")

        self.assertEqual(unauthorized.status_code, 401)

        with app.app_context():
            stored = get_student_credentials(student_id)

        self.assertEqual(stored["password"], "TrwaleHaslo123")
        self.assertEqual(stored["parent_access_token"], initial_parent_token)

    def test_excluded_ip_does_not_write_analytics(self):
        response = self.client.post(
            "/api/analytics/pageview",
            json={
                "path": "/",
                "visitor_id": "excluded-visitor-0001",
                "session_id": "excluded-session-0001",
                "device_type": "desktop",
            },
            headers={
                "Origin": "https://deltasigma.pl",
                "User-Agent": "Mozilla/5.0",
                "X-Forwarded-For": "194.181.243.108",
            },
        )

        self.assertEqual(response.status_code, 204)

        with sqlite3.connect(TEST_DB) as connection:
            count = connection.execute(
                "SELECT SUM(page_views) FROM site_analytics_daily"
            ).fetchone()[0]

        self.assertIsNone(count)

    def test_analytics_reset_runs_only_once(self):
        with sqlite3.connect(TEST_DB) as connection:
            connection.execute(
                "DELETE FROM site_settings WHERE key = ?",
                (ANALYTICS_RESET_KEY,),
            )
            connection.execute(
                """
                INSERT INTO site_analytics_daily (
                    day, path, referrer_host, device_type, page_views
                ) VALUES ('2026-08-05', '/', '', 'desktop', 12)
                """
            )
            connection.commit()

        with app.app_context():
            init_auth_db()

        with sqlite3.connect(TEST_DB) as connection:
            first_count = connection.execute(
                "SELECT COUNT(*) FROM site_analytics_daily"
            ).fetchone()[0]
            reset_marker = connection.execute(
                "SELECT value FROM site_settings WHERE key = ?",
                (ANALYTICS_RESET_KEY,),
            ).fetchone()
            connection.execute(
                """
                INSERT INTO site_analytics_daily (
                    day, path, referrer_host, device_type, page_views
                ) VALUES ('2026-08-05', '/', '', 'desktop', 1)
                """
            )
            connection.commit()

        with app.app_context():
            init_auth_db()

        with sqlite3.connect(TEST_DB) as connection:
            second_count = connection.execute(
                "SELECT SUM(page_views) FROM site_analytics_daily"
            ).fetchone()[0]

        self.assertEqual(first_count, 0)
        self.assertIsNotNone(reset_marker)
        self.assertEqual(second_count, 1)


if __name__ == "__main__":
    unittest.main()
