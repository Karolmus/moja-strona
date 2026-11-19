(function () {
    "use strict";
    const controls = new WeakMap();
    const templates = [
        { id: "sqrt", symbol: "√", title: "Pierwiastek kwadratowy", before: "√(", after: ")" },
        { id: "cbrt", symbol: "∛", title: "Pierwiastek sześcienny", before: "∛(", after: ")" },
        { id: "fraction", symbol: "a/b", title: "Ułamek zwykły", before: "(", after: ")/()", fraction: true },
        { id: "power", symbol: "x²", title: "Potęga", before: "(", after: ")^()" },
        { id: "square", symbol: "x²", title: "Do kwadratu", before: "", after: "²", end: true },
        { id: "paren-left", symbol: "(", title: "Lewy nawias otwarty", before: "(", after: "", literal: true },
        { id: "paren-right", symbol: ")", title: "Prawy nawias otwarty", before: ")", after: "", literal: true },
        { id: "bracket-left", symbol: "[", title: "Lewy nawias domknięty", before: "[", after: "", literal: true },
        { id: "bracket-right", symbol: "]", title: "Prawy nawias domknięty", before: "]", after: "", literal: true },
        { id: "infinity", symbol: "∞", title: "Nieskończoność", before: "∞", after: "", literal: true },
        { id: "union", symbol: "∪", title: "Suma przedziałów", before: " ∪ ", after: "", literal: true }
    ];

    function splitValues(text) {
        const values = [];
        let depth = 0;
        let start = 0;
        for (let index = 0; index < text.length; index++) {
            if (text[index] === "(") depth++;
            if (text[index] === ")") depth--;
            if (text[index] === ";" && depth === 0) {
                values.push(text.slice(start, index));
                start = index + 1;
            }
        }
        values.push(text.slice(start));
        return values;
    }

    function update(input, report = false) {
        const parts = controls.get(input);
        if (!parts) return true;
        parts.preview.replaceChildren();
        let valid = false;
        try {
            const values = parts.multiple ? splitValues(input.value) : [input.value];
            if(values.some(value => !value.trim())) throw new Error("Empty expression");
            parts.preview.innerHTML = values.map(value => DeltaSigmaMath.preview(value.trim().replace(/[:⁄∕]/g, "/"))).join(" ; ");
            valid = true;
        } catch {}
        parts.error.hidden = !report || valid;
        input.setAttribute("aria-invalid", String(report && !valid));
        return valid;
    }

    function attach(input, wrapper, options = {}) {
        wrapper.classList.add("math-answer-field");
        input.maxLength = 200;
        const toolbar = document.createElement("div");
        toolbar.className = "math-input-tools";
        toolbar.setAttribute("role", "group");
        toolbar.setAttribute("aria-label", "Symbole matematyczne");
        const selectedTools = Array.isArray(options.tools) ? options.tools : ["sqrt", "cbrt", "fraction", "power"];
        const selectedTemplates = [...new Set(selectedTools)].map(id => templates.find(item => item.id === id)).filter(Boolean);
        selectedTemplates.forEach(template => {
            const button = document.createElement("button");
            button.type = "button";
            button.title = template.title;
            button.setAttribute("aria-label", template.title);
            button.textContent = template.symbol;
            if (template.fraction) {
                button.innerHTML = '<math aria-hidden="true"><mfrac><mi>a</mi><mi>b</mi></mfrac></math>';
            }
            button.onmousedown = event => event.preventDefault();
            button.onclick = () => {
                if (input.disabled) return;
                const start = input.selectionStart ?? input.value.length;
                const end = input.selectionEnd ?? start;
                const selection = input.value.slice(start, end);
                const insertion = template.id === "square" && selection
                    ? `(${selection})²` : template.literal ? template.before : template.before + selection + template.after;
                input.setRangeText(insertion, start, end, "end");
                const caret = template.end || template.literal ? start + insertion.length : start + template.before.length + selection.length +
                    (selection && (template.fraction || template.id === "power") ? template.after.length - 1 : 0);
                input.focus();
                input.setSelectionRange(caret, caret);
                input.dispatchEvent(new Event("input", { bubbles: true }));
            };
            toolbar.appendChild(button);
        });
        if(selectedTemplates.length) wrapper.appendChild(toolbar);
        if(options.preview === false) return;
        const preview = document.createElement("div");
        preview.className = "math-input-preview";
        preview.setAttribute("aria-hidden", "true");
        const error = document.createElement("p");
        error.className = "math-input-error";
        error.id = `${input.id}-error`;
        error.setAttribute("aria-live", "polite");
        error.textContent = "Sprawdź zapis odpowiedzi: nawiasy, pierwiastki i mianownik ułamka.";
        error.hidden = true;
        input.setAttribute("aria-describedby", error.id);
        controls.set(input, { preview, error, multiple: options.multiple === true });
        input.addEventListener("input", () => update(input));
        input.addEventListener("blur", () => { if (input.value.trim()) update(input, true); });
        wrapper.append(preview, error);
    }

    window.DeltaSigmaMathInput = {
        attach,
        validate: input => update(input, true),
        refresh: input => update(input)
    };
})();
