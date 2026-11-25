// Phone/tablet build: there is no PC helper (cash drawer / backup program) on a phone,
// so calls to it fail immediately instead of retrying for minutes.
(function () {
  const realFetch = window.fetch.bind(window);
  window.fetch = function (url, opts) {
    if (typeof url === "string" && url.indexOf("127.0.0.1:9101") !== -1) {
      return Promise.reject(new TypeError("No PC helper on this device"));
    }
    return realFetch(url, opts);
  };
  // Phones cannot pick a folder to write to, so make sure the app never waits for one.
  try { Object.defineProperty(window, "showDirectoryPicker", { value: undefined, configurable: true }); } catch (e) {}
  // Catch Chrome's "this app can be installed" signal as early as possible.
  window.addEventListener("beforeinstallprompt", function (e) {
    e.preventDefault();
    window.__installEvt = e;
    window.dispatchEvent(new Event("longleys-install-ready"));
  });
  window.addEventListener("appinstalled", function () { window.__installEvt = null; });
  // Tell the automatic backup (mobile-vault.js) whenever the POS saves its data.
  const realSet = Storage.prototype.setItem;
  Storage.prototype.setItem = function (k, v) {
    const r = realSet.apply(this, arguments);
    if (this === window.localStorage && k === "longleysPos.v1") window.dispatchEvent(new Event("pos-saved"));
    return r;
  };
  document.documentElement.classList.add("mobile-build");
})();
