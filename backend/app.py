import os

import sympy as sp
from flask import Flask, jsonify, request

from calculators.solver import (
    bernoulli,
    line_and_circle,
    lines_angle,
    poly_solve,
    styczna,
    two_circles,
)

app = Flask(__name__)


@app.after_request
def add_cors_headers(response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"

    return response


def payload():
    return request.get_json(silent=True) or {}


def api_error(message, status=400):
    return jsonify({"error": message}), status


def safe(handler):
    try:
        return handler()
    except KeyError as exc:
        return api_error(f"Brakuje pola: {exc.args[0]}")
    except (TypeError, ValueError):
        return api_error("Nieprawidłowe dane wejściowe.")
    except Exception as exc:
        return api_error(f"Nie udało się obliczyć wyniku: {exc}", 500)


@app.get("/")
def root():
    return jsonify({"status": "ok", "service": "delta-sigma-calculators"})


@app.get("/api/health")
def health():
    return jsonify({"status": "ok"})


@app.post("/api/bernoulli")
def api_bernoulli():
    def handler():
        data = payload()
        result = bernoulli(data["p"], int(data["n"]), data["k"])

        return jsonify(str(result))

    return safe(handler)


@app.post("/api/poly")
def api_poly():
    def handler():
        data = payload()
        sol, fac = poly_solve(data["coeffs"])

        return jsonify({
            "sol": [sp.latex(s) for s in sol],
            "fac": sp.latex(fac),
        })

    return safe(handler)


@app.post("/api/styczna")
def api_styczna():
    def handler():
        data = payload()
        result = styczna(data["xa"], data["ya"], data["xs"], data["ys"], data["r"])

        return jsonify([sp.latex(item) for item in result])

    return safe(handler)


@app.post("/api/line_circle")
def api_line_circle():
    def handler():
        data = payload()
        result = line_and_circle(data["A"], data["B"], data["C"], data["p"], data["q"], data["r"])

        return jsonify([sp.latex(item) for item in result])

    return safe(handler)


@app.post("/api/two_circles")
def api_two_circles():
    def handler():
        data = payload()
        result = two_circles(data["a"], data["b"], data["c"], data["p"], data["q"], data["r"])

        return jsonify([sp.latex(item) for item in result])

    return safe(handler)


@app.post("/api/angle")
def api_angle():
    def handler():
        data = payload()

        return jsonify(lines_angle(data["a1"], data["a2"]))

    return safe(handler)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "5000"))
    app.run(host="0.0.0.0", port=port, debug=True)
