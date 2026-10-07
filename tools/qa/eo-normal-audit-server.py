import os
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
os.environ["DATABASE_PATH"] = str(Path(tempfile.mkdtemp(prefix="eo-audit-db-")) / "audit.sqlite3")
os.environ.pop("DATABASE_URL", None)
os.environ.pop("RENDER", None)
os.environ["SECRET_KEY"] = "isolated-local-eo-audit-not-a-production-key"
os.environ["RATE_LIMIT_ENABLED"] = "false"
sys.path.insert(0, str(ROOT / "backend"))

from app import app
from auth_storage import create_user, get_db, get_user_by_email
from flask import send_from_directory
from werkzeug.serving import make_server

app.static_folder = str(ROOT / "static")

@app.after_request
def audit_api_origin(response):
    if response.mimetype == "text/html":
        response.direct_passthrough = False
        response.set_data(response.get_data().replace(
            b"<head>",
            b"<head><script>window.DS_API_BASE_URL = window.location.origin;</script>",
            1,
        ))
    return response

with app.app_context():
    for number in range(1, 15):
        create_user(f"eo-audit-{number}@example.test", f"EO audit {number}", "local-audit-password", level="egzamin_osmoklasisty")
    create_user("eo-admin@example.test", "Audit admin", "local-audit-password", role="admin")

@app.get("/<path:asset>")
def audit_static(asset):
    return send_from_directory(ROOT, asset)

@app.post("/__audit/reset/<int:number>")
def audit_reset(number):
    user = get_user_by_email(f"eo-audit-{number}@example.test")
    database = get_db()
    database.execute("DELETE FROM task_progress WHERE user_id = ?", (user["id"],))
    database.execute("DELETE FROM task_review_items WHERE user_id = ?", (user["id"],))
    database.commit()
    return {"ok": True}

print("Local EO audit server ready on 127.0.0.1:8793", flush=True)
make_server("127.0.0.1", 8793, app, threaded=True).serve_forever()
