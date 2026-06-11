import { notFound } from "next/navigation";
import RemoteControl from "./RemoteControl";

export const dynamic = "force-dynamic";

export default function RemoteControlPage({
  params,
}: {
  params: { slug: string };
}) {
  const expected = process.env.REMOTE_CONTROL_SLUG;
  if (!expected) {
    notFound();
  }
  if (params.slug !== expected) {
    notFound();
  }
  // The slug doubles as the auth token for /api/raffle/start + /reset. We
  // pass it down so the client sends it via the `x-remote-slug` header.
  return <RemoteControl slug={params.slug} />;
}
