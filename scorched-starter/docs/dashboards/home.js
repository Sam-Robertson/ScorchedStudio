(function () {
  "use strict";
  // Home: the first thing the dashboard opens on. Six tiles with this week's
  // headline numbers, read from the snapshot's facts document (the same
  // comparisons the insights are written from), then the Insights card Claude
  // writes during each refresh. No date range: Home is always "now".
  const S = window.Scorched;
  const { api, fmt, ui } = S;
  const h = ui.h;

  // Where an insight's "see it in" link lands. Old tab ids from earlier insight
  // files (overview, capacity, balance, cashflow, projections) still resolve.
  const TAB_LABEL = {
    home: "Home",
    pl: "Money, P&L", monthly: "Money, Monthly P&L", costs: "Money, Costs", cash: "Money, Cash & Balance", balance: "Money, Cash & Balance", cashflow: "Money, Cash & Balance",
    bookings: "Customers, Bookings & Capacity", overview: "Customers, Bookings & Capacity", capacity: "Customers, Bookings & Capacity", marketing: "Customers, Marketing", website: "Customers, Website",
    sales: "Sales & Products",
    plan: "Plan, Targets", projections: "Plan, Targets", normalized: "Plan, Normalized EBITDA",
  };
  const KIND_LABEL = { act: "Do this week", why: "What is behind it", check: "Worth checking", target: "Against target", good: "Working", note: "Note" };
  const kindOf = (it) => (KIND_LABEL[it.kind] ? it.kind : it.action ? "act" : it.tone === "warn" ? "check" : it.tone === "good" ? "good" : "note");

  let shell = null;
  const cache = new Map();
  const load = (path) => { if (!cache.has(path)) cache.set(path, api.get(path).catch(() => null)); return cache.get(path); };

  const signed = (cmp, what) => (cmp && cmp.changePct != null ? `${fmt.signedPct(Math.round(cmp.changePct))} vs ${what}` : `no ${what} to compare`);
  const toneOf = (cmp, invert) => (cmp && cmp.changePct != null ? ((cmp.changePct >= 0) !== !!invert ? "good" : "bad") : undefined);
  const monthName = (ym) => fmt.monthLong(ym + "-01");

  function tiles(f) {
    const out = [];
    const sq = f.squareSales || {}, bk = f.bookings || {}, web = f.web, led = f.ledger || {}, tg = f.targets;
    if (sq.last7) out.push(ui.kpi({ label: "In-studio sales, last 7 days", value: fmt.money0(sq.last7.now), sub: signed(sq.last7, "the week before"), subTone: toneOf(sq.last7) }));
    if (bk.madeConfirmed && bk.madeConfirmed.last7) out.push(ui.kpi({ label: "Bookings made, last 7 days", value: fmt.count(bk.madeConfirmed.last7.now), sub: signed(bk.madeConfirmed.last7, "the week before"), subTone: toneOf(bk.madeConfirmed.last7) }));
    if (bk.seats && bk.seats.next7) out.push(ui.kpi({ label: "Seats booked, next 7 days", value: fmt.count(bk.seats.next7.now), sub: `so far; ${fmt.count(bk.seats.next7.prev)} sat in the last 7` }));
    if (web && web.sessions && web.sessions.last7) out.push(ui.kpi({ label: "Website visits, last 7 days", value: fmt.count(web.sessions.last7.now), sub: signed(web.sessions.last7, "the week before"), subTone: toneOf(web.sessions.last7) }));
    if (led.lastFullMonth) {
      const m = led.lastFullMonth;
      out.push(ui.kpi({ label: `${monthName(m.month)} net income`, value: fmt.money0(m.netIncome), tone: m.netIncome < 0 ? "bad" : "good", sub: `on ${fmt.money0(m.revenue)} revenue, last full month` }));
    }
    if (tg && tg.thisMonth && tg.thisMonth.revenueTarget != null) {
      const t = tg.thisMonth;
      const pct = t.revenueTarget > 0 ? t.revenueSoFar / t.revenueTarget : 0;
      const ahead = pct * 100 >= t.elapsedPct;
      out.push(ui.kpi({ label: `${monthName(t.month)} vs target`, value: fmt.pct(pct) + " of target", tone: ahead ? "good" : "bad", sub: `${fmt.money0(t.revenueSoFar)} of ${fmt.money0(t.revenueTarget)}, ${Math.round(t.elapsedPct)}% of the month gone` }));
    } else {
      out.push(ui.kpi({ label: "This month vs target", value: "No target", sub: "set one under Plan to track the gap here", onClick: () => shell.setTab("plan", true) }));
    }
    return out;
  }

  function insightsCard(ins) {
    const items = ins && Array.isArray(ins.items) ? ins.items.filter((it) => it && it.title) : [];
    if (!items.length) {
      return ui.card({ title: "Insights", body: h("p", { class: "closing", text: "Nothing written yet. During each overnight refresh Claude reads the day's numbers and leaves a few notes here: what moved, the likely reason, and one thing to do about it." }) });
    }
    const line = (label, text) => (text ? h("p", { class: "iline" }, h("span", { class: "ilbl", text: label }), text) : null);
    const list = h("div", { class: "insights" }, items.map((it) => {
      const kind = kindOf(it);
      const where = it.tab && TAB_LABEL[it.tab] ? h("button", { type: "button", class: "iwhere", text: "See it in " + TAB_LABEL[it.tab], onClick: () => shell.setTab(it.tab, true) }) : null;
      return h("div", { class: "insight" },
        h("span", { class: "idot " + (["good", "bad", "warn"].includes(it.tone) ? it.tone : "neutral") }),
        h("div", { class: "stack", style: "gap: 5px" },
          h("div", { class: "ihead" }, h("span", { class: "ikind k-" + kind, text: KIND_LABEL[kind] }), h("p", { class: "ititle", text: it.title })),
          h("p", { class: "ibody", text: it.body || "" }),
          line("Likely why", it.why),
          line("Do", it.action),
          line("Watch", it.watch),
          where));
    }));
    const when = ins.asOf ? fmt.dateLong(ins.asOf) : "";
    return ui.card({
      title: "Insights", action: h("span", { class: "lbl", text: when ? "Written by Claude from the " + when + " numbers" : "Written by Claude" }),
      body: list,
      note: "Written during the daily refresh from the same data the charts use. 'Likely why' is Claude's best reading of the numbers, not a certainty; 'Do' is one concrete move sized for the studio; 'Watch' is the number that should change if it works. Every figure can be checked in the tab the link names.",
    });
  }

  async function render() {
    const view = shell.views.home;
    if (!view.childElementCount) ui.replace(view, ui.loading());
    const [facts, insights] = await Promise.all([load("/api/admin/facts"), load("/api/admin/insights")]);
    const nodes = [];
    if (facts) {
      const t = tiles(facts);
      nodes.push(ui.kpis(3, t));
      nodes.push(h("p", { class: "subtle-line muted", text: `Numbers as of ${fmt.dateLong(facts.asOf)}. Sales are Square in-studio takings; bookings are the online widget; visits are Google Analytics.` }));
    } else {
      nodes.push(ui.card({ title: "This week", body: ui.empty("The snapshot has no facts document yet. The next refresh fills these tiles.") }));
    }
    nodes.push(insightsCard(insights));
    nodes.push(h("p", { class: "closing", text: "Every number has a detailed home: Money for the ledger and cash, Customers for bookings, marketing and the website, Sales for what sells in the studio, Plan for targets." }));
    ui.replace(view, ...nodes);
  }

  S.modules = S.modules || {};
  S.modules.home = {
    id: "home", label: "Home", defaultGroup: "home",
    tabs: [{ id: "home", label: "Home" }], rangedTabs: [], locationTabs: [],
    start(sh) { shell = sh; },
    refresh() { cache.clear(); },
    // The shell fires onTab once while mounting, before start() hands it over; the boot calls again after.
    onTab(id) { if (id === "home" && shell) render(); },
    onRange() { /* Home is always now */ },
    onLocation() { /* all locations */ },
  };
})();
