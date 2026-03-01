import useSWR from "swr";
import useSWRMutation from "swr/mutation";
import { REFRESH_DASHBOARD } from "@/lib/constants";
import type { PolicyAnalysisData, LLMSettingsPublic } from "@/lib/types";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function useAnalysis() {
  return useSWR<PolicyAnalysisData>("/api/analysis", fetcher, {
    refreshInterval: REFRESH_DASHBOARD,
    revalidateOnFocus: false,
  });
}

async function triggerAnalysis(url: string) {
  const res = await fetch(url, { method: "POST" });
  return res.json();
}

export function useTriggerAnalysis() {
  return useSWRMutation("/api/analysis", triggerAnalysis);
}

export function useLLMSettings() {
  return useSWR<LLMSettingsPublic>("/api/settings", fetcher, {
    revalidateOnFocus: false,
  });
}
