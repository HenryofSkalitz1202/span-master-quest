import { createContext, useContext, ReactNode } from "react";

export type View =
  | "home"
  | "dashboard"
  | "training"
  | "materials"
  | "assistant"
  | "profile"
  | "settings";

type NavCtx = { view: View; go: (v: View) => void };

const NavContext = createContext<NavCtx | null>(null);

export function NavProvider({
  view,
  go,
  children,
}: {
  view: View;
  go: (v: View) => void;
  children: ReactNode;
}) {
  return <NavContext.Provider value={{ view, go }}>{children}</NavContext.Provider>;
}

export function useNav() {
  const ctx = useContext(NavContext);
  if (!ctx) throw new Error("useNav must be used within NavProvider");
  return ctx;
}
