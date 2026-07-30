(function(){
    const AUTOPLAY_MS = 4200;
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

    function setCardState(card, state, isActive){
        card.classList.remove("is-active", "is-prev", "is-next", "is-hidden");
        card.classList.add(state);
        card.setAttribute("aria-hidden", isActive ? "false" : "true");
    }

    function updateCarousel(section){
        const cards = Array.from(section.querySelectorAll(".review-card"));
        const activeIndex = Number(section.dataset.reviewIndex || 0);
        const previousIndex = (activeIndex - 1 + cards.length) % cards.length;
        const nextIndex = (activeIndex + 1) % cards.length;

        cards.forEach((card, index) => {
            if(index === activeIndex){
                setCardState(card, "is-active", true);
            } else if(index === previousIndex){
                setCardState(card, "is-prev", false);
            } else if(index === nextIndex){
                setCardState(card, "is-next", false);
            } else {
                setCardState(card, "is-hidden", false);
            }
        });
    }

    function moveCarousel(section, direction){
        const cards = section.querySelectorAll(".review-card");
        const activeIndex = Number(section.dataset.reviewIndex || 0);
        const nextIndex = (activeIndex + direction + cards.length) % cards.length;

        section.dataset.reviewIndex = String(nextIndex);
        updateCarousel(section);
    }

    function startAutoplay(section){
        if(reducedMotion || section.dataset.reviewPaused === "true"){
            return;
        }

        window.clearInterval(Number(section.dataset.reviewTimer || 0));
        section.dataset.reviewTimer = String(window.setInterval(() => {
            moveCarousel(section, 1);
        }, AUTOPLAY_MS));
    }

    function stopAutoplay(section){
        window.clearInterval(Number(section.dataset.reviewTimer || 0));
        section.dataset.reviewTimer = "";
    }

    function addControls(section){
        if(section.querySelector(".reviews-carousel-controls")){
            return;
        }

        const controls = document.createElement("div");
        const previous = document.createElement("button");
        const next = document.createElement("button");

        controls.className = "reviews-carousel-controls";

        previous.className = "reviews-carousel-control";
        previous.type = "button";
        previous.innerText = "‹";
        previous.setAttribute("aria-label", "Poprzednia opinia");

        next.className = "reviews-carousel-control";
        next.type = "button";
        next.innerText = "›";
        next.setAttribute("aria-label", "Następna opinia");

        previous.addEventListener("click", () => {
            moveCarousel(section, -1);
            startAutoplay(section);
        });

        next.addEventListener("click", () => {
            moveCarousel(section, 1);
            startAutoplay(section);
        });

        controls.append(previous, next);
        section.appendChild(controls);
    }

    function initReviewCarousel(root = document){
        const sections = root.matches?.(".reviews")
            ? [root]
            : Array.from(root.querySelectorAll?.(".reviews") || []);

        sections.forEach(section => {
            const cards = section.querySelectorAll(".review-card");

            if(section.dataset.carouselReady === "true" || cards.length < 3){
                return;
            }

            section.dataset.carouselReady = "true";
            section.dataset.reviewIndex = section.dataset.reviewIndex || "0";
            section.classList.add("reviews-carousel");
            section.querySelector(".reviews-grid")?.setAttribute("aria-live", "polite");

            addControls(section);
            updateCarousel(section);
            startAutoplay(section);

            section.addEventListener("focusin", () => {
                section.dataset.reviewPaused = "true";
                stopAutoplay(section);
            });

            section.addEventListener("focusout", () => {
                section.dataset.reviewPaused = "false";
                startAutoplay(section);
            });
        });
    }

    window.initReviewCarousel = initReviewCarousel;

    if(document.readyState === "loading"){
        document.addEventListener("DOMContentLoaded", () => initReviewCarousel(), { once: true });
    } else {
        initReviewCarousel();
    }

    new MutationObserver(mutations => {
        mutations.forEach(mutation => {
            mutation.addedNodes.forEach(node => {
                if(node.nodeType === Node.ELEMENT_NODE){
                    initReviewCarousel(node);
                }
            });
        });
    }).observe(document.documentElement, {
        childList: true,
        subtree: true
    });
})();
