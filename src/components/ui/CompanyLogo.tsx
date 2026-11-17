"use client";
import { useState } from "react";
import { cn } from "./primitives";

const PALETTE = ["#3B8BFF", "#F55AA0", "#34C759", "#FF9F43", "#B46CF2", "#4FD1C5", "#0B0B0C"];

function monogramColor(name: string) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

/** Favicon from the company domain, falling back to a coloured monogram. */
export function CompanyLogo({
  name,
  domain,
  logo,
  size = 44,
  className,
  plain = false,
}: {
  name: string;
  domain?: string | null;
  /** direct logo URL (e.g. from Unstop) — preferred over the favicon */
  logo?: string | null;
  size?: number;
  className?: string;
  /** no badge background (used on gradient cards) */
  plain?: boolean;
}) {
  const [failed, setFailed] = useState(!domain && !logo);
  const src = logo || `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
  const letter = name.replace(/[^A-Za-z0-9]/g, "").charAt(0).toUpperCase() || "?";
  return (
    <span
      className={cn("inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full", !plain && "bg-card ring-1 ring-line", className)}
      style={{ width: size, height: size }}
    >
      {failed ? (
        <span
          className="flex size-full items-center justify-center font-medium text-white"
          style={{ background: monogramColor(name), fontSize: size * 0.42 }}
        >
          {letter}
        </span>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          width={logo ? size : size * 0.6}
          height={logo ? size : size * 0.6}
          className={logo ? "size-full object-cover" : "rounded-[4px]"}
          onError={() => setFailed(true)}
          onLoad={(e) => {
            // the favicon service returns a 16px globe for unknown domains
            if (!logo && (e.target as HTMLImageElement).naturalWidth <= 16) setFailed(true);
          }}
        />
      )}
    </span>
  );
}
