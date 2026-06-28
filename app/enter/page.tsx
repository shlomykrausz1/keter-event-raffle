import Background from "@/components/Background";
import EntryForm from "@/components/EntryForm";
import Image from "next/image";

export const dynamic = "force-dynamic";

export default function EnterPage() {
  return (
    <>
      <Background />
      {/*
        Tablet-kiosk layout. The page scrolls normally (no fixed/overflow-hidden
        trap), starts high, and grows its bottom padding while the on-screen
        keyboard is open. `--keyboard-inset` is published by the EntryForm
        keyboard hook from window.visualViewport, so the checkbox + submit button
        can always be scrolled above the keyboard on real Android/iOS tablets.
      */}
      <main
        className="flex min-h-[100dvh] w-full flex-col items-center px-4 pt-4 sm:pt-6 tablet:justify-center tablet:px-[5vw] tablet:pt-8"
        style={{
          paddingBottom:
            "calc(env(safe-area-inset-bottom, 0px) + 1.5rem + var(--keyboard-inset, 0px))",
        }}
      >
        <div className="mb-2.5 sm:mb-3.5 tablet:mb-4">
          <Image
            src="/keter-logo.png"
            alt="The Big Keter Event - Monsey"
            width={300}
            height={220}
            priority
            className="w-20 sm:w-24 tablet:w-28 h-auto drop-shadow-[0_12px_20px_rgba(62,31,82,0.4)]"
          />
        </div>

        <EntryForm />

        <p className="mt-3 tablet:mt-5 text-deepPurple/55 text-[10px] tablet:text-[13px] uppercase tracking-[0.18em] text-center">
          The Big Keter Event &middot; Monsey
        </p>
      </main>
    </>
  );
}
