// On an iPhone or iPad a link marked data-ios-href goes to the App Store,
// where the app's own free week lives, and takes its data-ios-label if it has
// one. Anything marked data-ios-hide goes, so a box keeps one App Store link.
// Everywhere else the links stay on troystack.com, since Android and desktop
// visitors can't install the iPhone app.
(function() {
    var ua = navigator.userAgent || '';
    var iOS = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
    if (!iOS) return;
    document.querySelectorAll('[data-ios-hide]').forEach(function(el) { el.style.display = 'none'; });
    document.querySelectorAll('a[data-ios-href]').forEach(function(a) {
        a.href = a.getAttribute('data-ios-href');
        if (a.hasAttribute('data-ios-label')) a.textContent = a.getAttribute('data-ios-label');
        a.target = '_blank';
        a.rel = 'noopener';
    });
})();
