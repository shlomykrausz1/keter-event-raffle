import { notFound } from "next/navigation";
import RaffleScreen from "./RaffleScreen";

export const dynamic = "force-dynamic";

export default function RaffleScreenPage({
  params,
}: {
  params: { slug: string };
}) {
  const expected = process.env.RAFFLE_SCREEN_SLUG;
  if (!expected) {
    // Fail-closed: if no slug configured, the route is effectively disabled.
    notFound();
  }
  if (params.slug !== expected) {
    notFound();
  }
  return <RaffleScreen />;
}
