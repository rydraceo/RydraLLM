"use client";
// Import Fresha appointments so every visit is tied to a barber. Parsing happens in the browser; the server matches
// clients (phone, then email, then exact name) and barbers (name), skips duplicates, and rebuilds who-sees-whom.
import { useMemo, useState } from "react";
import { aiFetch } from "@/lib/ai/client";
import { parseCsv, norm } from "@/lib/wallet/csv";
import { Box, Btn, C, Field, Note, inputStyle } from "@/app/components/wallet/ui";

const FIELDS: { key: string; label: string; required?: boolean; synonyms: string[] }[] = [
  { key: "date", label: "Date", required: true, synonyms: ["scheduled date", "appointment date", "date", "start date", "start time", "scheduled", "sale date"] },
  { key: "team_member", label: "Team member / barber", required: true, synonyms: ["team member", "staff", "staff member", "employee", "barber", "stylist", "provider"] },
  { key: "client", label: "Client name", required: true, synonyms: ["client", "client name", "customer", "customer name"] },
  { key: "phone", label: "Client mobile", synonyms: ["mobile number", "client mobile", "mobile", "phone", "client phone", "phone number"] },
  { key: "email", label: "Client email", synonyms: ["email", "client email", "customer email"] },
  { key: "service", label: "Service", synonyms: ["service", "services", "service name", "item"] },
  { key: "price", label: "Price", synonyms: ["price", "total", "sale price", "amount", "value", "total appt value", "gross total", "net total"] },
  { key: "status", label: "Status", synonyms: ["status", "appointment status"] },
  { key: "ref", label: "Reference / ID", synonyms: ["ref", "ref #", "ref no", "appointment ref", "booking ref", "reference", "appointment id", "id"] },
];

