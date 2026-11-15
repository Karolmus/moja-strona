(function(){
    let generation = 0;
    const levels = {eo: "EO", mp: "MP", mr: "MR"};
    const topics = {all: "Tryb łączny", formula_quadratic: "Funkcja kwadratowa", formula_sequences: "Ciągi",
        formula_geometry: "Geometria", formula_trig: "Trygonometria", formula_probability: "Prawdopodobieństwo",
        powers: "Potęgi", roots: "Pierwiastki", logarithms: "Logarytmy", percentages: "Procenty"};
    const number = value => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;
    const percent = (correct, mistakes) => correct + mistakes ? `${Math.round(correct * 100 / (correct + mistakes))}%` : "-";
    const duration = value => {
        const seconds = Math.round(number(value));
        return seconds >= 3600 ? `${Math.floor(seconds / 3600)} h ${Math.floor(seconds % 3600 / 60)} min`
            : seconds >= 60 ? `${Math.floor(seconds / 60)} min${seconds % 60 ? ` ${seconds % 60} s` : ""}` : `${seconds} s`;
    };
    function element(tag, className, text){
        const node = document.createElement(tag);
        node.className = className;
        if(text !== undefined) node.textContent = text;
        return node;
    }
    function topicLabel(item){
        const raw = String(item.topic || "all").replace(/^formulas-v\d+-/, "");
        const lesson = raw.match(/^lesson_(\d+)$/);
        return `${levels[item.level] || String(item.level || "")} · ${topics[raw] || (lesson ? `Lekcja ${lesson[1]}` : raw)}`;
    }
    function render(body, history, summary, nextCursor, loadPage){
        body.replaceChildren();
        const stats = element("dl", "training-stats");
        for(const [label, value] of [["Rundy", summary.rounds], ["Poprawne odpowiedzi", summary.correct],
            ["Skuteczność", percent(summary.correct, summary.mistakes)], ["Czas rund", duration(summary.seconds)]]){
            const stat = element("div", "");
            stat.append(element("dt", "", label), element("dd", "", String(value)));
            stats.appendChild(stat);
        }
        body.appendChild(stats);
        if(!history.length){
            body.appendChild(element("p", "source-detail-empty", "Brak zapisanych treningów szybkości."));
            return;
        }
        const labels = ["Data", "Zakres", "Runda", "Poprawne / błędne", "Skuteczność", "Śr. odpowiedź", "Najlepsza seria"];
        const table = element("table", "training-history");
        const caption = element("caption", "training-caption", "Wyniki treningów szybkości ucznia");
        const head = element("thead", "");
        const header = element("tr", "");
        for(const label of labels){
            const th = element("th", "", label);
            th.scope = "col";
            header.appendChild(th);
        }
        head.appendChild(header);
        const rows = element("tbody", "");
        for(const item of history){
            const date = new Date(item.created_at);
            const correct = number(item.correct_count), mistakes = number(item.mistake_count);
            const values = [Number.isFinite(date.getTime()) ? date.toLocaleString("pl-PL", {dateStyle:"short",timeStyle:"short"}) : "-",
                topicLabel(item), duration(item.round_seconds), `${correct} / ${mistakes}`, percent(correct, mistakes),
                correct + mistakes ? `${number(item.average_time_seconds).toLocaleString("pl-PL", {maximumFractionDigits:2})} s` : "-",
                String(number(item.best_streak))];
            const row = element("tr", "");
            values.forEach((value, index) => {
                const cell = element("td", "", value);
                cell.dataset.label = labels[index];
                row.appendChild(cell);
            });
            rows.appendChild(row);
        }
        table.append(caption, head, rows);
        body.appendChild(table);
        if(nextCursor !== null){
            const more = element("button", "btn secondary training-more", "Pokaż starsze wyniki");
            more.type = "button";
            more.addEventListener("click", loadPage);
            body.appendChild(more);
        }
    }
    function show(student, host){
        const requestGeneration = ++generation;
        if(!host) return;
        host.replaceChildren();
        const details = element("details", "source-progress-section student-training");
        details.appendChild(element("summary", "", "Trening szybkości"));
        const body = element("div", "training-body");
        const status = element("p", "training-status");
        status.setAttribute("role", "status");
        details.append(body, status);
        host.appendChild(details);
        let loaded = false, loading = false, nextCursor = null, history = [];
        async function loadPage(){
            if(loading || requestGeneration !== generation) return;
            loading = true;
            body.querySelectorAll("button").forEach(button => { button.disabled = true; });
            status.textContent = "Wczytywanie wyników...";
            status.hidden = false;
            details.setAttribute("aria-busy", "true");
            try {
                const suffix = loaded && nextCursor !== null ? `?before=${nextCursor}` : "";
                const data = await window.apiFetch(`/api/admin/students/${student.id}/speed-training${suffix}`);
                if(requestGeneration !== generation) return;
                if(!Array.isArray(data.history) || !data.summary ||
                    ["rounds", "correct", "mistakes", "seconds"].some(key => !Number.isFinite(data.summary[key])) ||
                    !(data.next_cursor === null || Number.isSafeInteger(data.next_cursor) && data.next_cursor > 0)){
                    throw new Error("Nieprawidłowe dane treningów.");
                }
                const seen = new Set(history.map(item => item.id));
                history = [...history, ...data.history.filter(item => !seen.has(item.id))];
                nextCursor = data.next_cursor;
                loaded = true;
                render(body, history, data.summary, nextCursor, loadPage);
                status.hidden = true;
            } catch(error) {
                if(requestGeneration !== generation) return;
                status.replaceChildren(element("span", "", error.message || "Nie udało się wczytać treningów."));
                const retry = element("button", "btn secondary", "Spróbuj ponownie");
                retry.type = "button";
                retry.addEventListener("click", loadPage);
                status.appendChild(retry);
            } finally {
                loading = false;
                details.removeAttribute("aria-busy");
                body.querySelectorAll("button").forEach(button => { button.disabled = false; });
            }
        }
        details.addEventListener("toggle", () => {if(details.open && !loaded) void loadPage();});
    }
    window.DSAdminTraining = {show, clear(){generation++;}};
})();
