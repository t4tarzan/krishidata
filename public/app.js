/* ============================================
   KrishiData — Field Data Collection Platform
   Single Page Application
   ============================================ */

const CGI_BIN = "";
const API = "/api";

// ============================================
// STATE
// ============================================
const State = {
  user: null,
  forms: [],
  submissions: [],
  currentView: 'login',
  sidebarOpen: false,
  sidebarCollapsed: false,
  pendingQueue: [],
  isOnline: navigator.onLine,
  theme: window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
  // Form builder
  builderFields: [],
  builderSelectedField: null,
  builderFormName: '',
  builderFormDesc: '',
  editingFormId: null,
  // Submissions
  submissionFilters: { form_id: '', worker_id: '' },
  submissionPage: 0,
  submissionTotal: 0,
  // Search
  searchResults: [],
  searchQuery: '',
  // Correlations
  correlations: [],
  // Stats
  stats: null,
  // Charts
  chartInstances: {},
  // Collection
  collectFormId: null,
  collectData: {},
  // Users list
  usersList: [],
  // Edit modal
  editingSubmission: null,
  // View submission
  viewingSubmission: null,
};

// ============================================
// API HELPERS
// ============================================
async function api(path, options = {}) {
  const { method = 'GET', body, params = {} } = options;
  if (State.user) params.user_id = State.user.id;

  const qs = new URLSearchParams(params).toString();
  const url = `${API}${path}${qs ? '?' + qs : ''}`;

  const fetchOptions = { method, headers: {} };
  if (body) {
    fetchOptions.headers['Content-Type'] = 'application/json';
    fetchOptions.body = JSON.stringify(body);
  }

  try {
    const res = await fetch(url, fetchOptions);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  } catch (err) {
    if (!State.isOnline && method === 'POST' && path.startsWith('/submissions')) {
      State.pendingQueue.push({ path, options, timestamp: Date.now() });
      updateSyncIndicator();
      showToast('Saved offline. Will sync when connected.', 'info');
      return { offline: true };
    }
    throw err;
  }
}

// ============================================
// TOAST NOTIFICATIONS
// ============================================
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 3500);
}

// ============================================
// THEME TOGGLE
// ============================================
function initTheme() {
  document.documentElement.setAttribute('data-theme', State.theme);
}

function toggleTheme() {
  State.theme = State.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', State.theme);
  const btn = document.querySelector('[data-theme-toggle]');
  if (btn) {
    btn.innerHTML = State.theme === 'dark'
      ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>'
      : '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
  }
}

// ============================================
// ONLINE/OFFLINE HANDLING
// ============================================
function initConnectivity() {
  window.addEventListener('online', () => {
    State.isOnline = true;
    updateSyncIndicator();
    syncPending();
  });
  window.addEventListener('offline', () => {
    State.isOnline = false;
    updateSyncIndicator();
  });
}

function updateSyncIndicator() {
  const el = document.getElementById('sync-indicator');
  if (!el) return;
  if (!State.isOnline) {
    el.className = 'sync-indicator offline';
    el.innerHTML = '<span class="sync-dot"></span>Offline';
  } else if (State.pendingQueue.length > 0) {
    el.className = 'sync-indicator pending';
    el.innerHTML = `<span class="sync-dot"></span>${State.pendingQueue.length} pending`;
  } else {
    el.className = 'sync-indicator online';
    el.innerHTML = '<span class="sync-dot"></span>Online';
  }
}

async function syncPending() {
  if (!State.isOnline || State.pendingQueue.length === 0) return;
  const queue = [...State.pendingQueue];
  State.pendingQueue = [];
  let synced = 0;
  for (const item of queue) {
    try {
      await api(item.path, item.options);
      synced++;
    } catch {
      State.pendingQueue.push(item);
    }
  }
  if (synced > 0) showToast(`Synced ${synced} submission(s)`, 'success');
  updateSyncIndicator();
}

// ============================================
// ROUTER
// ============================================
function navigate(view) {
  window.location.hash = view;
}

function initRouter() {
  window.addEventListener('hashchange', handleRoute);
  handleRoute();
}

function handleRoute() {
  const hash = window.location.hash.slice(1) || 'login';
  if (!State.user && hash !== 'login') {
    navigate('login');
    return;
  }
  if (State.user && hash === 'login') {
    navigate('dashboard');
    return;
  }
  State.currentView = hash;
  render();
}

// ============================================
// ICONS (SVG strings)
// ============================================
const Icons = {
  dashboard: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>',
  forms: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/><path d="M16 13H8M16 17H8M10 9H8"/></svg>',
  collect: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>',
  submissions: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
  correlations: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>',
  users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>',
  settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>',
  menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  chevronLeft: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="15 18 9 12 15 6"/></svg>',
  chevronRight: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="9 18 15 12 9 6"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>',
  edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
  up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="18 15 12 9 6 15"/></svg>',
  down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="6 9 12 15 18 9"/></svg>',
  download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
  refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg>',
  eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
  map: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>',
};

function icon(name, size = 20) {
  return `<span style="display:inline-flex;width:${size}px;height:${size}px">${Icons[name] || ''}</span>`;
}

// ============================================
// SIDEBAR NAV CONFIG BY ROLE
// ============================================
function getNavItems() {
  const role = State.user?.role || 'worker';
  const items = [
    { id: 'dashboard', label: 'Dashboard', icon: 'dashboard', roles: ['admin', 'manager', 'supervisor', 'worker'] },
    { id: 'collect', label: 'Collect Data', icon: 'collect', roles: ['admin', 'manager', 'supervisor', 'worker'] },
    { id: 'submissions', label: 'Submissions', icon: 'submissions', roles: ['admin', 'manager', 'supervisor', 'worker'] },
    { type: 'divider', label: 'Manage', roles: ['admin', 'manager'] },
    { id: 'forms', label: 'Forms', icon: 'forms', roles: ['admin', 'manager'] },
    { id: 'form-builder', label: 'Form Builder', icon: 'edit', roles: ['admin', 'manager'] },
    { type: 'divider', label: 'Insights', roles: ['admin', 'manager', 'supervisor'] },
    { id: 'search', label: 'Search', icon: 'search', roles: ['admin', 'manager', 'supervisor', 'worker'] },
    { id: 'correlations', label: 'Correlations', icon: 'correlations', roles: ['admin', 'manager'] },
    { type: 'divider', label: 'Admin', roles: ['admin', 'manager'] },
    { id: 'users', label: 'Users', icon: 'users', roles: ['admin', 'manager'] },
    { id: 'settings', label: 'Settings', icon: 'settings', roles: ['admin', 'manager', 'supervisor', 'worker'] },
  ];
  return items.filter(i => i.roles.includes(role));
}

// ============================================
// LOGO SVG
// ============================================
const LOGO_SVG = `<svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="32" height="32" rx="8" fill="var(--color-primary)"/>
  <path d="M8 22V14L16 10L24 14V22L16 26L8 22Z" stroke="var(--color-text-inverse)" stroke-width="1.5" fill="none"/>
  <path d="M16 10V26" stroke="var(--color-text-inverse)" stroke-width="1.5"/>
  <path d="M8 14L24 22" stroke="var(--color-text-inverse)" stroke-width="1" opacity="0.5"/>
  <path d="M24 14L8 22" stroke="var(--color-text-inverse)" stroke-width="1" opacity="0.5"/>
  <circle cx="16" cy="16" r="2" fill="var(--color-text-inverse)"/>
</svg>`;

