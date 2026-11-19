(function () {
'use strict';
/* Clickjacking guard: if another site puts this page in a frame, hide it and try to break out. */
try { if (window.top !== window.self) { document.documentElement.style.display = 'none'; try { window.top.location = window.self.location; } catch (e2) {} } } catch (e) { document.documentElement.style.display = 'none'; }
/* 1) YOUR WEB APP URL (ends with /exec) */
var API_URL = 'https://script.google.com/macros/s/AKfycbzZ4o-VgT197_sXznDjs1w6-RaVSUStVLdVOI7hwjNub74RE9BDVZcGBmHLqJVPKLiT/exec';
var CC = '91';
var STATUSES = ['Pending', 'Confirmed', 'Called', 'Visited - Unavailable', 'Sample Collected', 'Reached Lab', 'Report Ready', 'Completed', 'Cancelled'];
var LIVE = ['Confirmed', 'Called', 'Visited - Unavailable'];      // the OTP exists from these statuses on
var IDLE_MIN = 30;                                                   // locks after 30 minutes of no use
var KEY = 'lab_staff_v2';

var S = { token: '', me: null, day: 0, days: { 0: [], 1: [] }, filter: 'All', q: '', loaded: false, seen: null, hot: {}, otp: {}, open: {}, busy: {}, fresh: {}, last: Date.now(), loading: false };
var $ = function (id) { return document.getElementById(id); };
function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function cls(s) { return 's-' + String(s).toLowerCase().replace(/[^a-z]+/g, '-'); }
function digits(v) { return String(v == null ? '' : v).replace(/\D/g, '').slice(-10); }
/* The sign-in token lives only in this tab (sessionStorage): closing the tab or browser signs the person out. */
function store(v) { try { v ? sessionStorage.setItem(KEY, v) : sessionStorage.removeItem(KEY); } catch (e) {} }
function recall() { try { return sessionStorage.getItem(KEY); } catch (e) { return null; } }
/* Phone code: a random 128-bit number created once on this phone. The admin approves the phone, not the person. */
function devId() {
  var id = ''; try { id = localStorage.getItem('lab_dev') || ''; } catch (e) {}
  if (/^[a-f0-9]{32}$/.test(id)) return id;
  if (!(window.crypto && crypto.getRandomValues)) return '';
  var b = new Uint8Array(16); crypto.getRandomValues(b);
  id = Array.prototype.map.call(b, function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
  try { localStorage.setItem('lab_dev', id); } catch (e) { return ''; }
  return id;
}
function devInfo() { var m = /\(([^)]*)\)/.exec(navigator.userAgent || ''); return (m ? m[1] : (navigator.userAgent || '')).slice(0, 80); }

var ICON = {
  ref: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.6-6.4"/><path d="M21 4v5h-5"/></svg>',
  out: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h4"/><path d="M16 8l4 4-4 4"/><path d="M20 12H9"/></svg>',
  call: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/></svg>',
  wa: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a9 9 0 0 0-7.7 13.6L3 21l4.5-1.2A9 9 0 1 0 12 3z"/><path d="M9 8.5c0 3.5 3 6.5 6.5 6.5l1-1.6-2.1-1-.9.8c-1-.4-2-1.4-2.4-2.4l.8-.9-1-2.1z" fill="currentColor" stroke="none"/></svg>',
  find: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
  dev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="2.5" width="10" height="19" rx="2"/><path d="M11 18.5h2"/></svg>',
  tube: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3h6"/><path d="M10 3v6L4.5 19a2 2 0 0 0 1.8 3h11.4a2 2 0 0 0 1.8-3L14 9V3"/></svg>'
};
$('ref').innerHTML = ICON.ref; $('out').innerHTML = ICON.out; $('dev').innerHTML = ICON.dev + '<i class="bdg" id="devn" hidden></i>';
document.querySelector('.find').insertAdjacentHTML('afterbegin', ICON.find);

/* ---------- talking to the server ---------- */
function api(body) {
  body.token = S.token;
  var ctl = window.AbortController ? new AbortController() : null, timer = ctl ? setTimeout(function () { ctl.abort(); }, 25000) : 0;
  return fetch(API_URL, { method: 'POST', body: JSON.stringify(body), signal: ctl ? ctl.signal : undefined })
    .then(function (r) { return r.json(); })
    .then(function (j) { clearTimeout(timer); if (j && j.auth === false) { logout(j.error); throw new Error('auth'); } return j; })
    .catch(function (e) { clearTimeout(timer); throw e; });
}
function toast(m) { var t = $('toast'); t.textContent = m; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(function () { t.hidden = true; }, 3200); }
function netErr(e) { if (e && e.message === 'auth') return; toast('No reply from server. Check your internet.'); }

/* ---------- sign in / out ---------- */
function login(ev) {
  ev.preventDefault();
  if (!devId()) { $('lerr').textContent = 'This browser blocks storage. Turn off private mode and try again.'; return; }
  $('lerr').textContent = ''; $('go').disabled = true; $('go').textContent = 'Signing in…';
  fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: 'login', who: $('who').value, pin: $('pin').value, dev: devId(), info: devInfo() }) })
    .then(function (r) { return r.json(); })
    .then(function (j) {
      $('go').disabled = false; $('go').textContent = 'Sign in';
      if (!j.ok) { $('lerr').textContent = j.error || 'Could not sign in'; $('pin').select(); return; }
      S.token = j.token; S.me = j; store(JSON.stringify({ token: j.token, me: j })); $('pin').value = ''; start();
    }).catch(function () { $('go').disabled = false; $('go').textContent = 'Sign in'; $('lerr').textContent = 'No reply from server. Check your internet.'; });
}
function logout(msg) {
  S.token = ''; S.me = null; S.loaded = false; S.seen = null; S.days = { 0: [], 1: [] }; S.hot = {}; S.otp = {};
  store(null); closeSheet(); $('app').hidden = true; $('login').hidden = false; $('list').innerHTML = '';
  $('lerr').textContent = msg || '';
}
function start() {
  $('login').hidden = true; $('app').hidden = false;
  $('hname').textContent = S.me.name;
  $('hrole').textContent = S.me.admin ? 'Admin · all bookings' : 'Technician · your bookings';
  $('dev').hidden = !S.me.admin;
  S.last = Date.now(); skeleton(); refresh();
}

