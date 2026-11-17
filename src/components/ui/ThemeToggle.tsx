"use client";
import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { IconButton } from "./primitives";

export function ThemeToggle({ size = 44 }: { size?: 40 | 44 | 48 }) {
  const [dark, setDark] = useState(false);
  useEffect(() => setDark(document.documentElement.classList.contains("dark")), []);
  return (
    <IconButton
      size={size}
      tone="glass"
      label={dark ? "Switch to light mode" : "Switch to dark mode"}
      onClick={() => {
        const next = !dark;
        document.documentElement.classList.toggle("dark", next);
        try {
          localStorage.setItem("rx-theme", next ? "dark" : "light"); // dark is the default when unset
        } catch {}
        setDark(next);
      }}
    >
      {dark ? <Sun size={18} /> : <Moon size={18} />}
    </IconButton>
  );
}
