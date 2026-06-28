"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Confetti from "./Confetti";
import { formatPhoneDisplay, isValid10Digit } from "@/lib/phone";

type FormState = {
  full_name: string;
  phone: string;
  email: string;
  street_address: string;
  zip_code: string;
  terms_accepted: boolean;
};

const EMPTY: FormState = {
  full_name: "",
  phone: "",
  email: "",
  street_address: "",
  zip_code: "",
  terms_accepted: false,
};

// Solid, high-contrast field styling for a premium tablet kiosk. Kept as local
// utility classes (not the shared .input-premium) so admin/login/staff pages
// stay untouched. 17px text also keeps mobile Safari/Chrome from zoom-on-focus.
const FIELD_CLASS =
  "w-full rounded-xl tablet:rounded-2xl border border-deepPurple/25 bg-white px-4 py-3 tablet:px-5 text-[17px] tablet:text-[20px] leading-tight text-deepPurple shadow-[0_1px_2px_rgba(62,31,82,0.06)] transition placeholder:text-deepPurple/35 focus:border-deepPurple focus:bg-white focus:outline-none focus:ring-4 focus:ring-deepPurple/15";

const LABEL_CLASS =
  "mb-1 tablet:mb-1.5 block text-[12px] tablet:text-[15px] font-semibold uppercase tracking-[0.07em] text-deepPurple/80";

// Attributes shared by every text field to suppress browser/OS autofill and
// password-manager suggestions. Critical on a shared public kiosk: one
// person's saved name/email/address must never surface for the next person.
const NO_AUTOFILL = {
  autoComplete: "off",
  autoCorrect: "off",
  spellCheck: false,
  "data-1p-ignore": true,
  "data-lpignore": "true",
  "data-form-type": "other",
} as const;

/**
 * Keyboard-aware behavior for tablet/mobile browsers.
 *
 * `100dvh` alone is not enough on real Android Chrome: the on-screen keyboard
 * shrinks the *visual* viewport without changing the layout viewport, so the
 * checkbox + submit button can end up trapped behind the keyboard. We listen to
 * `window.visualViewport` and publish the keyboard height as a CSS variable
 * (`--keyboard-inset`) on <html>, which the page wrapper turns into dynamic
 * bottom padding so the lower form actions can always be scrolled into view.
 */
function useKeyboardAwareScroll() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const root = document.documentElement;
    const update = () => {
      // Height of the area covered by the keyboard (0 when it is closed).
      const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      root.style.setProperty("--keyboard-inset", `${Math.round(inset)}px`);
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      root.style.removeProperty("--keyboard-inset");
    };
  }, []);
}

