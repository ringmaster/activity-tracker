import helmetBattle from "./helmet-battle-sharp-solid-full.svg";
import hydra from "./hydra-sharp-solid-full.svg";
import box from "./box-sharp-solid-full.svg";

function sized(svg: string, size: number): string {
  return svg.replace("<svg", `<svg width="${size}" height="${size}"`);
}

function unsized(svg: string): string {
  return svg.replace(/\s(width|height)="[^"]*"/g, "");
}

export const TARGET_TYPE_ICONS = {
  pc: sized(helmetBattle, 24),
  npc: sized(hydra, 24),
  object: sized(box, 24),
};

/** Same icons sized for inline use (e.g. the target-row type indicator)
 *  where the surrounding text drives the dimensions via em-based CSS. */
export const TARGET_TYPE_ICONS_INLINE = {
  pc: unsized(helmetBattle),
  npc: unsized(hydra),
  object: unsized(box),
};
