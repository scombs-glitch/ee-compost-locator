/* EE SB 253 & 261 coverage checker — app script (hosted on GitHub Pages; the Divi
   module holds markup/CSS only). Gate contract mirrors the legislation map:
   POST JSON as text/plain to window.EESB253_GATE_URL, fail-open, 90-day localStorage
   grant (eeSb253Email/eeSb253EmailTs), pixels only on captured success + consent. */
(function () {
  'use strict';
  var K_EMAIL = 'eeSb253Email', K_TS = 'eeSb253EmailTs';
  var WINDOW_MS = 90 * 24 * 60 * 60 * 1000;
  var state = { rev: null, ca: null, persona: '', busy: false, reqSeq: 0 };

  function $(id) { return document.getElementById(id); }
  function granted() {
    try {
      var ts = parseInt(localStorage.getItem(K_TS), 10);
      return !!localStorage.getItem(K_EMAIL) && ts && (Date.now() - ts) < WINDOW_MS;
    } catch (e) { return false; }
  }
  function persist(email) {
    try { localStorage.setItem(K_EMAIL, email); localStorage.setItem(K_TS, String(Date.now())); } catch (e) {}
  }
  function consent() {
    return (typeof window.EE_MARKETING_CONSENT === 'undefined') ? true : !!window.EE_MARKETING_CONSENT;
  }
  function uuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0, v = c === 'x' ? r : (r & 0x3) | 0x8; return v.toString(16);
    });
  }
  function fireLead(eventId, leadType) {
    try {
      if (typeof window.fbq === 'function') {
        window.fbq('track', 'Lead', { lead_type: leadType, content_name: 'sb253-checker' }, { eventID: eventId });
      }
      if (typeof window.gtag === 'function') {
        window.gtag('event', 'generate_lead', { tool: 'sb253-checker', lead_type: leadType });
      }
      if (typeof window.lintrk === 'function' && window.EE_LI_CONVERSION_ID) {
        window.lintrk('track', { conversion_id: window.EE_LI_CONVERSION_ID });
      }
    } catch (e) { /* trackers never break the flow */ }
  }

  // ---- verdict copy -------------------------------------------------------
  function verdictHeadline() {
    if (state.ca === 'no') return 'You are not directly covered today.';
    if (state.rev === 'lt500') return 'You are not directly covered today.';
    if (state.rev === '500to1b') return 'SB 261 applies to you (currently paused by the courts).';
    return 'Both laws apply to you.';
  }
  function verdictHtml() {
    var h = '';
    var supplier = '<p><strong>Either way, Scope 3 flows downhill.</strong> Companies covered by ' +
      'SB 253 must report supply-chain (Scope 3) emissions starting in 2027 on FY2026 data — ' +
      'and that means they will ask their foodservice suppliers, distributors, and brands for ' +
      'emissions data. Food waste sent to landfill (methane) and packaging procurement are exactly ' +
      'the line items they will look at first. Getting ahead of those questions is a sales ' +
      'advantage, not just a compliance chore.</p>';
    if (state.ca === 'no') {
      h += '<h4>Not directly covered today</h4>' +
        '<p>The California laws reach companies doing business in California. If that changes — ' +
        'or if copycat bills pending in New York, Illinois, New Jersey, and Washington pass — ' +
        'this picture shifts.</p>' + supplier;
    } else if (state.rev === 'lt500') {
      h += '<h4>Not directly covered today</h4>' +
        '<p>Below the $500M revenue threshold, neither SB 253 nor SB 261 applies to you directly.</p>' + supplier;
    } else if (state.rev === '500to1b') {
      h += '<h4>SB 261 applies to you (currently paused by the courts)</h4>' +
        '<p>Over $500M in revenue and doing business in California puts you in scope for ' +
        '<strong>SB 261</strong>: a public, biennial climate-related financial risk report. ' +
        'Enforcement is <strong>paused by a Ninth Circuit injunction</strong> (Nov 18, 2025) and ' +
        'CARB says reporting is voluntary while the appeal is decided — but a ruling could ' +
        'restore the obligation with little runway, so prudent teams are preparing now.</p>' +
        '<p>SB 253 (emissions disclosure) starts at $1B revenue — not you today, but note the ' +
        'threshold if you are growing.</p>' + supplier;
    } else {
      h += '<h4>Both laws apply to you</h4>' +
        '<p><strong>SB 253</strong> (in force): annual greenhouse-gas disclosure. Scope 1 &amp; 2 ' +
        'reports are due <strong>August 10, 2026</strong> under CARB’s initial regulation, and ' +
        '<strong>Scope 3 reporting begins in 2027</strong> on FY2026 data. Penalties up to $500k/yr.</p>' +
        '<p><strong>SB 261</strong>: biennial climate-risk report — currently ' +
        '<strong>paused by a Ninth Circuit injunction</strong> with CARB treating reporting as ' +
        'voluntary pending appeal. Penalties up to $50k/yr when enforceable.</p>' +
        '<p><strong>Where foodservice fits:</strong> your Scope 3 will include landfilled food ' +
        'waste (methane) and purchased packaging. Organics diversion and compostable packaging ' +
        'turn both into reportable, auditable reductions — numbers your sustainability team ' +
        'can actually file.</p>';
    }
    h += '<p class="eesb-fine">Educational summary, not legal advice — confirm your ' +
      'obligations with counsel. Status as of July 14, 2026; the Ninth Circuit appeal ' +
      '(argued Jan 9, 2026) can change SB 261’s status at any time.</p>' +
      '<p><a class="eesb-cta" href="https://emeraldecovations.com/contact-us">Talk to Emerald Ecovations about reportable Scope 3 wins</a></p>';
    return h;
  }

  function answersSummary() {
    var rev = state.rev === 'gt1b' ? '>$1B' : state.rev === '500to1b' ? '$500M-$1B' : '<$500M';
    return rev + ' / CA:' + state.ca;
  }

  // ---- flow ---------------------------------------------------------------
  function refresh() {
    var ready = state.rev && state.ca;
    $('eesb-go').disabled = !ready;
    $('eesb-go').textContent = ready ? 'See my coverage snapshot' : 'Answer both questions above';
  }
  function wireChips(group, key) {
    var chips = document.querySelectorAll('[data-' + group + ']');
    Array.prototype.forEach.call(chips, function (c) {
      c.addEventListener('click', function () {
        state[key] = c.getAttribute('data-' + group);
        Array.prototype.forEach.call(chips, function (x) {
          var on = x === c; x.classList.toggle('eesb-on', on); x.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
        refresh();
      });
    });
  }
  function showVerdict() {
    $('eesb-gate').style.display = 'none';
    $('eesb-verdict').innerHTML = verdictHtml();
    $('eesb-verdict').style.display = 'block';
  }
  function submit() {
    if (state.busy) return;
    var name = $('eesb-name').value.trim();
    var email = $('eesb-email').value.trim();
    var err = $('eesb-err');
    if (!name) { err.textContent = 'Please enter your name.'; return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { err.textContent = 'Please enter a valid email address.'; return; }
    err.textContent = '';
    state.busy = true;
    var myReq = ++state.reqSeq;
    var btn = $('eesb-submit'); btn.disabled = true; btn.textContent = 'One moment…';
    var url = window.EESB253_GATE_URL;
    var eventId = uuid();
    var payload = JSON.stringify({
      email: email, name: name, lead_type: state.persona || '',
      zip: answersSummary(), timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent, event_id: eventId, source: 'sb253-checker'
    });
    function finish(captured) {
      if (myReq !== state.reqSeq) return;
      state.busy = false; btn.disabled = false; btn.textContent = 'Show my snapshot';
      if (captured === true) { persist(email); if (consent()) fireLead(eventId, state.persona || ''); }
      showVerdict();
    }
    if (!url || typeof window.fetch !== 'function' || /YOUR_DEPLOYMENT_ID/.test(String(url))) {
      finish(false); return; // fail open, no capture
    }
    try {
      fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: payload })
        .then(function (r) { if (!r || !r.ok) throw new Error('http'); return r.json(); })
        .then(function (j) { finish(!!(j && j.success === true)); })
        .catch(function () { finish(false); });
    } catch (e) { finish(false); }
  }
  function go() {
    if (granted()) { showVerdict(); return; }
    // tease the verdict headline free; the email unlocks the full snapshot
    var t = $('eesb-tease');
    if (!t) {
      t = document.createElement('p');
      t.id = 'eesb-tease'; t.className = 'eesb-tease';
      $('eesb-gate').insertBefore(t, $('eesb-gate').firstChild);
    }
    t.innerHTML = 'Based on your answers: <strong>' + verdictHeadline() + '</strong> ' +
      'Unlock the full snapshot for the deadlines, penalties, and next moves.';
    $('eesb-gate').style.display = 'block';
    $('eesb-verdict').style.display = 'none';
    var n = $('eesb-name'); if (n) n.focus();
  }

  function countdown() {
    var card = document.querySelector('#eesb .eesb-card');
    if (!card) return;
    var days = Math.ceil((new Date(2026, 7, 10).getTime() - Date.now()) / 86400000);
    var p = document.createElement('p');
    p.className = 'eesb-count';
    p.textContent = (days > 0)
      ? 'First SB 253 reports are due August 10, 2026 — ' + days + ' day' + (days !== 1 ? 's' : '') + ' away.'
      : 'The first SB 253 reports were due August 10, 2026 — Scope 3 reporting is next (2027).';
    card.insertBefore(p, card.firstChild);
  }

  function start() {
    if (!$('eesb-go')) return;
    countdown();
    wireChips('rev', 'rev');
    wireChips('ca', 'ca');
    wireChips('persona', 'persona');
    $('eesb-go').addEventListener('click', go);
    $('eesb-submit').addEventListener('click', submit);
    $('eesb-email').addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(); });
    refresh();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
