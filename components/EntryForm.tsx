"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Confetti from "./Confetti";
import { formatPhoneDisplay, isValid10Digit } from "@/lib/phone";

type FormState = {
  full_name: string;
  phone: string;
  email: string;
  street_address: string;
  zip_code: string;
};

const EMPTY: FormState = {
  full_name: "",
  phone: "",
  email: "",
  street_address: "",
  zip_code: "",
};

export default function EntryForm() {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const setField = useCallback(<K extends keyof FormState>(key: K, val: string) => {
    setForm((prev) => ({ ...prev, [key]: val }));
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
    return null;
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

      // Auto-reset after 3 seconds
      setTimeout(() => {
        setForm(EMPTY);
        setSuccess(false);
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
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="glass rounded-4xl px-6 py-5 sm:px-8 sm:py-6 w-full max-w-2xl mx-auto"
      >
        <div className="text-center mb-4">
          <p className="text-deepPurple/60 uppercase tracking-[0.2em] text-[10px] mb-1">
            Enter to win
          </p>
          <h1 className="font-display text-deepPurple text-2xl sm:text-3xl leading-tight">
            ENTER THE RAFFLE
          </h1>
          <div className="mt-2 mx-auto h-px w-16 bg-gradient-to-r from-transparent via-gold to-transparent" />
        </div>

        <div className="space-y-2.5">
          <div>
            <label className="label-premium">Full Name</label>
            <input
              className="input-premium"
              value={form.full_name}
              onChange={(e) => setField("full_name", e.target.value)}
              placeholder="Yaakov Cohen"
              autoComplete="name"
              autoFocus
            />
          </div>

          <div>
            <label className="label-premium">Phone Number</label>
            <input
              className="input-premium"
              value={form.phone}
              onChange={(e) => onPhoneChange(e.target.value)}
              placeholder="(718) 555-1234"
              inputMode="tel"
              autoComplete="tel-national"
            />
          </div>

          <div>
            <label className="label-premium">Email Address</label>
            <input
              className="input-premium"
              value={form.email}
              onChange={(e) => setField("email", e.target.value)}
              placeholder="you@example.com"
              type="email"
              inputMode="email"
              autoComplete="email"
            />
          </div>

          <div>
            <label className="label-premium">Street Address</label>
            <input
              className="input-premium"
              value={form.street_address}
              onChange={(e) => setField("street_address", e.target.value)}
              placeholder="123 Main Street"
              autoComplete="street-address"
            />
          </div>

          <div>
            <label className="label-premium">ZIP Code</label>
            <input
              className="input-premium"
              value={form.zip_code}
              onChange={(e) => onZipChange(e.target.value)}
              placeholder="10952"
              inputMode="numeric"
              autoComplete="postal-code"
              maxLength={10}
            />
          </div>
        </div>

        {error && (
          <p className="mt-3 text-center text-eventRed font-medium text-sm">{error}</p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="btn-primary w-full mt-4 py-3 text-base tracking-[0.15em]"
        >
          {submitting ? "Entering…" : "Enter Raffle"}
        </button>

        <p className="mt-2 text-center text-deepPurple/55 text-[10px] uppercase tracking-[0.18em]">
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
