import Background from "@/components/Background";
import EntryForm from "@/components/EntryForm";
import Image from "next/image";

export const dynamic = "force-dynamic";

export default function EnterPage() {
  return (
    <>
      <Background />
      {/*
        Tablet-kiosk layout: top-aligned (not vertically centered) so the form
        sits in the upper section and stays visible when the on-screen keyboard
        opens. min-h-[100dvh] tracks the dynamic viewport on iPad Safari/Chrome,
        and the generous safe-area bottom padding keeps the checkbox + submit
        button reachable above the keyboard. Normal document flow lets the
        browser scroll the focused field into view.
      */}
      <main className="flex min-h-[100dvh] w-full flex-col items-center px-4 pt-[max(1.25rem,env(safe-area-inset-top))] pb-[max(3rem,env(safe-area-inset-bottom))] sm:pt-9">
        <div className="mb-3 sm:mb-5">
          <Image
            src="/keter-logo.png"
            alt="The Big Keter Event - Monsey"
            width={300}
            height={220}
            priority
            className="w-24 sm:w-32 h-auto drop-shadow-[0_14px_22px_rgba(62,31,82,0.35)] animate-float"
          />
        </div>

        <EntryForm />

        <p className="mt-4 text-deepPurple/55 text-[10px] uppercase tracking-[0.18em] text-center">
          The Big Keter Event &middot; Monsey
        </p>
      </main>
    </>
  );
}
