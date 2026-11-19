"use client";
import { createContext, useContext } from "react";

/** Is the current browser the site owner? Visitors' stars / hides / pipeline live in their own browser instead. */
const Ctx = createContext<{ owner: boolean }>({ owner: false });

export function ViewerProvider({ owner, children }: { owner: boolean; children: React.ReactNode }) {
  return <Ctx.Provider value={{ owner }}>{children}</Ctx.Provider>;
}

export const useViewer = () => useContext(Ctx);
