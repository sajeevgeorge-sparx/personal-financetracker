/* app.js — Finance Tracker */

// ── Storage ───────────────────────────────────────────────────────
const STORE_KEY    = 'financeTracker_v1';
const DATA_VERSION = 4;

// Safe localStorage wrapper — iOS file:// blocks storage; fall back to in-memory
const _mem = {};
const store = {
  get(k)    { try { return localStorage.getItem(k); }    catch { return _mem[k] ?? null; } },
  set(k, v) { try { localStorage.setItem(k, v); }        catch { _mem[k] = v; } },
};

function loadDB() {
  try { const r = store.get(STORE_KEY); if (r) return JSON.parse(r); } catch {}
  return { expenses: {}, rsu: [], templates: [], takeHome: {}, assets: [] };
}
function saveDB() { try { store.set(STORE_KEY, JSON.stringify(db)); } catch {} }

let db = loadDB();

// First-run: seed 2025 expenses and templates
if (typeof SEED_2025 !== 'undefined' && Object.keys(db.expenses).length === 0) {
  db.expenses = JSON.parse(JSON.stringify(SEED_2025));
}
if (typeof SEED_TEMPLATES !== 'undefined' && (!db.templates || db.templates.length === 0)) {
  db.templates = JSON.parse(JSON.stringify(SEED_TEMPLATES));
}
if (!db.rsu) db.rsu = [];
if (!db.takeHome) db.takeHome = {};
if (!db.assets) db.assets = [];

// Data migration: v4 adds assets
if (!db._dataVersion || db._dataVersion < DATA_VERSION) {
  if (typeof SEED_2026 !== 'undefined') {
    Object.entries(SEED_2026).forEach(([k, v]) => {
      if (!db.expenses[k] || db.expenses[k].length === 0)
        db.expenses[k] = JSON.parse(JSON.stringify(v));
    });
  }
  if (typeof SEED_RSU !== 'undefined') {
    const existingIds = new Set((db.rsu).map(r => r.id));
    SEED_RSU.forEach(r => {
      if (!existingIds.has(r.id)) db.rsu.push(JSON.parse(JSON.stringify(r)));
    });
  }
  if (typeof SEED_TEMPLATES !== 'undefined') {
    db.templates = JSON.parse(JSON.stringify(SEED_TEMPLATES));
  }
  if (typeof SEED_TAKEHOME !== 'undefined') {
    Object.entries(SEED_TAKEHOME).forEach(([k, v]) => {
      if (!db.takeHome[k]) db.takeHome[k] = v;
    });
  }
  if (typeof SEED_ASSETS !== 'undefined') {
    const existingIds = new Set(db.assets.map(a => a.id));
    SEED_ASSETS.forEach(a => {
      if (!existingIds.has(a.id)) db.assets.push(JSON.parse(JSON.stringify(a)));
    });
  }
  db._dataVersion = DATA_VERSION;
}

saveDB();

// ── Helpers ───────────────────────────────────────────────────────
function uid() { return Math.random().toString(36).slice(2,10) + Date.now().toString(36); }

function fmt(n) {
  if (!n && n !== 0) return '₹0';
  return '₹' + Math.abs(n).toLocaleString('en-IN', { maximumFractionDigits: 0 });
}
function fmtFull(n) {
  if (!n) return '₹0';
  return '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

function fmtWords(n) {
  if (!n || n === 0) return '';
  const abs = Math.abs(n);
  if (abs >= 1e7) {
    const cr = abs / 1e7;
    return (cr % 1 === 0 ? cr : cr.toFixed(2).replace(/\.?0+$/, '')) + ' Crores';
  }
  if (abs >= 1e5) {
    const lk = abs / 1e5;
    return (lk % 1 === 0 ? lk : lk.toFixed(2).replace(/\.?0+$/, '')) + ' Lakhs';
  }
  if (abs >= 1e3) {
    const th = abs / 1e3;
    return (th % 1 === 0 ? th : th.toFixed(1).replace(/\.?0+$/, '')) + ' Thousand';
  }
  return '';
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MONTHS_LONG = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function monthKey(y, m) { return `${y}-${String(m + 1).padStart(2,'0')}`; }

const today = new Date();
let curYear  = today.getFullYear();
let curMonth = today.getMonth();

function itemStatusClass(item) {
  if (!item.amount || item.amount === 0) return 's-zero';
  if (item.status === 'Paid')    return 's-paid';
  if (item.status === 'Partial') return 's-partial';
  const due  = new Date(item.due);
  const diff = Math.floor((due - today) / 86400000);
  if (diff < 0)  return 's-overdue';
  if (diff <= 5) return 's-due-soon';
  return 's-unpaid';
}

const $ = id => document.getElementById(id);

// ── Theme ─────────────────────────────────────────────────────────
const html = document.documentElement;
const metaTheme = document.getElementById('meta-theme-color');

function applyTheme(theme) {
  html.setAttribute('data-theme', theme);
  const isDark = theme === 'dark';
  if (metaTheme) metaTheme.content = isDark ? '#0d1b2a' : '#1e3a5f';
  $('btn-theme').textContent = isDark ? '🌙' : '☀️';
  $('btn-theme').title = isDark ? 'Switch to light theme' : 'Switch to dark theme';
  store.set('theme', theme);
}

// Default: light theme; restore saved preference
applyTheme(store.get('theme') || 'light');

$('btn-theme').addEventListener('click', () => {
  applyTheme(html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
});

// ── Sidebar ───────────────────────────────────────────────────────
const sidebar = document.getElementById('sidebar');
const main    = document.getElementById('main');
const edgeBtn = document.getElementById('btn-edge-toggle');

function setSidebarCollapsed(collapsed) {
  sidebar.classList.toggle('collapsed', collapsed);
  main.classList.toggle('collapsed', collapsed);
  store.set('sidebarCollapsed', collapsed ? '1' : '0');
}

// Both the header hamburger and the edge button toggle the same state
$('btn-sidebar-toggle').addEventListener('click', () => {
  setSidebarCollapsed(!sidebar.classList.contains('collapsed'));
});
edgeBtn.addEventListener('click', () => {
  setSidebarCollapsed(!sidebar.classList.contains('collapsed'));
});

// Restore saved state
setSidebarCollapsed(store.get('sidebarCollapsed') === '1');

// ── Tab switching ─────────────────────────────────────────────────
document.querySelectorAll('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    $('tab-' + btn.dataset.tab).classList.add('active');
    if (btn.dataset.tab === 'summary')   renderSummary();
    if (btn.dataset.tab === 'rsu')       renderRSU();
    if (btn.dataset.tab === 'templates') renderTemplates();
    if (btn.dataset.tab === 'future')    renderFuture();
  });
});

// ── Month selectors ───────────────────────────────────────────────
function initSelectors() {
  const ms = $('month-select'), ys = $('year-select');
  ms.innerHTML = MONTHS_LONG.map((m,i) =>
    `<option value="${i}"${i===curMonth?' selected':''}>${m}</option>`).join('');
  const years = [];
  for (let y = 2023; y <= 2030; y++) years.push(y);
  ys.innerHTML = years.map(y =>
    `<option value="${y}"${y===curYear?' selected':''}>${y}</option>`).join('');
  ms.addEventListener('change', () => { curMonth = +ms.value; renderMonthly(); });
  ys.addEventListener('change', () => { curYear  = +ys.value; renderMonthly(); });
}

