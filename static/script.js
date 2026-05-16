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

function renderMath(){
    if(window.MathJax){
        MathJax.typeset();
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

/* ===== BERNOULLI ===== */
async function calcBernoulli(){
    try {
        const d = await post("/api/bernoulli", {
            p: readNumber("p"),
            n: readNumber("n"),
            k: readNumberList("k")
        });

        res1.innerHTML = `\\(${d}\\)`;
        renderMath();
    } catch(error) {
        showError(res1, error);
    }
}

/* ===== POLY ===== */
async function calcPoly(){
    try {
        const d = await post("/api/poly", {
            coeffs: readNumberList("coeffs")
        });

        let html = "<b>Rozwiązania:</b><br>";

        d.sol.forEach(s => {
            html += `\\(${s}\\)<br>`;
        });

        html += "<br><b>Postać:</b><br>";
        html += `\\(${d.fac}\\)`;

        res2.innerHTML = html;
        renderMath();
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

        res_styczna.innerHTML = d.map(item => `\\(${item}\\)`).join("<br>");
        renderMath();
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

        res_line.innerHTML = d.map(x => `\\(${x}\\)`).join("<br>");
        renderMath();
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

        res_circles.innerHTML = d.map(x => `\\(${x}\\)`).join("<br>");
        renderMath();
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

        res_angle.innerHTML = `\\(${d}^\\circ\\)`;
        renderMath();
    } catch(error) {
        showError(res_angle, error);
    }
}
