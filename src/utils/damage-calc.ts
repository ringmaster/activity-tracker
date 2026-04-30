import type { DamageComponent } from "../types/encounter";

/** Sum total damage from components. */
export function totalDamage(components: DamageComponent[]): number {
  return components.reduce((sum, c) => sum + c.n, 0);
}

/** Apply hit outcome to base damage. */
export function applyOutcome(
  baseDmg: DamageComponent[],
  outcome: "full" | "half" | "zero",
): DamageComponent[] {
  if (outcome === "zero") return [];
  if (outcome === "full") return baseDmg;
  return baseDmg.map((c) => ({ ...c, n: Math.floor(c.n / 2) }));
}

/** Compute concentration save DC from damage taken. */
export function concentrationDC(damage: number): number {
  return Math.max(10, Math.floor(damage / 2));
}
