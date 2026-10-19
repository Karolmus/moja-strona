(function(root){
    const generators = [];
    const box = "\\boxed{\\;?\\;}";
    const signed = n => n < 0 ? "- " + Math.abs(n) : "+ " + n;
    const term = (n, variable) => (n === 1 ? "" : n === -1 ? "-" : n) + variable;
    const tail = (n, variable = "") => n === 0 ? "" :
        (n < 0 ? " - " : " + ") + (variable ? term(Math.abs(n), variable) : Math.abs(n));
    const question = (label, instruction, tex, answer, parameters = {}) =>
        ({label, instruction, tex, answer, parameters, calculator: false});

    function family(id, level, lesson, topic, build){
        generators.push({
            id, level, lesson, topic,
            make(random = Math.random){
                const int = (min, max) => min + Math.floor(random() * (max - min + 1));
                const pick = items => items[int(0, items.length - 1)];
                return {...build({int, pick}), familyId: id};
            }
        });
    }

    for(const level of ["eo", "mp"]){
        family(level + "-powers", level, level === "eo" ? "lesson_3" : "lesson_1", "powers", ({int, pick}) => {
            const base = pick([2, 3, 5]), a = int(1, 4), b = int(1, 4);
            return question("Potęgi", "Uzupełnij wykładnik potęgi.",
                `${base}^{${a}}\\cdot ${base}^{${b}}=${base}^{${box}}`, a + b, {base, a, b});
        });
        family(level + "-root", level, level === "eo" ? "lesson_4" : "lesson_1", "roots", ({int, pick}) => {
            const coefficient = int(2, 4), radicand = pick([2, 3, 5]);
            return question("Pierwiastki", "Uzupełnij współczynnik przed pierwiastkiem.",
                `\\sqrt{${coefficient ** 2 * radicand}}=${box}\\sqrt{${radicand}}`,
                coefficient, {coefficient, radicand});
        });
    }
    family("eo-percent", "eo", "lesson_1", "percents", ({pick}) => {
        const percent = pick([10, 20, 25, 50, 75]), number = pick([20, 40, 80, 100]);
        return question("Procenty", "Oblicz podany procent liczby.",
            `${percent}\\%\\cdot ${number}=${box}`, number * percent / 100, {percent, number});
    });
    family("eo-fraction", "eo", "lesson_2", "fractions", ({pick}) => {
        const [a, b, c, d] = pick([[1,2,1,4],[1,3,1,6],[1,4,3,4],[1,6,1,3],[2,3,1,6]]);
        const denominator = Math.max(b, d);
        return question("Ułamki", "Uzupełnij licznik wyniku.",
            `\\frac{${a}}{${b}}+\\frac{${c}}{${d}}=\\frac{${box}}{${denominator}}`,
            a * denominator / b + c * denominator / d, {a, b, c, d, denominator});
    });
    family("eo-equivalent", "eo", "lesson_2", "fractions", ({int}) => {
        const denominator = int(2, 6), numerator = int(1, denominator - 1), factor = int(2, 3);
        return question("Ułamki", "Uzupełnij licznik równoważnego ułamka.",
            `\\frac{${numerator}}{${denominator}}=\\frac{${box}}{${denominator * factor}}`,
            numerator * factor, {numerator, denominator, factor});
    });
    family("eo-divisibility", "eo", "lesson_2", "divisibility", ({int, pick}) => {
        const divisor = pick([2, 3, 5, 9]), number = divisor * int(3, 10) + pick([0, 1]);
        return {...question("Podzielność", `Czy liczba ${number} jest podzielna przez ${divisor}?`,
            "", Number(number % divisor === 0), {number, divisor}), answerMode:"yes-no"};
    });
    family("eo-expression", "eo", "lesson_5", "algebra", ({int}) => {
        const a = int(2, 4), x = int(-2, 3), b = int(1, 5);
        return question("Wyrażenia algebraiczne", "Oblicz wartość wyrażenia dla podanego x.",
            `\\begin{gathered}x=${x}\\\\${a}x+${b}=${box}\\end{gathered}`, a * x + b, {a, x, b});
    });
    family("eo-equation", "eo", "lesson_6", "equations", ({int}) => {
        const a = int(2, 4), x = int(1, 5), b = int(1, 5);
        return question("Równania", "Podaj rozwiązanie równania.",
            `\\begin{gathered}${a}x+${b}=${a * x + b}\\\\x=${box}\\end{gathered}`, x, {a, x, b});
    });
    family("eo-clock", "eo", "lesson_7", "clock", ({int, pick}) => {
        const hour = int(7, 18), start = pick([0, 15, 30, 45]), elapsed = pick([15, 30, 45, 60]);
        const end = hour * 60 + start + elapsed;
        const clock = (h, m) => h + ":" + String(m).padStart(2, "0");
        return question("Czas", `Ile minut mija od ${clock(hour, start)} do ${clock(Math.floor(end / 60), end % 60)}?`,
            `t=${box}\\ \\mathrm{min}`, elapsed, {hour, start, elapsed});
    });
    family("eo-motion", "eo", "lesson_8", "motion", ({int, pick}) => {
        const speed = pick([10, 20, 30]), hours = int(2, 4), askTime = pick([true, false]);
        return question("Droga, prędkość i czas", askTime ? "Oblicz czas w godzinach." : "Oblicz drogę w kilometrach.",
            askTime
                ? `\\begin{gathered}s=${speed * hours}\\ \\mathrm{km}\\\\v=${speed}\\ \\mathrm{km/h}\\\\t=${box}\\ \\mathrm{h}\\end{gathered}`
                : `\\begin{gathered}v=${speed}\\ \\mathrm{km/h}\\\\t=${hours}\\ \\mathrm{h}\\\\s=${box}\\ \\mathrm{km}\\end{gathered}`,
            askTime ? hours : speed * hours, {speed, hours, askTime});
    });
    family("eo-triangle", "eo", "lesson_9", "areas", ({int, pick}) => {
        const base = pick([4, 6, 8]), height = int(2, 6);
        return question("Pole trójkąta", "Oblicz pole trójkąta o podanej podstawie i wysokości.",
            `\\begin{gathered}a=${base},\\quad h=${height}\\\\P=${box}\\end{gathered}`,
            base * height / 2, {base, height});
    });
    family("eo-trapezoid", "eo", "lesson_9", "areas", ({int}) => {
        const a = int(2, 6), b = a + 2, h = int(2, 4);
        return question("Pole trapezu", "Oblicz pole trapezu o podstawach a, b i wysokości h.",
            `\\begin{gathered}a=${a},\\quad b=${b},\\quad h=${h}\\\\P=${box}\\end{gathered}`,
            (a + b) * h / 2, {a, b, h});
    });
    family("eo-units", "eo", "lesson_10", "units", ({pick}) => {
        const [from, to, value, factor] = pick([["m","cm",2,100],["cm","m",150,0.01],
            ["kg","g",2,1000],["g","kg",500,0.001],["h","min",0.5,60],["dm^2","cm^2",3,100]]);
        return question("Jednostki", "Uzupełnij wartość w podanej jednostce.",
            `${String(value).replace(".", "{,}")}\\ \\mathrm{${from}}=${box}\\ \\mathrm{${to}}`,
            value * factor, {value, factor});
    });
    family("eo-volume", "eo", "lesson_16", "volume", ({int}) => {
        const a = int(2, 4), b = int(2, 3), c = int(2, 4);
        return question("Objętość prostopadłościanu", "Oblicz objętość bryły o podanych krawędziach.",
            `\\begin{gathered}a=${a},\\quad b=${b},\\quad c=${c}\\\\V=${box}\\end{gathered}`,
            a * b * c, {a, b, c});
    });
    family("eo-counting", "eo", "lesson_18", "combinatorics", ({int}) => {
        const a = int(2, 5), b = int(2, 4);
        return question("Reguła mnożenia", `Do wyboru: ${a} ${a === 5 ? "koszulek" : "koszulki"} i ${b} pary spodni. Ile różnych zestawów można utworzyć?`,
            `N=${box}`, a * b, {a, b});
    });
    family("mp-power-quotient", "mp", "lesson_1", "powers", ({int, pick}) => {
        const base = pick([2, 3, 5]), exponent = int(3, 7), divisor = int(1, exponent - 1);
        return question("Iloraz potęg", "Uzupełnij wykładnik potęgi.",
            `\\frac{${base}^{${exponent}}}{${base}^{${divisor}}}=${base}^{${box}}`,
            exponent - divisor, {exponent, divisor});
    });
    family("mp-log-product", "mp", "lesson_2", "logs", ({int, pick}) => {
        const base = pick([2, 3, 5]), a = int(1, 2), b = int(1, 2);
        return question("Suma logarytmów", "Oblicz wartość wyrażenia.",
            `\\log_{${base}}${base ** a}+\\log_{${base}}${base ** b}=${box}`, a + b, {base, a, b});
    });
    family("mp-log-power", "mp", "lesson_2", "logs", ({int, pick}) => {
        const base = pick([2, 3, 5]), exponent = int(2, 4);
        return question("Logarytm potęgi", "Uzupełnij współczynnik przed logarytmem.",
            `\\log_{${base}}\\left(7^{${exponent}}\\right)=${box}\\log_{${base}}7`, exponent, {base, exponent});
    });
    family("mp-square", "mp", "lesson_3", "identities", ({int}) => {
        const a = int(1, 4);
        return question("Kwadrat sumy", "Uzupełnij współczynnik przy x.",
            `\\begin{gathered}(x+${a})^2=\\\\x^2+${box}x+${a * a}\\end{gathered}`, 2 * a, {a});
    });
    family("mp-difference-squares", "mp", "lesson_3", "identities", ({int}) => {
        const a = int(2, 5);
        return question("Różnica kwadratów", "Uzupełnij brakującą liczbę.",
            `\\begin{gathered}(x-${a})(x+${a})\\\\=x^2-${box}\\end{gathered}`, a * a, {a});
    });
    family("mp-percent-change", "mp", "lesson_6", "percents", ({pick}) => {
        const price = pick([40, 80, 100]), percent = pick([10, 25, 50]);
        return question("Zmiana procentowa", `Cenę ${price} zł obniżono o ${percent}%. Podaj nową cenę.`,
            `c=${box}\\ \\text{zł}`, price * (100 - percent) / 100, {price, percent});
    });
    family("mp-function-value", "mp", "lesson_7", "functions", ({int, pick}) => {
        const a = pick([-2, -1, 1, 2]), b = int(-3, 3), x = int(-2, 3);
        return question("Wartość funkcji", "Oblicz wartość funkcji dla podanego argumentu.",
            `\\begin{gathered}f(x)=${term(a, "x")}${tail(b)}\\\\f(${x})=${box}\\end{gathered}`,
            a * x + b, {a, b, x});
    });
    family("mp-slope", "mp", "lesson_8", "linear", ({int, pick}) => {
        const slope = pick([-2, -1, 1, 2]), x = int(-2, 2), y = int(-3, 3), dx = pick([1, 2]);
        return question("Współczynnik kierunkowy", "Oblicz współczynnik kierunkowy prostej przechodzącej przez A i B.",
            `\\begin{gathered}A=(${x},${y})\\\\B=(${x + dx},${y + slope * dx})\\\\a=${box}\\end{gathered}`,
            slope, {slope, x, y, dx});
    });
    family("mp-zero", "mp", "lesson_8", "linear", ({int, pick}) => {
        const a = pick([-2, -1, 1, 2]), zero = int(-4, 4), b = -a * zero;
        return question("Miejsce zerowe", "Podaj miejsce zerowe funkcji.",
            `\\begin{gathered}f(x)=${term(a, "x")}${tail(b)}\\\\x_0=${box}\\end{gathered}`, zero, {a, b});
    });
    family("mp-delta", "mp", "formula_quadratic", "quadratic", ({int, pick}) => {
        const a = pick([1, 2]), b = int(-5, 5), c = int(-3, 3);
        return question("Wyróżnik trójmianu", "Oblicz wyróżnik trójmianu kwadratowego.",
            `\\begin{gathered}a=${a},\\quad b=${b}\\\\c=${c},\\quad\\Delta=${box}\\end{gathered}`,
            b * b - 4 * a * c, {a, b, c});
    });
    family("mp-viete", "mp", "formula_quadratic", "quadratic", ({int, pick}) => {
        const a = pick([1, 2]), x1 = int(-4, 4), x2 = pick([-3,-2,-1,0,1,2,3].filter(value => value !== x1));
        // Choosing roots first guarantees real roots and keeps the arithmetic short.
        const b = -a * (x1 + x2), c = a * x1 * x2;
        return question("Wzory Viete'a", "Podaj sumę miejsc zerowych funkcji.",
            `\\begin{gathered}f(x)=${term(a, "x^2")}${tail(b, "x")}${tail(c)}\\\\x_1+x_2=${box}\\end{gathered}`,
            x1 + x2, {a, b, c});
    });
    family("mp-arithmetic", "mp", "formula_sequences", "sequences", ({int, pick}) => {
        const a1 = int(1, 5), difference = pick([-2, -1, 1, 2]), n = int(2, 5);
        return question("Ciąg arytmetyczny", "Oblicz wskazany wyraz ciągu arytmetycznego.",
            `\\begin{gathered}a_1=${a1},\\quad r=${difference}\\\\a_{${n}}=${box}\\end{gathered}`,
            a1 + (n - 1) * difference, {a1, difference, n});
    });
    family("mp-geometric", "mp", "formula_sequences", "sequences", ({int}) => {
        const a1 = int(1, 3), ratio = int(2, 3), n = int(2, 3);
        return question("Ciąg geometryczny", "Oblicz wskazany wyraz ciągu geometrycznego.",
            `\\begin{gathered}a_1=${a1},\\quad q=${ratio}\\\\a_{${n}}=${box}\\end{gathered}`,
            a1 * ratio ** (n - 1), {a1, ratio, n});
    });
    family("mp-sum", "mp", "formula_sequences", "sequences", ({int, pick}) => {
        const n = pick([4, 6]), first = int(1, 5), last = first + (n - 1) * int(1, 2);
        return question("Suma ciągu arytmetycznego", "Oblicz sumę pierwszych n wyrazów ciągu arytmetycznego.",
            `\\begin{gathered}n=${n},\\quad a_1=${first}\\\\a_n=${last},\\quad S_n=${box}\\end{gathered}`,
            n * (first + last) / 2, {n, first, last});
    });
    family("mp-circle", "mp", "formula_geometry", "geometry", ({int}) => {
        const radius = int(1, 5);
        return question("Pole koła", "Uzupełnij współczynnik przed liczbą pi.",
            `r=${radius}\\qquad P=${box}\\pi`, radius * radius, {radius});
    });
    family("mp-distance", "mp", "formula_geometry", "geometry", ({int, pick}) => {
        const x = int(-2, 2), y = int(-2, 2), [dx, dy, distance] = pick([[3,4,5],[4,3,5],[6,8,10]]);
        return question("Odległość punktów", "Oblicz odległość punktów A i B.",
            `\\begin{gathered}A=(${x},${y})\\\\B=(${x + dx},${y + dy})\\\\|AB|=${box}\\end{gathered}`,
            distance, {dx, dy});
    });
    family("mp-probability", "mp", "formula_probability", "probability", ({int, pick}) => {
        const total = pick([4, 6, 8]), favorable = int(1, total - 1);
        return question("Prawdopodobieństwo klasyczne", "Wyniki są jednakowo prawdopodobne. Oblicz P(A).",
            `\\begin{gathered}|\\Omega|=${total},\\quad |A|=${favorable}\\\\P(A)=${box}\\end{gathered}`,
            favorable / total, {total, favorable});
    });
    for(const level of ["mp", "mr"]){
        const lesson = level === "mp" ? "formula_trig" : "lesson_21";
        family(level + "-trig-value", level, lesson, "trig", ({pick}) => {
            const [expression, answer, missingRadicand = false] = pick([
                ["\\sin 30^\\circ",0.5],["\\cos 60^\\circ",0.5],["\\operatorname{tg}45^\\circ",1],
                ["\\sin 90^\\circ",1],["\\cos 0^\\circ",1],
                ["\\sin 45^\\circ",2,true],["\\cos 45^\\circ",2,true],
                ["\\sin 60^\\circ",3,true],["\\cos 30^\\circ",3,true]]);
            return question("Wartości funkcji trygonometrycznych",
                missingRadicand ? "Uzupełnij liczbę pod pierwiastkiem." : "Oblicz wartość.",
                expression + "=" + (missingRadicand ? `\\frac{\\sqrt{${box}}}{2}` : box),
                answer, {expression, missingRadicand});
        });
        family(level + "-trig-identity", level, lesson, "trig", () =>
            question("Jedynka trygonometryczna", "Uzupełnij wartość wyrażenia.",
                "\\sin^2\\alpha+\\cos^2\\alpha=" + box, 1));
    }
    family("mr-absolute", "mr", "lesson_1", "absolute", ({int}) => {
        const center = int(-3, 3), radius = int(1, 4);
        return question("Wartość bezwzględna", "Podaj większe rozwiązanie równania.",
            `\\begin{gathered}|x${tail(-center)}|=${radius}\\\\x=${box}\\end{gathered}`, center + radius, {center, radius});
    });
    family("mr-interval", "mr", "lesson_1", "absolute", ({int}) => {
        const center = int(-3, 3), radius = int(1, 5);
        return question("Wartość bezwzględna", "Podaj długość przedziału rozwiązań nierówności.",
            `\\begin{gathered}|x${tail(-center)}|<${radius}\\\\d=${box}\\end{gathered}`, 2 * radius, {center, radius});
    });
    family("mr-composition", "mr", "lesson_6", "functions", ({int, pick}) => {
        const a = pick([-2, -1, 1, 2]), b = int(-2, 2), c = pick([-1, 1]), d = int(-2, 2), x = int(-2, 2);
        return question("Złożenie funkcji", "Oblicz wskazaną wartość złożenia funkcji.",
            `\\begin{gathered}f(x)=${term(a,"x")}${tail(b)}\\\\g(x)=${term(c,"x")}${tail(d)}\\\\f(g(${x}))=${box}\\end{gathered}`,
            a * (c * x + d) + b, {a, b, c, d, x});
    });
    family("mr-limit", "mr", "lesson_16", "limits", ({pick}) => {
        const a = pick([-3, -2, -1, 1, 2, 3]);
        return question("Granice", "Oblicz granicę.",
            `\\lim_{x\\to ${a}}\\frac{x^2-${a * a}}{x ${signed(-a)}}=${box}`, 2 * a, {a});
    });
    family("mr-limit-infinity", "mr", "lesson_16", "limits", ({int}) => {
        const a = int(1, 3), c = int(1, 3);
        return question("Granica w nieskończoności", "Oblicz granicę.",
            `\\lim_{x\\to\\infty}\\frac{${term(a,"x^2")}+1}{${term(c,"x^2")}+2}=${box}`, a / c, {a, c});
    });
    family("mr-derivative", "mr", "lesson_18", "derivatives", ({int, pick}) => {
        const a = pick([-3, -2, -1, 1, 2, 3]), n = int(2, 4);
        return question("Pochodna potęgi", "Uzupełnij współczynnik we wzorze pochodnej.",
            `\\begin{gathered}f(x)=${term(a, "x^{" + n + "}")}\\\\f'(x)=${box}${n === 2 ? "x" : "x^{" + (n - 1) + "}"}\\end{gathered}`,
            a * n, {a, n});
    });
    family("mr-tangent", "mr", "lesson_18", "derivatives", ({int, pick}) => {
        const a = pick([1, 2]), b = int(-2, 2), x = int(-2, 2);
        return question("Nachylenie stycznej", "Oblicz współczynnik kierunkowy stycznej dla podanego argumentu.",
            `\\begin{gathered}f(x)=${term(a,"x^2")}${tail(b,"x")}\\\\x_0=${x},\\quad a_{\\mathrm{st}}=${box}\\end{gathered}`,
            2 * a * x + b, {a, b, x});
    });
    const api = Object.freeze({version:"formulas-v1", generators:Object.freeze(generators)});
    if(typeof module === "object" && module.exports) module.exports = api;
    else root.DSSpeedTasks = api;
})(typeof window === "object" ? window : globalThis);
