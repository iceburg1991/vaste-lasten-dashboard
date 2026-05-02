// ============================================================
// CSV-IMPORT.JS — Rabobank CSV parsing and import flow
//
// Rabobank CSV column layout (26 columns, ISO-8859-1 encoded):
//   0  IBAN/BBAN          own account
//   1  Currency
//   2  BIC
//   3  Sequence nr        ← unique transaction ID (used for dedup)
//   4  Date               ← used
//   5  Interest date
//   6  Amount             ← used (negative = debit, comma as decimal separator)
//   7  Balance after txn
//   8  Counterparty IBAN  ← used
//   9  Counterparty name  ← used as fallback description
//  10  Ultimate party name
//  11  Initiating party name
//  12  Counterparty BIC
//  13  Code
//  14  Batch ID
//  15  Transaction ref
//  16  Mandate ref
//  17  Creditor ID
//  18  Payment ref
//  19  Description-1      ← used
//  20  Description-2      ← used
//  21  Description-3      ← used
//  22-25 misc
// ============================================================

const CSVImport = (() => {
  let parsedRows  = [];
  let reviewItems = [];

  // Open the import modal and reset state
  function openModal() {
    parsedRows  = [];
    reviewItems = [];
    // Reset input so the same file can be selected again
    document.getElementById('csv-file-input').value               = '';
    document.getElementById('import-preview').style.display       = 'none';
    document.getElementById('review-section').style.display       = 'none';
    document.getElementById('btn-import-confirm').disabled        = true;
    UI.openModal('modal-import');
  }

  // Called when user picks a CSV file
  // Called when user picks a CSV file
  async function onFileChanged(e) {
    const file = e.target.files[0];
    if (!file) return;

    // Show loading state
    document.getElementById('import-preview-text').textContent = 'Bestand inlezen...';
    document.getElementById('import-preview').style.display = 'block';

    try {
      const allRows = await _parseRabobankCSV(file);
      console.log('[CSV] Parsed rows:', allRows.length);

      if (allRows.length === 0) {
        document.getElementById('import-preview-text').textContent =
          'Geen transacties gevonden. Controleer of je een Rabobank CSV bestand hebt geselecteerd.';
        return;
      }

      // Deduplicate against existing transactions using sequence number
      const existingSeqNrs = new Set(
        DB.query('SELECT sequence_nr FROM transactions WHERE sequence_nr IS NOT NULL')
          .map(r => r.sequence_nr)
      );
      const existingFallbackKeys = new Set(
        DB.query('SELECT date, description, amount FROM transactions WHERE sequence_nr IS NULL')
          .map(r => `${r.date}|${r.description}|${r.amount}`)
      );

      const newRows = allRows.filter(r => {
        if (r.sequenceNr) return !existingSeqNrs.has(r.sequenceNr);
        return !existingFallbackKeys.has(`${r.date}|${r.description}|${r.amount}`);
      });

      console.log('[CSV] New rows after dedup:', newRows.length);

      document.getElementById('import-preview-text').textContent =
        `${newRows.length} nieuwe transacties gevonden (${allRows.length - newRows.length} duplicaten overgeslagen)`;

      parsedRows = newRows;

      // Auto-detect recurring transactions and show review for uncertain ones
      reviewItems = _detectRecurring(newRows);
      if (reviewItems.length > 0) {
        _renderReview(reviewItems);
        document.getElementById('review-section').style.display = 'block';
        document.getElementById('review-count').textContent     = reviewItems.length;
      }

      document.getElementById('btn-import-confirm').disabled = newRows.length === 0;

    } catch (err) {
      console.error('[CSV] Parse error:', err);
      document.getElementById('import-preview-text').textContent =
        'Fout bij inlezen bestand: ' + err.message;
    }
  }

  // Parse a Rabobank CSV file (ISO-8859-1 encoded)
  async function _parseRabobankCSV(file) {
    const buffer = await file.arrayBuffer();
    const text   = new TextDecoder('iso-8859-1').decode(buffer);
    const lines  = text.trim().split(/\r?\n/);
    const rows   = [];

    for (let i = 1; i < lines.length; i++) {
      const cols = _parseCSVLine(lines[i]);
      if (cols.length < 7) continue;

      // Parse amount: replace comma with dot, strip + prefix
      const amountStr = cols[6]?.replace(',', '.').replace('+', '').trim() || '0';
      const amountVal = parseFloat(amountStr);
      if (isNaN(amountVal) || amountVal === 0) continue;

      const type = amountVal < 0 ? 'debit' : 'credit';

      // Build description from description fields, fall back to counterparty name
      const description = [cols[19], cols[20], cols[21]]
        .map(s => s?.trim()).filter(Boolean).join(' ').trim()
        || cols[9]?.trim()
        || 'Onbekend';

      rows.push({
        sequenceNr:   cols[3]?.trim() || null,
        date:         cols[4]?.trim() || '',
        description:  description.substring(0, 200),
        counterparty: cols[8]?.trim() || '',
        amount:       Math.abs(amountVal),
        type,
      });
    }

    return rows.filter(r => r.date);
  }

  // Parse a single CSV line respecting quoted fields
  function _parseCSVLine(line) {
    const result   = [];
    let   current  = '';
    let   inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"')                  { inQuotes = !inQuotes; }
      else if (ch === ',' && !inQuotes) { result.push(current); current = ''; }
      else                              { current += ch; }
    }
    result.push(current);
    return result;
  }

  // ============================================================
  // AUTO-DETECTION OF RECURRING TRANSACTIONS
  //
  // Two-pass detection strategy:
  //   Pass 1 — Pattern matching (works without history)
  //     Keywords in description suggest fixed costs (insurance, tax, subscription etc.)
  //     Known IBAN prefixes of large Dutch utility/insurance companies
  //     Round amounts (e.g. €9.99, €29.00) are typical for subscriptions
  //   Pass 2 — Historical matching (requires prior imports)
  //     Same counterparty or description seen >= RECURRENCE_MIN_COUNT times before
  //
  // Already-registered posts are always excluded.
  // ============================================================

  // Keywords that strongly suggest a recurring fixed cost (case-insensitive)
  const RECURRING_KEYWORDS = [
    'verzekering', 'insurance', 'premie', 'polis',
    'abonnement', 'subscription', 'lidmaatschap', 'membership',
    'energie', 'energy', 'gas', 'water', 'stroom', 'elektra',
    'belasting', 'tax', 'gemeente', 'heffing', 'aanslag',
    'hypotheek', 'mortgage', 'huur', 'rent',
    'telefoon', 'mobiel', 'internet', 'ziggo', 'kpn', 't-mobile', 'vodafone', 'tele2',
    'spotify', 'netflix', 'disney', 'amazon', 'adobe', 'microsoft', 'apple',
    'gym', 'sportschool', 'fitness',
    'incasso', 'automatische', 'sepa',
    'nuon', 'vattenfall', 'eneco', 'essent', 'greenchoice',
    'zorgverzekering', 'zorg', 'menzis', 'vgz', 'cz ', 'achmea', 'aegon', 'nationale',
    'arag', 'centraal beheer', 'interpolis', 'reaal', 'nn ',
    'uwv', 'svb', 'duo ',
  ];

  function _detectRecurring(newRows) {
    const knownIbans = new Set(
      DB.query('SELECT iban FROM recurring_posts WHERE iban IS NOT NULL').map(r => r.iban)
    );
    const knownTerms = DB.query('SELECT search_term FROM recurring_posts WHERE search_term IS NOT NULL')
      .map(r => r.search_term?.toUpperCase());

    // Historical occurrence counts for pass 2
    const historical = DB.query(
      `SELECT description, counterparty, COUNT(*) as cnt
       FROM transactions WHERE type='debit'
       GROUP BY counterparty, description`
    );

    const candidates = [];
    const seen       = new Set();

    for (const row of newRows) {
      if (row.type !== 'debit') continue;

      const key = row.counterparty || row.description.substring(0, 30);
      if (seen.has(key)) continue;
      seen.add(key);

      // Skip if already registered as a recurring post
      if (knownIbans.has(row.counterparty)) continue;
      if (knownTerms.some(t => t && row.description.toUpperCase().includes(t))) continue;

      const descUpper = row.description.toUpperCase();

      // Pass 1a: keyword match in description
      const keywordMatch = RECURRING_KEYWORDS.some(kw =>
        descUpper.includes(kw.toUpperCase())
      );

      // Pass 1b: round or subscription-style amount (e.g. x.00, x.95, x.99)
      const amountStr   = row.amount.toFixed(2);
      const roundAmount = amountStr.endsWith('.00') || amountStr.endsWith('.95') ||
                          amountStr.endsWith('.99') || amountStr.endsWith('.90');

      // Pass 2: historical occurrence
      const hist = historical.find(h =>
        (row.counterparty && h.counterparty === row.counterparty) ||
        h.description?.substring(0, 20) === row.description.substring(0, 20)
      );
      const historicalMatch = hist && hist.cnt >= CONFIG.RECURRENCE_MIN_COUNT;

      // Flag as candidate if any signal is present
      if (keywordMatch || (roundAmount && row.amount >= 5) || historicalMatch) {
        candidates.push({
          ...row,
          histCount:    hist?.cnt || 0,
          matchReason:  keywordMatch ? 'keyword' : historicalMatch ? 'history' : 'amount',
        });
      }
    }

    return candidates;
  }

  // Render the review panel for uncertain recurring transactions
  function _renderReview(items) {
    const cats       = DB.query('SELECT id, name FROM categories');
    const catOptions = cats.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
    const freqOptions = `
      <option value="12">Maandelijks (12×/jaar)</option>
      <option value="10">10× per jaar (bijv. gemeentebelasting)</option>
      <option value="6">Halfjaarlijks</option>
      <option value="4">Per kwartaal (4×/jaar)</option>
      <option value="2">2× per jaar</option>
      <option value="1">Jaarlijks (1×/jaar)</option>
    `;

    const html = items.map((item, i) => `
      <div class="review-item" id="review-${i}">
        <div class="review-item-name">${item.description.substring(0, 60)}</div>
        <div class="review-item-meta">
          ${item.counterparty || 'onbekend IBAN'} · €${item.amount.toFixed(2)} ·
          ${item.matchReason === 'keyword' ? '🔑 herkend op omschrijving' :
            item.matchReason === 'history' ? `📋 ${item.histCount}× eerder gezien` :
            '💰 rond bedrag'}
        </div>
        <div class="review-item-actions">
          <select class="form-select" id="rev-cat-${i}" style="width:160px;">${catOptions}</select>
          <select class="form-select" id="rev-freq-${i}" style="width:180px;">${freqOptions}</select>
          <button class="btn btn-sm btn-primary" onclick="CSVImport.acceptReview(${i})">
            <i class="fa-solid fa-check"></i> Vaste last
          </button>
          <button class="btn btn-sm" onclick="CSVImport.rejectReview(${i})">Overslaan</button>
        </div>
      </div>
    `).join('');

    document.getElementById('review-items').innerHTML = html;
  }

  // User confirms a transaction as a recurring post
  function acceptReview(i) {
    const item  = reviewItems[i];
    const catId = parseInt(document.getElementById(`rev-cat-${i}`).value);
    const freq  = parseInt(document.getElementById(`rev-freq-${i}`).value);

    DB.run(
      `INSERT INTO recurring_posts (name, category_id, frequency, amount, iban, search_term)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        item.description.substring(0, 80),
        catId,
        freq,
        item.amount,
        item.counterparty || null,
        item.description.substring(0, 20).toUpperCase(),
      ]
    );

    const el = document.getElementById(`review-${i}`);
    el.style.opacity        = '0.4';
    el.style.pointerEvents  = 'none';
  }

  // User dismisses a candidate — not treated as recurring
  function rejectReview(i) {
    document.getElementById(`review-${i}`).style.display = 'none';
  }

  // Confirm import: write all new transactions to the database
  function confirmImport() {
    const posts = DB.query('SELECT id, iban, search_term, category_id FROM recurring_posts');
    let imported = 0;

    for (const row of parsedRows) {
      // Try to match transaction to a known recurring post
      let postId = null;
      let catId  = null;

      for (const post of posts) {
        const ibanMatch = post.iban        && row.counterparty === post.iban;
        const termMatch = post.search_term && row.description.toUpperCase()
                            .includes(post.search_term.toUpperCase());
        if (ibanMatch || termMatch) {
          postId = post.id;
          catId  = post.category_id;
          break;
        }
      }

      DB.run(
        `INSERT OR IGNORE INTO transactions
           (sequence_nr, date, description, counterparty, amount, type, category_id, post_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [row.sequenceNr || null, row.date, row.description, row.counterparty,
         row.amount, row.type, catId, postId]
      );
      imported++;
    }

    UI.closeModal('modal-import');
    Dashboard.populateMonthSelector();
    Dashboard.render();
    Posts.render();
    Transactions.populateMonthSelector();
    Transactions.render();
    UI.toast(`${imported} transacties geïmporteerd.`);
  }

  return { openModal, onFileChanged, confirmImport, acceptReview, rejectReview };
})();
