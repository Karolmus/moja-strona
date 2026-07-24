(function(){
    const LOCAL_API_URL = "http://127.0.0.1:5000";
    const RENDER_API_URL = "https://deltasigma-calculators.onrender.com";
    const TOKEN_KEY = "deltaSigmaAuthToken";
    const PRIVACY_POLICY_ACCEPTED_PREFIX = "deltaSigmaPrivacyPolicyAccepted:";
    const AUTH_REFRESH_TTL_MS = 30000;
    let authRefreshPromise = null;
    let cachedAuthUser = null;
    let cachedAuthAt = 0;

    window.DS_API_BASE_URL = (
        window.DS_API_BASE_URL ||
        (["localhost", "127.0.0.1"].includes(window.location.hostname) ? LOCAL_API_URL : RENDER_API_URL)
    ).replace(/\/$/, "");

    window.getAuthToken = function(){
        return window.localStorage.getItem(TOKEN_KEY);
    };

    window.saveAuthToken = function(token){
        if(token){
            window.localStorage.setItem(TOKEN_KEY, token);
            cachedAuthUser = null;
            cachedAuthAt = 0;
        }
    };

    window.clearAuthToken = function(){
        window.localStorage.removeItem(TOKEN_KEY);
        cachedAuthUser = null;
        cachedAuthAt = 0;
    };

    window.logoutCurrentUser = async function(){
        try {
            await window.apiFetch("/api/auth/logout", { method: "POST" });
        } catch(error) {
            console.warn("Nie udało się zamknąć sesji na serwerze.", error);
        } finally {
            window.clearAuthToken();
            window.location.href = "login.html";
        }
    };

    function privacyConsentKey(user){
        const identifier = user?.email || user?.id || "current";

        return `${PRIVACY_POLICY_ACCEPTED_PREFIX}${identifier}`;
    }

    function hasAcceptedPrivacyPolicy(user){
        try {
            return window.localStorage.getItem(privacyConsentKey(user)) === "yes";
        } catch(error) {
            return false;
        }
    }

    function acceptPrivacyPolicy(user){
        try {
            window.localStorage.setItem(privacyConsentKey(user), "yes");
        } catch(error) {
            // Brak zapisu oznacza ponowne pytanie przy następnym wejściu.
        }
    }

    function showPrivacyPolicyPrompt(user){
        if(!user || hasAcceptedPrivacyPolicy(user) || document.querySelector("[data-privacy-policy-prompt]")){
            return;
        }

        const overlay = document.createElement("section");
        const dialog = document.createElement("div");
        const title = document.createElement("h2");
        const copy = document.createElement("p");
        const actions = document.createElement("div");
        const accept = document.createElement("button");
        const logout = document.createElement("button");

        overlay.dataset.privacyPolicyPrompt = "";
        overlay.setAttribute("role", "dialog");
        overlay.setAttribute("aria-modal", "true");
        overlay.setAttribute("aria-label", "Akceptacja polityki prywatności");
        overlay.style.cssText = [
            "position:fixed",
            "inset:0",
            "z-index:4000",
            "display:grid",
            "place-items:center",
            "padding:20px",
            "background:rgba(15,23,42,0.48)",
            "font-family:Poppins, sans-serif"
        ].join(";");

        dialog.style.cssText = [
            "display:grid",
            "gap:14px",
            "width:min(520px, 100%)",
            "border-radius:12px",
            "background:#ffffff",
            "color:#1f2a36",
            "padding:22px",
            "box-shadow:0 22px 70px rgba(15,23,42,0.32)"
        ].join(";");

        title.innerText = "Potwierdź politykę prywatności";
        title.style.cssText = "margin:0;font-size:22px;line-height:1.2";

        copy.innerHTML = 'Aby korzystać z konta, zaakceptuj aktualną <a href="polityka-prywatnosci.html" style="color:#24527a;font-weight:700">politykę prywatności</a>. Jeśli nie chcesz jej teraz akceptować, spokojnie zakończymy sesję.';
        copy.style.cssText = "margin:0;color:#475569;font-size:14px;line-height:1.6";

        actions.style.cssText = "display:flex;flex-wrap:wrap;gap:10px;justify-content:flex-end";

        accept.type = "button";
        accept.innerText = "Akceptuję";
        accept.style.cssText = "border:1px solid #263545;border-radius:8px;background:#263545;color:#ffffff;font:inherit;font-size:14px;font-weight:700;padding:9px 13px;cursor:pointer";

        logout.type = "button";
        logout.innerText = "Nie teraz, wyloguj mnie";
        logout.style.cssText = "border:1px solid #d9e1ea;border-radius:8px;background:#ffffff;color:#1f2a36;font:inherit;font-size:14px;font-weight:700;padding:9px 13px;cursor:pointer";

        accept.addEventListener("click", () => {
            acceptPrivacyPolicy(user);
            overlay.remove();
        });

        logout.addEventListener("click", () => {
            window.logoutCurrentUser();
        });

        actions.append(logout, accept);
        dialog.append(title, copy, actions);
        overlay.appendChild(dialog);
        document.body.appendChild(overlay);
        accept.focus();
    }

    window.updateAuthNav = function(user = null){
        const nav = document.querySelector(".main-nav");

        if(!nav){
            showPrivacyPolicyPrompt(user);
            return;
        }

        const loginLink = nav.querySelector("[data-auth-login]");
        let panelLink = nav.querySelector("[data-auth-panel]");
        const userLabel = nav.querySelector("[data-auth-user]");
        const logoutButton = nav.querySelector("[data-auth-logout]");
        const isAuthenticated = Boolean(user);

        if(!panelLink){
            panelLink = document.createElement("a");
            panelLink.className = "my-panel-link";
            panelLink.dataset.authPanel = "";
            panelLink.hidden = true;
            panelLink.innerText = "Mój panel";

            if(loginLink){
                nav.insertBefore(panelLink, loginLink);
            } else if(userLabel){
                nav.insertBefore(panelLink, userLabel);
            } else {
                nav.appendChild(panelLink);
            }
        }

        if(loginLink){
            loginLink.hidden = isAuthenticated;
        }

        if(panelLink){
            const isAdmin = user?.role === "admin";
            const isStudent = user?.role === "student";
            const currentPage = window.location.pathname.split("/").pop();

            panelLink.hidden = !isAuthenticated || (!isAdmin && !isStudent);
            panelLink.innerText = isAdmin ? "Mój panel" : "Mój profil";
            panelLink.href = isAdmin ? "admin.html" : "profil.html";
            panelLink.title = isAdmin ? "Przejdź do panelu admina" : "Przejdź do profilu ucznia";
            panelLink.classList.toggle(
                "active",
                (isAdmin && currentPage === "admin.html") ||
                (isStudent && currentPage === "profil.html")
            );
            panelLink.onclick = null;
        }

        if(userLabel){
            const name = user?.display_name || user?.email || "Zalogowano";

            userLabel.hidden = !isAuthenticated;
            userLabel.innerText = isAuthenticated ? `Zalogowano: ${name}` : "";
            userLabel.title = user?.email || name;
        }

        if(logoutButton){
            logoutButton.hidden = !isAuthenticated;
            logoutButton.onclick = window.logoutCurrentUser;
        }

        showPrivacyPolicyPrompt(user);
    };

    window.refreshAuthNav = async function(options = {}){
        const token = window.getAuthToken();

        if(!token){
            window.updateAuthNav(null);
            return null;
        }

        if(!options.force && Date.now() - cachedAuthAt < AUTH_REFRESH_TTL_MS){
            window.updateAuthNav(cachedAuthUser);
            return cachedAuthUser;
        }

        if(authRefreshPromise){
            return authRefreshPromise;
        }

        authRefreshPromise = (async () => {
            try {
                const session = await window.apiFetch("/api/auth/me");
                const user = session.authenticated ? session.user : null;

                if(!user){
                    window.clearAuthToken();
                } else {
                    cachedAuthUser = user;
                    cachedAuthAt = Date.now();
                }

                window.updateAuthNav(user);
                return user;
            } catch(error) {
                window.clearAuthToken();
                window.updateAuthNav(null);
                return null;
            } finally {
                authRefreshPromise = null;
            }
        })();

        return authRefreshPromise;
    };

    window.apiFetch = async function(path, options = {}){
        const token = window.getAuthToken();
        const headers = {
            "Content-Type": "application/json",
            ...(token ? { "Authorization": `Bearer ${token}` } : {}),
            ...(options.headers || {})
        };

        const response = await fetch(`${window.DS_API_BASE_URL}${path}`, {
            ...options,
            headers,
            credentials: "include"
        });

        const result = await response.json().catch(() => null);

        if(!response.ok || result?.error){
            const error = new Error(result?.error || "Nie udało się połączyć z serwerem.");

            error.status = response.status;
            error.payload = result;
            throw error;
        }

        return result;
    };

    function bootAuthNav(){
        window.updateAuthNav(null);
        window.refreshAuthNav();
    }

    if(document.readyState === "loading"){
        document.addEventListener("DOMContentLoaded", bootAuthNav);
    } else {
        bootAuthNav();
    }

    new MutationObserver(() => {
        const nav = document.querySelector(".main-nav");

        if(nav && !nav.dataset.authReady){
            nav.dataset.authReady = "true";
            window.refreshAuthNav();
        }
    }).observe(document.documentElement, {
        childList: true,
        subtree: true
    });
})();
