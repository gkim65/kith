// Runs before first paint: set the saved (or system) theme so the page does not flash the wrong colours.

(function () {
  let t = null;
  try { t = localStorage.getItem('kith_theme'); } catch (e) {}
  if (t !== 'light' && t !== 'dark') {
    t = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  document.documentElement.dataset.theme = t;
})();
