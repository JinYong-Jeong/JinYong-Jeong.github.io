// Progressive enhancement: all CV content is present in the server-rendered HTML.
const bookOpener = document.querySelector<HTMLButtonElement>(
  "[data-open-record-desk]",
);
if (bookOpener) {
  bookOpener.hidden = false;
  bookOpener.addEventListener("click", () => {
    window.dispatchEvent(
      new CustomEvent("cv:open-book", { detail: { opener: bookOpener } }),
    );
  });
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
      requestAnimationFrame(updateSection);
    }
  },
  { passive: true },
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

function revealLinkedRecord() {
  const target = document.getElementById(location.hash.slice(1));
  if (target?.matches("[data-file-page]")) {
    showFile(target.id);
    target.scrollIntoView({ block: "start" });
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
    tab.addEventListener("click", () => {
      showFile(id);
      if (filePages.some((file) => `#${file.id}` === location.hash)) {
        history.replaceState(history.state, "", `#${id}`);
      }
    });
    tab.addEventListener("keydown", (event) => {
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
    });
  });
  showFile(fileTabs[0].dataset.file!);
  revealLinkedRecord();
  window.addEventListener("hashchange", revealLinkedRecord);
}

document
  .querySelectorAll<HTMLButtonElement>("[data-ask-record]")
  .forEach((opener) => {
    opener.addEventListener("click", () => {
      window.dispatchEvent(
        new CustomEvent("cv:ask", {
          detail: {
            topic: opener.dataset.askRecord,
            question: opener.dataset.question,
            opener,
          },
        }),
      );
    });
  });
const copy = document.querySelector<HTMLButtonElement>("[data-copy-email]");
if (copy && navigator.clipboard) {
  copy.hidden = false;
  copy.addEventListener("click", async () => {
    const status = document.querySelector("[data-copy-status]");
    try {
      await navigator.clipboard.writeText(copy.dataset.copyEmail ?? "");
      if (status) status.textContent = "이메일 주소를 복사했습니다.";
    } catch {
      if (status) status.textContent = "주소를 선택해 직접 복사해 주세요.";
    }
  });
}
const printButton =
  document.querySelector<HTMLButtonElement>("[data-print-cv]");
if (printButton) {
  printButton.hidden = false;
  printButton.addEventListener("click", () => window.print());
}
// Expand disclosures for printing, then restore the visitor's reading state.
let openBeforePrint: HTMLDetailsElement[] = [];
window.addEventListener("beforeprint", () => {
  const details = Array.from(
    document.querySelectorAll<HTMLDetailsElement>(".cv-main details"),
  );
  openBeforePrint = details.filter((detail) => detail.open);
  details.forEach((detail) => {
    detail.open = true;
  });
});
window.addEventListener("afterprint", () => {
  document
    .querySelectorAll<HTMLDetailsElement>(".cv-main details")
    .forEach((detail) => {
      detail.open = openBeforePrint.includes(detail);
    });
});
export {};
