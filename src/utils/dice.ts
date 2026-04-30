/** Roll 1d20 + modifier. */
export function rollInitiative(modifier: number): number {
  return Math.floor(Math.random() * 20) + 1 + modifier;
}
