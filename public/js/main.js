(() => {
  'use strict';

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));

  // 1. Copy SHA-256 checksum
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
    const original = label ? label.textContent : 'Copy';
    btn.addEventListener('click', async () => {
      const ok = await copyText(btn.dataset.copy);
      if (!label) return;
      label.textContent = ok ? 'Copied' : 'Failed';
      clearTimeout(btn._t);
      btn._t = setTimeout(() => { label.textContent = original; }, 1600);
    });
  });

  // 3. Work Table: USB DAC Compatibility & Diagnostic Upload (with WebMCP)
  let dacCatalog = [];
  const dacTableBody = $('#dac-table-body');
  const dacSearchInput = $('#dac-search-input');

  const renderDacRows = (items) => {
    if (!dacTableBody) return;
    dacTableBody.textContent = '';
    if (!items.length) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 6;
      td.className = 'table-empty';
      td.textContent = 'No matching DACs yet. Submit your profile dump below.';
      tr.appendChild(td);
      dacTableBody.appendChild(tr);
      return;
    }
    items.forEach((dac) => {
      const tr = document.createElement('tr');

      const tdName = document.createElement('td');
      tdName.className = 'dac-title';
      tdName.textContent = dac.name || 'Unknown DAC';

      const tdId = document.createElement('td');
      tdId.textContent = `${dac.vid}:${dac.pid}`;

      const tdProto = document.createElement('td');
      tdProto.textContent = dac.protocol || 'UAC2';

      const tdSpec = document.createElement('td');
      tdSpec.textContent = `${dac.max_rate || '-'} / ${dac.max_bits || '-'}`;

      const tdVol = document.createElement('td');
      tdVol.textContent = dac.hw_volume ? 'Hardware' : 'Software';

      const tdStatus = document.createElement('td');
      const statusText = dac.status || 'Testing';
      const badge = document.createElement('span');
      badge.className = `badge ${/verified|native/i.test(statusText) ? 'badge-native' : 'badge-compat'}`;
      badge.textContent = statusText;
      tdStatus.appendChild(badge);

      tr.append(tdName, tdId, tdProto, tdSpec, tdVol, tdStatus);
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
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        dacCatalog = Array.isArray(data) ? data : [];
        renderDacRows(dacCatalog);
      })
      .catch(() => renderDacRows([]));
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
      if (dacFormStatus) dacFormStatus.textContent = 'Submitting DAC profile...';
      if (dacSubmitBtn) dacSubmitBtn.disabled = true;

      try {
        const fd = new FormData(dacReportForm);
        const result = await submitDacDumpPayload({
          dac_json: fd.get('dac_json'),
          symptom: fd.get('symptom'),
          email: fd.get('email'),
        });
        if (dacFormStatus) {
          dacFormStatus.textContent = result.message || 'Submitted. Thank you.';
        }
        dacReportForm.reset();
      } catch (err) {
        if (dacFormStatus) {
          dacFormStatus.textContent = err.message || 'Invalid JSON or upload failed.';
        }
      } finally {
        if (dacSubmitBtn) dacSubmitBtn.disabled = false;
      }
    });
  }

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

  const yearEl = $('[data-year]');
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());
})();
