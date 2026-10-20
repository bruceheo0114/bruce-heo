/* Bruce Heo interaction events. Reuses the existing GA4 tag; no page_view or outbound click is sent here. */
(function () {
  'use strict';
  if (window.__bruceInteractionsV1) return;
  window.__bruceInteractionsV1 = true;
  document.addEventListener('click', function (event) {
    if (event.button != null && event.button !== 0) return;
    var target = event.target;
    var link = target && target.closest && target.closest('a[href]');
    if (!link || typeof window.gtag !== 'function') return;
    var url;
    try { url = new URL(link.getAttribute('href'), window.location.href); }
    catch (_) { return; }
    var name, params;
    if (url.protocol === 'mailto:') {
      name = 'contact_click';
      params = { contact_method: 'email' };
    } else if (url.origin === window.location.origin &&
      ((/^\/(en\/)?(index\.html)?$/.test(url.pathname) && url.hash === '#about') ||
       /^\/(en\/)?career\/(index\.html)?$/.test(url.pathname))) {
      name = 'profile_click';
      params = { link_url: url.origin + url.pathname + url.hash };
    } else { return; }
    var section = link.closest('section[id], header[id], nav[id], footer');
    params.link_position = section ? (section.id || section.tagName.toLowerCase()) : 'body';
    params.send_to = 'G-17SXL7Q2XV';
    window.gtag('event', name, params);
  }, true);
}());
