"use client";

import { useEffect, useRef, useState } from "react";

type Winner = {
  full_name: string;
  phone_display: string;
  prize: string;
};

type Props = {
  prizeTitle: string;
  /** Names rendered on the wheel segments. Order matters — winnerIndex references this. */
  segments: string[];
  /** When set, the wheel spins and lands with this segment under the pointer. */
  winnerIndex: number | null;
  /** True while the parent is waiting for the server or the wheel is animating. */
  spinning: boolean;
  disabled?: boolean;
  /** When set, the wheel shows a premium glass card with the winner. */
  winnerOverlay: Winner | null;
  /** User asked to spin (clicked wheel or button). Parent will hit the server. */
  onSpinClick: () => void;
  /** Animation finished and the pointer is on the winner segment. */
  onSpinComplete: () => void;
};

const SPIN_DURATION_MS = 16000;
const SPIN_EASING = "cubic-bezier(0.05, 0.85, 0.20, 1.0)";
const BASE_SPINS = 14;

// Localized confetti — gentle 8-second burst from the popup center, contained
// to the wheel's own canvas so nothing splashes off the page edges.
const CONFETTI_DURATION_MS = 8000;
const CONFETTI_PALETTE = [
  "#B8935A",
  "#D4B988",
  "#7E4F99",
  "#C9A6CC",
  "#FFF8EC",
  "#F4C8C8",
];

const PLACEHOLDER_COUNT = 20;
const PLACEHOLDER_SEGMENTS: string[] = Array.from(
  { length: PLACEHOLDER_COUNT },
  () => ""
);