/* ---------- loading ---------- */
function skeleton() { $('list').innerHTML = '<div class="sk"></div><div class="sk"></div><div class="sk"></div>'; }
function refresh() {
  if (!S.token || S.loading) return;
  S.loading = true; $('ref').classList.add('spin');
  api({ action: 'list' }).then(function (j) {
    S.loading = false; $('ref').classList.remove('spin');
    if (!j.ok) return toast(j.error || 'Could not load');
    S.days = { 0: j.days[0] || [], 1: j.days[1] || [] };
    setPend(j.pend);
    announceNew(); S.loaded = true; render();
  }).catch(function (e) { S.loading = false; $('ref').classList.remove('spin'); netErr(e); if (!S.loaded) $('list').innerHTML = '<div class="empty">Could not load. Tap refresh.</div>'; });
}
/* A booking number we have not seen before = a new booking: tell the admin */
function announceNew() {
  var all = S.days[0].concat(S.days[1]), nos = {};
  all.forEach(function (r) { nos[r.no] = 1; });
  if (S.seen) {
    var fresh = all.filter(function (r) { return !S.seen[r.no]; });
    fresh.forEach(function (r) { S.fresh[r.no] = 1; });
    if (fresh.length) {
      toast(fresh.length === 1 ? 'New booking: ' + fresh[0].name : fresh.length + ' new bookings');
      try { if (navigator.vibrate) navigator.vibrate([120, 60, 120]); } catch (e) {}
    }
  }
  S.seen = nos;
}

/* ---------- what each person can do ---------- */
function actionsFor(r) {
  var admin = S.me.admin, st = r.status, a = [];
  if (admin && st === 'Pending') a.push({ st: 'Confirmed', label: 'Confirm booking', kind: 'main' });
  if (LIVE.indexOf(st) > -1) a.push({ st: 'Sample Collected', label: 'Sample collected', kind: 'main', otp: true });
  if (st === 'Sample Collected') a.push({ st: 'Reached Lab', label: 'Reached lab', kind: 'main' });
  if (admin && st === 'Reached Lab') a.push({ st: 'Report Ready', label: 'Report ready', kind: 'main' });
  if (admin && st === 'Report Ready') a.push({ st: 'Completed', label: 'Mark completed', kind: 'main' });
  if (st === 'Confirmed' || st === 'Called') a.push({ st: 'Visited - Unavailable', label: 'Patient not available', kind: 'alt' });
  if (admin && ['Pending', 'Confirmed', 'Called', 'Visited - Unavailable'].indexOf(st) > -1) a.push({ st: 'Cancelled', label: 'Cancel booking', kind: 'danger', ask: true });
  return a;
}

