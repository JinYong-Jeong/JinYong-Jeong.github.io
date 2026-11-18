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
      const coverFront = root.querySelector<HTMLElement>(".rd-cover-front")!;
      const pages = [...root.querySelectorAll<HTMLElement>("[data-book-page]")];
      const tabs = [
        ...root.querySelectorAll<HTMLButtonElement>("[data-book-tab]"),
      ];
      const status = root.querySelector<HTMLElement>("[data-book-status]")!;
      const number = root.querySelector<HTMLElement>("[data-book-number]")!;
      const hint = root.querySelector<HTMLElement>("[data-book-hint]")!;
      const controller = new AbortController();
      const { signal } = controller;
      let index = 0;
      let opened = false;
      let turning = false;
      let queuedIndex: number | null = null;
      let opener: HTMLElement | null = null;
      let focusTimer = 0;
      let swapTimer = 0;
      let turnTimer = 0;
      let pointerFrame = 0;

      openButton.hidden = false;

      function showPage(next: number, announce = true) {
        index = (next + pages.length) % pages.length;
        pages.forEach((page, i) => {
          page.hidden = i !== index;
        });
        tabs.forEach((tab, i) => {
          tab.setAttribute("aria-selected", String(i === index));
          tab.tabIndex = i === index ? 0 : -1;
        });
        number.textContent = String(index + 1).padStart(2, "0");
        if (announce)
          status.textContent = `${index + 1} / ${pages.length}. ${pages[index].querySelector(".rd-page-title")?.textContent}`;
      }

      function resetTilt() {
        root.style.setProperty("--rd-rx", "0deg");
        root.style.setProperty("--rd-ry", "0deg");
      }

      function openBook(from?: HTMLElement | null) {
        if (opened) {
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
        hint.textContent = "책갈피를 고르거나, 페이지를 넘겨보세요.";
        resetTilt();
        window.clearTimeout(focusTimer);
        focusTimer = window.setTimeout(
          () => {
            if (!opened || !root.isConnected) return;
            pages[index]
              .querySelector<HTMLElement>("h3")
              ?.focus({ preventScroll: true });
            status.textContent = `기록집을 펼쳤습니다. ${index + 1} / ${pages.length}. ${pages[index].querySelector(".rd-page-title")?.textContent}`;
          },
          motion.matches ? 0 : 1050,
        );
      }

      function closeBook() {
        if (!opened) return;
        opened = false;
        window.clearTimeout(focusTimer);
        window.clearTimeout(swapTimer);
        window.clearTimeout(turnTimer);
        turning = false;
        queuedIndex = null;
        delete root.dataset.turning;
        root.dataset.open = "false";
        openButton.setAttribute("aria-expanded", "false");
        closeButton.hidden = true;
        spread.inert = true;
        spread.setAttribute("aria-hidden", "true");
        hint.textContent = "책 한 권에 담긴 몇 가지 모습";
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

      function turnTo(next: number) {
        const target = (next + pages.length) % pages.length;
        if (!opened || target === index) return;
        window.clearTimeout(focusTimer);
        if (turning) {
          queuedIndex = target;
          return;
        }
        if (motion.matches) {
          showPage(target);
          return;
        }
        turning = true;
        root.dataset.turning = target > index ? "next" : "previous";
        swapTimer = window.setTimeout(() => showPage(target), 220);
        turnTimer = window.setTimeout(() => {
          delete root.dataset.turning;
          turning = false;
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
        ?.addEventListener("click", () => turnTo(index - 1), { signal });
      root
        .querySelector("[data-book-next]")
        ?.addEventListener("click", () => turnTo(index + 1), { signal });
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
                : (index +
                    (event.key === "ArrowRight" ? 1 : -1) +
                    pages.length) %
                  pages.length;
          turnTo(target);
          if (onTab) tabs[target].focus({ preventScroll: true });
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
          root.scrollIntoView({
            behavior: motion.matches ? "instant" : "smooth",
            block: "center",
          });
          openBook(event.detail?.opener);
        }) as EventListener,
        { signal },
      );

      root.addEventListener(
        "pointermove",
        (event) => {
          if (
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

      let touchStart: { x: number; y: number; id: number } | null = null;
      spread.addEventListener(
        "pointerdown",
        (event) => {
          if (
            event.pointerType !== "touch" ||
            !opened ||
            (event.target instanceof Element &&
              event.target.closest("button,a"))
          )
            return;
          touchStart = {
            x: event.clientX,
            y: event.clientY,
            id: event.pointerId,
          };
        },
        { signal, passive: true },
      );
      spread.addEventListener(
        "pointerup",
        (event) => {
          if (!touchStart || touchStart.id !== event.pointerId) return;
          const x = event.clientX - touchStart.x;
          const y = event.clientY - touchStart.y;
          touchStart = null;
          if (Math.abs(x) > 48 && Math.abs(y) < 40)
            turnTo(index + (x < 0 ? 1 : -1));
        },
        { signal, passive: true },
      );
      spread.addEventListener(
        "pointercancel",
        () => {
          touchStart = null;
        },
        { signal },
      );
      motion.addEventListener("change", resetTilt, { signal });

      document.addEventListener(
        "astro:before-swap",
        () => {
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
