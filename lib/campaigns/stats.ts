// Campaign measurement: rebook rates, lift against a held-out control group, and A/B winner confidence.
// Pure functions, no imports.

export type Member = { customer_id: string; variant: string; status: string; sent_at: string | null };
export type Rebook = (customerId: string) => boolean;

function normCdf(z: number): number {
  // Abramowitz & Stegun 7.1.26
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
}

export function twoProportion(n1: number, r1: number, n2: number, r2: number) {
  const p1 = n1 ? r1 / n1 : 0, p2 = n2 ? r2 / n2 : 0;
  const pool = n1 + n2 ? (r1 + r2) / (n1 + n2) : 0;
  const se = Math.sqrt(pool * (1 - pool) * (1 / Math.max(n1, 1) + 1 / Math.max(n2, 1)));
  const z = se > 0 ? (p1 - p2) / se : 0;
  return { p1, p2, diff: p1 - p2, z, pValue: 2 * (1 - normCdf(Math.abs(z))), confidenceAWins: normCdf(z) };
}

export type CampaignResults = {
  sent: number; control: number; rebookedSent: number; rebookedControl: number;
  rateSent: number; rateControl: number | null; lift: number | null; relLift: number | null; pValue: number | null; significant: boolean;
  byVariant: { variant: string; n: number; rebooked: number; rate: number }[];
  winner: { variant: string; confidence: number } | null;
  followupIds: string[];
};

export function computeResults(members: Member[], didRebook: Rebook): CampaignResults {
  const sent = members.filter((m) => m.status === "sent");
  const control = members.filter((m) => m.status === "holdout");
  const rs = sent.filter((m) => didRebook(m.customer_id)).length;
  const rc = control.filter((m) => didRebook(m.customer_id)).length;
  const t = control.length ? twoProportion(sent.length, rs, control.length, rc) : null;
  const variants = [...new Set(sent.map((m) => m.variant))].sort();
  const byVariant = variants.map((v) => { const g = sent.filter((m) => m.variant === v); const r = g.filter((m) => didRebook(m.customer_id)).length; return { variant: v, n: g.length, rebooked: r, rate: g.length ? r / g.length : 0 }; });
  let winner: CampaignResults["winner"] = null;
  if (byVariant.length >= 2) {
    const [a, b] = [...byVariant].sort((x, y) => y.rate - x.rate);
    if (a.n >= 10 && b.n >= 10) winner = { variant: a.variant, confidence: twoProportion(a.n, a.rebooked, b.n, b.rebooked).confidenceAWins };
  }
  return {
    sent: sent.length, control: control.length, rebookedSent: rs, rebookedControl: rc,
    rateSent: sent.length ? rs / sent.length : 0, rateControl: control.length ? rc / control.length : null,
    lift: t ? t.diff : null, relLift: t && t.p2 > 0 ? t.diff / t.p2 : null, pValue: t ? t.pValue : null, significant: !!t && t.pValue < 0.1 && sent.length >= 20 && control.length >= 5,
    byVariant, winner,
    followupIds: sent.filter((m) => !didRebook(m.customer_id)).map((m) => m.customer_id).slice(0, 500),
  };
}
