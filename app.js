const VAT_RATE = 0.10;
const STORAGE_KEY = "longleysPos.v1";
const bootSavedAt = (() => { try { return JSON.parse(localStorage.getItem("longleysPos.v1") || "{}").savedAt || 0; } catch (e) { return 0; } })();
let folderChecked = false, startupCheckPending = true;
var autoBackup = { ready: false, folders: [], failed: "", timer: null, message: "", watching: null };
let dirHandle2 = null, folder2Status = "none", folder2Error = "", lastFolder2Day = "", gateSkipped = false;
let dirHandle = null, writeTimer = null, folderStatus = "none", lastFolderBackupDay = "", folderError = "";
const DEFAULT_USERS = [{ id: "u1", name: "Manager", pin: "1234", role: "manager" }];
function esc(v) {
  return String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const r3 = (n) => Math.round((Number(n) || 0) * 1000) / 1000;

function sha256(ascii) {
  const rr = (v, a) => (v >>> a) | (v << (32 - a));
  const maxWord = 2 ** 32;
  let result = "";
  const words = [];
  const bitLen = ascii.length * 8;
  let hash = (sha256.h = sha256.h || []);
  const k = (sha256.k = sha256.k || []);
  let pc = k.length;
  const comp = {};
  for (let c = 2; pc < 64; c++) {
    if (!comp[c]) {
      for (let i = 0; i < 313; i += c) comp[i] = c;
      hash[pc] = (Math.pow(c, 0.5) * maxWord) | 0;
      k[pc++] = (Math.pow(c, 1 / 3) * maxWord) | 0;
    }
  }
  ascii += "\x80";
  while (ascii.length % 64 - 56) ascii += "\x00";
  for (let i = 0; i < ascii.length; i++) {
    const j = ascii.charCodeAt(i);
    if (j >> 8) return "";
    words[i >> 2] |= j << (((3 - i) % 4) * 8);
  }
  words[words.length] = (bitLen / maxWord) | 0;
  words[words.length] = bitLen;
  for (let j = 0; j < words.length;) {
    const w = words.slice(j, (j += 16));
    const old = hash;
    hash = hash.slice(0, 8);
    for (let i = 0; i < 64; i++) {
      const w15 = w[i - 15], w2 = w[i - 2];
      const a = hash[0], e = hash[4];
      const t1 = hash[7] + (rr(e, 6) ^ rr(e, 11) ^ rr(e, 25)) + ((e & hash[5]) ^ (~e & hash[6])) + k[i] +
        (w[i] = i < 16 ? w[i] : (w[i - 16] + (rr(w15, 7) ^ rr(w15, 18) ^ (w15 >>> 3)) + w[i - 7] + (rr(w2, 17) ^ rr(w2, 19) ^ (w2 >>> 10))) | 0);
      const t2 = (rr(a, 2) ^ rr(a, 13) ^ rr(a, 22)) + ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));
      hash = [(t1 + t2) | 0].concat(hash);
      hash[4] = (hash[4] + t1) | 0;
    }
    for (let i = 0; i < 8; i++) hash[i] = (hash[i] + old[i]) | 0;
  }
  for (let i = 0; i < 8; i++) for (let j = 3; j + 1; j--) {
    const b = (hash[i] >> (j * 8)) & 255;
    result += (b < 16 ? 0 : "") + b.toString(16);
  }
  return result;
}
function newSalt() {
  const a = new Uint8Array(12);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
}
function hashPin(pin, salt) {
  let h = sha256(`${salt}:${pin}`);
  for (let i = 0; i < 2000; i++) h = sha256(h + salt);
  return h;
}
function upgradeUser(u) {
  if (u.pin !== undefined) {
    u.salt = newSalt();
    u.hash = hashPin(String(u.pin), u.salt);
    delete u.pin;
  }
}
function isWeakPin(p) {
  return /^(\d)\1+$/.test(p) || ["1234", "12345", "123456", "1234567", "12345678", "4321", "0123", "2580", "1212", "6969"].includes(p);
}

function starterCustomers() {
  const base = [{ id: "c1", name: "Walk-in", phone: "", bin: "", notes: "Default counter customer" }];
  const seed = window.SEED_CUSTOMERS || [];
  return base.concat(seed.map((c, i) => ({ id: `q${i + 1}`, name: c.name, phone: c.phone, bin: c.bin, notes: c.notes })));
}
function starterProducts() {
  const seed = window.SEED_PRODUCTS;
  return seed && seed.length ? seed.map((p) => ({ ...p, exempt: false })) : DEFAULT_PRODUCTS.map((p) => ({ ...p }));
}
const DEFAULT_PRODUCTS = [
  { sku: "TLS-1001", barcode: "2011001001", name: "16 oz Claw Hammer", category: "Tools", stock: 24, cost: 8.40, price: 14.99 },
  { sku: "TLS-1002", barcode: "2011001002", name: "25 ft Tape Measure", category: "Tools", stock: 40, cost: 4.10, price: 8.49 },
  { sku: "TLS-1003", barcode: "2011001003", name: "8-in-1 Screwdriver", category: "Tools", stock: 32, cost: 5.20, price: 9.99 },
  { sku: "TLS-1004", barcode: "2011001004", name: "Adjustable Wrench 10\"", category: "Tools", stock: 18, cost: 7.80, price: 13.49 },
  { sku: "FST-2001", barcode: "2012001001", name: "1 lb 8d Common Nails", category: "Fasteners", stock: 80, cost: 2.10, price: 4.29 },
  { sku: "FST-2002", barcode: "2012001002", name: "1 lb Drywall Screws", category: "Fasteners", stock: 70, cost: 2.40, price: 4.79 },
  { sku: "FST-2003", barcode: "2012001003", name: "Box Wood Screws #8", category: "Fasteners", stock: 55, cost: 3.10, price: 6.49 },
  { sku: "PLB-3001", barcode: "2013001001", name: "1/2\" PVC Elbow", category: "Plumbing", stock: 120, cost: 0.28, price: 0.89 },
  { sku: "PLB-3002", barcode: "2013001002", name: "1/2\" PVC Coupling", category: "Plumbing", stock: 110, cost: 0.22, price: 0.69 },
  { sku: "PLB-3003", barcode: "2013001003", name: "Teflon Tape Roll", category: "Plumbing", stock: 60, cost: 0.55, price: 1.49 },
  { sku: "PLB-3004", barcode: "2013001004", name: "Washer Supply Line", category: "Plumbing", stock: 22, cost: 5.40, price: 11.99 },
  { sku: "ELC-4001", barcode: "2014001001", name: "12/2 NM Wire 25 ft", category: "Electrical", stock: 16, cost: 18.20, price: 32.99 },
  { sku: "ELC-4002", barcode: "2014001002", name: "Duplex Outlet 15A", category: "Electrical", stock: 90, cost: 0.70, price: 1.79 },
  { sku: "ELC-4003", barcode: "2014001003", name: "Single Pole Switch", category: "Electrical", stock: 75, cost: 0.80, price: 1.99 },
  { sku: "ELC-4004", barcode: "2014001004", name: "LED A19 Bulb 9W", category: "Electrical", stock: 64, cost: 1.40, price: 3.49 },
  { sku: "PNT-5001", barcode: "2015001001", name: "Interior Latex Gallon", category: "Paint", stock: 20, cost: 16.50, price: 29.99 },
  { sku: "PNT-5002", barcode: "2015001002", name: "2\" Angle Brush", category: "Paint", stock: 36, cost: 3.20, price: 6.99 },
  { sku: "PNT-5003", barcode: "2015001003", name: "9\" Roller Cover", category: "Paint", stock: 40, cost: 2.10, price: 4.49 },
  { sku: "LMB-6001", barcode: "2016001001", name: "2x4x8 Pressure Treated", category: "Lumber", stock: 48, cost: 4.80, price: 8.75 },
  { sku: "LMB-6002", barcode: "2016001002", name: "1/2\" Plywood 4x8", category: "Lumber", stock: 18, cost: 18.00, price: 32.50 },
  { sku: "HDW-7001", barcode: "2017001001", name: "3\" Door Hinge Pair", category: "Hardware", stock: 28, cost: 4.60, price: 9.49 },
  { sku: "HDW-7002", barcode: "2017001002", name: "Entry Lockset", category: "Hardware", stock: 12, cost: 22.00, price: 39.99 },
  { sku: "HDW-7003", barcode: "2017001003", name: "Padlock 40 mm", category: "Hardware", stock: 30, cost: 5.10, price: 9.99 },
  { sku: "GRD-8001", barcode: "2018001001", name: "Garden Hose 50 ft", category: "Garden", stock: 10, cost: 14.00, price: 24.99 },
  { sku: "GRD-8002", barcode: "2018001002", name: "Round Point Shovel", category: "Garden", stock: 14, cost: 9.20, price: 17.49 }
];

const ST_RE = /^st[-_ ]?(\d.*)$/i;
const DEFAULT_SETTINGS = {
  storeName: "Longleys Plumbing",
  legalName: "Longleys Plumbing",
  addr1: "",
  addr2: "Nassau, Bahamas",
  phone: "",
  email: "",
  vatNo: "",
  cashier: "Front Counter",
  vatPct: 10,
  footer: "Thank you for shopping Longleys Plumbing",
  registerId: "REG-01",
  drawerType: "",
  drawerOnCash: true
};

function money(n) {
  return (Math.round((Number(n) || 0) * 100) / 100).toFixed(2);
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        products: (parsed.products?.length ? parsed.products : starterProducts()).map((p) => ({ ...p, exempt: false })),
        customers: parsed.customers || [],
        sales: parsed.sales || [],
        holds: parsed.holds || [],
        settings: { ...DEFAULT_SETTINGS, ...parsed.settings, vatPct: 10 },
        seq: parsed.seq || 1001,
        users: parsed.users?.length ? parsed.users : DEFAULT_USERS.map((u) => ({ ...u })),
        audit: Array.isArray(parsed.audit) ? parsed.audit : [],
        security: { fails: 0, until: 0, ...(parsed.security || {}) },
        lastBackupAt: parsed.lastBackupAt || 0,
        recovery: parsed.recovery || null,
        quotes: Array.isArray(parsed.quotes) ? parsed.quotes : [],
        quoteSeq: parsed.quoteSeq || 1001,
        shifts: Array.isArray(parsed.shifts) ? parsed.shifts : [],
        counts: Array.isArray(parsed.counts) ? parsed.counts : [],
        receipts: Array.isArray(parsed.receipts) ? parsed.receipts : [],
        layaways: Array.isArray(parsed.layaways) ? parsed.layaways : [],
        layawaySeq: parsed.layawaySeq || 1001,
        layawayPolicy: { depositPct: 20, termDays: 60, cancelFeePct: 10, ...(parsed.layawayPolicy || {}) },
        bills: Array.isArray(parsed.bills) ? parsed.bills : [],
        billSeq: parsed.billSeq || 1001,
        vatFilings: Array.isArray(parsed.vatFilings) ? parsed.vatFilings : []
      };
    }
  } catch (err) {
    console.warn("Could not restore POS data", err);
  }
  return {
    products: starterProducts(),
    customers: starterCustomers(),
    sales: [],
    holds: [],
    settings: { ...DEFAULT_SETTINGS },
    seq: 1001,
    users: DEFAULT_USERS.map((u) => ({ ...u })),
    audit: [],
    security: { fails: 0, until: 0 },
    lastBackupAt: 0,
    recovery: null,
    quotes: [],
    quoteSeq: 1001,
    shifts: [],
    counts: [],
    receipts: [],
    layaways: [],
    layawaySeq: 1001,
    layawayPolicy: { depositPct: 20, termDays: 60, cancelFeePct: 10 },
    bills: [],
    billSeq: 1001,
    vatFilings: []
  };
}

function snapshotState() {
  return {
    products: state.products,
    customers: state.customers,
    sales: state.sales,
    holds: state.holds,
    settings: state.settings,
    seq: state.seq,
    users: state.users,
    audit: state.audit,
    security: state.security,
    lastBackupAt: state.lastBackupAt,
    recovery: state.recovery,
    quotes: state.quotes,
    quoteSeq: state.quoteSeq,
    shifts: state.shifts,
    counts: state.counts,
    receipts: state.receipts,
    layaways: state.layaways,
    layawaySeq: state.layawaySeq,
    layawayPolicy: state.layawayPolicy,
    bills: state.bills,
    billSeq: state.billSeq,
    vatFilings: state.vatFilings,
    savedAt: Date.now()
  };
}
function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshotState()));
  scheduleFileWrite();
}

const state = loadState();
state.users.forEach(upgradeUser);
applyMeasureDefaults();
saveState();
const cart = {
  items: [],
  discount: 0,
  discountPct: null, // set when the discount was entered as a percentage
  customerId: "c1",
  bin: ""
};

const els = {
  clock: document.getElementById("clock"),
  ticketNo: document.getElementById("ticketNo"),
  cashierName: document.getElementById("cashierName"),
  viewTitle: document.getElementById("viewTitle"),
  viewSubtitle: document.getElementById("viewSubtitle"),
  skuSearch: document.getElementById("skuSearch"),
  categoryFilter: document.getElementById("categoryFilter"),
  categoryPills: document.getElementById("categoryPills"),
  productGrid: document.getElementById("productGrid"),
  cartBody: document.getElementById("cartBody"),
  emptyCart: document.getElementById("emptyCart"),
  subtotalEl: document.getElementById("subtotalEl"),
  vatEl: document.getElementById("vatEl"),
  discountEl: document.getElementById("discountEl"),
  totalEl: document.getElementById("totalEl"),
  discountInput: document.getElementById("discountInput"),
  customerBin: document.getElementById("customerBin"),
  customerPickBtn: document.getElementById("customerPickBtn"),
  inventoryBody: document.getElementById("inventoryBody"),
  salesBody: document.getElementById("salesBody"),
  customersBody: document.getElementById("customersBody"),
  modal: document.getElementById("modal"),
  modalCard: document.getElementById("modalCard"),
  printRoot: document.getElementById("printRoot")
};

let activeCategory = "All";

function categories() {
  return ["All", ...Array.from(new Set(state.products.map((p) => p.category)))];
}

function currentCustomer() {
  return state.customers.find((c) => c.id === cart.customerId) || state.customers[0];
}

function nextTicket() {
  return `FA-${String(state.seq).padStart(5, "0")}`;
}

function listPriceOf(item) {
  if (item.listPrice != null) return Number(item.listPrice);
  const p = state.products.find((x) => x.sku === item.sku);
  return p ? Number(p.price) : Number(item.price);
}

function lineAmounts(item) {
  const qty = Number(item.qty) || 0;
  const price = Number(item.price) || 0;
  const exVat = r2(qty * price);
  const vat = item.exempt ? 0 : r2(exVat * VAT_RATE);
  return { exVat, vat, incVat: r2(exVat + vat) };
}

function cartTotals() {
  const lines = cart.items.map(lineAmounts);
  const subtotal = r2(lines.reduce((s, l) => s + l.exVat, 0));
  const vat = r2(lines.reduce((s, l) => s + l.vat, 0));
  if (cart.discountPct != null) cart.discount = r2((subtotal + vat) * Math.min(cart.discountPct, 100) / 100);
  const discount = r2(Math.min(Number(cart.discount) || 0, subtotal + vat));
  const total = r2(Math.max(0, subtotal + vat - discount));
  return { subtotal, vat, discount, total };
}

function tickClock() {
  const now = new Date();
  els.clock.textContent = now.toLocaleString("en-BS", {
    dateStyle: "medium",
    timeStyle: "short"
  });
}

function renderSettingsForm() {
  const map = {
    setStoreName: "storeName",
    setLegalName: "legalName",
    setAddr1: "addr1",
    setAddr2: "addr2",
    setPhone: "phone",
    setEmail: "email",
    setVatNo: "vatNo",
    setVat: "vatPct",
    setFooter: "footer",
    setRegisterId: "registerId"
  };
  Object.entries(map).forEach(([id, key]) => {
    const el = document.getElementById(id);
    if (el) el.value = state.settings[key];
  });
  els.cashierName.textContent = session ? session.name : "—";
  renderDrawerSettings();
  renderUsers();
  renderAudit();
}

function renderCategories() {
  const cats = categories();
  if (!cats.includes(activeCategory)) activeCategory = "All";
  els.categoryFilter.innerHTML = cats.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join("");
  els.categoryFilter.value = activeCategory;
  const many = cats.length > 14;
  els.categoryPills.classList.toggle("hidden", many);
  els.categoryPills.innerHTML = many ? "" : cats.map((c) => (
    `<button type="button" class="pill ${c === activeCategory ? "active" : ""}" data-cat="${esc(c)}">${esc(c)}</button>`
  )).join("");
}

function tokensMatch(text, q) {
  const t = String(text).toLowerCase();
  return q.toLowerCase().split(/\s+/).filter(Boolean).every((w) => t.includes(w));
}
function productText(p) { return `${p.sku} ${p.barcode || ""} ${p.alt || ""} ${p.name} ${p.desc || ""} ${p.category}`; }
const LIST_LIMIT = 60, TABLE_LIMIT = 200;
function filteredProducts() {
  const q = els.skuSearch.value.trim();
  return state.products.filter((p) => (activeCategory === "All" || p.category === activeCategory) && tokensMatch(productText(p), q));
}

function renderProducts() {
  const all = filteredProducts();
  const html = all.slice(0, LIST_LIMIT).map((p) => `
    <button type="button" class="product-card" data-sku="${esc(p.sku)}">
      <span class="sku">${esc(p.sku)}</span>
      <strong>${esc(p.name)}</strong>
      <span class="price">$${money(p.price)}</span>
      <span class="stock">${p.noTrack ? "" : esc(p.stock) + " on hand"}</span>
    </button>
  `).join("");
  const more = all.length > LIST_LIMIT ? `<p class="more-note">Showing ${LIST_LIMIT} of ${all.length}. Type more of the name or size to narrow it down.</p>` : "";
  els.productGrid.innerHTML = (html || `<p class="empty-cart">No matching items.</p>`) + more;
}

function renderCart() {
  els.ticketNo.textContent = nextTicket();
  els.emptyCart.classList.toggle("hidden", cart.items.length > 0);
  els.cartBody.innerHTML = cart.items.map((item, idx) => {
    const amt = lineAmounts(item);
    return `<tr>
      <td>
        <strong>${esc(item.name)}</strong><br />
        <span class="sku">${esc(item.sku)}</span>
      </td>
      <td>
        <div class="qty-ctrl">
          <button type="button" data-act="dec" data-idx="${idx}">−</button>
          <input type="number" class="qty-input" data-act="qtyin" data-idx="${idx}" value="${esc(item.qty)}" min="0" step="any" inputmode="decimal" title="Type a quantity, decimals allowed (for example 1.5)">${item.unit ? `<span class="qty-unit">${esc(item.unit)}</span>` : ""}
          <button type="button" data-act="inc" data-idx="${idx}">+</button>
        </div>
      </td>
      <td><button type="button" class="link-btn" data-act="price" data-idx="${idx}" title="Change the price on this sale">$${money(item.price)}</button>${Math.abs(item.price - listPriceOf(item)) > 0.004 ? `<br /><span class="sku">was $${money(listPriceOf(item))}</span>` : ""}</td>
      <td>$${money(amt.vat)}</td>
      <td>$${money(amt.incVat)}</td>
      <td><button type="button" class="link-btn" data-act="del" data-idx="${idx}">Remove</button></td>
    </tr>`;
  }).join("");
  const t = cartTotals();
  els.subtotalEl.textContent = `$${money(t.subtotal)}`;
  els.vatEl.textContent = `$${money(t.vat)}`;
  els.discountEl.textContent = t.discount ? `−$${money(t.discount)}` : "$0.00";
  markDiscountChips();
  els.totalEl.textContent = `$${money(t.total)}`;
  const cust = currentCustomer();
  els.customerPickBtn.textContent = cust?.name || "Walk-in customer";
}

function renderInventory() {
  const q = document.getElementById("invSearch").value.trim();
  const all = state.products.filter((p) => tokensMatch(productText(p), q));
  const rows = all.slice(0, TABLE_LIMIT);
  const stCount = state.products.filter((p) => ST_RE.test(String(p.sku).trim())).length;
  const cnt = document.getElementById("invCount");
  if (cnt) cnt.textContent = `${state.products.length.toLocaleString()} items in total${q ? `, ${all.length.toLocaleString()} match your search` : ""}${stCount ? `. ${stCount.toLocaleString()} have an ST- item number (see Clean up ST- duplicates).` : "."}`;
  document.getElementById("inventoryBody").innerHTML = rows.map((p) => `
    <tr>
      <td>${esc(p.sku)}</td>
      <td>${esc(p.barcode)}</td>
      <td>${esc(p.name)}</td>
      <td>${esc(p.category)}</td>
      <td class="${!p.noTrack && p.stock <= 5 ? "low" : ""}">${p.noTrack ? "not tracked" : esc(p.stock)}</td>
      <td>$${money(p.cost)}</td>
      <td>$${money(p.price)}</td>
      <td><button type="button" class="link-btn" data-edit-sku="${esc(p.sku)}">Edit</button> <button type="button" class="link-btn" data-recv="${esc(p.sku)}">Receive</button></td>
    </tr>
  `).join("") + (all.length > TABLE_LIMIT ? `<tr><td colspan="8" class="more-note">Showing ${TABLE_LIMIT} of ${all.length} items. Search to narrow.</td></tr>` : "");
}

