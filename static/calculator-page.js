(function(){
    let requestId = 0;
    const workspace = document.getElementById("calculatorWorkspace");
    const access = document.getElementById("calculatorAccess");
    const message = document.getElementById("calculatorAccessMessage");
    const retry = document.getElementById("calculatorAccessRetry");

    window.calculatorsAuthenticated = false;
    window.requireCalculatorLogin = function(){
        window.calculatorsAuthenticated = false;
        workspace.hidden = true;
        window.location.replace("login.html?next=kalkulatory.html");
    };

    async function bootCalculators(){
        const currentRequest = ++requestId;
        window.calculatorsAuthenticated = false;
        workspace.hidden = true;
        access.hidden = false;
        message.textContent = "Sprawdzanie dostępu...";
        retry.hidden = true;
        if(!window.getAuthToken?.()){
            window.requireCalculatorLogin();
            return;
        }
        try {
            const token = window.getAuthToken();
            const session = await window.apiFetch("/api/auth/me");
            if(currentRequest !== requestId || token !== window.getAuthToken()) return;
            if(!session?.authenticated || !session.user){
                window.clearAuthToken?.();
                window.requireCalculatorLogin();
                return;
            }
            window.updateAuthNav(session.user);
            window.calculatorsAuthenticated = true;
            workspace.hidden = false;
            access.hidden = true;
            renderMath(workspace);
        } catch(error) {
            if(currentRequest !== requestId) return;
            if(error.status === 401 || error.status === 403){
                window.clearAuthToken?.();
                window.requireCalculatorLogin();
            } else {
                message.textContent = "Nie udało się sprawdzić logowania. Spróbuj ponownie.";
                retry.hidden = false;
            }
        }
    }

    retry.addEventListener("click", bootCalculators);
    workspace.addEventListener("keydown", event => {
        if(event.key !== "Enter" || event.target.tagName !== "INPUT" || event.target.type === "checkbox") return;
        const card = event.target.closest(".calculator-card");
        if(card){
            event.preventDefault();
            card.querySelector(".calc-btn")?.click();
        }
    });
    window.addEventListener("storage", event => {
        if(event.key === "deltaSigmaAuthToken" || event.key === null) bootCalculators();
    });

    fetch("nav.html?v=20261019-calculators", {cache: "no-cache"})
        .then(response => {if(!response.ok) throw new Error("Nie udało się wczytać menu."); return response.text();})
        .then(html => {document.getElementById("nav").innerHTML = html;})
        .catch(error => console.warn(error.message));
    bootCalculators();
})();
