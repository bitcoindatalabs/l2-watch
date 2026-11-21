document.addEventListener('DOMContentLoaded', async () => {
  const L2 = window.L2Watch;
  L2.renderProvenanceBar();

  const [scorecard, usage, redemption, federation, compare] = await Promise.all([
    L2.fetchJSON('liquid/scorecard.json'),
    L2.fetchJSON('liquid/usage_privacy.json'),
    L2.fetchJSON('liquid/redemption.json'),
    L2.fetchJSON('liquid/federation.json'),
    L2.fetchJSON('common/compare.json'),
  ]);

  const bm = scorecard.by_metric;
  const h = scorecard.highlights;
  const rs = redemption.summary;
  const fs = federation.summary;
  const us = usage.summary;
  const SATS = 1e8;

  const reserveBtc = bm.reserve_sats.value / SATS;
  const supplyBtc = bm.supply_sats.value / SATS;
  const gapBtc = bm.gap_sats.value / SATS;
  const backingPct = bm.backing_ratio.value * 100;
  const minBackingPct = bm.min_backing_ratio.value * 100;
  const daysBelow = bm.days_below_full_backing.value;
  const uptimeAll = (100 - fs.missed_pct).toFixed(2);
  const uptime30d = (bm.blocks_vs_expected.value * 100).toFixed(2);

  /* ── ACT 1: 6 BALANCED L2 VITAL SIGNS (ONE PER CORE QUESTION) ── */
  document.getElementById('scorecard-kpis').innerHTML = `
    <div class="kpi-card accent-pass">
      <div class="kpi-top"><span class="kpi-label">1 · Backing &amp; Reserves</span>${L2.vbadge('cross_chain_verified')}</div>
      <div class="kpi-value text-pass">${L2.fmtPct(backingPct, 2)}</div>
      <div class="kpi-sub">${L2.fmtBTC(reserveBtc, 2)} verified across 164 UTXOs vs. ${L2.fmtNum(supplyBtc, 2)} L-BTC (+${L2.fmtNum(gapBtc, 2)} BTC)</div>
    </div>
    <div class="kpi-card accent-cool">
      <div class="kpi-top"><span class="kpi-label">2 · Custody &amp; Trust</span>${L2.vbadge('l2_chain_verified')}</div>
      <div class="kpi-value">${L2.esc(bm.custody_normal_path.value_text)}</div>
      <div class="kpi-sub">Federation multisig · 2-of-3 emergency after 8,064 blocks (0 BTC exposed today)</div>
    </div>
    <div class="kpi-card accent-gold">
      <div class="kpi-top"><span class="kpi-label">3 · Exit &amp; Redemption</span>${L2.vbadge('cross_chain_verified')}</div>
      <div class="kpi-value text-gold">${L2.fmtDuration(rs.all_pegout_p50_s)}</div>
      <div class="kpi-sub">All-time p50 wait · no unilateral exit · ${L2.fmtNum(rs.total_pegouts)} peg-outs (${rs.pegout_match_pct}% matched)</div>
    </div>
    <div class="kpi-card accent-pass">
      <div class="kpi-top"><span class="kpi-label">4 · 8-Year Liveness</span>${L2.vbadge('l2_chain_verified')}</div>
      <div class="kpi-value text-pass">${uptimeAll}%</div>
      <div class="kpi-sub">${L2.fmtNum(fs.total_blocks)} blocks (1-min target) · ${uptime30d}% last 30d · ${fs.halts_ge_1h} halts &ge;1h</div>
    </div>
    <div class="kpi-card accent-primary">
      <div class="kpi-top"><span class="kpi-label">5 · Usage &amp; Privacy</span>${L2.vbadge('l2_chain_verified')}</div>
      <div class="kpi-value text-primary">${L2.fmtPct(us.fully_ct_pct, 1)} CT</div>
      <div class="kpi-sub">${L2.fmtNum(us.total_txs)} txs · proofs are ${us.proof_share_pct}% of chain (${us.rangeproof_gb} GB / ${us.block_gb} GB)</div>
    </div>
    <div class="kpi-card accent-primary">
      <div class="kpi-top"><span class="kpi-label">6 · Multi-Asset Rail</span>${L2.vbadge('l2_chain_verified')}</div>
      <div class="kpi-value">&le; ${(h.usdt_upper_bound / 1e6).toFixed(2)}M USDt</div>
      <div class="kpi-sub">${L2.fmtNum(h.total_assets)} issued assets (${L2.fmtNum(h.registered_assets)} registry-bound) · transfers blinded</div>
    </div>
  `;

  /* ── ACT 2: THE 6 QUESTIONS EVERY L2 MUST ANSWER ── */
  const questions = [
    {
      num: '01',
      question: 'Is every L-BTC backed 1:1 on Bitcoin L1?',
      verdict: '100.15% at cutoff — breached once for 57.3 days',
      verdictCls: 'vbadge-cross',
      promise: 'Every L-BTC corresponds to 1 BTC locked in federation custody scripts.',
      reality: `Backed ≥100% for 98% of its 8-year history across 155,981 custody outputs. In Sep–Nov 2026, reserves dropped to ${L2.fmtPct(minBackingPct, 2)} (−3,982.22 BTC) for ${daysBelow.toFixed(2)} days before external inflows restored 100.15% backing.`,
      vclass: 'cross_chain_verified',
      link: 'reserve.html',
      cta: 'Inspect Reserves & 164 UTXOs',
    },
    {
      num: '02',
      question: 'Who holds the keys, and how do rules change?',
      verdict: '11-of-15 multisig · 8 DynaFed transitions',
      verdictCls: 'vbadge-l2',
      promise: 'No single party moves reserves; emergency 2-of-3 keys activate only after timelock expiry.',
      reality: 'Custody rotated 3 times via DynaFed (plus 14 PAK list versions); emergency keys have never rotated and were used once (Sep 1, 2026, 3.22 BTC). No key rotation occurred after the Sep 6 outflow.',
      vclass: 'l2_chain_verified',
      link: 'federation.html',
      cta: 'Explore Governance & Signers',
    },
    {
      num: '03',
      question: 'Can users exit back to Bitcoin on demand?',
      verdict: 'Federation-gated exit · 99.96% matched',
      verdictCls: 'vbadge-warn',
      promise: 'Peg-ins credit after 102 Bitcoin blocks; peg-outs settle via authorized PAK members.',
      reality: `${L2.fmtNum(rs.total_pegins)} peg-ins (${L2.fmtNum(rs.total_pegin_btc, 0)} BTC) and ${L2.fmtNum(rs.total_pegouts)} peg-outs (${L2.fmtNum(rs.total_pegout_btc, 0)} BTC). Typical wait was ${L2.fmtDuration(rs.pre_sep6_30d_p50_s)} (Aug 2026) vs. ${L2.fmtDuration(bm.pegout_delay_p50_s.value)} post-Nov 2, with a 59-day payout halt in between.`,
      vclass: 'cross_chain_verified',
      link: 'redemption.html',
      cta: 'View Redemption Delays & Halts',
    },
    {
      num: '04',
      question: 'Does the L2 produce blocks reliably?',
      verdict: `${uptimeAll}% of 1-min slots filled over 8 years`,
      verdictCls: 'vbadge-cross',
      promise: 'Deterministic 1-minute signed blocks from 15 rotating functionary slots.',
      reality: `${L2.fmtNum(fs.total_blocks)} signed blocks verified (51.9M ECDSA signatures). Only ${fs.halts_ge_1h} halts ≥1 hour in 8 years (129 hours total; longest 79.2h in Sep 2026) and ${uptime30d}% fill rate over the last 30 days.`,
      vclass: 'l2_chain_verified',
      link: 'federation.html',
      cta: 'See Liveness & Block Gaps',
    },
    {
      num: '05',
      question: 'Does Confidential Transactions privacy work — and at what cost?',
      verdict: `${L2.fmtPct(us.fully_ct_pct, 1)} blinded · ${us.proof_share_pct}% proof overhead`,
      verdictCls: 'vbadge-l2',
      promise: 'Transaction amounts and asset types stay hidden except at pegs, fees, and explicit issuances.',
      reality: `${L2.fmtNum(us.fully_ct_txs)} of ${L2.fmtNum(us.total_txs)} transactions blind every value output. The tradeoff: rangeproofs (${us.rangeproof_gb} GB) + surjection proofs are ${us.proof_share_pct}% of the ${us.block_gb} GB chain, and ${L2.fmtNum(us.hidden_burns_total)} burns hide their amount.`,
      vclass: 'l2_chain_verified',
      link: 'usage.html',
      cta: 'Explore Privacy & Fee Economics',
    },
    {
      num: '06',
      question: 'What assets live on Liquid beyond L-BTC?',
      verdict: `${L2.fmtNum(h.total_assets)} assets · ≤ 97.56M USDt`,
      verdictCls: 'vbadge-btc',
      promise: 'Permissionless asset issuance alongside institutional stablecoins and securities.',
      reality: `84.2% of issued assets are single-unit non-reissuable tokens; ${L2.fmtNum(h.registered_assets)} are contract-hash bound to the registry. Tether issued 97.56M USDt explicitly (500 burned), alongside DePix, BMN1/2, and 60 duplicate tickers.`,
      vclass: 'l2_chain_verified',
      link: 'assets.html',
      cta: 'Inspect Assets & USDt Ledger',
    },
  ];

  document.getElementById('l2-questions-grid').innerHTML = questions.map((q) => `
    <article class="qa-card">
      <div class="qa-head">
        <span class="qa-num">${q.num}</span>
        <span class="vbadge ${q.verdictCls}">${L2.esc(q.verdict)}</span>
      </div>
      <h3 class="qa-question">${L2.esc(q.question)}</h3>
      <p class="qa-promise"><strong>Design:</strong> ${L2.esc(q.promise)}</p>
      <p class="qa-reality"><strong>Measured:</strong> ${L2.esc(q.reality)}</p>
      <div class="qa-foot">
        ${L2.vbadge(q.vclass)}
        <a href="${q.link}" class="qa-link">${L2.esc(q.cta)} &rarr;</a>
      </div>
    </article>
  `).join('');

  /* ── ACT 3A: SOLVENCY OVER 8 YEARS CHART ── */
  function renderHeroChart(range) {
    let rows = scorecard.mini_series;
    if (range === '2026') rows = rows.filter((r) => r.d >= '2026-01-01');
    else if (range === 'incident') rows = rows.filter((r) => r.d >= '2026-08-15');

    L2.createChart('chart-scorecard-backing', {
      legend: { top: 0, textStyle: { color: L2.PALETTE.muted }, data: ['Verified BTC Reserve', 'L-BTC Supply'] },
      xAxis: {
        type: 'category',
        data: rows.map((r) => r.d),
        axisLine: { lineStyle: { color: L2.PALETTE.grid } },
        axisLabel: { color: L2.PALETTE.muted },
      },
      yAxis: {
        type: 'value',
        name: 'BTC',
        nameTextStyle: { color: L2.PALETTE.muted },
        splitLine: { lineStyle: { color: L2.PALETTE.grid } },
        axisLabel: { color: L2.PALETTE.muted },
      },
      series: [
        {
          name: 'Verified BTC Reserve',
          type: 'line',
          showSymbol: false,
          lineStyle: { width: 2.2, color: L2.PALETTE.primary },
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
      ],
    });
  }

  renderHeroChart('all');
  document.getElementById('takeaway-solvency').innerHTML =
    `<strong>Takeaway:</strong> Reserves grew steadily to ~4,200 BTC and tracked supply at ≥100% for 7.9 years before the 57.3-day Sep–Nov 2026 shortfall. <a href="reserve.html">Deep dive &rarr;</a>`;

  document.querySelectorAll('#sc-range-btns .btn-seg').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#sc-range-btns .btn-seg').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      renderHeroChart(btn.dataset.range);
    });
  });

  /* ── ACT 3B: NETWORK LIFE OVER 8 YEARS (SWITCHABLE: ACTIVITY / FLOWS / UPTIME) ── */
  const lifeTitle = document.getElementById('chart-life-title');
  const lifeSub = document.getElementById('chart-life-sub');
  const lifeTakeaway = document.getElementById('takeaway-life');

  function renderLifeChart(view) {
    if (view === 'activity') {
      lifeTitle.textContent = '2. Network Life Over 8 Years: Activity & Privacy';
      lifeSub.textContent = 'Monthly non-coinbase transactions and % fully confidential (2018–2026)';
      lifeTakeaway.innerHTML =
        `<strong>Takeaway:</strong> Over ${L2.fmtNum(us.total_txs)} transactions settled since 2018 with ${us.fully_ct_pct}% full blinding, consuming ${us.block_gb} GB of blockspace. <a href="usage.html">Deep dive &rarr;</a>`;
      L2.createChart('chart-scorecard-life', {
        legend: { top: 0, textStyle: { color: L2.PALETTE.muted } },
        xAxis: { type: 'category', data: usage.monthly.map((r) => r.ym), axisLabel: { color: L2.PALETTE.muted } },
        yAxis: [
          { type: 'value', name: 'TXs / mo', splitLine: { lineStyle: { color: L2.PALETTE.grid } }, axisLabel: { color: L2.PALETTE.muted } },
          { type: 'value', name: 'CT %', min: 0, max: 100, splitLine: { show: false }, axisLabel: { color: L2.PALETTE.muted, formatter: '{value}%' } },
        ],
        series: [
          { name: 'Monthly TXs', type: 'bar', itemStyle: { color: L2.PALETTE.slate }, data: usage.monthly.map((r) => r.txs) },
          { name: 'Fully CT %', type: 'line', yAxisIndex: 1, showSymbol: false, lineStyle: { width: 2.2, color: L2.PALETTE.pass }, data: usage.monthly.map((r) => r.ct_pct) },
        ],
      });
    } else if (view === 'flows') {
      lifeTitle.textContent = '2. Capital Flows Over 8 Years: Peg-Ins vs. Peg-Outs';
      lifeSub.textContent = 'Monthly BTC entering (+ peg-ins) and exiting (− peg-outs) federation custody';
      lifeTakeaway.innerHTML =
        `<strong>Takeaway:</strong> ${L2.fmtNum(rs.total_pegin_btc, 0)} BTC entered and ${L2.fmtNum(rs.total_pegout_btc, 0)} BTC exited via ${L2.fmtNum(rs.total_pegouts)} peg-outs across 8 years. <a href="redemption.html">Deep dive &rarr;</a>`;
      L2.createChart('chart-scorecard-life', {
        legend: { top: 0, textStyle: { color: L2.PALETTE.muted } },
        xAxis: { type: 'category', data: redemption.monthly_flows.map((r) => r.ym), axisLabel: { color: L2.PALETTE.muted } },
        yAxis: { type: 'value', name: 'BTC / mo', splitLine: { lineStyle: { color: L2.PALETTE.grid } }, axisLabel: { color: L2.PALETTE.muted } },
        series: [
          { name: 'Peg-In BTC', type: 'bar', itemStyle: { color: L2.PALETTE.pass }, data: redemption.monthly_flows.map((r) => r.pegin_btc) },
          { name: 'Peg-Out BTC', type: 'bar', itemStyle: { color: L2.PALETTE.primary }, data: redemption.monthly_flows.map((r) => -r.pegout_btc) },
        ],
      });
    } else {
      lifeTitle.textContent = '2. Block Liveness Over 8 Years: 1-Minute Slot Fill %';
      lifeSub.textContent = 'Share of expected 1-minute blocks produced per month across 4,149,999 blocks';
      lifeTakeaway.innerHTML =
        `<strong>Takeaway:</strong> Steady operational improvement from 86.1% at 2018 launch to 99.6% in 2024, punctuated by 5 multi-hour halts. <a href="federation.html">Deep dive &rarr;</a>`;
      L2.createChart('chart-scorecard-life', {
        legend: { top: 0, textStyle: { color: L2.PALETTE.muted } },
        xAxis: { type: 'category', data: federation.liveness_monthly.map((r) => r.ym), axisLabel: { color: L2.PALETTE.muted } },
        yAxis: { type: 'value', name: 'Slot Fill %', min: 75, max: 100, splitLine: { lineStyle: { color: L2.PALETTE.grid } }, axisLabel: { color: L2.PALETTE.muted, formatter: '{value}%' } },
        series: [
          { name: '1-Min Slot Fill %', type: 'line', showSymbol: false, lineStyle: { width: 2.2, color: L2.PALETTE.pass }, areaStyle: { color: 'rgba(16, 185, 129, 0.12)' }, data: federation.liveness_monthly.map((r) => r.uptime_pct) },
        ],
      });
    }
  }

  renderLifeChart('activity');
  document.querySelectorAll('#sc-life-btns .btn-seg').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#sc-life-btns .btn-seg').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      renderLifeChart(btn.dataset.view);
    });
  });

  /* ── ACT 4: THREE STRUCTURAL STRESS EVENTS (2018–2026) ── */
  document.getElementById('stress-events-grid').innerHTML = `
    <article class="stress-card">
      <div class="stress-meta">
        <span class="mono" style="color:var(--bitcoin-orange);font-weight:600;">2018–2020</span>
        <span class="vbadge vbadge-btc">Custody Timelock</span>
      </div>
      <h3>Legacy Change-Script CSV Lapse</h3>
      <p>The 2018–2023 Bitcoin change script carried a <strong>2,016-block</strong> (~2 week) emergency timelock instead of 4,032 blocks, exposing up to <strong>870.06 BTC</strong> (block 634,326) to the 2-of-3 emergency keys before sweeps reset age.</p>
      <a href="reserve.html" class="qa-link">Inspect Timelock Exposure &rarr;</a>
    </article>
    <article class="stress-card">
      <div class="stress-meta">
        <span class="mono" style="color:var(--primary);font-weight:600;">2019–2025</span>
        <span class="vbadge vbadge-l2">Governance &amp; Liveness</span>
      </div>
      <h3>PAK Freezes &amp; Protocol Upgrade Halts</h3>
      <p>Pre-DynaFed PAK updates used REJECT windows that paused peg-outs for up to <strong>41.2 days</strong> (2019). Major upgrades produced <strong>22.7h</strong> (Aug 2019) and <strong>22.2h</strong> (Oct 2021 DynaFed activation) chain halts.</p>
      <a href="federation.html" class="qa-link">Explore DynaFed &amp; Halts &rarr;</a>
    </article>
    <article class="stress-card stress-card-danger">
      <div class="stress-meta">
        <span class="mono" style="color:var(--l2-danger);font-weight:600;">Sep–Nov 2026</span>
        <span class="vbadge vbadge-danger">Reserve &amp; Redemption</span>
      </div>
      <h3>4,006.81 BTC Outflow &amp; 59-Day Halt</h3>
      <p>Following the first-ever 2-of-3 spend (Sep 1, 3.22 BTC), two 11-of-15 spends left reserves at <strong>5.30%</strong> backing for 26h and &lt;100% for <strong>57.32 days</strong>, halting direct payouts for <strong>59 days</strong> and blocks for <strong>79.2 hours</strong>.</p>
      <a href="incidents.html" class="qa-link">Read September 2026 Forensics &rarr;</a>
    </article>
  `;

  /* ── ACT 5: MULTI-L2 COMPARISON STRIP ── */
  document.getElementById('scorecard-compare-strip').innerHTML = compare.systems.map((sys) => {
    const planned = sys.status === 'planned';
    return `
      <div class="compare-mini ${planned ? 'is-planned' : ''}">
        <div class="compare-mini-top">
          <strong>${L2.esc(sys.name)}</strong>
          <span class="vbadge ${sys.status === 'audited' ? 'vbadge-cross' : sys.status === 'live_source' ? 'vbadge-btc' : 'vbadge-neutral'}">${sys.status === 'audited' ? 'Audited' : sys.status === 'live_source' ? 'Live' : 'Planned'}</span>
        </div>
        <div class="compare-mini-val">${sys.btc_locked != null ? L2.fmtBTC(sys.btc_locked, 2) : 'Mapping L1…'}</div>
        <div class="compare-mini-meta">${L2.esc(sys.category)} · Unilateral exit: <strong>${sys.unilateral_exit.startsWith('Yes') ? 'Yes' : 'No'}</strong></div>
      </div>
    `;
  }).join('');

  /* ── ACT 6: COMPLETE 26-METRIC REFERENCE TABLE (HUMAN-READABLE LABELS) ── */
  const LABELS = {
    backing_ratio: 'Backing Ratio (Cutoff)',
    block_signing_path: 'Block Signing Threshold',
    blocks_vs_expected: 'Block Production vs. 1-Min Target',
    custody_emergency_path: 'Emergency Custody Path',
    custody_normal_path: 'Normal Custody Path',
    days_below_full_backing: 'Days Below 100% Backing',
    emergency_exposed_sats: 'Emergency-Exposed BTC (Cutoff)',
    emergency_path_sats: 'BTC Moved via Emergency Path',
    emergency_path_spends: 'Emergency Path Transactions',
    gap_sats: 'Net Reserve Gap (Reserve − Supply)',
    keys_changed_block_signing_last_rotation: 'Block-Signing Keys Rotated (Last)',
    keys_changed_emergency_last_rotation: 'Emergency Keys Rotated (Last)',
    keys_changed_normal_last_rotation: 'Normal Custody Keys Rotated (Last)',
    longest_block_gap_s: 'Longest Block Production Halt',
    longest_redemption_halt_s: 'Longest Pending Redemption Halt',
    max_emergency_exposed_sats: 'Historical Peak Emergency Exposure',
    max_shortfall_sats: 'Maximum Reserve Shortfall',
    min_backing_ratio: 'Historical Minimum Backing Ratio',
    pegin_claim_delay_p50_s: 'Median Peg-In Claim Delay',
    pegout_delay_p50_s: 'Median Peg-Out Wait (Recent)',
    pegout_delay_p95_s: '95th-Percentile Peg-Out Wait',
    pegouts_pending: 'Unfulfilled Peg-Outs at Cutoff',
    pegouts_requested: 'Recent Peg-Outs Requested',
    reserve_sats: 'Verified Bitcoin Reserve',
    supply_sats: 'L-BTC Circulating Supply (Upper Bound)',
    unexplained_outflow_sats: 'Total Unexplained Custody Outflows',
  };

  function formatMetricVal(r) {
    if (r.value_text) return r.value_text;
    if (r.value === null || r.value === undefined) return '—';
    if (r.unit === 'sats') return L2.fmtBTC(r.value / SATS, 4);
    if (r.unit === 'ratio') return L2.fmtPct(r.value * 100, 2);
    if (r.unit === 'seconds') return L2.fmtDuration(r.value);
    if (r.unit === 'days') return `${L2.fmtNum(r.value, 2)} days`;
    return `${L2.fmtNum(r.value, Number.isInteger(r.value) ? 0 : 2)} ${r.unit || ''}`.trim();
  }

  document.querySelector('#table-scorecard tbody').innerHTML = scorecard.metrics.map((r) => `
    <tr>
      <td>
        <div style="color:var(--text-primary);font-weight:600;">${L2.esc(LABELS[r.metric] || r.metric)}</div>
        <div class="mono" style="font-size:0.74rem;color:var(--text-secondary);">${L2.esc(r.metric)}</div>
      </td>
      <td class="mono">${L2.esc(r.window)}</td>
      <td class="num" style="color:var(--text-primary);">${L2.esc(formatMetricVal(r))}</td>
      <td>${L2.vbadge(r.verification_class)}</td>
      <td>${L2.esc(r.description)}</td>
    </tr>
  `).join('');
  L2.enhanceSortableTable(document.getElementById('table-scorecard'));
});
