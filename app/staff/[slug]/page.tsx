import { notFound } from "next/navigation";
import StaffPage from "./StaffPage";

export const dynamic = "force-dynamic";

export default function StaffSlugPage({
  params,
}: {
  params: { slug: string };
}) {
  const expected = process.env.STAFF_PAGE_SLUG;
  if (!expected) {
    // Fail-closed: if no slug configured, the route is effectively disabled.
    notFound();
  }
  if (params.slug !== expected) {
    notFound();
  }
  // The slug doubles as the auth token for /api/staff/* — pass it down so
  // the client sends it via the `x-staff-slug` header.
  return <StaffPage slug={params.slug} />;
}
