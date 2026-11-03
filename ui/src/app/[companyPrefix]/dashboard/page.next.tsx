"use client";

import dynamic from "next/dynamic";
import { PaperclipLoading } from "@/components/AnimatedPaperclipIcon";

const Dashboard = dynamic(() => import("@/pages/Dashboard").then((module) => module.Dashboard), {
  ssr: false,
  loading: () => <PaperclipLoading />,
});

export default function DashboardRoute() {
  return <Dashboard />;
}
