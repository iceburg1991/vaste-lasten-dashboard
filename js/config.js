// ============================================================
// CONFIG.JS — Application constants and configuration
// ============================================================

const CONFIG = {
  // Google OAuth Client ID
  // Setup instructions:
  // 1. Go to https://console.cloud.google.com
  // 2. Create project: "vaste-lasten-dashboard"
  // 3. Enable Google Drive API via APIs & Services > Library
  // 4. Create OAuth Client ID (Web application)
  // 5. Add to Authorised JavaScript origins: https://iceburg1991.github.io
  // 6. Add yourself as test user under OAuth consent screen > Test users
  GOOGLE_CLIENT_ID: '38413226701-opprq2rduaediv52s9or75ca0ukqvv84.apps.googleusercontent.com',
  GOOGLE_DRIVE_SCOPE: 'https://www.googleapis.com/auth/drive.file',

  // Local database filename stored in Google Drive
  DB_FILENAME: 'vaste-lasten.sqlite',

  // Default expense categories
  DEFAULT_CATEGORIES: ['Housing', 'Transport', 'Insurance', 'Subscriptions', 'Taxes', 'Other'],

  // Minimum number of occurrences before a transaction is flagged as recurring
  RECURRENCE_MIN_COUNT: 2,

  // Deviation threshold for flagging changes (10% = 0.10)
  DEVIATION_THRESHOLD: 0.10,
};
