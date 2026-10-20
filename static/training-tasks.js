(function(root){
    const generators = [];
    const box = "\\boxed{\\;?\\;}";
    const signed = n => n < 0 ? "- " + Math.abs(n) : "+ " + n;
    const term = (n, variable) => (n === 1 ? "" : n === -1 ? "-" : n) + variable;
    const tail = (n, variable = "") => n === 0 ? "" :
        (n < 0 ? " - " : " + ") + (variable ? term(Math.abs(n), variable) : Math.abs(n));
    const question = (label, instruction, tex, answer, parameters = {}) =>
        ({label, instruction, tex, answer, parameters, calculator: false});

    function family(id, level, lesson, topic, build, variants = ["default"]){
        generators.push({
            id, level, lesson, topic, variants: Object.freeze(variants),
            make(random = Math.random, requestedVariant){
                const int = (min, max) => min + Math.floor(random() * (max - min + 1));
                const pick = items => items[int(0, items.length - 1)];
                const variant = variants.includes(requestedVariant) ? requestedVariant : pick(variants);
                return {...build({int, pick, variant}), familyId: id, variantId: `${id}:${variant}`};
            }
        });
    }

    for(const level of ["eo", "mp"]){
        family(level + "-powers", level, level === "eo" ? "lesson_3" : "lesson_1", "powers", ({int, pick, variant}) => {
            const base = pick(["2", "3", "4", "5", "6", "7", "8", "9", "10",
                "\\left(-2\\right)", "\\left(-3\\right)", "\\left(\\frac{1}{2}\\right)",
                "\\left(\\frac{2}{3}\\right)", "\\left(0{,}5\\right)"]);
            const a = int(1, 5), b = int(1, 4), p = {base, a, b, variant};
            if(variant === "quotient") {
                const exponent = a + b;
                return question("Potęgi", "Uzupełnij wykładnik potęgi.",
                    `\\frac{${base}^{${exponent}}}{${base}^{${b}}}=${base}^{${box}}`, a, p);
            }
            if(variant === "power") return question("Potęgi", "Uzupełnij wykładnik potęgi.",
                `\\left(${base}^{${a}}\\right)^{${b}}=${base}^{${box}}`, a * b, p);
            if(variant === "common-quotient") return question("Potęgi", "Uzupełnij dodatnią podstawę potęgi.",
                `\\frac{${(a + 1) * (b + 1)}^{${b + 1}}}{${b + 1}^{${b + 1}}}=${box}^{${b + 1}}`, a + 1, p);
            if(variant === "common-exponent") return question("Potęgi", "Uzupełnij dodatnią podstawę potęgi.",
                `${a + 1}^{${b + 1}}\\cdot ${b + 1}^{${b + 1}}=${box}^{${b + 1}}`, (a + 1) * (b + 1), p);
            if(variant === "zero") return question("Potęgi", "Oblicz wartość potęgi.", `${base}^{0}=${box}`, 1, p);
            if(variant === "negative-base" || variant === "minus-outside") {
                const magnitude = int(2, 3), exponent = int(2, 4);
                return question("Potęgi", "Oblicz wartość wyrażenia.",
                    `${variant === "negative-base" ? `(-${magnitude})` : `-${magnitude}`}^{${exponent}}=${box}`,
                    variant === "negative-base" ? (-magnitude) ** exponent : -(magnitude ** exponent),
                    {...p, magnitude, exponent});
            }
            return question("Potęgi", "Uzupełnij wykładnik potęgi.",
                `${base}^{${a}}\\cdot ${base}^{${b}}=${base}^{${box}}`, a + b, p);
        }, ["product", "quotient", "power", "common-exponent", "common-quotient", "zero", "negative-base", "minus-outside"]);
        family(level + "-root", level, level === "eo" ? "lesson_4" : "lesson_1", "roots", ({int, pick, variant}) => {
            const coefficient = int(2, 6), radicand = pick([2, 3, 5, 6, 7, 10]), p = {coefficient, radicand, variant};
            if(variant === "product") return question("Pierwiastki", "Oblicz wartość iloczynu.",
                `\\sqrt{${radicand}}\\cdot\\sqrt{${coefficient ** 2 * radicand}}=${box}`, coefficient * radicand, p);
            if(variant === "quotient") return question("Pierwiastki", "Oblicz wartość ilorazu.",
                `\\frac{\\sqrt{${coefficient ** 2 * radicand}}}{\\sqrt{${radicand}}}=${box}`, coefficient, p);
            if(variant === "sum" || variant === "difference") {
                const other = int(1, 5), subtract = variant === "difference";
                return question("Pierwiastki", "Uzupełnij współczynnik przed pierwiastkiem.",
                    `${coefficient}\\sqrt{${radicand}}${subtract ? "-" : "+"}${other}\\sqrt{${radicand}}=${box}\\sqrt{${radicand}}`,
                    subtract ? coefficient - other : coefficient + other, {...p, other});
            }
            if(variant === "cube") {
                const value = int(-4, 4);
                return question("Pierwiastki", "Oblicz wartość pierwiastka.", `\\sqrt[3]{${value ** 3}}=${box}`, value, {...p, value});
            }
            return question("Pierwiastki", "Uzupełnij współczynnik przed pierwiastkiem.",
                `\\sqrt{${coefficient ** 2 * radicand}}=${box}\\sqrt{${radicand}}`,
                coefficient, p);
        }, ["extract", "product", "quotient", "sum", "difference", "cube"]);
    }
    family("eo-percent", "eo", "lesson_1", "percents", ({pick, variant}) => {
        const percent = pick([5, 10, 15, 20, 25, 30, 40, 50, 60, 75]), number = pick([20, 40, 60, 80, 100, 120]);
        const part = number * percent / 100, p = {percent, number, variant};
        if(variant === "whole") return question("Procenty", `${percent}% pewnej liczby wynosi ${part}. Podaj tę liczbę.`,
            `x=${box}`, number, p);
        if(variant === "percent") return question("Procenty", `Jakim procentem liczby ${number} jest ${part}?`,
            `p=${box}\\%`, percent, p);
        return question("Procenty", "Oblicz podany procent liczby.",
            `${percent}\\%\\cdot ${number}=${box}`, part, p);
    }, ["part", "whole", "percent"]);
    family("eo-fraction", "eo", "lesson_2", "fractions", ({int, pick, variant}) => {
        const denominator = pick([2, 3, 4, 5, 6]), a = int(1, denominator), c = int(1, denominator);
        const p = {a, b: denominator, c, d: denominator, denominator, variant};
        if(variant === "multiply") return question("Ułamki", "Uzupełnij licznik wyniku.",
            `\\frac{${a}}{${denominator}}\\cdot ${c}=\\frac{${box}}{${denominator}}`, a * c, p);
        if(variant === "divide") return question("Ułamki", "Oblicz wartość ilorazu.",
            `\\frac{${a}}{${denominator}}:\\frac{${c}}{${denominator}}=${box}`, a / c, p);
        const subtract = variant === "subtract", other = pick([1, 2, 3]), b = denominator * other;
        // Keep a small common denominator, including fractions with different denominators.
        p.b = denominator; p.c = c * other; p.d = b;
        return question("Ułamki", "Uzupełnij licznik wyniku.",
            `\\frac{${a}}{${denominator}}${subtract ? "-" : "+"}\\frac{${p.c}}{${b}}=\\frac{${box}}{${denominator}}`,
            subtract ? a - c : a + c, p);
    }, ["add", "subtract", "multiply", "divide"]);
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
    family("eo-expression", "eo", "lesson_5", "algebra", ({int, pick, variant}) => {
        const a = pick([-3, -2, -1, 1, 2, 3]), x = int(-3, 3), b = int(-5, 5), p = {a, x, b, variant};
        if(variant === "square") return question("Wyrażenia algebraiczne", "Oblicz wartość wyrażenia dla podanego x.",
            `\\begin{gathered}x=${x}\\\\x^2${tail(b)}=${box}\\end{gathered}`, x * x + b, p);
        if(variant === "brackets") return question("Wyrażenia algebraiczne", "Oblicz wartość wyrażenia dla podanego x.",
            `\\begin{gathered}x=${x}\\\\${a}(x${tail(b)})=${box}\\end{gathered}`, a * (x + b), p);
        return question("Wyrażenia algebraiczne", "Oblicz wartość wyrażenia dla podanego x.",
            `\\begin{gathered}x=${x}\\\\${term(a, "x")}${tail(b)}=${box}\\end{gathered}`, a * x + b, p);
    }, ["linear", "square", "brackets"]);
    family("eo-equation", "eo", "lesson_6", "equations", ({int, pick, variant}) => {
        const a = pick([-4, -3, -2, 2, 3, 4]), x = int(-5, 5), b = int(-5, 5), p = {a, x, b};
        if(variant === "brackets") return question("Równania", "Podaj rozwiązanie równania.",
            `\\begin{gathered}${a}(x${tail(b)})=${a * (x + b)}\\\\x=${box}\\end{gathered}`, x, p);
        if(variant === "fraction") return question("Równania", "Podaj rozwiązanie równania.",
            `\\begin{gathered}\\frac{x${tail(b)}}{${Math.abs(a)}}=${(x + b) / Math.abs(a) === 0 ? "0" : `\\frac{${x + b}}{${Math.abs(a)}}`}\\\\x=${box}\\end{gathered}`, x, p);
        return question("Równania", "Podaj rozwiązanie równania.",
            `\\begin{gathered}${term(a, "x")}${tail(b)}=${a * x + b}\\\\x=${box}\\end{gathered}`, x, p);
    }, ["linear", "brackets", "fraction"]);
    family("eo-clock", "eo", "lesson_7", "clock", ({int, pick}) => {
        const hour = int(7, 18), start = pick([0, 15, 30, 45]), elapsed = pick([15, 30, 45, 60]);
        const end = hour * 60 + start + elapsed;
        const clock = (h, m) => h + ":" + String(m).padStart(2, "0");
        return question("Czas", `Ile minut mija od ${clock(hour, start)} do ${clock(Math.floor(end / 60), end % 60)}?`,
            `t=${box}\\ \\mathrm{min}`, elapsed, {hour, start, elapsed});
    });
    family("eo-motion", "eo", "lesson_8", "motion", ({pick, variant}) => {
        const speed = pick([10, 15, 20, 25, 30]), hours = pick([0.5, 1, 1.5, 2, 3, 4]);
        const hourTex = String(hours).replace(".", "{,}");
        return question("Droga, prędkość i czas", variant === "time" ? "Oblicz czas w godzinach." : variant === "speed" ? "Oblicz prędkość w km/h." : "Oblicz drogę w kilometrach.",
            variant === "time"
                ? `\\begin{gathered}s=${speed * hours}\\ \\mathrm{km}\\\\v=${speed}\\ \\mathrm{km/h}\\\\t=${box}\\ \\mathrm{h}\\end{gathered}`
                : variant === "speed"
                ? `\\begin{gathered}s=${speed * hours}\\ \\mathrm{km}\\\\t=${hourTex}\\ \\mathrm{h}\\\\v=${box}\\ \\mathrm{km/h}\\end{gathered}`
                : `\\begin{gathered}v=${speed}\\ \\mathrm{km/h}\\\\t=${hourTex}\\ \\mathrm{h}\\\\s=${box}\\ \\mathrm{km}\\end{gathered}`,
            variant === "time" ? hours : variant === "speed" ? speed : speed * hours, {speed, hours, variant});
    }, ["distance", "time", "speed"]);
    family("eo-triangle", "eo", "lesson_9", "areas", ({int, pick, variant}) => {
        const base = pick([2, 4, 6, 8, 10]), height = int(2, 8), p = {base, height, variant};
        if(variant === "height") return question("Pole trójkąta", "Oblicz wysokość trójkąta opuszczoną na podaną podstawę.",
            `\\begin{gathered}a=${base},\\quad P=${base * height / 2}\\\\h=${box}\\end{gathered}`, height, p);
        if(variant === "base") return question("Pole trójkąta", "Oblicz podstawę trójkąta odpowiadającą podanej wysokości.",
            `\\begin{gathered}h=${height},\\quad P=${base * height / 2}\\\\a=${box}\\end{gathered}`, base, p);
        return question("Pole trójkąta", "Oblicz pole trójkąta.",
            `\\begin{gathered}a=${base},\\quad h=${height}\\\\P=${box}\\end{gathered}`,
            base * height / 2, p);
    }, ["area", "height", "base"]);
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
    family("mp-power-quotient", "mp", "lesson_1", "powers", ({int, pick, variant}) => {
        const base = pick([2, 3, 4, 5, 6, 7, 8, 9, 10]), exponent = int(-4, 5), divisor = int(-4, 5);
        const p = {base, exponent, divisor, variant};
        if(variant === "reciprocal") {
            const n = int(1, 3), value = pick([2, 3, 4]);
            return question("Potęgi", "Oblicz wartość potęgi.", `${value}^{-${n}}=${box}`, 1 / value ** n, {...p, n, value});
        }
        if(variant === "fractional") {
            const root = int(2, 5), degree = pick([2, 3]);
            return question("Potęgi", "Oblicz wartość potęgi.",
                `${root ** degree}^{\\frac{1}{${degree}}}=${box}`, root, {...p, root, degree});
        }
        if(variant === "mixed-bases") {
            const factor = pick([2, 3]), n = int(2, 4);
            return question("Potęgi", "Uzupełnij wykładnik potęgi.",
                `\\frac{${base ** factor}^{${n}}}{${base}^{${n}}}=${base}^{${box}}`, (factor - 1) * n, {...p, factor, n});
        }
        if(variant === "negative-product") return question("Potęgi", "Uzupełnij wykładnik potęgi.",
            `${base}^{${exponent}}\\cdot ${base}^{${divisor}}=${base}^{${box}}`, exponent + divisor, p);
        return question("Iloraz potęg", "Uzupełnij wykładnik potęgi.",
            `\\frac{${base}^{${exponent}}}{${base}^{${divisor}}}=${base}^{${box}}`,
            exponent - divisor, p);
    }, ["quotient", "negative-product", "reciprocal", "fractional", "mixed-bases"]);
    family("mp-log-product", "mp", "lesson_2", "logs", ({int, pick, variant}) => {
        const base = pick([2, 3, 4, 5, 10]), a = int(0, 2), b = int(0, 2), p = {base, a, b, variant};
        if(variant === "difference") return question("Logarytmy", "Oblicz wartość wyrażenia.",
            `\\log_{${base}}${base ** a}-\\log_{${base}}${base ** b}=${box}`, a - b, p);
        if(variant === "reciprocal") return question("Logarytmy", "Oblicz wartość logarytmu.",
            `\\log_{${base}}\\frac{1}{${base ** (a + 1)}}=${box}`, -a - 1, p);
        if(variant === "fraction-base") return question("Logarytmy", "Oblicz wartość logarytmu.",
            `\\log_{\\frac{1}{${base}}}${base ** (a + 1)}=${box}`, -a - 1, p);
        return question("Suma logarytmów", "Oblicz wartość wyrażenia.",
            `\\log_{${base}}${base ** a}+\\log_{${base}}${base ** b}=${box}`, a + b, p);
    }, ["sum", "difference", "reciprocal", "fraction-base"]);
    family("mp-log-power", "mp", "lesson_2", "logs", ({int, pick}) => {
        const base = pick([2, 3, 4, 5, 10]), exponent = pick([-3, -2, -1, 2, 3, 4]);
        const argument = pick([2, 3, 5, 6, 7, 8, 9, 10].filter(value => value !== base));
        return question("Logarytm potęgi", "Uzupełnij współczynnik przed logarytmem.",
            `\\log_{${base}}\\left(${argument}^{${exponent}}\\right)=${box}\\log_{${base}}${argument}`, exponent, {base, exponent, argument});
    });
    family("mp-square", "mp", "lesson_3", "identities", ({int, pick, variant}) => {
        const a = int(1, 5) * (variant === "difference" ? -1 : 1), k = pick([1, 2, 3]);
        const p = {a, k, variant};
        if(variant === "constant") return question("Wzory skróconego mnożenia", "Uzupełnij wyraz wolny.",
            `\\begin{gathered}(${term(k, "x")}${tail(a)})^2=\\\\${term(k * k, "x^2")}${tail(2 * k * a, "x")}+${box}\\end{gathered}`, a * a, p);
        return question("Kwadrat sumy", "Uzupełnij współczynnik przy x.",
            `\\begin{gathered}(${term(k, "x")}${tail(a)})^2=\\\\${term(k * k, "x^2")}+(${box})x+${a * a}\\end{gathered}`, 2 * k * a, p);
    }, ["sum", "difference", "constant"]);
    family("mp-difference-squares", "mp", "lesson_3", "identities", ({int}) => {
        const a = int(2, 5);
        return question("Różnica kwadratów", "Uzupełnij brakującą liczbę.",
            `\\begin{gathered}(x-${a})(x+${a})\\\\=x^2-${box}\\end{gathered}`, a * a, {a});
    });
    family("mp-percent-change", "mp", "lesson_6", "percents", ({pick, variant}) => {
        const price = pick([20, 40, 60, 80]), percent = pick([5, 10, 15, 20, 25, 50]);
        const increase = variant === "increase", changed = price * (100 + (increase ? percent : -percent)) / 100;
        return question("Zmiana procentowa", variant === "original"
            ? `Po obniżce o ${percent}% cena wynosi ${changed} zł. Podaj cenę przed obniżką.`
            : `Cenę ${price} zł ${increase ? "podwyższono" : "obniżono"} o ${percent}%. Podaj nową cenę.`,
            `c=${box}\\ \\text{zł}`, variant === "original" ? price : changed, {price, percent, variant});
    }, ["decrease", "increase", "original"]);
    family("mp-function-value", "mp", "lesson_7", "functions", ({int, pick, variant}) => {
        const a = pick([-2, -1, 1, 2]), b = int(-3, 3), x = int(-2, 3), p = {a, b, x, variant};
        const [formula, answer] = variant === "absolute" ? [`|x${tail(b)}|`, Math.abs(x + b)]
            : variant === "square" ? [`x^2${tail(b)}`, x * x + b]
            : variant === "rational" ? [`\\frac{${a * (Math.abs(x) + 1)}}{x}`, a]
            : variant === "exponential" ? [`2^x${tail(b)}`, 2 ** x + b]
            : [`${term(a, "x")}${tail(b)}`, a * x + b];
        if(variant === "rational") p.x = Math.abs(x) + 1;
        return question("Wartość funkcji", "Oblicz wartość funkcji dla podanego argumentu.",
            `\\begin{gathered}f(x)=${formula}\\\\f(${p.x})=${box}\\end{gathered}`, answer, p);
    }, ["linear", "absolute", "square", "rational", "exponential"]);
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
    family("mp-viete", "mp", "formula_quadratic", "quadratic", ({int, pick, variant}) => {
        const a = pick([1, 2]), x1 = int(-4, 4), x2 = pick([-3,-2,-1,0,1,2,3].filter(value => value !== x1));
        // Choosing roots first guarantees real roots and keeps the arithmetic short.
        const b = -a * (x1 + x2), c = a * x1 * x2;
        return question("Wzory Viete'a", variant === "product" ? "Podaj iloczyn miejsc zerowych funkcji." : "Podaj sumę miejsc zerowych funkcji.",
            `\\begin{gathered}f(x)=${term(a, "x^2")}${tail(b, "x")}${tail(c)}\\\\x_1${variant === "product" ? "\\cdot " : "+"}x_2=${box}\\end{gathered}`,
            variant === "product" ? x1 * x2 : x1 + x2, {a, b, c, variant});
    }, ["sum", "product"]);
    family("mp-arithmetic", "mp", "formula_sequences", "sequences", ({int, pick}) => {
        const a1 = int(1, 5), difference = pick([-2, -1, 1, 2]), n = int(2, 5);
        return question("Ciąg arytmetyczny", "Oblicz wskazany wyraz ciągu arytmetycznego.",
            `\\begin{gathered}a_1=${a1},\\quad r=${difference}\\\\a_{${n}}=${box}\\end{gathered}`,
            a1 + (n - 1) * difference, {a1, difference, n});
    });
    family("mp-geometric", "mp", "formula_sequences", "sequences", ({int, pick}) => {
        const ratio = pick([-3, -2, -1, 0.5, 1, 2, 3]), n = int(2, 4), a1 = int(1, 4);
        return question("Ciąg geometryczny", "Oblicz wskazany wyraz ciągu geometrycznego.",
            `\\begin{gathered}a_1=${a1},\\quad q=${ratio === 0.5 ? "\\frac{1}{2}" : ratio}\\\\a_{${n}}=${box}\\end{gathered}`,
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
        family(level + "-trig-identity", level, lesson, "trig", ({pick, variant}) => {
            const angle = pick(["\\alpha", "\\beta", "\\gamma", "x", "3x"]);
            if(variant === "complement") return question("Trygonometria", "Oblicz wartość wyrażenia.",
                `1-\\sin^2(${angle})-\\cos^2(${angle})=${box}`, 0, {variant});
            if(variant === "scaled") {
                const factor = pick([2, 3, 4, 5]);
                return question("Trygonometria", "Oblicz wartość wyrażenia.",
                    `${factor}\\sin^2(${angle})+${factor}\\cos^2(${angle})=${box}`, factor, {variant, factor});
            }
            if(variant === "missing-square") {
                const [known, missing] = pick([["\\frac{1}{4}", 0.75], ["\\frac{3}{4}", 0.25], ["\\frac{1}{2}", 0.5]]);
                return question("Trygonometria", "Oblicz kwadrat cosinusa.",
                    `\\begin{gathered}\\sin^2(${angle})=${known}\\\\\\cos^2(${angle})=${box}\\end{gathered}`,
                    missing, {variant, known: 1 - missing});
            }
            return question("Jedynka trygonometryczna", "Uzupełnij wartość wyrażenia.",
                `\\sin^2(${angle})+\\cos^2(${angle})=${box}`, 1, {variant});
        }, ["sum", "complement", "scaled", "missing-square"]);
    }
    family("mr-absolute", "mr", "lesson_1", "absolute", ({int, variant}) => {
        const center = int(-3, 3), radius = int(1, 4);
        return question("Wartość bezwzględna", `Podaj ${variant === "smaller" ? "mniejsze" : "większe"} rozwiązanie równania.`,
            `\\begin{gathered}|x${tail(-center)}|=${radius}\\\\x=${box}\\end{gathered}`,
            variant === "smaller" ? center - radius : center + radius, {center, radius, variant});
    }, ["larger", "smaller"]);
    family("mr-interval", "mr", "lesson_1", "absolute", ({int, variant}) => {
        const center = int(-3, 3), radius = int(1, 5);
        return question("Wartość bezwzględna", variant === "length" ? "Podaj długość przedziału rozwiązań nierówności."
            : `Podaj ${variant === "left" ? "lewy" : "prawy"} koniec przedziału rozwiązań nierówności.`,
            `\\begin{gathered}|x${tail(-center)}|<${radius}\\\\${variant === "length" ? "d" : "x"}=${box}\\end{gathered}`,
            variant === "length" ? 2 * radius : center + (variant === "left" ? -radius : radius), {center, radius, variant});
    }, ["length", "left", "right"]);
    family("mr-composition", "mr", "lesson_6", "functions", ({int, pick, variant}) => {
        const a = pick([-2, -1, 1, 2]), b = int(-2, 2), c = pick([-1, 1]), d = int(-2, 2), x = int(-2, 2);
        return question("Złożenie funkcji", "Oblicz wskazaną wartość złożenia funkcji.",
            `\\begin{gathered}f(x)=${term(a,"x")}${tail(b)}\\\\g(x)=${term(c,"x")}${tail(d)}\\\\${variant === "fg" ? `f(g(${x}))` : `g(f(${x}))`}=${box}\\end{gathered}`,
            variant === "fg" ? a * (c * x + d) + b : c * (a * x + b) + d, {a, b, c, d, x, variant});
    }, ["fg", "gf"]);
    family("mr-limit", "mr", "lesson_16", "limits", ({pick, variant}) => {
        const a = pick([-3, -2, -1, 1, 2, 3]);
        if(variant === "reciprocal") return question("Granice", "Oblicz granicę.",
            `\\lim_{x\\to ${a}}\\frac{x ${signed(-a)}}{x^2-${a * a}}=${box}`, 1 / (2 * a), {a, variant});
        if(variant === "cube") return question("Granice", "Oblicz granicę.",
            `\\lim_{x\\to ${a}}\\frac{x^3${tail(-(a ** 3))}}{x ${signed(-a)}}=${box}`, 3 * a * a, {a, variant});
        return question("Granice", "Oblicz granicę.",
            `\\lim_{x\\to ${a}}\\frac{x^2-${a * a}}{x ${signed(-a)}}=${box}`, 2 * a, {a, variant});
    }, ["square", "reciprocal", "cube"]);
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