function renderSales() {
  const q = document.getElementById("salesSearch").value.trim().toLowerCase();
  const preset = document.getElementById("salesPreset").value;
  let range = null;
  if (preset === "custom") range = [document.getElementById("salesFrom").value || "0000-00-00", document.getElementById("salesTo").value || "9999-99-99"];
  else if (preset !== "all") range = presetRange(preset);
  const rows = [...state.sales].reverse().filter((s) => {
    if (range) {
      const day = new Date(s.at).toLocaleDateString("en-CA");
      if (day < range[0] || day > range[1]) return false;
    }
    const words = q.split(/\s+/).filter(Boolean);
    const hay = `${s.receiptNo} ${s.cashier} ${s.bin} ${s.customerName} ${s.heldName || ""} ${s.tender} ${s.items.map((i) => `${i.sku} ${i.name}`).join(" ")}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
  const live = rows.filter((s) => !s.voided);
  document.getElementById("salesSummary").textContent = `${rows.length} sale(s) · $${money(r2(live.reduce((n, s) => n + s.total, 0)))} total (voids not counted)`;
  document.getElementById("salesBody").innerHTML = rows.map((s) => `
    <tr class="${s.voided ? "void-row" : ""}">
      <td>${esc(s.receiptNo)}</td>
      <td>${new Date(s.at).toLocaleString("en-BS")}</td>
      <td>${esc(s.customerName)}${s.heldName && s.heldName !== s.customerName ? ` <span class="sku">(held as ${esc(s.heldName)})</span>` : ""}<br /><span class="sku">BIN ${esc(s.bin || "—")}</span></td>
      <td>${s.items.reduce((n, i) => n + i.qty, 0)}</td>
      <td>$${money(s.vat)}</td>
      <td>$${money(s.total)}</td>
      <td>${esc(s.tender === "Split" ? describePay(s) : s.tender)}${s.voided ? " <strong>VOID</strong>" : ""}${s.returns?.length ? " <strong>RET</strong>" : ""}</td>
      <td><button type="button" class="link-btn" data-reprint="${esc(s.receiptNo)}">Reprint</button>${isManager() && !s.voided ? ` <button type="button" class="link-btn" data-return="${esc(s.receiptNo)}">Return</button> <button type="button" class="link-btn danger" data-void="${esc(s.receiptNo)}">Void</button>` : ""}</td>
    </tr>
  `).join("") || `<tr><td colspan="8">${state.sales.length ? "No sales match." : "No sales yet."}</td></tr>`;
}

function renderCustomers() {
  const q = document.getElementById("custSearch").value.trim().toLowerCase();
  const rows = state.customers.filter((c) => `${c.name} ${c.phone} ${c.bin}`.toLowerCase().includes(q));
  document.getElementById("customersBody").innerHTML = rows.map((c) => `
    <tr>
      <td>${esc(c.name)}</td>
      <td>${esc(c.phone || "—")}</td>
      <td>${esc(c.bin || "—")}</td>
      <td>${esc(c.notes || "")}</td>
      <td>
        <button type="button" class="link-btn" data-use-cust="${esc(c.id)}">Use</button>
        <button type="button" class="link-btn" data-edit-cust="${esc(c.id)}">Edit</button>
      </td>
    </tr>
  `).join("");
}

function addToCart(product, qty = 1) {
  const existing = cart.items.find((i) => i.sku === product.sku);
  const nextQty = (existing ? existing.qty : 0) + qty;
  if (existing) existing.qty = nextQty;
  else cart.items.push({ sku: product.sku, name: product.name, price: product.price, listPrice: product.price, qty, exempt: false, unit: product.unit || "", desc: product.desc || "", cost: product.cost || 0, cat: product.category });
  renderCart();
}

function findProduct(query) {
  const raw = query.trim();
  const q = raw.toLowerCase();
  if (!q) return null;
  return state.products.find((p) =>
    p.sku.toLowerCase() === q || p.barcode === raw || (/^\d{8,}$/.test(raw) && p.barcode && p.barcode.replace(/^0+/, "") === raw.replace(/^0+/, "")) || p.name.toLowerCase() === q ||
    (p.alt || "").toLowerCase().split("|").map((x) => x.trim()).includes(q)
  );
}

function switchView(name) {
  document.querySelectorAll(".view").forEach((v) => v.classList.toggle("active", v.id === `view-${name}`));
  document.querySelectorAll(".nav-btn").forEach((b) => b.classList.toggle("active", b.dataset.view === name));
  const titles = {
    register: ["Sales Register", "Ring up hardware, plumbing, electrical, and lumber"],
    inventory: ["Inventory", "SKUs, on-hand quantities, cost, and selling price"],
    sales: ["Sales History", "Completed receipts with VAT and tender"],
    customers: ["Customers", "Names, phones, and Bahamas Identification Numbers"],
    settings: ["Settings", "Store identity, staff, and backups"],
    quotes: ["Quotes", "Price quotes for customers"],
    layaway: ["Layaway", "Items held for customers paying over time"],
    stock: ["Stock", "Count shelves, receive deliveries, see what is low"],
    drawer: ["Cash Drawer", "Open, count and close the drawer"],
    reports: ["End of Day Report", "Sales, VAT, and cash totals for a day"],
    accounting: ["Accounting", "Bills, VAT return and profit for the Inland Revenue"],
    labels: ["Barcode Labels", "Print shelf labels with scannable barcodes"]
  };
  const [title, sub] = titles[name];
  els.viewTitle.textContent = title;
  els.viewSubtitle.textContent = sub;
  if (name === "inventory") renderInventory();
  if (name === "sales") renderSales();
  if (name === "customers") renderCustomers();
  if (name === "settings") renderSettingsForm();
  if (name === "quotes") renderQuotes();
  if (name === "drawer") renderDrawer();
  if (name === "stock") renderStock();
  if (name === "layaway") renderLayaway();
  if (name === "reports") renderReportsView();
  if (name === "accounting") renderAccounting();
  if (name === "labels") renderLabels();
}

function closeModal() {
  els.modal.classList.add("hidden");
  els.modalCard.innerHTML = "";
}

function openModal(html) {
  els.modalCard.innerHTML = html;
  els.modal.classList.remove("hidden");
}

// Codes held ready for categories that have no items yet.
const RESERVED_CODES = { "tubs": "TUB", "cpvc sch 80 fittings": "CP8", "pedestals & basins": "PED", "kitchen sinks": "KSK" };
function nextSku(category) {
  // New item numbers look like TUB-0001: a 3-letter category code, a dash, and a 4-digit running number.
  const cat = String(category || "").trim().toLowerCase();
  let prefix = "NEW";
  if (cat) {
    const counts = {};
    state.products.forEach((x) => {
      if (String(x.category || "").trim().toLowerCase() !== cat) return;
      const m = /^([A-Z]{3})-\d+$/.exec(String(x.sku).trim());
      if (m) counts[m[1]] = (counts[m[1]] || 0) + 1;
    });
    const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    if (best) prefix = best[0];
    else if (RESERVED_CODES[cat]) prefix = RESERVED_CODES[cat];
  }
  let max = 0;
  const re = new RegExp("^" + prefix + "-(\\d+)$");
  state.products.forEach((x) => { const m = re.exec(String(x.sku).trim()); if (m) max = Math.max(max, Number(m[1])); });
  return `${prefix}-${String(max + 1).padStart(4, "0")}`;
}


// ---- Items sold by measure (rope, pipe, wire, tubing...) ----
function measuredSkus() {
  return []; // items sold by the foot now carry their unit in the item list
}
function applyMeasureDefaults() {
  if (state.settings.measureV1) return;
  const set = new Set(measuredSkus());
  state.products.forEach((p) => { if (set.has(String(p.sku)) && !p.unit) p.unit = "ft"; });
  state.settings.measureV1 = true;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshotState())); } catch (e) { /* saved with the next change */ }
}

function openMeasureTool() {
  openModal(`
    <h3>Sell by length / weight (in bulk)</h3>
    <p class="hint">Tick the items that are sold by the foot, yard, metre, pound or gallon, pick the unit, and press Apply. The price on these items is then treated as the price per unit.</p>
    <div class="stack-form">
      <label>Category<input id="mtCat" list="mtCatList" placeholder="All categories" autocomplete="off"></label>
      <datalist id="mtCatList">${categories().filter((c) => c !== "All").sort((a, b) => a.localeCompare(b)).map((c) => `<option value="${esc(c)}"></option>`).join("")}</datalist>
      <label>Name contains<input id="mtText" placeholder="e.g. rope, pipe, wire, tubing" autocomplete="off"></label>
      <label>Sold by (leave blank to switch back to whole items)<input id="mtUnit" list="unitList2" value="ft" maxlength="8" autocomplete="off"></label>
      <datalist id="unitList2"><option value="ft"></option><option value="yd"></option><option value="m"></option><option value="lb"></option><option value="gal"></option></datalist>
      <div class="table-wrap" style="max-height:280px;overflow:auto"><table class="data-table"><tbody id="mtBody"></tbody></table></div>
      <p class="hint" id="mtCount"></p>
      <div class="modal-actions">
        <button type="button" class="ghost" id="mtAll">Tick all shown</button>
        <button type="button" class="ghost" id="modalCancel">Close</button>
        <button type="button" class="primary" id="mtApply">Apply to ticked items</button>
      </div>
    </div>
  `);
  const body = document.getElementById("mtBody");
  const draw = () => {
    const cat = document.getElementById("mtCat").value.trim().toLowerCase();
    const txt = document.getElementById("mtText").value.trim().toLowerCase();
    const rows = state.products.filter((p) => (!cat || String(p.category).toLowerCase() === cat) && (!txt || (p.name + " " + p.sku).toLowerCase().includes(txt)));
    document.getElementById("mtCount").textContent = rows.length > 200 ? `Showing the first 200 of ${rows.length}. Narrow it down with the filters.` : `${rows.length} item(s) shown.`;
    body.innerHTML = rows.slice(0, 200).map((p) => `<tr><td><input type="checkbox" data-sku="${esc(p.sku)}"></td><td>${esc(p.name)}<br><span class="sku">${esc(p.sku)} · ${esc(p.category)}</span></td><td>$${money(p.price)}</td><td>${p.unit ? "per " + esc(p.unit) : "each"}</td></tr>`).join("");
  };
  document.getElementById("mtCat").oninput = draw;
  document.getElementById("mtText").oninput = draw;
  document.getElementById("modalCancel").onclick = closeModal;
  document.getElementById("mtAll").onclick = () => body.querySelectorAll("input[type=checkbox]").forEach((c) => { c.checked = true; });
  document.getElementById("mtApply").onclick = () => {
    const u = document.getElementById("mtUnit").value.trim().slice(0, 8);
    const skus = new Set([...body.querySelectorAll("input[type=checkbox]:checked")].map((c) => c.dataset.sku));
    if (!skus.size) return alert("Tick at least one item first.");
    state.products.forEach((p) => { if (skus.has(String(p.sku))) { if (u) p.unit = u; else delete p.unit; } });
    audit("sold-by changed", `${skus.size} item(s) set to ${u || "each"}`);
    saveState(); closeModal(); renderCategories(); renderProducts(); renderInventory();
    alert(`${skus.size} item(s) now sold ${u ? "by the " + u : "as whole items"}.`);
  };
  draw();
}

function productForm(product) {
  const p = product || { sku: nextSku(), barcode: "", name: "", category: "", stock: 0, cost: 0, price: 0, alt: "", noTrack: false };
  openModal(`
    <h3>${product ? "Edit Item" : "New Item"}</h3>
    <form class="stack-form" id="productForm">
      <label>SKU / item number${product ? "" : " (suggested from the category, e.g. TUB-0011; you can change it)"}<input name="sku" value="${esc(p.sku)}" ${product ? "readonly" : ""} required></label>
      <label>Barcode<input name="barcode" value="${esc(p.barcode)}"></label>
      <label>Alternate lookup codes (separate with |)<input name="alt" value="${esc(p.alt || "")}"></label>
      <label>Name<input name="name" value="${esc(p.name)}" required></label>
      <label>Description (searchable, printed on quotes)<input name="desc" value="${esc(p.desc || "")}"></label>
      <label>Category (type a new one or pick an existing one)<input name="category" list="catList" value="${esc(p.category)}" placeholder="e.g. Tubs" autocomplete="off" required></label>
      <datalist id="catList">${categories().filter((c) => c !== "All").sort((a, b) => a.localeCompare(b)).map((c) => `<option value="${esc(c)}"></option>`).join("")}</datalist>
      <label class="inline"><input name="track" type="checkbox" ${p.noTrack ? "" : "checked"}> Track stock for this item</label>
      <label>Sold by (leave blank for whole items. For rope, pipe, wire etc. pick ft, yd, m, lb or gal so she can sell 1.5)<input name="unit" list="unitList" value="${esc(p.unit || "")}" maxlength="8" placeholder="blank = each" autocomplete="off"></label>
      <datalist id="unitList"><option value="ft"></option><option value="yd"></option><option value="m"></option><option value="lb"></option><option value="gal"></option></datalist>
      <label>On hand<input name="stock" type="number" min="0" step="any" value="${esc(p.stock)}" required></label>
      <label>Cost<input name="cost" type="number" min="0" step="0.01" value="${esc(p.cost)}" required></label>
      <label>Price (ex VAT)<input name="price" type="number" min="0" step="0.01" value="${esc(p.price)}" required></label>
      <div class="modal-actions">
        ${product ? '<button type="button" class="ghost danger" id="modalDelete">Delete</button>' : ""}
        <button type="button" class="ghost" id="modalCancel">Cancel</button>
        <button class="primary" type="submit">Save</button>
      </div>
    </form>
  `);
  document.getElementById("modalCancel").onclick = closeModal;
  const delBtn = document.getElementById("modalDelete");
  if (delBtn) delBtn.onclick = () => {
    if (!confirm(`Delete ${p.name}? Past receipts are not affected.`)) return;
    state.products = state.products.filter((x) => x.sku !== p.sku);
    audit("item deleted", `${p.sku} ${p.name}`);
    saveState(); closeModal(); renderCategories(); renderProducts(); renderInventory();
  };
  if (!product) {
    // New item: when a category is chosen, suggest the next number in that category's code (TUB-0011, etc.)
    const f = document.getElementById("productForm");
    const skuIn = f.elements.sku, catIn = f.elements.category;
    let auto = skuIn.value, touched = false;
    skuIn.addEventListener("input", () => { touched = skuIn.value !== auto; });
    const suggest = () => { if (touched) return; auto = nextSku(catIn.value); skuIn.value = auto; };
    catIn.addEventListener("input", suggest);
    catIn.addEventListener("change", suggest);
  }
  document.getElementById("productForm").onsubmit = (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const next = {
      sku: String(fd.get("sku")).trim(),
      barcode: String(fd.get("barcode")).trim(),
      name: String(fd.get("name")).trim(),
      category: String(fd.get("category")).trim(),
      stock: Number(fd.get("stock")),
      unit: String(fd.get("unit") || "").trim(),
      desc: String(fd.get("desc") || "").trim(),
      cost: Number(fd.get("cost")),
      price: Number(fd.get("price")),
      alt: String(fd.get("alt") || "").trim(),
      noTrack: !fd.get("track"),
      exempt: false
    };
    const idx = state.products.findIndex((x) => x.sku === next.sku);
    if (!product && idx >= 0) { alert(`SKU ${next.sku} already exists. Use Edit on that item instead.`); return; }
    if (!product && next.barcode && state.products.some((x) => x.barcode === next.barcode)) { alert("That barcode is already used by another item."); return; }
    if (idx >= 0) {
      const o = state.products[idx];
      const ch = ["price", "cost", "stock", "name"].filter((k) => o[k] !== next[k]).map((k) => `${k} ${o[k]} -> ${next[k]}`);
      if (ch.length) audit("item edited", `${next.sku}: ${ch.join(", ")}`);
      state.products[idx] = next;
    } else {
      state.products.push(next);
      audit("item added", `${next.sku} ${next.name}`);
    }
    saveState();
    closeModal();
    renderCategories();
    renderProducts();
    renderInventory();
  };
}

function customerForm(customer, assignToSale = false) {
  const c = customer || { id: `c${Date.now()}`, name: "", phone: "", bin: "", notes: "" };
  openModal(`
    <h3>${customer ? "Edit Customer" : "New Customer"}</h3>
    <form class="stack-form" id="custForm">
      <label>Name<input name="name" value="${esc(c.name)}" required></label>
      <label>Phone<input name="phone" value="${esc(c.phone || "")}"></label>
      <label>BIN (10 digits)<input name="bin" value="${esc(c.bin || "")}" maxlength="10" inputmode="numeric"></label>
      <label>Notes<input name="notes" value="${esc(c.notes || "")}"></label>
      <div class="modal-actions">
        <button type="button" class="ghost" id="modalCancel">Cancel</button>
        <button class="primary" type="submit">Save</button>
      </div>
    </form>
  `);
  document.getElementById("modalCancel").onclick = closeModal;
  document.getElementById("custForm").onsubmit = (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const bin = String(fd.get("bin") || "").replace(/\D/g, "");
    if (bin && bin.length !== 10) {
      alert("BIN must be exactly 10 digits.");
      return;
    }
    const next = {
      id: c.id,
      name: String(fd.get("name")).trim(),
      phone: String(fd.get("phone")).trim(),
      bin,
      notes: String(fd.get("notes")).trim()
    };
    const idx = state.customers.findIndex((x) => x.id === next.id);
    if (idx >= 0) state.customers[idx] = next;
    else state.customers.push(next);
    saveState();
    closeModal();
    renderCustomers();
    if (assignToSale) {
      cart.customerId = next.id;
      cart.bin = next.bin || cart.bin;
      els.customerBin.value = cart.bin;
      renderCart();
    }
  };
}

function pickCustomer() {
  openModal(`
    <h3>Assign Customer</h3>
    <div class="stack-form">
      <button type="button" class="primary" id="pickNewCust">+ New customer</button>
      <input id="pickCustSearch" type="text" placeholder="Search name, phone or BIN" autocomplete="off">
      <div id="pickCustList" style="display:flex;flex-direction:column;gap:6px;max-height:320px;overflow:auto"></div>
      <p class="hint" id="pickCustCount"></p>
    </div>
    <div class="modal-actions">
      <button type="button" class="ghost" id="modalCancel">Close</button>
    </div>
  `);
  document.getElementById("modalCancel").onclick = closeModal;
  const list = document.getElementById("pickCustList");
  const draw = () => {
    const q = document.getElementById("pickCustSearch").value.trim().toLowerCase();
    const rows = state.customers.filter((c) => !q || c.id === "c1" || `${c.name} ${c.phone || ""} ${c.bin || ""}`.toLowerCase().includes(q));
    list.innerHTML = rows.slice(0, 60).map((c) => `<button type="button" class="ghost" data-pick="${esc(c.id)}">${esc(c.name)}${c.phone ? " · " + esc(c.phone) : ""} — BIN ${esc(c.bin || "not on file")}</button>`).join("");
    document.getElementById("pickCustCount").textContent = rows.length > 60 ? `Showing 60 of ${rows.length}. Type more to narrow it down.` : (q && rows.length <= 1 ? "No match. Use + New customer to add them." : "");
  };
  list.onclick = (e) => {
    const btn = e.target.closest("[data-pick]");
    if (!btn) return;
    cart.customerId = btn.dataset.pick;
    const cust = currentCustomer();
    cart.bin = cust.bin || cart.bin;
    els.customerBin.value = cart.bin;
    closeModal();
    renderCart();
  };
  document.getElementById("pickCustSearch").oninput = draw;
  document.getElementById("pickNewCust").onclick = () => customerForm(null, true);
  draw();
  document.getElementById("pickCustSearch").focus();
}

function receiptHTML(sale) {
  const binDisplay = sale.bin && sale.bin.length === 10
    ? sale.bin
    : "__________";
  const itemRows = sale.items.map((item) => {
    const amt = lineAmounts(item);
    return `<div class="row"><span>${esc(item.qty)}${item.unit ? " " + esc(item.unit) : ""} x ${esc(item.name)}</span><span>$${money(amt.incVat)}</span></div>
      <div class="tiny">${esc(item.sku)} @ $${money(item.price)} ${item.exempt ? "VAT exempt" : "+ VAT $" + money(amt.vat)}</div>`;
  }).join("");
  return `<article class="receipt">
    <div class="center store">${esc(sale.store.storeName)}</div>
    <div class="center">${esc(sale.store.legalName)}</div>
    <div class="center">${sale.store.addr1}</div>
    <div class="center">${sale.store.addr2}</div>
    <div class="center">${esc(sale.store.phone)}</div>
    ${sale.store.email ? `<div class="center tiny">${esc(sale.store.email)}</div>` : ""}
    ${sale.store.vatNo ? `<div class="center tiny">VAT Reg. No. ${esc(sale.store.vatNo)}</div>` : ""}
    <hr class="dash" />
    <div class="center bold">SALES RECEIPT</div>
    ${sale.voided ? `<div class="center bold">*** VOIDED / REFUNDED ***</div>` : ""}
    <div class="row"><span>Receipt</span><span>${esc(sale.receiptNo)}</span></div>
    <div class="row"><span>Register</span><span>${esc(sale.store.registerId)}</span></div>
    <div class="row"><span>Cashier</span><span>${esc(sale.cashier)}</span></div>
    <div class="row"><span>Date</span><span>${new Date(sale.at).toLocaleString("en-BS")}</span></div>
    <div class="row"><span>Customer</span><span>${esc(sale.customerName)}</span></div>
    <hr class="dash" />
    ${itemRows}
    <hr class="dash" />
    <div class="row"><span>Subtotal ex VAT</span><span>$${money(sale.subtotal)}</span></div>
    <div class="row"><span>Bahamas VAT 10%</span><span>$${money(sale.vat)}</span></div>
    ${sale.discount ? `<div class="row"><span>Discount</span><span>-$${money(sale.discount)}</span></div><div class="row tiny"><span>VAT included after discount</span><span>$${money(netVat(sale))}</span></div>` : ""}
    <div class="row bold"><span>TOTAL BSD</span><span>$${money(sale.total)}</span></div>
    ${payRowsHTML(sale)}
    <div class="bin-box">
      <div class="bin-label">Bahamas Identification Number (BIN)</div>
      <div class="bin-value">${binDisplay}</div>
      <div class="tiny">10-digit BIN placeholder — enter customer BIN at checkout</div>
    </div>
    <div class="center tiny">Item prices shown ex VAT. 10% VAT included in line totals.</div>
    <div class="center">${esc(sale.store.footer)}</div>
    <div class="center tiny">3-inch thermal copy</div>
  </article>`;
}

function printSale(sale) {
  els.printRoot.innerHTML = receiptHTML(sale);
  window.print();
}

function resetCart() {
  cart.quoteNo = null;
  cart.holdName = "";
  cart.items = [];
  cart.discount = 0;
  cart.discountPct = null;
  cart.customerId = "c1";
  cart.bin = "";
  els.discountInput.value = "";
  els.customerBin.value = "";
}

let printReceiptPref = true;

// ---------- Cash drawer (opened by a pulse sent to the receipt printer) ----------
const DRAWER_PULSE = new Uint8Array([0x1b, 0x70, 0x00, 0x19, 0xfa]); // ESC p 0 25 250
async function sendDrawerPulse() {
  const type = state.settings.drawerType;
  if (type === "serial") {
    if (!navigator.serial) throw new Error("This browser has no Web Serial. Use Chrome or Edge.");
    const port = (await navigator.serial.getPorts())[0];
    if (!port) throw new Error("No drawer port is connected. Go to Settings > Cash drawer.");
    await port.open({ baudRate: 9600 });
    try { const w = port.writable.getWriter(); await w.write(DRAWER_PULSE); w.releaseLock(); }
    finally { await port.close().catch(() => {}); }
  } else if (type === "usb") {
    if (!navigator.usb) throw new Error("This browser has no WebUSB. Use Chrome or Edge.");
    const dev = (await navigator.usb.getDevices())[0];
    if (!dev) throw new Error("No USB printer is connected. Go to Settings > Cash drawer.");
    await dev.open();
    let iface = null, ep = null;
    try {
      if (dev.configuration === null) await dev.selectConfiguration(1);
      for (const i of dev.configuration.interfaces) {
        for (const a of i.alternates) {
          const e = a.endpoints.find((x) => x.direction === "out" && x.type === "bulk");
          if (e) { iface = i.interfaceNumber; ep = e.endpointNumber; break; }
        }
        if (ep !== null) break;
      }
      if (ep === null) throw new Error("Could not find the printer's output channel. Windows may be holding the printer; try the printer's own drawer setting instead.");
      await dev.claimInterface(iface);
      await dev.transferOut(ep, DRAWER_PULSE);
      await dev.releaseInterface(iface);
    } finally { await dev.close().catch(() => {}); }
  } else if (type === "helper") {
    // A small program on this PC (drawer-helper.ps1, started by Start POS.bat) sends the signal to the printer.
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 4000);
    const notRunning = new Error("The drawer helper is not running. Close the POS and start it again with Start POS.bat. If that does not fix it, see DRAWER-HELPER-SETUP.txt.");
    let r;
    try { r = await fetch("http://127.0.0.1:9101/open", { method: "POST", signal: ctl.signal }); }
    catch (e) {
      // The browser may block reading the reply even though the helper is running.
      // A no-cors request still reaches the helper; it only fails if nothing is listening.
      try { await fetch("http://127.0.0.1:9101/open", { method: "POST", mode: "no-cors" }); return; }
      catch (e2) { throw notRunning; }
    }
    finally { clearTimeout(timer); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) throw new Error(j.error || "The drawer helper could not open the drawer.");
  } else if (type === "driver") {
    // The printer driver's own "open drawer" setting fires on any print job, so print a tiny slip.
    els.printRoot.innerHTML = `<article class="receipt"><div class="center tiny">DRAWER OPENED ${esc(new Date().toLocaleString())}</div></article>`;
    window.print();
  } else {
    throw new Error("The cash drawer is not set up. Go to Settings > Cash drawer.");
  }
}
async function openDrawer(loud) {
  if (!state.settings.drawerType) { if (loud) alert("The cash drawer is not set up. Go to Settings > Cash drawer."); return false; }
  try { await sendDrawerPulse(); return true; }
  catch (err) {
    console.warn("Drawer", err);
    const denied = /access denied|denied|claim|busy|in use/i.test(String(err && (err.message || err.name)));
    if (loud) alert(denied && state.settings.drawerType === "usb"
      ? "Windows is using this printer, so the browser cannot open the drawer directly.\n\nGo to Settings > Cash drawer and press \"Use printer driver\" instead, and turn on \"open drawer\" in the printer's Windows driver settings."
      : "Could not open the drawer: " + err.message);
    return false;
  }
}

function completeSale(tender, tendered, cardAmount = 0) {
  if (!currentShift()) { closeModal(); switchView("drawer"); return alert("Open the cash drawer first, then take the payment again."); }
  const t = cartTotals();
  if (!session) return alert("Please sign in first.");
  if (!cart.items.length) {
    alert("Add items before charging.");
    return;
  }
  const bin = String(els.customerBin.value || "").replace(/\D/g, "");
  if (bin && bin.length !== 10) {
    alert("BIN must be 10 digits, or leave it blank to print the placeholder.");
    return;
  }
  const paid = Number(tendered);
  let payments;
  if (tender === "Split") {
    const card = r2(cardAmount);
    if (!(card > 0 && card < t.total)) return alert("For a split, the card amount must be more than $0 and less than the total.");
    const cashDue = r2(t.total - card);
    if (!(paid >= cashDue)) return alert("Cash tendered is less than the cash due.");
    payments = [{ method: "Card", amount: card }, { method: "Cash", amount: cashDue, tendered: r2(paid), change: r2(paid - cashDue) }];
  } else if (tender === "Cash") {
    if (!(paid >= t.total)) return alert("Cash tendered is less than the amount due.");
    payments = [{ method: "Cash", amount: t.total, tendered: r2(paid), change: r2(paid - t.total) }];
  } else {
    payments = [{ method: "Card", amount: t.total }];
  }
  const sale = {
    receiptNo: nextTicket(),
    at: new Date().toISOString(),
    cashier: session ? session.name : "Counter",
    customerName: currentCustomer().name,
    heldName: cart.holdName || "",
    customerId: cart.customerId,
    bin,
    items: cart.items.map((i) => ({ ...i })),
    subtotal: t.subtotal,
    vat: t.vat,
    discount: t.discount,
    total: t.total,
    tender,
    payments,
    tendered: r2(payments.reduce((a, p) => a + (p.tendered ?? p.amount), 0)),
    change: r2(payments.reduce((a, p) => a + (p.change || 0), 0)),
    store: { ...state.settings }
  };
  sale.items.forEach((line) => {
    const p = state.products.find((x) => x.sku === line.sku);
    if (p && !p.noTrack) p.stock = r3(Math.max(0, p.stock - line.qty));
  });
  if (cart.quoteNo) {
    sale.quoteNo = cart.quoteNo;
    const qq = state.quotes.find((x) => x.no === cart.quoteNo);
    if (qq) { qq.status = "converted"; qq.receiptNo = sale.receiptNo; }
  }
  state.sales.push(sale);
  if (sale.discount) audit("discount", `${sale.receiptNo} $${money(sale.discount)}`);
  sale.items.forEach((line) => {
    const list = listPriceOf(line);
    if (Math.abs(line.price - list) > 0.004) audit("price changed", `${sale.receiptNo} ${line.sku} $${money(list)} -> $${money(line.price)}`);
  });
  state.seq += 1;
  if (bin) {
    const cust = currentCustomer();
    if (cust) cust.bin = bin;
  }
  const chk = document.getElementById("printReceiptChk");
  const wantPrint = chk ? chk.checked : true;
  if (state.settings.drawerOnCash && payments.some((p) => p.method === "Cash") && (state.settings.drawerType !== "driver" || !wantPrint)) openDrawer(false);
  resetCart();
  saveState();
  closeModal();
  renderCart();
  renderProducts();
  if (wantPrint) printSale(sale);
  else showSaleDone(sale);
}

function showSaleDone(sale) {
  const change = r2(sale.change || 0);
  openModal(`
    <h3>Sale complete</h3>
    <p>Receipt <strong>${esc(sale.receiptNo)}</strong> &mdash; total <strong>$${money(sale.total)}</strong>. No receipt printed.</p>
    ${change > 0 ? `<div class="change-due">Change due $${money(change)}</div>` : ""}
    <div class="modal-actions">
      <button type="button" class="ghost" id="doneReprint">Print receipt</button>
      <button type="button" class="primary" id="doneClose">Done</button>
    </div>
  `);
  document.getElementById("doneClose").onclick = closeModal;
  document.getElementById("doneReprint").onclick = () => { closeModal(); printSale(sale); };
}

function openPay() {
  const t = cartTotals();
  if (!cart.items.length) {
    alert("Add items before charging.");
    return;
  }
  const noPrice = cart.items.filter((i) => !(Number(i.price) > 0));
  if (noPrice.length && !confirm(`${noPrice.length} item(s) on this sale have no price ($0.00):\n\n${noPrice.map((i) => i.name).join("\n")}\n\nCancel and tap the price to set it, or OK to charge anyway.`)) return;
  openModal(`
    <h3>Take Payment</h3>
    <p>Amount due: <strong>$${money(t.total)}</strong> (includes 10% Bahamas VAT)</p>
    <div class="tender-grid">
      <button type="button" class="primary" id="payCash">Cash</button>
      <button type="button" class="primary" id="payCard">Card</button>
      <button type="button" class="ghost" id="paySplit">Split</button>
    </div>
    <div id="splitBox" class="hidden">
      <label>Card amount<input id="splitCard" type="number" min="0.01" step="0.01" /></label>
      <div class="change-due" id="splitDue">Cash due $${money(t.total)}</div>
      <label>Cash tendered<input id="splitCashIn" type="number" min="0" step="0.01" /></label>
      <div class="change-due" id="splitChange">Change $0.00</div>
      <button type="button" class="primary" id="payTakeSplit">Take split payment</button>
    </div>
    <label>Cash tendered<input id="cashIn" type="number" min="0" step="0.01" value="${money(t.total)}" /></label>
    <div class="change-due" id="changePreview">Change $0.00</div>
    <label class="inline"><input id="printReceiptChk" type="checkbox" ${printReceiptPref ? "checked" : ""}> Print receipt</label>
    <div class="modal-actions">
      <button type="button" class="ghost" id="modalCancel">Cancel</button>
    </div>
  `);
  const cashIn = document.getElementById("cashIn");
  const preview = document.getElementById("changePreview");
  const updateChange = () => {
    const change = Math.max(0, Number(cashIn.value) - t.total);
    preview.textContent = `Change $${money(change)}`;
  };
  cashIn.oninput = updateChange;
  updateChange();
  // Cursor is already in the cash box with the total highlighted: just type the amount received.
  cashIn.classList.add("cash-focus");
  const focusCash = () => { cashIn.focus(); cashIn.select(); };
  cashIn.onfocus = () => cashIn.select();
  focusCash();
  setTimeout(focusCash, 50);
  // Enter takes the cash payment (unless the split box is the one being used)
  cashIn.onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); completeSale("Cash", cashIn.value); } };
  document.getElementById("modalCancel").onclick = closeModal;
  document.getElementById("payCash").onclick = () => completeSale("Cash", cashIn.value);
  document.getElementById("payCard").onclick = () => completeSale("Card", t.total);
  const sc = document.getElementById("splitCard"), si = document.getElementById("splitCashIn");
  const upd = () => {
    const due = Math.max(0, r2(t.total - (Number(sc.value) || 0)));
    document.getElementById("splitDue").textContent = `Cash due $${money(due)}`;
    document.getElementById("splitChange").textContent = `Change $${money(Math.max(0, (Number(si.value) || 0) - due))}`;
  };
  sc.oninput = () => { si.value = money(Math.max(0, r2(t.total - (Number(sc.value) || 0)))); upd(); };
  si.oninput = upd;
  document.getElementById("paySplit").onclick = () => { document.getElementById("splitBox").classList.remove("hidden"); sc.focus(); sc.select(); };
  sc.onfocus = () => sc.select();
  si.onfocus = () => si.select();
  document.getElementById("payTakeSplit").onclick = () => completeSale("Split", si.value, sc.value);
}

function holdTicket() {
  if (!cart.items.length) {
    alert("Nothing to hold.");
    return;
  }
  const cust = state.customers.find((c) => c.id === cart.customerId);
  const raw = prompt("Name or note for this held sale (so you can find it later):", cart.holdName || (cart.customerId !== "c1" && cust ? cust.name : ""));
  if (raw === null) return; // cancelled: keep the sale open
  const name = raw.trim() || `Held ${new Date().toLocaleTimeString("en-BS", { hour: "numeric", minute: "2-digit" })}`;
  state.holds.push({
    id: Date.now(),
    name,
    items: cart.items.map((i) => ({ ...i })),
    discount: cart.discount,
    discountPct: cart.discountPct,
    customerId: cart.customerId,
    bin: els.customerBin.value
  });
  resetCart();
  saveState();
  renderCart();
}

function recallTicket() {
  if (!state.holds.length) {
    alert("No held tickets.");
    return;
  }
  openModal(`
    <h3>Recall Held Ticket</h3>
    ${state.holds.map((h, i) => {
      const gross = h.items.reduce((n, l) => n + lineAmounts(l).incVat, 0);
      const tot = r2(Math.max(0, gross - (Number(h.discount) || 0)));
      const names = h.items.slice(0, 3).map((l) => l.name).join(", ") + (h.items.length > 3 ? ", …" : "");
      return `
      <button type="button" class="ghost" data-hold="${i}" style="display:block;width:100%;text-align:left;margin-bottom:8px">
        <strong>${esc(h.name || "No name")}</strong><br />
        <span class="sku">${esc(h.items.length)} item(s) · $${money(tot)} · ${new Date(h.id).toLocaleString("en-BS")}</span><br />
        <span class="sku">${esc(names)}</span>
      </button>`;
    }).join("")}
    <div class="modal-actions"><button type="button" class="ghost" id="modalCancel">Close</button></div>
  `);
  document.getElementById("modalCancel").onclick = closeModal;
  els.modalCard.querySelectorAll("[data-hold]").forEach((btn) => {
    btn.onclick = () => {
      const h = state.holds.splice(Number(btn.dataset.hold), 1)[0];
      cart.items = h.items.map((i) => ({ ...i, exempt: false }));
      cart.discount = h.discount;
      cart.discountPct = h.discountPct ?? null;
      cart.customerId = h.customerId;
      cart.holdName = h.name || "";
      els.customerBin.value = h.bin || "";
      setDiscountMode(cart.discountPct != null ? "%" : "$");
      els.discountInput.value = (cart.discountPct != null ? cart.discountPct : h.discount) || "";
      saveState();
      closeModal();
      renderCart();
    };
  });
}

document.querySelector(".nav").addEventListener("click", (e) => {
  const btn = e.target.closest(".nav-btn");
  if (!btn) return;
  if (btn.dataset.role === "manager" && !isManager()) return;
  switchView(btn.dataset.view);
});

els.categoryPills.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-cat]");
  if (!btn) return;
  activeCategory = btn.dataset.cat;
  renderCategories();
  renderProducts();
});

els.categoryFilter.addEventListener("change", () => {
  activeCategory = els.categoryFilter.value;
  renderCategories();
  renderProducts();
});

els.skuSearch.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    const only = filteredProducts();
    const match = findProduct(els.skuSearch.value) || (only.length === 1 ? only[0] : null);
    if (match) {
      addToCart(match);
      els.skuSearch.value = "";
      renderProducts();
    }
  }
});
els.skuSearch.addEventListener("input", renderProducts);

els.productGrid.addEventListener("click", (e) => {
  const card = e.target.closest("[data-sku]");
  if (!card) return;
  const product = state.products.find((p) => p.sku === card.dataset.sku);
  if (product) {
    addToCart(product);
    // clear the search so the next item can be typed straight away
    if (els.skuSearch.value) { els.skuSearch.value = ""; renderProducts(); }
    els.skuSearch.focus();
  }
});

els.cartBody.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-act]");
  if (!btn) return;
  if (btn.dataset.act === "qtyin") return; // clicking the quantity box must not redraw the cart (it would lose focus)
  const idx = Number(btn.dataset.idx);
  const item = cart.items[idx];
  if (!item) return;
  if (btn.dataset.act === "qty") {
    const p = state.products.find((x) => x.sku === item.sku);
    const v = Number(prompt(`Quantity of ${item.name}${item.unit ? " (" + item.unit + ")" : ""}:`, item.qty));
    if (!(v > 0) || v > 100000) return;
    item.qty = r3(v);
    renderCart();
    return;
  }
  if (btn.dataset.act === "price") {
    const list = listPriceOf(item);
    const raw = prompt(`New price for ${item.name} (before VAT).\nList price: $${money(list)} before VAT ($${money(r2(list * (1 + VAT_RATE)))} with VAT).`, money(item.price));
    if (raw === null) return;
    const v = r2(Number(String(raw).replace(/[$,\s]/g, "")));
    if (!(v >= 0) || v > 1000000 || raw.trim() === "") return alert("Enter a price like 12.50.");
    if (!isManager()) {
      if (v > list + 0.004) return alert("Only a manager can raise a price.");
    }
    item.price = v;
    renderCart();
    return;
  }
  if (btn.dataset.act === "inc") {
    const p = state.products.find((x) => x.sku === item.sku);
    item.qty = r3(item.qty + 1);
  }
  if (btn.dataset.act === "dec") item.qty = r3(item.qty - 1);
  if (btn.dataset.act === "del" || item.qty <= 0) cart.items.splice(idx, 1);
  renderCart();
});

els.cartBody.addEventListener("change", (e) => {
  const inp = e.target.closest('[data-act="qtyin"]');
  if (!inp) return;
  const idx = Number(inp.dataset.idx);
  const item = cart.items[idx];
  if (!item) return;
  const raw = String(inp.value).trim();
  const v = Number(raw.replace(",", "."));
  if (!(v > 0) || v > 100000) {
    if (raw !== "" && v === 0) { cart.items.splice(idx, 1); renderCart(); els.skuSearch.focus(); return; }
    inp.value = item.qty;
    if (raw === "") return;
    return alert("Enter a quantity above 0, for example 1.5.");
  }
  item.qty = r3(v);
  renderCart();
  els.skuSearch.focus();
});
els.cartBody.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && e.target.closest('[data-act="qtyin"]')) { e.preventDefault(); e.target.blur(); }
});

// ---------- Discount: type a $ amount or a % , or tap a preset. No limit. ----------
const DISCOUNT_PRESETS = [5, 10, 15, 20]; // edit this list to change the preset buttons
const discountModeEl = document.getElementById("discountMode");
const discountChipsEl = document.getElementById("discountChips");
function setDiscountMode(m) {
  discountModeEl.value = m;
  els.discountInput.placeholder = m === "%" ? "Discount %" : "Discount $";
  els.discountInput.step = m === "%" ? "0.1" : "0.01";
}
function markDiscountChips() {
  document.getElementById("discountChips").querySelectorAll("[data-pct]").forEach((b) => b.classList.toggle("active", cart.discountPct != null && Number(b.dataset.pct) === cart.discountPct));
}
function clearDiscount() {
  cart.discount = 0; cart.discountPct = null; els.discountInput.value = "";
  renderCart(); markDiscountChips();
}
discountChipsEl.innerHTML = DISCOUNT_PRESETS.map((p) => `<button type="button" class="disc-chip" data-pct="${p}">${p}%</button>`).join("") + `<button type="button" class="disc-chip" data-pct="none">Clear</button>`;
discountChipsEl.addEventListener("click", (e) => {
  const b = e.target.closest("[data-pct]");
  if (!b) return;
  if (b.dataset.pct === "none") return clearDiscount();
  if (!cart.items.length) return alert("Add items first, then apply a discount.");
  setDiscountMode("%");
  cart.discountPct = Number(b.dataset.pct);
  els.discountInput.value = b.dataset.pct;
  renderCart(); markDiscountChips();
});
discountModeEl.addEventListener("change", () => {
  const m = discountModeEl.value, t = cartTotals(), gross = r2(t.subtotal + t.vat);
  setDiscountMode(m);
  if (!t.discount) { cart.discountPct = null; els.discountInput.value = ""; }
  else if (m === "%") { cart.discountPct = gross ? r2(t.discount / gross * 100) : null; els.discountInput.value = cart.discountPct ?? ""; }
  else { cart.discountPct = null; cart.discount = t.discount; els.discountInput.value = money(t.discount); }
  renderCart(); markDiscountChips();
});
els.discountInput.addEventListener("input", () => {
  const v = Math.max(0, Number(els.discountInput.value) || 0);
  if (discountModeEl.value === "%") {
    if (v > 100) { els.discountInput.value = "100"; }
    cart.discountPct = els.discountInput.value === "" ? null : Math.min(v, 100);
    if (cart.discountPct == null) cart.discount = 0;
  } else {
    cart.discountPct = null;
    cart.discount = v;
  }
  renderCart(); markDiscountChips();
});

els.customerBin.addEventListener("input", () => {
  cart.bin = els.customerBin.value.replace(/\D/g, "").slice(0, 10);
  els.customerBin.value = cart.bin;
});

document.getElementById("payBtn").onclick = openPay;
document.getElementById("holdBtn").onclick = holdTicket;
document.getElementById("recallBtn").onclick = recallTicket;
document.getElementById("clearBtn").onclick = () => {
  if (cart.items.length && !confirm("Clear the current sale?")) return;
  resetCart();
  renderCart();
};
document.getElementById("customerPickBtn").onclick = pickCustomer;
document.getElementById("addProductBtn").onclick = () => productForm();
document.getElementById("measureToolBtn").onclick = openMeasureTool;
document.getElementById("addCustomerBtn").onclick = () => customerForm();
document.getElementById("invSearch").oninput = renderInventory;
document.getElementById("salesSearch").oninput = renderSales;
document.getElementById("salesPreset").onchange = (e) => {
  if (e.target.value !== "custom" && e.target.value !== "all") [document.getElementById("salesFrom").value, document.getElementById("salesTo").value] = presetRange(e.target.value);
  renderSales();
};
["salesFrom", "salesTo"].forEach((id) => { document.getElementById(id).onchange = () => { document.getElementById("salesPreset").value = "custom"; renderSales(); }; });
document.getElementById("custSearch").oninput = renderCustomers;

document.getElementById("inventoryBody").addEventListener("click", (e) => {
  const sku = e.target.closest("[data-edit-sku]")?.dataset.editSku;
  if (sku) productForm(state.products.find((p) => p.sku === sku));
});

document.getElementById("salesBody").addEventListener("click", (e) => {
  const no = e.target.closest("[data-reprint]")?.dataset.reprint;
  if (!no) return;
  const sale = state.sales.find((s) => s.receiptNo === no);
  if (sale) printSale(sale);
});

document.getElementById("customersBody").addEventListener("click", (e) => {
  const useId = e.target.closest("[data-use-cust]")?.dataset.useCust;
  const editId = e.target.closest("[data-edit-cust]")?.dataset.editCust;
  if (useId) {
    cart.customerId = useId;
    const cust = currentCustomer();
    els.customerBin.value = cust.bin || "";
    switchView("register");
    renderCart();
  }
  if (editId) customerForm(state.customers.find((c) => c.id === editId));
});

function renderDrawerSettings() {
  const t = state.settings.drawerType;
  const el = document.getElementById("drawerStatus");
  if (el) el.textContent = t === "serial" ? "Connected by serial / COM port." : t === "usb" ? "Connected by USB printer." : t === "helper" ? "Using the drawer helper (sends the signal straight to the printer; no receipt slip is printed)." : t === "driver" ? "Using the printer driver. Turn on its open-drawer setting in Windows; cash sales with no receipt print a small slip so the drawer still opens." : "Not set up. The drawer will only open if the printer is set to open it when printing.";
  const c = document.getElementById("drawerOnCash");
  if (c) c.checked = !!state.settings.drawerOnCash;
  // highlight the connection method that is in use
  [["drawerHelperBtn", "helper", "Use drawer helper (recommended)"], ["drawerDriverBtn", "driver", "Use printer driver (prints a slip)"], ["drawerUsbBtn", "usb", "Connect USB printer"], ["drawerSerialBtn", "serial", "Connect serial / COM port"]].forEach(([id, key, label]) => {
    const b = document.getElementById(id);
    if (!b) return;
    const on = t === key;
    b.classList.toggle("primary", on);
    b.classList.toggle("ghost", !on);
    b.textContent = on ? `\u2713 ${label.replace(/^Connect /, "")} (in use)` : label;
  });
  if (el) el.style.cssText = t ? "font-weight:600;color:#1e6b1e" : "font-weight:600;color:#b45309";
}
document.getElementById("drawerOnCash").onchange = (e) => { state.settings.drawerOnCash = e.target.checked; saveState(); };
document.getElementById("drawerSerialBtn").onclick = async () => {
  if (!navigator.serial) return alert("Use Chrome or Edge for this.");
  try { await navigator.serial.requestPort(); state.settings.drawerType = "serial"; audit("drawer connected", "serial"); saveState(); renderDrawerSettings(); }
  catch (err) { if (err.name !== "NotFoundError") alert("Could not connect: " + err.message); }
};
document.getElementById("drawerUsbBtn").onclick = async () => {
  if (!navigator.usb) return alert("Use Chrome or Edge for this.");
  try { await navigator.usb.requestDevice({ filters: [] }); state.settings.drawerType = "usb"; audit("drawer connected", "usb"); saveState(); renderDrawerSettings(); }
  catch (err) { if (err.name !== "NotFoundError") alert("Could not connect: " + err.message); }
};
document.getElementById("drawerHelperBtn").onclick = () => { state.settings.drawerType = "helper"; audit("drawer connected", "drawer helper"); saveState(); renderDrawerSettings(); };
document.getElementById("drawerDriverBtn").onclick = () => { state.settings.drawerType = "driver"; audit("drawer connected", "printer driver"); saveState(); renderDrawerSettings(); };
document.getElementById("drawerTestBtn").onclick = async () => { if (await openDrawer(true)) alert("Pulse sent. The drawer should have opened."); };
document.getElementById("drawerClearBtn").onclick = () => { state.settings.drawerType = ""; audit("drawer disconnected"); saveState(); renderDrawerSettings(); };

document.getElementById("saveSettingsBtn").onclick = () => {
  state.settings.storeName = document.getElementById("setStoreName").value.trim();
  state.settings.legalName = document.getElementById("setLegalName").value.trim();
  state.settings.addr1 = document.getElementById("setAddr1").value.trim();
  state.settings.addr2 = document.getElementById("setAddr2").value.trim();
  state.settings.phone = document.getElementById("setPhone").value.trim();
  state.settings.email = document.getElementById("setEmail").value.trim();
  state.settings.vatNo = document.getElementById("setVatNo").value.trim();
  state.settings.footer = document.getElementById("setFooter").value.trim();
  state.settings.registerId = document.getElementById("setRegisterId").value.trim();
  state.settings.vatPct = 10;
  audit("settings saved");
  saveState();
  renderSettingsForm();
  alert("Settings saved.");
};

els.modal.addEventListener("click", (e) => {
  if (e.target === els.modal) closeModal();
});


// ---------- Staff login ----------
let session = null;
function isManager() { return !!session && session.role === "manager"; }

function applyRole() {
  document.querySelectorAll("[data-role='manager']").forEach((b) => b.classList.toggle("hidden", !isManager()));
  els.cashierName.textContent = session ? session.name : "—";
  const active = document.querySelector(".view.active");
  if (active && !isManager() && ["view-inventory", "view-settings", "view-reports", "view-labels", "view-stock"].includes(active.id)) switchView("register");
}

function showLogin() {
  session = null;
  applyRole();
  const modal = document.getElementById("login");
  document.getElementById("loginUser").innerHTML = state.users.map((u) => `<option value="${esc(u.id)}">${esc(u.name)}</option>`).join("");
  document.getElementById("loginPin").value = "";
  showRecoverPanel(false);
  modal.classList.remove("hidden");
  document.getElementById("loginPin").focus();
}

function tryLogin() {
  if (folderStatus === "needs-permission" && !autoBackup.ready) reconnectFolder();
  const sec = state.security;
  if (Date.now() < sec.until) return alert(`Too many wrong PINs. Try again in ${Math.ceil((sec.until - Date.now()) / 1000)} seconds.`);
  const u = state.users.find((x) => x.id === document.getElementById("loginUser").value);
  const pin = document.getElementById("loginPin").value;
  if (!u || hashPin(pin, u.salt) !== u.hash) {
    sec.fails += 1;
    audit("login failed", u ? u.name : "unknown user");
    if (sec.fails >= 5) { sec.until = Date.now() + 5 * 60 * 1000; sec.fails = 0; audit("login locked", "5 wrong PINs, locked 5 minutes"); }
    saveState();
    alert(sec.until > Date.now() ? "Too many wrong PINs. Locked for 5 minutes." : "Wrong PIN.");
    document.getElementById("loginPin").value = "";
    return;
  }
  sec.fails = 0; sec.until = 0;
  session = u;
  lastActive = Date.now();
  document.getElementById("login").classList.add("hidden");
  applyRole();
  audit("login", u.name);
  if (u.role === "manager" && !state.recovery && u.hash !== hashPin("1234", u.salt)) setTimeout(() => { if (confirm("No recovery code is set. Without one, a forgotten manager PIN cannot be reset.\nCreate one now?")) createRecovery(); }, 100);
  if (u.hash === hashPin("1234", u.salt)) setTimeout(() => { alert("Set a new PIN now. The default PIN 1234 must be changed."); userForm(u, true); }, 50);
}

document.getElementById("loginBtn").onclick = tryLogin;
document.getElementById("loginPin").addEventListener("keydown", (e) => { if (e.key === "Enter") tryLogin(); });
// Single-user setup: no sign-out button needed.
document.getElementById("logoutBtn").classList.add("hidden");

// Signs in automatically as the (only) manager so the login screen never appears.
function autoSignIn() {
  const u = state.users.find((x) => x.role === "manager") || state.users[0];
  session = u;
  lastActive = Date.now();
  document.getElementById("login").classList.add("hidden");
  applyRole();
}

function renderUsers() {
  updateRecoveryStatus();
  const box = document.getElementById("usersList");
  if (!box) return;
  box.innerHTML = state.users.map((u) => `
    <div class="user-row"><span>${esc(u.name)} <em>(${esc(u.role)})</em></span>
    <span><button type="button" class="link-btn" data-edit-user="${esc(u.id)}">Edit</button></span></div>`).join("");
}

function userForm(user, force) {
  const u = user || { id: `u${Date.now()}`, name: "", pin: "", role: "cashier" };
  openModal(`
    <h3>${user ? "Edit Staff" : "New Staff"}</h3>
    <form class="stack-form" id="userForm">
      <label>Name<input name="name" value="${esc(u.name)}" required></label>
      <label>PIN (6 to 8 digits recommended, 4 minimum)<input name="pin" type="password" value="" inputmode="numeric" maxlength="8" ${user && !force ? "" : "required"} placeholder="${user && !force ? "leave blank to keep current" : ""}" autocomplete="new-password"></label>
      <label>Role<select name="role"><option value="cashier" ${u.role === "cashier" ? "selected" : ""}>Cashier</option><option value="manager" ${u.role === "manager" ? "selected" : ""}>Manager</option></select></label>
      <div class="modal-actions">
        ${user && !force ? '<button type="button" class="ghost danger" id="userDelete">Delete</button>' : ""}
        <button type="button" class="ghost" id="modalCancel">Cancel</button>
        <button class="primary" type="submit">Save</button>
      </div>
    </form>`);
  document.getElementById("modalCancel").onclick = closeModal;
  if (force) document.getElementById("modalCancel").classList.add("hidden");
  const managers = (list) => list.filter((x) => x.role === "manager").length;
  const del = document.getElementById("userDelete");
  if (del) del.onclick = () => {
    if (u.id === session.id) return alert("You can't delete the account you're signed in with.");
    if (u.role === "manager" && managers(state.users) < 2) return alert("Keep at least one manager.");
    if (!confirm(`Delete ${u.name}?`)) return;
    state.users = state.users.filter((x) => x.id !== u.id);
    audit("staff deleted", u.name);
    saveState(); closeModal(); renderUsers();
  };
  document.getElementById("userForm").onsubmit = (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const pinIn = String(fd.get("pin")).trim();
    const next = { id: u.id, name: String(fd.get("name")).trim(), role: String(fd.get("role")), salt: u.salt, hash: u.hash };
    if (pinIn || !user || force) {
      if (!/^\d{4,8}$/.test(pinIn)) return alert("PIN must be 4 to 8 digits.");
      if (isWeakPin(pinIn)) return alert("That PIN is too easy to guess. Avoid repeats and 1234-style runs.");
      next.salt = newSalt();
      next.hash = hashPin(pinIn, next.salt);
    }
    const others = state.users.filter((x) => x.id !== u.id);
    if (others.some((x) => x.name.toLowerCase() === next.name.toLowerCase())) return alert("That name is already used.");
    if (u.role === "manager" && next.role !== "manager" && managers(others) < 1) return alert("Keep at least one manager.");
    const idx = state.users.findIndex((x) => x.id === u.id);
    if (idx >= 0) state.users[idx] = next; else state.users.push(next);
    if (session && session.id === u.id) { session = next; applyRole(); }
    audit(user ? "staff edited" : "staff added", `${next.name} (${next.role})${pinIn ? ", PIN changed" : ""}`);
    saveState(); closeModal(); renderUsers();
    if (force) setTimeout(() => createRecovery(true), 150);
  };
}
document.getElementById("addUserBtn").onclick = () => userForm();
document.getElementById("usersList").addEventListener("click", (e) => {
  const id = e.target.closest("[data-edit-user]")?.dataset.editUser;
  if (id) userForm(state.users.find((x) => x.id === id));
});

// ---------- Void, receive stock ----------
document.getElementById("salesBody").addEventListener("click", (e) => {
  const no = e.target.closest("[data-void]")?.dataset.void;
  if (!no || !isManager()) return;
  const s = state.sales.find((x) => x.receiptNo === no);
  if (!s || s.voided) return;
  if (s.returns?.length) return alert("This sale already has returns, so it can't be voided.");
  const reason = prompt(`Void ${no} for $${money(s.total)}?\nThis returns the items to stock. Enter a reason:`);
  if (reason === null) return;
  s.items.forEach((line) => {
    const p = state.products.find((x) => x.sku === line.sku);
    if (p && !p.noTrack) p.stock = r3(p.stock + line.qty);
  });
  s.voided = true; s.voidReason = reason.trim(); s.voidedBy = session.name; s.voidedAt = new Date().toISOString();
  audit("void", `${no} $${money(s.total)} ${s.voidReason}`);
  saveState(); renderSales(); renderProducts();
});

document.getElementById("inventoryBody").addEventListener("click", (e) => {
  const sku = e.target.closest("[data-recv]")?.dataset.recv;
  if (!sku) return;
  const p = state.products.find((x) => x.sku === sku);
  const n = Number(prompt(`Receive stock for ${p.name}. Quantity to add (negative to remove):`));
  if (!p || !n) return;
  if (!p.unit && !Number.isInteger(n)) {
    const u = (prompt(`${p.name} is currently counted in whole units. To receive ${n}, type what it is sold by (ft, yd, m, lb, gal):`, "ft") || "").trim().slice(0, 8);
    if (!u) return;
    p.unit = u;
  }
  if (p.noTrack) {
    if (!confirm(`${p.name} is not tracked. Start tracking it with ${n} on hand?`)) return;
    p.noTrack = false; p.stock = 0;
  }
  if (p.stock + n < 0) return alert("Stock can't go below zero.");
  p.stock = r3(p.stock + n);
  audit("stock adjusted", `${p.sku} ${n > 0 ? "+" : ""}${n}`);
  saveState(); renderInventory(); renderProducts();
});

// ---------- End of day report ----------
function reportData(day) {
  const dayOf = (iso) => new Date(iso).toLocaleDateString("en-CA");
  const sales = state.sales.filter((s) => dayOf(s.at) === day);
  const refunds = [];
  state.sales.forEach((s) => {
    (s.returns || []).forEach((r) => { if (dayOf(r.at) === day) refunds.push({ ...r, pay: r.pay || splitRefund(s, r.refund) }); });
    if (s.voided && s.voidedAt && dayOf(s.voidedAt) === day) refunds.push({ isVoid: true, lines: s.items, exVat: netEx(s), vat: netVat(s), refund: s.total, pay: paymentsOf(s) });
  });
  const sum = (arr, k) => r2(arr.reduce((a, x) => a + x[k], 0));
  const rets = refunds.filter((r) => !r.isVoid), voids = refunds.filter((r) => r.isVoid);
  const layIn = (m) => state.layaways.flatMap((l) => l.payments.filter((p) => dayOf(p.at) === day && (!m || p.method === m)));
  const layOut = (m) => state.layaways.filter((l) => l.cancel && dayOf(l.cancel.at) === day).flatMap((l) => l.cancel.pay.filter((p) => !m || p.method === m));
  const payTot = (m) => r2(sales.reduce((a, s) => a + newPayOf(s, m), 0) + layIn(m).reduce((a, p) => a + p.amount, 0) - refunds.reduce((a, r) => a + r.pay.filter((p) => p.method === m).reduce((x, p) => x + p.amount, 0), 0) - layOut(m).reduce((a, p) => a + p.amount, 0));
  const payCnt = (m) => sales.filter((s) => newPayOf(s, m) > 0).length + layIn(m).length;
  const items = {};
  sales.forEach((s) => s.items.forEach((i) => { items[i.name] = (items[i.name] || 0) + i.qty; }));
  refunds.forEach((r) => r.lines.forEach((i) => { items[i.name] = (items[i.name] || 0) - i.qty; }));
  const top = Object.entries(items).filter(([, q]) => q > 0).sort((a, b) => b[1] - a[1]).slice(0, 5);
  return {
    count: sales.length,
    subtotal: r2(sales.reduce((a, x) => a + netEx(x), 0) - sum(refunds, "exVat")), vat: r2(sales.reduce((a, x) => a + netVat(x), 0) - sum(refunds, "vat")),
    discount: sum(sales, "discount"), total: r2(sum(sales, "total") - sum(refunds, "refund")),
    cashTotal: payTot("Cash"), cashCount: payCnt("Cash"),
    cardTotal: payTot("Card"), cardCount: payCnt("Card"),
    retCount: rets.length, retTotal: sum(rets, "refund"), voids: voids.length, voidTotal: sum(voids, "refund"), layInTotal: r2(layIn().reduce((a, p) => a + p.amount, 0)), layInCount: layIn().length, layOutTotal: r2(layOut().reduce((a, p) => a + p.amount, 0)), layOwing: r2(state.layaways.filter((l) => l.status === "open").reduce((a, l) => a + layBal(l), 0)), top
  };
}

function renderReport() {
  const input = document.getElementById("reportDate");
  if (!input.value) input.value = new Date().toLocaleDateString("en-CA");
  const d = reportData(input.value);
  const cell = (a, b) => `<div><span>${a}</span><strong>${b}</strong></div>`;
  document.getElementById("reportOut").innerHTML = `
    <div class="report-grid">
      ${cell("Sales", d.count)}${cell("Net sales ex VAT", "$" + money(d.subtotal))}${cell("Net VAT collected", "$" + money(d.vat))}
      ${cell("Discounts given (incl VAT)", "$" + money(d.discount))}${cell("Net total sales", "$" + money(d.total))}
      ${cell(`Cash expected (${d.cashCount} sales)`, "$" + money(d.cashTotal))}${cell(`Card (${d.cardCount})`, "$" + money(d.cardTotal))}
      ${cell(`Returns (${d.retCount})`, "-$" + money(d.retTotal))}${cell(`Voids (${d.voids})`, "-$" + money(d.voidTotal))}${cell(`Layaway payments in (${d.layInCount})`, "$" + money(d.layInTotal))}${cell("Layaway refunds", "-$" + money(d.layOutTotal))}${cell("Layaway still owing (all)", "$" + money(d.layOwing))}
    </div>
    <p class="hint">Totals are net of returns and voids made on this date. Cash and card include layaway payments taken that day, but layaway items count as sales only when completed.</p>
    <h3>Top items</h3>
    <ul>${d.top.map(([n, q]) => `<li>${esc(n)}: ${q}</li>`).join("") || "<li>No sales on this day.</li>"}</ul>`;
}

function printReport() {
  const day = document.getElementById("reportDate").value;
  const d = reportData(day);
  const row = (a, b) => `<div class="row"><span>${a}</span><span>${b}</span></div>`;
  els.printRoot.innerHTML = `<article class="receipt">
    <div class="center store">${esc(state.settings.storeName)}</div>
    <div class="center bold">END OF DAY REPORT</div>
    <div class="center">${esc(day)}</div>
    <div class="center tiny">Printed by ${esc(session ? session.name : "")} ${new Date().toLocaleString("en-BS")}</div>
    <hr class="dash" />
    ${row("Sales", d.count)}${row("Subtotal ex VAT", "$" + money(d.subtotal))}${row("VAT 10%", "$" + money(d.vat))}
    ${row("Discounts", "$" + money(d.discount))}${row("NET TOTAL SALES", "$" + money(d.total))}
    <hr class="dash" />
    ${row("Cash (" + d.cashCount + ")", "$" + money(d.cashTotal))}${row("Card (" + d.cardCount + ")", "$" + money(d.cardTotal))}
    ${row("Returns (" + d.retCount + ")", "-$" + money(d.retTotal))}${row("Voids (" + d.voids + ")", "-$" + money(d.voidTotal))}${row("Layaway in (" + d.layInCount + ")", "$" + money(d.layInTotal))}${row("Layaway refunds", "-$" + money(d.layOutTotal))}
    <hr class="dash" />
    <div class="bold">Top items</div>
    ${d.top.map(([n, q]) => row(esc(n), q)).join("")}
    <hr class="dash" /><div class="center tiny">Count the drawer and compare to Cash above.</div>
  </article>`;
  window.print();
}
document.getElementById("reportDate").onchange = renderReport;
document.getElementById("printReportBtn").onclick = printReport;

// ---------- Backup / export / import ----------
function download(name, text, type) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
const stamp = () => new Date().toLocaleDateString("en-CA");

document.getElementById("exportBackupBtn").onclick = () => {
  download(`pos-backup-${stamp()}.json`, JSON.stringify({
    products: state.products, customers: state.customers, sales: state.sales, holds: state.holds,
    settings: state.settings, seq: state.seq, users: state.users, audit: state.audit, recovery: state.recovery, quotes: state.quotes, quoteSeq: state.quoteSeq, shifts: state.shifts, counts: state.counts, receipts: state.receipts, layaways: state.layaways, layawaySeq: state.layawaySeq, layawayPolicy: state.layawayPolicy, bills: state.bills, billSeq: state.billSeq, vatFilings: state.vatFilings, lastBackupAt: Date.now()
  }, null, 2), "application/json");
  state.lastBackupAt = Date.now();
  audit("backup exported");
  updateBackupNote();
};

document.getElementById("exportSalesBtn").onclick = () => {
  const q = csvCell;
  const head = ["Receipt", "Date", "Cashier", "Customer", "BIN", "NetExVAT", "VAT", "Discount", "Total", "Tender", "Cash", "Card", "Status"];
  const rows = state.sales.map((s) => [s.receiptNo, s.at, s.cashier, s.customerName, s.bin, money(netEx(s)), money(netVat(s)), money(s.discount), money(s.total), s.tender, money(payOf(s, "Cash")), money(payOf(s, "Card")), s.voided ? "VOID" : "OK"].map(q).join(","));
  download(`sales-${stamp()}.csv`, [head.map(q).join(","), ...rows].join("\n"), "text/csv");
};

document.getElementById("exportItemsBtn").onclick = () => {
  const q = csvCell;
  const head = ["SKU", "Barcode", "Name", "Category", "OnHand", "Cost", "Price", "Track", "Alt", "Tax", "Unit", "ItemDescription"];
  const rows = state.products.map((p) => [p.sku, p.barcode, p.name, p.category, p.stock, money(p.cost), money(p.price), p.noTrack ? "no" : "yes", p.alt || "", "Tax", p.unit || "", p.desc || ""].map(q).join(","));
  download(`inventory-${stamp()}.csv`, [head.map(q).join(","), ...rows].join("\n"), "text/csv");
};

document.getElementById("importBackupInput").onchange = (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!Array.isArray(data.products) || !Array.isArray(data.sales) || !data.settings) throw new Error("not a POS backup");
      if (!confirm("Replace ALL current data with this backup?")) return;
      if (data.users && !data.users.every((u) => u && u.name && (u.hash || u.pin))) throw new Error("bad users");
      data.audit = (data.audit || []).concat({ at: new Date().toISOString(), user: session ? session.name : "-", action: "backup imported", detail: file.name });
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      location.reload();
    } catch (err) {
      alert("That file isn't a valid POS backup.");
    }
  };
  { const h0 = reader.onload; reader.onload = () => { try { h0(); } catch (err) { alert("Import failed: " + err.message + "\nNothing was changed."); console.error(err); } }; reader.readAsText(file); }
};

renderSettingsForm();
renderCategories();
renderProducts();
renderCart();
tickClock();
setInterval(tickClock, 1000);
// ---------- Audit log, idle sign-out, backup reminder ----------
const IDLE_MS = 10 * 60 * 1000;
let lastActive = Date.now();
function audit(action, detail = "") {
  state.audit.push({ at: new Date().toISOString(), user: session ? session.name : "-", action, detail });
  if (state.audit.length > 2000) state.audit.splice(0, state.audit.length - 2000);
  saveState();
}
function renderAudit() {
  const box = document.getElementById("auditList");
  if (!box) return;
  box.innerHTML = state.audit.slice(-40).reverse().map((a) =>
    `<div class="audit-row"><span>${esc(new Date(a.at).toLocaleString("en-BS"))}</span><span>${esc(a.user)}</span><span>${esc(a.action)}</span><span>${esc(a.detail)}</span></div>`).join("") || "<p class=\"hint\">Nothing logged yet.</p>";
}
["pointerdown", "keydown"].forEach((ev) => document.addEventListener(ev, () => { lastActive = Date.now(); }, true));
// Idle auto sign-out removed (single-user setup).

function updateBackupNote() {
  const el = document.getElementById("backupNote");
  if (!el) return;
  const age = Date.now() - state.lastBackupAt;
  el.textContent = !state.lastBackupAt ? "No backup yet" : age < 3600e3 ? "Backed up just now" : `Backed up ${Math.floor(age / 3600e3)} h ago`;
  el.classList.toggle("warn", !state.lastBackupAt || age > 24 * 3600e3);
}
updateBackupNote();
setInterval(updateBackupNote, 60000);
navigator.storage?.persist?.();

function csvCell(v) {
  let s = String(v ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return `"${s.replace(/"/g, '""')}"`;
}
function parseCSV(text) {
  const firstLine = text.split(/\r?\n/, 1)[0];
  const cnt = (ch) => firstLine.split(ch).length - 1;
  const delim = [",", ";", "\t"].sort((a, b) => cnt(b) - cnt(a))[0];
  const rows = [];
  let row = [], cur = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c;
    } else if (c === '"' && cur === "") q = true;
    else if (c === delim) { row.push(cur); cur = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cur); cur = "";
      if (row.some((x) => x.trim() !== "")) rows.push(row);
      row = [];
    } else cur += c;
  }
  row.push(cur);
  if (row.some((x) => x.trim() !== "")) rows.push(row);
  return rows;
}

