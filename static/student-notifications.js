(function(){
    let userId = null;
    let loadedAt = 0;
    let pending = null;
    let items = [];
    let knownIds = new Set();
    let ui = null;

    function render(data){
        items = data.notifications || [];
        const count = Number(data.unread_count) || 0;
        ui.badge.hidden = !count;
        ui.badge.textContent = count > 99 ? "99+" : String(count);
        ui.button.setAttribute("aria-label", count ? `Powiadomienia: ${count} nieprzeczytanych` : "Powiadomienia");
        ui.list.replaceChildren();
        if(!items.length){
            const empty = document.createElement("p");
            empty.textContent = "Brak powiadomień.";
            ui.list.appendChild(empty);
        }
        items.forEach(item => {
            const entry = document.createElement("li");
            const message = document.createElement("span");
            const date = document.createElement("time");
            entry.classList.toggle("unread", !item.read_at);
            message.textContent = item.message;
            date.dateTime = item.created_at;
            date.textContent = new Date(item.created_at).toLocaleString("pl-PL", {dateStyle:"short", timeStyle:"short"});
            entry.append(message, date);
            ui.list.appendChild(entry);
        });
    }

    async function refresh(force = false){
        if(userId === null || (!force && Date.now() - loadedAt < 30000)) return;
        if(pending) return pending;
        const requestedUser = userId;
        const token = window.getAuthToken();
        const request = window.apiFetch("/api/notifications/me").then(data => {
            if(requestedUser !== userId || token !== window.getAuthToken()) return;
            loadedAt = Date.now();
            const signature = item => JSON.stringify([item.id, item.created_at, item.kind, item.source_id, item.file, item.message]);
            const changed = (data.notifications || []).filter(item => !knownIds.has(signature(item)));
            knownIds = new Set((data.notifications || []).map(signature));
            render(data);
            if(changed.length) window.dispatchEvent(new CustomEvent("deltaSigmaStudentWorkChanged", {detail: changed}));
        }).catch(() => {
            loadedAt = 0;
            if(requestedUser === userId && ui && !ui.panel.hidden){
                ui.list.textContent = "Nie udało się wczytać powiadomień. Otwórz je ponownie.";
            }
        }).finally(() => { if(pending === request) pending = null; });
        pending = request;
        return request;
    }

    function close(){
        if(!ui) return;
        ui.panel.hidden = true;
        ui.button.setAttribute("aria-expanded", "false");
    }

    function mount(nav, link){
        const root = document.createElement("div");
        const button = document.createElement("button");
        const icon = document.createElement("img");
        const badge = document.createElement("span");
        const panel = document.createElement("section");
        const heading = document.createElement("strong");
        const list = document.createElement("ul");
        root.className = "student-notifications";
        button.type = "button";
        button.className = "notification-toggle";
        button.setAttribute("aria-label", "Powiadomienia");
        button.setAttribute("aria-expanded", "false");
        button.setAttribute("aria-controls", "studentNotificationsPanel");
        icon.src = "static/icons/message-circle.svg";
        icon.alt = "";
        badge.className = "notification-count";
        badge.hidden = true;
        panel.id = "studentNotificationsPanel";
        panel.className = "notification-panel";
        panel.setAttribute("aria-label", "Powiadomienia");
        panel.hidden = true;
        heading.textContent = "Powiadomienia";
        panel.append(heading, list);
        button.append(icon, badge);
        root.append(button, panel);
        const group = document.createElement("div");
        group.className = "profile-notification-link";
        nav.insertBefore(group, link);
        group.append(link, root);
        ui = {root, button, badge, panel, list};
        button.addEventListener("click", async () => {
            const opening = panel.hidden;
            panel.hidden = !opening;
            button.setAttribute("aria-expanded", String(opening));
            if(!opening) return;
            if(!items.length) list.textContent = "Wczytywanie…";
            await refresh(true);
            if(panel.hidden || !items.length) return;
            const requestedUser = userId;
            try {
                const data = await window.apiFetch("/api/notifications/me/read", {
                    method:"PATCH", body:JSON.stringify({through_id:Math.max(...items.map(item => item.id))})
                });
                if(requestedUser === userId) render(data);
            } catch(error) { /* The unread badge remains until the server confirms the read. */ }
        });
    }

    window.updateStudentNotifications = function(user){
        if(user?.role !== "student"){
            userId = null;
            items = [];
            knownIds.clear();
            loadedAt = 0;
            close();
            if(ui) ui.root.hidden = true;
            return;
        }
        const nav = document.querySelector(".main-nav");
        const link = nav?.querySelector("[data-auth-panel]");
        if(!link) return;
        if(!ui || !ui.root.isConnected) mount(nav, link);
        if(userId !== user.id){
            userId = user.id;
            items = [];
            knownIds.clear();
            loadedAt = 0;
            close();
            render({notifications:[], unread_count:0});
        }
        ui.root.hidden = false;
        refresh();
    };
    document.addEventListener("click", event => { if(ui && !ui.root.contains(event.target)) close(); });
    document.addEventListener("keydown", event => {
        if(event.key === "Escape" && ui && !ui.panel.hidden){ close(); ui.button.focus(); }
    });
    document.addEventListener("visibilitychange", () => { if(!document.hidden) refresh(); });
    window.addEventListener("focus", () => refresh());
    window.setInterval(() => { if(!document.hidden) refresh(); }, 30000);
})();
