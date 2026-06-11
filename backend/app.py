import os
import gzip
import hashlib
import math
import secrets
import threading
import time
from collections import defaultdict, deque
from decimal import Decimal, ROUND_HALF_UP
from functools import wraps
from urllib.parse import urlsplit

import sympy as sp
from flask import Flask, jsonify, request, session
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer
from werkzeug.exceptions import HTTPException
from werkzeug.middleware.proxy_fix import ProxyFix
from werkzeug.security import check_password_hash

from auth_storage import (
    INTEGRITY_ERRORS,
    contact_message_counts,
    create_parent_access_token,
    create_contact_message,
    create_user,
    delete_contact_message,
    delete_student,
    disable_parent_access_token,
    generate_temporary_password,
    get_user_by_email,
    get_user_by_id,
    init_auth_db,
    list_contact_messages,
    list_students,
    mark_task_for_review,
    parent_access_by_token,
    progress_for_user,
    public_user,
    record_site_pageview,
    record_speed_training_result,
    record_progress,
    register_auth_db,
    review_tasks_for_user,
    reset_user_password,
    speed_training_leaderboard,
    speed_training_history,
    site_analytics_summary,
    sync_admin_user,
    touch_parent_access,
    touch_last_login,
    update_contact_message_deleted_state,
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

def production_secret_key():
    configured = os.environ.get("SECRET_KEY", "").strip()
    unsafe_values = {
        "",
        "dev-only-change-before-render",
        "change-this-before-production",
    }

    if configured not in unsafe_values:
        return configured

    if os.environ.get("RENDER"):
        raise RuntimeError("Ustaw bezpieczną zmienną SECRET_KEY w usłudze Render.")

    return secrets.token_urlsafe(48)


app = Flask(__name__)
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1)
app.config.update(
    SECRET_KEY=production_secret_key(),
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE=os.environ.get("SESSION_COOKIE_SAMESITE", "Lax"),
    SESSION_COOKIE_SECURE=os.environ.get("SESSION_COOKIE_SECURE", "false").lower() == "true",
    AUTH_TOKEN_MAX_AGE=int(os.environ.get("AUTH_TOKEN_MAX_AGE", str(60 * 60 * 24 * 30))),
    MAX_CONTENT_LENGTH=int(os.environ.get("MAX_CONTENT_LENGTH", str(32 * 1024))),
)
register_auth_db(app)

CALCULATORS_ENABLED = os.environ.get("CALCULATORS_ENABLED", "false").lower() == "true"
RATE_LIMIT_ENABLED = os.environ.get("RATE_LIMIT_ENABLED", "true").lower() == "true"
CONTACT_FORM_MIN_SECONDS = float(os.environ.get("CONTACT_FORM_MIN_SECONDS", "2"))

TRAINING_LEVEL_BY_STUDENT_LEVEL = {
    "egzamin_osmoklasisty": "eo",
    "matura_podstawowa": "mp",
    "matura_rozszerzona": "mr",
}

_rate_limit_buckets = defaultdict(deque)
_rate_limit_lock = threading.Lock()
_last_rate_limit_cleanup = 0.0


def client_ip():
    return request.remote_addr or "unknown"


def token_fingerprint(token):
    return hashlib.sha256(str(token or "").encode("utf-8")).hexdigest()[:20]


def default_rate_limit_key():
    token = bearer_token()

    if token:
        return f"auth:{token_fingerprint(token)}"

    return f"ip:{client_ip()}"


def contact_rate_limit_key():
    return f"contact:{client_ip()}"


def login_rate_limit_key():
    data = request.get_json(silent=True) or {}
    email = str(data.get("email") or "").strip().lower()

    return f"login:{client_ip()}:{token_fingerprint(email)}"


def parent_rate_limit_key():
    data = request.get_json(silent=True) or {}

    return f"parent:{client_ip()}:{token_fingerprint(data.get('token'))}"


