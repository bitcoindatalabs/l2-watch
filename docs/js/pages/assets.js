document.addEventListener('DOMContentLoaded', async () => {
  const L2 = window.L2Watch;
  L2.renderProvenanceBar();

  const data = await L2.fetchJSON('liquid/assets.json');
  const s = data.summary;
  const usdt = data.tracked.find((x) => x.label === 'USDt');

  document.getElementById('assets-kpis').innerHTML = `
    <div class="kpi-card accent-primary">
      <div class="kpi-top"><span class="kpi-label">Total Issued Assets</span>${L2.vbadge('l2_chain_verified')}</div>
      <div class="kpi-value text-primary">${L2.fmtNum(s.total_assets)}</div>
      <div class="kpi-sub">${L2.fmtNum(s.fully_explicit)} with fully explicit issuance amounts</div>
    </div>
    <div class="kpi-card accent-pass">
      <div class="kpi-top"><span class="kpi-label">USDt Upper Bound</span>${L2.vbadge('l2_chain_verified')}</div>
      <div class="kpi-value text-pass">${L2.fmtNum(usdt?.upper_bound, 0)}</div>
      <div class="kpi-sub">11 reissuances · 500 burned · transfers blinded</div>
    </div>
    <div class="kpi-card accent-cool">
      <div class="kpi-top"><span class="kpi-label">Single-Unit Assets</span>${L2.vbadge('l2_chain_verified')}</div>
      <div class="kpi-value">${s.single_unit_pct}%</div>
      <div class="kpi-sub">${L2.fmtNum(s.single_unit_no_token)} assets with no reissuance token</div>
    </div>
    <div class="kpi-card accent-gold">
      <div class="kpi-top"><span class="kpi-label">Registry-Bound Assets</span>${L2.vbadge('l2_chain_verified')}</div>
      <div class="kpi-value text-gold">${L2.fmtNum(s.registry_bound)}</div>
      <div class="kpi-sub">${s.registered_pct}% of all assets (contract-hash verified)</div>
    </div>
    <div class="kpi-card accent-danger">
      <div class="kpi-top"><span class="kpi-label">Duplicate Tickers</span>${L2.vbadge('l2_chain_verified')}</div>
      <div class="kpi-value text-danger">${L2.fmtNum(s.duplicate_tickers)}</div>
      <div class="kpi-sub">Includes spoof USDt (21M units, tether.rip)</div>
    </div>
  `;

  L2.createChart('chart-usdt', {
    xAxis: { type: 'category', data: data.usdt_series.map((r) => r.d), axisLabel: { color: L2.PALETTE.muted } },
    yAxis: {
      type: 'value',
      name: 'USDt (Millions)',
      splitLine: { lineStyle: { color: L2.PALETTE.grid } },
      axisLabel: { color: L2.PALETTE.muted, formatter: (v) => `${(v / 1e6).toFixed(0)}M` },
    },
    series: [
      {
        name: 'USDt Explicit Upper Bound',
        type: 'line',
        step: 'end',
        showSymbol: false,
        lineStyle: { width: 2.4, color: L2.PALETTE.pass },
        areaStyle: { color: 'rgba(16, 185, 129, 0.16)' },
        data: data.usdt_series.map((r) => r.upper_bound),
      },
    ],
  });

  L2.createChart('chart-asset-years', {
    legend: { top: 0, textStyle: { color: L2.PALETTE.muted } },
    xAxis: { type: 'category', data: data.issuance_by_year.map((r) => r.yr), axisLabel: { color: L2.PALETTE.muted } },
    yAxis: { type: 'value', name: 'New Assets', splitLine: { lineStyle: { color: L2.PALETTE.grid } }, axisLabel: { color: L2.PALETTE.muted } },
    series: [
      { name: 'Single-Unit (No Token)', type: 'bar', stack: 'a', itemStyle: { color: L2.PALETTE.slate }, data: data.issuance_by_year.map((r) => r.single_unit) },
      { name: 'Multi-Unit / Reissuable', type: 'bar', stack: 'a', itemStyle: { color: L2.PALETTE.primary }, data: data.issuance_by_year.map((r) => r.multi_or_reissuable) },
    ],
  });

  document.querySelector('#table-tracked tbody').innerHTML = data.tracked.map((a) => `
    <tr>
      <td class="mono" style="color:var(--text-primary);font-weight:700;">${L2.esc(a.label)}</td>
      <td>${L2.esc(a.reg_name || '')}<div class="mono" style="font-size:0.75rem;color:var(--text-secondary);">${L2.esc(a.reg_domain || '—')}</div></td>
      <td class="num" data-value="${a.issued ?? -1}">${a.n_amounts_blinded > 0 && a.issued === 0 ? '<span class="vbadge vbadge-inferred">Blinded</span>' : L2.fmtNum(a.issued, a.precision > 2 ? 2 : a.precision)}</td>
      <td class="num" data-value="${a.burned ?? -1}">${L2.fmtNum(a.burned, a.precision > 2 ? 2 : a.precision)}</td>
      <td class="num" data-value="${a.upper_bound ?? -1}" style="color:var(--text-primary);font-weight:600;">${a.upper_bound != null ? L2.fmtNum(a.upper_bound, a.precision > 2 ? 2 : a.precision) : 'Blinded'}</td>
      <td class="num" data-value="${a.n_reissuances}">${L2.fmtNum(a.n_reissuances)}</td>
      <td class="num" data-value="${a.n_explicit_txs}">${L2.fmtNum(a.n_explicit_txs)}</td>
      <td class="mono">${L2.liquidAssetLink(a.asset_id)}</td>
    </tr>
  `).join('');
  L2.enhanceSortableTable(document.getElementById('table-tracked'));

  const regBody = document.querySelector('#table-registered tbody');
  function renderRegistered() {
    const q = (document.getElementById('asset-search').value || '').trim().toLowerCase();
    const rows = data.top_registered.filter((a) => !q || `${a.reg_ticker} ${a.reg_name} ${a.reg_domain} ${a.asset_id}`.toLowerCase().includes(q));
    regBody.innerHTML = rows.map((a) => `
      <tr>
        <td class="mono" style="color:var(--text-primary);font-weight:600;">${L2.esc(a.reg_ticker || '—')}</td>
        <td class="mono">${L2.esc(a.reg_domain || '—')}</td>
        <td class="num" data-value="${a.n_explicit_txs}">${L2.fmtNum(a.n_explicit_txs)}</td>
        <td class="num" data-value="${a.n_reissuances}">${L2.fmtNum(a.n_reissuances)}</td>
        <td class="mono">${L2.liquidAssetLink(a.asset_id)}</td>
      </tr>
    `).join('');
  }
  renderRegistered();
  L2.enhanceSortableTable(document.getElementById('table-registered'));
  document.getElementById('asset-search').addEventListener('input', renderRegistered);

  document.querySelector('#table-dups tbody').innerHTML = data.duplicate_tickers.map((d) => `
    <tr>
      <td class="mono" style="color:var(--l2-danger);font-weight:600;">${L2.esc(d.reg_ticker)}</td>
      <td class="num" data-value="${d.asset_count}">${L2.fmtNum(d.asset_count)}</td>
      <td class="mono">${L2.esc((d.domains || []).join(', '))}</td>
    </tr>
  `).join('');
  L2.enhanceSortableTable(document.getElementById('table-dups'));
});
