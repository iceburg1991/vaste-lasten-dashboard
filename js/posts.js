// ============================================================
// POSTS.JS — Recurring posts management (CRUD)
// ============================================================

const Posts = (() => {
  const FREQ_LABELS = {
    12: 'Maandelijks',
    10: '10×/jaar',
    6:  'Halfjaarlijks',
    4:  'Per kwartaal',
    2:  '2×/jaar',
    1:  'Jaarlijks',
  };

  // Render the recurring posts table
  function render() {
    const posts = Normalisation.getPostsNormalised();
    const tbody = document.getElementById('posts-tbody');

    if (posts.length === 0) {
      tbody.innerHTML = `
        <tr><td colspan="7" class="empty-state">
          Nog geen vaste posten. Importeer een afschrift of voeg handmatig toe.
        </td></tr>`;
      return;
    }

    tbody.innerHTML = posts.map(p => `
      <tr>
        <td>${p.name}</td>
        <td><span class="badge">${p.category_name || '—'}</span></td>
        <td>${FREQ_LABELS[p.frequency] || `${p.frequency}×`}</td>
        <td class="amount-debit">€${p.amount.toFixed(2)}</td>
        <td class="amount-fixed">€${p.monthly_amount.toFixed(2)}</td>
        <td class="note-text">${p.note || ''}</td>
        <td class="actions">
          <button class="btn btn-sm" onclick="Posts.openModal(${p.id})">
            <i class="fa-solid fa-pen"></i>
          </button>
          <button class="btn btn-sm btn-danger" onclick="Posts.delete(${p.id})">
            <i class="fa-solid fa-trash"></i>
          </button>
        </td>
      </tr>
    `).join('');
  }

  // Open add/edit modal; id=null means new post
  function openModal(id = null) {
    const cats = DB.query('SELECT id, name FROM categories');
    document.getElementById('post-cat').innerHTML =
      cats.map(c => `<option value="${c.id}">${c.name}</option>`).join('');

    document.getElementById('modal-post-title').textContent =
      id ? 'Vaste post bewerken' : 'Add recurring post';
    document.getElementById('post-id').value = id || '';

    if (id) {
      const post = DB.query('SELECT * FROM recurring_posts WHERE id = ?', [id])[0];
      if (post) {
        document.getElementById('post-name').value       = post.name;
        document.getElementById('post-cat').value        = post.category_id;
        document.getElementById('post-freq').value       = post.frequency;
        document.getElementById('post-amount').value     = post.amount;
        document.getElementById('post-iban').value       = post.iban       || '';
        document.getElementById('post-searchterm').value = post.search_term || '';
        document.getElementById('post-note').value       = post.note       || '';
      }
    } else {
      ['post-name', 'post-amount', 'post-iban', 'post-searchterm', 'post-note']
        .forEach(fieldId => { document.getElementById(fieldId).value = ''; });
    }

    UI.openModal('modal-post');
  }

  // Save add or edit
  function save() {
    const id         = document.getElementById('post-id').value;
    const name       = document.getElementById('post-name').value.trim();
    const catId      = document.getElementById('post-cat').value;
    const freq       = parseInt(document.getElementById('post-freq').value);
    const amount     = parseFloat(document.getElementById('post-amount').value);
    const iban       = document.getElementById('post-iban').value.trim()       || null;
    const searchTerm = document.getElementById('post-searchterm').value.trim() || null;
    const note       = document.getElementById('post-note').value.trim()       || null;

    if (!name || isNaN(amount)) {
      UI.toast('Naam en bedrag zijn verplicht.');
      return;
    }

    if (id) {
      DB.run(
        `UPDATE recurring_posts
         SET name=?, category_id=?, frequency=?, amount=?, iban=?, search_term=?, note=?
         WHERE id=?`,
        [name, catId, freq, amount, iban, searchTerm, note, parseInt(id)]
      );
    } else {
      DB.run(
        `INSERT INTO recurring_posts (name, category_id, frequency, amount, iban, search_term, note)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [name, catId, freq, amount, iban, searchTerm, note]
      );
    }

    UI.closeModal('modal-post');
    render();
    Dashboard.render();
    DB.save(true);
  }

  function deletePost(id) {
    if (confirm('Vaste post verwijderen?')) {
      DB.run('DELETE FROM recurring_posts WHERE id = ?', [id]);
      render();
      Dashboard.render();
      DB.save(true);
    }
  }

  return { render, openModal, save, delete: deletePost };
})();
