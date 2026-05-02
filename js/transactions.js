// ============================================================
// TRANSACTIONS.JS — Transaction overview (read-only)
// ============================================================

const Transactions = (() => {

  function populateMonthSelector() {
    const rows = DB.query(
      `SELECT DISTINCT substr(date,1,7) AS ym FROM transactions ORDER BY ym DESC`
    );
    const sel = document.getElementById('trans-month-select');
    if (rows.length === 0) {
      sel.innerHTML = '<option>No data</option>';
      return;
    }
    sel.innerHTML = rows.map(r => `<option value="${r.ym}">${r.ym}</option>`).join('');
  }

  function render() {
    const ym = document.getElementById('trans-month-select')?.value;
    if (!ym || ym === 'No data') return;

    const rows = DB.query(`
      SELECT t.*, c.name AS cat_name
      FROM   transactions t
      LEFT   JOIN categories c ON c.id = t.category_id
      WHERE  t.date LIKE ?
      ORDER  BY t.date DESC
    `, [`${ym}%`]);

    const tbody = document.getElementById('trans-tbody');
    if (rows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No transactions</td></tr>';
      return;
    }

    tbody.innerHTML = rows.map(r => {
      const typeLabel = r.post_id
        ? '<span class="badge badge-fixed"><i class="fa-solid fa-thumbtack"></i> Fixed</span>'
        : r.type === 'credit'
          ? '<span class="badge badge-credit"><i class="fa-solid fa-arrow-up"></i> Income</span>'
          : '<span class="badge badge-variable">Variable</span>';

      return `
        <tr>
          <td>${r.date}</td>
          <td>${r.description.substring(0, 50)}</td>
          <td class="text-muted small">${r.counterparty || '—'}</td>
          <td class="${r.type === 'credit' ? 'amount-credit' : 'amount-debit'}">
            €${r.amount.toFixed(2)}
          </td>
          <td><span class="badge">${r.cat_name || '—'}</span></td>
          <td>${typeLabel}</td>
        </tr>
      `;
    }).join('');
  }

  return { populateMonthSelector, render };
})();
