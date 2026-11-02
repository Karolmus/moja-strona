function includePlots(){
    return Boolean(document.getElementById("includePlots")?.checked);
}

async function post(path, data){
    if(!window.calculatorsAuthenticated){
        window.requireCalculatorLogin?.();
        throw new Error("Zaloguj się, aby korzystać z kalkulatorów.");
    }
    try {
        return await window.apiFetch(path, {method: "POST", body: JSON.stringify(data)});
    } catch(error) {
        if(error.status === 401 || error.status === 403){
            window.clearAuthToken?.();
            window.requireCalculatorLogin?.();
        }
        throw error;
    }
}

function renderMath(target = document){
    if(!target || !window.katex) return;
    target.querySelectorAll("[data-tex]").forEach(node => {
        window.katex.render(node.dataset.tex, node, {
            displayMode: false, output: "htmlAndMathml", throwOnError: false,
            trust: false, strict: "error", maxExpand: 1000, maxSize: 10
        });
    });
}

function escapeCalculatorHTML(value){
    return String(value).replace(/[&<>"']/g, character => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[character]);
}

function formula(value){
    const safe = escapeCalculatorHTML(value);
    return `<span class="calculator-math" data-tex="${safe}">${safe}</span>`;
}

function parseUserNumber(value){
    const normalized = String(value).trim().replace(/\s+/g, "").replace(/,/g, ".");
    if(!normalized) throw new Error("Wpisz wszystkie wymagane wartości.");
    const parts = normalized.split("/");
    const numberPattern = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;
    if(parts.length > 2 || parts.some(part => !numberPattern.test(part))){
        throw new Error("Podaj liczbę, ułamek lub liczbę dziesiętną.");
    }
    const result = parts.length === 2 ? Number(parts[0]) / Number(parts[1]) : Number(parts[0]);
    if(!Number.isFinite(result)) throw new Error("Podaj skończoną liczbę. Nie można dzielić przez zero.");
    return result;
}

function readNumber(id){
    const input = document.getElementById(id);
    try {
        const value = parseUserNumber(input.value);
        input.removeAttribute("aria-invalid");
        return value;
    } catch(error) {
        input.setAttribute("aria-invalid", "true");
        input.focus();
        throw error;
    }
}

function readNumberList(id){
    const input = document.getElementById(id);
    const rawValue = input.value.trim();
    if(!rawValue) throw new Error("Wpisz wartości oddzielone średnikami.");
    const commaCount = (rawValue.match(/,/g) || []).length;
    const hasStrongSeparators = /[;\n\s]/.test(rawValue);
    const values = hasStrongSeparators
        ? rawValue.replace(/,\s+/g, ";").split(/[;\s]+/).filter(Boolean)
        : rawValue.includes(".") || commaCount > 1 ? rawValue.split(",") : [rawValue];
    return values.map(parseUserNumber);
}

function readBinomialParameter(id){
    const value = readNumber(id);
    if(!Number.isInteger(value) || value < 0 || value > 1000){
        const input = document.getElementById(id);
        input.setAttribute("aria-invalid", "true");
        input.focus();
        throw new Error("Podaj liczby całkowite od 0 do 1000.");
    }
    return value;
}

function renderPlot(plot){
    if(!plot) return "";
    const parsed = new DOMParser().parseFromString(String(plot), "image/svg+xml");
    const svg = parsed.documentElement;
    if(svg.localName !== "svg" || parsed.querySelector("parsererror")) return "";
    const tags = new Set(["svg", "g", "path", "line", "circle", "rect", "text", "polyline", "title"]);
    const attributes = new Set(["xmlns", "viewBox", "class", "role", "aria-label", "width", "height",
        "x", "y", "x1", "x2", "y1", "y2", "cx", "cy", "r", "rx", "ry", "d", "points", "fill",
        "stroke", "stroke-width", "stroke-dasharray", "font-size", "font-family", "text-anchor",
        "dominant-baseline", "opacity", "fill-opacity", "stroke-opacity", "preserveAspectRatio"]);
    [svg, ...svg.querySelectorAll("*")].forEach(node => {
        if(!tags.has(node.localName)){ node.remove(); return; }
        [...node.attributes].forEach(attribute => {
            if(!attributes.has(attribute.name) || /url\s*\(|javascript:|data:/i.test(attribute.value)){
                node.removeAttribute(attribute.name);
            }
        });
    });
    return `<div class="plot-card">${svg.outerHTML}</div>`;
}

function renderFormulaList(items, emptyText = "Brak rozwiązań w liczbach rzeczywistych."){
    return Array.isArray(items) && items.length
        ? `<div class="result-formulas">${items.map(formula).join("")}</div>` : escapeCalculatorHTML(emptyText);
}

async function calculate(targetId, path, readData, output){
    const target = document.getElementById(targetId);
    const button = target.closest(".calculator-card").querySelector(".calc-btn");
    if(button.disabled) return;
    button.disabled = true;
    const token = window.getAuthToken?.();
    target.setAttribute("aria-busy", "true");
    target.setAttribute("role", "status");
    target.dataset.state = "loading";
    target.textContent = "Obliczanie...";
    try {
        const data = readData();
        const result = await post(path, {...data, include_plot: includePlots()});
        if(token !== window.getAuthToken?.()) return;
        target.innerHTML = output(result) + renderPlot(result?.plot);
        target.dataset.state = "ready";
        renderMath(target);
    } catch(error) {
        target.dataset.state = "error";
        target.textContent = error.message || "Nie udało się obliczyć wyniku.";
    } finally {
        target.setAttribute("aria-busy", "false");
        button.disabled = false;
    }
}

function calcBernoulli(){
    return calculate("res1", "/api/bernoulli", () => ({p: readNumber("p"), n: readNumber("n"), k: readNumberList("k")}),
        result => `<div class="result-block"><b>Prawdopodobieństwo</b>${formula(result.result)}<b>W przybliżeniu</b><span>${escapeCalculatorHTML(String(result.rounded).replace(".", ","))}</span></div>`);
}

function calcBinomial(){
    return calculate("res_binomial", "/api/binomial", () => {
        const n = readBinomialParameter("binomialN");
        const k = readBinomialParameter("binomialK");
        if(k > n){
            const input = document.getElementById("binomialK");
            input.setAttribute("aria-invalid", "true");
            input.focus();
            throw new Error("Liczba k nie może być większa od n.");
        }
        return {n, k};
    }, result => `<div class="result-block binomial-result"><b>Wynik</b>${formula(`\\binom{${result.n}}{${result.k}}=${result.result}`)}</div>`);
}

function calcCompoundInterest(){
    return calculate("res_compound", "/api/compound-interest", () => {
        const fields = [
            ["compoundCapital", "capital", 1_000_000_000, "Kapitał musi należeć do zakresu od 0 do 1 000 000 000 zł."],
            ["compoundRate", "annual_rate", 100, "Oprocentowanie musi należeć do zakresu od 0 do 100%."],
            ["compoundYears", "years", 100, "Czas musi należeć do zakresu od 0 do 100 lat."],
            ["compoundFrequency", "frequency", 12, "Wybierz częstotliwość kapitalizacji."],
        ];
        const data = {};
        for(const [id, key, maximum, message] of fields){
            const value = readNumber(id);
            if(value < 0 || value > maximum || (key === "frequency" && ![1, 2, 4, 12].includes(value))){
                const input = document.getElementById(id);
                input.setAttribute("aria-invalid", "true");
                input.focus();
                throw new Error(message);
            }
            data[key] = value;
        }
        const periods = data.years * data.frequency;
        if(Math.abs(periods - Math.round(periods)) > 1e-10 || (data.years > 0 && Math.round(periods) === 0)){
            const input = document.getElementById("compoundYears");
            input.setAttribute("aria-invalid", "true");
            input.focus();
            throw new Error("Czas musi obejmować pełną liczbę okresów kapitalizacji.");
        }
        return data;
    }, result => {
        const tex = value => String(value).replace(".", "{,}");
        const substitution = `K=${tex(result.capital)}\\left(1+\\frac{${tex(result.annual_rate)}}{100\\cdot ${result.frequency}}\\right)^{${result.periods}}`;
        return `<div class="result-block compound-result"><b>Kapitał końcowy</b><span>${escapeCalculatorHTML(result.balance.replace(".", ","))} zł</span><b>Odsetki</b><span>${escapeCalculatorHTML(result.interest.replace(".", ","))} zł</span><b>Podstawienie do wzoru</b>${formula(substitution)}</div>`;
    });
}

function calcPoly(){
    return calculate("res2", "/api/poly", () => ({coeffs: readNumberList("coeffs")}),
        result => `<div class="result-block"><b>Miejsca zerowe</b>${renderFormulaList(result.sol)}<b>Postać ogólna</b>${formula(`f(x)=${result.general}`)}<b>Postać iloczynowa</b>${formula(`f(x)=${result.factored}`)}</div>`);
}

function calcStyczna(){
    return calculate("res_styczna", "/api/styczna", () => ({
        xa:readNumber("xa"), ya:readNumber("ya"), xs:readNumber("xs"), ys:readNumber("ys"), r:readNumber("r")
    }), result => `<div class="result-block"><b>Równania stycznych</b>${renderFormulaList(result.result)}</div>`);
}

function calcLineCircle(){
    return calculate("res_line", "/api/line_circle", () => ({
        A:readNumber("A"), B:readNumber("B"), C:readNumber("C"), p:readNumber("p1"), q:readNumber("q1"), r:readNumber("r1")
    }), result => `<div class="result-block"><b>Punkty przecięcia</b>${renderFormulaList(result.result)}</div>`);
}

function calcTwoCircles(){
    return calculate("res_circles", "/api/two_circles", () => ({
        a:readNumber("a"), b:readNumber("b"), c:readNumber("c"), p:readNumber("p2"), q:readNumber("q2"), r:readNumber("r2")
    }), result => `<div class="result-block"><b>Punkty przecięcia</b>${renderFormulaList(result.result, result.message || "Brak punktów wspólnych.")}</div>`);
}

function calcAngle(){
    return calculate("res_angle", "/api/angle", () => ({a1:readNumber("a1"), a2:readNumber("a2")}),
        result => `<div class="result-block"><b>Kąt między prostymi</b>${formula(`${result.result}^{\\circ}`)}</div>`);
}
