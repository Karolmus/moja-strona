import os

from app import app
from auth_storage import generate_temporary_password, init_auth_db, sync_admin_user


def main():
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@deltasigma.pl")
    configured_password = os.environ.get("ADMIN_PASSWORD")
    admin_password = configured_password or generate_temporary_password()

    with app.app_context():
        init_auth_db()
        user, created = sync_admin_user(admin_email, admin_password)

    print("Baza danych jest gotowa.")
    print(f"Admin: {user['email']}")

    if created:
        print(f"Hasło startowe: {admin_password}")
        print("Zapisz je teraz. Hasło nie będzie ponownie wyświetlane.")
    elif configured_password:
        print("Konto admina już istnieje. Hasło zostało zsynchronizowane ze zmienną ADMIN_PASSWORD.")
    else:
        print("Konto admina już istnieje. Hasło nie zostało zmienione.")


if __name__ == "__main__":
    main()
