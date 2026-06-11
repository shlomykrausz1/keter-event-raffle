"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Wheel from "@/components/Wheel";

type Pool = {
  round_id: string | null;
  round_number: number | null;
  frozen_at: string | null;
  total: number;
  remaining: number;
  names: string[];
  winners: Array<{ prize: string; full_name: string; phone_display: string }>;
};

type Winner = {
  full_name: string;
  phone_display: string;
  prize: string;
};

type WheelKey = "gift" | "book";

type WheelState = {
  segments: string[];
  winnerIndex: number | null;
  pending: Winner | null;
};

const PRIZE_GIFT = "$100 Gift Card";
const PRIZE_BOOK = "Any Book In Store";
const SEGMENTS_PER_WHEEL = 20;

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickSegments(pool: string[]): string[] {
  if (pool.length === 0) return [];
  if (pool.length <= SEGMENTS_PER_WHEEL) return shuffle(pool);
  return shuffle(pool).slice(0, SEGMENTS_PER_WHEEL);
}

function placeWinnerInSegments(
  segments: string[],
  winnerName: string
): { segments: string[]; index: number } {
  const existing = segments.indexOf(winnerName);
  if (existing >= 0) return { segments, index: existing };
  if (segments.length === 0) {
    return { segments: [winnerName], index: 0 };
  }
  const next = [...segments];
  const idx = Math.floor(Math.random() * next.length);
  next[idx] = winnerName;
  return { segments: next, index: idx };
}