$('btn-prev').addEventListener('click', () => {
  if (curMonth === 0) { curMonth = 11; curYear--; } else curMonth--;
  syncSelectors(); renderMonthly();
});
$('btn-next').addEventListener('click', () => {
  if (curMonth === 11) { curMonth = 0; curYear++; } else curMonth++;
  syncSelectors(); renderMonthly();
});
function syncSelectors() {
  $('month-select').value = curMonth;
  $('year-select').value  = curYear;
}

// ── Auto-populate month from templates ───────────────────────────
function ensureMonthPopulated(key) {
  if (db.expenses[key] && db.expenses[key].length > 0) return;
  const [y, m] = key.split('-').map(Number);
  const activeTemplates = (db.templates || []).filter(t => t.active);
  if (!activeTemplates.length) return;
  db.expenses[key] = activeTemplates.map(t => {
    const day   = Math.min(t.dueDay, new Date(y, m, 0).getDate()); // clamp to month length
    const due   = `${y}-${String(m).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    return {
      id: uid(), name: t.name, amount: t.defaultAmount || 0,
      due, status: '', paidAmount: 0, notes: ''
    };
  });
  saveDB();
}

// ── Monthly render ────────────────────────────────────────────────
function renderMonthly() {
  const key = monthKey(curYear, curMonth);
  ensureMonthPopulated(key);
  const items = db.expenses[key] || [];

  let total = 0, paid = 0;
  items.forEach(it => {
    total += it.amount || 0;
    if (it.status === 'Paid')    paid += it.amount || 0;
    else if (it.status === 'Partial') paid += it.paidAmount || 0;
  });
  const deficit = total - paid;
  const takeHome = (db.takeHome || {})[key] || 0;

  $('stat-total').textContent     = fmt(total);
  $('stat-paid').textContent      = fmt(paid);
  $('stat-remaining').textContent = fmt(deficit);
  $('stat-deficit').textContent   = deficit > 0 ? fmt(deficit) : '₹0';

  // Take-home strip
  const thEl = $('stat-takehome');
  if (thEl) thEl.textContent = takeHome ? fmt(takeHome) : '—';

  const sorted = [...items].sort((a, b) => new Date(a.due) - new Date(b.due));
  const list   = $('expense-list');

  if (!sorted.length) {
    list.innerHTML = '<div class="empty-state">No items yet. Tap "+ Add" to get started.</div>';
    return;
  }

  list.innerHTML = sorted.map(it => {
    const sc    = itemStatusClass(it);
    const day   = new Date(it.due).getDate();
    const isZero = !it.amount || it.amount === 0;

    let amtHtml;
    if (isZero) {
      amtHtml = `<span class="item-amount item-zero">—</span>`;
    } else if (it.status === 'Partial') {
      const rem = (it.amount||0) - (it.paidAmount||0);
      amtHtml = `<div class="item-amount">${fmt(it.amount)}</div>
                 <div class="item-remaining">${fmt(rem)} left</div>`;
    } else {
      amtHtml = `<div class="item-amount">${fmt(it.amount)}</div>`;
    }

    let meta = it.notes || '';
    if (!meta) {
      const due  = new Date(it.due);
      const diff = Math.floor((due - today) / 86400000);
      if (sc === 's-due-soon') meta = diff === 0 ? 'Due today!' : `Due in ${diff} day${diff>1?'s':''}`;
      if (sc === 's-overdue')  meta = `Overdue by ${Math.abs(diff)} day${Math.abs(diff)>1?'s':''}`;
    }

    // Inline pay button: show ✓ for unpaid/partial/overdue/due-soon (non-zero), ↩ for paid
    let payBtn = '';
    if (!isZero) {
      if (it.status === 'Paid') {
        payBtn = `<button class="item-pay-btn item-pay-undo" data-id="${it.id}" title="Mark unpaid">↩</button>`;
      } else {
        payBtn = `<button class="item-pay-btn item-pay-now" data-id="${it.id}" title="Mark as paid">✓</button>`;
      }
    }

    return `<div class="expense-item ${sc}" data-id="${it.id}">
      <div class="item-due-badge">${String(day).padStart(2,'0')}</div>
      <div class="item-body">
        <div class="item-name">${it.name}</div>
        ${meta ? `<div class="item-meta">${meta}</div>` : ''}
      </div>
      <div class="item-amount-col">${amtHtml}</div>
      ${payBtn}
    </div>`;
  }).join('');

  list.querySelectorAll('.expense-item').forEach(el => {
    el.addEventListener('click', e => {
      if (e.target.closest('.item-pay-btn')) return;
      openExpenseModal(key, el.dataset.id);
    });
  });

  list.querySelectorAll('.item-pay-now').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const items = db.expenses[key];
      const it = items.find(i => i.id === btn.dataset.id);
      if (!it) return;
      it.status = 'Paid'; it.paidAmount = it.amount;
      saveDB(); renderMonthly(); scheduleNotifications();
    });
  });

  list.querySelectorAll('.item-pay-undo').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const items = db.expenses[key];
      const it = items.find(i => i.id === btn.dataset.id);
      if (!it) return;
      it.status = ''; it.paidAmount = 0;
      saveDB(); renderMonthly();
    });
  });
}

// ── Take-Home Save ────────────────────────────────────────────────
function initTakeHomeSave() {
  const inp = $('inp-takehome');
  if (!inp) return;
  inp.addEventListener('change', () => {
    const key = monthKey(curYear, curMonth);
    const val = parseFloat(inp.value) || 0;
    if (!db.takeHome) db.takeHome = {};
    if (val) db.takeHome[key] = val; else delete db.takeHome[key];
    saveDB();
    const thEl = $('stat-takehome');
    if (thEl) thEl.textContent = val ? fmt(val) : '—';
    inp.value = '';
  });
}

// ── Take-Home Privacy Blur ─────────────────────────────────────────
let thBlurTimer = null;

function setTHBlur(blur) {
  const el  = $('stat-takehome');
  const btn = $('btn-th-reveal');
  if (!el) return;
  if (blur) {
    el.classList.add('blurred');
    el.classList.remove('revealed');
    if (btn) btn.textContent = '👁';
    clearTimeout(thBlurTimer);
  } else {
    el.classList.add('revealed');
    el.classList.remove('blurred');
    if (btn) btn.textContent = '🙈';
    clearTimeout(thBlurTimer);
    thBlurTimer = setTimeout(() => setTHBlur(true), 30000);
  }
}

function initTHBlur() {
  const btn = $('btn-th-reveal');
  if (!btn) return;
  // Start blurred
  setTHBlur(true);
  // Toggle button
  btn.addEventListener('click', e => {
    e.stopPropagation();
    const isBlurred = !$('stat-takehome').classList.contains('revealed');
    setTHBlur(!isBlurred);
  });
  // Tapping the value itself also reveals
  $('stat-takehome').addEventListener('click', e => {
    if ($('stat-takehome').classList.contains('revealed')) return;
    e.stopPropagation();
    setTHBlur(false);
  });
}

// ── Expense modal ─────────────────────────────────────────────────
let editingItemKey = null;

function openExpenseModal(mKey, id) {
  const items = db.expenses[mKey] || [];
  const item  = id ? items.find(i => i.id === id) : null;
  editingItemKey = id ? `${mKey}|${id}` : null;

  $('modal-expense-title').textContent = item ? 'Edit Expense' : 'Add Expense';
  $('inp-name').value   = item?.name   || '';
  $('inp-amount').value = item?.amount || '';
  $('inp-due').value    = item?.due    || `${curYear}-${String(curMonth+1).padStart(2,'0')}-01`;
  $('inp-status').value = item?.status || '';
  $('inp-paid').value   = item?.paidAmount || '';
  $('inp-notes').value  = item?.notes  || '';
  $('btn-delete-item').style.display = item ? '' : 'none';
  togglePartialRow();
  $('modal-expense').classList.remove('hidden');
  setTimeout(() => $('inp-name').focus(), 50);
}

$('btn-add-item').addEventListener('click', () => openExpenseModal(monthKey(curYear, curMonth), null));

$('inp-status').addEventListener('change', togglePartialRow);
function togglePartialRow() {
  $('partial-row').classList.toggle('hidden', $('inp-status').value !== 'Partial');
}

$('form-expense').addEventListener('submit', e => {
  e.preventDefault();
  const mKey = editingItemKey ? editingItemKey.split('|')[0] : monthKey(curYear, curMonth);
  if (!db.expenses[mKey]) db.expenses[mKey] = [];
  const items = db.expenses[mKey];

  const entry = {
    name: $('inp-name').value.trim(),
    amount: parseFloat($('inp-amount').value) || 0,
    due: $('inp-due').value,
    status: $('inp-status').value,
    paidAmount: parseFloat($('inp-paid').value) || 0,
    notes: $('inp-notes').value.trim(),
  };

  if (editingItemKey) {
    const id  = editingItemKey.split('|')[1];
    const idx = items.findIndex(i => i.id === id);
    if (idx >= 0) items[idx] = { ...items[idx], ...entry };
  } else {
    items.push({ id: uid(), ...entry });
  }

  saveDB(); closeModal('modal-expense'); renderMonthly();
  scheduleNotifications();
});

$('btn-delete-item').addEventListener('click', () => {
  if (!editingItemKey || !confirm('Delete this item?')) return;
  const [mKey, id] = editingItemKey.split('|');
  db.expenses[mKey] = (db.expenses[mKey]||[]).filter(i => i.id !== id);
  saveDB(); closeModal('modal-expense'); renderMonthly();
});

// ── Templates ─────────────────────────────────────────────────────
function renderTemplates() {
  const tmps = db.templates || [];
  const sorted = [...tmps].sort((a,b) => a.dueDay - b.dueDay);
  const list = $('template-list');

  if (!sorted.length) {
    list.innerHTML = '<div class="empty-state">No templates yet. Add one to auto-populate new months.</div>';
    return;
  }

  list.innerHTML = sorted.map(t => `
    <div class="template-item ${t.active ? '' : 'inactive'}" data-id="${t.id}">
      <div class="tpl-day">${String(t.dueDay).padStart(2,'0')}</div>
      <div class="tpl-body">
        <div class="tpl-name">${t.name}${t.code ? ` <span class="tpl-code">${t.code}</span>` : ''}</div>
        <div class="tpl-meta">Due on day ${t.dueDay} of each month</div>
      </div>
      <span class="tpl-badge ${t.active ? 'active' : 'inactive'}">${t.active ? 'Active' : 'Inactive'}</span>
      <div class="tpl-amount">${t.defaultAmount ? fmt(t.defaultAmount) : '—'}</div>
      <div class="tpl-actions">
        <button class="tpl-action-btn tpl-toggle"
          data-id="${t.id}"
          data-tooltip="${t.active ? 'Deactivate' : 'Activate'}"
          title="${t.active ? 'Deactivate' : 'Activate'}">
          ${t.active ? '⏸' : '▶'}
        </button>
        <button class="tpl-action-btn tpl-delete"
          data-id="${t.id}"
          data-tooltip="Delete"
          title="Delete">
          🗑
        </button>
      </div>
    </div>
  `).join('');

  list.querySelectorAll('.template-item').forEach(el => {
    el.addEventListener('click', e => {
      if (e.target.closest('.tpl-action-btn')) return;
      openTemplateModal(el.dataset.id);
    });
  });

  list.querySelectorAll('.tpl-toggle').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const tpl = (db.templates||[]).find(t => t.id === btn.dataset.id);
      if (!tpl) return;
      tpl.active = !tpl.active;
      saveDB(); renderTemplates();
    });
  });

  list.querySelectorAll('.tpl-delete').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      if (!confirm(`Delete template "${(db.templates||[]).find(t=>t.id===btn.dataset.id)?.name}"? Existing monthly entries are unaffected.`)) return;
      db.templates = (db.templates||[]).filter(t => t.id !== btn.dataset.id);
      saveDB(); renderTemplates();
    });
  });
}

let editingTplId = null;

function openTemplateModal(id) {
  const tpl = id ? (db.templates||[]).find(t => t.id === id) : null;
  editingTplId = id || null;
  $('modal-tpl-title').textContent = tpl ? 'Edit Template' : 'Add Template';
  $('tpl-code').value   = tpl?.code          || '';
  $('tpl-name').value   = tpl?.name          || '';
  $('tpl-amount').value = tpl?.defaultAmount || '';
  $('tpl-day').value    = tpl?.dueDay        || '';
  $('tpl-active').value = tpl ? String(tpl.active) : 'true';
  $('btn-delete-template').style.display = tpl ? '' : 'none';
  $('modal-template').classList.remove('hidden');
  setTimeout(() => $('tpl-name').focus(), 50);
}

$('btn-add-template').addEventListener('click', () => openTemplateModal(null));

$('form-template').addEventListener('submit', e => {
  e.preventDefault();
  if (!db.templates) db.templates = [];
  const entry = {
    code: $('tpl-code').value.trim().toUpperCase(),
    name: $('tpl-name').value.trim(),
    defaultAmount: parseFloat($('tpl-amount').value) || 0,
    dueDay: parseInt($('tpl-day').value) || 1,
    active: $('tpl-active').value === 'true',
  };
  if (editingTplId) {
    const idx = db.templates.findIndex(t => t.id === editingTplId);
    if (idx >= 0) db.templates[idx] = { ...db.templates[idx], ...entry };
  } else {
    db.templates.push({ id: uid(), ...entry });
  }
  saveDB(); closeModal('modal-template'); renderTemplates();
});

$('btn-delete-template').addEventListener('click', () => {
  if (!editingTplId || !confirm('Delete this template? Existing monthly entries are unaffected.')) return;
  db.templates = (db.templates||[]).filter(t => t.id !== editingTplId);
  saveDB(); closeModal('modal-template'); renderTemplates();
});

// ── RSU ───────────────────────────────────────────────────────────
function renderRSU() {
  const allSales = db.rsu || [];
  const allYears = [...new Set(allSales.map(r => r.date.slice(0,4)))].sort().reverse();
  if (!allYears.length) allYears.push(String(today.getFullYear()));

  const rsuYearSel = $('rsu-year-select');
  const prevVal    = rsuYearSel.value;
  rsuYearSel.innerHTML = allYears.map(y =>
    `<option value="${y}"${y === (prevVal || allYears[0]) ? ' selected' : ''}>${y}</option>`
  ).join('');

  doRenderRSU(rsuYearSel.value || allYears[0]);
  rsuYearSel.onchange = () => doRenderRSU(rsuYearSel.value);
}

function doRenderRSU(year) {
  const sales = [...(db.rsu||[])]
    .filter(r => r.date.slice(0,4) === String(year))
    .sort((a,b) => new Date(b.date) - new Date(a.date));

  const totProceeds = sales.reduce((s,r) => s + (r.proceeds||0), 0);
  const avgPerSale  = sales.length ? Math.round(totProceeds / sales.length) : 0;
  const bestSale    = sales.reduce((best,r) => (r.proceeds||0) > (best?.proceeds||0) ? r : best, null);

  // Prior year comparison
  const prevYear    = String(+year - 1);
  const prevSales   = (db.rsu||[]).filter(r => r.date.slice(0,4) === prevYear);
  const prevTotal   = prevSales.reduce((s,r) => s + (r.proceeds||0), 0);
  const yoyDiff     = totProceeds - prevTotal;
  const yoyPct      = prevTotal ? Math.round((yoyDiff / prevTotal) * 100) : null;

  const yoyHtml = prevTotal
    ? `<div class="stat-card">
        <div class="stat-label">vs ${prevYear}</div>
        <div class="stat-value" style="color:${yoyDiff>=0?'var(--green)':'var(--red)'}">
          ${yoyDiff>=0?'+':''}${fmt(yoyDiff)}<span style="font-size:12px;font-weight:500;margin-left:4px">(${yoyDiff>=0?'+':''}${yoyPct}%)</span>
        </div>
       </div>` : '';

  $('rsu-summary').innerHTML = `
    <div class="stat-card">
      <div class="stat-label">Total Proceeds ${year}</div>
      <div class="stat-value" style="color:var(--purple)">${fmtFull(totProceeds)}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Avg per Sale</div>
      <div class="stat-value">${avgPerSale ? fmt(avgPerSale) : '—'}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Best Month</div>
      <div class="stat-value" style="color:var(--green)">${bestSale ? fmt(bestSale.proceeds) : '—'}</div>
      ${bestSale ? `<div style="font-size:11px;color:var(--text-muted);margin-top:2px">${bestSale.date.slice(0,7)}</div>` : ''}
    </div>
    ${yoyHtml}
  `;

  if (!sales.length) {
    $('rsu-list').innerHTML = `<div class="empty-state">No RSU sales for ${year}.</div>`;
    return;
  }

  // Relative bar scale
  const maxProceeds = Math.max(...sales.map(r => r.proceeds||0), 1);

  $('rsu-list').innerHTML = sales.map(r => {
    const barW      = Math.round(((r.proceeds||0) / maxProceeds) * 100);
    const priceStr  = r.price  ? `@ ₹${Number(r.price).toLocaleString('en-IN',{maximumFractionDigits:2})} / share` : '';
    const sharesStr = r.shares ? `${r.shares} shares` : '';
    const subLine   = [sharesStr, priceStr].filter(Boolean).join(' · ');
    return `
    <div class="rsu-item" data-id="${r.id}">
      <div class="rsu-row">
        <span class="rsu-name">${r.company || 'RSU Sale'}</span>
        <span class="rsu-fig-val purple" style="font-size:15px;font-weight:700">${fmtFull(r.proceeds)}</span>
      </div>
      <div class="rsu-row" style="margin-top:3px">
        <span class="rsu-date">${r.date}${subLine ? ' · ' + subLine : ''}</span>
        ${r.notes ? `<span style="font-size:11px;color:var(--text-muted)">${r.notes}</span>` : ''}
      </div>
      <div style="margin-top:7px;height:5px;background:var(--border);border-radius:3px;overflow:hidden">
        <div style="height:100%;width:${barW}%;background:var(--purple);border-radius:3px;transition:width 0.4s"></div>
      </div>
    </div>`;
  }).join('');

  $('rsu-list').querySelectorAll('.rsu-item').forEach(el => {
    el.addEventListener('click', () => openRsuModal(el.dataset.id));
  });
}

let editingRsuId = null;
function openRsuModal(id) {
  const sale = id ? (db.rsu||[]).find(r => r.id === id) : null;
  editingRsuId = id || null;
  $('modal-rsu-title').textContent = sale ? 'Edit RSU Sale' : 'Add RSU Sale';
  $('rsu-date').value     = sale?.date    || today.toISOString().slice(0,10);
  $('rsu-company').value  = sale?.company || '';
  $('rsu-shares').value   = sale?.shares  || '';
  $('rsu-price').value    = sale?.price   || '';
  $('rsu-proceeds').value = sale?.proceeds|| '';
  $('rsu-notes').value    = sale?.notes   || '';
  $('btn-delete-rsu').style.display = sale ? '' : 'none';
  $('modal-rsu').classList.remove('hidden');
}
$('btn-add-rsu').addEventListener('click', () => openRsuModal(null));

['rsu-shares','rsu-price'].forEach(id => {
  $(id).addEventListener('input', () => {
    const s = parseFloat($('rsu-shares').value)||0;
    const p = parseFloat($('rsu-price').value)||0;
    if (s && p) $('rsu-proceeds').value = (s*p).toFixed(2);
  });
});

$('form-rsu').addEventListener('submit', e => {
  e.preventDefault();
  if (!db.rsu) db.rsu = [];
  const entry = {
    id:       editingRsuId || uid(),
    date:     $('rsu-date').value,
    company:  $('rsu-company').value.trim(),
    shares:   parseFloat($('rsu-shares').value)   || 0,
    price:    parseFloat($('rsu-price').value)    || 0,
    proceeds: parseFloat($('rsu-proceeds').value) || 0,
    notes:    $('rsu-notes').value.trim(),
  };
  if (editingRsuId) {
    const idx = db.rsu.findIndex(r => r.id === editingRsuId);
    if (idx >= 0) db.rsu[idx] = entry; else db.rsu.push(entry);
  } else {
    db.rsu.push(entry);
  }
  saveDB(); closeModal('modal-rsu'); renderRSU();
});

$('btn-delete-rsu').addEventListener('click', () => {
  if (!editingRsuId || !confirm('Delete this RSU sale?')) return;
  db.rsu = (db.rsu||[]).filter(r => r.id !== editingRsuId);
  saveDB(); closeModal('modal-rsu'); renderRSU();
});

// ── Summary ───────────────────────────────────────────────────────
function renderSummary() {
  const sy = $('summary-year-select');
  const years = [...new Set(Object.keys(db.expenses).map(k => k.split('-')[0]))].sort();
  if (!years.length) years.push(String(today.getFullYear()));
  const selYear = sy.value || String(curYear);
  sy.innerHTML = years.map(y => `<option value="${y}"${y===selYear?' selected':''}>${y}</option>`).join('');
  doRenderSummary(selYear);
  sy.onchange = () => doRenderSummary(sy.value);
}

// ── Trend chart (inline SVG, no deps) ────────────────────────────
function fmtShort(n) {
  if (n >= 1e7) return (n/1e7).toFixed(1).replace(/\.0$/,'') + 'Cr';
  if (n >= 1e5) return (n/1e5).toFixed(1).replace(/\.0$/,'') + 'L';
  if (n >= 1e3) return Math.round(n/1e3) + 'K';
  return String(Math.round(n));
}

function buildTrendChart(monthData, maxVal) {
  const W=740, H=216, PL=50, PR=10, PT=28, PB=32;
  const cW = W - PL - PR;
  const cH = H - PT - PB;
  const slotW = cW / 12;
  const bW = 10;

  const bg = [], expBars = [], thBars = [], rsuBars = [];
  const expLine = [], thLine = [], paidLine = [];

  // Background + gridlines
  bg.push(`<rect x="${PL}" y="${PT}" width="${cW}" height="${cH}" fill="var(--surface2)" rx="4" opacity="0.5"/>`);
  [0.25, 0.5, 0.75, 1.0].forEach(f => {
    const y = +(PT + cH * (1 - f)).toFixed(1);
    bg.push(`<line x1="${PL}" y1="${y}" x2="${W-PR}" y2="${y}" stroke="var(--border)" stroke-width="${f===1?'1':'0.7'}" stroke-dasharray="${f===1?'':'4,3'}"/>`);
    bg.push(`<text x="${PL-5}" y="${y+4}" text-anchor="end" font-size="9" fill="var(--text-muted)" font-family="monospace">${fmtShort(maxVal*f)}</text>`);
  });

  const trendPts = [], thPts = [], paidPts = [];
  monthData.forEach((d, i) => {
    const cx = +(PL + i * slotW + slotW / 2).toFixed(1);

    if (d.total > 0) {
      const bH = +((d.total / maxVal) * cH).toFixed(1);
      const bY = +(PT + cH - bH).toFixed(1);
      const bX = +(cx - bW * 1.6).toFixed(1);
      expBars.push(`<rect class="chart-bar-cl" data-key="${d.key}" x="${bX}" y="${bY}" width="${bW}" height="${bH}" fill="var(--blue)" rx="2" opacity="0.82"><title>${d.m}: ${fmt(d.total)}</title></rect>`);
      trendPts.push({ x: +(bX + bW/2).toFixed(1), y: bY });
    }
    if (d.takeHome > 0) {
      const bH = +((d.takeHome / maxVal) * cH).toFixed(1);
      const bY = +(PT + cH - bH).toFixed(1);
      const bX = +(cx - bW * 0.5).toFixed(1);
      thBars.push(`<rect class="chart-bar-cl" data-key="${d.key}" x="${bX}" y="${bY}" width="${bW}" height="${bH}" fill="var(--green)" rx="2" opacity="0.78"><title>${d.m} TH: ${fmt(d.takeHome)}</title></rect>`);
      thPts.push({ x: +(bX + bW/2).toFixed(1), y: bY });
    }
    if (d.rsuIncome > 0) {
      const bH = +((d.rsuIncome / maxVal) * cH).toFixed(1);
      const bY = +(PT + cH - bH).toFixed(1);
      const bX = +(cx + bW * 0.6).toFixed(1);
      rsuBars.push(`<rect class="chart-bar-cl" data-key="${d.key}" x="${bX}" y="${bY}" width="${bW}" height="${bH}" fill="var(--purple)" rx="2" opacity="0.75"><title>${d.m} RSU: ${fmt(d.rsuIncome)}</title></rect>`);
    }
    if (d.paid > 0 && d.total > 0) {
      paidPts.push({ x: cx, y: +(PT + cH - (d.paid / maxVal) * cH).toFixed(1) });
    }
    bg.push(`<text x="${cx}" y="${H - PB + 16}" text-anchor="middle" font-size="10" fill="var(--text-muted)">${d.m}</text>`);
  });

  bg.push(`<line x1="${PL}" y1="${PT+cH}" x2="${W-PR}" y2="${PT+cH}" stroke="var(--border)" stroke-width="1"/>`);

  if (trendPts.length >= 2) {
    expLine.push(`<path d="${trendPts.map((p,i)=>`${i?'L':'M'}${p.x},${p.y}`).join(' ')}" fill="none" stroke="var(--blue)" stroke-width="1.5" stroke-dasharray="5,3" opacity="0.6"/>`);
    trendPts.forEach(p => expLine.push(`<circle cx="${p.x}" cy="${p.y}" r="2.5" fill="var(--blue)" opacity="0.75"/>`));
  }
  if (thPts.length >= 2) {
    thLine.push(`<path d="${thPts.map((p,i)=>`${i?'L':'M'}${p.x},${p.y}`).join(' ')}" fill="none" stroke="var(--green)" stroke-width="1.5" stroke-dasharray="5,3" opacity="0.7"/>`);
    thPts.forEach(p => thLine.push(`<circle cx="${p.x}" cy="${p.y}" r="2.5" fill="var(--green)" opacity="0.85"/>`));
  }
  if (paidPts.length >= 2) {
    paidLine.push(`<path d="${paidPts.map((p,i)=>`${i?'L':'M'}${p.x},${p.y}`).join(' ')}" fill="none" stroke="var(--green)" stroke-width="2" stroke-linecap="round" opacity="0.8"/>`);
    paidPts.forEach(p => paidLine.push(`<circle cx="${p.x}" cy="${p.y}" r="3" fill="var(--green)" opacity="0.9"/>`));
  }

  // Legend (interactive)
  const legends = [
    { key:'expenses',  color:'var(--blue)',   label:'Expenses'  },
    { key:'takehome',  color:'var(--green)',  label:'Take-Home' },
    { key:'rsu',       color:'var(--purple)', label:'RSU'       },
  ];
  const legParts = [`<g transform="translate(${PL},10)">`];
  let lx = 0;
  legends.forEach(l => {
    legParts.push(`<g data-legend="${l.key}" style="cursor:pointer">
      <rect x="${lx}" y="1" width="10" height="10" fill="${l.color}" rx="2" opacity="0.82"/>
      <text x="${lx+14}" y="10" font-size="10" fill="var(--text-muted)">${l.label}</text>
    </g>`);
    lx += l.label.length * 6.5 + 22;
  });
  legParts.push('</g>');

  const svg = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto;display:block;overflow:visible">
    ${bg.join('')}
    <g data-series="expenses">${expBars.join('')}${expLine.join('')}</g>
    <g data-series="takehome">${thBars.join('')}${thLine.join('')}</g>
    <g data-series="rsu">${rsuBars.join('')}</g>
    ${legParts.join('')}
  </svg>`;
  return svg;
}

function doRenderSummary(year) {
  let annualTotal = 0, annualPaid = 0, annualRSU = 0, annualTakeHome = 0;

  const monthData = MONTHS.map((m, mi) => {
    const key   = `${year}-${String(mi+1).padStart(2,'0')}`;
    const isFuture = (+year > curYear) || (+year === curYear && mi > curMonth);

    let total = 0, paid = 0;
    if (!isFuture) {
      const items = db.expenses[key] || [];
      items.forEach(it => {
        total += it.amount || 0;
        if (it.status === 'Paid')         paid += it.amount || 0;
        else if (it.status === 'Partial') paid += it.paidAmount || 0;
      });
    }
    const rsuIncome  = (db.rsu||[])
      .filter(r => r.date.slice(0,7) === key)
      .reduce((s,r) => s + (r.proceeds||0), 0);
    const takeHome = isFuture ? 0 : ((db.takeHome||{})[key] || 0);
    const totalIncome = takeHome + rsuIncome;

    annualTotal += total; annualPaid += paid;
    annualRSU += rsuIncome; annualTakeHome += takeHome;
    return { m, mi, key, total, paid, deficit: total - paid, rsuIncome, takeHome, totalIncome };
  });

  const annualIncome  = annualTakeHome + annualRSU;
  const maxTotal      = Math.max(...monthData.map(d => Math.max(d.total, d.totalIncome)), 1);
  const annualNetPos  = annualIncome - annualTotal;
  const annualPaidPct = annualTotal ? Math.round((annualPaid / annualTotal) * 100) : 0;

  // Months with data only
  const activeMonths = monthData.filter(d => d.total > 0);
  const highMonth  = activeMonths.reduce((h,d) => d.total > (h?.total||0) ? d : h, null);
  const lowMonth   = activeMonths.reduce((l,d) => d.total < (l?.total||Infinity) ? d : l, null);

  const insightsHtml = activeMonths.length >= 2 ? `
    <div class="summary-insights">
      <div class="insight-chip insight-high">
        <span class="insight-icon">📈</span>
        <span>Highest: <strong>${highMonth.m}</strong> — ${fmt(highMonth.total)}</span>
      </div>
      <div class="insight-chip insight-low">
        <span class="insight-icon">📉</span>
        <span>Lowest: <strong>${lowMonth.m}</strong> — ${fmt(lowMonth.total)}</span>
      </div>
      <div class="insight-chip">
        <span class="insight-icon">✅</span>
        <span>Overall settled: <strong>${annualPaidPct}%</strong> of annual spend</span>
      </div>
      ${annualIncome > 0 ? `<div class="insight-chip insight-rsu">
        <span class="insight-icon">💚</span>
        <span>Take-Home covers <strong>${Math.round((annualTakeHome/annualTotal)*100)}%</strong> · RSU covers <strong>${Math.round((annualRSU/annualTotal)*100)}%</strong> · Combined <strong>${Math.round((annualIncome/annualTotal)*100)}%</strong> of expenses</span>
      </div>` : ''}
    </div>` : '';

  $('summary-content').innerHTML = `
    <div class="annual-stats">
      <div class="annual-stat">
        <div class="annual-stat-label">Annual Expenses</div>
        <div class="annual-stat-value">${fmt(annualTotal)}</div>
      </div>
      <div class="annual-stat">
        <div class="annual-stat-label">Take-Home Income</div>
        <div class="annual-stat-value" style="color:var(--green)">${fmt(annualTakeHome)}</div>
      </div>
      <div class="annual-stat">
        <div class="annual-stat-label">RSU Income</div>
        <div class="annual-stat-value" style="color:var(--purple)">${fmt(annualRSU)}</div>
      </div>
      <div class="annual-stat">
        <div class="annual-stat-label">Net Position</div>
        <div class="annual-stat-value" style="color:${annualNetPos>=0?'var(--green)':'var(--red)'}">
          ${annualNetPos>=0?'+':'−'}${fmt(Math.abs(annualNetPos))}
        </div>
      </div>
    </div>
    ${insightsHtml}
    <div class="summary-section-title" style="margin-top:16px">Monthly Trend</div>
    <div class="trend-chart-wrap">${buildTrendChart(monthData, maxTotal)}</div>
    <div class="summary-section-title" style="margin-top:16px">Month-by-Month Breakdown</div>
    ${monthData.map((d, idx) => {
      const barDue    = d.total       ? Math.round((d.total        / maxTotal) * 100) : 0;
      const barPaid   = d.total       ? Math.round((d.paid         / maxTotal) * 100) : 0;
      const barRSU    = d.rsuIncome   ? Math.round((d.rsuIncome    / maxTotal) * 100) : 0;
      const barTH     = d.takeHome    ? Math.round((d.takeHome     / maxTotal) * 100) : 0;
      const paidPct   = d.total       ? Math.round((d.paid         / d.total)  * 100) : 0;
      const hasDeficit = d.deficit > 1;
      const hasSurplus = d.deficit < -1;
      const nothingYet = d.total === 0;

      // Trend vs previous active month
      const prevActive = monthData.slice(0, idx).reverse().find(p => p.total > 0);
      let trendHtml = '';
      if (prevActive && d.total > 0) {
        const diff = d.total - prevActive.total;
        const pct  = Math.round(Math.abs(diff) / prevActive.total * 100);
        trendHtml = diff > 0
          ? `<span class="smr-trend up">▲ ${pct}%</span>`
          : `<span class="smr-trend down">▼ ${pct}%</span>`;
      }

      const deficitBadge = hasDeficit
        ? `<span style="font-size:11px;color:var(--red);font-weight:600">−${fmt(d.deficit)}</span>`
        : hasSurplus
        ? `<span style="font-size:11px;color:var(--green);font-weight:600">+${fmt(Math.abs(d.deficit))}</span>`
        : '';

      return `<div class="smr" data-key="${d.key}">
        <div class="smr-collapsed">
          <div class="smr-month">${d.m}</div>
          <div class="smr-collapsed-total">${nothingYet ? '—' : fmt(d.total)}</div>
          <div class="smr-collapsed-right">
            ${deficitBadge}
            ${trendHtml}
            <span class="smr-chevron">▼</span>
          </div>
        </div>
        <div class="smr-detail">
          <div class="smr-bars">
            <div class="smr-bar-row">
              <span class="smr-bar-label">Exp</span>
              <div class="smr-bar-track"><div class="smr-bar-fill due" style="width:${barDue}%"></div></div>
            </div>
            <div class="smr-bar-row">
              <span class="smr-bar-label">Paid</span>
              <div class="smr-bar-track"><div class="smr-bar-fill paid" style="width:${barPaid}%"></div></div>
            </div>
            <div class="smr-bar-row">
              <span class="smr-bar-label">TH</span>
              <div class="smr-bar-track"><div class="smr-bar-fill" style="width:${barTH}%;background:var(--green)"></div></div>
            </div>
            <div class="smr-bar-row">
              <span class="smr-bar-label">RSU</span>
              <div class="smr-bar-track"><div class="smr-bar-fill" style="width:${barRSU}%;background:var(--purple)"></div></div>
            </div>
          </div>
          <div class="smr-detail-stats">
            <div class="smr-detail-stat">Paid <strong>${fmt(d.paid)}</strong> <span class="smr-paid-pct">(${paidPct}%)</span></div>
            ${d.takeHome  ? `<div class="smr-detail-stat">TH <strong style="color:var(--green)">${fmt(d.takeHome)}</strong></div>`   : ''}
            ${d.rsuIncome ? `<div class="smr-detail-stat">RSU <strong style="color:var(--purple)">${fmt(d.rsuIncome)}</strong></div>` : ''}
          </div>
          ${hasDeficit ? `
            <div class="smr-deficit">
              <span class="smr-deficit-label">Deficit</span>
              <span class="smr-deficit-note">${paidPct}% settled — ${fmt(d.paid)} of ${fmt(d.total)} paid</span>
              <span class="smr-deficit-val">−${fmt(d.deficit)}</span>
            </div>` : ''}
          ${hasSurplus ? `
            <div class="smr-surplus-row">
              <span class="smr-deficit-label">Surplus</span>
              <span class="smr-deficit-note">Fully paid + overpaid</span>
              <span class="smr-surplus-val">+${fmt(Math.abs(d.deficit))}</span>
            </div>` : ''}
        </div>
      </div>`;
    }).join('')}
  `;

  // Interactive legend toggles — click to solo a series, click again to restore all
  const seriesState = { expenses: true, takehome: true, rsu: true };
  const legendEls = {};
  $('summary-content').querySelectorAll('[data-legend]').forEach(el => {
    legendEls[el.dataset.legend] = el;
  });

  function applySeriesVisibility() {
    Object.keys(seriesState).forEach(key => {
      const group = $('summary-content').querySelector(`[data-series="${key}"]`);
      if (group) group.style.display = seriesState[key] ? '' : 'none';
      if (legendEls[key]) legendEls[key].style.opacity = seriesState[key] ? '1' : '0.35';
    });
  }

  Object.keys(legendEls).forEach(key => {
    legendEls[key].addEventListener('click', () => {
      const allOn = Object.values(seriesState).every(v => v);
      if (allOn) {
        // Solo: hide all others
        Object.keys(seriesState).forEach(k => { seriesState[k] = k === key; });
      } else if (seriesState[key]) {
        // Already soloed — restore all
        Object.keys(seriesState).forEach(k => { seriesState[k] = true; });
      } else {
        // Switch solo to this series
        Object.keys(seriesState).forEach(k => { seriesState[k] = k === key; });
      }
      applySeriesVisibility();
    });
  });

  $('summary-content').querySelectorAll('.smr').forEach(el => {
    el.addEventListener('click', e => {
      // Clicking chart bars still navigates
      if (e.target.closest('.chart-bar-cl')) return;
      el.classList.toggle('expanded');
    });
  });
  $('summary-content').querySelectorAll('.chart-bar-cl').forEach(el => {
    el.addEventListener('click', () => {
      const [y, m] = el.dataset.key.split('-');
      curYear = +y; curMonth = +m - 1;
      syncSelectors();
      document.querySelector('.nav-item[data-tab="monthly"]').click();
    });
  });
}

// ── Future (Assets & Net Worth) ───────────────────────────────────
const ASSET_CATEGORIES = [
  { key: 'investments', label: 'Investments & Savings', icon: '💰' },
  { key: 'property',    label: 'Property',              icon: '🏠' },
  { key: 'vehicles',    label: 'Vehicles',              icon: '🚗' },
  { key: 'insurance',   label: 'Insurance',             icon: '🛡' },
  { key: 'chitti',      label: 'Chitti',                icon: '🎰' },
  { key: 'debts',       label: 'Debts & Liabilities',   icon: '📋' },
];

function renderFuture() {
  const assets = db.assets || [];

  // Totals
  const totalAssets   = assets.filter(a => a.category !== 'debts' && a.category !== 'insurance' && a.status !== 'sold').reduce((s,a) => s + (a.value||0), 0);
  const totalDebts    = assets.filter(a => a.category === 'debts'  && a.status !== 'closed').reduce((s,a) => s + (a.value||0), 0);
  const netWorth      = totalAssets - totalDebts;
  const monthlyOut    = assets.filter(a => a.commitFreq === 'monthly' && a.status === 'active').reduce((s,a) => s + (a.commitment||0), 0);

  const nwColor = netWorth >= 0 ? 'var(--green)' : 'var(--red)';

  $('future-content').innerHTML = `
    <div class="annual-stats" style="margin-bottom:16px">
      <div class="annual-stat">
        <div class="annual-stat-label">Total Assets</div>
        <div class="annual-stat-value" style="color:var(--green)">${fmt(totalAssets)}</div>
        <div class="fig-words">${fmtWords(totalAssets)}</div>
      </div>
      <div class="annual-stat">
        <div class="annual-stat-label">Total Debts</div>
        <div class="annual-stat-value" style="color:var(--red)">${fmt(totalDebts)}</div>
        <div class="fig-words">${fmtWords(totalDebts)}</div>
      </div>
      <div class="annual-stat">
        <div class="annual-stat-label">Net Worth</div>
        <div class="annual-stat-value" style="color:${nwColor}">${netWorth>=0?'+':'−'}${fmt(Math.abs(netWorth))}</div>
        <div class="fig-words">${fmtWords(Math.abs(netWorth))}</div>
      </div>
      <div class="annual-stat">
        <div class="annual-stat-label">Monthly Outflow</div>
        <div class="annual-stat-value">${fmt(monthlyOut)}</div>
        <div class="fig-words">${fmtWords(monthlyOut)}</div>
      </div>
    </div>
    ${ASSET_CATEGORIES.map(cat => {
      const items = assets.filter(a => a.category === cat.key);
      if (!items.length) return '';
      const catTotal = items.filter(a => a.status !== 'sold' && a.status !== 'closed').reduce((s,a) => s + (a.value||0), 0);
      const isDebt   = cat.key === 'debts';
      return `
        <div class="asset-category" data-cat="${cat.key}">
          <div class="asset-cat-header">
            <span class="asset-cat-icon">${cat.icon}</span>
            <span class="asset-cat-label">${cat.label} <span class="asset-cat-count">${items.length}</span></span>
            <span class="asset-cat-total" style="color:${isDebt?'var(--red)':'var(--text)'}">
              ${catTotal ? fmt(catTotal) : '—'}
              ${catTotal ? `<span class="fig-words">${fmtWords(catTotal)}</span>` : ''}
            </span>
            <span class="asset-cat-chevron">▼</span>
          </div>
          <div class="asset-cat-body">
            ${items.map(a => {
              const statusCls = a.status === 'active' ? 'ast-active' : a.status === 'sold' ? 'ast-sold' : 'ast-closed';
              const commitStr = a.commitment
                ? `${fmt(a.commitment)} / ${a.commitFreq}`
                : a.commitFreq === 'one-time' ? 'One-time' : '';
              return `
                <div class="asset-item ${statusCls}" data-id="${a.id}">
                  <div class="asset-item-body">
                    <div class="asset-item-name">${a.name}</div>
                    ${a.notes ? `<div class="asset-item-notes">${a.notes}</div>` : ''}
                    ${commitStr ? `<div class="asset-item-commit">${commitStr}</div>` : ''}
                    ${a.category === 'investments' && a.unvestedRSU ? `<div style="font-size:11px;color:var(--purple);margin-top:3px">Unvested RSU: ${fmt(a.unvestedRSU)} <span class="fig-words" style="color:var(--purple)">${fmtWords(a.unvestedRSU)}</span></div>` : ''}
                  </div>
                  <div class="asset-item-right">
                    <div class="asset-item-value" style="color:${isDebt?'var(--red)':'var(--text)'}">
                      ${a.value ? fmt(a.value) : '—'}
                      ${a.value ? `<div class="fig-words">${fmtWords(a.value)}</div>` : ''}
                    </div>
                    ${a.category === 'insurance' && a.sumAssured ? `<div class="asset-item-assured">SA: ${fmt(a.sumAssured)}<span class="fig-words">${fmtWords(a.sumAssured)}</span></div>` : ''}
                    <span class="asset-status-badge ${statusCls}">${a.status}</span>
                  </div>
                </div>`;
            }).join('')}
            <button class="asset-add-btn" data-cat="${cat.key}">+ Add</button>
          </div>
        </div>`;
    }).join('')}
  `;

  // Category accordion toggle
  $('future-content').querySelectorAll('.asset-category').forEach(el => {
    el.querySelector('.asset-cat-header').addEventListener('click', () => {
      el.classList.toggle('expanded');
    });
  });

  // Edit existing asset
  $('future-content').querySelectorAll('.asset-item').forEach(el => {
    el.addEventListener('click', e => {
      if (e.target.closest('.asset-add-btn')) return;
      openAssetModal(el.dataset.id);
    });
  });

  // Add new asset per category
  $('future-content').querySelectorAll('.asset-add-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      openAssetModal(null, btn.dataset.cat);
    });
  });
}

