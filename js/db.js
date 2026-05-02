// ============================================================
// DB.JS — SQLite database management via sql.js (WebAssembly)
//
// Flow:
//   1. init()        — loads sql.js WASM binary
//   2. createNew()   — creates fresh DB with schema + default categories
//   3. loadFromFile()— loads existing .sqlite file from disk
//   After either: showApp() is called to render the UI
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
      FOREIGN KEY(category_id) REFERENCES categories(id),
      FOREIGN KEY(post_id)     REFERENCES recurring_posts(id)
    );
  `;

  // Load sql.js WASM — must be called once before anything else
  async function init() {
    SQL = await initSqlJs({
      locateFile: () => '/vaste-lasten-dashboard/lib/sql-wasm.wasm'
    });
  }

  // Create a brand new empty database with default categories
  function createNew() {
    db = new SQL.Database();
    db.run(SCHEMA);
    CONFIG.DEFAULT_CATEGORIES.forEach(name => {
      db.run('INSERT OR IGNORE INTO categories (name) VALUES (?)', [name]);
    });
    _showApp();
  }

  // Trigger file picker for loading an existing .sqlite file
  function loadFromFile() {
    document.getElementById('db-file-input').click();
  }

  // Called by the hidden file input after user picks a .sqlite file
  function loadFromFileInput(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      const arr = new Uint8Array(e.target.result);
      db = new SQL.Database(arr);
      db.run(SCHEMA); // Ensure new columns exist when loading older databases
      _showApp();
    };
    reader.readAsArrayBuffer(file);
  }

  // Load database from a raw Uint8Array (used by Google Drive integration)
  function loadFromBuffer(buffer) {
    const arr = new Uint8Array(buffer);
    db = new SQL.Database(arr);
    db.run(SCHEMA);
    _showApp();
  }

  // Run a SELECT query and return rows as plain objects
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

  // Run an INSERT / UPDATE / DELETE statement
  function run(sql, params = []) {
    try {
      db.run(sql, params);
    } catch (e) {
      console.error('[DB] Run error:', e.message, '\nSQL:', sql);
    }
  }

  // Export database as raw Uint8Array (for saving/downloading)
  function exportRaw() {
    return db.export();
  }

  // Prompt user to download the database as a .sqlite file
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

  // Save: try Google Drive first, fall back to local download
  async function save() {
    const saved = await GoogleDrive.upload();
    if (!saved) {
      downloadSqlite();
      UI.toast('Saved locally — store the file in Google Drive as a backup.');
    } else {
      UI.toast('Saved to Google Drive.');
    }
  }

  // Wipe everything and start fresh
  function reset() {
    if (confirm('Reset all data? This cannot be undone.')) {
      createNew();
    }
  }

  function isReady() {
    return db !== null;
  }

  // Internal: transition from landing screen to main app
  function _showApp() {
    document.getElementById('landing').style.display = 'none';
    document.getElementById('app').classList.add('visible');
    Dashboard.populateMonthSelector();
    Dashboard.render();
    Posts.render();
    Transactions.populateMonthSelector();
    Transactions.render();
    Settings.render();
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