def analytics_rate_limit_key():
    return f"analytics:{client_ip()}"


def enforce_rate_limit(limit, window_seconds, scope, key):
    global _last_rate_limit_cleanup

    if not RATE_LIMIT_ENABLED:
        return None

    now = time.monotonic()
    bucket_key = (scope, key)

    with _rate_limit_lock:
        bucket = _rate_limit_buckets[bucket_key]
        cutoff = now - window_seconds

        while bucket and bucket[0] <= cutoff:
            bucket.popleft()

        if len(bucket) >= limit:
            retry_after = max(1, math.ceil(window_seconds - (now - bucket[0])))
            response = api_error("Zbyt wiele żądań. Spróbuj ponownie później.", 429)
            response[0].headers["Retry-After"] = str(retry_after)
            return response

        bucket.append(now)

        if now - _last_rate_limit_cleanup > 300:
            stale = [
                item_key
                for item_key, timestamps in _rate_limit_buckets.items()
                if not timestamps or timestamps[-1] <= now - 86400
            ]

            for item_key in stale:
                _rate_limit_buckets.pop(item_key, None)

            _last_rate_limit_cleanup = now

    return None


def rate_limit(limit, window_seconds, scope, key_func=default_rate_limit_key):
    def decorator(handler):
        @wraps(handler)
        def wrapper(*args, **kwargs):
            blocked = enforce_rate_limit(
                limit=limit,
                window_seconds=window_seconds,
                scope=scope,
                key=key_func(),
            )

            if blocked:
                return blocked

            return handler(*args, **kwargs)

        return wrapper

    return decorator


def require_calculators_enabled(handler):
    @wraps(handler)
    def wrapper(*args, **kwargs):
        if not CALCULATORS_ENABLED:
            return api_error("Kalkulatory są obecnie wyłączone.", 404)

        return handler(*args, **kwargs)

    return wrapper


def finite_number(value, minimum=-1_000_000, maximum=1_000_000):
    number = float(value)

    if not math.isfinite(number) or number < minimum or number > maximum:
        raise ValueError("Liczba jest poza dozwolonym zakresem.")

    return number


def validate_calculator_list(values, maximum_length=10):
    if not isinstance(values, list) or len(values) > maximum_length:
        raise ValueError("Nieprawidłowa liczba elementów.")

    return values


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
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"

    if request.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store, max-age=0"

    accepts_gzip = "gzip" in request.headers.get("Accept-Encoding", "").lower()
    response_length = response.calculate_content_length() or 0

    if (
        accepts_gzip
        and response.mimetype == "application/json"
        and not response.direct_passthrough
        and response_length >= 1024
        and "Content-Encoding" not in response.headers
    ):
        compressed = gzip.compress(response.get_data(), compresslevel=5)
        response.set_data(compressed)
        response.headers["Content-Encoding"] = "gzip"
        response.headers["Content-Length"] = str(len(compressed))
        response.headers.add("Vary", "Accept-Encoding")

    return response


def payload():
    return request.get_json(silent=True) or {}


def api_error(message, status=400):
    return jsonify({"error": message}), status


def message_counts_payload():
    return {
        "all": contact_message_counts(),
        "prospect": contact_message_counts("prospect"),
        "parent": contact_message_counts("parent"),
    }


@app.before_request
def apply_global_rate_limit():
    if request.method == "OPTIONS":
        return None

    return enforce_rate_limit(
        limit=300,
        window_seconds=60,
        scope="global",
        key=default_rate_limit_key(),
    )


@app.errorhandler(413)
def request_too_large(_error):
    return api_error("Przesłane dane są zbyt duże.", 413)


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
    except HTTPException:
        raise
    except Exception:
        app.logger.exception("Nieobsłużony błąd API")
        return api_error("Nie udało się obsłużyć żądania.", 500)


def wants_plot(data):
    return bool(data.get("include_plot"))


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


def training_level_for_user(user):
    return TRAINING_LEVEL_BY_STUDENT_LEVEL.get(user.get("level"), "eo")


