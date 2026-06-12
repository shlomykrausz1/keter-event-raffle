"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Background from "@/components/Background";

type EntryRow = {
  id: string;
  full_name: string;
  phone_display: string;
  email: string;
  street_address: string;
  zip_code: string;
  created_at: string;
  is_demo: boolean;
  round_number: number | null;
  is_winner: boolean;
  prize: string | null;
};

type ListResponse = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  rounds: number[];
  entries: EntryRow[];
};

type EditDraft = {
  full_name: string;
  phone: string;
  email: string;
  street_address: string;
  zip_code: string;
};

function fmtTime(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function AdminEntriesPage() {
  const router = useRouter();
  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "winners" | "nonwinners" | "round">("all");
  const [round, setRound] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<EditDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);
  const debounceRef = useRef<number | null>(null);

  const showToast = (kind: "ok" | "err", msg: string) => {
    setToast({ kind, msg });
    window.setTimeout(() => setToast(null), 4000);
  };

  const load = useCallback(
    async (pageArg: number, qArg: string, filterArg: string, roundArg: number | null) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ page: String(pageArg) });
        if (qArg) params.set("q", qArg);
        params.set("filter", filterArg);
        if (filterArg === "round" && roundArg != null) params.set("round", String(roundArg));
        const res = await fetch(`/api/admin/entries?${params}`, { cache: "no-store" });
        if (res.status === 401) {
          router.replace("/login");
          return;
        }
        const json = await res.json();
        if (!res.ok) {
          showToast("err", json?.error || "Failed to load entries.");
          return;
        }
        setData(json);
      } catch {
        showToast("err", "Network error loading entries.");
      } finally {
        setLoading(false);
      }
    },
    [router]
  );

  useEffect(() => {
    load(page, q, filter, round);
    // q is debounced separately below — don't refetch per keystroke here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, filter, round]);

  const onSearchChange = (value: string) => {
    setQ(value);
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      setPage(1);
      load(1, value, filter, round);
    }, 350);
  };

  const startEdit = (e: EntryRow) => {
    setEditingId(e.id);
    setDraft({
      full_name: e.full_name,
      phone: e.phone_display,
      email: e.email,
      street_address: e.street_address,
      zip_code: e.zip_code,
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraft(null);
  };

  const saveEdit = async (id: string) => {
    if (!draft) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/entries/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const json = await res.json();
      if (!res.ok) {
        showToast("err", json?.error || "Save failed.");
        return;
      }
      showToast("ok", "Entry updated.");
      cancelEdit();
      load(page, q, filter, round);
    } catch {
      showToast("err", "Network error saving entry.");
    } finally {
      setBusy(false);
    }
  };

  const deleteEntry = async (e: EntryRow) => {
    const warning = e.is_winner
      ? `⚠️ ${e.full_name} is a WINNER (${e.prize}).\n\nDeleting this entry also removes their win. This cannot be undone.\n\nDelete anyway?`
      : `Delete the entry for ${e.full_name}?\n\nThis cannot be undone.`;
    if (!window.confirm(warning)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/entries/${e.id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) {
        showToast("err", json?.error || "Delete failed.");
        return;
      }
      showToast("ok", "Entry deleted.");
      if (editingId === e.id) cancelEdit();
      load(page, q, filter, round);
    } catch {
      showToast("err", "Network error deleting entry.");
    } finally {
      setBusy(false);
    }
  };

  const totalPages = data?.totalPages ?? 1;

  return (
    <>
      <Background />
      <main className="min-h-screen px-4 md:px-10 py-8">
        <div className="max-w-[1500px] mx-auto">
          <header className="flex flex-wrap items-center justify-between gap-3 mb-6">
            <div>
              <h1 className="font-display text-deepPurple text-2xl md:text-3xl tracking-[0.1em]">
                DATABASE — ENTRIES
              </h1>
              <p className="text-deepPurple/60 text-xs uppercase tracking-[0.2em]">
                Search, fix and remove entries
              </p>
            </div>
            <Link href="/admin" className="btn-ghost px-5 py-2 text-sm">
              ← Back to Admin
            </Link>
          </header>

          {/* Search + filters */}
          <section className="glass rounded-4xl p-4 md:p-5 mb-5 flex flex-wrap items-center gap-3">
            <input
              value={q}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search name, phone or email…"
              className="input-premium max-w-sm"
            />
            <select
              value={filter}
              onChange={(e) => {
                const f = e.target.value as typeof filter;
                setFilter(f);
                setPage(1);
                if (f === "round" && round == null && data?.rounds.length) {
                  setRound(data.rounds[data.rounds.length - 1]);
                }
              }}
              className="input-premium w-auto"
            >
              <option value="all">All entries</option>
              <option value="winners">Winners only</option>
              <option value="nonwinners">Non-winners</option>
              <option value="round">By raffle round</option>
            </select>
            {filter === "round" && (
              <select
                value={round ?? ""}
                onChange={(e) => {
                  setRound(Number(e.target.value));
                  setPage(1);
                }}
                className="input-premium w-auto"
              >
                {(data?.rounds ?? []).map((r) => (
                  <option key={r} value={r}>
                    Round {r}
                  </option>
                ))}
              </select>
            )}
            <span className="text-deepPurple/60 text-sm ml-auto">
              {data ? `${data.total} entr${data.total === 1 ? "y" : "ies"}` : ""}
            </span>
          </section>

          {/* Table */}
          <section className="glass rounded-4xl p-4 md:p-6">
            <div className="overflow-x-auto thin-scroll">
              <table className="w-full text-left text-sm min-w-[1100px]">
                <thead>
                  <tr className="text-deepPurple/60 text-xs uppercase tracking-[0.1em] border-b border-deepPurple/15">
                    <th className="py-2 pr-3">Name</th>
                    <th className="py-2 pr-3">Phone</th>
                    <th className="py-2 pr-3">Email</th>
                    <th className="py-2 pr-3">Address</th>
                    <th className="py-2 pr-3">ZIP</th>
                    <th className="py-2 pr-3">Created</th>
                    <th className="py-2 pr-3">Round</th>
                    <th className="py-2 pr-3">Winner</th>
                    <th className="py-2 pr-3">Prize</th>
                    <th className="py-2 pr-1 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && !data && (
                    <tr>
                      <td colSpan={10} className="py-10 text-center text-deepPurple/50">
                        Loading…
                      </td>
                    </tr>
                  )}
                  {data && data.entries.length === 0 && (
                    <tr>
                      <td colSpan={10} className="py-10 text-center text-deepPurple/50">
                        No entries match.
                      </td>
                    </tr>
                  )}
                  {(data?.entries ?? []).map((e) =>
                    editingId === e.id && draft ? (
                      <tr key={e.id} className="border-b border-deepPurple/8 bg-white/40">
                        <td className="py-2 pr-2">
                          <input
                            className="input-premium !py-1.5 !px-2 text-sm"
                            value={draft.full_name}
                            onChange={(ev) => setDraft({ ...draft, full_name: ev.target.value })}
                          />
                        </td>
                        <td className="py-2 pr-2">
                          <input
                            className="input-premium !py-1.5 !px-2 text-sm min-w-[130px]"
                            value={draft.phone}
                            onChange={(ev) => setDraft({ ...draft, phone: ev.target.value })}
                          />
                        </td>
                        <td className="py-2 pr-2">
                          <input
                            className="input-premium !py-1.5 !px-2 text-sm min-w-[180px]"
                            value={draft.email}
                            onChange={(ev) => setDraft({ ...draft, email: ev.target.value })}
                          />
                        </td>
                        <td className="py-2 pr-2">
                          <input
                            className="input-premium !py-1.5 !px-2 text-sm min-w-[160px]"
                            value={draft.street_address}
                            onChange={(ev) =>
                              setDraft({ ...draft, street_address: ev.target.value })
                            }
                          />
                        </td>
                        <td className="py-2 pr-2">
                          <input
                            className="input-premium !py-1.5 !px-2 text-sm w-[90px]"
                            value={draft.zip_code}
                            onChange={(ev) => setDraft({ ...draft, zip_code: ev.target.value })}
                          />
                        </td>
                        <td className="py-2 pr-3 text-deepPurple/55 text-xs">
                          {fmtTime(e.created_at)}
                        </td>
                        <td className="py-2 pr-3">{e.round_number ?? "—"}</td>
                        <td className="py-2 pr-3">{e.is_winner ? "Yes" : "No"}</td>
                        <td className="py-2 pr-3">{e.prize ?? "—"}</td>
                        <td className="py-2 pr-1">
                          <div className="flex items-center justify-end gap-1.5">
                            <IconButton
                              title="Save"
                              onClick={() => saveEdit(e.id)}
                              disabled={busy}
                            >
                              <CheckIcon />
                            </IconButton>
                            <IconButton title="Cancel" onClick={cancelEdit} disabled={busy}>
                              <XIcon />
                            </IconButton>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      <tr key={e.id} className="border-b border-deepPurple/8">
                        <td className="py-2.5 pr-3 font-medium">
                          {e.full_name}
                          {e.is_demo && (
                            <span className="ml-2 text-[10px] uppercase tracking-wider text-deepPurple/50 bg-deepPurple/10 px-1.5 py-0.5 rounded">
                              demo
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 pr-3 whitespace-nowrap">{e.phone_display}</td>
                        <td className="py-2.5 pr-3 text-deepPurple/70 truncate max-w-[220px]">
                          {e.email}
                        </td>
                        <td className="py-2.5 pr-3 truncate max-w-[200px]">{e.street_address}</td>
                        <td className="py-2.5 pr-3">{e.zip_code}</td>
                        <td className="py-2.5 pr-3 text-deepPurple/55 text-xs whitespace-nowrap">
                          {fmtTime(e.created_at)}
                        </td>
                        <td className="py-2.5 pr-3">{e.round_number ?? "—"}</td>
                        <td className="py-2.5 pr-3">
                          {e.is_winner ? (
                            <span className="text-gold font-medium">Yes</span>
                          ) : (
                            "No"
                          )}
                        </td>
                        <td className="py-2.5 pr-3 whitespace-nowrap">{e.prize ?? "—"}</td>
                        <td className="py-2.5 pr-1">
                          <div className="flex items-center justify-end gap-1.5">
                            <IconButton
                              title="Edit"
                              onClick={() => startEdit(e)}
                              disabled={busy || editingId !== null}
                            >
                              <PencilIcon />
                            </IconButton>
                            <IconButton
                              title="Delete"
                              onClick={() => deleteEntry(e)}
                              disabled={busy || editingId !== null}
                              danger
                            >
                              <TrashIcon />
                            </IconButton>
                          </div>
                        </td>
                      </tr>
                    )
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between mt-5">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1 || loading}
                className="btn-ghost px-5 py-2 text-xs"
              >
                ← Previous
              </button>
              <span className="text-deepPurple/70 text-sm">
                Page {data?.page ?? page} of {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages || loading}
                className="btn-ghost px-5 py-2 text-xs"
              >
                Next →
              </button>
            </div>
          </section>
        </div>

        {toast && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
            <div
              className={`px-6 py-3 rounded-full shadow-lg font-medium text-sm ${
                toast.kind === "ok" ? "bg-deepPurple text-ivory" : "bg-eventRed text-ivory"
              }`}
            >
              {toast.msg}
            </div>
          </div>
        )}
      </main>
    </>
  );
}

function IconButton({
  title,
  onClick,
  disabled,
  danger,
  children,
}: {
  title: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      className={`p-1.5 rounded-lg border transition disabled:opacity-35 ${
        danger
          ? "border-eventRed/30 text-eventRed hover:bg-eventRed/10"
          : "border-deepPurple/25 text-deepPurple hover:bg-deepPurple/10"
      }`}
    >
      {children}
    </button>
  );
}

function PencilIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}
