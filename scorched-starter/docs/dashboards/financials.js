(function () {
  "use strict";
  const S = window.Scorched;
  const { api, fmt, dates, ui, viz, journal } = S;
  const h = ui.h;

  // Where the two entry forms live when the page runs from a snapshot (it cannot write to the API).
  const INPUTS_URL = "https://www.scorchedstudio.com/admin/reporting/inputs";
  const inputsNote = (what) => ui.card({ title: what, body: h("p", { class: "subtle-line" }, "Enter these in the app: ", h("a", { href: INPUTS_URL, target: "_blank", rel: "noopener", text: "Admin, Reporting, Report inputs" }), ". The dashboard shows them after its next data refresh.") });
  const LABOR_CODES = ["6000", "6010"];
  const MAX_SERIES = 9;
  const OTHER = "Other";
  const LABOR_SLICE = "Labor";
  const LABOR_NAME_TO_CODE = { "Payroll: Wages": "6000", "Payroll: Employer Taxes": "6010" };
  const LABOR_SERIES_NAMES = new Set(Object.keys(LABOR_NAME_TO_CODE));
  const DSCR_MIN = 1.25;
  const DSCR_EXPLAINER = "Debt Service Coverage Ratio: trailing 12-month EBITDA divided by trailing 12-month debt payments (principal plus interest). Above 1.0 means the business generates enough cash to cover its debt. Lenders typically want 1.25 or higher.";

  // Money group by default; the two planning tabs sit under Plan.
  const TABS = [
    { id: "pl", label: "P&L" },
    { id: "monthly", label: "Monthly P&L" },
    { id: "costs", label: "Costs" },
    { id: "cash", label: "Cash & Balance" },
    { id: "plan", label: "Targets", group: "plan" },
    { id: "normalized", label: "Normalized EBITDA", group: "plan", quiet: true },
  ];
  const RANGED = ["pl", "monthly", "costs"];
  const CASH_CODES = new Set(["1000", "1100", "1110"]); // checking plus the card processors' clearing accounts

  let shell = null;
  let mounted = false;
  const cache = new Map();      // path -> promise of json
  const tabData = {};           // tab -> { key, data }
  const state = {
    query: S.range.toQuery({ preset: "3m" }),
    pl: { selected: null },
    monthly: { sort: { col: "month", dir: "asc" }, drill: null, drillAccount: null },
    costs: { selected: null, showCharges: false, sort: { col: "amount", dir: "desc" } },
    balance: { asOf: dates.todayDenverYmd() },
    plan: { showInfo: false, msg: null, msgTone: null },
    normalized: { msg: null, msgTone: null },
  };

  // ── helpers ────────────────────────────────────────────────────────────
  function num(v) { return Number(v || 0); }
  function dropEmptyTrailingMonths(months) {
    const out = [...months].sort((a, b) => a.period_month.localeCompare(b.period_month));
    while (out.length) {
      const l = out[out.length - 1];
      if (num(l.revenue) === 0 && num(l.cogs) === 0 && num(l.operating_expenses) === 0 && num(l.net_income) === 0) out.pop(); else break;
    }
    return out;
  }
  function sumLinesByMonth(lines, codes) {
    const set = new Set(codes), out = new Map();
    for (const l of lines) { if (!set.has(l.code)) continue; out.set(l.period_month, (out.get(l.period_month) || 0) + num(l.amount)); }
    return out;
  }
  function getJson(path) {
    if (!cache.has(path)) {
      const p = api.get(path).catch((e) => { cache.delete(path); throw e; });
      cache.set(path, p);
    }
    return cache.get(path);
  }
  function withQ(path, q) { return q ? path + "?" + q : path; }
  function negCls(v) { return v < 0 ? "neg" : ""; }
  function moneyCell(v) { return fmt.money0(v); }

  // ── per-tab data keys + loaders ────────────────────────────────────────
  const loaders = {
    pl: { key: () => "pl|" + state.query, load: async () => ({ pl: await getJson(withQ("/api/admin/accounting/reports/pl", state.query)), seasonality: await getJson("/api/admin/accounting/reports/seasonality") }) },
    monthly: { key: () => "monthly|" + state.query, load: async () => ({ pl: await getJson(withQ("/api/admin/accounting/reports/pl", state.query)) }) },
    costs: { key: () => "costs|" + state.query, load: async () => ({ costs: await getJson(withQ("/api/admin/accounting/reports/costs", state.query)) }) },
    cash: { key: () => "cash|" + state.balance.asOf, load: async () => ({ cf: await getJson("/api/admin/accounting/reports/cash-flow"), bs: await getJson("/api/admin/accounting/reports/balance-sheet?asOf=" + state.balance.asOf) }) },
    plan: { key: () => "plan", load: async () => ({ pj: await getJson("/api/admin/accounting/projections"), pl: await getJson("/api/admin/accounting/reports/pl") }) },
    normalized: { key: () => "normalized", load: async () => ({ nm: await getJson("/api/admin/accounting/reports/normalized") }) },
  };
  const renderers = {};

  async function show(tab) {
    if (!shell) return;
    const view = shell.views[tab];
    const key = loaders[tab].key();
    const cur = tabData[tab];
    if (cur && cur.key === key && cur.data) { render(tab); return; }
    if (cur && cur.data) view.classList.add("refreshing"); else ui.replace(view, ui.loading("Loading"));
    try {
      const data = await loaders[tab].load();
      tabData[tab] = { key, data };
      if (loaders[tab].key() === key) render(tab);
    } catch (e) {
      if (e.status !== 401) { tabData[tab] = null; ui.replace(view, ui.error(e.message)); }
    } finally {
      view.classList.remove("refreshing");
    }
  }
  function render(tab) {
    const view = shell.views[tab];
    const td = tabData[tab];
    if (!td || !td.data) return;
    const nodes = [];
    const after = [];
    renderers[tab](td.data, nodes, after);
    destroyChartsIn(view);
    ui.replace(view, ...nodes);
    for (const fn of after) fn();
  }
  // Every render builds fresh chart hosts, so the charts drawn into the old
  // hosts have to be destroyed by hand or they keep animating off-screen.
  function destroyChartsIn(view) {
    for (const [host, chart] of [...viz._charts]) {
      if (view.contains(host) || !host.isConnected) { try { chart.destroy(); } catch (e) { /* already gone */ } viz._charts.delete(host); }
    }
  }
  function reload(tab) { const td = tabData[tab]; if (td) td.key = null; show(tab); }

  // ── P&L ────────────────────────────────────────────────────────────────
  renderers.pl = ({ pl, seasonality }, nodes, after) => {
    const c = viz.colors();
    const months = dropEmptyTrailingMonths(pl.months || []);
    const labor = sumLinesByMonth(pl.lines || [], LABOR_CODES);
    const totals = months.reduce((t, m) => ({ revenue: t.revenue + num(m.revenue), netIncome: t.netIncome + num(m.net_income), cogs: t.cogs + num(m.cogs), opex: t.opex + num(m.operating_expenses) }), { revenue: 0, netIncome: 0, cogs: 0, opex: 0 });
    const sel = state.pl.selected;
    const toggle = (k) => { state.pl.selected = sel === k ? null : k; render("pl"); };
    const pctSub = totals.revenue > 0 ? null : "no revenue in range";

    nodes.push(ui.kpis(4, [
      ui.kpi({ label: "Net Revenue", value: fmt.money0(totals.revenue), sub: "click to isolate line", onClick: () => toggle("revenue"), selected: sel === "revenue" }),
      ui.kpi({ label: "Net Profit", value: fmt.money0(totals.netIncome), tone: totals.netIncome < 0 ? "bad" : "good", sub: "click to isolate line", onClick: () => toggle("profit"), selected: sel === "profit" }),
      ui.kpi({ label: "COGS % of Revenue", value: totals.revenue > 0 ? fmt.pct1(totals.cogs / totals.revenue) : "--", sub: pctSub || "click to highlight COGS", onClick: () => toggle("cogs"), selected: sel === "cogs" }),
      ui.kpi({ label: "Operating Cost % of Revenue", value: totals.revenue > 0 ? fmt.pct1(totals.opex / totals.revenue) : "--", sub: pctSub || "click to highlight OpEx", onClick: () => toggle("opex"), selected: sel === "opex" }),
    ]));

    // Seasonality: latest complete month with an index (the in-progress month always reads as far below average).
    const currentMonth = dates.todayDenverYmd().slice(0, 7);
    const srows = (seasonality.rows || []).filter((r) => r.index != null && r.period_month.slice(0, 7) !== currentMonth).sort((a, b) => a.period_month.localeCompare(b.period_month));
    const now = srows.length ? srows[srows.length - 1] : null;
    if (now) {
      const pct = Math.round((Number(now.index) - 1) * 100);
      const line = h("p", { class: "subtle-line" }, "Seasonality: " + fmt.monthShort(now.period_month) + " revenue is running ");
      if (pct === 0) line.append(h("span", { class: "t-strong", text: "in line with" }));
      else line.append(h("span", { class: pct > 0 ? "t-good" : "t-bad", text: Math.abs(pct) + "% " + (pct > 0 ? "above" : "below") }));
      line.append(" its 12-month average.");
      nodes.push(line);
    }

    const labels = months.map((m) => fmt.monthShort(m.period_month));
    const lineAlpha = (which) => {
      if (sel !== "revenue" && sel !== "profit") return 1;
      if (sel === "revenue") return which === "revenue" ? 1 : 0.15;
      return which === "netProfit" ? 1 : 0.15;
    };
    const col = (base, a) => (a === 1 ? base : viz.withAlpha(base, a));
    const revHost = h("div", {}), costHost = h("div", {});
    const revLegend = viz.legend([
      { label: "Net Revenue", color: c.green, kind: "line" },
      { label: "Gross Profit", color: c.brown, kind: "line" },
      { label: "Net Profit", color: c.blue, kind: "line" },
    ]);
    const costLegend = viz.legend([
      { label: "COGS", color: c.brown, kind: "rect" },
      { label: "Labor", color: c.green, kind: "rect" },
      { label: "Other OpEx", color: c.blue, kind: "rect" },
    ]);
    const revNote = (sel === "revenue" || sel === "profit") ? ui.note("Isolating " + (sel === "revenue" ? "Net Revenue" : "Net Profit") + ". Click the tile again to reset.") : null;
    const costNote = (sel === "cogs" || sel === "opex") ? ui.note("Highlighting " + (sel === "cogs" ? "COGS" : "operating costs (labor plus other OpEx)") + ". Click the tile again to reset.") : null;
    const empty = months.length === 0;
    nodes.push(h("div", { class: "grid-2" },
      ui.card({ title: "Revenue vs Profit by Month", bodyClass: "tight", body: empty ? ui.empty("No posted activity in this range.") : [revHost, revLegend, revNote] }),
      ui.card({ title: "Cost Structure by Month", bodyClass: "tight", body: empty ? ui.empty("No posted activity in this range.") : [costHost, costLegend, costNote] }),
    ));
    if (!empty) after.push(() => {
      viz.line(revHost, {
        labels, format: "money", height: 300, xTick: fmt.monthTick,
        datasets: [
          { label: "Net Revenue", data: months.map((m) => Math.round(num(m.revenue) * 100) / 100), color: col(c.green, lineAlpha("revenue")) },
          { label: "Gross Profit", data: months.map((m) => Math.round(num(m.gross_profit) * 100) / 100), color: col(c.brown, lineAlpha("grossProfit")) },
          { label: "Net Profit", data: months.map((m) => Math.round(num(m.net_income) * 100) / 100), color: col(c.blue, lineAlpha("netProfit")) },
        ],
      });
      viz.bar(costHost, {
        labels, format: "money", height: 300, stacked: true, tooltipTotal: true, xTick: fmt.monthTick,
        datasets: [
          { label: "COGS", data: months.map((m) => Math.round(num(m.cogs) * 100) / 100), color: c.brown },
          { label: "Labor", data: months.map((m) => Math.round((labor.get(m.period_month) || 0) * 100) / 100), color: c.green },
          { label: "Other OpEx", data: months.map((m) => Math.round((num(m.operating_expenses) - (labor.get(m.period_month) || 0)) * 100) / 100), color: c.blue },
        ],
        dim: (i, di) => (sel === "cogs" ? di !== 0 : sel === "opex" ? di === 0 : false),
      });
    });
  };

  // ── Monthly P&L ────────────────────────────────────────────────────────
  const DRILL_LABEL = { revenue: "Net Revenue", cogs: "COGS", labor: "Labor Costs", opex: "OpEx", depreciation: "Depreciation", interest: "Interest" };
  function lineMatchesCol(line, col) {
    switch (col) {
      case "revenue": return line.type === "revenue";
      case "cogs": return line.type === "cogs";
      case "labor": return LABOR_CODES.includes(line.code);
      case "opex": return line.type === "expense" && line.code !== "7000" && line.code !== "8000";
      case "depreciation": return line.code === "7000";
      case "interest": return line.code === "8000";
    }
    return false;
  }
  renderers.monthly = ({ pl }, nodes, after) => {
    const st = state.monthly;
    const months = dropEmptyTrailingMonths(pl.months || []);
    const labor = sumLinesByMonth(pl.lines || [], LABOR_CODES);
    let rows = months.map((m) => ({
      period_month: m.period_month, revenue: num(m.revenue), cogs: num(m.cogs), labor: labor.get(m.period_month) || 0, gross: num(m.gross_profit),
      opex: num(m.operating_expenses), ebitda: num(m.ebitda), depreciation: num(m.depreciation), interest: num(m.interest), net: num(m.net_income),
    }));
    rows = ui.sortRows(rows, st.sort, { month: (r) => r.period_month });
    const totals = rows.reduce((t, r) => { for (const k of ["revenue", "cogs", "labor", "gross", "opex", "ebitda", "depreciation", "interest", "net"]) t[k] += r[k]; return t; }, { revenue: 0, cogs: 0, labor: 0, gross: 0, opex: 0, ebitda: 0, depreciation: 0, interest: 0, net: 0 });
    const onSort = (col) => { st.sort = ui.nextSort(st.sort, col, col === "month" ? "asc" : "desc"); render("monthly"); };
    const toggleDrill = (month, col) => { st.drillAccount = null; st.drill = st.drill && st.drill.month === month && st.drill.col === col ? null : { month, col }; render("monthly"); };
    const drillCell = (col) => (r) => {
      const active = st.drill && st.drill.month === r.period_month && st.drill.col === col;
      return h("button", { type: "button", class: "drill", "aria-expanded": String(!!active), title: "Break down " + DRILL_LABEL[col] + " for " + fmt.monthShort(r.period_month), onClick: () => toggleDrill(r.period_month, col) }, fmt.money0(r[col]));
    };
    const columns = [
      { key: "month", label: "Month", sortable: true, sticky: true, strong: true, cell: (r) => fmt.monthShort(r.period_month) },
      { key: "revenue", label: "Net Revenue", align: "r", sortable: true, cell: drillCell("revenue") },
      { key: "cogs", label: "COGS", align: "r", sortable: true, cell: drillCell("cogs") },
      { key: "labor", label: "Labor Costs", align: "r", sortable: true, cell: drillCell("labor") },
      { key: "gross", label: "Gross Profit", align: "r", sortable: true, strong: true, cls: (r) => negCls(r.gross), cell: (r) => fmt.money0(r.gross) },
      { key: "opex", label: "OpEx", align: "r", sortable: true, cell: drillCell("opex") },
      { key: "ebitda", label: "EBITDA", align: "r", sortable: true, strong: true, cls: (r) => negCls(r.ebitda), cell: (r) => fmt.money0(r.ebitda) },
      { key: "depreciation", label: "Depreciation", align: "r", sortable: true, cell: drillCell("depreciation") },
      { key: "interest", label: "Interest", align: "r", sortable: true, cell: drillCell("interest") },
      { key: "net", label: "Net Income", align: "r", sortable: true, strong: true, cls: (r) => negCls(r.net), cell: (r) => fmt.money0(r.net) },
    ];
    const tcell = (v) => h("span", { class: negCls(v), text: fmt.money0(v) });
    const total = ["Total", tcell(totals.revenue), tcell(totals.cogs), tcell(totals.labor), tcell(totals.gross), tcell(totals.opex), tcell(totals.ebitda), tcell(totals.depreciation), tcell(totals.interest), tcell(totals.net)];
    const afterRow = (r) => {
      if (!st.drill || st.drill.month !== r.period_month) return null;
      const lines = (pl.lines || []).filter((l) => l.period_month === st.drill.month && lineMatchesCol(l, st.drill.col)).sort((a, b) => num(b.amount) - num(a.amount));
      const panel = h("div", { class: "drill-panel", style: { maxWidth: "640px" } },
        h("div", { class: "drill-head" },
          h("p", { class: "drill-title", text: DRILL_LABEL[st.drill.col] + ", " + fmt.monthShort(r.period_month) }),
          h("button", { type: "button", class: "link-btn", text: "Close", onClick: () => { st.drill = null; st.drillAccount = null; render("monthly"); } })),
      );
      if (!lines.length) panel.append(h("p", { class: "note plain", text: "No account activity for this cell." }));
      for (const l of lines) {
        const open = st.drillAccount === l.code;
        panel.append(h("button", { type: "button", class: "acct-row", "aria-expanded": String(open), onClick: () => { st.drillAccount = open ? null : l.code; render("monthly"); } },
          h("span", {}, h("span", { class: "code", text: l.code }), l.name), h("span", { class: "num", text: fmt.money0(l.amount) })));
        if (open) {
          const host = h("div", { style: { margin: "4px 0 8px 8px" } });
          panel.append(host);
          after.push(() => journal.mount(host, { from: r.period_month.slice(0, 10), to: dates.monthEnd(r.period_month), accountCodes: [l.code] }));
        }
      }
      if (lines.length) panel.append(h("p", { class: "note plain", style: { paddingTop: "8px" }, text: "Every account that rolled into this cell, biggest first. Click an account to see its transactions for the month." }));
      return h("tr", {}, h("td", { colspan: "10", style: { padding: "6px 12px", background: "var(--surface-2)" } }, panel));
    };
    const body = rows.length === 0 ? ui.empty("No posted activity in this range.") : ui.table({ columns, rows, sort: st.sort, onSort, total, afterRow, rowKey: (r) => r.period_month });
    nodes.push(ui.card({
      title: "Monthly P&L Table", bodyClass: "flush", body,
      note: "Labor Costs = Payroll: Wages (6000) + Payroll: Employer Taxes (6010); labor is included in OpEx. Gross Profit = Net Revenue minus COGS. Click a column header to sort; oldest month first by default. Click a dollar amount (except the computed Gross Profit, EBITDA and Net Income columns) to see the accounts behind it, then click an account for its transactions.",
    }));
  };

  // ── Costs ──────────────────────────────────────────────────────────────
  renderers.costs = ({ costs }, nodes, after) => {
    const st = state.costs;
    const c = viz.colors();
    const other = viz.css("--series-other");
    const data = costs;
    // Rank accounts by total spend; top 9 get their own series/color, the rest fold into "Other".
    const totalsByName = new Map();
    for (const row of data.monthlyCategories || []) for (const [k, v] of Object.entries(row)) { if (k === "period_month" || typeof v !== "number") continue; totalsByName.set(k, (totalsByName.get(k) || 0) + v); }
    const ranked = [...totalsByName.entries()].sort((a, b) => b[1] - a[1]).map(([n]) => n);
    const majors = ranked.slice(0, MAX_SERIES), minors = ranked.slice(MAX_SERIES), minorSet = new Set(minors);
    const colors = new Map(); majors.forEach((n, i) => colors.set(n, viz.series(i))); colors.set(OTHER, other);
    const colorFor = (n) => colors.get(n) || other;
    const stacked = (data.monthlyCategories || []).map((row) => {
      const out = { label: fmt.monthShort(String(row.period_month)) }; let oth = 0;
      for (const [k, v] of Object.entries(row)) { if (k === "period_month" || typeof v !== "number") continue; if (minorSet.has(k)) oth += v; else out[k] = Math.round(v * 100) / 100; }
      if (minors.length) out[OTHER] = Math.round(oth * 100) / 100;
      return out;
    });
    const seriesNames = minors.length ? [...majors, OTHER] : majors;
    // Donut: opex accounts + synthetic Labor slice + Other.
    const majorSet = new Set(seriesNames);
    const slices = []; let othAmt = 0;
    for (const b of data.breakdown || []) { if (majorSet.has(b.name)) slices.push({ name: b.name, value: Math.round(b.amount * 100) / 100 }); else othAmt += b.amount; }
    const laborTotal = num(data.totals && data.totals.totalLaborCosts);
    if (laborTotal > 0) slices.push({ name: LABOR_SLICE, value: Math.round(laborTotal * 100) / 100 });
    if (othAmt > 0) slices.push({ name: OTHER, value: Math.round(othAmt * 100) / 100 });
    slices.sort((a, b) => (a.name === OTHER ? 1 : b.name === OTHER ? -1 : b.value - a.value));
    const pieTotal = slices.reduce((s, x) => s + x.value, 0);
    const sliceColor = (n) => (n === LABOR_SLICE ? c.green : colorFor(n));
    const matches = (name, sel) => name === sel || (name === LABOR_SLICE && LABOR_SERIES_NAMES.has(sel)) || (sel === LABOR_SLICE && LABOR_SERIES_NAMES.has(name));
    const sel = st.selected;
    const active = (n) => sel == null || matches(n, sel);
    const toggle = (n) => { st.showCharges = false; st.selected = sel === n ? null : n; render("costs"); };
    const nameToCode = new Map((data.breakdown || []).map((b) => [b.name, b.code]));
    let selectedCodes = [];
    if (sel === LABOR_SLICE) selectedCodes = LABOR_CODES;
    else if (sel && LABOR_NAME_TO_CODE[sel]) selectedCodes = [LABOR_NAME_TO_CODE[sel]];
    else if (sel === OTHER) selectedCodes = minors.map((n) => nameToCode.get(n)).filter(Boolean);
    else if (sel) { const code = nameToCode.get(sel); if (code) selectedCodes = [code]; }
    const bounds = S.range.bounds(state.query);
    const totals = data.totals || {};

    nodes.push(ui.kpis(3, [
      ui.kpi({ label: "Total Operating Costs", value: fmt.money0(totals.totalOperatingCosts), sub: "excl. labor, COGS and interest" }),
      ui.kpi({ label: "Total Labor Costs", value: fmt.money0(totals.totalLaborCosts), sub: "wages + employer taxes" }),
      ui.kpi({ label: "Total COGS", value: fmt.money0(totals.totalCogs), sub: "materials and goods sold" }),
    ]));

    // Breakdown card
    if (!slices.length) nodes.push(ui.card({ title: "Costs Breakdown", body: ui.empty("No costs in this range.") }));
    else {
      const list = h("div", { class: "slice-list" });
      for (const s of slices) {
        const label = s.name === OTHER ? "Other (" + minors.length + " accounts)" : s.name === LABOR_SLICE ? "Labor (wages + employer taxes)" : s.name;
        list.append(h("button", { type: "button", class: "acct-row" + (active(s.name) ? "" : " dim"), "aria-expanded": String(sel === s.name), "aria-pressed": String(sel === s.name), onClick: () => toggle(s.name) },
          h("span", { class: "lab" }, h("span", { class: "dot", style: { background: sliceColor(s.name) } }), h("span", { text: label })),
          h("span", { class: "num", text: fmt.money0(s.value) })));
      }
      list.append(h("div", { class: "slice-total" }, h("span", { text: "Total" }), h("span", { class: "num", text: fmt.money0(pieTotal) })));
      list.append(h("p", { class: "note plain", style: { paddingTop: "10px" }, text: "Operating expenses plus labor (COGS excluded). The monthly chart below also includes COGS, so its bars sum higher than this total. Click an account to isolate it in that chart. The full account list is in the table at the bottom of this page." }));
      const donutHost = h("div", {});
      nodes.push(ui.card({ title: "Costs Breakdown", body: h("div", { class: "breakdown" }, list, donutHost) }));
      after.push(() => viz.donut(donutHost, { labels: slices.map((s) => s.name === LABOR_SLICE ? "Labor" : s.name), data: slices.map((s) => s.value), colors: slices.map((s) => sliceColor(s.name)), format: "money", height: 280, dim: (i) => !active(slices[i].name), onClick: (i) => toggle(slices[i].name) }));
    }

    // Stacked monthly chart
    const action = sel != null ? h("div", { class: "filters-right" },
      selectedCodes.length ? h("button", { type: "button", class: "btn", "aria-pressed": String(st.showCharges), text: st.showCharges ? "Hide charges" : "View charges", onClick: () => { st.showCharges = !st.showCharges; render("costs"); } }) : null,
      h("button", { type: "button", class: "btn", text: "Reset, showing " + sel + " only", onClick: () => { st.selected = null; st.showCharges = false; render("costs"); } }),
    ) : null;
    if (!stacked.length) nodes.push(ui.card({ title: "Cost Categories by Month", action, body: ui.empty("No cost activity in this range.") }));
    else {
      const host = h("div", {});
      const legend = viz.legend(seriesNames.map((n) => ({ label: n, color: colorFor(n), kind: "rect", pressed: active(n) })), (label) => toggle(label));
      const noteTxt = "Includes COGS and labor alongside operating expenses, matching the old Domo chart." + (minors.length ? ' "Other" groups: ' + minors.join(", ") + "." : "");
      nodes.push(ui.card({ title: "Cost Categories by Month", action, bodyClass: "tight", body: [host, legend], note: noteTxt }));
      after.push(() => viz.bar(host, {
        labels: stacked.map((r) => r.label), format: "money", height: 320, stacked: true, tooltipTotal: true, xTick: fmt.monthTick,
        datasets: seriesNames.map((n) => ({ label: n, data: stacked.map((r) => (typeof r[n] === "number" ? r[n] : 0)), color: colorFor(n) })),
        dim: (i, di) => !active(seriesNames[di]),
      }));
    }
    if (sel != null && st.showCharges && selectedCodes.length) {
      const host = h("div", {});
      nodes.push(ui.card({ title: "Charges, " + sel, bodyClass: "flush", body: host }));
      after.push(() => journal.mount(host, { from: bounds.start, to: bounds.end, accountCodes: selectedCodes }));
    }

    // Labor trend
    const laborData = (data.laborByMonth || []).map((m) => ({ label: fmt.monthShort(m.period_month), v: Math.round(num(m.amount) * 100) / 100 }));
    if (!laborData.length) nodes.push(ui.card({ title: "Labor Costs by Month", body: ui.empty("No labor costs in this range.") }));
    else {
      const host = h("div", {});
      nodes.push(ui.card({ title: "Labor Costs by Month", bodyClass: "tight", body: host, note: "Payroll wages plus employer taxes per month." }));
      after.push(() => viz.line(host, { labels: laborData.map((d) => d.label), format: "money", height: 260, xTick: fmt.monthTick, datasets: [{ label: "Labor", data: laborData.map((d) => d.v), color: c.green, area: true }] }));
    }

    // Accounts table
    const totalOpex = num(totals.totalOperatingCosts);
    let accountRows = (data.breakdown || []).map((b) => ({ code: b.code, name: b.name, amount: num(b.amount), pct: totalOpex > 0 ? num(b.amount) / totalOpex : 0 }));
    accountRows = ui.sortRows(accountRows, st.sort, { name: (r) => r.name, amount: (r) => r.amount, pct: (r) => r.amount });
    const onSort = (col) => { st.sort = ui.nextSort(st.sort, col, col === "name" ? "asc" : "desc"); render("costs"); };
    const acctTable = accountRows.length === 0 ? ui.empty("No operating costs in this range.") : ui.table({
      columns: [
        { key: "name", label: "Account", sortable: true, cell: (r) => h("span", {}, h("span", { class: "code muted", style: { marginRight: "8px" }, text: r.code }), r.name) },
        { key: "amount", label: "Amount", align: "r", sortable: true, cell: (r) => fmt.money0(r.amount) },
        { key: "pct", label: "% of Operating Costs", align: "r", sortable: true, cell: (r) => ui.share(r.pct * 100) },
      ],
      rows: accountRows, sort: st.sort, onSort,
      total: ["Total operating costs", fmt.money0(totalOpex), "100%"],
    });
    nodes.push(ui.card({ title: "Operating Cost Accounts", bodyClass: "flush", body: acctTable, note: "Operating-expense accounts only. Labor, COGS, depreciation and interest are excluded (see the totals at the top of this page for those)." }));
  };

  // ── Cash & Balance ─────────────────────────────────────────────────────
  // One tab: cash on hand and operating cash flow up top, then the cash-flow
  // table and the balance sheet that used to be two tabs.
  const monthKey = (pm) => String(pm).slice(0, 7);
  renderers.cash = (data, nodes, after) => {
    const rows = data.bs.rows || [];
    const cashRows = rows.filter((r) => r.type === "asset" && CASH_CODES.has(String(r.code)));
    const onHand = cashRows.reduce((s, r) => s + num(r.balance), 0);
    const thisMonth = dates.todayDenverYmd().slice(0, 7);
    const opByMonth = new Map();
    for (const r of data.cf.rows || []) if (r.activity === "operating") opByMonth.set(monthKey(r.period_month), (opByMonth.get(monthKey(r.period_month)) || 0) + num(r.net_change));
    const fullMonths = [...opByMonth.keys()].filter((k) => k < thisMonth).sort();
    const lastKey = fullMonths[fullMonths.length - 1];
    const lastOp = lastKey ? opByMonth.get(lastKey) : null;
    const last3 = fullMonths.slice(-3);
    const avg3 = last3.length ? last3.reduce((s, k) => s + opByMonth.get(k), 0) / last3.length : null;
    const shortName = (n) => n.replace(" Business Checking", "").replace(" Clearing", " clearing");
    nodes.push(ui.kpis(3, [
      ui.kpi({ label: "Cash on hand", value: fmt.money0(onHand), sub: cashRows.length ? cashRows.map((r) => `${shortName(r.name)} ${fmt.money0(r.balance)}`).join(", ") : "checking plus card clearing" }),
      ui.kpi({ label: "Operating cash flow, last full month", value: lastOp == null ? "--" : fmt.money0(lastOp), tone: lastOp == null ? undefined : lastOp < 0 ? "bad" : "good", sub: lastKey ? fmt.monthLong(lastKey + "-01") + ", cash from running the studio" : "no full month yet" }),
      ui.kpi({ label: "Operating cash flow, 3-month average", value: avg3 == null ? "--" : fmt.money0(avg3), tone: avg3 == null ? undefined : avg3 < 0 ? "bad" : "good", sub: avg3 != null && avg3 < 0 && onHand > 0 ? `about ${Math.round(onHand / -avg3)} months of cash at this rate, before loan payments` : "before loan payments and purchases" }),
    ]));
    renderCashflow(data, nodes, after);
    renderBalance(data, nodes, after);
  };

  // ── Balance Sheet (part of Cash & Balance) ─────────────────────────────
  const renderBalance = ({ bs }, nodes) => {
    const rows = bs.rows || [];
    let action;
    if (S.snap.enabled) {
      action = h("span", { class: "lbl", text: "As of " + fmt.dateLong(bs.asOf || state.balance.asOf) });
    } else {
      const input = h("input", { class: "field", type: "date", id: "bs-asof", value: state.balance.asOf, "aria-label": "As of date" });
      input.addEventListener("change", () => { if (input.value) { state.balance.asOf = input.value; show("cash"); } });
      action = h("div", { class: "filters-right" }, h("label", { class: "lbl", for: "bs-asof", text: "As of" }), input);
    }
    const groups = h("div", {});
    for (const [t, label] of [["asset", "Assets"], ["liability", "Liabilities"], ["equity", "Equity"]]) {
      const g = rows.filter((r) => r.type === t);
      const total = g.reduce((s, r) => s + num(r.balance), 0);
      const box = h("div", { class: "bs-group" }, h("p", { class: "kpi-label", text: label }));
      for (const r of g) box.append(h("div", { class: "bs-row" }, h("span", {}, h("span", { class: "muted mono", style: { marginRight: "8px" }, text: r.code }), r.name), h("span", { class: "amt", text: fmt.money0(r.balance) })));
      if (!g.length) box.append(h("p", { class: "note plain", text: "Nothing posted." }));
      box.append(h("div", { class: "bs-row total" }, h("span", { text: "Total " + label.toLowerCase() }), h("span", { class: "amt", text: fmt.money0(total) })));
      groups.append(box);
    }
    nodes.push(ui.card({ title: "Balance Sheet", action, bodyClass: "flush", body: groups, note: "Balances as of the selected date, from the cash-basis ledger." }));
  };

  // ── Cash Flow (part of Cash & Balance) ─────────────────────────────────
  const renderCashflow = ({ cf }, nodes) => {
    const rows = cf.rows || [];
    const months = [...new Set(rows.map((r) => r.period_month))].sort();
    const find = (m, a) => { const r = rows.find((x) => x.period_month === m && x.activity === a); return r ? num(r.net_change) : 0; };
    const mrows = months.map((m) => { const op = find(m, "operating"), inv = find(m, "investing"), fin = find(m, "financing"); return { m, op, inv, fin, net: op + inv + fin }; });
    const t = mrows.reduce((a, r) => ({ op: a.op + r.op, inv: a.inv + r.inv, fin: a.fin + r.fin, net: a.net + r.net }), { op: 0, inv: 0, fin: 0, net: 0 });
    const body = mrows.length === 0 ? ui.empty("No posted activity yet.") : ui.table({
      columns: [
        { key: "m", label: "Month", sticky: true, strong: true, cell: (r) => fmt.monthShort(r.m) },
        { key: "op", label: "Operating", align: "r", cell: (r) => moneyCell(r.op) },
        { key: "inv", label: "Investing", align: "r", cell: (r) => moneyCell(r.inv) },
        { key: "fin", label: "Financing", align: "r", cell: (r) => moneyCell(r.fin) },
        { key: "net", label: "Net Change", align: "r", strong: true, cls: (r) => negCls(r.net), cell: (r) => moneyCell(r.net) },
      ],
      rows: mrows, total: ["Total", moneyCell(t.op), moneyCell(t.inv), moneyCell(t.fin), moneyCell(t.net)],
    });
    nodes.push(ui.card({ title: "Cash Flow by Month", bodyClass: "flush", body, note: "Net change in cash by activity, oldest month first. The most recent month sits directly above the total." }));
  };

  // ── Plan: Targets ──────────────────────────────────────────────────────
  // A target is the revenue and EBITDA Sam wants from a month (the app's
  // projection_months table, entered at /admin/reporting/inputs). Actuals come
  // from the P&L document rather than the app's projection view, so the
  // in-progress month paces against its target too.
  const daysIn = (ym) => { const [y, m] = ym.split("-").map(Number); return new Date(y, m, 0).getDate(); };
  renderers.plan = ({ pj, pl }, nodes, after) => {
    const st = state.plan;
    const c = viz.colors();
    const today = dates.todayDenverYmd(), thisMonth = today.slice(0, 7), dom = Number(today.slice(8, 10)), dim = daysIn(thisMonth);
    const actuals = new Map((pl.months || []).map((m) => [monthKey(m.period_month), { revenue: num(m.revenue), ebitda: num(m.ebitda), net: num(m.net_income) }]));
    const targets = (pj.projectionVsActual || []).map((r) => ({ month: monthKey(r.period_month), revenue: r.proj_revenue == null ? null : num(r.proj_revenue), ebitda: r.proj_ebitda == null ? null : num(r.proj_ebitda) })).sort((a, b) => a.month.localeCompare(b.month));
    const fullMonths = [...actuals.keys()].filter((k) => k < thisMonth).sort();
    const last3 = fullMonths.slice(-3).map((k) => actuals.get(k));
    const avgOf = (k) => (last3.length ? last3.reduce((s, m) => s + m[k], 0) / last3.length : 0);
    const inputsLink = () => h("a", { href: INPUTS_URL, target: "_blank", rel: "noopener", text: "Admin, Reporting, Report inputs" });

    nodes.push(h("p", { class: "intro", text: "A target is the revenue and profit you want from a month. Set one, and this page shows how the month is pacing against it, which past months hit, and what the rest of the month has to do." }));

    if (!targets.length) {
      const avgRev = avgOf("revenue"), avgEbitda = avgOf("ebitda");
      const suggested = Math.round((avgRev * 1.1) / 100) * 100;
      nodes.push(ui.card({
        title: "Start with one month",
        body: h("ol", { class: "steps" },
          h("li", {}, "Your last three full months averaged ", h("strong", { text: fmt.money0(avgRev) }), " in revenue and ", h("strong", { text: fmt.money0(avgEbitda) }), " EBITDA (profit before depreciation and interest). A first target a little above that, say ", h("strong", { text: fmt.money0(suggested) }), " revenue, is a fair place to start."),
          h("li", {}, "Open ", inputsLink(), " in the app, pick the months (next month through the end of the year works), type the revenue target and the profit target, and save."),
          h("li", {}, "The dashboard picks them up on its next refresh. From then on Home shows the month against its target and the morning insights say whether you are ahead or behind, and by how much."),
        ),
        note: "Only revenue and profit are needed. Expense lines (payroll, rent, marketing) are optional detail for later.",
      }));
    } else {
      const t = targets.find((x) => x.month === thisMonth);
      const a = actuals.get(thisMonth) || { revenue: 0, ebitda: 0, net: 0 };
      const elapsed = dom / dim, left = dim - dom;
      if (t && t.revenue != null && t.revenue > 0) {
        const pct = a.revenue / t.revenue, ahead = pct >= elapsed;
        const onPace = elapsed > 0 ? a.revenue / elapsed : 0;
        const need = (t.revenue - a.revenue) / Math.max(1, left);
        const tiles = [
          ui.kpi({ label: `${fmt.monthLong(thisMonth + "-01")} revenue so far`, value: fmt.money0(a.revenue), tone: ahead ? "good" : "bad", sub: `${fmt.pct(pct)} of the ${fmt.money0(t.revenue)} target, ${fmt.pct(elapsed)} of the month gone` }),
          ui.kpi({ label: "On pace for", value: fmt.money0(onPace), tone: onPace >= t.revenue ? "good" : "bad", sub: `${onPace >= t.revenue ? "+" : ""}${fmt.money0(onPace - t.revenue)} vs target if the rest of the month matches so far` }),
          ui.kpi({ label: need <= 0 ? "Target met" : "Needed per day", value: need <= 0 ? fmt.money0(a.revenue - t.revenue) + " over" : fmt.money0(need), sub: need <= 0 ? "anything more is upside" : `for the remaining ${left} day${left === 1 ? "" : "s"} to land on target` }),
        ];
        if (t.ebitda != null) tiles.push(ui.kpi({ label: "EBITDA so far", value: fmt.money0(a.ebitda), tone: a.ebitda >= t.ebitda * elapsed ? "good" : "bad", sub: `target ${fmt.money0(t.ebitda)} for the month` }));
        nodes.push(ui.kpis(tiles.length === 4 ? 4 : 3, tiles));
      } else {
        nodes.push(ui.card({ title: `No target for ${fmt.monthLong(thisMonth + "-01")}`, body: h("p", { class: "subtle-line" }, "Add one in the app: ", inputsLink(), ". The months that do have targets are below.") }));
      }

      const rows = targets.map((x) => {
        const act = actuals.get(x.month);
        const live = x.month === thisMonth, past = x.month < thisMonth;
        const status = live ? "live" : !past ? "upcoming" : act && x.revenue != null ? (act.revenue >= x.revenue ? "hit" : "miss") : "none";
        return { ...x, act, live, status };
      });
      const STATUS = { hit: "Hit", miss: "Missed", live: "In progress", upcoming: "Upcoming", none: "No actuals" };
      const labels = rows.map((r) => fmt.monthShort(r.month + "-01"));
      const barColor = rows.map((r) => (r.live ? c.greenSoft : c.green));
      const revHost = h("div", {}), ebHost = h("div", {});
      nodes.push(ui.card({
        title: "Target vs actual by month", bodyClass: "tight",
        body: [h("p", { class: "chart-label", text: "Revenue" }), revHost, h("p", { class: "chart-label", text: "EBITDA" }), ebHost,
          viz.legend([{ label: "Actual", color: c.green, kind: "rect" }, { label: "Target", color: c.brown, kind: "line" }])],
        note: "Bars are the ledger; the line is the target you entered. The current month's bar (lighter) is still filling in.",
      }));
      after.push(() => {
        viz.mixed(revHost, { labels, format: "money", height: 220, xTick: fmt.monthTick, bars: [{ label: "Actual revenue", data: rows.map((r) => (r.act ? Math.round(r.act.revenue) : null)), color: barColor }], lines: [{ label: "Target", data: rows.map((r) => r.revenue), color: c.brown, points: true }] });
        viz.mixed(ebHost, { labels, format: "money", height: 200, xTick: fmt.monthTick, bars: [{ label: "Actual EBITDA", data: rows.map((r) => (r.act ? Math.round(r.act.ebitda) : null)), color: barColor }], lines: [{ label: "Target", data: rows.map((r) => r.ebitda), color: c.brown, points: true }] });
      });
      const gap = (actual, target) => (actual == null || target == null ? "--" : (actual - target >= 0 ? "+" : "") + fmt.money0(actual - target));
      nodes.push(ui.card({
        title: "Month by month", bodyClass: "flush",
        body: ui.table({
          columns: [
            { key: "m", label: "Month", sticky: true, strong: true, cell: (r) => fmt.monthShort(r.month + "-01") },
            { key: "tr", label: "Revenue target", align: "r", cell: (r) => fmt.money0OrDash(r.revenue) },
            { key: "ar", label: "Actual", align: "r", cell: (r) => (r.act ? fmt.money0(r.act.revenue) : "--") },
            { key: "gr", label: "Gap", align: "r", cls: (r) => (r.act && r.revenue != null && r.act.revenue < r.revenue ? "neg" : ""), cell: (r) => gap(r.act ? r.act.revenue : null, r.revenue) },
            { key: "te", label: "EBITDA target", align: "r", cell: (r) => fmt.money0OrDash(r.ebitda) },
            { key: "ae", label: "Actual", align: "r", cell: (r) => (r.act ? fmt.money0(r.act.ebitda) : "--") },
            { key: "ge", label: "Gap", align: "r", cls: (r) => (r.act && r.ebitda != null && r.act.ebitda < r.ebitda ? "neg" : ""), cell: (r) => gap(r.act ? r.act.ebitda : null, r.ebitda) },
            { key: "s", label: "", cell: (r) => h("span", { class: "status " + r.status, text: STATUS[r.status] }) },
          ],
          rows, rowKey: (r) => r.month,
        }),
        note: "Gap is actual minus target, so a negative number is a shortfall. A month counts as hit when revenue reached its target.",
      }));
    }

    if (S.snap.enabled) nodes.push(inputsNote("Set or change targets"));
    else nodes.push(targetsForm(st));

    // Lender view, kept from the old Projections tab.
    const dscr = pj.dscr || [];
    const info = h("button", { type: "button", class: "info-btn", "aria-label": "What is DSCR?", "aria-pressed": String(st.showInfo), text: "i", onClick: () => { st.showInfo = !st.showInfo; render("plan"); } });
    const dscrBody = dscr.length === 0 ? ui.empty("No data yet.") : ui.table({
      columns: [
        { key: "m", label: "Month", sticky: true, strong: true, cell: (r) => r.period_month.slice(0, 7) },
        { key: "e", label: "EBITDA (TTM)", align: "r", cell: (r) => fmt.money2(r.ebitda_ttm) },
        { key: "d", label: "Debt Service (TTM)", align: "r", cell: (r) => fmt.money2(r.debt_service_ttm) },
        { key: "r", label: "DSCR", align: "r", strong: true, cls: (r) => (r.dscr_ttm != null && r.dscr_ttm < DSCR_MIN ? "neg" : ""), cell: (r) => (r.dscr_ttm == null ? "--" : Number(r.dscr_ttm).toFixed(2) + "x") },
      ],
      rows: dscr,
    });
    const card = ui.card({ title: "Lender view: trailing-12 debt coverage (minimum " + DSCR_MIN + "x)", action: info, bodyClass: "flush", body: dscrBody, note: "Only matters when talking to a lender. It stays negative while trailing-12 EBITDA is negative, whatever the payments are." });
    if (st.showInfo) card.insertBefore(h("p", { class: "explainer", style: { paddingTop: "12px" }, text: DSCR_EXPLAINER }), card.body);
    nodes.push(card);
  };
  // Local preview only (the published page cannot write): the same two numbers
  // the app's form takes, applied to a range of months at once.
  function targetsForm(st) {
    const from = h("input", { class: "field", type: "month", id: "tg-from", required: true });
    const to = h("input", { class: "field", type: "month", id: "tg-to" });
    const rev = h("input", { class: "field", type: "number", step: "1", id: "tg-rev", placeholder: "e.g. 12000" });
    const eb = h("input", { class: "field", type: "number", step: "1", id: "tg-eb", placeholder: "e.g. 1500" });
    const btn = h("button", { type: "submit", class: "btn primary", text: "Save targets" });
    const msg = h("p", { class: "inline-msg" + (st.msgTone === "bad" ? " t-bad" : st.msgTone === "good" ? " t-good" : ""), text: st.msg || "", hidden: !st.msg });
    const form = h("form", { id: "tg-form" }, h("div", { class: "form-row" },
      h("div", { class: "f sm" }, h("label", { class: "lbl", for: "tg-from", text: "From month" }), from),
      h("div", { class: "f sm" }, h("label", { class: "lbl", for: "tg-to", text: "To month (optional)" }), to),
      h("div", { class: "f sm" }, h("label", { class: "lbl", for: "tg-rev", text: "Revenue target" }), rev),
      h("div", { class: "f sm" }, h("label", { class: "lbl", for: "tg-eb", text: "Profit (EBITDA) target" }), eb),
      h("div", { class: "f sm" }, btn)), msg);
    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      st.msg = null;
      if (!from.value) { st.msg = "Pick a starting month."; st.msgTone = "bad"; render("plan"); return; }
      const months = dates.monthsBetween(from.value + "-01", (to.value || from.value) + "-01");
      const r = rev.value.trim() === "" ? null : Number(rev.value), e = eb.value.trim() === "" ? null : Number(eb.value);
      if ((r != null && Number.isNaN(r)) || (e != null && Number.isNaN(e)) || (r == null && e == null)) { st.msg = "Enter a revenue target, a profit target, or both."; st.msgTone = "bad"; render("plan"); return; }
      btn.disabled = true;
      try {
        await api.post("/api/admin/accounting/projections", { rows: months.map((m) => ({ periodMonth: m + "-01", revenue: r, ebitda: e })) });
        st.msg = `Saved ${months.length} month${months.length === 1 ? "" : "s"}.`; st.msgTone = "good";
        cache.delete("/api/admin/accounting/projections");
        reload("plan");
      } catch (err) {
        if (err.status === 401) return;
        st.msg = err.message; st.msgTone = "bad"; btn.disabled = false; render("plan");
      }
    });
    return ui.card({ title: "Set targets", body: form, note: "Applies the same targets to every month in the range. Saving a month again overwrites it." });
  }

  // ── Normalized EBITDA ──────────────────────────────────────────────────
  renderers.normalized = ({ nm }, nodes) => {
    const st = state.normalized;
    const month = h("input", { class: "field", type: "month", id: "nm-month", required: true });
    const label = h("input", { class: "field", type: "text", id: "nm-label", placeholder: "e.g. Owner health insurance add-back", required: true });
    const amount = h("input", { class: "field", type: "number", step: "0.01", id: "nm-amount", placeholder: "positive = add back", required: true });
    const note = h("input", { class: "field", type: "text", id: "nm-note", placeholder: "optional" });
    const btn = h("button", { type: "submit", class: "btn primary", text: "Add" });
    const msg = h("p", { class: "inline-msg" + (st.msgTone === "bad" ? " t-bad" : st.msgTone === "good" ? " t-good" : ""), text: st.msg || "", hidden: !st.msg });
    const form = h("form", { id: "nm-form" }, h("div", { class: "form-row" },
      h("div", { class: "f sm" }, h("label", { class: "lbl", for: "nm-month", text: "Month" }), month),
      h("div", { class: "f" }, h("label", { class: "lbl", for: "nm-label", text: "Label" }), label),
      h("div", { class: "f sm" }, h("label", { class: "lbl", for: "nm-amount", text: "Amount" }), amount),
      h("div", { class: "f" }, h("label", { class: "lbl", for: "nm-note", text: "Note" }), note),
      h("div", { class: "f sm" }, btn)), msg);
    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      st.msg = null;
      const amt = parseFloat(amount.value);
      if (!month.value || !label.value || Number.isNaN(amt)) { st.msg = "Month, label, and a numeric amount are required."; st.msgTone = "bad"; render("normalized"); return; }
      btn.disabled = true;
      try {
        await api.post("/api/admin/accounting/reports/normalized", { periodMonth: month.value + "-01", label: label.value, amount: amt, note: note.value || undefined });
        st.msg = "Adjustment added."; st.msgTone = "good";
        cache.delete("/api/admin/accounting/reports/normalized");
        reload("normalized");
      } catch (e) {
        if (e.status === 401) return;
        st.msg = e.message; st.msgTone = "bad"; btn.disabled = false; render("normalized");
      }
    });
    if (S.snap.enabled) nodes.push(inputsNote("Add an adjustment"));
    else nodes.push(ui.card({ title: "Add an adjustment", body: form, note: "For financing or sale prep. Add-backs are entered to the cent and are never hidden from the list below." }));

    const rows = nm.normalized || [];
    const tbl = rows.length === 0 ? ui.empty("No months yet.") : ui.table({
      columns: [
        { key: "m", label: "Month", sticky: true, strong: true, cell: (r) => r.period_month.slice(0, 7) },
        { key: "e", label: "Base EBITDA", align: "r", cls: (r) => negCls(num(r.ebitda)), cell: (r) => fmt.money2(r.ebitda) },
        { key: "a", label: "Adjustments", align: "r", cell: (r) => fmt.money2(r.adjustments) },
        { key: "n", label: "Normalized EBITDA", align: "r", strong: true, cls: (r) => negCls(num(r.ebitda_normalized)), cell: (r) => fmt.money2(r.ebitda_normalized) },
      ],
      rows,
    });
    nodes.push(ui.card({ title: "Normalized EBITDA by month", bodyClass: "flush", body: tbl }));

    const adjs = nm.adjustments || [];
    const list = h("div", { class: "adj-list" });
    if (!adjs.length) list.append(ui.empty("No adjustments recorded."));
    for (const a of adjs) list.append(h("div", { class: "adj-item" },
      h("div", {}, h("p", { text: a.period_month.slice(0, 7) + ", " + a.label }), a.note ? h("p", { class: "sub", text: a.note }) : null),
      h("span", { class: "amt", text: fmt.money2(a.amount) })));
    nodes.push(ui.card({ title: "Adjustment list (never hidden)", bodyClass: "flush", body: list }));
  };

  // ── module registration ────────────────────────────────────────────────
  // reports.html mounts one shell for every group and hands it over here.
  // Every callback checks that the tab is one of ours, since the shell's
  // current tab can belong to another module.
  const mine = (id) => !!loaders[id];
  S.modules = S.modules || {};
  S.modules.financials = {
    id: "financials", label: "Money", defaultGroup: "money", tabs: TABS, rangedTabs: RANGED, locationTabs: [],
    start(sh) {
      shell = sh;
      state.query = S.range.toQuery(shell.state.range);
      mounted = true;
      viz.onThemeChange(() => { if (shell && mine(shell.currentTab())) render(shell.currentTab()); });
    },
    refresh() { cache.clear(); for (const k of Object.keys(tabData)) tabData[k] = null; },
    onTab(id) { if (mounted && mine(id)) show(id); },
    onRange(r) { state.query = S.range.toQuery(r); if (shell && RANGED.includes(shell.currentTab())) show(shell.currentTab()); },
    onLocation() { /* no location-aware tabs */ },
  };
})();
