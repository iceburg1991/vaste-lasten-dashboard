// ============================================================
// UI.JS — UI helpers: modals, tabs, toasts, navigation
// ============================================================

const UI = (() => {

  // ---- Modals ----

  function openModal(id) {
    document.getElementById(id).classList.add('open');
  }

  function closeModal(id) {
    document.getElementById(id).classList.remove('open');
  }

  // ---- Tabs ----

  const TAB_NAMES = ['dashboard', 'posts', 'transactions', 'settings'];

  function switchTab(name) {
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === name);
    });
    document.querySelectorAll('.tab-content').forEach(pane => {
      pane.classList.toggle('active', pane.id === `tab-${name}`);
    });
  }

  function updateDriveStatus(connected) {
    const el = document.getElementById('drive-status');
    if (!el) return;
    if (connected) {
      el.className = 'drive-status connected';
      el.innerHTML = '<span class="drive-status-dot"></span> Google Drive';
    }
  }

  // ---- Toast notifications ----

  function toast(message, duration = 3000) {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      document.body.appendChild(container);
    }

    const el = document.createElement('div');
    el.className   = 'toast';
    el.textContent = message;
    container.appendChild(el);

    // Animate in
    requestAnimationFrame(() => el.classList.add('toast-visible'));

    // Remove after duration
    setTimeout(() => {
      el.classList.remove('toast-visible');
      el.addEventListener('transitionend', () => el.remove());
    }, duration);
  }

  // ---- Google Drive connect button ----

  function connectGoogleDrive() {
    GoogleDrive.connect();
  }

  // ---- Close modals on backdrop click ----

  function initModalBackdrops() {
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', e => {
        if (e.target === overlay) overlay.classList.remove('open');
      });
    });
    // Close any open tooltips when clicking outside
    document.addEventListener('click', e => {
      if (!e.target.closest('.tooltip-container')) {
        document.querySelectorAll('.tooltip-container.open')
          .forEach(el => el.classList.remove('open'));
      }
    });
  }

  return {
    openModal,
    closeModal,
    switchTab,
    toast,
    connectGoogleDrive,
    initModalBackdrops,
    updateDriveStatus,
  };
})();
