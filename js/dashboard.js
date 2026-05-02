// ============================================================
// DASHBOARD.JS — KPI cards, Chart.js graphs, deviation table
// ============================================================

const Dashboard = (() => {
  let trendChart = null;
  let catChart   = null;

  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  const CHART_COLORS = [
    '#2563eb','#16a34a','#dc2626','#d97706','#7c3aed','#0891b2',
  ];

  // Populate the month dropdown from available transaction data
  function populateMonthSelector() {
    const rows = DB.query(
      `SELECT DISTINCT substr(date,1,7) AS ym FROM transactions ORDER BY ym DESC`
    );
    const sel = document.getElementById('month-select');
    if (rows.length === 0) {
      sel.innerHTML = '<option>No data</option>';
      return;
    }
    sel.innerHTML = rows.map(r => `<option value="${r.ym}">${_formatYM(r.ym)}</option>`).join('');
  }

  // Main render — called on page load and after every import
  function render() {
    if (!DB.isReady()) return;

    const ym = document.getElementById('month-select')?.value;
    if (!ym || ym === 'No data') { _renderEmpty(); return; }

    const [year, month] = ym.split('-').map(Number);

    // Previous month
    const prevDate  = new Date(year, month - 2, 1);
    const prevYear  = prevDate.getFullYear();
    const prevMonth = prevDate.getMonth() + 1;

    // Same month last year
    const yoyYear  = year - 1;
    const yoyMonth = month;

    const currentFixed    = Normalisation.fixedCostsForMonth(year, month);
    const currentVariable = Normalisation.actualSpendingForMonth(year, month) - currentFixed;
    const prevFixed       = Normalisation.fixedCostsForMonth(prevYear, prevMonth);
    const yoyFixed        = Normalisation.fixedCostsForMonth(yoyYear, yoyMonth);
    const normalised      = Normalisation.totalNormalisedPerMonth();

    _renderKPIs({ currentFixed, currentVariable, prevFixed, yoyFixed, normalised });
    _renderTrendChart();
    _renderCategoryChart(year, month);
    _renderDeviations(year, month, prevYear, prevMonth, yoyYear, yoyMonth);
  }

  // ---- KPI cards ----

  function _renderKPIs({ currentFixed, currentVariable, prevFixed, yoyFixed, normalised }) {
    const momPct = prevFixed > 0 ? ((currentFixed - prevFixed) / prevFixed) * 100 : 0;
    const yoyPct = yoyFixed  > 0 ? ((currentFixed - yoyFixed)  / yoyFixed)  * 100 : 0;

    const kpis = [
      {
        icon:      'fa-solid fa-money-bill-wave',
        label:     'Fixed costs (actual)',
        value:     `€${currentFixed.toFixed(0)}`,
        delta:     `MoM: ${_signedPct(momPct)}`,
        deltaType: _deltaType(momPct),
        accent:    'blue',
      },
      {
        icon:      'fa-solid fa-calculator',
        label:     'Normalised / month',
        value:     `€${normalised.toFixed(0)}`,
        delta:     'Based on all recurring posts',
        deltaType: '',
        accent:    'green',
      },
      {
        icon:      'fa-solid fa-cart-shopping',
        label:     'Variable costs',
        value:     `€${Math.max(0, currentVariable).toFixed(0)}`,
        delta:     'Non-fixed spending this month',
        deltaType: '',
        accent:    'orange',
      },
      {
        icon:      'fa-solid fa-chart-line',
        label:     'Year-over-year',
        value:     _signedPct(yoyPct),
        delta:     yoyFixed > 0 ? `vs €${yoyFixed.toFixed(0)} last year` : 'No data from last year',
        deltaType: _deltaType(yoyPct),
        accent:    yoyPct > CONFIG.DEVIATION_THRESHOLD * 100 ? 'red' : 'green',
      },
    ];

    document.getElementById('kpi-grid').innerHTML = kpis.map(k => `
      <div class="kpi-card kpi-${k.accent}">
        <div class="kpi-icon"><i class="${k.icon}"></i></div>
        <div class="kpi-label">${k.label}</div>
        <div class="kpi-value">${k.value}</div>
        <div class="kpi-delta ${k.deltaType}">${k.delta}</div>
      </div>
    `).join('');
  }

  // ---- Trend chart (bar + normalised line) ----

  function _renderTrendChart() {
    const rows = DB.query(`
      SELECT substr(date,1,7) AS ym, SUM(amount) AS total
      FROM   transactions
      WHERE  type = 'debit' AND post_id IS NOT NULL
      GROUP  BY ym
      ORDER  BY ym DESC
      LIMIT  12
    `).reverse();

    const labels    = rows.map(r => _formatYM(r.ym));
    const actuals   = rows.map(r => parseFloat(r.total?.toFixed(2) || 0));
    const normLine  = labels.map(() => parseFloat(Normalisation.totalNormalisedPerMonth().toFixed(2)));

    if (trendChart) trendChart.destroy();
    trendChart = new Chart(document.getElementById('chart-trend'), {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label:           'Actual fixed costs',
            data:            actuals,
            backgroundColor: 'rgba(37,99,235,0.15)',
            borderColor:     '#2563eb',
            borderWidth:     1.5,
            borderRadius:    4,
          },
          {
            label:       'Normalised average',
            data:        normLine,
            type:        'line',
            borderColor: '#d97706',
            borderDash:  [5, 4],
            borderWidth: 2,
            pointRadius: 0,
            fill:        false,
          },
        ],
      },
      options: _chartOptions(),
    });
  }

  // ---- Category doughnut chart ----

  function _renderCategoryChart(year, month) {
    const monthStr = `${year}-${String(month).padStart(2, '0')}`;
    const rows     = DB.query(`
      SELECT c.name AS cat, SUM(t.amount) AS total
      FROM   transactions t
      JOIN   recurring_posts rp ON rp.id = t.post_id
      LEFT   JOIN categories c  ON c.id  = rp.category_id
      WHERE  t.type = 'debit' AND t.date LIKE ?
      GROUP  BY c.name
    `, [`${monthStr}%`]);

    if (catChart) catChart.destroy();
    if (rows.length === 0) return;

    catChart = new Chart(document.getElementById('chart-cat'), {
      type: 'doughnut',
      data: {
        labels:   rows.map(r => r.cat || 'Other'),
        datasets: [{
          data:            rows.map(r => parseFloat(r.total?.toFixed(2) || 0)),
          backgroundColor: CHART_COLORS.slice(0, rows.length),
          borderWidth:     0,
          hoverOffset:     4,
        }],
      },
      options: {
        responsive:          true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels:   { color: '#6b7280', font: { family: 'Inter', size: 12 }, padding: 14 },
          },
          tooltip: {
            callbacks: { label: ctx => ` €${ctx.parsed.toFixed(2)}` },
          },
        },
      },
    });
  }

  // ---- Deviations table ----

  function _renderDeviations(year, month, prevYear, prevMonth, yoyYear, yoyMonth) {
    const posts      = Normalisation.getPostsNormalised();
    const deviations = [];

    for (const post of posts) {
      const current = Normalisation.postAmountForMonth(post.id, year, month);
      const prev    = Normalisation.postAmountForMonth(post.id, prevYear, prevMonth);
      const yoy     = Normalisation.postAmountForMonth(post.id, yoyYear, yoyMonth);

      if (current === 0 && prev === 0) continue;

      const momDelta = prev > 0 ? (current - prev) / prev : null;
      const yoyDelta = yoy  > 0 ? (current - yoy)  / yoy  : null;

      const isDeviation =
        (momDelta !== null && Math.abs(momDelta) > CONFIG.DEVIATION_THRESHOLD) ||
        (yoyDelta !== null && Math.abs(yoyDelta) > CONFIG.DEVIATION_THRESHOLD);

      if (isDeviation) deviations.push({ post, current, prev, yoy, momDelta, yoyDelta });
    }

    document.getElementById('deviations-count').textContent = deviations.length;

    const tbody = document.getElementById('deviations-tbody');
    if (deviations.length === 0) {
      tbody.innerHTML = `
        <tr><td colspan="7" class="empty-state">
          <i class="fa-solid fa-circle-check"></i> No significant deviations this month
        </td></tr>`;
      return;
    }

    tbody.innerHTML = deviations.map(d => `
      <tr>
        <td>${d.post.name}</td>
        <td><span class="badge">${d.post.category_name || 'Other'}</span></td>
        <td>€${d.prev.toFixed(2)}</td>
        <td><strong>€${d.current.toFixed(2)}</strong></td>
        <td>€${d.yoy.toFixed(2)}</td>
        <td class="${_deltaType(d.momDelta * 100)}">
          ${d.momDelta !== null ? _signedPct(d.momDelta * 100) : '—'}
        </td>
        <td class="${_deltaType(d.yoyDelta * 100)}">
          ${d.yoyDelta !== null ? _signedPct(d.yoyDelta * 100) : '—'}
        </td>
      </tr>
    `).join('');
  }

  function _renderEmpty() {
    document.getElementById('kpi-grid').innerHTML = `
      <div class="empty-state" style="grid-column:1/-1">
        <i class="fa-solid fa-file-import fa-2x"></i>
        <p>Import a bank statement to see data.</p>
      </div>`;
  }

  // ---- Helpers ----

  function _formatYM(ym) {
    const [y, m] = ym.split('-');
    return `${MONTHS[parseInt(m) - 1]} ${y}`;
  }

  function _signedPct(pct) {
    return `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`;
  }

  function _deltaType(pct) {
    if (Math.abs(pct) < CONFIG.DEVIATION_THRESHOLD * 100) return '';
    return pct > 0 ? 'delta-up' : 'delta-down';
  }

  function _chartOptions() {
    return {
      responsive:          true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: { color: '#6b7280', font: { family: 'Inter', size: 12 } },
        },
        tooltip: {
          callbacks: { label: ctx => ` €${(ctx.parsed.y ?? ctx.parsed).toFixed(2)}` },
        },
      },
      scales: {
        x: {
          ticks: { color: '#9ca3af', font: { family: 'Inter', size: 11 } },
          grid:  { color: '#f3f4f6' },
        },
        y: {
          ticks: {
            color:    '#9ca3af',
            font:     { family: 'Inter', size: 11 },
            callback: v => `€${v}`,
          },
          grid: { color: '#f3f4f6' },
        },
      },
    };
  }

  return { render, populateMonthSelector };
})();
