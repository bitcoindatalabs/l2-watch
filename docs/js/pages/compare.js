document.addEventListener('DOMContentLoaded', async () => {
  const L2 = window.L2Watch;
  L2.renderProvenanceBar();

  const data = await L2.fetchJSON('common/compare.json');

  document.getElementById('compare-cards').innerHTML = data.systems.map((sys) => {
    const planned = sys.status === 'planned';
    const statusBadge = sys.status === 'audited'
      ? '<span class="vbadge vbadge-cross">Full Cross-Chain Audit</span>'
      : sys.status === 'live_source'
      ? '<span class="vbadge vbadge-btc">Live BDL Telemetry</span>'
      : '<span class="vbadge vbadge-neutral">Planned (bdl-082)</span>';
    const linkHtml = sys.dashboard_url
      ? `<a href="${L2.esc(sys.dashboard_url)}" ${sys.dashboard_url.startsWith('http') ? 'target="_blank" rel="noopener"' : ''} style="margin-top:auto;padding-top:10px;color:var(--primary);text-decoration:none;font-size:0.84rem;font-weight:600;">Open Dashboard &rarr;</a>`
      : `<span style="margin-top:auto;padding-top:10px;color:var(--text-secondary);font-size:0.8rem;">L1 footprint mapping in progress</span>`;
    return `
      <article class="compare-card ${planned ? 'is-planned' : ''}">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
          <h2 style="margin:0;font-size:1.15rem;color:var(--text-primary);">${L2.esc(sys.name)}</h2>
          ${statusBadge}
        </div>
        <div style="font-size:0.82rem;color:var(--text-secondary);">${L2.esc(sys.category)} · ${L2.esc(sys.cutoff)}</div>
        <div class="kpi-value ${sys.btc_locked ? 'text-primary' : ''}" style="font-size:1.6rem;">
          ${sys.btc_locked != null ? L2.fmtBTC(sys.btc_locked, 2) : 'TBD'}
        </div>
        <div style="font-size:0.78rem;color:var(--text-secondary);margin-top:-8px;">${L2.esc(sys.btc_locked_label)}</div>
        <dl class="compare-dl">
          <div><dt>Custody</dt><dd>${L2.esc(sys.custody_model)}</dd></div>
          <div><dt>Unilateral Exit</dt><dd>${L2.esc(sys.unilateral_exit)}</dd></div>
          <div><dt>Liveness / Scale</dt><dd>${L2.esc(sys.liveness_metric)}</dd></div>
          <div><dt>Assets</dt><dd>${L2.esc(sys.assets_support)}</dd></div>
        </dl>
        ${linkHtml}
      </article>
    `;
  }).join('');

  const measured = data.systems.filter((s) => s.btc_locked != null);
  L2.createChart('chart-compare-btc', {
    xAxis: { type: 'value', name: 'BTC', splitLine: { lineStyle: { color: L2.PALETTE.grid } }, axisLabel: { color: L2.PALETTE.muted } },
    yAxis: { type: 'category', data: measured.map((s) => s.name), axisLabel: { color: L2.PALETTE.text, fontWeight: 600 } },
    grid: { left: 130, right: 40, top: 20, bottom: 36, containLabel: true },
    series: [
      {
        name: 'Measured L1 BTC',
        type: 'bar',
        barMaxWidth: 38,
        label: { show: true, position: 'right', color: L2.PALETTE.text, formatter: (p) => `${L2.fmtNum(p.value, 2)} BTC` },
        data: measured.map((s) => ({
          value: s.btc_locked,
          itemStyle: { color: s.id === 'liquid' ? L2.PALETTE.primary : L2.PALETTE.gold, borderRadius: [0, 6, 6, 0] },
        })),
      },
    ],
  });

  document.querySelector('#table-compare tbody').innerHTML = data.systems.map((s) => `
    <tr>
      <td style="color:var(--text-primary);font-weight:600;">${L2.esc(s.name)}</td>
      <td>${L2.esc(s.category)}</td>
      <td class="num" data-value="${s.btc_locked ?? -1}" style="color:var(--text-primary);">${s.btc_locked != null ? L2.fmtNum(s.btc_locked, 2) : '—'}</td>
      <td>${L2.esc(s.unilateral_exit)}</td>
      <td>${L2.esc(s.custody_model)}</td>
      <td>${L2.esc(s.privacy_model)}</td>
      <td>${L2.vbadge(s.verification_class)}</td>
    </tr>
  `).join('');
  L2.enhanceSortableTable(document.getElementById('table-compare'));
});
