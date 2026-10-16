(function(root){
    function percent(value){
        return Math.max(0, Math.min(100, Number(value) || 0));
    }

    function tone(value){
        const score = percent(value);
        return score < 50 ? "low" : score <= 80 ? "medium" : "high";
    }

    function update(track, fill, value, label, valueText){
        if(!track || !fill) return;
        const score = percent(value);
        fill.style.width = "100%";
        fill.style.height = `${score}%`;
        track.removeAttribute("aria-hidden");
        for(const [name, content] of Object.entries({
            role: "progressbar", "aria-label": label, "aria-orientation": "vertical",
            "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": String(score),
            "aria-valuetext": valueText
        })) track.setAttribute(name, content);
    }

    const api = {percent, tone, update};
    if(typeof module === "object" && module.exports) module.exports = api;
    else root.DSWorkspaceScore = api;
})(typeof window === "object" ? window : globalThis);
