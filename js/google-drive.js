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

  // Capture at module init — avoids CONFIG timing issues in async callbacks
  const CLIENT_ID   = '38413226701-opprq2rduaediv52s9or75ca0ukqvv84.apps.googleusercontent.com';
  const SCOPE       = 'https://www.googleapis.com/auth/drive.file';
  const DB_FILENAME = 'vaste-lasten.sqlite';

  // Initiate Google OAuth login
  // Pre-load the Google Identity Services script in the background on page load.
  // This way the OAuth popup appears faster when the user clicks reconnect.
  function preload() {
    if (!wasConnected()) return;
    const script   = document.createElement('script');
    script.src     = 'https://accounts.google.com/gsi/client';
    script.async   = true;
    script.defer   = true;
    script.onload  = () => {
      // Script is ready — attempt a silent token request (no popup)
      // This works when the user has an active Google session in the browser
      const client = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope:     SCOPE,
        prompt:    '',
        callback:  async response => {
          if (response.error || !response.access_token) return; // Silent failed, user must click reconnect
          accessToken = response.access_token;
          _updateStatus(true);
          // Hide the reconnect button since we connected automatically
          const el = document.getElementById('reconnect-section');
          if (el) el.style.display = 'none';
          await _findOrCreateFile();
        },
      });
      // requestAccessToken with empty prompt — shows popup only if no active session
      client.requestAccessToken({ prompt: '' });
    };
    document.head.appendChild(script);
  }

  // Connect to Google Drive via OAuth popup (called by user interaction)
  function connect() {
    // Remember that the user prefers Google Drive across sessions
    localStorage.setItem('vl_storage', 'google-drive');

    // If GSI script already loaded by preload(), go straight to token request
    if (typeof google !== 'undefined' && google.accounts) {
      _requestToken();
      return;
    }

    const script   = document.createElement('script');
    script.src     = 'https://accounts.google.com/gsi/client';
    script.onload  = _requestToken;
    script.onerror = () => UI.toast('Google Sign-In kon niet geladen worden. Controleer je internetverbinding.');
    document.head.appendChild(script);
  }

  function _requestToken() {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope:     SCOPE,
      callback:  async response => {
        if (response.error) {
          UI.toast('Google Drive verbinding mislukt: ' + response.error);
          return;
        }
        accessToken = response.access_token;
        _updateStatus(true);
        await _findOrCreateFile();
      },
    });
    client.requestAccessToken();
  }

  // Returns true if the user previously chose Google Drive (used to show reconnect button)
  function wasConnected() {
    return localStorage.getItem('vl_storage') === 'google-drive';
  }

  // Search Drive for existing DB file; download or create
  async function _findOrCreateFile() {
    const res  = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=name='${DB_FILENAME}'&spaces=drive&fields=files(id,name)`,
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
    const metadata = { name: DB_FILENAME, mimeType: 'application/octet-stream' };
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

  return { connect, preload, upload, isConnected, wasConnected };
})();
