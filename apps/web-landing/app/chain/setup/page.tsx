"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Building2, Plus, Trash2 } from "lucide-react";

import NavBar from "../../components/NavBar";
import { apiFetch, getStoredRefreshToken, loginMobile } from "@/lib/backendClient";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";

type PurchaseMode = "SUBSCRIPTION" | "OUTLET_INCREASE";

type OutletDraft = {
  id?: string;
  name: string;
  code: string;
};

type BackendProfile = {
  role: string;
  businessId: string | null;
  business?: {
    chainOutletLimit?: number;
  } | null;
};

type Branch = {
  id: string;
  name: string;
  code: string | null;
  type: "CENTRAL_WAREHOUSE" | "OUTLET";
};

const emptyOutlet = (index: number): OutletDraft => ({
  name: `Chi nhánh ${index + 1}`,
  code: `CN${index + 1}`,
});

export default function ChainSetupPage() {
  return (
    <Suspense fallback={<SetupLoading />}>
      <ChainSetupContent />
    </Suspense>
  );
}

function SetupLoading() {
  return (
    <div className="min-h-screen bg-[#FAF9F7]">
      <NavBar />
      <div className="flex items-center justify-center pt-28 text-[#6F6B63]">
        Đang tải cấu hình chuỗi...
      </div>
    </div>
  );
}

function ChainSetupContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const planCode = searchParams.get("planCode") ?? "CHAIN_MONTHLY";
  const requestedCount = Number(searchParams.get("outletCount") ?? 2);
  const outletCount = Number.isInteger(requestedCount)
    ? Math.min(10, Math.max(2, requestedCount))
    : 2;
  const purchaseMode: PurchaseMode =
    searchParams.get("purchaseMode") === "OUTLET_INCREASE"
      ? "OUTLET_INCREASE"
      : "SUBSCRIPTION";

  const [outlets, setOutlets] = useState<OutletDraft[]>([]);
  const [currentOutletCount, setCurrentOutletCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const load = async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        router.replace("/auth/login");
        return;
      }
      if (!getStoredRefreshToken()) {
        await loginMobile(data.session.access_token);
      }

      const [profile, branches] = await Promise.all([
        apiFetch<BackendProfile>("/profiles/me"),
        apiFetch<Branch[]>("/branches").catch(() => []),
      ]);
      if (!active) return;
      if (profile.role !== "OWNER") {
        setError("Chỉ Owner được cấu hình và thanh toán gói Chain.");
        setLoading(false);
        return;
      }

      const existing = branches
        .filter((branch) => branch.type === "OUTLET")
        .map((branch) => ({
          id: branch.id,
          name: branch.name,
          code: branch.code ?? "",
        }));
      const knownCount = Math.max(
        existing.length,
        profile.business?.chainOutletLimit ?? 0,
      );
      setCurrentOutletCount(knownCount);
      setOutlets([
        ...existing,
        ...Array.from(
          { length: Math.max(0, outletCount - existing.length) },
          (_, index) => emptyOutlet(existing.length + index),
        ),
      ]);
      setLoading(false);
    };

    load().catch((cause) => {
      if (!active) return;
      setError(cause instanceof Error ? cause.message : "Không tải được cấu hình.");
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [outletCount, router, supabase]);

  const validationError = useMemo(() => {
    if (outlets.length !== outletCount) {
      return `Cần giữ đúng ${outletCount} outlet trước khi thanh toán.`;
    }
    if (outlets.some((outlet) => !outlet.name.trim() || !outlet.code.trim())) {
      return "Tên và mã chi nhánh không được để trống.";
    }
    const codes = outlets.map((outlet) => outlet.code.trim().toUpperCase());
    if (new Set(codes).size !== codes.length) {
      return "Mã chi nhánh không được trùng nhau.";
    }
    if (purchaseMode === "OUTLET_INCREASE" && outletCount <= currentOutletCount) {
      return "Tăng giữa kỳ phải có số outlet lớn hơn gói hiện tại.";
    }
    return null;
  }, [currentOutletCount, outletCount, outlets, purchaseMode]);

  const updateOutlet = (index: number, patch: Partial<OutletDraft>) => {
    setOutlets((current) =>
      current.map((outlet, outletIndex) =>
        outletIndex === index ? { ...outlet, ...patch } : outlet,
      ),
    );
  };

  const removeOutlet = (index: number) => {
    setOutlets((current) => current.filter((_, outletIndex) => outletIndex !== index));
  };

  const addOutlet = () => {
    setOutlets((current) => [...current, emptyOutlet(current.length)]);
  };

  const checkout = async () => {
    if (validationError || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await apiFetch<{ checkoutUrl?: string; error?: string }>(
        "/payments/create-link",
        {
          method: "POST",
          body: JSON.stringify({
            planCode,
            outletCount,
            purchaseMode,
            origin: window.location.origin,
            chainConfiguration: {
              outlets: outlets.map((outlet) => ({
                ...(outlet.id ? { id: outlet.id } : {}),
                name: outlet.name.trim(),
                code: outlet.code.trim().toUpperCase(),
              })),
            },
          }),
        },
      );
      if (!result.checkoutUrl) {
        throw new Error(result.error ?? "PayOS không trả về đường dẫn thanh toán.");
      }
      window.location.assign(result.checkoutUrl);
    } catch (cause) {
      setError(
        cause instanceof Error && !cause.message.startsWith("apiFetch")
          ? cause.message
          : "Không thể tạo thanh toán. Vui lòng kiểm tra lại cấu hình.",
      );
      setSubmitting(false);
    }
  };

  if (loading) return <SetupLoading />;

  return (
    <div className="min-h-screen bg-[#FAF9F7]">
      <NavBar />
      <main className="mx-auto max-w-3xl px-4 pb-20 pt-28">
        <Link
          href="/pricing"
          className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-[#6F6B63] hover:text-[#1E1E1E]"
        >
          <ArrowLeft className="h-4 w-4" />
          Quay lại bảng giá
        </Link>

        <div className="rounded-xl border border-[#E0DCD5] bg-white p-6 shadow-sm md:p-8">
          <div className="mb-7 flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-lime-50 text-[#6B8E23]">
              <Building2 className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-[#6B8E23]">
                {purchaseMode === "OUTLET_INCREASE"
                  ? "Tăng outlet giữa kỳ"
                  : "Thiết lập gói Chain"}
              </p>
              <h1 className="mt-1 text-2xl font-bold text-[#1E1E1E]">
                Xác nhận {outletCount} outlet
              </h1>
              <p className="mt-2 text-sm leading-6 text-[#6F6B63]">
                Kho Tổng được tạo tự động và không tính phí. Cấu hình chỉ có hiệu
                lực sau khi PayOS xác nhận thanh toán.
              </p>
            </div>
          </div>

          <div className="space-y-4">
            {outlets.map((outlet, index) => (
              <div
                key={outlet.id ?? `new-${index}`}
                className="grid gap-3 rounded-lg border border-[#E0DCD5] bg-[#FAF9F7] p-4 md:grid-cols-[1fr_160px_auto]"
              >
                <label className="text-sm font-semibold text-[#1E1E1E]">
                  Tên chi nhánh
                  <input
                    value={outlet.name}
                    onChange={(event) =>
                      updateOutlet(index, { name: event.target.value })
                    }
                    className="mt-2 w-full rounded-md border border-[#D7D2CA] bg-white px-3 py-2 font-normal outline-none focus:border-[#6B8E23]"
                  />
                </label>
                <label className="text-sm font-semibold text-[#1E1E1E]">
                  Mã
                  <input
                    value={outlet.code}
                    onChange={(event) =>
                      updateOutlet(index, { code: event.target.value })
                    }
                    className="mt-2 w-full rounded-md border border-[#D7D2CA] bg-white px-3 py-2 font-normal uppercase outline-none focus:border-[#6B8E23]"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => removeOutlet(index)}
                  className="self-end rounded-md border border-red-200 bg-white p-2.5 text-red-600 hover:bg-red-50"
                  aria-label={`Bỏ ${outlet.name || `chi nhánh ${index + 1}`}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>

          {outlets.length < outletCount ? (
            <button
              type="button"
              onClick={addOutlet}
              className="mt-4 inline-flex items-center gap-2 rounded-lg border border-[#D7D2CA] px-4 py-2 text-sm font-semibold text-[#1E1E1E] hover:border-[#6B8E23]"
            >
              <Plus className="h-4 w-4" />
              Thêm chi nhánh
            </button>
          ) : null}

          {(error || validationError) && (
            <div className="mt-5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error ?? validationError}
            </div>
          )}

          <button
            type="button"
            disabled={Boolean(validationError) || submitting}
            onClick={checkout}
            className="mt-6 w-full rounded-lg bg-[#6B8E23] px-5 py-3 font-bold text-white hover:bg-[#556B2F] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? "Đang tạo thanh toán..." : "Tiếp tục tới PayOS"}
          </button>
        </div>
      </main>
    </div>
  );
}
