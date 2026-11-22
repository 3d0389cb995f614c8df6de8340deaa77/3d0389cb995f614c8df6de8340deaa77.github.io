(function () {
'use strict';
/* Clickjacking guard: if another site puts this page in a frame, hide it and try to break out. */
try { if (window.top !== window.self) { document.documentElement.style.display = 'none'; try { window.top.location = window.self.location; } catch (e2) {} } } catch (e) { document.documentElement.style.display = 'none'; }
/* 1) YOUR WEB APP URL (ends with /exec) */
var API_URL = 'https://script.google.com/macros/s/AKfycbyG-pmN4C4GTtt7XSPjm2EpyHtpupz4zDbJReys89k57tw0x7rnnPk-clGEaYpy50Zz/exec';
var CC = '91';
var STATUSES = ['Pending', 'Confirmed', 'Called', 'Visited - Unavailable', 'Sample Collected', 'Reached Lab', 'Report Ready', 'Completed', 'Cancelled'];
var LIVE = ['Confirmed', 'Called', 'Visited - Unavailable'];      // the OTP exists from these statuses on
var TECH_LIVE = ['Confirmed', 'Called'];                           // a technician can collect the sample only from these (after "not available" only the admin can change it)
var CLOSED = ['Sample Collected', 'Cancelled', 'Visited - Unavailable'];   // these bookings go to the "Closed" section
var SECS = [{ k: 'pick', t: 'Pick up' }, { k: 'open', t: 'Open' }, { k: 'closed', t: 'Closed' }];
function secOf(r) { return r.status === 'Pending' ? 'pick' : CLOSED.indexOf(r.status) > -1 ? 'closed' : 'open'; }   // new booking = Pick up, finished = Closed, everything else = Open
var DONE_FOR_TECH = ['Visited - Unavailable', 'Reached Lab', 'Report Ready', 'Completed', 'Cancelled'];
var SHORT = { 'Visited - Unavailable': 'Not available' };
var IDLE_MIN = 30;                                                   // locks after 30 minutes of no use
var KEY = 'lab_staff_v2';

var S = { token: '', me: null, day: 0, days: { 0: [], 1: [] }, filter: 'All', q: '', loaded: false, seen: null, hot: {}, otp: {}, open: {}, exp: {}, shut: { closed: true }, busy: {}, fresh: {}, last: Date.now(), loading: false };
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
  pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>',
  chev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>',
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
  S.pushOk = false; S.pushTried = false; S.pushBusy = false; S.token = ''; S.me = null; S.loaded = false; S.seen = null; S.days = { 0: [], 1: [] }; S.otp = {};
  store(null); closeSheet(); $('app').hidden = true; $('login').hidden = false; $('list').innerHTML = '';
  $('lerr').textContent = msg || '';
}
function start() {
  $('login').hidden = true; $('app').hidden = false;
  $('hname').textContent = S.me.name;
  $('hrole').textContent = S.me.admin ? 'Admin · all bookings' : 'Technician · your bookings';
  $('dev').hidden = !S.me.admin;
  S.last = Date.now(); skeleton(); refresh();
  if (window.syncAlert) window.syncAlert();
}

/* ---------- loading ---------- */
function skeleton() { $('list').innerHTML = '<div class="sk"></div><div class="sk"></div><div class="sk"></div><div class="sk"></div>'; }
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
      try { if (document.hidden && window.notifyNew) window.notifyNew('New booking', fresh.length === 1 ? fresh[0].name : fresh.length + ' new bookings'); } catch (e) {}
    }
  }
  S.seen = nos;
}

