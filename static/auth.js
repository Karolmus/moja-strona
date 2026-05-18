(function(){
    const LOCAL_API_URL = "http://127.0.0.1:5000";
    const RENDER_API_URL = "https://deltasigma-calculators.onrender.com";

    window.DS_API_BASE_URL = (
        window.DS_API_BASE_URL ||
        (["localhost", "127.0.0.1"].includes(window.location.hostname) ? LOCAL_API_URL : RENDER_API_URL)
    ).replace(/\/$/, "");

    window.apiFetch = async function(path, options = {}){
        const headers = {
            "Content-Type": "application/json",
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
