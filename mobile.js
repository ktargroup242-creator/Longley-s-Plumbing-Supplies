// Longleys POS - phone & tablet layer (menu, bottom tabs, sale sheet, scanner, auto-backup, install).
(function () {
  const $ = (s, r) => (r || document).querySelector(s);
  const compact = () => window.matchMedia("(max-width: 899px)").matches;

  // ----- Slide-out menu -----
  const backdrop = document.createElement("div");
  backdrop.className = "backdrop";
  document.body.appendChild(backdrop);

  const menuBtn = document.createElement("button");
  menuBtn.type = "button";
  menuBtn.className = "menu-btn";
  menuBtn.setAttribute("aria-label", "Menu");
  menuBtn.textContent = "☰";
  const topbar = $(".topbar");
  if (topbar) topbar.insertBefore(menuBtn, topbar.firstChild);

  const closeAll = () => document.body.classList.remove("menu-open", "cart-open");
  menuBtn.onclick = () => document.body.classList.toggle("menu-open");
  backdrop.onclick = closeAll;
  const nav = $(".nav");
  if (nav) {
    nav.addEventListener("click", (e) => {
      if (e.target.closest(".nav-btn")) setTimeout(closeAll, 0);
    });
  }
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeAll();
  });

  // ----- Bottom tab bar -----
  const tabs = [
    ["register", "🧾", "Register"],
    ["sales", "📋", "Sales"],
    ["customers", "👥", "Customers"],
    ["menu", "☰", "Menu"]
  ];
  const bar = document.createElement("nav");
  bar.className = "tabbar";
  bar.innerHTML = tabs.map(([v, i, l]) => `<button type="button" data-tab="${v}"><span class="ico">${i}</span>${l}</button>`).join("");
  document.body.appendChild(bar);
  bar.addEventListener("click", (e) => {
    const b = e.target.closest("[data-tab]");
    if (!b) return;
    closeAll();
    if (b.dataset.tab === "menu") {
      document.body.classList.add("menu-open");
      return;
    }
    const navBtn = $(`.nav-btn[data-view="${b.dataset.tab}"]`);
    if (navBtn) navBtn.click();
    window.scrollTo(0, 0);
  });

  function syncActive() {
    const active = $(".nav-btn.active");
    const v = active ? active.dataset.view : "register";
    document.body.classList.toggle("on-register", v === "register");
    bar.querySelectorAll("[data-tab]").forEach((b) => {
      const isMain = tabs.some((t) => t[0] === v && t[0] !== "menu");
      b.classList.toggle("active", b.dataset.tab === v || (!isMain && b.dataset.tab === "menu"));
    });
    closeAll();
  }
  if (nav) {
    new MutationObserver(syncActive).observe(nav, { subtree: true, attributes: true, attributeFilter: ["class"] });
  }
  syncActive();

  // ----- Sale bar + sheet (phones / portrait tablets) -----
  const panel = $(".ticket-panel");
  const cartbar = document.createElement("button");
  cartbar.type = "button";
  cartbar.className = "cartbar";
  document.body.appendChild(cartbar);
  if (panel) {
    const closeX = document.createElement("button");
    closeX.type = "button";
    closeX.className = "sheet-close";
    closeX.setAttribute("aria-label", "Close");
    closeX.textContent = "✕";
    panel.insertBefore(closeX, panel.firstChild);
    closeX.onclick = () => document.body.classList.remove("cart-open");
  }
  cartbar.onclick = () => {
    document.body.classList.remove("menu-open");
    document.body.classList.add("cart-open");
  };

  let lastCount = 0;
  function updateCartbar() {
    const rows = document.querySelectorAll("#cartBody tr").length;
    const totalEl = $("#totalEl");
    const total = totalEl ? totalEl.textContent : "";
    cartbar.innerHTML = `<span>${rows ? `View sale · ${rows} item${rows === 1 ? "" : "s"}` : "Sale is empty"}</span><span>${total}</span>`;
    if (rows > lastCount) {
      cartbar.classList.remove("bump");
      void cartbar.offsetWidth;
      cartbar.classList.add("bump");
    }
    lastCount = rows;
  }
  const cartBody = $("#cartBody");
  const totalEl = $("#totalEl");
  if (cartBody) new MutationObserver(updateCartbar).observe(cartBody, { childList: true, subtree: true });
  if (totalEl) new MutationObserver(updateCartbar).observe(totalEl, { childList: true, characterData: true, subtree: true });
  updateCartbar();

  if (cartBody) {
    new MutationObserver(() => {
      const rows = document.querySelectorAll("#cartBody tr").length;
      if (!rows && !$("#modal:not(.hidden)")) {
        document.body.classList.remove("cart-open");
        if (lastCount > 0) runAutoBackup({ silent: true });
      }
    }).observe(cartBody, { childList: true });
  }

  window.addEventListener("resize", () => {
    if (!compact()) document.body.classList.remove("cart-open");
  });

  // ----- Camera barcode scanner -----
  const search = $("#skuSearch");
  if (search && "BarcodeDetector" in window && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    const sb = document.createElement("button");
    sb.type = "button";
    sb.className = "scan-btn on";
    sb.textContent = "📷";
    sb.setAttribute("aria-label", "Scan barcode");
    search.insertAdjacentElement("afterend", sb);
    sb.onclick = async () => {
      let stream, stop = false;
      const ov = document.createElement("div");
      ov.className = "scan-overlay";
      ov.innerHTML = `<video playsinline muted></video><div class="scan-aim"></div><div class="scan-bar"><span>Point the camera at a barcode</span><button type="button" class="ghost">Cancel</button></div>`;
      document.body.appendChild(ov);
      const done = () => {
        stop = true;
        if (stream) stream.getTracks().forEach((t) => t.stop());
        ov.remove();
      };
      $("button", ov).onclick = done;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
        const video = $("video", ov);
        video.srcObject = stream;
        await video.play();
        const det = new BarcodeDetector();
        const tick = async () => {
          if (stop) return;
          try {
            const codes = await det.detect(video);
            if (codes.length) {
              const val = codes[0].rawValue;
              done();
              search.value = val;
              search.dispatchEvent(new Event("input", { bubbles: true }));
              search.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
              toast("Scanned " + val);
              return;
            }
          } catch (e) {}
          setTimeout(tick, 200);
        };
        tick();
      } catch (err) {
        done();
        toast("Camera not available. Allow camera access for this site.");
      }
    };
  }

  // ----- Toast -----
  let toastEl, toastT;
  function toast(msg) {
    if (!toastEl) {
      toastEl = document.createElement("div");
      toastEl.className = "toast";
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(toastT);
    toastT = setTimeout(() => toastEl.classList.remove("show"), 3200);
  }

  // ----- Automatic Backup Engine -----
  const AUTO_BK_KEY = "longleysPos.autoBackup";
  const BK_FOLDER_NAME = "Longleys-POS-Backups";
  let savedDirHandle = null;

  if (localStorage.getItem(AUTO_BK_KEY) === null) {
    try { localStorage.setItem(AUTO_BK_KEY, "1"); } catch (e) {}
  }
  const isAutoBackupOn = () => localStorage.getItem(AUTO_BK_KEY) !== "0";

  function openBackupDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open("LongleysPOS_Backups", 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains("snapshots")) {
          req.result.createObjectStore("snapshots", { keyPath: "id" });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function collectAppState() {
    const dump = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k) dump[k] = localStorage.getItem(k);
    }
    return JSON.stringify({ app: "Longleys-POS", timestamp: new Date().toISOString(), data: dump }, null, 2);
  }

  async function runAutoBackup({ silent = false, downloadFile = false } = {}) {
    if (!isAutoBackupOn() && !downloadFile) return;
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const fileName = `Longleys-POS-Backup-${stamp}.json`;
    const json = collectAppState();

    try {
      const db = await openBackupDB();
      const tx = db.transaction("snapshots", "readwrite");
      tx.objectStore("snapshots").put({ id: stamp, fileName, createdAt: Date.now(), json });
    } catch (e) {}

    if (savedDirHandle) {
      try {
        const subDir = await savedDirHandle.getDirectoryHandle(BK_FOLDER_NAME, { create: true });
        const fh = await subDir.getFileHandle(fileName, { create: true });
        const w = await fh.createWritable();
        await w.write(json);
        await w.close();
        if (!silent) toast(`Saved to ${BK_FOLDER_NAME}/${fileName}`);
        return;
      } catch (e) {}
    }

    if (downloadFile) {
      const b = $("#exportBackupBtn");
      if (b) {
        b.click();
      } else {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([json], { type: "application/json" }));
        a.download = fileName;
        a.click();
      }
      if (!silent) toast("Backup saved to your Downloads / Files");
    }
  }

  setInterval(() => runAutoBackup({ silent: true }), 30 * 60 * 1000);

  // ----- Menu footer: Auto-backup toggle, Backup now, & Install Help -----
  const foot = $(".sidebar-foot");
  if (foot) {
    const btnStyle = "width:100%;margin:6px 0;color:#fff;background:#2f3033;border-color:#555";
    const backupNote = $("#backupNote");

    const autoBtn = document.createElement("button");
    autoBtn.type = "button";
    autoBtn.className = "ghost";
    autoBtn.style.cssText = btnStyle;
    const syncAutoLabel = () => {
      autoBtn.textContent = `Auto-backup: ${isAutoBackupOn() ? "ON (Every 30m)" : "OFF"}`;
    };
    syncAutoLabel();
    autoBtn.onclick = async () => {
      const next = !isAutoBackupOn();
      try { localStorage.setItem(AUTO_BK_KEY, next ? "1" : "0"); } catch (e) {}
      syncAutoLabel();
      if (next && "showDirectoryPicker" in window && !savedDirHandle) {
        try {
          const root = await window.showDirectoryPicker({ mode: "readwrite" });
          await root.getDirectoryHandle(BK_FOLDER_NAME, { create: true });
          savedDirHandle = root;
          toast(`Created folder "${BK_FOLDER_NAME}" & enabled auto-backup`);
          return;
        } catch (e) {}
      }
      toast(next ? "Automatic backups enabled" : "Automatic backups paused");
    };
    foot.insertBefore(autoBtn, backupNote);

    const bk = document.createElement("button");
    bk.type = "button";
    bk.className = "ghost";
    bk.style.cssText = btnStyle;
    bk.textContent = "Back up now (save file)";
    bk.onclick = () => {
      runAutoBackup({ downloadFile: true });
      closeAll();
    };
    foot.insertBefore(bk, backupNote);

    let deferred;
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const standalone = window.navigator.standalone || window.matchMedia("(display-mode: standalone)").matches;

    const ins = document.createElement("button");
    ins.type = "button";
    ins.className = "ghost";
    ins.style.cssText = btnStyle;
    ins.style.display = standalone ? "none" : "block";
    ins.textContent = "Install app on this device";
    foot.insertBefore(ins, backupNote);

    window.addEventListener("beforeinstallprompt", (e) => {
      e.preventDefault();
      deferred = e;
      ins.style.display = "block";
      ins.textContent = "Install app on this device";
    });

    ins.onclick = async () => {
      if (deferred) {
        deferred.prompt();
        const res = await deferred.userChoice;
        deferred = null;
        if (res && res.outcome === "accepted") ins.style.display = "none";
        return;
      }
      if (isIOS) {
        toast("Tap Safari's Share button, then “Add to Home Screen”");
        return;
      }
      const reg = ("serviceWorker" in navigator) ? await navigator.serviceWorker.getRegistration("./sw.js") : null;
      if (!reg) {
        toast("Install blocked: sw.js failed to load. Check GitHub Pages paths.");
      } else {
        toast("Tap browser menu (⋮) → “Install app” or “Add to Home screen”");
      }
    };

    window.addEventListener("appinstalled", () => {
      ins.style.display = "none";
      toast("App installed!");
    });

    if (isIOS && !standalone && !localStorage.getItem("longleysPos.iosHint")) {
      setTimeout(() => {
        toast("Tip: tap Share, then “Add to Home Screen” to install");
        try { localStorage.setItem("longleysPos.iosHint", "1"); } catch (e) {}
      }, 2500);
    }
  }

  // ----- Offline support -----
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }
})();
