"use client";

import { useState, useEffect, useCallback, useRef } from "react";

interface TextSelectionQuoteProps {
  onQuote: (text: string) => void;
}

export default function TextSelectionQuote({ onQuote }: TextSelectionQuoteProps) {
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [selectedText, setSelectedText] = useState("");
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearHideTimer = () => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  };

  const handleSelectionChange = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) {
      // Delay hiding so user can click the button
      clearHideTimer();
      hideTimer.current = setTimeout(() => setVisible(false), 200);
      return;
    }

    const text = sel.toString().trim();
    if (text.length < 5) {
      clearHideTimer();
      hideTimer.current = setTimeout(() => setVisible(false), 200);
      return;
    }

    // Exclude selections inside textarea/input/contenteditable
    const anchor = sel.anchorNode;
    if (anchor) {
      const el = anchor.nodeType === Node.ELEMENT_NODE
        ? (anchor as Element)
        : anchor.parentElement;
      if (el) {
        const tag = el.tagName?.toLowerCase();
        if (tag === "textarea" || tag === "input") return;
        if (el.closest("[contenteditable]")) return;
        // Exclude selections inside the assistant panel
        if (el.closest("[data-assistant-panel]")) return;
      }
    }

    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    // Position the button centered above the selection
    const btnWidth = 140;
    let x = rect.left + rect.width / 2 - btnWidth / 2 + window.scrollX;
    let y: number;

    // If selection is near viewport top, show below instead
    if (rect.top < 40) {
      y = rect.bottom + 6 + window.scrollY;
    } else {
      y = rect.top - 36 + window.scrollY;
    }

    // Clamp horizontal position to viewport
    x = Math.max(4, Math.min(x, window.innerWidth - btnWidth - 4));

    clearHideTimer();
    setSelectedText(text);
    setPos({ x, y });
    setVisible(true);
  }, []);

  useEffect(() => {
    document.addEventListener("selectionchange", handleSelectionChange);
    return () => {
      document.removeEventListener("selectionchange", handleSelectionChange);
      clearHideTimer();
    };
  }, [handleSelectionChange]);

  const handleClick = useCallback(() => {
    onQuote(selectedText);
    window.getSelection()?.removeAllRanges();
    setVisible(false);
  }, [onQuote, selectedText]);

  if (!visible) return null;

  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={handleClick}
      className="fixed z-[9999] cursor-pointer whitespace-nowrap rounded-lg border
        border-[var(--color-line)] bg-[rgba(255,255,255,0.95)] px-3 py-1.5
        text-xs font-medium text-[var(--color-accent-2)]
        shadow-[0_4px_16px_rgba(21,16,12,0.12)] backdrop-blur-md
        transition-all hover:border-[var(--color-accent-2)]
        hover:shadow-[0_6px_20px_rgba(21,16,12,0.18)]"
      style={{ left: pos.x, top: pos.y }}
    >
      💬 引用到助手
    </button>
  );
}
