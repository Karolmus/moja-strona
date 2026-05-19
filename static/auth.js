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
        const userLabel = nav.querySelector("[data-auth-user]");
        const logoutButton = nav.querySelector("[data-auth-logout]");
        const isAuthenticated = Boolean(user);

        if(loginLink){
            loginLink.hidden = isAuthenticated;
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
})();
