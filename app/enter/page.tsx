import Background from "@/components/Background";
import EntryForm from "@/components/EntryForm";
import Image from "next/image";

export const dynamic = "force-dynamic";

export default function EnterPage() {
  return (
    <>
      <Background />
      <main className="min-h-screen flex flex-col items-center justify-center px-4 py-4 sm:py-6">
        <div className="mb-3 sm:mb-4">
          <Image
            src="/keter-logo.png"
            alt="The Big Keter Event - Monsey"
            width={300}
            height={220}
            priority
            className="w-28 sm:w-32 h-auto drop-shadow-[0_14px_22px_rgba(62,31,82,0.35)] animate-float"
          />
        </div>

        <EntryForm />

        <p className="mt-3 text-deepPurple/55 text-[10px] uppercase tracking-[0.18em] text-center">
          The Big Keter Event &middot; Monsey
        </p>
      </main>
    </>
  );
}
