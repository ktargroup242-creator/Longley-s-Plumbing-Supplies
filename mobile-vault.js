// Longleys POS - automatic backup folders for phones and tablets.
// A phone browser cannot be given a folder to write to, so the app creates its own two folders inside its private
// storage (no permission prompts, nothing to set up):
//   Longleys-POS-Data/pos-data.json                 the current data, saved a moment after every change
//   Longleys-POS-Backup/pos-backup-YYYY-MM-DD.json  one copy per day, the last 30 days kept
// It uses the browser's private file system when it has one, and falls back to a database in the browser when it does not.
(function () {
  const KEY = "longleysPos.v1";
  const DATA = "Longleys-POS-Data", BACKUP = "Longleys-POS-Backup", MAIN = "pos-data.json", KEEP = 30;
  const $ = (s) => document.querySelector(s);
  const dayStr = () => new Date().toLocaleDateString("en-CA");

  // ---------- storage layer: private file system first, IndexedDB as the fallback ----------
  let mode = "none", root = null;
  function idb() {
    return new Promise((res, rej) => {
      const r = indexedDB.open("longleysVault", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("files");
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
  }
  const idbDo = async (mode_, fn) => { const db = await idb(); return new Promise((res, rej) => { const tx = db.transaction("files", mode_); const out = fn(tx.objectStore("files")); tx.oncomplete = () => res(out && out.result !== undefined ? out.result : undefined); tx.onerror = () => rej(tx.error); }); };
  async function dirOf(folder) { return root.getDirectoryHandle(folder, { create: true }); }

  async function init() {
    try {
      if (navigator.storage && navigator.storage.getDirectory) {
        root = await navigator.storage.getDirectory();
        const d = await dirOf(DATA); await dirOf(BACKUP);          // creates both folders
        const fh = await d.getFileHandle("probe.tmp", { create: true });
        if (typeof fh.createWritable !== "function") throw new Error("no writer");
        const w = await fh.createWritable(); await w.write("ok"); await w.close();
        await d.removeEntry("probe.tmp");
        mode = "folders";
        return;
      }
    } catch (e) { root = null; }
    try { await idb(); mode = "database"; } catch (e) { mode = "none"; }
  }
  async function vWrite(folder, name, text) {
    if (mode === "folders") {
      const d = await dirOf(folder); const fh = await d.getFileHandle(name, { create: true });
      const w = await fh.createWritable(); await w.write(text); await w.close();
    } else if (mode === "database") await idbDo("readwrite", (st) => st.put(text, folder + "/" + name));
    else throw new Error("no storage");
  }
  async function vRead(folder, name) {
    try {
      if (mode === "folders") { const d = await dirOf(folder); const fh = await d.getFileHandle(name); return await (await fh.getFile()).text(); }
      if (mode === "database") { const db = await idb(); return await new Promise((res, rej) => { const q = db.transaction("files").objectStore("files").get(folder + "/" + name); q.onsuccess = () => res(q.result || null); q.onerror = () => rej(q.error); }); }
    } catch (e) { return null; }
    return null;
  }
  async function vList(folder) {
    try {
      if (mode === "folders") { const d = await dirOf(folder); const out = []; for await (const [n, h] of d.entries()) if (h.kind === "file") out.push({ name: n, size: (await h.getFile()).size }); return out; }
      if (mode === "database") { const db = await idb(); return await new Promise((res, rej) => { const out = []; const q = db.transaction("files").objectStore("files").openCursor(); q.onsuccess = () => { const c = q.result; if (!c) return res(out); if (String(c.key).startsWith(folder + "/")) out.push({ name: String(c.key).slice(folder.length + 1), size: String(c.value).length }); c.continue(); }; q.onerror = () => rej(q.error); }); }
    } catch (e) {}
    return [];
  }
  async function vDelete(folder, name) {
    try {
      if (mode === "folders") { const d = await dirOf(folder); await d.removeEntry(name); }
      else if (mode === "database") await idbDo("readwrite", (st) => st.delete(folder + "/" + name));
    } catch (e) {}
  }

  // ---------- saving ----------
  let ready = false, dirty = false, timer = null, lastText = "", lastOk = 0, lastErr = "";
  function status() {
    const el = $("#vaultNote"); if (!el) return;
    if (mode === "none") { el.textContent = "Auto-save not available in this browser. Use Save a copy."; el.classList.add("warn"); return; }
    if (lastErr) { el.textContent = "Auto-save problem: " + lastErr; el.classList.add("warn"); return; }
    const age = Date.now() - lastOk;
    el.classList.remove("warn");
    el.textContent = !lastOk ? "Auto-save on (folders created)" : age < 60e3 ? "Auto-saved on this device just now" : age < 3600e3 ? `Auto-saved ${Math.floor(age / 60e3)} min ago` : `Auto-saved ${Math.floor(age / 3600e3)} h ago`;
  }
  async function saveNow() {
    clearTimeout(timer); timer = null;
    if (!ready || mode === "none") return;
    const text = localStorage.getItem(KEY);
    if (!text || text === lastText) { dirty = false; return; }
    try {
      await vWrite(DATA, MAIN, text);
      await vWrite(BACKUP, `pos-backup-${dayStr()}.json`, text);
      lastText = text; lastOk = Date.now(); lastErr = ""; dirty = false;
      const names = (await vList(BACKUP)).map((f) => f.name).filter((n) => /^pos-backup-\d{4}-\d{2}-\d{2}\.json$/.test(n)).sort();
      for (const n of names.slice(0, Math.max(0, names.length - KEEP))) await vDelete(BACKUP, n);
    } catch (e) { lastErr = (e && e.name) || "could not write"; console.warn("Vault", e); }
    status();
  }
  function schedule() { dirty = true; clearTimeout(timer); timer = setTimeout(saveNow, 1500); }
  window.addEventListener("pos-saved", schedule);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden" && dirty) saveNow(); });
  window.addEventListener("pagehide", () => { if (dirty) saveNow(); });

  // ---------- startup: protect against a wiped browser, or newer data in the folder ----------
  const fmt = (t) => new Date(t).toLocaleString("en-BS", { dateStyle: "medium", timeStyle: "short" });
  async function startup() {
    await init();
    if (mode !== "none") {
      const vt = await vRead(DATA, MAIN);
      if (vt) {
        let vd = null; try { vd = JSON.parse(vt); } catch (e) {}
        const boot = typeof bootSavedAt === "number" ? bootSavedAt : 0;     // what the browser held before this start
        if (vd && Array.isArray(vd.products) && Array.isArray(vd.sales) && vd.settings) {
          if (!boot && !sessionStorage.getItem("vaultRestored")) {
            // The browser's own copy is empty (cleared by the phone?) but the backup folder has your data: put it back.
            sessionStorage.setItem("vaultRestored", "1");
            localStorage.setItem(KEY, vt); location.reload(); return;
          }
          if ((vd.savedAt || 0) > boot + 2000 && boot) {
            const ok = confirm(`The automatic backup folder on this device has newer data (saved ${fmt(vd.savedAt)}, ${vd.sales.length} sales) than the app is showing.\n\nOK = load the backup folder's data.\nCancel = keep what the app shows (the folder copy is kept as a separate file).`);
            if (ok) { localStorage.setItem(KEY, vt); location.reload(); return; }
            try { await vWrite(BACKUP, `pos-before-overwrite-${Date.now()}.json`, vt); } catch (e) {}
          }
        }
      }
    }
    ready = true; lastText = "";
    await saveNow();
    status(); setInterval(status, 30000);
  }

  // ---------- menu buttons ----------
  const foot = document.querySelector(".sidebar-foot");
  const note = document.createElement("p");
  note.id = "vaultNote"; note.className = "vat-note"; note.textContent = "Setting up auto-save…";
  const btnCss = "width:100%;margin:6px 0;color:#fff;background:#2f3033;border-color:#555";
  const mk = (txt) => { const b = document.createElement("button"); b.type = "button"; b.className = "ghost"; b.style.cssText = btnCss; b.textContent = txt; return b; };
  const share = mk("Save a copy to Files / Drive");
  const copies = mk("Auto-saved copies on this device");
  foot.querySelectorAll("button").forEach((b) => { if (/back up now/i.test(b.textContent)) b.remove(); }); // replaced by the share button below
  const anchor = document.getElementById("backupNote");
  foot.insertBefore(share, anchor); foot.insertBefore(copies, anchor); foot.insertBefore(note, anchor);

  share.onclick = async () => {
    try {
      const data = JSON.stringify(snapshotState(), null, 1);
      const file = new File([data], `longleys-pos-backup-${dayStr()}.json`, { type: "application/json" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: "Longleys POS backup" });
      } else { document.getElementById("exportBackupBtn").click(); }
      state.lastBackupAt = Date.now(); saveState(); updateBackupNote();
    } catch (e) { if (e && e.name !== "AbortError") document.getElementById("exportBackupBtn").click(); }
    document.body.classList.remove("menu-open");
  };

  copies.onclick = async () => {
    document.body.classList.remove("menu-open");
    if (mode === "none") return alert("This browser cannot keep automatic copies. Use \"Save a copy to Files / Drive\" regularly.");
    await saveNow();
    const files = (await vList(BACKUP)).filter((f) => /\.json$/.test(f.name)).sort((a, b) => b.name.localeCompare(a.name));
    const rows = files.map((f) => `<button type="button" class="ghost vault-row" data-f="${f.name.replace(/"/g, "")}"><span>${f.name.replace(/^pos-backup-|\.json$/g, "").replace(/^pos-/, "")}</span><em>${Math.round(f.size / 1024)} KB</em></button>`).join("");
    openModal(`<h3>Auto-saved copies</h3>
      <p class="hint">The POS saves these by itself in the folders <b>${DATA}</b> and <b>${BACKUP}</b> inside the app${mode === "database" ? " (this browser keeps them in its database)" : ""}. One copy per day, last ${KEEP} days. Tap a day to put that copy back.</p>
      <div class="vault-list">${rows || "<p class=\"hint\">No copies yet.</p>"}</div>
      <div class="modal-actions"><button type="button" class="ghost" id="vaultClose">Close</button></div>`);
    document.getElementById("vaultClose").onclick = closeModal;
    document.querySelectorAll(".vault-row").forEach((b) => b.onclick = async () => {
      const t = await vRead(BACKUP, b.dataset.f);
      let d = null; try { d = JSON.parse(t); } catch (e) {}
      if (!d || !Array.isArray(d.products) || !Array.isArray(d.sales) || !d.settings) return alert("That copy could not be read.");
      if (!confirm(`Put back the copy from ${fmt(d.savedAt || Date.now())} (${d.sales.length} sales, ${d.products.length} items)?\n\nWhat the app shows now is saved first as a separate copy.`)) return;
      try { await vWrite(BACKUP, `pos-before-restore-${Date.now()}.json`, localStorage.getItem(KEY) || ""); } catch (e) {}
      localStorage.setItem(KEY, t); location.reload();
    });
  };

  if (document.readyState === "complete") startup(); else window.addEventListener("load", () => setTimeout(startup, 400));
})();
