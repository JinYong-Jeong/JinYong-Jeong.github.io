import "../styles/record-gesture.css";

function mountRecordDesks() {
  document
    .querySelectorAll<HTMLElement>("[data-record-desk]")
    .forEach((root) => {
      if (root.dataset.ready) return;
      root.dataset.ready = "true";
      const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
      const finePointer = window.matchMedia(
        "(hover: hover) and (pointer: fine)",
      );
      const openButton =
        root.querySelector<HTMLButtonElement>("[data-book-open]")!;
      const closeButton =
        root.querySelector<HTMLButtonElement>("[data-book-close]")!;
      const spread = root.querySelector<HTMLElement>(".rd-spread")!;
      const paper = spread.querySelector<HTMLElement>(".rd-paper")!;
      const coverFront = root.querySelector<HTMLElement>(".rd-cover-front")!;
      const pages = [...root.querySelectorAll<HTMLElement>("[data-book-page]")];
      const tabs = [
        ...root.querySelectorAll<HTMLButtonElement>("[data-book-tab]"),
      ];
      const status = root.querySelector<HTMLElement>("[data-book-status]")!;
      const number = root.querySelector<HTMLElement>("[data-book-number]")!;
      const hint = root.querySelector<HTMLElement>("[data-book-hint]")!;
      const closedHint = hint.textContent;
      const controller = new AbortController();
      const { signal } = controller;
      let index = 0;
      let opened = false;
      let turningTo: number | null = null;
      let queuedIndex: number | null = null;
      let opener: HTMLElement | null = null;
      let focusTimer = 0;
      let swapTimer = 0;
      let turnTimer = 0;
      let pointerFrame = 0;
      let drag: {
        id: number;
        x: number;
        y: number;
        width: number;
        step: number;
        progress: number;
      } | null = null;
      let leaf: HTMLElement | null = null;
      let settling: Animation | null = null;

      openButton.hidden = false;

      function showPage(next: number, announce = true) {
        const moveFocus = pages[index].contains(document.activeElement);
        index = (next + pages.length) % pages.length;
        pages.forEach((page, i) => {
          page.hidden = i !== index;
        });
        tabs.forEach((tab, i) => {
          tab.setAttribute("aria-selected", String(i === index));
          tab.tabIndex = i === index ? 0 : -1;
        });
        number.textContent = String(index + 1).padStart(2, "0");
        if (moveFocus)
          pages[index].querySelector("h3")?.focus({ preventScroll: true });
        if (announce)
          status.textContent = `${index + 1} / ${pages.length}. ${pages[index].querySelector(".rd-page-kicker")?.textContent}`;
      }

      function resetTilt() {
        root.style.setProperty("--rd-rx", "0deg");
        root.style.setProperty("--rd-ry", "0deg");
      }

      function alignOpenBook(fromOutside: boolean) {
        const header = document.querySelector(".masthead");
        const top = (header?.getBoundingClientRect().bottom ?? 0) + 12;
        const bottomPadding = getComputedStyle(
          document.documentElement,
        ).scrollPaddingBottom;
        const bottom =
          window.innerHeight - (parseFloat(bottomPadding) || 0) - 12;
        const bounds = root.getBoundingClientRect();
        const bookmark = tabs[0].getBoundingClientRect();
        if (!fromOutside && bookmark.top >= top && bookmark.bottom <= bottom)
          return;
        const room = bottom - top;
        const offset =
          bounds.height <= room
            ? bounds.top - top - (room - bounds.height) / 2
            : Math.min(closeButton.getBoundingClientRect().top, bookmark.top) -
              top;
        window.scrollBy({
          top: offset,
          behavior: motion.matches ? "instant" : "smooth",
        });
      }

      function openBook(from?: HTMLElement | null) {
        const fromOutside = !!from && !root.contains(from);
        if (opened) {
          alignOpenBook(fromOutside);
          pages[index]
            .querySelector<HTMLElement>("h3")
            ?.focus({ preventScroll: true });
          return;
        }
        opener =
          from ??
          (document.activeElement instanceof HTMLElement
            ? document.activeElement
            : openButton);
        opened = true;
        root.dataset.open = "true";
        openButton.setAttribute("aria-expanded", "true");
        spread.inert = false;
        spread.setAttribute("aria-hidden", "false");
        closeButton.hidden = false;
        // The decorative back of the cover is not a second focusable surface.
        coverFront.inert = true;
        coverFront.setAttribute("aria-hidden", "true");
        hint.textContent = "페이지를 잡아 좌우로 넘겨보세요.";
        resetTilt();
        alignOpenBook(fromOutside);
        window.clearTimeout(focusTimer);
        focusTimer = window.setTimeout(
          () => {
            if (!opened || !root.isConnected) return;
            pages[index]
              .querySelector<HTMLElement>("h3")
              ?.focus({ preventScroll: true });
            status.textContent = `기록집을 펼쳤습니다. ${index + 1} / ${pages.length}. ${pages[index].querySelector(".rd-page-kicker")?.textContent}`;
          },
          motion.matches ? 0 : 1050,
        );
      }

      function closeBook() {
        if (!opened) return;
        clearDrag();
        opened = false;
        window.clearTimeout(focusTimer);
        window.clearTimeout(swapTimer);
        window.clearTimeout(turnTimer);
        turningTo = null;
        queuedIndex = null;
        delete root.dataset.turning;
        root.dataset.open = "false";
        openButton.setAttribute("aria-expanded", "false");
        closeButton.hidden = true;
        spread.inert = true;
        spread.setAttribute("aria-hidden", "true");
        hint.textContent = closedHint;
        status.textContent = "기록집을 덮었습니다.";
        resetTilt();
        const externalOpener =
          opener?.isConnected && !coverFront.contains(opener) ? opener : null;
        (externalOpener ?? root).focus({ preventScroll: true });
        focusTimer = window.setTimeout(
          () => {
            if (opened || !root.isConnected) return;
            coverFront.inert = false;
            coverFront.removeAttribute("aria-hidden");
            if (!externalOpener && document.activeElement === root)
              openButton.focus({ preventScroll: true });
          },
          motion.matches ? 0 : 1200,
        );
      }

      function requestedIndex() {
        return (
          ((queuedIndex ?? turningTo ?? index) + pages.length) % pages.length
        );
      }

      function turnTo(next: number) {
        const target = (next + pages.length) % pages.length;
        if (!opened) return;
        clearDrag();
        window.clearTimeout(focusTimer);
        if (turningTo !== null) {
          queuedIndex = next;
          return;
        }
        if (target === index) return;
        if (motion.matches) {
          showPage(target);
          return;
        }
        turningTo = target;
        root.dataset.turning = next > index ? "next" : "previous";
        swapTimer = window.setTimeout(() => showPage(target), 220);
        turnTimer = window.setTimeout(() => {
          delete root.dataset.turning;
          turningTo = null;
          if (queuedIndex !== null) {
            const queued = queuedIndex;
            queuedIndex = null;
            turnTo(queued);
          }
        }, 700);
      }

      openButton.addEventListener("click", () => openBook(openButton), {
        signal,
      });
      closeButton.addEventListener("click", closeBook, { signal });
      root
        .querySelector("[data-book-prev]")
        ?.addEventListener("click", () => turnTo(requestedIndex() - 1), {
          signal,
        });
      root
        .querySelector("[data-book-next]")
        ?.addEventListener("click", () => turnTo(requestedIndex() + 1), {
          signal,
        });
      tabs.forEach((tab, i) =>
        tab.addEventListener("click", () => turnTo(i), { signal }),
      );
      root.addEventListener(
        "keydown",
        (event) => {
          if (!opened) return;
          if (event.key === "Escape") {
            event.preventDefault();
            closeBook();
            return;
          }
          const onTab =
            event.target instanceof HTMLElement &&
            event.target.matches("[data-book-tab]");
          if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key))
            return;
          if (!onTab && !["ArrowRight", "ArrowLeft"].includes(event.key))
            return;
          event.preventDefault();
          const target =
            event.key === "Home"
              ? 0
              : event.key === "End"
                ? pages.length - 1
                : requestedIndex() + (event.key === "ArrowRight" ? 1 : -1);
          turnTo(target);
          if (onTab)
            tabs[(target + pages.length) % pages.length].focus({
              preventScroll: true,
            });
        },
        { signal },
      );

      root
        .querySelectorAll<HTMLButtonElement>("[data-book-question]")
        .forEach((button) => {
          button.addEventListener(
            "click",
            () =>
              window.dispatchEvent(
                new CustomEvent("cv:ask", {
                  detail: {
                    question: button.dataset.bookQuestion,
                    topic: button.dataset.bookTopic,
                    source: "record-desk",
                    opener: button,
                  },
                }),
              ),
            { signal },
          );
        });

      window.addEventListener(
        "cv:open-book",
        ((event: CustomEvent<{ opener?: HTMLElement }>) => {
          openBook(event.detail?.opener);
        }) as EventListener,
        { signal },
      );

      root.addEventListener(
        "pointermove",
        (event) => {
          if (
            drag ||
            leaf ||
            motion.matches ||
            !finePointer.matches ||
            event.pointerType !== "mouse"
          )
            return;
          cancelAnimationFrame(pointerFrame);
          pointerFrame = requestAnimationFrame(() => {
            const bounds = root.getBoundingClientRect();
            const amount = opened ? 0.9 : 2.5;
            root.style.setProperty(
              "--rd-rx",
              `${((0.5 - (event.clientY - bounds.top) / bounds.height) * amount).toFixed(2)}deg`,
            );
            root.style.setProperty(
              "--rd-ry",
              `${(((event.clientX - bounds.left) / bounds.width - 0.5) * amount).toFixed(2)}deg`,
            );
          });
        },
        { signal, passive: true },
      );
      root.addEventListener(
        "pointerleave",
        () => {
          cancelAnimationFrame(pointerFrame);
          resetTilt();
        },
        { signal },
      );

      // Keep the real articles in place. Only the turning leaf is a visual copy,
      // so cancelling a drag never changes the current tab, focus, or live region.
      function leafPose(step: number, progress: number) {
        const angle = leaf?.hasAttribute("data-outer-hinge")
          ? 176 * progress
          : step > 0
            ? -176 * progress
            : -176 * (1 - progress);
        return `translateZ(6px) rotateY(${angle}deg)`;
      }

      function clearDrag() {
        const pointerId = drag?.id;
        drag = null;
        if (pointerId !== undefined && root.hasPointerCapture(pointerId))
          root.releasePointerCapture(pointerId);
        settling?.cancel();
        settling = null;
        leaf?.remove();
        leaf = null;
        const preview = paper.querySelector<HTMLElement>("[data-book-preview]");
        if (preview) {
          delete preview.dataset.bookPreview;
          preview.inert = false;
        }
        delete root.dataset.dragTurn;
      }

      function liftPage(step: number) {
        window.clearTimeout(focusTimer);
        const target = (index + step + pages.length) % pages.length;
        root.dataset.dragTurn = step > 0 ? "next" : "previous";
        if (motion.matches) return;
        // In the single-page layout the facing page is offscreen. Peel from the
        // visible left edge on a backward drag so the turn follows the finger.
        const bounds = paper.getBoundingClientRect();
        const outerHinge =
          step < 0 &&
          bounds.left - root.getBoundingClientRect().left < bounds.width / 2;
        const outgoing = step > 0 || outerHinge;
        if (outgoing) {
          pages[target].inert = true;
          pages[target].dataset.bookPreview = "";
        }
        leaf = document.createElement("div");
        leaf.className = "rd-gesture-sheet";
        leaf.toggleAttribute("data-outer-hinge", outerHinge);
        leaf.inert = true;
        leaf.setAttribute("aria-hidden", "true");
        const face = pages[outgoing ? index : target].cloneNode(
          true,
        ) as HTMLElement;
        face.hidden = false;
        face.removeAttribute("id");
        face.removeAttribute("data-book-page");
        face.querySelectorAll("[id]").forEach((el) => el.removeAttribute("id"));
        leaf.append(face);
        spread.append(leaf);
        const selection = window.getSelection();
        if (selection && root.contains(selection.anchorNode))
          selection.removeAllRanges();
      }

      function landPage(commit: boolean) {
        if (!drag) return;
        const { id, step, progress } = drag;
        drag = null;
        if (root.hasPointerCapture(id)) root.releasePointerCapture(id);
        const finish = () => {
          clearDrag();
          if (commit && step) showPage(index + step);
        };
        if (!leaf || motion.matches || !progress) {
          finish();
          return;
        }
        const end = commit ? 1 : 0;
        const animation = leaf.animate(
          [
            { transform: leafPose(step, progress) },
            { transform: leafPose(step, end) },
          ],
          {
            duration: 100 + 230 * Math.abs(end - progress),
            easing: "cubic-bezier(.2,.68,.2,1)",
            fill: "forwards",
          },
        );
        settling = animation;
        animation.onfinish = finish;
      }

      root.addEventListener(
        "pointerdown",
        (event) => {
          if (
            !event.isPrimary ||
            event.button !== 0 ||
            !opened ||
            turningTo !== null ||
            settling ||
            event.shiftKey ||
            event.altKey ||
            event.ctrlKey ||
            event.metaKey
          )
            return;
          if (
            !(event.target instanceof Element) ||
            !event.target.closest(".rd-paper, .rd-cover-inside") ||
            event.target.closest(
              "a,button,input,textarea,select,[contenteditable]",
            )
          )
            return;
          drag = {
            id: event.pointerId,
            x: event.clientX,
            y: event.clientY,
            width: paper.getBoundingClientRect().width,
            step: 0,
            progress: 0,
          };
        },
        { signal },
      );

      window.addEventListener(
        "pointermove",
        (event) => {
          if (!drag || event.pointerId !== drag.id) return;
          const dx = event.clientX - drag.x;
          const dy = event.clientY - drag.y;
          if (!drag.step) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) < 8) return;
            if (Math.abs(dx) < Math.abs(dy) * 1.25) {
              clearDrag();
              return;
            }
            drag.step = dx < 0 ? 1 : -1;
            root.setPointerCapture(event.pointerId);
            liftPage(drag.step);
          }
          event.preventDefault();
          drag.progress = Math.min(
            1,
            Math.max(0, (-dx * drag.step) / drag.width),
          );
          if (leaf) leaf.style.transform = leafPose(drag.step, drag.progress);
        },
        { signal, passive: false },
      );

      window.addEventListener(
        "pointerup",
        (event) => {
          if (!drag || event.pointerId !== drag.id) return;
          const distance = (drag.x - event.clientX) * drag.step;
          landPage(distance >= Math.min(88, drag.width * 0.25));
        },
        { signal },
      );
      const cancelPointer = (event: PointerEvent) => {
        if (event.pointerId === drag?.id) landPage(false);
      };
      window.addEventListener("pointercancel", cancelPointer, { signal });
      root.addEventListener(
        "lostpointercapture",
        (event) => {
          if (event.target === root) cancelPointer(event);
        },
        { signal },
      );
      window.addEventListener("blur", clearDrag, { signal });
      motion.addEventListener("change", resetTilt, { signal });

      document.addEventListener(
        "astro:before-swap",
        () => {
          clearDrag();
          controller.abort();
          cancelAnimationFrame(pointerFrame);
          window.clearTimeout(focusTimer);
          window.clearTimeout(swapTimer);
          window.clearTimeout(turnTimer);
        },
        { once: true, signal },
      );
      showPage(0, false);
    });
}

mountRecordDesks();
document.addEventListener("astro:page-load", mountRecordDesks);