/* ---------- drawing ---------- */
function ago(ts) {
  var m = Math.max(0, Math.floor((Date.now() - ts) / 60000));
  return m < 1 ? 'just now' : m < 60 ? m + ' min ago' : m < 1440 ? Math.floor(m / 60) + ' h ago' : Math.floor(m / 1440) + ' d ago';
}
function card(r) {
  var me = S.me, tel = '+' + CC + digits(r.phone), isNew = r.status === 'Pending' && Date.now() - r.ts < 15 * 60000;
  var place = r.area ? esc(r.area) + (r.landmark ? ' <small>near ' + esc(r.landmark) + '</small>' : '') : (r.landmark ? 'Near ' + esc(r.landmark) : 'No address given');
  var h = '<article class="card ' + cls(r.status) + (S.busy[r.no] ? ' busy' : '') + (S.fresh[r.no] ? ' fresh' : '') + '" data-no="' + esc(r.no) + '">' +
    '<div class="head"><div class="seq" aria-hidden="true">' + esc(r.seq) + '</div>' +
    '<div class="who"><h3>' + esc(r.name) + '</h3><div class="meta"><span>' + esc(r.age) + ' yrs' + (r.gender ? ', ' + esc(r.gender) : '') + '</span><span>' + ago(r.ts) + '</span>' + (isNew ? '<span class="new">NEW</span>' : '') + '</div></div>' +
    '<span class="pill">' + esc(r.status) + '</span></div>' +
    '<p class="bno">' + esc(r.no) + '</p>' +
    '<p class="loc">' + place + '</p>' +
    '<p class="tests' + (S.open[r.no] ? ' open' : '') + '" data-a="tests">' + esc(r.tests || '-') + '</p>' +
    (r.assigned ? '<p class="asg">Assigned to <b>' + esc(r.assigned) + '</b></p>' : '<p class="asg no">Not assigned</p>') +
    '<div class="line"><a class="btn" href="tel:' + esc(tel) + '" aria-label="Call ' + esc(r.name) + '">' + ICON.call + 'Call</a>' +
    '<button class="btn wa' + (S.hot[r.no] ? ' hot' : '') + '" type="button" data-a="wa">' + ICON.wa + esc(r.waLabel) + '</button></div>';
  var acts = actionsFor(r);
  if (acts.length) {
    var mainOnly = acts.filter(function (x) { return x.kind === 'main'; }), rest = acts.filter(function (x) { return x.kind !== 'main'; });
    h += '<div class="acts">' + mainOnly.map(btnHtml).join('') + '</div>';
    if (rest.length) h += '<div class="acts' + (rest.length > 1 ? ' two' : '') + '">' + rest.map(btnHtml).join('') + '</div>';
  } else if (!me.admin) {
    h += '<p class="wait">' + (r.status === 'Pending' ? 'Waiting for the lab to confirm.' : 'Nothing to do here.') + '</p>';
  }
  if (me.admin) {
    h += '<div class="tools"><div><label>Assign to</label><select data-a="assign" aria-label="Assign technician"><option value="">Not assigned</option>' +
      (me.techs || []).map(function (t) { return '<option value="' + esc(t.id) + '"' + (t.name === r.assigned ? ' selected' : '') + '>' + esc(t.name) + '</option>'; }).join('') + '</select></div>' +
      '<div><label>Status</label><select data-a="status" aria-label="Change status">' + STATUSES.map(function (s) { return '<option' + (s === r.status ? ' selected' : '') + '>' + esc(s) + '</option>'; }).join('') + '</select></div></div>' +
      '<div class="more">' + (r.otp ? (S.otp[r.no] ? '<span class="otpchip" aria-label="OTP ' + esc(r.otp) + '">' + esc(r.otp) + '</span>' : '<button class="link" type="button" data-a="otp">Show OTP</button>') : '') +
      '<button class="link" type="button" data-a="hist">History</button></div>';
  }
  return h + '</article>';
}
function btnHtml(x) { return '<button class="btn ' + x.kind + ' full" type="button" data-a="act" data-st="' + esc(x.st) + '">' + esc(x.label) + '</button>'; }

