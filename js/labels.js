// ============================================================
// LABELS.JS — Label management for transactions
//
// Labels allow any transaction to get a friendly name.
// Matching priority: IBAN > search term in description.
// Matched labels are applied automatically on every import.
// ============================================================

const Labels = (() => {

  // ---- Matching ----

  // Find the best matching label for a transaction
  function findMatch(counterparty, description) {
    const all = DB.query('SELECT * FROM labels');
    const descUpper = description?.toUpperCase() || '';

    // Priority 1: IBAN match
    if (counterparty) {
      const byIban = all.find(l => l.iban && l.iban === counterparty);
      if (byIban) return byIban;
    }

    // Priority 2: search term match
    const byTerm = all.find(l =>
      l.search_term && descUpper.includes(l.search_term.toUpperCase())
    );
    return byTerm || null;
  }

  // Apply labels to all unmatched transactions (run after import or label save)
  function applyToAll() {
    const unmatched = DB.query(
      'SELECT id, counterparty, description FROM transactions WHERE label_id IS NULL'
    );
    for (const t of unmatched) {
      const label = findMatch(t.counterparty, t.description);
      if (label) {
        DB.run(
          'UPDATE transactions SET label_id = ?, category_id = COALESCE(category_id, ?) WHERE id = ?',
          [label.id, label.category_id, t.id]
        );
      }
    }
  }

  // ---- Render label management table ----

  function render() {
    const rows  = DB.query(`
      SELECT l.*, c.name AS cat_name,
             COUNT(t.id) AS usage_count
      FROM   labels l
      LEFT   JOIN categories c    ON c.id = l.category_id
      LEFT   JOIN transactions t  ON t.label_id = l.id
      GROUP  BY l.id
      ORDER  BY l.name
    `);
    const tbody = document.getElementById('labels-tbody');

    if (rows.length === 0) {
      tbody.innerHTML = `
        <tr><td colspan="5" class="empty-state">
          Nog geen labels. Klik op een transactie om een label toe te voegen.
        </td></tr>`;
      return;
    }

    tbody.innerHTML = rows.map(r => `
      <tr>
        <td><strong>${r.name}</strong></td>
        <td class="text-muted small">${r.iban || '—'}</td>
        <td class="text-muted small">${r.search_term || '—'}</td>
        <td><span class="badge">${r.cat_name || '—'}</span></td>
        <td class="text-muted small">${r.usage_count}× gebruikt</td>
        <td class="actions">
          <button class="btn btn-sm" onclick="Labels.openModal(${r.id})">
            <i class="fa-solid fa-pen"></i>
          </button>
          <button class="btn btn-sm btn-danger" onclick="Labels.delete(${r.id})">
            <i class="fa-solid fa-trash"></i>
          </button>
        </td>
      </tr>
    `).join('');
  }

  // ---- Modal: add / edit label ----

  function openModal(id = null, prefill = {}) {
    const cats = DB.query('SELECT id, name FROM categories ORDER BY name');
    document.getElementById('label-cat').innerHTML =
      `<option value="">— Geen categorie —</option>` +
      cats.map(c => `<option value="${c.id}">${c.name}</option>`).join('');

    document.getElementById('modal-label-title').textContent =
      id ? 'Label bewerken' : 'Label toevoegen';
    document.getElementById('label-id').value = id || '';

    if (id) {
      const label = DB.query('SELECT * FROM labels WHERE id = ?', [id])[0];
      if (label) {
        document.getElementById('label-name').value        = label.name;
        document.getElementById('label-iban').value        = label.iban        || '';
        document.getElementById('label-searchterm').value  = label.search_term || '';
        document.getElementById('label-cat').value         = label.category_id || '';
      }
    } else {
      document.getElementById('label-name').value       = prefill.name        || '';
      document.getElementById('label-iban').value       = prefill.iban        || '';
      document.getElementById('label-searchterm').value = prefill.search_term || '';
      document.getElementById('label-cat').value        = '';
    }

    UI.openModal('modal-label');
  }

  function save() {
    const id         = document.getElementById('label-id').value;
    const name       = document.getElementById('label-name').value.trim();
    const iban       = document.getElementById('label-iban').value.trim()       || null;
    const searchTerm = document.getElementById('label-searchterm').value.trim() || null;
    const catId      = document.getElementById('label-cat').value               || null;

    if (!name) { UI.toast('Naam is verplicht.'); return; }
    if (!iban && !searchTerm) { UI.toast('Vul minimaal een IBAN of zoekterm in.'); return; }

    if (id) {
      DB.run(
        'UPDATE labels SET name=?, iban=?, search_term=?, category_id=? WHERE id=?',
        [name, iban, searchTerm, catId, parseInt(id)]
      );
      // Re-apply this label to existing transactions
      DB.run('UPDATE transactions SET label_id = NULL WHERE label_id = ?', [parseInt(id)]);
    } else {
      DB.run(
        'INSERT INTO labels (name, iban, search_term, category_id) VALUES (?,?,?,?)',
        [name, iban, searchTerm, catId]
      );
    }

    // Apply all labels to unmatched transactions
    applyToAll();

    UI.closeModal('modal-label');
    render();
    Transactions.render();
    Dashboard.render();
    DB.save(true);
  }

  function deleteLabel(id) {
    if (!confirm('Label verwijderen? Gekoppelde transacties verliezen hun label.')) return;
    DB.run('UPDATE transactions SET label_id = NULL WHERE label_id = ?', [id]);
    DB.run('DELETE FROM labels WHERE id = ?', [id]);
    render();
    Transactions.render();
    DB.save(true);
  }

  return { findMatch, applyToAll, render, openModal, save, delete: deleteLabel };
})();