// ---------- Inventory CSV import ----------
document.getElementById("importItemsInput").onchange = (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file || !isManager()) return;
  const reader = new FileReader();
  reader.onload = () => {
    const rows = parseCSV(String(reader.result).replace(/^\uFEFF/, ""));
    if (rows.length < 2) return alert("No data rows found.");
    const head = rows[0].map((h) => h.trim().toLowerCase().replace(/[^a-z]/g, ""));
    const col = (...n) => head.findIndex((h) => n.includes(h));
    const ci = { sku: col("sku", "itemnumber", "itemcode", "code"), barcode: col("barcode", "upc", "ean"), name: col("name", "itemname", "description", "item"),
      category: col("category", "departmentname", "dept", "department"), stock: col("onhand", "stock", "qty", "qty1", "quantity"), cost: col("cost", "averageunitcost"), price: col("price", "regularprice", "sellprice", "retail"),
      unit: col("unit", "uom", "soldby", "baseunitofmeasure"), desc: col("itemdescription", "longdescription", "desc"), alt: col("alt", "alu", "altcode", "alternate", "alternatelookup", "altlookup"), tax: col("tax", "taxcode", "taxable"), track: col("track", "trackstock", "tracked") };
    if (ci.sku < 0 || ci.name < 0 || ci.price < 0) return alert("The first row must be headers including SKU, Name and Price. Optional: Barcode, Category, OnHand, Cost.");
    const good = new Map(), bad = [];
    rows.slice(1).forEach((r, n) => {
      const get = (k) => String(r[ci[k]] ?? "").trim();
      const num = (k) => Number(get(k).replace(/[$,]/g, "") || 0);
      const p = { sku: get("sku"), name: get("name"), price: num("price") };
      if (ci.barcode >= 0) p.barcode = get("barcode");
      if (ci.category >= 0) p.category = get("category") || "General";
      if (ci.stock >= 0) p.stock = Math.max(0, ci.unit >= 0 && get("unit") ? r3(num("stock")) : Math.round(num("stock")));
      if (ci.unit >= 0) p.unit = get("unit");
      if (ci.desc >= 0) p.desc = get("desc");
      if (ci.cost >= 0) p.cost = num("cost");
      if (ci.alt >= 0) p.alt = get("alt");
      p.exempt = false; // every item carries VAT
      if (ci.track >= 0) p.noTrack = /^(no|n|false|0)$/i.test(get("track"));
      const nums = [p.price, p.stock ?? 0, p.cost ?? 0];
      if (!p.sku || !p.name || nums.some((x) => !Number.isFinite(x) || x < 0) || (!(ci.unit >= 0 && get("unit")) && !Number.isInteger(p.stock ?? 0))) bad.push(n + 2);
      else good.set(p.sku, p);
    });
    if (!good.size) return alert("No valid rows to import.");
    const have = new Set(state.products.map((p) => p.sku));
    const adds = [...good.keys()].filter((s) => !have.has(s)).length;
    if (!confirm(`Import ${good.size} items (${adds} new, ${good.size - adds} updated)?${bad.length ? `\n${bad.length} bad rows skipped (rows ${bad.slice(0, 10).join(", ")}).` : ""}`)) return;
    if (have.size > 100 && adds > have.size * 0.25 && !confirm(`Warning: ${adds} of these items are NEW, but you already have ${have.size} items. If you meant to update existing items, the SKU column in this file does not match your current SKUs (for example an ST prefix, or leading zeros lost in Excel). Importing would create duplicates with 0 stock.\n\nOK = import anyway. Cancel = stop.`)) return;
    const wipe = confirm("Also DELETE every item that is not in this file?\nOK = delete the others (use this to clear the sample items).\nCancel = keep them.");
    const merged = wipe ? [] : state.products.map((p) => ({ ...p }));
    good.forEach((p) => {
      const i = merged.findIndex((x) => x.sku === p.sku);
      if (i >= 0) merged[i] = { ...merged[i], ...p };
      else merged.push({ barcode: "", category: "General", stock: 0, cost: 0, ...p });
    });
    const seen = new Map();
    for (const p of merged) {
      if (!p.barcode) continue;
      if (seen.has(p.barcode)) return alert(`Barcode ${p.barcode} is on both ${seen.get(p.barcode)} and ${p.sku}. Fix the file and try again. Nothing was changed.`);
      seen.set(p.barcode, p.sku);
    }
    state.products = merged;
    audit("inventory import", `${good.size} items, ${wipe ? "others deleted" : "others kept"}`);
    renderCategories(); renderProducts(); renderInventory();
  };
  { const h0 = reader.onload; reader.onload = () => { try { h0(); } catch (err) { alert("Import failed: " + err.message + "\nNothing was changed."); console.error(err); } }; reader.readAsText(file); }
};

