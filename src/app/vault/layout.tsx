"use client";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import type { ReactNode } from "react";

export default function VaultLayout({ children }: { children: ReactNode }) {
  return <ErrorBoundary>{children}</ErrorBoundary>;
}