let editingAssetId = null;
function toggleAssuredRow() {
  $('ast-assured-row').classList.toggle('hidden', $('ast-cat').value !== 'insurance');
  $('ast-unvested-row').classList.toggle('hidden', $('ast-cat').value !== 'investments');
}
$('ast-cat').addEventListener('change', toggleAssuredRow);
function openAssetModal(id, defaultCat) {
  const asset = id ? (db.assets||[]).find(a => a.id === id) : null;
  editingAssetId = id || null;
  $('modal-asset-title').textContent = asset ? 'Edit Asset' : 'Add Asset';
  $('ast-cat').value        = asset?.category   || defaultCat || 'investments';
  $('ast-name').value       = asset?.name       || '';
  $('ast-value').value      = asset?.value      || '';
  $('ast-assured').value    = asset?.sumAssured  || '';
  $('ast-unvested').value   = asset?.unvestedRSU || '';
  $('ast-commitment').value = asset?.commitment  || '';
  $('ast-freq').value       = asset?.commitFreq || '';
  $('ast-status').value     = asset?.status     || 'active';
  $('ast-notes').value      = asset?.notes      || '';
  $('btn-delete-asset').style.display = asset ? '' : 'none';
  toggleAssuredRow();
  $('modal-asset').classList.remove('hidden');
  setTimeout(() => $('ast-name').focus(), 50);
}

