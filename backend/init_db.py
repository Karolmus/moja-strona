import os

from app import app
from auth_storage import ensure_admin_user, generate_temporary_password, init_auth_db


def main():
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@deltasigma.pl")
    admin_password = os.environ.get("ADMIN_PASSWORD") or generate_temporary_password()

    with app.app_context():
        init_auth_db()
        user, created = ensure_admin_user(admin_email, admin_password)

    print("Baza danych jest gotowa.")
    print(f"Admin: {user['email']}")

    if created:
        print(f"Hasło startowe: {admin_password}")
        print("Zapisz je teraz. Hasło nie będzie ponownie wyświetlane.")
    else:
        print("Konto admina już istnieje. Hasło nie zostało zmienione.")


if __name__ == "__main__":
    main()
