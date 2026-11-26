// Group-wide reports: sign-ups by month (reports.signups) and birthdays in a month (reports.birthdays).
// Customer phone numbers arrive masked from the server.
"use client";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { RangeFilter, useRangeState } from "@/components/filters";
import { Card, ErrorBox, Loading, PageHeader, Select } from "@/components/ui";
import { errorMessage } from "@/lib/errors";
import { apiErrorOf, useBirthdays, useSignups } from "@/lib/queries";
import { strings } from "@/lib/strings";

const MONTHS = Array.from({ length: 12 }, (_, i) => ({
  value: i + 1,
  label: new Date(2000, i, 1).toLocaleString(undefined, { month: "long" }),
}));

export default function Reports() {
  const state = useRangeState(365);
  const signups = useSignups(state.range.from, state.range.to);
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const birthdays = useBirthdays(month);

  return (
    <div className="space-y-6">
      <PageHeader title={strings.nav.reports} />
      <RangeFilter state={state} showBusiness={false} />

      <Card title={strings.reports.signupsTitle}>
        {signups.isPending ? <Loading /> : signups.isError ? (
          <ErrorBox message={errorMessage(apiErrorOf(signups.error))} onRetry={() => signups.refetch()} />
        ) : signups.data.length === 0 ? (
          <p className="py-6 text-sm text-muted">{strings.common.none}</p>
        ) : (
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={signups.data} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
                <CartesianGrid stroke="var(--color-line)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="month" stroke="var(--color-muted)" fontSize={12} />
                <YAxis stroke="var(--color-muted)" fontSize={12} allowDecimals={false} />
                <Tooltip contentStyle={{ background: "var(--color-panel)", border: "1px solid var(--color-line)", color: "var(--color-fg)" }}
                  cursor={{ fill: "rgba(212,175,55,0.08)" }} />
                <Legend />
                <Bar dataKey="new_customers" name={strings.reports.signupsNew} fill="var(--color-gold)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="now_active_members" name={strings.reports.signupsActive} fill="var(--color-gold-light)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      <Card title={strings.reports.birthdaysTitle}
        actions={
          <div className="w-44">
            <Select label="" aria-label={strings.reports.birthdayMonth} value={month} onChange={(e) => setMonth(Number(e.target.value))}>
              {MONTHS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </Select>
          </div>
        }>
        {birthdays.isPending ? <Loading /> : birthdays.isError ? (
          <ErrorBox message={errorMessage(apiErrorOf(birthdays.error))} onRetry={() => birthdays.refetch()} />
        ) : birthdays.data.length === 0 ? (
          <p className="py-6 text-sm text-muted">{strings.common.none}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-muted">
                <tr>
                  <th className="py-2 pr-4">{strings.reports.day}</th>
                  <th className="py-2 pr-4">{strings.reports.customer}</th>
                  <th className="py-2 pr-4">{strings.reports.phone}</th>
                  <th className="py-2">{strings.reports.membership}</th>
                </tr>
              </thead>
              <tbody>
                {birthdays.data.map((b) => (
                  <tr key={b.customer.customer_id} className="border-t border-line">
                    <td className="py-2 pr-4">{b.birth_day}</td>
                    <td className="py-2 pr-4">{b.customer.full_name}</td>
                    <td className="py-2 pr-4 text-muted">{b.customer.phone_masked ?? "—"}</td>
                    <td className="py-2">{b.customer.membership_status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