$('form-asset').addEventListener('submit', e => {
  e.preventDefault();
  if (!db.assets) db.assets = [];
  const entry = {
    id:          editingAssetId || uid(),
    category:    $('ast-cat').value,
    name:        $('ast-name').value.trim(),
    value:       parseFloat($('ast-value').value)      || 0,
    sumAssured:  parseFloat($('ast-assured').value)   || 0,
    unvestedRSU: parseFloat($('ast-unvested').value)  || 0,
    commitment:  parseFloat($('ast-commitment').value) || 0,
    commitFreq:  $('ast-freq').value,
    status:      $('ast-status').value,
    notes:       $('ast-notes').value.trim(),
  };
  if (editingAssetId) {
    const idx = db.assets.findIndex(a => a.id === editingAssetId);
    if (idx >= 0) db.assets[idx] = entry; else db.assets.push(entry);
  } else {
    db.assets.push(entry);
  }
  saveDB(); closeModal('modal-asset'); renderFuture();
});

$('btn-delete-asset').addEventListener('click', () => {
  if (!editingAssetId || !confirm('Delete this asset?')) return;
  db.assets = (db.assets||[]).filter(a => a.id !== editingAssetId);
  saveDB(); closeModal('modal-asset'); renderFuture();
});

// ── Notifications ─────────────────────────────────────────────────
$('btn-notify').addEventListener('click', async () => {
  if (!('Notification' in window)) { alert('Notifications not supported in this browser.'); return; }
  const perm = await Notification.requestPermission();
  if (perm === 'granted') {
    scheduleNotifications();
    alert('Reminders enabled! You will be notified on due dates.');
  } else {
    alert('Permission denied. Enable notifications in browser/OS settings.');
  }
});

