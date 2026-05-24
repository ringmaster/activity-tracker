/** Roll 1d20 + modifier. */
export function rollInitiative(modifier: number): number {
  return Math.floor(Math.random() * 20) + 1 + modifier;
}

/** Parse and roll a dice expression like "2d6+5", "1d8", "5d6+2d4-1",
 *  or a bare integer "7". Whitespace is ignored. Returns null if the
 *  expression doesn't parse (so callers can no-op cleanly). */
export function rollDiceExpression(expr: string): number | null {
  if (!expr) return null;
  const cleaned = expr.replace(/\s+/g, "");
  if (!cleaned) return null;
  // Tokenize into signed terms: leading sign optional, then digits and
  // optionally `dN` where N is digits. Matches forms like "2d6", "1d8+3",
  // "-2", "+5d10-1d4".
  const termRe = /([+-]?)(\d+)(?:d(\d+))?/g;
  let total = 0;
  let matched = false;
  let consumed = 0;
  let m: RegExpExecArray | null;
  while ((m = termRe.exec(cleaned)) !== null) {
    // Reject anything not at the current consumed offset (guards against
    // junk between terms, e.g. "2d6foo3").
    if (m.index !== consumed) return null;
    matched = true;
    const sign = m[1] === "-" ? -1 : 1;
    const a = parseInt(m[2], 10);
    const sides = m[3] ? parseInt(m[3], 10) : 0;
    if (sides > 0) {
      // a dice of sides each
      let roll = 0;
      for (let i = 0; i < a; i++) {
        roll += Math.floor(Math.random() * sides) + 1;
      }
      total += sign * roll;
    } else {
      // bare integer modifier
      total += sign * a;
    }
    consumed = m.index + m[0].length;
  }
  if (!matched || consumed !== cleaned.length) return null;
  return total;
}
