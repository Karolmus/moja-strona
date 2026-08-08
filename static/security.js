(function(){
    try {
        window.localStorage.removeItem("deltaSigmaIssuedStudentCredentials");
        window.localStorage.removeItem("deltaSigmaAuthToken");
    } catch(error) {
        // Oczyszczanie starszych wpisów nie może blokować strony.
    }

    if(window.top === window.self) return;

    document.documentElement.style.display = "none";

    try {
        window.top.location.replace(window.self.location.href);
    } catch(error) {
        // Strona pozostaje ukryta, jeśli przeglądarka blokuje wyjście z ramki.
    }
})();
