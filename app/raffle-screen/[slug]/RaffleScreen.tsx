"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Wheel from "@/components/Wheel";

type ServerWinner = {
  prize: string;
  full_name: string;
  phone_display: string;
  won_at?: string;
};

type Pool = {
  round_id: string | null;
  round_number: number | null;
  frozen_at: string | null;
  total: number;
  remaining: number;
  names: string[];
  winners: ServerWinner[];
};

type Winner = {
  full_name: string;
  phone_display: string;
  prize: string;
  won_at?: string;
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

// Stable per-draw identity so we can tell "already animated this winner"
// from "winner just appeared (probably from the phone remote)".
function drawKey(w: ServerWinner | Winner): string {
  return `${w.prize}::${w.won_at ?? w.full_name}`;
}

export default function RaffleScreen() {
  const [pool, setPool] = useState<Pool | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [spinning, setSpinning] = useState<WheelKey | null>(null);

  // Press F to toggle true browser fullscreen (no Chrome bar / tabs). Only F
  // toggles it — every other key is ignored. The browser exits fullscreen on
  // Escape by itself.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "f" && e.key !== "F") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      e.preventDefault();
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      } else {
        document.documentElement.requestFullscreen().catch(() => {});
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  const [overlays, setOverlays] = useState<{
    gift: Winner | null;
    book: Winner | null;
  }>({ gift: null, book: null });

  const [wheels, setWheels] = useState<Record<WheelKey, WheelState>>({
    gift: { segments: [], winnerIndex: null, pending: null },
    book: { segments: [], winnerIndex: null, pending: null },
  });

  const lastRoundIdRef = useRef<string | null>(null);
  const hasHydratedRef = useRef(false);
  // Track winners we've already responded to (either by animating, or by
  // restoring on refresh). Key is `prize::won_at` — stable across polls,
  // unique per draw. Cleared whenever the round changes.
  const triggeredRef = useRef<Set<string>>(new Set());
  // Mirror of `spinning` for synchronous reads inside the pool effect.
  const spinningRef = useRef<WheelKey | null>(null);

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
    const id = setInterval(fetchPool, 3000);
    return () => clearInterval(id);
  }, [fetchPool]);

  useEffect(() => {
    spinningRef.current = spinning;
  }, [spinning]);

  useEffect(() => {
    if (!pool || pool.round_id == null) return;

    const previousRoundId = lastRoundIdRef.current;
    const currentRoundId = pool.round_id;
    lastRoundIdRef.current = currentRoundId;

    const isFirstHydration = !hasHydratedRef.current;
    const isRoundChange =
      previousRoundId != null && previousRoundId !== currentRoundId;

    if (isRoundChange) {
      // Admin clicked Start New Raffle — reset everything for the new round.
      triggeredRef.current = new Set();
      setWheels({
        gift: { segments: pickSegments(pool.names), winnerIndex: null, pending: null },
        book: { segments: pickSegments(pool.names), winnerIndex: null, pending: null },
      });
      setOverlays({ gift: null, book: null });
      hasHydratedRef.current = true;
      return;
    }

    // Initialize wheel segments if empty (e.g. first paint with non-empty pool).
    setWheels((prev) => {
      const next = { ...prev };
      (["gift", "book"] as WheelKey[]).forEach((k) => {
        if (prev[k].segments.length === 0 && pool.names.length > 0) {
          next[k] = { ...prev[k], segments: pickSegments(pool.names) };
        }
      });
      return next;
    });

    const giftFromServer = pool.winners.find((w) => w.prize === PRIZE_GIFT) ?? null;
    const bookFromServer = pool.winners.find((w) => w.prize === PRIZE_BOOK) ?? null;

    if (isFirstHydration) {
      // Page just opened (incl. a refresh): restore overlays from server
      // immediately (no spin animation — that draw already happened in the
      // past). Mark each existing winner as "already triggered" so subsequent
      // polls don't re-animate them.
      if (giftFromServer) triggeredRef.current.add(drawKey(giftFromServer));
      if (bookFromServer) triggeredRef.current.add(drawKey(bookFromServer));
      setOverlays((prev) => ({
        gift: spinning === "gift" ? prev.gift : (giftFromServer as Winner | null),
        book: spinning === "book" ? prev.book : (bookFromServer as Winner | null),
      }));
      hasHydratedRef.current = true;
      return;
    }

    // Subsequent poll — already hydrated.
    //
    // (a) If the server cleared a winner (admin clicked Reset), drop the
    //     matching overlay so the wheel becomes spinnable again.
    setOverlays((prev) => {
      let next = prev;
      if (!giftFromServer && prev.gift && spinning !== "gift") {
        triggeredRef.current.delete(drawKey(prev.gift));
        next = { ...next, gift: null };
      }
      if (!bookFromServer && prev.book && spinning !== "book") {
        triggeredRef.current.delete(drawKey(prev.book));
        next = { ...next, book: null };
      }
      return next;
    });
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

    // (b) Detect newly-appeared winners (someone tapped Spin on the phone).
    //     Only kick off one animation at a time — if a wheel is already
    //     spinning, the second winner waits for the next poll cycle to
    //     start. The `drawKey` check (`prize::won_at`) makes this idempotent
    //     across polls.
    if (spinningRef.current === null) {
      const candidates: Array<[WheelKey, ServerWinner | null]> = [
        ["gift", giftFromServer],
        ["book", bookFromServer],
      ];
      for (const [key, srv] of candidates) {
        if (!srv) continue;
        if (triggeredRef.current.has(drawKey(srv))) continue;

        triggeredRef.current.add(drawKey(srv));
        spinningRef.current = key;
        setSpinning(key);
        setWheels((prev) => {
          const cur = prev[key];
          const base =
            cur.segments.length > 0 ? cur.segments : pickSegments(pool.names);
          const { segments, index } = placeWinnerInSegments(base, srv.full_name);
          return {
            ...prev,
            [key]: { segments, winnerIndex: index, pending: srv as Winner },
          };
        });
        break; // one animation per detection pass
      }
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
      spinningRef.current = which;
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
          spinningRef.current = null;
          setSpinning(null);
          setError(data?.error || "Draw failed.");
          return;
        }
        const winner = data.winner as Winner;
        // Claim this draw — stops the pool effect from re-animating when
        // the next poll surfaces the same winner.
        triggeredRef.current.add(drawKey(winner));
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
        spinningRef.current = null;
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
      spinningRef.current = null;
      setSpinning(null);
      fetchPool();
    },
    [wheels, fetchPool]
  );

  return (
    <div className="screen-bg fixed inset-0 overflow-hidden">
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
          // Nudge the logo down ~35px on the 1920x1080 LED wall (layout only).
          style={{ transform: "translateY(35px)" }}
          className={`w-[135px] xl:w-[200px] h-auto mb-0 ${
            giftWon || bookWon ? "logo-glow-winner" : "logo-glow"
          }`}
        />

        <div className="w-full flex items-start justify-around px-10 xl:px-20 -mt-[36px] xl:-mt-[40px]">
          {/*
            Each wheel group (title + arrow + wheel + winner popup + spin button)
            is moved as one unit via a transform on its wrapper. Transforms don't
            affect layout flow, so this is positioning only — nothing inside the
            Wheel changes. Values target the 1920x1080 LED wall: both wheels drop
            115px and pull 45px toward center.
          */}
          <div style={{ transform: "translate(45px, 115px)" }}>
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
          </div>

          <div style={{ transform: "translate(-45px, 115px)" }}>
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
