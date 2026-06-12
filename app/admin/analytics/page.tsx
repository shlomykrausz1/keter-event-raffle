"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Background from "@/components/Background";

type Bucket = { start: string; count: number };

type Analytics = {
  totalEntries: number;
  entriesPerMinute: number;
  entriesLastHour: number;
  lastEntryName: string | null;
  lastEntryAt: string | null;
  estimatedPerHour: number;
  duplicateAttempts: number;
  duplicateTrackingReady: boolean;
  winnersDrawn: number;
  currentRoundNumber: number | null;
  entriesWaiting: number;
  poolSize: number;
  buckets: Bucket[];
  busiestBucket: Bucket | null;
  busiestHour: Bucket | null;
  avgPer15Min: number;
};

function fmtClock(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function fmtBucketLabel(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export default function AdminAnalyticsPage() {
  const router = useRouter();
  const [data, setData] = useState<Analytics | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/analytics", { cache: "no-store" });
      if (res.status === 401) {
        router.replace("/login");
        return;
      }
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error || "Failed to load analytics.");
        return;
      }
      setError(null);
      setData(json);
    } catch {
      setError("Network error loading analytics.");
    }
  }, [router]);

  useEffect(() => {
    load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, [load]);

  const maxCount = Math.max(1, ...(data?.buckets ?? []).map((b) => b.count));

  return (
    <>
      <Background />
      <main className="min-h-screen px-4 md:px-10 py-8">
        <div className="max-w-7xl mx-auto">
          <header className="flex flex-wrap items-center justify-between gap-3 mb-6">
            <div>
              <h1 className="font-display text-deepPurple text-2xl md:text-3xl tracking-[0.1em]">
                LIVE ANALYTICS
              </h1>
              <p className="text-deepPurple/60 text-xs uppercase tracking-[0.2em]">
                Auto-refreshes every 5 seconds
              </p>
            </div>
            <Link href="/admin" className="btn-ghost px-5 py-2 text-sm">
              ← Back to Admin
            </Link>
          </header>

          {error && (
            <div className="bg-eventRed/90 text-ivory rounded-2xl px-5 py-3 text-sm mb-5 text-center">
              {error}
            </div>
          )}

          {!data ? (
            <div className="glass rounded-4xl p-10 text-center text-deepPurple/70">
              Loading…
            </div>
          ) : (
            <div className="space-y-6">
              {/* Primary live metrics */}
              <section className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
                <Metric label="Total Entries" value={data.totalEntries} highlight />
                <Metric label="Entries / Minute" value={data.entriesPerMinute} />
                <Metric label="Last Hour" value={data.entriesLastHour} />
                <Metric
                  label="Est. / Hour"
                  value={data.estimatedPerHour}
                />
                <Metric
                  label="Last Entry"
                  value={data.lastEntryName ?? "—"}
                  small
                />
                <Metric
                  label="Last Entry Time"
                  value={fmtClock(data.lastEntryAt)}
                  small
                />
                <Metric
                  label="Duplicates Blocked"
                  value={data.duplicateTrackingReady ? data.duplicateAttempts : "—"}
                />
              </section>

              {/* 15-minute activity chart */}
              <section className="glass rounded-4xl p-6 md:p-8">
                <h2 className="label-premium mb-4">
                  Activity — 15-minute blocks (full timeline)
                </h2>
                {data.buckets.length === 0 ? (
                  <p className="text-deepPurple/50 text-sm py-8 text-center">
                    No entries yet.
                  </p>
                ) : (
                  <>
                    <div className="flex items-end gap-[2px] h-44">
                      {data.buckets.map((b) => (
                        <div
                          key={b.start}
                          className="flex-1 min-w-[3px] group relative"
                          style={{ height: "100%" }}
                        >
                          <div
                            className="absolute bottom-0 w-full rounded-t bg-gradient-to-t from-deepPurple to-deepPurple-light transition-all"
                            style={{
                              height: `${Math.max(
                                b.count > 0 ? 4 : 1,
                                (b.count / maxCount) * 100
                              )}%`,
                              opacity: b.count > 0 ? 1 : 0.18,
                            }}
                          />
                          <div className="hidden group-hover:block absolute -top-9 left-1/2 -translate-x-1/2 bg-deepPurple text-ivory text-[11px] rounded-md px-2 py-1 whitespace-nowrap z-10">
                            {fmtBucketLabel(b.start)} · {b.count}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="flex justify-between text-[11px] text-deepPurple/50 mt-2">
                      <span>{fmtBucketLabel(data.buckets[0].start)}</span>
                      <span>
                        {fmtBucketLabel(data.buckets[data.buckets.length - 1].start)}
                      </span>
                    </div>
                  </>
                )}
              </section>

              {/* Secondary metrics */}
              <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                <Metric
                  label="Busiest 15 Min"
                  value={
                    data.busiestBucket
                      ? `${fmtBucketLabel(data.busiestBucket.start)} (${data.busiestBucket.count})`
                      : "—"
                  }
                  small
                />
                <Metric
                  label="Busiest Hour"
                  value={
                    data.busiestHour
                      ? `${fmtBucketLabel(data.busiestHour.start)} (${data.busiestHour.count})`
                      : "—"
                  }
                  small
                />
                <Metric label="Avg / 15 Min" value={data.avgPer15Min} />
                <Metric label="Winners Drawn" value={data.winnersDrawn} />
                <Metric
                  label="Current Round"
                  value={data.currentRoundNumber ?? "—"}
                />
                <Metric label="Waiting for Next Raffle" value={data.entriesWaiting} />
              </section>

              <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                <Metric label="Current Pool Size" value={data.poolSize} />
              </section>

              {!data.duplicateTrackingReady && (
                <p className="text-deepPurple/55 text-xs italic">
                  Duplicate-attempt tracking needs the database migration
                  (supabase/migration-event-controls.sql).
                </p>
              )}
            </div>
          )}
        </div>
      </main>
    </>
  );
}

function Metric({
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
    <div className={`glass rounded-4xl p-4 ${highlight ? "ring-2 ring-gold/60" : ""}`}>
      <p className="text-deepPurple/55 text-[10px] uppercase tracking-[0.18em] mb-1">
        {label}
      </p>
      <p
        className={`font-display text-deepPurple tracking-tight truncate ${
          small ? "text-base" : "text-2xl md:text-3xl"
        }`}
        title={String(value)}
      >
        {value}
      </p>
    </div>
  );
}
