// Longleys POS - phone & tablet layer (menu, bottom tabs, sale sheet, scanner, backup, install).
(function () {
  const $ = (s, r) => (r || document).querySelector(s);
  const compact = () => window.matchMedia("(max-width: 899px)").matches;

  // ----- Slide-out menu -----
  const backdrop = document.createElement("div");
  backdrop.className = "backdrop";
  document.body.appendChild(backdrop);

  const menuBtn = document.createElement("button");
  menuBtn.type = "button"; menuBtn.className = "menu-btn"; menuBtn.setAttribute("aria-label", "Menu"); menuBtn.textContent = "☰";
  const topbar = $(".topbar");
  topbar.insertBefore(menuBtn, topbar.firstChild);

  const closeAll = () => document.body.classList.remove("menu-open", "cart-open");
  menuBtn.onclick = () => document.body.classList.toggle("menu-open");
  backdrop.onclick = closeAll;
  // Picking something in the menu closes it.
  $(".nav").addEventListener("click", (e) => { if (e.target.closest(".nav-btn")) setTimeout(closeAll, 0); });
  window.addEventListener("keydown", (e) => { if (e.key === "Escape") closeAll(); });

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
    if (b.dataset.tab === "menu") { document.body.classList.add("menu-open"); return; }
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
  new MutationObserver(syncActive).observe($(".nav"), { subtree: true, attributes: true, attributeFilter: ["class"] });
  syncActive();

  // ----- Sale bar + sheet (phones / portrait tablets) -----
  const panel = $(".ticket-panel");
  const cartbar = document.createElement("button");
  cartbar.type = "button"; cartbar.className = "cartbar";
  document.body.appendChild(cartbar);
  const closeX = document.createElement("button");
  closeX.type = "button"; closeX.className = "sheet-close"; closeX.setAttribute("aria-label", "Close"); closeX.textContent = "✕";
  panel.insertBefore(closeX, panel.firstChild);
  closeX.onclick = () => document.body.classList.remove("cart-open");
  cartbar.onclick = () => { document.body.classList.remove("menu-open"); document.body.classList.add("cart-open"); };

  let lastCount = 0;
  function updateCartbar() {
    const rows = document.querySelectorAll("#cartBody tr").length;
    let qty = 0;
    document.querySelectorAll("#cartBody .qty-input").forEach((i) => { qty += parseFloat(i.value) || 0; });
    const total = $("#totalEl").textContent;
    cartbar.innerHTML = `<span>${rows ? `View sale · ${rows} item${rows === 1 ? "" : "s"}` : "Sale is empty"}</span><span>${total}</span>`;
    if (rows > lastCount) { cartbar.classList.remove("bump"); void cartbar.offsetWidth; cartbar.classList.add("bump"); }
    lastCount = rows;
  }
  new MutationObserver(updateCartbar).observe($("#cartBody"), { childList: true, subtree: true });
  new MutationObserver(updateCartbar).observe($("#totalEl"), { childList: true, characterData: true, subtree: true });
  updateCartbar();

  // After a sale is finished the app clears the cart: close the sheet when it becomes empty.
  new MutationObserver(() => {
    if (!document.querySelectorAll("#cartBody tr").length && !$("#modal:not(.hidden)")) document.body.classList.remove("cart-open");
  }).observe($("#cartBody"), { childList: true });

  window.addEventListener("resize", () => { if (!compact()) document.body.classList.remove("cart-open"); });

  // ----- Camera barcode scanner (Chrome on Android; hidden where the browser can't do it) -----
  const search = $("#skuSearch");
  if ("BarcodeDetector" in window && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    const sb = document.createElement("button");
    sb.type = "button"; sb.className = "scan-btn on"; sb.textContent = "📷"; sb.setAttribute("aria-label", "Scan barcode");
    search.insertAdjacentElement("afterend", sb);
    sb.onclick = async () => {
      let stream, stop = false;
      const ov = document.createElement("div");
      ov.className = "scan-overlay";
      ov.innerHTML = `<video playsinline muted></video><div class="scan-aim"></div><div class="scan-bar"><span>Point the camera at a barcode</span><button type="button" class="ghost">Cancel</button></div>`;
      document.body.appendChild(ov);
      const done = () => { stop = true; if (stream) stream.getTracks().forEach((t) => t.stop()); ov.remove(); };
      $("button", ov).onclick = done;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
        const video = $("video", ov);
        video.srcObject = stream; await video.play();
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
          } catch (e) { /* keep trying */ }
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
    if (!toastEl) { toastEl = document.createElement("div"); toastEl.className = "toast"; document.body.appendChild(toastEl); }
    toastEl.textContent = msg; toastEl.classList.add("show");
    clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.remove("show"), 2200);
  }

  // ----- Menu footer: back up now / install -----
  const foot = $(".sidebar-foot");
  const bk = document.createElement("button");
  bk.type = "button"; bk.className = "ghost"; bk.style.cssText = "width:100%;margin:6px 0;color:#fff;background:#2f3033;border-color:#555";
  bk.textContent = "Back up now (save file)";
  bk.onclick = () => { const b = $("#exportBackupBtn"); if (b) b.click(); closeAll(); toast("Backup saved to your Downloads / Files"); };
  foot.insertBefore(bk, $("#backupNote"));

  let deferred;
  const ins = document.createElement("button");
  ins.type = "button"; ins.className = "ghost"; ins.style.cssText = "display:none;width:100%;margin:6px 0;color:#fff;background:#2f3033;border-color:#555";
  ins.textContent = "Install app on this device";
  foot.insertBefore(ins, $("#backupNote"));
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferred = e; ins.style.display = "block"; });
  ins.onclick = async () => { if (!deferred) return; deferred.prompt(); await deferred.userChoice; deferred = null; ins.style.display = "none"; };
  window.addEventListener("appinstalled", () => { ins.style.display = "none"; });

  // iPhone/iPad: Safari has no install button, so show a one-time hint.
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const standalone = window.navigator.standalone || window.matchMedia("(display-mode: standalone)").matches;
  if (isIOS && !standalone && !localStorage.getItem("longleysPos.iosHint")) {
    setTimeout(() => {
      toast("Tip: tap Share, then “Add to Home Screen” to install");
      try { localStorage.setItem("longleysPos.iosHint", "1"); } catch (e) {}
    }, 2500);
  }

  // ----- Offline support -----
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
})();
