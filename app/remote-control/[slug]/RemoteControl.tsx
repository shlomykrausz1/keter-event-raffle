"use client";

import { useCallback, useEffect, useState } from "react";

type Winner = {
  prize: string;
  full_name: string;
  phone_display: string;
  won_at?: string;
};

type Pool = {
  round_id: string | null;
  round_number: number | null;
  total: number;
  remaining: number;
  winners: Winner[];
};

const PRIZE_GIFT = "$100 Gift Card";
const PRIZE_BOOK = "Any Book In Store";

type Busy = null | "gift" | "book" | "start" | "reset";

export default function RemoteControl({ slug }: { slug: string }) {
  const [pool, setPool] = useState<Pool | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [toast, setToast] = useState<{ kind: "ok" | "err"; msg: string } | null>(
    null
  );

  const fetchPool = useCallback(async () => {
    try {
      const res = await fetch("/api/raffle/pool", { cache: "no-store" });
      if (!res.ok) return;
      setPool(await res.json());
    } catch {
      /* network blip — next poll will catch up */
    }
  }, []);

  useEffect(() => {
    fetchPool();
    const id = setInterval(fetchPool, 2500);
    return () => clearInterval(id);
  }, [fetchPool]);

  const showToast = (kind: "ok" | "err", msg: string) => {
    setToast({ kind, msg });
    window.setTimeout(() => setToast(null), 3500);
  };

  const giftWinner = pool?.winners.find((w) => w.prize === PRIZE_GIFT) ?? null;
  const bookWinner = pool?.winners.find((w) => w.prize === PRIZE_BOOK) ?? null;
  const hasRound = !!pool && pool.round_id != null;

  const draw = async (which: "gift" | "book") => {
    const prize = which === "gift" ? PRIZE_GIFT : PRIZE_BOOK;
    const label = which === "gift" ? "$100 Gift Card" : "Any Book";
    if (!window.confirm(`Spin ${label} now?`)) return;
    setBusy(which);
    try {
      const res = await fetch("/api/raffle/draw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prize }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast("err", data?.error || "Draw failed.");
      } else {
        showToast(
          "ok",
          `Winner saved: ${data?.winner?.full_name ?? ""}. LED screen will spin shortly.`
        );
      }
    } catch {
      showToast("err", "Network error.");
    } finally {
      setBusy(null);
      fetchPool();
    }
  };

  const startRound = async () => {
    if (!window.confirm("Start a new raffle round?")) return;
    setBusy("start");
    try {
      const res = await fetch("/api/raffle/start", {
        method: "POST",
        headers: { "x-remote-slug": slug },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast("err", data?.error || "Failed to start round.");
      } else {
        showToast(
          "ok",
          `Round ${data.round_number} started with ${data.pool_size} entries.`
        );
      }
    } catch {
      showToast("err", "Network error.");
    } finally {
      setBusy(null);
      fetchPool();
    }
  };

  const resetRound = async () => {
    if (!window.confirm("Reset current raffle winners and redraw this same raffle?"))
      return;
    setBusy("reset");
    try {
      const res = await fetch("/api/raffle/reset", {
        method: "POST",
        headers: { "x-remote-slug": slug },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast("err", data?.error || "Failed to reset round.");
      } else {
        showToast(
          "ok",
          `Round ${data.round_number} reset — cleared ${data.winners_cleared} winner${
            data.winners_cleared === 1 ? "" : "s"
          }.`
        );
      }
    } catch {
      showToast("err", "Network error.");
    } finally {
      setBusy(null);
      fetchPool();
    }
  };

  return (
    <main className="min-h-screen bg-[#1a0e26] text-ivory">
      <div className="max-w-md mx-auto px-5 pt-8 pb-12">
        <header className="text-center mb-6">
          <p className="text-ivory/60 uppercase tracking-[0.22em] text-[11px] mb-1">
            The Big Keter Event
          </p>
          <h1 className="font-display text-3xl tracking-[0.12em]">REMOTE</h1>
        </header>

        <section className="rounded-3xl bg-white/5 ring-1 ring-white/10 p-5 mb-5">
          {!pool ? (
            <p className="text-center text-ivory/60 py-3">Loading…</p>
          ) : !hasRound ? (
            <p className="text-center text-ivory/80 py-3 text-base">
              Waiting for raffle to start
            </p>
          ) : (
            <dl className="grid grid-cols-2 gap-y-3 gap-x-4 text-sm">
              <dt className="text-ivory/55 uppercase tracking-wider text-[10px]">
                Round
              </dt>
              <dd className="text-right font-display text-xl tabular-nums">
                {pool.round_number}
              </dd>
              <dt className="text-ivory/55 uppercase tracking-wider text-[10px]">
                Entries
              </dt>
              <dd className="text-right font-display text-xl tabular-nums">
                {pool.total}
              </dd>
              <dt className="text-ivory/55 uppercase tracking-wider text-[10px]">
                Remaining
              </dt>
              <dd className="text-right font-display text-xl tabular-nums">
                {pool.remaining}
              </dd>
            </dl>
          )}
        </section>

        <PrizeRow
          label="$100 Gift Card"
          winner={giftWinner}
          disabled={!hasRound || !!giftWinner || busy !== null}
          busy={busy === "gift"}
          onSpin={() => draw("gift")}
        />

        <PrizeRow
          label="Any Book"
          winner={bookWinner}
          disabled={!hasRound || !!bookWinner || busy !== null}
          busy={busy === "book"}
          onSpin={() => draw("book")}
        />

        <div className="mt-6 grid gap-3">
          <button
            onClick={startRound}
            disabled={busy !== null}
            className="w-full py-4 rounded-2xl font-display tracking-[0.18em] text-base bg-gradient-to-b from-gold-light to-gold text-deepPurple shadow-lg active:translate-y-[1px] disabled:opacity-50"
          >
            {busy === "start" ? "STARTING…" : "START NEW RAFFLE"}
          </button>
          <button
            onClick={resetRound}
            disabled={busy !== null || !hasRound}
            className="w-full py-4 rounded-2xl font-display tracking-[0.18em] text-sm bg-white/10 ring-1 ring-white/15 text-ivory active:translate-y-[1px] disabled:opacity-40"
          >
            {busy === "reset" ? "RESETTING…" : "RESET CURRENT RAFFLE"}
          </button>
        </div>

        <p className="mt-8 text-center text-ivory/40 text-[11px] uppercase tracking-[0.18em]">
          Remote control · keep page open
        </p>
      </div>

      {toast && (
        <div className="fixed inset-x-4 bottom-6 z-50">
          <div
            className={`mx-auto max-w-md rounded-2xl px-5 py-3 text-center text-sm shadow-lg ${
              toast.kind === "ok"
                ? "bg-deepPurple text-ivory ring-1 ring-gold/40"
                : "bg-eventRed text-ivory"
            }`}
          >
            {toast.msg}
          </div>
        </div>
      )}
    </main>
  );
}

function PrizeRow({
  label,
  winner,
  disabled,
  busy,
  onSpin,
}: {
  label: string;
  winner: Winner | null;
  disabled: boolean;
  busy: boolean;
  onSpin: () => void;
}) {
  return (
    <section className="rounded-3xl bg-white/5 ring-1 ring-white/10 p-4 mb-3">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="font-display tracking-[0.14em] text-base">{label.toUpperCase()}</h2>
        <span
          className={`text-[11px] uppercase tracking-[0.18em] ${
            winner ? "text-gold" : "text-ivory/50"
          }`}
        >
          {winner ? "Complete" : "Pending"}
        </span>
      </div>
      {winner && (
        <p className="text-ivory/80 text-sm mb-3 leading-snug">
          <span className="font-medium">{winner.full_name}</span>
          {winner.phone_display ? (
            <span className="text-ivory/55"> · {winner.phone_display}</span>
          ) : null}
        </p>
      )}
      <button
        onClick={onSpin}
        disabled={disabled}
        className="w-full py-4 rounded-2xl font-display tracking-[0.18em] text-base bg-deepPurple/80 ring-1 ring-gold/40 text-ivory active:translate-y-[1px] disabled:opacity-40"
      >
        {busy ? "SUBMITTING…" : winner ? "COMPLETE" : `SPIN ${label.toUpperCase()}`}
      </button>
    </section>
  );
}
