"use client";

import { useEffect, useId, useState, useRef } from "react";

interface MermaidBlockProps {
  chart: string;
}

let mermaidModule: typeof import("mermaid") | null = null;
let initPromise: Promise<void> | null = null;

async function loadMermaid() {
  if (mermaidModule) return mermaidModule;
  if (!initPromise) {
    initPromise = (async () => {
      mermaidModule = await import("mermaid");
      mermaidModule.default.initialize({
        startOnLoad: false,
        theme: "neutral",
        securityLevel: "strict",
      });
    })();
  }
  await initPromise;
  return mermaidModule!;
}

export default function MermaidBlock({ chart }: MermaidBlockProps) {
  const baseId = useId();
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stable, setStable] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chartRef = useRef(chart);

  // Debounce: wait 800ms after chart stops changing before rendering
  useEffect(() => {
    chartRef.current = chart;
    setStable(false);

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setStable(true);
    }, 800);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [chart]);

  // Only render when content is stable
  useEffect(() => {
    if (!stable) return;

    let cancelled = false;
    const id = `mermaid-${baseId.replace(/:/g, "")}`;
    const currentChart = chartRef.current.trim();

    // Reset error on new render attempt
    setError(null);

    (async () => {
      try {
        const mod = await loadMermaid();
        const { svg: rendered } = await mod.default.render(id, currentChart);
        if (!cancelled) setSvg(rendered);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [stable, baseId]);

  if (error) {
    return (
      <div className="mermaid-container">
        <div style={{ width: "100%" }}>
          <p style={{ color: "var(--color-accent)", fontSize: "0.85em", margin: "0 0 0.4em" }}>
            Mermaid 图表渲染失败：{error}
          </p>
          <pre>
            <code>{chart}</code>
          </pre>
        </div>
      </div>
    );
  }

  // Not yet stable (still receiving streaming content) — show quiet placeholder
  if (!stable || !svg) {
    return (
      <div className="mermaid-container" style={{ minHeight: 60 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5em",
            color: "var(--color-muted)",
            fontSize: "0.85em",
            padding: "0.8em 0",
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" style={{ animation: "spin 1s linear infinite" }}>
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" fill="none" strokeDasharray="31.4 31.4" strokeLinecap="round" />
          </svg>
          图表生成中…
        </div>
      </div>
    );
  }

  return (
    <div className="mermaid-container" dangerouslySetInnerHTML={{ __html: svg }} />
  );
}
