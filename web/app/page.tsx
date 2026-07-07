import dynamic from "next/dynamic";

const HomeDashboard = dynamic(() => import("@/components/HomeDashboard"), {
  ssr: false,
  loading: () => (
    <div style={{ padding: "2rem", color: "var(--muted)" }}>Loading dashboard...</div>
  ),
});

export default function Home() {
  return <HomeDashboard />;
}
