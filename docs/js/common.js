/* Shared utilities, BDL Golden-Obsidian ECharts theme, provenance bar & accessible sortable tables */
window.L2Watch = (() => {
  const PALETTE = {
    primary: '#E8916B',     // BDL Brand Terracotta
    gold: '#FFB000',        // BDL Signal Gold
    rose: '#D4A298',        // BDL Dusty Rose
    slate: '#8293AB',       // BDL Muted Blue-Grey
    pass: '#10B981',        // Verified / Healthy
    danger: '#EF4444',      // Shortfall / Halt
    text: '#FDF6E3',
    muted: '#94A3B8',
    grid: 'rgba(253, 246, 227, 0.08)',
    bg: '#080A0F',
    tooltipBg: 'rgba(13, 15, 20, 0.96)',
  };

  const charts = [];
  let resizeBound = false;

  async function fetchJSON(path) {
    const res = await fetch(`data/${path}`);
    if (!res.ok) throw new Error(`Failed to load data/${path} (HTTP ${res.status})`);
    return res.json();
  }

  function esc(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function fmtNum(v, decimals = 0) {
    if (v === null || v === undefined || Number.isNaN(Number(v))) return '—';
    return Number(v).toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  }

  function fmtBTC(v, decimals = 2) {
    if (v === null || v === undefined || Number.isNaN(Number(v))) return '—';
    return `${fmtNum(v, decimals)} BTC`;
  }

  function fmtPct(v, decimals = 2) {
    if (v === null || v === undefined || Number.isNaN(Number(v))) return '—';
    return `${fmtNum(v, decimals)}%`;
  }

  function fmtDuration(seconds) {
    if (seconds === null || seconds === undefined || Number.isNaN(Number(seconds))) return '—';
    const s = Number(seconds);
    const sign = s < 0 ? '-' : '';
    const a = Math.abs(s);
    if (a < 120) return `${sign}${Math.round(a)}s`;
    if (a < 7200) return `${sign}${(a / 60).toFixed(1)} min`;
    if (a < 172800) return `${sign}${(a / 3600).toFixed(1)} hr`;
    return `${sign}${(a / 86400).toFixed(2)} days`;
  }

  function fmtDateUTC(ts, includeTime = false) {
    if (!ts) return '—';
    const d = new Date(Number(ts) * 1000);
    if (Number.isNaN(d.getTime())) return String(ts);
    const iso = d.toISOString();
    return includeTime ? `${iso.slice(0, 16).replace('T', ' ')} UTC` : iso.slice(0, 10);
  }

  function shortHash(h, n = 8) {
    if (!h) return '—';
    const s = String(h);
    return s.length > n * 2 + 2 ? `${s.slice(0, n)}…${s.slice(-6)}` : s;
  }

  function btcTxLink(txid, label) {
    if (!txid) return '—';
    return `<a class="tx-link" href="https://mempool.space/tx/${esc(txid)}" target="_blank" rel="noopener noreferrer" title="${esc(txid)}">${esc(label || shortHash(txid))}</a>`;
  }

  function liquidTxLink(txid, label) {
    if (!txid) return '—';
    return `<a class="tx-link" href="https://blockstream.info/liquid/tx/${esc(txid)}" target="_blank" rel="noopener noreferrer" title="${esc(txid)}">${esc(label || shortHash(txid))}</a>`;
  }

  function liquidAssetLink(assetId, label) {
    if (!assetId) return '—';
    return `<a class="tx-link" href="https://blockstream.info/liquid/asset/${esc(assetId)}" target="_blank" rel="noopener noreferrer" title="${esc(assetId)}">${esc(label || shortHash(assetId))}</a>`;
  }

  function vbadge(cls) {
    const map = {
      cross_chain_verified: ['vbadge-cross', 'Cross-Chain'],
      bitcoin_verified: ['vbadge-btc', 'Bitcoin L1'],
      l2_chain_verified: ['vbadge-l2', 'Liquid L2'],
      inferred: ['vbadge-inferred', 'Inferred'],
      operator_reported: ['vbadge-neutral', 'Operator Reported'],
    };
    const [css, text] = map[cls] || ['vbadge-neutral', cls || 'Audit'];
    return `<span class="vbadge ${css}">${esc(text)}</span>`;
  }

  async function renderProvenanceBar(targetId = 'provenance-bar') {
    const el = document.getElementById(targetId);
    if (!el) return null;
    try {
      const m = await fetchJSON('manifest.json');
      const btcH = fmtNum(m.cutoff.bitcoin_height);
      const l2H = fmtNum(m.cutoff.l2_height);
      const cutoffDate = (m.cutoff.bitcoin_time_utc || '').slice(0, 10);
      const pass = m.validation_summary.pass;
      const fail = m.validation_summary.fail;
      el.innerHTML = `
        <div class="provenance-left">
          <span class="provenance-item"><span class="status-dot" aria-hidden="true"></span><strong>${pass}/${pass + fail} invariants pass</strong></span>
          <span class="provenance-item">Cutoff: <strong>BTC ${btcH}</strong> · <strong>Liquid ${l2H}</strong> (${esc(cutoffDate)} UTC)</span>
          <span class="provenance-item">Dataset: <strong>l2-data ${esc(m.l2_data_release)}</strong></span>
        </div>
        <div class="provenance-links">
          <a href="https://doi.org/${esc(m.zenodo_doi)}" target="_blank" rel="noopener noreferrer"><i class="fa-solid fa-book-bookmark"></i> DOI: ${esc(m.zenodo_doi)}</a>
          <a href="https://github.com/bitcoindatalabs/l2-data" target="_blank" rel="noopener noreferrer"><i class="fa-brands fa-github"></i> Raw Parquet</a>
          <a href="methods.html"><i class="fa-solid fa-shield-halved"></i> Methods</a>
        </div>
      `;
      return m;
    } catch (e) {
      el.textContent = 'Audit provenance unavailable.';
      return null;
    }
  }

  function createChart(elOrId, option) {
    const el = typeof elOrId === 'string' ? document.getElementById(elOrId) : elOrId;
    if (!el || typeof echarts === 'undefined') return null;
    el.innerHTML = '';
    const existing = echarts.getInstanceByDom(el);
    const chart = existing || echarts.init(el, null, { renderer: 'canvas' });
    const baseOption = {
      backgroundColor: 'transparent',
      textStyle: {
        color: PALETTE.muted,
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
      },
      tooltip: {
        trigger: 'axis',
        backgroundColor: PALETTE.tooltipBg,
        borderColor: 'rgba(253, 246, 227, 0.14)',
        textStyle: { color: PALETTE.text, fontSize: 12 },
      },
      grid: { left: 56, right: 24, top: 36, bottom: 42, containLabel: true },
    };
    chart.setOption(Object.assign({}, baseOption, option), true);
    if (!charts.includes(chart)) charts.push(chart);
    if (!resizeBound) {
      window.addEventListener('resize', () => {
        for (const c of charts) {
          if (!c.isDisposed()) c.resize();
        }
      });
      resizeBound = true;
    }
    return chart;
  }

  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

  function enhanceSortableTable(tableEl) {
    if (!tableEl || tableEl.dataset.sortEnhanced === '1') return;
    const thead = tableEl.tHead;
    const tbody = tableEl.tBodies[0];
    if (!thead || !tbody) return;
    tableEl.dataset.sortEnhanced = '1';

    let statusEl = tableEl.parentElement.querySelector('.sr-status');
    if (!statusEl) {
      statusEl = document.createElement('div');
      statusEl.className = 'sr-status';
      statusEl.setAttribute('role', 'status');
      tableEl.parentElement.appendChild(statusEl);
    }

    const headers = [...thead.rows[0].cells];
    headers.forEach((th, idx) => {
      if (th.dataset.sortable === 'false') return;
      const label = th.textContent.trim();
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.innerHTML = `<span>${esc(label)}</span><span class="sort-indicator" aria-hidden="true"></span>`;
      th.textContent = '';
      th.appendChild(btn);

      btn.addEventListener('click', () => {
        const dir = th.getAttribute('aria-sort') === 'ascending' ? 'descending' : 'ascending';
        headers.forEach((h) => h.removeAttribute('aria-sort'));
        th.setAttribute('aria-sort', dir);

        const type = th.dataset.type || 'text';
        const factor = dir === 'ascending' ? 1 : -1;
        const rows = [...tbody.rows];
        const keyed = rows.map((row) => {
          const cell = row.cells[idx];
          const raw = cell ? (cell.dataset.value ?? cell.textContent.trim()) : '';
          return { row, val: type === 'number' ? Number(raw) : raw };
        });
        keyed.sort((a, b) => {
          if (type === 'number') {
            const an = Number.isNaN(a.val) ? -Infinity : a.val;
            const bn = Number.isNaN(b.val) ? -Infinity : b.val;
            return factor * (an - bn);
          }
          return factor * collator.compare(String(a.val), String(b.val));
        });
        const move = typeof tbody.moveBefore === 'function'
          ? (r) => tbody.moveBefore(r, null)
          : (r) => tbody.appendChild(r);
        for (const item of keyed) move(item.row);
        statusEl.textContent = `Sorted by ${label}, ${dir}, ${rows.length} rows`;
      });
    });
  }

  return {
    PALETTE,
    fetchJSON,
    esc,
    fmtNum,
    fmtBTC,
    fmtPct,
    fmtDuration,
    fmtDateUTC,
    shortHash,
    btcTxLink,
    liquidTxLink,
    liquidAssetLink,
    vbadge,
    renderProvenanceBar,
    createChart,
    enhanceSortableTable,
  };
})();
