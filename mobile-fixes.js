// Longleys POS - phone & tablet fixes: "Can't install?" help, and hides the PC-only folder settings.
// Loaded after mobile-vault.js. (Automatic backups themselves are handled by mobile-vault.js.)
(function () {
  "use strict";
  const $ = (s, r) => (r || document).querySelector(s);
  let toastEl, toastT;
  function toast(msg) {
    if (!toastEl) { toastEl = document.createElement("div"); toastEl.className = "toast"; document.body.appendChild(toastEl); }
    toastEl.textContent = msg; toastEl.classList.add("show");
    clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.remove("show"), 2600);
  }
  function overlay(html) {
    const ov = document.createElement("div");
    ov.className = "bk-overlay";
    ov.innerHTML = `<div class="bk-card">${html}<div class="bk-actions"><button type="button" class="ghost" data-close>Close</button></div></div>`;
    ov.addEventListener("click", (e) => { if (e.target === ov || e.target.closest("[data-close]")) ov.remove(); });
    document.body.appendChild(ov);
    return ov;
  }

  // ---------- "Can't install?" help ----------
  const standalone = () => window.navigator.standalone || window.matchMedia("(display-mode: standalone)").matches;

  async function installChecks() {
    const ua = navigator.userAgent;
    const out = []; // [status, text]  status: ok | bad | warn
    if (standalone()) out.push(["ok", "The app is already installed: you are using the installed app right now."]);

    if (location.protocol === "file:") out.push(["bad", "You opened the files straight from the phone. A phone can only install an app from a web address. Upload the folder first (README, Step 1), then open the https:// address in Chrome."]);
    else if (!window.isSecureContext) out.push(["bad", "This address starts with http://, which is not secure. Android only installs apps from https:// addresses. Netlify, GitHub Pages and Cloudflare Pages addresses are https automatically."]);
    else out.push(["ok", "The address is secure (https)."]);

    if (/; wv\)|FBAN|FBAV|Instagram|WhatsApp|Snapchat|Line\//i.test(ua)) out.push(["bad", "You are inside another app's built-in browser. Tap the three dots and choose \"Open in Chrome\", then install from there."]);
    else if (/Chrome\//.test(ua) && !/EdgA|OPR\/|SamsungBrowser|Firefox|Vivaldi|DuckDuckGo/i.test(ua)) out.push(["ok", "You are using Chrome."]);
    else if (/SamsungBrowser|Firefox/i.test(ua)) out.push(["warn", "This browser can install too, but Chrome is the most reliable on Android."]);
    else out.push(["warn", "Use Chrome on Android: other browsers often cannot install apps."]);

    if (location.protocol !== "file:" && window.isSecureContext) {
      try {
        const r = await fetch("manifest.webmanifest", { cache: "no-store" });
        if (!r.ok) throw new Error("HTTP " + r.status);
        const m = await r.json();
        const sizes = (m.icons || []).map((i) => i.sizes);
        if (!(sizes.includes("192x192") && sizes.includes("512x512"))) out.push(["bad", "The install file is missing its 192 and 512 icons."]);
        else out.push(["ok", "Install details file (manifest) found."]);
      } catch (e) {
        out.push(["bad", "The install details file (manifest.webmanifest) could not be loaded. Upload the WHOLE folder again, including that file."]);
      }
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg && reg.active) out.push(["ok", "Offline support is running."]);
        else out.push(["warn", "Offline support has not started yet. Close the app completely, open it again, wait a few seconds, then check again."]);
      } catch (e) { out.push(["warn", "Offline support could not start in this browser."]); }
    }

    if (!standalone()) {
      if (window.__installEvt) out.push(["ok", "Chrome says this app CAN be installed. Tap \"Install now\" below."]);
      else out.push(["warn", "Chrome has not offered the install yet. If you installed it before, look for \"Longleys POS\" in your app list or home screen. Otherwise open Chrome's three-dot menu and choose \"Install app\" or \"Add to Home screen\"."]);
    }
    return out;
  }

  async function installHelp() {
    const ov = overlay(`<h3>Can't install? Checking…</h3><p class="hint">One moment.</p>`);
    const checks = await installChecks();
    const icon = { ok: "✅", bad: "❌", warn: "⚠️" };
    const report = checks.map((c) => `${icon[c[0]]} ${c[1]}`).join("\n");
    const bad = checks.some((c) => c[0] === "bad");
    ov.querySelector(".bk-card").innerHTML = `<h3>${bad ? "Found what is blocking the install" : "Install check"}</h3>
      ${checks.map((c) => `<p class="bk-check-line">${icon[c[0]]} ${c[1]}</p>`).join("")}
      <p class="hint">Address: ${location.origin}${location.pathname}</p>
      <div class="bk-actions">
        ${window.__installEvt && !standalone() ? '<button type="button" class="primary" data-install>Install now</button>' : ""}
        <button type="button" class="ghost" data-copy>Copy details</button>
        <button type="button" class="ghost" data-close>Close</button>
      </div>`;
    const ib = ov.querySelector("[data-install]");
    if (ib) ib.onclick = async () => { const e = window.__installEvt; if (!e) return; e.prompt(); try { await e.userChoice; } catch (x) { /* ignore */ } window.__installEvt = null; ov.remove(); };
    const cb = ov.querySelector("[data-copy]");
    cb.onclick = async () => {
      const full = `Longleys POS install check\nAddress: ${location.href}\nBrowser: ${navigator.userAgent}\n\n${report}`;
      try { await navigator.clipboard.writeText(full); toast("Copied"); } catch (e) { toast("Could not copy"); }
    };
  }

  function buildMenu() {
    const foot = $(".sidebar-foot");
    if (!foot || standalone()) return;
    const b = document.createElement("button");
    b.type = "button"; b.className = "ghost";
    b.style.cssText = "width:100%;margin:6px 0;color:#fff;background:#2f3033;border-color:#555";
    b.textContent = "Can't install? Tap here";
    b.onclick = () => { document.body.classList.remove("menu-open"); installHelp(); };
    foot.insertBefore(b, $("#backupNote"));
  }

  // The PC folder settings (Data folder / Second backup folder) cannot work on a phone: hide them.
  function hidePcFolders() {
    Array.from(document.querySelectorAll("#view-settings h2")).forEach((h) => {
      if (!/^(Data folder|Second backup folder)/i.test(h.textContent)) return;
      h.classList.add("pc-only");
      for (let n = h.nextElementSibling; n && n.tagName !== "H2"; n = n.nextElementSibling) n.classList.add("pc-only");
    });
  }

  hidePcFolders();
  buildMenu();
})();
