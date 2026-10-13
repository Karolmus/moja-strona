(function(){
    function pendingTests(sources, isComplete, hasStarted){
        return sources.filter((source, index) => {
            if(source.kind !== "test" || source.optional || isComplete(source)) return false;

            let start = 0;
            for(let previous = index - 1; previous >= 0; previous--){
                if(sources[previous].kind === "test" && !sources[previous].optional){
                    if(!isComplete(sources[previous])) return false;
                    start = previous + 1;
                    break;
                }
            }

            const lessons = sources.slice(start, index).filter(item => item.kind !== "test");

            return hasStarted(source) || (lessons.length > 0 && lessons.every(isComplete));
        });
    }

    function renderNotice(element, tests, onOpen){
        element.replaceChildren();
        element.hidden = !tests.length;
        if(!tests.length) return;

        const message = document.createElement("div");
        const heading = document.createElement("strong");
        const detail = document.createElement("span");
        const link = document.createElement("a");
        const test = tests[0];
        const sourceId = test.id || test.path;

        message.className = "course-test-notice-copy";
        heading.textContent = tests.length === 1 ? "Masz test do wykonania" : `Testy do wykonania: ${tests.length}`;
        detail.textContent = test.label || "Test sprawdzający";
        link.className = "course-test-notice-link";
        link.textContent = "Przejdź do testu";
        link.href = `zadania.html?category=testy&test=${encodeURIComponent(sourceId)}`;
        if(onOpen){
            link.addEventListener("click", event => {
                event.preventDefault();
                onOpen(sourceId);
            });
        }
        message.append(heading, detail);
        element.append(message, link);
    }

    window.DSCourseTests = Object.freeze({pendingTests, renderNotice});
})();