def analytics_identifier(value):
    identifier = str(value or "").strip()

    if not 8 <= len(identifier) <= 100:
        raise ValueError("Nieprawidłowy identyfikator analityczny.")

    if not all(character.isalnum() or character in "-_:" for character in identifier):
        raise ValueError("Nieprawidłowy identyfikator analityczny.")

    return hashlib.sha256(
        f"{app.config['SECRET_KEY']}:{identifier}".encode("utf-8")
    ).hexdigest()


def analytics_path(value):
    path = urlsplit(str(value or "")).path.strip()

    if not path or path == "/index.html":
        return "/"

    if (
        not path.startswith("/")
        or len(path) > 180
        or "\x00" in path
        or "\\" in path
        or ".." in path
    ):
        raise ValueError("Nieprawidłowa ścieżka strony.")

    return path.rstrip("/") or "/"


def analytics_referrer_host(value):
    host = str(value or "").strip().lower()

    if len(host) > 160 or any(character in host for character in "/\\?#"):
        return ""

    return host


def request_looks_like_bot():
    user_agent = request.headers.get("User-Agent", "").lower()
    markers = (
        "bot",
        "crawler",
        "spider",
        "slurp",
        "lighthouse",
        "headless",
        "preview",
    )

    return any(marker in user_agent for marker in markers)


@app.get("/")
def root():
    return jsonify({"status": "ok", "service": "delta-sigma-calculators"})


@app.get("/api/health")
def health():
    return jsonify({"status": "ok"})


@app.post("/api/analytics/pageview")
@rate_limit(240, 60, "analytics-minute", analytics_rate_limit_key)
@rate_limit(6000, 24 * 60 * 60, "analytics-day", analytics_rate_limit_key)
def api_analytics_pageview():
    def handler():
        origin = request.headers.get("Origin")

        if origin and origin not in allowed_origins():
            return "", 204

        if request_looks_like_bot():
            return "", 204

        data = request.get_json(force=True, silent=True) or {}
        device_type = str(data.get("device_type") or "desktop").strip().lower()

        if device_type not in {"mobile", "tablet", "desktop"}:
            device_type = "desktop"

        record_site_pageview(
            path=analytics_path(data.get("path")),
            visitor_hash=analytics_identifier(data.get("visitor_id")),
            session_hash=analytics_identifier(data.get("session_id")),
            referrer_host=analytics_referrer_host(data.get("referrer_host")),
            device_type=device_type,
        )

        return jsonify({"ok": True}), 201

    return safe(handler)


@app.post("/api/auth/login")
@rate_limit(10, 10 * 60, "login-account", login_rate_limit_key)
@rate_limit(30, 60, "login-ip", lambda: f"login-ip:{client_ip()}")
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


@app.get("/api/admin/analytics")
@require_admin
@rate_limit(60, 60, "admin-analytics")
def api_admin_analytics(_admin):
    requested_days = request.args.get("days", "30")

    try:
        days = int(requested_days)
    except (TypeError, ValueError):
        days = 30

    if days not in {7, 30, 90}:
        days = 30

    return jsonify(site_analytics_summary(days))


@app.get("/api/admin/contact-messages")
@require_admin
def api_admin_contact_messages(_admin):
    box = request.args.get("box", "inbox")
    origin = request.args.get("origin", "prospect")

    if box not in ("inbox", "trash"):
        box = "inbox"

    if origin not in ("prospect", "parent"):
        origin = "prospect"

    return jsonify({
        "messages": list_contact_messages(box=box, origin=origin),
        "counts": message_counts_payload(),
    })


