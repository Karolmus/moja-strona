(function(){
    const VISITOR_KEY = "deltaSigmaAnalyticsVisitor";
    const SESSION_KEY = "deltaSigmaAnalyticsSession";
    const CAMPAIGN_KEY = "deltaSigmaAnalyticsCampaign";
    const CONSENT_KEY = "deltaSigmaCookieConsent";
    let pageConsent = null;
    const SESSION_TIMEOUT_MS = 30 * 60 * 1000;
    const SHORT_CAMPAIGNS = {
        fb: {
            utm_source: "facebook",
            utm_medium: "social",
            utm_campaign: "rekrutacja_2026_27",
            utm_content: "profil"
        },
        grupy: {
            utm_source: "facebook",
            utm_medium: "community",
            utm_campaign: "rekrutacja_2026_27",
            utm_content: "grupy_rodzicow"
        },
        ek: {
            utm_source: "e-korepetycje",
            utm_medium: "profile",
            utm_campaign: "rekrutacja_2026_27",
            utm_content: "profil"
        },
        google: {
            utm_source: "google",
            utm_medium: "business_profile",
            utm_campaign: "rekrutacja_2026_27",
            utm_content: "profil_firmy"
        },
        polecenie: {
            utm_source: "polecenie",
            utm_medium: "referral",
            utm_campaign: "rekrutacja_2026_27",
            utm_content: "rodzice_uczniow"
        }
    };

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

    function sessionValue(key){
        try {
            return window.sessionStorage.getItem(key);
        } catch(error) {
            return null;
        }
    }

    function storeSessionValue(key, value){
        try {
            window.sessionStorage.setItem(key, value);
        } catch(error) {
            // Atrybucja nadal zadziała na bieżącej stronie.
        }
    }

    function campaignValue(value){
        return String(value || "")
            .trim()
            .toLocaleLowerCase("pl-PL")
            .replace(/[^a-z0-9._-]/g, "")
            .slice(0, 80);
    }

    function campaignAttribution(){
        const params = new URLSearchParams(window.location.search);
        const shortCampaign = SHORT_CAMPAIGNS[campaignValue(params.get("ref"))] || {};
        const campaign = {
            utm_source: shortCampaign.utm_source || campaignValue(params.get("utm_source")),
            utm_medium: shortCampaign.utm_medium || campaignValue(params.get("utm_medium")),
            utm_campaign: shortCampaign.utm_campaign || campaignValue(params.get("utm_campaign")),
            utm_content: shortCampaign.utm_content || campaignValue(params.get("utm_content")),
            utm_landing_path: window.location.pathname || "/"
        };

        if(campaign.utm_source){
            storeSessionValue(CAMPAIGN_KEY, JSON.stringify(campaign));
            return campaign;
        }

        try {
            const stored = JSON.parse(sessionValue(CAMPAIGN_KEY) || "null");

            if(stored?.utm_source){
                return stored;
            }
        } catch(error) {
            // Uszkodzony wpis kampanii jest pomijany.
        }

        return {};
    }

    function showCookieBanner(onAccept){
        if(document.querySelector("[data-cookie-banner]")){
            return;
        }

        const banner = document.createElement("section");
        const content = document.createElement("div");
        const text = document.createElement("p");
        const actions = document.createElement("div");
        const accept = document.createElement("button");
        const reject = document.createElement("button");

        banner.dataset.cookieBanner = "";
        banner.className = "site-notice";
        banner.setAttribute("role", "region");
        banner.setAttribute("aria-label", "Informacja o cookies");
        content.className = "site-notice-content";
        text.innerHTML = 'Używamy cookies niezbędnych do działania strony. Statystyki włączymy tylko za zgodą. <a href="polityka-prywatnosci.html">Polityka prywatności</a>.';
        actions.className = "site-notice-actions";

        accept.type = "button";
        accept.innerText = "Zezwól na statystyki";
        accept.className = "site-notice-button";

        reject.type = "button";
        reject.innerText = "Tylko niezbędne";
        reject.className = "site-notice-button";

        accept.addEventListener("click", () => {
            pageConsent = "accepted";
            storeValue(CONSENT_KEY, "accepted");
            window.removeSiteNotice(banner);
            onAccept();
        });

        reject.addEventListener("click", () => {
            pageConsent = "necessary";
            storeValue(CONSENT_KEY, "necessary");
            window.removeSiteNotice(banner);
        });

        actions.append(reject, accept);
        content.append(text, actions);
        banner.appendChild(content);
        window.appendSiteNotice(banner);
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
        const consent = pageConsent || storedValue(CONSENT_KEY);

        if(consent !== "accepted"){
            if(!consent){
                showCookieBanner(sendPageview);
            }

            return;
        }

        const campaign = campaignAttribution();
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
            device_type: deviceType(),
            ...campaign
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
