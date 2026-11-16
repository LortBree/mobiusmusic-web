/* ==========================================================================
   Mobius Music — UI Interactions & High-Performance Visual Identity
   - 120 FPS pointer/gyro tracking with organic lerp inertia for 2D fallback
   - Staggered scroll reveals
   - Floating navigation bar with scroll direction detection
   - One-click SHA-256 copy with instant feedback
   - Interactive Signal Path comparison switcher
   - Copyright year dynamic updater
   ========================================================================== */
(() => {
  'use strict';

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));

  /* ---------------------------------------------------------------------
     1. Staggered Scroll Reveals
     --------------------------------------------------------------------- */
  const revealEls = $$('.reveal');
  const groups = new Map();
  revealEls.forEach((el) => {
    const p = el.parentElement;
    const i = groups.get(p) || 0;
    el.style.setProperty('--d', `${Math.min(i, 6) * 70}ms`);
    groups.set(p, i + 1);
  });

  if ('IntersectionObserver' in window && !reduceMotion) {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('is-in');
            io.unobserve(e.target);
          }
        });
      },
      { rootMargin: '0px 0px -6% 0px', threshold: 0.05 }
    );
    revealEls.forEach((el) => io.observe(el));
  } else {
    revealEls.forEach((el) => el.classList.add('is-in'));
  }

  /* ---------------------------------------------------------------------
     3. Floating Nav: Hide on scroll down, show on scroll up
     --------------------------------------------------------------------- */
  const nav = $('.nav');
  let lastY = window.scrollY;
  window.addEventListener(
    'scroll',
    () => {
      const y = window.scrollY;
      if (nav) nav.classList.toggle('is-hidden', y > lastY && y > 240);
      lastY = y;
    },
    { passive: true }
  );

  const navLinks = $$('[data-nav]');
  const sectionMap = navLinks
    .map((a) => ({ a, el: document.querySelector(a.getAttribute('href')) }))
    .filter((x) => x.el);

  if ('IntersectionObserver' in window && sectionMap.length) {
    const navIO = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          const hit = sectionMap.find((x) => x.el === e.target);
          if (hit && e.isIntersecting) {
            navLinks.forEach((l) => l.classList.remove('is-active'));
            hit.a.classList.add('is-active');
          }
        });
      },
      { rootMargin: '-45% 0px -50% 0px' }
    );
    sectionMap.forEach((x) => navIO.observe(x.el));
  }

  /* ---------------------------------------------------------------------
     4. Copy SHA-256 Checksum (One Click)
     --------------------------------------------------------------------- */
  const copyText = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch { ok = false; }
      ta.remove();
      return ok;
    }
  };

  $$('[data-copy]').forEach((btn) => {
    const label = $('[data-copy-label]', btn);
    const original = label ? label.textContent : '';
    btn.addEventListener('click', async () => {
      const ok = await copyText(btn.dataset.copy);
      if (!label) return;
      label.textContent = ok ? 'COPIED ✓' : 'FAILED';
      btn.classList.add('is-copied');
      clearTimeout(btn._t);
      btn._t = setTimeout(() => {
        label.textContent = original;
        btn.classList.remove('is-copied');
      }, 1800);
    });
  });

  /* ---------------------------------------------------------------------
     5. Interactive Signal Path Toggle
     --------------------------------------------------------------------- */
  const paths = $('.paths');
  const tabs = $$('.path-toggle [data-path]');
  const setPath = (name) => {
    if (!paths) return;
    paths.dataset.active = name;
    tabs.forEach((t) => {
      const on = t.dataset.path === name;
      t.classList.toggle('is-active', on);
      t.setAttribute('aria-selected', String(on));
    });
  };
  tabs.forEach((t) => t.addEventListener('click', () => setPath(t.dataset.path)));
  $$('[data-path-panel]').forEach((p) =>
    p.addEventListener('mouseenter', () => setPath(p.dataset.pathPanel))
  );

  /* ---------------------------------------------------------------------
     6. DAC Compatibility Matrix, Diagnostic Submission & WebMCP Tools
     --------------------------------------------------------------------- */
  let dacCatalog = [];
  const dacTableBody = $('#dac-table-body');
  const dacSearchInput = $('#dac-search-input');

  const renderDacRows = (items) => {
    if (!dacTableBody) return;
    dacTableBody.textContent = '';
    if (!items.length) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 5;
      td.className = 'mono dac-empty';
      td.textContent = 'No matching DACs yet. Submit your profile dump on the right.';
      tr.appendChild(td);
      dacTableBody.appendChild(tr);
      return;
    }
    items.forEach((dac) => {
      const tr = document.createElement('tr');

      const tdName = document.createElement('td');
      tdName.textContent = dac.name || 'Unknown DAC';
      const protoSpan = document.createElement('span');
      protoSpan.className = 'dac-proto mono';
      protoSpan.textContent = dac.protocol || 'UAC2';
      tdName.appendChild(protoSpan);

      const tdId = document.createElement('td');
      tdId.className = 'mono';
      tdId.textContent = `${dac.vid}:${dac.pid}`;

      const tdSpec = document.createElement('td');
      tdSpec.className = 'mono';
      tdSpec.textContent = `${dac.max_rate || '-'} / ${dac.max_bits || '-'}`;

      const tdVol = document.createElement('td');
      tdVol.className = 'mono';
      tdVol.textContent = dac.hw_volume ? 'Yes' : 'SW';

      const tdStatus = document.createElement('td');
      const pill = document.createElement('span');
      const isVerified = String(dac.status || '').toLowerCase().includes('verified');
      pill.className = `dac-status mono${isVerified ? ' is-verified' : ''}`;
      pill.textContent = dac.status || 'Testing';
      tdStatus.appendChild(pill);

      tr.append(tdName, tdId, tdSpec, tdVol, tdStatus);
      dacTableBody.appendChild(tr);
    });
  };

  const filterDacs = (query) => {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return dacCatalog;
    return dacCatalog.filter((d) =>
      `${d.name} ${d.vid} ${d.pid} ${d.protocol} ${d.status}`.toLowerCase().includes(q)
    );
  };

  if (dacTableBody) {
    fetch('dacs.json')
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        dacCatalog = Array.isArray(data) ? data : [];
        renderDacRows(dacCatalog);
      })
      .catch(() => {
        renderDacRows([]);
      });
  }

  if (dacSearchInput) {
    dacSearchInput.addEventListener('input', () => {
      renderDacRows(filterDacs(dacSearchInput.value));
    });
  }

  const submitDacDumpPayload = async ({ dac_json, symptom, email }, signal) => {
    const parsed = typeof dac_json === 'string' ? JSON.parse(dac_json) : dac_json;
    if (!parsed || typeof parsed !== 'object' || !parsed.device || !parsed.topology) {
      throw new Error('JSON must include "device" and "topology" objects.');
    }
    parsed.diagnostic = parsed.diagnostic || {};
    if (symptom) parsed.diagnostic.symptom = symptom;
    if (email) parsed.diagnostic.reporter_email = email;

    const response = await fetch('/api/dac-report', {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parsed),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(result.error || `Upload failed (${response.status})`);
    }
    return result;
  };

  const dacReportForm = $('#dac-report-form');
  const dacFormStatus = $('#dac-form-status');
  const dacSubmitBtn = $('#dac-submit-btn');

  if (dacReportForm) {
    dacReportForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (dacFormStatus) {
        dacFormStatus.classList.remove('is-error');
        dacFormStatus.textContent = 'Submitting DAC profile...';
      }
      if (dacSubmitBtn) dacSubmitBtn.disabled = true;

      try {
        const fd = new FormData(dacReportForm);
        const result = await submitDacDumpPayload({
          dac_json: fd.get('dac_json'),
          symptom: fd.get('symptom'),
          email: fd.get('email'),
        });
        if (dacFormStatus) {
          dacFormStatus.textContent = result.message || 'Submitted! Thank you for helping expand Mobius DAC support.';
        }
        dacReportForm.reset();
      } catch (err) {
        if (dacFormStatus) {
          dacFormStatus.classList.add('is-error');
          dacFormStatus.textContent = err.message || 'Invalid JSON or upload failed.';
        }
      } finally {
        if (dacSubmitBtn) dacSubmitBtn.disabled = false;
      }
    });
  }

  // Imperative WebMCP registrations for AI browser agents
  if ('modelContext' in document && typeof document.modelContext?.registerTool === 'function') {
    Promise.resolve(
      document.modelContext.registerTool({
        name: 'check_dac_compatibility',
        description: 'Search the Mobius Music USB DAC compatibility matrix by DAC name, VID, PID, or UAC protocol.',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Optional search query (e.g. "JA11", "0x2972", "UAC1"). Omit to list all tested DACs.',
            },
          },
        },
        execute: async ({ query } = {}) => {
          if (!dacCatalog.length) {
            const res = await fetch('dacs.json');
            dacCatalog = res.ok ? await res.json() : [];
          }
          const matches = filterDacs(query);
          if (dacSearchInput && query) {
            dacSearchInput.value = query;
            renderDacRows(matches);
          }
          return JSON.stringify({ count: matches.length, dacs: matches });
        },
      })
    ).catch(() => {});

    Promise.resolve(
      document.modelContext.registerTool({
        name: 'submit_dac_profile_dump',
        description: 'Validate and submit a schema_version 1 Mobius DAC JSON profile dump to Mobius Support.',
        inputSchema: {
          type: 'object',
          required: ['dac_json'],
          properties: {
            dac_json: {
              type: 'string',
              description: 'JSON string exported by Mobius Settings -> USB DAC -> Dump / Send DAC Profile',
            },
            symptom: {
              type: 'string',
              enum: ['fallback_aaudio', 'no_sound', 'glitch', 'wrong_pitch', 'hw_volume_broken'],
              description: 'Observed audio issue',
            },
            email: {
              type: 'string',
              format: 'email',
              description: 'Optional reply email address',
            },
          },
        },
        annotations: { consequentialHint: true },
        execute: async (params, { signal } = {}) => {
          const res = await submitDacDumpPayload(params, signal);
          return JSON.stringify(res);
        },
      })
    ).catch(() => {});
  }

  /* ---------------------------------------------------------------------
     7. Copyright Year Dynamic Updater
     --------------------------------------------------------------------- */
  const yearEl = $('[data-year]');
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());
})();
