"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type StaffWinner = {
  id: string;
  prize: string;
  won_at: string;
  picked_up: boolean;
  picked_up_at: string | null;
  round_number: number | null;
  full_name: string;
  phone_display: string;
  email: string;
  street_address: string;
  zip_code: string;
};

function digitsOf(s: string): string {
  return (s || "").replace(/\D+/g, "");
}

function fmtTime(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function fmtFull(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function StaffPage({ slug }: { slug: string }) {
  const [winners, setWinners] = useState<StaffWinner[] | null>(null);
  const [migrationNeeded, setMigrationNeeded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  // Expanded card ids — kept separate from the winner data so the periodic
  // refresh can swap in fresh data without collapsing what the worker has open.
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/staff/winners", {
        cache: "no-store",
        headers: { "x-staff-slug": slug },
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || "Failed to load winners.");
        return;
      }
      setError(null);
      setWinners(data.winners);
      setMigrationNeeded(!!data.migration_needed);
    } catch {
      setError("Network error loading winners.");
    }
  }, [slug]);

  useEffect(() => {
    load();
    const id = setInterval(load, 7000);
    return () => clearInterval(id);
  }, [load]);

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const setPickup = async (winnerId: string, pickedUp: boolean) => {
    setBusyId(winnerId);
    try {
      const res = await fetch("/api/staff/pickup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-staff-slug": slug,
        },
        body: JSON.stringify({ winner_id: winnerId, picked_up: pickedUp }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || "Update failed.");
      } else {
        setError(null);
        setWinners((prev) =>
          (prev ?? []).map((w) =>
            w.id === winnerId
              ? {
                  ...w,
                  picked_up: data.winner.picked_up,
                  picked_up_at: data.winner.picked_up_at,
                }
              : w
          )
        );
      }
    } catch {
      setError("Network error.");
    } finally {
      setBusyId(null);
    }
  };

  const filtered = useMemo(() => {
    if (!winners) return null;
    const q = query.trim().toLowerCase();
    if (!q) return winners;
    const qDigits = digitsOf(q);
    return winners.filter((w) => {
      const nameHit = w.full_name.toLowerCase().includes(q);
      const phoneHit =
        qDigits.length >= 3 && digitsOf(w.phone_display).includes(qDigits);
      return nameHit || phoneHit;
    });
  }, [winners, query]);

  return (
    <main className="min-h-screen px-4 py-6">
      <div className="max-w-xl mx-auto">
        <header className="text-center mb-5">
          <h1 className="font-display text-deepPurple text-3xl tracking-[0.12em]">
            KETER STAFF
          </h1>
          <p className="text-deepPurple/60 text-xs uppercase tracking-[0.2em] mt-1">
            Prize Pickup
          </p>
        </header>

        {/* Search */}
        <div className="mb-4">
          <input
            type="search"
            inputMode="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name or phone…"
            className="input-premium !py-3.5 !px-5 !text-lg !rounded-2xl"
          />
        </div>

        {migrationNeeded && (
          <div className="bg-eventRed/90 text-ivory rounded-2xl px-5 py-3 text-base mb-4 text-center">
            Pickup tracking is not set up yet — ask the event operator to run
            the database migration.
          </div>
        )}

        {error && (
          <div className="bg-eventRed/90 text-ivory rounded-2xl px-5 py-3 text-base mb-4 text-center">
            {error}
          </div>
        )}

        {filtered == null ? (
          <div className="glass rounded-3xl p-8 text-center text-deepPurple/70 text-lg">
            Loading…
          </div>
        ) : filtered.length === 0 ? (
          <div className="glass rounded-3xl p-8 text-center text-deepPurple/70 text-lg">
            {query ? "No winners match your search." : "No winners yet."}
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((w) => {
              const expanded = expandedIds.has(w.id);
              return (
                <div
                  key={w.id}
                  className={`rounded-3xl overflow-hidden transition-colors ${
                    w.picked_up
                      ? "bg-green-100/90 border border-green-300/70 shadow-md"
                      : "glass"
                  }`}
                >
                  {/* Whole card header is the tap target */}
                  <button
                    type="button"
                    onClick={() => toggleExpanded(w.id)}
                    aria-expanded={expanded}
                    className="w-full text-left px-5 py-4 active:bg-deepPurple/5"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-display text-deepPurple text-2xl leading-tight tracking-wide truncate">
                          {w.full_name}
                        </p>
                        <p className="text-deepPurple text-xl font-medium tabular-nums">
                          {w.phone_display}
                        </p>
                        <p className="text-deepPurple/70 text-base mt-0.5">
                          {w.prize}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        {w.picked_up ? (
                          <>
                            <span className="inline-block bg-green-600 text-white text-xs uppercase tracking-[0.12em] rounded-full px-3 py-1.5 font-medium">
                              Picked Up
                            </span>
                            {w.picked_up_at && (
                              <p className="text-green-800 text-sm mt-1.5">
                                {fmtTime(w.picked_up_at)}
                              </p>
                            )}
                          </>
                        ) : (
                          <span className="inline-block bg-deepPurple/10 text-deepPurple/70 text-xs uppercase tracking-[0.12em] rounded-full px-3 py-1.5 font-medium">
                            Not Picked Up
                          </span>
                        )}
                        <p
                          className={`text-deepPurple/40 text-lg leading-none mt-2 transition-transform ${
                            expanded ? "rotate-180" : ""
                          }`}
                          aria-hidden
                        >
                          ▾
                        </p>
                      </div>
                    </div>
                  </button>

                  {expanded && (
                    <div className="px-5 pb-5 border-t border-deepPurple/10 pt-4">
                      <dl className="text-base text-deepPurple/85 space-y-1.5 mb-4">
                        <div>
                          <dt className="inline text-deepPurple/50">Email: </dt>
                          <dd className="inline break-all">{w.email}</dd>
                        </div>
                        <div>
                          <dt className="inline text-deepPurple/50">Address: </dt>
                          <dd className="inline">
                            {w.street_address}, {w.zip_code}
                          </dd>
                        </div>
                        <div>
                          <dt className="inline text-deepPurple/50">Prize: </dt>
                          <dd className="inline font-medium">{w.prize}</dd>
                        </div>
                        <div>
                          <dt className="inline text-deepPurple/50">Round: </dt>
                          <dd className="inline">{w.round_number ?? "—"}</dd>
                        </div>
                        <div>
                          <dt className="inline text-deepPurple/50">Won: </dt>
                          <dd className="inline">{fmtFull(w.won_at)}</dd>
                        </div>
                        <div>
                          <dt className="inline text-deepPurple/50">Status: </dt>
                          <dd className="inline font-medium">
                            {w.picked_up ? "Picked Up" : "Not Picked Up"}
                          </dd>
                        </div>
                        {w.picked_up && w.picked_up_at && (
                          <div>
                            <dt className="inline text-deepPurple/50">
                              Picked up at{" "}
                            </dt>
                            <dd className="inline font-medium text-green-800">
                              {fmtTime(w.picked_up_at)}
                            </dd>
                          </div>
                        )}
                      </dl>

                      {w.picked_up ? (
                        <button
                          onClick={() => setPickup(w.id, false)}
                          disabled={busyId !== null || migrationNeeded}
                          className="btn-ghost w-full py-3.5 text-sm"
                        >
                          {busyId === w.id ? "Saving…" : "Undo Pickup"}
                        </button>
                      ) : (
                        <button
                          onClick={() => setPickup(w.id, true)}
                          disabled={busyId !== null || migrationNeeded}
                          className="btn-primary w-full py-4 text-base"
                        >
                          {busyId === w.id ? "Saving…" : "Mark Picked Up"}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
