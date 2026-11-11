/* Общая «бухгалтерия» Семёна для обеих страниц (index.html и mama.html).
   Источники правды, без компьютера и бота:
     claims.json  — в приватном репозитории SemReports, пишет приложение Семёна (что он отметил);
     mom.json     — в SemTraining, пишет приложение мамы (журнал решений: ok/no/paid/fine/…).
   SEM.derive(claims, actions) -> состояние: что подтверждено, статусы дней, штрафы, выплаты, книги, доклады, задачки.
   Та же логика повторена в job_agent/semyon_fetch.py (derive) — менять вместе. */
(function () {
  var WORK = { 'str-a': 1, 'str-b': 1, 'str-c': 1, 'bike': 1 };
  var C = { BONUS: 100, MAX: 1500, PROJ: 400, WORK: WORK, ENOT: 100 };
  // курс «Енот Чек» — 100 ₽ за урок, сверх потолка недели (список как в Саша мотивация/enot.js)
  var ENOT = { URL: 'https://moteam-design.github.io/enot-chek/', LESSONS: [[1, 'Знакомство и азбука логики'], [2, 'Азбука логики: часть 2'],
    [3, 'Факт или мнение'], [4, 'Суперсила вопросов'], [5, 'Осторожно, мошенники'], [6, 'Ловушки в рассуждениях'],
    [7, 'Ловушки-2 и неверные выводы'], [8, 'Как мозг нас обманывает'], [9, 'Проверка новостей'], [10, 'Итоговый тест']] };
  function bookPrice(p) { return Math.round((+p || 0) * 500 / 300 / 10) * 10; }
  function norm(o) { var r = {}; Object.keys(o || {}).sort().forEach(function (k) { r[k] = +o[k] || 0; }); return JSON.stringify(r); }
  function isExtra(k) { return k.indexOf('book-') === 0 || k.indexOf('proj-') === 0 || k.indexOf('enot-') === 0; }
  function copy(o) { var r = {}; for (var k in o) r[k] = o[k]; return r; }

  function derive(claims, actions) {
    claims = claims || {};
    var CL = claims.done || {};
    var S = { claimed: CL, confirmed: {}, status: {}, paid: {}, fines: [], books: {}, assigned: {}, projects: {}, enot: {}, topics: null,
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
    Object.keys(claims.enot || {}).forEach(function (n) { if (claims.enot[n]) S.enot[n] = { d: claims.enot[n], status: 'new', reward: C.ENOT }; });
    (actions || []).forEach(function (a) {
      var t = a.t;
      if ((t === 'eok' || t === 'eno') && S.enot[a.ref]) { S.enot[a.ref].status = t === 'eok' ? 'ok' : 'no'; return; }
      // книга от мамы на срок: к сроку — вся награда, позже — половина
      if (t === 'book' && a.bid) { S.assigned[a.bid] = { t: a.title || '', a: a.author || '', pg: +a.pg || 0, from: a.from, due: a.due, rw: +a.rw || 0 }; return; }
      if (t === 'unbook') { delete S.assigned[a.bid]; return; }
      // решения по делам дня копятся по-пунктно: ok — засчитать эти пункты, no — не засчитывать эти пункты
      if (t === 'ok' || t === 'no') {
        if (!a.d) return;
        var x = dec[a.d] || (dec[a.d] = { ok: {}, no: {} }), ids = a.ids || CL[a.d] || {};
        Object.keys(ids).forEach(function (k) { if (t === 'ok') { x.ok[k] = +ids[k] || 0; delete x.no[k]; } else { x.no[k] = 1; delete x.ok[k]; } });
      }
      else if (t === 'paid') { if (a.mon) S.paid[a.mon] = { sum: +a.sum || 0, at: (a.at || '').slice(0, 10) }; }
      else if (t === 'fine') { S.fines = S.fines.filter(function (f) { return f.id !== a.fid; }); S.fines.push({ id: a.fid, d: a.d, a: +a.a || 0, r: a.r || '' }); }
      else if (t === 'unfine') { S.fines = S.fines.filter(function (f) { return f.id !== a.fid; }); }
      else if (t === 'bok' || t === 'bno') { var b = S.books[a.ref]; if (b) { b.status = t === 'bok' ? 'ok' : 'no'; b.decidedAt = b.d; } }
      else if (t === 'pok' || t === 'pno') { var p = S.projects[a.ref]; if (p) { p.status = t === 'pok' ? 'ok' : 'no'; p.tries = +a.tries || 1; } }
      else if (t === 'topics') { S.topics = { id: a.id, list: a.list || [] }; }
      else if (t === 'pz') { if (a.d && a.pid) S.puzzles[a.d] = a.pid; }
      else if (t === 'unpz') { delete S.puzzles[a.d]; }
    });
    Object.keys(S.books).forEach(function (k) { var as = S.assigned[k], b = S.books[k];
      if (as) { b.assigned = true; b.due = as.due; b.reward = b.d <= as.due ? as.rw : Math.round(as.rw / 2); b.late = b.d > as.due; } });
    // проект «не принят», а Семён снова нажал «выступил» позже — снова на проверку
    Object.keys(S.projects).forEach(function (k) { var p = S.projects[k], c = (claims.projs || {})[k]; p.cur = (c && c.tries) || 1; if (p.status === 'no' && c && c.ready && p.cur > p.tries) p.status = 'new'; });
    var days = {}; Object.keys(CL).forEach(function (d) { days[d] = 1; }); Object.keys(dec).forEach(function (d) { days[d] = 1; });
    S.items = {};
    Object.keys(days).forEach(function (d) {
      var cl = CL[d] || {}, x = dec[d] || { ok: {}, no: {} }, it = {}, conf = {}, has = Object.keys(cl).length;
      Object.keys(cl).forEach(function (k) {
        it[k] = (k in x.ok && x.ok[k] === (+cl[k] || 0)) ? 'ok' : (k in x.no ? 'no' : 'new');
        if (it[k] === 'ok') conf[k] = x.ok[k];
      });
      if (!has) Object.keys(x.ok).forEach(function (k) { it[k] = 'ok'; conf[k] = x.ok[k]; });   // отметки стёрты, а подтверждённое остаётся
      var v = Object.keys(it).map(function (k) { return it[k]; });
      if (!v.length) return;
      S.items[d] = it;
      if (Object.keys(conf).length) S.confirmed[d] = conf;
      S.status[d] = v.indexOf('new') >= 0 ? 'new' : v.indexOf('ok') >= 0 ? 'ok' : 'no';
    });
    Object.keys(S.books).forEach(function (k) { var b = S.books[k]; if (b.status === 'ok') (S.confirmed[b.d] = S.confirmed[b.d] || {})['book-' + k] = b.reward; });
    Object.keys(S.projects).forEach(function (k) { var p = S.projects[k]; if (p.status === 'ok') (S.confirmed[p.d] = S.confirmed[p.d] || {})['proj-' + k] = p.reward; });
    Object.keys(S.enot).forEach(function (n) { var e = S.enot[n]; if (e.status === 'ok') (S.confirmed[e.d] = S.confirmed[e.d] || {})['enot-' + n] = e.reward; });
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
  // план дня (для списка «что он должен сделать» у мамы) — те же ключи и баллы, что в plan() на странице Семёна
  var QUESTS = [['q-drink', 'Без сладких напитков'], ['q-dessert', 'Сладкое только после еды'], ['q-prot', 'Белковый завтрак'], ['q-fiber', '3 порции фруктов/овощей'], ['q-late', 'Не ел после ужина']];
  var CHORES = { 'h-room': 'Убрался в комнате', 'h-dish': 'Помыл посуду', 'h-cook': 'Приготовил еду', 'h-wash': 'Постирал своё', 'h-closet': 'Сложил вещи в шкафу',
    'h-shelf': 'Пыль на полке', 'h-door': 'Пыль на двери', 'h-pillow': 'Взбил подушки', 'h-plinth': 'Протёр плинтуса', 'h-trash': 'Вынес мусор' };
  function dayPlan(dow) {
    var wk = dow >= 1 && dow <= 5, G = [];
    function g(name, items) { G.push({ name: name, items: items.filter(Boolean) }); }
    g('Утро', [wk && { k: 'wake', t: 'Встал сам и позавтракал', xp: 20 }, { k: 'feet', t: 'Стопы', xp: 10 }]);
    var sport = [];
    if (dow === 1) sport.push({ k: 'str-a', t: 'Сила А: верх тела', xp: 40 }, { k: 'bike', t: 'Велотренажёр 15 мин', xp: 20 });
    if (dow === 2) sport.push({ k: 'bike', t: 'Велотренажёр 30 мин', xp: 30 });
    if (dow === 3) sport.push({ k: 'str-b', t: 'Сила Б: пресс и ягодицы', xp: 40 });
    if (dow === 4) sport.push({ k: 'bike', t: 'Велотренажёр, интервалы', xp: 35 });
    if (dow === 5) sport.push({ k: 'str-c', t: 'Сила В: круговая', xp: 40 });
    if (dow === 6) sport.push({ k: 'bike', t: 'Велотренажёр 40 мин', xp: 40 });
    if (dow === 0) sport.push({ k: 'long', t: 'Прогулка 60 мин', xp: 30 });
    sport.push({ k: 'stretch', t: 'Растяжка', xp: 10 });
    if (wk) sport.push({ k: 'out', t: 'Из школы пешком, улица', xp: 5 });
    sport.push({ k: 'eve', t: 'Прогулка 30 мин после ужина', xp: 15 });
    g('Спорт и движение', sport);
    g('Голова и гитара', [{ k: 'guitar', t: 'Гитара 20 мин', xp: 30 }, { k: 'read', t: 'Чтение 20 мин', xp: 20 }, { k: 'puzzle', t: 'Задача дня', xp: 10 }]);
    g('Еда', [wk && { k: 'meal', t: 'Обед после школы', xp: 5 }].concat(QUESTS.map(function (q) { return { k: q[0], t: q[1], xp: 5 }; })));
    g('Вечер', [{ k: 'sleep', t: 'Отбой вовремя', xp: 5 }]);
    return G;
  }
  // подсказки для формы «Задать книгу»: ~20 стр. в день; награда по правилу 300 стр. = 500 ₽
  function suggestDays(pg) { return Math.max(3, Math.ceil((+pg || 0) / 20)); }
  window.SEM = { C: C, ENOT: ENOT, CHORES: CHORES, dayPlan: dayPlan, derive: derive, suggestDays: suggestDays, week: week, bookPrice: bookPrice, isExtra: isExtra, readJSON: readJSON, writeJSON: writeJSON };
})();