export default function EntryForm() {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  useKeyboardAwareScroll();

  const setField = useCallback(<K extends keyof FormState>(key: K, val: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: val }));
  }, []);

  // When a field is focused, wait for the keyboard to animate in, then bring the
  // field to the middle of the visible area so it (and the actions below it)
  // stay reachable above the keyboard.
  const handleFieldFocus = useCallback((e: React.FocusEvent<HTMLInputElement>) => {
    const el = e.currentTarget;
    window.setTimeout(() => {
      el.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 300);
  }, []);

  const onPhoneChange = (raw: string) => {
    setField("phone", formatPhoneDisplay(raw));
  };

  const onZipChange = (raw: string) => {
    setField("zip_code", raw.replace(/[^\d-]/g, "").slice(0, 10));
  };

  const validate = (): string | null => {
    if (!form.full_name.trim()) return "Please enter your full name.";
    if (!isValid10Digit(form.phone)) return "Please enter a valid 10-digit phone number.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) return "Please enter a valid email.";
    if (!form.street_address.trim()) return "Please enter your street address.";
    if (!/^\d{5}(-\d{4})?$/.test(form.zip_code.trim())) return "Please enter a valid ZIP code.";
    if (!form.terms_accepted) return "You must agree to the Terms & Conditions to enter the raffle.";
    return null;
  };

  // Drop focus so the on-screen keyboard closes and no field stays "active"
  // for the next person at the kiosk.
  const dismissKeyboard = () => {
    const el = document.activeElement as HTMLElement | null;
    el?.blur?.();
  };

  const submit = async () => {
    setError(null);
    const v = validate();
    if (v) {
      setError(v);
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      // The route always returns JSON (success, validation, or 503). But if
      // the platform itself crashes (env vars missing → HTML 500), `res.json()`
      // would throw — fall back to text so the user sees a real message
      // instead of "Network error."
      let data: any = null;
      try {
        data = await res.json();
      } catch {
        const text = await res.text().catch(() => "");
        data = {
          error:
            text && text.length < 200
              ? text
              : `The server returned an unexpected response (${res.status}). Please try again or notify the event operator.`,
        };
      }
      if (!res.ok) {
        setError(data?.error || "Something went wrong. Please try again.");
        setSubmitting(false);
        return;
      }
      setSuccess(true);
      setSubmitting(false);
      // Close the keyboard immediately so the confirmation is fully visible.
      dismissKeyboard();

      // Fully reset for the next person after the confirmation shows.
      setTimeout(() => {
        setForm(EMPTY);
        setError(null);
        setSuccess(false);
        dismissKeyboard();
        // Snap back to the top so the next person sees the full form.
        window.scrollTo({ top: 0, behavior: "smooth" });
      }, 3000);
    } catch {
      setError(
        "Could not reach the server. Check your connection and try again."
      );
      setSubmitting(false);
    }
  };

  return (
    <>
      <Confetti fire={success} />

      <form
        ref={formRef}
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        autoComplete="off"
        noValidate
        className="w-full max-w-lg tablet:max-w-none mx-auto overflow-hidden rounded-[26px] tablet:rounded-[32px] border border-white/70 bg-ivory shadow-[0_28px_70px_-22px_rgba(62,31,82,0.62)] ring-1 ring-deepPurple/5"
      >
        {/* Premium deep-purple header band */}
        <div className="bg-gradient-to-br from-deepPurple via-deepPurple-mid to-deepPurple-light px-6 pt-5 pb-6 tablet:px-10 tablet:pt-6 tablet:pb-6 text-center">
          <p className="text-gold-light uppercase tracking-[0.3em] tablet:tracking-[0.34em] text-[10px] sm:text-[11px] tablet:text-[13px] mb-1.5 tablet:mb-2">
            Enter to win
          </p>
          <h1 className="font-display text-ivory text-[2rem] sm:text-[2.4rem] tablet:text-[3.1rem] leading-none drop-shadow-[0_2px_8px_rgba(0,0,0,0.25)]">
            ENTER THE RAFFLE
          </h1>
          <div className="mt-3 tablet:mt-4 mx-auto h-[2px] tablet:h-[3px] w-16 tablet:w-24 rounded-full bg-gradient-to-r from-transparent via-gold-light to-transparent" />
        </div>

        {/* Form body */}
        <div className="px-5 py-5 sm:px-7 sm:py-6 tablet:px-10 tablet:py-6">
          <div className="space-y-3">
            <div>
              <label htmlFor="ke-fullname" className={LABEL_CLASS}>
                Full Name
              </label>
              <input
                id="ke-fullname"
                name="ke-fullname"
                className={FIELD_CLASS}
                value={form.full_name}
                onChange={(e) => setField("full_name", e.target.value)}
                onFocus={handleFieldFocus}
                placeholder="Yaakov Cohen"
                inputMode="text"
                autoCapitalize="words"
                enterKeyHint="next"
                {...NO_AUTOFILL}
              />
            </div>

            <div>
              <label htmlFor="ke-phone" className={LABEL_CLASS}>
                Phone Number
              </label>
              <input
                id="ke-phone"
                name="ke-phone"
                className={FIELD_CLASS}
                value={form.phone}
                onChange={(e) => onPhoneChange(e.target.value)}
                onFocus={handleFieldFocus}
                placeholder="(718) 555-1234"
                type="tel"
                inputMode="tel"
                autoCapitalize="off"
                enterKeyHint="next"
                {...NO_AUTOFILL}
              />
            </div>

            <div>
              <label htmlFor="ke-email" className={LABEL_CLASS}>
                Email Address
              </label>
              <input
                id="ke-email"
                name="ke-email"
                className={FIELD_CLASS}
                value={form.email}
                onChange={(e) => setField("email", e.target.value)}
                onFocus={handleFieldFocus}
                placeholder="you@example.com"
                type="email"
                inputMode="email"
                autoCapitalize="off"
                enterKeyHint="next"
                {...NO_AUTOFILL}
              />
            </div>

            <div>
              <label htmlFor="ke-street" className={LABEL_CLASS}>
                Street Address
              </label>
              <input
                id="ke-street"
                name="ke-street"
                className={FIELD_CLASS}
                value={form.street_address}
                onChange={(e) => setField("street_address", e.target.value)}
                onFocus={handleFieldFocus}
                placeholder="123 Main Street"
                inputMode="text"
                autoCapitalize="words"
                enterKeyHint="next"
                {...NO_AUTOFILL}
              />
            </div>

            <div>
              <label htmlFor="ke-zip" className={LABEL_CLASS}>
                ZIP Code
              </label>
              <input
                id="ke-zip"
                name="ke-zip"
                className={FIELD_CLASS}
                value={form.zip_code}
                onChange={(e) => onZipChange(e.target.value)}
                onFocus={handleFieldFocus}
                placeholder="10952"
                inputMode="numeric"
                autoCapitalize="off"
                enterKeyHint="done"
                maxLength={10}
                {...NO_AUTOFILL}
              />
            </div>
          </div>

          <label className="mt-4 flex items-start gap-3 tablet:gap-4 rounded-xl tablet:rounded-2xl border border-deepPurple/10 bg-deepPurple/[0.04] px-3.5 py-3 tablet:px-5 tablet:py-3.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={form.terms_accepted}
              onChange={(e) => setField("terms_accepted", e.target.checked)}
              className="mt-[1px] h-[22px] w-[22px] tablet:h-[30px] tablet:w-[30px] shrink-0 cursor-pointer rounded-[6px] tablet:rounded-[8px] border border-deepPurple/35 accent-deepPurple focus:outline-none focus:ring-2 focus:ring-deepPurple/25"
            />
            <span className="text-deepPurple/85 text-[13px] tablet:text-[16px] font-medium leading-snug">
              By entering the raffle, I agree to the{" "}
              <a
                href="/terms"
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-deepPurple underline decoration-gold underline-offset-2 transition-colors hover:text-eventRed"
              >
                Terms &amp; Conditions
              </a>
              .
            </span>
          </label>

          {error && (
            <p className="mt-3 text-center text-eventRed font-semibold text-sm sm:text-base tablet:text-lg">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="btn-primary w-full mt-4 tablet:mt-5 py-4 tablet:py-4 text-lg tablet:text-2xl tracking-[0.18em] shadow-[0_16px_34px_-12px_rgba(62,31,82,0.75)]"
          >
            {submitting ? "Entering…" : "Enter Raffle"}
          </button>

          <p className="mt-3 tablet:mt-4 text-center text-deepPurple/50 text-[10px] sm:text-[11px] tablet:text-[13px] uppercase tracking-[0.18em]">
            One entry per phone number
          </p>
        </div>
      </form>

      <AnimatePresence>
        {success && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-deepPurple/30 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.85, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: "spring", stiffness: 280, damping: 22 }}
              className="glass rounded-4xl p-10 max-w-md w-full text-center"
            >
              <div className="mx-auto mb-5 w-16 h-16 rounded-full bg-gradient-to-br from-gold-light to-gold flex items-center justify-center shadow-lg">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M4 12.5l5 5L20 7"
                    stroke="#3E1F52"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <h2 className="font-display text-4xl text-deepPurple mb-2">YOU&apos;RE ENTERED!</h2>
              <p className="text-deepPurple/70 text-lg">Good luck in today&apos;s raffle.</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
