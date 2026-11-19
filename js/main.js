/* Boot. */
(function () {
  'use strict';
  const start = () => globalThis.TB.UI.start();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
