(function(){
    const VISITOR_KEY = "deltaSigmaAnalyticsVisitor";
    const SESSION_KEY = "deltaSigmaAnalyticsSession";
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

    function sendPageview(){
        const apiBase = String(window.DS_API_BASE_URL || "").replace(/\/$/, "");

        if(!apiBase){
            return;
        }

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
