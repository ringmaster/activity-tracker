export interface ActiveObligation {
  id: string;
  spell: string;
  cast_line: number;
  tgt: string[];
  expires?: { round: number };
  last_triggered: number | null;
}
