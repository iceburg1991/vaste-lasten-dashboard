// ============================================================
// CHARTS.JS — Chart.js graph rendering (trend bar + category doughnut)
// ============================================================

const Charts = (() => {
  let trendChart = null;
  let catChart   = null;

  const MONTHS = ['Jan','Feb','Mrt','Apr','Mei','Jun','Jul','Aug','Sep','Okt','Nov','Dec'];

  const CHART_COLORS = [
    '#2563eb','#16a34a','#dc2626','#d97706','#7c3aed','#0891b2',
  ];

  function _formatYM(ym) {
    const [y, m] = ym.split('-');
    return `${MONTHS[parseInt(m) - 1]} ${y}`;
  }

  function _baseOptions() {
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

  // Bar chart: actual fixed costs per month + normalised average line
  function renderTrend() {
    const rows = DB.query(`
      SELECT substr(date,1,7) AS ym, SUM(amount) AS total
      FROM   transactions
      WHERE  type = 'debit' AND post_id IS NOT NULL
      GROUP  BY ym
      ORDER  BY ym DESC
      LIMIT  12
    `).reverse();

    const labels   = rows.map(r => _formatYM(r.ym));
    const actuals  = rows.map(r => parseFloat(r.total?.toFixed(2) || 0));
    const normLine = labels.map(() => parseFloat(Normalisation.totalNormalisedPerMonth().toFixed(2)));

    if (trendChart) trendChart.destroy();
    trendChart = new Chart(document.getElementById('chart-trend'), {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label:           'Werkelijke vaste lasten',
            data:            actuals,
            backgroundColor: 'rgba(37,99,235,0.15)',
            borderColor:     '#2563eb',
            borderWidth:     1.5,
            borderRadius:    4,
          },
          {
            label:       'Genormaliseerd gemiddelde',
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
      options: _baseOptions(),
    });
  }

  // Doughnut chart: spending per category this month, with total in center
  function renderCategory(year, month) {
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

    const total = rows.reduce((s, r) => s + (r.total || 0), 0);

    const centerLabelPlugin = {
      id: 'centerLabel',
      afterDraw(chart) {
        const { ctx, chartArea: { left, top, width, height } } = chart;
        const cx = left + width / 2;
        const cy = top + height / 2;
        ctx.save();
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle    = '#111';
        ctx.font         = 'bold 17px Inter, system-ui, sans-serif';
        ctx.fillText(`€${total.toFixed(0)}`, cx, cy - 9);
        ctx.fillStyle    = '#9ca3af';
        ctx.font         = '11px Inter, system-ui, sans-serif';
        ctx.fillText('totaal', cx, cy + 10);
        ctx.restore();
      },
    };

    catChart = new Chart(document.getElementById('chart-cat'), {
      type: 'doughnut',
      data: {
        labels:   rows.map(r => r.cat || 'Overig'),
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
      plugins: [centerLabelPlugin],
    });
  }

  return { renderTrend, renderCategory };
})();
