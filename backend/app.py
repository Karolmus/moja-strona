import os
from decimal import Decimal, ROUND_HALF_UP
from functools import wraps

import sympy as sp
from flask import Flask, jsonify, request, session
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer
from werkzeug.security import check_password_hash

from auth_storage import (
    INTEGRITY_ERRORS,
    create_contact_message,
    create_user,
    delete_student,
    generate_temporary_password,
    get_user_by_email,
    get_user_by_id,
    init_auth_db,
    list_contact_messages,
    list_students,
    mark_task_for_review,
    progress_for_user,
    public_user,
    record_progress,
    register_auth_db,
    review_tasks_for_user,
    reset_user_password,
    sync_admin_user,
    touch_last_login,
    update_contact_message_read_state,
    update_student,
    update_review_task_resolution,
)
from calculators.solver import (
    bernoulli,
    bernoulli_plot,
    line_and_circle,
    line_and_circle_plot,
    lines_angle,
    lines_angle_plot,
    poly_solve,
    styczna,
    styczna_plot,
    two_circles,
    two_circles_plot,
)

app = Flask(__name__)
app.config.update(
    SECRET_KEY=os.environ.get("SECRET_KEY", "dev-only-change-before-render"),
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE=os.environ.get("SESSION_COOKIE_SAMESITE", "Lax"),
    SESSION_COOKIE_SECURE=os.environ.get("SESSION_COOKIE_SECURE", "false").lower() == "true",
    AUTH_TOKEN_MAX_AGE=int(os.environ.get("AUTH_TOKEN_MAX_AGE", str(60 * 60 * 24 * 30))),
)
register_auth_db(app)


def bootstrap_auth_db():
    init_auth_db()

    admin_email = os.environ.get("ADMIN_EMAIL")
    admin_password = os.environ.get("ADMIN_PASSWORD")

    if not admin_email:
        return

    user, created = sync_admin_user(admin_email, admin_password)

    print("Baza danych jest gotowa.")
    print(f"Admin: {user['email']}")

    if created:
        print("Konto admina zostało utworzone.")
    elif admin_password:
        print("Hasło admina zostało zsynchronizowane ze zmienną ADMIN_PASSWORD.")


with app.app_context():
    bootstrap_auth_db()


def allowed_origins():
    configured = os.environ.get(
        "ALLOWED_ORIGINS",
        ",".join([
            "http://127.0.0.1:8000",
            "http://localhost:8000",
            "http://127.0.0.1:5000",
            "http://localhost:5000",
            "https://deltasigma.pl",
            "https://www.deltasigma.pl",
            "https://karolmusiol.github.io",
        ]),
    )

    return {origin.strip() for origin in configured.split(",") if origin.strip()}


@app.after_request
def add_cors_headers(response):
    origin = request.headers.get("Origin")

    if origin in allowed_origins():
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Access-Control-Allow-Credentials"] = "true"
        response.headers.add("Vary", "Origin")

    response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, PATCH, DELETE, OPTIONS"

    return response


def payload():
    return request.get_json(silent=True) or {}


def api_error(message, status=400):
    return jsonify({"error": message}), status


def auth_serializer():
    return URLSafeTimedSerializer(app.config["SECRET_KEY"], salt="delta-sigma-auth")


def create_auth_token(user):
    return auth_serializer().dumps({
        "user_id": user["id"],
        "role": user["role"],
    })


def bearer_token():
    header = request.headers.get("Authorization", "")

    if not header.lower().startswith("bearer "):
        return None

    return header.split(" ", 1)[1].strip()


def user_from_token(token):
    if not token:
        return None

    try:
        data = auth_serializer().loads(token, max_age=app.config["AUTH_TOKEN_MAX_AGE"])
    except (BadSignature, SignatureExpired):
        return None

    user_id = data.get("user_id")

    if not user_id:
        return None

    return get_user_by_id(user_id)


def safe(handler):
    try:
        return handler()
    except KeyError as exc:
        return api_error(f"Brakuje pola: {exc.args[0]}")
    except INTEGRITY_ERRORS:
        return api_error("Taki użytkownik już istnieje.")
    except (TypeError, ValueError):
        return api_error("Nieprawidłowe dane wejściowe.")
    except Exception as exc:
        return api_error(f"Nie udało się obsłużyć żądania: {exc}", 500)


def current_user():
    token_user = user_from_token(bearer_token())

    if token_user:
        return token_user

    user_id = session.get("user_id")

    if user_id:
        return get_user_by_id(user_id)

    return None


