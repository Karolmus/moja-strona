from flask import Flask, render_template, request, jsonify
from calculators.solver import *
import sympy as sp

app = Flask(__name__)

@app.route("/")
def home():
    return render_template("index.html")

@app.route("/kontakt")
def kontakt():
    return render_template("kontakt.html")

@app.route("/kalkulatory")
def kalkulatory():
    return render_template("kalkulatory.html")


# ===== API =====

@app.route("/api/bernoulli", methods=["POST"])
def api_bernoulli():
    d = request.json
    return jsonify(str(bernoulli(d["p"], d["n"], d["k"])))


@app.route("/api/poly", methods=["POST"])
def api_poly():
    d = request.json
    sol, fac = poly_solve(d["coeffs"])

    return jsonify({
        "sol": [sp.latex(s) for s in sol],
        "fac": sp.latex(fac)
    })


@app.route("/api/styczna", methods=["POST"])
def api_styczna():
    d = request.json
    f1, f2 = styczna(d["xa"], d["ya"], d["xs"], d["ys"], d["r"])
    return jsonify([sp.latex(f1), sp.latex(f2)])


@app.route("/api/line_circle", methods=["POST"])
def api_line_circle():
    d = request.json
    res = line_and_circle(d["A"], d["B"], d["C"], d["p"], d["q"], d["r"])
    return jsonify([str(x) for x in res])


@app.route("/api/two_circles", methods=["POST"])
def api_two_circles():
    d = request.json
    res = two_circles(d["a"], d["b"], d["c"], d["p"], d["q"], d["r"])
    return jsonify([str(x) for x in res])


@app.route("/api/angle", methods=["POST"])
def api_angle():
    d = request.json
    return jsonify(lines_angle(d["a1"], d["a2"]))


if __name__ == "__main__":
    app.run(debug=True)