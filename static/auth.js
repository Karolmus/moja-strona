(function(){
    const LOCAL_API_URL = "http://127.0.0.1:5000";
    const RENDER_API_URL = "https://deltasigma-calculators.onrender.com";
    const TOKEN_KEY = "deltaSigmaAuthToken";

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
        }
    };

    window.clearAuthToken = function(){
        window.localStorage.removeItem(TOKEN_KEY);
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

    window.updateAuthNav = function(user = null){
        const nav = document.querySelector(".main-nav");

        if(!nav) return;

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
            panelLink.hidden = !isAuthenticated || user?.role !== "admin";
            panelLink.innerText = "Mój panel";
            panelLink.href = "admin.html";
            panelLink.title = "Przejdź do panelu admina";
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
    };

    window.refreshAuthNav = async function(){
        const token = window.getAuthToken();

        if(!token){
            window.updateAuthNav(null);
            return null;
        }

        try {
            const session = await window.apiFetch("/api/auth/me");
            const user = session.authenticated ? session.user : null;

            if(!user){
                window.clearAuthToken();
            }

            window.updateAuthNav(user);
            return user;
        } catch(error) {
            window.clearAuthToken();
            window.updateAuthNav(null);
            return null;
        }
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