function rowsNow() { return S.days[S.day] || []; }
function render() {
  var rows = rowsNow(), c = { All: rows.length };
  rows.forEach(function (r) { c[r.status] = (c[r.status] || 0) + 1; });
  [0, 1].forEach(function (d) { $('n' + d).textContent = (S.days[d] || []).filter(function (r) { return r.status !== 'Cancelled'; }).length; });
  var keys = ['All'].concat(STATUSES.filter(function (s) { return c[s]; }));
  if (S.filter !== 'All' && !c[S.filter]) S.filter = 'All';
  $('chips').innerHTML = keys.map(function (k) { return '<button class="chip' + (k === S.filter ? ' on' : '') + '" type="button" data-f="' + esc(k) + '" aria-pressed="' + (k === S.filter) + '">' + esc(k) + '<b>' + (c[k] || 0) + '</b></button>'; }).join('');
  var q = S.q.trim().toLowerCase();
  var shown = rows.filter(function (r) {
    return (S.filter === 'All' || r.status === S.filter) && (!q || (r.name + ' ' + r.phone + ' ' + r.no + ' ' + r.area + ' ' + r.tests).toLowerCase().indexOf(q) > -1);
  });
  $('list').innerHTML = shown.length ? shown.map(card).join('') :
    '<div class="empty">' + ICON.tube + '<p>' + (rows.length ? 'No bookings match.' : (S.me.admin ? 'No bookings for this day yet.' : 'No bookings assigned to you yet.')) + '</p></div>';
  S.fresh = {};
}
function replaceRow(row) {
  [0, 1].forEach(function (d) { S.days[d] = S.days[d].map(function (r) { return r.no === row.no ? row : r; }); });
}
function findRow(no) { var all = S.days[0].concat(S.days[1]); for (var i = 0; i < all.length; i++) if (all[i].no === no) return all[i]; return null; }

/* ---------- bottom sheet ---------- */
var lastFocus = null;
function openSheet(title, bodyHtml, buttons) {
  lastFocus = document.activeElement;
  var sh = $('sheet');
  sh.innerHTML = '<h2 id="sheetT">' + esc(title) + '</h2>' + bodyHtml + '<div class="btns" id="sheetBtns"></div>';
  var box = $('sheetBtns');
  buttons.forEach(function (b) {
    var el = document.createElement('button'); el.type = 'button'; el.className = 'btn ' + (b.kind || '') + ' full'; el.textContent = b.label;
    if (b.id) el.id = b.id; if (b.disabled) el.disabled = true;
    el.addEventListener('click', function () { b.fn ? b.fn(el) : closeSheet(); });
    box.appendChild(el);
  });
  $('veil').hidden = false; document.body.style.overflow = 'hidden';
  var f = sh.querySelector('input,textarea') || sh.querySelector('button'); if (f) setTimeout(function () { f.focus(); }, 60);
}
function closeSheet() {
  $('veil').hidden = true; document.body.style.overflow = '';
  if (lastFocus && lastFocus.focus) { try { lastFocus.focus(); } catch (e) {} }
}
$('veil').addEventListener('click', function (e) { if (e.target === $('veil')) closeSheet(); });
document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !$('veil').hidden) closeSheet(); });


