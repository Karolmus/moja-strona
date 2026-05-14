async function post(url,data){
    let r = await fetch(url,{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify(data)
    });
    return await r.json();
}

/* ===== BERNOULLI ===== */
async function calcBernoulli(){
    let d = await post("/api/bernoulli",{
        p:+p.value,
        n:+n.value,
        k:k.value.split(",").map(Number)
    });

    res1.innerHTML = `\\(${d}\\)`;
    MathJax.typeset();
}

/* ===== POLY ===== */
async function calcPoly(){
    let d = await post("/api/poly",{
        coeffs:coeffs.value.split(",").map(Number)
    });

    let html = "<b>Rozwiązania:</b><br>";

    d.sol.forEach(s=>{
        html += `\\(${s}\\)<br>`;
    });

    html += "<br><b>Postać:</b><br>";
    html += `\\(${d.fac}\\)`;

    res2.innerHTML = html;
    MathJax.typeset();
}

/* ===== STYCZNA ===== */
async function calcStyczna(){
    let d = await post("/api/styczna",{
        xa:+xa.value,
        ya:+ya.value,
        xs:+xs.value,
        ys:+ys.value,
        r:+r.value
    });

    res_styczna.innerHTML =
        `\\(${d[0]}\\)<br>\\(${d[1]}\\)`;

    MathJax.typeset();
}

/* ===== LINE CIRCLE ===== */
async function calcLineCircle(){
    let d = await post("/api/line_circle",{
        A:+A.value,B:+B.value,C:+C.value,
        p:+p1.value,q:+q1.value,r:+r1.value
    });

    res_line.innerHTML = d.map(x=>`\\(${x}\\)`).join("<br>");
    MathJax.typeset();
}

/* ===== TWO CIRCLES ===== */
async function calcTwoCircles(){
    let d = await post("/api/two_circles",{
        a:+a.value,b:+b.value,c:+c.value,
        p:+p2.value,q:+q2.value,r:+r2.value
    });

    res_circles.innerHTML = d.map(x=>`\\(${x}\\)`).join("<br>");
    MathJax.typeset();
}

/* ===== ANGLE ===== */
async function calcAngle(){
    let d = await post("/api/angle",{
        a1:+a1.value,
        a2:+a2.value
    });

    res_angle.innerHTML = `\\(${d}^\\circ\\)`;
    MathJax.typeset();
}