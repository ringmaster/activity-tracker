import type { Combatant, DamageComponent } from "../types/encounter";

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

/** Does any entry in `list` match the given damage type? Substring match is
 *  intentional so that bestiary-imported entries like "piercing from
 *  nonmagical attacks" still match a plain "piercing" component. The
 *  tradeoff is that magical-piercing also resolves as "resisted"; authors
 *  who care can override with a cleaner list on the combatant. */
function matchesType(list: string[] | undefined, type: string): boolean {
  if (!list || list.length === 0) return false;
  const t = type.toLowerCase();
  return list.some((entry) => entry.toLowerCase().includes(t));
}

/** Scale each component against the target's resistances / immunities /
 *  vulnerabilities and stamp a `mitigation` annotation on the affected
 *  components. Returns a new array; inputs are not mutated. Per 5e RAW the
 *  order is: immunities first (n -> 0), then resistance and vulnerability
 *  net out (both -> full), resistance only -> halved, vulnerability only
 *  -> doubled. */
export function applyDefenses(
  components: DamageComponent[],
  target: Pick<Combatant, "resistances" | "immunities" | "vulnerabilities">,
): DamageComponent[] {
  if (
    (!target.resistances || target.resistances.length === 0) &&
    (!target.immunities || target.immunities.length === 0) &&
    (!target.vulnerabilities || target.vulnerabilities.length === 0)
  ) {
    return components;
  }
  return components.map((c) => {
    if (matchesType(target.immunities, c.type)) {
      return { ...c, n: 0, mitigation: "immune" as const };
    }
    const resisted = matchesType(target.resistances, c.type);
    const vulnerable = matchesType(target.vulnerabilities, c.type);
    if (resisted && vulnerable) return c; // net out per RAW
    if (resisted) {
      return { ...c, n: Math.floor(c.n / 2), mitigation: "resisted" as const };
    }
    if (vulnerable) {
      return { ...c, n: c.n * 2, mitigation: "vulnerable" as const };
    }
    return c;
  });
}