/* ---------- phone approval (admin) ---------- */
function setPend(n) { var b = $('devn'); if (!b) return; n = +n || 0; b.hidden = !n; b.textContent = n; }
function devicesSheet() {
  openSheet('Phones', '<p id="dl">Loading…</p>', [{ label: 'Close' }]);
  var draw = function (j) {
    var box = $('dl'); if (!box) return;
    if (!j.ok) { box.textContent = j.error || 'Could not load'; return; }
    setPend(j.pend);
    var wrap = document.createElement('div');
    if (!j.devices.length) wrap.textContent = 'No phones yet.';
    j.devices.forEach(function (d) {
      var el = document.createElement('div'); el.className = 'dv';
      var t = document.createElement('b'); t.textContent = d.name + (d.mine ? ' (this phone)' : '');
      var st = document.createElement('span'); st.className = 'st ' + d.status; st.textContent = d.status; t.appendChild(st);
      var i1 = document.createElement('small'); i1.textContent = d.info || '-';
      var i2 = document.createElement('small'); i2.textContent = 'First seen ' + d.first + ' · Last seen ' + d.last;
      var row = document.createElement('div'); row.className = 'row';
      var add = function (label, status, kind) {
        var b = document.createElement('button'); b.type = 'button'; b.className = 'btn ' + (kind || ''); b.textContent = label;
        b.addEventListener('click', function () {
          if (status === 'Remove' && !confirm('Remove this phone? It must be approved again to sign in.')) return;
          b.disabled = true;
          api({ action: 'deviceSet', k: d.k, status: status }).then(function (r) { if (!r.ok) toast(r.error || 'Could not save'); draw(r.ok ? r : j); }).catch(netErr);
        });
        row.appendChild(b);
      };
      if (d.status !== 'Approved') add('Approve', 'Approved', 'main');
      if (!d.mine && d.status !== 'Blocked') add('Block', 'Blocked', 'danger');
      if (!d.mine) add('Remove', 'Remove');
      el.appendChild(t); el.appendChild(i1); el.appendChild(i2); if (row.childNodes.length) el.appendChild(row);
      wrap.appendChild(el);
    });
    box.replaceChildren(wrap);
  };
  api({ action: 'devices' }).then(draw).catch(netErr);
}

/* ---------- actions ---------- */
function setStatus(no, st, otp) {
  S.busy[no] = 1; render();
  return api({ action: 'setStatus', no: no, status: st, otp: otp }).then(function (j) {
    delete S.busy[no];
    if (!j.ok) { render(); if (j.otp !== false) toast(j.error || 'Could not save'); return j; }
    replaceRow(j.row); S.hot[no] = 1; render();
    toast('Saved: ' + j.status + '. Tap WhatsApp to message the patient.');
    return j;
  }).catch(function (e) { delete S.busy[no]; render(); netErr(e); return { ok: false, error: 'network' }; });
}
function otpSheet(r) {
  openSheet('Patient OTP',
    '<p>Ask <b>' + esc(r.name) + '</b> for the 4-digit OTP that came in the WhatsApp confirmation message.</p>' +
    '<input id="otpIn" class="otp" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="one-time-code" aria-label="4 digit OTP" placeholder="••••">' +
    '<p class="err" id="otpErr" role="alert"></p>',
    [{ label: 'Confirm sample collected', kind: 'main', id: 'otpOk', disabled: true, fn: function (el) {
        var v = $('otpIn').value; el.disabled = true; el.textContent = 'Checking…';
        setStatus(r.no, 'Sample Collected', v).then(function (j) {
          if (j.ok) { closeSheet(); return; }
          el.textContent = 'Confirm sample collected'; $('otpErr').textContent = j.error || 'Could not save'; $('otpIn').value = ''; $('otpIn').focus();
        });
      } },
     { label: 'Cancel' }]);
  $('otpIn').addEventListener('input', function () { this.value = this.value.replace(/\D/g, '').slice(0, 4); $('otpOk').disabled = this.value.length !== 4; $('otpErr').textContent = ''; });
}
function askSheet(title, text, yes, kind, fn) {
  openSheet(title, '<p>' + text + '</p>', [{ label: yes, kind: kind, fn: function () { closeSheet(); fn(); } }, { label: 'Go back' }]);
}
function openWa(r) {
  var url = function (msg) { return 'https://wa.me/' + CC + digits(r.phone) + '?text=' + encodeURIComponent(msg); };
  var go = function (msg) { var a = document.createElement('a'); a.href = url(msg); a.target = '_blank'; a.rel = 'noopener noreferrer'; document.body.appendChild(a); a.click(); a.remove(); delete S.hot[r.no]; render(); };
  if (r.edit) {      // cancellation message: staff may change the words
    openSheet('Cancellation message', '<p>You can change the message before sending.</p><textarea id="waTxt" aria-label="Message to patient">' + esc(r.msg) + '</textarea>',
      [{ label: 'Open WhatsApp', kind: 'main', fn: function () { var v = $('waTxt').value.trim(); if (!v) return; closeSheet(); go(v.slice(0, 1500)); } }, { label: 'Cancel' }]);
  } else go(r.msg);
}
function historySheet(no) {
  openSheet('History', '<p id="hl">Loading…</p>', [{ label: 'Close' }]);
  api({ action: 'history', no: no }).then(function (j) {
    var el = $('hl'); if (!el) return;
    if (!j.ok) { el.textContent = j.error || 'Could not load'; return; }
    el.outerHTML = j.history.length ? '<ul class="hlist">' + j.history.map(function (x) { return '<li><time>' + esc(x.t) + '</time><div>' + esc(x.a) + '<br><span>' + esc(x.by) + '</span></div></li>'; }).join('') + '</ul>' : '<p>No history yet.</p>';
  }).catch(netErr);
}
function doAct(no, st) {
  var r = findRow(no); if (!r || r.status === st) return;
  if (st === 'Sample Collected') return otpSheet(r);
  if (st === 'Cancelled') return askSheet('Cancel this booking?', esc(r.name) + ' (' + esc(r.no) + '). The slot will be freed. You can then send the cancellation message.', 'Yes, cancel booking', 'danger', function () { setStatus(no, st); });
  setStatus(no, st);
}