export default function VisitImport({ onDone, stats }: { onDone: () => void; stats?: { visits: number; links: number; level: string } }) {
  const [file, setFile] = useState<string>(""); const [rows, setRows] = useState<string[][]>([]); const [map, setMap] = useState<Record<string, number>>({});
  const [phase, setPhase] = useState<"idle" | "checking" | "checked" | "importing" | "done">("idle"); const [prog, setProg] = useState(0);
  const [summary, setSummary] = useState<any>(null); const [err, setErr] = useState("");
  const header = rows[0] ?? []; const body = rows.slice(1);

  function load(f: File) {
    setErr(""); setSummary(null); setPhase("idle"); setFile(f.name);
    const r = new FileReader();
    r.onload = () => {
      const parsed = parseCsv(String(r.result ?? ""));
      if (parsed.length < 2) { setErr("That file looks empty."); return; }
      const h = parsed[0].map((x) => norm(x)); const m: Record<string, number> = {};
      for (const f of FIELDS) { const i = h.findIndex((x) => f.synonyms.includes(x)); if (i >= 0) m[f.key] = i; }
      setRows(parsed); setMap(m);
    };
    r.readAsText(f);
  }
  const missing = FIELDS.filter((f) => f.required && map[f.key] === undefined);
  const mapped = (row: string[]) => Object.fromEntries(FIELDS.map((f) => [f.key, map[f.key] !== undefined ? row[map[f.key]] ?? "" : ""]));
  const preview = useMemo(() => body.slice(0, 4).map(mapped), [rows, map]); // eslint-disable-line

  async function send(dry: boolean) {
    setErr(""); setPhase(dry ? "checking" : "importing"); setProg(0);
    const agg: any = { received: 0, usable: 0, matched_clients: 0, unmatched_clients: 0, bad_dates: 0, unmatched_barbers: {} as Record<string, number>, written: 0, duplicates_skipped: 0, from: null as string | null, to: null as string | null };
    try {
      for (let i = 0; i < body.length; i += 1000) {
        const r = await aiFetch("/api/team/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "import", dry_run: dry, rows: body.slice(i, i + 1000).map(mapped) }) });
        const j = await r.json(); if (!r.ok) throw new Error(j.error || "Import failed");
        for (const k of ["received", "usable", "matched_clients", "unmatched_clients", "bad_dates", "written", "duplicates_skipped"]) agg[k] += j[k] ?? 0;
        Object.entries(j.unmatched_barbers ?? {}).forEach(([k, v]) => (agg.unmatched_barbers[k] = (agg.unmatched_barbers[k] ?? 0) + Number(v)));
        if (j.from && (!agg.from || j.from < agg.from)) agg.from = j.from; if (j.to && (!agg.to || j.to > agg.to)) agg.to = j.to;
        setProg(Math.min(100, Math.round(((i + 1000) / body.length) * 100)));
      }
      if (!dry) { const r = await aiFetch("/api/team/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "refresh" }) }); const j = await r.json(); if (!r.ok) throw new Error(j.error); agg.primaries = j.primaries; onDone(); }
      setSummary(agg); setPhase(dry ? "checked" : "done");
    } catch (e: any) { setErr(e?.message || "Import failed"); setPhase(dry ? "idle" : "checked"); }
  }

  return (
    <Box title="Client history by barber" sub="Links every visit to the barber who did it. This powers client books, retention, trends and the coach.">
      {stats && <div className="grid grid-cols-3 gap-2 mb-4 text-center">{[["Visits imported", stats.visits.toLocaleString()], ["Client-barber links", stats.links.toLocaleString()], ["Data level", stats.level === "visits" ? "Full history" : stats.level === "assignments" ? "Books only" : "Stats only"]].map(([l, v]) => <div key={l} className="rounded-lg py-2.5" style={{ background: C.CARD2 }}><div className="text-[10px]" style={{ color: C.MUTED }}>{l}</div><div className="text-lg font-bold">{v}</div></div>)}</div>}
      <ol className="text-xs space-y-1 mb-4 list-decimal pl-4" style={{ color: "#94A3B8" }}>
        <li>In Fresha go to <b>Sales &gt; Appointments</b>, pick the widest date range you can (a year or more is ideal) and choose <b>Export &gt; CSV</b>.</li>
        <li>Drop the file below. Nothing is saved until you press Import, and re-importing the same file never double-counts.</li>
      </ol>
      <label className="block rounded-xl border-2 border-dashed p-6 text-center cursor-pointer hover:border-[#7C3AED]" style={{ borderColor: C.BDR }}>
        <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => e.target.files?.[0] && load(e.target.files[0])} />
        <div className="text-sm font-semibold">{file || "Choose the Fresha appointments CSV"}</div><div className="text-[11px] mt-1" style={{ color: C.MUTED }}>{rows.length ? `${body.length.toLocaleString()} rows found` : "or drag it here"}</div>
      </label>
      {err && <div className="mt-3"><Note tone="bad">{err}</Note></div>}
      {rows.length > 1 && (
        <div className="mt-4 space-y-3">
          <div className="text-[11px]" style={{ color: C.MUTED }}>Check each column is matched correctly:</div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">{FIELDS.map((f) => <Field key={f.key} label={`${f.label}${f.required ? " *" : ""}`}><select value={map[f.key] ?? -1} onChange={(e) => setMap((m) => { const n = { ...m }; const v = Number(e.target.value); if (v < 0) delete n[f.key]; else n[f.key] = v; return n; })} className="w-full rounded-lg px-2 py-1.5 text-xs outline-none text-white" style={inputStyle}><option value={-1}>(not in file)</option>{header.map((h, i) => <option key={i} value={i}>{h}</option>)}</select></Field>)}</div>
          {missing.length > 0 ? <Note tone="warn">Match these columns first: {missing.map((m) => m.label).join(", ")}.</Note> : (
            <div className="overflow-x-auto rounded-lg" style={{ background: C.CARD2 }}><table className="w-full text-[11px]"><thead><tr>{["Date", "Barber", "Client", "Service", "Price", "Status"].map((h) => <th key={h} className="text-left px-2 py-1.5" style={{ color: C.MUTED }}>{h}</th>)}</tr></thead>
              <tbody>{preview.map((r: any, i) => <tr key={i} className="border-t" style={{ borderColor: C.BDR }}>{[r.date, r.team_member, r.client, r.service, r.price, r.status].map((v, j) => <td key={j} className="px-2 py-1.5 text-slate-300 truncate max-w-[160px]">{v}</td>)}</tr>)}</tbody></table></div>
          )}
          <div className="flex gap-2 items-center">
            <Btn kind="ghost" disabled={!!missing.length || phase === "checking" || phase === "importing"} onClick={() => send(true)}>{phase === "checking" ? `Checking... ${prog}%` : "Check matches first"}</Btn>
            <Btn disabled={!!missing.length || phase !== "checked"} onClick={() => send(false)}>{phase === "importing" ? `Importing... ${prog}%` : "Import"}</Btn>
          </div>
        </div>
      )}
      {summary && (
        <div className="mt-4 space-y-2">
          <Note tone={phase === "done" ? "good" : "info"}>
            {phase === "done" ? <>Imported <b>{summary.written.toLocaleString()}</b> new visits{summary.duplicates_skipped ? ` (${summary.duplicates_skipped.toLocaleString()} were already there)` : ""}. Client books are rebuilt.</> : <>Ready to import <b>{summary.usable.toLocaleString()}</b> of {summary.received.toLocaleString()} rows{summary.from ? ` from ${summary.from} to ${summary.to}` : ""}.</>}
            {" "}Clients matched: {summary.matched_clients.toLocaleString()}; not matched: {summary.unmatched_clients.toLocaleString()} (their visits still count toward the barber's trends).
          </Note>
          {Object.keys(summary.unmatched_barbers).length > 0 && <Note tone="warn">Rows skipped because the team member isn't a barber in Rydra: {Object.entries(summary.unmatched_barbers).map(([k, v]) => `${k} (${v})`).join(", ")}. Check spelling matches the barber's name in Rydra.</Note>}
          {summary.bad_dates > 0 && <Note tone="warn">{summary.bad_dates} rows had a date that couldn't be read and were skipped.</Note>}
        </div>
      )}
    </Box>
  );
}
