"use client";

import { useMemo, useState } from "react";
import { vulfMono } from "@/app/fonts";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList,
} from "recharts";
import {
  CostsResponse, useRangedReport, LoadingOrError, Section, DataGapBanner, MoneyTooltip,
  fmtMoney0, fmtAxisMoney, fmtPct1, monthShort, AXIS_TICK, GRID_STROKE, GREEN,
} from "./shared";

type SortCol = "name" | "amount" | "pct";
type SortDir = "desc" | "asc";

export default function CostDetailsView({ token, query }: { token: string; query: string }) {
  const { data, loading, error } = useRangedReport<CostsResponse>("/api/admin/accounting/reports/costs", token, query);
  const [sortCol, setSortCol] = useState<SortCol>("amount");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const laborData = useMemo(
    () => (data?.laborByMonth ?? []).map((m) => ({
      label: monthShort(m.period_month),
      Labor: Math.round(m.amount * 100) / 100,
    })),
    [data],
  );

  const totalOpex = data?.totals.totalOperatingCosts ?? 0;

  const rows = useMemo(() => {
    const out = (data?.breakdown ?? []).map((b) => ({
      code: b.code,
      name: b.name,
      amount: b.amount,
      pct: totalOpex > 0 ? b.amount / totalOpex : 0,
    }));
    out.sort((a, b) => {
      let cmp = 0;
      if (sortCol === "name") cmp = a.name.localeCompare(b.name);
      else cmp = a.amount - b.amount; // pct sorts identically to amount
      return sortDir === "desc" ? -cmp : cmp;
    });
    return out;
  }, [data, totalOpex, sortCol, sortDir]);

  function toggleSort(col: SortCol) {
    if (sortCol === col) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else { setSortCol(col); setSortDir(col === "name" ? "asc" : "desc"); }
  }

  const Th = ({ label, col, right }: { label: string; col: SortCol; right?: boolean }) => (
    <th
      onClick={() => toggleSort(col)}
      className={`px-4 pb-3 pt-4 font-medium whitespace-nowrap cursor-pointer select-none hover:text-neutral-600 ${right ? "text-right" : ""} ${sortCol === col ? "text-neutral-700" : ""}`}
    >
      {label}{sortCol === col ? (sortDir === "desc" ? " ↓" : " ↑") : ""}
    </th>
  );

  return (
    <div className="space-y-6">
      <DataGapBanner dataStartsAt={data?.dataStartsAt} />

      {loading || error ? <LoadingOrError loading={loading} error={error} /> : (
        <>
          <Section title="Labor Costs by Month">
            {laborData.length === 0 ? (
              <p className={`${vulfMono.className} text-sm text-neutral-400 px-6 py-12 text-center`}>No labor costs in this range.</p>
            ) : (
              <div className="px-2 pt-8 pb-4">
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={laborData} margin={{ top: 20, right: 40, left: 12, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
                    <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} interval="preserveStartEnd" padding={{ left: 16, right: 16 }} />
                    <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={52} tickFormatter={fmtAxisMoney} />
                    <Tooltip content={<MoneyTooltip />} />
                    <Area type="monotone" dataKey="Labor" stroke={GREEN} strokeWidth={2} fill={GREEN} fillOpacity={0.12}
                      dot={{ r: 3, fill: GREEN }} activeDot={{ r: 5 }}>
                      <LabelList
                        dataKey="Labor"
                        position="top"
                        offset={10}
                        formatter={(v: unknown) => fmtMoney0(Number(v))}
                        style={{ fontFamily: "var(--font-display,monospace)", fontSize: 10, fill: "#6b7280" }}
                      />
                    </Area>
                  </AreaChart>
                </ResponsiveContainer>
                <p className={`${vulfMono.className} text-[10px] text-neutral-400 px-4 mt-1`}>
                  Payroll wages + employer taxes per month.
                </p>
              </div>
            )}
          </Section>

          <Section title="Operating Cost Accounts">
            {rows.length === 0 ? (
              <p className={`${vulfMono.className} text-sm text-neutral-400 px-6 py-12 text-center`}>No operating costs in this range.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className={`${vulfMono.className} w-full min-w-[560px] text-sm`}>
                  <thead>
                    <tr className="border-b border-black/10 text-left text-xs uppercase tracking-wide text-neutral-400">
                      <Th label="Account" col="name" />
                      <Th label="Amount" col="amount" right />
                      <Th label="% of Operating Costs" col="pct" right />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.code} className="border-b border-black/5 hover:bg-neutral-50/60">
                        <td className="px-4 py-2.5 text-neutral-800">
                          <span className="text-neutral-400 mr-2">{r.code}</span>{r.name}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-neutral-700">{fmtMoney0(r.amount)}</td>
                        <td className="px-4 py-2.5 text-right">
                          <div className="flex items-center justify-end gap-3">
                            <div className="hidden sm:block w-20 h-1.5 rounded-full bg-black/5 overflow-hidden">
                              <div className="h-full rounded-full bg-[#884A20]" style={{ width: `${Math.min(100, r.pct * 100)}%` }} />
                            </div>
                            <span className="tabular-nums text-neutral-500 w-12 text-right">{fmtPct1(r.pct)}</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                    <tr className="border-t border-black/15 bg-neutral-50/60">
                      <td className="px-4 py-2.5 font-bold text-neutral-800 uppercase text-xs tracking-wide">Total operating costs</td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-bold text-neutral-800">{fmtMoney0(totalOpex)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-bold text-neutral-500">100%</td>
                    </tr>
                  </tbody>
                </table>
                <p className={`${vulfMono.className} text-[10px] text-neutral-400 px-4 py-3`}>
                  Operating-expense accounts only — labor, COGS, depreciation, and interest are excluded
                  (see the Costs tab for those totals).
                </p>
              </div>
            )}
          </Section>
        </>
      )}
    </div>
  );
}
