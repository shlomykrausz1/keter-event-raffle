/**
 * Dreamy mountain ambient background.
 * CSS gradient sky + layered SVG mountain silhouettes + soft haze overlays.
 * Used by /enter, /login, /admin.
 */
export default function Background({ withImage = true }: { withImage?: boolean }) {
  return (
    <div
      aria-hidden
      className="fixed inset-0 -z-10 overflow-hidden"
      style={{
        background:
          "linear-gradient(180deg, #F8D9C4 0%, #F4C8C8 28%, #D9B3D4 62%, #B894C9 100%)",
      }}
    >
      {/* Top haze */}
      <div
        className="absolute inset-x-0 top-0 h-1/2"
        style={{
          background:
            "linear-gradient(180deg, rgba(255, 248, 236, 0.55) 0%, rgba(255, 248, 236, 0) 100%)",
        }}
      />

      {withImage && (
        <svg
          className="absolute inset-x-0 bottom-0 w-full"
          style={{ height: "62%" }}
          viewBox="0 0 1200 540"
          preserveAspectRatio="xMidYMax slice"
        >
          {/* Distant range — pale mauve, almost merging with the sky */}
          <path
            d="M0 360 L80 300 L160 340 L240 270 L340 320 L430 250 L520 310 L620 260 L720 320 L820 270 L920 330 L1020 280 L1100 320 L1200 290 L1200 540 L0 540 Z"
            fill="rgba(186, 144, 188, 0.45)"
          />
          {/* Mid range — soft pink-mauve */}
          <path
            d="M0 420 L70 380 L150 410 L240 350 L320 400 L420 340 L520 410 L610 360 L710 420 L810 360 L910 410 L1010 360 L1110 410 L1200 370 L1200 540 L0 540 Z"
            fill="rgba(168, 110, 168, 0.55)"
          />
          {/* Foreground range — warmer dusty pink */}
          <path
            d="M0 470 L80 440 L180 470 L280 420 L380 460 L490 410 L590 460 L700 420 L820 470 L940 425 L1050 460 L1160 420 L1200 440 L1200 540 L0 540 Z"
            fill="rgba(148, 88, 148, 0.6)"
          />
        </svg>
      )}

      {/* Bottom warmth */}
      <div
        className="absolute inset-x-0 bottom-0 h-1/3"
        style={{
          background:
            "linear-gradient(0deg, rgba(126, 79, 153, 0.25) 0%, rgba(126, 79, 153, 0) 100%)",
        }}
      />

      {/* Soft luxury haze sweep across the middle */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 80% 40% at 50% 60%, rgba(255, 235, 220, 0.25), transparent 70%)",
        }}
      />
    </div>
  );
}
