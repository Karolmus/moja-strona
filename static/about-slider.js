(function () {
    const AUTO_CHANGE_DELAY = 10000;
    const SWIPE_DISTANCE = 36;

    function initSlider(slider) {
        if (slider.dataset.sliderReady === "true") return;

        const photos = Array.from(slider.children).filter(element => element.tagName === "IMG");
        const previousButton = slider.querySelector(".about-shared__control--prev");
        const nextButton = slider.querySelector(".about-shared__control--next");
        const dotsContainer = slider.querySelector(".about-shared__dots");

        if (photos.length < 2) return;

        slider.dataset.sliderReady = "true";
        slider.tabIndex = 0;

        let currentIndex = Math.max(0, photos.findIndex(photo => photo.classList.contains("active")));
        let timerId;
        let pointerStartX = null;
        let activePointerId = null;

        const dots = photos.map((_, index) => {
            const dot = document.createElement("span");
            dot.className = `about-shared__dot${index === currentIndex ? " active" : ""}`;
            dotsContainer?.appendChild(dot);
            return dot;
        });

        function showPhoto(index, restartTimer = true) {
            photos[currentIndex].classList.remove("active");
            dots[currentIndex]?.classList.remove("active");

            currentIndex = (index + photos.length) % photos.length;
            photos[currentIndex].classList.add("active");
            dots[currentIndex]?.classList.add("active");

            if (restartTimer) startTimer();
        }

        function startTimer() {
            window.clearInterval(timerId);
            timerId = window.setInterval(() => showPhoto(currentIndex + 1, false), AUTO_CHANGE_DELAY);
        }

        previousButton?.addEventListener("click", event => {
            event.stopPropagation();
            showPhoto(currentIndex - 1);
        });

        nextButton?.addEventListener("click", event => {
            event.stopPropagation();
            showPhoto(currentIndex + 1);
        });

        slider.addEventListener("keydown", event => {
            if (event.key === "ArrowLeft") {
                event.preventDefault();
                showPhoto(currentIndex - 1);
            }

            if (event.key === "ArrowRight") {
                event.preventDefault();
                showPhoto(currentIndex + 1);
            }
        });

        slider.addEventListener("pointerdown", event => {
            if (event.target.closest("button")) return;

            pointerStartX = event.clientX;
            activePointerId = event.pointerId;
            slider.classList.add("is-dragging");
            slider.setPointerCapture?.(event.pointerId);
        });

        slider.addEventListener("pointerup", event => {
            if (pointerStartX === null || event.pointerId !== activePointerId) return;

            const distance = event.clientX - pointerStartX;
            pointerStartX = null;
            activePointerId = null;
            slider.classList.remove("is-dragging");

            if (Math.abs(distance) < SWIPE_DISTANCE) return;
            showPhoto(currentIndex + (distance < 0 ? 1 : -1));
        });

        slider.addEventListener("pointercancel", () => {
            pointerStartX = null;
            activePointerId = null;
            slider.classList.remove("is-dragging");
        });

        startTimer();
    }

    window.initAboutSliders = function (root = document) {
        root.querySelectorAll(".about-shared__slider").forEach(initSlider);
    };
})();
