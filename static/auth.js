(function(){
    const LOCAL_API_URL = "http://127.0.0.1:5000";
    const RENDER_API_URL = "https://deltasigma-calculators.onrender.com";
    const TOKEN_KEY = "deltaSigmaAuthToken";
    const PRIVACY_POLICY_ACCEPTED_PREFIX = "deltaSigmaPrivacyPolicyAccepted:";
    const AUTH_REFRESH_TTL_MS = 30000;
    const BADGE_REFRESH_TTL_MS = 30000;
    let authRefreshPromise = null;
    let cachedAuthUser = null;
    let cachedAuthAt = 0;
    let prospectUnreadCount = null;
    let prospectBadgeAt = 0;
    let prospectBadgePromise = null;

    window.DS_API_BASE_URL = (
        window.DS_API_BASE_URL ||
        (["localhost", "127.0.0.1"].includes(window.location.hostname) ? LOCAL_API_URL : RENDER_API_URL)
    ).replace(/\/$/, "");

    function readStorage(storage, key){
        try {
            return storage.getItem(key);
        } catch(error) {
            return null;
        }
    }

    function removeStorage(storage, key){
        try {
            storage.removeItem(key);
        } catch(error) {
            // Niedostępna pamięć przeglądarki nie może zablokować logowania.
        }
    }

    window.getAuthToken = function(){
        return readStorage(window.localStorage, TOKEN_KEY) || readStorage(window.sessionStorage, TOKEN_KEY);
    };

    window.isAuthRemembered = function(){
        return Boolean(readStorage(window.localStorage, TOKEN_KEY));
    };

    window.saveAuthToken = function(token, remember = false){
        if(!token) return false;

        removeStorage(window.sessionStorage, TOKEN_KEY);
        removeStorage(window.localStorage, TOKEN_KEY);
        const storage = remember ? window.localStorage : window.sessionStorage;

        try {
            storage.setItem(TOKEN_KEY, token);
        } catch(error) {
            if(!remember) return false;
            try {
                window.sessionStorage.setItem(TOKEN_KEY, token);
            } catch(fallbackError) {
                return false;
            }
        }

        cachedAuthUser = null;
        cachedAuthAt = 0;
        prospectUnreadCount = null;
        prospectBadgeAt = 0;
        prospectBadgePromise = null;
        return remember ? window.isAuthRemembered() : Boolean(readStorage(window.sessionStorage, TOKEN_KEY));
    };

    window.clearAuthToken = function(){
        removeStorage(window.sessionStorage, TOKEN_KEY);
        removeStorage(window.localStorage, TOKEN_KEY);
        cachedAuthUser = null;
        cachedAuthAt = 0;
        prospectUnreadCount = null;
        prospectBadgeAt = 0;
        prospectBadgePromise = null;
    };

    function applyProspectBadge(){
        const badge = document.querySelector(".main-nav [data-auth-prospect-badge]");

        if(!badge) return;
        const count = Number(prospectUnreadCount || 0);

        badge.hidden = !count;
        badge.textContent = count ? String(count) : "";
        badge.setAttribute("aria-label", count ? `Nowe zapisy: ${count}` : "");
    }

    window.setAdminProspectBadge = function(count){
        prospectUnreadCount = Math.max(0, Number(count) || 0);
        prospectBadgeAt = Date.now();
        applyProspectBadge();
        const adminTabBadge = document.getElementById("prospectMessageBadge");
        if(adminTabBadge){
            adminTabBadge.textContent = prospectUnreadCount ? String(prospectUnreadCount) : "";
        }
    };

    window.refreshAdminProspectBadge = async function(){
        if(Date.now() - prospectBadgeAt < BADGE_REFRESH_TTL_MS) return;
        if(prospectBadgePromise) return prospectBadgePromise;
        const token = window.getAuthToken();

        const request = window.apiFetch("/api/admin/contact-message-counts")
            .then(data => {
                if(token === window.getAuthToken()){
                    window.setAdminProspectBadge(data.counts?.prospect?.unread);
                }
            })
            .catch(() => {});
        prospectBadgePromise = request;
        request.finally(() => {
            if(prospectBadgePromise === request) prospectBadgePromise = null;
        });
        return prospectBadgePromise;
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

    function updateSiteNoticeSpace(){
        const height = Math.ceil(document.getElementById("siteNoticeStack")?.getBoundingClientRect().height || 0);
        document.documentElement.style.setProperty("--site-notice-height", `${height}px`);
        document.body.classList.toggle("site-notices-visible", height > 0);
    }

    window.appendSiteNotice = function(notice){
        let stack = document.getElementById("siteNoticeStack");
        if(!stack){
            stack = document.createElement("div");
            stack.id = "siteNoticeStack";
            stack.className = "site-notice-stack";
            document.body.appendChild(stack);
            if(typeof ResizeObserver === "function"){
                new ResizeObserver(updateSiteNoticeSpace).observe(stack);
            } else {
                window.addEventListener("resize", updateSiteNoticeSpace);
            }
        }
        stack.appendChild(notice);
        updateSiteNoticeSpace();
    };

    window.removeSiteNotice = function(notice){
        notice.remove();
        updateSiteNoticeSpace();
    };

    function showPrivacyPolicyPrompt(user){
        if(!user || hasAcceptedPrivacyPolicy(user) || document.querySelector("[data-privacy-policy-prompt]")){
            return;
        }

        const notice = document.createElement("section");
        const content = document.createElement("div");
        const copy = document.createElement("p");
        const actions = document.createElement("div");
        const accept = document.createElement("button");
        const logout = document.createElement("button");

        notice.dataset.privacyPolicyPrompt = "";
        notice.className = "site-notice";
        notice.setAttribute("role", "region");
        notice.setAttribute("aria-label", "Polityka prywatności");
        content.className = "site-notice-content";
        copy.innerHTML = 'Aby korzystać z konta, zaakceptuj aktualną <a href="polityka-prywatnosci.html">politykę prywatności</a>.';
        actions.className = "site-notice-actions";

        accept.type = "button";
        accept.innerText = "Akceptuję";
        accept.className = "site-notice-button";

        logout.type = "button";
        logout.innerText = "Nie teraz, wyloguj mnie";
        logout.className = "site-notice-button";

        accept.addEventListener("click", () => {
            acceptPrivacyPolicy(user);
            window.removeSiteNotice(notice);
        });

        logout.addEventListener("click", () => {
            window.logoutCurrentUser();
        });

        actions.append(logout, accept);
        content.append(copy, actions);
        notice.appendChild(content);
        window.appendSiteNotice(notice);
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
        const calculatorsLink = nav.querySelector("[data-auth-calculators]");
        const isAuthenticated = Boolean(user);

        if(calculatorsLink) calculatorsLink.hidden = !isAuthenticated;

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
            if(isAdmin){
                const badge = document.createElement("span");

                badge.dataset.authProspectBadge = "";
                badge.hidden = true;
                panelLink.appendChild(badge);
                applyProspectBadge();
                window.refreshAdminProspectBadge();
            }
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

        if(window.updateStudentNotifications){
            window.updateStudentNotifications(user);
        } else if(user?.role === "student" && !document.querySelector("[data-student-notifications-script]")){
            const script = document.createElement("script");
            const notificationToken = window.getAuthToken();
            script.dataset.studentNotificationsScript = "";
            script.src = "static/student-notifications.js?v=20261013";
            script.onload = () => {
                if(notificationToken === window.getAuthToken()) window.updateStudentNotifications?.(cachedAuthUser || user);
            };
            document.head.appendChild(script);
        }

        const currentPage = window.location.pathname.split("/").pop() || "index.html";

        nav.querySelectorAll("a[href]").forEach(link => {
            if(link.dataset.authPanel !== undefined){
                return;
            }

            const linkPage = link.getAttribute("href").split(/[?#]/)[0] || "index.html";
            link.classList.toggle("active", linkPage === currentPage);
        });

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
                if(error.status === 401 || error.status === 403) window.clearAuthToken();
                window.updateAuthNav(cachedAuthUser);
                return cachedAuthUser;
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

    window.apiFetchBlob = async function(path, options = {}){
        const token = window.getAuthToken();
        const headers = {
            ...(token ? { "Authorization": `Bearer ${token}` } : {}),
            ...(options.headers || {})
        };
        const response = await fetch(`${window.DS_API_BASE_URL}${path}`, {
            ...options,
            headers,
            credentials: "include"
        });

        if(!response.ok){
            const result = await response.json().catch(() => null);
            const error = new Error(result?.error || "Nie udało się pobrać materiału.");

            error.status = response.status;
            throw error;
        }

        return response.blob();
    };

    function updateCurrentYear(){
        const currentYear = String(new Date().getFullYear());

        document.querySelectorAll("[data-current-year]").forEach(element => {
            element.innerText = currentYear;
        });
    }

    function updateMobileCallVisibility(){
        const publicPages = new Set([
            "index.html",
            "zapisy.html",
            "kontakt.html",
            "na_biezaco.html",
            "osmoklasista.html",
            "matura_podstawowa.html",
            "matura_rozszerzona.html",
            "wyniki.html"
        ]);
        const page = window.location.pathname.split("/").pop() || "index.html";
        const visible = publicPages.has(page);

        document.documentElement.classList.toggle("mobile-call-visible", visible);

        document.querySelectorAll("[data-mobile-call]").forEach(element => {
            element.hidden = !visible;
        });
    }

    function bootAuthNav(){
        updateCurrentYear();
        updateMobileCallVisibility();
        window.updateAuthNav(null);
        window.refreshAuthNav();
        window.setInterval(() => {
            if(!document.hidden && cachedAuthUser?.role === "admin"){
                window.refreshAdminProspectBadge();
            }
        }, 60000);
    }

    document.addEventListener("visibilitychange", () => {
        if(!document.hidden && cachedAuthUser?.role === "admin"){
            window.refreshAdminProspectBadge();
        }
    });

    if(document.readyState === "loading"){
        document.addEventListener("DOMContentLoaded", bootAuthNav);
    } else {
        bootAuthNav();
    }

    new MutationObserver(() => {
        const nav = document.querySelector(".main-nav");

        if(nav && !nav.dataset.authReady){
            nav.dataset.authReady = "true";
            updateMobileCallVisibility();
            window.refreshAuthNav();
        }
    }).observe(document.documentElement, {
        childList: true,
        subtree: true
    });
})();
