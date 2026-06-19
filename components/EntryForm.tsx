"use client";

import { useState, useCallback, useRef } from "react";
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

// Comfortable, finger-friendly field styling for tablet kiosks. Kept as local
// utility classes (not the shared .input-premium) so admin/login/staff pages
// are unaffected. 17px text also keeps iOS Safari from zoom-on-focus.
const FIELD_CLASS =
  "w-full rounded-2xl border border-deepPurple/15 bg-white/70 px-5 py-3.5 text-[17px] leading-tight text-deepPurple shadow-sm transition placeholder:text-deepPurple/40 focus:border-deepPurple/50 focus:bg-white/95 focus:outline-none focus:ring-4 focus:ring-deepPurple/15";

const LABEL_CLASS =
  "mb-1.5 block text-[12px] font-medium uppercase tracking-[0.09em] text-deepPurple/65";

// Quick-fill domain chips for fast email entry on tablet (no browser autofill).
const EMAIL_DOMAINS = [
  "@gmail.com",
  "@yahoo.com",
  "@icloud.com",
  "@hotmail.com",
  "@outlook.com",
];

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

export default function EntryForm() {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);

  const setField = useCallback(<K extends keyof FormState>(key: K, val: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: val }));
  }, []);

  const onPhoneChange = (raw: string) => {
    setField("phone", formatPhoneDisplay(raw));
  };

  const onZipChange = (raw: string) => {
    setField("zip_code", raw.replace(/[^\d-]/g, "").slice(0, 10));
  };

  // Tap a domain chip to complete the email: keep the part before "@" and
  // append the chosen domain. No-op when the field is empty so nothing is
  // submitted. Focus stays in the email field for fast tablet entry.
  const applyEmailDomain = (domain: string) => {
    setForm((prev) => {
      const local = prev.email.trim().split("@")[0];
      if (!local) return prev;
      return { ...prev, email: `${local}${domain}` };
    });
    emailRef.current?.focus();
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
        className="glass rounded-4xl px-6 py-6 sm:px-9 sm:py-8 w-full max-w-xl md:max-w-3xl mx-auto"
      >
        <div className="text-center mb-5 sm:mb-6">
          <p className="text-deepPurple/60 uppercase tracking-[0.2em] text-[10px] sm:text-[11px] mb-1">
            Enter to win
          </p>
          <h1 className="font-display text-deepPurple text-2xl sm:text-4xl leading-tight">
            ENTER THE RAFFLE
          </h1>
          <div className="mt-2.5 mx-auto h-px w-20 bg-gradient-to-r from-transparent via-gold to-transparent" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-5 gap-y-4">
          <div className="md:col-span-2">
            <label htmlFor="ke-fullname" className={LABEL_CLASS}>
              Full Name
            </label>
            <input
              id="ke-fullname"
              name="ke-fullname"
              className={FIELD_CLASS}
              value={form.full_name}
              onChange={(e) => setField("full_name", e.target.value)}
              placeholder="Yaakov Cohen"
              inputMode="text"
              autoCapitalize="words"
              enterKeyHint="next"
              autoFocus
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
              ref={emailRef}
              id="ke-email"
              name="ke-email"
              className={FIELD_CLASS}
              value={form.email}
              onChange={(e) => setField("email", e.target.value)}
              placeholder="you@example.com"
              type="email"
              inputMode="email"
              autoCapitalize="off"
              enterKeyHint="next"
              {...NO_AUTOFILL}
            />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {EMAIL_DOMAINS.map((domain) => (
                <button
                  key={domain}
                  type="button"
                  // Prevent the tap from stealing focus from the email input so
                  // the keyboard stays open and entry stays fast.
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => applyEmailDomain(domain)}
                  className="rounded-full border border-deepPurple/15 bg-white/55 px-3 py-1.5 text-[13px] font-medium text-deepPurple/75 transition active:scale-95 hover:bg-white/85 focus:outline-none focus:ring-2 focus:ring-deepPurple/20"
                >
                  {domain}
                </button>
              ))}
            </div>
          </div>

          <div className="md:col-span-2">
            <label htmlFor="ke-street" className={LABEL_CLASS}>
              Street Address
            </label>
            <input
              id="ke-street"
              name="ke-street"
              className={FIELD_CLASS}
              value={form.street_address}
              onChange={(e) => setField("street_address", e.target.value)}
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
              placeholder="10952"
              inputMode="numeric"
              autoCapitalize="off"
              enterKeyHint="done"
              maxLength={10}
              {...NO_AUTOFILL}
            />
          </div>
        </div>

        <label className="mt-5 flex items-start gap-3 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={form.terms_accepted}
            onChange={(e) => setField("terms_accepted", e.target.checked)}
            className="mt-[2px] h-6 w-6 shrink-0 cursor-pointer rounded-[6px] border border-deepPurple/30 accent-deepPurple focus:outline-none focus:ring-2 focus:ring-deepPurple/25"
          />
          <span className="text-deepPurple/75 text-sm leading-snug">
            By entering the raffle, I agree to the{" "}
            <a
              href="/terms"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-deepPurple underline decoration-gold/70 underline-offset-2 transition-colors hover:text-eventRed"
            >
              Terms &amp; Conditions
            </a>
            .
          </span>
        </label>

        {error && (
          <p className="mt-4 text-center text-eventRed font-medium text-sm sm:text-base">{error}</p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="btn-primary w-full mt-5 py-4 text-lg tracking-[0.15em]"
        >
          {submitting ? "Entering…" : "Enter Raffle"}
        </button>

        <p className="mt-3 text-center text-deepPurple/55 text-[10px] sm:text-[11px] uppercase tracking-[0.18em]">
          One entry per phone number
        </p>
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
