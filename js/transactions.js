// ============================================================
// TRANSACTIONS.JS — Transaction overview + editing
// ============================================================

const Transactions = (() => {

  function populateMonthSelector() {
    const rows = DB.query(
      `SELECT DISTINCT substr(date,1,7) AS ym FROM transactions ORDER BY ym DESC`
    );
    const sel = document.getElementById('trans-month-select');
    if (rows.length === 0) { sel.innerHTML = '<option>Geen data</option>'; return; }
    sel.innerHTML = rows.map(r => `<option value="${r.ym}">${r.ym}</option>`).join('');
  }

  function render() {
    const ym = document.getElementById('trans-month-select')?.value;
    if (!ym || ym === 'Geen data') return;

    const rows = DB.query(`
      SELECT t.*, c.name AS cat_name, l.name AS label_name
      FROM   transactions t
      LEFT   JOIN categories c ON c.id = t.category_id
      LEFT   JOIN labels     l ON l.id = t.label_id
      WHERE  t.date LIKE ?
      ORDER  BY t.date DESC
    `, [`${ym}%`]);

    const tbody = document.getElementById('trans-tbody');
    if (rows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="empty-state">Geen transacties</td></tr>';
      return;
    }

    tbody.innerHTML = rows.map(r => {
      const typeLabel = r.post_id
        ? `<span class="badge badge-fixed"><i class="fa-solid fa-thumbtack"></i> Vast</span>`
        : r.type === 'credit'
          ? `<span class="badge badge-credit"><i class="fa-solid fa-arrow-up"></i> Inkomst</span>`
          : `<span class="badge badge-variable">Variabel</span>`;

      const displayName = r.label_name
        ? `<span class="label-pill">${r.label_name}</span>`
        : r.description.substring(0, 50);

      // Pin/unpin button for all transactions
      const pinBtn = r.post_id
        ? `<button class="btn btn-sm btn-danger" title="Koppeling vaste last verwijderen" onclick="Transactions.unlink(${r.id})"><i class="fa-solid fa-link-slash"></i></button>`
        : `<button class="btn btn-sm" title="Markeren als vaste last" onclick="Transactions.openLinkModal(${r.id}, ${r.amount}, '${(r.counterparty||'')}')" data-desc="${r.description.replace(/"/g, '&quot;').substring(0,60)}"><i class="fa-solid fa-thumbtack"></i></button>`;

      return `
        <tr>
          <td>${r.date}</td>
          <td>
            ${displayName}
            <button class="label-edit-btn" title="Label bewerken"
              data-id="${r.id}" data-label-id="${r.label_id||''}"
              data-desc="${r.description.replace(/"/g,'&quot;').substring(0,40)}"
              data-iban="${(r.counterparty||'')}">
              <i class="fa-solid fa-tag"></i>
            </button>
          </td>
          <td class="${r.type === 'credit' ? 'amount-credit' : 'amount-debit'}">
            €${r.amount.toFixed(2)}
          </td>
          <td><span class="badge">${r.cat_name || '—'}</span></td>
          <td>${typeLabel}</td>
          <td style="white-space:nowrap;">
            <button class="btn btn-sm" title="Bewerken" onclick="Transactions.openEditModal(${r.id})"><i class="fa-solid fa-pen"></i></button>
            ${pinBtn}
          </td>
        </tr>
      `;
    }).join('');

    // Wire label buttons via event listeners to avoid inline quoting issues
    tbody.querySelectorAll('.label-edit-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const labelId    = btn.dataset.labelId ? parseInt(btn.dataset.labelId) : null;
        Labels.openModal(labelId, {
          name:        btn.dataset.desc,
          iban:        btn.dataset.iban,
          search_term: btn.dataset.desc.substring(0, 20).toUpperCase(),
        });
      });
    });
  }

  // ---- Edit modal: category + label + note ----

  function openEditModal(transId) {
    const t = DB.query(`
      SELECT t.*, c.name AS cat_name, l.name AS label_name
      FROM   transactions t
      LEFT   JOIN categories c ON c.id = t.category_id
      LEFT   JOIN labels     l ON l.id = t.label_id
      WHERE  t.id = ?
    `, [transId])[0];
    if (!t) return;

    const cats   = DB.query('SELECT id, name FROM categories ORDER BY name');
    const labels = DB.query('SELECT id, name FROM labels ORDER BY name');

    document.getElementById('edit-trans-id').value       = transId;
    document.getElementById('edit-trans-desc').textContent = t.description.substring(0, 80);
    document.getElementById('edit-trans-date').textContent = t.date;
    document.getElementById('edit-trans-amount').textContent =
      `${t.type === 'debit' ? '-' : '+'}€${t.amount.toFixed(2)}`;

    document.getElementById('edit-trans-cat').innerHTML =
      `<option value="">— Geen categorie —</option>` +
      cats.map(c => `<option value="${c.id}" ${c.id == t.category_id ? 'selected' : ''}>
        ${c.name}</option>`).join('');

    document.getElementById('edit-trans-label').innerHTML =
      `<option value="">— Geen label —</option>` +
      labels.map(l => `<option value="${l.id}" ${l.id == t.label_id ? 'selected' : ''}>
        ${l.name}</option>`).join('');

    UI.openModal('modal-edit-transaction');
  }

  function saveEdit() {
    const transId = parseInt(document.getElementById('edit-trans-id').value);
    const catId   = document.getElementById('edit-trans-cat').value   || null;
    const labelId = document.getElementById('edit-trans-label').value || null;

    DB.run(
      'UPDATE transactions SET category_id = ?, label_id = ? WHERE id = ?',
      [catId, labelId, transId]
    );

    UI.closeModal('modal-edit-transaction');
    render();
    Dashboard.render();
    DB.save(true);
  }

  // ---- Link to recurring post ----

  function openLinkModal(transId, amount, counterparty) {
    const desc  = document.querySelector(`[onclick*="openLinkModal(${transId}"]`)
                    ?.dataset?.desc || '';
    const posts = DB.query('SELECT id, name FROM recurring_posts ORDER BY name');
    const postOptions = posts.length > 0
      ? posts.map(p => `<option value="${p.id}">${p.name}</option>`).join('')
      : '<option disabled>Geen vaste posten gevonden</option>';

    window._linkContext = { transId, amount, counterparty };

    document.getElementById('link-trans-desc').textContent   = desc || counterparty;
    document.getElementById('link-trans-amount').textContent = `€${amount.toFixed(2)}`;
    document.getElementById('link-post-select').innerHTML    = postOptions;
    document.getElementById('link-create-name').value        = desc.substring(0, 60);
    document.getElementById('link-create-amount').value      = amount;
    document.getElementById('link-create-iban').value        = counterparty || '';

    const cats = DB.query('SELECT id, name FROM categories ORDER BY name');
    document.getElementById('link-create-cat').innerHTML =
      cats.map(c => `<option value="${c.id}">${c.name}</option>`).join('');

    _switchLinkTab('existing');
    UI.openModal('modal-link-transaction');
  }

  function _switchLinkTab(tab) {
    document.getElementById('link-tab-existing').classList.toggle('active', tab === 'existing');
    document.getElementById('link-tab-new').classList.toggle('active', tab === 'new');
    document.getElementById('link-panel-existing').style.display = tab === 'existing' ? 'block' : 'none';
    document.getElementById('link-panel-new').style.display      = tab === 'new'      ? 'block' : 'none';
  }

  function confirmLinkExisting() {
    const { transId } = window._linkContext;
    const postId = parseInt(document.getElementById('link-post-select').value);
    if (!postId) return;
    const post = DB.query('SELECT category_id FROM recurring_posts WHERE id = ?', [postId])[0];
    DB.run('UPDATE transactions SET post_id = ?, category_id = ? WHERE id = ?',
      [postId, post?.category_id || null, transId]);
    _afterLink();
  }

  function confirmLinkNew() {
    const { transId, counterparty } = window._linkContext;
    const name   = document.getElementById('link-create-name').value.trim();
    const amount = parseFloat(document.getElementById('link-create-amount').value);
    const catId  = parseInt(document.getElementById('link-create-cat').value);
    const freq   = parseInt(document.getElementById('link-create-freq').value);
    const iban   = document.getElementById('link-create-iban').value.trim() || counterparty || null;

    if (!name || isNaN(amount)) { UI.toast('Naam en bedrag zijn verplicht.'); return; }

    DB.run(`INSERT INTO recurring_posts (name, category_id, frequency, amount, iban, search_term)
            VALUES (?, ?, ?, ?, ?, ?)`,
      [name, catId, freq, amount, iban, name.substring(0, 20).toUpperCase()]);
    const postId = DB.query('SELECT last_insert_rowid() AS id')[0].id;
    DB.run('UPDATE transactions SET post_id = ?, category_id = ? WHERE id = ?',
      [postId, catId, transId]);
    _afterLink();
  }

  function unlink(transId) {
    if (!confirm('Koppeling met vaste post verwijderen?')) return;
    DB.run('UPDATE transactions SET post_id = NULL, category_id = NULL WHERE id = ?', [transId]);
    _afterLink();
  }

  function _afterLink() {
    UI.closeModal('modal-link-transaction');
    render();
    Dashboard.render();
    Posts.render();
    DB.save(true);
  }

  return {
    populateMonthSelector, render,
    openEditModal, saveEdit,
    openLinkModal, confirmLinkExisting, confirmLinkNew, unlink, _switchLinkTab,
  };
})();