export default function Wheel({
  prizeTitle,
  segments,
  winnerIndex,
  spinning,
  disabled,
  winnerOverlay,
  onSpinClick,
  onSpinComplete,
}: Props) {
  const [rotation, setRotation] = useState(0);
  const lastWinnerRef = useRef<number | null>(null);
  const wheelRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Keep onSpinComplete in a ref so the completion timer below never re-arms
  // mid-spin when the parent's callback identity changes (which it does often
  // because completeSpin closes over wheel state).
  const onSpinCompleteRef = useRef(onSpinComplete);
  useEffect(() => {
    onSpinCompleteRef.current = onSpinComplete;
  }, [onSpinComplete]);

  // Drive the rotation animation when winnerIndex transitions to a number.
  useEffect(() => {
    if (winnerIndex == null) {
      lastWinnerRef.current = null;
      return;
    }
    if (lastWinnerRef.current === winnerIndex) return;
    lastWinnerRef.current = winnerIndex;

    const N = Math.max(segments.length, 1);
    const segAngle = 360 / N;
    const segCenter = winnerIndex * segAngle + segAngle / 2;
    const jitter = (Math.random() - 0.5) * segAngle * 0.55;
    const targetMod = (360 - segCenter + jitter + 360 * 4) % 360;
    const currentMod = ((rotation % 360) + 360) % 360;
    const delta = ((targetMod - currentMod) + 360) % 360;
    const next = rotation + BASE_SPINS * 360 + delta;
    setRotation(next);
  }, [winnerIndex, segments.length, rotation]);

  // Fire onSpinComplete exactly SPIN_DURATION_MS after the spin starts.
  // Verified at runtime (real browser): timer fires within ~85ms of the
  // 16000ms target on dev + prod. setTimeout is the deterministic signal —
  // transitionend was firing early in some cases on intermediate transition
  // flushes before the final 16s one was live.
  useEffect(() => {
    if (winnerIndex == null) return;
    const id = window.setTimeout(() => {
      onSpinCompleteRef.current();
    }, SPIN_DURATION_MS + 80);
    return () => window.clearTimeout(id);
  }, [winnerIndex]);

  // Localized confetti burst: fires when winnerOverlay appears, tapers across
  // ~8s, and is bound to a canvas sized to the wheel container so particles
  // can't leave the popup area.
  //
  // useWorker is intentionally `false`: with `true`, canvas-confetti calls
  // `canvas.transferControlToOffscreen()` which can only succeed once per
  // canvas. React StrictMode double-invokes effects on mount, so the second
  // call fails and the library falls back to its singleton full-screen
  // canvas — which is what was leaking gift-wheel confetti onto the book
  // side. Disabling the worker keeps each wheel's confetti pinned to its own
  // canvas element.
  useEffect(() => {
    if (!winnerOverlay) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Size the bitmap to the wheel container at device pixel ratio so
    // particles render sharply. canvas-confetti's `resize:true` keeps it in
    // sync on viewport changes after this.
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));

    let cancelled = false;
    let raf = 0;
    let myConfetti: ((opts: object) => void) | null = null;
    let resetConfetti: (() => void) | null = null;

    (async () => {
      const mod = await import("canvas-confetti");
      if (cancelled) return;
      const instance = mod.default.create(canvas, {
        resize: true,
        useWorker: false,
      });
      myConfetti = instance;
      // The factory returns a function that also has a `.reset` method on the
      // underlying default export; for the instance we just stop emitting and
      // let particles fall out naturally.
      resetConfetti = () => {
        // Clearing the canvas is enough — no more emission happens because we
        // also stop the rAF loop in the cleanup below.
        const ctx = canvas.getContext("2d");
        if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      };

      const end = Date.now() + CONFETTI_DURATION_MS;
      const start = Date.now();

      const frame = () => {
        if (cancelled || !myConfetti) return;
        const elapsed = Date.now() - start;
        const t = elapsed / CONFETTI_DURATION_MS;
        // Taper: heavy burst at start, sparkle through the middle, fade at end.
        // Particles per frame ranges 4 → 1 → 0 across the duration.
        let particles = 0;
        if (t < 0.15) particles = 4;
        else if (t < 0.45) particles = 2;
        else if (t < 0.85) particles = 1;
        else if (Math.random() < 0.45) particles = 1;

        if (particles > 0) {
          myConfetti({
            particleCount: particles,
            angle: 90,
            spread: 360,
            startVelocity: 18,
            gravity: 0.55,
            decay: 0.93,
            ticks: 220,
            scalar: 0.7,
            origin: { x: 0.5, y: 0.5 },
            colors: CONFETTI_PALETTE,
            disableForReducedMotion: true,
          });
        }

        if (Date.now() < end) {
          raf = requestAnimationFrame(frame);
        }
      };
      raf = requestAnimationFrame(frame);
    })();

    return () => {
      cancelled = true;
      if (raf) cancelAnimationFrame(raf);
      // StrictMode-safe teardown: clear the canvas so a re-mount doesn't show
      // stale particles, and let the instance get GC'd.
      if (resetConfetti) resetConfetti();
    };
  }, [winnerOverlay]);

  const renderedSegments = segments.length > 0 ? segments : PLACEHOLDER_SEGMENTS;
  const N = renderedSegments.length;
  const segAngle = 360 / N;

  const handleClick = () => {
    if (disabled || spinning || winnerOverlay) return;
    onSpinClick();
  };

  const showOverlay = winnerOverlay != null;

  return (
    <div className="flex flex-col items-center select-none">
      <h3 className="font-display text-ivory text-base xl:text-xl tracking-[0.16em] mb-1 xl:mb-2 drop-shadow-[0_4px_10px_rgba(0,0,0,0.45)]">
        {prizeTitle}
      </h3>

      <div
        className="relative"
        style={{
          width: "min(640px, 34vw, 58vh)",
          aspectRatio: "1 / 1",
        }}
      >
        {/* Soft glow behind wheel */}
        <div
          className="absolute -inset-6 rounded-full pointer-events-none"
          style={{
            background:
              "radial-gradient(closest-side, rgba(255,248,236,0.4) 0%, rgba(255,248,236,0) 70%)",
          }}
        />

        {/* Gold rim */}
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background:
              "conic-gradient(from 0deg, #B8935A, #E6CC8E, #B8935A, #E6CC8E, #B8935A, #E6CC8E, #B8935A, #E6CC8E, #B8935A)",
            boxShadow:
              "0 30px 70px -20px rgba(0,0,0,0.65), inset 0 0 0 4px rgba(255,248,236,0.7)",
          }}
        />

        {/* Spinning wheel */}
        <div
          ref={wheelRef}
          onClick={handleClick}
          className="absolute inset-3 rounded-full overflow-hidden"
          style={{
            cursor: disabled || spinning || showOverlay ? "default" : "pointer",
            transform: `rotate(${rotation}deg)`,
            transition:
              winnerIndex == null
                ? "none"
                : `transform ${SPIN_DURATION_MS}ms ${SPIN_EASING}`,
            background: "#FFF8EC",
            boxShadow: "inset 0 0 0 2px rgba(184,147,90,0.45)",
          }}
        >
          <svg
            viewBox="-100 -100 200 200"
            className="w-full h-full block"
            aria-hidden
          >
            {renderedSegments.map((_name, i) => {
              const start = i * segAngle;
              const end = start + segAngle;
              const fill = SEGMENT_FILLS[i % SEGMENT_FILLS.length];
              return (
                <path
                  key={`seg-${i}`}
                  d={describeSlice(start, end, 100)}
                  fill={fill}
                  stroke="rgba(62,31,82,0.18)"
                  strokeWidth="0.4"
                />
              );
            })}

            {renderedSegments.map((name, i) => {
              if (!name) return null;
              const midAngle = i * segAngle + segAngle / 2;
              return (
                <g
                  key={`label-${i}`}
                  transform={`rotate(${midAngle}) translate(0, -62)`}
                >
                  <text
                    x={0}
                    y={0}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    transform="rotate(90)"
                    fontFamily="PFDinComp, Inter, sans-serif"
                    fontSize={fontSizeForN(N)}
                    fontWeight={600}
                    fill="#3E1F52"
                    style={{ letterSpacing: "0.3px" }}
                  >
                    {smartLabel(name, N)}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        {/* Center hub */}
        <div
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full pointer-events-none"
          style={{
            width: "18%",
            height: "18%",
            background:
              "radial-gradient(circle at 30% 30%, #FFF8EC, #E8D4A8 55%, #B8935A 100%)",
            boxShadow:
              "0 8px 20px -6px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.7)",
            border: "3px solid #FFF8EC",
          }}
        >
          <div
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{
              width: "32%",
              height: "32%",
              background: "#3E1F52",
              boxShadow: "inset 0 0 0 2px #B8935A",
            }}
          />
        </div>

        {/* Pointer */}
        <div
          className="absolute left-1/2 -translate-x-1/2 -top-2 z-10 pointer-events-none"
          style={{
            width: 0,
            height: 0,
            borderLeft: "18px solid transparent",
            borderRight: "18px solid transparent",
            borderTop: "30px solid #3E1F52",
            filter: "drop-shadow(0 4px 6px rgba(0,0,0,0.55))",
          }}
        />

        {/* Localized confetti — sits behind the glass popup, contained to the wheel area */}
        <canvas
          ref={canvasRef}
          className="absolute inset-0 z-[15] pointer-events-none"
          style={{ width: "100%", height: "100%" }}
        />

        {/* Winner overlay */}
        {showOverlay && (
          <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
            <div className="glass rounded-[32px] px-5 py-7 xl:px-8 xl:py-9 text-center text-deepPurple w-[90%] max-w-[380px] shadow-[0_30px_80px_-20px_rgba(0,0,0,0.65)]">
              <p className="font-display tracking-[0.4em] text-deepPurple/55 text-[10px] xl:text-xs mb-2">
                {winnerOverlay!.prize.toUpperCase()}
              </p>
              <h2 className="font-display tracking-[0.12em] leading-none text-4xl xl:text-5xl">
                WINNER
              </h2>
              <div className="mx-auto w-14 h-px bg-gradient-to-r from-transparent via-gold to-transparent my-3 xl:my-4" />
              <p className="font-display tracking-wide leading-tight text-2xl xl:text-3xl mb-2">
                {winnerOverlay!.full_name.toUpperCase()}
              </p>
              <p className="text-deepPurple/70 font-display tracking-[0.15em] text-sm xl:text-base">
                {winnerOverlay!.phone_display}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Spin slot — reserved height so the column layout never reflows */}
      <div className="mt-2 xl:mt-3 flex items-center justify-center h-[36px] xl:h-[42px]">
        {!showOverlay && (
          <button
            onClick={handleClick}
            disabled={disabled || spinning}
            className="btn-gold px-8 xl:px-10 py-1.5 xl:py-2 text-sm xl:text-base tracking-[0.2em]"
          >
            {spinning ? "Spinning…" : "Spin"}
          </button>
        )}
      </div>
    </div>
  );
}

// ------------ helpers ------------

const SEGMENT_FILLS = [
  "#FFF8EC",
  "#E8D4A8",
  "#FFF8EC",
  "#D9B3D4",
  "#FFF8EC",
  "#E8D4A8",
  "#FFF8EC",
  "#B894C9",
];

function describeSlice(startDeg: number, endDeg: number, r: number): string {
  const startRad = ((startDeg - 90) * Math.PI) / 180;
  const endRad = ((endDeg - 90) * Math.PI) / 180;
  const x1 = Math.cos(startRad) * r;
  const y1 = Math.sin(startRad) * r;
  const x2 = Math.cos(endRad) * r;
  const y2 = Math.sin(endRad) * r;
  const largeArc = endDeg - startDeg > 180 ? 1 : 0;
  return `M 0 0 L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;
}

function fontSizeForN(n: number): number {
  if (n <= 12) return 7;
  if (n <= 18) return 6;
  if (n <= 24) return 5.2;
  return 4.6;
}

function smartLabel(name: string, n: number): string {
  if (!name) return "";
  const max = n <= 12 ? 18 : n <= 18 ? 14 : n <= 24 ? 12 : 10;
  const clean = name.trim().toUpperCase();
  if (clean.length <= max) return clean;
  const parts = clean.split(/\s+/);
  if (parts.length >= 2) {
    const abbr = `${parts[0][0]}. ${parts.slice(1).join(" ")}`;
    if (abbr.length <= max) return abbr;
    return abbr.slice(0, max - 1) + "…";
  }
  return clean.slice(0, max - 1) + "…";
}
