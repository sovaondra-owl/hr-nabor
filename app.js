(function () {
  let API_BASE = window.API_BASE || 'http://localhost:3001';
  if (!API_BASE || API_BASE.startsWith('/')) API_BASE = 'http://localhost:3001';
  const supabaseClient = window.supabaseClient || null;
  let currentUser = null;
  let positions = [];
  let openings = [];
  let candidates = [];
  let applications = [];
  let currentApplicationId = null;
  let sortColumn = null;
  let sortDirection = 'asc';
  let watchOnly = false; // pokud true, ve výpise kandidátů zobrazujeme jen sledované
  const CANDIDATES_PAGE_SIZE = 100;
  let candidatesTablePage = 1;

  function getAuthHeaders() {
    const token = localStorage.getItem('sessionToken');
    const h = { 'Content-Type': 'application/json' };
    if (token) h['Authorization'] = 'Bearer ' + token;
    return h;
  }
  // Původní API klient k Node backendu zůstává pro případné budoucí použití,
  // ale autentizaci nyní řeší Supabase.
  async function apiGet(path) {
    const res = await fetch(API_BASE + path, { credentials: 'include', headers: getAuthHeaders() });
    return res;
  }
  async function apiPost(path, body) {
    const res = await fetch(API_BASE + path, {
      method: 'POST',
      credentials: 'include',
      headers: getAuthHeaders(),
      body: JSON.stringify(body || {}),
    });
    return res;
  }
  async function apiDelete(path) {
    const res = await fetch(API_BASE + path, {
      method: 'DELETE',
      credentials: 'include',
      headers: getAuthHeaders(),
    });
    return res;
  }
  function can(permission) {
    if (!currentUser) return false;
    const role = currentUser.role;
    const rules = {
      usersAndInvites: ['admin'],
      positions: ['admin', 'manager'],
      importExport: ['admin', 'manager'],
      editOpenings: ['admin', 'manager'],
      editCandidates: ['admin', 'manager', 'recruiter'],
    };
    const allowed = rules[permission];
    return allowed ? allowed.includes(role) : true;
  }

  const TW = {
    badge: 'inline-block px-2.5 py-0.5 rounded-full text-[11px] font-semibold',
    badgeStage: 'bg-indigo-50 text-indigo-600',
    badgePrijat: 'bg-emerald-50 text-emerald-600',
    badgeZamitnut: 'bg-slate-100 text-slate-500',
    badgeOpen: 'bg-emerald-50 text-emerald-600',
    badgeClosed: 'bg-slate-100 text-slate-500',
    badgeSuccess: 'bg-emerald-50 text-emerald-600',
    btn: 'px-3 py-1.5 rounded-lg text-sm font-medium transition-all cursor-pointer',
    btnPrimary: 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-[0_2px_10px_-3px_rgba(79,70,229,0.5)]',
    btnSecondary: 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 shadow-sm',
    btnDanger: 'bg-red-50 text-red-600 hover:bg-red-100 border border-red-100',
    btnSmall: 'px-2.5 py-1 text-xs',
    th: 'text-left px-3 py-2.5 text-[10px] font-semibold text-slate-500 uppercase tracking-wider',
    td: 'px-3 py-1.5 text-sm whitespace-nowrap',
    input: 'w-full border border-slate-200 rounded-lg text-sm py-2 px-3 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400'
  };

  function badgeClass(stage) {
    if (stage === 'prijat') return `${TW.badge} ${TW.badgePrijat}`;
    if (stage === 'zamitnut') return `${TW.badge} ${TW.badgeZamitnut}`;
    return `${TW.badge} ${TW.badgeStage}`;
  }

  function excelDateToString(val) {
    if (!val) return '';
    const s = String(val).trim();
    const num = Number(s);
    if (!isNaN(num) && num > 30000 && num < 60000) {
      const d = new Date((num - 25569) * 86400000);
      if (!isNaN(d.getTime())) return d.toLocaleDateString('cs-CZ');
    }
    return s;
  }

  /** Vrátí Date z prvniInterakce (Excel číslo nebo řetězec data), jinak null. */
  function parseFirstInteractionDate(val) {
    if (val == null || val === '') return null;
    const s = String(val).trim();
    const num = Number(s);
    if (!isNaN(num) && num > 30000 && num < 60000) {
      const d = new Date((num - 25569) * 86400000);
      if (!isNaN(d.getTime())) return d;
    }
    const parsed = new Date(s);
    return isNaN(parsed.getTime()) ? null : parsed;
  }

  /** Z řetězce platu (40k, 40000, 40-45k) vrátí číslo pro srovnání, nebo null. */
  function parseSalaryToNumber(val) {
    if (val == null || val === '') return null;
    const s = String(val).trim().replace(/\s/g, '');
    const num = parseInt(s, 10);
    if (!isNaN(num)) return num;
    const match = s.match(/(\d+)\s*k?\s*[-–]\s*(\d+)\s*k?/i) || s.match(/(\d+)\s*k/i);
    if (match) return parseInt(match[1], 10);
    return null;
  }

  function extractEmails(text) {
    if (!text || typeof text !== 'string') return [];
    const regex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const matches = text.match(regex) || [];
    return [...new Set(matches.map(m => m.trim()))];
  }

  function extractPhones(text) {
    if (!text || typeof text !== 'string') return [];
    let clean = text.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi, ' ');
    clean = clean.replace(/(^|[\s,;])(email|e-mail|telefon|telefonní\s*číslo|tel|phone|t):\s*/gi, '$1');
    clean = clean.replace(/\bt\+/gi, '+');
    const regex = /\+?[\d][\d\s\-\.]{7,}/g;
    const matches = clean.match(regex) || [];
    const phones = matches.map(m => {
      const digits = m.replace(/[^\d+]/g, '');
      if (digits.length >= 9) {
        const hasPlus = m.trim().startsWith('+');
        const num = digits.replace(/^\+/, '');
        return (hasPlus ? '+' : '') + num;
      }
      return null;
    }).filter(Boolean);
    const normalized = phones.map(p => {
      if (p.startsWith('+420') && p.length >= 13) return p.slice(4);
      if (p.startsWith('420') && p.length >= 12) return p.slice(3);
      return p;
    });
    return [...new Set(normalized)];
  }

  function splitContactField(raw) {
    if (!raw) return { emails: [], phones: [] };
    const emails = extractEmails(raw);
    const phones = extractPhones(raw);
    return { emails, phones };
  }

  function isEmail(s) { return s && /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(s); }

  function copyIcon() {
    return `<svg class="w-3.5 h-3.5 inline-block ml-1 text-slate-300 hover:text-indigo-500 cursor-pointer copy-btn transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>`;
  }

  function renderCopyable(value) {
    if (!value || value === '—') return '—';
    return `<span class="inline-flex items-center gap-0.5"><span>${escapeHtml(value)}</span><span class="copy-trigger" data-copy="${escapeHtml(value)}" title="Kopírovat">${copyIcon()}</span></span>`;
  }

  function compactStageSelectClass(stage) {
    if (stage === 'zamitnut') return 'bg-slate-100 text-slate-600 border-slate-200';
    if (stage === 'prijat') return 'bg-emerald-50 text-emerald-700 border-emerald-100';
    if (['kolo1', 'kolo2', 'nabidka'].includes(stage)) return 'bg-violet-50 text-violet-700 border-violet-100';
    if (['telefonat', 'ukol'].includes(stage)) return 'bg-sky-50 text-sky-700 border-sky-100';
    return 'bg-indigo-50 text-indigo-700 border-indigo-100';
  }

  function renderStageSelect(c) {
    const isKnown = c.stage in STAGE_LABELS;
    let opts = Object.entries(STAGE_LABELS).map(([key, label]) =>
      `<option value="${key}" ${c.stage === key ? 'selected' : ''}>${escapeHtml(label)}</option>`
    ).join('');
    if (!isKnown && c.stage) {
      opts = `<option value="${escapeHtml(c.stage)}" selected>⚠ ${escapeHtml(c.stage)}</option>` + opts;
    }
    const stageClass = compactStageSelectClass(c.stage);
    return `<select class="stage-select compact-select appearance-none text-[11px] font-bold px-2 py-0.5 rounded border pr-5 cursor-pointer focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-indigo-300 transition-colors min-w-[100px] ${stageClass}" data-id="${c.id}" style="background-image:url('data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 fill=%22none%22 viewBox=%220 0 24 24%22 stroke-width=%222.5%22 stroke=%22currentColor%22%3E%3Cpath stroke-linecap=%22round%22 stroke-linejoin=%22round%22 d=%22M19.5 8.25l-7.5 7.5-7.5-7.5%22/%3E%3C/svg%3E');background-repeat:no-repeat;background-position:right 0.2rem center;background-size:0.65rem;">${opts}</select>`;
  }

  function avatarColor(name) {
    const colors = ['bg-pink-100 text-pink-600', 'bg-emerald-100 text-emerald-600', 'bg-blue-100 text-blue-600', 'bg-amber-100 text-amber-600', 'bg-violet-100 text-violet-600', 'bg-rose-100 text-rose-600', 'bg-sky-100 text-sky-600', 'bg-indigo-100 text-indigo-600'];
    let h = 0;
    for (let i = 0; i < (name || '').length; i++) h = (h << 5) - h + name.charCodeAt(i);
    return colors[Math.abs(h) % colors.length];
  }

  /** Iniciály z pozice: "Account manager" → AM, "PPC Specialista" → PPC (první slovo 2–4 znaky) nebo první písmena slov. */
  function positionInitials(positionName) {
    if (!positionName || !String(positionName).trim()) return '?';
    const words = String(positionName).trim().split(/\s+/).filter(Boolean);
    const first = words[0];
    if (first && first.length >= 2 && first.length <= 4 && /^[A-Za-z0-9]+$/.test(first))
      return first.toUpperCase();
    return words.map(w => w[0]).join('').toUpperCase().slice(0, 3) || '?';
  }

  function avatarInitials(c) {
    const pos = positions.find(x => x.id === c.positionId);
    const posName = pos ? pos.name : (c.positionRaw || '').trim();
    if (posName) return positionInitials(posName);
    const first = (c.firstname || '')[0] || '';
    const last = (c.surname || '')[0] || '';
    return (first + last).toUpperCase() || '?';
  }

  function renderNotesCell(c, field, label) {
    const text = c[field] || '';
    if (!text) return `<button class="notes-edit-btn text-slate-300 hover:text-indigo-500 text-xs italic transition-colors" data-id="${c.id}" data-field="${field}" data-label="${escapeHtml(label)}">+ přidat</button>`;
    const short = text.substring(0, 50) + (text.length > 50 ? '…' : '');
    return `<button class="notes-edit-btn text-left cell-truncate text-slate-600 hover:text-indigo-600 transition-colors cursor-pointer" data-id="${c.id}" data-field="${field}" data-label="${escapeHtml(label)}">${escapeHtml(short)}</button>`;
  }

  function renderNotesCellCompact(c, field, label) {
    const text = c[field] || '';
    if (!text) return `<button class="notes-edit-btn text-slate-300 hover:text-indigo-500 text-xs italic transition-colors" data-id="${c.id}" data-field="${field}" data-label="${escapeHtml(label)}">+</button>`;
    const short = text.length > 35 ? text.substring(0, 35) + '…' : text;
    return `<button class="notes-edit-btn text-left max-w-[150px] truncate text-xs text-slate-500 hover:text-indigo-600 transition-colors cursor-pointer block" data-id="${c.id}" data-field="${field}" data-label="${escapeHtml(label)}" title="${escapeHtml(text)}">${escapeHtml(short)}</button>`;
  }

  const FIXED_COLUMN_KEYS = ['name'];

  const EMPTY = '<span class="text-slate-300">—</span>';

  const ALL_COLUMNS = [
    { key: 'name',            label: 'Kandidát',          default: true,  fixed: true, sortVal: c => [c.surname, c.firstname].filter(Boolean).join(' ').toLowerCase(), render: c => {
      const name = [c.surname, c.firstname].filter(Boolean).join(' ') || '—';
      const initials = avatarInitials(c);
      const pos = positions.find(x => x.id === c.positionId);
      const posName = pos ? pos.name : (c.positionRaw || '').trim();
      const color = avatarColor(posName || name);
      return `<div class="flex items-center gap-2 min-w-0"><div class="w-6 h-6 rounded-full ${color} flex items-center justify-center font-bold text-[10px] shrink-0">${escapeHtml(initials)}</div><span class="font-semibold text-slate-800 text-sm truncate min-w-0" title="${escapeHtml(name)}">${escapeHtml(name)}</span></div>`;
    } },
    { key: 'watch',           label: 'Sled.',             default: false, sortVal: c => (c.watch ? 1 : 0), render: c => {
      const active = !!c.watch;
      const color = active ? 'text-amber-500' : 'text-slate-300 hover:text-amber-400';
      const title = active ? 'Zrušit sledování kandidáta' : 'Sledovat kandidáta';
      return `<button type="button" class="watch-toggle" data-id="${c.id}" title="${title}">
        <svg class="w-4 h-4 ${color}" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.18 3.63a1 1 0 00.95.69h3.813c.969 0 1.371 1.24.588 1.81l-3.084 2.24a1 1 0 00-.364 1.118l1.18 3.63c.3.922-.755 1.688-1.54 1.118L10 13.347l-3.174 2.816c-.784.57-1.838-.196-1.539-1.118l1.18-3.63a1 1 0 00-.364-1.118L3.02 9.057c-.783-.57-.38-1.81.588-1.81h3.813a1 1 0 00.95-.69l1.18-3.63z" />
        </svg>
      </button>`;
    }, interactive: true },
    { key: 'position',        label: 'Pozice',            default: true,  sortVal: c => { const p = positions.find(x => x.id === c.positionId); return (p ? p.name : '').toLowerCase(); }, render: c => { const p = positions.find(x => x.id === c.positionId); const v = p ? p.name : ''; return v ? `<span class="text-slate-600 text-[13px]">${escapeHtml(v)}</span>` : EMPTY; } },
    { key: 'stage',           label: 'Fáze',              default: true,  sortVal: c => (STAGE_LABELS[c.stage] || c.stage || '').toLowerCase(), render: c => renderStageSelect(c), interactive: true },
    { key: 'email',           label: 'E-mail',            default: false, sortVal: c => (c.email || '').toLowerCase(), render: c => {
      const v = (c.email || '').trim();
      if (!v) return EMPTY;
      return `<span class="inline-flex items-center gap-0.5 max-w-[140px]"><span class="truncate text-slate-600 text-[13px]" title="${escapeHtml(v)}">${escapeHtml(v)}</span><span class="copy-trigger shrink-0" data-copy="${escapeHtml(v)}" title="Kopírovat">${copyIcon()}</span></span>`;
    }, interactive: true },
    { key: 'phone',           label: 'Telefon',           default: true,  sortVal: c => (c.phone || '').toLowerCase(), render: c => {
      const v = (c.phone || '').trim();
      if (!v) return EMPTY;
      return `<span class="inline-flex items-center gap-0.5 max-w-[120px]"><span class="truncate text-slate-600 text-[13px]" title="${escapeHtml(v)}">${escapeHtml(v)}</span><span class="copy-trigger shrink-0" data-copy="${escapeHtml(v)}" title="Kopírovat">${copyIcon()}</span></span>`;
    }, interactive: true },
    { key: 'linkedin',        label: 'LinkedIn',          default: false, sortVal: c => (c.linkedin || '').toLowerCase(), render: c => c.linkedin ? `<a href="${escapeHtml(c.linkedin)}" target="_blank" rel="noopener" class="text-blue-600 hover:underline inline-flex items-center" title="${escapeHtml(c.linkedin)}"><svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/></svg></a>` : EMPTY },
    { key: 'source',          label: 'Zdroj',             default: true,  sortVal: c => (c.source || '').toLowerCase(), render: c => c.source ? `<span class="text-slate-500 text-[13px]">${escapeHtml(c.source)}</span>` : EMPTY },
    { key: 'gender',          label: 'Pohlaví',           default: false, sortVal: c => (c.gender || '').toLowerCase(), render: c => c.gender ? escapeHtml(c.gender) : EMPTY },
    { key: 'salary',          label: 'Plat',              default: false, sortVal: c => parseFloat(c.salary) || 0, render: c => c.salary ? `<span class="text-slate-700 font-medium text-[13px]">${escapeHtml(c.salary + (c.salaryCurrency ? ' ' + c.salaryCurrency : ''))}</span>` : EMPTY },
    { key: 'contract',        label: 'HPP / IČO',        default: false, sortVal: c => (c.contract || '').toLowerCase(), render: c => c.contract ? `<span class="text-slate-600 text-[13px]">${escapeHtml(c.contract)}</span>` : EMPTY },
    { key: 'salaryNote',      label: 'Pozn. ke mzdě',    default: false, sortVal: c => (c.salaryNote || '').toLowerCase(), render: c => c.salaryNote ? escapeHtml(c.salaryNote) : EMPTY },
    { key: 'startDate',       label: 'Datum nástupu',     default: false, sortVal: c => (c.startDate || '').toLowerCase(), render: c => c.startDate ? escapeHtml(c.startDate) : EMPTY },
    { key: 'languages',       label: 'Jazyky',            default: false, sortVal: c => (c.languages || '').toLowerCase(), render: c => c.languages ? escapeHtml(c.languages) : EMPTY },
    { key: 'potential',      label: 'Potenciál',         default: false, sortVal: c => (c.potential || '').toLowerCase(), render: c => c.potential ? `<span class="${TW.badge} text-[10px] ${c.potential === 'Perspektivní' ? 'bg-emerald-50 text-emerald-600' : c.potential === 'Nevhodný' ? 'bg-red-50 text-red-500' : 'bg-slate-100 text-slate-500'}">${escapeHtml(c.potential)}</span>` : EMPTY },
    { key: 'prvniInterakce',  label: 'První interakce',   default: false, sortVal: c => (c.prvniInterakce || '').toLowerCase(), render: c => { const v = excelDateToString(c.prvniInterakce); return v ? `<span class="text-slate-500 text-[13px]">${escapeHtml(v)}</span>` : EMPTY; } },
    { key: 'notes',           label: 'Poznámky',          default: false, sortVal: c => (c.notes || '').toLowerCase(), render: c => renderNotesCellCompact(c, 'notes', 'Poznámky'), interactive: true },
    { key: 'kolo1',           label: '1. kolo',           default: false, sortVal: c => (c.kolo1 || '').toLowerCase(), render: c => renderNotesCellCompact(c, 'kolo1', '1. kolo'), interactive: true },
    { key: 'kolo2',           label: '2. kolo',           default: false, sortVal: c => (c.kolo2 || '').toLowerCase(), render: c => renderNotesCellCompact(c, 'kolo2', '2. kolo'), interactive: true },
    { key: 'kolo3',           label: '3. kolo',           default: false, sortVal: c => (c.kolo3 || '').toLowerCase(), render: c => renderNotesCellCompact(c, 'kolo3', '3. kolo'), interactive: true },
    { key: 'ukol',            label: 'Úkol',              default: false, sortVal: c => (c.ukol || '').toLowerCase(), render: c => renderNotesCellCompact(c, 'ukol', 'Úkol'), interactive: true },
    { key: 'rejectionReason', label: 'Důvod odmítnutí',   default: false, sortVal: c => (c.rejectionReason || '').toLowerCase(), render: c => renderNotesCellCompact(c, 'rejectionReason', 'Důvod odmítnutí'), interactive: true }
  ];

  const COL_STORAGE_KEY = 'hr_visible_columns';

  const VALID_COLUMN_KEYS = new Set(ALL_COLUMNS.map(c => c.key));

  /** Max šířky sloupců (px) podle obsahu – vyrovnané zobrazení. */
  const COLUMN_MAX_WIDTH = {
    name: 220,
    watch: 56,
    position: 150,
    stage: 130,
    email: 180,
    phone: 125,
    linkedin: 44,
    source: 140,
    gender: 72,
    salary: 110,
    contract: 72,
    salaryNote: 120,
    startDate: 100,
    languages: 100,
    potential: 100,
    prvniInterakce: 110,
    notes: 180,
    kolo1: 180,
    kolo2: 180,
    kolo3: 180,
    ukol: 180,
    rejectionReason: 160
  };
  function columnWidthStyle(key) {
    const w = COLUMN_MAX_WIDTH[key];
    return w ? ` style="max-width:${w}px"` : '';
  }

  function getVisibleColumns() {
    const defaultKeys = ALL_COLUMNS.filter(c => c.default).map(c => c.key);
    const saved = localStorage.getItem(COL_STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          const optional = parsed.filter(k => !FIXED_COLUMN_KEYS.includes(k) && VALID_COLUMN_KEYS.has(k));
          const result = [...FIXED_COLUMN_KEYS, ...optional];
          if (result.length > 1) return result;
        }
      } catch (e) { /* fall through */ }
    }
    return defaultKeys;
  }

  function saveVisibleColumns(keys) {
    const optional = keys.filter(k => !FIXED_COLUMN_KEYS.includes(k));
    localStorage.setItem(COL_STORAGE_KEY, JSON.stringify(optional));
  }

  // --- Navigation ---
  function initNav() {
    const links = document.querySelectorAll('.sidebar-link[data-view]');
    const views = document.querySelectorAll('.view');
    function showView(viewId) {
      links.forEach(l => {
        const isView = l.dataset.view === viewId;
        const isWatch = l.dataset.watchOnly === '1';
        l.classList.toggle('active', isView && (!!watchOnly === isWatch));
      });
      views.forEach(v => {
        const active = v.id === viewId;
        v.classList.toggle('view-active', active);
        v.style.display = active ? 'flex' : 'none';
      });
      if (viewId === 'kandidati') { renderCandidates(); renderPipelineIfActive(); }
      if (viewId === 'nabor') renderOpenings();
      if (viewId === 'pozice') renderPositions();
      if (viewId === 'prihlasky') renderApplications();
      if (viewId === 'vyhledavani') renderSearchModule();
      if (viewId === 'dashboard') renderDashboard();
      if (viewId === 'uzivatele') renderUzivatele();
    }
    links.forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const viewId = link.dataset.view;
        if (viewId) {
          watchOnly = link.dataset.watchOnly === '1';
          showView(viewId);
        }
      });
    });
    const hash = (window.location.hash || '#dashboard').slice(1);
    const viewId = hash || 'dashboard';
    const hasView = document.getElementById(viewId);
    watchOnly = false;
    showView(hasView ? viewId : 'dashboard');
    if (viewId === 'uzivatele' && hasView) renderUzivatele();
  }

  function applyRoleVisibility() {
    document.querySelectorAll('.auth-admin-only').forEach(el => { el.hidden = !can('usersAndInvites'); });
    document.querySelectorAll('.auth-no-viewer').forEach(el => { el.hidden = currentUser && currentUser.role === 'viewer'; });
    document.querySelectorAll('.auth-import-export').forEach(el => { el.hidden = !can('importExport'); });
    document.querySelectorAll('.auth-positions').forEach(el => { el.hidden = !can('positions'); });
  }

  function initAuthUI() {
    const emailEl = document.getElementById('auth-user-email');
    if (emailEl && currentUser) emailEl.textContent = currentUser.email || '';
    const logoutBtn = document.getElementById('auth-logout');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', async () => {
        if (supabaseClient) {
          try {
            await supabaseClient.auth.signOut();
          } catch (e) {
            // ignore
          }
        }
        localStorage.removeItem('user');
        window.location.href = 'login.html';
      });
    }
  }

  async function renderUzivatele() {
    const wrap = document.getElementById('uzivatele-list-wrap');
    if (!wrap || !can('usersAndInvites')) return;
    try {
      if (!supabaseClient) {
        wrap.innerHTML = '<p class="text-slate-500 text-sm">Supabase klient není k dispozici.</p>';
        return;
      }
      // Načteme jen vlastní profil (policy "read own profile") – zobrazí se vám váš účet
      const myId = currentUser && currentUser.id;
      if (!myId) {
        wrap.innerHTML = '<p class="text-slate-500 text-sm">Nejste přihlášeni.</p>';
        return;
      }
      const { data: row, error } = await supabaseClient
        .from('profiles')
        .select('id, email, role, created_at')
        .eq('id', myId)
        .single();
      if (error) {
        wrap.innerHTML = '<p class="text-slate-500 text-sm">Načtení profilu se nezdařilo: ' + (error.message || '') + '</p>';
        return;
      }
      const list = row ? [row] : [];
      const roleLabel = (r) => ({ admin: 'Admin', manager: 'Manager', recruiter: 'Náborář', viewer: 'Jen čtení' }[r] || r);
      wrap.innerHTML = `
        <div class="mb-8">
          <h3 class="text-sm font-bold text-slate-500 uppercase tracking-wider mb-4">Uživatelé</h3>
          <div class="bg-white rounded-xl border border-slate-100 overflow-hidden">
            <table class="w-full text-sm">
              <thead class="bg-slate-50"><tr><th class="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase">E-mail</th><th class="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase">Role</th></tr></thead>
              <tbody>${list.map(u => `<tr class="border-t border-slate-100"><td class="px-4 py-3">${escapeHtml(u.email)}</td><td class="px-4 py-3">${escapeHtml(roleLabel(u.role))}${currentUser && currentUser.id === u.id ? ' <span class="text-slate-400 text-xs">(vy)</span>' : ''}</td></tr>`).join('')}</tbody>
            </table>
          </div>
        </div>
        <div>
          <h3 class="text-sm font-bold text-slate-500 uppercase tracking-wider mb-4">Pozvat uživatele</h3>
          <p class="text-sm text-slate-500">Nové uživatele přidávejte v Supabase: Authentication → Users (vytvořit účet) a Table Editor → profiles (přidat řádek se stejným id, e-mailem a rolí). Pozvánky e-mailem doplníme později.</p>
        </div>
      `;
    } catch (e) {
      wrap.innerHTML = '<p class="text-slate-500 text-sm">Chyba: ' + (e && e.message ? e.message : 'připojení k Supabase') + '.</p>';
    }
  }

  // --- Dashboard ---
  function renderDashboard() {
    const openCount = openings.filter(o => o.status === 'aktivni').length;
    document.getElementById('stat-open-positions').textContent = openCount;
    document.getElementById('stat-total-candidates').textContent = candidates.length;
    const newApps = applications.filter(a => !a.convertedToCandidateId).length;
    document.getElementById('stat-new-applications').textContent = newApps;

    const STAGE_BADGES = { novy_kandidat:'bg-blue-50 border-blue-100 text-blue-700', telefonat:'bg-sky-50 border-sky-100 text-sky-700', ukol:'bg-amber-50 border-amber-100 text-amber-700', kolo1:'bg-violet-50 border-violet-100 text-violet-700', kolo2:'bg-rose-50 border-rose-100 text-rose-700', nabidka:'bg-amber-50 border-amber-100 text-amber-700', prijat:'bg-emerald-50 border-emerald-100 text-emerald-700', zamitnut:'bg-slate-100 border-slate-200 text-slate-600' };
    const byStage = {};
    candidates.forEach(c => { byStage[c.stage] = (byStage[c.stage] || 0) + 1; });
    let pipelineHtml = Object.entries(STAGE_LABELS).map(([key, label]) => {
      const cls = STAGE_BADGES[key] || 'bg-slate-100 border-slate-200 text-slate-600';
      const count = byStage[key] || 0;
      return `<span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${cls}">${escapeHtml(label)} <span class="opacity-80">${count}</span></span>`;
    }).join('');
    const unknownStages = Object.keys(byStage).filter(k => !(k in STAGE_LABELS));
    if (unknownStages.length) {
      pipelineHtml += unknownStages.map(k =>
        `<span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border bg-amber-50 border-amber-100 text-amber-700">⚠ ${escapeHtml(k)} <span class="opacity-80">${byStage[k]}</span></span>`
      ).join('');
    }
    document.getElementById('pipeline-summary').innerHTML = pipelineHtml;

    const POS_COLORS = ['bg-slate-100 border-slate-200 text-slate-700', 'bg-amber-50 border-amber-100 text-amber-800', 'bg-indigo-50 border-indigo-100 text-indigo-700', 'bg-purple-50 border-purple-100 text-purple-700', 'bg-emerald-50 border-emerald-100 text-emerald-700', 'bg-blue-50 border-blue-100 text-blue-700'];
    const byPos = {};
    candidates.forEach(c => {
      const pos = positions.find(p => p.id === c.positionId);
      const name = (pos && !pos.mergedIntoId ? pos.name : null) || '(bez pozice)';
      byPos[name] = (byPos[name] || 0) + 1;
    });
    document.getElementById('position-summary').innerHTML = Object.entries(byPos).map(([name, count], i) => {
      const cls = POS_COLORS[i % POS_COLORS.length];
      return `<span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${cls}">${escapeHtml(name)} <span class="opacity-75">${count}</span></span>`;
    }).join('');
  }

  // --- Positions ---
  function renderPositions() {
    const list = document.getElementById('position-list');
    const mainPositions = positions.filter(p => !p.mergedIntoId);
    list.innerHTML = mainPositions.map(p => {
      const candidateCount = candidates.filter(c => c.positionId === p.id).length;
      const aliases = positions.filter(a => a.mergedIntoId === p.id);
      const aliasesHtml = aliases.length
        ? `<div class="mt-1 flex flex-wrap gap-1.5 text-xs text-slate-500">
            <span class="px-2 py-0.5 rounded-full bg-slate-50 border border-slate-100">Alias: ${aliases.map(a => escapeHtml(a.name)).join(', ')}</span>
           </div>`
        : '';
      const statusBadge = p.status === 'otevreno'
        ? `<span class="${TW.badge} ${TW.badgeOpen}">Otevřeno</span>`
        : `<span class="${TW.badge} ${TW.badgeClosed}">Uzavřeno</span>`;
      return `
      <div class="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 hover:shadow-md hover:border-indigo-100 transition-all">
        <div class="flex items-start justify-between gap-3 mb-2">
          <div>
            <h3 class="font-semibold text-slate-800">${escapeHtml(p.name)}</h3>
            <p class="text-xs text-slate-500 mt-0.5">Kandidátů: ${candidateCount}</p>
            ${aliasesHtml}
          </div>
          <div class="flex flex-col items-end gap-1">
            ${statusBadge}
          </div>
        </div>
        ${p.notes ? `<p class="text-sm text-slate-500 mb-3 leading-relaxed">${escapeHtml(p.notes)}</p>` : ''}
        <div class="flex gap-2 pt-3 border-t border-slate-50">
          <button type="button" class="${TW.btn} ${TW.btnSmall} ${TW.btnSecondary} btn-edit-position" data-id="${p.id}">Upravit</button>
          <button type="button" class="${TW.btn} ${TW.btnSmall} ${TW.btnSecondary} btn-merge-position" data-id="${p.id}">Sloučit</button>
          <button type="button" class="${TW.btn} ${TW.btnSmall} ${TW.btnDanger} btn-delete-position" data-id="${p.id}">Smazat</button>
        </div>
      </div>`;
    }).join('') || '<p class="text-slate-400 text-center py-8 italic col-span-full">Zatím žádné pozice.</p>';

    list.querySelectorAll('.btn-edit-position').forEach(btn => {
      btn.addEventListener('click', () => openPositionModal(btn.dataset.id));
    });
    list.querySelectorAll('.btn-merge-position').forEach(btn => {
      btn.addEventListener('click', () => openMergePositionModal(btn.dataset.id));
    });
    list.querySelectorAll('.btn-delete-position').forEach(btn => {
      btn.addEventListener('click', () => doDeletePosition(btn.dataset.id));
    });
  }

  function fillPositionSelect(selectEl, allowEmpty = true) {
    const value = selectEl.value;
    const selectable = positions.filter(p => !p.mergedIntoId);
    selectEl.innerHTML = (allowEmpty ? '<option value="">— vyberte —</option>' : '') +
      selectable.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');
    if (value) selectEl.value = value;
  }

  // --- Openings (výběrová řízení) ---
  function renderOpenings() {
    const list = document.getElementById('opening-list');
    if (!list) return;
    const statusFilterEl = document.getElementById('filter-openings-status');
    const statusFilter = statusFilterEl ? statusFilterEl.value : 'aktivni';
    let items = [...openings];
    if (statusFilter === 'aktivni') items = items.filter(o => o.status === 'aktivni');
    if (statusFilter === 'ukonceno') items = items.filter(o => o.status === 'ukonceno');
    const cards = items.map(o => {
      const pos = positions.find(p => p.id === o.positionId);
      const candidateCount = candidates.filter(c => c.openingId === o.id).length;
      const statusBadge = o.status === 'aktivni'
        ? `<span class="${TW.badge} ${TW.badgeOpen}">Aktivní</span>`
        : `<span class="${TW.badge} ${TW.badgeClosed}">Ukončeno</span>`;
      const location = o.location || '';
      const shareUrl = `job-page.html?job=${encodeURIComponent(o.publicSlug || o.id)}`;
      const openedDate = o.openedAt ? new Date(o.openedAt).toLocaleDateString('cs-CZ') : '';
      const statusAction = o.status === 'aktivni'
        ? `<button type="button" class="${TW.btn} ${TW.btnSmall} ${TW.btnSecondary} btn-toggle-opening-status" data-id="${o.id}" data-status="ukonceno">Ukončit nábor</button>`
        : `<button type="button" class="${TW.btn} ${TW.btnSmall} ${TW.btnSecondary} btn-toggle-opening-status" data-id="${o.id}" data-status="aktivni">Obnovit nábor</button>`;
      return `
        <div class="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 hover:shadow-md hover:border-indigo-100 transition-all flex flex-col gap-3">
          <div class="flex items-start justify-between gap-3">
            <div>
              <h3 class="font-semibold text-slate-900 mb-0.5">${escapeHtml(o.title || (pos ? pos.name : 'Výběrové řízení'))}</h3>
              <p class="text-xs text-slate-500">${escapeHtml(pos ? pos.name : '(bez pozice)')}${location ? ' · ' + escapeHtml(location) : ''}${openedDate ? ' · od ' + escapeHtml(openedDate) : ''}</p>
            </div>
            <div class="flex flex-col items-end gap-1">
              ${statusBadge}
              <span class="text-[11px] text-slate-400">Kandidátů: ${candidateCount}</span>
            </div>
          </div>
          ${o.description ? `<p class="text-sm text-slate-600 line-clamp-3">${escapeHtml(o.description)}</p>` : ''}
          <div class="flex flex-wrap gap-2 pt-2 border-t border-slate-50 mt-auto">
            <button type="button" class="${TW.btn} ${TW.btnSmall} ${TW.btnPrimary} btn-opening-candidates" data-id="${o.id}">Kandidáti</button>
            <button type="button" class="${TW.btn} ${TW.btnSmall} ${TW.btnSecondary} btn-edit-opening" data-id="${o.id}">Upravit</button>
            <button type="button" class="${TW.btn} ${TW.btnSmall} ${TW.btnSecondary} btn-copy-opening-link" data-url="${shareUrl}">Kopírovat odkaz</button>
            ${statusAction}
          </div>
        </div>
      `;
    }).join('');
    list.innerHTML = cards || '<p class="text-slate-400 text-center py-8 italic">Zatím nemáte založené žádné výběrové řízení.</p>';

    list.querySelectorAll('.btn-edit-opening').forEach(btn => {
      btn.addEventListener('click', () => openOpeningModal(btn.dataset.id));
    });
    list.querySelectorAll('.btn-opening-candidates').forEach(btn => {
      btn.addEventListener('click', () => openOpeningCandidates(btn.dataset.id));
    });
    list.querySelectorAll('.btn-copy-opening-link').forEach(btn => {
      btn.addEventListener('click', () => {
        const url = new URL(btn.dataset.url, window.location.origin);
        navigator.clipboard.writeText(url.toString()).then(() => {
          btn.textContent = 'Zkopírováno';
          setTimeout(() => { btn.textContent = 'Kopírovat odkaz'; }, 1500);
        });
      });

    list.querySelectorAll('.btn-toggle-opening-status').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        const status = btn.dataset.status;
        await toggleOpeningStatus(id, status);
      });
    });
    });

    if (statusFilterEl && !statusFilterEl.dataset._bound) {
      statusFilterEl.dataset._bound = '1';
      statusFilterEl.addEventListener('change', () => renderOpenings());
    }
  }

  function openOpeningModal(id) {
    const titleEl = document.getElementById('modal-opening-title');
    const idEl = document.getElementById('opening-id');
    const titleInput = document.getElementById('opening-title');
    const posSelect = document.getElementById('opening-position');
    const locInput = document.getElementById('opening-location');
    const dateInput = document.getElementById('opening-date');
    const statusSelect = document.getElementById('opening-status');
    const descInput = document.getElementById('opening-description');
    fillPositionSelect(posSelect, false);
    if (id) {
      const o = openings.find(x => x.id === id);
      if (!o) return;
      titleEl.textContent = 'Upravit výběrové řízení';
      idEl.value = o.id;
      titleInput.value = o.title || '';
      posSelect.value = o.positionId || '';
      locInput.value = o.location || '';
      statusSelect.value = o.status || 'aktivni';
      descInput.value = o.description || '';
      dateInput.value = o.openedAt ? o.openedAt.split('T')[0] : '';
    } else {
      titleEl.textContent = 'Nové výběrové řízení';
      idEl.value = '';
      titleInput.value = '';
      posSelect.value = positions[0] ? positions[0].id : '';
      locInput.value = '';
      statusSelect.value = 'aktivni';
      descInput.value = '';
      const today = new Date().toISOString().split('T')[0];
      dateInput.value = today;
    }
    const modal = document.getElementById('modal-opening');
    modal.classList.add('modal-open');
    modal.setAttribute('aria-hidden', 'false');
  }

  async function saveOpeningFromModal() {
    const id = document.getElementById('opening-id').value;
    const title = document.getElementById('opening-title').value.trim();
    const positionId = document.getElementById('opening-position').value || null;
    if (!title) return alert('Zadejte název výběrového řízení.');
    await saveOpening({
      id: id || undefined,
      title,
      positionId,
      location: document.getElementById('opening-location').value.trim(),
      status: document.getElementById('opening-status').value || 'aktivni',
      description: document.getElementById('opening-description').value.trim(),
      openedAt: document.getElementById('opening-date').value || null
    });
    openings = await getAllOpenings();
    renderOpenings();
    renderDashboard();
    closeModal('modal-opening');
  }

  async function toggleOpeningStatus(id, status) {
    const opening = openings.find(o => o.id === id);
    if (!opening) return;
    opening.status = status;
    await saveOpening(opening);
    openings = await getAllOpenings();
    renderOpenings();
    renderDashboard();
  }

  function openOpeningCandidates(openingId) {
    const sel = document.getElementById('filter-opening');
    if (sel) {
      sel.value = openingId || '';
    }
    const link = document.querySelector('.sidebar-link[data-view="kandidati"]');
    if (link) {
      link.click();
      // zajistí přefiltrování po zobrazení tabulky
      setTimeout(() => { renderCandidates(); }, 0);
    }
  }

  function openPositionModal(id) {
    document.getElementById('modal-position-title').textContent = id ? 'Upravit pozici' : 'Nová pozice';
    document.getElementById('position-id').value = id || '';
    if (id) {
      const p = positions.find(x => x.id === id);
      document.getElementById('position-name').value = p.name || '';
      document.getElementById('position-status').value = p.status || 'otevreno';
      document.getElementById('position-notes').value = p.notes || '';
    } else {
      document.getElementById('position-name').value = '';
      document.getElementById('position-status').value = 'otevreno';
      document.getElementById('position-notes').value = '';
    }
    document.getElementById('modal-position').classList.add('modal-open');
    document.getElementById('modal-position').setAttribute('aria-hidden', 'false');
  }

  function fillMergeTargetSelect(fromId) {
    const sel = document.getElementById('merge-target-id');
    const options = positions.filter(p => !p.mergedIntoId && p.id !== fromId);
    sel.innerHTML = options.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');
  }

  function openMergePositionModal(id) {
    const from = positions.find(x => x.id === id);
    if (!from) return;
    document.getElementById('merge-from-id').value = id;
    document.getElementById('merge-from-label').textContent = `Původní pozice: ${from.name}`;
    fillMergeTargetSelect(id);
    const modal = document.getElementById('modal-position-merge');
    modal.classList.add('modal-open');
    modal.setAttribute('aria-hidden', 'false');
  }

  async function mergePositions(fromId, toId) {
    if (!fromId || !toId || fromId === toId) return;
    for (const c of candidates) {
      if (c.positionId === fromId) {
        c.positionId = toId;
        await saveCandidate(c);
      }
    }
    for (const a of applications) {
      if (a.positionId === fromId) {
        a.positionId = toId;
        await saveApplication(a);
      }
    }
    const fromPos = positions.find(p => p.id === fromId);
    if (fromPos) {
      fromPos.mergedIntoId = toId;
      if (fromPos.status === 'otevreno') fromPos.status = 'uzavreno';
      await savePosition(fromPos);
    }
    await loadPositions();
    await loadCandidates();
    await loadApplications();
    renderDashboard();
    renderCandidates();
    renderPositions();
    renderApplications();
  }

  async function confirmMergeFromModal() {
    const fromId = document.getElementById('merge-from-id').value;
    const toId = document.getElementById('merge-target-id').value;
    if (!toId) return alert('Vyberte cílovou pozici.');
    if (!fromId || fromId === toId) return;
    if (!confirm('Opravdu sloučit tyto pozice? Všichni kandidáti a přihlášky budou přesunuti.')) return;
    await mergePositions(fromId, toId);
    closeModal('modal-position-merge');
  }

  async function savePositionFromModal() {
    const id = document.getElementById('position-id').value;
    const name = document.getElementById('position-name').value.trim();
    if (!name) return alert('Zadejte název pozice.');
    await savePosition({ id: id || undefined, name, status: document.getElementById('position-status').value, notes: document.getElementById('position-notes').value.trim() });
    await loadPositions(); renderPositions();
    fillPositionSelect(document.getElementById('filter-position'));
    fillPositionSelect(document.getElementById('candidate-position'));
    closeModal('modal-position'); renderDashboard();
  }

  async function doDeletePosition(id) {
    if (!confirm('Opravdu smazat tuto pozici?')) return;
    await deletePosition(id); await loadPositions(); renderPositions();
    fillPositionSelect(document.getElementById('filter-position'));
    fillPositionSelect(document.getElementById('candidate-position'));
    renderDashboard();
  }

  // --- Candidates ---
  function filterCandidates() {
    const search = (document.getElementById('search-candidates').value || '').toLowerCase();
    const posId = document.getElementById('filter-position').value;
    const openingId = document.getElementById('filter-opening').value;
    const stage = document.getElementById('filter-stage').value;
    const showRejected = document.getElementById('filter-show-rejected') && document.getElementById('filter-show-rejected').checked;
    return candidates.filter(c => {
      if (!showRejected && c.stage === 'zamitnut') return false;
      if (posId && c.positionId !== posId) return false;
      if (openingId && c.openingId !== openingId) return false;
      if (stage && c.stage !== stage) return false;
      if (watchOnly && !c.watch) return false;
      if (search) {
        const text = [c.surname, c.firstname, c.email, c.phone, c.notes, c.source, c.prvniInterakce, c.kolo1, c.kolo2, c.kolo3, c.ukol, c.rejectionReason].filter(Boolean).join(' ').toLowerCase();
        if (!text.includes(search)) return false;
      }
      return true;
    });
  }

  function renderColumnsDropdown() {
    const dropdown = document.getElementById('columns-dropdown');
    const visible = getVisibleColumns();
    const optionalColumns = ALL_COLUMNS.filter(c => !c.fixed);
    dropdown.innerHTML = optionalColumns.map(col =>
      `<label><input type="checkbox" value="${col.key}" ${visible.includes(col.key) ? 'checked' : ''}> ${escapeHtml(col.label)}</label>`
    ).join('');
    dropdown.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      cb.addEventListener('change', () => {
        const checked = [...dropdown.querySelectorAll('input:checked')].map(i => i.value);
        saveVisibleColumns([...FIXED_COLUMN_KEYS, ...checked]);
        renderCandidates();
      });
    });
  }

  function fillStageFilter() {
    const sel = document.getElementById('filter-stage');
    const current = sel.value;
    const counts = {};
    candidates.forEach(c => { counts[c.stage] = (counts[c.stage] || 0) + 1; });
    let html = '<option value="">Všechny fáze</option>';
    Object.entries(STAGE_LABELS).forEach(([key, label]) => {
      const n = counts[key] || 0;
      html += `<option value="${key}">${escapeHtml(label)} (${n})</option>`;
    });
    const unknownStages = Object.keys(counts).filter(k => !(k in STAGE_LABELS));
    if (unknownStages.length) {
      html += '<option disabled>───</option>';
      unknownStages.forEach(k => {
        html += `<option value="${escapeHtml(k)}">⚠ ${escapeHtml(k)} (${counts[k]})</option>`;
      });
    }
    sel.innerHTML = html;
    sel.value = current;
  }

  function fillOpeningFilter() {
    const sel = document.getElementById('filter-opening');
    if (!sel) return;
    const current = sel.value;
    const counts = {};
    candidates.forEach(c => {
      if (!c.openingId) return;
      counts[c.openingId] = (counts[c.openingId] || 0) + 1;
    });
    let html = '<option value="">Všechna výběrová řízení</option>';
    const activeOpenings = openings.filter(o => o.status === 'aktivni');
    activeOpenings.forEach(o => {
      const n = counts[o.id] || 0;
      html += `<option value="${o.id}">${escapeHtml(o.title || 'Výběrové řízení')} (${n})</option>`;
    });
    sel.innerHTML = html;
    sel.value = current;
  }

  function sortArrow(colKey) {
    if (sortColumn !== colKey) return `<svg class="w-3 h-3 ml-1 inline-block text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"/></svg>`;
    const up = sortDirection === 'asc';
    return `<svg class="w-3 h-3 ml-1 inline-block text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="${up ? 'M5 15l7-7 7 7' : 'M19 9l-7 7-7-7'}"/></svg>`;
  }

  function toggleSort(colKey) {
    if (sortColumn === colKey) {
      sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      sortColumn = colKey;
      sortDirection = 'asc';
    }
    renderCandidates();
  }

  function applySorting(list) {
    if (!sortColumn) return list;
    const colDef = ALL_COLUMNS.find(c => c.key === sortColumn);
    if (!colDef || !colDef.sortVal) return list;
    const sorted = [...list].sort((a, b) => {
      const va = colDef.sortVal(a);
      const vb = colDef.sortVal(b);
      if (va < vb) return -1;
      if (va > vb) return 1;
      return 0;
    });
    return sortDirection === 'desc' ? sorted.reverse() : sorted;
  }

  function renderCandidatesPagination(total, totalPages, currentPage) {
    const infoEl = document.getElementById('candidates-pagination-info');
    const btnsEl = document.getElementById('candidates-pagination-buttons');
    if (!infoEl || !btnsEl) return;
    const from = total === 0 ? 0 : (currentPage - 1) * CANDIDATES_PAGE_SIZE + 1;
    const to = Math.min(currentPage * CANDIDATES_PAGE_SIZE, total);
    infoEl.textContent = `Zobrazeno ${from}–${to} z ${total}`;
    if (totalPages <= 1) {
      btnsEl.innerHTML = '';
      return;
    }
    const parts = [];
    parts.push(`<button type="button" class="candidates-page-btn px-3 py-1.5 rounded-lg text-sm border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed" data-page="prev">‹ Předchozí</button>`);
    const maxVisible = 7;
    let start = Math.max(1, currentPage - Math.floor(maxVisible / 2));
    let end = Math.min(totalPages, start + maxVisible - 1);
    if (end - start + 1 < maxVisible) start = Math.max(1, end - maxVisible + 1);
    for (let i = start; i <= end; i++) {
      const active = i === currentPage ? ' bg-indigo-100 border-indigo-300 text-indigo-700 font-medium' : ' border-slate-200 bg-white text-slate-600 hover:bg-slate-50';
      parts.push(`<button type="button" class="candidates-page-btn px-2.5 py-1.5 rounded-lg text-sm border${active}" data-page="${i}">${i}</button>`);
    }
    parts.push(`<button type="button" class="candidates-page-btn px-3 py-1.5 rounded-lg text-sm border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed" data-page="next">Další ›</button>`);
    btnsEl.innerHTML = parts.join('');
    btnsEl.querySelectorAll('.candidates-page-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const p = btn.dataset.page;
        if (p === 'prev') candidatesTablePage = Math.max(1, currentPage - 1);
        else if (p === 'next') candidatesTablePage = Math.min(totalPages, currentPage + 1);
        else candidatesTablePage = parseInt(p, 10);
        renderCandidates();
      });
    });
    btnsEl.querySelector('[data-page="prev"]').disabled = currentPage <= 1;
    btnsEl.querySelector('[data-page="next"]').disabled = currentPage >= totalPages;
  }

  function renderCandidates() {
    fillPositionSelect(document.getElementById('filter-position'));
    fillPositionSelect(document.getElementById('candidate-position'));
    fillStageFilter();
    fillOpeningFilter();
    const filtered = applySorting(filterCandidates());
    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / CANDIDATES_PAGE_SIZE));
    if (candidatesTablePage > totalPages) candidatesTablePage = 1;
    const start = (candidatesTablePage - 1) * CANDIDATES_PAGE_SIZE;
    const pageRows = filtered.slice(start, start + CANDIDATES_PAGE_SIZE);
    let visible = getVisibleColumns();
    let cols = ALL_COLUMNS.filter(c => visible.includes(c.key));
    if (cols.length <= 1) {
      visible = ALL_COLUMNS.filter(c => c.default).map(c => c.key);
      saveVisibleColumns(visible);
      cols = ALL_COLUMNS.filter(c => visible.includes(c.key));
    }

    const thCells = cols.map(c => {
      const w = columnWidthStyle(c.key);
      return `<th class="${TW.th} cursor-pointer select-none hover:text-indigo-500 transition-colors whitespace-nowrap" data-sort-key="${c.key}"${w}>${escapeHtml(c.label)}${sortArrow(c.key)}</th>`;
    }).join('');
    document.getElementById('candidates-thead').innerHTML =
      `<tr class="bg-slate-50 border-b border-slate-200">${thCells}</tr>`;

    document.querySelectorAll('#candidates-thead th[data-sort-key]').forEach(th => {
      th.addEventListener('click', () => toggleSort(th.dataset.sortKey));
    });

    const tbody = document.getElementById('candidates-tbody');
    tbody.innerHTML = pageRows.map(c => {
      const cells = cols.map(col => {
        const w = columnWidthStyle(col.key);
        return `<td class="${TW.td} align-top"${w}>${col.render(c)}</td>`;
      }).join('');
      return `<tr class="clickable-row bg-white border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors cursor-pointer" data-id="${c.id}">${cells}</tr>`;
    }).join('') || `<tr><td colspan="${cols.length}" class="px-3 py-8 text-center text-slate-400 italic text-sm">Žádní kandidáti nevyhovují filtrům.</td></tr>`;

    tbody.querySelectorAll('.clickable-row').forEach(row => {
      row.addEventListener('click', (e) => {
        if (e.target.closest('a, button, select, .copy-trigger')) return;
        openCandidateDetail(row.dataset.id);
      });
    });

    tbody.querySelectorAll('.stage-select').forEach(sel => {
      sel.addEventListener('click', e => e.stopPropagation());
      sel.addEventListener('change', async (e) => {
        const cid = sel.dataset.id;
        const c = candidates.find(x => x.id === cid);
        if (c) { c.stage = sel.value; await saveCandidate(c); renderCandidates(); }
      });
    });

    tbody.querySelectorAll('.copy-trigger').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const text = el.dataset.copy;
        navigator.clipboard.writeText(text).then(() => {
          const svg = el.querySelector('svg');
          if (svg) { svg.classList.remove('text-slate-300'); svg.classList.add('text-emerald-500'); setTimeout(() => { svg.classList.remove('text-emerald-500'); svg.classList.add('text-slate-300'); }, 1200); }
        });
      });
    });

    tbody.querySelectorAll('.notes-edit-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        openNotesModal(btn.dataset.id, btn.dataset.field, btn.dataset.label);
      });
    });

    tbody.querySelectorAll('.watch-toggle').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const cid = btn.dataset.id;
        const c = candidates.find(x => x.id === cid);
        if (!c) return;
        c.watch = !c.watch;
        await saveCandidate(c);
        renderCandidates();
      });
    });

    renderCandidatesPagination(total, totalPages, candidatesTablePage);
    renderPipelineIfActive();
  }

  function getCandidateViewMode() {
    const active = document.querySelector('.view-toggle-btn.active');
    return (active && active.dataset.viewMode) || 'table';
  }

  function renderPipelineIfActive() {
    const tableContainer = document.getElementById('candidates-table-container');
    const pipelineWrap = document.getElementById('candidates-pipeline-wrap');
    const isPipeline = getCandidateViewMode() === 'pipeline';
    if (tableContainer) tableContainer.hidden = isPipeline;
    if (pipelineWrap) pipelineWrap.hidden = !isPipeline;
    if (isPipeline) renderPipeline();
  }

  const PIPELINE_STAGE_DOT = {
    novy_kandidat: 'bg-blue-500',
    telefonat: 'bg-purple-500',
    ukol: 'bg-amber-500',
    kolo1: 'bg-cyan-500',
    kolo2: 'bg-emerald-500',
    nabidka: 'bg-amber-500',
    prijat: 'bg-green-500',
    zamitnut: 'bg-slate-400'
  };

  function renderPipeline() {
    const board = document.getElementById('pipeline-board');
    if (!board) return;
    const filtered = filterCandidates();
    const byStage = {};
    Object.keys(STAGE_LABELS).forEach(k => { byStage[k] = []; });
    filtered.forEach(c => { if (byStage[c.stage]) byStage[c.stage].push(c); });
    board.innerHTML = Object.entries(STAGE_LABELS).map(([key, label]) => {
      const list = byStage[key] || [];
      const dotClass = PIPELINE_STAGE_DOT[key] || 'bg-slate-400';
      const countClass = list.length > 0 ? 'bg-white text-cyan-700 shadow-sm border border-cyan-100' : 'bg-slate-200/70 text-slate-600';
      return `
        <div class="w-[220px] min-w-[220px] shrink-0 flex flex-col max-h-full pipeline-column bg-slate-50 border border-slate-100 rounded-xl overflow-hidden" data-stage="${key}">
          <div class="px-2.5 py-1.5 flex justify-between items-center border-b border-slate-200/60 shrink-0">
            <div class="flex items-center gap-1.5 min-w-0">
              <div class="w-2 h-2 rounded-full ${dotClass} shrink-0"></div>
              <h3 class="text-[11px] font-bold text-slate-500 uppercase tracking-wider truncate">${escapeHtml(label)}</h3>
            </div>
            <span class="text-[10px] font-bold px-1.5 py-0.5 rounded ${countClass} shrink-0">${list.length}</span>
          </div>
          <div class="pipeline-column-cards flex-1 overflow-y-auto no-scrollbar p-2 flex flex-col gap-2 min-h-[80px]" data-stage="${key}">
            ${list.length === 0 ? `<div class="flex-1 min-h-[60px] border-2 border-dashed border-slate-200 rounded-lg flex items-center justify-center"><span class="text-[10px] text-slate-400 font-medium">Přetáhněte sem</span></div>` : list.map(c => {
              const pos = positions.find(p => p.id === c.positionId);
              const name = [c.surname, c.firstname].filter(Boolean).join(' ') || '—';
              const meta = [pos ? pos.name : null, c.source].filter(Boolean).join(' · ') || '—';
              const initials = avatarInitials(c);
              const posName = pos ? pos.name : (c.positionRaw || '').trim();
              const avColor = avatarColor(posName || name);
              return `<div class="pipeline-card bg-white p-2.5 rounded-lg shadow-sm border border-slate-200 hover:shadow-md hover:border-indigo-300 transition-all cursor-grab active:cursor-grabbing group flex-shrink-0" draggable="true" data-id="${c.id}" data-stage="${key}">
                <div class="flex justify-between items-start gap-1.5 mb-1.5">
                  <div class="flex items-center gap-2 min-w-0">
                    <div class="w-7 h-7 rounded-full ${avColor} flex items-center justify-center font-bold text-[10px] shrink-0">${escapeHtml(initials)}</div>
                    <h4 class="font-semibold text-slate-900 leading-tight group-hover:text-indigo-600 transition-colors text-xs truncate">${escapeHtml(name)}</h4>
                  </div>
                  <div class="text-slate-300 group-hover:text-slate-500 transition-colors shrink-0" aria-hidden="true">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8h16M4 16h16"></path></svg>
                  </div>
                </div>
                <div class="mt-1.5">
                  <p class="text-[10px] text-slate-500 font-medium truncate" title="${escapeHtml(pos ? pos.name : meta || '—')}">${escapeHtml(pos ? pos.name : meta || '—')}</p>
                  ${c.source ? `<span class="inline-block mt-1 text-[9px] text-slate-400 font-medium bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100 truncate max-w-full">${escapeHtml(c.source)}</span>` : ''}
                </div>
              </div>`;
            }).join('')}
          </div>
        </div>`;
    }).join('');
    board.querySelectorAll('.pipeline-card').forEach(card => {
      card.addEventListener('click', (e) => { if (!e.target.closest('[aria-hidden="true"]')) openCandidateDetail(card.dataset.id); });
      card.addEventListener('dragstart', onPipelineCardDragStart);
      card.addEventListener('dragend', onPipelineCardDragEnd);
    });
    board.querySelectorAll('.pipeline-column-cards').forEach(col => {
      col.addEventListener('dragover', onPipelineColumnDragOver);
      col.addEventListener('dragleave', onPipelineColumnDragLeave);
      col.addEventListener('drop', onPipelineColumnDrop);
    });
  }

  let draggedCardId = null;
  function onPipelineCardDragStart(e) {
    const card = e.target.closest('.pipeline-card');
    if (!card) return;
    draggedCardId = card.dataset.id;
    card.classList.add('pipeline-card-dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', card.dataset.id);
    e.dataTransfer.setDragImage(card, 0, 0);
  }
  function onPipelineCardDragEnd(e) {
    const card = e.target.closest('.pipeline-card');
    if (card) card.classList.remove('pipeline-card-dragging');
    document.querySelectorAll('.pipeline-column-cards.drag-over').forEach(el => el.classList.remove('drag-over'));
    draggedCardId = null;
  }
  function onPipelineColumnDragOver(e) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; e.currentTarget.classList.add('drag-over'); }
  function onPipelineColumnDragLeave(e) { e.currentTarget.classList.remove('drag-over'); }
  async function onPipelineColumnDrop(e) {
    e.preventDefault();
    const col = e.currentTarget; col.classList.remove('drag-over');
    const newStage = col.dataset.stage;
    const id = e.dataTransfer.getData('text/plain');
    if (!id || !newStage) return;
    const c = candidates.find(x => x.id === id);
    if (!c || c.stage === newStage) return;
    await saveCandidate({ ...c, stage: newStage });
    await loadCandidates();
    renderCandidates();
    renderPipeline();
    renderDashboard();
  }

  // --- Vyhledávání ---
  function filterCandidatesSearch() {
    const posId = (document.getElementById('search-filter-position') || {}).value || '';
    const ageVal = (document.getElementById('search-filter-age') || {}).value || '';
    const salaryMinRaw = (document.getElementById('search-salary-min') || {}).value.trim();
    const salaryMaxRaw = (document.getElementById('search-salary-max') || {}).value.trim();
    const salaryMin = salaryMinRaw ? parseInt(salaryMinRaw, 10) : null;
    const salaryMax = salaryMaxRaw ? parseInt(salaryMaxRaw, 10) : null;
    const now = Date.now();
    const oneDay = 86400000;

    return candidates.filter(c => {
      if (posId && c.positionId !== posId) return false;
      if (ageVal) {
        const d = parseFirstInteractionDate(c.prvniInterakce);
        if (ageVal.endsWith('-')) {
          const days = parseInt(ageVal, 10);
          if (!d) return true;
          if ((now - d.getTime()) / oneDay < days) return false;
        } else {
          const days = parseInt(ageVal, 10);
          if (!d) return false;
          if ((now - d.getTime()) / oneDay > days) return false;
        }
      }
      if (salaryMin != null || salaryMax != null) {
        const num = parseSalaryToNumber(c.salary);
        if (num == null) return false;
        if (salaryMin != null && num < salaryMin) return false;
        if (salaryMax != null && num > salaryMax) return false;
      }
      return true;
    });
  }

  const SEARCH_SALARY_RANGE_MAX = 150;

  function updateSearchSalarySliderUI() {
    const rMin = document.getElementById('search-range-min');
    const rMax = document.getElementById('search-range-max');
    const fill = document.getElementById('search-salary-slider-fill');
    const thumbMin = document.getElementById('search-thumb-min');
    const thumbMax = document.getElementById('search-thumb-max');
    if (!rMin || !rMax || !fill || !thumbMin || !thumbMax) return;
    const vMin = parseInt(rMin.value, 10);
    const vMax = parseInt(rMax.value, 10);
    const pMin = (vMin / SEARCH_SALARY_RANGE_MAX) * 100;
    const pMax = (vMax / SEARCH_SALARY_RANGE_MAX) * 100;
    fill.style.left = pMin + '%';
    fill.style.right = (100 - pMax) + '%';
    thumbMin.style.left = pMin + '%';
    thumbMax.style.left = pMax + '%';
  }

  function initSearchSalarySlider() {
    const rMin = document.getElementById('search-range-min');
    const rMax = document.getElementById('search-range-max');
    const numMin = document.getElementById('search-salary-min');
    const numMax = document.getElementById('search-salary-max');
    if (!rMin || !rMax || !numMin || !numMax) return;
    const syncRangeToInputs = () => {
      let vMin = parseInt(rMin.value, 10);
      let vMax = parseInt(rMax.value, 10);
      if (vMin > vMax) { vMin = vMax; rMin.value = vMin; }
      numMin.value = vMin === 0 ? '' : (vMin * 1000);
      numMax.value = vMax >= SEARCH_SALARY_RANGE_MAX ? '' : (vMax * 1000);
      updateSearchSalarySliderUI();
    };
    const syncInputsToRange = () => {
      const nMin = numMin.value.trim() ? Math.min(SEARCH_SALARY_RANGE_MAX, Math.max(0, Math.round(parseInt(numMin.value, 10) / 1000))) : 0;
      const nMax = numMax.value.trim() ? Math.min(SEARCH_SALARY_RANGE_MAX, Math.max(0, Math.round(parseInt(numMax.value, 10) / 1000))) : SEARCH_SALARY_RANGE_MAX;
      rMin.value = Math.min(nMin, nMax);
      rMax.value = Math.max(nMin, nMax);
      updateSearchSalarySliderUI();
    };
    rMin.addEventListener('input', () => { if (parseInt(rMin.value, 10) > parseInt(rMax.value, 10)) rMax.value = rMin.value; syncRangeToInputs(); });
    rMax.addEventListener('input', () => { if (parseInt(rMax.value, 10) < parseInt(rMin.value, 10)) rMin.value = rMax.value; syncRangeToInputs(); });
    numMin.addEventListener('change', syncInputsToRange);
    numMax.addEventListener('change', syncInputsToRange);
    numMin.placeholder = '0';
    numMax.placeholder = (SEARCH_SALARY_RANGE_MAX * 1000) + '';
    syncRangeToInputs();
  }

  function renderSearchResults(list) {
    const countEl = document.getElementById('search-results-count');
    const listEl = document.getElementById('search-results-list');
    if (!countEl || !listEl) return;
    countEl.textContent = list.length;
    if (list.length === 0) {
      listEl.innerHTML = '<div class="bg-white rounded-2xl p-8 border border-slate-100 text-center text-slate-500 text-sm">Žádní kandidáti nevyhovují kritériím.</div>';
      return;
    }
    listEl.innerHTML = list.map(c => {
      const pos = positions.find(p => p.id === c.positionId);
      const name = [c.surname, c.firstname].filter(Boolean).join(' ') || '—';
      const initials = avatarInitials(c);
      const posName = pos ? pos.name : (c.positionRaw || '').trim();
      const color = avatarColor(posName || name);
      const stageLabel = STAGE_LABELS[c.stage] || c.stage;
      const salaryStr = c.salary ? (c.salary + (c.salaryCurrency ? ' ' + c.salaryCurrency : '')) : '—';
      const dateStr = excelDateToString(c.prvniInterakce) || '—';
      const stageClass = c.stage === 'prijat' ? 'bg-emerald-100 text-emerald-700' : c.stage === 'zamitnut' ? 'bg-slate-100 text-slate-600' : 'bg-slate-100 text-slate-600';
      return `<div class="search-result-row bg-white rounded-2xl p-4 border border-slate-100 shadow-sm hover:shadow-md hover:border-cyan-200 transition-all cursor-pointer group flex items-center justify-between" data-id="${c.id}">
        <div class="flex items-center gap-4">
          <div class="w-10 h-10 rounded-full ${color} flex items-center justify-center font-bold text-sm shrink-0">${escapeHtml(initials)}</div>
          <div>
            <h3 class="font-bold text-slate-900 group-hover:text-cyan-600 transition-colors text-base">${escapeHtml(name)}</h3>
            <div class="flex items-center gap-2 mt-1">
              <span class="text-slate-500 text-xs font-medium">${escapeHtml(posName || '—')}</span>
              <span class="w-1 h-1 rounded-full bg-slate-300"></span>
              <span class="${stageClass} text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider">${escapeHtml(stageLabel)}</span>
            </div>
          </div>
        </div>
        <div class="text-right flex flex-col items-end gap-1">
          <span class="text-sm font-bold text-slate-700 bg-slate-50 px-2.5 py-1 rounded-lg">${escapeHtml(salaryStr)}</span>
          <span class="text-xs text-slate-400 font-medium">${escapeHtml(dateStr)}</span>
        </div>
      </div>`;
    }).join('');
    listEl.querySelectorAll('.search-result-row').forEach(row => {
      row.addEventListener('click', () => openCandidateDetail(row.dataset.id));
    });
  }

  function renderSearchModule() {
    fillPositionSelect(document.getElementById('search-filter-position'));
    initSearchSalarySlider();
    const list = filterCandidatesSearch();
    renderSearchResults(list);
  }

  function openCandidateDetail(id) {
    const c = candidates.find(x => x.id === id);
    if (!c) return;
    const pos = positions.find(p => p.id === c.positionId);
    const fullName = [c.surname, c.firstname].filter(Boolean).join(' ') || '—';
    const initials = avatarInitials(c);
    const posName = pos ? pos.name : (c.positionRaw || '').trim();
    const avColor = avatarColor(posName || fullName);
    const stageLabel = STAGE_LABELS[c.stage] || c.stage;
    const emailVal = c.email ? escapeHtml(c.email) : '';
    const phoneVal = c.phone ? escapeHtml(c.phone) : '';
    const linkedinVal = c.linkedin ? `<a href="${escapeHtml(c.linkedin)}" target="_blank" rel="noopener" class="text-sm font-medium text-slate-900 text-indigo-600 hover:underline break-all">${escapeHtml(c.linkedin)}</a>` : '<span class="text-sm font-medium text-slate-400">—</span>';
    const salaryVal = c.salary ? escapeHtml(c.salary + (c.salaryCurrency ? ' ' + c.salaryCurrency : '')) + (c.salaryNote ? ' <span class="text-slate-400 font-normal">(' + escapeHtml(c.salaryNote) + ')</span>' : '') : '—';
    const contractVal = c.contract ? escapeHtml(c.contract) : '—';
    const posVal = pos ? escapeHtml(pos.name) : '—';

    const extraSections = [
      { title: 'První interakce', text: excelDateToString(c.prvniInterakce) },
      { title: '1. kolo', text: c.kolo1 },
      { title: 'Úkol', text: c.ukol },
      { title: '2. kolo', text: c.kolo2 },
      { title: '3. kolo', text: c.kolo3 },
      { title: 'Důvod odmítnutí', text: c.rejectionReason }
    ].filter(s => s.text && String(s.text).trim());

    document.getElementById('candidate-detail-body').innerHTML = `
      <div class="flex items-start gap-5 mb-8">
        <div class="w-16 h-16 rounded-full ${avColor} flex items-center justify-center font-bold text-xl shrink-0 border-2 border-white shadow-sm">${initials}</div>
        <div class="flex-1 min-w-0">
          <h1 class="text-2xl font-extrabold text-slate-900 leading-tight">${escapeHtml(fullName)}</h1>
          <div class="flex flex-wrap items-center gap-2 mt-2">
            <span class="${badgeClass(c.stage)} inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold border border-slate-200">
              <span class="w-1.5 h-1.5 rounded-full bg-current opacity-70"></span>${escapeHtml(stageLabel)}
            </span>
            ${c.source ? `<span class="text-slate-300 text-sm">•</span><span class="text-slate-500 text-sm flex items-center gap-1"><svg class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"></path></svg>Zdroj: ${escapeHtml(c.source)}</span>` : ''}
          </div>
          <div class="flex flex-wrap gap-2 mt-4">
            ${c.email ? `<a href="mailto:${escapeHtml(c.email)}" class="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-lg text-sm font-medium transition-colors"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path></svg>Napsat e-mail</a>` : ''}
            ${c.phone ? `<button type="button" class="detail-copy-trigger inline-flex items-center gap-1.5 px-3 py-2 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-lg text-sm font-medium transition-colors" data-copy="${escapeHtml(c.phone)}"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.586a1 1 0 01.707.293l7.414 7.414a1 1 0 01.293.707V19a2 2 0 01-2 2h-1M8 7V5a2 2 0 012-2h2M8 7v10M8 7h8"></path></svg>Zkopírovat telefon</button>` : ''}
          </div>
          ${(openings.filter(o => o.status === 'aktivni').length > 0) ? `
          <div class="mt-5 pt-5 border-t border-slate-100">
            <p class="text-[11px] text-slate-500 uppercase tracking-wider mb-2 font-bold">Přidat do výběrového řízení</p>
            <div class="flex flex-wrap gap-2 items-center">
              <select id="detail-add-to-opening" class="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500 min-w-[200px]">
                <option value="">— vyberte výběrku —</option>
                ${openings.filter(o => o.status === 'aktivni').map(o => `<option value="${o.id}">${escapeHtml(o.title || 'Výběrové řízení')}</option>`).join('')}
              </select>
              <button type="button" id="detail-btn-add-to-opening" class="px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-white text-sm font-medium rounded-lg transition-colors">Přidat a zařadit na telefonát</button>
            </div>
            <p class="text-xs text-slate-400 mt-1.5">Kandidát bude přiřazen k výběrce a fáze se změní na Telefonát.</p>
          </div>
          ` : ''}
        </div>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-5 mb-8">
        <div class="bg-slate-50/60 border border-slate-100 rounded-2xl p-5">
          <h3 class="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-4 flex items-center gap-2">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path></svg>
            Kontaktní údaje
          </h3>
          <div class="space-y-4">
            <div>
              <p class="text-[11px] text-slate-500 uppercase tracking-wide mb-1">E-mail</p>
              <div class="flex items-center gap-2">
                ${c.email ? `<a href="mailto:${escapeHtml(c.email)}" class="text-sm font-medium text-slate-900 text-indigo-600 hover:underline break-all">${emailVal}</a><button type="button" class="detail-copy-trigger text-slate-400 hover:text-indigo-600 transition-colors p-0.5" data-copy="${escapeHtml(c.email)}" title="Kopírovat">${copyIcon()}</button>` : '<span class="text-sm font-medium text-slate-400">—</span>'}
              </div>
            </div>
            <div>
              <p class="text-[11px] text-slate-500 uppercase tracking-wide mb-1">Telefon</p>
              ${c.phone ? `<div class="flex items-center gap-2"><span class="text-sm font-medium text-slate-900">${phoneVal}</span><button type="button" class="detail-copy-trigger text-slate-400 hover:text-indigo-600 transition-colors p-0.5" data-copy="${escapeHtml(c.phone)}" title="Kopírovat">${copyIcon()}</button></div>` : '<p class="text-sm font-medium text-slate-400">—</p>'}
            </div>
            <div>
              <p class="text-[11px] text-slate-500 uppercase tracking-wide mb-1">LinkedIn</p>
              <div class="text-sm font-medium text-slate-900">${linkedinVal}</div>
            </div>
          </div>
        </div>

        <div class="bg-slate-50/60 border border-slate-100 rounded-2xl p-5">
          <h3 class="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-4 flex items-center gap-2">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path></svg>
            Detaily pozice
          </h3>
          <div class="space-y-4">
            <div>
              <p class="text-[11px] text-slate-500 uppercase tracking-wide mb-1">Hlášená pozice</p>
              <p class="text-sm font-medium text-slate-900">${posVal}</p>
            </div>
            <div>
              <p class="text-[11px] text-slate-500 uppercase tracking-wide mb-1">Očekávaný plat</p>
              <p class="text-sm font-medium text-slate-900">${salaryVal}</p>
            </div>
            <div>
              <p class="text-[11px] text-slate-500 uppercase tracking-wide mb-1">HPP / IČO</p>
              <p class="text-sm font-medium text-slate-900">${contractVal}</p>
            </div>
            ${c.startDate ? `<div><p class="text-[11px] text-slate-500 uppercase tracking-wide mb-1">Datum nástupu</p><p class="text-sm font-medium text-slate-900">${escapeHtml(c.startDate)}</p></div>` : ''}
            ${c.languages ? `<div><p class="text-[11px] text-slate-500 uppercase tracking-wide mb-1">Jazyky</p><p class="text-sm font-medium text-slate-900">${escapeHtml(c.languages)}</p></div>` : ''}
            ${c.potential ? `<div><p class="text-[11px] text-slate-500 uppercase tracking-wide mb-1">Potenciál</p><p class="text-sm font-medium text-slate-900">${escapeHtml(c.potential)}</p></div>` : ''}
          </div>
        </div>
      </div>

      ${(c.notes && c.notes.trim()) ? `
      <div class="mb-8">
        <h3 class="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-3">Poznámky</h3>
        <div class="bg-amber-50/50 border border-amber-100 border-l-4 border-l-amber-300 rounded-r-xl p-4">
          <p class="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">${escapeHtml(c.notes)}</p>
        </div>
      </div>
      ` : ''}

      ${extraSections.length ? `
      <div class="space-y-4">
        <h3 class="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Průběh a hodnocení</h3>
        ${extraSections.map(s => `
          <div class="bg-slate-50/50 border border-slate-100 rounded-xl p-4">
            <p class="text-[11px] text-slate-500 uppercase tracking-wide mb-1.5">${escapeHtml(s.title)}</p>
            <p class="text-sm font-medium text-slate-900 whitespace-pre-wrap leading-relaxed">${escapeHtml(String(s.text))}</p>
          </div>
        `).join('')}
      </div>
      ` : ''}
    `;
    document.getElementById('btn-detail-edit').onclick = () => { closeModal('modal-candidate-detail'); openCandidateModal(id); };
    document.getElementById('modal-candidate-detail').classList.add('modal-open');
    document.getElementById('modal-candidate-detail').setAttribute('aria-hidden', 'false');

    document.querySelectorAll('#candidate-detail-body .detail-copy-trigger').forEach(el => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        const copy = el.dataset.copy;
        if (!copy) return;
        navigator.clipboard.writeText(copy).then(() => {
          const svg = el.querySelector('svg');
          if (svg) { svg.classList.remove('text-slate-300', 'text-slate-400'); svg.classList.add('text-emerald-500'); setTimeout(() => { svg.classList.add('text-slate-400'); svg.classList.remove('text-emerald-500'); }, 1200); }
        });
      });
    });

    const addToOpeningBtn = document.getElementById('detail-btn-add-to-opening');
    const addToOpeningSelect = document.getElementById('detail-add-to-opening');
    if (addToOpeningBtn && addToOpeningSelect) {
      addToOpeningBtn.addEventListener('click', async () => {
        const openingId = addToOpeningSelect.value;
        if (!openingId) return;
        const cand = candidates.find(x => x.id === id);
        if (!cand) return;
        cand.openingId = openingId;
        cand.stage = 'telefonat';
        await saveCandidate(cand);
        await loadCandidates();
        closeModal('modal-candidate-detail');
        renderCandidates();
        renderSearchResults(filterCandidatesSearch());
        renderPipelineIfActive && renderPipelineIfActive();
      });
    }
  }

  function openNotesModal(candidateId, fieldName, label) {
    const c = candidates.find(x => x.id === candidateId);
    if (!c) return;
    document.getElementById('notes-candidate-id').value = candidateId;
    document.getElementById('notes-field-name').value = fieldName;
    document.getElementById('modal-notes-title').textContent = label + ' – ' + [c.surname, c.firstname].filter(Boolean).join(' ');
    document.getElementById('notes-textarea').value = c[fieldName] || '';
    document.getElementById('modal-notes').classList.add('modal-open');
    document.getElementById('modal-notes').setAttribute('aria-hidden', 'false');
    setTimeout(() => document.getElementById('notes-textarea').focus(), 100);
  }

  async function saveNotesModal() {
    const id = document.getElementById('notes-candidate-id').value;
    const field = document.getElementById('notes-field-name').value;
    const text = document.getElementById('notes-textarea').value;
    const c = candidates.find(x => x.id === id);
    if (!c) return;
    c[field] = text;
    await saveCandidate(c);
    closeModal('modal-notes');
    renderCandidates();
  }

  const CANDIDATE_FIELDS = [
    'surname', 'firstname', 'email', 'phone', 'linkedin', 'source',
    'gender', 'salary', 'salaryCurrency', 'salaryNote', 'contract',
    'startDate', 'languages', 'potential',
    'prvniInterakce', 'notes',
    'kolo1', 'kolo2', 'kolo3', 'ukol', 'rejectionReason'
  ];

  function openCandidateModal(id) {
    document.getElementById('modal-candidate-title').textContent = id ? 'Upravit kandidáta' : 'Nový kandidát';
    document.getElementById('candidate-id').value = id || '';
    fillPositionSelect(document.getElementById('candidate-position'), false);
    if (id) {
      const c = candidates.find(x => x.id === id);
      if (!c) return;
      CANDIDATE_FIELDS.forEach(f => { const el = document.getElementById('candidate-' + f); if (el) el.value = c[f] || ''; });
      document.getElementById('candidate-position').value = c.positionId || '';
      document.getElementById('candidate-stage').value = c.stage || 'novy_kandidat';
    } else {
      CANDIDATE_FIELDS.forEach(f => { const el = document.getElementById('candidate-' + f); if (el) el.value = ''; });
      document.getElementById('candidate-position').value = positions[0] ? positions[0].id : '';
      document.getElementById('candidate-stage').value = 'novy_kandidat';
    }
    document.getElementById('modal-candidate').classList.add('modal-open');
    document.getElementById('modal-candidate').setAttribute('aria-hidden', 'false');
  }

  async function saveCandidateFromModal() {
    const id = document.getElementById('candidate-id').value;
    const surname = document.getElementById('candidate-surname').value.trim();
    const firstname = document.getElementById('candidate-firstname').value.trim();
    if (!surname && !firstname) return alert('Zadejte jméno nebo příjmení.');
    const record = { id: id || undefined };
    CANDIDATE_FIELDS.forEach(f => { const el = document.getElementById('candidate-' + f); record[f] = el ? el.value.trim() : ''; });
    record.positionId = document.getElementById('candidate-position').value || null;
    record.stage = document.getElementById('candidate-stage').value;
    await saveCandidate(record); await loadCandidates(); renderCandidates(); closeModal('modal-candidate'); renderDashboard();
  }

  // --- Applications ---
  function renderApplications() {
    const visible = applications.filter(a => !a.convertedToCandidateId);
    const sorted = [...visible].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const tbody = document.getElementById('applications-tbody');
    tbody.innerHTML = sorted.map(app => {
      const pos = positions.find(p => p.id === app.positionId);
      const posName = pos ? pos.name : (app.positionName || '—');
      const date = app.createdAt ? new Date(app.createdAt).toLocaleString('cs-CZ') : '—';
      const files = (app.files && app.files.length) ? app.files.map(f => f.name).join(', ') : '—';
      const converted = app.convertedToCandidateId ? ` <span class="${TW.badge} ${TW.badgeSuccess}">Převedeno</span>` : '';
      return `<tr class="hover:bg-slate-50/50 transition-colors">
        <td class="${TW.td}">${escapeHtml(date)}</td>
        <td class="${TW.td} font-medium text-slate-800">${escapeHtml([app.surname, app.firstname].filter(Boolean).join(' ') || app.email || '—')}</td>
        <td class="${TW.td}">${escapeHtml(posName)}${converted}</td>
        <td class="${TW.td}">${escapeHtml(app.email || '')} ${escapeHtml(app.phone || '')}</td>
        <td class="${TW.td}">${escapeHtml(files)}</td>
        <td class="${TW.td}"><button type="button" class="${TW.btn} ${TW.btnSmall} ${TW.btnSecondary} btn-view-application" data-id="${app.id}">Detail</button></td>
      </tr>`;
    }).join('') || `<tr><td colspan="6" class="px-5 py-8 text-center text-slate-400 italic">Zatím žádné přihlášky z webu.</td></tr>`;
    tbody.querySelectorAll('.btn-view-application').forEach(btn => {
      btn.addEventListener('click', () => openApplicationDetail(btn.dataset.id));
    });
  }

  function openApplicationDetail(id) {
    currentApplicationId = id;
    const app = applications.find(a => a.id === id);
    if (!app) return;
    const pos = positions.find(p => p.id === app.positionId);
    const body = document.getElementById('application-detail-body');
    const linkedInHtml = app.linkedin
      ? `<a href="${app.linkedin.replace(/"/g, '&quot;')}" target="_blank" rel="noopener" class="text-indigo-600 hover:underline text-sm" title="${escapeHtml(app.linkedin)}">Otevřít profil</a>`
      : '<span class="text-slate-400">—</span>';
    const filesHtml = (app.files && app.files.length)
      ? app.files.map(f =>
          `<a href="#" class="download-file block text-indigo-600 hover:underline text-sm truncate max-w-full" data-appid="${app.id}" data-index="${app.files.indexOf(f)}" title="${escapeHtml(f.name)}">${escapeHtml(f.name)}</a> <span class="text-slate-400 text-xs">(${(f.size / 1024).toFixed(1)} kB)</span>`
        ).join('')
      : '<span class="text-slate-400 text-sm">Žádné soubory.</span>';
    body.innerHTML = `
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm overflow-visible">
        <div><dt class="text-xs font-medium text-slate-500 uppercase tracking-wider">Jméno</dt><dd class="text-slate-800 mt-0.5">${escapeHtml([app.surname, app.firstname].filter(Boolean).join(' ') || '—')}</dd></div>
        <div><dt class="text-xs font-medium text-slate-500 uppercase tracking-wider">E-mail</dt><dd class="text-slate-800 mt-0.5 break-all">${escapeHtml(app.email || '—')}</dd></div>
        <div><dt class="text-xs font-medium text-slate-500 uppercase tracking-wider">Telefon</dt><dd class="text-slate-800 mt-0.5">${escapeHtml(app.phone || '—')}</dd></div>
        <div><dt class="text-xs font-medium text-slate-500 uppercase tracking-wider">LinkedIn</dt><dd class="mt-0.5">${linkedInHtml}</dd></div>
        <div><dt class="text-xs font-medium text-slate-500 uppercase tracking-wider">Pozice</dt><dd class="text-slate-800 mt-0.5">${escapeHtml(pos ? pos.name : (app.positionName || '—'))}</dd></div>
        <div><dt class="text-xs font-medium text-slate-500 uppercase tracking-wider">Datum</dt><dd class="text-slate-800 mt-0.5">${app.createdAt ? new Date(app.createdAt).toLocaleString('cs-CZ') : '—'}</dd></div>
        ${app.message ? `<div class="sm:col-span-2"><dt class="text-xs font-medium text-slate-500 uppercase tracking-wider">Zpráva</dt><dd class="text-slate-700 mt-0.5 break-words whitespace-pre-wrap">${escapeHtml(app.message)}</dd></div>` : ''}
        <div class="sm:col-span-2"><dt class="text-xs font-medium text-slate-500 uppercase tracking-wider">Soubory</dt><dd class="mt-0.5 space-y-0.5">${filesHtml}</dd></div>
      </div>`;
    body.querySelectorAll('.download-file').forEach(a => {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        const app2 = applications.find(x => x.id === a.dataset.appid);
        const file = app2.files[parseInt(a.dataset.index, 10)];
        if (file && file.data) {
          const blob = base64ToBlob(file.data, file.type);
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a'); link.href = url; link.download = file.name; link.click();
          URL.revokeObjectURL(url);
        }
      });
    });
    document.getElementById('modal-application').classList.add('modal-open');
    document.getElementById('modal-application').setAttribute('aria-hidden', 'false');
  }

  function base64ToBlob(base64, mime) {
    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) byteNumbers[i] = byteCharacters.charCodeAt(i);
    return new Blob([new Uint8Array(byteNumbers)], { type: mime || 'application/octet-stream' });
  }

  async function convertApplicationToCandidate(targetStage) {
    if (!currentApplicationId) return;
    const app = applications.find(a => a.id === currentApplicationId);
    if (!app || app.convertedToCandidateId) return;
    const posId = app.positionId || (positions[0] ? positions[0].id : null);
    const candidate = await saveCandidate({
      surname: app.surname || '', firstname: app.firstname || '', email: app.email || '',
      phone: app.phone || '', linkedin: app.linkedin || '', positionId: posId,
      openingId: app.openingId || null,
      stage: targetStage, source: 'Job stránka',
      notes: 'Přihláška z webu' + (app.message ? '\n\n' + app.message : '')
    });
    app.convertedToCandidateId = candidate.id;
    await saveApplication(app); await loadApplications(); await loadCandidates();
    closeModal('modal-application'); renderApplications(); renderCandidates(); renderDashboard();
  }

  document.getElementById('btn-application-reject').addEventListener('click', async () => {
    if (!confirm('Odmítnout tuto přihlášku a zařadit kandidáta jako zamítnutého?')) return;
    await convertApplicationToCandidate('zamitnut');
  });

  document.getElementById('btn-application-accept').addEventListener('click', async () => {
    if (!confirm('Schválit přihlášku a zařadit kandidáta na telefonát?')) return;
    await convertApplicationToCandidate('telefonat');
  });

  // --- Import (XLS / XLSX / CSV) ---
  let importedSheets = null;
  let parsedCandidates = [];
  let currentImportSheets = [];

  const SHEET_TO_POSITION = {
    'PPC': 'PPC Specialista', 'social': 'Social Ads Specialista',
    'DATA': 'DATA specialista', 'Account Manager': 'Account Manager',
    'RTB specialista': 'RTB specialista', 'Business Manager': 'Business Manager',
    '\u2705Business Manager': 'Business Manager', 'Office Manager': 'Office Manager',
    '\u2705Office Manager': 'Office Manager'
  };
  const SKIP_SHEETS = ['info', 'Kurzy osloven\u00ed'];

  function findCol(headers, ...names) {
    const norm = headers.map(h => (h || '').trim().toLowerCase());
    for (const n of names) { const i = norm.indexOf(n.toLowerCase()); if (i >= 0) return i; }
    for (const n of names) { const i = norm.findIndex(h => h.includes(n.toLowerCase())); if (i >= 0) return i; }
    return -1;
  }

  function normalizeStageImport(text) {
    if (!text) return 'novy_kandidat';
    const t = text.toLowerCase().replace(/\s+/g, '_').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const map = {
      novy_kandidat:'novy_kandidat', nova_prihlaska:'novy_kandidat', nova:'novy_kandidat', prihlaska:'novy_kandidat', new:'novy_kandidat',
      telefonat:'telefonat', osloven:'telefonat', osloven_a:'telefonat', oslovena:'telefonat', contacted:'telefonat', sj_reakce:'telefonat', 'e-mail':'telefonat', email:'telefonat',
      ukol:'ukol', zadost:'ukol', zadost_o_pozici:'ukol', dotaznik:'ukol', zaslan_dotaznik:'ukol', cekam:'ukol', cekam_na_odpoved:'ukol', ceka_se:'ukol', cekame:'ukol',
      kolo1:'kolo1', rozhovor:'kolo1', pohovor:'kolo1', interview:'kolo1', '1._kolo':'kolo1', '1_kolo':'kolo1',
      kolo2:'kolo2', druhe_kolo:'kolo2', '2._kolo':'kolo2', '2_kolo':'kolo2', druhy_pohovor:'kolo2', nabidka:'nabidka', nabidnuto:'nabidka', offer:'nabidka',
      prijat:'prijat', prijata:'prijat', prijato:'prijat', nastoupil:'prijat', nastoupila:'prijat', posunuto_na_pozici:'prijat', posunuto:'prijat', hired:'prijat', accepted:'prijat',
      zamitnut:'zamitnut', zamitnuta:'zamitnut', zamitnuto:'zamitnut', odmitnuto:'zamitnut', odmitnut:'zamitnut', uzavreno:'zamitnut', uzavrena:'zamitnut', rejected:'zamitnut', closed:'zamitnut',
    };
    return map[t] || (t in STAGE_LABELS ? t : 'novy_kandidat');
  }

  function parseSheetToCandidates(headers, rows, sheetName) {
    const out = [];
    const iSurname = findCol(headers, 'P\u0159\u00edjmen\u00ed');
    const iFirst = findCol(headers, 'Jm\u00e9no');
    const iEmail = findCol(headers, 'e-mail', 'email');
    const iContact = findCol(headers, 'Kontakt');
    const iPhone = findCol(headers, 'telefon');
    const iLinkedin = findCol(headers, 'LinkedIn');
    const iSource = findCol(headers, 'Zdroj');
    const iPrvni = findCol(headers, 'Prvn\u00ed interakce');
    const iNotes = findCol(headers, 'Pozn\u00e1mky');
    const iKolo1 = findCol(headers, '1. kolo');
    const iKolo2 = findCol(headers, '2.kolo', '2. kolo');
    const iKolo3 = findCol(headers, '3. kolo');
    const iUkol = findCol(headers, '\u00dakol');
    const iDuvod = findCol(headers, 'D\u016fvod odm\u00edtnut\u00ed', 'D\u016fvod zam\u00edtnut\u00ed');
    const iPlat = findCol(headers, 'Plat');
    const iContract = findCol(headers, 'HPP x I\u010cO', 'HPP');
    const iPos = findCol(headers, 'Jakou pozici nakonec?', 'Pozice');
    const iStage = findCol(headers, 'Stav', 'F\u00e1ze');
    const posName = SHEET_TO_POSITION[sheetName] || null;
    for (const row of rows) {
      const sv = (i) => i >= 0 ? String(row[i] || '').trim() : '';
      const surname = sv(iSurname), firstname = sv(iFirst);
      if (!surname && !firstname && !sv(iEmail) && !sv(iContact)) continue;

      let rawEmail = sv(iEmail);
      let rawPhone = sv(iPhone);
      const rawContact = sv(iContact);
      if (rawContact) {
        const split = splitContactField(rawContact);
        if (!rawEmail && split.emails.length) rawEmail = split.emails.join(', ');
        else if (split.emails.length) rawEmail = [rawEmail, ...split.emails].filter(Boolean).join(', ');
        if (!rawPhone && split.phones.length) rawPhone = split.phones.join(', ');
        else if (split.phones.length) rawPhone = [rawPhone, ...split.phones].filter(Boolean).join(', ');
      }
      if (!rawPhone && rawEmail) {
        const split = splitContactField(rawEmail);
        rawEmail = split.emails.join(', ');
        if (split.phones.length) rawPhone = split.phones.join(', ');
      }
      if (rawPhone && !rawEmail) {
        const split = splitContactField(rawPhone);
        rawPhone = split.phones.join(', ');
        if (split.emails.length) rawEmail = split.emails.join(', ');
      }

      const combined = [rawEmail, rawPhone].filter(Boolean).join(' ');
      const emails = extractEmails(combined);
      const phones = extractPhones(combined);
      rawEmail = emails.join(', ');
      rawPhone = phones.join(', ');

      out.push({ surname, firstname, email: rawEmail, phone: rawPhone,
        linkedin: sv(iLinkedin), source: sv(iSource), prvniInterakce: excelDateToString(sv(iPrvni)), notes: sv(iNotes),
        kolo1: sv(iKolo1), kolo2: sv(iKolo2), kolo3: sv(iKolo3), ukol: sv(iUkol), rejectionReason: sv(iDuvod),
        salary: sv(iPlat), contract: sv(iContract), positionName: posName || sv(iPos), stage: normalizeStageImport(sv(iStage)) });
    }
    return out;
  }

  const IMPORT_FIELD_OPTIONS = [
    { value: '', label: '— Neimportovat —' },
    { value: 'surname', label: 'Příjmení' },
    { value: 'firstname', label: 'Jméno' },
    { value: 'email_raw', label: 'E-mail' },
    { value: 'phone_raw', label: 'Telefon' },
    { value: 'contact_raw', label: 'Kontakt (smíšené e-mail/telefon)' },
    { value: 'linkedin', label: 'LinkedIn' },
    { value: 'source', label: 'Zdroj' },
    { value: 'positionName', label: 'Pozice' },
    { value: 'stage_raw', label: 'Fáze / stav' },
    { value: 'salary', label: 'Plat' },
    { value: 'contract', label: 'HPP / IČO' },
    { value: 'prvniInterakce_raw', label: 'První interakce (datum)' },
    { value: 'notes', label: 'Poznámky' },
    { value: 'kolo1', label: '1. kolo' },
    { value: 'kolo2', label: '2. kolo' },
    { value: 'kolo3', label: '3. kolo' },
    { value: 'ukol', label: 'Úkol' },
    { value: 'rejectionReason', label: 'Důvod odmítnutí' },
    { value: 'watch', label: 'Sledovat' },
  ];

  /** Hlavičky pro šablonu XLS – sloupce používané v systému (bez Neimportovat a Kontakt smíšený). */
  const IMPORT_TEMPLATE_HEADERS = IMPORT_FIELD_OPTIONS
    .filter(o => o.value && o.value !== 'contact_raw')
    .map(o => o.label);

  function guessImportField(header) {
    const h = (header || '').trim().toLowerCase();
    if (!h) return '';
    if (h.includes('příjmen')) return 'surname';
    if (h.includes('prijmen')) return 'surname';
    if (h.includes('jméno') || h === 'jmeno') return 'firstname';
    if (h.includes('e-mail') || h === 'email') return 'email_raw';
    if (h.includes('telefon') || h.includes('phone') || h === 'tel') return 'phone_raw';
    if (h.includes('kontakt')) return 'contact_raw';
    if (h.includes('linkedin')) return 'linkedin';
    if (h.includes('zdroj')) return 'source';
    if (h.includes('pozice') || h.includes('position')) return 'positionName';
    if (h.includes('stav') || h.includes('fáze') || h.includes('faze')) return 'stage_raw';
    if (h.includes('plat') || h.includes('salary')) return 'salary';
    if (h.includes('hpp') || h.includes('ičo') || h.includes('ico')) return 'contract';
    if (h.includes('první interakce') || h.includes('prvni interakce')) return 'prvniInterakce_raw';
    if (h.includes('poznám') || h.includes('poznam')) return 'notes';
    if (h.startsWith('1.') || h.includes('1. kolo')) return 'kolo1';
    if (h.startsWith('2.') || h.includes('2. kolo')) return 'kolo2';
    if (h.startsWith('3.') || h.includes('3. kolo')) return 'kolo3';
    if (h.includes('úkol') || h.includes('ukol')) return 'ukol';
    if (h.includes('důvod odmítnutí') || h.includes('duvod odmitnuti') || h.includes('důvod zamítnutí')) return 'rejectionReason';
    if (h.includes('sledovat')) return 'watch';
    return '';
  }

  function downloadImportTemplate() {
    if (typeof XLSX === 'undefined') {
      alert('Knihovna pro Excel není načtena. Obnovte stránku.');
      return;
    }
    const sheetData = [IMPORT_TEMPLATE_HEADERS];
    const ws = XLSX.utils.aoa_to_sheet(sheetData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Kandidáti');
    XLSX.writeFile(wb, 'sablona-import-kandidatu.xlsx');
  }

  function buildImportMappingUI(selectedSheets) {
    currentImportSheets = selectedSheets;
    const container = document.getElementById('import-mapping-container');
    if (!container) return;
    const headerMap = new Map();
    for (const name of selectedSheets) {
      const s = importedSheets[name];
      if (!s) continue;
      s.headers.forEach((h, idx) => {
        const key = (h || '').trim();
        if (!key) return;
        if (!headerMap.has(key)) {
          const exampleRow = s.rows.find(r => (r[idx] || '').toString().trim());
          headerMap.set(key, exampleRow ? String(exampleRow[idx] || '').trim() : '');
        }
      });
    }
    const rows = Array.from(headerMap.entries());
    if (!rows.length) {
      container.innerHTML = '';
      return;
    }
    const optionsHtml = IMPORT_FIELD_OPTIONS.map(o => `<option value="${o.value}">${escapeHtml(o.label)}</option>`).join('');
    container.innerHTML = `
      <h3 class="text-sm font-semibold text-slate-700 mb-2">Přiřazení sloupců</h3>
      <p class="text-xs text-slate-500 mb-3">Zkontrolujte, co který sloupec obsahuje. Sloupce, které nechcete importovat, nechte jako „Neimportovat“.</p>
      <div class="border border-slate-100 rounded-lg divide-y divide-slate-100 overflow-hidden">
        ${rows.map(([header, sample]) => `
          <div class="grid grid-cols-1 sm:grid-cols-[2fr,2fr,3fr] gap-3 px-3 py-2 items-center">
            <div class="text-sm font-medium text-slate-700 truncate" title="${escapeHtml(header)}">${escapeHtml(header)}</div>
            <div>
              <select class="import-mapping-select w-full border border-slate-200 rounded-lg text-xs py-1.5 px-2 focus:outline-none focus:ring-1 focus:ring-indigo-500/40 focus:border-indigo-400" data-header="${escapeHtml(header)}">
                ${optionsHtml}
              </select>
            </div>
            <div class="text-xs text-slate-400 truncate" title="${escapeHtml(sample)}">${escapeHtml(sample || '— ukázková hodnota není')}</div>
          </div>
        `).join('')}
      </div>
    `;
    container.querySelectorAll('.import-mapping-select').forEach(sel => {
      const h = sel.dataset.header || '';
      const guessed = guessImportField(h);
      sel.value = guessed;
      sel.addEventListener('change', () => { rebuildImportPreview(); });
    });
  }

  function getCurrentImportMapping() {
    const container = document.getElementById('import-mapping-container');
    if (!container) return [];
    const mapping = [];
    container.querySelectorAll('.import-mapping-select').forEach(sel => {
      const header = sel.dataset.header || '';
      const field = sel.value || '';
      if (header && field) mapping.push({ header, field });
    });
    return mapping;
  }

  function parseSheetsWithMapping(selectedSheets, mapping) {
    const headerToField = {};
    mapping.forEach(m => {
      const key = (m.header || '').trim().toLowerCase();
      if (!key) return;
      headerToField[key] = m.field;
    });
    const all = [];
    for (const name of selectedSheets) {
      const s = importedSheets[name];
      if (!s) continue;
      const headers = s.headers;
      const rows = s.rows;
      const posNameFromSheet = SHEET_TO_POSITION[name] || null;
      for (const row of rows) {
        const raw = {
          surname: '', firstname: '', email_raw: '', phone_raw: '', contact_raw: '',
          linkedin: '', source: '', positionName: posNameFromSheet || '',
          stage_raw: '', salary: '', contract: '', prvniInterakce_raw: '',
          notes: '', kolo1: '', kolo2: '', kolo3: '', ukol: '', rejectionReason: '', watch: '',
        };
        headers.forEach((h, idx) => {
          const key = (h || '').trim().toLowerCase();
          if (!key || !headerToField[key]) return;
          const field = headerToField[key];
          const val = String(row[idx] || '').trim();
          if (!val) return;
          if (raw[field]) raw[field] += ' ' + val;
          else raw[field] = val;
        });
        if (!raw.surname && !raw.firstname && !raw.email_raw && !raw.phone_raw && !raw.contact_raw) continue;
        let rawEmail = raw.email_raw;
        let rawPhone = raw.phone_raw;
        const rawContact = raw.contact_raw;
        if (rawContact) {
          const split = splitContactField(rawContact);
          if (!rawEmail && split.emails.length) rawEmail = split.emails.join(', ');
          else if (split.emails.length) rawEmail = [rawEmail, ...split.emails].filter(Boolean).join(', ');
          if (!rawPhone && split.phones.length) rawPhone = split.phones.join(', ');
          else if (split.phones.length) rawPhone = [rawPhone, ...split.phones].filter(Boolean).join(', ');
        }
        if (!rawPhone && rawEmail) {
          const split = splitContactField(rawEmail);
          rawEmail = split.emails.join(', ');
          if (split.phones.length) rawPhone = split.phones.join(', ');
        }
        if (rawPhone && !rawEmail) {
          const split = splitContactField(rawPhone);
          rawPhone = split.phones.join(', ');
          if (split.emails.length) rawEmail = split.emails.join(', ');
        }
        const combined = [rawEmail, rawPhone].filter(Boolean).join(' ');
        const emails = extractEmails(combined);
        const phones = extractPhones(combined);
        rawEmail = emails.join(', ');
        rawPhone = phones.join(', ');
        const stage = normalizeStageImport(raw.stage_raw);
        const watchVal = (raw.watch || '').toString().toLowerCase();
        const watch = watchVal === 'ano' || watchVal === '1' || watchVal === 'yes' || watchVal === 'x';
        all.push({
          surname: raw.surname, firstname: raw.firstname,
          email: rawEmail, phone: rawPhone,
          linkedin: raw.linkedin, source: raw.source,
          prvniInterakce: excelDateToString(raw.prvniInterakce_raw),
          notes: raw.notes, kolo1: raw.kolo1, kolo2: raw.kolo2, kolo3: raw.kolo3,
          ukol: raw.ukol, rejectionReason: raw.rejectionReason,
          salary: raw.salary, contract: raw.contract,
          positionName: raw.positionName || '', stage, watch,
        });
      }
    }
    return all;
  }

  function rebuildImportPreview() {
    const mapping = getCurrentImportMapping();
    parsedCandidates = parseSheetsWithMapping(currentImportSheets, mapping);
    const panel = document.getElementById('import-preview-panel');
    if (!panel) return;
    panel.hidden = false;
    document.getElementById('import-preview-desc').textContent =
      `Nalezeno ${parsedCandidates.length} kandidátů z ${currentImportSheets.length} listů.`;
    const table = document.getElementById('import-preview-table');
    const previewRows = parsedCandidates.slice(0, 15);
    table.innerHTML = `<thead><tr class="bg-slate-50/80">
      <th class="${TW.th}">Příjmení</th><th class="${TW.th}">Jméno</th><th class="${TW.th}">Pozice</th><th class="${TW.th}">Fáze</th><th class="${TW.th}">Kontakt</th><th class="${TW.th}">Poznámky</th>
    </tr></thead><tbody>` + previewRows.map(c => `<tr class="hover:bg-slate-50/50">
      <td class="${TW.td}">${escapeHtml(c.surname)}</td>
      <td class="${TW.td}">${escapeHtml(c.firstname)}</td>
      <td class="${TW.td}">${escapeHtml(c.positionName || '—')}</td>
      <td class="${TW.td}">${escapeHtml(STAGE_LABELS[c.stage] || c.stage)}</td>
      <td class="${TW.td}">${escapeHtml(c.email || c.phone || '—')}</td>
      <td class="${TW.td}"><span class="cell-truncate">${escapeHtml((c.notes || c.prvniInterakce || '—').substring(0, 60))}</span></td>
    </tr>`).join('') +
    (parsedCandidates.length > 15 ? `<tr><td colspan="6" class="px-5 py-2 text-sm text-slate-400">… a dalších ${parsedCandidates.length - 15}</td></tr>` : '') +
    `</tbody>`;
    document.getElementById('import-log').hidden = true;
  }

  function showImportLog(lines) {
    const el = document.getElementById('import-log');
    el.hidden = false;
    el.innerHTML = lines.map(l => `<p class="my-0.5">${l}</p>`).join('');
  }

  async function refreshAllViews() {
    await loadPositions(); openings = await getAllOpenings(); await loadCandidates();
    fillPositionSelect(document.getElementById('filter-position'));
    fillPositionSelect(document.getElementById('candidate-position'));
    renderDashboard(); renderCandidates(); renderPositions(); renderOpenings();
  }

  function handleFileSelected(file) {
    if (!file) return;
    const info = document.getElementById('import-file-info');
    info.hidden = false;
    info.innerHTML = `<span class="font-semibold text-slate-800">${escapeHtml(file.name)}</span><span class="text-slate-400 text-sm">${(file.size / 1024).toFixed(0)} kB</span>`;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const data = new Uint8Array(ev.target.result);
      const wb = XLSX.read(data, { type: 'array' });
      importedSheets = {};
      const sheetPanel = document.getElementById('import-sheet-panel');
      const sheetList = document.getElementById('import-sheet-list');
      const usableSheets = wb.SheetNames.filter(n => !SKIP_SHEETS.includes(n));
      for (const name of usableSheets) {
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '' });
        if (rows.length < 2) continue;
        importedSheets[name] = { headers: rows[0].map(h => String(h || '').trim()), rows: rows.slice(1) };
      }
      const sheetNames = Object.keys(importedSheets);
      if (!sheetNames.length) {
        sheetPanel.hidden = true;
        document.getElementById('import-preview-panel').hidden = true;
        showImportLog(['Soubor neobsahuje žádné použitelné listy.']);
        return;
      }
      if (sheetNames.length === 1) { sheetPanel.hidden = true; buildPreview(sheetNames); }
      else {
        sheetPanel.hidden = false;
        sheetList.innerHTML = `<div class="import-sheet-checks">` +
          sheetNames.map(n => `<label><input type="checkbox" value="${escapeHtml(n)}" checked> ${escapeHtml(n)} <span class="sheet-row-count">(${importedSheets[n].rows.length} řádků)</span></label>`).join('') +
          `</div><button type="button" class="${TW.btn} ${TW.btnPrimary} mt-3" id="btn-confirm-sheets">Pokračovat</button>`;
        document.getElementById('btn-confirm-sheets').addEventListener('click', () => {
          const checked = [...sheetList.querySelectorAll('input:checked')].map(i => i.value);
          if (!checked.length) return alert('Vyberte alespoň jeden list.');
          buildPreview(checked);
        });
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function buildPreview(selectedSheets) {
    document.getElementById('import-preview-panel').hidden = false;
    buildImportMappingUI(selectedSheets);
    rebuildImportPreview();
  }

  function findPositionByName(name) {
    if (!name) return null;
    const norm = name.trim().toLowerCase();
    if (!norm) return null;
    return positions.find(p => (p.name || '').trim().toLowerCase() === norm) || null;
  }

  function resolvePositionId(posName) {
    if (!posName) return null;
    let pos = findPositionByName(posName);
    const visited = new Set();
    while (pos && pos.mergedIntoId && !visited.has(pos.id)) {
      visited.add(pos.id);
      const next = positions.find(p => p.id === pos.mergedIntoId);
      if (!next) break;
      pos = next;
    }
    return pos ? pos.id : null;
  }

  async function ensurePositionsFromCandidates(list) {
    const posNames = new Set(list.map(c => c.positionName).filter(Boolean));
    for (const name of posNames) {
      if (!findPositionByName(name)) {
        await savePosition({ name, status: 'otevreno', notes: '' });
      }
    }
    await loadPositions();
  }

  let pendingImport = null;

  function renderImportConflicts(conflicts) {
    const body = document.getElementById('import-conflicts-body');
    if (!body) return;
    body.innerHTML = conflicts.map((item, idx) => {
      const existing = item.existing;
      const incoming = item.incoming;
      const name = [incoming.surname || existing.surname, incoming.firstname || existing.firstname].filter(Boolean).join(' ');
      return `
        <div class="border border-slate-100 rounded-xl p-4 bg-slate-50/60 space-y-3" data-index="${idx}">
          <div class="text-sm font-semibold text-slate-800 mb-1">${escapeHtml(name || '(bez jména)')}</div>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            <div class="bg-white rounded-lg border border-slate-100 p-3">
              <div class="font-semibold text-slate-700 mb-1">V databázi</div>
              <p class="text-slate-600 mb-0.5">E-mail: <span class="font-mono">${escapeHtml(existing.email || '—')}</span></p>
              <p class="text-slate-600 mb-0.5">Telefon: <span class="font-mono">${escapeHtml(existing.phone || '—')}</span></p>
              <p class="text-slate-600 mb-0.5">Pozice: ${escapeHtml((positions.find(p => p.id === existing.positionId) || {}).name || '—')}</p>
              <p class="text-slate-600 mb-0.5">Zdroj: ${escapeHtml(existing.source || '—')}</p>
            </div>
            <div class="bg-white rounded-lg border border-emerald-100 p-3">
              <div class="font-semibold text-slate-700 mb-1">Z importu</div>
              <p class="text-slate-600 mb-0.5">E-mail: <span class="font-mono">${escapeHtml(incoming.email || '—')}</span></p>
              <p class="text-slate-600 mb-0.5">Telefon: <span class="font-mono">${escapeHtml(incoming.phone || '—')}</span></p>
              <p class="text-slate-600 mb-0.5">Pozice: ${escapeHtml(incoming.positionName || '—')}</p>
              <p class="text-slate-600 mb-0.5">Zdroj: ${escapeHtml(incoming.source || '—')}</p>
            </div>
          </div>
          <div class="flex flex-wrap gap-4 items-center mt-2 text-xs">
            <label class="inline-flex items-center gap-1.5">
              <input type="radio" class="import-conflict-choice" name="conflict-${idx}" value="merge" checked>
              <span>Stejný člověk – <span class="font-semibold">sloučit a doplnit údaje</span></span>
            </label>
            <label class="inline-flex items-center gap-1.5">
              <input type="radio" class="import-conflict-choice" name="conflict-${idx}" value="new">
              <span>Jiný uchazeč – <span class="font-semibold">přidat jako nového</span></span>
            </label>
          </div>
        </div>
      `;
    }).join('');
  }

  async function runSmartImportWithConflicts(onProgress) {
    if (!pendingImport) return;
    const { candidatesToImport, existingMap, conflicts } = pendingImport;
    pendingImport = null;
    const body = document.getElementById('import-conflicts-body');
    const choices = {};
    if (body) {
      body.querySelectorAll('.import-conflict-choice:checked').forEach(input => {
        const name = input.name;
        const idx = Number(name.replace('conflict-', ''));
        choices[idx] = input.value;
      });
    }
    const mergeFields = ['notes','email','phone','linkedin','source','salary','contract','prvniInterakce','kolo1','kolo2','kolo3','ukol','rejectionReason'];
    const total = candidatesToImport.length;
    let updated = 0, added = 0;
    for (let i = 0; i < candidatesToImport.length; i++) {
      if (onProgress) onProgress(i + 1, total, added);
      const seedC = candidatesToImport[i];
      seedC.positionId = resolvePositionId(seedC.positionName); delete seedC.positionName;
      const key = [seedC.surname, seedC.firstname].filter(Boolean).join('|').toLowerCase();
      if (!key) continue;
      const existing = existingMap.get(key);
      if (existing) {
        const conflictIndex = conflicts.findIndex(c => c.incoming === seedC);
        const choice = conflictIndex >= 0 ? (choices[conflictIndex] || 'merge') : 'merge';
        if (choice === 'new') {
          await saveCandidate(seedC);
          added++;
        } else {
          let changed = false;
          for (const f of mergeFields) {
            if ((seedC[f] || '').trim() && !(existing[f] || '').trim()) {
              existing[f] = seedC[f];
              changed = true;
            }
          }
          if ((seedC.notes || '').length > (existing.notes || '').length) { existing.notes = seedC.notes; changed = true; }
          if (!existing.positionId && seedC.positionId) { existing.positionId = seedC.positionId; changed = true; }
          if (changed) { await saveCandidate(existing); updated++; }
        }
      } else {
        await saveCandidate(seedC);
        added++;
      }
    }
    if (onProgress) onProgress(total, total, added);
    await refreshAllViews();
    showImportLog([`Aktualizováno: ${updated} | Přidáno: ${added}`, `Celkem: ${(await getAllCandidates()).length}`]);
    parsedCandidates = [];
  }

  document.getElementById('btn-download-import-template').addEventListener('click', (e) => {
    e.preventDefault();
    downloadImportTemplate();
  });

  const fileDrop = document.getElementById('file-drop');
  const fileInput = document.getElementById('import-file');
  fileDrop.addEventListener('click', (e) => { if (e.target === fileInput) return; fileInput.click(); });
  fileInput.addEventListener('change', () => { handleFileSelected(fileInput.files[0]); fileInput.value = ''; });
  fileDrop.addEventListener('dragover', (e) => { e.preventDefault(); fileDrop.classList.add('drag-over'); });
  fileDrop.addEventListener('dragleave', () => fileDrop.classList.remove('drag-over'));
  fileDrop.addEventListener('drop', (e) => { e.preventDefault(); fileDrop.classList.remove('drag-over'); if (e.dataTransfer.files[0]) handleFileSelected(e.dataTransfer.files[0]); });

  document.getElementById('btn-import-merge').addEventListener('click', async () => {
    if (!parsedCandidates.length) return;
    if (!confirm('Importovat všechny kandidáty z výběru?')) return;
    const progressModal = document.getElementById('modal-import-progress');
    const progressText = document.getElementById('import-progress-text');
    try {
      progressText.textContent = 'Připravuji pozice…';
      progressModal.classList.add('modal-open');
      progressModal.setAttribute('aria-hidden', 'false');
      await ensurePositionsFromCandidates(parsedCandidates);
      pendingImport = { candidatesToImport: parsedCandidates.slice(), existingMap: new Map(), conflicts: [] };
      await runSmartImportWithConflicts((current, total, added) => {
        progressText.textContent = `Importuji kandidáty… ${current} / ${total} (přidáno: ${added})`;
      });
    } catch (err) {
      showImportLog([`Chyba: ${err.message || err}`]);
    } finally {
      progressModal.classList.remove('modal-open');
      progressModal.setAttribute('aria-hidden', 'true');
    }
  });

  document.getElementById('btn-remove-duplicates').addEventListener('click', async () => {
    if (!confirm('Odstranit duplicity? U každého jména a příjmení zůstane jeden záznam (ten s nejvíce údaji), ostatní se smažou. Tuto akci nelze vrátit.')) return;
    const progressModal = document.getElementById('modal-import-progress');
    const progressText = document.getElementById('import-progress-text');
    const dedupeLog = document.getElementById('dedupe-log');
    try {
      progressModal.classList.add('modal-open');
      progressModal.setAttribute('aria-hidden', 'false');
      progressText.textContent = 'Načítám kandidáty…';
      const all = await getAllCandidates();
      const key = c => [c.surname, c.firstname].map(s => (s || '').trim()).join('|').toLowerCase();
      const filled = c => [c.positionId, c.email, c.phone, c.linkedin, c.source, c.notes, c.prvniInterakce].filter(Boolean).length;
      const byName = new Map();
      for (const c of all) {
        const k = key(c);
        if (!k) continue;
        if (!byName.has(k)) byName.set(k, []);
        byName.get(k).push(c);
      }
      let deleted = 0;
      const toDelete = [];
      for (const [, group] of byName) {
        if (group.length <= 1) continue;
        group.sort((a, b) => filled(b) - filled(a));
        for (let i = 1; i < group.length; i++) toDelete.push(group[i]);
      }
      for (let i = 0; i < toDelete.length; i++) {
        progressText.textContent = `Odstraňuji duplicity… ${i + 1} / ${toDelete.length}`;
        await deleteCandidate(toDelete[i].id);
        deleted++;
      }
      await refreshAllViews();
      dedupeLog.hidden = false;
      dedupeLog.textContent = deleted
        ? `Odstraněno ${deleted} duplicit. Zůstalo ${(await getAllCandidates()).length} kandidátů.`
        : 'Žádné duplicity nenalezeny (každé jméno a příjmení má jen jeden záznam).';
    } catch (err) {
      dedupeLog.hidden = false;
      dedupeLog.textContent = 'Chyba: ' + (err.message || err);
    } finally {
      progressModal.classList.remove('modal-open');
      progressModal.setAttribute('aria-hidden', 'true');
    }
  });

  document.getElementById('btn-clear-all-candidates').addEventListener('click', () => {
    getAllCandidates().then(async (list) => {
      const count = list.length;
      if (!count) {
        document.getElementById('clear-all-log').hidden = false;
        document.getElementById('clear-all-log').textContent = 'Databáze kandidátů je už prázdná.';
        return;
      }
      const countEl = document.getElementById('clear-all-count');
      if (countEl) countEl.textContent = count;
      document.getElementById('clear-db-password').value = '';
      document.getElementById('clear-db-password-error').classList.add('hidden');
      document.getElementById('modal-clear-db-confirm').classList.add('modal-open');
      document.getElementById('modal-clear-db-confirm').setAttribute('aria-hidden', 'false');
    });
  });

  document.getElementById('btn-clear-db-confirm').addEventListener('click', async () => {
    const passwordInput = document.getElementById('clear-db-password');
    const errorEl = document.getElementById('clear-db-password-error');
    const password = (passwordInput.value || '').trim();
    if (!password) {
      errorEl.textContent = 'Zadejte heslo.';
      errorEl.classList.remove('hidden');
      return;
    }
    if (!currentUser || !currentUser.email || !supabaseClient) {
      errorEl.textContent = 'Nejste přihlášeni.';
      errorEl.classList.remove('hidden');
      return;
    }
    errorEl.classList.add('hidden');
    try {
      const { error } = await supabaseClient.auth.signInWithPassword({ email: currentUser.email, password });
      if (error) {
        errorEl.textContent = 'Špatné heslo. Zkuste to znovu.';
        errorEl.classList.remove('hidden');
        return;
      }
    } catch (e) {
      errorEl.textContent = 'Chyba ověření: ' + (e.message || e);
      errorEl.classList.remove('hidden');
      return;
    }
    const modal = document.getElementById('modal-clear-db-confirm');
    modal.classList.remove('modal-open');
    modal.setAttribute('aria-hidden', 'true');
    const clearLog = document.getElementById('clear-all-log');
    const count = (await getAllCandidates()).length;
    try {
      await clearAllCandidates();
      await refreshAllViews();
      clearLog.hidden = false;
      clearLog.textContent = `Smazáno ${count} kandidátů. Databáze je vyčištěná, můžete naimportovat znovu.`;
    } catch (err) {
      clearLog.hidden = false;
      clearLog.textContent = 'Chyba: ' + (err.message || err);
    }
  });

  document.getElementById('clear-db-password').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('btn-clear-db-confirm').click();
  });
  document.querySelectorAll('.clear-db-cancel, #modal-clear-db-confirm .modal-backdrop').forEach(el => {
    el.addEventListener('click', () => {
      document.getElementById('modal-clear-db-confirm').classList.remove('modal-open');
      document.getElementById('modal-clear-db-confirm').setAttribute('aria-hidden', 'true');
    });
  });

  // --- Modals ---
  function closeModal(id) {
    document.getElementById(id).classList.remove('modal-open');
    document.getElementById(id).setAttribute('aria-hidden', 'true');
  }

  document.querySelectorAll('.modal-backdrop, .modal-close').forEach(el => {
    el.addEventListener('click', () => {
      document.querySelectorAll('.modal').forEach(m => { m.classList.remove('modal-open'); m.setAttribute('aria-hidden', 'true'); });
    });
  });

  document.getElementById('btn-save-position').addEventListener('click', savePositionFromModal);
  document.getElementById('btn-merge-position-confirm').addEventListener('click', () => { confirmMergeFromModal(); });
  document.getElementById('btn-import-conflicts-confirm').addEventListener('click', async () => {
    await runSmartImportWithConflicts();
    closeModal('modal-import-conflicts');
  });
  document.getElementById('btn-add-opening').addEventListener('click', () => openOpeningModal(null));
  document.getElementById('btn-save-opening').addEventListener('click', () => saveOpeningFromModal());
  document.getElementById('btn-save-candidate').addEventListener('click', saveCandidateFromModal);
  document.getElementById('btn-save-notes').addEventListener('click', saveNotesModal);
  document.getElementById('btn-add-position').addEventListener('click', () => openPositionModal(null));
  document.getElementById('btn-add-candidate').addEventListener('click', () => openCandidateModal(null));
  document.getElementById('btn-add-from-screenshot').addEventListener('click', openScreenshotModal);

  document.getElementById('btn-toggle-columns').addEventListener('click', () => {
    const dd = document.getElementById('columns-dropdown');
    dd.hidden = !dd.hidden;
    if (!dd.hidden) renderColumnsDropdown();
  });
  document.addEventListener('click', (e) => {
    const wrap = document.querySelector('.columns-toggle-wrap');
    if (wrap && !wrap.contains(e.target)) document.getElementById('columns-dropdown').hidden = true;
  });

  document.querySelectorAll('.view-toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.view-toggle-btn').forEach(b => { b.classList.remove('active'); b.setAttribute('aria-pressed', 'false'); });
      btn.classList.add('active'); btn.setAttribute('aria-pressed', 'true');
      renderPipelineIfActive();
    });
  });

  function refreshCandidatesView() {
    candidatesTablePage = 1;
    renderCandidates();
    if (getCandidateViewMode() === 'pipeline') renderPipeline();
  }
  document.getElementById('search-candidates').addEventListener('input', refreshCandidatesView);
  document.getElementById('filter-position').addEventListener('change', refreshCandidatesView);
  document.getElementById('filter-opening').addEventListener('change', refreshCandidatesView);
  document.getElementById('filter-stage').addEventListener('change', refreshCandidatesView);
  const filterShowRejected = document.getElementById('filter-show-rejected');
  if (filterShowRejected) filterShowRejected.addEventListener('change', refreshCandidatesView);

  document.getElementById('search-btn-run').addEventListener('click', () => {
    const list = filterCandidatesSearch();
    renderSearchResults(list);
  });

  // --- Google Sheets export ---
  const GSHEET_URL_KEY = 'hr_gsheet_url';
  function initExport() {
    const saved = localStorage.getItem(GSHEET_URL_KEY);
    if (saved) document.getElementById('gsheet-url').value = saved;
  }

  document.getElementById('btn-save-gsheet-url').addEventListener('click', () => {
    localStorage.setItem(GSHEET_URL_KEY, document.getElementById('gsheet-url').value.trim());
    const ind = document.getElementById('gsheet-url-saved'); ind.hidden = false;
    setTimeout(() => { ind.hidden = true; }, 2000);
  });

  document.getElementById('btn-copy-script').addEventListener('click', () => {
    navigator.clipboard.writeText(document.getElementById('apps-script-code').textContent).then(() => {
      const btn = document.getElementById('btn-copy-script');
      btn.textContent = 'Zkopírováno'; setTimeout(() => { btn.textContent = 'Kopírovat kód'; }, 1500);
    });
  });

  document.getElementById('btn-export-gsheet').addEventListener('click', async () => {
    const url = (document.getElementById('gsheet-url').value || localStorage.getItem(GSHEET_URL_KEY) || '').trim();
    const statusEl = document.getElementById('export-status');
    if (!url) { statusEl.className = 'text-sm text-red-600 font-semibold'; statusEl.textContent = 'Zadejte URL.'; return; }
    const mode = (document.querySelector('input[name="gsheet-export-mode"]:checked') || {}).value || 'replace';
    statusEl.className = 'text-sm text-slate-500'; statusEl.textContent = 'Exportuji…';
    const headers = ['ID','Příjmení','Jméno','E-mail','Telefon','LinkedIn','Pozice','Fáze','Zdroj','Plat','HPP / IČO','První interakce','Poznámky','1. kolo','Úkol','2. kolo','3. kolo','Důvod odmítnutí'];
    const rows = candidates.map(c => {
      const pos = positions.find(p => p.id === c.positionId);
      return [c.id||'',c.surname||'',c.firstname||'',c.email||'',c.phone||'',c.linkedin||'',pos?pos.name:'',STAGE_LABELS[c.stage]||c.stage||'',c.source||'',c.salary||'',c.contract||'',(c.prvniInterakce||'').replace(/\n/g,' '),(c.notes||'').replace(/\n/g,' '),(c.kolo1||'').replace(/\n/g,' '),(c.ukol||'').replace(/\n/g,' '),(c.kolo2||'').replace(/\n/g,' '),(c.kolo3||'').replace(/\n/g,' '),(c.rejectionReason||'').replace(/\n/g,' ')];
    });
    try {
      await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ mode, headers, rows }), mode: 'no-cors' });
      statusEl.className = 'text-sm text-emerald-600 font-semibold';
      statusEl.textContent = mode === 'update' ? `Aktualizace odeslána (${rows.length} kandidátů).` : `Export odeslán (${rows.length} kandidátů).`;
    } catch (err) { statusEl.className = 'text-sm text-red-600 font-semibold'; statusEl.textContent = 'Chyba: ' + (err.message || 'nepodařilo se'); }
  });

  function escapeHtml(s) {
    if (s == null) return '';
    const div = document.createElement('div'); div.textContent = s; return div.innerHTML;
  }

  // --- Screenshot import ---
  const SS_KEY_STORAGE = 'hr_openai_api_key';
  let screenshotImages = [];

  function initScreenshotModal() {
    const apiKeyInput = document.getElementById('screenshot-api-key');
    const saved = localStorage.getItem(SS_KEY_STORAGE);
    if (saved) apiKeyInput.value = saved;

    document.getElementById('btn-toggle-key-vis').addEventListener('click', () => {
      apiKeyInput.type = apiKeyInput.type === 'password' ? 'text' : 'password';
    });

    const dropZone = document.getElementById('screenshot-drop');
    const fileInput = document.getElementById('screenshot-file-input');

    dropZone.addEventListener('click', (e) => {
      if (e.target === fileInput) return;
      fileInput.click();
    });
    fileInput.addEventListener('change', () => {
      if (fileInput.files.length) addScreenshots(fileInput.files);
      fileInput.value = '';
    });
    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
    dropZone.addEventListener('drop', (e) => {
      e.preventDefault(); dropZone.classList.remove('drag-over');
      if (e.dataTransfer.files.length) addScreenshots(e.dataTransfer.files);
    });

    document.addEventListener('paste', (e) => {
      const modal = document.getElementById('modal-screenshot');
      if (!modal.classList.contains('modal-open')) return;
      const items = [...(e.clipboardData || {}).items || []];
      const imageFiles = items.filter(i => i.type.startsWith('image/')).map(i => i.getAsFile()).filter(Boolean);
      if (imageFiles.length) { e.preventDefault(); addScreenshots(imageFiles); }
    });

    document.getElementById('btn-analyze-screenshots').addEventListener('click', analyzeScreenshots);
    document.getElementById('btn-save-from-screenshot').addEventListener('click', saveFromScreenshot);
  }

  function addScreenshots(fileList) {
    for (const file of fileList) {
      if (!file.type.startsWith('image/')) continue;
      const reader = new FileReader();
      reader.onload = () => {
        screenshotImages.push({ name: file.name, dataUrl: reader.result });
        renderScreenshotPreviews();
      };
      reader.readAsDataURL(file);
    }
  }

  function renderScreenshotPreviews() {
    const container = document.getElementById('screenshot-previews');
    container.innerHTML = screenshotImages.map((img, i) => `
      <div class="relative group">
        <img src="${img.dataUrl}" class="h-24 rounded-lg border border-slate-200 shadow-sm object-cover">
        <button type="button" class="ss-remove-btn absolute -top-2 -right-2 bg-red-500 text-white w-5 h-5 rounded-full text-xs font-bold opacity-0 group-hover:opacity-100 transition-opacity" data-idx="${i}">&times;</button>
      </div>
    `).join('');
    container.querySelectorAll('.ss-remove-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        screenshotImages.splice(Number(btn.dataset.idx), 1);
        renderScreenshotPreviews();
      });
    });
    document.getElementById('btn-analyze-screenshots').disabled = screenshotImages.length === 0;
  }

  async function analyzeScreenshots() {
    const apiKey = document.getElementById('screenshot-api-key').value.trim();
    if (!apiKey) return alert('Zadejte OpenAI API klíč.');
    localStorage.setItem(SS_KEY_STORAGE, apiKey);

    if (screenshotImages.length === 0) return alert('Přidejte alespoň jeden screenshot.');

    const statusEl = document.getElementById('screenshot-status');
    const analyzeBtn = document.getElementById('btn-analyze-screenshots');
    analyzeBtn.disabled = true;
    statusEl.textContent = 'Analyzuji…';
    statusEl.className = 'text-sm text-indigo-600 font-medium animate-pulse';

    const imageMessages = screenshotImages.map(img => ({
      type: 'image_url',
      image_url: { url: img.dataUrl, detail: 'high' }
    }));

    const systemPrompt = `Jsi HR asistent. Z přiložených screenshotů extrahuj informace o uchazeči/kandidátovi. Vrať POUZE platný JSON objekt s těmito poli (pokud informace není dostupná, nech prázdný string):
{
  "surname": "příjmení",
  "firstname": "křestní jméno",
  "gender": "Muž nebo Žena",
  "email": "e-mailová adresa",
  "phone": "telefonní číslo",
  "linkedin": "LinkedIn URL",
  "positionName": "název pozice, o kterou se uchazeč uchází",
  "stage": "fáze výběrového řízení (např. 1. kolo, Přijat, Zamítnut...)",
  "source": "zdroj kandidáta",
  "salary": "očekávaná mzda (jen číslo)",
  "salaryCurrency": "měna (CZK, EUR, USD)",
  "salaryNote": "poznámka ke mzdě (HPP, IČO apod.)",
  "contract": "typ smlouvy (HPP, IČO, DPP...)",
  "startDate": "možné datum nástupu",
  "languages": "jazykové úrovně",
  "potential": "potenciál uchazeče (Perspektivní, Průměrný, Nevhodný)",
  "notes": "veškeré poznámky a komentáře k uchazeči"
}
Vrať JEN JSON, žádný markdown, žádné vysvětlení.`;

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: [
              { type: 'text', text: 'Analyzuj tyto screenshoty a extrahuj data uchazeče:' },
              ...imageMessages
            ]}
          ],
          max_tokens: 2000,
          temperature: 0.1
        })
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error?.message || `HTTP ${response.status}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '';
      const jsonMatch = content.replace(/```json?\s*/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(jsonMatch);

      fillScreenshotForm(parsed);
      document.getElementById('screenshot-result').classList.remove('hidden');
      document.getElementById('btn-save-from-screenshot').disabled = false;
      statusEl.textContent = 'Data rozpoznána — zkontrolujte a uložte.';
      statusEl.className = 'text-sm text-emerald-600 font-medium';

    } catch (err) {
      statusEl.textContent = 'Chyba: ' + err.message;
      statusEl.className = 'text-sm text-red-600 font-medium';
    } finally {
      analyzeBtn.disabled = screenshotImages.length === 0;
    }
  }

  function fillScreenshotForm(data) {
    const fields = ['surname','firstname','email','phone','linkedin','source','salary','salaryNote','contract','startDate','languages','notes'];
    fields.forEach(f => {
      const el = document.getElementById('ss-' + f);
      if (el) el.value = data[f] || '';
    });
    const selects = { gender: 'ss-gender', salaryCurrency: 'ss-salaryCurrency', potential: 'ss-potential' };
    Object.entries(selects).forEach(([key, id]) => {
      const el = document.getElementById(id);
      if (el && data[key]) {
        const opt = [...el.options].find(o => o.value === data[key]);
        if (opt) el.value = data[key];
      }
    });

    fillPositionSelect(document.getElementById('ss-position'), true);
    if (data.positionName) {
      const match = positions.find(p => p.name.toLowerCase().includes(data.positionName.toLowerCase()));
      if (match) document.getElementById('ss-position').value = match.id;
    }

    const stageEl = document.getElementById('ss-stage');
    stageEl.innerHTML = Object.entries(STAGE_LABELS).map(([k, v]) => `<option value="${k}">${escapeHtml(v)}</option>`).join('');
    if (data.stage) {
      const normalized = normalizeStageImport(data.stage);
      if (normalized) stageEl.value = normalized;
    }
  }

  async function saveFromScreenshot() {
    const surname = document.getElementById('ss-surname').value.trim();
    const firstname = document.getElementById('ss-firstname').value.trim();
    if (!surname && !firstname) return alert('Zadejte jméno nebo příjmení.');

    const record = {};
    const fields = ['surname','firstname','email','phone','linkedin','source','salary','salaryNote','contract','startDate','languages','notes'];
    fields.forEach(f => { record[f] = document.getElementById('ss-' + f).value.trim(); });
    record.gender = document.getElementById('ss-gender').value;
    record.salaryCurrency = document.getElementById('ss-salaryCurrency').value;
    record.potential = document.getElementById('ss-potential').value;
    record.positionId = document.getElementById('ss-position').value || null;
    record.stage = document.getElementById('ss-stage').value || 'novy_kandidat';

    await saveCandidate(record);
    await loadCandidates();
    renderCandidates();
    renderDashboard();
    closeModal('modal-screenshot');

    screenshotImages = [];
    renderScreenshotPreviews();
    document.getElementById('screenshot-result').classList.add('hidden');
    document.getElementById('btn-save-from-screenshot').disabled = true;
    document.getElementById('screenshot-status').textContent = '';
  }

  function openScreenshotModal() {
    screenshotImages = [];
    renderScreenshotPreviews();
    document.getElementById('screenshot-result').classList.add('hidden');
    document.getElementById('btn-save-from-screenshot').disabled = true;
    document.getElementById('screenshot-status').textContent = '';
    fillPositionSelect(document.getElementById('ss-position'), true);
    document.getElementById('modal-screenshot').classList.add('modal-open');
    document.getElementById('modal-screenshot').setAttribute('aria-hidden', 'false');
  }

  // --- Load data ---
  async function loadPositions() {
    positions = await getAllPositions();
    if (positions.length === 0) {
      for (const d of [
        { name: 'PPC Specialista', status: 'uzavreno', notes: 'update: 9.1.2024 - aktivně nehledáme' },
        { name: 'Social Ads Specialista', status: 'otevreno', notes: 'hledáme' },
        { name: 'Account Manager', status: 'otevreno', notes: '' },
        { name: 'Business Manager', status: 'uzavreno', notes: 'přijat = Tomáš Mulač (1.8.2023)' },
        { name: 'Office Manager', status: 'uzavreno', notes: 'přijata = Kateřina Platil Salingerová (1.5.2023)' },
        { name: 'RTB specialista', status: 'uzavreno', notes: 'nehledáme aktivně' },
        { name: 'DATA specialista', status: 'uzavreno', notes: 'update: 9.1.2024 plný kapacity' }
      ]) await savePosition(d);
      positions = await getAllPositions();
    }
  }

  async function loadCandidates() { candidates = await getAllCandidates(); }
  async function loadApplications() { applications = await getAllApplications(); }

  async function migrateContactFields() {
    const MIGRATION_KEY = 'hr_migration_contact_split_v2';
    if (localStorage.getItem(MIGRATION_KEY)) return;
    let changed = 0;
    for (const c of candidates) {
      let dirty = false;
      const combined = [c.email, c.phone].filter(Boolean).join(' ');
      if (combined) {
        const emails = extractEmails(combined);
        const phones = extractPhones(combined);
        const newEmail = emails.join(', ');
        const newPhone = phones.join(', ');
        if (c.email !== newEmail || c.phone !== newPhone) {
          c.email = newEmail;
          c.phone = newPhone;
          dirty = true;
        }
      }
      if (c.prvniInterakce) {
        const converted = excelDateToString(c.prvniInterakce);
        if (converted !== c.prvniInterakce) { c.prvniInterakce = converted; dirty = true; }
      }
      if (dirty) { await saveCandidate(c); changed++; }
    }
    localStorage.setItem(MIGRATION_KEY, Date.now().toString());
    if (changed) { candidates = await getAllCandidates(); }
  }

  function strip420FromPhone(phone) {
    if (!phone || typeof phone !== 'string') return phone;
    return phone.split(/[\s,;]+/).map(p => {
      const t = p.trim();
      if (t.startsWith('+420') && t.length >= 13) return t.slice(4);
      if (t.startsWith('420') && t.length >= 12) return t.slice(3);
      return t;
    }).filter(Boolean).join(', ');
  }

  async function migrateStrip420() {
    const KEY = 'hr_migration_strip_420_v1';
    if (localStorage.getItem(KEY)) return;
    let changed = 0;
    for (const c of candidates) {
      if (c.phone) {
        const newPhone = strip420FromPhone(c.phone);
        if (newPhone !== c.phone) {
          c.phone = newPhone;
          await saveCandidate(c);
          changed++;
        }
      }
    }
    localStorage.setItem(KEY, Date.now().toString());
    if (changed) { candidates = await getAllCandidates(); }
  }

  async function migrateSetZamitnut() {
    const KEY = 'hr_migration_set_zamitnut_v1';
    if (localStorage.getItem(KEY)) return;
    let changed = 0;
    for (const c of candidates) {
      if (c.stage !== 'prijat' && c.stage !== 'zamitnut') {
        c.stage = 'zamitnut';
        await saveCandidate(c);
        changed++;
      }
    }
    localStorage.setItem(KEY, Date.now().toString());
    if (changed) { candidates = await getAllCandidates(); }
  }

  const OLD_TO_NEW_STAGE = {
    nova_prihlaska: 'novy_kandidat', osloven: 'telefonat', zadost: 'ukol', dotaznik: 'ukol', cekam: 'ukol',
    rozhovor: 'kolo1', druhe_kolo: 'kolo2', nabidka: 'nabidka',
    prijat: 'prijat', zamitnut: 'zamitnut'
  };
  async function migrateStagesToNewKeys() {
    const KEY = 'hr_migration_stages_v1';
    if (localStorage.getItem(KEY)) return;
    let changed = 0;
    for (const c of candidates) {
      const newStage = OLD_TO_NEW_STAGE[c.stage] ?? (c.stage in STAGE_LABELS ? c.stage : 'novy_kandidat');
      if (newStage !== c.stage) {
        c.stage = newStage;
        await saveCandidate(c);
        changed++;
      }
    }
    localStorage.setItem(KEY, '1');
    if (changed) { candidates = await getAllCandidates(); }
  }

  const COLUMNS_RESET_MIGRATION_KEY = 'hr_columns_reset_v1';
  async function init() {
    // Autentizace přes Supabase
    if (!supabaseClient) {
      window.location.href = 'login.html';
      return;
    }
    try {
      const { data: authData, error } = await supabaseClient.auth.getUser();
      if (error || !authData.user) {
        localStorage.removeItem('user');
        window.location.href = 'login.html';
        return;
      }
      const userId = authData.user.id;
      const { data: profile } = await supabaseClient
        .from('profiles')
        .select('email, role')
        .eq('id', userId)
        .single();
      currentUser = {
        id: userId,
        email: profile?.email || authData.user.email,
        role: profile?.role || 'viewer',
      };
      localStorage.setItem('user', JSON.stringify(currentUser));
    } catch (e) {
      localStorage.removeItem('user');
      window.location.href = 'login.html';
      return;
    }
    applyRoleVisibility();
    initAuthUI();
    await openDB(); await loadPositions(); openings = await getAllOpenings(); await loadCandidates(); await loadApplications();
    await migrateContactFields();
    await migrateStrip420();
    await migrateSetZamitnut();
    await migrateStagesToNewKeys();
    if (!localStorage.getItem(COLUMNS_RESET_MIGRATION_KEY)) {
      localStorage.removeItem(COL_STORAGE_KEY);
      localStorage.setItem(COLUMNS_RESET_MIGRATION_KEY, '1');
    }
    const visible = getVisibleColumns();
    if (visible.length <= 1) localStorage.removeItem(COL_STORAGE_KEY);
    initNav(); initExport(); initScreenshotModal();
    fillPositionSelect(document.getElementById('filter-position'));
    fillPositionSelect(document.getElementById('candidate-position'));
    renderDashboard(); renderCandidates(); renderPositions(); renderApplications();
    // Auth + UI jsou připravené – teprve teď ukážeme celé rozhraní,
    // aby se při načítání neobjevilo a hned nezmizelo.
    try {
      document.body.style.visibility = 'visible';
    } catch (_) {}
  }

  init();
})();
