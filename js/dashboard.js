// ============================================================
// DASHBOARD.JS — KPI cards, Chart.js graphs, deviation table
// ============================================================

const Dashboard = (() => {
  let trendChart = null;
  let catChart   = null;

  const MONTHS = ['Jan','Feb','Mrt','Apr','Mei','Jun','Jul','Aug','Sep','Okt','Nov','Dec'];

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
      sel.innerHTML = '<option>Geen data</option>';
      return;
    }
    sel.innerHTML = rows.map(r => `<option value="${r.ym}">${_formatYM(r.ym)}</option>`).join('');
  }

  // Main render — called on page load and after every import
  function render() {
    if (!DB.isReady()) return;

    const ym = document.getElementById('month-select')?.value;
    if (!ym || ym === 'Geen data') { _renderEmpty(); return; }

    const [year, month] = ym.split('-').map(Number);

    // Previous month
    const prevDate  = new Date(year, month - 2, 1);
    const prevYear  = prevDate.getFullYear();
    const prevMonth = prevDate.getMonth() + 1;

    // Same month last year
    const yoyYear  = year - 1;
    const yoyMonth = month;

    const currentFixed      = Normalisation.fixedCostsForMonth(year, month);
    const currentStructural = Normalisation.structuralTransfersForMonth(year, month);
    const currentIncidental = Normalisation.incidentalTransfersForMonth(year, month);
    const currentInternal   = currentStructural + currentIncidental;
    const currentVariable   = Normalisation.actualSpendingForMonth(year, month) - currentFixed - currentInternal;
    const prevFixed         = Normalisation.fixedCostsForMonth(prevYear, prevMonth);
    const yoyFixed          = Normalisation.fixedCostsForMonth(yoyYear, yoyMonth);
    const normalised        = Normalisation.totalNormalisedPerMonth();
    const normStructural    = Normalisation.structuralTransfersNormalised();

    _renderKPIs({ currentFixed, currentVariable, currentStructural, currentIncidental,
                  normStructural, prevFixed, yoyFixed, normalised });
    _renderTrendChart();
    _renderCategoryChart(year, month);
    _renderDeviations(year, month, prevYear, prevMonth, yoyYear, yoyMonth);
  }

  // ---- KPI cards ----

  function _renderKPIs({ currentFixed, currentVariable, currentStructural, currentIncidental,
                          normStructural, prevFixed, yoyFixed, normalised }) {
    const momPct = prevFixed > 0 ? ((currentFixed - prevFixed) / prevFixed) * 100 : 0;
    const yoyPct = yoyFixed  > 0 ? ((currentFixed - yoyFixed)  / yoyFixed)  * 100 : 0;

    const kpis = [
      {
        icon:      'fa-solid fa-money-bill-wave',
        label:     'Vaste lasten (werkelijk)',
        value:     `€${currentFixed.toFixed(0)}`,
        delta:     `MoM: ${_signedPct(momPct)}`,
        deltaType: _deltaType(momPct),
        accent:    'blue',
        tooltip:   'Som van alle vaste posten die deze maand daadwerkelijk van je rekening zijn afgeschreven.',
        detail:    'actual',
        group:     'monthly',
      },
      {
        icon:      'fa-solid fa-calculator',
        label:     'Genormaliseerd / maand',
        value:     `€${normalised.toFixed(0)}`,
        delta:     'Wat je maandelijks zou moeten reserveren',
        deltaType: '',
        accent:    'green',
        tooltip:   'Alle vaste posten omgerekend naar een maandbedrag. Bijv. een jaarlijkse verzekering van €240 telt als €20/maand. Dit is wat je structureel kwijt bent, ongeacht wanneer je betaalt.',
        detail:    'normalised',
        group:     'structural',
      },
      {
        icon:      'fa-solid fa-cart-shopping',
        label:     'Variabele kosten',
        value:     `€${Math.max(0, currentVariable).toFixed(0)}`,
        delta:     'Niet-vaste uitgaven deze maand',
        deltaType: '',
        accent:    'orange',
        tooltip:   'Alle uitgaven deze maand minus de vaste lasten. Denk aan boodschappen, horeca, kleding etc.',
        detail:    null,
        group:     'monthly',
      },
      {
        icon:      'fa-solid fa-piggy-bank',
        label:     'Sparen & beleggen',
        value:     `€${normStructural.toFixed(0)}`,
        delta:     `Werkelijk: €${currentStructural.toFixed(0)} deze maand`,
        deltaType: '',
        accent:    'green',
        tooltip:   'Vaste maandelijkse overboekingen naar eigen spaar- of beleggingsrekeningen, genormaliseerd naar €/maand.',
        detail:    'structural',
        group:     'structural',
      },
      {
        icon:      'fa-solid fa-right-left',
        label:     'Incidentele overboekingen',
        value:     `€${currentIncidental.toFixed(0)}`,
        delta:     'Niet-structurele interne overboekingen',
        deltaType: '',
        accent:    'gray',
        tooltip:   'Eenmalige of onregelmatige overboekingen naar eigen rekeningen. Telt niet mee als uitgave.',
        detail:    'incidental',
        group:     'monthly',
      },

    ];

    // Split KPIs into structural (top) and monthly (bottom)
    const kpiCard = k => `
      <div class="kpi-card kpi-${k.accent}">
        <div class="kpi-card-header">
          <div class="kpi-icon"><i class="${k.icon}"></i></div>
          <div class="tooltip-container" onclick="this.classList.toggle('open')" onblur="this.classList.remove('open')" tabindex="0">
            <i class="fa-solid fa-circle-info kpi-info-icon"></i>
            <div class="tooltip-bubble">${k.tooltip}</div>
          </div>
        </div>
        <div class="kpi-label">${k.label}</div>
        <div class="kpi-value">${k.value}</div>
        <div class="kpi-delta ${k.deltaType}">${k.delta}</div>
        ${k.detail ? `
          <button class="kpi-detail-btn" onclick="Dashboard.openDetail('${k.detail}')">
            <i class="fa-solid fa-table-list"></i> Hoe is dit berekend?
          </button>` : ''}
      </div>`;

    const structural = kpis.filter(k => k.group === 'structural');
    const monthly    = kpis.filter(k => k.group === 'monthly');

    const ym     = document.getElementById('month-select')?.value || '';
    const months = ['Januari','Februari','Maart','April','Mei','Juni','Juli','Augustus','September','Oktober','November','December'];
    const [y, m] = ym.split('-');
    const monthLabel = ym ? `${months[parseInt(m)-1]} ${y}` : 'Deze maand';

    document.getElementById('kpi-grid').innerHTML = `
      <div class="kpi-row">${structural.map(kpiCard).join('')}</div>
      <div class="kpi-month-divider">
        <div class="kpi-month-line"></div>
        <span class="kpi-month-label">${monthLabel}</span>
        <div class="kpi-month-line"></div>
      </div>
      <div class="kpi-row">${monthly.map(kpiCard).join('')}</div>
    `;
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
          <i class="fa-solid fa-circle-check"></i> Geen significante afwijkingen deze maand
        </td></tr>`;
      return;
    }

    tbody.innerHTML = deviations.map(d => `
      <tr>
        <td>${d.post.name}</td>
        <td><span class="badge">${d.post.category_name || 'Overig'}</span></td>
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
        <p>Importeer eerst een bankafschrift om data te zien.</p>
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

  // Open detail modal showing breakdown of a KPI
  function openDetail(type) {
    const ym    = document.getElementById('month-select')?.value;
    if (!ym) return;
    const [year, month] = ym.split('-').map(Number);
    const monthStr      = `${year}-${String(month).padStart(2,'0')}`;

    let title, rows, cols, total;

    if (type === 'actual') {
      // Breakdown of actual fixed costs this month
      title = 'Vaste lasten (werkelijk) — opbouw';
      rows  = DB.query(`
        SELECT rp.name, c.name AS cat, t.amount, t.date
        FROM   transactions t
        JOIN   recurring_posts rp ON rp.id = t.post_id
        LEFT   JOIN categories c  ON c.id  = rp.category_id
        WHERE  t.type = 'debit' AND t.date LIKE ?
        ORDER  BY t.amount DESC
      `, [`${monthStr}%`]);
      total = rows.reduce((s, r) => s + r.amount, 0);
      cols  = ['Post', 'Categorie', 'Datum', 'Bedrag'];
      const bodyRows = rows.map(r => `
        <tr>
          <td>${r.name}</td>
          <td><span class="badge">${r.cat || '—'}</span></td>
          <td>${r.date}</td>
          <td class="amount-debit">€${r.amount.toFixed(2)}</td>
        </tr>`).join('');
      _showDetailModal(title, cols, bodyRows, total);

    } else if (type === 'structural') {
      // Structural transfers: linked to a recurring post with category "Eigen rekening"
      title = 'Sparen & beleggen — opbouw';
      const freqLabel = { 12:'Maandelijks', 10:'10×/jaar', 6:'Halfjaarlijks', 4:'Per kwartaal', 2:'2×/jaar', 1:'Jaarlijks' };
      const cat = DB.query("SELECT id FROM categories WHERE name = 'Eigen rekening'")[0];
      if (!cat) { _showDetailModal(title, ['Melding'], '<tr><td>Geen categorie "Eigen rekening" gevonden.</td></tr>', 0); return; }
      const posts = Normalisation.getPostsNormalised().filter(p => p.category_id === cat.id);
      total = posts.reduce((s, p) => s + p.monthly_amount, 0);
      cols  = ['Post', 'Frequentie', 'Bedrag', '= €/maand'];
      const structRows = posts.map(p => `
        <tr>
          <td>${p.name}</td>
          <td>${freqLabel[p.frequency] || p.frequency + '×'}</td>
          <td>€${p.amount.toFixed(2)}</td>
          <td class="amount-fixed">€${p.monthly_amount.toFixed(2)}</td>
        </tr>`).join('');
      _showDetailModal(title, cols, structRows, total);

    } else if (type === 'incidental') {
      // Incidental transfers: category "Eigen rekening" without a recurring post link
      title = 'Incidentele overboekingen — transacties';
      const cat2 = DB.query("SELECT id FROM categories WHERE name = 'Eigen rekening'")[0];
      if (!cat2) { _showDetailModal(title, ['Melding'], '<tr><td>Geen categorie "Eigen rekening" gevonden.</td></tr>', 0); return; }
      rows  = DB.query(`
        SELECT t.date, t.description, t.counterparty, t.amount
        FROM   transactions t
        WHERE  t.type = 'debit' AND t.category_id = ? AND t.post_id IS NULL AND t.date LIKE ?
        ORDER  BY t.date DESC
      `, [cat2.id, `${monthStr}%`]);
      total = rows.reduce((s, r) => s + r.amount, 0);
      cols  = ['Datum', 'Omschrijving', 'Tegenrekening', 'Bedrag'];
      const incRows = rows.map(r => `
        <tr>
          <td>${r.date}</td>
          <td>${r.description.substring(0, 50)}</td>
          <td class="text-muted small">${r.counterparty || '—'}</td>
          <td class="amount-debit">€${r.amount.toFixed(2)}</td>
        </tr>`).join('');
      _showDetailModal(title, cols, incRows, total);

    } else if (type === 'normalised') {
      // Breakdown of normalised monthly amount per post
      title = 'Genormaliseerd / maand — opbouw';
      const freqLabel = { 12:'Maandelijks', 10:'10×/jaar', 6:'Halfjaarlijks', 4:'Per kwartaal', 2:'2×/jaar', 1:'Jaarlijks' };
      const posts = Normalisation.getPostsNormalised();
      total = posts.reduce((s, p) => s + p.monthly_amount, 0);
      cols  = ['Post', 'Categorie', 'Bedrag', 'Frequentie', '÷12', '= €/maand'];

      // Fetch the first label linked to each post
      const postLabels = DB.query(`
        SELECT rp.id AS post_id, MIN(l.name) AS label_name
        FROM   recurring_posts rp
        JOIN   transactions t ON t.post_id = rp.id
        JOIN   labels       l ON l.id      = t.label_id
        GROUP  BY rp.id
      `);
      const labelMap = Object.fromEntries(postLabels.map(r => [r.post_id, r.label_name]));

      const bodyRows = posts.map(p => {
        const labelName   = labelMap[p.id];
        const displayName = labelName
          ? `<span class="label-pill">${labelName}</span>`
          : p.name;
        return `
          <tr>
            <td>${displayName}</td>
            <td><span class="badge">${p.category_name || '—'}</span></td>
            <td>€${p.amount.toFixed(2)}</td>
            <td>${freqLabel[p.frequency] || p.frequency + '×'}</td>
            <td class="text-muted small">× ${p.frequency} ÷ 12</td>
            <td class="amount-fixed">€${p.monthly_amount.toFixed(2)}</td>
          </tr>`;
      }).join('');
      _showDetailModal(title, cols, bodyRows, total);
    }
  }

  function _showDetailModal(title, cols, bodyRows, total) {
    document.getElementById('detail-modal-title').textContent = title;
    document.getElementById('detail-modal-thead').innerHTML =
      cols.map(c => `<th>${c}</th>`).join('');
    document.getElementById('detail-modal-tbody').innerHTML = bodyRows;
    document.getElementById('detail-modal-total').textContent = `Totaal: €${total.toFixed(2)}`;
    UI.openModal('modal-detail');
  }

  return { render, populateMonthSelector, openDetail };
})();
