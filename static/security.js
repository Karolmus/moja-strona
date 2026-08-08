(function(){
    try {
        window.localStorage.removeItem("deltaSigmaIssuedStudentCredentials");
        window.localStorage.removeItem("deltaSigmaAuthToken");
    } catch(error) {
        // Oczyszczanie starszych wpisów nie może blokować strony.
    }

    const localPreviewHosts = new Set(["localhost", "127.0.0.1", "::1"]);
    const isLocalPreview = window.location.protocol === "file:"
        || localPreviewHosts.has(window.location.hostname);

    if(window.top === window.self || isLocalPreview) return;

    document.documentElement.style.display = "none";

    try {
        window.top.location.replace(window.self.location.href);
    } catch(error) {
        // Strona pozostaje ukryta, jeśli przeglądarka blokuje wyjście z ramki.
    }
})();