// ---------- Partial returns ----------
function returnedQty(sale, sku) {
  return (sale.returns || []).reduce((n, r) => n + r.lines.filter((l) => l.sku === sku).reduce((a, l) => a + l.qty, 0), 0);
}
function refundFor(sale, picks) {
  const priorEx = r2((sale.returns || []).reduce((a, r) => a + r.exVat, 0));
  const priorVat = r2((sale.returns || []).reduce((a, r) => a + r.vat, 0));
  const priorRef = r2((sale.returns || []).reduce((a, r) => a + r.refund, 0));
  const finishes = sale.items.every((i) => returnedQty(sale, i.sku) + (picks.find((p) => p.line.sku === i.sku)?.qty || 0) >= i.qty);
  if (finishes) return { exVat: r2(netEx(sale) - priorEx), vat: r2(netVat(sale) - priorVat), refund: r2(sale.total - priorRef) };
  const gross = sale.subtotal + sale.vat;
  const ratio = gross > 0 ? sale.total / gross : 1;
  let ex = 0, vat = 0, inc = 0;
  picks.forEach(({ line, qty }) => { const a = lineAmounts({ price: line.price, qty, exempt: line.exempt }); ex += a.exVat; vat += a.vat; inc += a.incVat; });
  return { exVat: r2(ex * ratio), vat: r2(vat * ratio), refund: Math.min(r2(inc * ratio), r2(sale.total - priorRef)) };
}
function returnForm(sale) {
  const lines = sale.items.map((i) => ({ ...i, left: r3(i.qty - returnedQty(sale, i.sku)) })).filter((i) => i.left > 0);
  if (!lines.length) return alert("Everything on this sale has already been returned.");
  openModal(`
    <h3>Return items from ${esc(sale.receiptNo)}</h3>
    <form class="stack-form" id="retForm">
      ${lines.map((l, i) => `<label>${esc(l.name)} (sold ${l.qty}, can return ${r3(l.left)})<input type="number" name="q${i}" min="0" max="${l.left}" step="${l.unit || !Number.isInteger(l.qty) ? "any" : "1"}" value="0"></label>`).join("")}
      <label>Reason<input name="reason" required></label>
      <div class="change-due" id="retPreview">Refund $0.00</div>
      <p class="hint">Refund goes back the way it was paid (${esc(describePay(sale))}). Items return to stock.</p>
      <div class="modal-actions">
        <button type="button" class="ghost" id="modalCancel">Cancel</button>
        <button class="primary" type="submit">Refund</button>
      </div>
    </form>`);
  document.getElementById("modalCancel").onclick = closeModal;
  const form = document.getElementById("retForm");
  const picks = () => lines.map((l, i) => ({ line: l, qty: Math.min(l.left, Math.max(0, (l.unit || !Number.isInteger(l.qty)) ? r3(Number(form.elements["q" + i].value) || 0) : Math.floor(Number(form.elements["q" + i].value) || 0))) })).filter((p) => p.qty > 0);
  form.addEventListener("input", () => { document.getElementById("retPreview").textContent = `Refund $${money(picks().length ? refundFor(sale, picks()).refund : 0)}`; });
  form.onsubmit = (e) => {
    e.preventDefault();
    const pk = picks();
    if (!pk.length) return alert("Enter a quantity to return.");
    const ref = refundFor(sale, pk);
    const ret = { id: `R${Date.now()}`, at: new Date().toISOString(), by: session.name, reason: String(form.elements.reason.value).trim(),
      lines: pk.map((p) => ({ sku: p.line.sku, name: p.line.name, price: p.line.price, qty: p.qty, exempt: !!p.line.exempt })), ...ref, pay: splitRefund(sale, ref.refund) };
    (sale.returns = sale.returns || []).push(ret);
    ret.lines.forEach((l) => { const p = state.products.find((x) => x.sku === l.sku); if (p && !p.noTrack) p.stock = r3(p.stock + l.qty); });
    audit("return", `${sale.receiptNo} refund $${money(ref.refund)} ${ret.reason}`);
    saveState(); closeModal(); renderSales(); renderProducts();
    els.printRoot.innerHTML = refundReceiptHTML(sale, ret);
    window.print();
  };
}
function refundReceiptHTML(sale, ret) {
  const row = (a, b) => `<div class="row"><span>${a}</span><span>${b}</span></div>`;
  const st = sale.store;
  return `<article class="receipt">
    <div class="center store">${esc(st.storeName)}</div>
    <div class="center">${esc(st.addr1)}</div><div class="center">${esc(st.addr2)}</div><div class="center">${esc(st.phone)}</div>
    ${st.vatNo ? `<div class="center tiny">VAT Reg. No. ${esc(st.vatNo)}</div>` : ""}
    <hr class="dash" />
    <div class="center bold">REFUND / CREDIT NOTE</div>
    ${row("Original receipt", esc(sale.receiptNo))}${row("Refund date", esc(new Date(ret.at).toLocaleString("en-BS")))}
    ${row("Processed by", esc(ret.by))}${row("Customer", esc(sale.customerName))}
    <hr class="dash" />
    ${ret.lines.map((l) => row(`${l.qty} x ${esc(l.name)}`, "$" + money(lineAmounts({ qty: l.qty, price: l.price, exempt: l.exempt }).incVat))).join("")}
    <hr class="dash" />
    ${row("Refund ex VAT", "$" + money(ret.exVat))}${row("VAT refunded", "$" + money(ret.vat))}
    <div class="row bold"><span>REFUND TOTAL BSD</span><span>$${money(ret.refund)}</span></div>
    ${(ret.pay || splitRefund(sale, ret.refund)).map((p) => row("Refund via " + esc(p.method), "$" + money(p.amount))).join("")}
    <div class="tiny">Reason: ${esc(ret.reason)}</div>
    <div class="tiny">Customer signature: ______________________</div>
  </article>`;
}
document.getElementById("salesBody").addEventListener("click", (e) => {
  const no = e.target.closest("[data-return]")?.dataset.return;
  if (!no || !isManager()) return;
  const s = state.sales.find((x) => x.receiptNo === no);
  if (s && !s.voided) returnForm(s);
});

// ---------- Barcode labels ----------
const C128 = ["212222","222122","222221","121223","121322","131222","122213","122312","132212","221213","221312","231212","112232","122132","122231","113222","123122","123221","223211","221132","221231","213212","223112","312131","311222","321122","321221","312212","322112","322211","212123","212321","232121","111323","131123","131321","112313","132113","132311","211313","231113","231311","112133","112331","132131","113123","113321","133121","313121","211331","231131","213113","213311","213131","311123","311321","331121","312113","312311","332111","314111","221411","431111","111224","111422","121124","121421","141122","141221","112214","112412","122114","122411","142112","142211","241211","221114","413111","241112","134111","111242","121142","121241","114212","124112","124211","411212","421112","421211","212141","214121","412121","111143","111341","131141","114113","114311","411113","411311","113141","114131","311141","411131","211412","211214","211232","2331112"];
function code128SVG(text) {
  const vals = [104];
  let sum = 104, pos = 0;
  for (const ch of String(text)) {
    const v = ch.charCodeAt(0) - 32;
    if (v < 0 || v > 94) continue;
    pos++; vals.push(v); sum += v * pos;
  }
  vals.push(sum % 103, 106);
  let x = 10, bars = "";
  vals.forEach((v) => {
    const pat = C128[v];
    for (let i = 0; i < pat.length; i++) {
      const w = Number(pat[i]);
      if (i % 2 === 0) bars += `<rect x="${x}" y="0" width="${w}" height="40"/>`;
      x += w;
    }
  });
  return `<svg class="bars" viewBox="0 0 ${x + 10} 40" preserveAspectRatio="none" shape-rendering="crispEdges" fill="#000">${bars}</svg>`;
}
const labelSel = new Map();
function renderLabels() {
  const q = document.getElementById("labelSearch").value.trim().toLowerCase();
  const all = state.products.filter((p) => tokensMatch(productText(p), q));
  const rows = all.slice(0, 250);
  document.getElementById("labelsBody").innerHTML = rows.map((p) => `<tr>
    <td><input type="checkbox" data-lsel="${esc(p.sku)}" ${labelSel.has(p.sku) ? "checked" : ""}></td>
    <td>${esc(p.sku)}</td><td>${esc(p.name)}</td><td>${esc(p.barcode || p.sku)}</td><td>$${money(p.price)}</td>
    <td><input class="copies" type="number" min="1" max="99" value="${labelSel.get(p.sku) || 1}" data-lcopies="${esc(p.sku)}"></td></tr>`).join("");
}
document.getElementById("labelsBody").addEventListener("change", (e) => {
  const t = e.target;
  const copies = (sku) => Math.min(99, Math.max(1, Math.floor(Number(document.querySelector(`[data-lcopies="${CSS.escape(sku)}"]`).value) || 1)));
  if (t.dataset.lsel) { if (t.checked) labelSel.set(t.dataset.lsel, copies(t.dataset.lsel)); else labelSel.delete(t.dataset.lsel); }
  if (t.dataset.lcopies && labelSel.has(t.dataset.lcopies)) labelSel.set(t.dataset.lcopies, copies(t.dataset.lcopies));
});
document.getElementById("labelSearch").oninput = renderLabels;
document.getElementById("labelAllBtn").onclick = () => {
  const q = document.getElementById("labelSearch").value.trim().toLowerCase();
  state.products.filter((p) => tokensMatch(productText(p), q)).slice(0, 500).forEach((p) => labelSel.set(p.sku, 1));
  renderLabels();
};
document.getElementById("labelClearBtn").onclick = () => { labelSel.clear(); renderLabels(); };
document.getElementById("labelStockBtn").onclick = () => {
  labelSel.forEach((_, sku) => { const p = state.products.find((x) => x.sku === sku); if (p) labelSel.set(sku, Math.min(99, Math.max(1, p.stock))); });
  renderLabels();
};
document.getElementById("printLabelsBtn").onclick = () => {
  const items = [...labelSel].map(([sku, n]) => ({ p: state.products.find((x) => x.sku === sku), n })).filter((x) => x.p);
  if (!items.length) return alert("Tick at least one item.");
  const sheet = document.getElementById("labelLayout").value === "sheet";
  const incl = document.getElementById("labelVat").checked;
  const html = items.map(({ p, n }) => {
    const price = incl ? lineAmounts({ qty: 1, price: p.price, exempt: p.exempt }).incVat : p.price;
    return `<div class="label"><div class="l-store">${esc(state.settings.storeName)}</div><div class="l-name">${esc(p.name)}</div>
      <div class="l-price">$${money(price)} <small>${incl ? "incl. VAT" : "+ VAT"}</small></div>${code128SVG(p.barcode || p.sku)}<div class="l-code">${esc(p.barcode || p.sku)}</div></div>`.repeat(n);
  }).join("");
  els.printRoot.innerHTML = `<div class="labels ${sheet ? "sheet" : "roll"}">${html}</div>`;
  document.getElementById("pageStyle").textContent = sheet ? "@page{size:letter;margin:.3in}" : "@page{size:3in auto;margin:.12in}";
  document.documentElement.classList.toggle("sheet-print", sheet);
  audit("labels printed", `${items.reduce((a, x) => a + x.n, 0)} labels`);
  window.print();
};
window.addEventListener("afterprint", () => { document.documentElement.classList.remove("sheet-print"); document.getElementById("pageStyle").textContent = ""; });

// ---------- Data folder on this PC (File System Access API) ----------
const FOLDER_FILE = "pos-data.json";
const KEEP_BACKUPS = 60;