export default function RaffleScreen() {
  const [pool, setPool] = useState<Pool | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [spinning, setSpinning] = useState<WheelKey | null>(null);

  const [overlays, setOverlays] = useState<{
    gift: Winner | null;
    book: Winner | null;
  }>({ gift: null, book: null });

  const [wheels, setWheels] = useState<Record<WheelKey, WheelState>>({
    gift: { segments: [], winnerIndex: null, pending: null },
    book: { segments: [], winnerIndex: null, pending: null },
  });

  const lastRoundIdRef = useRef<string | null>(null);

  const fetchPool = useCallback(async () => {
    try {
      const res = await fetch("/api/raffle/pool", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || "No active raffle round.");
        setPool(null);
        return;
      }
      setError(null);
      setPool(data);
    } catch {
      setError("Could not load raffle pool.");
    }
  }, []);

  useEffect(() => {
    fetchPool();
    const id = setInterval(fetchPool, 5000);
    return () => clearInterval(id);
  }, [fetchPool]);

  useEffect(() => {
    if (!pool || pool.round_id == null) return;

    const newRound = lastRoundIdRef.current !== pool.round_id;
    lastRoundIdRef.current = pool.round_id;

    if (newRound) {
      setWheels({
        gift: {
          segments: pickSegments(pool.names),
          winnerIndex: null,
          pending: null,
        },
        book: {
          segments: pickSegments(pool.names),
          winnerIndex: null,
          pending: null,
        },
      });
      setOverlays({ gift: null, book: null });
      return;
    }

    setWheels((prev) => {
      const next = { ...prev };
      (["gift", "book"] as WheelKey[]).forEach((k) => {
        if (prev[k].segments.length === 0 && pool.names.length > 0) {
          next[k] = { ...prev[k], segments: pickSegments(pool.names) };
        }
      });
      return next;
    });

    setOverlays((prev) => {
      const giftFromServer = pool.winners.find((w) => w.prize === PRIZE_GIFT) ?? null;
      const bookFromServer = pool.winners.find((w) => w.prize === PRIZE_BOOK) ?? null;
      // While a wheel is mid-spin we keep the current overlay (so the popup
      // doesn't flash in before the wheel stops). Otherwise we follow the
      // server — that way "Reset Current Raffle" (winners removed server-side)
      // also clears the popup here.
      return {
        gift:
          spinning === "gift" ? prev.gift : (giftFromServer as Winner | null),
        book:
          spinning === "book" ? prev.book : (bookFromServer as Winner | null),
      };
    });

    // When the server has no winners for this round, also clear any pending
    // wheel state so both wheels become spinnable again after a reset.
    if (pool.winners.length === 0) {
      setWheels((prev) => {
        let changed = false;
        const next = { ...prev };
        (["gift", "book"] as WheelKey[]).forEach((k) => {
          if (spinning === k) return;
          if (prev[k].winnerIndex != null || prev[k].pending != null) {
            next[k] = { ...prev[k], winnerIndex: null, pending: null };
            changed = true;
          }
        });
        return changed ? next : prev;
      });
    }
  }, [pool, spinning]);

  const giftWon = overlays.gift != null;
  const bookWon = overlays.book != null;
  const hasPool = !!pool && pool.round_id != null;
  const canDraw = hasPool && (pool?.remaining ?? 0) > 0;

  const requestDraw = useCallback(
    async (which: WheelKey) => {
      if (spinning) return;
      const prize = which === "gift" ? PRIZE_GIFT : PRIZE_BOOK;
      setSpinning(which);
      setError(null);
      try {
        const res = await fetch("/api/raffle/draw", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prize }),
        });
        const data = await res.json();
        if (!res.ok) {
          setSpinning(null);
          setError(data?.error || "Draw failed.");
          return;
        }
        const winner = data.winner as Winner;
        setWheels((prev) => {
          const cur = prev[which];
          const base =
            cur.segments.length > 0 ? cur.segments : pickSegments(pool?.names ?? []);
          const { segments, index } = placeWinnerInSegments(base, winner.full_name);
          return {
            ...prev,
            [which]: { segments, winnerIndex: index, pending: winner },
          };
        });
      } catch {
        setSpinning(null);
        setError("Network error during draw.");
      }
    },
    [spinning, pool]
  );

  const completeSpin = useCallback(
    (which: WheelKey) => {
      const winner = wheels[which].pending;
      if (winner) {
        setOverlays((prev) => ({ ...prev, [which]: winner }));
      }
      setSpinning(null);
      fetchPool();
    },
    [wheels, fetchPool]
  );

  return (
    <div className="screen-bg fixed inset-0 overflow-hidden">
      {/* Round info pill — corner element, doesn't affect layout */}
      {pool && hasPool && (
        <div className="absolute top-6 left-6 xl:top-8 xl:left-10 z-10">
          <div className="glass rounded-full px-5 py-2.5 text-deepPurple">
            <span className="font-display tracking-[0.18em] text-xs xl:text-sm uppercase opacity-70">
              Round {pool.round_number}
            </span>
            <span className="mx-3 opacity-30">|</span>
            <span className="font-display tracking-[0.1em] text-sm xl:text-base">
              {pool.remaining} eligible
            </span>
          </div>
        </div>
      )}

      {/*
        MAIN STAGE — top 2/3 of the screen.
        Contains the logo + both wheels (titles, circles, buttons, popups).
        Bottom 1/3 stays empty so the background can breathe.
        Layout is locked: wheels are sized by vw/vh caps, button slot has a
        reserved height, popups are absolutely positioned inside their wheel.
      */}
      <div className="absolute inset-x-0 top-0 flex flex-col items-center pt-4 xl:pt-6 z-[5]">
        <Image
          src="/keter-logo.png"
          alt="The Big Keter Event - Monsey"
          width={300}
          height={220}
          priority
          className="w-[135px] xl:w-[200px] h-auto drop-shadow-[0_14px_22px_rgba(0,0,0,0.5)] mb-0"
        />

        <div className="w-full flex items-start justify-around px-10 xl:px-20 -mt-[36px] xl:-mt-[40px]">
          <Wheel
            prizeTitle="$100 GIFT CARD"
            segments={wheels.gift.segments}
            winnerIndex={wheels.gift.winnerIndex}
            spinning={spinning === "gift"}
            disabled={!canDraw || giftWon || spinning !== null}
            winnerOverlay={overlays.gift}
            onSpinClick={() => requestDraw("gift")}
            onSpinComplete={() => completeSpin("gift")}
          />

          <Wheel
            prizeTitle="ANY BOOK IN STORE"
            segments={wheels.book.segments}
            winnerIndex={wheels.book.winnerIndex}
            spinning={spinning === "book"}
            disabled={!canDraw || bookWon || spinning !== null}
            winnerOverlay={overlays.book}
            onSpinClick={() => requestDraw("book")}
            onSpinComplete={() => completeSpin("book")}
          />
        </div>
      </div>

      {/* No active round overlay */}
      {!hasPool && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-8 z-20">
          <div className="glass rounded-4xl p-12 max-w-2xl">
            <h2 className="font-display text-deepPurple text-4xl xl:text-5xl mb-4">
              WAITING FOR RAFFLE TO START
            </h2>
            <p className="text-deepPurple/70 text-xl">
              {error || "The host hasn't started a raffle round yet."}
            </p>
          </div>
        </div>
      )}

      {/* Error toast (non-blocking; corner, no layout impact) */}
      {error && hasPool && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-30">
          <div className="bg-eventRed/90 text-ivory rounded-full px-5 py-2 text-sm shadow-lg">
            {error}
          </div>
        </div>
      )}
    </div>
  );
}
