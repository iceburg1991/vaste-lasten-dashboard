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
  }

  function deleteCategory(id, name) {
    if (confirm(`Verwijderen category "${name}"? Posten die deze categorie gebruiken worden ongecategoriseerd.`)) {
      DB.run('UPDATE recurring_posts SET category_id = NULL WHERE category_id = ?', [id]);
      DB.run('DELETE FROM categories WHERE id = ?', [id]);
      render();
    }
  }

  return { render, openAddModal, saveCategory, deleteCategory };
})();
