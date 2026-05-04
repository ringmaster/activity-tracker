import above from "./above.svg";
import beside from "./beside.svg";
import inside from "./inside.svg";
import under from "./under.svg";

function sized(svg: string, size: number): string {
  return svg.replace("<svg", `<svg width="${size}" height="${size}"`);
}

export const PREPOSITION_ICONS: Record<string, string> = {
  above: sized(above, 20),
  beside: sized(beside, 20),
  inside: sized(inside, 20),
  under: sized(under, 20),
};

/** The four built-in prepositions with icons. Custom ones use a text label. */
export const BUILTIN_PREPOSITIONS = ["above", "beside", "inside", "under"];