function scheduleNotifications() {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.ready.then(reg => {
    const key   = monthKey(today.getFullYear(), today.getMonth());
    const items = db.expenses[key] || [];
    items.forEach(it => {
      if (it.status === 'Paid') return;
      const due  = new Date(it.due);
      const diff = Math.floor((due - today) / 86400000);
      if ([0, 1, 3].includes(diff)) {
        const label = diff === 0 ? 'Due TODAY' : `Due in ${diff} day${diff > 1 ? 's' : ''}`;
        reg.showNotification(`Finance: ${it.name}`, {
          body: `${label} — ${fmtFull(it.amount)}`,
          tag: `finance-${it.id}`,
        });
      }
    });
  });
}

// ── Sync ──────────────────────────────────────────────────────────
$('btn-sync').addEventListener('click', () => $('modal-sync').classList.remove('hidden'));

$('btn-export').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' });
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  a.download = `finance-tracker-${today.toISOString().slice(0,10)}.json`;
  a.click();
});

$('inp-import').addEventListener('change', e => {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const imp = JSON.parse(ev.target.result);
      if (!imp.expenses) throw new Error();
      if (!confirm('Replace all current data with imported data?')) return;
      db = imp; saveDB(); renderMonthly();
      closeModal('modal-sync');
      alert('Data imported successfully!');
    } catch { alert('Invalid JSON file.'); }
  };
  reader.readAsText(file);
});

