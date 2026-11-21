document.addEventListener('DOMContentLoaded', async () => {
  const L2 = window.L2Watch;
  L2.renderProvenanceBar();

  const data = await L2.fetchJSON('common/methods.json');
  const val = data.validation;
  const cut = val.l2['liquid/liquidv1'].cutoff;
  const s = val.summary;

  document.getElementById('methods-status-headline').textContent =
    `All ${s.pass} automated invariants PASS (${s.fail} fail, ${s.not_applicable} N/A) at Bitcoin #${L2.fmtNum(cut.bitcoin_height)} / Liquid #${L2.fmtNum(cut.l2_height)}`;
  document.getElementById('methods-status-sub').innerHTML =
    `Release <span class="mono">${L2.esc(data.release.release)}</span> (schema <span class="mono">${L2.esc(val.schema_version)}</span>, tag <span class="mono">${L2.esc(data.release.tag)}</span>) · Cutoff timestamp: <span class="mono">${L2.esc(cut.bitcoin_time_utc)}</span> · Rule: ${L2.esc(cut.l2_rule)}.`;

  document.getElementById('inv-count').textContent = `${s.pass}/${val.checks.length}`;

  // Verification classes
  const vc = data.verification_classes;
  const entries = Array.isArray(vc) ? vc.map((x) => [x.id || x.name, x.description || x.meaning]) : Object.entries(vc);
  document.getElementById('vclass-grid').innerHTML = entries.map(([k, desc]) => `
    <div class="kpi-card">
      <div class="kpi-top">${L2.vbadge(k)}</div>
      <div class="kpi-sub" style="margin-top:6px;color:var(--text-primary);">${L2.esc(typeof desc === 'string' ? desc : JSON.stringify(desc))}</div>
    </div>
  `).join('');

  // Invariants filter & table
  const groups = [...new Set(val.checks.map((c) => c.group))].sort();
  const grpSel = document.getElementById('inv-group-filter');
  groups.forEach((g) => {
    const opt = document.createElement('option');
    opt.value = g;
    opt.textContent = g;
    grpSel.appendChild(opt);
  });

  const invBody = document.querySelector('#table-invariants tbody');
  function renderChecks() {
    const q = (document.getElementById('inv-search').value || '').trim().toLowerCase();
    const g = grpSel.value;
    const rows = val.checks.filter((c) => {
      if (g !== 'all' && c.group !== g) return false;
      if (!q) return true;
      return `${c.group} ${c.check} ${c.detail} ${c.status}`.toLowerCase().includes(q);
    });
    invBody.innerHTML = rows.map((c) => {
      const badge = c.status === 'pass'
        ? '<span class="vbadge vbadge-cross">PASS</span>'
        : c.status === 'fail'
        ? '<span class="vbadge vbadge-danger">FAIL</span>'
        : '<span class="vbadge vbadge-neutral">N/A</span>';
      return `
        <tr>
          <td class="mono">${L2.esc(c.group)}</td>
          <td class="mono" style="color:var(--text-primary);">${L2.esc(c.check)}</td>
          <td>${badge}</td>
          <td class="mono" style="font-size:0.78rem;">${L2.esc(c.detail)}</td>
        </tr>
      `;
    }).join('');
  }
  renderChecks();
  L2.enhanceSortableTable(document.getElementById('table-invariants'));
  document.getElementById('inv-search').addEventListener('input', renderChecks);
  grpSel.addEventListener('change', renderChecks);

  // Published parquet files
  document.querySelector('#table-files tbody').innerHTML = data.tables.map((t) => `
    <tr>
      <td class="mono" style="color:var(--text-primary);">${L2.esc(t.path)}</td>
      <td class="num" data-value="${t.rows || 0}">${L2.fmtNum(t.rows)}</td>
      <td class="num" data-value="${t.bytes}">${(t.bytes / 1024).toFixed(1)} KB</td>
      <td class="mono" title="${L2.esc(t.sha256)}">${L2.esc(L2.shortHash(t.sha256, 8))}</td>
    </tr>
  `).join('');
  L2.enhanceSortableTable(document.getElementById('table-files'));
});
