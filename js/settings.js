// ============================================================
// SETTINGS.JS — Category management and database settings
// ============================================================

const Settings = (() => {

  function render() {
    const cats  = DB.query('SELECT * FROM categories ORDER BY name');
    const tbody = document.getElementById('cats-tbody');

    tbody.innerHTML = cats.map(c => `
      <tr>
        <td>${c.name}</td>
        <td>
          <button class="btn btn-sm btn-danger" onclick="Settings.deleteCategory(${c.id}, '${c.name}')">
            <i class="fa-solid fa-trash"></i> Verwijderen
          </button>
        </td>
      </tr>
    `).join('');
  }

  function openAddModal() {
    document.getElementById('cat-name').value = '';
    UI.openModal('modal-cat');
  }

  function saveCategory() {
    const name = document.getElementById('cat-name').value.trim();
    if (!name) return;
    DB.run('INSERT OR IGNORE INTO categories (name) VALUES (?)', [name]);
    UI.closeModal('modal-cat');
    render();
    DB.save(true);
  }

  function deleteCategory(id, name) {
    if (confirm(`Verwijderen category "${name}"? Posten die deze categorie gebruiken worden ongecategoriseerd.`)) {
      DB.run('UPDATE recurring_posts SET category_id = NULL WHERE category_id = ?', [id]);
      DB.run('DELETE FROM categories WHERE id = ?', [id]);
      render();
      DB.save(true);
    }
  }

  // ---- Own accounts (internal transfers) ----

  function renderOwnAccounts() {
    const rows  = DB.query('SELECT * FROM own_accounts ORDER BY name');
    const tbody = document.getElementById('own-accounts-tbody');
    if (!tbody) return;

    tbody.innerHTML = rows.length === 0
      ? '<tr><td colspan="3" class="empty-state">Nog geen eigen rekeningen toegevoegd.</td></tr>'
      : rows.map(r => `
          <tr>
            <td>${r.name || '—'}</td>
            <td class="text-muted small">${r.iban}</td>
            <td>
              <button class="btn btn-sm btn-danger" onclick="Settings.deleteOwnAccount(${r.id})">
                <i class="fa-solid fa-trash"></i>
              </button>
            </td>
          </tr>`).join('');
  }

  function saveOwnAccount() {
    const iban = document.getElementById('own-account-iban').value.trim().toUpperCase();
    const name = document.getElementById('own-account-name').value.trim() || null;
    if (!iban) { UI.toast('IBAN is verplicht.'); return; }

    DB.run('INSERT OR IGNORE INTO own_accounts (iban, name) VALUES (?, ?)', [iban, name]);

    // Auto-assign "Eigen rekening" category to existing transactions with this IBAN
    const cat = DB.query("SELECT id FROM categories WHERE name = 'Eigen rekening'")[0];
    if (cat) {
      DB.run(
        "UPDATE transactions SET category_id = ? WHERE counterparty = ? AND category_id IS NULL",
        [cat.id, iban]
      );
    }

    document.getElementById('own-account-iban').value = '';
    document.getElementById('own-account-name').value = '';
    renderOwnAccounts();
    Dashboard.render();
    DB.save(true);
  }

  function deleteOwnAccount(id) {
    if (!confirm('Eigen rekening verwijderen?')) return;
    DB.run('DELETE FROM own_accounts WHERE id = ?', [id]);
    renderOwnAccounts();
    DB.save(true);
  }

  function getOwnIbans() {
    return new Set(DB.query('SELECT iban FROM own_accounts').map(r => r.iban));
  }

  return { render, openAddModal, saveCategory, deleteCategory,
           renderOwnAccounts, saveOwnAccount, deleteOwnAccount, getOwnIbans };
})();