def require_auth(handler):
    @wraps(handler)
    def wrapper(*args, **kwargs):
        user = current_user()

        if not user:
            return api_error("Musisz się zalogować.", 401)

        if not user["is_active"]:
            session.clear()
            return api_error("Konto jest nieaktywne.", 403)

        return handler(user, *args, **kwargs)

    return wrapper


def require_admin(handler):
    @wraps(handler)
    @require_auth
    def wrapper(user, *args, **kwargs):
        if user["role"] != "admin":
            return api_error("Brak uprawnień administratora.", 403)

        return handler(user, *args, **kwargs)

    return wrapper


def validate_password(password):
    if len(password or "") < 8:
        raise ValueError("Hasło musi mieć co najmniej 8 znaków.")


def student_payload(user):
    item = public_user(user)

    if item:
        item["role"] = "student"

    return item


@app.get("/")
def root():
    return jsonify({"status": "ok", "service": "delta-sigma-calculators"})


@app.get("/api/health")
def health():
    return jsonify({"status": "ok"})


@app.post("/api/auth/login")
def api_login():
    def handler():
        data = payload()
        email = data["email"]
        password = data["password"]
        user = get_user_by_email(email)

        if not user or not check_password_hash(user["password_hash"], password):
            return api_error("Nieprawidłowy e-mail albo hasło.", 401)

        if not user["is_active"]:
            return api_error("Konto jest nieaktywne.", 403)

        session.clear()
        session["user_id"] = user["id"]
        session["role"] = user["role"]
        session.permanent = bool(data.get("remember"))
        touch_last_login(user["id"])

        refreshed_user = get_user_by_id(user["id"])

        return jsonify({
            "user": public_user(refreshed_user),
            "token": create_auth_token(refreshed_user),
        })

    return safe(handler)


@app.post("/api/auth/logout")
def api_logout():
    session.clear()

    return jsonify({"ok": True})


@app.get("/api/auth/me")
def api_me():
    user = current_user()

    if not user or not user["is_active"]:
        return jsonify({"authenticated": False})

    return jsonify({
        "authenticated": True,
        "user": public_user(user),
    })


@app.get("/api/admin/students")
@require_admin
def api_admin_students(_admin):
    return jsonify({
        "students": list_students(),
    })


@app.get("/api/admin/contact-messages")
@require_admin
def api_admin_contact_messages(_admin):
    return jsonify({
        "messages": list_contact_messages(),
    })


@app.patch("/api/admin/contact-messages/<int:message_id>")
@require_admin
def api_admin_update_contact_message(_admin, message_id):
    def handler():
        data = payload()
        item = update_contact_message_read_state(message_id, data.get("is_read", True))

        if not item:
            return api_error("Nie znaleziono wiadomości.", 404)

        return jsonify({
            "message": item,
        })

    return safe(handler)


@app.post("/api/admin/students")
@require_admin
def api_admin_create_student(_admin):
    def handler():
        data = payload()
        password = data.get("password") or generate_temporary_password()

        validate_password(password)

        student = create_user(
            email=data["email"],
            display_name=data["display_name"],
            password=password,
            role="student",
            level=data.get("level") or "matura_podstawowa",
            is_active=data.get("is_active", True),
        )

        return jsonify({
            "student": student_payload(student),
            "temporary_password": password,
        }), 201

    return safe(handler)


@app.patch("/api/admin/students/<int:user_id>")
@require_admin
def api_admin_update_student(_admin, user_id):
    def handler():
        student = update_student(user_id, payload())

        if not student:
            return api_error("Nie znaleziono ucznia.", 404)

        return jsonify({
            "student": student_payload(student),
        })

    return safe(handler)


@app.delete("/api/admin/students/<int:user_id>")
@require_admin
def api_admin_delete_student(_admin, user_id):
    deleted = delete_student(user_id)

    if not deleted:
        return api_error("Nie znaleziono ucznia.", 404)

    return jsonify({
        "deleted": student_payload(deleted),
    })


@app.post("/api/admin/students/<int:user_id>/password")
@require_admin
def api_admin_reset_student_password(_admin, user_id):
    def handler():
        data = payload()
        password = data.get("password") or generate_temporary_password()

        validate_password(password)
        student = reset_user_password(user_id, password)

        if not student:
            return api_error("Nie znaleziono ucznia.", 404)

        return jsonify({
            "student": student_payload(student),
            "temporary_password": password,
        })

    return safe(handler)


