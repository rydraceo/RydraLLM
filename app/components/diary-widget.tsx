"use client";
// app/components/diary-widget.tsx
// Used on: RydraCoach page, Barber individual page, Client profile page
 
import { useState, useEffect, useCallback } from "react";
 
// ─── Royal Intelligence tokens ────────────────────────────────────────────────
const CARD  = "bg-[#130C24]";
const CARD2 = "bg-[#1A1030]";
const SURF  = "#0F0A1E";
const BDR   = "border-[#2A1852]";
const GOLD  = "#D4A017";
const GOLD2 = "#C9973A";
const PUR   = "#5B21B6";
const PUR_L = "#7C3AED";
const PUR_LL = "#A78BFA";
const MUT   = "#6B5C8A";
const CARD_S = "#130C24";
 
// ─── Spend willingness config ─────────────────────────────────────────────────
const SPEND_META: Record<string, { label: string; hex: string; icon: string }> = {
  low:            { label: "Tight budget",        hex: "#6B5C8A", icon: "↓" },
  medium:         { label: "Average spender",     hex: "#A78BFA", icon: "→" },
  high:           { label: "Spends freely",       hex: "#34D399", icon: "↑" },
  upgrade_ready:  { label: "Upgrade opportunity", hex: "#D4A017", icon: "★" },
};
 
// ─── Types ────────────────────────────────────────────────────────────────────
interface DiaryEntry {
  id: string;
  barber_slug: string;
  barber_name: string | null;
  customer_id: string | null;
  customer_name: string;
  session_date: string;
  service_performed: string | null;
  conversation_notes: string | null;
  client_preferences: string | null;
  spend_willingness: string;
  spend_notes: string | null;
  next_session_notes: string | null;
  created_at: string;
}
 
const BLANK_FORM = {
  customer_name:      "",
  customer_id:        "",
  session_date:       new Date().toISOString().split("T")[0],
  service_performed:  "",
  conversation_notes: "",
  client_preferences: "",
  spend_willingness:  "medium",
  spend_notes:        "",
  next_session_notes: "",
};
 
// ─── Props ────────────────────────────────────────────────────────────────────
interface DiaryWidgetProps {
  venueId:     string;
  barberSlug?: string;       // set when on barber or coach page
  barberName?: string;       // set when on barber or coach page
  customerId?: string;       // set when on client profile page
  customerName?: string;     // pre-fill when on client profile page
  mode?: "barber" | "client"; // controls UI layout
}
 
