"use strict";
/*
 * Accounting tab (manager only).
 *  - Bills & expenses: what the shop buys and pays, with the VAT on each bill
 *  - VAT return: a worksheet to copy onto the Department of Inland Revenue online VAT return, with due date and filing history
 *  - Profit & loss: income, cost of goods and expenses, with the previous period beside it
 * Sales come from the till (repFacts in app.js). Bills are typed in here and kept in state.bills.
 * It is a worksheet for the shop and its accountant. It does not file anything with the Department.
 */
(function () {
  const CATS = [
    { name: "Stock for resale", kind: "stock", vat: "added" },
    { name: "Customs duty & freight on stock", kind: "stock", vat: "none" },
    { name: "Rent", kind: "expense", vat: "none" },
    { name: "Electricity (BPL)", kind: "expense", vat: "added" },
    { name: "Water (WSC)", kind: "expense", vat: "none" },
    { name: "Phone & internet", kind: "expense", vat: "added" },
    { name: "Wages & salaries", kind: "expense", vat: "none" },
    { name: "NIB contributions", kind: "expense", vat: "none" },
    { name: "Insurance", kind: "expense", vat: "none" },
    { name: "Business licence & government fees", kind: "expense", vat: "none" },
    { name: "Fuel & delivery", kind: "expense", vat: "added" },
    { name: "Vehicle repairs & upkeep", kind: "expense", vat: "added" },
    { name: "Shop repairs & maintenance", kind: "expense", vat: "added" },
    { name: "Bank & card fees", kind: "expense", vat: "none" },
    { name: "Advertising", kind: "expense", vat: "added" },
    { name: "Accountant & legal fees", kind: "expense", vat: "added" },
    { name: "Office & shop supplies", kind: "expense", vat: "added" },
    { name: "Equipment & vehicles (long-lasting)", kind: "capital", vat: "added" },
    { name: "Other expenses", kind: "expense", vat: "added" }
  ];
  const catOf = (n) => CATS.find((c) => c.name === n) || CATS[CATS.length - 1];
  const A = { tab: "overview", preset: "lastqtr", from: "", to: "", fMonth: "", fCat: "", fUnpaid: false };
  const sum = (arr, f) => r2(arr.reduce((t, x) => t + f(x), 0));
  const ymd = (d) => d.toLocaleDateString("en-CA");
  const niceDate = (s) => new Date(s + "T12:00:00").toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  const root = () => document.getElementById("acctRoot");
  const vatRate = () => Number(state.settings.vatPct) || 10;
  const who = () => (typeof session !== "undefined" && session ? session.name : "");

  function presetDates(p) {
    const now = new Date(), y = now.getFullYear(), m = now.getMonth(), q = Math.floor(m / 3);
    const span = (a, b) => [ymd(a), ymd(b)];
    if (p === "month") return span(new Date(y, m, 1), new Date(y, m + 1, 0));
    if (p === "lastmonth") return span(new Date(y, m - 1, 1), new Date(y, m, 0));
    if (p === "qtr") return span(new Date(y, q * 3, 1), new Date(y, q * 3 + 3, 0));
    if (p === "lastqtr") return span(new Date(y, q * 3 - 3, 1), new Date(y, q * 3, 0));
    if (p === "year") return span(new Date(y, 0, 1), new Date(y, 11, 31));
    if (p === "lastyear") return span(new Date(y - 1, 0, 1), new Date(y - 1, 11, 31));
    return [A.from, A.to];
  }
  function applyPreset() { if (A.preset !== "custom") [A.from, A.to] = presetDates(A.preset); }

  // ---------- the numbers ----------
  function billsIn(from, to) { return (state.bills || []).filter((b) => b.date >= from && b.date <= to); }
  function salesFigures(from, to) {
    const f = repFacts(from, to);
    const std = sum(f.filter((x) => !x.exempt), (x) => x.ex), exm = sum(f.filter((x) => x.exempt), (x) => x.ex);
    return {
      std, exempt: exm, total: r2(std + exm), outVat: sum(f, (x) => x.vat), cogs: sum(f, (x) => x.cost),
      invoices: state.sales.filter((s) => !s.voided && dayStr(s.at) >= from && dayStr(s.at) <= to).length
    };
  }
  function vatReturn(from, to) {
    const s = salesFigures(from, to), bills = billsIn(from, to);
    const kind = (k) => bills.filter((b) => catOf(b.cat).kind === k);
    const claim = (arr) => sum(arr.filter((b) => b.claim), (b) => b.vat);
    const r = { from, to, sales: s, stock: kind("stock"), exp: kind("expense"), cap: kind("capital") };
    r.stockEx = sum(r.stock, (b) => b.ex); r.expEx = sum(r.exp, (b) => b.ex); r.capEx = sum(r.cap, (b) => b.ex);
    r.stockVat = claim(r.stock); r.expVat = claim(r.exp); r.capVat = claim(r.cap);
    r.inVat = r2(r.stockVat + r.expVat + r.capVat);
    r.unclaimed = sum(bills.filter((b) => !b.claim), (b) => b.vat);
    r.unclaimedN = bills.filter((b) => !b.claim && b.vat > 0).length;
    r.billCount = bills.length;
    r.net = r2(s.outVat - r.inVat);
    return r;
  }
  function pnl(from, to) {
    const s = salesFigures(from, to), cats = new Map();
    billsIn(from, to).filter((b) => catOf(b.cat).kind === "expense").forEach((b) => cats.set(b.cat, r2((cats.get(b.cat) || 0) + b.ex)));
    const exp = [...cats].sort((a, b) => b[1] - a[1]);
    const expTotal = r2(exp.reduce((t, [, v]) => t + v, 0));
    return { sales: s.total, cogs: s.cogs, gross: r2(s.total - s.cogs), exp, expTotal, net: r2(s.total - s.cogs - expTotal) };
  }
  function dueInfo(to) {
    const d = new Date(to + "T12:00:00"); d.setDate(d.getDate() + 21);
    const due = ymd(d), today = ymd(new Date());
    const days = Math.round((new Date(due + "T12:00:00") - new Date(today + "T12:00:00")) / 86400000);
    const ended = to < today;
    return { due, days, ended, text: !ended ? "This period has not finished yet" : days > 0 ? `Due in ${days} day${days === 1 ? "" : "s"}` : days === 0 ? "Due today" : `Overdue by ${-days} day${days === -1 ? "" : "s"}` };
  }
  const filedFor = (from, to) => (state.vatFilings || []).find((f) => f.from === from && f.to === to);

  // ---------- small html helpers ----------
  const card = (a, b, cls) => `<div class="${cls || ""}"><span>${esc(a)}</span><strong>${esc(b)}</strong></div>`;
  const tbl = (head, rows, types, foot) => {
    const td = (v, i, cls) => `<td class="${types[i] === "t" || types[i] === "h" ? "" : "num"} ${cls || ""}">${v === "" ? "" : types[i] === "m" ? fm(v) : types[i] === "h" ? v : esc(v)}</td>`;
    return `<div class="table-wrap"><table class="data-table"><thead><tr>${head.map((h, i) => `<th class="${types[i] === "t" ? "" : "num"}">${esc(h)}</th>`).join("")}</tr></thead><tbody>${
      rows.map((r) => `<tr class="${r.cls || ""}">${r.map((v, i) => td(v, i)).join("")}</tr>`).join("") || `<tr><td colspan="${head.length}" class="more-note">Nothing here yet.</td></tr>`
    }${foot ? `<tr class="total-row">${foot.map((v, i) => td(v, i)).join("")}</tr>` : ""}</tbody></table></div>`;
  };
  function periodBar(extra) {
    const opt = (v, t) => `<option value="${v}"${A.preset === v ? " selected" : ""}>${t}</option>`;
    return `<div class="toolbar">
      <select id="acPreset">${opt("lastqtr", "Last quarter")}${opt("qtr", "This quarter")}${opt("lastmonth", "Last month")}${opt("month", "This month")}${opt("lastyear", "Last year")}${opt("year", "This year")}${opt("custom", "Pick dates")}</select>
      <input id="acFrom" type="date" value="${esc(A.from)}"><input id="acTo" type="date" value="${esc(A.to)}">${extra || ""}</div>`;
  }
  function printDoc(title, body) {
    els.printRoot.innerHTML = `<article class="quote-doc"><div class="q-head"><div><strong class="q-store">${esc(state.settings.legalName || state.settings.storeName)}</strong>
      <div>${esc(title)}</div><div>${esc(niceDate(A.from))} to ${esc(niceDate(A.to))}</div>${state.settings.vatNo ? `<div>VAT no. ${esc(state.settings.vatNo)}</div>` : ""}</div></div>${body}
      <div class="q-terms">Worksheet prepared from the shop's own records. Please check it with your accountant before you file.</div></article>`;
    document.getElementById("pageStyle").textContent = "@page{size:letter;margin:.5in}";
    document.documentElement.classList.add("sheet-print");
    window.print();
  }
  const csv = (name, rows) => download(name, rows.map((r) => r.map(csvCell).join(",")).join("\n"), "text/csv");

  // ---------- screens ----------
  function overview() {
    const p = pnl(A.from, A.to), v = vatReturn(A.from, A.to);
    const unpaid = (state.bills || []).filter((b) => !b.paidOn);
    const now = new Date(), months = [];
    for (let i = 5; i >= 0; i--) {
      const a = new Date(now.getFullYear(), now.getMonth() - i, 1), b = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
      const f = ymd(a), t = ymd(b), pl = pnl(f, t);
      months.push({ label: a.toLocaleDateString("en-US", { month: "short" }), inc: pl.sales, exp: r2(pl.cogs + pl.expTotal) });
    }
    const max = Math.max(1, ...months.flatMap((m) => [m.inc, m.exp]));
    const bar = (x, c) => `<div style="height:${Math.round(x / max * 100)}px;width:18px;background:${c};border-radius:3px 3px 0 0" title="$${money(x)}"></div>`;
    const lq = presetDates("lastqtr"), di = dueInfo(lq[1]), fl = filedFor(lq[0], lq[1]);
    return `${periodBar()}
      <div class="report-grid">${card("Sales before VAT", fm(p.sales))}${card("Cost of goods sold", fm(p.cogs))}${card("Gross profit", fm(p.gross))}${card("Expenses", fm(p.expTotal))}${card("Net profit", fm(p.net))}${card("VAT to pay (sales VAT less VAT on bills)", fm(v.net))}</div>
      <h3>Last six months <small>sales in green, stock and expenses in grey</small></h3>
      <div style="display:flex;gap:18px;align-items:flex-end;height:120px;margin:8px 0 4px">${months.map((m) => `<div style="text-align:center"><div style="display:flex;gap:3px;align-items:flex-end;height:105px">${bar(m.inc, "#1f7a4d")}${bar(m.exp, "#9aa5a0")}</div><small>${esc(m.label)}</small></div>`).join("")}</div>
      <h3>To do</h3>
      <div class="report-grid">
        ${card("Last quarter's VAT return", `${fl ? "Filed " + niceDate(fl.filedOn) : di.text + " (" + niceDate(di.due) + ")"}`)}
        ${card("Bills not paid yet", `${unpaid.length} bill${unpaid.length === 1 ? "" : "s"}, ${fm(sum(unpaid, (b) => b.ex + b.vat))}`)}
      </div>
      <p class="hint">Usual dates, please confirm with the Department of Inland Revenue and NIB: VAT returns and payment are due 21 days after each period ends (14 days for large taxpayers). Business licence fees are due by 31 March. NIB contributions for staff are due by the 15th of the following month.</p>`;
  }

  function vatTab() {
    const v = vatReturn(A.from, A.to), di = dueInfo(A.to), fl = filedFor(A.from, A.to);
    const rows = [
      ["Standard-rated sales (10%)", v.sales.std, v.sales.outVat],
      ["Zero-rated sales (not used at the till)", 0, 0],
      ["VAT-exempt sales", v.sales.exempt, 0],
      ["Total sales and VAT charged", v.sales.total, v.sales.outVat],
      ["Stock bought for resale", v.stockEx, v.stockVat],
      ["Running costs (rent, power, fuel, etc.)", v.expEx, v.expVat],
      ["Equipment and vehicles", v.capEx, v.capVat],
      ["Total purchases and VAT you can claim", r2(v.stockEx + v.expEx + v.capEx), v.inVat],
      [v.net >= 0 ? "VAT TO PAY to Inland Revenue" : "VAT REFUND due to you", "", Math.abs(v.net)]
    ];
    rows[3].cls = rows[7].cls = "total-row"; rows[8].cls = "total-row";
    const warn = [];
    if (!state.settings.vatNo) warn.push("Your VAT number is not filled in. Add it in Settings so it prints on receipts and these pages.");
    if (!di.ended) warn.push("This period has not finished yet, so the figures can still change.");
    if (!v.billCount) warn.push("No bills are recorded for this period. If you bought stock or paid running costs, add them in Bills, or the VAT to pay will be too high.");
    if (v.unclaimedN) warn.push(`${v.unclaimedN} bill${v.unclaimedN === 1 ? "" : "s"} with $${money(v.unclaimed)} of VAT are not being claimed because you do not have the supplier's VAT invoice.`);
    warn.push("Layaways count as a sale on the day they are completed. Returns and voids are taken off on the day they happened.");
    const hist = (state.vatFilings || []).slice().sort((a, b) => (a.to < b.to ? 1 : -1));
    return `${periodBar(`<button id="acPrint" class="ghost" type="button">Print / Save as PDF</button><button id="acCsv" class="ghost" type="button">Download CSV</button>`)}
      <div class="change-due">${fl ? `Filed on ${esc(niceDate(fl.filedOn))}${fl.ref ? ", ref " + esc(fl.ref) : ""}` : `${esc(di.text)}${di.ended ? ` (due ${esc(niceDate(di.due))})` : ""}`}</div>
      <h3>VAT return worksheet <small>${esc(niceDate(A.from))} to ${esc(niceDate(A.to))}, ${v.sales.invoices} tax invoice${v.sales.invoices === 1 ? "" : "s"}</small></h3>
      ${tbl(["", "Amount before VAT", "VAT"], rows, "tmm")}
      <p class="hint">Type these figures into your VAT return on the Department of Inland Revenue's online portal. Use the exact period on your VAT registration (pick the dates above if it is not a calendar quarter).</p>
      <ul class="hint">${warn.map((w) => `<li>${esc(w)}</li>`).join("")}</ul>
      <div class="toolbar"><button id="acFiled" class="primary" type="button">${fl ? "Update filing record" : "I have filed this return"}</button></div>
      <h3>Returns you have filed</h3>
      ${tbl(["Period", "VAT on sales", "VAT claimed", "VAT paid / (refund)", "Filed on", "Reference", ""], hist.map((f) => [`${niceDate(f.from)} to ${niceDate(f.to)}`, f.out, f.inp, f.paid, niceDate(f.filedOn), f.ref || "", `<button type="button" class="link-btn danger" data-delfile="${esc(f.id)}">Remove</button>`]), "tmmmtth")}`;
  }

  function pnlTab() {
    const days = Math.round((new Date(A.to) - new Date(A.from)) / 86400000) + 1;
    const pf = new Date(new Date(A.from + "T12:00:00").getTime() - days * 86400000), pt = new Date(new Date(A.from + "T12:00:00").getTime() - 86400000);
    const cur = pnl(A.from, A.to), prev = pnl(ymd(pf), ymd(pt));
    const names = [...new Set([...cur.exp.map((x) => x[0]), ...prev.exp.map((x) => x[0])])];
    const get = (o, n) => (o.exp.find((x) => x[0] === n) || [0, 0])[1];
    const rows = [["Sales before VAT", cur.sales, prev.sales], ["Cost of goods sold", cur.cogs, prev.cogs], ["Gross profit", cur.gross, prev.gross], ...names.map((n) => ["   " + n, get(cur, n), get(prev, n)]), ["Total expenses", cur.expTotal, prev.expTotal], ["NET PROFIT", cur.net, prev.net]];
    rows[2].cls = rows[rows.length - 2].cls = rows[rows.length - 1].cls = "total-row";
    return `${periodBar(`<button id="acPrint" class="ghost" type="button">Print / Save as PDF</button><button id="acCsv" class="ghost" type="button">Download CSV</button>`)}
      <h3>Profit and loss <small>${esc(niceDate(A.from))} to ${esc(niceDate(A.to))}, next to the ${days} days before</small></h3>
      ${tbl(["", "This period", "Before"], rows, "tmm")}
      <p class="hint">Cost of goods sold is the cost on each item when it was sold. Stock you buy is not an expense until you sell it, and equipment is left out. Keep item costs up to date in Inventory.</p>`;
  }

  function billRows() {
    return (state.bills || []).filter((b) => (!A.fMonth || b.date.slice(0, 7) === A.fMonth) && (!A.fCat || b.cat === A.fCat) && (!A.fUnpaid || !b.paidOn)).sort((a, b) => (a.date < b.date ? 1 : -1));
  }
  function billsTab() {
    const rows = billRows();
    const months = [...new Set((state.bills || []).map((b) => b.date.slice(0, 7)))].sort().reverse();
    return `<div class="toolbar"><button id="acAdd" class="primary" type="button">+ Add a bill</button>
      <select id="acFMonth"><option value="">All months</option>${months.map((m) => `<option value="${m}"${A.fMonth === m ? " selected" : ""}>${m}</option>`).join("")}</select>
      <select id="acFCat"><option value="">All types</option>${CATS.map((c) => `<option${A.fCat === c.name ? " selected" : ""}>${esc(c.name)}</option>`).join("")}</select>
      <label><input id="acFUnpaid" type="checkbox"${A.fUnpaid ? " checked" : ""}> Not paid yet</label>
      <button id="acBillCsv" class="ghost" type="button">Download CSV</button></div>
      <div class="table-wrap"><table class="data-table"><thead><tr><th>Date</th><th>Supplier</th><th>Invoice</th><th>Type</th><th class="num">Before VAT</th><th class="num">VAT</th><th class="num">Total</th><th>Paid</th><th></th></tr></thead><tbody>
      ${rows.slice(0, 300).map((b) => `<tr><td>${esc(b.date)}</td><td>${esc(b.supplier)}</td><td>${esc(b.ref || "")}</td><td>${esc(b.cat)}</td><td class="num">${fm(b.ex)}</td><td class="num">${fm(b.vat)}${b.vat > 0 && !b.claim ? " *" : ""}</td><td class="num">${fm(r2(b.ex + b.vat))}</td>
        <td>${b.paidOn ? esc(b.paidOn) : `<button type="button" class="link-btn" data-paid="${esc(b.id)}">Mark paid</button>`}</td>
        <td><button type="button" class="link-btn" data-edit="${esc(b.id)}">Edit</button> <button type="button" class="link-btn danger" data-del="${esc(b.id)}">Delete</button></td></tr>`).join("") || `<tr><td colspan="9" class="more-note">No bills yet. Press "+ Add a bill" and type in each supplier invoice or expense.</td></tr>`}
      ${rows.length ? `<tr class="total-row"><td colspan="4">Total (${rows.length})</td><td class="num">${fm(sum(rows, (b) => b.ex))}</td><td class="num">${fm(sum(rows, (b) => b.vat))}</td><td class="num">${fm(sum(rows, (b) => b.ex + b.vat))}</td><td colspan="2"></td></tr>` : ""}
      </tbody></table></div>
      <p class="hint">* VAT not being claimed (no supplier VAT invoice). Keep the paper invoice: the Department can ask for it.</p>`;
  }

  function billForm(b) {
    const edit = !!b, d = b || { date: ymd(new Date()), supplier: "", ref: "", cat: CATS[0].name, amt: "", treat: "added", custom: "", claim: true, paidOn: ymd(new Date()), notes: "", svat: "" };
    const amt = edit ? (b.treat === "added" || b.treat === "none" ? b.ex : r2(b.ex + b.vat)) : "";
    openModal(`<h3>${edit ? "Edit bill" : "Add a bill"}</h3><form class="stack-form" id="acBillForm">
      <label>Date on the invoice<input name="date" type="date" value="${esc(d.date)}" required></label>
      <label>Supplier<input name="supplier" value="${esc(d.supplier)}" required placeholder="Who you paid"></label>
      <label>Invoice number<input name="ref" value="${esc(d.ref || "")}"></label>
      <label>Type<select name="cat">${CATS.map((c) => `<option${d.cat === c.name ? " selected" : ""}>${esc(c.name)}</option>`).join("")}</select></label>
      <label>Amount<input name="amt" type="number" step="0.01" min="0.01" value="${edit ? money(amt) : ""}" required></label>
      <label>About the VAT<select name="treat">
        <option value="added"${d.treat === "added" ? " selected" : ""}>The amount is before VAT, add ${vatRate()}%</option>
        <option value="incl"${d.treat === "incl" ? " selected" : ""}>The amount already includes ${vatRate()}% VAT</option>
        <option value="none"${d.treat === "none" ? " selected" : ""}>No VAT on this bill</option>
        <option value="custom"${d.treat === "custom" ? " selected" : ""}>The amount includes VAT of the amount I type below</option></select></label>
      <label id="acCustomRow" class="hidden">VAT amount on the invoice<input name="custom" type="number" step="0.01" min="0" value="${esc(d.custom === "" ? "" : money(d.custom))}"></label>
      <div class="change-due" id="acPreview"></div>
      <label><input name="claim" type="checkbox"${d.claim ? " checked" : ""}> I have the supplier's VAT invoice (needed to claim the VAT back)</label>
      <label>Paid on<input name="paidOn" type="date" value="${esc(d.paidOn || "")}"><small>Leave empty if not paid yet</small></label>
      <label>Notes<input name="notes" value="${esc(d.notes || "")}"></label>
      <div class="modal-actions"><button type="button" class="ghost" id="modalCancel">Cancel</button><button class="primary" type="submit">Save bill</button></div></form>`);
    const f = document.getElementById("acBillForm");
    const calc = () => {
      const a = r2(f.elements.amt.value), t = f.elements.treat.value, r = vatRate();
      let ex = a, vat = 0;
      if (t === "added") vat = r2(a * r / 100);
      else if (t === "incl") { vat = r2(a - a / (1 + r / 100)); ex = r2(a - vat); }
      else if (t === "custom") { vat = Math.min(r2(f.elements.custom.value), a); ex = r2(a - vat); }
      document.getElementById("acCustomRow").classList.toggle("hidden", t !== "custom");
      document.getElementById("acPreview").textContent = `Before VAT $${money(ex)}  +  VAT $${money(vat)}  =  Total $${money(ex + vat)}`;
      return { ex, vat };
    };
    f.addEventListener("input", calc);
    f.elements.cat.addEventListener("change", () => { f.elements.treat.value = catOf(f.elements.cat.value).vat; calc(); });
    if (!edit) f.elements.treat.value = catOf(f.elements.cat.value).vat;
    calc();
    document.getElementById("modalCancel").onclick = closeModal;
    f.onsubmit = (e) => {
      e.preventDefault();
      const { ex, vat } = calc();
      if (!(ex > 0)) return alert("Type the amount of the bill.");
      const rec = { id: edit ? b.id : "B" + (state.billSeq++), date: f.elements.date.value, supplier: f.elements.supplier.value.trim(), ref: f.elements.ref.value.trim(), cat: f.elements.cat.value, ex, vat, treat: f.elements.treat.value, custom: f.elements.treat.value === "custom" ? r2(f.elements.custom.value) : "", claim: vat > 0 && f.elements.claim.checked, paidOn: f.elements.paidOn.value || "", notes: f.elements.notes.value.trim(), by: who() };
      if (edit) Object.assign(b, rec); else state.bills.push(rec);
      audit(edit ? "bill edited" : "bill added", `${rec.supplier} $${money(ex + vat)} ${rec.date}`);
      saveState(); closeModal(); render();
    };
  }

  function filedForm() {
    const v = vatReturn(A.from, A.to), old = filedFor(A.from, A.to);
    openModal(`<h3>VAT return filed</h3><form class="stack-form" id="acFileForm">
      <div class="change-due">${esc(niceDate(A.from))} to ${esc(niceDate(A.to))}: ${v.net >= 0 ? "VAT to pay" : "VAT refund"} $${money(Math.abs(v.net))}</div>
      <label>Date you filed<input name="on" type="date" value="${esc(old ? old.filedOn : ymd(new Date()))}" required></label>
      <label>Confirmation or reference number<input name="ref" value="${esc(old ? old.ref || "" : "")}"></label>
      <label>Amount you paid (leave 0 if a refund)<input name="paid" type="number" step="0.01" value="${money(old ? old.paid : Math.max(0, v.net))}"></label>
      <div class="modal-actions"><button type="button" class="ghost" id="modalCancel">Cancel</button><button class="primary" type="submit">Save</button></div></form>`);
    document.getElementById("modalCancel").onclick = closeModal;
    document.getElementById("acFileForm").onsubmit = (e) => {
      e.preventDefault();
      const f = e.target, rec = { id: old ? old.id : "F" + Date.now(), from: A.from, to: A.to, out: v.sales.outVat, inp: v.inVat, net: v.net, filedOn: f.elements.on.value, ref: f.elements.ref.value.trim(), paid: r2(f.elements.paid.value), by: who() };
      if (old) Object.assign(old, rec); else state.vatFilings.push(rec);
      audit("VAT return filed", `${A.from} to ${A.to} paid $${money(rec.paid)}`);
      saveState(); closeModal(); render();
    };
  }

  // ---------- exports and printing ----------
  function exportCsv() {
    if (A.tab === "vat") {
      const v = vatReturn(A.from, A.to);
      csv(`vat-return-${A.from}-to-${A.to}.csv`, [["Line", "Amount before VAT", "VAT"], ["Standard-rated sales", v.sales.std, v.sales.outVat], ["Zero-rated sales", 0, 0], ["Exempt sales", v.sales.exempt, 0],
        ["Stock bought for resale", v.stockEx, v.stockVat], ["Running costs", v.expEx, v.expVat], ["Equipment and vehicles", v.capEx, v.capVat], ["VAT on sales", "", v.sales.outVat], ["VAT claimed on purchases", "", v.inVat], [v.net >= 0 ? "VAT to pay" : "VAT refund", "", Math.abs(v.net)]]);
    } else {
      const p = pnl(A.from, A.to);
      csv(`profit-and-loss-${A.from}-to-${A.to}.csv`, [["Line", "Amount"], ["Sales before VAT", p.sales], ["Cost of goods sold", p.cogs], ["Gross profit", p.gross], ...p.exp.map(([n, v]) => [n, v]), ["Total expenses", p.expTotal], ["Net profit", p.net]]);
    }
    audit("accounting export", `${A.tab} ${A.from} ${A.to}`);
  }
  function printCurrent() {
    const out = document.getElementById("acBody").cloneNode(true);
    out.querySelectorAll(".toolbar, button, ul.hint").forEach((n) => n.remove());
    printDoc(A.tab === "vat" ? "VAT return worksheet" : A.tab === "pnl" ? "Profit and loss" : "Accounting summary", out.innerHTML);
  }

  // ---------- page ----------
  function render() {
    const r = root(); if (!r) return;
    if (!Array.isArray(state.bills)) state.bills = [];
    if (!Array.isArray(state.vatFilings)) state.vatFilings = [];
    if (!state.billSeq) state.billSeq = 1001;
    if (!A.from) applyPreset();
    const tabs = [["overview", "Overview"], ["bills", "Bills & expenses"], ["vat", "VAT return"], ["pnl", "Profit & loss"]];
    r.innerHTML = `<div class="toolbar" id="acTabs">${tabs.map(([k, t]) => `<button type="button" class="ghost${A.tab === k ? " active" : ""}" data-atab="${k}">${t}</button>`).join("")}</div>
      <div id="acBody">${A.tab === "bills" ? billsTab() : A.tab === "vat" ? vatTab() : A.tab === "pnl" ? pnlTab() : overview()}</div>`;
  }

  document.addEventListener("click", (e) => {
    const r = root(); if (!r || !r.contains(e.target)) return;
    const t = e.target.closest("button"); if (!t) return;
    if (t.dataset.atab) { A.tab = t.dataset.atab; return render(); }
    if (t.id === "acAdd") return billForm(null);
    if (t.id === "acPrint") return printCurrent();
    if (t.id === "acCsv") return exportCsv();
    if (t.id === "acFiled") return filedForm();
    if (t.id === "acBillCsv") {
      csv(`bills-${stamp()}.csv`, [["Date", "Supplier", "Invoice", "Type", "Before VAT", "VAT", "Total", "VAT claimed", "Paid on", "Notes"], ...billRows().map((b) => [b.date, b.supplier, b.ref, b.cat, b.ex, b.vat, r2(b.ex + b.vat), b.claim ? "yes" : "no", b.paidOn, b.notes])]);
      return audit("bills exported");
    }
    const bill = (id) => state.bills.find((x) => x.id === id);
    if (t.dataset.edit) return billForm(bill(t.dataset.edit));
    if (t.dataset.paid) { const b = bill(t.dataset.paid); if (b) { b.paidOn = ymd(new Date()); audit("bill paid", `${b.supplier} $${money(b.ex + b.vat)}`); saveState(); render(); } return; }
    if (t.dataset.del) { const b = bill(t.dataset.del); if (b && confirm(`Delete the bill from ${b.supplier} for $${money(b.ex + b.vat)}?`)) { state.bills = state.bills.filter((x) => x !== b); audit("bill deleted", `${b.supplier} $${money(b.ex + b.vat)}`); saveState(); render(); } return; }
    if (t.dataset.delfile) { if (confirm("Remove this filing record? Your figures are not changed.")) { state.vatFilings = state.vatFilings.filter((x) => x.id !== t.dataset.delfile); saveState(); render(); } }
  });
  document.addEventListener("change", (e) => {
    const r = root(); if (!r || !r.contains(e.target)) return;
    const id = e.target.id;
    if (id === "acPreset") { A.preset = e.target.value; applyPreset(); render(); }
    else if (id === "acFrom" || id === "acTo") { A[id === "acFrom" ? "from" : "to"] = e.target.value; A.preset = "custom"; if (A.from && A.to && A.from <= A.to) render(); }
    else if (id === "acFMonth") { A.fMonth = e.target.value; render(); }
    else if (id === "acFCat") { A.fCat = e.target.value; render(); }
    else if (id === "acFUnpaid") { A.fUnpaid = e.target.checked; render(); }
  });
  window.renderAccounting = render;
})();