@app.get("/api/admin/students/<int:user_id>/progress")
@require_admin
def api_admin_student_progress(_admin, user_id):
    student = get_user_by_id(user_id)

    if not student or student["role"] != "student":
        return api_error("Nie znaleziono ucznia.", 404)

    return jsonify({
        "student": student_payload(student),
        "progress": progress_for_user(user_id),
    })


@app.get("/api/admin/students/<int:user_id>/review-tasks")
@require_admin
def api_admin_student_review_tasks(_admin, user_id):
    student = get_user_by_id(user_id)

    if not student or student["role"] != "student":
        return api_error("Nie znaleziono ucznia.", 404)

    return jsonify({
        "student": student_payload(student),
        "review_tasks": review_tasks_for_user(user_id),
    })


@app.patch("/api/admin/review-tasks/<int:item_id>")
@require_admin
def api_admin_update_review_task(_admin, item_id):
    def handler():
        data = payload()
        is_resolved = data.get("is_resolved", True)
        item = update_review_task_resolution(item_id, is_resolved)

        if not item:
            return api_error("Nie znaleziono zadania do omówienia.", 404)

        return jsonify({
            "review_task": item,
        })

    return safe(handler)


@app.post("/api/progress")
@require_auth
def api_save_progress(user):
    def handler():
        data = payload()

        if data["result"] not in {"good", "medium", "bad"}:
            return api_error("Nieprawidłowy wynik zadania.")

        progress = record_progress(user["id"], data)

        return jsonify({
            "progress": progress,
        }), 201

    return safe(handler)


@app.post("/api/review-tasks")
@require_auth
def api_mark_review_task(user):
    def handler():
        data = payload()
        item, created = mark_task_for_review(user["id"], data)

        return jsonify({
            "review_task": item,
            "created": created,
        }), 201 if created else 200

    return safe(handler)


@app.post("/api/contact-messages")
def api_create_contact_message():
    def handler():
        item = create_contact_message(payload())

        return jsonify({
            "message": item,
        }), 201

    return safe(handler)


@app.get("/api/progress/me")
@require_auth
def api_my_progress(user):
    return jsonify({
        "progress": progress_for_user(user["id"]),
    })


@app.post("/api/bernoulli")
def api_bernoulli():
    def handler():
        data = payload()
        n = int(data["n"])
        result = bernoulli(data["p"], n, data["k"])
        rounded_result = Decimal(str(sp.N(result, 20))).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

        return jsonify({
            "result": sp.latex(result),
            "rounded": str(rounded_result),
            "plot": bernoulli_plot(data["p"], n, data["k"]),
        })

    return safe(handler)


@app.post("/api/poly")
def api_poly():
    def handler():
        data = payload()
        sol, fac, expanded, plot = poly_solve(data["coeffs"])

        return jsonify({
            "sol": [sp.latex(s) for s in sol],
            "fac": sp.latex(fac),
            "factored": sp.latex(fac),
            "general": sp.latex(expanded),
            "plot": plot,
        })

    return safe(handler)


@app.post("/api/styczna")
def api_styczna():
    def handler():
        data = payload()
        result = styczna(data["xa"], data["ya"], data["xs"], data["ys"], data["r"])

        return jsonify({
            "result": [sp.latex(item) for item in result],
            "plot": styczna_plot(data["xa"], data["ya"], data["xs"], data["ys"], data["r"], result),
        })

    return safe(handler)


@app.post("/api/line_circle")
def api_line_circle():
    def handler():
        data = payload()
        result = line_and_circle(data["A"], data["B"], data["C"], data["p"], data["q"], data["r"])

        return jsonify({
            "result": [sp.latex(item) for item in result],
            "plot": line_and_circle_plot(data["A"], data["B"], data["C"], data["p"], data["q"], data["r"], result),
        })

    return safe(handler)


@app.post("/api/two_circles")
def api_two_circles():
    def handler():
        data = payload()
        result = two_circles(data["a"], data["b"], data["c"], data["p"], data["q"], data["r"])

        return jsonify({
            "result": [sp.latex(item) for item in result],
            "plot": two_circles_plot(data["a"], data["b"], data["c"], data["p"], data["q"], data["r"], result),
        })

    return safe(handler)


@app.post("/api/angle")
def api_angle():
    def handler():
        data = payload()
        result = lines_angle(data["a1"], data["a2"])

        return jsonify({
            "result": result,
            "plot": lines_angle_plot(data["a1"], data["a2"]),
        })

    return safe(handler)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "5000"))
    app.run(host="0.0.0.0", port=port, debug=True)
