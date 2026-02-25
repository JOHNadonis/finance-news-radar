import useSWR from "swr";
import type { NewsPayload, SentimentData, CalendarData, SummaryData } from "@/lib/types";
import { REFRESH_NEWS, REFRESH_DASHBOARD } from "@/lib/constants";

const fetcher = (url: string) => fetch(url).then((r) => {
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
});

export function useNewsData() {
  return useSWR<NewsPayload>("/api/news", fetcher, {
    refreshInterval: REFRESH_NEWS,
    revalidateOnFocus: false,
  });
}

export function useSentiment() {
  return useSWR<SentimentData>("/api/sentiment", fetcher, {
    refreshInterval: REFRESH_NEWS,
    revalidateOnFocus: false,
  });
}

export function useCalendar() {
  return useSWR<CalendarData>("/api/calendar", fetcher, {
    refreshInterval: REFRESH_DASHBOARD,
    revalidateOnFocus: false,
  });
}

export function useSummary() {
  return useSWR<SummaryData>("/api/summary", fetcher, {
    refreshInterval: REFRESH_DASHBOARD,
    revalidateOnFocus: false,
  });
}
