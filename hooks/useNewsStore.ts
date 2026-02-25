import { create } from "zustand";
import type { NewsItem, SiteStat } from "@/lib/types";

interface NewsState {
  // Data
  itemsFinance: NewsItem[];
  itemsAll: NewsItem[];
  itemsAllRaw: NewsItem[];
  statsFinance: SiteStat[];
  totalFinance: number;
  totalRaw: number;
  totalAllMode: number;
  generatedAt: string | null;

  // Payload-level stats (for StatsPanel)
  siteCount: number;
  sourceCount: number;
  archiveTotal: number;

  // UI state
  mode: "finance" | "all";
  allDedup: boolean;
  siteFilter: string;
  marketFilter: string;
  query: string;

  // Actions
  setData: (payload: {
    items_finance?: NewsItem[];
    items_all?: NewsItem[];
    items_all_raw?: NewsItem[];
    items?: NewsItem[];
    site_stats?: SiteStat[];
    total_items?: number;
    total_items_raw?: number;
    total_items_all_mode?: number;
    generated_at?: string;
    site_count?: number;
    source_count?: number;
    archive_total?: number;
  }) => void;
  setMode: (mode: "finance" | "all") => void;
  setAllDedup: (v: boolean) => void;
  setSiteFilter: (v: string) => void;
  setMarketFilter: (v: string) => void;
  setQuery: (v: string) => void;
}

export const useNewsStore = create<NewsState>((set) => ({
  itemsFinance: [],
  itemsAll: [],
  itemsAllRaw: [],
  statsFinance: [],
  totalFinance: 0,
  totalRaw: 0,
  totalAllMode: 0,
  generatedAt: null,
  siteCount: 0,
  sourceCount: 0,
  archiveTotal: 0,

  mode: "finance",
  allDedup: true,
  siteFilter: "",
  marketFilter: "",
  query: "",

  setData: (p) =>
    set({
      itemsFinance: p.items_finance || p.items || [],
      itemsAllRaw: p.items_all_raw || p.items_all || p.items || [],
      itemsAll: p.items_all || p.items || [],
      statsFinance: p.site_stats || [],
      totalFinance: p.total_items || 0,
      totalRaw: p.total_items_raw || 0,
      totalAllMode: p.total_items_all_mode || 0,
      generatedAt: p.generated_at || null,
      siteCount: p.site_count || 0,
      sourceCount: p.source_count || 0,
      archiveTotal: p.archive_total || 0,
    }),
  setMode: (mode) => set({ mode, siteFilter: "", marketFilter: "" }),
  setAllDedup: (allDedup) => set({ allDedup }),
  setSiteFilter: (siteFilter) => set({ siteFilter }),
  setMarketFilter: (marketFilter) => set({ marketFilter }),
  setQuery: (query) => set({ query }),
}));
