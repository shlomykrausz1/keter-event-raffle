"use client";

import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";

export default function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const from = params.get("from") || "/admin";

  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!code) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: code }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data?.error || "Incorrect code.");
        setSubmitting(false);
        setCode("");
        return;
      }
      router.replace(from);
    } catch {
      setError("Network error.");
      setSubmitting(false);
    }
  }

  return (
    <>
      <Image
        src="/keter-logo.png"
        alt="The Big Keter Event"
        width={260}
        height={190}
        priority
        className="w-40 h-auto mb-8 drop-shadow-[0_18px_28px_rgba(62,31,82,0.35)]"
      />

      <form onSubmit={onSubmit} className="glass rounded-4xl p-9 w-full max-w-sm">
        <h1 className="font-display text-deepPurple text-2xl text-center tracking-[0.18em] mb-1">
          ADMIN
        </h1>
        <p className="text-deepPurple/55 text-center text-xs uppercase tracking-[0.18em] mb-7">
          Event Operator Access
        </p>

        <label className="label-premium" htmlFor="admin-code">
          Admin Code
        </label>
        <input
          id="admin-code"
          type="password"
          className="input-premium text-center font-display tracking-[0.4em] text-xl"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          placeholder="••••"
        />

        {error && <p className="text-eventRed text-sm mt-3 text-center">{error}</p>}

        <button
          type="submit"
          disabled={submitting || !code}
          className="btn-primary w-full mt-6 py-3.5 tracking-[0.18em]"
        >
          {submitting ? "Unlocking…" : "Unlock Dashboard"}
        </button>
      </form>
    </>
  );
}