// ============================================
// RENDER ENGINE
// ============================================
function render() {
  const app = document.getElementById('app');
  if (!app) return;

  if (State.currentView === 'login' || !State.user) {
    app.innerHTML = renderLogin();
    app.className = '';
    bindEvents();
    return;
  }

  // Dashboard layout
  const shellClass = `app-shell${State.sidebarCollapsed ? ' sidebar-collapsed' : ''}`;
  app.className = '';

  app.innerHTML = `
    <div class="${shellClass}" id="app-shell">
      ${renderSidebar()}
      <div class="sidebar-overlay" id="sidebar-overlay"></div>
      ${renderHeader()}
      <main class="main-content" id="main-content">
        ${renderView()}
      </main>
      ${renderMobileTabs()}
    </div>
    <div class="toast-container" id="toast-container"></div>
    ${renderModals()}
  `;

  bindEvents();
  afterRender();
}

function renderView() {
  switch (State.currentView) {
    case 'dashboard': return renderDashboard();
    case 'forms': return renderForms();
    case 'form-builder': return renderFormBuilder();
    case 'collect': return renderCollect();
    case 'submissions': return renderSubmissions();
    case 'search': return renderSearch();
    case 'correlations': return renderCorrelations();
    case 'users': return renderUsers();
    case 'settings': return renderSettings();
    default: return renderDashboard();
  }
}

// ============================================
// LOGIN VIEW
// ============================================
function renderLogin() {
  return `
    <div class="login-container">
      <div class="login-card slide-up">
        <div class="login-brand">
          ${LOGO_SVG}
          <h1>KrishiData</h1>
          <p>Field Data Collection Platform</p>
        </div>
        <form id="login-form">
          <div class="form-group">
            <label class="form-label" for="username">Username</label>
            <input class="form-input" id="username" type="text" placeholder="Enter username" autocomplete="username" required>
          </div>
          <div class="form-group">
            <label class="form-label" for="password">Password</label>
            <input class="form-input" id="password" type="password" placeholder="Enter password" autocomplete="current-password" required>
          </div>
          <button type="submit" class="btn btn-primary" id="login-btn">Sign In</button>
          <p class="form-hint" style="text-align:center;margin-top:var(--space-4)">Demo: admin / admin123</p>
        </form>
      </div>
      <button data-theme-toggle aria-label="Toggle theme" onclick="toggleTheme()" style="position:fixed;top:var(--space-4);right:var(--space-4)" class="theme-toggle">
        ${State.theme === 'dark'
          ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>'
          : '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>'}
      </button>
    </div>
  `;
}

// ============================================
// SIDEBAR
// ============================================
function renderSidebar() {
  const navItems = getNavItems();
  return `
    <aside class="sidebar${State.sidebarOpen ? ' open' : ''}" id="sidebar">
      <div class="sidebar-brand">
        ${LOGO_SVG}
        <h1>KrishiData</h1>
      </div>
      <nav class="sidebar-nav">
        ${navItems.map(item => {
          if (item.type === 'divider') {
            return `<div class="sidebar-section-label">${item.label}</div>`;
          }
          return `<a class="sidebar-link${State.currentView === item.id ? ' active' : ''}" data-nav="${item.id}" href="#${item.id}">
            ${icon(item.icon)}
            <span>${item.label}</span>
          </a>`;
        }).join('')}
      </nav>
      <div class="sidebar-footer">
        <button class="sidebar-collapse-btn" id="sidebar-collapse-btn" aria-label="Toggle sidebar">
          ${State.sidebarCollapsed ? icon('chevronRight') : icon('chevronLeft')}
        </button>
      </div>
    </aside>
  `;
}

// ============================================
// HEADER
// ============================================
function renderHeader() {
  const titles = {
    dashboard: 'Dashboard', forms: 'Forms', 'form-builder': 'Form Builder',
    collect: 'Collect Data', submissions: 'Submissions', search: 'Search',
    correlations: 'Correlations', users: 'Users', settings: 'Settings'
  };
  const initials = State.user ? State.user.full_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : '';

  return `
    <header class="header">
      <div class="header-left">
        <button class="mobile-menu-btn btn-icon" id="mobile-menu-btn" aria-label="Open menu">
          ${icon('menu')}
        </button>
        <h2 class="header-title">${titles[State.currentView] || 'KrishiData'}</h2>
      </div>
      <div class="header-right">
        <div class="sync-indicator online" id="sync-indicator">
          <span class="sync-dot"></span>Online
        </div>
        <button data-theme-toggle aria-label="Toggle theme" class="theme-toggle" onclick="toggleTheme()">
          ${State.theme === 'dark'
            ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>'
            : '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>'}
        </button>
        <div class="user-menu" id="user-menu-btn">
          <div class="user-avatar">${initials}</div>
          <div class="user-info">
            <span class="user-name">${State.user?.full_name || ''}</span>
            <span class="user-role">${State.user?.role || ''}</span>
          </div>
        </div>
      </div>
    </header>
  `;
}

// ============================================
// MOBILE TAB BAR
// ============================================
function renderMobileTabs() {
  const role = State.user?.role || 'worker';
  const tabs = [
    { id: 'dashboard', label: 'Home', icon: 'dashboard' },
    { id: 'collect', label: 'Collect', icon: 'collect' },
    { id: 'submissions', label: 'Data', icon: 'submissions' },
    { id: 'search', label: 'Search', icon: 'search' },
    { id: 'settings', label: 'More', icon: 'settings' },
  ];
  return `
    <nav class="mobile-tabs">
      ${tabs.map(t => `
        <a class="mobile-tab${State.currentView === t.id ? ' active' : ''}" href="#${t.id}">
          ${icon(t.icon, 22)}
          ${t.label}
        </a>
      `).join('')}
    </nav>
  `;
}

