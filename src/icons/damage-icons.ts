import acid from "./acid.svg";
import bludgeoning from "./bludgeoning.svg";
import cold from "./cold.svg";
import fire from "./fire.svg";
import force from "./force.svg";
import lightning from "./lightning.svg";
import necrotic from "./necrotic.svg";
import piercing from "./piercing.svg";
import poison from "./poison.svg";
import psychic from "./psychic.svg";
import radiant from "./radiant.svg";
import slashing from "./slashing.svg";
import thunder from "./thunder.svg";

export const DAMAGE_ICONS: Record<string, string> = {
  acid,
  bludgeoning,
  cold,
  fire,
  force,
  lightning,
  necrotic,
  piercing,
  poison,
  psychic,
  radiant,
  slashing,
  thunder,
};

export const DAMAGE_TYPES = Object.keys(DAMAGE_ICONS);

/** Inject explicit width/height attributes onto an SVG string. */
export function sizeSvg(svg: string, size: number): string {
  return svg.replace("<svg", `<svg width="${size}" height="${size}"`);
}

export function getDamageIcon(type: string, size = 20): string | null {
  const raw = DAMAGE_ICONS[type.toLowerCase()];
  return raw ? sizeSvg(raw, size) : null;
}
