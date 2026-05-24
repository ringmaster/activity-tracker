/** Svelte action that shifts an absolutely-positioned element so it stays
 *  within the viewport. Use on dropdowns/menus that anchor to a trigger and
 *  could otherwise overflow the right or bottom edge (e.g. when the trigger
 *  sits near the iPad Mini width's right margin).
 *
 *  Applies as a CSS transform so the original `position: absolute; left/top`
 *  declarations stay intact. Re-measures on window resize and via a
 *  ResizeObserver on the node (catches keyboard-popup viewport changes
 *  too). */
export function constrainToViewport(node: HTMLElement) {
  const MARGIN = 8;
  let raf = 0;

  function apply() {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      // Reset prior adjustment so we measure the natural position.
      node.style.transform = "";

      const rect = node.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      let shiftX = 0;
      if (rect.right > vw - MARGIN) {
        shiftX = (vw - MARGIN) - rect.right;
      }
      // After a right-shift, check left edge too; right-shift can pull a
      // wide menu off the left if both edges overflow.
      if (rect.left + shiftX < MARGIN) {
        shiftX = MARGIN - rect.left;
      }

      let shiftY = 0;
      if (rect.bottom > vh - MARGIN) {
        shiftY = (vh - MARGIN) - rect.bottom;
      }
      if (rect.top + shiftY < MARGIN) {
        shiftY = MARGIN - rect.top;
      }

      if (shiftX !== 0 || shiftY !== 0) {
        node.style.transform = `translate(${shiftX}px, ${shiftY}px)`;
      }
    });
  }

  apply();

  const onResize = () => apply();
  window.addEventListener("resize", onResize);

  // Catch DOM/content size changes after mount (the menu's children may
  // still be hydrating when the action first runs).
  const observer = new ResizeObserver(apply);
  observer.observe(node);

  return {
    destroy() {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      observer.disconnect();
    },
  };
}
