// ============================================================
// DB.JS — SQLite database management via sql.js (WebAssembly)
//
// Flow:
//   1. init()        — loads sql.js WASM binary, auto-loads from OPFS if present
//   2. createNew()   — creates fresh DB with schema + default categories
//   3. loadFromFile()— loads existing .sqlite file from disk
//   After either: showApp() is called to render the UI
//
// Local persistence: every DB.run() debounce-saves to a real .sqlite file in
// the Origin Private File System (OPFS) so the browser session survives a page
// refresh without Google Drive or a file picker.
// ============================================================

const DB = (() => {
  let SQL = null;
  let db = null;

  // Database schema — all tables defined here
  const SCHEMA = `
    CREATE TABLE IF NOT EXISTS categories (
      id   INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS recurring_posts (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL,
      category_id INTEGER,
      frequency   INTEGER NOT NULL DEFAULT 12,
      amount      REAL    NOT NULL DEFAULT 0,
      iban        TEXT,
      search_term TEXT,
      note        TEXT,
      FOREIGN KEY(category_id) REFERENCES categories(id)
    );

    CREATE TABLE IF NOT EXISTS own_accounts (
      id   INTEGER PRIMARY KEY AUTOINCREMENT,
      iban TEXT NOT NULL UNIQUE,
      name TEXT
    );

    CREATE TABLE IF NOT EXISTS labels (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL,
      iban        TEXT,
      search_term TEXT,
      amount      REAL,
      category_id INTEGER,
      FOREIGN KEY(category_id) REFERENCES categories(id)
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      sequence_nr  TEXT UNIQUE,
      date         TEXT NOT NULL,
      description  TEXT,
      counterparty TEXT,
      amount       REAL NOT NULL,
      type         TEXT NOT NULL,
      category_id  INTEGER,
      post_id      INTEGER,
      label_id     INTEGER,
      FOREIGN KEY(category_id) REFERENCES categories(id),
      FOREIGN KEY(post_id)     REFERENCES recurring_posts(id),
      FOREIGN KEY(label_id)    REFERENCES labels(id)
    );
  `;

  // ============================================================
  // OPFS helpers — local persistence as a real .sqlite file
  // ============================================================
  const OPFS_FILENAME = 'vaste-lasten.sqlite';

  async function _saveToOPFS() {
    try {
      const root     = await navigator.storage.getDirectory();
      const fh       = await root.getFileHandle(OPFS_FILENAME, { create: true });
      const writable = await fh.createWritable();
      await writable.write(db.export());
      await writable.close();
    } catch (e) {
      console.warn('[DB] OPFS save failed:', e);
    }
  }

  async function _loadFromOPFS() {
    try {
      const root = await navigator.storage.getDirectory();
      const fh   = await root.getFileHandle(OPFS_FILENAME);
      const buf  = await (await fh.getFile()).arrayBuffer();
      return new Uint8Array(buf);
    } catch {
      return null; // file doesn't exist yet
    }
  }

  async function _clearOPFS() {
    try {
      const root = await navigator.storage.getDirectory();
      await root.removeEntry(OPFS_FILENAME);
    } catch { /* ignore */ }
  }

  // Debounced OPFS save — batches rapid mutations into one write
  let _opfsTimer = null;
  function _scheduleSave() {
    clearTimeout(_opfsTimer);
    _opfsTimer = setTimeout(_saveToOPFS, 500);
  }

  // ============================================================
  // Migrations
  // ============================================================
  function _migrate() {
    const getColumns = (table) => {
      const s = db.prepare(`PRAGMA table_info(${table})`);
      const cols = [];
      while (s.step()) cols.push(s.getAsObject().name);
      s.free();
      return cols;
    };

    if (!getColumns('transactions').includes('label_id')) {
      db.run('ALTER TABLE transactions ADD COLUMN label_id INTEGER REFERENCES labels(id)');
    }

    try { db.run('SELECT 1 FROM own_accounts LIMIT 1'); } catch(e) {
      db.run(`CREATE TABLE IF NOT EXISTS own_accounts (
        id   INTEGER PRIMARY KEY AUTOINCREMENT,
        iban TEXT NOT NULL UNIQUE,
        name TEXT
      )`);
    }

    if (!getColumns('labels').includes('amount')) {
      db.run('ALTER TABLE labels ADD COLUMN amount REAL');
    }
  }

  // ============================================================
  // Public API
  // ============================================================

  // Load sql.js WASM, then auto-restore from IndexedDB if available
  async function init() {
    SQL = await initSqlJs({ locateFile: () => 'lib/sql-wasm.wasm' });

    // Skip auto-restore when the user prefers Google Drive
    if (GoogleDrive.wasConnected()) return;

    const cached = await _loadFromOPFS();
    if (cached) {
      db = new SQL.Database(cached);
      db.run(SCHEMA);
      _migrate();
      _showApp();
    }
  }

  function createNew() {
    db = new SQL.Database();
    db.run(SCHEMA);
    _migrate();
    CONFIG.DEFAULT_CATEGORIES.forEach(name => {
      db.run('INSERT OR IGNORE INTO categories (name) VALUES (?)', [name]);
    });
    _saveToOPFS();
    _showApp();
  }

  function loadFromFile() {
    document.getElementById('db-file-input').click();
  }

  function loadFromFileInput(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      const arr = new Uint8Array(e.target.result);
      db = new SQL.Database(arr);
      db.run(SCHEMA);
      _migrate();
      _saveToOPFS();
      _showApp();
    };
    reader.readAsArrayBuffer(file);
  }

  function loadFromBuffer(buffer) {
    const arr = new Uint8Array(buffer);
    db = new SQL.Database(arr);
    db.run(SCHEMA);
    _migrate();
    _saveToOPFS();
    _showApp();
  }

  function query(sql, params = []) {
    try {
      const stmt = db.prepare(sql);
      stmt.bind(params);
      const rows = [];
      while (stmt.step()) rows.push(stmt.getAsObject());
      stmt.free();
      return rows;
    } catch (e) {
      console.error('[DB] Query error:', e.message, '\nSQL:', sql);
      return [];
    }
  }

  function run(sql, params = []) {
    try {
      db.run(sql, params);
      _scheduleSave();
    } catch (e) {
      console.error('[DB] Run error:', e.message, '\nSQL:', sql);
    }
  }

  function exportRaw() {
    return db.export();
  }

  function downloadSqlite() {
    const data = exportRaw();
    const blob = new Blob([data], { type: 'application/octet-stream' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = CONFIG.DB_FILENAME;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Save to Google Drive if connected, otherwise download as .sqlite file.
  // silent=true suppresses the download fallback (used for auto-saves after import)
  async function save(silent = false) {
    const saved = await GoogleDrive.upload();
    if (!saved) {
      if (!silent) {
        downloadSqlite();
        UI.toast('Lokaal opgeslagen als .sqlite bestand.');
      }
    } else {
      UI.toast('Opgeslagen in Google Drive.');
    }
  }

  async function reset() {
    if (!confirm('Alle data wissen? Dit kan niet ongedaan worden gemaakt.')) return;

    db = new SQL.Database();
    db.run(SCHEMA);
    CONFIG.DEFAULT_CATEGORIES.forEach(name => {
      db.run('INSERT OR IGNORE INTO categories (name) VALUES (?)', [name]);
    });

    await _clearOPFS();

    const driveUploadOk = await GoogleDrive.upload();
    if (driveUploadOk) {
      UI.toast('Database gereset en opgeslagen in Google Drive.');
    } else {
      localStorage.removeItem('vl_storage');
      UI.toast('Database gereset.');
    }

    _showApp();
  }

  function isReady() {
    return db !== null;
  }

  function _showApp() {
    document.getElementById('landing').style.display = 'none';
    document.getElementById('app').classList.add('visible');
    Dashboard.populateMonthSelector();
    Dashboard.render();
    Posts.render();
    Transactions.populateMonthSelector();
    Transactions.render();
    Labels.render();
    Settings.render();
    Settings.renderOwnAccounts();
  }

  return {
    init,
    createNew,
    loadFromFile,
    loadFromFileInput,
    loadFromBuffer,
    query,
    run,
    exportRaw,
    downloadSqlite,
    save,
    reset,
    isReady,
  };
})();
