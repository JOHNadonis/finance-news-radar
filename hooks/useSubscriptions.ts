"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import type { Subscription, SubscriptionType } from "@/lib/types";

function getUserToken(): string {
  if (typeof window === "undefined") return "";
  let token = localStorage.getItem("fnr_user_token");
  if (!token) {
    token = crypto.randomUUID();
    localStorage.setItem("fnr_user_token", token);
  }
  return token;
}

export function useSubscriptions() {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);

  const userToken = useMemo(() => getUserToken(), []);

  // Fetch subscriptions on mount
  useEffect(() => {
    if (!userToken) return;

    async function load() {
      try {
        const res = await fetch("/api/subscriptions", {
          headers: { "X-User-Token": userToken },
        });
        if (res.ok) {
          const data = await res.json();
          setSubscriptions(data);
        }
      } catch (err) {
        console.warn("Failed to load subscriptions:", err);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [userToken]);

  const addSubscription = useCallback(
    async (
      type: SubscriptionType,
      value: string,
      displayName?: string
    ): Promise<Subscription | null> => {
      try {
        const res = await fetch("/api/subscriptions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-User-Token": userToken,
          },
          body: JSON.stringify({ type, value, display_name: displayName }),
        });

        if (!res.ok) return null;

        const sub: Subscription = await res.json();
        setSubscriptions((prev) => [sub, ...prev]);
        return sub;
      } catch {
        return null;
      }
    },
    [userToken]
  );

  const removeSubscription = useCallback(
    async (id: number): Promise<boolean> => {
      try {
        const res = await fetch(`/api/subscriptions?id=${id}`, {
          method: "DELETE",
          headers: { "X-User-Token": userToken },
        });

        if (!res.ok) return false;

        const data = await res.json();
        if (data.success) {
          setSubscriptions((prev) => prev.filter((s) => s.id !== id));
        }
        return data.success;
      } catch {
        return false;
      }
    },
    [userToken]
  );

  const isSubscribed = useCallback(
    (type: SubscriptionType, value: string): boolean => {
      return subscriptions.some(
        (s) => s.type === type && s.value === value
      );
    },
    [subscriptions]
  );

  const tickerSubscriptions = useMemo(
    () => subscriptions.filter((s) => s.type === "ticker"),
    [subscriptions]
  );

  return {
    subscriptions,
    loading,
    addSubscription,
    removeSubscription,
    isSubscribed,
    tickerSubscriptions,
  };
}
