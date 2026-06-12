"use client";

import { useCallback, useEffect, useState } from "react";

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

  return (
    <main className="min-h-screen px-4 py-8">
      <div className="max-w-2xl mx-auto">
        <header className="text-center mb-6">
          <h1 className="font-display text-deepPurple text-3xl tracking-[0.12em]">
            KETER STAFF
          </h1>
          <p className="text-deepPurple/60 text-xs uppercase tracking-[0.2em] mt-1">
            Prize Pickup
          </p>
        </header>

        {migrationNeeded && (
          <div className="bg-eventRed/90 text-ivory rounded-2xl px-5 py-3 text-sm mb-4 text-center">
            Pickup tracking is not set up yet — ask the event operator to run
            the database migration.
          </div>
        )}

        {error && (
          <div className="bg-eventRed/90 text-ivory rounded-2xl px-5 py-3 text-sm mb-4 text-center">
            {error}
          </div>
        )}

        {winners == null ? (
          <div className="glass rounded-3xl p-8 text-center text-deepPurple/70">
            Loading…
          </div>
        ) : winners.length === 0 ? (
          <div className="glass rounded-3xl p-8 text-center text-deepPurple/70">
            No winners yet.
          </div>
        ) : (
          <div className="space-y-4">
            {winners.map((w) => (
              <div
                key={w.id}
                className={`rounded-3xl p-5 ${
                  w.picked_up
                    ? "bg-green-100/85 border border-green-300/70 shadow-md"
                    : "glass"
                }`}
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div>
                    <h2 className="font-display text-deepPurple text-xl tracking-wide leading-tight">
                      {w.full_name}
                    </h2>
                    <p className="text-deepPurple/70 text-sm font-medium">
                      {w.prize}
                      {w.round_number != null && (
                        <span className="text-deepPurple/50">
                          {" "}
                          · Round {w.round_number}
                        </span>
                      )}
                    </p>
                  </div>
                  {w.picked_up && (
                    <span className="shrink-0 bg-green-600 text-white text-[11px] uppercase tracking-[0.14em] rounded-full px-3 py-1 font-medium">
                      Picked Up
                    </span>
                  )}
                </div>

                <dl className="text-sm text-deepPurple/80 space-y-0.5 mb-3">
                  <div>
                    <dt className="inline text-deepPurple/50">Phone: </dt>
                    <dd className="inline font-medium">{w.phone_display}</dd>
                  </div>
                  <div>
                    <dt className="inline text-deepPurple/50">Email: </dt>
                    <dd className="inline">{w.email}</dd>
                  </div>
                  <div>
                    <dt className="inline text-deepPurple/50">Address: </dt>
                    <dd className="inline">
                      {w.street_address}, {w.zip_code}
                    </dd>
                  </div>
                  <div>
                    <dt className="inline text-deepPurple/50">Won: </dt>
                    <dd className="inline">{fmtFull(w.won_at)}</dd>
                  </div>
                  {w.picked_up && w.picked_up_at && (
                    <div>
                      <dt className="inline text-deepPurple/50">Picked up at </dt>
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
                    className="btn-ghost px-5 py-2 text-xs"
                  >
                    {busyId === w.id ? "Saving…" : "Undo Pickup"}
                  </button>
                ) : (
                  <button
                    onClick={() => setPickup(w.id, true)}
                    disabled={busyId !== null || migrationNeeded}
                    className="btn-primary px-6 py-2.5 text-sm"
                  >
                    {busyId === w.id ? "Saving…" : "Mark Picked Up"}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