document.addEventListener('click', function (e) {
  var f = e.target.closest('[data-f]'); if (f) { S.filter = f.getAttribute('data-f'); return render(); }
  var el = e.target.closest('[data-a]'); if (!el || el.tagName === 'SELECT') return;
  var cd = el.closest('.card'); if (!cd) return;
  var no = cd.getAttribute('data-no'), a = el.getAttribute('data-a'), r = findRow(no); if (!r) return;
  if (a === 'act') doAct(no, el.getAttribute('data-st'));
  else if (a === 'wa') openWa(r);
  else if (a === 'otp') { S.otp[no] = 1; render(); setTimeout(function () { delete S.otp[no]; if (!document.hidden) render(); }, 20000); }
  else if (a === 'hist') historySheet(no);
  else if (a === 'tests') { S.open[no] = !S.open[no]; el.classList.toggle('open', !!S.open[no]); }
});
document.addEventListener('change', function (e) {
  var s = e.target.closest('select[data-a]'); if (!s) return;
  var no = s.closest('.card').getAttribute('data-no'), v = s.value;
  if (s.getAttribute('data-a') === 'assign') {
    S.busy[no] = 1; render();
    api({ action: 'assign', no: no, to: v }).then(function (j) {
      delete S.busy[no];
      if (!j.ok) { render(); return toast(j.error || 'Could not assign'); }
      replaceRow(j.row); render(); toast(j.assigned ? 'Assigned to ' + j.assigned : 'Unassigned');
    }).catch(function (er) { delete S.busy[no]; render(); netErr(er); });
  } else { render(); doAct(no, v); }          // render() puts the dropdown back; doAct() decides what really happens
});

/* ---------- wiring ---------- */
$('loginForm').addEventListener('submit', login);
$('out').onclick = function () { logout(); };
$('ref').onclick = refresh;
$('dev').onclick = devicesSheet;
$('q').addEventListener('input', function () { S.q = this.value; render(); });
['t0', 't1'].forEach(function (id, i) {
  $(id).onclick = function () {
    S.day = i; S.filter = 'All';
    $('t0').className = i ? '' : 'on'; $('t1').className = i ? 'on' : '';
    $('t0').setAttribute('aria-selected', String(!i)); $('t1').setAttribute('aria-selected', String(!!i));
    render();
  };
});
['pointerdown', 'keydown', 'scroll'].forEach(function (ev) { window.addEventListener(ev, function () { S.last = Date.now(); }, { passive: true, capture: true }); });
setInterval(function () {
  if (!S.token) return;
  if (Date.now() - S.last > IDLE_MIN * 60000) return logout('Locked after ' + IDLE_MIN + ' minutes. Sign in again.');
  var ae = document.activeElement;
  if (!document.hidden && $('veil').hidden && !(ae && (ae.tagName === 'SELECT' || ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA'))) refresh();
}, 20000);
document.addEventListener('visibilitychange', function () { if (!document.hidden && S.token) refresh(); });

try { localStorage.removeItem('lab_staff'); localStorage.removeItem('lab_staff_v2'); } catch (e) {}      // old version of this page
try { var saved = JSON.parse(recall() || 'null'); if (saved && saved.token && saved.me) { S.token = saved.token; S.me = saved.me; start(); } } catch (e) { store(null); }
})();