// ============================================
// DASHBOARD VIEW
// ============================================
function renderDashboard() {
  const s = State.stats;
  if (!s) return renderSkeleton();

  return `
    <div class="fade-in">
      <div class="kpi-grid stagger">
        <div class="kpi-card slide-up">
          <div class="kpi-label">Total Submissions</div>
          <div class="kpi-value">${s.total_submissions}</div>
          <div class="kpi-delta positive">${icon('up', 14)} Active collection</div>
        </div>
        <div class="kpi-card slide-up">
          <div class="kpi-label">Active Forms</div>
          <div class="kpi-value">${s.active_forms}</div>
        </div>
        <div class="kpi-card slide-up">
          <div class="kpi-label">Field Workers</div>
          <div class="kpi-value">${s.active_workers}</div>
        </div>
        <div class="kpi-card slide-up">
          <div class="kpi-label">Coverage Areas</div>
          <div class="kpi-value">${s.coverage_areas}</div>
        </div>
      </div>

      <div class="grid-2" style="margin-bottom:var(--space-6)">
        <div class="card">
          <div class="card-header">
            <h3 class="card-title">Submissions Over Time</h3>
          </div>
          <div class="chart-container">
            <canvas id="chart-timeline"></canvas>
          </div>
        </div>
        <div class="card">
          <div class="card-header">
            <h3 class="card-title">By Form</h3>
          </div>
          <div class="chart-container">
            <canvas id="chart-forms"></canvas>
          </div>
        </div>
      </div>

      <div class="grid-2">
        <div class="card">
          <div class="card-header">
            <h3 class="card-title">Recent Submissions</h3>
            <a href="#submissions" class="btn btn-ghost btn-sm">View all</a>
          </div>
          <div class="table-wrapper" style="border:none">
            <table class="data-table">
              <thead><tr>
                <th>Form</th><th>Submitted by</th><th>Location</th><th>Date</th>
              </tr></thead>
              <tbody>
                ${(s.recent_submissions || []).map(r => `
                  <tr>
                    <td>${esc(r.form_name)}</td>
                    <td>${esc(r.submitted_by_name)}</td>
                    <td>${esc(r.location_name || '\u2014')}</td>
                    <td>${formatDate(r.created_at)}</td>
                  </tr>
                `).join('')}
                ${(s.recent_submissions || []).length === 0 ? '<tr><td colspan="4" style="text-align:center;color:var(--color-text-faint)">No submissions yet</td></tr>' : ''}
              </tbody>
            </table>
          </div>
        </div>
        <div class="card">
          <div class="card-header">
            <h3 class="card-title">Top Collectors</h3>
          </div>
          <div class="table-wrapper" style="border:none">
            <table class="data-table">
              <thead><tr>
                <th>Worker</th><th>Area</th><th>Submissions</th>
              </tr></thead>
              <tbody>
                ${(s.top_workers || []).map(w => `
                  <tr>
                    <td>${esc(w.full_name)}</td>
                    <td>${esc(w.area || '\u2014')}</td>
                    <td><span class="badge badge-primary">${w.submission_count}</span></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderSkeleton() {
  return `
    <div class="kpi-grid">
      ${Array(4).fill('<div class="kpi-card"><div class="skeleton skeleton-title"></div><div class="skeleton skeleton-text" style="width:40%"></div></div>').join('')}
    </div>
    <div class="grid-2" style="margin-top:var(--space-6)">
      <div class="card"><div class="skeleton skeleton-card"></div></div>
      <div class="card"><div class="skeleton skeleton-card"></div></div>
    </div>
  `;
}

// ============================================
// FORMS LIST VIEW
// ============================================
function renderForms() {
  return `
    <div class="fade-in">
      <div class="page-header">
        <div>
          <h2>Forms</h2>
          <p>Manage data collection templates</p>
        </div>
        <button class="btn btn-primary" onclick="navigate('form-builder')">
          ${icon('plus', 16)} New Form
        </button>
      </div>
      <div class="table-wrapper">
        <table class="data-table">
          <thead><tr>
            <th>Name</th><th>Fields</th><th>Submissions</th><th>Status</th><th>Updated</th><th>Actions</th>
          </tr></thead>
          <tbody>
            ${State.forms.map(f => `
              <tr>
                <td><strong>${esc(f.name)}</strong><br><span style="font-size:var(--text-xs);color:var(--color-text-faint)">${esc(f.description || '')}</span></td>
                <td>${f.field_count || 0}</td>
                <td><span class="badge badge-primary">${f.submission_count || 0}</span></td>
                <td><span class="badge ${f.status === 'active' ? 'badge-success' : 'badge-neutral'}">${f.status}</span></td>
                <td>${formatDate(f.updated_at)}</td>
                <td style="display:flex;gap:var(--space-1)">
                  <button class="btn btn-ghost btn-sm" onclick="editForm(${f.id})" aria-label="Edit">${icon('edit', 16)}</button>
                  ${State.user?.role === 'admin' ? `<button class="btn btn-ghost btn-sm" onclick="archiveForm(${f.id})" aria-label="Archive">${icon('trash', 16)}</button>` : ''}
                </td>
              </tr>
            `).join('')}
            ${State.forms.length === 0 ? '<tr><td colspan="6"><div class="empty-state">' + icon('forms', 48) + '<h3>No forms yet</h3><p>Create your first data collection form.</p><button class="btn btn-primary" onclick="navigate(\'form-builder\')">Create Form</button></div></td></tr>' : ''}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// ============================================
// FORM BUILDER VIEW
// ============================================
function renderFormBuilder() {
  const fieldTypes = [
    { type: 'text', label: 'Text', icon: 'T' },
    { type: 'number', label: 'Number', icon: '#' },
    { type: 'select', label: 'Dropdown', icon: '\u25be' },
    { type: 'textarea', label: 'Long Text', icon: '\u00b6' },
    { type: 'date', label: 'Date', icon: '\ud83d\udcc5' },
    { type: 'location', label: 'GPS Location', icon: '\ud83d\udccd' },
    { type: 'rating', label: 'Rating 1-5', icon: '\u2605' },
    { type: 'checkbox', label: 'Checkbox', icon: '\u2611' },
  ];

  const selField = State.builderFields.find(f => f.id === State.builderSelectedField);

  return `
    <div class="fade-in">
      <div class="page-header">
        <div>
          <h2>${State.editingFormId ? 'Edit Form' : 'New Form'}</h2>
          <p>Design your data collection template</p>
        </div>
        <div style="display:flex;gap:var(--space-3)">
          <button class="btn btn-secondary" onclick="previewForm()">Preview</button>
          <button class="btn btn-primary" onclick="saveForm()">Save Form</button>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-4);margin-bottom:var(--space-4)">
        <div class="form-group" style="margin-bottom:0">
          <label class="form-label">Form Name</label>
          <input class="form-input" id="builder-name" value="${esc(State.builderFormName)}" placeholder="e.g. Crop Survey 2026" oninput="State.builderFormName=this.value">
        </div>
        <div class="form-group" style="margin-bottom:0">
          <label class="form-label">Description</label>
          <input class="form-input" id="builder-desc" value="${esc(State.builderFormDesc)}" placeholder="Brief description" oninput="State.builderFormDesc=this.value">
        </div>
      </div>

      <div class="form-builder">
        <div class="field-palette">
          <h4>Field Types</h4>
          ${fieldTypes.map(ft => `
            <button class="field-type-btn" onclick="addBuilderField('${ft.type}')">
              <span style="width:20px;text-align:center;font-size:14px">${ft.icon}</span>
              ${ft.label}
            </button>
          `).join('')}
        </div>

        <div class="form-canvas ${State.builderFields.length > 0 ? 'has-fields' : ''}" id="form-canvas">
          ${State.builderFields.length === 0 ? `
            <div class="empty-state" style="padding:var(--space-8)">
              ${icon('plus', 48)}
              <h3>Add fields</h3>
              <p>Click a field type from the left panel to add it to your form.</p>
            </div>
          ` : State.builderFields.map((f, idx) => `
            <div class="canvas-field ${f.id === State.builderSelectedField ? 'selected' : ''}" onclick="selectBuilderField('${f.id}')">
              <div class="canvas-field-info">
                <div class="canvas-field-label">${esc(f.label)}</div>
                <div class="canvas-field-type">${f.type}${f.required ? ' \u00b7 required' : ''}</div>
              </div>
              <div class="canvas-field-actions">
                ${idx > 0 ? `<button onclick="moveBuilderField('${f.id}',-1);event.stopPropagation()" aria-label="Move up">${icon('up', 14)}</button>` : ''}
                ${idx < State.builderFields.length - 1 ? `<button onclick="moveBuilderField('${f.id}',1);event.stopPropagation()" aria-label="Move down">${icon('down', 14)}</button>` : ''}
                <button onclick="removeBuilderField('${f.id}');event.stopPropagation()" aria-label="Remove">${icon('trash', 14)}</button>
              </div>
            </div>
          `).join('')}
        </div>

        <div class="field-properties">
          <h4>Field Properties</h4>
          ${selField ? `
            <div class="form-group">
              <label class="form-label">Label</label>
              <input class="form-input" value="${esc(selField.label)}" oninput="updateBuilderField('${selField.id}','label',this.value)">
            </div>
            <div class="form-group">
              <label class="form-label">Type</label>
              <div class="badge badge-primary" style="font-size:var(--text-sm)">${selField.type}</div>
            </div>
            <div class="form-group">
              <label class="form-check">
                <input type="checkbox" ${selField.required ? 'checked' : ''} onchange="updateBuilderField('${selField.id}','required',this.checked)">
                <span class="form-label" style="margin:0">Required</span>
              </label>
            </div>
            ${selField.type === 'select' ? `
              <div class="form-group">
                <label class="form-label">Options (one per line)</label>
                <textarea class="form-textarea" oninput="updateBuilderField('${selField.id}','options',this.value.split('\\n').filter(Boolean))">${(selField.options || []).join('\n')}</textarea>
              </div>
            ` : ''}
          ` : '<p style="color:var(--color-text-faint);font-size:var(--text-sm)">Select a field to edit its properties</p>'}
        </div>
      </div>
    </div>
  `;
}

// ============================================
// COLLECT DATA VIEW
// ============================================
function renderCollect() {
  const activeForms = State.forms.filter(f => f.status === 'active');

  if (!State.collectFormId) {
    return `
      <div class="fade-in">
        <div class="page-header">
          <div>
            <h2>Collect Data</h2>
            <p>Select a form to begin data collection</p>
          </div>
        </div>
        <div class="kpi-grid">
          ${activeForms.map(f => `
            <div class="card" style="cursor:pointer" onclick="startCollect(${f.id})">
              <h3 class="card-title" style="margin-bottom:var(--space-2)">${esc(f.name)}</h3>
              <p style="font-size:var(--text-sm);color:var(--color-text-muted);margin-bottom:var(--space-3)">${esc(f.description || 'No description')}</p>
              <div style="display:flex;gap:var(--space-3)">
                <span class="badge badge-primary">${f.field_count || 0} fields</span>
                <span class="badge badge-neutral">${f.submission_count || 0} entries</span>
              </div>
            </div>
          `).join('')}
          ${activeForms.length === 0 ? '<div class="empty-state">' + icon('forms', 48) + '<h3>No active forms</h3><p>Ask your admin to create a form first.</p></div>' : ''}
        </div>
      </div>
    `;
  }

  const form = State.forms.find(f => f.id === State.collectFormId);
  if (!form) return '<p>Form not found</p>';
  const fields = form.fields || JSON.parse(form.fields_json || '[]');

  return `
    <div class="fade-in">
      <div class="page-header">
        <div>
          <h2>${esc(form.name)}</h2>
          <p>${esc(form.description || '')}</p>
        </div>
        <button class="btn btn-ghost" onclick="State.collectFormId=null;State.collectData={};render()">
          ${icon('chevronLeft', 16)} Back
        </button>
      </div>
      <div class="collect-form">
        <form id="collect-form">
          ${fields.map(f => renderCollectField(f)).join('')}

          <div class="form-group">
            <label class="form-label">Location Name</label>
            <input class="form-input" id="collect-location-name" placeholder="e.g. Village name, District"
              value="${esc(State.collectData._location_name || '')}">
          </div>

          <div style="display:flex;gap:var(--space-3);margin-top:var(--space-6)">
            <button type="submit" class="btn btn-primary" style="flex:1">Submit</button>
            <button type="button" class="btn btn-secondary" onclick="State.collectFormId=null;State.collectData={};render()">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  `;
}

function renderCollectField(field) {
  const val = State.collectData[field.id] || '';
  const req = field.required ? '<span class="required">*</span>' : '';

  switch (field.type) {
    case 'text':
      return `<div class="collect-field form-group"><label class="form-label">${esc(field.label)}${req}</label>
        <input class="form-input" ${field.required ? 'required' : ''} value="${esc(val)}" oninput="State.collectData['${field.id}']=this.value"></div>`;
    case 'number':
      return `<div class="collect-field form-group"><label class="form-label">${esc(field.label)}${req}</label>
        <input class="form-input" type="number" step="any" ${field.required ? 'required' : ''} value="${esc(val)}" oninput="State.collectData['${field.id}']=this.value"></div>`;
    case 'select':
      return `<div class="collect-field form-group"><label class="form-label">${esc(field.label)}${req}</label>
        <select class="form-select" ${field.required ? 'required' : ''} onchange="State.collectData['${field.id}']=this.value">
          <option value="">Select...</option>
          ${(field.options || []).map(o => `<option value="${esc(o)}" ${val === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}
        </select></div>`;
    case 'textarea':
      return `<div class="collect-field form-group"><label class="form-label">${esc(field.label)}${req}</label>
        <textarea class="form-textarea" ${field.required ? 'required' : ''} oninput="State.collectData['${field.id}']=this.value">${esc(val)}</textarea></div>`;
    case 'date':
      return `<div class="collect-field form-group"><label class="form-label">${esc(field.label)}${req}</label>
        <input class="form-input" type="date" ${field.required ? 'required' : ''} value="${esc(val)}" oninput="State.collectData['${field.id}']=this.value"></div>`;
    case 'rating':
      return `<div class="collect-field form-group"><label class="form-label">${esc(field.label)}${req}</label>
        <div class="rating-group">
          ${[1,2,3,4,5].map(n => `<button type="button" class="rating-btn ${val == n ? 'active' : ''}" onclick="State.collectData['${field.id}']='${n}';render()">${n}</button>`).join('')}
        </div></div>`;
    case 'checkbox':
      return `<div class="collect-field form-group"><label class="form-check">
        <input type="checkbox" ${val === 'true' ? 'checked' : ''} onchange="State.collectData['${field.id}']=this.checked?'true':'false'">
        <span class="form-label" style="margin:0">${esc(field.label)}</span></label></div>`;
    case 'location':
      return `<div class="collect-field form-group"><label class="form-label">${esc(field.label)}${req}</label>
        <div style="display:flex;gap:var(--space-2)">
          <input class="form-input" placeholder="Lat" id="loc-lat-${field.id}" value="${esc((val || '').split(',')[0] || '')}" oninput="updateLocField('${field.id}')" style="flex:1">
          <input class="form-input" placeholder="Lng" id="loc-lng-${field.id}" value="${esc((val || '').split(',')[1] || '')}" oninput="updateLocField('${field.id}')" style="flex:1">
          <button type="button" class="btn btn-secondary btn-sm" onclick="getGPS('${field.id}')">${icon('map', 14)} GPS</button>
        </div></div>`;
    default:
      return `<div class="collect-field form-group"><label class="form-label">${esc(field.label)}${req}</label>
        <input class="form-input" value="${esc(val)}" oninput="State.collectData['${field.id}']=this.value"></div>`;
  }
}

// ============================================
// SUBMISSIONS VIEW
// ============================================
function renderSubmissions() {
  return `
    <div class="fade-in">
      <div class="page-header">
        <div>
          <h2>Submissions</h2>
          <p>${State.submissionTotal} total records</p>
        </div>
        <div style="display:flex;gap:var(--space-3)">
          <button class="btn btn-secondary btn-sm" onclick="exportCSV()">
            ${icon('download', 16)} Export CSV
          </button>
          <button class="btn btn-ghost btn-sm" onclick="loadSubmissions()">
            ${icon('refresh', 16)}
          </button>
        </div>
      </div>

      <div class="filters-bar">
        <select class="form-select" style="width:auto;min-width:160px" onchange="State.submissionFilters.form_id=this.value;State.submissionPage=0;loadSubmissions()">
          <option value="">All Forms</option>
          ${State.forms.map(f => `<option value="${f.id}" ${State.submissionFilters.form_id == f.id ? 'selected' : ''}>${esc(f.name)}</option>`).join('')}
        </select>
      </div>

      <div class="table-wrapper">
        <table class="data-table">
          <thead><tr>
            <th>#</th><th>Form</th><th>Submitted by</th><th>Location</th><th>Date</th><th>Actions</th>
          </tr></thead>
          <tbody>
            ${State.submissions.map(s => `
              <tr>
                <td>${s.id}</td>
                <td>${esc(s.form_name || '')}</td>
                <td>${esc(s.submitted_by_name || '')}</td>
                <td>${esc(s.location_name || '\u2014')}</td>
                <td>${formatDate(s.created_at)}</td>
                <td style="display:flex;gap:var(--space-1)">
                  <button class="btn btn-ghost btn-sm" onclick="viewSubmission(${s.id})" aria-label="View">${icon('eye', 16)}</button>
                  <button class="btn btn-ghost btn-sm" onclick="editSubmission(${s.id})" aria-label="Edit">${icon('edit', 16)}</button>
                  ${['admin','manager'].includes(State.user?.role) ? `<button class="btn btn-ghost btn-sm" onclick="deleteSubmission(${s.id})" aria-label="Delete">${icon('trash', 16)}</button>` : ''}
                </td>
              </tr>
            `).join('')}
            ${State.submissions.length === 0 ? '<tr><td colspan="6" style="text-align:center;padding:var(--space-8);color:var(--color-text-faint)">No submissions found</td></tr>' : ''}
          </tbody>
        </table>
      </div>

      ${renderPagination()}
    </div>
  `;
}

function renderPagination() {
  const total = State.submissionTotal;
  const limit = 50;
  const pages = Math.ceil(total / limit);
  if (pages <= 1) return '';

  return `
    <div class="pagination">
      <button ${State.submissionPage === 0 ? 'disabled' : ''} onclick="State.submissionPage--;loadSubmissions()">${icon('chevronLeft', 16)}</button>
      ${Array.from({ length: Math.min(pages, 7) }, (_, i) => {
        const p = pages <= 7 ? i : (State.submissionPage < 4 ? i : (State.submissionPage > pages - 5 ? pages - 7 + i : State.submissionPage - 3 + i));
        return `<button class="${p === State.submissionPage ? 'active' : ''}" onclick="State.submissionPage=${p};loadSubmissions()">${p + 1}</button>`;
      }).join('')}
      <button ${State.submissionPage >= pages - 1 ? 'disabled' : ''} onclick="State.submissionPage++;loadSubmissions()">${icon('chevronRight', 16)}</button>
    </div>
  `;
}

// ============================================
// SEARCH VIEW
// ============================================
function renderSearch() {
  return `
    <div class="fade-in">
      <div class="page-header">
        <div>
          <h2>Semantic Search</h2>
          <p>Search submissions using natural language</p>
        </div>
      </div>

      <div class="search-box" style="margin-bottom:var(--space-6)">
        <span class="search-icon">${icon('search', 20)}</span>
        <input type="text" id="search-input" placeholder="e.g. rice farmers in drought areas, villages with poor roads..."
          value="${esc(State.searchQuery)}"
          onkeydown="if(event.key==='Enter')performSearch()">
      </div>

      ${State.searchResults.length > 0 ? `
        <p style="font-size:var(--text-sm);color:var(--color-text-muted);margin-bottom:var(--space-4)">${State.searchResults.length} results for "${esc(State.searchQuery)}"</p>
        ${State.searchResults.map(r => `
          <div class="search-result">
            <div class="search-result-header">
              <div>
                <strong>${esc(r.form_name || 'Submission')}</strong>
                <span style="color:var(--color-text-faint);font-size:var(--text-xs);margin-left:var(--space-2)">by ${esc(r.submitted_by_name || '')} \u00b7 ${formatDate(r.created_at)}</span>
              </div>
              <span class="relevance-score">${(r.relevance_score * 100).toFixed(0)}%</span>
            </div>
            <div class="search-result-fields">
              ${Object.entries(r.data || {}).map(([k, v]) => `
                <div>
                  <div class="result-field-name">${esc(k)}</div>
                  <div class="result-field-value ${(r.matching_fields || []).includes(k) ? 'highlight' : ''}">${esc(String(v))}</div>
                </div>
              `).join('')}
            </div>
          </div>
        `).join('')}
      ` : State.searchQuery ? '<div class="empty-state">' + icon('search', 48) + '<h3>No results</h3><p>Try different search terms.</p></div>' : `
        <div class="empty-state">
          ${icon('search', 48)}
          <h3>Search your data</h3>
          <p>Type a query and press Enter to find matching submissions across all forms.</p>
        </div>
      `}
    </div>
  `;
}

// ============================================
// CORRELATIONS VIEW
// ============================================
function renderCorrelations() {
  return `
    <div class="fade-in">
      <div class="page-header">
        <div>
          <h2>Pattern Discovery</h2>
          <p>Auto-discovered correlations between fields</p>
        </div>
        <button class="btn btn-primary" onclick="discoverCorrelations()">
          ${icon('refresh', 16)} Discover Patterns
        </button>
      </div>

      ${State.correlations.length > 0 ? `
        <div class="kpi-grid" style="grid-template-columns:repeat(auto-fill,minmax(320px,1fr))">
          ${State.correlations.map(c => {
            const absScore = Math.abs(c.correlation_score);
            const strength = absScore > 0.6 ? 'high' : absScore > 0.3 ? 'medium' : 'low';
            const strengthLabel = absScore > 0.6 ? 'Strong' : absScore > 0.3 ? 'Moderate' : 'Weak';
            return `
              <div class="correlation-card">
                <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:var(--space-2)">
                  <div>
                    <span class="badge badge-primary">${esc(c.field_a)}</span>
                    <span style="margin:0 var(--space-2);color:var(--color-text-faint)">↔</span>
                    <span class="badge badge-primary">${esc(c.field_b)}</span>
                  </div>
                  <span class="badge ${strength === 'high' ? 'badge-success' : strength === 'medium' ? 'badge-warning' : 'badge-neutral'}">${strengthLabel}</span>
                </div>
                <div class="correlation-strength strength-${strength}">
                  <div class="correlation-strength-fill" style="width:${absScore * 100}%"></div>
                </div>
                <p style="font-size:var(--text-sm);color:var(--color-text-muted);margin-top:var(--space-2)">${esc(c.pattern_description)}</p>
                <div style="font-size:var(--text-xs);color:var(--color-text-faint);margin-top:var(--space-2)">Score: ${c.correlation_score.toFixed(4)} \u00b7 Sample: ${c.sample_size}</div>
              </div>
            `;
          }).join('')}
        </div>
      ` : `
        <div class="empty-state">
          ${icon('correlations', 48)}
          <h3>No patterns discovered yet</h3>
          <p>Click "Discover Patterns" to analyze relationships between your data fields.</p>
        </div>
      `}
    </div>
  `;
}

// ============================================
// USERS VIEW
// ============================================
function renderUsers() {
  if (!['admin', 'manager'].includes(State.user?.role)) {
    return '<div class="empty-state"><h3>Access denied</h3></div>';
  }
  return `
    <div class="fade-in">
      <div class="page-header">
        <div>
          <h2>Users</h2>
          <p>Manage field workers and supervisors</p>
        </div>
        <button class="btn btn-primary" onclick="showAddUserModal()">
          ${icon('plus', 16)} Add User
        </button>
      </div>
      <div class="table-wrapper">
        <table class="data-table">
          <thead><tr>
            <th>Name</th><th>Username</th><th>Role</th><th>Region</th><th>Area</th><th>Status</th><th>Actions</th>
          </tr></thead>
          <tbody>
            ${State.usersList.map(u => `
              <tr>
                <td><strong>${esc(u.full_name)}</strong></td>
                <td>${esc(u.username)}</td>
                <td><span class="badge ${u.role === 'admin' ? 'badge-error' : u.role === 'manager' ? 'badge-warning' : u.role === 'supervisor' ? 'badge-primary' : 'badge-neutral'}">${u.role}</span></td>
                <td>${esc(u.region || '\u2014')}</td>
                <td>${esc(u.area || '\u2014')}</td>
                <td><span class="badge ${u.status === 'active' ? 'badge-success' : 'badge-neutral'}">${u.status}</span></td>
                <td>
                  ${State.user?.role === 'admin' && u.id !== State.user.id ? `
                    <button class="btn btn-ghost btn-sm" onclick="toggleUserStatus(${u.id}, '${u.status === 'active' ? 'inactive' : 'active'}')">${u.status === 'active' ? 'Deactivate' : 'Activate'}</button>
                  ` : '\u2014'}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// ============================================
// SETTINGS VIEW
// ============================================
function renderSettings() {
  return `
    <div class="fade-in">
      <div class="page-header">
        <div>
          <h2>Settings</h2>
          <p>Profile and application settings</p>
        </div>
      </div>
      <div class="card" style="max-width:640px">
        <h3 class="card-title" style="margin-bottom:var(--space-4)">Profile</h3>
        <div class="form-group">
          <label class="form-label">Full Name</label>
          <input class="form-input" value="${esc(State.user?.full_name || '')}" disabled>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Role</label>
            <input class="form-input" value="${esc(State.user?.role || '')}" disabled>
          </div>
          <div class="form-group">
            <label class="form-label">Region</label>
            <input class="form-input" value="${esc(State.user?.region || '\u2014')}" disabled>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Area</label>
          <input class="form-input" value="${esc(State.user?.area || '\u2014')}" disabled>
        </div>
        <hr style="border:none;border-top:1px solid var(--color-divider);margin:var(--space-6) 0">
        <h3 class="card-title" style="margin-bottom:var(--space-4)">Appearance</h3>
        <div class="form-group">
          <label class="form-label">Theme</label>
          <div style="display:flex;gap:var(--space-3)">
            <button class="btn ${State.theme === 'light' ? 'btn-primary' : 'btn-secondary'}" onclick="State.theme='light';document.documentElement.setAttribute('data-theme','light')">Light</button>
            <button class="btn ${State.theme === 'dark' ? 'btn-primary' : 'btn-secondary'}" onclick="State.theme='dark';document.documentElement.setAttribute('data-theme','dark')">Dark</button>
          </div>
        </div>
        <hr style="border:none;border-top:1px solid var(--color-divider);margin:var(--space-6) 0">
        <h3 class="card-title" style="margin-bottom:var(--space-4)">Sync Status</h3>
        <p style="font-size:var(--text-sm);color:var(--color-text-muted)">
          Pending items: <strong>${State.pendingQueue.length}</strong>
        </p>
        ${State.pendingQueue.length > 0 ? `<button class="btn btn-primary btn-sm" onclick="syncPending()" style="margin-top:var(--space-3)">Sync Now</button>` : ''}
        <hr style="border:none;border-top:1px solid var(--color-divider);margin:var(--space-6) 0">
        <button class="btn btn-danger" onclick="logout()">Sign Out</button>
      </div>
    </div>
  `;
}

// ============================================
// MODALS
// ============================================
function renderModals() {
  return `
    <div class="modal-overlay" id="modal-overlay">
      <div class="modal" id="modal-content"></div>
    </div>
  `;
}

function showModal(content, wide = false) {
  const overlay = document.getElementById('modal-overlay');
  const modal = document.getElementById('modal-content');
  if (!overlay || !modal) return;
  modal.className = `modal${wide ? ' wide' : ''}`;
  modal.innerHTML = content;
  overlay.classList.add('active');
}

function hideModal() {
  const overlay = document.getElementById('modal-overlay');
  if (overlay) overlay.classList.remove('active');
}

function showAddUserModal() {
  showModal(`
    <div class="modal-header">
      <h3>Add User</h3>
      <button class="btn btn-icon" onclick="hideModal()" aria-label="Close">${icon('close')}</button>
    </div>
    <div class="modal-body">
      <form id="add-user-form">
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Full Name<span class="required">*</span></label>
            <input class="form-input" id="new-user-name" required>
          </div>
          <div class="form-group">
            <label class="form-label">Username<span class="required">*</span></label>
            <input class="form-input" id="new-user-username" required>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Password<span class="required">*</span></label>
            <input class="form-input" type="password" id="new-user-password" required>
          </div>
          <div class="form-group">
            <label class="form-label">Role<span class="required">*</span></label>
            <select class="form-select" id="new-user-role" required>
              <option value="worker">Worker</option>
              <option value="supervisor">Supervisor</option>
              ${State.user?.role === 'admin' ? '<option value="manager">Manager</option>' : ''}
            </select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Region</label>
            <input class="form-input" id="new-user-region" value="${esc(State.user?.region || '')}">
          </div>
          <div class="form-group">
            <label class="form-label">Area</label>
            <input class="form-input" id="new-user-area">
          </div>
        </div>
      </form>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="hideModal()">Cancel</button>
      <button class="btn btn-primary" onclick="addUser()">Add User</button>
    </div>
  `);
}

// ============================================
// DATA ACTIONS
// ============================================

async function login(username, password) {
  const btn = document.getElementById('login-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Signing in...'; }
  try {
    const res = await api('/auth/login', { method: 'POST', body: { username, password } });
    if (res && res.user) {
      State.user = res.user;
      navigate('dashboard');
      loadInitialData();
      showToast(`Welcome, ${res.user.full_name}`, 'success');
    } else {
      showToast('Invalid response from server', 'error');
      if (btn) { btn.disabled = false; btn.textContent = 'Sign In'; }
    }
  } catch (err) {
    showToast(err.message || 'Login failed', 'error');
    if (btn) { btn.disabled = false; btn.textContent = 'Sign In'; }
  }
}

function logout() {
  State.user = null;
  State.forms = [];
  State.submissions = [];
  State.stats = null;
  State.usersList = [];
  navigate('login');
}

async function loadInitialData() {
  try {
    const [statsRes, formsRes] = await Promise.all([
      api('/stats'),
      api('/forms', { params: { status: 'all' } })
    ]);
    State.stats = statsRes;
    State.forms = formsRes.forms || [];
    render();
    initCharts();
    updateSyncIndicator();
  } catch (err) {
    showToast('Error loading data: ' + err.message, 'error');
  }
}

async function loadSubmissions() {
  try {
    const params = {
      limit: '50',
      offset: String(State.submissionPage * 50),
    };
    if (State.submissionFilters.form_id) params.form_id = State.submissionFilters.form_id;
    if (State.submissionFilters.worker_id) params.worker_id = State.submissionFilters.worker_id;

    const res = await api('/submissions', { params });
    State.submissions = res.submissions || [];
    State.submissionTotal = res.total || 0;
    render();
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

async function performSearch() {
  const input = document.getElementById('search-input');
  const q = input?.value?.trim();
  if (!q) return;
  State.searchQuery = q;
  try {
    const res = await api('/search', { params: { q } });
    State.searchResults = res.results || [];
    render();
  } catch (err) {
    showToast('Search error: ' + err.message, 'error');
  }
}

async function discoverCorrelations() {
  try {
    showToast('Analyzing patterns...', 'info');
    const res = await api('/correlations/discover', { method: 'POST', body: {} });
    State.correlations = res.correlations || [];
    showToast(`Found ${res.count} patterns`, 'success');
    render();
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

async function loadCorrelations() {
  try {
    const res = await api('/correlations');
    State.correlations = res.correlations || [];
  } catch { /* silent */ }
}

async function loadUsers() {
  try {
    const res = await api('/users');
    State.usersList = res.users || [];
  } catch { /* silent */ }
}

// Form builder actions
function addBuilderField(type) {
  const id = 'f' + Date.now();
  const labels = { text: 'Text Field', number: 'Number Field', select: 'Dropdown', textarea: 'Long Text', date: 'Date', location: 'GPS Location', rating: 'Rating', checkbox: 'Checkbox' };
  State.builderFields.push({ id, type, label: labels[type] || type, required: false, options: type === 'select' ? ['Option 1', 'Option 2'] : [] });
  State.builderSelectedField = id;
  render();
}

function selectBuilderField(id) {
  State.builderSelectedField = id;
  render();
}

function removeBuilderField(id) {
  State.builderFields = State.builderFields.filter(f => f.id !== id);
  if (State.builderSelectedField === id) State.builderSelectedField = null;
  render();
}

function moveBuilderField(id, dir) {
  const idx = State.builderFields.findIndex(f => f.id === id);
  if (idx < 0) return;
  const newIdx = idx + dir;
  if (newIdx < 0 || newIdx >= State.builderFields.length) return;
  const temp = State.builderFields[idx];
  State.builderFields[idx] = State.builderFields[newIdx];
  State.builderFields[newIdx] = temp;
  render();
}

function updateBuilderField(id, prop, value) {
  const f = State.builderFields.find(f => f.id === id);
  if (f) f[prop] = value;
  // Don't re-render on every keystroke for label
  if (prop !== 'label') render();
}

async function saveForm() {
  const name = State.builderFormName.trim();
  if (!name) { showToast('Form name required', 'error'); return; }
  if (State.builderFields.length === 0) { showToast('Add at least one field', 'error'); return; }

  try {
    if (State.editingFormId) {
      await api('/forms', {
        method: 'PUT',
        params: { id: State.editingFormId },
        body: { name, description: State.builderFormDesc, fields: State.builderFields }
      });
      showToast('Form updated', 'success');
    } else {
      await api('/forms', {
        method: 'POST',
        body: { name, description: State.builderFormDesc, fields: State.builderFields }
      });
      showToast('Form created', 'success');
    }
    // Reset builder
    State.builderFields = [];
    State.builderSelectedField = null;
    State.builderFormName = '';
    State.builderFormDesc = '';
    State.editingFormId = null;
    // Reload forms
    const formsRes = await api('/forms', { params: { status: 'all' } });
    State.forms = formsRes.forms || [];
    navigate('forms');
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

async function editForm(id) {
  try {
    const form = await api('/forms', { params: { id } });
    State.editingFormId = form.id;
    State.builderFormName = form.name;
    State.builderFormDesc = form.description || '';
    State.builderFields = form.fields || JSON.parse(form.fields_json || '[]');
    State.builderSelectedField = null;
    navigate('form-builder');
  } catch (err) {
    showToast('Error loading form: ' + err.message, 'error');
  }
}

async function archiveForm(id) {
  if (!confirm('Archive this form?')) return;
  try {
    await api('/forms', { method: 'DELETE', params: { id } });
    showToast('Form archived', 'success');
    const formsRes = await api('/forms', { params: { status: 'all' } });
    State.forms = formsRes.forms || [];
    render();
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

function previewForm() {
  if (State.builderFields.length === 0) { showToast('Add fields first', 'error'); return; }
  const content = `
    <div class="modal-header">
      <h3>Preview: ${esc(State.builderFormName || 'Untitled')}</h3>
      <button class="btn btn-icon" onclick="hideModal()" aria-label="Close">${icon('close')}</button>
    </div>
    <div class="modal-body">
      ${State.builderFields.map(f => renderCollectField(f)).join('')}
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="hideModal()">Close Preview</button>
    </div>
  `;
  showModal(content, true);
}

// Collect actions
function startCollect(formId) {
  State.collectFormId = formId;
  State.collectData = {};
  render();
}

function updateLocField(fieldId) {
  const lat = document.getElementById('loc-lat-' + fieldId)?.value || '';
  const lng = document.getElementById('loc-lng-' + fieldId)?.value || '';
  State.collectData[fieldId] = `${lat},${lng}`;
}

function getGPS(fieldId) {
  if (!navigator.geolocation) { showToast('GPS not available', 'error'); return; }
  navigator.geolocation.getCurrentPosition(
    pos => {
      const lat = pos.coords.latitude.toFixed(6);
      const lng = pos.coords.longitude.toFixed(6);
      State.collectData[fieldId] = `${lat},${lng}`;
      render();
    },
    () => showToast('GPS access denied', 'error')
  );
}

async function submitCollect(e) {
  e.preventDefault();
  const locName = document.getElementById('collect-location-name')?.value || '';

  try {
    const result = await api('/submissions', {
      method: 'POST',
      body: {
        form_id: State.collectFormId,
        data: { ...State.collectData },
        location_name: locName,
        location_lat: 0,
        location_lng: 0,
      }
    });
    if (result.offline) {
      State.collectData = {};
      render();
      return;
    }
    showToast('Submission saved', 'success');
    State.collectData = {};
    State.collectFormId = null;
    // Refresh stats
    try { State.stats = await api('/stats'); } catch {}
    render();
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

// Submission actions
async function viewSubmission(id) {
  try {
    const sub = await api('/submissions', { params: { id } });
    const form = State.forms.find(f => f.id === sub.form_id);
    const fields = form?.fields || JSON.parse(form?.fields_json || '[]');
    const data = sub.data || JSON.parse(sub.data_json || '{}');

    showModal(`
      <div class="modal-header">
        <h3>Submission #${sub.id}</h3>
        <button class="btn btn-icon" onclick="hideModal()" aria-label="Close">${icon('close')}</button>
      </div>
      <div class="modal-body">
        <div style="display:flex;gap:var(--space-4);margin-bottom:var(--space-4);font-size:var(--text-sm);color:var(--color-text-muted)">
          <span>Form: <strong>${esc(sub.form_name || '')}</strong></span>
          <span>By: <strong>${esc(sub.submitted_by_name || '')}</strong></span>
          <span>${formatDate(sub.created_at)}</span>
        </div>
        ${sub.location_name ? `<div style="font-size:var(--text-sm);color:var(--color-text-muted);margin-bottom:var(--space-4)">${icon('map', 14)} ${esc(sub.location_name)}</div>` : ''}
        <div style="display:grid;gap:var(--space-3)">
          ${Object.entries(data).map(([k, v]) => {
            const field = fields.find(f => f.id === k);
            return `<div style="border-bottom:1px solid var(--color-divider);padding-bottom:var(--space-2)">
              <div style="font-size:var(--text-xs);color:var(--color-text-faint);font-weight:600">${esc(field?.label || k)}</div>
              <div style="font-size:var(--text-sm)">${esc(String(v))}</div>
            </div>`;
          }).join('')}
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="hideModal()">Close</button>
      </div>
    `, true);
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

async function editSubmission(id) {
  try {
    const sub = await api('/submissions', { params: { id } });
    const form = State.forms.find(f => f.id === sub.form_id);
    const fields = form?.fields || JSON.parse(form?.fields_json || '[]');
    const data = sub.data || JSON.parse(sub.data_json || '{}');

    State.editingSubmission = { ...sub, data };

    showModal(`
      <div class="modal-header">
        <h3>Edit Submission #${sub.id}</h3>
        <button class="btn btn-icon" onclick="hideModal()" aria-label="Close">${icon('close')}</button>
      </div>
      <div class="modal-body">
        <form id="edit-submission-form">
          ${fields.map(f => {
            const val = data[f.id] || '';
            return `<div class="form-group">
              <label class="form-label">${esc(f.label)}</label>
              ${f.type === 'textarea'
                ? `<textarea class="form-textarea" data-field="${f.id}">${esc(val)}</textarea>`
                : f.type === 'select'
                  ? `<select class="form-select" data-field="${f.id}"><option value="">Select...</option>${(f.options || []).map(o => `<option value="${esc(o)}" ${val === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`
                  : `<input class="form-input" data-field="${f.id}" value="${esc(String(val))}" type="${f.type === 'number' ? 'number' : 'text'}">`
              }
            </div>`;
          }).join('')}
        </form>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="hideModal()">Cancel</button>
        <button class="btn btn-primary" onclick="saveSubmissionEdit(${sub.id})">Save</button>
      </div>
    `, true);
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

async function saveSubmissionEdit(id) {
  const form = document.getElementById('edit-submission-form');
  if (!form) return;
  const data = {};
  form.querySelectorAll('[data-field]').forEach(el => {
    data[el.dataset.field] = el.value;
  });

  try {
    await api('/submissions', { method: 'PUT', params: { id }, body: { data } });
    hideModal();
    showToast('Submission updated', 'success');
    loadSubmissions();
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

async function deleteSubmission(id) {
  if (!confirm('Delete this submission? This cannot be undone.')) return;
  try {
    await api('/submissions', { method: 'DELETE', params: { id } });
    showToast('Submission deleted', 'success');
    loadSubmissions();
    try { State.stats = await api('/stats'); } catch {}
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

async function addUser() {
  const name = document.getElementById('new-user-name')?.value?.trim();
  const username = document.getElementById('new-user-username')?.value?.trim();
  const password = document.getElementById('new-user-password')?.value;
  const role = document.getElementById('new-user-role')?.value;
  const region = document.getElementById('new-user-region')?.value?.trim();
  const area = document.getElementById('new-user-area')?.value?.trim();

  if (!name || !username || !password) { showToast('Fill all required fields', 'error'); return; }

  try {
    await api('/users', { method: 'POST', body: { full_name: name, username, password, role, region, area } });
    hideModal();
    showToast('User created', 'success');
    await loadUsers();
    render();
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

async function toggleUserStatus(id, status) {
  try {
    if (status === 'inactive') {
      await api('/users', { method: 'DELETE', params: { id } });
    } else {
      await api('/users', { method: 'PUT', params: { id }, body: { status } });
    }
    showToast('User updated', 'success');
    await loadUsers();
    render();
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

// Export CSV
function exportCSV() {
  if (State.submissions.length === 0) { showToast('No data to export', 'error'); return; }
  const allKeys = new Set();
  State.submissions.forEach(s => {
    const data = s.data || {};
    Object.keys(data).forEach(k => allKeys.add(k));
  });
  const headers = ['id', 'form_name', 'submitted_by_name', 'location_name', 'created_at', ...Array.from(allKeys)];
  const rows = State.submissions.map(s => {
    const data = s.data || {};
    return headers.map(h => {
      if (h in s) return String(s[h] || '');
      if (h in data) return String(data[h] || '');
      return '';
    });
  });

  let csv = headers.map(h => `"${h}"`).join(',') + '\n';
  rows.forEach(r => { csv += r.map(v => `"${v.replace(/"/g, '""')}"`).join(',') + '\n'; });

  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `krishidata_export_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('CSV exported', 'success');
}

// ============================================
// CHARTS
// ============================================
function initCharts() {
  if (!State.stats || typeof Chart === 'undefined') return;
  // Destroy existing
  Object.values(State.chartInstances).forEach(c => c.destroy());
  State.chartInstances = {};

  const s = State.stats;

  // Timeline chart
  const timelineCanvas = document.getElementById('chart-timeline');
  if (timelineCanvas) {
    const isDark = State.theme === 'dark';
    const gridColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
    const textColor = isDark ? '#797876' : '#7a7974';

    State.chartInstances.timeline = new Chart(timelineCanvas, {
      type: 'line',
      data: {
        labels: (s.daily_submissions || []).map(d => d.date?.slice(5) || ''),
        datasets: [{
          label: 'Submissions',
          data: (s.daily_submissions || []).map(d => d.count),
          borderColor: isDark ? '#4f98a3' : '#01696f',
          backgroundColor: isDark ? 'rgba(79,152,163,0.1)' : 'rgba(1,105,111,0.1)',
          fill: true,
          tension: 0.4,
          pointRadius: 4,
          pointHoverRadius: 6,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { color: gridColor }, ticks: { color: textColor, font: { size: 11 } } },
          y: { beginAtZero: true, grid: { color: gridColor }, ticks: { color: textColor, font: { size: 11 }, stepSize: 1 } }
        }
      }
    });
  }

  // Forms chart
  const formsCanvas = document.getElementById('chart-forms');
  if (formsCanvas) {
    const isDark = State.theme === 'dark';
    const colors = isDark
      ? ['#4f98a3', '#bb653b', '#6daa45', '#a86fdf', '#e8af34']
      : ['#01696f', '#964219', '#437a22', '#7a39bb', '#d19900'];

    State.chartInstances.forms = new Chart(formsCanvas, {
      type: 'doughnut',
      data: {
        labels: (s.submissions_by_form || []).map(f => f.name),
        datasets: [{
          data: (s.submissions_by_form || []).map(f => f.count),
          backgroundColor: colors,
          borderWidth: 2,
          borderColor: isDark ? '#1c1b19' : '#f9f8f5',
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: { color: isDark ? '#cdccca' : '#28251d', font: { size: 12 }, padding: 16 }
          }
        }
      }
    });
  }
}

// ============================================
// BIND EVENTS
// ============================================
function bindEvents() {
  // Login form
  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const u = document.getElementById('username').value;
      const p = document.getElementById('password').value;
      login(u, p);
    });
  }

  // Collect form
  const collectForm = document.getElementById('collect-form');
  if (collectForm) {
    collectForm.addEventListener('submit', submitCollect);
  }

  // Mobile menu
  const menuBtn = document.getElementById('mobile-menu-btn');
  if (menuBtn) {
    menuBtn.addEventListener('click', () => {
      State.sidebarOpen = !State.sidebarOpen;
      const sidebar = document.getElementById('sidebar');
      const overlay = document.getElementById('sidebar-overlay');
      if (sidebar) sidebar.classList.toggle('open', State.sidebarOpen);
      if (overlay) overlay.classList.toggle('active', State.sidebarOpen);
    });
  }

  // Sidebar overlay close
  const sidebarOverlay = document.getElementById('sidebar-overlay');
  if (sidebarOverlay) {
    sidebarOverlay.addEventListener('click', () => {
      State.sidebarOpen = false;
      const sidebar = document.getElementById('sidebar');
      if (sidebar) sidebar.classList.remove('open');
      sidebarOverlay.classList.remove('active');
    });
  }

  // Sidebar collapse
  const collapseBtn = document.getElementById('sidebar-collapse-btn');
  if (collapseBtn) {
    collapseBtn.addEventListener('click', () => {
      State.sidebarCollapsed = !State.sidebarCollapsed;
      const shell = document.getElementById('app-shell');
      if (shell) {
        shell.classList.toggle('sidebar-collapsed', State.sidebarCollapsed);
      }
      collapseBtn.innerHTML = State.sidebarCollapsed ? icon('chevronRight') : icon('chevronLeft');
    });
  }

  // Modal close on overlay click
  const modalOverlay = document.getElementById('modal-overlay');
  if (modalOverlay) {
    modalOverlay.addEventListener('click', (e) => {
      if (e.target === modalOverlay) hideModal();
    });
  }

  // User menu logout on click
  const userMenuBtn = document.getElementById('user-menu-btn');
  if (userMenuBtn) {
    userMenuBtn.addEventListener('click', () => {
      if (confirm('Sign out?')) logout();
    });
  }

  // Sidebar nav click close on mobile
  document.querySelectorAll('.sidebar-link').forEach(link => {
    link.addEventListener('click', () => {
      if (window.innerWidth <= 768) {
        State.sidebarOpen = false;
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('sidebar-overlay');
        if (sidebar) sidebar.classList.remove('open');
        if (overlay) overlay.classList.remove('active');
      }
    });
  });
}

// ============================================
// AFTER RENDER — load data per view
// ============================================
function afterRender() {
  updateSyncIndicator();

  switch (State.currentView) {
    case 'dashboard':
      if (!State.stats) loadInitialData();
      else initCharts();
      break;
    case 'submissions':
      if (State.submissions.length === 0 || true) loadSubmissions();
      break;
    case 'correlations':
      if (State.correlations.length === 0) loadCorrelations().then(() => render());
      break;
    case 'users':
      if (State.usersList.length === 0) loadUsers().then(() => render());
      break;
    case 'forms':
      // forms already loaded
      break;
  }
}

// ============================================
// UTILITIES
// ============================================
function esc(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

function formatDate(dateStr) {
  if (!dateStr) return '\u2014';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

// ============================================
// INIT
// ============================================
function init() {
  initTheme();
  initConnectivity();

  // Register service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }

  initRouter();
}

document.addEventListener('DOMContentLoaded', init);
