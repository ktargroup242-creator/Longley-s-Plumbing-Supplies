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
  document.documentElement.classList.add("mobile-build");
})();
