// ============================================================
// GOOGLE-DRIVE.JS — Google Drive API integration
//
// Uses the drive.file scope — the app can ONLY access files
// it created itself. No access to other Drive content.
//
// Flow:
//   connect()          — OAuth login, then findOrCreate()
//   findOrCreateFile() — find existing DB or create new one
//   download()         — load DB from Drive into sql.js
//   upload()           — write current DB back to Drive
// ============================================================

const GoogleDrive = (() => {
  let accessToken = null;
  let fileId      = null;

  // Initiate Google OAuth login
  function connect() {
    const script    = document.createElement('script');
    script.src      = 'https://accounts.google.com/gsi/client';
    script.onload   = _requestToken;
    script.onerror  = () => UI.toast('Could not load Google Sign-In. Check your internet connection.');
    document.head.appendChild(script);
  }

  function _requestToken() {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: CONFIG.GOOGLE_CLIENT_ID,
      scope:     CONFIG.GOOGLE_DRIVE_SCOPE,
      callback:  async response => {
        if (response.error) {
          UI.toast('Google Drive connection failed: ' + response.error);
          return;
        }
        accessToken = response.access_token;
        _updateStatus(true);
        await _findOrCreateFile();
      },
    });
    client.requestAccessToken();
  }

  // Search Drive for existing DB file; download or create
  async function _findOrCreateFile() {
    const res  = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=name='${CONFIG.DB_FILENAME}'&spaces=drive&fields=files(id,name)`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const data = await res.json();

    if (data.files && data.files.length > 0) {
      fileId = data.files[0].id;
      await _download();
    } else {
      // First time: create a fresh DB, then upload it
      DB.createNew();
      await upload();
    }
  }

  // Download the .sqlite file from Drive and load it into sql.js
  async function _download() {
    const res    = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const buffer = await res.arrayBuffer();
    DB.loadFromBuffer(buffer);
  }

  // Upload current database to Drive (create or update)
  // Returns true on success, false if not connected
  async function upload() {
    if (!accessToken) return false;

    const data     = DB.exportRaw();
    const metadata = { name: CONFIG.DB_FILENAME, mimeType: 'application/octet-stream' };
    const form     = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file',     new Blob([data],                     { type: 'application/octet-stream' }));

    const url    = fileId
      ? `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`
      : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
    const method = fileId ? 'PATCH' : 'POST';

    const res    = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${accessToken}` },
      body:    form,
    });
    const result = await res.json();
    if (!fileId) fileId = result.id;
    return true;
  }

  function _updateStatus(connected) {
    const el = document.getElementById('drive-status');
    if (connected) {
      el.innerHTML = '<i class="fa-solid fa-cloud"></i> Google Drive';
      el.classList.add('connected');
    }
  }

  function isConnected() {
    return accessToken !== null;
  }

  return { connect, upload, isConnected };
})();
