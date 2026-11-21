document.addEventListener('DOMContentLoaded', async () => {
  const L2 = window.L2Watch;
  L2.renderProvenanceBar();

  const data = await L2.fetchJSON('liquid/usage_privacy.json');
  const s = data.summary;

  document.getElementById('usage-kpis').innerHTML = `
    <div class="kpi-card accent-primary">
      <div class="kpi-top"><span class="kpi-label">Non-Coinbase Transactions</span>${L2.vbadge('l2_chain_verified')}</div>
      <div class="kpi-value text-primary">${L2.fmtNum(s.total_txs)}</div>
      <div class="kpi-sub">Total chain size: ${s.block_gb} GB across 4.15M blocks</div>
    </div>
    <div class="kpi-card accent-pass">
      <div class="kpi-top"><span class="kpi-label">Fully Confidential TXs</span>${L2.vbadge('l2_chain_verified')}</div>
      <div class="kpi-value text-pass">${L2.fmtPct(s.fully_ct_pct, 2)}</div>
      <div class="kpi-sub">${L2.fmtNum(s.fully_ct_txs)} fully CT · ${L2.fmtNum(s.explicit_txs)} explicit</div>
    </div>
    <div class="kpi-card accent-gold">
      <div class="kpi-top"><span class="kpi-label">Proof Byte Overhead</span>${L2.vbadge('l2_chain_verified')}</div>
      <div class="kpi-value text-gold">${L2.fmtPct(s.proof_share_pct, 1)}</div>
      <div class="kpi-sub">${s.rangeproof_gb} GB rangeproofs + ${s.surjection_gb} GB surjection</div>
    </div>
    <div class="kpi-card accent-danger">
      <div class="kpi-top"><span class="kpi-label">Hidden-Amount Burns</span>${L2.vbadge('l2_chain_verified')}</div>
      <div class="kpi-value text-danger">${L2.fmtNum(s.hidden_burns_total)}</div>
      <div class="kpi-sub">${L2.fmtNum(s.hidden_burns_explicit_lbtc)} explicitly show L-BTC asset</div>
    </div>
    <div class="kpi-card accent-cool">
      <div class="kpi-top"><span class="kpi-label">L1 BTC Fees / L-BTC Fees</span>${L2.vbadge('cross_chain_verified')}</div>
      <div class="kpi-value">${L2.fmtNum(s.cum_btc_fees, 2)} / ${L2.fmtNum(s.cum_lbtc_fees, 2)}</div>
      <div class="kpi-sub">BTC paid across ${L2.fmtNum(s.total_btc_fed_txs)} fed txs vs. L-BTC earned</div>
    </div>
  `;

  L2.createChart('chart-tx-ct', {
    legend: { top: 0, textStyle: { color: L2.PALETTE.muted } },
    xAxis: { type: 'category', data: data.monthly.map((r) => r.ym), axisLabel: { color: L2.PALETTE.muted } },
    yAxis: [
      { type: 'value', name: 'Transactions', splitLine: { lineStyle: { color: L2.PALETTE.grid } }, axisLabel: { color: L2.PALETTE.muted } },
      { type: 'value', name: 'CT %', min: 0, max: 100, splitLine: { show: false }, axisLabel: { color: L2.PALETTE.muted, formatter: '{value}%' } },
    ],
    series: [
      { name: 'Monthly TXs', type: 'bar', itemStyle: { color: L2.PALETTE.slate }, data: data.monthly.map((r) => r.txs) },
      { name: 'Fully CT %', type: 'line', yAxisIndex: 1, showSymbol: false, lineStyle: { width: 2.2, color: L2.PALETTE.pass }, data: data.monthly.map((r) => r.ct_pct) },
    ],
  });

  L2.createChart('chart-proof-bytes', {
    legend: { top: 0, textStyle: { color: L2.PALETTE.muted } },
    xAxis: { type: 'category', data: data.monthly.map((r) => r.ym), axisLabel: { color: L2.PALETTE.muted } },
    yAxis: { type: 'value', name: 'MB / month', splitLine: { lineStyle: { color: L2.PALETTE.grid } }, axisLabel: { color: L2.PALETTE.muted } },
    series: [
      { name: 'Rangeproofs (MB)', type: 'bar', stack: 'b', itemStyle: { color: L2.PALETTE.primary }, data: data.monthly.map((r) => r.rangeproof_mb) },
      { name: 'Surjection Proofs (MB)', type: 'bar', stack: 'b', itemStyle: { color: L2.PALETTE.gold }, data: data.monthly.map((r) => r.surjection_mb) },
      { name: 'Non-Proof Data (MB)', type: 'bar', stack: 'b', itemStyle: { color: L2.PALETTE.slate }, data: data.monthly.map((r) => +(r.block_mb - r.proof_mb).toFixed(2)) },
    ],
  });

  L2.createChart('chart-utxo-set', {
    legend: { top: 0, textStyle: { color: L2.PALETTE.muted } },
    xAxis: { type: 'category', data: data.monthly.map((r) => r.ym), axisLabel: { color: L2.PALETTE.muted } },
    yAxis: { type: 'value', name: 'UTXOs', splitLine: { lineStyle: { color: L2.PALETTE.grid } }, axisLabel: { color: L2.PALETTE.muted } },
    series: [
      { name: 'Blinded UTXOs', type: 'line', stack: 'u', showSymbol: false, areaStyle: { opacity: 0.35 }, lineStyle: { width: 1.8 }, itemStyle: { color: L2.PALETTE.primary }, data: data.monthly.map((r) => r.utxo_blinded) },
      { name: 'Explicit UTXOs', type: 'line', stack: 'u', showSymbol: false, areaStyle: { opacity: 0.35 }, lineStyle: { width: 1.8 }, itemStyle: { color: L2.PALETTE.slate }, data: data.monthly.map((r) => r.utxo_explicit) },
    ],
  });

  L2.createChart('chart-peg-econ', {
    legend: { top: 0, textStyle: { color: L2.PALETTE.muted } },
    xAxis: { type: 'category', data: data.econ_monthly.map((r) => r.ym), axisLabel: { color: L2.PALETTE.muted } },
    yAxis: { type: 'value', name: 'Cumulative BTC / L-BTC', splitLine: { lineStyle: { color: L2.PALETTE.grid } }, axisLabel: { color: L2.PALETTE.muted } },
    series: [
      { name: 'Bitcoin Custody Fees Paid (BTC)', type: 'line', showSymbol: false, lineStyle: { width: 2.2, color: L2.PALETTE.danger }, data: data.econ_monthly.map((r) => r.cum_btc_fees) },
      { name: 'Liquid Network Fees Earned (L-BTC)', type: 'line', showSymbol: false, lineStyle: { width: 2.2, color: L2.PALETTE.pass }, data: data.econ_monthly.map((r) => r.cum_lbtc_fees) },
      { name: 'Fee Payee Balance (L-BTC)', type: 'line', showSymbol: false, lineStyle: { width: 1.8, type: 'dashed', color: L2.PALETTE.gold }, data: data.econ_monthly.map((r) => r.payee_balance_lbtc) },
    ],
  });

  document.querySelector('#table-hidden-burns tbody').innerHTML = data.hidden_burns_by_year.map((r) => `
    <tr>
      <td class="mono" data-value="${r.yr}" style="color:var(--text-primary);font-weight:600;">${L2.esc(r.yr)}</td>
      <td class="num" data-value="${r.total_hidden_burns}">${L2.fmtNum(r.total_hidden_burns)}</td>
      <td class="num" data-value="${r.asset_blinded}">${L2.fmtNum(r.asset_blinded)}</td>
      <td class="num" data-value="${r.asset_explicit}">${L2.fmtNum(r.asset_explicit)}</td>
    </tr>
  `).join('');
  L2.enhanceSortableTable(document.getElementById('table-hidden-burns'));
});
