document.addEventListener('DOMContentLoaded', async () => {
  const L2 = window.L2Watch;
  L2.renderProvenanceBar();

  const data = await L2.fetchJSON('liquid/scorecard.json');
  const bm = data.by_metric;
  const h = data.highlights;
  const SATS = 1e8;

  const reserveBtc = bm.reserve_sats.value / SATS;
  const supplyBtc = bm.supply_sats.value / SATS;
  const gapBtc = bm.gap_sats.value / SATS;
  const backingPct = bm.backing_ratio.value * 100;
  const minBackingPct = bm.min_backing_ratio.value * 100;
  const maxShortfallBtc = bm.max_shortfall_sats.value / SATS;
  const daysBelow = bm.days_below_full_backing.value;
  const haltDays = bm.longest_redemption_halt_s.value / 86400;
  const blockGapH = bm.longest_block_gap_s.value / 3600;

  document.getElementById('scorecard-kpis').innerHTML = `
    <div class="kpi-card accent-pass">
      <div class="kpi-top"><span class="kpi-label">Verified BTC Reserve</span>${L2.vbadge('cross_chain_verified')}</div>
      <div class="kpi-value text-pass">${L2.fmtBTC(reserveBtc, 2)}</div>
      <div class="kpi-sub">164 unspent federation UTXOs on Bitcoin L1</div>
    </div>
    <div class="kpi-card accent-gold">
      <div class="kpi-top"><span class="kpi-label">L-BTC Supply (Upper Bound)</span>${L2.vbadge('l2_chain_verified')}</div>
      <div class="kpi-value text-gold">${L2.fmtNum(supplyBtc, 2)} L-BTC</div>
      <div class="kpi-sub">Peg-ins − peg-outs − explicit burns (+${L2.fmtNum(gapBtc, 2)} BTC buffer)</div>
    </div>
    <div class="kpi-card accent-pass">
      <div class="kpi-top"><span class="kpi-label">Backing Ratio at Cutoff</span>${L2.vbadge('cross_chain_verified')}</div>
      <div class="kpi-value text-pass">${L2.fmtPct(backingPct, 2)}</div>
      <div class="kpi-sub">Emergency-exposed at cutoff: ${L2.fmtBTC(bm.emergency_exposed_sats.value / SATS, 2)}</div>
    </div>
    <div class="kpi-card accent-danger">
      <div class="kpi-top"><span class="kpi-label">Sep 6 Backing Trough</span>${L2.vbadge('cross_chain_verified')}</div>
      <div class="kpi-value text-danger">${L2.fmtPct(minBackingPct, 2)}</div>
      <div class="kpi-sub">−${L2.fmtNum(maxShortfallBtc, 2)} BTC max shortfall · ${daysBelow.toFixed(2)} days &lt; 100%</div>
    </div>
    <div class="kpi-card accent-danger">
      <div class="kpi-top"><span class="kpi-label">Longest Redemption Halt</span>${L2.vbadge('cross_chain_verified')}</div>
      <div class="kpi-value text-danger">${haltDays.toFixed(1)} days</div>
      <div class="kpi-sub">59d zero payouts (Sep 6–Nov 4) · ${blockGapH.toFixed(1)}h longest block halt</div>
    </div>
    <div class="kpi-card accent-cool">
      <div class="kpi-top"><span class="kpi-label">Custody Script Control</span>${L2.vbadge('l2_chain_verified')}</div>
      <div class="kpi-value">${L2.esc(bm.custody_normal_path.value_text)}</div>
      <div class="kpi-sub">Emergency: ${L2.esc(bm.custody_emergency_path.value_text)} · 1 emergency spend ever</div>
    </div>
  `;

  document.getElementById('scorecard-pillars').innerHTML = `
    <a class="pillar-card" href="reserve.html">
      <h3><span>Reserves &amp; Timelock Exposure</span><i class="fa-solid fa-vault" style="color:var(--primary)"></i></h3>
      <p>Block-by-block reserve vs. L-BTC supply, gap decomposition, historical 870.06 BTC legacy CSV exposure, and live explorer of all 164 unspent custody UTXOs.</p>
      <div class="pillar-stat"><span>100.15% backed · 164 UTXOs</span><span>Open &rarr;</span></div>
    </a>
    <a class="pillar-card" href="redemption.html">
      <h3><span>Redemption &amp; Peg Flows</span><i class="fa-solid fa-right-left" style="color:var(--bitcoin-orange)"></i></h3>
      <p>Cross-chain matching of 117,553 peg-ins and 10,439 peg-outs, p50/p95 payout latency before &amp; after Sep 6, and full halt register.</p>
      <div class="pillar-stat"><span>p50 wait: 6.4h (vs. 28m Aug)</span><span>Open &rarr;</span></div>
    </a>
    <a class="pillar-card" href="incidents.html">
      <h3><span>Incidents &amp; Sep 2026 Forensics</span><i class="fa-solid fa-bolt" style="color:var(--l2-danger)"></i></h3>
      <p>Complete chain-facts reconstruction of the 4,006.81 BTC Sep 6 outflows, 3,400 BTC return trace, 602.53 BTC restoration inflows, and 20 registered incidents.</p>
      <div class="pillar-stat"><span>20 incidents · 5 unexplained outflows</span><span>Open &rarr;</span></div>
    </a>
    <a class="pillar-card" href="federation.html">
      <h3><span>Federation Governance &amp; Signers</span><i class="fa-solid fa-users-gear" style="color:var(--accent-cool)"></i></h3>
      <p>8 DynaFed transitions, 14 PAK list versions, 51.9M verified block signatures across 3 signing regimes, and 1-minute slot liveness (3.1% missed).</p>
      <div class="pillar-stat"><span>8 DynaFed transitions · 3.1% missed</span><span>Open &rarr;</span></div>
    </a>
    <a class="pillar-card" href="usage.html">
      <h3><span>Privacy, Proofs &amp; Economics</span><i class="fa-solid fa-eye-slash" style="color:var(--accent-warm)"></i></h3>
      <p>${L2.fmtNum(h.total_txs)} transactions (${h.fully_ct_pct}% fully confidential), ${h.proof_share_pct}% proof byte share (${h.rangeproof_gb} GB rangeproofs), hidden burns, and fee economics.</p>
      <div class="pillar-stat"><span>${h.fully_ct_pct}% CT · ${h.proof_share_pct}% proof bytes</span><span>Open &rarr;</span></div>
    </a>
    <a class="pillar-card" href="assets.html">
      <h3><span>Assets &amp; USDt Issuance</span><i class="fa-solid fa-coins" style="color:var(--l2-pass)"></i></h3>
      <p>Full issuance ledger across ${L2.fmtNum(h.total_assets)} assets, ${L2.fmtNum(h.registered_assets)} registry-bound tokens, duplicate ticker collisions, and USDt explicit upper bound.</p>
      <div class="pillar-stat"><span>USDt &le; ${(h.usdt_upper_bound / 1e6).toFixed(2)}M · ${L2.fmtNum(h.total_assets)} assets</span><span>Open &rarr;</span></div>
    </a>
  `;

  function renderHeroChart(range) {
    let rows = data.mini_series;
    if (range === '2026') rows = rows.filter((r) => r.d >= '2026-01-01');
    else if (range === 'incident') rows = rows.filter((r) => r.d >= '2026-08-15');

    L2.createChart('chart-scorecard-backing', {
      legend: {
        top: 0,
        textStyle: { color: L2.PALETTE.muted },
        data: ['Verified BTC Reserve', 'L-BTC Supply'],
      },
      xAxis: {
        type: 'category',
        data: rows.map((r) => r.d),
        axisLine: { lineStyle: { color: L2.PALETTE.grid } },
        axisLabel: { color: L2.PALETTE.muted },
      },
      yAxis: {
        type: 'value',
        name: 'BTC / L-BTC',
        nameTextStyle: { color: L2.PALETTE.muted },
        splitLine: { lineStyle: { color: L2.PALETTE.grid } },
        axisLabel: { color: L2.PALETTE.muted },
      },
      series: [
        {
          name: 'Verified BTC Reserve',
          type: 'line',
          showSymbol: false,
          smooth: false,
          lineStyle: { width: 2.2, color: L2.PALETTE.primary },
          areaStyle: { color: 'rgba(232, 145, 107, 0.14)' },
          data: rows.map((r) => r.reserve_btc),
        },
        {
          name: 'L-BTC Supply',
          type: 'line',
          showSymbol: false,
          smooth: false,
          lineStyle: { width: 1.8, type: 'dashed', color: L2.PALETTE.gold },
          data: rows.map((r) => r.supply_btc),
        },
      ],
    });
  }

  renderHeroChart('all');
  document.querySelectorAll('#sc-range-btns .btn-seg').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#sc-range-btns .btn-seg').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      renderHeroChart(btn.dataset.range);
    });
  });

  function formatMetricVal(r) {
    if (r.value_text) return r.value_text;
    if (r.value === null || r.value === undefined) return '—';
    if (r.unit === 'sats') return L2.fmtBTC(r.value / SATS, 4);
    if (r.unit === 'ratio') return L2.fmtPct(r.value * 100, 2);
    if (r.unit === 'seconds') return L2.fmtDuration(r.value);
    if (r.unit === 'days') return `${L2.fmtNum(r.value, 2)} days`;
    return `${L2.fmtNum(r.value, Number.isInteger(r.value) ? 0 : 2)} ${r.unit || ''}`.trim();
  }

  const tbody = document.querySelector('#table-scorecard tbody');
  tbody.innerHTML = data.metrics.map((r) => `
    <tr>
      <td class="mono" style="color:var(--text-primary);font-weight:600;">${L2.esc(r.metric)}</td>
      <td class="mono">${L2.esc(r.window)}</td>
      <td class="num" style="color:var(--text-primary);">${L2.esc(formatMetricVal(r))}</td>
      <td>${L2.vbadge(r.verification_class)}</td>
      <td>${L2.esc(r.description)}</td>
    </tr>
  `).join('');
  L2.enhanceSortableTable(document.getElementById('table-scorecard'));
});
