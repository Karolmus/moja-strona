(() => {
    "use strict";

    const TOKEN_KEY = "deltaSigmaParentAccessToken";
    const LEVEL_LABELS = {
        egzamin_osmoklasisty: "Egzamin ósmoklasisty",
        matura_podstawowa: "Matura podstawowa",
        matura_rozszerzona: "Matura rozszerzona"
    };
    const COURSE_TARGETS = {
        egzamin_osmoklasisty: 20,
        matura_podstawowa: 25,
        matura_rozszerzona: 20
    };
    const LEVEL_SEGMENTS = {
        egzamin_osmoklasisty: "eo",
        matura_podstawowa: "mp",
        matura_rozszerzona: "mr"
    };
    const RESULT_LABELS = {
        good: "Dobrze",
        medium: "Z pomocą",
        bad: "Źle",
        video: "Nagranie (0 pkt)",
        review: "Do omówienia",
        missing: "Nie wykonano"
    };
    const PARTS = [
        ["praca_domowa", "Praca domowa"],
        ["zadania_powtorkowe", "Zadania powtórkowe"]
    ];
    let parentToken = "";

    function element(tag, className = "", text = "") {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text) node.textContent = text;
        return node;
    }

    function parentTokenFromLink() {
        let token = "";
        try {
            token = decodeURIComponent(window.location.hash.slice(1).trim());
        } catch (_error) {
            return "";
        }
        if (token) {
            window.sessionStorage.setItem(TOKEN_KEY, token);
            window.history.replaceState(null, document.title, window.location.pathname + window.location.search);
            return token;
        }
        return window.sessionStorage.getItem(TOKEN_KEY) || "";
    }

    function showStatus(title, message) {
        const panel = document.getElementById("statusPanel");
        panel.replaceChildren(element("h2", "", title), element("p", "", message));
        panel.hidden = false;
        document.getElementById("dashboard").classList.remove("active");
    }

    function formatDate(value) {
        if (!value || !Number.isFinite(Date.parse(value))) return "brak";
        return new Date(value).toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "short" });
    }

    function taskSource(item) {
        if (item.source_id) return String(item.source_id);
        const taskId = String(item.task_id || "");
        return taskId.slice(0, taskId.lastIndexOf(":"));
    }

    function taskFile(item) {
        if (item.file) return String(item.file);
        const taskId = String(item.task_id || "");
        return taskId.slice(taskId.lastIndexOf(":") + 1);
    }

    function taskKey(item) {
        const source = taskSource(item);
        const file = taskFile(item);
        return source && file ? `${source}:${file}` : "";
    }

    function latestProgressMap(progress) {
        const latest = new Map();
        for (const item of progress) {
            const key = taskKey(item);
            if (key && !latest.has(key)) latest.set(key, item);
        }
        return latest;
    }

    function lessonState(lesson, latest, reviewKeys) {
        const tasks = Array.isArray(lesson.tasks) ? lesson.tasks : [];
        const entries = tasks.map(task => ({
            task,
            sourceId: lesson.source_id,
            progress: latest.get(`${lesson.source_id}:${task.file}`) || null,
            review: reviewKeys.has(`${lesson.source_id}:${task.file}`)
        }));
        const attempted = entries.filter(entry => entry.progress);
        return {
            ...lesson,
            entries,
            attempted: attempted.length,
            complete: entries.length > 0 && attempted.length === entries.length,
            lastActivity: attempted.map(entry => entry.progress.created_at)
                .filter(Boolean).sort().at(-1) || null
        };
    }

    function partStats(entries) {
        const attempted = entries.filter(entry => entry.progress);
        const good = attempted.filter(entry => entry.progress.result === "good").length;
        const medium = attempted.filter(entry => entry.progress.result === "medium").length;
        const bad = attempted.filter(entry => entry.progress.result === "bad").length;
        const video = attempted.filter(entry => entry.progress.result === "video").length;
        const correct = attempted.filter(entry => {
            const { earned, max } = taskScore(entry);
            return max > 0 && earned >= max;
        }).length;
        return {
            total: entries.length,
            attempted: attempted.length,
            good, medium, bad, video,
            review: entries.filter(entry => entry.review).length,
            percent: attempted.length ? Math.round(correct / attempted.length * 100) : null
        };
    }

    function formatPoints(value) {
        const number = Number(value);
        return Number.isFinite(number) ? String(Math.round(number * 10) / 10).replace(".", ",") : "-";
    }

    function taskScore(entry) {
        const savedMax = entry.progress?.max_points;
        const max = Number(savedMax ?? entry.task.maxPoints ?? 1) || 1;
        const saved = entry.progress?.earned_points;
        if (!entry.progress) return { earned: null, max, estimated: false };
        if (saved !== null && saved !== undefined && Number.isFinite(Number(saved))) {
            return { earned: Number(saved), max, estimated: false };
        }
        const result = entry.progress.result;
        const earned = result === "good" || result === "medium" ? max : 0;
        return { earned, max, estimated: true };
    }

    function taskPoints(entry) {
        const score = taskScore(entry);

        if (score.earned === null) return `- / ${formatPoints(score.max)}`;
        return `${score.estimated ? "~" : ""}${formatPoints(score.earned)} / ${formatPoints(score.max)}`;
    }

    function expectedAnswer(task) {
        if (Array.isArray(task.inputs) && task.inputs.length) {
            return task.inputs.map((input, index) =>
                `${input.label || `Odpowiedź ${index + 1}`}: ${input.answers?.[0] ?? input.answer ?? "-"}`
            ).join("; ");
        }
        const answer = task.acceptedAnswers?.[0] ?? task.answer;
        if (answer === null || answer === undefined || answer === "") return "Według zasad oceniania";
        if (Array.isArray(answer)) return answer.join(", ");
        if (typeof answer === "object") return JSON.stringify(answer);
        return String(answer);
    }

    function taskName(task) {
        const title = String(task.title || "").replace(/^Lekcja\s+\d+\s*-\s*/i, "")
            .replace(/^(?:praca domowa|zadanie domowe)\s+/i, "Zadanie ")
            .replace(/^zadanie powtórkowe\s+/i, "Powtórka ");
        if (title) return title;
        const number = String(task.file || "").match(/\d+(?:[._]\d+)*/)?.[0]?.replace(/_/g, ".");
        return number ? `Zadanie ${number}` : "Zadanie";
    }

    function safeTaskImageNames(task) {
        return [...new Set([task.contextFile, task.file]
            .filter(name => typeof name === "string" && /^[A-Za-z0-9_.-]+\.(?:png|webp|jpe?g)$/i.test(name)))];
    }

    async function parentCourseImage(path) {
        const encoded = path.split("/").map(encodeURIComponent).join("/");
        const response = await fetch(`${window.DS_API_BASE_URL}/api/parent/course-assets/${encoded}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ token: parentToken })
        });
        if (!response.ok) throw new Error("Nie udało się pobrać obrazu zadania.");
        return URL.createObjectURL(await response.blob());
    }

    async function showTaskImages(entry, container) {
        const names = safeTaskImageNames(entry.task);
        if (!names.length) {
            container.textContent = "Brak obrazu tego zadania.";
            return;
        }
        container.textContent = "Wczytuję zadanie...";
        let loaded = 0;
        container.replaceChildren();
        for (const name of names) {
            try {
                const source = entry.sourceId;
                const base = source.slice(0, source.lastIndexOf("/") + 1);
                const path = base + name;
                const url = source.startsWith("zadania/kurs/")
                    ? await parentCourseImage(path.slice("zadania/kurs/".length))
                    : path;
                const image = element("img");
                image.alt = name === entry.task.file ? `Treść: ${taskName(entry.task)}` : "Dane do zadania";
                if (url.startsWith("blob:")) {
                    image.addEventListener("load", () => URL.revokeObjectURL(url), { once: true });
                    image.addEventListener("error", () => URL.revokeObjectURL(url), { once: true });
                }
                image.src = url;
                container.appendChild(image);
                loaded++;
            } catch (_error) {
                container.appendChild(element("span", "", "Nie udało się wczytać części zadania."));
            }
        }
        if (!loaded && !container.children.length) container.textContent = "Brak obrazu zadania.";
    }

    function taskDetail(entry) {
        const detail = element("details", "task-item");
        const summary = element("summary");
        const title = element("div", "task-name");
        const status = entry.progress?.result || (entry.review ? "review" : "missing");
        title.appendChild(element("strong", "", taskName(entry.task)));
        if (entry.review) title.appendChild(element("small", "review-mark", "Dodano do omówienia"));
        if (entry.progress && (status === "bad" || status === "medium")) {
            title.appendChild(element("small", "wrong-answer", `Uczeń: ${entry.progress.submitted_answer || "nie zapisano odpowiedzi"}`));
            title.appendChild(element("small", "correct-answer", `Poprawna: ${expectedAnswer(entry.task)}`));
        }
        summary.append(title,
            element("span", `result-chip ${status}`, `${RESULT_LABELS[status] || status}${entry.progress?.hint_used ? " (w)" : ""}`),
            element("span", "task-points", taskPoints(entry)));
        const preview = element("div", "task-preview");
        detail.append(summary, preview);
        detail.addEventListener("toggle", () => {
            if (detail.open && !detail.dataset.loaded) {
                detail.dataset.loaded = "true";
                showTaskImages(entry, preview);
            }
        });
        return detail;
    }

    function partSummary(entries, label) {
        const stats = partStats(entries);
        const summary = element("div", "part-summary");
        summary.appendChild(element("span", "part-label", label));
        summary.appendChild(element("strong", "", stats.total
            ? `${stats.attempted}/${stats.total} · ${stats.percent === null ? "-" : `${stats.percent}%`} poprawnych`
            : "Brak zadań"));
        if (stats.total) {
            summary.appendChild(element("small", "", `${stats.good} dobrze · ${stats.medium} z pomocą · ${stats.bad} źle` +
                (stats.video ? ` · ${stats.video} nagranie` : "")));
            const segments = element("div", "segments");
            segments.title = `${stats.review} do omówienia`;
            for (const entry of entries) {
                const result = entry.progress?.result;
                const status = result === "video"
                    ? "video"
                    : result === "medium" || (result === "good" && entry.progress?.hint_used)
                        ? "medium"
                        : result || (entry.review ? "review" : "missing");
                segments.appendChild(element("span", status));
            }
            summary.appendChild(segments);
        }
        return summary;
    }

    function renderLesson(lesson) {
        const entry = element("div", "lesson-entry");
        entry.id = `parent-lesson-${lesson.number}`;
        const row = element("button", "lesson-row");
        row.type = "button";
        row.setAttribute("aria-expanded", "false");
        row.setAttribute("aria-controls", `parent-lesson-detail-${lesson.number}`);
        const name = element("div", "lesson-name");
        name.append(element("strong", "", `Lekcja ${lesson.number} · ${lesson.title || "Kurs"}`),
            element("span", "", lesson.complete ? "Ukończona" : lesson.attempted ? "Rozpoczęta" : "Nierozpoczęta"));
        row.appendChild(name);
        for (const [part, label] of PARTS) {
            row.appendChild(partSummary(lesson.entries.filter(item => item.task.coursePart === part), label));
        }
        row.appendChild(element("span", "lesson-date", formatDate(lesson.lastActivity)));
        const details = element("div", "lesson-detail");
        details.id = `parent-lesson-detail-${lesson.number}`;
        details.hidden = true;
        for (const [part, label] of PARTS) {
            const tasks = lesson.entries.filter(item => item.task.coursePart === part);
            if (!tasks.length) continue;
            const group = element("div", "task-group");
            group.appendChild(element("h3", "", label));
            for (const task of tasks) group.appendChild(taskDetail(task));
            details.appendChild(group);
        }
        row.addEventListener("click", () => {
            details.hidden = !details.hidden;
            row.setAttribute("aria-expanded", String(!details.hidden));
        });
        entry.append(row, details);
        return entry;
    }

    function renderReviewItems(reviewTasks, lessons) {
        const section = document.getElementById("parentReviewSection");
        const list = document.getElementById("parentReviewList");
        list.replaceChildren();
        section.hidden = !reviewTasks.length;
        for (const review of reviewTasks) {
            const lesson = lessons.find(item => item.source_id === taskSource(review));
            const label = lesson
                ? `Lekcja ${lesson.number} · ${taskName(review)}`
                : review.title || taskName(review);
            const button = element("button", "review-item", label);
            button.type = "button";
            if (lesson) {
                button.addEventListener("click", () => {
                    const entry = document.getElementById(`parent-lesson-${lesson.number}`);
                    const row = entry?.querySelector(".lesson-row");
                    if (row && row.getAttribute("aria-expanded") === "false") row.click();
                    entry?.scrollIntoView({ behavior: "smooth", block: "center" });
                });
            } else {
                button.disabled = true;
            }
            list.appendChild(button);
        }
    }

    function examSourceAllowed(source, level) {
        const segment = LEVEL_SEGMENTS[level];
        return Boolean(segment && new RegExp(`^zadania/${segment}/[A-Za-z0-9_./-]+\\.json$`).test(source)
            && !source.split("/").includes(".."));
    }

    async function examCatalogForProgress(progress, level) {
        const sources = [...new Set(progress.map(taskSource).filter(source => examSourceAllowed(source, level)))];
        const entries = await Promise.all(sources.map(async source => {
            try {
                const response = await fetch(source);
                const tasks = response.ok ? await response.json() : [];
                return [source, Array.isArray(tasks) ? tasks : []];
            } catch (_error) {
                return [source, []];
            }
        }));
        return new Map(entries);
    }

    function renderExams(progress, latest, catalog) {
        const section = document.getElementById("parentExamsSection");
        const list = document.getElementById("parentExams");
        list.replaceChildren();
        section.hidden = catalog.size === 0;
        for (const [source, tasks] of catalog) {
            const saved = progress.filter(item => taskSource(item) === source);
            const savedFiles = new Set(saved.map(taskFile));
            const visibleTasks = tasks.length ? tasks : saved.map(item => ({
                file: taskFile(item), title: item.title || "", maxPoints: item.max_points || 1
            }));
            const attempted = visibleTasks.filter(task => savedFiles.has(task.file)).length;
            const parts = source.split("/");
            const label = `${parts[2] || "Egzamin"} ${parts[3] || ""}`;
            const exam = element("details", "exam-entry");
            exam.appendChild(element("summary", "", `${label} · ${attempted}${tasks.length ? `/${tasks.length}` : ""} zadań`));
            const detail = element("div", "lesson-detail");
            for (const task of visibleTasks) {
                detail.appendChild(taskDetail({ task, sourceId: source,
                    progress: latest.get(`${source}:${task.file}`) || null, review: false }));
            }
            exam.appendChild(detail);
            list.appendChild(exam);
        }
    }

    function renderDashboard(data, catalog) {
        const student = data.student;
        const progress = Array.isArray(data.progress) ? data.progress : [];
        const review = Array.isArray(data.review_tasks) ? data.review_tasks : [];
        const latest = latestProgressMap(progress);
        const reviewKeys = new Set(review.map(taskKey).filter(Boolean));
        const lessons = (Array.isArray(data.course_lessons) ? data.course_lessons : [])
            .map(lesson => lessonState(lesson, latest, reviewKeys));
        const target = COURSE_TARGETS[student.level] || lessons.length || 20;
        const completed = lessons.filter(lesson => lesson.complete).length;
        const allEntries = lessons.flatMap(lesson => lesson.entries);
        const totals = partStats(allEntries);
        const lastActivity = progress[0]?.created_at || student.last_login_at;

        document.getElementById("studentName").textContent = student.display_name || student.email || "Uczeń";
        document.getElementById("studentMeta").textContent = LEVEL_LABELS[student.level] || "Kurs";
        document.getElementById("lastSync").textContent = `Ostatnia aktywność: ${formatDate(lastActivity)}`;
        document.getElementById("courseProgressText").textContent = `${completed}/${target} lekcji`;
        document.getElementById("courseProgressFill").style.width = `${Math.min(100, completed / target * 100)}%`;
        const track = document.getElementById("courseProgressTrack");
        track.setAttribute("aria-valuemax", String(target));
        track.setAttribute("aria-valuenow", String(completed));
        const totalBox = document.getElementById("courseTotals");
        totalBox.replaceChildren();
        for (const value of [
            `Zadania: ${totals.attempted}/${totals.total}`,
            `Poprawnie: ${totals.good}`,
            `Z pomocą: ${totals.medium}`,
            `Do omówienia: ${totals.review}`
        ]) totalBox.appendChild(element("span", "", value));

        const list = document.getElementById("parentLessons");
        list.replaceChildren();
        if (!lessons.length) list.appendChild(element("p", "empty-note", "Materiały kursu nie są jeszcze dostępne."));
        for (const lesson of lessons) list.appendChild(renderLesson(lesson));
        renderReviewItems(review, lessons);
        renderExams(progress, latest, catalog);
        document.getElementById("statusPanel").hidden = true;
        document.getElementById("dashboard").classList.add("active");
    }

    async function bootParentPanel() {
        parentToken = parentTokenFromLink();
        if (!parentToken) {
            showStatus("Brakuje linku rodzica", "Otwórz indywidualny link otrzymany od nauczyciela.");
            return;
        }
        try {
            const data = await window.apiFetch("/api/parent/progress", {
                method: "POST",
                body: JSON.stringify({ token: parentToken })
            });
            const progress = Array.isArray(data.progress) ? data.progress : [];
            const catalog = await examCatalogForProgress(progress, data.student?.level);
            renderDashboard(data, catalog);
        } catch (error) {
            if (error.status === 401 || error.status === 403) {
                window.sessionStorage.removeItem(TOKEN_KEY);
            }
            showStatus("Nie można otworzyć panelu", error.message || "Link rodzica jest nieprawidłowy albo wygasł.");
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", bootParentPanel);
    } else {
        bootParentPanel();
    }
})();
