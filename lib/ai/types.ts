// Shared types for the Rydra Copilot. No "use client" so both server and client can import.

export type SegFilter = "all" | "Churned" | "At Risk" | "Stable";
export type SmsFilter = "all" | "ok" | "blocked" | "held" | "invalid_number" | "opted_out";
export type DashboardSection = "kpis" | "recovery" | "heatmap" | "brief" | "ai" | "charts" | "clients";

// Actions the Copilot can perform inside the dashboard UI.
export type CopilotAction =
  | { type: "set_filters"; segment?: SegFilter; sms_status?: SmsFilter; search?: string }
  | { type: "open_sms"; user_id: string; draft?: string }
  | { type: "scroll_to"; section: DashboardSection };

export type UiAction = CopilotAction | { type: "navigate"; path: string; label: string };

export type CampaignDraft = {
  id: string;
  name: string;
  message: string;
  audience_size: number;
  excluded_blocked: number;
  est_cost_aud: number;
  segment?: SegFilter;
  filters_summary: string;
};

export type CopilotResponse = {
  reply: string;
  actions: UiAction[];
  drafts: CampaignDraft[];
};