@app.patch("/api/admin/contact-messages/<int:message_id>")
@require_admin
def api_admin_update_contact_message(_admin, message_id):
    def handler():
        data = payload()
        item = None

        if "is_deleted" in data:
            item = update_contact_message_deleted_state(message_id, data.get("is_deleted", True))

        if "is_read" in data:
            item = update_contact_message_read_state(message_id, data.get("is_read", True))

        if not item:
            return api_error("Nie znaleziono wiadomości.", 404)

        return jsonify({
            "message": item,
            "counts": message_counts_payload(),
        })

    return safe(handler)


@app.delete("/api/admin/contact-messages/<int:message_id>")
@require_admin
def api_admin_delete_contact_message(_admin, message_id):
    def handler():
        item = delete_contact_message(message_id)

        if not item:
            return api_error("Nie znaleziono wiadomości.", 404)

        return jsonify({
            "message": item,
            "counts": message_counts_payload(),
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
        _access, parent_token = create_parent_access_token(student["id"])

        return jsonify({
            "student": student_payload(student),
            "temporary_password": password,
            "parent_access_token": parent_token,
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


@app.post("/api/admin/students/<int:user_id>/parent-access")
@require_admin
def api_admin_create_parent_access(_admin, user_id):
    def handler():
        access, token = create_parent_access_token(user_id)

        if not access:
            return api_error("Nie znaleziono ucznia.", 404)

        return jsonify({
            "parent_access": access,
            "parent_access_token": token,
        })

    return safe(handler)


@app.delete("/api/admin/students/<int:user_id>/parent-access")
@require_admin
def api_admin_disable_parent_access(_admin, user_id):
    student = get_user_by_id(user_id)

    if not student or student["role"] != "student":
        return api_error("Nie znaleziono ucznia.", 404)

    disabled = disable_parent_access_token(user_id)

    return jsonify({
        "disabled": disabled,
    })


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
@rate_limit(90, 60, "progress-write")
@rate_limit(1500, 24 * 60 * 60, "progress-write-day")
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
@rate_limit(30, 60, "review-task-write")
@rate_limit(200, 24 * 60 * 60, "review-task-write-day")
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
@rate_limit(5, 60 * 60, "contact-hour", contact_rate_limit_key)
@rate_limit(20, 24 * 60 * 60, "contact-day", contact_rate_limit_key)
def api_create_contact_message():
    def handler():
        data = payload()

        if str(data.get("website") or "").strip():
            return jsonify({
                "message": {
                    "accepted": True,
                },
            }), 201

        started_at = data.get("form_started_at")

        if started_at not in (None, ""):
            elapsed_seconds = (time.time() * 1000 - float(started_at)) / 1000

            if 0 <= elapsed_seconds < CONTACT_FORM_MIN_SECONDS:
                return api_error("Formularz został wysłany zbyt szybko. Spróbuj ponownie.", 429)

        item = create_contact_message({
            **data,
            "origin": "prospect",
            "user_id": None,
        })

        return jsonify({
            "message": item,
        }), 201

    return safe(handler)


@app.post("/api/parent/messages")
@rate_limit(10, 60 * 60, "parent-message-hour", parent_rate_limit_key)
@rate_limit(40, 24 * 60 * 60, "parent-message-day", parent_rate_limit_key)
def api_parent_create_message():
    def handler():
        data = payload()
        session_data = parent_access_by_token(data.get("token"))

        if not session_data:
            return api_error("Link rodzica jest nieprawidłowy albo wygasł.", 401)

        student = session_data["student"]

        if not student["is_active"]:
            return api_error("Konto ucznia jest nieaktywne.", 403)

        message = str(data.get("message") or "").strip()

        if not message:
            return api_error("Wpisz treść pytania.")

        touch_parent_access(session_data["access"]["id"])
        item = create_contact_message({
            "contact": f"Rodzic ucznia: {student['display_name']}",
            "message": message,
            "origin": "parent",
            "user_id": student["id"],
        })

        return jsonify({
            "message": item,
        }), 201

    return safe(handler)


@app.get("/api/progress/me")
@rate_limit(60, 60, "progress-read")
@require_auth
def api_my_progress(user):
    return jsonify({
        "progress": progress_for_user(user["id"]),
    })


@app.post("/api/speed-training/results")
@rate_limit(12, 10 * 60, "training-result-write")
@rate_limit(100, 24 * 60 * 60, "training-result-write-day")
@require_auth
def api_save_speed_training_result(user):
    def handler():
        data = payload()
        correct_count = int(data.get("correct_count") or 0)
        mistake_count = int(data.get("mistake_count") or 0)

        if mistake_count > correct_count:
            return api_error("Próba odrzucona: liczba błędnych odpowiedzi jest większa niż poprawnych.", 400)

        if user.get("role") == "student":
            data["level"] = training_level_for_user(user)

        result = record_speed_training_result(user["id"], data)

        return jsonify({
            "result": result,
        }), 201

    return safe(handler)


@app.get("/api/speed-training/leaderboard")
@rate_limit(60, 60, "training-leaderboard-read")
@require_auth
def api_speed_training_leaderboard(user):
    filters = {
        "level": request.args.get("level"),
        "topic": request.args.get("topic"),
        "difficulty": request.args.get("difficulty"),
        "round_seconds": request.args.get("round_seconds"),
        "period": request.args.get("period"),
    }

    if user.get("role") == "student":
        filters["level"] = training_level_for_user(user)

    limit = request.args.get("limit", 10)

    return jsonify({
        "leaderboard": speed_training_leaderboard(
            filters=filters,
            limit=limit,
            viewer_user_id=user["id"],
        ),
    })


@app.get("/api/speed-training/history")
@rate_limit(60, 60, "training-history-read")
@require_auth
def api_speed_training_history(user):
    filters = {
        "level": request.args.get("level"),
        "topic": request.args.get("topic"),
        "difficulty": request.args.get("difficulty"),
        "round_seconds": request.args.get("round_seconds"),
        "period": request.args.get("period"),
    }

    if user.get("role") == "student":
        filters["level"] = training_level_for_user(user)

    limit = request.args.get("limit", 12)

    return jsonify({
        "history": speed_training_history(
            user_id=user["id"],
            filters=filters,
            limit=limit,
        ),
    })


@app.post("/api/parent/progress")
@rate_limit(30, 60, "parent-progress", parent_rate_limit_key)
def api_parent_progress():
    def handler():
        data = payload()
        session_data = parent_access_by_token(data.get("token"))

        if not session_data:
            return api_error("Link rodzica jest nieprawidłowy albo wygasł.", 401)

        student = session_data["student"]

        if not student["is_active"]:
            return api_error("Konto ucznia jest nieaktywne.", 403)

        touch_parent_access(session_data["access"]["id"])

        return jsonify({
            "student": student_payload(student),
            "progress": progress_for_user(student["id"]),
        })

    return safe(handler)


@app.post("/api/bernoulli")
@rate_limit(10, 60, "calculator-bernoulli")
@require_calculators_enabled
@require_auth
def api_bernoulli(_user):
    def handler():
        data = payload()
        n = int(data["n"])

        if n < 0 or n > 200:
            raise ValueError("Liczba prób musi należeć do zakresu 0-200.")

        p = finite_number(data["p"], 0, 1)
        raw_k = validate_calculator_list(data["k"], maximum_length=201)
        k_values = [int(value) for value in raw_k]

        if any(value < 0 or value > n for value in k_values):
            raise ValueError("Wartości k muszą należeć do zakresu 0-n.")

        result = bernoulli(p, n, k_values)
        rounded_result = Decimal(str(sp.N(result, 20))).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        plot = bernoulli_plot(p, n, k_values) if wants_plot(data) else None

        return jsonify({
            "result": sp.latex(result),
            "rounded": str(rounded_result),
            "plot": plot,
        })

    return safe(handler)


@app.post("/api/poly")
@rate_limit(10, 60, "calculator-poly")
@require_calculators_enabled
@require_auth
def api_poly(_user):
    def handler():
        data = payload()
        raw_coeffs = validate_calculator_list(data["coeffs"], maximum_length=5)

        if not raw_coeffs:
            raise ValueError("Brakuje współczynników.")

        coeffs = [finite_number(value, -100_000, 100_000) for value in raw_coeffs]
        sol, fac, expanded, plot = poly_solve(coeffs, include_plot=wants_plot(data))

        return jsonify({
            "sol": [sp.latex(s) for s in sol],
            "fac": sp.latex(fac),
            "factored": sp.latex(fac),
            "general": sp.latex(expanded),
            "plot": plot,
        })

    return safe(handler)


@app.post("/api/styczna")
@rate_limit(10, 60, "calculator-tangent")
@require_calculators_enabled
@require_auth
def api_styczna(_user):
    def handler():
        data = payload()
        xa = finite_number(data["xa"])
        ya = finite_number(data["ya"])
        xs = finite_number(data["xs"])
        ys = finite_number(data["ys"])
        radius = finite_number(data["r"], 0.000001, 1_000_000)
        result = styczna(xa, ya, xs, ys, radius)
        plot = styczna_plot(xa, ya, xs, ys, radius, result) if wants_plot(data) else None

        return jsonify({
            "result": [sp.latex(item) for item in result],
            "plot": plot,
        })

    return safe(handler)


@app.post("/api/line_circle")
@rate_limit(10, 60, "calculator-line-circle")
@require_calculators_enabled
@require_auth
def api_line_circle(_user):
    def handler():
        data = payload()
        coefficient_a = finite_number(data["A"])
        coefficient_b = finite_number(data["B"])
        coefficient_c = finite_number(data["C"])
        center_p = finite_number(data["p"])
        center_q = finite_number(data["q"])
        radius = finite_number(data["r"], 0.000001, 1_000_000)

        if coefficient_a == 0 and coefficient_b == 0:
            raise ValueError("Równanie prostej jest nieprawidłowe.")

        result = line_and_circle(
            coefficient_a,
            coefficient_b,
            coefficient_c,
            center_p,
            center_q,
            radius,
        )
        plot = line_and_circle_plot(
            coefficient_a,
            coefficient_b,
            coefficient_c,
            center_p,
            center_q,
            radius,
            result,
        ) if wants_plot(data) else None

        return jsonify({
            "result": [sp.latex(item) for item in result],
            "plot": plot,
        })

    return safe(handler)


@app.post("/api/two_circles")
@rate_limit(10, 60, "calculator-two-circles")
@require_calculators_enabled
@require_auth
def api_two_circles(_user):
    def handler():
        data = payload()
        center_a = finite_number(data["a"])
        center_b = finite_number(data["b"])
        radius_c = finite_number(data["c"], 0.000001, 1_000_000)
        center_p = finite_number(data["p"])
        center_q = finite_number(data["q"])
        radius_r = finite_number(data["r"], 0.000001, 1_000_000)
        result = two_circles(center_a, center_b, radius_c, center_p, center_q, radius_r)
        plot = two_circles_plot(
            center_a,
            center_b,
            radius_c,
            center_p,
            center_q,
            radius_r,
            result,
        ) if wants_plot(data) else None

        return jsonify({
            "result": [sp.latex(item) for item in result],
            "plot": plot,
        })

    return safe(handler)


@app.post("/api/angle")
@rate_limit(10, 60, "calculator-angle")
@require_calculators_enabled
@require_auth
def api_angle(_user):
    def handler():
        data = payload()
        slope_a = finite_number(data["a1"], -100_000, 100_000)
        slope_b = finite_number(data["a2"], -100_000, 100_000)
        result = lines_angle(slope_a, slope_b)
        plot = lines_angle_plot(slope_a, slope_b) if wants_plot(data) else None

        return jsonify({
            "result": result,
            "plot": plot,
        })

    return safe(handler)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "5000"))
    app.run(host="0.0.0.0", port=port, debug=True)