$('btn-clear-data').addEventListener('click', () => {
  if (!confirm('Clear ALL data and restore defaults?')) return;
  db = { expenses: {}, rsu: [], templates: [], takeHome: {} };
  if (typeof SEED_2025)      db.expenses  = JSON.parse(JSON.stringify(SEED_2025));
  if (typeof SEED_2026)      Object.entries(SEED_2026).forEach(([k,v]) => { db.expenses[k] = JSON.parse(JSON.stringify(v)); });
  if (typeof SEED_TEMPLATES) db.templates = JSON.parse(JSON.stringify(SEED_TEMPLATES));
  if (typeof SEED_RSU)       db.rsu       = JSON.parse(JSON.stringify(SEED_RSU));
  if (typeof SEED_TAKEHOME)  db.takeHome  = JSON.parse(JSON.stringify(SEED_TAKEHOME));
  if (typeof SEED_ASSETS)    db.assets    = JSON.parse(JSON.stringify(SEED_ASSETS));
  db._dataVersion = DATA_VERSION;
  saveDB(); closeModal('modal-sync'); renderMonthly();
});

// ── Modal helpers ─────────────────────────────────────────────────
function closeModal(id) { $(id).classList.add('hidden'); }

document.querySelectorAll('.close-btn').forEach(btn => {
  btn.addEventListener('click', () => closeModal(btn.dataset.close));
});
document.querySelectorAll('.modal').forEach(modal => {
  modal.addEventListener('click', e => { if (e.target === modal) closeModal(modal.id); });
});

// ── Service worker ────────────────────────────────────────────────
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// ── Init ──────────────────────────────────────────────────────────
initSelectors();
initTakeHomeSave();
initTHBlur();
renderMonthly();
