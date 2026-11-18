(function () {
  var d = document, root = d.documentElement;
  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) {} }
  var saved = store('pigeon-theme'); if (saved) root.setAttribute('data-theme', saved);
  d.querySelectorAll('[data-theme-toggle]').forEach(function (b) {
    b.addEventListener('click', function () {
      var dark = root.getAttribute('data-theme') ? root.getAttribute('data-theme') === 'dark' : matchMedia('(prefers-color-scheme:dark)').matches;
      var next = dark ? 'light' : 'dark'; root.setAttribute('data-theme', next); store('pigeon-theme', next);
    });
  });
  // copy buttons
  d.querySelectorAll('.code').forEach(function (c) {
    var pre = c.querySelector('pre'); if (!pre) return;
    var b = d.createElement('button'); b.className = 'copy'; b.type = 'button'; b.textContent = 'Copy';
    b.setAttribute('aria-label', 'Copy code to clipboard');
    b.addEventListener('click', function () {
      var text = pre.innerText.replace(/^\$ /gm, '');
      var done = function () { b.textContent = 'Copied'; setTimeout(function () { b.textContent = 'Copy'; }, 1500); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback); else fallback();
      function fallback() { var t = d.createElement('textarea'); t.value = text; d.body.appendChild(t); t.select(); try { d.execCommand('copy'); done(); } catch (e) { b.textContent = 'Select & copy'; } t.remove(); }
    });
    c.appendChild(b);
  });
  // lightbox
  var dlg = d.createElement('dialog'); dlg.className = 'lb'; dlg.setAttribute('aria-label', 'Enlarged figure');
  dlg.innerHTML = '<div class="in"><button class="btn" type="button">Close ✕</button><div class="body"></div></div>';
  d.body.appendChild(dlg);
  dlg.addEventListener('click', function (e) { if (e.target === dlg || e.target.tagName === 'BUTTON') dlg.close(); });
  d.querySelectorAll('.shot button').forEach(function (b) {
    b.setAttribute('aria-label', 'Enlarge figure');
    b.addEventListener('click', function () {
      var body = dlg.querySelector('.body'); body.innerHTML = '';
      var el = b.firstElementChild.cloneNode(true); body.appendChild(el);
      if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
    });
  });
  // mobile sidebar
  var sb = d.querySelector('.sbtn'), side = d.querySelector('.side');
  if (sb && side) sb.addEventListener('click', function () { var o = side.classList.toggle('open'); sb.setAttribute('aria-expanded', o); });
  // toc scrollspy
  var links = [].slice.call(d.querySelectorAll('.toc a'));
  if (links.length && 'IntersectionObserver' in window) {
    var map = {}; links.forEach(function (a) { map[a.getAttribute('href').slice(1)] = a; });
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { links.forEach(function (l) { l.classList.remove('act'); }); var a = map[e.target.id]; if (a) a.classList.add('act'); } });
    }, { rootMargin: '-80px 0px -70% 0px' });
    Object.keys(map).forEach(function (id) { var el = d.getElementById(id); if (el) io.observe(el); });
  }
  // open <details> targeted by hash
  function openHash() { var h = location.hash.slice(1); if (!h) return; var el = d.getElementById(h); var det = el && (el.tagName === 'DETAILS' ? el : el.closest('details')); if (det) det.open = true; }
  addEventListener('hashchange', openHash); openHash();
  // search
  var q = d.getElementById('q'), out = d.getElementById('results');
  if (q && out && window.PIGEON_INDEX) {
    q.addEventListener('input', function () {
      var t = q.value.trim().toLowerCase(); out.innerHTML = ''; if (t.length < 2) return;
      var words = t.split(/\s+/);
      var hits = window.PIGEON_INDEX.map(function (e) {
        var hay = (e.h + ' ' + e.t).toLowerCase(), s = 0;
        for (var i = 0; i < words.length; i++) { if (hay.indexOf(words[i]) < 0) return null; if (e.h.toLowerCase().indexOf(words[i]) >= 0) s += 3; s += 1; }
        return { e: e, s: s };
      }).filter(Boolean).sort(function (a, b) { return b.s - a.s; }).slice(0, 8);
      if (!hits.length) { out.innerHTML = '<li class="note">No matches.</li>'; return; }
      hits.forEach(function (h) {
        var li = d.createElement('li'), a = d.createElement('a'); a.href = window.PIGEON_BASE + h.e.u; a.textContent = h.e.h;
        var s = d.createElement('small'); s.textContent = h.e.p; a.appendChild(s); li.appendChild(a); out.appendChild(li);
      });
    });
    d.addEventListener('keydown', function (e) { if (e.key === '/' && !/INPUT|TEXTAREA/.test(d.activeElement.tagName)) { e.preventDefault(); q.focus(); } });
  }
})();
