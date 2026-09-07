(function () {
    "use strict";
    const controls = new WeakMap();
    const templates = [
        { symbol: "√", title: "Pierwiastek kwadratowy", before: "√(", after: ")" },
        { symbol: "∛", title: "Pierwiastek sześcienny", before: "∛(", after: ")" },
        { symbol: "a/b", title: "Ułamek zwykły", before: "(", after: ")/()", fraction: true },
        { symbol: "x²", title: "Potęga", before: "(", after: ")^()" }
    ];

    function update(input, report = false) {
        const parts = controls.get(input);
        if (!parts) return true;
        parts.preview.replaceChildren();
        let valid = false;
        try {
            parts.preview.innerHTML = DeltaSigmaMath.preview(input.value);
            valid = true;
        } catch {}
        parts.error.hidden = !report || valid;
        input.setAttribute("aria-invalid", String(report && !valid));
        return valid;
    }

    function attach(input, wrapper) {
        wrapper.classList.add("math-answer-field");
        input.maxLength = 200;
        const toolbar = document.createElement("div");
        toolbar.className = "math-input-tools";
        toolbar.setAttribute("role", "group");
        toolbar.setAttribute("aria-label", "Symbole matematyczne");
        templates.forEach(template => {
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
                input.setRangeText(template.before + selection + template.after, start, end, "end");
                const caret = start + template.before.length + selection.length +
                    (selection && (template.fraction || template.symbol === "x²") ? template.after.length - 1 : 0);
                input.focus();
                input.setSelectionRange(caret, caret);
                input.dispatchEvent(new Event("input", { bubbles: true }));
            };
            toolbar.appendChild(button);
        });
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
        controls.set(input, { preview, error });
        input.addEventListener("input", () => update(input));
        input.addEventListener("blur", () => { if (input.value.trim()) update(input, true); });
        wrapper.append(toolbar, preview, error);
    }

    window.DeltaSigmaMathInput = {
        attach,
        validate: input => update(input, true),
        refresh: input => update(input)
    };
})();
