import type { TransitionBeforeSwapEvent } from "astro:transitions/client";

let navigated = false;
export const hasClientNavigation = () => navigated;

// Prepare collapsed CV panels before Astro restores the destination's scroll/anchor.
// This also covers a first visit to the CV from an article, before cv.ts has executed.
document.addEventListener("astro:before-swap", (event) => {
  const { newDocument, to } = event as TransitionBeforeSwapEvent;
  const pages = [
    ...newDocument.querySelectorAll<HTMLElement>("[data-file-page]"),
  ];
  if (!pages.length) return;
  let hash = to.hash.slice(1);
  try {
    hash = decodeURIComponent(hash);
  } catch {
    /* Keep malformed fragments inert. */
  }
  const selected = pages.find((page) => page.id === hash) ?? pages[0];
  pages.forEach((page) => {
    page.hidden = page !== selected;
  });
  const target = newDocument.getElementById(hash);
  if (target?.tagName === "DETAILS") target.setAttribute("open", "");
});
document.addEventListener("astro:after-swap", () => {
  navigated = true;
});
