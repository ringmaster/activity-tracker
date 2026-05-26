import helmetBattle from "./helmet-battle-sharp-solid-full.svg";
import hydra from "./hydra-sharp-solid-full.svg";
import box from "./box-sharp-solid-full.svg";
import shieldHalved from "./shield-halved-sharp-solid-full.svg";
import swords from "./swords-sharp-solid-full.svg";

function sized(svg: string, size: number): string {
  return svg.replace("<svg", `<svg width="${size}" height="${size}"`);
}

function unsized(svg: string): string {
  return svg.replace(/\s(width|height)="[^"]*"/g, "");
}

/** PC / NPC / object icons used in the Add Target form, where the user
 *  is explicitly choosing a *type* for a new combatant. */
export const TARGET_TYPE_ICONS = {
  pc: sized(helmetBattle, 24),
  npc: sized(hydra, 24),
  object: sized(box, 24),
};

export const TARGET_TYPE_ICONS_INLINE = {
  pc: unsized(helmetBattle),
  npc: unsized(hydra),
  object: unsized(box),
};

/** Allegiance icons used in the target-row indicator, where the question
 *  isn't "what type is this?" but "what should the current actor do with
 *  this combatant?" Shield = defend/don't attack; swords = attack.
 *  Objects are inert and just display the box. */
export const ALLEGIANCE_ICONS = {
  ally: unsized(shieldHalved),
  enemy: unsized(swords),
  object: unsized(box),
};