/* ---------- what each person can do ---------- */
function actionsFor(r) {
  var admin = S.me.admin, st = r.status, a = [];
  if (admin && st === 'Pending') a.push({ st: 'Confirmed', label: 'Confirm booking', kind: 'main' });
  if ((admin ? LIVE : TECH_LIVE).indexOf(st) > -1) a.push({ st: 'Sample Collected', label: 'Sample collected', kind: 'main', otp: true });
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
  var min = !S.exp[r.no], closed = CLOSED.indexOf(r.status) > -1;
  var place = r.area ? esc(r.area) + (r.landmark ? ' <small>near ' + esc(r.landmark) + '</small>' : '') : (r.landmark ? 'Near ' + esc(r.landmark) : 'No address given');
  var sub = min ? esc(r.age) + ' yrs' + (r.area ? ' · ' + esc(r.area) : '') + ' · ' + ago(r.ts) : esc(r.age) + ' yrs' + (r.gender ? ' · ' + esc(r.gender) : '') + ' · ' + ago(r.ts);
  var acts = actionsFor(r), mainOnly = acts.filter(function (x) { return x.kind === 'main'; }), rest = acts.filter(function (x) { return x.kind !== 'main'; });
  var quick = '<a class="ib" href="tel:' + esc(tel) + '" aria-label="Call ' + esc(r.name) + '">' + ICON.call + '</a>' +
    (r.msg ? '<button class="ib wa" type="button" data-a="wa" aria-label="WhatsApp message to ' + esc(r.name) + '">' + ICON.wa + '</button>' : '');
  var h = '<article class="card ' + cls(r.status) + (min ? ' min' : '') + (S.busy[r.no] ? ' busy' : '') + (S.fresh[r.no] ? ' fresh' : '') + '" data-no="' + esc(r.no) + '">' +
    '<div class="top" data-a="tog" role="button" tabindex="0" aria-expanded="' + (!min) + '">' +
    '<div class="seq" aria-hidden="true">' + esc(r.seq) + '</div>' +
    '<div class="who"><h3><span class="nm">' + esc(r.name) + '</span>' + (isNew ? '<span class="new">NEW</span>' : '') + '</h3><p class="sub">' + sub + '</p></div>' +
    '<span class="pill">' + esc(SHORT[r.status] || r.status) + '</span><span class="chev" aria-hidden="true">' + ICON.chev + '</span></div>';
  if (min) {
    if (closed) return h + '</article>';                       // closed cards: one thin row
    return h + '<p class="mini">' + esc(r.tests || '-') + '</p><div class="ra q">' + quick + mainOnly.map(btnHtml).join('') + '</div></article>';
  }
  h += '<div class="body"><p class="loc">' + ICON.pin + '<span>' + place + '</span></p>' +
    '<p class="tests' + (S.open[r.no] ? ' open' : '') + '" data-a="tests">' + esc(r.tests || '-') + '</p>' +
    '<div class="tags"><span class="tag">' + esc(r.no) + '</span>' + (r.assigned ? '<span class="tag asg">' + esc(r.assigned) + '</span>' : '<span class="tag no">Not assigned</span>') + '</div>';
  h += '<div class="ra">' + quick + mainOnly.map(btnHtml).join('') + '</div>';
  if (rest.length) h += '<div class="ra2' + (rest.length > 1 ? ' two' : '') + '">' + rest.map(btnHtml).join('') + '</div>';
  if (!acts.length && !me.admin) {
    h += '<p class="wait">' + (r.status === 'Pending' ? 'Waiting for the lab to confirm.' : DONE_FOR_TECH.indexOf(r.status) > -1 ? 'Saved. Only the admin can change this now.' : 'Nothing to do here.') + '</p>';
  }
  if (me.admin) {
    h += '<div class="tools"><div><label>Assign to</label><select data-a="assign" aria-label="Assign technician"><option value="">Not assigned</option>' +
      (me.techs || []).map(function (t) { return '<option value="' + esc(t.id) + '"' + (t.name === r.assigned ? ' selected' : '') + '>' + esc(t.name) + '</option>'; }).join('') + '</select></div>' +
      '<div><label>Status</label><select data-a="status" aria-label="Change status">' + STATUSES.map(function (s) { return '<option' + (s === r.status ? ' selected' : '') + '>' + esc(s) + '</option>'; }).join('') + '</select></div></div>' +
      '<div class="more">' + (r.otp ? (S.otp[r.no] ? '<span class="otpchip" aria-label="OTP ' + esc(r.otp) + '">' + esc(r.otp) + '</span>' : '<button class="link" type="button" data-a="otp">Show OTP</button>') : '') +
      '<button class="link" type="button" data-a="hist">History</button></div>';
  }
  return h + '</div></article>';
}
function btnHtml(x) { return '<button class="btn ' + x.kind + ' full" type="button" data-a="act" data-st="' + esc(x.st) + '">' + esc(x.label) + '</button>'; }

