(function(){
    const VISITOR_KEY = "deltaSigmaAnalyticsVisitor";
    const SESSION_KEY = "deltaSigmaAnalyticsSession";
    const CONSENT_KEY = "deltaSigmaCookieConsent";
    const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

    if(
        window.location.protocol === "file:" ||
        window.location.pathname.endsWith("/admin.html") ||
        navigator.webdriver ||
        navigator.doNotTrack === "1"
    ){
        return;
    }

    function randomId(){
        if(window.crypto?.randomUUID){
            return window.crypto.randomUUID();
        }

        const bytes = new Uint8Array(16);

        window.crypto.getRandomValues(bytes);
        return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
    }

    function storedValue(key){
        try {
            return window.localStorage.getItem(key);
        } catch(error) {
            return null;
        }
    }

    function storeValue(key, value){
        try {
            window.localStorage.setItem(key, value);
        } catch(error) {
            // Statystyki nadal działają w obrębie bieżącego widoku.
        }
    }

    function showCookieBanner(onAccept){
        if(document.querySelector("[data-cookie-banner]")){
            return;
        }

        const banner = document.createElement("section");
        const text = document.createElement("p");
        const actions = document.createElement("div");
        const accept = document.createElement("button");
        const reject = document.createElement("button");

        banner.dataset.cookieBanner = "";
        banner.setAttribute("role", "dialog");
        banner.setAttribute("aria-label", "Informacja o cookies");
        banner.style.cssText = [
            "position:fixed",
            "left:16px",
            "right:16px",
            "bottom:16px",
            "z-index:3000",
            "display:flex",
            "gap:12px",
            "align-items:center",
            "justify-content:space-between",
            "max-width:980px",
            "margin:0 auto",
            "padding:14px 16px",
            "border:1px solid rgba(255,255,255,0.18)",
            "border-radius:10px",
            "background:#1f2a36",
            "color:#ffffff",
            "box-shadow:0 18px 50px rgba(15,23,42,0.28)",
            "font-family:Poppins, sans-serif"
        ].join(";");

        text.style.cssText = "margin:0;font-size:13px;line-height:1.45;color:rgba(255,255,255,0.86)";
        text.innerHTML = 'Używamy niezbędnych mechanizmów działania strony oraz opcjonalnych statystyk oglądalności. Szczegóły: <a href="polityka-prywatnosci.html" style="color:#ffffff;font-weight:700">polityka prywatności</a>.';

        actions.style.cssText = "display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end";

        accept.type = "button";
        accept.innerText = "Akceptuję";
        accept.style.cssText = "border:0;border-radius:8px;background:#ffffff;color:#1f2a36;font:inherit;font-size:13px;font-weight:700;padding:8px 12px;cursor:pointer";

        reject.type = "button";
        reject.innerText = "Tylko niezbędne";
        reject.style.cssText = "border:1px solid rgba(255,255,255,0.28);border-radius:8px;background:rgba(255,255,255,0.08);color:#ffffff;font:inherit;font-size:13px;font-weight:700;padding:8px 12px;cursor:pointer";

        accept.addEventListener("click", () => {
            storeValue(CONSENT_KEY, "accepted");
            banner.remove();
            onAccept();
        });

        reject.addEventListener("click", () => {
            storeValue(CONSENT_KEY, "necessary");
            banner.remove();
        });

        actions.append(reject, accept);
        banner.append(text, actions);
        document.body.appendChild(banner);
    }

    function visitorId(){
        const existing = storedValue(VISITOR_KEY);

        if(existing){
            return existing;
        }

        const created = randomId();

        storeValue(VISITOR_KEY, created);
        return created;
    }

    function sessionId(){
        const now = Date.now();
        const existing = storedValue(SESSION_KEY);

        if(existing){
            try {
                const parsed = JSON.parse(existing);

                if(
                    parsed.id &&
                    Number(parsed.last_seen || 0) >= now - SESSION_TIMEOUT_MS
                ){
                    storeValue(SESSION_KEY, JSON.stringify({
                        id: parsed.id,
                        last_seen: now
                    }));
                    return parsed.id;
                }
            } catch(error) {
                // Uszkodzony wpis jest zastępowany nową sesją.
            }
        }

        const created = randomId();

        storeValue(SESSION_KEY, JSON.stringify({
            id: created,
            last_seen: now
        }));
        return created;
    }

    function deviceType(){
        const width = Math.max(
            Number(window.innerWidth || 0),
            Number(document.documentElement.clientWidth || 0)
        );

        if(width <= 600) return "mobile";
        if(width <= 1024) return "tablet";

        return "desktop";
    }

    function referrerHost(){
        if(!document.referrer){
            return "";
        }

        try {
            const referrer = new URL(document.referrer);

            return referrer.hostname === window.location.hostname
                ? "__internal__"
                : referrer.hostname;
        } catch(error) {
            return "";
        }
    }

    async function sendPageview(){
        const consent = storedValue(CONSENT_KEY);

        if(consent !== "accepted"){
            if(!consent){
                showCookieBanner(sendPageview);
            }

            return;
        }

        const apiBase = String(window.DS_API_BASE_URL || "").replace(/\/$/, "");

        if(!apiBase){
            return;
        }

        const user = typeof window.refreshAuthNav === "function"
            ? await window.refreshAuthNav()
            : null;

        if(user?.role === "admin"){
            return;
        }

        const token = typeof window.getAuthToken === "function"
            ? window.getAuthToken()
            : null;
        const body = JSON.stringify({
            path: window.location.pathname || "/",
            visitor_id: visitorId(),
            session_id: sessionId(),
            referrer_host: referrerHost(),
            device_type: deviceType()
        });

        fetch(`${apiBase}/api/analytics/pageview`, {
            method: "POST",
            credentials: "omit",
            keepalive: true,
            headers: token ? { "Authorization": `Bearer ${token}` } : {},
            body
        }).catch(() => {
            // Analityka nie może wpływać na działanie strony.
        });
    }

    if(document.readyState === "loading"){
        document.addEventListener("DOMContentLoaded", sendPageview, { once: true });
    } else {
        sendPageview();
    }
})();
