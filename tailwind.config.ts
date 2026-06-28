import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      // Tablet-portrait kiosk breakpoint. Additive: leaves sm/md/lg/xl intact.
      // Scoped to portrait orientation in the tablet width band so the desktop
      // raffle screen and phone layout are never affected.
      screens: {
        tablet: {
          raw: "(min-width: 560px) and (max-width: 1200px) and (orientation: portrait)",
        },
      },
      colors: {
        // Event palette - matches the dreamy mountain mockup
        sky: "#F8D9C4",        // warm peach sky
        blush: "#F4C8C8",      // soft blush pink
        mauve: "#C9A6CC",      // mauve lilac
        ivory: "#FFF8EC",      // warm ivory
        champagne: "#E8D4A8",  // muted champagne
        gold: {
          DEFAULT: "#B8935A",  // deep muted gold
          light: "#D4B988",
        },
        deepPurple: {
          DEFAULT: "#3E1F52",  // deep purple primary
          mid: "#5C3275",      // mid purple
          light: "#7E4F99",    // accent purple
        },
        eventRed: "#C72E36",   // logo red (used sparingly)
      },
      fontFamily: {
        display: ["PFDinComp", "Impact", "Oswald", "sans-serif"],
        body: ["PFDinComp", "Inter", "system-ui", "sans-serif"],
      },
      borderRadius: {
        "4xl": "2rem",
        "5xl": "2.5rem",
      },
      boxShadow: {
        glass: "0 20px 60px -20px rgba(62, 31, 82, 0.35), 0 8px 24px -12px rgba(62, 31, 82, 0.20)",
        panel: "0 30px 80px -30px rgba(62, 31, 82, 0.45)",
        wheel: "0 24px 60px -16px rgba(62, 31, 82, 0.55), inset 0 0 0 6px rgba(255, 248, 236, 0.6)",
      },
      backdropBlur: {
        xs: "2px",
      },
      animation: {
        "pulse-soft": "pulse-soft 3s ease-in-out infinite",
        "shimmer": "shimmer 8s linear infinite",
        "float": "float 6s ease-in-out infinite",
      },
      keyframes: {
        "pulse-soft": {
          "0%, 100%": { opacity: "0.8" },
          "50%": { opacity: "1" },
        },
        "shimmer": {
          "0%": { backgroundPosition: "0% 50%" },
          "100%": { backgroundPosition: "200% 50%" },
        },
        "float": {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-8px)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