function idbOpen() {
  return new Promise((res, rej) => {
    const r = indexedDB.open("posFolder", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("h");
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function idbGet(k) {
  const db = await idbOpen();
  return new Promise((res, rej) => { const q = db.transaction("h").objectStore("h").get(k); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
}
async function idbSet(k, v) {
  const db = await idbOpen();
  return new Promise((res, rej) => { const tx = db.transaction("h", "readwrite"); tx.objectStore("h").put(v, k); tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
}
async function idbDel(k) {
  const db = await idbOpen();
  return new Promise((res, rej) => { const tx = db.transaction("h", "readwrite"); tx.objectStore("h").delete(k); tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
}

function updateFolderNote() {
  updateFolder2Note();
  const labels = {
    unsupported: "Folder saving needs Chrome or Edge",
    none: "No PC data folder set",
    "needs-permission": "Click to reconnect data folder",
    error: "Folder save FAILED. Click for details",
    ready: dirHandle ? `Saving to folder: ${dirHandle.name}` : ""
  };
  const btn = document.getElementById("folderBtn");
  if (btn) { btn.textContent = labels[folderStatus]; btn.classList.toggle("warn", folderStatus !== "ready"); }
  if (autoBackup.ready) {
    const b1 = document.getElementById("folderBtn"), b2 = document.getElementById("folder2Btn");
    if (b1) { b1.textContent = autoBackup.failed ? "Auto-backup FAILED. Click for details" : `Auto-backup ON: ${autoBackup.folders[0] || ""}`; b1.classList.toggle("warn", !!autoBackup.failed); }
    if (b2) { b2.textContent = autoBackup.failed ? "" : `Backup copy: ${autoBackup.folders[1] || ""}`; b2.classList.remove("warn"); }
  }
  const t = document.getElementById("folderStatusText");
  if (t) t.textContent = folderStatus === "ready" ? `Connected: ${dirHandle.name}. Data saves to ${FOLDER_FILE}, with a dated copy each day in a "backups" folder.`
    : (folderError || labels[folderStatus]);
}

function scheduleFileWrite() {
  if (autoBackup.ready) scheduleAutoBackup();
  if (!folderChecked || !((dirHandle && folderStatus === "ready") || (dirHandle2 && folder2Status === "ready"))) return;
  clearTimeout(writeTimer);
  writeTimer = setTimeout(writeFolder, 400);
}
async function writeFile(dir, name, text) {
  const fh = await dir.getFileHandle(name, { create: true });
  const w = await fh.createWritable();
  await w.write(text);
  await w.close();
}
async function writeFolder() {
  await writePrimary();
  await writeSecondary();
}
async function writePrimary() {
  if (!dirHandle || folderStatus !== "ready" || !folderChecked) return;
  try {
    const json = JSON.stringify(snapshotState(), null, 1);
    await writeFile(dirHandle, FOLDER_FILE, json);
    const day = new Date().toLocaleDateString("en-CA");
    if (lastFolderBackupDay !== day) {
      lastFolderBackupDay = day;
      const bdir = await dirHandle.getDirectoryHandle("backups", { create: true });
      await writeFile(bdir, `pos-backup-${day}.json`, json);
      const names = [];
      for await (const [n] of bdir.entries()) if (/^pos-backup-.*\.json$/.test(n)) names.push(n);
      names.sort();
      for (const n of names.slice(0, Math.max(0, names.length - KEEP_BACKUPS))) await bdir.removeEntry(n);
      state.lastBackupAt = Date.now();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshotState()));
      updateBackupNote();
    }
    folderError = "";
  } catch (err) {
    folderStatus = "error";
    folderError = `Could not write to the data folder (${err.name}). Check the folder still exists and the disk isn't full, then reconnect.`;
    console.warn(err);
  }
  updateFolderNote();
}

async function readFolderData() {
  try {
    const fh = await dirHandle.getFileHandle(FOLDER_FILE);
    const text = await (await fh.getFile()).text();
    const data = JSON.parse(text);
    if (!Array.isArray(data.products) || !Array.isArray(data.sales) || !data.settings) return null;
    return { text, data };
  } catch (err) {
    return null;
  }
}
async function loadFromFolder(text) {
  localStorage.setItem(STORAGE_KEY, text);
  location.reload();
}
async function checkFolderNewer() {
  const f = await readFolderData();
  if (f) {
    const local = startupCheckPending ? bootSavedAt : (JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}").savedAt || 0);
    if ((f.data.savedAt || 0) > local + 2000) {
      const when = new Date(f.data.savedAt).toLocaleString("en-BS");
      if (confirm(`The data folder has newer data (saved ${when}, ${f.data.sales.length} sales) than this browser.

OK = load the folder's data.
Cancel = keep this browser's data and overwrite the folder.`)) return loadFromFolder(f.text);
      try {
        const bdir = await dirHandle.getDirectoryHandle("backups", { create: true });
        await writeFile(bdir, `pos-before-overwrite-${Date.now()}.json`, f.text);
      } catch (err) { console.warn(err); }
    }
  }
  folderChecked = true;
  startupCheckPending = false;
  writeFolder();
}

async function initFolder() {
  if (!window.showDirectoryPicker) { folderStatus = "unsupported"; updateFolderNote(); return; }
  try {
    const h = await idbGet("dir");
    if (h) {
      dirHandle = h;
      const perm = await h.queryPermission({ mode: "readwrite" });
      folderStatus = perm === "granted" ? "ready" : "needs-permission";
      if (folderStatus === "ready") await checkFolderNewer();
    }
  } catch (err) { console.warn(err); }
  updateFolderNote();
}
async function reconnectFolder() {
  try {
    if (!dirHandle) return connectFolder();
    const perm = await dirHandle.requestPermission({ mode: "readwrite" });
    folderStatus = perm === "granted" ? "ready" : "needs-permission";
    folderError = "";
    updateFolderNote();
    if (folderStatus === "ready") await checkFolderNewer();
  } catch (err) { console.warn(err); }
}
async function connectFolder() {
  if (!window.showDirectoryPicker) return alert("Saving to a PC folder needs Google Chrome or Microsoft Edge.");
  try {
    const h = await window.showDirectoryPicker({ mode: "readwrite", id: "pos-data" });
    dirHandle = h;
    folderStatus = "ready";
    folderError = "";
    const f = await readFolderData();
    if (f) {
      const when = new Date(f.data.savedAt || 0).toLocaleString("en-BS");
      if (confirm(`This folder already has POS data (saved ${when}, ${f.data.sales.length} sales).\n\nOK = load it and replace this browser's data.\nCancel = keep this browser's data.`)) {
        await idbSet("dir", h);
        return loadFromFolder(f.text);
      }
      if (!confirm("Overwrite the data in that folder with this browser's data?")) { dirHandle = null; folderStatus = "none"; updateFolderNote(); return; }
    }
    await idbSet("dir", h);
    folderChecked = true;
    startupCheckPending = false;
    audit("data folder connected", h.name);
    await writeFolder();
  } catch (err) {
    if (err.name !== "AbortError") alert(`Could not use that folder: ${err.message}`);
  }
  updateFolderNote();
}

document.getElementById("folderBtn").onclick = () => {
  if (autoBackup.ready) return alert(autoBackup.failed ? autoBackup.failed : `Automatic backup is ON.\n\nEvery change is saved to:\n${autoBackup.folders.join("\n")}\n\n(Folders are listed in backup-folders.txt.)`);
  if (folderStatus === "error") alert(folderError);
  if (folderStatus === "needs-permission" || folderStatus === "error") reconnectFolder();
  else if (folderStatus === "none") { if (isManager()) connectFolder(); else alert("Ask a manager to set the data folder in Settings."); }
};
document.getElementById("chooseFolderBtn").onclick = connectFolder;
document.getElementById("saveNowBtn").onclick = async () => {
  if (folderStatus !== "ready") return alert("Connect a data folder first.");
  lastFolderBackupDay = "";
  lastFolder2Day = "";
  await writeFolder();
  alert(folderStatus === "ready" ? "Saved." : folderError);
};
document.getElementById("disconnectFolderBtn").onclick = async () => {
  if (!dirHandle || !confirm("Stop saving to the data folder? Files already there stay.")) return;
  await idbDel("dir");
  audit("data folder disconnected", dirHandle.name);
  dirHandle = null; folderStatus = "none"; folderError = "";
  updateFolderNote();
};
window.addEventListener("beforeunload", () => { if (writeTimer) { clearTimeout(writeTimer); writeFolder(); } });
// ---------- Mandatory second backup folder ----------
// A second copy of every save (plus a dated copy each day) goes to a different folder, ideally a USB stick or another drive.
async function sameOrNested(a, b) {
  try {
    if (await a.isSameEntry(b)) return true;
    if (await a.resolve(b)) return true;
    if (await b.resolve(a)) return true;
  } catch (e) { /* treat as different */ }
  return false;
}

function updateFolder2Note() {
  const labels = {
    unsupported: "Backup folder needs Chrome or Edge",
    none: "NO BACKUP FOLDER SET",
    "needs-permission": "Click to reconnect backup folder",
    error: "Backup folder save FAILED. Click for details",
    ready: dirHandle2 ? `Backup copy: ${dirHandle2.name}` : ""
  };
  const btn = document.getElementById("folder2Btn");
  if (btn) { btn.textContent = labels[folder2Status]; btn.classList.toggle("warn", folder2Status !== "ready"); }
  const t = document.getElementById("folder2StatusText");
  if (t) t.textContent = folder2Status === "ready" ? `Connected: ${dirHandle2.name}. Every save is copied here, with a dated copy each day in a "backups" folder.`
    : (folder2Error || labels[folder2Status]);
}

async function writeSecondary() {
  if (!dirHandle2 || folder2Status !== "ready" || !folderChecked) return;
  try {
    const json = JSON.stringify(snapshotState(), null, 1);
    await writeFile(dirHandle2, FOLDER_FILE, json);
    const day = new Date().toLocaleDateString("en-CA");
    if (lastFolder2Day !== day) {
      lastFolder2Day = day;
      const bdir = await dirHandle2.getDirectoryHandle("backups", { create: true });
      await writeFile(bdir, `pos-backup-${day}.json`, json);
      const names = [];
      for await (const [n] of bdir.entries()) if (/^pos-backup-.*\.json$/.test(n)) names.push(n);
      names.sort();
      for (const n of names.slice(0, Math.max(0, names.length - KEEP_BACKUPS))) await bdir.removeEntry(n);
    }
    folder2Error = "";
  } catch (err) {
    folder2Status = "error";
    folder2Error = `Could not write to the backup folder (${err.name}). Is the USB stick or drive plugged in and not full? Reconnect it, then click here.`;
    console.warn(err);
  }
  updateFolder2Note();
}

async function initFolder2() {
  if (!window.showDirectoryPicker) { folder2Status = "unsupported"; updateFolder2Note(); return; }
  try {
    const h = await idbGet("dir2");
    if (h) {
      dirHandle2 = h;
      const perm = await h.queryPermission({ mode: "readwrite" });
      folder2Status = perm === "granted" ? "ready" : "needs-permission";
      if (folder2Status === "ready") await writeSecondary();
    }
  } catch (err) { console.warn(err); }
  updateFolder2Note();
}

async function reconnectFolder2() {
  try {
    if (!dirHandle2) return connectFolder2();
    const perm = await dirHandle2.requestPermission({ mode: "readwrite" });
    folder2Status = perm === "granted" ? "ready" : "needs-permission";
    folder2Error = "";
    updateFolder2Note();
    if (folder2Status === "ready") { lastFolder2Day = ""; await writeSecondary(); }
  } catch (err) { console.warn(err); }
  updateFolder2Note();
}

async function connectFolder2() {
  if (!window.showDirectoryPicker) return alert("Saving to a PC folder needs Google Chrome or Microsoft Edge.");
  if (!dirHandle || folderStatus !== "ready") return alert("Connect the main data folder first, then choose the backup folder.");
  try {
    const h = await window.showDirectoryPicker({ mode: "readwrite", id: "pos-backup" });
    if (await sameOrNested(dirHandle, h)) return alert("The backup folder must be a different folder from the main data folder, and not inside it. Choose a USB stick, another drive, or a synced cloud folder.");
    let old = null;
    try { const fh = await h.getFileHandle(FOLDER_FILE); old = await (await fh.getFile()).text(); } catch (e) { /* empty folder */ }
    if (old) {
      let when = "";
      try { const d = JSON.parse(old); when = ` (saved ${new Date(d.savedAt || 0).toLocaleString("en-BS")}, ${(d.sales || []).length} sales)`; } catch (e) { /* not json */ }
      if (!confirm(`That folder already has POS data${when}.\n\nOK = keep a copy of it in a "backups" folder there, then use the folder for backups.\nCancel = choose a different folder.`)) return;
      const bdir = await h.getDirectoryHandle("backups", { create: true });
      await writeFile(bdir, `pos-before-overwrite-${Date.now()}.json`, old);
    }
    dirHandle2 = h;
    folder2Status = "ready";
    folder2Error = "";
    await idbSet("dir2", h);
    lastFolder2Day = "";
    audit("backup folder connected", h.name);
    await writeSecondary();
  } catch (err) {
    if (err.name !== "AbortError") alert(`Could not use that folder: ${err.message}`);
  }
  updateFolder2Note();
}

function managerPinOk(pin) {
  return state.users.some((u) => u.role === "manager" && u.hash && hashPin(String(pin), u.salt) === u.hash);
}

// Blocks the app on start until BOTH folders are connected. A manager PIN can skip it for this session only (it is logged and asked again next start).
async function enforceBackupGate() {
  if (!window.showDirectoryPicker && !autoBackup.ready) return;
  let gate = document.getElementById("backupGate");
  const ok = autoBackup.ready || (folderStatus === "ready" && folder2Status === "ready");
  if (ok || gateSkipped) { if (gate) gate.remove(); return; }
  if (!gate) {
    gate = document.createElement("div");
    gate.id = "backupGate";
    gate.style.cssText = "position:fixed;inset:0;z-index:99999;background:rgba(15,23,42,.96);display:flex;align-items:center;justify-content:center;padding:20px;font-family:inherit";
    document.body.appendChild(gate);
  }
  const step = (n, title, st, hint, btn) => `<div style="border:1px solid #cbd5e1;border-radius:10px;padding:12px 14px;margin:10px 0;background:#fff;color:#0f172a">
      <div style="font-weight:700">${n}. ${title} ${st === "ready" ? "<span style='color:#15803d'>✓ connected</span>" : "<span style='color:#b91c1c'>✗ not connected</span>"}</div>
      <div style="font-size:13px;margin:4px 0 8px;color:#475569">${hint}</div>${btn}</div>`;
  const b1 = folderStatus === "ready" ? "" : `<button type="button" class="primary" id="gateBtn1">${folderStatus === "needs-permission" ? "Reconnect data folder" : "Choose data folder"}</button>`;
  const b2 = folder2Status === "ready" ? "" : `<button type="button" class="primary" id="gateBtn2" ${folderStatus === "ready" ? "" : "disabled"}>${folder2Status === "needs-permission" ? "Reconnect backup folder" : "Choose backup folder"}</button>`;
  gate.innerHTML = `<div style="max-width:520px;width:100%;background:#f8fafc;border-radius:14px;padding:22px;color:#0f172a">
    <h2 style="margin:0 0 6px">Backups must be connected before you start</h2>
    <p style="margin:0 0 6px;font-size:14px;color:#334155">The POS keeps two copies of your data so one broken or lost computer never loses the store's records.</p>
    ${autoBackup.message ? `<p style="margin:8px 0;padding:8px 10px;border-radius:8px;background:#fef3c7;color:#78350f;font-size:13px"><b>Why automatic backup is not running:</b> ${esc(autoBackup.message)}<br>Fix it once (run <b>Set Backup Folders.bat</b>) and this screen goes away by itself on every start. It keeps checking, so you do not need to restart.</p>` : ""}
    ${step(1, "Main data folder", folderStatus, "A folder on this PC, for example C:\\POS-Data.", b1)}
    ${step(2, "Backup folder", folder2Status, "A DIFFERENT place: a USB stick, another drive, or a OneDrive/Google Drive folder. Plug it in first.", b2)}
    <p style="margin:14px 0 0;font-size:12px"><button type="button" class="link-btn" id="gateSkip" style="color:#475569;text-decoration:underline">Backup drive not available? Manager PIN to continue without it this time</button></p>
  </div>`;
  const rerun = async () => { await enforceBackupGate(); };
  const g1 = document.getElementById("gateBtn1"), g2 = document.getElementById("gateBtn2");
  if (g1) g1.onclick = async () => { await (folderStatus === "needs-permission" ? reconnectFolder() : connectFolder()); await rerun(); };
  if (g2) g2.onclick = async () => { await (folder2Status === "needs-permission" ? reconnectFolder2() : connectFolder2()); await rerun(); };
  document.getElementById("gateSkip").onclick = () => {
    const pin = prompt("Manager PIN to continue WITHOUT the backup folder (it will be asked again next time the POS starts):");
    if (pin === null) return;
    if (!managerPinOk(pin)) return alert("Wrong PIN.");
    gateSkipped = true;
    audit("backup folder requirement skipped", "manager override at start");
    enforceBackupGate();
  };
}

document.getElementById("folder2Btn").onclick = () => {
  if (folder2Status === "error") alert(folder2Error);
  if (folder2Status === "needs-permission" || folder2Status === "error") reconnectFolder2();
  else if (folder2Status === "none") { if (isManager()) connectFolder2(); else alert("Ask a manager to set the backup folder in Settings."); }
};
document.getElementById("chooseFolder2Btn").onclick = connectFolder2;

// ---------- Automatic backup through the PC helper (no clicking, no folder permission prompts) ----------
// The helper (drawer-helper.ps1, started by Start POS.bat) writes the data to the folders listed in backup-folders.txt.
const HELPER_URL = "http://127.0.0.1:9101";
async function helperStatus(timeoutMs) {
  const ctl = new AbortController();
  const to = setTimeout(() => ctl.abort(), timeoutMs || 2500);
  try {
    const r = await fetch(HELPER_URL + "/backup-status", { signal: ctl.signal });
    return await r.json();
  } finally { clearTimeout(to); }
}
// Start POS.bat starts the helper and the browser at almost the same moment, so the helper can need a few seconds.
// Ask a few times before deciding it is not there, and keep asking in the background afterwards.
async function initAutoBackup() {
  let j = null;
  for (let i = 0; i < 8; i++) {
    try { j = await helperStatus(2000); } catch (err) { j = null; }
    if (j && j.ready) break;
    if (j && j.message && i >= 1) break; // the helper is running but its folders are wrong: waiting will not fix that
    await new Promise((res) => setTimeout(res, 1500));
  }
  if (j && j.ready) await activateAutoBackup(j);
  else {
    autoBackup.ready = false;
    autoBackup.message = j ? (j.message || "The backup folders are not ready.") : "The backup helper is not running (Start POS.bat starts it).";
    watchForAutoBackup();
  }
  updateFolderNote();
}
async function activateAutoBackup(j) {
  autoBackup.ready = true;
  autoBackup.message = "";
  autoBackup.folders = j.folders || [];
    // Same safety check as the folder picker: if the saved copy is newer than this browser's data, offer to load it.
    if (!(dirHandle && folderStatus === "ready")) {
      try {
        const lr = await fetch(HELPER_URL + "/latest");
        if (lr.ok) {
          const text = await lr.text();
          const data = JSON.parse(text);
          if (Array.isArray(data.products) && Array.isArray(data.sales) && data.settings && (data.savedAt || 0) > bootSavedAt + 2000) {
            const when = new Date(data.savedAt).toLocaleString("en-BS");
            if (confirm(`The backup folder has newer data (saved ${when}, ${data.sales.length} sales) than this browser.\n\nOK = load the backup folder's data.\nCancel = keep this browser's data and overwrite the backup.`)) return loadFromFolder(text);
          }
        }
      } catch (err) { console.warn(err); }
      folderChecked = true;
      startupCheckPending = false;
    }
  scheduleAutoBackup(true);
  updateFolderNote();
}
// Not ready at start (helper slow, USB stick not plugged in yet, folder file just edited): check again every 10 seconds,
// and the moment it works, switch to automatic backup and drop the reconnect screen without anyone clicking.
function watchForAutoBackup() {
  if (autoBackup.watching) return;
  autoBackup.watching = setInterval(async () => {
    try {
      const j = await helperStatus(2000);
      if (j && j.ready) {
        clearInterval(autoBackup.watching); autoBackup.watching = null;
        await activateAutoBackup(j);
        folderChecked = true; startupCheckPending = false;
        enforceBackupGate();
      } else if (j && j.message) { autoBackup.message = j.message; }
    } catch (err) { /* helper still not running */ }
  }, 10000);
}
function scheduleAutoBackup(now) {
  clearTimeout(autoBackup.timer);
  autoBackup.timer = setTimeout(sendAutoBackup, now ? 50 : 1500);
}
async function sendAutoBackup() {
  if (!autoBackup.ready) return;
  try {
    const day = new Date().toLocaleDateString("en-CA");
    const r = await fetch(`${HELPER_URL}/backup?day=${day}`, { method: "POST", body: JSON.stringify(snapshotState()) });
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || "unknown error");
    autoBackup.failed = "";
    state.lastBackupAt = Date.now();
    updateBackupNote();
  } catch (err) {
    autoBackup.failed = "Automatic backup could not save: " + err.message + "\n\nCheck that the backup drive/USB stick is plugged in and not full. It will retry on the next sale.";
    console.warn(err);
  }
  updateFolderNote();
}
window.addEventListener("beforeunload", () => { if (autoBackup.ready && autoBackup.timer) { try { navigator.sendBeacon(`${HELPER_URL}/backup?day=${new Date().toLocaleDateString("en-CA")}`, JSON.stringify(snapshotState())); } catch (e) {} } });

initFolder().then(initFolder2).then(initAutoBackup).then(enforceBackupGate);

// ---------- Customer CSV import / export ----------
document.getElementById("importCustInput").onchange = (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file || !isManager()) return;
  const reader = new FileReader();
  reader.onload = () => {
    const rows = parseCSV(String(reader.result).replace(/^\uFEFF/, ""));
    if (rows.length < 2) return alert("No data rows found.");
    const head = rows[0].map((h) => h.trim().toLowerCase().replace(/[^a-z]/g, ""));
    const col = (...n) => head.findIndex((h) => n.includes(h));
    const ci = { name: col("name", "customer", "customername", "fullname"), phone: col("phone", "mobile", "tel", "telephone", "cell"),
      bin: col("bin", "bahamasidentificationnumber", "bahamasid"), notes: col("notes", "note", "comments"), email: col("email"), address: col("address") };
    if (ci.name < 0) return alert("The first row must be headers including Name. Optional: Phone, BIN, Notes, Email, Address.");
    const get = (r, k) => (ci[k] >= 0 ? String(r[ci[k]] ?? "").trim() : "");
    const digits = (s) => s.replace(/\D/g, "");
    const merged = state.customers.map((c) => ({ ...c }));
    let added = 0, updated = 0;
    const bad = [];
    rows.slice(1).forEach((r, n) => {
      const name = get(r, "name");
      const bin = digits(get(r, "bin"));
      if (!name || (bin && bin.length !== 10)) return bad.push(n + 2);
      const extra = [get(r, "notes"), get(r, "email") && `Email: ${get(r, "email")}`, get(r, "address") && `Address: ${get(r, "address")}`].filter(Boolean).join("; ");
      const phone = get(r, "phone");
      const idx = merged.findIndex((c) => (bin && c.bin === bin) || (!bin && c.name.toLowerCase() === name.toLowerCase() && digits(c.phone || "") === digits(phone)));
      if (idx >= 0) {
        const c = merged[idx];
        merged[idx] = { ...c, name, phone: phone || c.phone, bin: bin || c.bin, notes: extra || c.notes };
        updated++;
      } else {
        merged.push({ id: `c${Date.now()}${merged.length}`, name, phone, bin, notes: extra });
        added++;
      }
    });
    if (!added && !updated) return alert("No valid rows to import.");
    if (!confirm(`Import customers: ${added} new, ${updated} updated.${bad.length ? `\n${bad.length} rows skipped (missing name or BIN not 10 digits): rows ${bad.slice(0, 10).join(", ")}.` : ""}`)) return;
    state.customers = merged;
    audit("customer import", `${added} new, ${updated} updated`);
    renderCustomers();
  };
  { const h0 = reader.onload; reader.onload = () => { try { h0(); } catch (err) { alert("Import failed: " + err.message + "\nNothing was changed."); console.error(err); } }; reader.readAsText(file); }
};
document.getElementById("exportCustBtn").onclick = () => {
  const head = ["Name", "Phone", "BIN", "Notes"];
  const rows = state.customers.map((c) => [c.name, c.phone, c.bin, c.notes].map(csvCell).join(","));
  download(`customers-${stamp()}.csv`, [head.map(csvCell).join(","), ...rows].join("\n"), "text/csv");
  audit("customers exported");
};

// ---------- Load starter list button ----------
// ---------- Clean up ST- duplicate items ----------
function stDuplicates() {
  const norm = (x) => String(x || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  const bySku = new Map(state.products.map((p) => [String(p.sku).toLowerCase(), p]));
  const byName = new Map();
  state.products.forEach((p) => { if (!ST_RE.test(p.sku)) { const k = norm(p.name); if (k && !byName.has(k)) byName.set(k, p); } });
  return state.products.filter((p) => ST_RE.test(String(p.sku).trim())).map((p) => {
    const rest = String(p.sku).trim().match(ST_RE)[1];
    const keep = bySku.get(rest.toLowerCase()) || bySku.get(rest.replace(/^0+/, "").toLowerCase()) || byName.get(norm(p.name)) || null;
    return { p, keep };
  });
}
document.getElementById("stCleanBtn").onclick = () => {
  if (!isManager()) return;
  const rows = stDuplicates();
  if (!rows.length) return alert("No items with an ST- item number were found.");
  openModal(`<h3>ST- duplicate items</h3>
    <p class="hint">Found ${rows.length} item(s) whose number starts with ST. Ticked ones have a matching regular item and no stock, so they are safe to remove. Past sales keep their own item names and are not affected. A backup file downloads first.</p>
    <div class="table-wrap" style="max-height:50vh;overflow:auto"><table class="data-table"><thead><tr><th></th><th>ST item</th><th>On hand</th><th>Matches</th></tr></thead><tbody>
    ${rows.map((r, i) => { const ok = r.keep && !(r.p.stock > 0); return `<tr><td><input type="checkbox" data-st="${i}" ${ok ? "checked" : ""}></td><td>${esc(r.p.sku)} &middot; ${esc(r.p.name)}</td><td class="${r.p.stock > 0 ? "low" : ""}">${r.p.noTrack ? "not tracked" : esc(r.p.stock)}</td><td>${r.keep ? esc(r.keep.sku) + " &middot; " + esc(r.keep.name) + (r.keep.noTrack ? "" : " (" + esc(r.keep.stock) + " on hand)") : "No match found"}</td></tr>`; }).join("")}
    </tbody></table></div>
    <div class="modal-actions"><button type="button" class="ghost" id="stCancel">Cancel</button><button type="button" class="primary" id="stGo">Remove ticked items</button></div>`);
  document.getElementById("stCancel").onclick = closeModal;
  document.getElementById("stGo").onclick = () => {
    const pick = [...document.querySelectorAll("[data-st]")].filter((c) => c.checked).map((c) => rows[Number(c.dataset.st)].p);
    if (!pick.length) return alert("Nothing is ticked.");
    if (pick.some((p) => p.stock > 0) && !confirm("Some ticked items still show stock on hand. Remove them anyway?")) return;
    document.getElementById("exportBackupBtn").click();
    const gone = new Set(pick.map((p) => p.sku));
    state.products = state.products.filter((p) => !gone.has(p.sku));
    audit("ST duplicates removed", `${pick.length} items: ${pick.slice(0, 20).map((p) => p.sku).join(", ")}${pick.length > 20 ? "..." : ""}`);
    saveState(); closeModal(); renderCategories(); renderProducts(); renderInventory();
    alert(`Removed ${pick.length} item(s).`);
  };
};

document.getElementById("loadSeedBtn").onclick = () => {
  const seed = window.SEED_PRODUCTS || [];
  if (!isManager() || !seed.length) return;
  const have = new Set(state.products.map((p) => p.sku));
  const fresh = seed.filter((p) => !have.has(p.sku)).map((p) => ({ ...p, exempt: false }));
  if (!confirm(`Add ${fresh.length} items from the Longleys item list? Items you already have (same SKU) are left alone.`)) return;
  let wipe = false;
  if (state.products.some((p) => !seed.some((x) => x.sku === p.sku)) && confirm("Also delete items that are not in this list (for example the sample items)?\nOK = delete them. Cancel = keep them.")) wipe = true;
  if (wipe) state.products = state.products.filter((p) => seed.some((x) => x.sku === p.sku));
  fresh.forEach((p) => state.products.push({ ...p }));
  audit("starter list loaded", `${fresh.length} added${wipe ? ", others deleted" : ""}`);
  renderCategories(); renderProducts(); renderInventory();
};
document.getElementById("resetItemsBtn").onclick = () => {
  const seed = window.SEED_PRODUCTS || [];
  if (!isManager() || !seed.length) return;
  if (!confirm(`REPLACE ALL ITEMS with the Longleys item list (${seed.length} items)?\n\nThis deletes every item you have now, including items you added, price changes and current stock counts. Stock goes back to the list's starting numbers. Sales history, customers and staff are kept.\n\nA backup file downloads first.`)) return;
  if ((prompt('Type RESET to confirm:') || "").trim().toUpperCase() !== "RESET") return alert("Cancelled. Nothing was changed.");
  document.getElementById("exportBackupBtn").click();
  const before = state.products.length;
  state.products = seed.map((p) => ({ ...p, exempt: false }));
  cart.items = [];
  audit("items replaced with Longleys item list", `${before} items replaced by ${seed.length}`);
  saveState(); renderCategories(); renderProducts(); renderInventory(); renderCart();
  alert(`Done. ${seed.length} items loaded.`);
};
// ---------- Recovery code ----------
const REC_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function makeRecoveryCode() {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  const ch = Array.from(a, (b) => REC_ALPHABET[b % 32]);
  return [0, 4, 8, 12].map((i) => ch.slice(i, i + 4).join("")).join("-");
}
const normCode = (v) => String(v).toUpperCase().replace(/[^A-Z0-9]/g, "");
function updateRecoveryStatus() {
  const el = document.getElementById("recoveryStatus");
  if (!el) return;
  el.textContent = state.recovery ? `Recovery code set on ${new Date(state.recovery.at).toLocaleDateString("en-BS")}.` : "NO recovery code set. Create one so a forgotten manager PIN can be reset.";
  el.classList.toggle("warn-text", !state.recovery);
}
function createRecovery(first) {
  if (!isManager()) return;
  if (!first && state.recovery && !confirm("Replace the current recovery code? The old one will stop working.")) return;
  const code = makeRecoveryCode();
  openModal(`
    <h3>Your recovery code</h3>
    <p class="hint">Write this down now and keep it somewhere safe, away from the counter. It is shown only once. Anyone with this code can reset a manager PIN.</p>
    <div class="recovery-code" id="recCodeShown">${esc(code)}</div>
    <div class="modal-actions">
      <button type="button" class="ghost" id="recPrint">Print</button>
      <button type="button" class="primary" id="recSaved">I have saved it</button>
    </div>`);
  document.getElementById("recPrint").onclick = () => {
    els.printRoot.innerHTML = `<article class="receipt"><div class="center store">${esc(state.settings.storeName)}</div><div class="center bold">POS RECOVERY CODE</div><div class="center bold">${esc(code)}</div><div class="center tiny">Keep safe. Lets a manager reset a forgotten PIN.</div></article>`;
    window.print();
  };
  document.getElementById("recSaved").onclick = () => {
    const salt = newSalt();
    state.recovery = { salt, hash: hashPin(normCode(code), salt), at: new Date().toISOString() };
    audit("recovery code created");
    closeModal();
    updateRecoveryStatus();
  };
}
document.getElementById("recoveryBtn").onclick = () => createRecovery();

function showRecoverPanel(on) {
  document.getElementById("loginPanel").classList.toggle("hidden", on);
  document.getElementById("recoverPanel").classList.toggle("hidden", !on);
  document.getElementById("loginTitle").textContent = on ? "Reset manager PIN" : "Sign in";
  if (on) {
    document.getElementById("recUser").innerHTML = state.users.filter((u) => u.role === "manager").map((u) => `<option value="${esc(u.id)}">${esc(u.name)}</option>`).join("");
    ["recCode", "recPin", "recPin2"].forEach((id) => { document.getElementById(id).value = ""; });
  }
}
document.getElementById("forgotBtn").onclick = () => {
  if (!state.recovery) return alert("No recovery code was ever created on this computer, so the PIN can't be reset from here.");
  showRecoverPanel(true);
};
document.getElementById("recBack").onclick = () => showRecoverPanel(false);
document.getElementById("recGo").onclick = () => {
  const sec = state.security;
  if (Date.now() < sec.until) return alert(`Too many wrong attempts. Try again in ${Math.ceil((sec.until - Date.now()) / 1000)} seconds.`);
  const u = state.users.find((x) => x.id === document.getElementById("recUser").value);
  const code = normCode(document.getElementById("recCode").value);
  const p1 = document.getElementById("recPin").value, p2 = document.getElementById("recPin2").value;
  if (!u || !state.recovery || hashPin(code, state.recovery.salt) !== state.recovery.hash) {
    sec.fails += 1;
    audit("recovery failed", u ? u.name : "");
    if (sec.fails >= 5) { sec.until = Date.now() + 5 * 60 * 1000; sec.fails = 0; audit("login locked", "5 wrong recovery attempts"); }
    saveState();
    return alert(sec.until > Date.now() ? "Too many wrong attempts. Locked for 5 minutes." : "That recovery code is not right.");
  }
  if (p1 !== p2) return alert("The two PINs don't match.");
  if (!/^\d{4,8}$/.test(p1)) return alert("PIN must be 4 to 8 digits.");
  if (isWeakPin(p1)) return alert("That PIN is too easy to guess.");
  u.salt = newSalt();
  u.hash = hashPin(p1, u.salt);
  sec.fails = 0; sec.until = 0;
  session = u;
  lastActive = Date.now();
  document.getElementById("login").classList.add("hidden");
  showRecoverPanel(false);
  applyRole();
  audit("PIN reset by recovery code", u.name);
  setTimeout(() => { alert("PIN changed. Now save a NEW recovery code."); createRecovery(true); }, 100);
};
document.getElementById("loginPin").maxLength = 8;
document.getElementById("loadCustSeedBtn").onclick = () => {
  const seed = window.SEED_CUSTOMERS || [];
  if (!isManager() || !seed.length) return;
  const digits = (v) => String(v || "").replace(/\D/g, "");
  const key = (c) => `${c.name.toLowerCase()}|${digits(c.phone)}`;
  const have = new Set(state.customers.map(key));
  const fresh = seed.filter((c) => !have.has(key(c)));
  if (!confirm(`Add ${fresh.length} customers from the QuickBooks list? Customers already here (same name and phone) are left alone.`)) return;
  fresh.forEach((c, i) => state.customers.push({ id: `q${Date.now()}${i}`, name: c.name, phone: c.phone, bin: c.bin, notes: c.notes }));
  audit("customer list loaded", `${fresh.length} added`);
  renderCustomers();
};
// ---------- Quotes ----------
const todayStr = () => new Date().toLocaleDateString("en-CA");
function addDays(n) { const d = new Date(); d.setDate(d.getDate() + n); return d.toLocaleDateString("en-CA"); }
function quoteStatus(q) { return q.status === "open" && q.validUntil < todayStr() ? "expired" : q.status; }

function quoteForm() {
  if (!cart.items.length) return alert("Add the items to the sale first, then click Quote.");
  const cust = state.customers.find((x) => x.id === cart.customerId) || {};
  const walkin = cart.customerId === "c1";
  const t = cartTotals();
  openModal(`
    <h3>Save quote</h3>
    <form class="stack-form" id="quoteForm">
      <label>Quote for<input name="who" value="${esc(walkin ? "" : cust.name || "")}" placeholder="Customer or company name"></label>
      <label>Phone<input name="phone" value="${esc(walkin ? "" : cust.phone || "")}"></label>
      <label>Valid for (days)<input name="days" type="number" min="1" max="365" step="1" value="14" required></label>
      <label>Notes on the quote<textarea name="notes" rows="3" placeholder="Job name, delivery, special terms"></textarea></label>
      <div class="change-due">Quote total $${money(t.total)}</div>
      <p class="hint">Stock is not held for a quote. Prices are honored only until the valid-until date.</p>
      <div class="modal-actions">
        <button type="button" class="ghost" id="modalCancel">Cancel</button>
        <button class="primary" type="submit">Save and print</button>
      </div>
    </form>`);
  document.getElementById("modalCancel").onclick = closeModal;
  document.getElementById("quoteForm").onsubmit = (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const days = Math.min(365, Math.max(1, Math.floor(Number(fd.get("days")) || 14)));
    const st = state.settings;
    const q = {
      no: `Q-${state.quoteSeq}`, at: new Date().toISOString(), by: session ? session.name : "",
      who: String(fd.get("who")).trim(), phone: String(fd.get("phone")).trim(), bin: walkin ? "" : (cust.bin || ""),
      customerId: cart.customerId, validUntil: addDays(days), notes: String(fd.get("notes")).trim(),
      items: cart.items.map((i) => ({ ...i })), subtotal: t.subtotal, vat: t.vat, discount: t.discount, total: t.total,
      status: "open", store: { storeName: st.storeName, legalName: st.legalName, addr1: st.addr1, addr2: st.addr2, phone: st.phone, email: st.email, vatNo: st.vatNo }
    };
    state.quoteSeq += 1;
    state.quotes.push(q);
    audit("quote saved", `${q.no} $${money(q.total)}`);
    resetCart();
    saveState();
    closeModal();
    renderCart();
    printQuote(q, false);
  };
}

function quoteHTML(q) {
  const st = q.store || state.settings;
  const rows = q.items.map((i) => {
    const a = lineAmounts(i);
    return `<tr><td>${esc(i.sku)}</td><td>${esc(i.name)}${i.exempt ? " <em>(VAT exempt)</em>" : ""}${i.desc ? `<div class="q-desc">${esc(i.desc)}</div>` : ""}</td><td class="num">${esc(i.qty)}${i.unit ? " " + esc(i.unit) : ""}</td><td class="num">$${money(i.price)}</td><td class="num">$${money(a.vat)}</td><td class="num">$${money(a.incVat)}</td></tr>`;
  }).join("");
  return `<article class="quote-doc">
    <div class="q-head">
      <div><strong class="q-store">${esc(st.storeName)}</strong>
        <div>${esc(st.legalName)}</div><div>${esc(st.addr1)}${st.addr2 ? ", " + esc(st.addr2) : ""}</div>
        <div>${esc(st.phone)}${st.email ? " &middot; " + esc(st.email) : ""}</div>
        ${st.vatNo ? `<div>VAT Reg. No. ${esc(st.vatNo)}</div>` : ""}</div>
      <div class="q-title"><h1>QUOTE</h1><div><strong>${esc(q.no)}</strong></div>
        <div>Date: ${esc(new Date(q.at).toLocaleDateString("en-BS"))}</div><div>Valid until: <strong>${esc(q.validUntil)}</strong></div></div>
    </div>
    <div class="q-cust"><strong>Prepared for:</strong> ${esc(q.who || "—")}${q.phone ? " &middot; " + esc(q.phone) : ""}${q.bin ? " &middot; BIN " + esc(q.bin) : ""}</div>
    <table><thead><tr><th>Item</th><th>Description</th><th class="num">Qty</th><th class="num">Unit price</th><th class="num">VAT</th><th class="num">Amount</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="q-tot">
      <div><span>Subtotal (ex VAT)</span><span>$${money(q.subtotal)}</span></div>
      <div><span>Bahamas VAT 10%</span><span>$${money(q.vat)}</span></div>
      ${q.discount ? `<div><span>Discount</span><span>-$${money(q.discount)}</span></div><div><span>VAT included after discount</span><span>$${money(netVat(q))}</span></div>` : ""}
      <div class="grand"><span>TOTAL BSD</span><span>$${money(q.total)}</span></div>
    </div>
    ${q.notes ? `<div class="q-notes"><strong>Notes:</strong> ${esc(q.notes).replace(/\n/g, "<br>")}</div>` : ""}
    <div class="q-terms">This is a quote, not a tax invoice. Prices are valid until ${esc(q.validUntil)} and may change after that. Stock is not reserved until the sale is paid. Prepared by ${esc(q.by)}.</div>
    <div class="q-sign"><div>Accepted by (name and signature)</div><div>Date</div></div>
  </article>`;
}
function quoteReceiptHTML(q) {
  const st = q.store || state.settings;
  const row = (a, b) => `<div class="row"><span>${a}</span><span>${b}</span></div>`;
  return `<article class="receipt">
    <div class="center store">${esc(st.storeName)}</div><div class="center">${esc(st.addr1)}</div><div class="center">${esc(st.phone)}</div>
    <hr class="dash" /><div class="center bold">QUOTE ${esc(q.no)}</div>
    ${row("Date", esc(new Date(q.at).toLocaleDateString("en-BS")))}${row("Valid until", esc(q.validUntil))}${row("For", esc(q.who || "—"))}
    <hr class="dash" />
    ${q.items.map((i) => { const a = lineAmounts(i); return row(`${esc(i.qty)}${i.unit ? " " + esc(i.unit) : ""} x ${esc(i.name)}`, "$" + money(a.incVat)) + `<div class="tiny">${esc(i.sku)} @ $${money(i.price)} ${i.exempt ? "VAT exempt" : "+ VAT $" + money(a.vat)}</div>`; }).join("")}
    <hr class="dash" />
    ${row("Subtotal ex VAT", "$" + money(q.subtotal))}${row("VAT 10%", "$" + money(q.vat))}${q.discount ? row("Discount", "-$" + money(q.discount)) + row("VAT in total after discount", "$" + money(netVat(q))) : ""}
    <div class="row bold"><span>TOTAL BSD</span><span>$${money(q.total)}</span></div>
    ${q.notes ? `<div class="tiny">${esc(q.notes)}</div>` : ""}
    <div class="tiny">Quote only, not a tax invoice. Valid until ${esc(q.validUntil)}. Stock not reserved.</div>
  </article>`;
}
function printQuote(q, thermal) {
  els.printRoot.innerHTML = thermal ? quoteReceiptHTML(q) : quoteHTML(q);
  document.getElementById("pageStyle").textContent = thermal ? "" : "@page{size:letter;margin:.5in}";
  document.documentElement.classList.toggle("sheet-print", !thermal);
  audit("quote printed", q.no);
  window.print();
}

function renderQuotes() {
  const q = document.getElementById("quoteSearch").value.trim();
  const f = document.getElementById("quoteFilter").value;
  const all = state.quotes.slice().reverse().filter((x) => tokensMatch(`${x.no} ${x.who} ${x.phone} ${x.by} ${x.receiptNo || ""}`, q) && (f === "all" || quoteStatus(x) === f));
  document.getElementById("quotesBody").innerHTML = all.slice(0, 200).map((x) => {
    const stt = quoteStatus(x);
    return `<tr class="${stt === "declined" ? "void-row" : ""}">
      <td>${esc(x.no)}</td><td>${esc(new Date(x.at).toLocaleDateString("en-BS"))}</td><td>${esc(x.who || "—")}</td>
      <td>$${money(x.total)}</td><td>${esc(x.validUntil)}</td>
      <td><strong>${esc(stt)}</strong>${x.receiptNo ? " " + esc(x.receiptNo) : ""}</td>
      <td><button type="button" class="link-btn" data-qprint="${esc(x.no)}">Print</button>
        <button type="button" class="link-btn" data-qthermal="${esc(x.no)}">Receipt</button>
        ${stt === "open" || stt === "expired" ? `<button type="button" class="link-btn" data-qsell="${esc(x.no)}">Sell</button> <button type="button" class="link-btn" data-qdecline="${esc(x.no)}">Decline</button>` : ""}
        ${isManager() ? `<button type="button" class="link-btn danger" data-qdelete="${esc(x.no)}">Delete</button>` : ""}</td></tr>`;
  }).join("") || `<tr><td colspan="7" class="more-note">No quotes yet. Build the items on the Register, then click Quote.</td></tr>`;
}
function sellQuote(q) {
  if (cart.items.length) return alert("Finish, hold or clear the current sale first.");
  if (q.status === "converted") return alert(`Already sold on receipt ${q.receiptNo}.`);
  if (quoteStatus(q) === "expired" && !confirm(`This quote expired on ${q.validUntil}. Sell at the quoted prices anyway?`)) return;
  cart.items = q.items.map((i) => ({ ...i, exempt: false }));
  cart.discount = q.discount || 0;
  cart.discountPct = null;
  setDiscountMode("$");
  cart.customerId = state.customers.some((x) => x.id === q.customerId) ? q.customerId : "c1";
  cart.quoteNo = q.no;
  els.customerBin.value = q.bin || "";
  els.discountInput.value = q.discount || "";
  audit("quote loaded to register", q.no);
  switchView("register");
  renderCart();
}
document.getElementById("quoteBtn").onclick = quoteForm;
document.getElementById("quoteSearch").oninput = renderQuotes;
document.getElementById("quoteFilter").onchange = renderQuotes;
document.getElementById("quotesBody").addEventListener("click", (e) => {
  const t = e.target.closest("button");
  if (!t) return;
  const no = t.dataset.qprint || t.dataset.qthermal || t.dataset.qsell || t.dataset.qdecline || t.dataset.qdelete;
  const q = state.quotes.find((x) => x.no === no);
  if (!q) return;
  if (t.dataset.qprint) printQuote(q, false);
  else if (t.dataset.qthermal) printQuote(q, true);
  else if (t.dataset.qsell) sellQuote(q);
  else if (t.dataset.qdecline) { if (confirm(`Mark ${no} as declined?`)) { q.status = "declined"; audit("quote declined", no); saveState(); renderQuotes(); } }
  else if (t.dataset.qdelete && isManager() && confirm(`Delete ${no}? This cannot be undone.`)) {
    state.quotes = state.quotes.filter((x) => x.no !== no); audit("quote deleted", no); saveState(); renderQuotes();
  }
});
// ---------- Payments helpers ----------
function paymentsOf(sale) {
  return sale.payments?.length ? sale.payments : [{ method: sale.tender === "Cash" ? "Cash" : "Card", amount: sale.total }];
}
function newPayOf(sale, m) { return r2(paymentsOf(sale).filter((p) => p.method === m && !p.earlier).reduce((a, p) => a + p.amount, 0)); }
function payOf(sale, m) { return r2(paymentsOf(sale).filter((p) => p.method === m).reduce((a, p) => a + p.amount, 0)); }
function splitRefund(sale, amount) {
  const pays = paymentsOf(sale);
  const total = pays.reduce((a, p) => a + p.amount, 0) || 1;
  let left = r2(amount);
  return pays.map((p, i) => {
    const a = i === pays.length - 1 ? left : r2(amount * p.amount / total);
    left = r2(left - a);
    return { method: p.method, amount: a };
  });
}
function describePay(sale) {
  const p = paymentsOf(sale);
  return p.length > 1 ? p.map((x) => `${x.method} $${money(x.amount)}`).join(" + ") : p[0].method;
}
function payRowsHTML(sale) {
  const row = (a, b) => `<div class="row"><span>${a}</span><span>${b}</span></div>`;
  const p = paymentsOf(sale);
  if (p.length === 1 && !p[0].earlier) return row("Tender", esc(p[0].method)) + row("Amount tendered", "$" + money(sale.tendered)) + row("Change", "$" + money(sale.change));
  let out = p.map((x) => row(x.earlier ? `Layaway ${esc(x.method)}` : esc(x.method), "$" + money(x.amount))).join("");
  const cash = p.find((x) => x.tendered !== undefined);
  if (cash) out += row("Cash tendered", "$" + money(cash.tendered)) + row("Change", "$" + money(cash.change));
  return out;
}

// ---------- Cash drawer ----------
function currentShift() { return state.shifts.find((x) => !x.closedAt); }
function cashNet(from, to) {
  const inR = (iso) => iso >= from && iso <= to;
  let sum = 0;
  state.sales.forEach((sl) => {
    if (inR(sl.at)) sum += newPayOf(sl, "Cash");
    (sl.returns || []).forEach((r) => { if (inR(r.at)) sum -= (r.pay || splitRefund(sl, r.refund)).filter((p) => p.method === "Cash").reduce((a, p) => a + p.amount, 0); });
    if (sl.voided && sl.voidedAt && inR(sl.voidedAt)) sum -= payOf(sl, "Cash");
  });
  state.layaways.forEach((l) => {
    l.payments.forEach((p) => { if (p.method === "Cash" && inR(p.at)) sum += p.amount; });
    if (l.cancel && inR(l.cancel.at)) sum -= l.cancel.pay.filter((p) => p.method === "Cash").reduce((a, p) => a + p.amount, 0);
  });
  return r2(sum);
}
function shiftSummary(sh) {
  const sales = cashNet(sh.openedAt, sh.closedAt || new Date().toISOString());
  const inn = r2(sh.moves.filter((m) => m.amount > 0).reduce((a, m) => a + m.amount, 0));
  const out = r2(-sh.moves.filter((m) => m.amount < 0).reduce((a, m) => a + m.amount, 0));
  return { sales, inn, out, expected: r2(sh.float + sales + inn - out) };
}
function updateDrawerNote() {
  const b = document.getElementById("drawerBtn");
  if (!b) return;
  const sh = currentShift();
  b.textContent = sh ? `Drawer open since ${new Date(sh.openedAt).toLocaleTimeString("en-BS", { hour: "2-digit", minute: "2-digit" })}` : "Drawer CLOSED. Click to open";
  b.classList.toggle("warn", !sh);
}
function renderDrawer() {
  const box = document.getElementById("drawerPanel");
  const sh = currentShift();
  const fmt = (iso) => new Date(iso).toLocaleString("en-BS");
  const cell = (a, b) => `<div><span>${a}</span><strong>${b}</strong></div>`;
  let html;
  if (!sh) {
    html = `<h3>The drawer is closed</h3><p class="hint">Count the cash in the drawer and enter it as the starting float. Sales are blocked until the drawer is open.</p>
      <div class="toolbar"><input id="drawerFloat" type="number" min="0" step="0.01" placeholder="Starting float, e.g. 100.00" /><button id="openDrawerBtn" class="primary" type="button">Open drawer</button></div>`;
  } else {
    const x = shiftSummary(sh);
    html = `<h3>Drawer open since ${esc(fmt(sh.openedAt))} (${esc(sh.openedBy)})</h3>
      <div class="report-grid">${cell("Starting float", "$" + money(sh.float))}${cell("Cash sales (net of refunds)", "$" + money(x.sales))}${cell("Paid in", "$" + money(x.inn))}${cell("Paid out", "-$" + money(x.out))}${cell("Expected in drawer", "$" + money(x.expected))}</div>
      <div class="toolbar"><button id="moveBtn" class="ghost" type="button">Paid in / Paid out</button>${isManager() ? '<button id="noSaleBtn" class="ghost" type="button">No sale / open drawer</button>' : ""}<button id="closeDrawerBtn" class="primary" type="button">Close drawer</button></div>
      ${sh.moves.length ? `<ul>${sh.moves.map((m) => `<li>${esc(new Date(m.at).toLocaleTimeString("en-BS"))} ${m.amount > 0 ? "Paid in" : "Paid out"} $${money(Math.abs(m.amount))}: ${esc(m.reason)} (${esc(m.by)})</li>`).join("")}</ul>` : ""}`;
  }
  const closed = state.shifts.filter((x) => x.closedAt).slice(-15).reverse();
  if (isManager() && closed.length) {
    html += `<h3>Recent drawer counts</h3><div class="table-wrap"><table class="data-table"><thead><tr><th>Opened</th><th>Closed</th><th>By</th><th>Expected</th><th>Counted</th><th>Over / short</th><th></th></tr></thead><tbody>${closed.map((x) => `<tr><td>${esc(fmt(x.openedAt))}</td><td>${esc(fmt(x.closedAt))}</td><td>${esc(x.closedBy)}</td><td>$${money(x.expected)}</td><td>$${money(x.counted)}</td><td class="${Math.abs(x.diff) >= 0.005 ? "low" : ""}">${x.diff > 0 ? "+" : ""}${money(x.diff)}</td><td><button type="button" class="link-btn" data-shiftprint="${esc(x.id)}">Print</button></td></tr>`).join("")}</tbody></table></div>`;
  }
  box.innerHTML = html;
  updateDrawerNote();
}
function printShift(sh) {
  const row = (a, b) => `<div class="row"><span>${a}</span><span>${b}</span></div>`;
  const x = shiftSummary(sh);
  els.printRoot.innerHTML = `<article class="receipt">
    <div class="center store">${esc(state.settings.storeName)}</div><div class="center bold">CASH DRAWER REPORT</div>
    ${row("Opened", esc(new Date(sh.openedAt).toLocaleString("en-BS")))}${row("By", esc(sh.openedBy))}
    ${row("Closed", esc(new Date(sh.closedAt).toLocaleString("en-BS")))}${row("By", esc(sh.closedBy))}
    <hr class="dash" />
    ${row("Starting float", "$" + money(sh.float))}${row("Cash sales (net)", "$" + money(x.sales))}${row("Paid in", "$" + money(x.inn))}${row("Paid out", "-$" + money(x.out))}
    <div class="row bold"><span>EXPECTED</span><span>$${money(sh.expected)}</span></div>
    <div class="row bold"><span>COUNTED</span><span>$${money(sh.counted)}</span></div>
    <div class="row bold"><span>${sh.diff < 0 ? "SHORT" : sh.diff > 0 ? "OVER" : "BALANCED"}</span><span>${sh.diff ? "$" + money(Math.abs(sh.diff)) : ""}</span></div>
    ${sh.note ? `<div class="tiny">${esc(sh.note)}</div>` : ""}
    <hr class="dash" /><div class="tiny">Counted by: ____________  Checked by: ____________</div></article>`;
  window.print();
}
document.getElementById("drawerPanel").addEventListener("click", (e) => {
  const t = e.target.closest("button");
  if (!t) return;
  if (t.id === "openDrawerBtn") {
    const v = document.getElementById("drawerFloat").value;
    if (v === "" || !(Number(v) >= 0)) return alert("Enter the starting float (0 is fine).");
    state.shifts.push({ id: `S${Date.now()}`, openedAt: new Date().toISOString(), openedBy: session.name, float: r2(v), moves: [] });
    audit("drawer opened", `float $${money(v)}`);
    saveState(); renderDrawer();
  } else if (t.id === "noSaleBtn") {
    if (!isManager()) return;
    const why = (prompt("Reason for opening the drawer (no sale):", "") || "").trim();
    if (!why) return;
    openDrawer(true).then((ok) => { if (ok) { audit("drawer opened (no sale)", why); saveState(); } });
  } else if (t.id === "moveBtn") {
    openModal(`<h3>Paid in / Paid out</h3><form class="stack-form" id="moveForm">
      <label>Type<select name="kind"><option value="out">Paid out (cash taken from drawer)</option><option value="in">Paid in (cash added)</option></select></label>
      <label>Amount<input name="amount" type="number" min="0.01" step="0.01" required></label>
      <label>Reason<input name="reason" required placeholder="e.g. lunch run, supplier COD, bank drop"></label>
      <div class="modal-actions"><button type="button" class="ghost" id="modalCancel">Cancel</button><button class="primary" type="submit">Save</button></div></form>`);
    document.getElementById("modalCancel").onclick = closeModal;
    document.getElementById("moveForm").onsubmit = (ev) => {
      ev.preventDefault();
      const fd = new FormData(ev.target);
      const amt = r2(fd.get("amount")) * (fd.get("kind") === "out" ? -1 : 1);
      currentShift().moves.push({ at: new Date().toISOString(), by: session.name, amount: amt, reason: String(fd.get("reason")).trim() });
      audit(amt < 0 ? "drawer paid out" : "drawer paid in", `$${money(Math.abs(amt))} ${fd.get("reason")}`);
      saveState(); closeModal(); renderDrawer();
    };
  } else if (t.id === "closeDrawerBtn") {
    const sh = currentShift(), x = shiftSummary(sh);
    openModal(`<h3>Close drawer</h3><form class="stack-form" id="closeForm">
      <p class="hint">Count all the cash in the drawer, including the float, and enter the total.</p>
      <label>Cash counted<input name="counted" type="number" min="0" step="0.01" required></label>
      <div class="change-due" id="diffPreview">Expected $${money(x.expected)}</div>
      <label>Note (optional)<input name="note" placeholder="Explain any difference"></label>
      <div class="modal-actions"><button type="button" class="ghost" id="modalCancel">Cancel</button><button class="primary" type="submit">Close drawer</button></div></form>`);
    document.getElementById("modalCancel").onclick = closeModal;
    const form = document.getElementById("closeForm");
    form.elements.counted.oninput = () => {
      const d = r2((Number(form.elements.counted.value) || 0) - x.expected);
      document.getElementById("diffPreview").textContent = `Expected $${money(x.expected)}. ${d === 0 ? "Balanced" : d > 0 ? "Over $" + money(d) : "Short $" + money(-d)}`;
    };
    form.onsubmit = (ev) => {
      ev.preventDefault();
      const counted = r2(form.elements.counted.value), diff = r2(counted - x.expected);
      if (Math.abs(diff) >= 5 && !form.elements.note.value.trim()) return alert("The difference is $5 or more. Please add a note explaining it.");
      Object.assign(sh, { closedAt: new Date().toISOString(), closedBy: session.name, expected: x.expected, counted, diff, note: form.elements.note.value.trim() });
      audit("drawer closed", `expected $${money(x.expected)} counted $${money(counted)} diff ${diff}`);
      saveState(); closeModal(); renderDrawer(); printShift(sh);
    };
  } else if (t.dataset.shiftprint) {
    const sh = state.shifts.find((x) => x.id === t.dataset.shiftprint);
    if (sh) printShift(sh);
  }
});
document.getElementById("drawerBtn").onclick = () => switchView("drawer");
updateDrawerNote();
// ---------- Stock: count, receive, low stock ----------
const STOCK_ALL = "__all__", STOCK_UNTRACKED = "__untracked__";
let stockTab = "count", cntCurrent = null, cntReview = false, cntChoices = [], rcvCurrent = null, rcvChoices = [];
const rcvDraft = { supplier: "", ref: "", lines: [] };
const inScope = (p, sc) => sc === STOCK_ALL || (sc === STOCK_UNTRACKED ? !!p.noTrack : p.category === sc);
const scopeLabel = (sc) => (sc === STOCK_ALL ? "All items" : sc === STOCK_UNTRACKED ? "Items not tracked yet" : sc);
const openCount = () => state.counts.find((x) => x.status === "open");
const qtyOk = (p, v) => v >= 0 && (p.unit ? true : Number.isInteger(v));
function stockFind(text, scope) {
  const q = text.trim();
  if (!q) return { match: null, list: [] };
  const exact = findProduct(q);
  if (exact) return { match: exact, list: [] };
  const list = state.products.filter((p) => tokensMatch(productText(p), q)).slice(0, 8);
  return list.length === 1 ? { match: list[0], list: [] } : { match: null, list };
}
const choiceBtns = (list, attr) => list.length ? `<div class="choices">${list.map((p) => `<button type="button" class="ghost" ${attr}="${esc(p.sku)}">${esc(p.name)} <small>${esc(p.sku)}</small></button>`).join("")}</div>` : "";

function renderStock() {
  ["count", "receive", "low"].forEach((t) => {
    document.getElementById("stab-" + t).classList.toggle("hidden", t !== stockTab);
  });
  document.querySelectorAll("[data-stab]").forEach((b) => b.classList.toggle("active", b.dataset.stab === stockTab));
  if (stockTab === "count") renderCountTab();
  if (stockTab === "receive") renderReceiveTab();
  if (stockTab === "low") renderLowTab();
}

function countRows(sess) {
  return Object.values(sess.lines).map((l) => {
    const p = state.products.find((x) => x.sku === l.sku);
    const diff = l.noTrack ? null : r3(l.counted - l.sys);
    return { l, p, name: p ? p.name : l.sku, cat: p ? p.category : "", diff, val: diff === null || !p ? null : r2(diff * (p.cost || 0)) };
  });
}
function renderCountTab() {
  const box = document.getElementById("stab-count");
  const sess = openCount();
  const cats = categories().filter((x) => x !== "All");
  if (!sess) {
    const past = state.counts.slice().reverse().slice(0, 10);
    box.innerHTML = `<h3>Start a stock count</h3>
      <p class="hint">Counting an item that is not tracked yet starts tracking it. Choose a small area (one department) so a count takes an hour, not a week.</p>
      <div class="toolbar">
        <input id="cntName" value="${esc("Count " + new Date().toLocaleDateString("en-BS"))}" />
        <select id="cntScope"><option value="${STOCK_UNTRACKED}">Items not tracked yet (${state.products.filter((p) => p.noTrack).length})</option><option value="${STOCK_ALL}">All items</option>${cats.map((x) => `<option value="${esc(x)}">${esc(x)}</option>`).join("")}</select>
        <label class="inline"><input id="cntBlind" type="checkbox" checked /> Blind count (hide system quantity)</label>
        <button id="cntStart" class="primary" type="button">Start count</button>
      </div>
      ${past.length ? `<h3>Past counts</h3><div class="table-wrap"><table class="data-table"><thead><tr><th>Name</th><th>Started</th><th>Area</th><th>Items counted</th><th>Status</th><th></th></tr></thead><tbody>${past.map((x) => `<tr><td>${esc(x.name)}</td><td>${esc(new Date(x.startedAt).toLocaleDateString("en-BS"))}</td><td>${esc(scopeLabel(x.scope))}</td><td>${Object.keys(x.lines).length}</td><td>${esc(x.status)}</td><td><button type="button" class="link-btn" data-sessprint="${esc(x.id)}">Print</button> <button type="button" class="link-btn" data-sesscsv="${esc(x.id)}">CSV</button></td></tr>`).join("")}</tbody></table></div>` : ""}`;
    return;
  }
  const inS = state.products.filter((p) => inScope(p, sess.scope));
  const done = inS.filter((p) => sess.lines[p.sku]).length;
  if (cntReview) return renderCountReview(box, sess, inS, done);
  const cur = cntCurrent ? state.products.find((p) => p.sku === cntCurrent) : null;
  const recent = Object.values(sess.lines).sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 8);
  box.innerHTML = `<h3>${esc(sess.name)}</h3>
    <p class="hint">Area: ${esc(scopeLabel(sess.scope))}. Counted ${done} of ${inS.length} items in this area. ${sess.blind ? "Blind count: system quantities are hidden." : ""}</p>
    <div class="toolbar"><input id="cntFind" placeholder="Scan or type item number, UPC, lookup code or name, then Enter" autocomplete="off" /><button id="cntReviewBtn" class="primary" type="button">Review and finish</button></div>
    ${choiceBtns(cntChoices, "data-cntpick")}
    ${cur ? `<div class="count-card"><strong>${esc(cur.name)}</strong><div class="hint">${esc(cur.category)} &middot; ${esc(cur.sku)}${cur.unit ? " &middot; sold by " + esc(cur.unit) : ""}</div>
      <div>System quantity: <strong>${sess.blind ? "hidden" : cur.noTrack ? "not tracked" : esc(cur.stock)}</strong>${sess.lines[cur.sku] ? ` &middot; Counted so far: <strong>${esc(sess.lines[cur.sku].counted)}</strong>` : ""}</div>
      <div class="toolbar"><input id="cntQty" type="number" min="0" step="${cur.unit ? "any" : "1"}" placeholder="Quantity on the shelf" /><button type="button" class="primary" data-cnt="set">Set count</button><button type="button" class="ghost" data-cnt="add">Add to count</button></div>
      <p class="hint">Enter = Set. Use Add when the same item is in more than one place.</p></div>` : ""}
    ${recent.length ? `<h3>Just counted</h3><ul>${recent.map((l) => { const p = state.products.find((x) => x.sku === l.sku); return `<li>${esc(p ? p.name : l.sku)}: ${esc(l.counted)}</li>`; }).join("")}</ul>` : ""}`;
  document.getElementById(cur ? "cntQty" : "cntFind").focus();
}
function renderCountReview(box, sess, inS, done) {
  const rows = countRows(sess).sort((a, b) => Math.abs(b.val || 0) - Math.abs(a.val || 0) || Math.abs(b.diff || 0) - Math.abs(a.diff || 0));
  const diffs = rows.filter((r) => r.diff);
  const netUnits = r3(diffs.reduce((a, r) => a + r.diff, 0)), netVal = r2(diffs.reduce((a, r) => a + (r.val || 0), 0));
  const newlyTracked = rows.filter((r) => r.l.noTrack).length;
  const uncounted = inS.length - done;
  box.innerHTML = `<h3>Review: ${esc(sess.name)}</h3>
    <div class="report-grid"><div><span>Items counted</span><strong>${rows.length}</strong></div><div><span>With a difference</span><strong>${diffs.length}</strong></div><div><span>Net units</span><strong>${netUnits}</strong></div><div><span>Net value at cost</span><strong>${netVal < 0 ? "-" : ""}$${money(Math.abs(netVal))}</strong></div><div><span>Start tracking</span><strong>${newlyTracked}</strong></div><div><span>Not counted</span><strong>${uncounted}</strong></div></div>
    <div class="table-wrap"><table class="data-table"><thead><tr><th>SKU</th><th>Item</th><th>System</th><th>Counted</th><th>Difference</th><th>Value</th></tr></thead><tbody>${rows.slice(0, 300).map((r) => `<tr><td>${esc(r.l.sku)}</td><td>${esc(r.name)}</td><td>${r.l.noTrack ? "not tracked" : esc(r.l.sys)}</td><td>${esc(r.l.counted)}</td><td class="${r.diff ? "low" : ""}">${r.diff === null ? "new" : (r.diff > 0 ? "+" : "") + r.diff}</td><td>${r.val === null ? "" : (r.val < 0 ? "-" : "") + "$" + money(Math.abs(r.val))}</td></tr>`).join("")}</tbody></table></div>
    ${rows.length > 300 ? `<p class="hint">Showing the 300 biggest of ${rows.length}. The printout and CSV have all of them.</p>` : ""}
    <label class="inline"><input id="cntZero" type="checkbox" /> Also set the ${uncounted} uncounted items in this area to 0 (only if you counted the whole area)</label>
    <div class="toolbar"><button id="cntBack" class="ghost" type="button">Back to counting</button><button id="cntPrint" class="ghost" type="button">Print</button><button id="cntCsv" class="ghost" type="button">CSV</button><button id="cntCancel" class="ghost danger" type="button">Discard count</button><button id="cntApply" class="primary" type="button">Apply to stock</button></div>
    <p class="hint">Applying keeps sales made since each item was counted: only the difference found is added or removed. Items that were not tracked start tracking at the counted quantity.</p>`;
}
function countCSV(sess) {
  const head = ["SKU", "Name", "Department", "SystemAtCount", "Counted", "Difference", "Cost", "ValueDifference"];
  const rows = countRows(sess).map((r) => [r.l.sku, r.name, r.cat, r.l.noTrack ? "not tracked" : r.l.sys, r.l.counted, r.diff === null ? "" : r.diff, r.p ? money(r.p.cost) : "", r.val === null ? "" : money(r.val)].map(csvCell).join(","));
  download(`stock-count-${stamp()}.csv`, [head.map(csvCell).join(","), ...rows].join("\n"), "text/csv");
}
function printCount(sess) {
  const rows = countRows(sess).sort((a, b) => Math.abs(b.val || 0) - Math.abs(a.val || 0));
  els.printRoot.innerHTML = `<article class="quote-doc"><div class="q-head"><div><strong class="q-store">${esc(state.settings.storeName)}</strong><div>Stock count: ${esc(sess.name)}</div><div>Area: ${esc(scopeLabel(sess.scope))}</div></div><div class="q-title"><div>${esc(new Date(sess.startedAt).toLocaleDateString("en-BS"))}</div><div>Status: ${esc(sess.status)}</div></div></div>
    <table><thead><tr><th>SKU</th><th>Item</th><th class="num">System</th><th class="num">Counted</th><th class="num">Diff</th><th class="num">Value</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${esc(r.l.sku)}</td><td>${esc(r.name)}</td><td class="num">${r.l.noTrack ? "-" : esc(r.l.sys)}</td><td class="num">${esc(r.l.counted)}</td><td class="num">${r.diff === null ? "new" : r.diff}</td><td class="num">${r.val === null ? "" : "$" + money(r.val)}</td></tr>`).join("")}</tbody></table></article>`;
  document.getElementById("pageStyle").textContent = "@page{size:letter;margin:.5in}";
  document.documentElement.classList.add("sheet-print");
  window.print();
}
function saveCountLine(mode) {
  const sess = openCount(), p = state.products.find((x) => x.sku === cntCurrent);
  const inp = document.getElementById("cntQty");
  if (!sess || !p || !inp || inp.value === "") return;
  const v = r3(Number(inp.value));
  if (!(v >= 0) || !qtyOk(p, v)) return alert(p.unit ? "Enter a quantity of 0 or more." : "This item is counted in whole numbers.");
  const old = sess.lines[p.sku];
  const base = mode === "add" && old ? old.counted : 0;
  sess.lines[p.sku] = { sku: p.sku, counted: r3(base + v), sys: mode === "add" && old ? old.sys : p.stock, noTrack: mode === "add" && old ? old.noTrack : !!p.noTrack, at: new Date().toISOString(), by: session.name };
  cntCurrent = null; cntChoices = [];
  saveState(); renderCountTab();
}
function applyCount(sess, zero) {
  let n = 0, units = 0, val = 0;
  countRows(sess).forEach(({ l, p }) => {
    if (!p) return;
    l.before = p.stock;
    if (l.noTrack) { p.stock = l.counted; p.noTrack = false; }
    else { p.stock = r3(Math.max(0, p.stock + (l.counted - l.sys))); }
    l.after = p.stock;
    const d = r3(l.after - l.before); if (d) { n++; units += d; val += d * (p.cost || 0); }
  });
  if (zero) state.products.filter((p) => inScope(p, sess.scope) && !sess.lines[p.sku]).forEach((p) => { p.stock = 0; p.noTrack = false; });
  sess.status = "applied"; sess.appliedAt = new Date().toISOString(); sess.appliedBy = session.name;
  audit("stock count applied", `${sess.name}: ${n} items changed, net ${r3(units)} units, $${money(val)} at cost${zero ? ", uncounted set to 0" : ""}`);
  cntCurrent = null; cntReview = false;
  saveState(); renderStock(); renderInventory(); renderProducts();
}

function renderReceiveTab() {
  const box = document.getElementById("stab-receive");
  const cur = rcvCurrent ? state.products.find((p) => p.sku === rcvCurrent) : null;
  const total = r2(rcvDraft.lines.reduce((a, l) => a + l.qty * l.cost, 0));
  box.innerHTML = `<h3>Receive a delivery</h3>
    <div class="toolbar"><input id="rcvSupplier" placeholder="Supplier" value="${esc(rcvDraft.supplier)}" /><input id="rcvRef" placeholder="Invoice or packing slip no." value="${esc(rcvDraft.ref)}" /></div>
    <div class="toolbar"><input id="rcvFind" placeholder="Scan or type item number, UPC, lookup code or name, then Enter" autocomplete="off" /></div>
    ${choiceBtns(rcvChoices, "data-rcvpick")}
    ${cur ? `<div class="count-card"><strong>${esc(cur.name)}</strong><div class="hint">${esc(cur.sku)} &middot; on hand: ${cur.noTrack ? "not tracked" : esc(cur.stock)} &middot; cost now $${money(cur.cost)}</div>
      <div class="toolbar"><input id="rcvQty" type="number" min="0" step="${cur.unit ? "any" : "1"}" placeholder="Quantity received" /><input id="rcvCost" type="number" min="0" step="0.001" placeholder="Unit cost" value="${cur.cost ? esc(cur.cost) : ""}" /><button id="rcvAdd" class="primary" type="button">Add line</button></div></div>` : ""}
    ${rcvDraft.lines.length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>Item</th><th>Qty</th><th>Unit cost</th><th>Line</th><th></th></tr></thead><tbody>${rcvDraft.lines.map((l, i) => `<tr><td>${esc(l.name)}${l.untracked ? " <small>(not tracked: count it to start tracking)</small>" : ""}</td><td>${esc(l.qty)}</td><td>$${money(l.cost)}</td><td>$${money(l.qty * l.cost)}</td><td><button type="button" class="link-btn danger" data-rcvdel="${i}">Remove</button></td></tr>`).join("")}</tbody></table></div>
    <div class="toolbar"><strong>Total at cost: $${money(total)}</strong><button id="rcvPost" class="primary" type="button">Post delivery to stock</button></div>` : ""}
    ${state.receipts.length ? `<h3>Recent deliveries</h3><div class="table-wrap"><table class="data-table"><thead><tr><th>Date</th><th>Supplier</th><th>Reference</th><th>Lines</th><th>Total</th><th>By</th></tr></thead><tbody>${state.receipts.slice(-10).reverse().map((r) => `<tr><td>${esc(new Date(r.at).toLocaleDateString("en-BS"))}</td><td>${esc(r.supplier)}</td><td>${esc(r.ref)}</td><td>${r.lines.length}</td><td>$${money(r.total)}</td><td>${esc(r.by)}</td></tr>`).join("")}</tbody></table></div>` : ""}`;
  document.getElementById(cur ? "rcvQty" : "rcvFind").focus();
}
function addReceiveLine() {
  const p = state.products.find((x) => x.sku === rcvCurrent);
  const q = r3(Number(document.getElementById("rcvQty").value)), cost = r2(Number(document.getElementById("rcvCost").value) || 0);
  if (!p || !(q > 0) || !qtyOk(p, q)) return alert(p && !p.unit ? "Enter a whole number of units received." : "Enter the quantity received.");
  rcvDraft.lines.push({ sku: p.sku, name: p.name, qty: q, cost, untracked: !!p.noTrack });
  rcvCurrent = null; rcvChoices = [];
  renderReceiveTab();
}
function postDelivery() {
  if (!rcvDraft.lines.length) return;
  rcvDraft.lines.forEach((l) => {
    const p = state.products.find((x) => x.sku === l.sku);
    if (!p) return;
    if (!p.noTrack) {
      if (l.cost > 0) p.cost = p.stock > 0 ? r2((p.stock * (p.cost || 0) + l.qty * l.cost) / (p.stock + l.qty)) : l.cost;
      p.stock = r3(p.stock + l.qty);
    } else if (l.cost > 0) p.cost = l.cost;
  });
  const total = r2(rcvDraft.lines.reduce((a, l) => a + l.qty * l.cost, 0));
  state.receipts.push({ id: `D${Date.now()}`, at: new Date().toISOString(), by: session.name, supplier: rcvDraft.supplier, ref: rcvDraft.ref, lines: rcvDraft.lines.map((l) => ({ ...l })), total });
  audit("delivery received", `${rcvDraft.supplier || "?"} ${rcvDraft.ref || ""}: ${rcvDraft.lines.length} lines, $${money(total)}`);
  rcvDraft.lines = []; rcvDraft.supplier = ""; rcvDraft.ref = "";
  saveState(); renderReceiveTab(); renderInventory(); renderProducts();
}

let lowLevel = 5, lowDept = "All";
function lowItems() {
  return state.products.filter((p) => !p.noTrack && p.stock <= lowLevel && (lowDept === "All" || p.category === lowDept))
    .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
}
function renderLowTab() {
  const box = document.getElementById("stab-low");
  const list = lowItems();
  box.innerHTML = `<h3>Low stock</h3>
    <div class="toolbar"><label class="inline">Show items with this many or fewer <input id="lowLevel" type="number" min="0" step="1" value="${lowLevel}" style="width:70px" /></label>
      <select id="lowDept">${categories().map((x) => `<option value="${esc(x)}" ${x === lowDept ? "selected" : ""}>${esc(x)}</option>`).join("")}</select>
      <button id="lowCsv" class="ghost" type="button">CSV</button></div>
    <p class="hint">${list.length} tracked items. ${state.products.filter((p) => p.noTrack).length} items are not tracked yet and will not appear here until they are counted.</p>
    <div class="table-wrap"><table class="data-table"><thead><tr><th>SKU</th><th>Item</th><th>Department</th><th>On hand</th><th>Cost</th></tr></thead><tbody>${list.slice(0, 300).map((p) => `<tr><td>${esc(p.sku)}</td><td>${esc(p.name)}</td><td>${esc(p.category)}</td><td class="low">${esc(p.stock)}</td><td>$${money(p.cost)}</td></tr>`).join("")}</tbody></table></div>
    ${list.length > 300 ? `<p class="hint">Showing 300 of ${list.length}. Use the CSV for the full list.</p>` : ""}`;
}

const stockView = document.getElementById("view-stock");
stockView.addEventListener("click", (e) => {
  const t = e.target.closest("button");
  if (!t) return;
  if (t.dataset.stab) { stockTab = t.dataset.stab; return renderStock(); }
  if (t.id === "cntStart") {
    const name = document.getElementById("cntName").value.trim() || "Count";
    state.counts.push({ id: `C${Date.now()}`, name, scope: document.getElementById("cntScope").value, blind: document.getElementById("cntBlind").checked, startedAt: new Date().toISOString(), startedBy: session.name, status: "open", lines: {} });
    audit("stock count started", name); saveState(); cntReview = false; cntCurrent = null; return renderCountTab();
  }
  const sess = openCount();
  if (t.dataset.cntpick) { cntCurrent = t.dataset.cntpick; cntChoices = []; return renderCountTab(); }
  if (t.dataset.cnt) return saveCountLine(t.dataset.cnt);
  if (t.id === "cntReviewBtn") { cntReview = true; return renderCountTab(); }
  if (t.id === "cntBack") { cntReview = false; return renderCountTab(); }
  if (t.id === "cntPrint" && sess) return printCount(sess);
  if (t.id === "cntCsv" && sess) return countCSV(sess);
  if (t.id === "cntCancel" && sess) { if (confirm("Discard this count? Nothing will be changed in stock.")) { sess.status = "discarded"; audit("stock count discarded", sess.name); saveState(); cntReview = false; renderCountTab(); } return; }
  if (t.id === "cntApply" && sess) {
    const zero = document.getElementById("cntZero").checked;
    const inS = state.products.filter((p) => inScope(p, sess.scope)), unc = inS.filter((p) => !sess.lines[p.sku]).length;
    if (!isManager()) return alert("A manager must apply the count.");
    if (zero && !confirm(`This sets ${unc} uncounted items to 0 on hand. Are you sure the whole area was counted?`)) return;
    if (confirm(`Apply "${sess.name}" to stock now?`)) applyCount(sess, zero);
    return;
  }
  if (t.dataset.sessprint || t.dataset.sesscsv) {
    const x = state.counts.find((c) => c.id === (t.dataset.sessprint || t.dataset.sesscsv));
    if (x) return t.dataset.sessprint ? printCount(x) : countCSV(x);
  }
  if (t.dataset.rcvpick) { rcvCurrent = t.dataset.rcvpick; rcvChoices = []; return renderReceiveTab(); }
  if (t.id === "rcvAdd") return addReceiveLine();
  if (t.dataset.rcvdel) { rcvDraft.lines.splice(Number(t.dataset.rcvdel), 1); return renderReceiveTab(); }
  if (t.id === "rcvPost") return postDelivery();
  if (t.id === "lowCsv") {
    const head = ["SKU", "Name", "Department", "OnHand", "Cost"];
    download(`low-stock-${stamp()}.csv`, [head.map(csvCell).join(","), ...lowItems().map((p) => [p.sku, p.name, p.category, p.stock, money(p.cost)].map(csvCell).join(","))].join("\n"), "text/csv");
  }
});
stockView.addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  const id = e.target.id;
  if (id === "cntFind") { const r = stockFind(e.target.value); const sess = openCount();
    if (r.match) { if (sess.scope !== STOCK_ALL && !inScope(r.match, sess.scope) && !confirm(`${r.match.name} is not in this count's area. Count it anyway?`)) return; cntCurrent = r.match.sku; cntChoices = []; } else { cntChoices = r.list; if (!r.list.length) alert("No item found."); }
    renderCountTab(); }
  else if (id === "cntQty") saveCountLine("set");
  else if (id === "rcvFind") { const r = stockFind(e.target.value); if (r.match) { rcvCurrent = r.match.sku; rcvChoices = []; } else { rcvChoices = r.list; if (!r.list.length) alert("No item found."); } renderReceiveTab(); }
  else if (id === "rcvQty" || id === "rcvCost") addReceiveLine();
});
stockView.addEventListener("input", (e) => {
  if (e.target.id === "rcvSupplier") rcvDraft.supplier = e.target.value;
  if (e.target.id === "rcvRef") rcvDraft.ref = e.target.value;
});
stockView.addEventListener("change", (e) => {
  if (e.target.id === "lowLevel") { lowLevel = Math.max(0, Number(e.target.value) || 0); renderLowTab(); }
  if (e.target.id === "lowDept") { lowDept = e.target.value; renderLowTab(); }
});
// ---------- Layaway ----------
const layPaid = (l) => r2(l.payments.reduce((a, p) => a + p.amount, 0));
const layBal = (l) => r2(l.total - layPaid(l));
const layStatus = (l) => (l.status === "open" && l.due < todayStr() ? "overdue" : l.status);

function layawayForm() {
  if (!cart.items.length) return alert("Add the items to the sale first, then click Layaway.");
  if (!currentShift()) { switchView("drawer"); return alert("Open the cash drawer first, because a deposit is taken now."); }
  const t = cartTotals(), pol = state.layawayPolicy;
  const cust = state.customers.find((x) => x.id === cart.customerId) || {};
  const walkin = cart.customerId === "c1";
  const minDep = r2(Math.ceil(t.total * pol.depositPct) / 100);
  openModal(`<h3>New layaway</h3>
    <form class="stack-form" id="layForm">
      <label>Customer name<input name="who" value="${esc(walkin ? "" : cust.name || "")}" required></label>
      <label>Phone<input name="phone" value="${esc(walkin ? "" : cust.phone || "")}" required></label>
      <label>Hold for (days)<input name="days" type="number" min="1" max="365" step="1" value="${esc(pol.termDays)}" required></label>
      <div class="change-due">Total $${money(t.total)}. Minimum deposit ${esc(pol.depositPct)}% = $${money(minDep)}</div>
      <label>Deposit now<input name="dep" type="number" min="0.01" step="0.01" value="${money(minDep)}" required></label>
      <label>Paid by<select name="method"><option>Cash</option><option>Card</option></select></label>
      <label>Cash received (if cash)<input name="cashIn" type="number" min="0" step="0.01"></label>
      <label>Notes<input name="notes" placeholder="Job name, pickup person"></label>
      <p class="hint">The items are set aside and taken out of stock now. A tax invoice is issued when the layaway is completed.</p>
      <div class="modal-actions"><button type="button" class="ghost" id="modalCancel">Cancel</button><button class="primary" type="submit">Take deposit</button></div>
    </form>`);
  document.getElementById("modalCancel").onclick = closeModal;
  document.getElementById("layForm").onsubmit = (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const dep = r2(fd.get("dep")), method = String(fd.get("method"));
    if (dep < minDep - 0.004) return alert(`The minimum deposit is $${money(minDep)}.`);
    if (dep >= t.total) return alert("That pays the whole amount. Use the normal Cash or Card payment instead.");
    const pay = { at: new Date().toISOString(), by: session.name, method, amount: dep };
    if (method === "Cash") {
      const inn = r2(fd.get("cashIn") || dep);
      if (inn < dep) return alert("Cash received is less than the deposit.");
      pay.tendered = inn; pay.change = r2(inn - dep);
    }
    const st = state.settings;
    const l = { no: `L-${state.layawaySeq}`, at: pay.at, by: session.name, customerId: walkin ? "" : cart.customerId, who: String(fd.get("who")).trim(), phone: String(fd.get("phone")).trim(),
      bin: walkin ? "" : (cust.bin || ""), items: cart.items.map((i) => ({ ...i })), subtotal: t.subtotal, vat: t.vat, discount: t.discount, total: t.total,
      due: addDays(Math.min(365, Math.max(1, Math.floor(Number(fd.get("days")) || pol.termDays)))), notes: String(fd.get("notes")).trim(), payments: [pay], status: "open",
      store: { storeName: st.storeName, addr1: st.addr1, phone: st.phone, vatNo: st.vatNo } };
    state.layawaySeq += 1;
    l.items.forEach((line) => { const p = state.products.find((x) => x.sku === line.sku); if (p && !p.noTrack) p.stock = r3(Math.max(0, p.stock - line.qty)); });
    state.layaways.push(l);
    audit("layaway created", `${l.no} ${l.who} total $${money(l.total)} deposit $${money(dep)}`);
    resetCart(); saveState(); closeModal(); renderCart(); renderProducts();
    printLayaway(l, 0);
  };
}

function printLayaway(l, payIdx) {
  const pol = state.layawayPolicy, st = l.store || state.settings;
  const row = (a, b) => `<div class="row"><span>${a}</span><span>${b}</span></div>`;
  const first = payIdx === 0;
  const pays = payIdx === null ? l.payments : [l.payments[payIdx]];
  els.printRoot.innerHTML = `<article class="receipt">
    <div class="center store">${esc(st.storeName)}</div><div class="center">${esc(st.addr1)}</div><div class="center">${esc(st.phone)}</div>
    <hr class="dash" /><div class="center bold">${payIdx === null ? "LAYAWAY STATEMENT" : first ? "LAYAWAY AGREEMENT" : "LAYAWAY PAYMENT"}</div>
    ${row("Layaway", esc(l.no))}${row("Date", esc(new Date(l.at).toLocaleDateString("en-BS")))}${row("Customer", esc(l.who))}${row("Phone", esc(l.phone))}${row("Collect by", esc(l.due))}
    <hr class="dash" />
    ${l.items.map((i) => row(`${esc(i.qty)}${i.unit ? " " + esc(i.unit) : ""} x ${esc(i.name)}`, "$" + money(lineAmounts(i).incVat))).join("")}
    <hr class="dash" />
    ${row("Subtotal ex VAT", "$" + money(l.subtotal))}${row("VAT 10%", "$" + money(l.vat))}${l.discount ? row("Discount", "-$" + money(l.discount)) + row("VAT in total after discount", "$" + money(netVat(l))) : ""}
    <div class="row bold"><span>TOTAL BSD</span><span>$${money(l.total)}</span></div>
    <hr class="dash" />
    ${pays.map((p) => row(`${esc(new Date(p.at).toLocaleDateString("en-BS"))} ${esc(p.method)}`, "$" + money(p.amount)) + (p.tendered !== undefined && p.change ? row("Cash tendered / change", `$${money(p.tendered)} / $${money(p.change)}`) : "")).join("")}
    <div class="row bold"><span>PAID TO DATE</span><span>$${money(layPaid(l))}</span></div>
    <div class="row bold"><span>BALANCE OWING</span><span>$${money(layBal(l))}</span></div>
    <hr class="dash" />
    <div class="tiny">Items are held until ${esc(l.due)}. The balance must be paid in full to collect them. If cancelled, ${esc(pol.cancelFeePct)}% of the amount paid is kept as a fee and the rest is refunded. This is not a tax invoice; one is issued when the layaway is completed.</div>
    ${first ? '<div class="tiny">Customer signature: ______________________</div>' : ""}
    <div class="tiny">Served by ${esc(l.by)}</div></article>`;
  window.print();
}

function layawayPayForm(l) {
  if (!currentShift()) { switchView("drawer"); return alert("Open the cash drawer first."); }
  const bal = layBal(l);
  openModal(`<h3>Payment on ${esc(l.no)}</h3><form class="stack-form" id="layPayForm">
    <div class="change-due">Balance owing $${money(bal)}</div>
    <label>Amount<input name="amt" type="number" min="0.01" max="${bal}" step="0.01" value="${money(bal)}" required></label>
    <label>Paid by<select name="method"><option>Cash</option><option>Card</option></select></label>
    <label>Cash received (if cash)<input name="cashIn" type="number" min="0" step="0.01"></label>
    <div class="modal-actions"><button type="button" class="ghost" id="modalCancel">Cancel</button><button class="primary" type="submit">Take payment</button></div></form>`);
  document.getElementById("modalCancel").onclick = closeModal;
  document.getElementById("layPayForm").onsubmit = (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const amt = r2(fd.get("amt")), method = String(fd.get("method"));
    if (!(amt > 0) || amt > bal + 0.004) return alert(`Enter an amount up to $${money(bal)}.`);
    const pay = { at: new Date().toISOString(), by: session.name, method, amount: amt };
    if (method === "Cash") { const inn = r2(fd.get("cashIn") || amt); if (inn < amt) return alert("Cash received is less than the payment."); pay.tendered = inn; pay.change = r2(inn - amt); }
    l.payments.push(pay);
    audit("layaway payment", `${l.no} $${money(amt)} ${method}`);
    saveState(); closeModal(); renderLayaway();
    if (layBal(l) <= 0.004) completeLayaway(l); else printLayaway(l, l.payments.length - 1);
  };
}

function completeLayaway(l) {
  if (!confirm(`${l.no} is paid in full. Complete it and hand over the items now?`)) return;
  const sale = { receiptNo: nextTicket(), at: new Date().toISOString(), cashier: session.name, customerName: l.who, customerId: l.customerId || "c1", bin: l.bin || "",
    items: l.items.map((i) => ({ ...i })), subtotal: l.subtotal, vat: l.vat, discount: l.discount, total: l.total, tender: "Layaway",
    payments: l.payments.map((p) => ({ method: p.method, amount: p.amount, earlier: true, ref: l.no, at: p.at })), tendered: l.total, change: 0, layawayNo: l.no, store: { ...state.settings } };
  state.seq += 1;
  state.sales.push(sale);
  l.status = "completed"; l.saleReceipt = sale.receiptNo; l.completedAt = sale.at;
  audit("layaway completed", `${l.no} -> ${sale.receiptNo}`);
  saveState(); renderLayaway();
  printSale(sale);
}

function layawayCancelForm(l) {
  if (!isManager()) return alert("A manager must cancel a layaway.");
  if (!currentShift()) { switchView("drawer"); return alert("Open the cash drawer first, because a refund may be paid in cash."); }
  const paid = layPaid(l), fee0 = r2(paid * state.layawayPolicy.cancelFeePct / 100);
  openModal(`<h3>Cancel ${esc(l.no)}</h3><form class="stack-form" id="layCancelForm">
    <div class="change-due">Paid so far $${money(paid)}</div>
    <label>Cancellation fee kept<input name="fee" type="number" min="0" max="${paid}" step="0.01" value="${money(fee0)}"></label>
    <div class="change-due" id="layRefund">Refund $${money(paid - fee0)}</div>
    <label>Reason<input name="reason" required></label>
    <p class="hint">The refund goes back the way it was paid. The items return to stock.</p>
    <div class="modal-actions"><button type="button" class="ghost" id="modalCancel">Back</button><button class="primary" type="submit">Cancel layaway</button></div></form>`);
  document.getElementById("modalCancel").onclick = closeModal;
  const f = document.getElementById("layCancelForm");
  f.elements.fee.oninput = () => { document.getElementById("layRefund").textContent = `Refund $${money(Math.max(0, paid - (Number(f.elements.fee.value) || 0)))}`; };
  f.onsubmit = (e) => {
    e.preventDefault();
    const fee = Math.min(paid, Math.max(0, r2(f.elements.fee.value))), refund = r2(paid - fee);
    const pay = refund > 0 ? splitRefund({ payments: l.payments, total: paid, tender: "" }, refund) : [];
    l.cancel = { at: new Date().toISOString(), by: session.name, fee, refund, reason: String(f.elements.reason.value).trim(), pay };
    l.status = "cancelled";
    l.items.forEach((line) => { const p = state.products.find((x) => x.sku === line.sku); if (p && !p.noTrack) p.stock = r3(p.stock + line.qty); });
    audit("layaway cancelled", `${l.no} refund $${money(refund)} fee $${money(fee)}`);
    saveState(); closeModal(); renderLayaway(); renderProducts();
    els.printRoot.innerHTML = `<article class="receipt"><div class="center store">${esc(state.settings.storeName)}</div><div class="center bold">LAYAWAY CANCELLED ${esc(l.no)}</div><div class="center">${esc(l.who)}</div><hr class="dash" />
      <div class="row"><span>Paid</span><span>$${money(paid)}</span></div><div class="row"><span>Fee kept</span><span>$${money(fee)}</span></div>
      ${pay.map((p) => `<div class="row"><span>Refund ${esc(p.method)}</span><span>$${money(p.amount)}</span></div>`).join("")}<div class="tiny">Customer signature: ______________________</div></article>`;
    window.print();
  };
}

function renderLayaway() {
  const pol = state.layawayPolicy, mgr = isManager();
  document.getElementById("layaPolicy").innerHTML = `<span class="hint">Policy:</span>
    <label class="inline">Min deposit % <input id="layDep" type="number" min="0" max="99" step="1" value="${esc(pol.depositPct)}" style="width:64px" ${mgr ? "" : "disabled"}></label>
    <label class="inline">Hold days <input id="layDays" type="number" min="1" max="365" step="1" value="${esc(pol.termDays)}" style="width:64px" ${mgr ? "" : "disabled"}></label>
    <label class="inline">Cancel fee % <input id="layFee" type="number" min="0" max="100" step="1" value="${esc(pol.cancelFeePct)}" style="width:64px" ${mgr ? "" : "disabled"}></label>`;
  const q = document.getElementById("layaSearch").value.trim(), f = document.getElementById("layaFilter").value;
  const list = state.layaways.slice().reverse().filter((l) => tokensMatch(`${l.no} ${l.who} ${l.phone} ${l.notes}`, q) && (f === "all" ? true : f === "active" ? ["open", "overdue"].includes(layStatus(l)) : layStatus(l) === f));
  document.getElementById("layawayBody").innerHTML = list.slice(0, 200).map((l) => {
    const st = layStatus(l);
    return `<tr class="${st === "cancelled" ? "void-row" : ""}"><td>${esc(l.no)}</td><td>${esc(l.who)}<br><small>${esc(l.phone)}</small></td><td>$${money(l.total)}</td><td>$${money(layPaid(l))}</td><td class="${layBal(l) > 0 && st !== "cancelled" ? "low" : ""}">$${money(layBal(l))}</td><td>${esc(l.due)}</td><td><strong>${esc(st)}</strong>${l.saleReceipt ? " " + esc(l.saleReceipt) : ""}</td>
      <td><button type="button" class="link-btn" data-layprint="${esc(l.no)}">Statement</button>
      ${["open", "overdue"].includes(st) ? `<button type="button" class="link-btn" data-laypay="${esc(l.no)}">Payment</button>${mgr ? ` <button type="button" class="link-btn" data-layext="${esc(l.no)}">Extend</button> <button type="button" class="link-btn danger" data-laycancel="${esc(l.no)}">Cancel</button>` : ""}` : ""}</td></tr>`;
  }).join("") || `<tr><td colspan="8" class="more-note">No layaways. Build the items on the Register, choose the customer, then click Layaway.</td></tr>`;
}
document.getElementById("layawayBtn").onclick = layawayForm;
document.getElementById("layaSearch").oninput = renderLayaway;
document.getElementById("layaFilter").onchange = renderLayaway;
document.getElementById("layaPolicy").addEventListener("change", (e) => {
  if (!isManager()) return;
  const map = { layDep: "depositPct", layDays: "termDays", layFee: "cancelFeePct" };
  if (map[e.target.id]) { state.layawayPolicy[map[e.target.id]] = Math.max(0, Number(e.target.value) || 0); audit("layaway policy changed", `${map[e.target.id]} ${e.target.value}`); saveState(); }
});
document.getElementById("layawayBody").addEventListener("click", (e) => {
  const t = e.target.closest("button");
  if (!t) return;
  const no = t.dataset.layprint || t.dataset.laypay || t.dataset.layext || t.dataset.laycancel;
  const l = state.layaways.find((x) => x.no === no);
  if (!l) return;
  if (t.dataset.layprint) printLayaway(l, null);
  else if (t.dataset.laypay) layawayPayForm(l);
  else if (t.dataset.laycancel) layawayCancelForm(l);
  else if (t.dataset.layext && isManager()) {
    const d = Math.floor(Number(prompt(`Extend ${l.no} by how many days from today?`, "14")));
    if (d > 0 && d <= 365) { l.due = addDays(d); audit("layaway extended", `${l.no} to ${l.due}`); saveState(); renderLayaway(); }
  }
});
// ---------- Reports ----------
let repTab = "eod", lastRep = null;
const dayStr = (iso) => new Date(iso).toLocaleDateString("en-CA");
function netEx(o) { const g = o.subtotal + o.vat; return r2(g > 0 ? o.subtotal * (o.total / g) : o.subtotal); }
function netVat(o) { return r2(o.total - netEx(o)); }
const fm = (v) => (v < 0 ? "-" : "") + "$" + money(Math.abs(v));

function presetRange(p) {
  const now = new Date(), f = (d) => d.toLocaleDateString("en-CA");
  const y = now.getFullYear(), m = now.getMonth(), d = now.getDate();
  if (p === "today") return [f(now), f(now)];
  if (p === "yesterday") { const t = new Date(y, m, d - 1); return [f(t), f(t)]; }
  if (p === "week") return [f(new Date(y, m, d - ((now.getDay() + 6) % 7))), f(now)];
  if (p === "7") return [f(new Date(y, m, d - 6)), f(now)];
  if (p === "30") return [f(new Date(y, m, d - 29)), f(now)];
  if (p === "lastmonth") return [f(new Date(y, m - 1, 1)), f(new Date(y, m, 0))];
  if (p === "year") return [f(new Date(y, 0, 1)), f(now)];
  return [f(new Date(y, m, 1)), f(now)];
}
function renderReportsView() {
  document.querySelectorAll("[data-rtab]").forEach((b) => b.classList.toggle("active", b.dataset.rtab === repTab));
  document.getElementById("rep-eod").classList.toggle("hidden", repTab !== "eod");
  document.getElementById("rep-range").classList.toggle("hidden", repTab === "eod");
  if (repTab === "eod") return renderReport();
  const fromEl = document.getElementById("repFrom"), toEl = document.getElementById("repTo");
  if (!fromEl.value) { [fromEl.value, toEl.value] = presetRange("month"); }
  document.getElementById("repGroup").classList.toggle("hidden", repTab !== "sales");
  document.getElementById("repSort").classList.toggle("hidden", repTab !== "items");
  ["repPreset", "repFrom", "repTo"].forEach((id) => document.getElementById(id).classList.toggle("hidden", repTab === "stockval"));
  renderRep();
}

function repFacts(from, to) {
  const inR = (iso) => { const d = dayStr(iso); return d >= from && d <= to; };
  const out = [];
  const mk = (sale, l, sign, at) => {
    const src = sale.items.find((x) => x.sku === l.sku) || l;
    const p = state.products.find((x) => x.sku === l.sku);
    const a = lineAmounts(l), g = sale.subtotal + sale.vat, ratio = (g > 0 ? sale.total / g : 1) * sign;
    out.push({ at, sign, sku: l.sku, name: l.name, cat: src.cat || p?.category || "Unknown", qty: l.qty * sign, ex: a.exVat * ratio, vat: a.vat * ratio, exempt: !!l.exempt, cost: (src.cost ?? p?.cost ?? 0) * l.qty * sign, noCost: (src.cost ?? p?.cost ?? 0) === 0 });
  };
  state.sales.forEach((sl) => {
    if (inR(sl.at)) sl.items.forEach((l) => mk(sl, l, 1, sl.at));
    (sl.returns || []).forEach((r) => { if (inR(r.at)) r.lines.forEach((l) => mk(sl, l, -1, r.at)); });
    if (sl.voided && sl.voidedAt && inR(sl.voidedAt)) sl.items.forEach((l) => mk(sl, l, -1, sl.voidedAt));
  });
  return out;
}
function repActiveDays(from, to) {
  const days = new Set(), add = (iso) => { const d = dayStr(iso); if (d >= from && d <= to) days.add(d); };
  state.sales.forEach((sl) => { add(sl.at); (sl.returns || []).forEach((r) => add(r.at)); if (sl.voided && sl.voidedAt) add(sl.voidedAt); });
  state.layaways.forEach((l) => { l.payments.forEach((p) => add(p.at)); if (l.cancel) add(l.cancel.at); });
  return [...days].sort();
}
const group = (facts, keyFn) => { const m = new Map(); facts.forEach((f) => { const k = keyFn(f), a = m.get(k) || { qty: 0, ex: 0, cost: 0, vat: 0, name: f.name, cat: f.cat, sku: f.sku }; a.qty += f.qty; a.ex += f.ex; a.cost += f.cost; a.vat += f.vat; m.set(k, a); }); return m; };
const pct = (a, b) => (b ? Math.round(a / b * 1000) / 10 : 0);

function buildRep(tab, from, to) {
  const facts = tab === "sales" || tab === "stockval" ? [] : repFacts(from, to);
  if (tab === "sales") {
    const grp = document.getElementById("repGroup").value, b = new Map();
    repActiveDays(from, to).forEach((d) => {
      const r = reportData(d), k = grp === "month" ? d.slice(0, 7) : d;
      const a = b.get(k) || [0, 0, 0, 0, 0, 0, 0, 0, 0];
      [r.count, r.subtotal, r.vat, r.discount, r.total, r.cashTotal, r.cardTotal, r.retTotal + r.voidTotal, r.layInTotal].forEach((v, i) => { a[i] += v; });
      b.set(k, a);
    });
    const rows = [...b].sort((x, y) => (x[0] < y[0] ? -1 : 1)).map(([k, a]) => [k, ...a.map((v, i) => (i === 0 ? v : r2(v)))]);
    const foot = ["Total", ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => r2(rows.reduce((t, r) => t + r[i], 0)))];
    foot[1] = rows.reduce((t, r) => t + r[1], 0);
    return { title: "Sales", head: ["Period", "Sales", "Net ex VAT", "VAT", "Discounts given", "Net total", "Cash", "Card", "Returns and voids", "Layaway payments in"], types: "tnmmmmmmmm", rows, foot,
      note: "Net figures are after returns and voids on the day they happened. Cash and card include layaway payments on the day taken. A layaway counts as a sale on the day it is completed." };
  }
  if (tab === "dept") {
    const g = [...group(facts, (f) => f.cat)].filter(([, x]) => Math.abs(x.qty) > 0.0005 || Math.abs(x.ex) > 0.004).sort((a, b) => b[1].ex - a[1].ex);
    const tot = g.reduce((a, [, x]) => a + x.ex, 0), tc = g.reduce((a, [, x]) => a + x.cost, 0);
    return { title: "Sales by department", head: ["Department", "Units", "Net sales ex VAT", "Cost", "Profit", "Margin %", "Share %"], types: "tnmmmpp",
      rows: g.map(([k, x]) => [k, r3(x.qty), r2(x.ex), r2(x.cost), r2(x.ex - x.cost), pct(x.ex - x.cost, x.ex), pct(x.ex, tot)]),
      foot: ["Total", r3(g.reduce((a, [, x]) => a + x.qty, 0)), r2(tot), r2(tc), r2(tot - tc), pct(tot - tc, tot), 100], note: "Net of discounts, returns and voids. Cost is the average cost on the item when it was sold." };
  }
  if (tab === "items") {
    const key = document.getElementById("repSort").value, g = [...group(facts, (f) => f.sku)].filter(([, x]) => Math.abs(x.qty) > 0.0005 || Math.abs(x.ex) > 0.004).map(([k, x]) => ({ ...x, profit: x.ex - x.cost }));
    g.sort((a, b) => (key === "units" ? b.qty - a.qty : key === "profit" ? b.profit - a.profit : b.ex - a.ex));
    return { title: "Top items", head: ["SKU", "Item", "Department", "Units", "Net sales ex VAT", "Profit", "Margin %"], types: "tttnmmp",
      rows: g.map((x) => [x.sku, x.name, x.cat, r3(x.qty), r2(x.ex), r2(x.profit), pct(x.profit, x.ex)]), foot: null, note: "Net of returns and voids." };
  }
  if (tab === "profit") {
    const ex = facts.reduce((a, f) => a + f.ex, 0), cost = facts.reduce((a, f) => a + f.cost, 0);
    const disc = r2(state.sales.filter((sl) => { const d = dayStr(sl.at); return d >= from && d <= to; }).reduce((a, sl) => a + sl.discount, 0));
    const g = [...group(facts, (f) => f.sku)].map(([k, x]) => ({ ...x, profit: x.ex - x.cost })).filter((x) => x.ex > 0 && pct(x.profit, x.ex) < 10).sort((a, b) => a.profit - b.profit);
    const nocost = new Set(facts.filter((f) => f.sign > 0 && f.noCost).map((f) => f.sku)).size;
    return { title: "Profit", head: ["SKU", "Item", "Units", "Net sales ex VAT", "Profit", "Margin %"], types: "ttnmmp",
      cards: [["Net sales ex VAT", fm(r2(ex))], ["Cost of goods sold", fm(r2(cost))], ["Gross profit", fm(r2(ex - cost))], ["Margin", pct(ex - cost, ex) + "%"], ["Discounts given", fm(disc)], ["Sold with no cost on file", nocost + " items"]],
      rows: g.map((x) => [x.sku, x.name, r3(x.qty), r2(x.ex), r2(x.profit), pct(x.profit, x.ex)]), foot: null,
      note: "Items below with a margin under 10% or sold at a loss. Items with no cost on file show a margin that is too high, so fix their cost in Inventory." };
  }
  if (tab === "vat") {
    const m = new Map();
    facts.forEach((f) => { const k = f.at ? dayStr(f.at).slice(0, 7) : "", a = m.get(k) || { taxable: 0, exempt: 0, vatSales: 0, vatRef: 0 }; if (f.exempt) a.exempt += f.ex; else a.taxable += f.ex; if (f.sign > 0) a.vatSales += f.vat; else a.vatRef += f.vat; m.set(k, a); });
    const inv = new Map();
    state.sales.forEach((sl) => { const d = dayStr(sl.at); if (d >= from && d <= to) inv.set(d.slice(0, 7), (inv.get(d.slice(0, 7)) || 0) + 1); });
    [...inv.keys()].forEach((k) => { if (!m.has(k)) m.set(k, { taxable: 0, exempt: 0, vatSales: 0, vatRef: 0 }); });
    const rows = [...m].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([k, a]) => [k, inv.get(k) || 0, r2(a.taxable), r2(a.exempt), r2(a.vatSales), r2(a.vatRef), r2(a.vatSales + a.vatRef)]);
    const foot = ["Total", rows.reduce((t, r) => t + r[1], 0), ...[2, 3, 4, 5, 6].map((i) => r2(rows.reduce((t, r) => t + r[i], 0)))];
    return { title: "VAT summary", head: ["Month", "Tax invoices", "Taxable sales ex VAT", "VAT-exempt sales", "VAT on sales", "VAT refunded", "Net VAT collected"], types: "tnmmmmm", rows, foot,
      note: "Output VAT only. VAT you paid on purchases is not tracked here, so your accountant nets it. Discounts reduce the VAT on the sale. Layaways count on the day completed. Confirm this treatment with your accountant." };
  }
  const prods = state.products.filter((p) => !p.noTrack), d = new Map();
  prods.forEach((p) => { const a = d.get(p.category) || [0, 0, 0, 0]; a[0] += 1; a[1] += p.stock; a[2] += p.stock * (p.cost || 0); a[3] += p.stock * p.price; d.set(p.category, a); });
  const rows = [...d].sort((a, b) => b[1][2] - a[1][2]).map(([k, a]) => [k, a[0], r3(a[1]), r2(a[2]), r2(a[3]), r2(a[3] - a[2])]);
  const foot = ["Total", rows.reduce((t, r) => t + r[1], 0), r3(rows.reduce((t, r) => t + r[2], 0)), ...[3, 4, 5].map((i) => r2(rows.reduce((t, r) => t + r[i], 0)))];
  return { title: "Stock value (as of now)", head: ["Department", "Tracked items", "Units", "Value at cost", "Value at selling price ex VAT", "Potential margin"], types: "tnnmmm", rows, foot,
    cards: [["Items not tracked", String(state.products.filter((p) => p.noTrack).length)], ["Value at cost", fm(foot[3])], ["Value at selling price", fm(foot[4])]],
    note: "Only tracked items are counted. Items not tracked yet are not valued, so count them in Stock to include them." };
}
function renderRep() {
  const from = document.getElementById("repFrom").value, to = document.getElementById("repTo").value;
  if (repTab !== "stockval" && (!from || !to || from > to)) { document.getElementById("repOut").innerHTML = "<p class=\"hint\">Pick a valid date range.</p>"; return; }
  const rep = buildRep(repTab, from, to);
  rep.from = from; rep.to = to; lastRep = rep;
  const cellHtml = (v, t) => (t === "t" ? esc(v) : t === "n" ? esc(v) : t === "p" ? esc(v) + "%" : fm(v));
  const row = (r, cls) => `<tr class="${cls || ""}">${r.map((v, i) => `<td class="${rep.types[i] === "t" ? "" : "num"}">${cellHtml(v, rep.types[i])}</td>`).join("")}</tr>`;
  document.getElementById("repOut").innerHTML = `<h3>${esc(rep.title)}${repTab === "stockval" ? "" : ` <small>${esc(from)} to ${esc(to)}</small>`}</h3>
    ${rep.cards ? `<div class="report-grid">${rep.cards.map(([a, b]) => `<div><span>${esc(a)}</span><strong>${esc(b)}</strong></div>`).join("")}</div>` : ""}
    <div class="table-wrap"><table class="data-table"><thead><tr>${rep.head.map((x, i) => `<th class="${rep.types[i] === "t" ? "" : "num"}">${esc(x)}</th>`).join("")}</tr></thead>
    <tbody>${rep.rows.slice(0, 300).map((r) => row(r)).join("") || `<tr><td colspan="${rep.head.length}" class="more-note">Nothing in this range.</td></tr>`}${rep.foot ? row(rep.foot, "total-row") : ""}</tbody></table></div>
    ${rep.rows.length > 300 ? `<p class="hint">Showing 300 of ${rep.rows.length}. The CSV has all of them.</p>` : ""}
    <p class="hint">${esc(rep.note)}</p>`;
}
function repCsv() {
  if (!lastRep) return;
  const rows = [lastRep.head, ...lastRep.rows, ...(lastRep.foot ? [lastRep.foot] : [])];
  download(`report-${repTab}-${lastRep.from || "now"}-${lastRep.to || ""}.csv`, rows.map((r) => r.map(csvCell).join(",")).join("\n"), "text/csv");
  audit("report exported", `${repTab} ${lastRep.from || ""} ${lastRep.to || ""}`);
}
function repPrint() {
  if (!lastRep) return;
  const r = lastRep, fmtc = (v, t) => (t === "t" || t === "n" ? esc(v) : t === "p" ? esc(v) + "%" : fm(v));
  const tr = (row, th) => `<tr>${row.map((v, i) => `<${th ? "th" : "td"} class="${r.types[i] === "t" ? "" : "num"}">${th ? esc(v) : fmtc(v, r.types[i])}</${th ? "th" : "td"}>`).join("")}</tr>`;
  els.printRoot.innerHTML = `<article class="quote-doc"><div class="q-head"><div><strong class="q-store">${esc(state.settings.storeName)}</strong><div>${esc(r.title)}</div>${r.from ? `<div>${esc(r.from)} to ${esc(r.to)}</div>` : ""}</div><div class="q-title"><div>Printed ${esc(new Date().toLocaleDateString("en-BS"))}</div></div></div>
    ${r.cards ? `<div>${r.cards.map(([a, b]) => `<strong>${esc(a)}:</strong> ${esc(b)} &nbsp; `).join("")}</div>` : ""}
    <table><thead>${tr(r.head, true)}</thead><tbody>${r.rows.map((x) => tr(x)).join("")}${r.foot ? tr(r.foot) : ""}</tbody></table><div class="q-terms">${esc(r.note)}</div></article>`;
  document.getElementById("pageStyle").textContent = "@page{size:letter landscape;margin:.5in}";
  document.documentElement.classList.add("sheet-print");
  window.print();
}
document.getElementById("repTabs").addEventListener("click", (e) => { const b = e.target.closest("[data-rtab]"); if (b) { repTab = b.dataset.rtab; renderReportsView(); } });
document.getElementById("repPreset").onchange = (e) => { if (e.target.value !== "custom") { [document.getElementById("repFrom").value, document.getElementById("repTo").value] = presetRange(e.target.value); } renderRep(); };
["repFrom", "repTo"].forEach((id) => { document.getElementById(id).onchange = () => { document.getElementById("repPreset").value = "custom"; renderRep(); }; });
["repGroup", "repSort"].forEach((id) => { document.getElementById(id).onchange = renderRep; });
document.getElementById("repCsv").onclick = repCsv;
document.getElementById("repPrint").onclick = repPrint;
autoSignIn();
