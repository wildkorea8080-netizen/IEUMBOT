"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

import { ApiClientError } from "../../lib/api";
import {
  getInquiries,
  updateInquiry,
  type ProductInquiryItem,
  type ProductInquiryStatus,
} from "../../lib/api/inquiries-operations";

const STATUS_META: Record<ProductInquiryStatus, { label: string; className: string }> = {
  new: { label: "신규", className: "bg-amber-100 text-amber-800" },
  contacted: { label: "컨택완료", className: "bg-blue-100 text-blue-800" },
  converted: { label: "계정발급", className: "bg-emerald-100 text-emerald-800" },
  closed: { label: "종료", className: "bg-slate-200 text-slate-600" },
};

const FILTERS: Array<{ value: string; label: string }> = [
  { value: "", label: "전체" },
  { value: "new", label: "신규" },
  { value: "contacted", label: "컨택완료" },
  { value: "converted", label: "계정발급" },
  { value: "closed", label: "종료" },
];

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return date.toLocaleString("ko-KR", { dateStyle: "medium", timeStyle: "short" });
}

export function InquiriesManagement() {
  const [items, setItems] = useState<ProductInquiryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async (status: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await getInquiries(status || undefined);
      setItems(result.items);
      setTotal(result.total);
      setNotes(Object.fromEntries(result.items.map((item) => [item.id, item.handledNote ?? ""])));
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "문의 목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(filter);
  }, [filter, load]);

  const patch = useCallback(
    async (id: string, body: { status?: ProductInquiryStatus; handledNote?: string }) => {
      setSavingId(id);
      try {
        const updated = await updateInquiry(id, body);
        setItems((prev) => prev.map((item) => (item.id === id ? updated : item)));
      } catch {
        setError("변경 저장에 실패했습니다.");
      } finally {
        setSavingId(null);
      }
    },
    [],
  );

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">도입 문의</h1>
          <p className="mt-1 text-sm text-slate-500">
            접수된 문의를 확인하고 컨택 후 조직·계정을 발급합니다. (총 {total}건)
          </p>
        </div>
        <Link
          href="/super-admin/organizations"
          className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          + 조직·계정 생성
        </Link>
      </header>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setFilter(option.value)}
            className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
              filter === option.value
                ? "bg-slate-900 text-white"
                : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : null}

      {loading ? (
        <p className="text-sm text-slate-400">불러오는 중…</p>
      ) : items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-400">
          접수된 문의가 없습니다.
        </p>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => {
            const meta = STATUS_META[item.status] ?? STATUS_META.new;
            return (
              <li key={item.id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-900">{item.organizationName}</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${meta.className}`}>
                        {meta.label}
                      </span>
                      {item.interest ? (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                          {item.interest}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-sm text-slate-600">
                      {item.contactName} · <a href={`mailto:${item.email}`} className="text-brand-600 hover:underline">{item.email}</a> ·{" "}
                      <a href={`tel:${item.phone}`} className="text-brand-600 hover:underline">{item.phone}</a>
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400">{formatDateTime(item.createdAt)}</span>
                    <select
                      value={item.status}
                      disabled={savingId === item.id}
                      onChange={(event) => void patch(item.id, { status: event.target.value as ProductInquiryStatus })}
                      className="rounded-md border border-slate-300 px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-brand-600"
                    >
                      {(Object.keys(STATUS_META) as ProductInquiryStatus[]).map((status) => (
                        <option key={status} value={status}>
                          {STATUS_META[status].label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {item.message ? (
                  <p className="mt-3 whitespace-pre-wrap rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">
                    {item.message}
                  </p>
                ) : null}

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <input
                    value={notes[item.id] ?? ""}
                    onChange={(event) => setNotes((prev) => ({ ...prev, [item.id]: event.target.value }))}
                    placeholder="처리 메모"
                    className="min-w-[200px] flex-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-brand-600"
                  />
                  <button
                    type="button"
                    disabled={savingId === item.id || (notes[item.id] ?? "") === (item.handledNote ?? "")}
                    onClick={() => void patch(item.id, { handledNote: notes[item.id] ?? "" })}
                    className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    메모 저장
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
