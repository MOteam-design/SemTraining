/* Общая «бухгалтерия» Семёна для обеих страниц (index.html и mama.html).
   Источники правды, без компьютера и бота:
     claims.json  — в приватном репозитории SemReports, пишет приложение Семёна (что он отметил);
     mom.json     — в SemTraining, пишет приложение мамы (журнал решений: ok/no/paid/fine/…).
   SEM.derive(claims, actions) -> состояние: что подтверждено, статусы дней, штрафы, выплаты, книги, доклады, задачки.
   Та же логика повторена в job_agent/semyon_fetch.py (derive) — менять вместе. */
(function () {
  var WORK = { 'str-a': 1, 'str-b': 1, 'str-c': 1, 'bike': 1 };
  var C = { BONUS: 100, MAX: 1500, PROJ: 400, WORK: WORK };
  function bookPrice(p) { return Math.round((+p || 0) * 500 / 300 / 10) * 10; }
  function norm(o) { var r = {}; Object.keys(o || {}).sort().forEach(function (k) { r[k] = +o[k] || 0; }); return JSON.stringify(r); }
  function isExtra(k) { return k.indexOf('book-') === 0 || k.indexOf('proj-') === 0; }
  function copy(o) { var r = {}; for (var k in o) r[k] = o[k]; return r; }

  function derive(claims, actions) {
    claims = claims || {};
    var CL = claims.done || {};
    var S = { claimed: CL, confirmed: {}, status: {}, paid: {}, fines: [], books: {}, projects: {}, topics: null,
              puzzles: {}, answers: claims.pzAns || {}, tests: claims.tests || {}, hnames: claims.hnames || {}, updated: claims.updated || null };
    var dec = {}, extra = {};
    Object.keys(claims.books || {}).forEach(function (k) {
      var b = claims.books[k];
      if (b && b.f) S.books[k] = { d: b.f, pages: b.p, title: b.t, status: 'new', reward: bookPrice(b.p) };
    });
    Object.keys(claims.projs || {}).forEach(function (k) {
      var p = claims.projs[k];
      if (p) S.projects[k] = { d: p.ready || p.picked, state: p.ready ? 'ready' : 'pick', topic: p.topic, status: 'new', reward: C.PROJ };
    });
    (actions || []).forEach(function (a) {
      var t = a.t;
      if (t === 'ok' || t === 'no') { if (a.d) dec[a.d] = { s: t, ids: a.ids || CL[a.d] || {} }; }
      else if (t === 'paid') { if (a.mon) S.paid[a.mon] = { sum: +a.sum || 0, at: (a.at || '').slice(0, 10) }; }
      else if (t === 'fine') { S.fines = S.fines.filter(function (f) { return f.id !== a.fid; }); S.fines.push({ id: a.fid, d: a.d, a: +a.a || 0, r: a.r || '' }); }
      else if (t === 'unfine') { S.fines = S.fines.filter(function (f) { return f.id !== a.fid; }); }
      else if (t === 'bok' || t === 'bno') { var b = S.books[a.ref]; if (b) { b.status = t === 'bok' ? 'ok' : 'no'; b.decidedAt = b.d; } }
      else if (t === 'pok' || t === 'pno') { var p = S.projects[a.ref]; if (p) { p.status = t === 'pok' ? 'ok' : 'no'; p.tries = +a.tries || 1; } }
      else if (t === 'topics') { S.topics = { id: a.id, list: a.list || [] }; }
      else if (t === 'pz') { if (a.d && a.pid) S.puzzles[a.d] = a.pid; }
      else if (t === 'unpz') { delete S.puzzles[a.d]; }
    });
    // проект «не принят», а Семён снова нажал «выступил» позже — снова на проверку
    Object.keys(S.projects).forEach(function (k) { var p = S.projects[k], c = (claims.projs || {})[k]; p.cur = (c && c.tries) || 1; if (p.status === 'no' && c && c.ready && p.cur > p.tries) p.status = 'new'; });
    var days = {}; Object.keys(CL).forEach(function (d) { days[d] = 1; }); Object.keys(dec).forEach(function (d) { days[d] = 1; });
    Object.keys(days).forEach(function (d) {
      var cl = CL[d] || {}, x = dec[d];
      if (x) {
        if (x.s === 'ok') S.confirmed[d] = copy(x.ids);
        S.status[d] = norm(cl) === norm(x.ids) || !Object.keys(cl).length ? x.s : 'new';
      } else if (Object.keys(cl).length) S.status[d] = 'new';
    });
    Object.keys(S.books).forEach(function (k) { var b = S.books[k]; if (b.status === 'ok') (S.confirmed[b.d] = S.confirmed[b.d] || {})['book-' + k] = b.reward; });
    Object.keys(S.projects).forEach(function (k) { var p = S.projects[k]; if (p.status === 'ok') (S.confirmed[p.d] = S.confirmed[p.d] || {})['proj-' + k] = p.reward; });
    S.applied = (actions || []).map(function (a) { return a.id; });
    return S;
  }

  function iso(d) { return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function week(S, mon) {
    var days = [], daily = 0, ex = 0, work = 0, fine = 0, pend = 0, claimed = 0;
    for (var i = 0; i < 7; i++) {
      var d = iso(new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + i)); days.push(d);
      var c = S.confirmed[d] || {};
      for (var k in c) { if (isExtra(k)) ex += +c[k] || 0; else daily += +c[k] || 0; if (WORK[k]) work++; }
      if (S.status[d] === 'new') { pend++; var cl = S.claimed[d] || {}; for (var j in cl) claimed += +cl[j] || 0; }
    }
    (S.fines || []).forEach(function (f) { if (f.d >= days[0] && f.d <= days[6]) fine += +f.a || 0; });
    var b = work >= 6 ? C.BONUS : 0;
    return { mon: days[0], days: days, xp: daily + ex, work: work, bonus: b, fine: fine, pend: pend, claimed: claimed,
             capped: daily + b > C.MAX, total: Math.max(0, Math.min(C.MAX, daily + b) + ex - fine) };
  }

  // GitHub Contents API helpers (UTF-8 safe)
  function b64e(s) { return btoa(unescape(encodeURIComponent(s))); }
  function b64d(s) { return decodeURIComponent(escape(atob(String(s).replace(/\n/g, '')))); }
  function gh(repo, path, key, method, body) {
    var h = { 'Accept': 'application/vnd.github+json' }; if (key) h.Authorization = 'Bearer ' + key;
    return fetch('https://api.github.com/repos/MOteam-design/' + repo + '/contents/' + path + (method ? '' : '?t=' + Date.now()),
      { method: method || 'GET', cache: 'no-store', headers: h, body: body ? JSON.stringify(body) : undefined });
  }
  function readJSON(repo, path, key) {
    return gh(repo, path, key).then(function (r) {
      if (r.status === 404) return { sha: null, data: null };
      if (!r.ok) throw new Error('GitHub ' + r.status);
      return r.json().then(function (j) { return { sha: j.sha, data: JSON.parse(b64d(j.content)) }; });
    });
  }
  function writeJSON(repo, path, key, data, sha, msg) {
    var body = { message: msg || ('update ' + path), content: b64e(JSON.stringify(data, null, 1)) }; if (sha) body.sha = sha;
    return gh(repo, path, key, 'PUT', body).then(function (r) { if (!r.ok) { var e = new Error('GitHub ' + r.status); e.status = r.status; throw e; } return r.json(); });
  }
  window.SEM = { C: C, derive: derive, week: week, bookPrice: bookPrice, isExtra: isExtra, readJSON: readJSON, writeJSON: writeJSON };
})();
