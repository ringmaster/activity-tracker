import helmet from "./helmet.svg";
import orcHead from "./orc-head.svg";
import pillar from "./pillar.svg";

function sized(svg: string, size: number): string {
  return svg.replace("<svg", `<svg width="${size}" height="${size}"`);
}

export const TARGET_TYPE_ICONS = {
  pc: sized(helmet, 24),
  npc: sized(orcHead, 24),
  object: sized(pillar, 24),
};
