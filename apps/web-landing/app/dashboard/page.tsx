"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";

type PendingProfile = {
  id: string;
  full_name: string | null;
  phone_number: string | null;
  status: string;
  role: string;
};

export default function DashboardPage() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [sessionReady, setSessionReady] = useState(false);
  const [pending, setPending] = useState<PendingProfile[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function refreshPending() {
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) {
      setPending([]);
      return;
    }
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, phone_number, status, role")
      .eq("role", "STAFF")
      .eq("status", "PENDING")
      .order("created_at", { ascending: false });

    if (error) throw error;
    setPending((data ?? []) as PendingProfile[]);
  }

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      setSessionReady(true);
      if (data.session) {
        try {
          await refreshPending();
        } catch (e: any) {
          setErr(String(e?.message ?? e));
        }
      }
    })();
    const { data: sub } = supabase.auth.onAuthStateChange(async () => {
      try {
        await refreshPending();
      } catch (e: any) {
        setErr(String(e?.message ?? e));
      }
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [supabase]);

  async function signIn() {
    setErr(null);
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      await refreshPending();
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  async function approve(profileId: string, approve: boolean) {
    setErr(null);
    setBusy(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Not logged in");

      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (!url || !anonKey) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY");

      const res = await fetch(`${url}/functions/v1/invite-approve`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: anonKey,
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ profileId, approve }),
      });

      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(t || `HTTP ${res.status}`);
      }
      await refreshPending();
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  if (!sessionReady) {
    return <div className="p-8 text-sm text-zinc-600">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-zinc-50 p-8 text-zinc-900">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Owner Dashboard</h1>
            <p className="text-sm text-zinc-600">Approve/Reject Staff (Week 2)</p>
          </div>
        </header>

        <section className="rounded-2xl border bg-white p-5">
          <h2 className="text-lg font-semibold">Login</h2>
          <p className="mt-1 text-sm text-zinc-600">Owner dùng Email/Password (Supabase Auth).</p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="owner@email.com"
              className="rounded-xl border px-3 py-2 text-sm"
            />
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              placeholder="password"
              className="rounded-xl border px-3 py-2 text-sm"
            />
          </div>

          <button
            disabled={busy}
            onClick={signIn}
            className="mt-4 rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy ? "Working..." : "Sign in"}
          </button>

          {err ? <p className="mt-3 text-sm text-red-600">{err}</p> : null}
        </section>

        <section className="rounded-2xl border bg-white p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Pending Staff</h2>
            <button
              disabled={busy}
              onClick={() => refreshPending().catch((e) => setErr(String(e?.message ?? e)))}
              className="rounded-xl border px-3 py-2 text-sm font-semibold disabled:opacity-50"
            >
              Refresh
            </button>
          </div>

          <div className="mt-4 grid gap-3">
            {pending.length === 0 ? (
              <p className="text-sm text-zinc-600">No pending staff.</p>
            ) : (
              pending.map((p) => (
                <div key={p.id} className="flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="font-semibold">{p.full_name ?? "(no name)"}</div>
                    <div className="text-sm text-zinc-600">{p.phone_number ?? "(no phone)"}</div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      disabled={busy}
                      onClick={() => approve(p.id, true)}
                      className="rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      Approve
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => approve(p.id, false)}
                      className="rounded-xl bg-red-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}


