// v2/src/config.js — EE Compost Locator v2 configuration (shared: browser + Node).
// Data only. No behavior.
(function (root) {
  'use strict';

  var BRAND = {
    green: '#00a94f', greenDark: '#006837', yellow: '#f1cd14',
    white: '#ffffff', text: '#212121', grayMid: '#9e9e9e'
  };

  // Filter chip definitions. group: 'place' | 'material' | 'attribute'.
  // 'equals' tests record[field] === value; 'includes' tests record[field] (array) contains value.
  var FILTERS = [
    { id: 'commercial_facility', label: 'Commercial Composting Facility', group: 'place', field: 'type', equals: 'commercial_facility' },
    { id: 'hauler',              label: 'Hauler',                          group: 'place', field: 'type', equals: 'hauler' },
    { id: 'drop_off',            label: 'Drop Off',                        group: 'place', field: 'type', equals: 'drop_off' },
    { id: 'municipality',        label: 'Municipality',                    group: 'place', field: 'type', equals: 'municipality' },
    { id: 'anaerobic_digestion', label: 'Anaerobic Digestion',            group: 'place', field: 'type', equals: 'anaerobic_digestion' },
    { id: 'food_scraps',         label: 'Food Scraps',                     group: 'material', field: 'acceptedMaterials', includes: 'food_scraps' },
    { id: 'yard_waste',          label: 'Yard Waste',                      group: 'material', field: 'acceptedMaterials', includes: 'yard_waste' },
    { id: 'certified_packaging', label: 'Accepts Certified Packaging',     group: 'material', field: 'acceptedMaterials', includes: 'certified_packaging' },
    { id: 'uncoated_fiber',      label: 'Uncoated Fiber',                  group: 'material', field: 'acceptedMaterials', includes: 'uncoated_fiber' },
    { id: 'accepts_ee',          label: 'Accepts EE ✓',               group: 'attribute', field: 'acceptsEE', equals: 'verified' },
    { id: 'sta_certified',       label: 'STA Certified',                   group: 'attribute', field: 'staCertified', equals: true },
    { id: 'full_scale',          label: 'Full-scale food-waste',           group: 'attribute', field: 'fullScaleFoodWaste', equals: true },
    { id: 'serves_institutional',label: 'Serves institutional/university', group: 'attribute', field: 'servesInstitutional', equals: true },
    { id: 'commercial_pickup',   label: 'Commercial pickup / business accounts', group: 'attribute', field: 'commercialPickup', equals: true }
  ];

  // Presets pre-activate PLACE-TYPE chips only. Attribute/material chips (Accepts EE,
  // Certified Packaging) are one-tap opt-in refinements — defaulting them ON would, under
  // AND-across-group semantics, hide every facility lacking the verified badge and empty
  // the map until first-party verification scales.
  var TOGGLE_PRESETS = {
    commercial:  ['commercial_facility', 'hauler'],
    residential: ['drop_off', 'municipality']
  };

  var GATE = {
    durationDays: 90,
    appsScriptUrl: '', // PASTE DEPLOYED WEB APP URL LOCALLY BEFORE BUILD — DO NOT COMMIT
    storageKeys: { email: 'eeLocatorEmail', ts: 'eeLocatorEmailTs' }
  };

  var MAP = {
    maplibreVersion: '4.7.1',
    baseStyleUrl: 'https://tiles.openfreemap.org/styles/positron',
    initialCenter: [-96.5, 38.5], // [lng, lat]
    initialZoom: 4,
    // Contiguous US [ [west,south], [east,north] ] — the map opens fit to this, not all of North
    // America. minZoom stops zoom-out to the whole hemisphere. No maxBounds on purpose: AK/HI/PR/GU
    // are US and must stay reachable, and no rectangle includes Alaska while excluding Canada.
    usBounds: [[-125, 24.5], [-66.9, 49.4]],
    minZoom: 3,
    clusterRadius: 50,
    clusterMaxZoom: 12
  };

  // External authoritative sources we link out to (never republish wholesale).
  var LINKS = { staDirectory: 'https://www.compostingcouncil.org/page/participants' };

  var config = { BRAND: BRAND, FILTERS: FILTERS, TOGGLE_PRESETS: TOGGLE_PRESETS, GATE: GATE, MAP: MAP, LINKS: LINKS };

  if (typeof module !== 'undefined' && module.exports) { module.exports = config; }
  else { root.EE = root.EE || {}; root.EE.config = config; }
})(typeof window !== 'undefined' ? window : this);
// v2/src/filters.js — pure faceted-filter logic (browser + Node).
// Semantics: OR within a filter group, AND across groups; a group with no active chip imposes no constraint.
(function (root) {
  'use strict';
  var cfg = (typeof module !== 'undefined' && module.exports) ? require('./config.js') : root.EE.config;

  function matchesChip(record, chip) {
    var v = record[chip.field];
    if (Object.prototype.hasOwnProperty.call(chip, 'equals')) return v === chip.equals;
    if (Object.prototype.hasOwnProperty.call(chip, 'includes')) return Array.isArray(v) && v.indexOf(chip.includes) !== -1;
    return false;
  }

  function groupActive(activeIds, filters) {
    var byGroup = {};
    filters.forEach(function (c) {
      if (activeIds.indexOf(c.id) === -1) return;
      (byGroup[c.group] = byGroup[c.group] || []).push(c);
    });
    return byGroup;
  }

  function recordPasses(record, activeIds, filters) {
    filters = filters || cfg.FILTERS;
    var byGroup = groupActive(activeIds, filters);
    return Object.keys(byGroup).every(function (g) {
      // Materials are reported for only ~1/3 of facilities. A blank acceptedMaterials means
      // "unknown", not "rejects" — keep such facilities visible under any materials filter so a
      // click never silently hides two-thirds of the map (they're labeled in the UI).
      if (g === 'material') {
        var am = record.acceptedMaterials;
        if (!am || am.length === 0) return true;
      }
      return byGroup[g].some(function (c) { return matchesChip(record, c); });
    });
  }

  // Active chip set = the toggle view's preset, with explicit user overrides applied.
  // userToggled: { chipId: true (force on) | false (force off) }.
  function activeChipIds(toggleView, userToggled, presets) {
    presets = presets || cfg.TOGGLE_PRESETS;
    userToggled = userToggled || {};
    var set = {};
    (presets[toggleView] || []).forEach(function (id) { set[id] = true; });
    Object.keys(userToggled).forEach(function (id) {
      if (userToggled[id]) set[id] = true; else delete set[id];
    });
    return Object.keys(set);
  }

  // Equivalent MapLibre filter expression over GeoJSON feature properties.
  function toMapLibreFilter(activeIds, filters) {
    filters = filters || cfg.FILTERS;
    var byGroup = groupActive(activeIds, filters);
    var groups = Object.keys(byGroup);
    if (groups.length === 0) return ['all'];
    var expr = ['all'];
    groups.forEach(function (g) {
      var ors = ['any'];
      byGroup[g].forEach(function (c) {
        if (Object.prototype.hasOwnProperty.call(c, 'equals')) {
          ors.push(['==', ['get', c.field], c.equals]);
        } else if (Object.prototype.hasOwnProperty.call(c, 'includes')) {
          ors.push(['in', c.includes, ['coalesce', ['get', c.field], ['literal', []]]]);
        }
      });
      expr.push(ors);
    });
    return expr;
  }

  var api = { matchesChip: matchesChip, recordPasses: recordPasses, activeChipIds: activeChipIds, toMapLibreFilter: toMapLibreFilter };
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
  else { root.EE = root.EE || {}; root.EE.filters = api; }
})(typeof window !== 'undefined' ? window : this);
// v2/src/gate.js — engage-first, fail-open email gate logic (browser + Node).
// All side effects (fetch, storage, trackers, consent, rng) are injected so logic is unit-testable.
(function (root) {
  'use strict';
  var cfg = (typeof module !== 'undefined' && module.exports) ? require('./config.js') : root.EE.config;
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  var DAY_MS = 86400000;

  function isValidEmail(email) { return typeof email === 'string' && EMAIL_RE.test(email.trim()); }

  function hasValidGate(now, storage) {
    try {
      var email = storage.getItem(cfg.GATE.storageKeys.email);
      var ts = storage.getItem(cfg.GATE.storageKeys.ts);
      if (!email || !ts) return false;
      return (now - parseInt(ts, 10)) < cfg.GATE.durationDays * DAY_MS;
    } catch (e) { return false; }
  }

  function setGate(email, now, storage) {
    try {
      storage.setItem(cfg.GATE.storageKeys.email, email);
      storage.setItem(cfg.GATE.storageKeys.ts, String(now));
    } catch (e) { /* non-fatal */ }
  }

  // High-value intent, and no existing session/localStorage grant.
  function shouldGate(isHighValueIntent, sessionGranted, now, storage) {
    return !!isHighValueIntent && !sessionGranted && !hasValidGate(now, storage);
  }

  function newEventId(rng) {
    rng = rng || Math.random;
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = (rng() * 16) | 0, v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  function buildPayload(o) {
    if (!isValidEmail(o.email)) throw new Error('invalid email');
    if (o.leadType !== 'commercial' && o.leadType !== 'residential') throw new Error('lead_type required');
    return {
      email: o.email.trim(), lead_type: o.leadType, zip: o.zip || '',
      timestamp: new Date(o.now).toISOString(), userAgent: o.userAgent || '',
      event_id: o.eventId, source: 'compost-locator-v2'
    };
  }

  // deps: { appsScriptUrl?, fetch, storage, trackers:{fireLead(eventId,leadType)}, consent:()=>bool, rng }
  // Returns Promise<{granted, captured, eventId, error?}>. Always granted unless validation fails.
  function submit(deps, o) {
    if (!isValidEmail(o.email)) return Promise.resolve({ granted: false, captured: false, error: 'invalid email' });
    if (o.leadType !== 'commercial' && o.leadType !== 'residential') return Promise.resolve({ granted: false, captured: false, error: 'lead_type required' });
    var eventId = newEventId(deps.rng);
    var payload = buildPayload({ email: o.email, leadType: o.leadType, zip: o.zip, now: o.now, userAgent: o.userAgent, eventId: eventId });
    var url = (deps.appsScriptUrl != null) ? deps.appsScriptUrl : cfg.GATE.appsScriptUrl;
    function grant(captured) {
      if (captured) {
        setGate(o.email.trim(), o.now, deps.storage);
        if (deps.consent && deps.consent() && deps.trackers && deps.trackers.fireLead) {
          deps.trackers.fireLead(eventId, o.leadType);
        }
      }
      return { granted: true, captured: !!captured, eventId: eventId };
    }
    if (!url) return Promise.resolve(grant(false)); // misconfigured → fail open, no capture
    return deps.fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload)
    }).then(function (r) {
      if (!r || !r.ok) throw new Error('http');
      return r.json();
    }).then(function (j) {
      return grant(!!(j && j.success));
    }).catch(function () {
      return grant(false); // fail open
    });
  }

  var api = {
    isValidEmail: isValidEmail, hasValidGate: hasValidGate, setGate: setGate,
    shouldGate: shouldGate, newEventId: newEventId, buildPayload: buildPayload, submit: submit
  };
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
  else { root.EE = root.EE || {}; root.EE.gate = api; }
})(typeof window !== 'undefined' ? window : this);
// v2/src/mapview.js — MapLibre immersive map + toggle + filters + results + bottom sheet.
// Depends (injected via init opts): maplibregl (global), EE.config, EE.filters, EE.gate.
(function (root) {
  'use strict';

  function toGeoJSON(records) {
    return {
      type: 'FeatureCollection',
      features: records.map(function (r) {
        return {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [r.lng, r.lat] },
          properties: { id: r.id, acceptsEE: r.acceptsEE }
        };
      })
    };
  }

  function distMiles(aLat, aLng, bLat, bLng) {
    var R = 3958.8, dLat = (bLat - aLat) * Math.PI / 180, dLng = (bLng - aLng) * Math.PI / 180;
    var s = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(aLat * Math.PI / 180) * Math.cos(bLat * Math.PI / 180) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
  }

  function el(id) { return document.getElementById(id); }
  function placeLabel(cfg, t) {
    var f = cfg.FILTERS.find(function (c) { return c.group === 'place' && c.equals === t; });
    return f ? f.label : t;
  }

  // opts: { root, data, cfg, filters, gate, gateDeps, now }
  function init(opts) {
    var cfg = opts.cfg, filters = opts.filters, gate = opts.gate, ML = root.maplibregl;
    var records = opts.data.slice();
    var byId = {}; records.forEach(function (r) { byId[r.id] = r; });
    var state = { view: 'all', userToggled: {}, sessionGranted: false, center: null, pending: null };

    function activeIds() { return filters.activeChipIds(state.view, state.userToggled); }
    function filtered() { var a = activeIds(); return records.filter(function (r) { return filters.recordPasses(r, a); }); }

    var map = null;
    try {
      map = new ML.Map({
        container: 'ee-map', style: cfg.MAP.baseStyleUrl,
        center: cfg.MAP.initialCenter, zoom: cfg.MAP.initialZoom,
        minZoom: cfg.MAP.minZoom
      });
    } catch (e) {
      // Map/WebGL unavailable in this environment — list, filters, search and gate still work.
      if (window.console) console.warn('EE locator: map unavailable, continuing without it —', e && e.message);
    }

    function applyEEStyle() {
      var tries = [['background', 'background-color', cfg.BRAND.white], ['water', 'fill-color', '#cfe0e6']];
      tries.forEach(function (t) { try { map.setPaintProperty(t[0], t[1], t[2]); } catch (e) { /* layer absent */ } });
    }

    function refreshData() { if (map && map.getSource('locs')) map.getSource('locs').setData(toGeoJSON(filtered())); }

    if (map) map.on('load', function () {
      applyEEStyle();
      try { map.fitBounds(cfg.MAP.usBounds, { padding: 24, animate: false }); } catch (e) {}
      map.addSource('locs', {
        type: 'geojson', data: toGeoJSON(filtered()), cluster: true,
        clusterRadius: cfg.MAP.clusterRadius, clusterMaxZoom: cfg.MAP.clusterMaxZoom
      });
      map.addLayer({
        id: 'clusters', type: 'circle', source: 'locs', filter: ['has', 'point_count'],
        paint: { 'circle-color': cfg.BRAND.green, 'circle-opacity': 0.85,
          'circle-radius': ['step', ['get', 'point_count'], 16, 25, 22, 100, 30] }
      });
      map.addLayer({
        id: 'cluster-count', type: 'symbol', source: 'locs', filter: ['has', 'point_count'],
        layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-size': 12 },
        paint: { 'text-color': '#ffffff' }
      });
      map.addLayer({
        id: 'pts', type: 'circle', source: 'locs', filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-radius': 7,
          'circle-color': ['match', ['get', 'acceptsEE'], 'verified', cfg.BRAND.yellow, cfg.BRAND.green],
          'circle-stroke-width': 2, 'circle-stroke-color': '#ffffff'
        }
      });
      map.on('click', 'clusters', function (e) {
        var f = map.queryRenderedFeatures(e.point, { layers: ['clusters'] })[0];
        if (!f) return;
        map.getSource('locs').getClusterExpansionZoom(f.properties.cluster_id)
          .then(function (zoom) { map.easeTo({ center: f.geometry.coordinates, zoom: zoom }); })
          .catch(function () {});
      });
      map.on('click', 'pts', function (e) { openDetail(byId[e.features[0].properties.id]); });
      map.on('mouseenter', 'pts', function () { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'pts', function () { map.getCanvas().style.cursor = ''; });
    });

    // ---- toggle (view presets) ----
    Array.prototype.forEach.call(opts.root.querySelectorAll('#ee-toggle button'), function (b) {
      b.addEventListener('click', function () {
        state.view = b.getAttribute('data-view');
        state.userToggled = {};
        Array.prototype.forEach.call(opts.root.querySelectorAll('#ee-toggle button'), function (x) {
          var on = x === b; x.classList.toggle('active', on); x.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
        renderChips(); refreshData(); renderResults();
      });
    });

    // ---- filter chips ----
    // How many facilities each chip can EVER match (context-free). Chips with 0 are hidden —
    // no point showing a filter backed by no data.
    var backingCount = {};
    cfg.FILTERS.forEach(function (c) {
      var n = 0;
      for (var i = 0; i < records.length; i++) if (filters.matchesChip(records[i], c)) n++;
      backingCount[c.id] = n;
    });

    // Faceted count: records matching chip c AND the active chips in OTHER groups (c's own
    // group is ignored, standard facet semantics). Shows the result size each chip yields so
    // stacking is visible, and lets us gray out dead-ends before they zero the map.
    function facetCount(c, active) {
      var others = active.filter(function (id) {
        var f = cfg.FILTERS.find(function (x) { return x.id === id; });
        return f && f.group !== c.group;
      });
      var n = 0;
      for (var i = 0; i < records.length; i++) {
        if (filters.matchesChip(records[i], c) && filters.recordPasses(records[i], others)) n++;
      }
      return n;
    }

    function renderChips() {
      var host = el('ee-chips'); host.innerHTML = '';
      var active = activeIds();
      cfg.FILTERS.forEach(function (c) {
        if (backingCount[c.id] === 0) return;          // hide filters with no data behind them
        var isActive = active.indexOf(c.id) !== -1;
        var cnt = facetCount(c, active);               // results if this chip is applied now
        var chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'ee-chip' + (isActive ? ' active' : '') + ((cnt === 0 && !isActive) ? ' ee-chip-empty' : '');
        chip.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        chip.textContent = c.label + ' (' + cnt + ')';
        if (cnt === 0 && !isActive) { chip.disabled = true; host.appendChild(chip); return; }
        chip.addEventListener('click', function () {
          var on = activeIds().indexOf(c.id) !== -1;
          state.userToggled[c.id] = !on;
          renderChips(); refreshData(); renderResults();
        });
        host.appendChild(chip);
      });
    }

    // ---- results list / bottom sheet ----
    function materialActive() {
      return activeIds().some(function (id) {
        var f = cfg.FILTERS.find(function (x) { return x.id === id; });
        return f && f.group === 'material';
      });
    }
    function renderResults() {
      var list = filtered();
      var within = false, nearest = false;
      if (state.center) {
        list.forEach(function (r) { r._d = distMiles(state.center.lat, state.center.lng, r.lat, r.lng); });
        list.sort(function (a, b) { return a._d - b._d; });
        var near = list.filter(function (r) { return r._d <= 60; });
        if (near.length) { list = near; within = true; } else { list = list.slice(0, 20); nearest = true; }
      }
      var total = list.length;
      var label = nearest
        ? 'nearest ' + total + ' location' + (total !== 1 ? 's' : '')
        : total + ' location' + (total !== 1 ? 's' : '') + (within ? ' within 60 mi' : '');
      // materials are sparsely reported → be honest about confirmed vs unreported when filtering
      if (materialActive()) {
        var confirmed = list.filter(function (r) { return (r.acceptedMaterials || []).length; }).length;
        label += ' · ' + confirmed + ' confirmed, rest unreported';
      }
      el('ee-results-count').textContent = label;
      var host = el('ee-results-list'); host.innerHTML = '';
      list.slice(0, 100).forEach(function (r) {
        var card = document.createElement('button'); card.type = 'button'; card.className = 'ee-card';
        var ee = r.acceptsEE === 'verified' ? '<span class="ee-badge">Accepts EE ✓</span>' : '';
        var dist = (r._d != null) ? '<span class="ee-dist">' + r._d.toFixed(1) + ' mi</span>' : '';
        card.innerHTML = ee + '<h4>' + r.name + '</h4><div class="ee-sub">' +
          placeLabel(cfg, r.type) + ' · ' + [r.city, r.state].filter(Boolean).join(', ') + dist + '</div>';
        card.addEventListener('click', function () { openDetail(r); });
        host.appendChild(card);
      });
      if (total > 100) {
        var more = document.createElement('div'); more.className = 'ee-more';
        more.textContent = 'Showing first 100 of ' + total + ' — search or filter to narrow.';
        host.appendChild(more);
      }
    }

    // ---- facility detail (high-value intent → gate) ----
    function openDetail(r) {
      // Only interrupt with the email gate if a capture endpoint is actually wired. With no
      // Apps Script URL the gate captures nothing, so it would be pure friction — skip it.
      // Setting GATE.appsScriptUrl (and rebuilding) auto-activates the gate.
      var captureUrl = (opts.gateDeps.appsScriptUrl != null) ? opts.gateDeps.appsScriptUrl : (cfg.GATE && cfg.GATE.appsScriptUrl);
      if (captureUrl && gate.shouldGate(true, state.sessionGranted, opts.now(), opts.gateDeps.storage)) {
        state.pending = function () { showDetail(r); };
        showGate();
        return;
      }
      showDetail(r);
    }
    function showDetail(r) {
      if (map) map.flyTo({ center: [r.lng, r.lat], zoom: 12 });
      var box = el('ee-detail');
      var ee = r.acceptsEE === 'verified' ? '<span class="ee-badge">Accepts EE ✓</span>' : '';
      var sta = r.staCertified ? '<span class="ee-badge ee-badge-sta">STA Certified</span>' : '';
      var staLink = r.staCertified ? '<p><a href="' + (r.staUrl || cfg.LINKS.staDirectory) + '" target="_blank" rel="noopener">STA test results &amp; details ↗</a></p>' : '';
      var site = r.website ? (/^https?:\/\//i.test(r.website) ? r.website : 'https://' + r.website) : '';
      var mats = (r.acceptedMaterials && r.acceptedMaterials.length)
        ? ' · accepts ' + r.acceptedMaterials.join(', ').replace(/_/g, ' ')
        : ' · materials not reported';
      box.innerHTML = ee + sta + '<h3>' + r.name + '</h3>' +
        '<p>' + [r.address, r.city, r.state, r.zip].filter(Boolean).join(', ') + '</p>' +
        (r.phone ? '<p>' + r.phone + '</p>' : '') +
        (site ? '<p><a href="' + site + '" target="_blank" rel="noopener">Website</a></p>' : '') +
        '<p class="ee-sub">' + placeLabel(cfg, r.type) + mats + '</p>' +
        staLink +
        '<p class="ee-note">Type &amp; materials are derived from public records and may be out of date — confirm acceptance directly with the facility.</p>' +
        '<button id="ee-detail-close" type="button">Close</button>';
      box.classList.remove('ee-hidden');
      el('ee-detail-close').addEventListener('click', function () { box.classList.add('ee-hidden'); });
    }

    // ---- gate modal ----
    var gateReturnFocus = null;
    function showGate() {
      gateReturnFocus = document.activeElement;
      el('ee-gate-modal').classList.remove('ee-hidden');
      var email = el('ee-gate-email'); if (email) email.focus();
    }
    function hideGate() {
      el('ee-gate-modal').classList.add('ee-hidden');
      state.pending = null;
      if (gateReturnFocus && gateReturnFocus.focus) { try { gateReturnFocus.focus(); } catch (e) {} }
    }
    (function wireGate() {
      var choice = null;
      var modal = el('ee-gate-modal');
      var closeBtn = el('ee-gate-close'); if (closeBtn) closeBtn.addEventListener('click', hideGate);
      modal.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') { hideGate(); return; }
        if (e.key !== 'Tab') return;
        var f = Array.prototype.filter.call(
          modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'),
          function (x) { return !x.disabled && x.offsetParent !== null; });
        if (!f.length) return;
        var first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      });
      Array.prototype.forEach.call(opts.root.querySelectorAll('#ee-gate-modal [data-lead]'), function (b) {
        b.addEventListener('click', function () {
          choice = b.getAttribute('data-lead');
          Array.prototype.forEach.call(opts.root.querySelectorAll('#ee-gate-modal [data-lead]'), function (x) {
            var on = x === b; x.classList.toggle('active', on); x.setAttribute('aria-pressed', on ? 'true' : 'false');
          });
        });
      });
      el('ee-gate-submit').addEventListener('click', function () {
        var email = el('ee-gate-email').value.trim();
        var err = el('ee-gate-error');
        if (!gate.isValidEmail(email)) { err.textContent = 'Enter a valid email.'; return; }
        if (!choice) { err.textContent = 'Pick one so we point you the right way.'; return; }
        err.textContent = '';
        var btn = el('ee-gate-submit'); btn.disabled = true; btn.textContent = 'One sec…';
        gate.submit(opts.gateDeps, {
          email: email, leadType: choice, zip: state.center ? state.center.q : '',
          now: opts.now(), userAgent: navigator.userAgent
        }).then(function (res) {
          btn.disabled = false; btn.textContent = 'Show me';
          if (!res.granted) { err.textContent = res.error || 'Please try again.'; return; }
          state.sessionGranted = true; hideGate();
          if (state.pending) { var p = state.pending; state.pending = null; p(); }
        });
      });
    })();

    // ---- search (runtime geocode — US only, via Zippopotam: free, CORS *, no key) ----
    el('ee-search-btn').addEventListener('click', doSearch);
    el('ee-search-input').addEventListener('keydown', function (e) { if (e.key === 'Enter') doSearch(); });
    function geocodeUS(q) {
      var zip = q.match(/^\s*(\d{5})\s*$/), url;
      if (zip) {
        url = 'https://api.zippopotam.us/us/' + zip[1];
      } else {
        var parts = q.split(','), city = parts[0].trim(), st = parts[parts.length - 1].trim();
        if (parts.length < 2 || !city || !/^[A-Za-z]{2}$/.test(st)) return Promise.resolve(null);
        url = 'https://api.zippopotam.us/us/' + st.toLowerCase() + '/' + encodeURIComponent(city);
      }
      return fetch(url).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
        var ps = d && d.places; if (!ps || !ps.length) return null;
        var lat = 0, lng = 0;
        ps.forEach(function (p) { lat += parseFloat(p.latitude); lng += parseFloat(p.longitude); });
        return { lat: lat / ps.length, lng: lng / ps.length };
      });
    }
    function doSearch() {
      var q = el('ee-search-input').value.trim(); if (!q) return;
      var countEl = el('ee-results-count'); countEl.textContent = 'Searching…';
      geocodeUS(q).then(function (pt) {
        if (!pt) { countEl.textContent = 'Couldn’t find “' + q + '” — try a 5-digit ZIP or City, ST.'; return; }
        state.center = { lat: pt.lat, lng: pt.lng, q: q };
        if (map) map.flyTo({ center: [pt.lng, pt.lat], zoom: 9 });
        renderResults();
      }).catch(function () { countEl.textContent = 'Search is unavailable right now — please try again.'; });
    }

    // ---- mobile bottom-sheet drag (3 snap points) ----
    (function sheet() {
      var s = el('ee-results'), handle = el('ee-results-handle'), snaps = ['peek', 'half', 'full'], idx = 1, startY = 0, cur = 0, dragging = false;
      s.setAttribute('data-snap', snaps[idx]);
      handle.addEventListener('pointerdown', function (e) { dragging = true; startY = e.clientY; cur = 0; try { handle.setPointerCapture(e.pointerId); } catch (x) {} });
      handle.addEventListener('pointermove', function (e) { if (dragging) cur = e.clientY - startY; });
      handle.addEventListener('pointerup', function () {
        if (!dragging) return; dragging = false;
        if (cur < -30 && idx < 2) idx++; else if (cur > 30 && idx > 0) idx--;
        s.setAttribute('data-snap', snaps[idx]);
      });
    })();

    renderChips();
    renderResults();
    var ac = el('ee-attrib-count'); if (ac) ac.textContent = records.length.toLocaleString() + ' facilities mapped';
    return { refreshData: refreshData, _state: state };
  }

  var api = { init: init };
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
  else { root.EE = root.EE || {}; root.EE.mapview = api; }
})(typeof window !== 'undefined' ? window : this);
// v2/src/bootstrap.js — wire config + filters + gate + mapview against window.LOCATION_DATA.
(function (root) {
  'use strict';
  function start() {
    var EE = root.EE;
    // Only require our own modules to boot. maplibregl is optional — mapview.init() wraps the
    // map in try/catch and every map call is guarded, so the list/filters/search/gate still
    // work if the map CDN or WebGL fails. (Requiring maplibregl here would kill the whole app.)
    if (!EE || !EE.mapview) return;
    var gateDeps = {
      fetch: root.fetch.bind(root),
      storage: root.localStorage,
      // Marketing-pixel consent. A cookie banner can set window.EE_MARKETING_CONSENT to
      // true/false; until it does, defaults to true (the Lead event only fires AFTER a visitor
      // voluntarily submits their email — an affirmative action). Wire it before EU traffic.
      consent: function () {
        return (typeof root.EE_MARKETING_CONSENT === 'undefined') ? true : !!root.EE_MARKETING_CONSENT;
      },
      trackers: {
        // Fires only on a captured lead, with consent. event_id lets Meta CAPI dedup later.
        // Base pixels (fbq init / lintrk) are page-level tags — see deploy/tracking.md.
        fireLead: function (eventId, leadType) {
          try {
            if (typeof root.fbq === 'function') {
              root.fbq('track', 'Lead', { lead_type: leadType }, { eventID: eventId });
            }
            if (typeof root.lintrk === 'function' && root.EE_LI_CONVERSION_ID) {
              root.lintrk('track', { conversion_id: root.EE_LI_CONVERSION_ID });
            }
          } catch (e) { /* trackers must never break the gate */ }
        }
      },
      rng: Math.random
    };
    EE.mapview.init({
      root: document.getElementById('ee-locator-wrapper'),
      data: root.LOCATION_DATA || [],
      cfg: EE.config, filters: EE.filters, gate: EE.gate,
      gateDeps: gateDeps, now: function () { return Date.now(); }
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})(typeof window !== 'undefined' ? window : this);