// ─── Diary Entry Card ─────────────────────────────────────────────────────────
function EntryCard({
  entry,
  isExpanded,
  onToggle,
  onEdit,
  onDelete,
  showBarber,
  showClient,
}: {
  entry: DiaryEntry;
  isExpanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  showBarber: boolean;
  showClient: boolean;
}) {
  const [delConfirm, setDelConfirm] = useState(false);
  const sm = SPEND_META[entry.spend_willingness] || SPEND_META.medium;
 
  function fmtDate(s: string) {
    return new Date(s + "T00:00:00").toLocaleDateString("en-AU", {
      weekday: "short", day: "numeric", month: "short", year: "numeric"
    });
  }
 
  return (
    <div className={`${CARD} border rounded-xl overflow-hidden transition-all`}
      style={{ borderColor: isExpanded ? "#3A2268" : "#2A1852" }}>
 
      {/* Header row — always visible */}
      <button className="w-full flex items-center gap-4 px-5 py-3.5 text-left"
        onClick={onToggle}>
        {/* Date */}
        <div className="flex-shrink-0 w-24">
          <div className="text-[10px] font-bold" style={{ color: GOLD2 }}>
            {new Date(entry.session_date + "T00:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "short" })}
          </div>
          <div className="text-[9px]" style={{ color: MUT }}>
            {new Date(entry.session_date + "T00:00:00").getFullYear()}
          </div>
        </div>
 
        {/* Client / barber names */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {showClient && (
              <span className="text-sm font-semibold text-white">{entry.customer_name}</span>
            )}
            {showBarber && entry.barber_name && (
              <span className="text-[10px] px-2 py-0.5 rounded font-medium"
                style={{ background: "rgba(91,33,182,0.15)", color: PUR_LL }}>
                {entry.barber_name}
              </span>
            )}
            {entry.service_performed && (
              <span className="text-[10px]" style={{ color: MUT }}>
                · {entry.service_performed}
              </span>
            )}
          </div>
          {/* Preview of notes */}
          {!isExpanded && entry.conversation_notes && (
            <div className="text-[10px] mt-0.5 truncate" style={{ color: MUT }}>
              {entry.conversation_notes}
            </div>
          )}
        </div>
 
        {/* Spend badge */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold"
            style={{ background: `${sm.hex}15`, border: `1px solid ${sm.hex}30`, color: sm.hex }}>
            <span>{sm.icon}</span>
            <span>{sm.label}</span>
          </div>
          <svg className={`w-3.5 h-3.5 transition-transform ${isExpanded ? "rotate-180" : ""}`}
            style={{ color: MUT }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>
 
      {/* Expanded content */}
      {isExpanded && (
        <div className="border-t px-5 py-4 space-y-4" style={{ borderColor: "#2A1852", background: SURF }}>
 
          <div className="grid grid-cols-2 gap-4">
            {/* Left column */}
            <div className="space-y-3">
              {entry.conversation_notes && (
                <div>
                  <div className="text-[9px] font-bold uppercase tracking-widest mb-1" style={{ color: GOLD2 }}>
                    What we talked about
                  </div>
                  <p className="text-sm leading-relaxed" style={{ color: "#C4B5FD" }}>
                    {entry.conversation_notes}
                  </p>
                </div>
              )}
              {entry.client_preferences && (
                <div>
                  <div className="text-[9px] font-bold uppercase tracking-widest mb-1" style={{ color: GOLD2 }}>
                    Client preferences
                  </div>
                  <p className="text-sm leading-relaxed" style={{ color: "#C4B5FD" }}>
                    {entry.client_preferences}
                  </p>
                </div>
              )}
            </div>
 
            {/* Right column */}
            <div className="space-y-3">
              <div>
                <div className="text-[9px] font-bold uppercase tracking-widest mb-1" style={{ color: GOLD2 }}>
                  Spend willingness
                </div>
                <div className="flex items-center gap-2">
                  <div className="px-3 py-1.5 rounded-lg text-sm font-bold"
                    style={{ background: `${sm.hex}15`, border: `1px solid ${sm.hex}30`, color: sm.hex }}>
                    {sm.icon} {sm.label}
                  </div>
                </div>
                {entry.spend_notes && (
                  <p className="text-[11px] mt-1.5 leading-relaxed" style={{ color: MUT }}>
                    {entry.spend_notes}
                  </p>
                )}
              </div>
              {entry.next_session_notes && (
                <div>
                  <div className="text-[9px] font-bold uppercase tracking-widest mb-1" style={{ color: PUR_LL }}>
                    Remember next time
                  </div>
                  <p className="text-sm leading-relaxed" style={{ color: "#C4B5FD" }}>
                    {entry.next_session_notes}
                  </p>
                </div>
              )}
            </div>
          </div>
 
          {/* Actions */}
          <div className="flex items-center gap-2 pt-2 border-t" style={{ borderColor: "#2A1852" }}>
            <div className="text-[9px]" style={{ color: MUT }}>
              {fmtDate(entry.session_date)}
              {entry.service_performed && ` · ${entry.service_performed}`}
            </div>
            <div className="ml-auto flex items-center gap-2">
              <button onClick={onEdit}
                className="px-3 py-1.5 rounded-md text-[10px] font-semibold border transition-all"
                style={{ background: CARD_S, borderColor: "#3A2268", color: PUR_LL }}>
                Edit
              </button>
              {delConfirm ? (
                <div className="flex gap-1">
                  <button onClick={onDelete}
                    className="px-3 py-1.5 rounded-md text-[10px] font-bold border transition-all"
                    style={{ background: CARD_S, borderColor: "rgba(244,63,94,0.35)", color: "#F43F5E" }}>
                    Confirm delete
                  </button>
                  <button onClick={() => setDelConfirm(false)}
                    className="px-2 py-1.5 rounded-md text-[10px] border"
                    style={{ background: CARD_S, borderColor: "#2A1852", color: MUT }}>
                    ✕
                  </button>
                </div>
              ) : (
                <button onClick={() => setDelConfirm(true)}
                  className="px-3 py-1.5 rounded-md text-[10px] font-semibold border transition-all"
                  style={{ background: CARD_S, borderColor: "#2A1852", color: MUT }}>
                  Delete
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
 
// ─── Entry Form ───────────────────────────────────────────────────────────────
function EntryForm({
  initial,
  lockCustomer,
  onSave,
  onCancel,
  saving,
}: {
  initial: typeof BLANK_FORM & { id?: string };
  lockCustomer: boolean;
  onSave: (data: typeof BLANK_FORM & { id?: string }) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [form, setForm] = useState(initial);
  const set = (key: string, val: string) => setForm(f => ({ ...f, [key]: val }));
  const charCount = (s: string) => s.length;
  const isValid = form.customer_name.trim().length > 0;
 
  return (
    <div className="rounded-xl border overflow-hidden"
      style={{ background: SURF, borderColor: "rgba(212,160,23,0.25)" }}>
 
      {/* Form header */}
      <div className="flex items-center gap-3 px-5 py-3.5 border-b" style={{ borderColor: "#2A1852" }}>
        <div className="w-5 h-5 rounded animate-pulse"
          style={{ background: `${GOLD}20`, border: `1px solid ${GOLD}40` }}>
          <div className="w-full h-full flex items-center justify-center text-[10px] font-bold" style={{ color: GOLD }}>✎</div>
        </div>
        <div className="text-sm font-semibold text-white">
          {form.id ? "Edit diary entry" : "New diary entry"}
        </div>
        <div className="text-[10px] ml-1" style={{ color: MUT }}>
          {form.id ? "" : "— log this session"}
        </div>
      </div>
 
      <div className="p-5 space-y-4">
        {/* Row 1: client name + date + service */}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="text-[9px] font-bold uppercase tracking-widest mb-1.5 block" style={{ color: GOLD2 }}>
              Client Name *
            </label>
            <input
              value={form.customer_name}
              onChange={e => set("customer_name", e.target.value)}
              disabled={lockCustomer}
              placeholder="e.g. James Smith"
              className="w-full rounded-lg px-3 py-2 text-sm text-white placeholder-[#6B5C8A] border focus:outline-none disabled:opacity-60"
              style={{ background: CARD_S, borderColor: "#2A1852" }}
            />
          </div>
          <div>
            <label className="text-[9px] font-bold uppercase tracking-widest mb-1.5 block" style={{ color: MUT }}>
              Date
            </label>
            <input
              type="date"
              value={form.session_date}
              onChange={e => set("session_date", e.target.value)}
              className="w-full rounded-lg px-3 py-2 text-sm text-white border focus:outline-none"
              style={{ background: CARD_S, borderColor: "#2A1852" }}
            />
          </div>
          <div>
            <label className="text-[9px] font-bold uppercase tracking-widest mb-1.5 block" style={{ color: MUT }}>
              Service Performed
            </label>
            <input
              value={form.service_performed}
              onChange={e => set("service_performed", e.target.value)}
              placeholder="e.g. Skin fade + beard trim"
              className="w-full rounded-lg px-3 py-2 text-sm text-white placeholder-[#6B5C8A] border focus:outline-none"
              style={{ background: CARD_S, borderColor: "#2A1852" }}
            />
          </div>
        </div>
 
        {/* Row 2: conversation + preferences */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[9px] font-bold uppercase tracking-widest mb-1.5 block" style={{ color: GOLD2 }}>
              What we talked about
            </label>
            <textarea
              value={form.conversation_notes}
              onChange={e => set("conversation_notes", e.target.value)}
              rows={3}
              placeholder="Topics, personal updates, things to remember next time..."
              className="w-full rounded-lg px-3 py-2 text-sm text-white placeholder-[#6B5C8A] border focus:outline-none resize-none"
              style={{ background: CARD_S, borderColor: "#2A1852" }}
            />
          </div>
          <div>
            <label className="text-[9px] font-bold uppercase tracking-widest mb-1.5 block" style={{ color: GOLD2 }}>
              Client preferences & likes
            </label>
            <textarea
              value={form.client_preferences}
              onChange={e => set("client_preferences", e.target.value)}
              rows={3}
              placeholder="Style preferences, product likes, texture, length, finish..."
              className="w-full rounded-lg px-3 py-2 text-sm text-white placeholder-[#6B5C8A] border focus:outline-none resize-none"
              style={{ background: CARD_S, borderColor: "#2A1852" }}
            />
          </div>
        </div>
 
        {/* Row 3: spend willingness */}
        <div>
          <label className="text-[9px] font-bold uppercase tracking-widest mb-2 block" style={{ color: GOLD2 }}>
            Spend willingness
          </label>
          <div className="flex gap-2 flex-wrap mb-2">
            {Object.entries(SPEND_META).map(([key, { label, hex, icon }]) => {
              const active = form.spend_willingness === key;
              return (
                <button key={key}
                  onClick={() => set("spend_willingness", key)}
                  className="px-3 py-2 rounded-lg text-[11px] font-bold transition-all border"
                  style={{
                    background: active ? `${hex}18` : CARD_S,
                    borderColor: active ? `${hex}45` : "#2A1852",
                    color: active ? hex : MUT,
                  }}>
                  {icon} {label}
                </button>
              );
            })}
          </div>
          <input
            value={form.spend_notes}
            onChange={e => set("spend_notes", e.target.value)}
            placeholder="Details — e.g. 'Asked about beard oil, seemed interested in premium products'"
            className="w-full rounded-lg px-3 py-2 text-sm text-white placeholder-[#6B5C8A] border focus:outline-none"
            style={{ background: CARD_S, borderColor: "#2A1852" }}
          />
        </div>
 
        {/* Row 4: next session */}
        <div>
          <label className="text-[9px] font-bold uppercase tracking-widest mb-1.5 block" style={{ color: PUR_LL }}>
            Remember for next session
          </label>
          <textarea
            value={form.next_session_notes}
            onChange={e => set("next_session_notes", e.target.value)}
            rows={2}
            placeholder="What to bring up, suggest, or offer next time they come in..."
            className="w-full rounded-lg px-3 py-2 text-sm text-white placeholder-[#6B5C8A] border focus:outline-none resize-none"
            style={{ background: CARD_S, borderColor: "#2A1852" }}
          />
        </div>
 
        {/* Actions */}
        <div className="flex gap-2 pt-1 border-t" style={{ borderColor: "#2A1852" }}>
          <button onClick={onCancel}
            className="px-4 py-2.5 rounded-lg border text-sm transition-all"
            style={{ background: CARD_S, borderColor: "#2A1852", color: PUR_LL }}>
            Cancel
          </button>
          <button
            onClick={() => onSave(form)}
            disabled={saving || !isValid}
            className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-40 transition-all"
            style={{ background: PUR, boxShadow: "0 4px 20px rgba(212,160,23,0.12)" }}>
            {saving ? "Saving..." : form.id ? "Save Changes" : "Save Entry"}
          </button>
        </div>
      </div>
    </div>
  );
}
 
// ─── Main DiaryWidget ─────────────────────────────────────────────────────────
export function DiaryWidget({
  venueId,
  barberSlug,
  barberName,
  customerId,
  customerName,
  mode = "barber",
}: DiaryWidgetProps) {
  const [entries,   setEntries]   = useState<DiaryEntry[]>([]);
  const [stats,     setStats]     = useState<any>(null);
  const [loading,   setLoading]   = useState(true);
  const [showForm,  setShowForm]  = useState(false);
  const [editEntry, setEditEntry] = useState<DiaryEntry | null>(null);
  const [expanded,  setExpanded]  = useState<string | null>(null);
  const [saving,    setSaving]    = useState(false);
  const [filter,    setFilter]    = useState<"all"|"upgrade_ready"|"high">("all");
 
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ venue_id: venueId });
      if (barberSlug) params.append("barber_slug", barberSlug);
      if (customerId) params.append("customer_id", customerId);
      const res = await fetch(`/api/barber/diary?${params}`);
      const data = await res.json();
      setEntries(data.entries || []);
      setStats(data.stats || null);
    } catch {} finally { setLoading(false); }
  }, [venueId, barberSlug, customerId]);
 
  useEffect(() => { load(); }, [load]);
 
  async function saveEntry(form: typeof BLANK_FORM & { id?: string }) {
    setSaving(true);
    try {
      const method = form.id ? "PUT" : "POST";
      const body = {
        venue_id: venueId,
        barber_slug: barberSlug || "unknown",
        barber_name: barberName || null,
        customer_id: customerId || form.customer_id || null,
        customer_name: form.customer_name,
        session_date: form.session_date,
        service_performed: form.service_performed || null,
        conversation_notes: form.conversation_notes || null,
        client_preferences: form.client_preferences || null,
        spend_willingness: form.spend_willingness,
        spend_notes: form.spend_notes || null,
        next_session_notes: form.next_session_notes || null,
        ...(form.id ? { id: form.id } : {}),
      };
      const res = await fetch("/api/barber/diary", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setShowForm(false);
        setEditEntry(null);
        load();
      }
    } catch {} finally { setSaving(false); }
  }
 
  async function deleteEntry(id: string) {
    await fetch(`/api/barber/diary?id=${id}&venue_id=${venueId}`, { method: "DELETE" });
    setExpanded(null);
    load();
  }
 
  function openEdit(entry: DiaryEntry) {
    setEditEntry(entry);
    setShowForm(true);
    setExpanded(null);
  }
 
  const filtered = entries.filter(e =>
    filter === "all" ? true :
    filter === "upgrade_ready" ? e.spend_willingness === "upgrade_ready" :
    ["high","upgrade_ready"].includes(e.spend_willingness)
  );
 
  const showBarber = mode === "client"; // on client page, show which barber
  const showClient = mode === "barber"; // on barber page, show which client
 
  const initForm = editEntry
    ? {
        id:                 editEntry.id,
        customer_name:      editEntry.customer_name,
        customer_id:        editEntry.customer_id || "",
        session_date:       editEntry.session_date,
        service_performed:  editEntry.service_performed || "",
        conversation_notes: editEntry.conversation_notes || "",
        client_preferences: editEntry.client_preferences || "",
        spend_willingness:  editEntry.spend_willingness,
        spend_notes:        editEntry.spend_notes || "",
        next_session_notes: editEntry.next_session_notes || "",
      }
    : {
        ...BLANK_FORM,
        customer_name: customerName || "",
        customer_id:   customerId  || "",
      };
 
  return (
    <div className={`${CARD} border ${BDR} rounded-xl overflow-hidden`}>
 
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: "1px solid #2A1852" }}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: "linear-gradient(135deg, #5B21B6, #D4A017)" }}>
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest mb-0.5" style={{ color: GOLD2 }}>
              RydraCoach Diary
            </div>
            <div className="text-sm font-semibold text-white">
              {loading ? "Loading..." : `${entries.length} session${entries.length !== 1 ? "s" : ""} logged`}
            </div>
          </div>
        </div>
 
        {/* Stats pills + new entry button */}
        <div className="flex items-center gap-2">
          {stats && stats.upgrade_ready > 0 && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold"
              style={{ background: "rgba(212,160,23,0.12)", border: "1px solid rgba(212,160,23,0.3)", color: GOLD }}>
              ★ {stats.upgrade_ready} upgrade-ready
            </div>
          )}
          {!showForm && (
            <button
              onClick={() => { setEditEntry(null); setShowForm(true); }}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-white transition-all"
              style={{ background: PUR, boxShadow: "0 2px 12px rgba(212,160,23,0.1)" }}>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New Entry
            </button>
          )}
        </div>
      </div>
 
      <div className="p-5 space-y-4">
 
        {/* Entry form */}
        {showForm && (
          <EntryForm
            initial={initForm}
            lockCustomer={!!customerName && !!customerId}
            onSave={saveEntry}
            onCancel={() => { setShowForm(false); setEditEntry(null); }}
            saving={saving}
          />
        )}
 
        {/* Filter bar */}
        {entries.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: MUT }}>Filter:</span>
            {[
              { k: "all",           l: `All (${entries.length})` },
              { k: "upgrade_ready", l: `★ Upgrade ready (${entries.filter(e=>e.spend_willingness==="upgrade_ready").length})` },
              { k: "high",          l: `High spenders (${entries.filter(e=>["high","upgrade_ready"].includes(e.spend_willingness)).length})` },
            ].map(({ k, l }) => (
              <button key={k}
                onClick={() => setFilter(k as any)}
                className="px-3 py-1.5 rounded-md text-[10px] font-semibold transition-all"
                style={filter === k
                  ? { background: PUR, color: "#fff" }
                  : { background: CARD_S, border: "1px solid #2A1852", color: PUR_LL }}>
                {l}
              </button>
            ))}
          </div>
        )}
 
        {/* Entry list */}
        {loading ? (
          <div className="flex items-center justify-center py-10 gap-2">
            <div className="w-5 h-5 border rounded-full animate-spin"
              style={{ borderColor: "rgba(91,33,182,0.3)", borderTopColor: PUR_L }} />
            <span className="text-sm" style={{ color: MUT }}>Loading diary...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-4"
              style={{ background: "rgba(91,33,182,0.1)", border: "1px solid rgba(91,33,182,0.2)" }}>
              <svg className="w-6 h-6" style={{ color: PUR_LL }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <div className="text-sm font-semibold text-white mb-1">
              {filter !== "all" ? "No entries match this filter" : "No diary entries yet"}
            </div>
            <div className="text-xs mb-5" style={{ color: MUT }}>
              {filter !== "all"
                ? "Try switching to 'All'"
                : "Log your first session — notes, preferences, spend signals."}
            </div>
            {filter === "all" && (
              <button onClick={() => { setEditEntry(null); setShowForm(true); }}
                className="px-5 py-2.5 rounded-lg text-sm font-semibold text-white"
                style={{ background: PUR }}>
                Log First Session
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(entry => (
              <EntryCard
                key={entry.id}
                entry={entry}
                isExpanded={expanded === entry.id}
                onToggle={() => setExpanded(expanded === entry.id ? null : entry.id)}
                onEdit={() => openEdit(entry)}
                onDelete={() => deleteEntry(entry.id)}
                showBarber={showBarber}
                showClient={showClient}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}