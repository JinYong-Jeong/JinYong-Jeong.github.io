// Progressive enhancement: all CV content is present in the server-rendered HTML.
import { hasClientNavigation } from "./public-navigation";

let cleanupCV: (() => void) | undefined;
function mountCV() {
  const root = document.querySelector<HTMLElement>(".cv-main");
  if (!root || root.dataset.cvReady) return;
  root.dataset.cvReady = "true";
  const controller = new AbortController();
  const { signal } = controller;
  let sectionFrame = 0;
  cleanupCV = () => {
    controller.abort();
    cancelAnimationFrame(sectionFrame);
    delete root.dataset.cvReady;
  };
  const bookOpener = document.querySelector<HTMLButtonElement>(
    "[data-open-record-desk]",
  );
  if (bookOpener) {
    bookOpener.hidden = false;
    bookOpener.addEventListener(
      "click",
      () => {
        window.dispatchEvent(
          new CustomEvent("cv:open-book", { detail: { opener: bookOpener } }),
        );
      },
      { signal },
    );
  }

  const sections = Array.from(
    document.querySelectorAll<HTMLElement>("[data-cv-section]"),
  );
  const links = Array.from(
    document.querySelectorAll<HTMLAnchorElement>("[data-section-link]"),
  );
  let scheduled = false;
  const updateSection = () => {
    scheduled = false;
    let active: string | undefined = sections[0]?.id;
    for (const section of sections)
      if (section.getBoundingClientRect().top <= 180) active = section.id;
    if (
      window.innerHeight + window.scrollY >=
      document.documentElement.scrollHeight - 20
    )
      active = sections.at(-1)?.id;
    links.forEach((link) => {
      if (link.dataset.sectionLink === active)
        link.setAttribute("aria-current", "location");
      else link.removeAttribute("aria-current");
    });
  };
  window.addEventListener(
    "scroll",
    () => {
      if (!scheduled) {
        scheduled = true;
        sectionFrame = requestAnimationFrame(updateSection);
      }
    },
    { passive: true, signal },
  );
  updateSection();
  const fileTabs = Array.from(
    document.querySelectorAll<HTMLButtonElement>("[data-file]"),
  );
  const filePages = Array.from(
    document.querySelectorAll<HTMLElement>("[data-file-page]"),
  );
  const fileList = document.querySelector<HTMLElement>(".file-tabs");

  function showFile(id: string) {
    fileTabs.forEach((tab) => {
      const active = tab.dataset.file === id;
      tab.setAttribute("aria-selected", String(active));
      tab.tabIndex = active ? 0 : -1;
    });
    filePages.forEach((page) => {
      page.hidden = page.id !== id;
    });
  }

  function revealLinkedRecord(scroll = true) {
    const target = document.getElementById(location.hash.slice(1));
    if (target?.matches("[data-file-page]")) {
      showFile(target.id);
      if (scroll) target.scrollIntoView({ block: "start" });
    } else if (target instanceof HTMLDetailsElement) {
      target.open = true;
    }
  }
  if (fileList && fileTabs.length) {
    fileList.setAttribute("role", "tablist");
    fileList.hidden = false;
    fileTabs.forEach((tab, index) => {
      const id = tab.dataset.file!;
      const page = document.getElementById(id)!;
      tab.setAttribute("role", "tab");
      tab.setAttribute("aria-controls", id);
      page.setAttribute("role", "tabpanel");
      page.setAttribute("aria-labelledby", tab.id);
      page.tabIndex = 0;
      tab.addEventListener(
        "click",
        () => {
          showFile(id);
          if (filePages.some((file) => `#${file.id}` === location.hash)) {
            history.replaceState(history.state, "", `#${id}`);
          }
        },
        { signal },
      );
      tab.addEventListener(
        "keydown",
        (event) => {
          const keys: Record<string, number> = {
            ArrowLeft: (index - 1 + fileTabs.length) % fileTabs.length,
            ArrowRight: (index + 1) % fileTabs.length,
            Home: 0,
            End: fileTabs.length - 1,
          };
          const next = keys[event.key];
          if (next === undefined) return;
          event.preventDefault();
          fileTabs[next].focus();
          fileTabs[next].click();
        },
        { signal },
      );
    });
    showFile(fileTabs[0].dataset.file!);
    revealLinkedRecord(!hasClientNavigation());
    window.addEventListener("hashchange", () => revealLinkedRecord(), {
      signal,
    });
  }

  document
    .querySelectorAll<HTMLButtonElement>("[data-ask-record]")
    .forEach((opener) => {
      opener.addEventListener(
        "click",
        () => {
          window.dispatchEvent(
            new CustomEvent("cv:ask", {
              detail: {
                topic: opener.dataset.askRecord,
                question: opener.dataset.question,
                opener,
              },
            }),
          );
        },
        { signal },
      );
    });
  const copy = document.querySelector<HTMLButtonElement>("[data-copy-email]");
  if (copy && navigator.clipboard) {
    copy.hidden = false;
    copy.addEventListener(
      "click",
      async () => {
        const status = document.querySelector("[data-copy-status]");
        try {
          await navigator.clipboard.writeText(copy.dataset.copyEmail ?? "");
          if (status) status.textContent = "이메일 주소를 복사했습니다.";
        } catch {
          if (status) status.textContent = "주소를 선택해 직접 복사해 주세요.";
        }
      },
      { signal },
    );
  }
  const printButton =
    document.querySelector<HTMLButtonElement>("[data-print-cv]");
  if (printButton) {
    printButton.hidden = false;
    printButton.addEventListener("click", () => window.print(), { signal });
  }
  // Expand disclosures for printing, then restore the visitor's reading state.
  let openBeforePrint: HTMLDetailsElement[] = [];
  window.addEventListener(
    "beforeprint",
    () => {
      const details = Array.from(
        document.querySelectorAll<HTMLDetailsElement>(".cv-main details"),
      );
      openBeforePrint = details.filter((detail) => detail.open);
      details.forEach((detail) => {
        detail.open = true;
      });
    },
    { signal },
  );
  window.addEventListener(
    "afterprint",
    () => {
      document
        .querySelectorAll<HTMLDetailsElement>(".cv-main details")
        .forEach((detail) => {
          detail.open = openBeforePrint.includes(detail);
        });
    },
    { signal },
  );
}
mountCV();
document.addEventListener("astro:page-load", mountCV);
document.addEventListener("astro:before-swap", () => {
  cleanupCV?.();
  cleanupCV = undefined;
});
