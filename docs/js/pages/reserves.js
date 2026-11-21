document.addEventListener('DOMContentLoaded', async () => {
  const L2 = window.L2Watch;
  L2.renderProvenanceBar();

  const data = await L2.fetchJSON('liquid/reserves.json');
  const latest = data.latest;
  const peak = data.peak_timelock_exposure;
  const u = data.unspent_summary;

  document.getElementById('reserves-kpis').innerHTML = `
    <div class="kpi-card accent-pass">
      <div class="kpi-top"><span class="kpi-label">Verified BTC Reserve</span>${L2.vbadge('bitcoin_verified')}</div>
      <div class="kpi-value text-pass">${L2.fmtBTC(u.total_btc, 2)}</div>
      <div class="kpi-sub">Cutoff block ${L2.fmtNum(data.cutoff_btc_height)}</div>
    </div>
    <div class="kpi-card accent-gold">
      <div class="kpi-top"><span class="kpi-label">L-BTC Supply</span>${L2.vbadge('l2_chain_verified')}</div>
      <div class="kpi-value text-gold">${L2.fmtNum(latest.supply_btc, 2)} L-BTC</div>
      <div class="kpi-sub">Liquid height ${L2.fmtNum(latest.l2_height)}</div>
    </div>
    <div class="kpi-card accent-pass">
      <div class="kpi-top"><span class="kpi-label">Backing Ratio / Gap</span>${L2.vbadge('cross_chain_verified')}</div>
      <div class="kpi-value text-pass">${L2.fmtPct(latest.backing_pct, 2)}</div>
      <div class="kpi-sub">${latest.gap_btc >= 0 ? '+' : ''}${L2.fmtBTC(latest.gap_btc, 4)} net surplus</div>
    </div>
    <div class="kpi-card accent-cool">
      <div class="kpi-top"><span class="kpi-label">Unspent Custody UTXOs</span>${L2.vbadge('bitcoin_verified')}</div>
      <div class="kpi-value">${L2.fmtNum(u.count)}</div>
      <div class="kpi-sub">${u.exposed_count} emergency-exposed (${L2.fmtBTC(u.exposed_btc, 4)})</div>
    </div>
    <div class="kpi-card accent-danger">
      <div class="kpi-top"><span class="kpi-label">Peak 2-of-3 CSV Exposure</span>${L2.vbadge('cross_chain_verified')}</div>
      <div class="kpi-value text-danger">${L2.fmtBTC(peak.exposed_btc, 2)}</div>
      <div class="kpi-sub">${L2.esc(peak.utc_day)} · block ${L2.fmtNum(peak.btc_height)} (${peak.exposed_utxos} UTXOs)</div>
    </div>
  `;

  document.getElementById('gap-breakdown').innerHTML = `
    <div class="kpi-card"><div class="kpi-label">Pending Peg-in Claims</div><div class="kpi-value">${L2.fmtBTC(latest.pending_claims_btc, 4)}</div><div class="kpi-sub">Confirmed on BTC, awaiting L2 claim</div></div>
    <div class="kpi-card"><div class="kpi-label">Unclaimed Deposits</div><div class="kpi-value">${L2.fmtBTC(latest.unclaimed_btc, 4)}</div><div class="kpi-sub">Deposits never claimed on Liquid</div></div>
    <div class="kpi-card"><div class="kpi-label">Direct / Untweaked Inflows</div><div class="kpi-value text-pass">+${L2.fmtBTC(latest.untweaked_deposits_btc, 2)}</div><div class="kpi-sub">Includes Sep 7 return &amp; Nov 2 restoration</div></div>
    <div class="kpi-card"><div class="kpi-label">Unmatched Outflows</div><div class="kpi-value text-danger">−${L2.fmtBTC(Math.abs(latest.unmatched_outflows_btc), 2)}</div><div class="kpi-sub">Sep 1 emergency + Sep 6 unexplained payouts</div></div>
    <div class="kpi-card"><div class="kpi-label">Cumulative BTC Fees Paid</div><div class="kpi-value">−${L2.fmtBTC(Math.abs(latest.fed_fees_btc), 4)}</div><div class="kpi-sub">Paid from custody on L1 federation txs</div></div>
    <div class="kpi-card"><div class="kpi-label">Explicit L-BTC Burns</div><div class="kpi-value">+${L2.fmtBTC(latest.burns_btc, 4)}</div><div class="kpi-sub">Reduces L-BTC supply without BTC spend</div></div>
  `;

  function renderMainChart(range) {
    let rows = data.daily;
    if (range === '2025') rows = rows.filter((r) => r.d >= '2025-01-01');
    else if (range === 'sep26') rows = rows.filter((r) => r.d >= '2026-08-15');

    L2.createChart('chart-reserves-main', {
      legend: { top: 0, textStyle: { color: L2.PALETTE.muted }, data: ['BTC Reserve (EOD)', 'L-BTC Supply', 'Backing Ratio %'] },
      xAxis: {
        type: 'category',
        data: rows.map((r) => r.d),
        axisLine: { lineStyle: { color: L2.PALETTE.grid } },
        axisLabel: { color: L2.PALETTE.muted },
      },
      yAxis: [
        { type: 'value', name: 'BTC', splitLine: { lineStyle: { color: L2.PALETTE.grid } }, axisLabel: { color: L2.PALETTE.muted } },
        { type: 'value', name: 'Backing %', min: 0, max: 115, splitLine: { show: false }, axisLabel: { color: L2.PALETTE.muted, formatter: '{value}%' } },
      ],
      series: [
        {
          name: 'BTC Reserve (EOD)',
          type: 'line',
          showSymbol: false,
          lineStyle: { width: 2, color: L2.PALETTE.primary },
          areaStyle: { color: 'rgba(232, 145, 107, 0.14)' },
          data: rows.map((r) => r.reserve_btc),
        },
        {
          name: 'L-BTC Supply',
          type: 'line',
          showSymbol: false,
          lineStyle: { width: 1.8, type: 'dashed', color: L2.PALETTE.gold },
          data: rows.map((r) => r.supply_btc),
        },
        {
          name: 'Backing Ratio %',
          type: 'line',
          yAxisIndex: 1,
          showSymbol: false,
          lineStyle: { width: 1.5, color: L2.PALETTE.pass },
          data: rows.map((r) => r.backing_pct),
        },
      ],
    });
  }

  renderMainChart('all');
  document.querySelectorAll('#res-range-btns .btn-seg').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#res-range-btns .btn-seg').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      renderMainChart(btn.dataset.range);
    });
  });

  const tlRows = data.daily.filter((r, i) => r.exposed_btc > 0 || i % 7 === 0 || i === data.daily.length - 1);
  L2.createChart('chart-timelock', {
    xAxis: { type: 'category', data: tlRows.map((r) => r.d), axisLabel: { color: L2.PALETTE.muted } },
    yAxis: { type: 'value', name: 'Exposed BTC', splitLine: { lineStyle: { color: L2.PALETTE.grid } }, axisLabel: { color: L2.PALETTE.muted } },
    series: [
      {
        name: '2-of-3 Exposed BTC',
        type: 'line',
        showSymbol: false,
        lineStyle: { width: 2, color: L2.PALETTE.danger },
        areaStyle: { color: 'rgba(239, 68, 68, 0.2)' },
        data: tlRows.map((r) => r.exposed_btc),
      },
    ],
  });

  const genRows = data.daily.filter((r, i) => i % 7 === 0 || r.d >= '2026-08-15' || i === data.daily.length - 1);
  L2.createChart('chart-generations', {
    legend: { top: 0, textStyle: { color: L2.PALETTE.muted } },
    xAxis: { type: 'category', data: genRows.map((r) => r.d), axisLabel: { color: L2.PALETTE.muted } },
    yAxis: { type: 'value', name: 'BTC', splitLine: { lineStyle: { color: L2.PALETTE.grid } }, axisLabel: { color: L2.PALETTE.muted } },
    series: [
      { name: 'legacy_2018', type: 'line', stack: 'gen', showSymbol: false, areaStyle: {}, lineStyle: { width: 1 }, itemStyle: { color: L2.PALETTE.slate }, data: genRows.map((r) => r.gen_legacy_2018) },
      { name: 'dynafed_2023_01', type: 'line', stack: 'gen', showSymbol: false, areaStyle: {}, lineStyle: { width: 1 }, itemStyle: { color: L2.PALETTE.rose }, data: genRows.map((r) => r.gen_dynafed_2023_01) },
      { name: 'dynafed_2026_01', type: 'line', stack: 'gen', showSymbol: false, areaStyle: {}, lineStyle: { width: 1 }, itemStyle: { color: L2.PALETTE.gold }, data: genRows.map((r) => r.gen_dynafed_2026_01) },
      { name: 'dynafed_2026_07', type: 'line', stack: 'gen', showSymbol: false, areaStyle: {}, lineStyle: { width: 1 }, itemStyle: { color: L2.PALETTE.primary }, data: genRows.map((r) => r.gen_dynafed_2026_07) },
    ],
  });

  document.querySelector('#table-scripts tbody').innerHTML = data.scripts.map((s) => `
    <tr>
      <td class="mono" style="color:var(--text-primary);font-weight:600;">${L2.esc(s.keyset)} ${s.current_at_cutoff ? '<span class="vbadge vbadge-cross">Current</span>' : ''}</td>
      <td class="mono">${L2.esc(s.role)}</td>
      <td class="mono">${s.threshold_m}-of-${s.keys_n} / ${s.emergency_m}-of-${s.emergency_n}</td>
      <td class="num" data-value="${s.csv_blocks}">${L2.fmtNum(s.csv_blocks)} blk</td>
      <td class="num" data-value="${s.btc_unspent_outputs}">${L2.fmtNum(s.btc_unspent_outputs)}</td>
      <td class="num" data-value="${s.btc_unspent}" style="color:var(--text-primary);">${L2.fmtNum(s.btc_unspent, 4)}</td>
      <td class="num" data-value="${s.btc_spends_normal}">${L2.fmtNum(s.btc_spends_normal)} / ${L2.fmtNum(s.btc_spends_emergency)}</td>
      <td class="mono" title="${L2.esc(s.program)}">${L2.esc(L2.shortHash(s.program, 10))}</td>
    </tr>
  `).join('');
  L2.enhanceSortableTable(document.getElementById('table-scripts'));

  const origins = [...new Set(data.unspent_utxos.map((x) => x.origin))].sort();
  const originSel = document.getElementById('utxo-origin-filter');
  origins.forEach((o) => {
    const opt = document.createElement('option');
    opt.value = o;
    opt.textContent = o;
    originSel.appendChild(opt);
  });

  const utxoBody = document.querySelector('#table-utxos tbody');
  const utxoCountNote = document.getElementById('utxo-count-note');

  function renderUtxos() {
    const q = (document.getElementById('utxo-search').value || '').trim().toLowerCase();
    const orig = originSel.value;
    const filtered = data.unspent_utxos.filter((x) => {
      if (orig !== 'all' && x.origin !== orig) return false;
      if (!q) return true;
      return `${x.txid} ${x.origin} ${x.generation} ${x.created_height}`.toLowerCase().includes(q);
    });
    const sumBtc = filtered.reduce((acc, x) => acc + x.value_btc, 0);
    utxoBody.innerHTML = filtered.map((x) => `
      <tr>
        <td class="mono">${L2.btcTxLink(x.txid, `${L2.shortHash(x.txid, 8)}:${x.vout}`)}</td>
        <td class="num" data-value="${x.value_btc}" style="color:var(--text-primary);">${L2.fmtNum(x.value_btc, 8)}</td>
        <td class="mono">${L2.esc(x.origin)}</td>
        <td class="mono">${L2.esc(x.generation)}</td>
        <td class="num" data-value="${x.created_height}">${L2.fmtNum(x.created_height)}</td>
        <td class="num" data-value="${x.age_blocks}">${L2.fmtNum(x.age_blocks)}</td>
        <td class="num" data-value="${x.csv_blocks}">${L2.fmtNum(x.csv_blocks)}</td>
        <td>${x.emergency_exposed ? '<span class="vbadge vbadge-danger">2-of-3 Exposed</span>' : '<span class="vbadge vbadge-cross">11-of-15 Only</span>'}</td>
      </tr>
    `).join('');
    utxoCountNote.textContent = `Showing ${filtered.length} of ${data.unspent_utxos.length} unspent custody UTXOs · Subtotal: ${L2.fmtBTC(sumBtc, 8)}`;
  }

  renderUtxos();
  L2.enhanceSortableTable(document.getElementById('table-utxos'));
  document.getElementById('utxo-search').addEventListener('input', renderUtxos);
  originSel.addEventListener('change', renderUtxos);
});
