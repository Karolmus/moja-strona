(function (root) {
    "use strict";

    class ActiveWorkTime {
        constructor({ now = () => performance.now(), idleTimeoutMs = 300000, maxTickGapMs = 15000 } = {}) {
            this.now = now;
            this.idleTimeoutMs = idleTimeoutMs;
            this.maxTickGapMs = maxTickGapMs;
            this.checkpoint = now();
            this.lastActivity = this.checkpoint;
            this.foreground = false;
            this.key = "";
            this.durations = new Map();
            this.total = 0;
        }

        tick() {
            const at = this.now();
            const gap = at - this.checkpoint;
            // A suspended browser must not charge the time since its last heartbeat.
            if (gap > this.maxTickGapMs || gap < 0) {
                this.lastActivity = -Infinity;
            } else if (this.key && this.foreground) {
                const elapsed = Math.max(0, Math.min(at, this.lastActivity + this.idleTimeoutMs) - this.checkpoint);
                this.durations.set(this.key, (this.durations.get(this.key) || 0) + elapsed);
                this.total += elapsed;
            }
            this.checkpoint = at;
        }

        activity() {
            this.tick();
            if (this.foreground) this.lastActivity = this.now();
        }

        setForeground(value) {
            this.tick();
            if (value && !this.foreground) this.lastActivity = this.now();
            this.foreground = value;
        }

        start(key) {
            this.tick();
            this.key = key;
            this.lastActivity = this.now();
        }

        pause() {
            this.tick();
            this.key = "";
        }

        seconds(key) {
            this.tick();
            return Math.min(14400, Math.round((this.durations.get(key) || 0) / 1000));
        }

        finish(key) {
            this.tick();
            if (this.key === key) this.key = "";
            this.durations.delete(key);
        }

        resetTotal() {
            this.pause();
            this.total = 0;
        }

        totalSeconds() {
            this.tick();
            return Math.floor(this.total / 1000);
        }
    }

    if (typeof module !== "undefined" && module.exports) module.exports = ActiveWorkTime;
    else root.DeltaSigmaActiveWorkTime = ActiveWorkTime;
})(globalThis);
