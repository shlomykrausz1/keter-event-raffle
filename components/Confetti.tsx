"use client";

import { useEffect } from "react";

type Props = {
  fire: boolean;
  durationMs?: number;
};

/**
 * Drop-in confetti burst.
 * Set `fire` to true to trigger; parent should reset to false after.
 */
export default function Confetti({ fire, durationMs = 2500 }: Props) {
  useEffect(() => {
    if (!fire) return;
    let cancelled = false;
    let raf = 0;

    (async () => {
      const mod = await import("canvas-confetti");
      const confetti = mod.default;

      const end = Date.now() + durationMs;
      const palette = ["#B8935A", "#D4B988", "#7E4F99", "#C9A6CC", "#FFF8EC", "#F4C8C8"];

      const frame = () => {
        if (cancelled) return;

        confetti({
          particleCount: 4,
          angle: 60,
          spread: 75,
          startVelocity: 55,
          origin: { x: 0, y: 0.65 },
          colors: palette,
          scalar: 1.1,
        });
        confetti({
          particleCount: 4,
          angle: 120,
          spread: 75,
          startVelocity: 55,
          origin: { x: 1, y: 0.65 },
          colors: palette,
          scalar: 1.1,
        });

        if (Date.now() < end) {
          raf = requestAnimationFrame(frame);
        }
      };
      raf = requestAnimationFrame(frame);
    })();

    return () => {
      cancelled = true;
      if (raf) cancelAnimationFrame(raf);
    };
  }, [fire, durationMs]);

  return null;
}
