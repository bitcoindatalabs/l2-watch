document.addEventListener('DOMContentLoaded', async () => {
  const L2 = window.L2Watch;
  L2.renderProvenanceBar();

  const data = await L2.fetchJSON('liquid/incidents.json');
  const unexpTotal = data.unexplained_outflows.reduce((a, x) => a + x.value_btc, 0);

  document.getElementById('inc-kpis').innerHTML = `
    <div class="kpi-card accent-danger">
      <div class="kpi-top"><span class="kpi-label">Unexplained Outflows</span>${L2.vbadge('cross_chain_verified')}</div>
      <div class="kpi-value text-danger">${L2.fmtBTC(unexpTotal, 2)}</div>
      <div class="kpi-sub">5 outputs (Sep 1: 3.22 BTC · Sep 6: 4,006.81 BTC)</div>
    </div>
    <div class="kpi-card accent-danger">
      <div class="kpi-top"><span class="kpi-label">Peak Shortfall (Sep 6)</span>${L2.vbadge('cross_chain_verified')}</div>
      <div class="kpi-value text-danger">−3,982.22 BTC</div>
      <div class="kpi-sub">222.79 BTC vs. 4,205.02 L-BTC (5.30% backing)</div>
    </div>
    <div class="kpi-card accent-gold">
      <div class="kpi-top"><span class="kpi-label">Time Below Full Backing</span>${L2.vbadge('cross_chain_verified')}</div>
      <div class="kpi-value text-gold">57.32 days</div>
      <div class="kpi-sub">Sep 6 14:28 UTC &rarr; Nov 2 22:04 UTC</div>
    </div>
    <div class="kpi-card accent-pass">
      <div class="kpi-top"><span class="kpi-label">Returns + Fresh Inflows</span>${L2.vbadge('bitcoin_verified')}</div>
      <div class="kpi-value text-pass">3,404 + 602.5 BTC</div>
      <div class="kpi-sub">99.94% traced Sep 7 return · unrelated Oct/Nov wallets</div>
    </div>
    <div class="kpi-card accent-cool">
      <div class="kpi-top"><span class="kpi-label">Registered Incidents</span>${L2.vbadge('cross_chain_verified')}</div>
      <div class="kpi-value">${data.incidents.length}</div>
      <div class="kpi-sub">Includes 2018–2020 CSV lapse &amp; all halts &ge; 24h</div>
    </div>
  `;

  const ser = data.sep_case_study.series;
  L2.createChart('chart-sep-case', {
    legend: { top: 0, textStyle: { color: L2.PALETTE.muted }, data: ['Verified BTC Reserve', 'L-BTC Supply'] },
    xAxis: {
      type: 'category',
      data: ser.map((r) => `${L2.fmtDateUTC(r.time)} #${r.btc_height}`),
      axisLabel: { color: L2.PALETTE.muted, formatter: (v) => v.slice(5, 10) },
    },
    yAxis: {
      type: 'value',
      name: 'BTC / L-BTC',
      min: 0,
      max: 4500,
      splitLine: { lineStyle: { color: L2.PALETTE.grid } },
      axisLabel: { color: L2.PALETTE.muted },
    },
    series: [
      {
        name: 'Verified BTC Reserve',
        type: 'line',
        step: 'end',
        showSymbol: false,
        lineStyle: { width: 2.4, color: L2.PALETTE.primary },
        areaStyle: { color: 'rgba(232, 145, 107, 0.16)' },
        data: ser.map((r) => r.reserve_btc),
      },
      {
        name: 'L-BTC Supply',
        type: 'line',
        step: 'end',
        showSymbol: false,
        lineStyle: { width: 2, type: 'dashed', color: L2.PALETTE.gold },
        data: ser.map((r) => r.supply_btc),
      },
    ],
  });

  document.getElementById('sep-timeline').innerHTML = data.sep_case_study.milestones.map((m) => {
    const dotCls = m.amount_btc < 0 ? 'dot-danger' : m.amount_btc > 0 ? 'dot-pass' : 'dot-warn';
    const amtBadge = m.amount_btc !== 0
      ? `<span class="vbadge ${m.amount_btc < 0 ? 'vbadge-danger' : 'vbadge-cross'}">${m.amount_btc > 0 ? '+' : ''}${L2.fmtBTC(m.amount_btc, 4)}</span>`
      : '';
    return `
      <div class="timeline-item">
        <span class="timeline-dot ${dotCls}" aria-hidden="true"></span>
        <div class="timeline-meta">
          <span class="mono" style="color:var(--text-primary);font-weight:600;">${L2.esc(m.date_utc)}</span>
          <span class="mono">BTC #${L2.fmtNum(m.btc_height)}${m.l2_height ? ` · Liquid #${L2.fmtNum(m.l2_height)}` : ''}</span>
          ${L2.vbadge(m.verification_class)}
          ${amtBadge}
          ${m.txid ? L2.btcTxLink(m.txid) : ''}
        </div>
        <h3 class="timeline-title">${L2.esc(m.label)}</h3>
        <p class="timeline-detail">${L2.esc(m.detail)}</p>
      </div>
    `;
  }).join('');

  document.querySelector('#table-unexplained tbody').innerHTML = data.unexplained_outflows.map((u) => `
    <tr>
      <td class="mono" data-value="${u.btc_time}">${L2.fmtDateUTC(u.btc_time, true)}</td>
      <td class="num" data-value="${u.btc_height}">${L2.fmtNum(u.btc_height)}</td>
      <td class="mono">${L2.btcTxLink(u.txid, `${L2.shortHash(u.txid, 10)}:${u.vout}`)}</td>
      <td class="num" data-value="${u.value_btc}" style="color:var(--l2-danger);font-weight:600;">${L2.fmtNum(u.value_btc, 8)}</td>
      <td><span class="vbadge ${u.input_paths === 'emergency' ? 'vbadge-warn' : 'vbadge-danger'}">${L2.esc(u.input_paths)}</span></td>
      <td class="mono">${L2.esc(u.script_type)}</td>
    </tr>
  `).join('');
  L2.enhanceSortableTable(document.getElementById('table-unexplained'));

  const kinds = [...new Set(data.incidents.map((i) => i.kind))].sort();
  const kindSel = document.getElementById('inc-kind-filter');
  kinds.forEach((k) => {
    const opt = document.createElement('option');
    opt.value = k;
    opt.textContent = k;
    kindSel.appendChild(opt);
  });

  const incBody = document.querySelector('#table-incidents tbody');
  function renderIncidents() {
    const k = kindSel.value;
    const rows = data.incidents.filter((i) => k === 'all' || i.kind === k);
    incBody.innerHTML = rows.map((i) => {
      const txHtml = (i.txids || []).slice(0, 3).map((t) => L2.btcTxLink(t)).join('<br>') || '—';
      const extraTx = (i.txids || []).length > 3 ? `<div style="font-size:0.74rem;color:var(--text-secondary);">+${i.txids.length - 3} more</div>` : '';
      return `
        <tr>
          <td class="mono" data-value="${i.start_time || 0}">${L2.fmtDateUTC(i.start_time)}</td>
          <td><span class="vbadge ${i.kind.includes('shortfall') || i.kind.includes('unexplained') ? 'vbadge-danger' : 'vbadge-warn'}">${L2.esc(i.kind)}</span></td>
          <td class="num" data-value="${i.duration_s ?? -1}">${L2.fmtDuration(i.duration_s)}</td>
          <td class="num" data-value="${i.magnitude_btc ?? -1}" style="color:var(--text-primary);">${i.magnitude_btc != null ? L2.fmtNum(i.magnitude_btc, 4) : '—'}</td>
          <td>${L2.vbadge(i.verification_class)}</td>
          <td class="mono">${txHtml}${extraTx}</td>
          <td style="max-width:340px;">${L2.esc(i.method || i.detection_rule)}</td>
        </tr>
      `;
    }).join('');
  }
  renderIncidents();
  L2.enhanceSortableTable(document.getElementById('table-incidents'));
  kindSel.addEventListener('change', renderIncidents);
});
