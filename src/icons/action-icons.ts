import cast from "./cast.svg";
import move from "./move.svg";
import closes from "./closes.svg";
import separates from "./separates.svg";
import distances from "./distances.svg";
import flies from "./flies.svg";
import flees from "./flees.svg";

/** Inject explicit width/height attributes onto an SVG string. */
function sized(svg: string, size: number): string {
  return svg.replace("<svg", `<svg width="${size}" height="${size}"`);
}

export const ACTION_ICONS = {
  cast: sized(cast, 20),
  move: sized(move, 20),
  closes: sized(closes, 20),
  separates: sized(separates, 20),
  distances: sized(distances, 20),
  flies: sized(flies, 20),
  flees: sized(flees, 20),
};