function rowsNow() { return S.days[S.day] || []; }
function render() {
  var rows = rowsNow(), c = { All: rows.length, pick: 0, open: 0, closed: 0 };
  rows.forEach(function (r) { c[secOf(r)]++; });
  [0, 1].forEach(function (d) { $('n' + d).textContent = (S.days[d] || []).filter(function (r) { return r.status !== 'Cancelled'; }).length; });
  var keys = [{ k: 'All', t: 'All' }].concat(SECS);
  $('chips').innerHTML = keys.map(function (x) { return '<button class="chip' + (x.k === S.filter ? ' on' : '') + '" type="button" data-f="' + x.k + '" aria-pressed="' + (x.k === S.filter) + '">' + x.t + '<b>' + (c[x.k] || 0) + '</b></button>'; }).join('');
  var q = S.q.trim().toLowerCase();
  var shown = rows.filter(function (r) {
    return (S.filter === 'All' || secOf(r) === S.filter) && (!q || (r.name + ' ' + r.phone + ' ' + r.no + ' ' + r.area + ' ' + r.tests).toLowerCase().indexOf(q) > -1);
  });
  if (!shown.length) {
    $('list').innerHTML = '<div class="empty">' + ICON.tube + '<p>' + (rows.length ? 'No bookings match.' : (S.me.admin ? 'No bookings for this day yet.' : 'No bookings assigned to you yet.')) + '</p></div>';
  } else {
    var out = '';
    SECS.forEach(function (s) {
      var part = shown.filter(function (r) { return secOf(r) === s.k; });
      if (!part.length) return;
      var shut = s.k === 'closed' && S.filter !== 'closed' && !q && S.shut.closed;      // Closed is folded in the "All" view
      out += '<section class="sec ' + s.k + '"><div class="sech"' + (s.k === 'closed' && S.filter !== 'closed' ? ' data-sec="closed" role="button" tabindex="0" aria-expanded="' + (!shut) + '"' : '') + '><h2>' + s.t + '</h2><b>' + part.length + '</b>' +
        (s.k === 'closed' && S.filter !== 'closed' ? '<span class="chev' + (shut ? '' : ' up') + '" aria-hidden="true">' + ICON.chev + '</span>' : '') + '</div>' + (shut ? '' : part.map(card).join('')) + '</section>';
    });
    $('list').innerHTML = out;
  }
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
    delete S.exp[no]; replaceRow(j.row); render();
    toast('Saved: ' + j.status + '. Opening WhatsApp…');
    setTimeout(function () { autoWa(j.row); }, 60);       // after any sheet has closed
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
function waUrl(r, msg) { return 'https://wa.me/' + CC + digits(r.phone) + '?text=' + encodeURIComponent(msg); }
/* Runs by itself after every saved status change. If the phone blocks the automatic opening, a sheet with one big button appears instead. */
function autoWa(r) {
  if (r.edit) return openWa(r);                       // cancellation text can be edited first, so it needs one tap anyway
  var w = null; try { w = window.open(waUrl(r, r.msg), '_blank'); } catch (e) {}
  if (w) { try { w.opener = null; } catch (e2) {} return; }
  openSheet('Message ' + r.name, '<p>Tap the button to send the WhatsApp message to the patient.</p>',
    [{ label: 'Open WhatsApp', kind: 'main', fn: function () { closeSheet(); openWa(r); } }, { label: 'Later' }]);
}
function openWa(r) {
  var url = function (msg) { return waUrl(r, msg); };
  var go = function (msg) { var a = document.createElement('a'); a.href = url(msg); a.target = '_blank'; a.rel = 'noopener noreferrer'; document.body.appendChild(a); a.click(); a.remove(); };
  if (r.edit) {      // cancellation message: staff may change the words
    openSheet('Cancellation message', '<p>You can change the message before sending.</p><textarea id="waTxt" aria-label="Message to patient">' + esc(r.msg) + '</textarea>',
      [{ label: 'Open WhatsApp', kind: 'main', fn: function () { var v = $('waTxt').value.trim(); if (!v) return; closeSheet(); go(v.slice(0, 1500)); } }, { label: 'Cancel' }]);
  } else go(r.msg);
}
/* ---------- new patient (admin and technicians): plain form ---------- */
function newPatientSheet() {
  var f = function (id, label, attrs) { return '<label class="f" for="' + id + '">' + label + '</label><input id="' + id + '" class="in" ' + attrs + '>'; };
  openSheet('New patient',
    '<div class="nf">' +
    f('npName', 'Patient name *', 'type="text" maxlength="60" autocomplete="off" autocapitalize="words"') +
    '<div class="two"><div>' + f('npAge', 'Age *', 'type="text" inputmode="numeric" maxlength="3" autocomplete="off"') + '</div>' +
    '<div><label class="f" for="npGen">Gender</label><select id="npGen" class="in"><option value="">-</option><option>Male</option><option>Female</option><option>Other</option></select></div></div>' +
    f('npPhone', 'Mobile number *', 'type="tel" inputmode="numeric" maxlength="14" autocomplete="off" placeholder="10 digits"') +
    f('npDoc', 'Doctor', 'type="text" maxlength="60" autocomplete="off"') +
    f('npArea', 'Area', 'type="text" maxlength="60" autocomplete="off"') +
    f('npLand', 'Landmark', 'type="text" maxlength="60" autocomplete="off"') +
    '<label class="f" for="npTests">Tests *</label><textarea id="npTests" class="ta" maxlength="600" aria-label="Tests"></textarea>' +
    '<label class="f" for="npDay">For</label><select id="npDay" class="in"><option value="0">Today</option><option value="1">Tomorrow</option></select>' +
    '<p class="err" id="npErr" role="alert"></p></div>',
    [{ label: 'Save patient', kind: 'main', fn: function (el) {
        var v = function (id) { return $(id).value.trim(); }, err = $('npErr');
        if (!/^[A-Za-z\u00C0-\u024F\u0900-\u0DFF][^0-9<>]{1,59}$/.test(v('npName'))) { err.textContent = 'Enter the patient name.'; return; }
        if (!/^\d{1,3}$/.test(v('npAge'))) { err.textContent = 'Enter the age.'; return; }
        if (digits(v('npPhone')).length !== 10) { err.textContent = 'Enter a 10 digit mobile number.'; return; }
        if (v('npTests').length < 2) { err.textContent = 'Enter the tests.'; return; }
        err.textContent = ''; el.disabled = true; el.textContent = 'Saving…';
        api({ action: 'addBooking', name: v('npName'), age: v('npAge'), gender: $('npGen').value, phone: v('npPhone'), doctor: v('npDoc'), area: v('npArea'), landmark: v('npLand'), tests: v('npTests'), day: $('npDay').value })
          .then(function (j) {
            if (!j.ok) { el.disabled = false; el.textContent = 'Save patient'; err.textContent = j.error || 'Could not save'; return; }
            var d = +$('npDay').value;
            S.days[d] = [j.row].concat(S.days[d] || []);
            if (S.seen) S.seen[j.row.no] = 1;
            closeSheet(); setDay(d); toast('Patient saved.');
          }).catch(function (e) { el.disabled = false; el.textContent = 'Save patient'; if (!e || e.message !== 'auth') err.textContent = 'No reply from server. Check your internet.'; });
      } },
     { label: 'Cancel' }]);
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
  var sc = e.target.closest('[data-sec]'); if (sc) { S.shut.closed = !S.shut.closed; return render(); }
  var el = e.target.closest('[data-a]'); if (!el || el.tagName === 'SELECT') return;
  var cd = el.closest('.card'); if (!cd) return;
  var no = cd.getAttribute('data-no'), a = el.getAttribute('data-a'), r = findRow(no); if (!r) return;
  if (a === 'act') doAct(no, el.getAttribute('data-st'));
  else if (a === 'wa') openWa(r);
  else if (a === 'tog') { S.exp[no] = !S.exp[no]; render(); }
  else if (a === 'otp') { S.otp[no] = 1; render(); setTimeout(function () { delete S.otp[no]; if (!document.hidden) render(); }, 20000); }
  else if (a === 'hist') historySheet(no);
  else if (a === 'tests') { S.open[no] = !S.open[no]; el.classList.toggle('open', !!S.open[no]); }
});
document.addEventListener('keydown', function (e) {
  if ((e.key === 'Enter' || e.key === ' ') && e.target && e.target.getAttribute && (e.target.getAttribute('data-a') === 'tog' || e.target.getAttribute('data-sec'))) { e.preventDefault(); e.target.click(); }
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
function setDay(i) {
  S.day = i; S.filter = 'All';
  $('t0').className = i ? '' : 'on'; $('t1').className = i ? 'on' : '';
  $('t0').setAttribute('aria-selected', String(!i)); $('t1').setAttribute('aria-selected', String(!!i));
  render();
}
['t0', 't1'].forEach(function (id, i) { $(id).onclick = function () { setDay(i); }; });
$('add').onclick = newPatientSheet;
['pointerdown', 'keydown', 'scroll'].forEach(function (ev) { window.addEventListener(ev, function () { S.last = Date.now(); }, { passive: true, capture: true }); });
setInterval(function () {
  if (!S.token) return;
  if (Date.now() - S.last > IDLE_MIN * 60000) return logout('Locked after ' + IDLE_MIN + ' minutes. Sign in again.');
  var ae = document.activeElement;
  if ((!document.hidden || (window.Notification && Notification.permission === 'granted')) && $('veil').hidden && !(ae && (ae.tagName === 'SELECT' || ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA'))) refresh();
}, 20000);
document.addEventListener('visibilitychange', function () { if (!document.hidden && S.token) refresh(); });

try { localStorage.removeItem('lab_staff'); localStorage.removeItem('lab_staff_v2'); } catch (e) {}      // old version of this page
try { var saved = JSON.parse(recall() || 'null'); if (saved && saved.token && saved.me) { S.token = saved.token; S.me = saved.me; start(); } } catch (e) { store(null); }

/* ---------- phone app: install shortcut + new-booking alerts ---------- */
(function () {
  var dp = null, ua = navigator.userAgent || '';
  var standalone = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  var ios = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var canNotify = 'Notification' in window;
  function showInst() {
    if (standalone) return;
    $('inst').hidden = false;
    $('instBtn').hidden = !dp;
    $('instHelp').textContent = dp ? 'Adds a shortcut to your home screen.'
      : ios ? 'iPhone: open this page in Safari, tap the Share button, then tap Add to Home Screen.'
      : 'Android: tap the browser menu (three dots), then Install app or Add to Home screen.';
  }
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); dp = e; showInst(); });
  window.addEventListener('appinstalled', function () { dp = null; $('inst').hidden = true; toast('App installed'); });
  $('instBtn').onclick = function () { if (!dp) return; dp.prompt(); dp.userChoice.then(function () { dp = null; $('instBtn').hidden = true; }); };
  showInst();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(function () {});
  /* Blue bar for EVERY signed-in person (admin and technicians) until this phone is registered for alerts */
  function barText() {
    var admin = S.me && S.me.admin, p = canNotify ? Notification.permission : 'denied';
    if (p === 'denied') return { t: 'Alerts are blocked on this phone. Allow notifications for this site in the browser settings.', b: 'How' };
    if (p === 'granted') return { t: 'Finish turning on alerts on this phone.', b: 'Turn on' };
    return { t: admin ? 'Get an alert on this phone for every new booking.' : 'Get an alert on this phone when the admin assigns you a booking.', b: 'Turn on' };
  }
  window.syncAlert = function () {
    var on = !!(S.token && S.me && canNotify && !S.pushOk);
    $('alertBar').hidden = !on;
    if (on) { var x = barText(); $('alertBar').querySelector('span').textContent = x.t; $('alertBtn').textContent = x.b; }
    if (S.token && canNotify && Notification.permission === 'granted' && !S.pushOk && !S.pushTried) window.pushRegister();   // already allowed: register once, quietly
  };
  $('alertBtn').onclick = function () {
    if (!canNotify) return;
    var p = Notification.permission;
    if (p === 'denied') return toast('Tap the padlock next to the web address, set Notifications to Allow, then reload.');
    if (p === 'granted') return window.pushRegister();
    Notification.requestPermission().then(function (r) { if (r === 'granted') window.pushRegister(); else window.syncAlert(); });
  };
  /* Firebase push: get this phone's token and give it to the server so it can send alerts to this person */
  window.pushRegister = function () {
    if (!S.token || !canNotify || Notification.permission !== 'granted' || S.pushBusy) return;
    S.pushTried = true;
    if (!window.firebase) return toast('Alerts: Firebase did not load');
    if (!window.FB_CONFIG || /PASTE_/.test(window.FB_CONFIG.apiKey)) return toast('Alerts: firebase-config.js is not filled in');
    if (!('serviceWorker' in navigator)) return toast('Alerts: this browser has no service worker');
    try { if (!firebase.apps.length) firebase.initializeApp(window.FB_CONFIG); } catch (e) { return toast('Alerts: ' + e.message); }
    S.pushBusy = true;
    navigator.serviceWorker.ready.then(function (reg) {
      return firebase.messaging().getToken({ vapidKey: window.FB_VAPID, serviceWorkerRegistration: reg });
    }).then(function (t) {
      if (!t) throw new Error('Firebase gave no token');
      return api({ action: 'saveToken', fcm: t, dev: devId() }).then(function (j) {
        if (!(j && j.ok)) throw new Error('server said ' + ((j && j.error) || 'no'));
        S.pushOk = true; toast('Alerts are on for this phone');
      });
    }).catch(function (e) { if (e && e.message === 'auth') return; toast('Alerts: ' + ((e && (e.code || e.message)) || 'failed')); })
      .then(function () { S.pushBusy = false; window.syncAlert(); });
  };
  window.notifyNew = function (title, body) {
    if (!canNotify || Notification.permission !== 'granted' || !navigator.serviceWorker) return;
    navigator.serviceWorker.ready.then(function (reg) {
      reg.showNotification(title, { body: body, icon: 'images/favicon-192.png', badge: 'images/favicon-96.png', tag: 'new-booking', renotify: true, vibrate: [120, 60, 120] });
    });
  };
})();
})();
