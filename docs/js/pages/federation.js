document.addEventListener('DOMContentLoaded', async () => {
  const L2 = window.L2Watch;
  L2.renderProvenanceBar();

  const data = await L2.fetchJSON('liquid/federation.json');
  const s = data.summary;

  document.getElementById('fed-kpis').innerHTML = `
    <div class="kpi-card accent-pass">
      <div class="kpi-top"><span class="kpi-label">Verified Signed Blocks</span>${L2.vbadge('l2_chain_verified')}</div>
      <div class="kpi-value text-pass">${L2.fmtNum(s.total_blocks)}</div>
      <div class="kpi-sub">Cutoff Liquid #${L2.fmtNum(s.liveness_cutoff_height)} · 11 sigs/block verified</div>
    </div>
    <div class="kpi-card accent-gold">
      <div class="kpi-top"><span class="kpi-label">Missed 1-Min Slots</span>${L2.vbadge('l2_chain_verified')}</div>
      <div class="kpi-value text-gold">${L2.fmtPct(s.missed_pct, 2)}</div>
      <div class="kpi-sub">${L2.fmtNum(s.missed_slots)} missed (${L2.fmtNum(s.missed_in_halts)} during halts)</div>
    </div>
    <div class="kpi-card accent-primary">
      <div class="kpi-top"><span class="kpi-label">DynaFed Transitions</span>${L2.vbadge('l2_chain_verified')}</div>
      <div class="kpi-value text-primary">${s.dynafed_transitions}</div>
      <div class="kpi-sub">No custody key rotation after Sep 2026 event</div>
    </div>
    <div class="kpi-card accent-cool">
      <div class="kpi-top"><span class="kpi-label">PAK List Versions</span>${L2.vbadge('l2_chain_verified')}</div>
      <div class="kpi-value">${s.pak_versions}</div>
      <div class="kpi-sub">Currently 33 authorized peg-out keys (from 50)</div>
    </div>
    <div class="kpi-card accent-danger">
      <div class="kpi-top"><span class="kpi-label">Chain Halts &ge; 1 Hour</span>${L2.vbadge('l2_chain_verified')}</div>
      <div class="kpi-value text-danger">${s.halts_ge_1h}</div>
      <div class="kpi-sub">${s.gaps_ge_10m} gaps &ge;10m · longest 79.2h (Sep 2026)</div>
    </div>
  `;

  L2.createChart('chart-liveness', {
    legend: { top: 0, textStyle: { color: L2.PALETTE.muted } },
    xAxis: { type: 'category', data: data.liveness_monthly.map((r) => r.ym), axisLabel: { color: L2.PALETTE.muted } },
    yAxis: [
      { type: 'value', name: 'Slot Fill %', min: 70, max: 100, splitLine: { lineStyle: { color: L2.PALETTE.grid } }, axisLabel: { color: L2.PALETTE.muted, formatter: '{value}%' } },
      { type: 'value', name: 'Missed Slots', splitLine: { show: false }, axisLabel: { color: L2.PALETTE.muted } },
    ],
    series: [
      { name: 'Slot Fill %', type: 'line', showSymbol: false, lineStyle: { width: 2, color: L2.PALETTE.pass }, data: data.liveness_monthly.map((r) => r.uptime_pct) },
      { name: 'Missed Slots', type: 'bar', yAxisIndex: 1, itemStyle: { color: 'rgba(239, 68, 68, 0.55)' }, data: data.liveness_monthly.map((r) => r.missed_slots) },
    ],
  });

  L2.createChart('chart-slots', {
    xAxis: {
      type: 'category',
      data: data.current_slot_summary.map((r) => `S${r.slot} (${r.producer_key_short ? r.producer_key_short.slice(0, 6) : '—'})`),
      axisLabel: { color: L2.PALETTE.muted, rotate: 35, fontSize: 10 },
    },
    yAxis: { type: 'value', name: 'Fill %', min: 80, max: 100, splitLine: { lineStyle: { color: L2.PALETTE.grid } }, axisLabel: { color: L2.PALETTE.muted, formatter: '{value}%' } },
    series: [
      {
        name: 'Slot Fill %',
        type: 'bar',
        itemStyle: { color: L2.PALETTE.primary, borderRadius: [4, 4, 0, 0] },
        data: data.current_slot_summary.map((r) => r.slot_fill_pct),
      },
    ],
  });

  L2.createChart('chart-pak', {
    xAxis: {
      type: 'category',
      data: data.pak_changes.map((r) => `v${r.version} (${L2.fmtDateUTC(r.committed_time).slice(0, 7)})`),
      axisLabel: { color: L2.PALETTE.muted, rotate: 30, fontSize: 10 },
    },
    yAxis: { type: 'value', name: 'PAK Entries', splitLine: { lineStyle: { color: L2.PALETTE.grid } }, axisLabel: { color: L2.PALETTE.muted } },
    series: [
      {
        name: 'Authorized Keys',
        type: 'line',
        step: 'end',
        symbolSize: 7,
        lineStyle: { width: 2.2, color: L2.PALETTE.gold },
        itemStyle: { color: (p) => (data.pak_changes[p.dataIndex]?.is_reject ? L2.PALETTE.danger : L2.PALETTE.gold) },
        areaStyle: { color: 'rgba(255, 176, 0, 0.12)' },
        data: data.pak_changes.map((r) => r.n_entries),
      },
    ],
  });

  document.querySelector('#table-transitions tbody').innerHTML = data.transitions.map((t) => `
    <tr>
      <td class="mono" style="color:var(--text-primary);font-weight:600;">${L2.esc(t.transition)}</td>
      <td class="mono" data-value="${t.adopted_time}">${L2.fmtDateUTC(t.adopted_time)}</td>
      <td class="num" data-value="${t.adopted_height}">${L2.fmtNum(t.adopted_height)}</td>
      <td>${L2.esc(Array.isArray(t.changes) ? t.changes.join(', ') : t.changes)}</td>
      <td class="num" data-value="${t.deciding_votes || 0}">${t.deciding_votes ? L2.fmtNum(t.deciding_votes) : '—'}</td>
      <td class="num" data-value="${t.days_to_adoption || 0}">${t.days_to_adoption != null ? `${t.days_to_adoption}d` : '—'}</td>
      <td class="num" data-value="${t.days_old_below_1btc ?? -1}">${t.days_old_below_1btc != null ? `${t.days_old_below_1btc}d` : '—'}</td>
    </tr>
  `).join('');
  L2.enhanceSortableTable(document.getElementById('table-transitions'));

  document.querySelector('#table-gaps tbody').innerHTML = data.block_gaps.map((g) => `
    <tr>
      <td class="mono" data-value="${g.block_time}">${L2.fmtDateUTC(g.block_time, true)}</td>
      <td class="num" data-value="${g.height}">${L2.fmtNum(g.height)}</td>
      <td class="num" data-value="${g.gap_s}" style="color:${g.gap_s >= 3600 ? 'var(--l2-danger)' : 'var(--text-primary)'};font-weight:600;">${L2.fmtDuration(g.gap_s)}</td>
    </tr>
  `).join('');
  L2.enhanceSortableTable(document.getElementById('table-gaps'));

  document.querySelector('#table-keysets tbody').innerHTML = data.keysets.map((k) => `
    <tr>
      <td class="mono" style="color:var(--text-primary);font-weight:600;">${L2.esc(k.keyset)}</td>
      <td class="mono">${L2.esc(k.role)}</td>
      <td class="mono">${k.threshold_m}-of-${k.keys_n}${k.emergency_m ? ` / ${k.emergency_m}-of-${k.emergency_n} (${L2.fmtNum(k.csv_blocks)})` : ''}</td>
      <td class="num" data-value="${k.liquid_first_height || 0}">${k.liquid_first_height ? L2.fmtNum(k.liquid_first_height) : 'BTC L1 only'}</td>
      <td>${k.current_at_cutoff ? '<span class="vbadge vbadge-cross">Active</span>' : '<span class="vbadge vbadge-neutral">Retired</span>'}</td>
    </tr>
  `).join('');
  L2.enhanceSortableTable(document.getElementById('table-keysets'));
});
