const LOCAL_API_URL = "http://127.0.0.1:5000";
const RENDER_API_URL = "https://deltasigma-calculators.onrender.com";

const API_BASE_URL = (
    window.CALCULATORS_API_URL ||
    (["localhost", "127.0.0.1"].includes(window.location.hostname) ? LOCAL_API_URL : RENDER_API_URL)
).replace(/\/$/, "");

async function post(path, data){
    const response = await fetch(`${API_BASE_URL}${path}`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(data)
    });

    const result = await response.json().catch(() => null);

    if(!response.ok || result?.error){
        throw new Error(result?.error || "Nie udało się połączyć z kalkulatorem.");
    }

    return result;
}

function renderMath(target){
    if(window.MathJax){
        const elements = target ? [target] : undefined;

        if(MathJax.typesetPromise){
            MathJax.typesetPromise(elements);
        } else {
            MathJax.typeset(elements);
        }
    }
}

function showError(target, error){
    target.innerText = error.message || "Nie udało się obliczyć wyniku.";
}

function readNumber(id){
    return Number(document.getElementById(id).value);
}

function readNumberList(id){
    return document.getElementById(id)
        .value
        .split(",")
        .map(value => Number(value.trim()))
        .filter(value => !Number.isNaN(value));
}

function renderPlot(plot){
    if(!plot){
        return "";
    }

    return `
        <div class="plot-card">
            <div class="plot-title">Wykres</div>
            ${plot}
        </div>
    `;
}

function renderFormulaList(items, emptyText = "Brak rozwiązań w liczbach rzeczywistych."){
    if(!Array.isArray(items) || items.length === 0){
        return emptyText;
    }

    return items.map(item => `\\(${item}\\)`).join("<br>");
}

function formatPolynomialLatex(coeffs){
    const values = [...coeffs];

    while(values.length > 1 && values[0] === 0){
        values.shift();
    }

    const degree = values.length - 1;
    const terms = [];

    values.forEach((coefficient, index) => {
        if(coefficient === 0){
            return;
        }

        const exponent = degree - index;
        const sign = coefficient < 0 ? "-" : "+";
        const absoluteValue = Math.abs(coefficient);
        const coefficientText = absoluteValue === 1 && exponent > 0 ? "" : String(absoluteValue);
        const variableText = exponent === 0 ? "" : exponent === 1 ? "x" : `x^{${exponent}}`;

        terms.push({sign, body: `${coefficientText}${variableText}`});
    });

    if(terms.length === 0){
        return "0";
    }

    return terms
        .map((term, index) => {
            if(index === 0){
                return term.sign === "-" ? `-${term.body}` : term.body;
            }

            return ` ${term.sign} ${term.body}`;
        })
        .join("");
}

/* ===== BERNOULLI ===== */
async function calcBernoulli(){
    try {
        const d = await post("/api/bernoulli", {
            p: readNumber("p"),
            n: readNumber("n"),
            k: readNumberList("k")
        });

        const result = typeof d === "object" && d !== null ? d.result : d;

        res1.innerHTML = `
            <div class="result-block">
                <b>Wynik:</b><br>
                \\(${result}\\)
            </div>
            ${renderPlot(d?.plot)}
        `;
        renderMath(res1);
    } catch(error) {
        showError(res1, error);
    }
}

/* ===== POLY ===== */
async function calcPoly(){
    try {
        const coeffs = readNumberList("coeffs");
        const d = await post("/api/poly", {
            coeffs
        });

        const zeros = renderFormulaList(d.sol, "Brak miejsc zerowych w liczbach rzeczywistych.");
        const general = d.general || d.expanded || formatPolynomialLatex(coeffs);
        const factored = d.factored || d.fac || general;

        const html = `
            <div class="result-block">
                <b>Miejsca zerowe:</b><br>
                ${zeros}
                <br><br>
                <b>Postać ogólna:</b><br>
                \\(f(x)=${general}\\)
                <br><br>
                <b>Postać iloczynowa:</b><br>
                \\(f(x)=${factored}\\)
            </div>
            ${renderPlot(d.plot)}
        `;

        res2.innerHTML = html;
        renderMath(res2);
    } catch(error) {
        showError(res2, error);
    }
}

/* ===== STYCZNA ===== */
async function calcStyczna(){
    try {
        const d = await post("/api/styczna", {
            xa: readNumber("xa"),
            ya: readNumber("ya"),
            xs: readNumber("xs"),
            ys: readNumber("ys"),
            r: readNumber("r")
        });

        const result = Array.isArray(d) ? d : d.result;

        res_styczna.innerHTML = `
            <div class="result-block">
                <b>Równania stycznych:</b><br>
                ${renderFormulaList(result)}
            </div>
            ${renderPlot(d?.plot)}
        `;
        renderMath(res_styczna);
    } catch(error) {
        showError(res_styczna, error);
    }
}

/* ===== LINE CIRCLE ===== */
async function calcLineCircle(){
    try {
        const d = await post("/api/line_circle", {
            A: readNumber("A"),
            B: readNumber("B"),
            C: readNumber("C"),
            p: readNumber("p1"),
            q: readNumber("q1"),
            r: readNumber("r1")
        });

        const result = Array.isArray(d) ? d : d.result;

        res_line.innerHTML = `
            <div class="result-block">
                <b>Punkty przecięcia:</b><br>
                ${renderFormulaList(result)}
            </div>
            ${renderPlot(d?.plot)}
        `;
        renderMath(res_line);
    } catch(error) {
        showError(res_line, error);
    }
}

/* ===== TWO CIRCLES ===== */
async function calcTwoCircles(){
    try {
        const d = await post("/api/two_circles", {
            a: readNumber("a"),
            b: readNumber("b"),
            c: readNumber("c"),
            p: readNumber("p2"),
            q: readNumber("q2"),
            r: readNumber("r2")
        });

        const result = Array.isArray(d) ? d : d.result;

        res_circles.innerHTML = `
            <div class="result-block">
                <b>Punkty przecięcia:</b><br>
                ${renderFormulaList(result)}
            </div>
            ${renderPlot(d?.plot)}
        `;
        renderMath(res_circles);
    } catch(error) {
        showError(res_circles, error);
    }
}

/* ===== ANGLE ===== */
async function calcAngle(){
    try {
        const d = await post("/api/angle", {
            a1: readNumber("a1"),
            a2: readNumber("a2")
        });

        const result = typeof d === "object" && d !== null ? d.result : d;

        res_angle.innerHTML = `
            <div class="result-block">
                <b>Kąt:</b><br>
                \\(${result}^\\circ\\)
            </div>
            ${renderPlot(d?.plot)}
        `;
        renderMath(res_angle);
    } catch(error) {
        showError(res_angle, error);
    }
}
