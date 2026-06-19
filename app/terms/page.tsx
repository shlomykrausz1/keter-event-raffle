import Background from "@/components/Background";
import Link from "next/link";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Raffle Terms & Conditions",
};

export default function TermsPage() {
  return (
    <>
      <Background />
      <main className="min-h-screen flex flex-col items-center px-4 py-8 sm:py-12">
        <div className="glass rounded-4xl px-6 py-7 sm:px-10 sm:py-9 w-full max-w-2xl mx-auto">
          <div className="text-center">
            <p className="text-deepPurple/60 uppercase tracking-[0.2em] text-[10px] mb-1">
              The Big Keter Event &middot; Monsey
            </p>
            <h1 className="font-display text-deepPurple text-2xl sm:text-3xl leading-tight">
              Raffle Terms &amp; Conditions
            </h1>
            <div className="mt-3 mb-6 mx-auto h-px w-16 bg-gradient-to-r from-transparent via-gold to-transparent" />
          </div>

          <div className="space-y-4 text-deepPurple/80 text-[15px] leading-relaxed">
            <p>By entering this raffle, you agree to these Terms &amp; Conditions.</p>

            <p>
              No purchase is necessary to enter or win. A purchase does not
              increase your chances of winning.
            </p>

            <p>
              By submitting your information, you agree that Keter Judaica may use
              your name, email address, phone number, and mailing address to run
              the raffle, contact winners, prevent duplicate entries, and send you
              future marketing emails, including store updates, promotions, offers,
              product updates, and event announcements.
            </p>

            <p>
              You may unsubscribe from marketing emails at any time using the
              unsubscribe link in the email or by contacting Keter Judaica.
            </p>

            <p>
              Winners will be selected at random from eligible entries. Keter
              Judaica may disqualify duplicate, incomplete, false, or improper
              entries.
            </p>

            <p>
              Odds of winning depend on the number of eligible entries received.
            </p>

            <p>
              Keter Judaica is not responsible for technical errors, lost entries,
              duplicate entries, or issues outside its control.
            </p>

            <p>Void where prohibited by law.</p>

            <p>
              For quest opt out, contact Keter Judaica at: [insert email/contact
              info].
            </p>
          </div>

          <div className="mt-8 text-center">
            <Link
              href="/enter"
              className="btn-ghost inline-block px-7 py-2.5 text-sm tracking-[0.12em]"
            >
              Back to Entry
            </Link>
          </div>
        </div>
      </main>
    </>
  );
}
