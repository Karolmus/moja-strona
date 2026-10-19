(function(root){
    const document = root.document;
    const mobile = root.matchMedia("(max-width: 760px), (orientation: landscape) and (max-height: 560px) and (max-width: 1000px)");
    const reducedMotion = root.matchMedia("(prefers-reduced-motion: reduce)");
    const panels = {
        level: {button: "levelPickerToggle", regions: ["guestLevelSection"], open: false},
        paper: {button: "examPickerToggle", regions: ["examYearFilterRow", "sourceList"], open: false},
        tasks: {button: "taskNavigatorToggle", regions: ["progress"], open: false}
    };
    let selection = {category: "", level: ""};
    let animation = null;
    let presentedTask = "";

    function active(){
        return selection.category === "egzaminy" && mobile.matches;
    }

    function refresh(){
        document.body.classList.toggle("mobile-exam-view", active());
        Object.values(panels).forEach(panel => {
            document.getElementById(panel.button)?.setAttribute("aria-expanded", String(!active() || panel.open));
        });
    }

    function setOpen(name, open){
        const panel = panels[name];
        if(!panel) return;
        if(!open && active() && panel.regions.some(id => document.getElementById(id)?.contains(document.activeElement))){
            document.getElementById(panel.button)?.focus({preventScroll: true});
        }
        panel.open = open;
        refresh();
    }

    function sync(next){
        if(next.category !== selection.category || next.level !== selection.level){
            Object.keys(panels).forEach(name => setOpen(name, false));
        }
        selection = next;
        const level = document.getElementById("levelPickerValue");
        const paper = document.getElementById("examPickerValue");
        if(level) level.textContent = next.levelLabel || "Wybierz poziom";
        if(paper) paper.textContent = next.paperLabel || "Wybierz arkusz";
        refresh();
    }

    function levelSelected(){
        if(!active()) return;
        setOpen("level", false);
        setOpen("paper", true);
        setOpen("tasks", false);
    }

    function paperSelected(){
        if(!active()) return;
        Object.keys(panels).forEach(name => setOpen(name, false));
    }

    function navigator({label, count}){
        const value = document.getElementById("taskNavigatorValue");
        const button = document.getElementById("taskNavigatorToggle");
        if(value) value.textContent = count ? `Zadanie ${label || "1"} z ${count}` : "Brak zadań";
        if(button) button.hidden = !count;
    }

    function beginTask(){
        animation?.cancel();
        animation = null;
        if(active()) setOpen("tasks", false);
    }

    function presentTask(key){
        const changed = presentedTask && key && presentedTask !== key;
        presentedTask = key;
        animation?.cancel();
        animation = null;
        const navigation = document.querySelector(".task-navigation");
        if(changed && active() && navigation?.getBoundingClientRect().top < 0){
            navigation.scrollIntoView({block: "start", behavior: "instant"});
        }
        const content = document.querySelector(".task-content");
        if(!changed || reducedMotion.matches || !content?.animate) return;
        animation = content.animate([
            {opacity: 0.55, transform: "translateY(5px)"},
            {opacity: 1, transform: "translateY(0)"}
        ], {duration: 140, easing: "ease-out"});
    }

    Object.entries(panels).forEach(([name, panel]) => {
        document.getElementById(panel.button)?.addEventListener("click", () => {
            const open = !panel.open;
            Object.keys(panels).forEach(other => setOpen(other, other === name && open));
            if(name === "tasks" && open){
                document.querySelector('#progress [aria-current="step"]')?.scrollIntoView({block: "nearest", inline: "nearest"});
            }
        });
    });
    document.addEventListener("keydown", event => {
        if(event.key !== "Escape" || !active()) return;
        const panel = Object.entries(panels).find(([, item]) => item.open &&
            (document.getElementById(item.button) === event.target ||
                item.regions.some(id => document.getElementById(id)?.contains(event.target))));
        if(panel){
            event.preventDefault();
            setOpen(panel[0], false);
        }
    });
    mobile.addEventListener("change", refresh);
    reducedMotion.addEventListener("change", () => {
        if(reducedMotion.matches) animation?.cancel();
    });
    root.DSMobileExam = {sync, levelSelected, paperSelected, navigator, beginTask, presentTask};
})(window);
