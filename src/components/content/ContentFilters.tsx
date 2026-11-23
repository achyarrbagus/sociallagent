"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { agencySelectClass } from "@/components/agency/AgencyForm";
import { Label } from "@/components/ui/label";
import { CONTENT_STATUSES, CONTENT_STATUS_LABELS } from "@/lib/content/schemas";

export function ContentFilters({ brands, brandId, status }: { brands: { id: string; name: string }[]; brandId: string; status: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    router.replace(`${pathname}?${next}`);
  };
  return <div className="flex flex-wrap gap-3">
    <div className="space-y-2"><Label htmlFor="content-filter-brand">Brand</Label>
      <select id="content-filter-brand" className={agencySelectClass} value={brandId} onChange={(e) => set("brandId", e.target.value)}>
        <option value="">Semua brand</option>{brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
      </select></div>
    <div className="space-y-2"><Label htmlFor="content-filter-status">Status</Label>
      <select id="content-filter-status" className={agencySelectClass} value={status} onChange={(e) => set("status", e.target.value)}>
        <option value="">Semua konten</option>{CONTENT_STATUSES.map((s) => <option key={s} value={s}>{CONTENT_STATUS_LABELS[s]}</option>)}
      </select></div>
  </div>;
}
