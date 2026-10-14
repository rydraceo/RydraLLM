import { num, type Team, type TeamBarber } from "@/lib/barbers/data";

export type TeamInsight = { text: string; tone: "good" | "warn" | "info"; slug?: string };
const $ = (n: number) => `$${Math.round(n).toLocaleString("en-AU")}`;

/** Visits per year used for what-if maths: the last 12 months from visit history, else total appointments. */
export const yearVisits = (b: TeamBarber) => b.metrics?.visits12m || num(b.stats?.total_appts);

/** What +1 percentage point of rebook rate is worth per year for one barber (visits x 1% x average appointment). */
export const rebookPointValue = (b: TeamBarber) => yearVisits(b) * 0.01 * num(b.stats?.avg_appt_value);

export function teamInsights(team: Team): TeamInsight[] {
  const out: TeamInsight[] = []; const bs = team.barbers.filter((b) => b.stats);
  if (bs.length < 2) return out;
  const best = [...bs].sort((a, b) => num(b.stats!.rebook_rate) - num(a.stats!.rebook_rate))[0];
  const gain = bs.reduce((s, b) => s + Math.max(0, num(best.stats!.rebook_rate) - num(b.stats!.rebook_rate)) * 100 * rebookPointValue(b), 0);
  if (gain > 500) out.push({ tone: "info", slug: best.slug, text: `If everyone rebooked as well as ${best.name.split(" ")[0]} (${(num(best.stats!.rebook_rate) * 100).toFixed(1)}%), the team would earn about ${$(gain)} more over a period like your Fresha stats period. An estimate.` });
  const withM = team.barbers.filter((b) => b.metrics);
  if (withM.length) {
    const risk = [...withM].sort((a, b) => b.metrics!.atRiskValue - a.metrics!.atRiskValue)[0];
    if (risk.metrics!.atRiskValue > 0) out.push({ tone: "warn", slug: risk.slug, text: `${risk.name.split(" ")[0]} has the most clients drifting: ${risk.metrics!.atRiskCount} regulars worth about ${$(risk.metrics!.atRiskValue)} are running late.` });
    const fr = withM.filter((b) => b.metrics!.firstReturn !== null).sort((a, b) => b.metrics!.firstReturn! - a.metrics!.firstReturn!);
    if (fr.length >= 2) out.push({ tone: "good", slug: fr[0].slug, text: `${fr[0].name.split(" ")[0]} turns first-timers into regulars best: ${Math.round(fr[0].metrics!.firstReturn! * 100)}% come back, vs ${Math.round(fr[fr.length - 1].metrics!.firstReturn! * 100)}% for ${fr[fr.length - 1].name.split(" ")[0]}.` });
    const sec = withM.reduce((s, b) => s + b.metrics!.secondVisit, 0);
    if (sec > 0) out.push({ tone: "info", text: `${sec} one-visit clients are in the window where a text can still win a second visit.` });
  }
  const up = [...bs].sort((a, b) => num(b.stats!.upsell_rate) - num(a.stats!.upsell_rate))[0];
  const low = [...bs].sort((a, b) => num(a.stats!.upsell_rate) - num(b.stats!.upsell_rate))[0];
  if (up.id !== low.id && num(up.stats!.upsell_rate) > num(low.stats!.upsell_rate) * 1.5) out.push({ tone: "info", slug: up.slug, text: `${up.name.split(" ")[0]} upsells ${(num(up.stats!.upsell_rate) * 100).toFixed(1)}% of the time, ${low.name.split(" ")[0]} only ${(num(low.stats!.upsell_rate) * 100).toFixed(1)}%. A good pairing for a ride-along.` });
  return out.slice(0, 5);
}
