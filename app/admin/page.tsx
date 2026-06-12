"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import Background from "@/components/Background";

type Stats = {
  totalEntries: number;
  demoEntries: number;
  entriesSinceLastRaffle: number;
  winnersDrawn: number;
  currentRound: {
    id: string;
    round_number: number;
    started_at: string;
    frozen_at: string;
  } | null;
  recentEntries: Array<{
    id: string;
    full_name: string;
    phone_display: string;
    email: string;
    created_at: string;
    is_demo: boolean;
  }>;
  winners: Array<{
    id: string;
    prize: string;
    won_at: string;
    round_number: number | null;
    full_name: string;
    phone_display: string;
  }>;
};

function fmtTime(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function AdminPage() {
  const router = useRouter();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/stats", { cache: "no-store" });
      if (res.status === 401) {
        router.replace("/login");
        return;
      }
      const data = await res.json();
      setStats(data);
    } catch {
      setToast({ kind: "err", msg: "Failed to load stats." });
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    load();
    const id = setInterval(load, 7000);
    return () => clearInterval(id);
  }, [load]);

  const showToast = (kind: "ok" | "err", msg: string) => {
    setToast({ kind, msg });
    setTimeout(() => setToast(null), 3500);
  };

  const startRound = async () => {
    if (!confirm("Start a new raffle round? This freezes all current entries into the pool.")) return;
    setBusy("start");
    const res = await fetch("/api/raffle/start", { method: "POST" });
    const data = await res.json();
    setBusy(null);
    if (!res.ok) {
      showToast("err", data?.error || "Failed to start round.");
    } else {
      showToast("ok", `Round ${data.round_number} started with ${data.pool_size} entries.`);
      load();
    }
  };

  const resetRound = async () => {
    if (!confirm("Reset current raffle winners and redraw this same raffle?")) return;
    setBusy("reset");
    const res = await fetch("/api/raffle/reset", { method: "POST" });
    const data = await res.json();
    setBusy(null);
    if (!res.ok) {
      showToast("err", data?.error || "Failed to reset round.");
    } else {
      showToast(
        "ok",
        `Round ${data.round_number} reset — cleared ${data.winners_cleared} winner${data.winners_cleared === 1 ? "" : "s"}.`
      );
      load();
    }
  };

  const downloadCsv = () => {
    window.location.href = "/api/admin/export-csv";
  };
  const downloadXlsx = () => {
    window.location.href = "/api/admin/export-xlsx";
  };

  const addDemo = async () => {
    if (!confirm("Add 100 demo entries? They will be tagged as demo.")) return;
    setBusy("demo");
    const res = await fetch("/api/admin/demo", { method: "POST" });
    const data = await res.json();
    setBusy(null);
    if (!res.ok) showToast("err", data?.error || "Failed.");
    else {
      showToast("ok", `Added ${data.inserted} demo entries.`);
      load();
    }
  };

  const addStress = async () => {
    if (
      !confirm(
        "Add 2,000 stress-test entries? They are tagged as demo and can be cleared from this page. DO NOT do this on the production database during the event."
      )
    )
      return;
    setBusy("stress");
    try {
      const res = await fetch("/api/admin/demo?count=2000", { method: "POST" });
      const data = await res.json();
      setBusy(null);
      if (!res.ok) showToast("err", data?.error || "Failed.");
      else {
        showToast("ok", `Added ${data.inserted} stress-test entries.`);
        load();
      }
    } catch {
      setBusy(null);
      showToast("err", "Network error adding stress entries.");
    }
  };

  const clearDemo = async () => {
    if (!confirm("Clear ALL demo entries? This cannot be undone.")) return;
    setBusy("clearDemo");
    const res = await fetch("/api/admin/demo/clear", { method: "POST" });
    const data = await res.json();
    setBusy(null);
    if (!res.ok) showToast("err", data?.error || "Failed.");
    else {
      showToast("ok", `Cleared ${data.deleted} demo entries.`);
      load();
    }
  };

  const logout = async () => {
    await fetch("/api/admin/logout", { method: "POST" });
    router.replace("/login");
  };

  return (
    <>
      <Background />
      <main className="min-h-screen px-6 md:px-12 py-8">
        <header className="flex items-center justify-between mb-8 max-w-7xl mx-auto">
          <div className="flex items-center gap-4">
            <Image
              src="/keter-logo.png"
              alt=""
              width={80}
              height={60}
              className="w-14 h-auto drop-shadow-md"
            />
            <div>
              <h1 className="font-display text-deepPurple text-2xl md:text-3xl tracking-[0.1em]">
                EVENT CONTROL
              </h1>
              <p className="text-deepPurple/60 text-xs uppercase tracking-[0.2em]">
                The Big Keter Event &middot; Monsey
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/admin/entries" className="btn-ghost px-5 py-2 text-sm">
              Entries
            </Link>
            <Link href="/admin/analytics" className="btn-ghost px-5 py-2 text-sm">
              Analytics
            </Link>
            <button onClick={logout} className="btn-ghost px-5 py-2 text-sm">
              Sign Out
            </button>
          </div>
        </header>

        {loading || !stats ? (
          <div className="max-w-7xl mx-auto">
            <div className="glass rounded-4xl p-10 text-center text-deepPurple/70">
              Loading…
            </div>
          </div>
        ) : (
          <div className="max-w-7xl mx-auto space-y-8">
            {/* Stats row */}
            <section className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <StatCard label="Total Entries" value={stats.totalEntries} />
              <StatCard label="Since Last Raffle" value={stats.entriesSinceLastRaffle} highlight />
              <StatCard label="Winners Drawn" value={stats.winnersDrawn} />
              <StatCard
                label="Current Round"
                value={stats.currentRound?.round_number ?? "—"}
              />
              <StatCard
                label="Last Raffle Started"
                value={stats.currentRound ? fmtTime(stats.currentRound.started_at) : "—"}
                small
              />
            </section>

            {/* Actions */}
            <section className="glass rounded-4xl p-6 md:p-8">
              <h2 className="label-premium mb-4">Actions</h2>
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={startRound}
                  disabled={busy !== null || stats.entriesSinceLastRaffle === 0}
                  className="btn-primary px-7 py-3 text-sm"
                >
                  {busy === "start" ? "Starting…" : "Start New Raffle"}
                </button>
                <button
                  onClick={resetRound}
                  disabled={busy !== null || !stats.currentRound}
                  className="btn-ghost px-7 py-3 text-sm"
                  title="Clear winners for the current raffle round so both wheels can be re-spun. Does not change the entry pool."
                >
                  {busy === "reset" ? "Resetting…" : "Reset Current Raffle"}
                </button>
                <button onClick={downloadCsv} disabled={busy !== null} className="btn-gold px-7 py-3 text-sm">
                  Export CSV
                </button>
                <button onClick={downloadXlsx} disabled={busy !== null} className="btn-gold px-7 py-3 text-sm">
                  Export XLSX
                </button>
              </div>

              <div className="mt-6 pt-6 border-t border-deepPurple/15">
                <p className="label-premium mb-3">Test / Demo</p>
                <div className="flex flex-wrap items-center gap-3">
                  <button onClick={addDemo} disabled={busy !== null} className="btn-ghost px-6 py-2.5 text-xs">
                    {busy === "demo" ? "Adding…" : "Add 100 Demo Entries"}
                  </button>
                  <button
                    onClick={addStress}
                    disabled={busy !== null}
                    className="btn-ghost px-6 py-2.5 text-xs"
                    title="Stress-test the event. Adds 2,000 unique demo entries (is_demo=true). Clear with the button to the right."
                  >
                    {busy === "stress" ? "Adding 2,000…" : "Add 2,000 Test Entries"}
                  </button>
                  <button onClick={clearDemo} disabled={busy !== null || stats.demoEntries === 0} className="btn-ghost px-6 py-2.5 text-xs">
                    {busy === "clearDemo" ? "Clearing…" : `Clear Test Entries${stats.demoEntries > 0 ? ` (${stats.demoEntries})` : ""}`}
                  </button>
                  <p className="text-deepPurple/55 text-xs italic">
                    Demo data is for testing only. Clear before the event.
                  </p>
                </div>
              </div>
            </section>

            {/* Tables */}
            <div className="grid lg:grid-cols-2 gap-6">
              {/* Recent entries */}
              <section className="glass rounded-4xl p-6 md:p-7">
                <h2 className="label-premium mb-4">Recent Entries</h2>
                <div className="overflow-x-auto thin-scroll">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="text-deepPurple/60 text-xs uppercase tracking-[0.1em] border-b border-deepPurple/15">
                        <th className="py-2 pr-3">Name</th>
                        <th className="py-2 pr-3">Phone</th>
                        <th className="py-2 pr-3">Email</th>
                        <th className="py-2 pr-3">When</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.recentEntries.length === 0 && (
                        <tr><td colSpan={4} className="py-6 text-center text-deepPurple/50">No entries yet.</td></tr>
                      )}
                      {stats.recentEntries.map((e) => (
                        <tr key={e.id} className="border-b border-deepPurple/8">
                          <td className="py-2.5 pr-3 font-medium">
                            {e.full_name}
                            {e.is_demo && (
                              <span className="ml-2 text-[10px] uppercase tracking-wider text-deepPurple/50 bg-deepPurple/10 px-1.5 py-0.5 rounded">
                                demo
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 pr-3">{e.phone_display}</td>
                          <td className="py-2.5 pr-3 text-deepPurple/70 truncate max-w-[180px]">{e.email}</td>
                          <td className="py-2.5 pr-3 text-deepPurple/55 text-xs">{fmtTime(e.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              {/* Winners */}
              <section className="glass rounded-4xl p-6 md:p-7">
                <h2 className="label-premium mb-4">Winners</h2>
                <div className="overflow-x-auto thin-scroll">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="text-deepPurple/60 text-xs uppercase tracking-[0.1em] border-b border-deepPurple/15">
                        <th className="py-2 pr-3">Round</th>
                        <th className="py-2 pr-3">Prize</th>
                        <th className="py-2 pr-3">Name</th>
                        <th className="py-2 pr-3">Phone</th>
                        <th className="py-2 pr-3">When</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.winners.length === 0 && (
                        <tr><td colSpan={5} className="py-6 text-center text-deepPurple/50">No winners drawn yet.</td></tr>
                      )}
                      {stats.winners.map((w) => (
                        <tr key={w.id} className="border-b border-deepPurple/8">
                          <td className="py-2.5 pr-3">{w.round_number ?? "—"}</td>
                          <td className="py-2.5 pr-3 font-medium">{w.prize}</td>
                          <td className="py-2.5 pr-3">{w.full_name}</td>
                          <td className="py-2.5 pr-3">{w.phone_display}</td>
                          <td className="py-2.5 pr-3 text-deepPurple/55 text-xs">{fmtTime(w.won_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          </div>
        )}

        {/* Toast */}
        {toast && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
            <div
              className={`px-6 py-3 rounded-full shadow-lg font-medium text-sm ${
                toast.kind === "ok"
                  ? "bg-deepPurple text-ivory"
                  : "bg-eventRed text-ivory"
              }`}
            >
              {toast.msg}
            </div>
          </div>
        )}
      </main>
    </>
  );
}

function StatCard({
  label,
  value,
  highlight,
  small,
}: {
  label: string;
  value: number | string;
  highlight?: boolean;
  small?: boolean;
}) {
  return (
    <div
      className={`glass rounded-4xl p-5 ${
        highlight ? "ring-2 ring-gold/60" : ""
      }`}
    >
      <p className="text-deepPurple/55 text-[10px] uppercase tracking-[0.2em] mb-1.5">
        {label}
      </p>
      <p
        className={`font-display text-deepPurple ${
          small ? "text-lg" : "text-3xl md:text-4xl"
        } tracking-tight`}
      >
        {value}
      </p>
    </div>
  );
}
