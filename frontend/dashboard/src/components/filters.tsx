// Business + date range filter shared by the report pages. Business null = whole group.
"use client";
import { useMemo, useState } from "react";
import { Button, Field, Select } from "@/components/ui";
import { daysAgo, endExclusiveIso, startOfDayIso, toDateInput } from "@/lib/dates";
import type { Range } from "@/lib/queries";
import { useManagedBusinesses } from "@/lib/queries";
import { strings } from "@/lib/strings";

export function useRangeState(defaultDays = 30) {
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [fromDay, setFromDay] = useState(daysAgo(defaultDays - 1));
  const [toDay, setToDay] = useState(toDateInput(new Date()));
  const range: Range = useMemo(
    () => ({ businessId, from: startOfDayIso(fromDay), to: endExclusiveIso(toDay) }),
    [businessId, fromDay, toDay],
  );
  return { businessId, setBusinessId, fromDay, setFromDay, toDay, setToDay, range };
}

export type RangeState = ReturnType<typeof useRangeState>;

export function RangeFilter({ state, showBusiness = true }: { state: RangeState; showBusiness?: boolean }) {
  const businesses = useManagedBusinesses();
  const preset = (days: number) => {
    state.setFromDay(daysAgo(days - 1));
    state.setToDay(toDateInput(new Date()));
  };
  return (
    <div className="mb-6 flex flex-wrap items-end gap-3 rounded-xl border border-line bg-panel p-4">
      {showBusiness && (
        <div className="min-w-48">
          <Select label={strings.common.business} value={state.businessId ?? ""}
            onChange={(e) => state.setBusinessId(e.target.value || null)}>
            <option value="">{strings.common.wholeGroup}</option>
            {(businesses.data ?? []).map((b) => (
              <option key={b.id} value={b.id}>{b.name}{b.is_active ? "" : ` (${strings.businesses.inactive})`}</option>
            ))}
          </Select>
        </div>
      )}
      <Field label={strings.common.from} type="date" value={state.fromDay} max={state.toDay}
        onChange={(e) => e.target.value && state.setFromDay(e.target.value)} />
      <Field label={strings.common.to} type="date" value={state.toDay} min={state.fromDay}
        onChange={(e) => e.target.value && state.setToDay(e.target.value)} />
      <div className="flex gap-2">
        <Button tone="plain" type="button" onClick={() => preset(7)}>{strings.reports.last7}</Button>
        <Button tone="plain" type="button" onClick={() => preset(30)}>{strings.reports.last30}</Button>
        <Button tone="plain" type="button" onClick={() => preset(90)}>{strings.reports.last90}</Button>
      </div>
    </div>
  );
}
