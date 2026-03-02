"use client";

import { memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import MermaidBlock from "./MermaidBlock";

interface MarkdownContentProps {
  content: string;
  className?: string;
}

const SAFE_PROTOCOLS = ["https:", "http:", "mailto:"];

function sanitizeHref(href: string | undefined): string | undefined {
  if (!href) return href;
  try {
    const url = new URL(href, "https://placeholder.com");
    if (!SAFE_PROTOCOLS.includes(url.protocol)) return undefined;
    return href;
  } catch {
    return href;
  }
}

function MarkdownContentInner({ content, className = "" }: MarkdownContentProps) {
  return (
    <div className={`markdown-content ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children, ...props }) => (
            <a
              {...props}
              href={sanitizeHref(href)}
              target="_blank"
              rel="noopener noreferrer"
            >
              {children}
            </a>
          ),
          code: ({ className, children, ...rest }) => {
            if (className?.includes("language-mermaid")) {
              return <MermaidBlock chart={String(children)} />;
            }
            return (
              <code className={className} {...rest}>
                {children}
              </code>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

const MarkdownContent = memo(MarkdownContentInner);
export default MarkdownContent;
