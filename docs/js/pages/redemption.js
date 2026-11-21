document.addEventListener('DOMContentLoaded', async () => {
  const L2 = window.L2Watch;
  L2.renderProvenanceBar();

  const data = await L2.fetchJSON('liquid/redemption.json');
  const s = data.summary;

  document.getElementById('redemption-kpis').innerHTML = `
    <div class="kpi-card accent-primary">
      <div class="kpi-top"><span class="kpi-label">Cumulative Peg-Ins</span>${L2.vbadge('cross_chain_verified')}</div>
      <div class="kpi-value text-primary">${L2.fmtBTC(s.total_pegin_btc, 2)}</div>
      <div class="kpi-sub">${L2.fmtNum(s.total_pegins)} peg-ins · p50 claim ${L2.fmtDuration(s.all_pegin_p50_s)}</div>
    </div>
    <div class="kpi-card accent-gold">
      <div class="kpi-top"><span class="kpi-label">Matched Peg-Outs</span>${L2.vbadge('cross_chain_verified')}</div>
      <div class="kpi-value text-gold">${L2.fmtBTC(s.total_pegout_btc, 2)}</div>
      <div class="kpi-sub">${L2.fmtNum(s.pegouts_matched)} / ${L2.fmtNum(s.total_pegouts)} matched (${s.pegout_match_pct}%)</div>
    </div>
    <div class="kpi-card accent-pass">
      <div class="kpi-top"><span class="kpi-label">Aug 2026 Baseline (30d)</span>${L2.vbadge('cross_chain_verified')}</div>
      <div class="kpi-value text-pass">${L2.fmtDuration(s.pre_sep6_30d_p50_s)}</div>
      <div class="kpi-sub">${L2.fmtNum(s.pre_sep6_30d_count)} paid (~13.5/day) · p95 ${L2.fmtDuration(s.pre_sep6_30d_p95_s)}</div>
    </div>
    <div class="kpi-card accent-danger">
      <div class="kpi-top"><span class="kpi-label">Post-Nov 2 Wait (p50)</span>${L2.vbadge('cross_chain_verified')}</div>
      <div class="kpi-value text-danger">${L2.fmtDuration(s.post_restore_p50_s)}</div>
      <div class="kpi-sub">${L2.fmtNum(s.post_restore_count)} paid (~1.8/day) · p95 ${L2.fmtDuration(s.post_restore_p95_s)}</div>
    </div>
    <div class="kpi-card accent-cool">
      <div class="kpi-top"><span class="kpi-label">Payout Halts &ge; 24h</span>${L2.vbadge('cross_chain_verified')}</div>
      <div class="kpi-value">${L2.fmtNum(s.halts_ge_24h)}</div>
      <div class="kpi-sub">Longest pending wait: ${L2.fmtDuration(data.halts[0]?.duration_s)}</div>
    </div>
  `;

  L2.createChart('chart-monthly-flows', {
    legend: { top: 0, textStyle: { color: L2.PALETTE.muted } },
    xAxis: { type: 'category', data: data.monthly_flows.map((r) => r.ym), axisLabel: { color: L2.PALETTE.muted } },
    yAxis: { type: 'value', name: 'BTC / month', splitLine: { lineStyle: { color: L2.PALETTE.grid } }, axisLabel: { color: L2.PALETTE.muted } },
    series: [
      { name: 'Peg-In BTC', type: 'bar', itemStyle: { color: L2.PALETTE.pass }, data: data.monthly_flows.map((r) => r.pegin_btc) },
      { name: 'Peg-Out BTC', type: 'bar', itemStyle: { color: L2.PALETTE.primary }, data: data.monthly_flows.map((r) => -r.pegout_btc) },
    ],
  });

  L2.createChart('chart-delay-buckets', {
    xAxis: { type: 'category', data: data.delay_buckets.map((r) => r.bucket), axisLabel: { color: L2.PALETTE.muted, rotate: 18 } },
    yAxis: { type: 'value', name: 'Peg-Outs', splitLine: { lineStyle: { color: L2.PALETTE.grid } }, axisLabel: { color: L2.PALETTE.muted } },
    series: [
      {
        name: 'Peg-Outs',
        type: 'bar',
        itemStyle: { color: L2.PALETTE.gold, borderRadius: [4, 4, 0, 0] },
        data: data.delay_buckets.map((r) => r.count),
      },
    ],
  });

  L2.createChart('chart-recent-pegouts', {
    legend: { top: 0, textStyle: { color: L2.PALETTE.muted } },
    xAxis: { type: 'category', data: data.daily_recent.map((r) => r.d), axisLabel: { color: L2.PALETTE.muted } },
    yAxis: [
      { type: 'value', name: 'Paid / day', splitLine: { lineStyle: { color: L2.PALETTE.grid } }, axisLabel: { color: L2.PALETTE.muted } },
      { type: 'value', name: 'Max Wait (days)', splitLine: { show: false }, axisLabel: { color: L2.PALETTE.muted } },
    ],
    series: [
      { name: 'Peg-Outs Paid', type: 'bar', itemStyle: { color: L2.PALETTE.slate }, data: data.daily_recent.map((r) => r.paid_n) },
      { name: 'Oldest Pending (days)', type: 'line', yAxisIndex: 1, showSymbol: false, lineStyle: { width: 2, color: L2.PALETTE.danger }, data: data.daily_recent.map((r) => r.oldest_pending_age_s_eod ? +(r.oldest_pending_age_s_eod / 86400).toFixed(2) : 0) },
    ],
  });

  document.querySelector('#table-halts tbody').innerHTML = data.halts.map((h) => `
    <tr>
      <td class="mono" data-value="${h.start_time}">${L2.fmtDateUTC(h.start_time, true)}</td>
      <td class="mono" data-value="${h.end_time || 0}">${L2.fmtDateUTC(h.end_time, true)}</td>
      <td class="num" data-value="${h.duration_s}" style="color:${h.duration_s > 604800 ? 'var(--l2-danger)' : 'var(--text-primary)'};font-weight:600;">${L2.fmtDuration(h.duration_s)}</td>
      <td class="num" data-value="${h.pegouts_waiting}">${L2.fmtNum(h.pegouts_waiting)}</td>
      <td class="num" data-value="${h.btc_waiting}">${L2.fmtNum(h.btc_waiting, 4)}</td>
      <td class="mono">${L2.btcTxLink(h.end_txid)}</td>
    </tr>
  `).join('');
  L2.enhanceSortableTable(document.getElementById('table-halts'));

  document.querySelector('#table-recent-pegouts tbody').innerHTML = data.recent_pegouts.map((r) => `
    <tr>
      <td class="mono" data-value="${r.liquid_time}">${L2.fmtDateUTC(r.liquid_time)}</td>
      <td class="num" data-value="${r.value_btc}" style="color:var(--text-primary);">${L2.fmtNum(r.value_btc, 4)}</td>
      <td class="num" data-value="${r.delay_s ?? -999999}">${L2.fmtDuration(r.delay_s)}</td>
      <td class="mono">${L2.liquidTxLink(r.liquid_txid)}</td>
      <td class="mono">${L2.btcTxLink(r.btc_txid)}</td>
    </tr>
  `).join('');
  L2.enhanceSortableTable(document.getElementById('table-recent-pegouts'));

  document.querySelector('#table-recent-pegins tbody').innerHTML = data.recent_pegins.map((r) => `
    <tr>
      <td class="mono" data-value="${r.l2_time || r.btc_time}">${L2.fmtDateUTC(r.l2_time || r.btc_time)}</td>
      <td class="num" data-value="${r.amount_btc}" style="color:var(--text-primary);">${L2.fmtNum(r.amount_btc, 4)}</td>
      <td class="num" data-value="${r.delay_s ?? -1}">${L2.fmtDuration(r.delay_s)}</td>
      <td class="mono">${L2.btcTxLink(r.btc_txid)}</td>
      <td class="mono">${L2.liquidTxLink(r.l2_txid)}</td>
    </tr>
  `).join('');
  L2.enhanceSortableTable(document.getElementById('table-recent-pegins'));
});
