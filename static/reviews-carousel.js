(function(){
    const AUTOPLAY_MS = 4200;
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    const canClickCards = window.matchMedia?.("(hover: hover) and (pointer: fine)")?.matches === true;

    function setCardState(card, state, isActive, isInteractive){
        card.classList.remove("is-active", "is-prev", "is-next", "is-hidden");
        card.classList.add(state);
        card.setAttribute("aria-hidden", state === "is-hidden" ? "true" : "false");

        if(isInteractive && !isActive){
            card.setAttribute("role", "button");
            card.setAttribute("tabindex", "0");
            card.setAttribute("aria-label", "Pokaż tę opinię");
        } else {
            card.removeAttribute("role");
            card.removeAttribute("tabindex");
            card.removeAttribute("aria-label");
        }
    }

    function updateCarousel(section){
        const cards = Array.from(section.querySelectorAll(".review-card"));
        const activeIndex = Number(section.dataset.reviewIndex || 0);
        const previousIndex = (activeIndex - 1 + cards.length) % cards.length;
        const nextIndex = (activeIndex + 1) % cards.length;

        cards.forEach((card, index) => {
            if(index === activeIndex){
                setCardState(card, "is-active", true, false);
            } else if(index === previousIndex){
                setCardState(card, "is-prev", false, canClickCards);
            } else if(index === nextIndex){
                setCardState(card, "is-next", false, canClickCards);
            } else {
                setCardState(card, "is-hidden", false, false);
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

    function addCardSelection(section){
        if(!canClickCards || section.dataset.cardSelectionReady === "true"){
            return;
        }

        section.dataset.cardSelectionReady = "true";

        section.querySelectorAll(".review-card").forEach(card => {
            const selectCard = () => {
                if(card.classList.contains("is-prev")){
                    moveCarousel(section, -1);
                    startAutoplay(section);
                } else if(card.classList.contains("is-next")){
                    moveCarousel(section, 1);
                    startAutoplay(section);
                }
            };

            card.addEventListener("click", selectCard);
            card.addEventListener("keydown", event => {
                if(event.key === "Enter" || event.key === " "){
                    event.preventDefault();
                    selectCard();
                }
            });
        });
    }

    function addSwipe(section){
        const track = section.querySelector(".reviews-grid");

        if(!track || track.dataset.swipeReady === "true"){
            return;
        }

        let startX = 0;
        let startY = 0;
        let currentX = 0;
        let pointerId = null;
        let isTouchPointer = false;

        function resetSwipe(){
            startX = 0;
            startY = 0;
            currentX = 0;
            pointerId = null;
            isTouchPointer = false;
            section.classList.remove("is-swiping");
        }

        track.dataset.swipeReady = "true";

        track.addEventListener("pointerdown", event => {
            if(event.pointerType === "mouse"){
                return;
            }

            pointerId = event.pointerId;
            isTouchPointer = true;
            startX = event.clientX;
            startY = event.clientY;
            currentX = event.clientX;
            section.classList.add("is-swiping");
            stopAutoplay(section);
            track.setPointerCapture?.(event.pointerId);
        });

        track.addEventListener("pointermove", event => {
            if(!isTouchPointer || event.pointerId !== pointerId){
                return;
            }

            currentX = event.clientX;
        });

        track.addEventListener("pointerup", event => {
            if(!isTouchPointer || event.pointerId !== pointerId){
                return;
            }

            const deltaX = event.clientX - startX;
            const deltaY = event.clientY - startY;
            const absX = Math.abs(deltaX);
            const absY = Math.abs(deltaY);

            if(absX > 44 && absX > absY * 1.2){
                moveCarousel(section, deltaX < 0 ? 1 : -1);
            }

            resetSwipe();
            startAutoplay(section);
        });

        track.addEventListener("pointercancel", () => {
            resetSwipe();
            startAutoplay(section);
        });
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

            section.querySelector(".reviews-carousel-controls")?.remove();
            addCardSelection(section);
            addSwipe(section);
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
