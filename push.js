/* Веб-пуши: подписка устройства и сохранение на GitHub.
   Вызывается со страниц: PUSH.enable({vapid, repo, key, role, prefix}). */
(function () {
  function b64ToU8(s) {
    var p = '='.repeat((4 - s.length % 4) % 4);
    var b = atob((s + p).replace(/-/g, '+').replace(/_/g, '/'));
    var out = new Uint8Array(b.length);
    for (var i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
    return out;
  }
  function devId(prefix) {
    var k = (prefix || 'dev') + '-dev', v = null;
    try { v = localStorage.getItem(k); } catch (e) {}
    if (!v) { v = (prefix || 'dev') + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      try { localStorage.setItem(k, v); } catch (e) {} }
    return v;
  }
  async function save(cfg, id, sub) {
    var url = 'https://api.github.com/repos/MOteam-design/' + cfg.repo + '/contents/push/' + id + '.json';
    var h = { 'Accept': 'application/vnd.github+json' };
    if (cfg.key) h.Authorization = 'Bearer ' + cfg.key;
    var sha = null;
    try {
      var cur = await fetch(url + '?t=' + Date.now(), { cache: 'no-store', headers: h });
      if (cur.ok) { var j = await cur.json(); sha = j.sha; }
    } catch (e) {}
    var body = { sub: sub, role: cfg.role || '', at: new Date().toISOString() };
    var payload = { message: 'push sub ' + (cfg.role || ''), content: btoa(unescape(encodeURIComponent(JSON.stringify(body)))) };
    if (sha) payload.sha = sha;
    var r = await fetch(url, { method: 'PUT', headers: Object.assign({ 'Content-Type': 'application/json' }, h), body: JSON.stringify(payload) });
    if (!r.ok) throw new Error('save ' + r.status);
  }
  async function enable(cfg) {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) throw new Error('no-push');
    var perm = await Notification.requestPermission();
    if (perm !== 'granted') throw new Error('denied');
    var reg = await navigator.serviceWorker.register('sw.js');
    await navigator.serviceWorker.ready;
    var sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(cfg.vapid) });
    var id = devId(cfg.prefix);
    await save(cfg, id, sub.toJSON());
    return id;
  }
  async function status() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false;
    try {
      var reg = await navigator.serviceWorker.getRegistration();
      if (!reg) return false;
      var s = await reg.pushManager.getSubscription();
      return !!s && Notification.permission === 'granted';
    } catch (e) { return false; }
  }
  window.PUSH = { enable: enable, status: status, devId: devId };
})();
