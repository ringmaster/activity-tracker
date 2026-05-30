import closes from "./closes.svg";
import separates from "./separates.svg";
import distances from "./distances.svg";
import flies from "./flies.svg";
import flees from "./flees.svg";
import swords from "./swords-sharp-solid-full.svg";
import bookSparkles from "./book-sparkles-sharp-solid-full.svg";
import heartCirclePlus from "./sharp-solid-heart-circle-plus-full.svg";
import personRunning from "./person-running-sharp-solid-full.svg";
import pagePen from "./sharp-solid-page-pen-full.svg";
import shieldHalved from "./shield-halved-sharp-solid-full.svg";
import skull from "./skull-solid-full.svg";
import puzzlePiece from "./puzzle-piece-simple-sharp-solid-full.svg";
import plus from "./plus-sharp-solid-full.svg";
import circleCheck from "./circle-check-solid-full.svg";
import circleInfo from "./circle-info-sharp-solid-full.svg";
import trash from "./trash-solid-full.svg";

/** Inject explicit width/height attributes onto an SVG string. Used for
 *  fixed-pixel icons on bar buttons. Icons that should track font-size
 *  (e.g. the inline AC shield) skip this and rely on CSS sizing instead. */
function sized(svg: string, size: number): string {
  return svg.replace("<svg", `<svg width="${size}" height="${size}"`);
}

/** Strip any explicit width/height so CSS can size via em / line-height
 *  without losing to inline attributes. */
function unsized(svg: string): string {
  return svg.replace(/\s(width|height)="[^"]*"/g, "");
}

export const ACTION_ICONS = {
  // Bar-button icons. DefaultBar's buttons and the "active preset" cancel
  // button on the action bar both render these so the visual continuity
  // reads as "the button stayed put, just highlighted."
  attack: sized(swords, 20),
  cast: sized(bookSparkles, 20),
  heal: sized(heartCirclePlus, 20),
  move: sized(personRunning, 20),
  note: sized(pagePen, 20),

  // Preposition / movement-verb glyphs used inside the move dropdown.
  closes: sized(closes, 20),
  separates: sized(separates, 20),
  distances: sized(distances, 20),
  flies: sized(flies, 20),
  flees: sized(flees, 20),

  // Bar-button glyphs that replace plain text/unicode. Sized 20px to
  // match the rest of the bar icons.
  puzzlePiece: sized(puzzlePiece, 20),
  plus: sized(plus, 20),

  // Banner action-button glyphs (Apply / spell info / Dismiss). Sized 16px
  // so they sit beside the button label without overpowering it.
  circleCheck: sized(circleCheck, 16),
  circleInfo: sized(circleInfo, 16),
  trash: sized(trash, 16),

  // Inline icons that size with surrounding text. CSS sets width/height
  // in em so they track font-size and line-height naturally.
  shield: unsized(shieldHalved),
  skull: unsized(skull),
  heart: unsized(heartCirclePlus),
};
