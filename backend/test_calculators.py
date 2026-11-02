import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

import test_security as security

app, app_module, create_user = security.app, security.app_module, security.create_user


CASES = {
    "/api/compound-interest": {"capital": 1000, "annual_rate": 5, "years": 3, "frequency": 1},
    "/api/binomial": {"n": 10, "k": 3},
    "/api/poly": {"coeffs": [1, 0, -1]},
    "/api/bernoulli": {"p": 0.5, "n": 2, "k": [1]},
    "/api/styczna": {"xa": 2, "ya": 0, "xs": 0, "ys": 0, "r": 1},
    "/api/line_circle": {"A": 0, "B": 1, "C": 0, "p": 0, "q": 0, "r": 1},
    "/api/two_circles": {"a": 0, "b": 0, "c": 1, "p": 1, "q": 0, "r": 1},
    "/api/angle": {"a1": 0, "a2": 1},
}


class CalculatorTests(unittest.TestCase):
    def setUp(self):
        fixture = security.SecurityTests(methodName="runTest")
        fixture.setUp()
        self.client = fixture.client
        app_module.CALCULATORS_ENABLED = True
        with app.app_context():
            self.student = create_user("calculator-student", "Kalkulatory", "test-password")
            self.headers = {"Authorization": "Bearer " + app_module.create_auth_token(self.student)}

    def tearDown(self):
        app_module.CALCULATORS_ENABLED = False

    def test_every_calculator_requires_an_active_authenticated_account(self):
        for endpoint, data in CASES.items():
            with self.subTest(endpoint=endpoint):
                self.assertEqual(self.client.post(endpoint, json=data).status_code, 401)
        with app.app_context():
            disabled = create_user("calculator-disabled", "Nieaktywny", "test-password")
            app_module.update_student(disabled["id"], {"is_active": False})
            headers = {"Authorization": "Bearer " + app_module.create_auth_token(disabled)}
        for endpoint, data in CASES.items():
            with self.subTest(endpoint=endpoint, inactive=True):
                self.assertIn(self.client.post(endpoint, json=data, headers=headers).status_code, [401, 403])

    def test_all_calculators_return_results_and_optional_svg_plots(self):
        for endpoint, data in CASES.items():
            with self.subTest(endpoint=endpoint):
                response = self.client.post(endpoint, json={**data, "include_plot": True}, headers=self.headers)
                self.assertEqual(response.status_code, 200, response.get_json())
                result = response.get_json()
                if endpoint == "/api/binomial":
                    self.assertEqual(result["result"], "120")
                    self.assertIsNone(result["plot"])
                elif endpoint == "/api/compound-interest":
                    self.assertEqual(result["balance"], "1157.63")
                    self.assertEqual(result["interest"], "157.63")
                    self.assertIsNone(result["plot"])
                else:
                    self.assertIn("<svg", result["plot"])
                    self.assertNotIn("<script", result["plot"])
                if endpoint == "/api/poly":
                    self.assertEqual(set(result["sol"]), {"-1", "1"})
                elif endpoint == "/api/bernoulli":
                    self.assertEqual(result["result"], r"\frac{1}{2}")
                elif endpoint == "/api/angle":
                    self.assertEqual(result["result"], 45)
                elif endpoint == "/api/two_circles":
                    self.assertTrue(all(r"\sqrt{3}" in value for value in result["result"]), result)
        response = self.client.post("/api/poly", json=CASES["/api/poly"], headers=self.headers)
        self.assertIsNone(response.get_json()["plot"])

    def test_compound_interest_capitalization_boundaries_and_final_rounding(self):
        cases = [
            (1000, 5, 3, 1, "1157.63", "157.63", 3),
            (1000, 10, 1, 2, "1102.50", "102.50", 2),
            (1000, 12, 1, 4, "1125.51", "125.51", 4),
            (1000, 12, 1, 12, "1126.83", "126.83", 12),
            (1000, 10, 0.5, 2, "1050.00", "50.00", 1),
            (1000, 10, 0, 12, "1000.00", "0.00", 0),
            (0, 10, 3, 1, "0.00", "0.00", 3),
            (1000, 0, 3, 1, "1000.00", "0.00", 3),
            (0.01, 50, 3, 1, "0.03", "0.02", 3),
            (1000, 0.0005, 1, 1, "1000.01", "0.01", 1),
        ]
        for capital, rate, years, frequency, balance, interest, periods in cases:
            with self.subTest(capital=capital, rate=rate, years=years, frequency=frequency):
                response = self.client.post("/api/compound-interest", headers=self.headers, json={
                    "capital": capital, "annual_rate": rate, "years": years, "frequency": frequency})
                self.assertEqual(response.status_code, 200, response.get_json())
                result = response.get_json()
                self.assertEqual(result["balance"], balance)
                self.assertEqual(result["interest"], interest)
                self.assertEqual(result["periods"], periods)

    def test_compound_interest_validates_full_periods_and_input_limits(self):
        valid = CASES["/api/compound-interest"]
        for field, value in [
            ("capital", -1), ("capital", 1_000_000_001), ("capital", None), ("capital", True),
            ("annual_rate", -1), ("annual_rate", 101), ("annual_rate", "NaN"),
            ("years", -1), ("years", 101), ("years", 0.1), ("years", 1e-12),
            ("frequency", 0), ("frequency", 3), ("frequency", 1.5), ("frequency", True),
        ]:
            with self.subTest(field=field, value=value):
                app_module._rate_limit_buckets.clear()
                response = self.client.post("/api/compound-interest", headers=self.headers, json={**valid, field: value})
                self.assertEqual(response.status_code, 400, response.get_json())
        app_module._rate_limit_buckets.clear()
        self.assertEqual(self.client.post("/api/compound-interest", headers=self.headers, json={}).status_code, 400)
        response = self.client.post("/api/compound-interest", headers=self.headers, json={
            **valid, "years": 1 / 3, "frequency": 12})
        self.assertEqual(response.get_json()["periods"], 4)
        response = self.client.post("/api/compound-interest", headers=self.headers, json={
            **valid, "capital": 1_000_000_000, "annual_rate": 100, "years": 100, "frequency": 12})
        self.assertEqual(response.status_code, 200, response.get_json())
        self.assertRegex(response.get_json()["balance"], r"^\d+\.\d{2}$")
        app_module.CALCULATORS_ENABLED = False
        self.assertEqual(self.client.post("/api/compound-interest", headers=self.headers, json=valid).status_code, 404)

    def test_binomial_is_exact_including_boundaries_and_values_beyond_javascript_precision(self):
        cases = [
            (0, 0, "1"), (5, 0, "1"), (5, 5, "1"), (10, 3, "120"),
            (10, 7, "120"), (100, 50, "100891344545564193334812497256"),
            (1000, 1, "1000"),
        ]
        for n, k, expected in cases:
            with self.subTest(n=n, k=k):
                response = self.client.post("/api/binomial", headers=self.headers, json={"n": n, "k": k})
                self.assertEqual(response.status_code, 200, response.get_json())
                self.assertEqual(response.get_json(), {"n": n, "k": k, "result": expected, "plot": None})

    def test_binomial_rejects_invalid_inputs_and_remains_feature_gated(self):
        cases = [
            {}, {"n": 5}, {"n": 2.5, "k": 1}, {"n": 5, "k": 0.5},
            {"n": -1, "k": 0}, {"n": 5, "k": -1}, {"n": 3, "k": 4},
            {"n": 1001, "k": 1}, {"n": 5, "k": 1001}, {"n": True, "k": 0},
            {"n": 5, "k": False}, {"n": None, "k": 0}, {"n": "Infinity", "k": 1},
            {"n": "NaN", "k": 0}, {"n": "10**10", "k": 1}, {"n": [], "k": 0},
        ]
        for data in cases:
            with self.subTest(data=data):
                app_module._rate_limit_buckets.clear()
                response = self.client.post("/api/binomial", headers=self.headers, json=data)
                self.assertEqual(response.status_code, 400, response.get_json())
        app_module.CALCULATORS_ENABLED = False
        response = self.client.post("/api/binomial", headers=self.headers, json=CASES["/api/binomial"])
        self.assertEqual(response.status_code, 404)

    def test_real_roots_and_intersections_exclude_complex_solutions(self):
        cases = [
            ("/api/poly", {"coeffs": [1, 0, 1]}, "sol"),
            ("/api/line_circle", {"A": 0, "B": 1, "C": -2, "p": 0, "q": 0, "r": 1}, "result"),
            ("/api/two_circles", {"a": 0, "b": 0, "c": 1, "p": 5, "q": 0, "r": 1}, "result"),
        ]
        for endpoint, data, key in cases:
            with self.subTest(endpoint=endpoint):
                response = self.client.post(endpoint, json=data, headers=self.headers)
                self.assertEqual(response.status_code, 200, response.get_json())
                self.assertEqual(response.get_json()[key], [])

    def test_vertical_tangents_and_coincident_circles_are_explicit(self):
        for point, count in [((1, 0), 1), ((1, 2), 2), ((0, 0), 0)]:
            response = self.client.post("/api/styczna", headers=self.headers, json={
                "xa": point[0], "ya": point[1], "xs": 0, "ys": 0, "r": 1, "include_plot": True})
            self.assertEqual(response.status_code, 200, response.get_json())
            self.assertEqual(len(response.get_json()["result"]), count)
            if count:
                self.assertIn("x = 1", response.get_json()["result"])
        response = self.client.post("/api/two_circles", headers=self.headers, json={
            "a": 0, "b": 0, "c": 1, "p": 0, "q": 0, "r": 1, "include_plot": True})
        self.assertEqual(response.status_code, 200, response.get_json())
        self.assertIn("nieskończenie", response.get_json()["message"])

    def test_invalid_values_are_rejected_and_duplicate_successes_do_not_double_probability(self):
        for data in [{"p": 0.5, "n": 2.5, "k": [1]}, {"p": 0.5, "n": 2, "k": [0.5]},
                     {"p": 1.1, "n": 2, "k": [1]}, {"p": 0.5, "n": 2, "k": [3]}]:
            self.assertEqual(self.client.post("/api/bernoulli", json=data, headers=self.headers).status_code, 400)
        response = self.client.post("/api/bernoulli", json={"p": 0.5, "n": 2, "k": [1, 1]}, headers=self.headers)
        self.assertEqual(response.get_json()["result"], r"\frac{1}{2}")
        self.assertEqual(self.client.post("/api/poly", json={"coeffs": [0, 0]}, headers=self.headers).status_code, 400)

    def test_legacy_entry_point_uses_the_same_login_protection(self):
        root = Path(__file__).resolve().parents[1]
        with tempfile.TemporaryDirectory() as folder:
            environment = {**os.environ, "DATABASE_PATH": str(Path(folder) / "legacy.sqlite3"), "CALCULATORS_ENABLED": "true"}
            result = subprocess.run([sys.executable, "-c", "from app import app; print(app.test_client().post('/api/poly', json={'coeffs':[1,0,-1]}).status_code)"],
                                    cwd=root, env=environment, capture_output=True, text=True, timeout=15)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(result.stdout.strip(), "401")


if __name__ == "__main__":
    unittest.main()
