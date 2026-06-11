/**
 * 日翊收發進貨平台 - App 核心邏輯（行動版）
 */

// ── 常數 ─────────────────────────────────────────────
// 大分類（三選一）
// 分類與原因改為動態（由 Firestore defect_config 管理），以下 getter 取代固定常數
function DEFECT_CATEGORIES() { return getDefectCategories(); }
function DEFECT_REASONS(cat) { return getDefectReasonsList(cat); }
// 向下相容
const DEFECT_SUB_REASONS = {};
// 取得顯示用原因文字（供卡片/報表顯示）
function getDefectDisplay(item) {
  if (!item) return '—';
  if (item.reasons?.length) return `${item.category}・${item.reasons.join('、')}`;
  return item.category || item.reason || '—';
}
const PROC_ACTIONS = ['正常收貨','退貨','換貨','補貨','折讓','報廢','廠商確認後處理','其他'];
const STATUS = { PENDING:'pending', RECEIVED:'received', ABNORMAL:'abnormal_pending', PROCUREMENT:'procurement', RESOLVED:'resolved' };
const TAB_LABELS = { receiving:'進貨確認', review:'異常檢核', purchase:'待回覆', report:'異常回覆', warehouse:'已確認', admin:'設定' };
const NAV_ICONS = {
  receiving: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>',
  warehouse: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>',
  review:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>',
  report:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>',
  purchase:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"/></svg>',
  admin:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>'
};

// ── 全域狀態 ──────────────────────────────────────────
let productsByDate  = {};
let _allKnownDates  = [];   // 所有已知日期，供懶載入使用
let _allDatesLoaded = false; // 是否已完成全日期載入
let currentRole    = 'field';
let currentPage    = 'receiving';
let currentIdx     = null;   // { date, idx }
let reviewIdx      = null;
let purchaseIdx    = null;
let editUserIdx    = null;
let editRoleIdx    = null;
let uploadedPhotos = [];
let _photoList = [], _photoIdx = 0;
let _reviewStartTime = '';

// ── 業務屬性 ──────────────────────────────────────────
function getBizAttrs() { return JSON.parse(localStorage.getItem('rr_biz_attrs') || '[]'); }
function saveBizAttrs(attrs) { localStorage.setItem('rr_biz_attrs', JSON.stringify(attrs)); }
async function loadBizAttrs() {
  try {
    const attrs = await BizAttrAPI.list();
    saveBizAttrs(attrs);
    return attrs;
  } catch(e) { return getBizAttrs(); }
}

// ── 異常設定 ──────────────────────────────────────────
const DEFAULT_DEFECT_MAP = {
  '外箱問題': ['外箱無麥頭','外箱嘜頭箱入數不符','外箱嘜頭品號不符','外箱嘜頭品名不符','外箱條碼與商品相同','外箱破損','外箱凹損','外箱濕損','外箱其它問題'],
  '效期問題': ['效期過允收','保不合(保存天數與主檔不符)','無第二效期條件','無效期標示','效期模糊或不完整','外袋無效期，包裝內有多種效期','外袋無效期，包裝內僅看到部份效期','外袋效期與內容物不符','效期用貼紙或手寫或塗改','效期其它問題'],
  '條碼問題': ['條碼不符','條碼無法讀取','未貼條碼','條碼標破損','條碼模糊或不完整','條碼其它問題'],
  '品名規格': ['品名不符或不完整','品名對不到','規格對不到','規格不符','無中標','中標破損','品名規格其它問題'],
  '商品問題': ['凹','破','汙','凹汙','凹破','破汙','凹汙破','瑕疵','生鏽','發霉','有蟲','失真空','多款式','未封口','裸裝','商品混放','商品未綑綁','商品其它問題'],
  '其它問題': ['到錯貨','數量不符','標籤破(污)損或模糊不清','其它異常','臨時到貨']
};
function getDefectMap() {
  const d = JSON.parse(localStorage.getItem('rr_defect_config') || 'null');
  return d?.map || DEFAULT_DEFECT_MAP;
}
function getDefectCategories() { return Object.keys(getDefectMap()); }
function getDefectReasonsList(cat) {
  const map = getDefectMap();
  return cat ? (map[cat] || []) : Object.values(map).flat();
}
function saveDefectConfig(cfg) {
  if (cfg.map) {
    localStorage.setItem('rr_defect_config', JSON.stringify({ map: cfg.map }));
  }
}
async function loadDefectConfig() {
  try {
    const cfg = await DefectConfigAPI.get();
    if (cfg.map) saveDefectConfig({ map: cfg.map });
    return cfg;
  } catch(e) { return { map: getDefectMap() }; }
}


// ── 大分類篩選選項 ────────────────────────────────────
const DEFAULT_CAT_FILTERS = ['食品','居家美妝','預購項目'];
function getCatFilters() { const d=JSON.parse(localStorage.getItem('rr_cat_filters')||'null'); return d||DEFAULT_CAT_FILTERS; }
function saveCatFilters(items) { localStorage.setItem('rr_cat_filters', JSON.stringify(items||null)); }
async function loadCatFilters() {
  try { const items=await CatFilterAPI.get(); saveCatFilters(items); } catch(e) {}
}

function nowStr()  { return new Date().toLocaleString('zh-TW'); }
function nowHHMM() { const d=new Date(); return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; }
function getDateProducts(date) { return productsByDate[date] || []; }
function getAllProducts()       { return Object.values(productsByDate).flat(); }
function currentReceivingDate(){ return document.getElementById('receivingDate')?.value || ''; }
function saveProductsData()    { try { localStorage.setItem('rr_products', JSON.stringify(productsByDate)); } catch(e){} }
function getCurrentUser()      { return JSON.parse(sessionStorage.getItem('rr_user') || 'null'); }
function getUsers()            { return JSON.parse(localStorage.getItem('rr_users') || '[]'); }
function saveUsers(u)          { localStorage.setItem('rr_users', JSON.stringify(u)); }
function getRoles()            { return JSON.parse(localStorage.getItem('rr_roles') || '[]'); }
function saveRoles(r)          { localStorage.setItem('rr_roles', JSON.stringify(r)); }

function getRoleById(id) {
  if (id==='admin')   return { id:'admin',   name:'管理員', tabs:Object.keys(TAB_LABELS) };
  if (id==='pending') return { id:'pending', name:'待審核', tabs:[] };
  return getRoles().find(r=>r.id===id) || null;
}
function getRoleName(id) { return getRoleById(id)?.name || id; }
function getRid(u) { return u.role_id || u.roleId || u.role || 'pending'; }

// ── 登入頁 ────────────────────────────────────────────
async function handleLogin(e) {
  e.preventDefault();
  const btn=document.getElementById('loginBtn');
  const errDiv=document.getElementById('loginError');
  const userId=document.getElementById('userId').value.trim();
  const password=document.getElementById('password').value;
  btn.disabled=true; btn.textContent='驗證中…'; errDiv.style.display='none';
  try {
    const user = await AuthAPI.login(userId, password);
    sessionStorage.setItem('rr_user', JSON.stringify(user));
    window.location.href='app.html';
  } catch(e) {
    errDiv.textContent=e.message; errDiv.style.display='block';
  } finally { btn.disabled=false; btn.textContent='登入'; }
}

// ── 主頁初始化 ────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  if (!document.getElementById('bottomNav')) return;

  let user = getCurrentUser();
  if (!user) {
    try { user = await AuthAPI.me(); sessionStorage.setItem('rr_user', JSON.stringify(user)); }
    catch(e) { window.location.replace('index.html'); return; }
  }

  currentRole = user.roleId || user.role;
  const today = new Date().toLocaleDateString('sv-SE');
  const dateEl = document.getElementById('receivingDate');
  if (dateEl) dateEl.value = today;

  // 顯示使用者資訊
  ['r','a'].forEach(s => {
    const el = document.getElementById(`userDisplay-${s}`);
    if (el) el.textContent = `${user.name} · ${getRoleName(currentRole)}`;
  });

  // 初始化底部導航
  buildNav(user);

  // 背景載入設定（不擋 UI）；新電腦 localStorage 空時從 Firestore 補回
  Promise.all([
    RoleAPI.list().then(r => { if (r?.length) saveRoles(r); }).catch(()=>{}),
    loadBizAttrs().catch(()=>{}),
    loadDefectConfig().catch(()=>{}),
    loadCatFilters().catch(()=>{})
  ]).then(() => {
    // 設定載入後重建導航（以正確的 role tabs 顯示）
    buildNav(user);
    // 重繪當前頁面以套用最新設定（bizAttr 篩選等）
    rerenderCurrentView();
  }).catch(()=>{});

  // 移除 Loading 遮罩的函式（確保一定會執行）
  const hideLoading = () => {
    const loading = document.getElementById('authLoading');
    if (loading) { loading.style.opacity='0'; loading.style.transition='opacity .3s'; setTimeout(()=>loading.remove(), 300); }
  };

  // 5 秒後強制移除 loading（防止 Firestore 卡住）
  const loadingTimer = setTimeout(hideLoading, 5000);

  // 載入 Firestore 資料（只載入最佳日期，其餘日期切換頁籤時懶載入）
  try {
    const withTimeout = (p, ms) => Promise.race([p, new Promise((_,r)=>setTimeout(()=>r(new Error('timeout')),ms))]);
    const dates = await withTimeout(ProductAPI.getDates(), 6000);
    if (dates && dates.length > 0) {
      _allKnownDates = dates; // 記錄所有已知日期供懶載入使用
      const best = dates.includes(today) ? today : dates[0];
      if (dateEl) dateEl.value = best;
      const items = await withTimeout(ProductAPI.getByDate(best), 6000);
      productsByDate[best] = normalizeProducts(items);
    }
  } catch(e) { console.warn('load failed:', e.message); }

  // 切換到上次頁面（若有權限），否則切至第一個可用頁面
  // 新電腦 localStorage 空時，用 session 的 tabs 作為 fallback
  const roleObj = getRoleById(currentRole);
  const allowedPages = currentRole==='admin'
    ? Object.keys(TAB_LABELS)
    : (roleObj?.tabs || user.tabs || []);
  const savedPage = localStorage.getItem('rr_last_tab');
  const defaultPage = currentRole==='admin' ? 'receiving' : (allowedPages[0] || 'receiving');
  const firstPage = (savedPage && allowedPages.includes(savedPage)) ? savedPage : defaultPage;
  switchPage(firstPage);

  // 啟動即時同步監聽
  startRealtimeSync();

  clearTimeout(loadingTimer);
  hideLoading();
});

function logout() { stopRealtimeSync(); AuthAPI.logout().catch(()=>{}); sessionStorage.clear(); window.location.replace('index.html'); }

// ── 底部導航建立 ──────────────────────────────────────
function buildNav(user) {
  const nav = document.getElementById('bottomNav');
  if (!nav) return;
  const roleObj = getRoleById(currentRole);
  const allowedTabs = currentRole==='admin'
    ? Object.keys(TAB_LABELS)
    : (roleObj?.tabs || user?.tabs || []);
  const TAB_ORDER = Object.keys(TAB_LABELS);
  const pages = allowedTabs.filter(t => document.getElementById(`page-${t}`))
    .sort((a,b) => TAB_ORDER.indexOf(a) - TAB_ORDER.indexOf(b));
  if (!pages.length) return;
  nav.style.display = 'flex';
  nav.innerHTML = pages.map(t => `
    <div class="nav-item" id="nav-${t}" onclick="switchPage('${t}')" style="position:relative">
      ${NAV_ICONS[t] || ''}
      <span>${TAB_LABELS[t] || t}</span>
      <span class="nav-badge" id="nb-${t}" style="display:none">0</span>
    </div>`).join('');
}

// ── 全日期懶載入（切到需要跨日期資料的頁籤時才載入）────
async function ensureAllDatesLoaded(thenRender) {
  if (_allDatesLoaded || _allKnownDates.length === 0) { thenRender(); return; }
  const missing = _allKnownDates.filter(d => !productsByDate[d]);
  if (missing.length === 0) { _allDatesLoaded = true; thenRender(); return; }
  try {
    for (const d of missing) {
      const its = await ProductAPI.getByDate(d);
      productsByDate[d] = normalizeProducts(its);
    }
    _allDatesLoaded = true;
  } catch(e) { console.warn('lazy load failed:', e.message); }
  thenRender();
}

// ── 頁面切換 ──────────────────────────────────────────
function switchPage(name) {
  currentPage = name;
  localStorage.setItem('rr_last_tab', name);
  document.querySelectorAll('.app-page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const page = document.getElementById(`page-${name}`);
  const nav  = document.getElementById(`nav-${name}`);
  if (page) page.classList.add('active');
  if (nav)  nav.classList.add('active');
  // 渲染對應頁面（跨日期頁籤先確保資料全部載入）
  if (name==='receiving')  { renderProductCards(); updateStats(); }
  else if (name==='warehouse') ensureAllDatesLoaded(renderWarehouseCards);
  else if (name==='review')    ensureAllDatesLoaded(renderReviewCards);
  else if (name==='report')    ensureAllDatesLoaded(renderReportCards);
  else if (name==='purchase')  ensureAllDatesLoaded(renderPurchaseCards);
  else if (name==='admin')     loadAndRenderAdmin();
}

// ── Sheet 控制 ────────────────────────────────────────
function openSheet(id) {
  document.getElementById('overlay').classList.add('open');
  document.getElementById(id).classList.add('open');
}
function closeAllSheets() {
  document.getElementById('overlay').classList.remove('open');
  document.querySelectorAll('.sheet.open').forEach(s=>s.classList.remove('open'));
}

// ── 已到貨標記（Set of "date_origIdx"，不存 Firestore，頁面刷新後重置）──
const _arrivedSet = new Set();
function _arrivedKey(date, origIdx) { return `${date}__${origIdx}`; }
function toggleArrived(date, origIdx) {
  const key = _arrivedKey(date, origIdx);
  if (_arrivedSet.has(key)) _arrivedSet.delete(key); else _arrivedSet.add(key);
  renderProductCards(); updateStats();
}

// ── 進貨搜尋關鍵字 ───────────────────────────────────
let _receivingSearchKw = '';
function onReceivingSearch(val) {
  _receivingSearchKw = (val || '').trim();
  const clearBtn = document.getElementById('receivingSearchClear');
  if (clearBtn) clearBtn.style.display = _receivingSearchKw ? '' : 'none';
  renderProductCards();
}
function clearReceivingSearch() {
  _receivingSearchKw = '';
  const input = document.getElementById('receivingSearchInput');
  if (input) input.value = '';
  const clearBtn = document.getElementById('receivingSearchClear');
  if (clearBtn) clearBtn.style.display = 'none';
  renderProductCards();
}

// ── 即時同步（onSnapshot）────────────────────────────
let _realtimeUnsub     = null;
let _syncDebounceTimer = null;
let _syncReady         = false;  // 跳過初始 snapshot
let _syncSuppressUntil = 0;      // 儲存後短暫壓制 re-render
let _pendingChanges    = [];     // 操作中暫存的 snapshot 變更

function suppressSyncRender(ms = 2000) { _syncSuppressUntil = Date.now() + ms; }

function isUserOperating() {
  return document.getElementById('overlay')?.classList.contains('open') || false;
}

function applyChanges(changes) {
  changes.forEach(change => {
    const date = change.doc.data()?.arrival_date;
    if (!date) return;
    if (!_allKnownDates.includes(date)) _allKnownDates.push(date);
    if (change.type === 'removed') {
      if (productsByDate[date])
        productsByDate[date] = productsByDate[date].filter(p => p.id !== change.doc.id);
    } else {
      const p = normalizeProducts([{id: change.doc.id, ...change.doc.data()}])[0];
      if (!productsByDate[date]) productsByDate[date] = [];
      const idx = productsByDate[date].findIndex(x => x.id === change.doc.id);
      if (idx >= 0) productsByDate[date][idx] = p;
      else productsByDate[date].push(p);
    }
  });
}

function rerenderCurrentView() {
  if (isUserOperating()) return;
  if (Date.now() < _syncSuppressUntil) return;
  if (currentPage === 'receiving')       { renderProductCards(); updateStats(); }
  else if (currentPage === 'warehouse')  renderWarehouseCards();
  else if (currentPage === 'review')     renderReviewCards();
  else if (currentPage === 'report')     renderReportCards();
  else if (currentPage === 'purchase')   renderPurchaseCards();
  updateBadges();
}

function startRealtimeSync() {
  if (_realtimeUnsub) { _realtimeUnsub(); _realtimeUnsub = null; }
  _syncReady = false;
  _pendingChanges = [];
  _realtimeUnsub = db.collection('products').onSnapshot(snapshot => {
    if (!_syncReady) { _syncReady = true; return; } // 跳過初始 snapshot
    const changes = snapshot.docChanges();
    if (!changes.length) return;

    if (isUserOperating()) {
      // 使用者操作中：只暫存變更，不修改 productsByDate
      _pendingChanges.push(...changes);
      return;
    }

    // 先套用暫存的變更，再套用本次變更
    if (_pendingChanges.length) { applyChanges(_pendingChanges); _pendingChanges = []; }
    applyChanges(changes);

    clearTimeout(_syncDebounceTimer);
    _syncDebounceTimer = setTimeout(rerenderCurrentView, 1000);
  }, err => console.warn('realtime sync err:', err.message));
}

function stopRealtimeSync() {
  if (_realtimeUnsub) { _realtimeUnsub(); _realtimeUnsub = null; }
}

// ── Firestore 重載 ────────────────────────────────────
async function reloadFromFirestore(date) {
  try {
    const key   = date || currentReceivingDate();
    const prev  = productsByDate[key] || [];   // 重載前的本機資料
    const items = await ProductAPI.getByDate(key);
    const loaded = normalizeProducts(items);
    // 若 Firestore 沒有 defectItems，從本機資料補回
    loaded.forEach(p => {
      if (!p.defectItems?.length) {
        const local = prev.find(x => x.id === p.id || (x.itemNo === p.itemNo && x.po === p.po));
        if (local?.defectItems?.length) p.defectItems = local.defectItems;
      }
    });
    productsByDate[key] = loaded;
  } catch(e) { console.warn('reload failed:', e.message); }
}

// ── normalizeProducts ─────────────────────────────────
function normalizeProducts(items) {
  return (items||[]).map(p => ({
    id:p.id, seq:p.seq||0, po:p.po||'', cat:p.cat||'', barcode:p.barcode||'',
    itemNo:p.item_no||p.itemNo||'', name:p.name||'', spec:p.spec||'',
    period:p.period||'', qty:p.qty||0, arrivalDate:p.arrival_date||p.arrivalDate||'',
    isManual:!!(p.is_manual||p.isManual), status:p.status||STATUS.PENDING,
    received:!!p.received, goodQty:p.good_qty||p.goodQty||0, badQty:p.bad_qty||p.badQty||0,
    defectTime:p.defect_time||p.defectTime||'', defectClass:p.defect_class||p.defectClass||'其他異常',
    defectReasons:p.defect_reasons||p.defectReasons||[], defectNote:p.defect_note||p.defectNote||'',
    defectStaff:p.defect_staff||p.defectStaff||'', procAction:p.proc_action||p.procAction||'',
    procReply:p.proc_reply||p.procReply||'', procReplyTime:p.proc_reply_time||p.procReplyTime||'',
    procStaffName:p.proc_staff_name||p.procStaffName||'', operatorName:p.operator_name||p.operatorName||'',
    photos:p.photos||[], defectItems:p.defect_items||p.defectItems||[], procReplyUnread:!!(p.proc_reply_unread||p.procReplyUnread), time:p.recv_time||p.time||'',
    bizAttr:p.biz_attr||p.bizAttr||''
  }));
}

// ── 日期切換 ──────────────────────────────────────────
async function onReceivingDateChange() {
  const date = currentReceivingDate();
  await reloadFromFirestore(date);
  renderProductCards(); updateStats();
}

// ══════════════════════════════════════════════════════
// ── 1. 驗收作業 - 卡片渲染 ────────────────────────────
// ══════════════════════════════════════════════════════
function statusBadgeHtml(p) {
  const m = { pending:'<span class="badge badge-pending">待確認</span>',
    received:'<span class="badge badge-done">已確認</span>',
    abnormal_pending:'<span class="badge badge-abnormal">異常待檢核</span>',
    procurement:'<span class="badge badge-proc">待採購回覆</span>',
    resolved:'<span class="badge badge-resolved">已處理</span>' };
  return (m[p.status]||'') + (p.isManual ? '<span class="badge badge-manual" style="margin-left:4px">臨時</span>' : '');
}

function renderProductCards() {
  const container = document.getElementById('productListContainer');
  if (!container) return;
  const date = currentReceivingDate();
  const allProducts = getDateProducts(date);
  const kw = _receivingSearchKw.toLowerCase();
  const list = allProducts
    .map((p, origIdx) => ({ p, origIdx }))
    .filter(({ p }) => p.status === STATUS.PENDING)
    .filter(({ p }) => !kw || [p.po, p.itemNo, p.name, p.barcode]
      .some(v => (v||'').toLowerCase().includes(kw)))
    .sort((a, b) => (a.p.po||'').localeCompare(b.p.po||''));
  if (!list.length) {
    const msg = kw
      ? `找不到符合「${kw}」的待確認商品`
      : (date ? date + ' 尚無進貨資料' : '請選擇日期');
    const hint = kw ? '請確認關鍵字或清除搜尋' : '點右下角 ↑ 匯入 Excel';
    container.innerHTML = `<div class="empty-state">
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
      </svg>
      <p>${msg}</p><small>${hint}</small></div>`;
    return;
  }
  container.innerHTML = list.map(({ p, origIdx }, i) => {
    const arrived = _arrivedSet.has(_arrivedKey(date, origIdx));
    const cardBorder = arrived ? '2px solid #16a34a' : '1px solid #e5e7eb';
    const cardBg     = arrived ? '#f0fdf4' : '#fff';
    return `
    <div class="product-card slide-up" data-status="${p.status}"
      style="border:${cardBorder};background:${cardBg};display:flex;flex-direction:column;padding:0;overflow:hidden">
      <!-- 商品資訊列 -->
      <div style="display:flex;align-items:center;padding:10px 12px;gap:8px">
        <div class="product-card-inner" style="flex:1;min-width:0">
          ${p.po ? `<div style="font-size:13px;font-weight:600;color:#4b5563;margin-bottom:2px">PO：${p.po}</div>` : ''}
          <div class="product-card-name">${p.name}</div>
          <div class="product-card-sub">${p.itemNo||'—'} · ${p.cat||'—'}</div>
        </div>
        ${p.barcode ? `<div style="flex-shrink:0;width:100px;display:flex;align-items:center">
          <canvas id="bc-r-${date}-${origIdx}" style="width:100px;height:36px;display:block"></canvas>
        </div>` : ''}
        <div class="product-card-right" style="flex-shrink:0;text-align:right">
          ${statusBadgeHtml(p)}
          <div style="margin-top:4px"><div style="font-size:10px;color:#9ca3af">採購</div><div style="font-size:20px;font-weight:800;color:#111">${p.qty}</div></div>
        </div>
      </div>
      <!-- 操作列 -->
      <div style="display:flex;border-top:1px solid ${arrived?'#bbf7d0':'#f3f4f6'};background:${arrived?'#dcfce7':'#f9fafb'}">
        <button onclick="toggleArrived('${date}',${origIdx})"
          style="flex:1;padding:10px 0;border:none;background:transparent;cursor:pointer;font-size:13px;font-weight:600;
            color:${arrived?'#15803d':'#6b7280'};display:flex;align-items:center;justify-content:center;gap:5px">
          ${arrived
            ? `<svg style="width:15px;height:15px" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>已到貨（點擊取消）`
            : `<svg style="width:15px;height:15px" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" stroke-width="1.5"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h8"/></svg>標記已到貨`}
        </button>
        ${arrived ? `<button onclick="startReceiving('${date}',${origIdx})"
          style="padding:10px 18px;border:none;border-left:1px solid #86efac;background:#16a34a;color:#fff;
            font-size:13px;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:4px">
          確認登錄
          <svg style="width:14px;height:14px" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 5l7 7-7 7"/></svg>
        </button>` : ''}
      </div>
    </div>`;
  }).join('');

  // 繪製條碼
  if (typeof JsBarcode !== 'undefined') {
    list.forEach(({ p, origIdx }) => {
      if (!p.barcode) return;
      const el = document.getElementById(`bc-r-${date}-${origIdx}`);
      if (!el) return;
      try {
        JsBarcode(el, p.barcode, {
          format: 'CODE128', width: 1.2, height: 36,
          displayValue: false, margin: 0, background: 'transparent'
        });
      } catch(e) {}
    });
  }
}

function updateStats() {
  const date = currentReceivingDate();
  const list = getDateProducts(date);
  const done     = list.filter(p=>p.status!==STATUS.PENDING).length;
  const pending  = list.filter(p=>p.status===STATUS.PENDING).length;
  const abnormal = list.filter(p=>[STATUS.ABNORMAL,STATUS.PROCUREMENT,STATUS.RESOLVED].includes(p.status)).length;
  const arrived    = list.filter((p,i)=>_arrivedSet.has(_arrivedKey(date,i))).length;
  const notArrived = list.filter((p,i)=>p.status===STATUS.PENDING && !_arrivedSet.has(_arrivedKey(date,i))).length;
  // 更新數字
  const sv = (id,v) => { const e=document.getElementById(id); if(e) e.textContent=v; };
  sv('stat-total',   list.length);
  sv('stat-done',    done);
  sv('stat-pending', pending);
  sv('stat-abnormal',abnormal);
  // 更新統計卡片（重繪）
  const grid = document.getElementById('statGrid');
  if (!grid) return;
  const IC = (path) => `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="${path}"/></svg>`;
  grid.innerHTML = `
    <div class="stat-card stat-total">
      <div class="stat-card-val">${list.length}</div>
      <div class="stat-card-lbl">今日進貨</div>
    </div>
    <div class="stat-card" style="background:#ecfdf5;color:#065f46">
      <div class="stat-card-val" style="color:#059669">${arrived}</div>
      <div class="stat-card-lbl" style="color:#059669">已到貨</div>
    </div>
    <div class="stat-card stat-pending">
      <div class="stat-card-val">${notArrived}</div>
      <div class="stat-card-lbl">未到貨</div>
    </div>
    <div class="stat-card stat-done">
      <div class="stat-card-val">${done}</div>
      <div class="stat-card-lbl">已確認</div>
    </div>
    <div class="stat-card stat-bad">
      <div class="stat-card-val">${abnormal}</div>
      <div class="stat-card-lbl">有異常</div>
    </div>`;
}

// ── 驗收 Sheet - 異常明細 ────────────────────────────────
let _defectItems = []; // [{photos:[{src,procAction,procReply,procStaffName}], qty, category, reasons[], note}]

function renderDefectItems(readonly) {
  const container = document.getElementById('rs-defect-items');
  if (!container) return;
  if (!_defectItems.length && !readonly) {
    container.innerHTML = '<div style="text-align:center;padding:16px 0;color:#9ca3af;font-size:13px">點上方「＋ 新增異常」按鈕新增</div>';
    return;
  }
  if (!_defectItems.length) { container.innerHTML = ''; return; }

  const totalEntered = _defectItems.reduce((s,it)=>(s+(parseInt(it.qty)||0)),0);
  const bdEl = document.getElementById('rs-bad-display');
  if (bdEl) bdEl.textContent = totalEntered || 0;

  const camSvg = '<svg style="width:18px;height:18px;color:#fca5a5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"/></svg>';
  const NUMS = ['一','二','三','四','五','六'];

  container.innerHTML = _defectItems.map((item, i) => {
    const photos = item.photos || [];

    // Photo strip
    const photoThumbs = photos.map((ph, pi) => `
      <div style="position:relative;flex-shrink:0">
        <img src="${ph.src}" onclick="viewDefectEntryPhoto(${i},${pi})"
          style="width:56px;height:56px;border-radius:8px;object-fit:cover;cursor:pointer;display:block;border:1.5px solid #fde68a" />
        ${!readonly ? `<button onclick="removeDefectEntryPhoto(${i},${pi})" style="position:absolute;top:-4px;right:-4px;width:16px;height:16px;background:#ef4444;color:#fff;border:none;border-radius:50%;font-size:10px;cursor:pointer;line-height:1;padding:0">×</button>` : ''}
        ${ph.procAction && readonly ? `<div style="position:absolute;bottom:0;left:0;right:0;background:rgba(5,150,105,.85);border-radius:0 0 6px 6px;font-size:8px;color:#fff;text-align:center;padding:1px 2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${ph.procAction}</div>` : ''}
      </div>`).join('');

    const addPhotoBtn = !readonly ? `
      <label style="width:56px;height:56px;border:2px dashed #fca5a5;border-radius:8px;background:#fff5f5;display:inline-flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;gap:2px;flex-shrink:0">
        ${camSvg}
        <span style="font-size:9px;color:#fca5a5">新增</span>
        <input type="file" accept="image/*" multiple class="hidden" onchange="addDefectEntryPhotos(${i},this)" />
      </label>` : '';

    // Qty
    const qtyEl = !readonly
      ? `<input type="number" min="0" value="${item.qty||''}" placeholder="0"
           style="width:72px;border:1.5px solid ${(parseInt(item.qty)||0)>0?'#2563eb':'#fecaca'};border-radius:10px;padding:8px 4px;font-size:18px;font-weight:800;text-align:center;outline:none;color:#2563eb;background:#f0f7ff"
           oninput="_defectItems[${i}].qty=parseInt(this.value)||0;updateDefectQtyStats()" />`
      : `<div style="font-size:22px;font-weight:900;color:#2563eb;min-width:40px;text-align:center">${item.qty||0}</div>`;

    // Category buttons
    const catBtns = DEFECT_CATEGORIES().map(c => {
      const active = item.category === c;
      return `<button onclick="${readonly?'':`setDefectCategory(${i},'${c}')`}"
        style="padding:5px 10px;border-radius:16px;border:1.5px solid ${active?'#f59e0b':'#e5e7eb'};
          background:${active?'#fef3c7':'#f8fafc'};color:${active?'#92400e':'#6b7280'};
          font-size:11px;font-weight:${active?'700':'500'};cursor:pointer;white-space:nowrap;flex-shrink:0">${c}</button>`;
    }).join('');

    // Reason chips
    const reasonsForCat = item.category ? DEFECT_REASONS(item.category) : [];
    const reasonChips = !readonly
      ? (item.category
          ? `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:4px;margin-top:8px">
               ${reasonsForCat.map(r => {
                 const sel = (item.reasons||[]).includes(r);
                 return `<button type="button" onclick="toggleDefectSubReason(${i},'${r}')"
                   style="padding:6px 3px;border-radius:8px;border:1.5px solid ${sel?'#2563eb':'#e5e7eb'};
                     background:${sel?'#dbeafe':'#f8fafc'};color:${sel?'#1d4ed8':'#6b7280'};
                     font-size:11px;font-weight:${sel?'700':'400'};cursor:pointer;line-height:1.3;text-align:center;word-break:break-all">${r}</button>`;
               }).join('')}
             </div>`
          : `<div style="margin-top:6px;padding:8px;background:#f3f4f6;border-radius:8px;font-size:11px;color:#9ca3af;text-align:center">請先選擇大分類</div>`)
      : ((item.reasons||[]).length ? `<div style="display:flex;flex-wrap:wrap;gap:3px;margin-top:6px">${(item.reasons||[]).map(r=>`<span class="badge badge-abnormal" style="font-size:10px">${r}</span>`).join('')}</div>` : '');

    const noteEl = !readonly
      ? `<input placeholder="補充說明（選填）" value="${item.note||''}"
           style="width:100%;border:1px solid #e5e7eb;border-radius:8px;padding:7px 10px;font-size:12px;outline:none;background:#fff;margin-top:8px;font-family:inherit"
           oninput="_defectItems[${i}].note=this.value" />`
      : (item.note ? `<div style="font-size:12px;color:#6b7280;margin-top:4px">${item.note}</div>` : '');

    return `
      <div style="background:#fef9f9;border-radius:14px;border:1.5px solid #fecaca;padding:12px;margin-bottom:10px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
          <span style="font-size:13px;font-weight:800;color:#dc2626">異常${NUMS[i]||i+1}</span>
          ${!readonly ? `<button onclick="removeDefectItem(${i})" style="background:none;border:none;color:#fca5a5;cursor:pointer;font-size:12px;padding:2px 4px">✕ 刪除</button>` : ''}
        </div>
        <!-- Photos -->
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px;align-items:center">
          ${photoThumbs}${addPhotoBtn}
        </div>
        <!-- Qty + Category -->
        <div style="display:flex;gap:8px;align-items:center;margin-bottom:4px">
          <div style="flex-shrink:0">
            <div style="font-size:10px;color:#9ca3af;margin-bottom:3px;text-align:center">異常數量</div>
            ${qtyEl}
          </div>
          <div style="flex:1;overflow-x:auto">
            <div style="display:flex;gap:5px;padding-bottom:2px">
              ${catBtns}
            </div>
          </div>
        </div>
        ${reasonChips}${noteEl}
      </div>`;
  }).join('');
}

function updateDefectQtyStats() {
  const totalEntered = _defectItems.reduce((s,it)=>(s+(parseInt(it.qty)||0)),0);
  const bdEl = document.getElementById('rs-bad-display');
  if (bdEl) bdEl.textContent = totalEntered || 0;
  renderDefectItems(false);
}

function addDefectItem() {
  if (_defectItems.length >= 6) { alert('最多 6 筆異常'); return; }
  _defectItems.push({ photos: [], qty: 0, category: '', reasons: [], note: '' });
  renderDefectItems(false);
}

function addDefectEntryPhotos(i, input) {
  const files = Array.from(input.files);
  if (!files.length) return;
  const item = _defectItems[i];
  if (!item) return;
  let done = 0;
  files.forEach(file => {
    compressImage(file, 200*1024).then(src => {
      item.photos.push({ src, procAction: '', procReply: '', procStaffName: '' });
      done++;
      if (done === files.length) renderDefectItems(false);
    });
  });
  input.value = '';
}

function removeDefectEntryPhoto(i, pi) {
  _defectItems[i]?.photos.splice(pi, 1);
  renderDefectItems(false);
}

function viewDefectEntryPhoto(i, pi) {
  const src = _defectItems[i]?.photos[pi]?.src;
  if (src) openLightbox(src);
}

// 批次匯入多張照片，每張建立一筆異常明細
function batchAddDefectPhotos(input) {
  const files = Array.from(input.files);
  const remaining = 6 - _defectItems.length;
  if (!files.length) return;
  if (remaining <= 0) { alert('最多 6 筆異常，已達上限'); input.value=''; return; }
  const toProcess = files.slice(0, remaining);
  let done = 0;
  toProcess.forEach(file => {
    compressImage(file, 200*1024).then(src => {
      _defectItems.push({ photos: [{ src, procAction: '', procReply: '', procStaffName: '' }], qty: 0, category: '', reasons: [], note: '' });
      done++;
      if (done === toProcess.length) renderDefectItems(false);
    });
  });
  input.value = '';
}

function removeDefectItem(i) { _defectItems.splice(i, 1); renderDefectItems(false); }

function setDefectCategory(i, cat) {
  _defectItems[i].category = cat;
  _defectItems[i].reasons = [];
  renderDefectItems(false);
}
function toggleDefectSubReason(i, r) {
  const item = _defectItems[i];
  if (!item.reasons) item.reasons = [];
  const idx = item.reasons.indexOf(r);
  if (idx >= 0) item.reasons.splice(idx, 1);
  else item.reasons.push(r);
  renderDefectItems(false);
}

// ── 驗收 Sheet 開啟 ───────────────────────────────────
// ── 驗收前先選業務屬性 ───────────────────────────────
async function startReceiving(date, idx) {
  // 每次開啟時從 Firestore 取最新業務屬性
  const attrs = await loadBizAttrs().catch(() => getBizAttrs());
  // 若無業務屬性設定，直接開驗收
  if (!attrs.length) { openReceiveSheet(date, idx); return; }

  const p    = getDateProducts(date)[idx];
  const body = document.getElementById('bizAttrSelectBody');
  if (!body) { openReceiveSheet(date, idx); return; }

  const chips = attrs.map(a => {
    const active = p.bizAttr === a.name;
    return `<button onclick="selectBizAttrAndReceive('${date}',${idx},'${a.name}')"
      style="width:100%;text-align:left;padding:14px 16px;border-radius:14px;border:1.5px solid ${active?'#2563eb':'#e5e7eb'};
        background:${active?'#dbeafe':'#f9fafb'};color:${active?'#1d4ed8':'#374151'};
        font-size:15px;font-weight:${active?'700':'500'};cursor:pointer;display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
      ${a.name}
      ${active ? '<span style="color:#2563eb;font-size:18px">✓</span>' : ''}
    </button>`;
  }).join('');

  body.innerHTML = `
    ${chips}
    <button onclick="selectBizAttrAndReceive('${date}',${idx},'')"
      style="width:100%;text-align:center;padding:12px;border-radius:14px;border:1.5px solid #e5e7eb;
        background:#f9fafb;color:#9ca3af;font-size:14px;cursor:pointer;margin-top:4px">
      略過（不選擇）
    </button>`;

  openSheet('bizAttrSelectSheet');
}

function selectBizAttrAndReceive(date, idx, attrName) {
  closeAllSheets();
  const p = getDateProducts(date)[idx];
  if (p) p.bizAttr = attrName;
  setTimeout(() => openReceiveSheet(date, idx), 200);
}

function openReceiveSheet(date, idx) {
  const p = getDateProducts(date)[idx];
  if (!p) return;
  currentIdx = { date, idx };
  // 載入已有的異常明細（含舊格式自動轉換）
  if ((p.defectItems||[]).length) {
    _defectItems = p.defectItems.map(item => {
      // New format: has photos array
      if (item.photos) {
        return { photos: item.photos.map(ph => typeof ph === 'string' ? {src:ph,procAction:'',procReply:'',procStaffName:''} : ph), qty: parseInt(item.qty)||0, category: item.category||'', reasons: item.reasons||[], note: item.note||'' };
      }
      // Old format: single photo field → migrate
      return { photos: item.photo ? [{src:item.photo, procAction:item.procAction||'', procReply:item.procReply||'', procStaffName:item.procStaffName||''}] : [], qty: parseInt(item.qty)||0, category: item.category||'', reasons: item.reasons||(item.reason?[item.reason]:[]), note: item.note||'' };
    });
  } else if (p.photos?.length && p.badQty > 0) {
    const allReasons = p.defectReasons || [];
    _defectItems = [{ photos: p.photos.map(src=>({src,procAction:'',procReply:'',procStaffName:''})), qty: p.badQty||0, category: '', reasons: allReasons, note: p.defectNote||'' }];
  } else {
    _defectItems = [];
  }

  const isResolved = p.status === STATUS.RESOLVED;
  document.getElementById('receiveSheetTitle').textContent =
    p.status===STATUS.PENDING ? '確認登錄' : (isResolved ? '已處理（唯讀）' : '修改確認');

  const body  = document.getElementById('receiveSheetBody');
  // 已選業務屬性顯示（唯讀，需修改請關閉重新點選）
  const bizTag = p.bizAttr
    ? `<div style="margin-bottom:12px;display:flex;align-items:center;gap:8px">
        <span style="font-size:11px;color:#9ca3af">業務屬性</span>
        <span style="padding:4px 12px;background:#dbeafe;color:#1d4ed8;border-radius:20px;font-size:13px;font-weight:600">${p.bizAttr}</span>
        <button onclick="changeBizAttr('${date}',${idx})" style="font-size:12px;color:#9ca3af;background:none;border:none;cursor:pointer;text-decoration:underline">更改</button>
      </div>`
    : '';

  body.innerHTML = `
    ${bizTag}
    <div style="background:#f9fafb;border-radius:14px;padding:14px;margin-bottom:16px">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px">
        <div style="flex:1;min-width:0">
          <div style="font-size:16px;font-weight:700;color:#111;margin-bottom:8px">${p.name}</div>
          <div style="display:flex;gap:16px;font-size:13px;color:#6b7280;flex-wrap:wrap">
            <div>品號：<b style="color:#374151">${p.itemNo||'—'}</b></div>
            <div>採購單：<b style="color:#374151">${p.po||'—'}</b></div>
            <div>採購數量：<b style="color:#2563eb;font-size:15px">${p.qty}</b></div>
          </div>
        </div>
        ${p.barcode ? `<div style="flex-shrink:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px">
          <canvas id="rs-barcode" style="height:52px;max-width:130px;display:block"></canvas>
          <div style="font-size:11px;color:#6b7280;letter-spacing:0.5px;text-align:center">${p.barcode}</div>
        </div>` : ''}
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">
      <div>
        <label class="field-label">到貨數量 *</label>
        <input id="rs-good" type="number" min="0" value="${p.received?p.goodQty:p.qty}" class="input"
          style="font-size:20px;font-weight:700;text-align:center" ${isResolved?'readonly':''} />
      </div>
      <div>
        <label class="field-label">異常數量</label>
        <div id="rs-bad-display" style="font-size:20px;font-weight:700;text-align:center;color:#dc2626;background:#f9fafb;border:1.5px solid #e5e7eb;border-radius:12px;padding:10px 0;line-height:1.3">
          ${p.received?p.badQty:0}
        </div>
      </div>
    </div>

    <!-- 異常明細區 -->
    <div id="rs-defect">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
        <div style="font-size:13px;font-weight:700;color:#dc2626">異常明細</div>
        ${!isResolved ? `<button onclick="addDefectItem()" class="btn btn-sm btn-danger" style="cursor:pointer">＋ 新增異常</button>` : ''}
      </div>
      <div id="rs-defect-items"></div>
    </div>

    <div id="rs-error" style="display:none;padding:12px;background:#fee2e2;border-radius:12px;font-size:13px;color:#991b1b;margin-bottom:12px"></div>
    ${isResolved
      ? `<button onclick="closeAllSheets()" class="btn" style="width:100%;background:#f3f4f6;color:#374151;border:none">關閉</button>`
      : `<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <button onclick="closeAllSheets()" class="btn" style="background:#f3f4f6;color:#374151;border:none">取消</button>
          <button onclick="saveReceiving()" class="btn btn-primary">確認</button>
         </div>`}`;

  renderDefectItems(isResolved);
  openSheet('receiveSheet');
  // 繪製條碼
  if (p.barcode && typeof JsBarcode !== 'undefined') {
    requestAnimationFrame(() => {
      const el = document.getElementById('rs-barcode');
      if (!el) return;
      try {
        JsBarcode(el, p.barcode, {
          format: 'CODE128', width: 1.5, height: 48,
          displayValue: false, margin: 0, background: 'transparent'
        });
      } catch(e) {}
    });
  }
}

function changeBizAttr(date, idx) {
  closeAllSheets();
  setTimeout(() => startReceiving(date, idx), 200);
}

function rs_setBizAttr(name) {
  const { date, idx } = currentIdx;
  const p = getDateProducts(date)[idx];
  p.bizAttr = (p.bizAttr === name) ? '' : name; // 點同一個取消選擇
  // 重繪 chips
  const chips = document.getElementById('rs-biz-chips');
  if (chips) {
    getBizAttrs().forEach(a => {
      chips.querySelectorAll('span').forEach(el => {
        if (el.textContent === a.name) {
          const active = p.bizAttr === a.name;
          el.style.borderColor  = active ? '#2563eb' : '#e5e7eb';
          el.style.background   = active ? '#dbeafe' : '#f8fafc';
          el.style.color        = active ? '#1d4ed8' : '#6b7280';
          el.style.fontWeight   = active ? '700' : '500';
        }
      });
    });
  }
}

// onRsBadInput 已移除：異常數量改由 defect items qty 加總自動計算

function toggleReason(el) { el.classList.toggle('selected'); }

async function saveReceiving() {
  const errDiv = document.getElementById('rs-error');
  errDiv.style.display='none';
  const good = parseInt(document.getElementById('rs-good').value);
  // 異常數量 = defect items qty 加總
  const bad  = _defectItems.reduce((s,it)=>(s+(parseInt(it.qty)||0)),0);
  if (isNaN(good)||good<0) { errDiv.textContent='請輸入正確的到貨數量'; errDiv.style.display='block'; return; }
  if (_defectItems.length>0 && _defectItems.some(item=>!(parseInt(item.qty)>0))) { errDiv.textContent='每筆異常明細都需輸入異常數量'; errDiv.style.display='block'; return; }
  if (bad>0 && _defectItems.some(item=>!item.category)) { errDiv.textContent='每筆異常明細都需選擇異常大分類'; errDiv.style.display='block'; return; }
  if (bad>0 && _defectItems.some(item=>!(item.reasons&&item.reasons.length>0))) { errDiv.textContent='每筆異常明細都需選擇至少一項異常原因'; errDiv.style.display='block'; return; }


  const { date, idx } = currentIdx;
  const p = getDateProducts(date)[idx];
  const user = getCurrentUser();
  p.received=true; p.goodQty=good; p.badQty=bad;
  p.defectItems  = _defectItems.map(item => ({ ...item }));
  p.defectReasons= _defectItems.map(item=>getDefectDisplay(item)).filter(r=>r&&r!=='—');
  p.photos       = _defectItems.flatMap(item => (item.photos||[]).map(ph => ph.src || ph)).filter(Boolean);
  p.defectNote   = _defectItems.map(item=>item.note).filter(Boolean).join('；');
  p.defectClass  = '其他異常';
  p.defectStaff=user?.name||''; p.time=nowStr(); p.operatorName=user?.name||'';
  // bizAttr 已在 rs_setBizAttr 即時更新，無需再次設定
  p.status = bad>0 ? STATUS.ABNORMAL : STATUS.RECEIVED;
  _arrivedSet.delete(_arrivedKey(date, idx)); // 確認完成後移除已到貨標記
  suppressSyncRender(3000);
  closeAllSheets();
  // 延遲 150ms 再重繪，讓使用者當前手勢完整執行後再替換 DOM
  setTimeout(() => { renderProductCards(); updateStats(); }, 150);
  if (p.id) {
    ProductAPI.receive(p.id, {goodQty:good,badQty:bad,defectReasons:p.defectReasons,defectNote:p.defectNote,defectClass:p.defectClass,photos:p.photos,defectItems:p.defectItems,bizAttr:p.bizAttr||''})
      .then(async()=>{ _pendingChanges = []; await reloadFromFirestore(date); renderProductCards(); updateStats(); updateBadges(); })
      .catch(e=>console.warn('receive:',e.message));
  } else { saveProductsData(); }
}

// ══════════════════════════════════════════════════════
// ── 2. 入庫清單 ────────────────────────────────────────
// ══════════════════════════════════════════════════════
function renderWarehouseCards() {
  const container = document.getElementById('warehouseListContainer');
  if (!container) return;
  // 填充業務屬性篩選
  const bizSel = document.getElementById('wh-biz-app-filter');
  if (bizSel) {
    const attrs = getBizAttrs(); const cur = bizSel.value;
    bizSel.innerHTML = '<option value="">全部屬性</option>' +
      attrs.map(a=>`<option value="${a.name}" ${cur===a.name?'selected':''}>${a.name}</option>`).join('');
  }
  const from      = document.getElementById('wh-from')?.value;
  const to        = document.getElementById('wh-to')?.value;
  const bizFilter = bizSel?.value || '';
  let list = getAllProducts().filter(p=>p.status!==STATUS.PENDING);
  if (from)      list = list.filter(p=>!p.arrivalDate||p.arrivalDate>=from);
  if (to)        list = list.filter(p=>!p.arrivalDate||p.arrivalDate<=to);
  if (bizFilter) list = list.filter(p=>p.bizAttr===bizFilter);
  if (!list.length) { container.innerHTML='<div class="empty-state"><svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/></svg><p>尚無已確認資料</p></div>'; return; }
  container.innerHTML = list.map(p => {
    const hasReply = p.badQty>0 && ((p.defectItems||[]).some(it=>it.procAction)||(p.procAction&&p.procAction!=='—'));
    return `
    <div class="product-card slide-up" data-status="${p.status}">
      <div class="product-card-inner">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:4px">
          <div style="font-size:15px;font-weight:700;color:#111;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${p.name}</div>
          <div style="flex-shrink:0">${p.badQty>0 ? '<span class="badge badge-abnormal">有異常</span>' : '<span class="badge badge-done">正常</span>'}</div>
        </div>
        ${p.bizAttr ? `<span style="font-size:11px;background:#dbeafe;color:#1d4ed8;border-radius:12px;padding:2px 8px;margin-bottom:6px;display:inline-block;font-weight:600">${p.bizAttr}</span>` : ''}
        <div style="font-size:12px;color:#9ca3af;margin-bottom:8px">${p.arrivalDate||'—'} · ${p.itemNo||'—'}</div>
        <div style="display:flex;align-items:center;justify-content:space-between">
          <div style="display:flex;gap:20px">
            <div><div style="font-size:10px;color:#9ca3af;margin-bottom:2px">良品</div><div style="font-size:18px;font-weight:800;color:#059669;line-height:1">${p.goodQty}</div></div>
            <div><div style="font-size:10px;color:#9ca3af;margin-bottom:2px">異常</div><div style="font-size:18px;font-weight:800;color:#dc2626;line-height:1">${p.badQty}</div></div>
          </div>
          ${p.badQty>0
            ? (hasReply
                ? `<span style="color:#059669;font-size:13px;cursor:pointer;flex-shrink:0" onclick="openReplyDetail('${p.arrivalDate}','${p.itemNo}')">查看採購回覆 ›</span>`
                : `<span style="color:#d97706;font-size:12px;flex-shrink:0">待採購回覆</span>`)
            : ''}
        </div>
      </div>
    </div>`;
  }).join('');
}

// ══════════════════════════════════════════════════════
// ── 3. 異常檢核 ────────────────────────────────────────
// ══════════════════════════════════════════════════════
function renderReviewCards() {
  const container = document.getElementById('reviewListContainer');
  if (!container) return;
  const from = document.getElementById('rv-from')?.value;
  const to   = document.getElementById('rv-to')?.value;
  const list = getAllProducts().filter(p=>p.badQty>0 && (!from||p.arrivalDate>=from) && (!to||p.arrivalDate<=to));
  const pending = list.filter(p=>p.status===STATUS.ABNORMAL).length;
  const proc    = list.filter(p=>p.status===STATUS.PROCUREMENT).length;
  const done    = list.filter(p=>p.status===STATUS.RESOLVED).length;
  const s = (id,v) => { const e=document.getElementById(id); if(e) e.textContent=v; };
  s('rev-stat-pending',pending); s('rev-stat-proc',proc); s('rev-stat-done',done);
  updateBadges();
  if (!list.length) { container.innerHTML='<div class="empty-state"><p>尚無異常資料</p></div>'; return; }
  const stBadge = {'abnormal_pending':'<span class="badge badge-abnormal">待檢核</span>','procurement':'<span class="badge badge-proc">待採購</span>','resolved':'<span class="badge badge-resolved">已處理</span>'};
  container.innerHTML = list.map(p => `
    <div class="product-card slide-up" data-status="${p.status}"
      onclick="${p.status!==STATUS.RESOLVED?`openReviewSheet('${p.arrivalDate}','${p.itemNo}')`:``}">
      <div class="product-card-inner">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:4px">
          <div style="font-size:15px;font-weight:700;color:#111;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${p.name}</div>
          <div style="flex-shrink:0">${stBadge[p.status]||''}</div>
        </div>
        <div style="font-size:12px;color:#9ca3af;margin-bottom:6px">${p.arrivalDate||'—'} · 異常：<b style="color:#dc2626">${p.badQty}</b> 件</div>
        ${p.defectReasons?.length>0 ? `<div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:6px">${p.defectReasons.map(r=>`<span class="badge badge-abnormal" style="font-size:10px">${r}</span>`).join('')}</div>` : ''}
        ${p.photos?.length>0 ? `<span style="color:#2563eb;font-size:13px;cursor:pointer" onclick="event.stopPropagation();viewPhotos('${p.arrivalDate}','${p.itemNo}')">${p.photos.length} 張照片 ›</span>` : ''}
      </div>
    </div>`).join('');
}

function openReviewSheet(arrivalDate, itemNo) {
  const p = getAllProducts().find(x=>x.arrivalDate===arrivalDate && x.itemNo===itemNo);
  if (!p) return;
  reviewIdx = { arrivalDate, itemNo };
  _reviewStartTime = nowHHMM();

  // 確保 p.defectItems 已初始化（含舊格式轉換）
  if (!(p.defectItems?.length)) {
    const photos  = p.photos || [];
    const reasons = p.defectReasons || [];
    if (photos.length) {
      p.defectItems = [{ photos: photos.map(src=>({src,procAction:'',procReply:'',procStaffName:''})), qty: p.badQty||0, category: p.defectClass||'', reasons: [...reasons], note: p.defectNote||'' }];
    } else if (p.badQty > 0) {
      p.defectItems = [{ photos: [], qty: p.badQty||0, category: p.defectClass||'', reasons: [...reasons], note: p.defectNote||'' }];
    }
  } else {
    // Migrate old-format items if needed
    p.defectItems = p.defectItems.map(item => {
      if (item.photos) return item;
      return { photos: item.photo ? [{src:item.photo, procAction:item.procAction||'', procReply:item.procReply||'', procStaffName:item.procStaffName||''}] : [], qty: parseInt(item.qty)||0, category: item.category||'', reasons: item.reasons||(item.reason?[item.reason]:[]), note: item.note||'' };
    });
  }

  renderReviewSheetBody(p);
  openSheet('reviewSheet');
}

function renderReviewSheetBody(p) {
  if (!p) { p = getAllProducts().find(x=>x.arrivalDate===reviewIdx.arrivalDate&&x.itemNo===reviewIdx.itemNo); }
  if (!p) return;
  const body = document.getElementById('reviewSheetBody');

  const items = p.defectItems || [];
  const NUMS = ['一','二','三','四','五','六'];

  const entriesHtml = items.length ? items.map((item, i) => {
    const photos = item.photos || [];
    const photoThumbs = photos.map(ph => `
      <img src="${ph.src}" onclick="openLightbox('${ph.src}')"
        style="width:52px;height:52px;border-radius:8px;object-fit:cover;cursor:zoom-in;display:block;border:1.5px solid #fde68a;flex-shrink:0" />`).join('');

    const catBtns = DEFECT_CATEGORIES().map(c => {
      const active = item.category === c;
      return `<button onclick="rvSetCategory(${i},'${c}')"
        style="padding:5px 10px;border-radius:16px;border:1.5px solid ${active?'#f59e0b':'#e5e7eb'};
          background:${active?'#fef3c7':'#f8fafc'};color:${active?'#92400e':'#6b7280'};
          font-size:11px;font-weight:${active?'700':'500'};cursor:pointer;white-space:nowrap;flex-shrink:0">${c}</button>`;
    }).join('');

    const reasonsForCat = item.category ? DEFECT_REASONS(item.category) : DEFECT_REASONS();
    const reasonChips = `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:4px;margin-top:8px">
      ${reasonsForCat.map(r => {
        const sel = (item.reasons||[]).includes(r);
        return `<button type="button" onclick="rvToggleReason(${i},'${r}')"
          style="padding:6px 3px;border-radius:8px;border:1.5px solid ${sel?'#f59e0b':'#e5e7eb'};
            background:${sel?'#fef3c7':'#f8fafc'};color:${sel?'#92400e':'#6b7280'};
            font-size:11px;font-weight:${sel?'700':'400'};cursor:pointer;line-height:1.3;text-align:center;word-break:break-all">${r}</button>`;
      }).join('')}
    </div>`;

    return `
      <div style="background:#fffbeb;border-radius:14px;border:1.5px solid #fde68a;padding:12px;margin-bottom:10px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
          <span style="font-size:13px;font-weight:800;color:#92400e">異常${NUMS[i]||i+1}</span>
          ${(parseInt(item.qty)||0)>0 ? `<span style="font-size:12px;font-weight:700;color:#d97706">不良 ${item.qty} 件</span>` : ''}
        </div>
        ${photos.length ? `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px;align-items:center">${photoThumbs}</div>` : ''}
        <div style="overflow-x:auto;margin-bottom:4px">
          <div style="display:flex;gap:5px;padding-bottom:2px">${catBtns}</div>
        </div>
        ${reasonChips}
        <input value="${item.note||''}" placeholder="補充說明（選填）"
          style="width:100%;margin-top:8px;border:1px solid #e5e7eb;border-radius:8px;padding:7px 10px;font-size:12px;outline:none;background:#fff;font-family:inherit"
          oninput="rvSetNote(${i},this.value)" />
      </div>`;
  }).join('') : `
    <div style="background:#fffbeb;border-radius:12px;padding:12px;margin-bottom:10px">
      <div style="font-size:12px;font-weight:700;color:#92400e;margin-bottom:6px">現場記錄</div>
      <div style="display:flex;flex-wrap:wrap;gap:3px">${(p.defectReasons||[]).map(r=>`<span class="badge badge-abnormal" style="font-size:10px">${r}</span>`).join('')||'無'}</div>
    </div>`;

  body.innerHTML = `
    ${entriesHtml}
    <div style="margin-bottom:10px">
      <label class="field-label">連動時間</label>
      <input id="rv-time" class="input" value="${p.defectTime||_reviewStartTime+'～'}" placeholder="09:00～09:30" />
    </div>
    <div id="rv-error" style="display:none;padding:12px;background:#fee2e2;border-radius:12px;font-size:13px;color:#991b1b;margin-bottom:10px"></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <button onclick="closeAllSheets()" class="btn" style="background:#f3f4f6;color:#374151;border:none">取消</button>
      <button onclick="submitReview()" class="btn" style="background:#f59e0b;color:#fff;border:none">確認・轉採購</button>
    </div>`;
}

// 專員修改各異常明細的分類/原因/說明（直接修改 p.defectItems）
function rvSetCategory(idx, cat) {
  const p = getAllProducts().find(x=>x.arrivalDate===reviewIdx.arrivalDate&&x.itemNo===reviewIdx.itemNo);
  if (p?.defectItems?.[idx]) { p.defectItems[idx].category=cat; p.defectItems[idx].reasons=[]; renderReviewSheetBody(p); }
}
function rvToggleReason(idx, r) {
  const p = getAllProducts().find(x=>x.arrivalDate===reviewIdx.arrivalDate&&x.itemNo===reviewIdx.itemNo);
  if (!p?.defectItems?.[idx]) return;
  if (!p.defectItems[idx].reasons) p.defectItems[idx].reasons = [];
  const reasons = p.defectItems[idx].reasons;
  const i = reasons.indexOf(r);
  if (i>=0) reasons.splice(i,1); else reasons.push(r);
  renderReviewSheetBody(p);
}
function rvSetNote(idx, val) {
  const p = getAllProducts().find(x=>x.arrivalDate===reviewIdx.arrivalDate&&x.itemNo===reviewIdx.itemNo);
  if (p?.defectItems?.[idx]) p.defectItems[idx].note = val;
}

async function submitReview() {
  const { arrivalDate, itemNo } = reviewIdx;
  const p     = getAllProducts().find(x=>x.arrivalDate===arrivalDate&&x.itemNo===itemNo);
  const rvUser= getCurrentUser();
  // 驗證：每筆異常明細都需選擇分類與原因
  if (p.defectItems?.length) {
    const missingCat = p.defectItems.some(it=>!it.category);
    const missingRsn = p.defectItems.some(it=>!(it.reasons&&it.reasons.length>0));
    const errDiv = document.getElementById('rv-error');
    if (missingCat) { if(errDiv){errDiv.textContent='每筆異常明細都需選擇異常大分類';errDiv.style.display='block';} return; }
    if (missingRsn) { if(errDiv){errDiv.textContent='每筆異常明細都需選擇至少一項異常原因';errDiv.style.display='block';} return; }
  }
  let dt = document.getElementById('rv-time')?.value.trim() || '';
  if (!dt) dt = `${_reviewStartTime}～`;
  p.defectTime  = dt;
  p.defectStaff = rvUser?.name||'';
  // 同步 defectReasons 為各照片原因的彙整（向下相容）
  if (p.defectItems?.length) {
    p.defectReasons = p.defectItems.flatMap(it=>it.reasons||[]).filter(Boolean);
  }
  p.status      = STATUS.PROCUREMENT;
  suppressSyncRender(3000);
  if (p.id) {
    ProductAPI.review(p.id, {defectTime:p.defectTime,defectClass:p.defectClass,defectReasons:p.defectReasons,defectNote:p.defectNote})
      .then(async()=>{ await reloadFromFirestore(arrivalDate); renderReviewCards(); updateBadges(); })
      .catch(e=>console.warn('review:',e.message));
  } else { saveProductsData(); }
  closeAllSheets();
}

// ══════════════════════════════════════════════════════
// ── 4. 異常報表 ────────────────────────────────────────
// ══════════════════════════════════════════════════════
function renderReportCards() {
  const container = document.getElementById('reportListContainer');
  if (!container) return;
  const from = document.getElementById('rp-from')?.value;
  const to   = document.getElementById('rp-to')?.value;
  let list = getAllProducts().filter(p=>p.badQty>0);
  if (from) list = list.filter(p=>!p.arrivalDate||p.arrivalDate>=from);
  if (to)   list = list.filter(p=>!p.arrivalDate||p.arrivalDate<=to);
  if (!list.length) { container.innerHTML='<div class="empty-state"><p>尚無異常記錄</p></div>'; return; }
  container.innerHTML = list.map(p => {
    const hasReply = (p.defectItems||[]).some(it=>it.procAction) || (p.procAction && p.procAction!=='—');
    const itemCount = (p.defectItems||[]).length;
    const unread    = !!p.procReplyUnread;
    return `
    <div class="product-card slide-up" data-status="${p.status}"
      style="${unread?'background:#f3f4f6;border-left-color:#9ca3af':''}"
      ${hasReply?`onclick="openReplyDetail('${p.arrivalDate}','${p.itemNo}')"`:''}
      style="${hasReply?'cursor:pointer':''}">
      <div class="product-card-inner">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:4px">
          <div style="font-size:15px;font-weight:700;color:#111;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${p.name}</div>
          ${hasReply
            ? `<span class="badge badge-resolved" style="font-size:10px;flex-shrink:0">已回覆${itemCount>0?' ('+itemCount+'張)':''}</span>`
            : `<span class="badge badge-abnormal" style="font-size:10px;flex-shrink:0">待回覆</span>`}
        </div>
        <div style="font-size:12px;color:#9ca3af;margin-bottom:6px">${p.arrivalDate||'—'} · ${p.defectTime||'—'}</div>
        ${(p.defectReasons||[]).length>0 ? `<div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:6px">${p.defectReasons.map(r=>`<span class="badge badge-abnormal" style="font-size:10px">${r}</span>`).join('')}</div>` : ''}
        <div style="font-size:12px;color:#9ca3af">物流專員：${p.defectStaff||'—'}</div>
        ${hasReply
          ? `<div style="margin-top:8px;padding:8px 10px;background:#d1fae5;border-radius:10px;font-size:12px;color:#065f46;display:flex;justify-content:space-between;align-items:center">
              <span style="font-weight:600">點擊查看各照片回覆 ›</span>
             </div>`
          : ''}
      </div>
    </div>`;
  }).join('');
}

function openReplyDetail(arrivalDate, itemNo) {
  const p = getAllProducts().find(x=>x.arrivalDate===arrivalDate&&x.itemNo===itemNo);
  if (!p) return;
  // 查看後清除未讀標記並同步 Firestore
  if (p.procReplyUnread) {
    p.procReplyUnread = false;
    if (p.id) ProductAPI._clearUnread(p.id).catch(()=>{});
    updateBadges();
    renderReportCards(); // 重繪卡片，底色恢復白色
  }
  const items = p.defectItems || [];
  const body = document.getElementById('replyDetailBody');
  if (!body) return;

  const content = items.length
    ? items.map((item, i) => `
        <div style="border:1.5px solid #e5e7eb;border-radius:12px;overflow:hidden;margin-bottom:10px">
          <div style="display:flex;gap:10px;padding:12px;align-items:flex-start">
            ${item.photo ? `<img src="${item.photo}" style="width:60px;height:60px;border-radius:8px;object-fit:cover;flex-shrink:0;cursor:zoom-in"
              onclick="openLightbox('${item.photo}')" />` : ''}
            ${(parseInt(item.qty)||0)>0?`<div style="flex-shrink:0;text-align:center;min-width:40px"><div style="font-size:10px;color:#9ca3af">數量</div><div style="font-size:18px;font-weight:900;color:#2563eb;line-height:1">${item.qty}</div></div>`:''}
            <div style="flex:1;min-width:0">
              <div style="font-size:11px;color:#9ca3af;margin-bottom:4px">照片 ${i+1} / ${items.length}${item.category?' · '+item.category:''}</div>
              <div style="display:flex;flex-wrap:wrap;gap:3px;margin-bottom:4px">
                ${(item.reasons||[]).map(r=>`<span class="badge badge-abnormal" style="font-size:10px">${r}</span>`).join('')||'—'}
              </div>
              ${item.note?`<div style="font-size:11px;color:#6b7280">${item.note}</div>`:''}
            </div>
          </div>
          <div style="padding:10px 12px;background:${item.procAction?'#d1fae5':'#f3f4f6'};border-top:1px solid #e5e7eb">
            ${item.procAction
              ? `<div style="font-size:13px;font-weight:700;color:#065f46">✓ ${item.procAction}</div>
                 ${item.procReply?`<div style="font-size:12px;color:#047857;margin-top:2px">${item.procReply}</div>`:''}
                 <div style="font-size:11px;color:#9ca3af;margin-top:3px">回覆時間：${item.procReplyTime||'—'}</div>`
              : `<div style="font-size:12px;color:#9ca3af">尚未回覆</div>`}
          </div>
        </div>`)
      .join('')
    : `<div style="padding:10px;background:#d1fae5;border-radius:10px;font-size:13px;color:#065f46">
        <b>採購回覆：</b>${p.procAction||'—'}${p.procReply?'<br>'+p.procReply:''}
       </div>`;

  body.innerHTML = `
    <div style="margin-bottom:12px">
      <div style="font-size:15px;font-weight:700;margin-bottom:4px">${p.name}</div>
      <div style="font-size:12px;color:#9ca3af">${p.arrivalDate||'—'} · 物流專員：${p.defectStaff||'—'}</div>
    </div>
    ${content}
    <button onclick="closeAllSheets()" class="btn btn-secondary" style="width:100%;margin-top:4px">關閉</button>`;

  openSheet('replyDetailSheet');
}

// ══════════════════════════════════════════════════════
// ── 5. 採購待回覆 ──────────────────────────────────────
// ══════════════════════════════════════════════════════
function renderPurchaseCards() {
  const container = document.getElementById('purchaseListContainer');
  if (!container) return;
  const from      = document.getElementById('pur-from')?.value;
  const to        = document.getElementById('pur-to')?.value;
  const purCatSel = document.getElementById('pur-cat-filter');
  const catFilter = purCatSel?.value || '';
  if (purCatSel) {
    const cur = purCatSel.value;
    purCatSel.innerHTML = '<option value="">全部大分類</option>' +
      getCatFilters().map(c=>`<option value="${c}" ${cur===c?'selected':''}>${c}</option>`).join('');
  }
  const list = getAllProducts().filter(p =>
    p.status===STATUS.PROCUREMENT &&
    (!from||p.arrivalDate>=from) && (!to||p.arrivalDate<=to) &&
    (!catFilter||p.cat===catFilter)
  );
  updateBadges();
  if (!list.length) { container.innerHTML='<div class="empty-state"><p style="font-size:15px;font-weight:600">尚無待回覆項目</p></div>'; return; }
  container.innerHTML = list.map(p => `
    <div class="product-card slide-up" data-status="${p.status}" onclick="openPurchaseSheet('${p.arrivalDate}','${p.itemNo}')">
      <div class="product-card-inner">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:4px">
          <div style="font-size:15px;font-weight:700;color:#111;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${p.name}</div>
          <span class="badge badge-proc" style="flex-shrink:0">待回覆</span>
        </div>
        <div style="font-size:12px;color:#9ca3af;margin-bottom:6px">${p.arrivalDate||'—'} · 異常：<b style="color:#dc2626">${p.badQty}</b> 件</div>
        ${(p.defectReasons||[]).length>0 ? `<div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:6px">${p.defectReasons.map(r=>`<span class="badge badge-abnormal" style="font-size:10px">${r}</span>`).join('')}</div>` : ''}
        <div style="display:flex;align-items:center;justify-content:space-between">
          <div style="font-size:12px;color:#9ca3af">物流專員：${p.defectStaff||'—'}</div>
          ${p.photos?.length>0 ? `<span style="color:#2563eb;font-size:13px;cursor:pointer" onclick="event.stopPropagation();viewPhotos('${p.arrivalDate}','${p.itemNo}')">${p.photos.length} 張照片 ›</span>` : ''}
        </div>
      </div>
    </div>`).join('');
}

function openPurchaseSheet(arrivalDate, itemNo) {
  const p = getAllProducts().find(x=>x.arrivalDate===arrivalDate&&x.itemNo===itemNo);
  if (!p) return;
  purchaseIdx = { arrivalDate, itemNo };
  const items = p.defectItems || [];
  const body  = document.getElementById('purchaseSheetBody');

  const NUMS = ['一','二','三','四','五','六'];
  const allSrcs = items.flatMap(it=>(it.photos||[]).map(ph=>ph.src||ph)).filter(Boolean);

  // 每筆異常明細各自回覆（新格式：photos 陣列）
  const itemsHtml = items.length
    ? items.map((item, i) => {
        const photos = item.photos || [];
        const reasonsHtml = (item.reasons||[]).map(r=>`<span class="badge badge-abnormal" style="font-size:10px">${r}</span>`).join('');
        // header
        const header = `
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
            <span style="font-size:13px;font-weight:800;color:#dc2626">異常${NUMS[i]||i+1}</span>
            ${(parseInt(item.qty)||0)>0?`<span style="font-size:11px;font-weight:700;color:#2563eb">異常數量：${item.qty}</span>`:''}
          </div>
          ${item.category?`<div style="font-size:11px;font-weight:600;color:#374151;margin-bottom:4px">${item.category}</div>`:''}
          ${reasonsHtml?`<div style="display:flex;flex-wrap:wrap;gap:3px;margin-bottom:6px">${reasonsHtml}</div>`:''}
          ${item.note?`<div style="font-size:12px;color:#6b7280;margin-bottom:8px">${item.note}</div>`:''}`;

        let repliesHtml;
        if (photos.length) {
          // 有照片 → 每張各自回覆
          repliesHtml = photos.map((ph, pi) => {
            const src = ph.src || ph;
            const globalIdx = items.slice(0,i).reduce((s,it)=>s+(it.photos||[]).length,0)+pi;
            return `
              <div style="border:1px solid ${ph.procAction?'#86efac':'#e5e7eb'};border-radius:10px;padding:10px;margin-bottom:8px;background:${ph.procAction?'#f0fdf4':'#fff'}">
                <div style="display:flex;gap:10px;align-items:flex-start">
                  <img src="${src}" onclick="openLightbox('${src}')"
                    style="width:52px;height:52px;border-radius:8px;object-fit:cover;flex-shrink:0;cursor:zoom-in" />
                  <div style="flex:1;min-width:0">
                    <div style="font-size:11px;color:#9ca3af;margin-bottom:6px">照片 ${pi+1}</div>
                    ${ph.procAction
                      ? `<div style="font-size:12px;font-weight:700;color:#065f46">✓ ${ph.procAction}</div>
                         ${ph.procReply?`<div style="font-size:11px;color:#047857;margin-top:2px">${ph.procReply}</div>`:''}`
                      : `<select id="pur-action-${i}-${pi}" class="input" style="appearance:auto;font-size:13px;padding:8px 10px;margin-bottom:6px">
                           <option value="">請選擇處理方式</option>
                           ${PROC_ACTIONS.map(v=>`<option>${v}</option>`).join('')}
                         </select>
                         <textarea id="pur-reply-${i}-${pi}" class="input" rows="2" style="resize:none;font-size:13px"
                           placeholder="回覆說明（選填）"></textarea>`}
                  </div>
                </div>
              </div>`;
          }).join('');
        } else {
          // 無照片 → entry 層級回覆
          repliesHtml = item.procAction
            ? `<div style="background:#d1fae5;border-radius:10px;padding:10px;font-size:12px;color:#065f46">
                 ✓ ${item.procAction}${item.procReply?' — '+item.procReply:''}
               </div>`
            : `<div style="background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:10px">
                 <div style="font-size:11px;color:#9ca3af;margin-bottom:6px">無照片</div>
                 <select id="pur-action-${i}" class="input" style="appearance:auto;font-size:13px;padding:8px 10px;margin-bottom:6px">
                   <option value="">請選擇處理方式</option>
                   ${PROC_ACTIONS.map(v=>`<option>${v}</option>`).join('')}
                 </select>
                 <textarea id="pur-reply-${i}" class="input" rows="2" style="resize:none;font-size:13px"
                   placeholder="回覆說明（選填）"></textarea>
               </div>`;
        }

        return `<div style="background:#fef9f9;border-radius:12px;border:1.5px solid #fecaca;padding:12px;margin-bottom:10px">${header}${repliesHtml}</div>`;
      }).join('')
    : `<!-- 向下相容舊格式 -->
      <div style="background:#f9fafb;border-radius:14px;padding:14px;margin-bottom:14px">
        <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:6px">
          ${(p.defectReasons||[]).map(r=>`<span class="badge badge-abnormal" style="font-size:11px">${r}</span>`).join('')}
        </div>
        <div style="font-size:13px;color:#6b7280">${p.defectNote||'—'}</div>
      </div>
      <select id="pur-action-all" class="input" style="appearance:auto;margin-bottom:12px">
        <option value="">請選擇處理方式</option>
        ${PROC_ACTIONS.map(v=>`<option>${v}</option>`).join('')}
      </select>
      <textarea id="pur-reply-all" class="input" rows="3" style="resize:none;margin-bottom:8px" placeholder="回覆說明"></textarea>`;

  body.innerHTML = `
    <div style="font-size:13px;font-weight:700;color:#374151;margin-bottom:10px">
      ${p.name} — 異常明細回覆
    </div>
    <div style="font-size:12px;color:#9ca3af;margin-bottom:12px">物流專員：${p.defectStaff||'—'}</div>
    ${itemsHtml}
    <div id="pur-error" style="display:none;padding:12px;background:#fee2e2;border-radius:12px;font-size:13px;color:#991b1b;margin-bottom:12px"></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px">
      <button onclick="closeAllSheets()" class="btn" style="background:#f3f4f6;color:#374151;border:none">取消</button>
      <button onclick="submitPurchaseReply()" class="btn btn-primary">確認全部回覆</button>
    </div>`;
  openSheet('purchaseSheet');
}

async function submitPurchaseReply() {
  const errDiv  = document.getElementById('pur-error');
  errDiv.style.display='none';
  const { arrivalDate, itemNo } = purchaseIdx;
  const p       = getAllProducts().find(x=>x.arrivalDate===arrivalDate&&x.itemNo===itemNo);
  const purUser = getCurrentUser();
  const items   = p.defectItems || [];

  if (items.length) {
    // 每筆各自回覆（新格式：photos 陣列）
    let hasReply = false;
    const nowTs = nowStr();
    items.forEach((item, i) => {
      const photos = item.photos || [];
      if (photos.length) {
        // 有照片 → 讀取各張照片的輸入
        photos.forEach((ph, pi) => {
          const action = document.getElementById(`pur-action-${i}-${pi}`)?.value;
          const reply  = document.getElementById(`pur-reply-${i}-${pi}`)?.value.trim() || '';
          if (action) { ph.procAction=action; ph.procReply=reply; ph.procStaffName=purUser?.name||''; ph.procReplyTime=nowTs; hasReply=true; }
        });
      } else {
        // 無照片 → 讀取 entry 層級輸入
        const action = document.getElementById(`pur-action-${i}`)?.value;
        const reply  = document.getElementById(`pur-reply-${i}`)?.value.trim() || '';
        if (action) { item.procAction=action; item.procReply=reply; item.procStaffName=purUser?.name||''; item.procReplyTime=nowTs; hasReply=true; }
      }
    });
    if (!hasReply) { errDiv.textContent='請至少回覆一筆異常明細'; errDiv.style.display='block'; return; }
    const allReplied = items.every(it =>
      (it.photos||[]).length ? (it.photos||[]).every(ph=>ph.procAction) : !!it.procAction
    );
    p.defectItems    = items;
    p.procStaffName  = purUser?.name||'';
    p.procReplyTime  = nowStr();
    p.procReplyUnread= true;
    p.status    = allReplied ? STATUS.RESOLVED : STATUS.PROCUREMENT;
    const photoActions = items.flatMap(it=>(it.photos||[]).map(ph=>ph.procAction)).filter(Boolean);
    const entryActions = items.filter(it=>!(it.photos||[]).length && it.procAction).map(it=>it.procAction);
    p.procAction= [...photoActions, ...entryActions].join('、') || '';
  } else {
    // 舊格式
    const action = document.getElementById('pur-action-all')?.value;
    if (!action) { errDiv.textContent='請選擇處理方式'; errDiv.style.display='block'; return; }
    p.procAction=action; p.procReply=document.getElementById('pur-reply-all')?.value.trim()||'';
    p.procReplyTime=nowStr(); p.procStaffName=purUser?.name||''; p.procReplyUnread=true; p.status=STATUS.RESOLVED;
  }
  // 每次採購回覆都更新連動時間結束（最後一筆回覆為最終時間）
  const nowT = nowHHMM();
  if (p.defectTime) {
    p.defectTime = p.defectTime.includes('～')
      ? p.defectTime.split('～')[0] + '～' + nowT
      : p.defectTime + '～' + nowT;
  } else {
    p.defectTime = '～' + nowT;
  }
  suppressSyncRender(3000);
  if (p.id) {
    ProductAPI.reply(p.id, {procAction:p.procAction||'（各別回覆）', procReply:p.procReply||'', defectItems:p.defectItems, status:p.status, defectTime:p.defectTime})
      .then(async()=>{ await reloadFromFirestore(arrivalDate); renderPurchaseCards(); updateBadges(); })
      .catch(e=>console.warn('reply:',e.message));
  } else { saveProductsData(); }
  closeAllSheets();
}

// ══════════════════════════════════════════════════════
// ── 6. 帳號管理 ────────────────────────────────════════
// ══════════════════════════════════════════════════════
async function loadAndRenderAdmin() {
  try {
    const [roles, users, attrs, defectCfg, catItems] = await Promise.all([
      RoleAPI.list(), UserAPI.list(),
      (BizAttrAPI?.list?.()||Promise.resolve([])),
      DefectConfigAPI.get(),
      CatFilterAPI.get()
    ]);
    saveRoles(roles); saveUsers(users);
    if(attrs.length) saveBizAttrs(attrs);
    if (defectCfg?.map) saveDefectConfig({ map: defectCfg.map });
    saveCatFilters(catItems);
  } catch(e) { console.warn('admin load:', e.message); }
  renderRoleCards(); renderUserCards(); refreshRoleOptions(); renderBizAttrCards();
  renderDefectMapAdmin(); renderCatFilterCards();
  const user = getCurrentUser();
  const el = document.getElementById('userDisplay-a');
  if (el) el.textContent = `${user?.name||''} · ${getRoleName(currentRole)}`;
}

// ── 業務屬性管理 ─────────────────────────────────────
function renderBizAttrCards() {
  const container = document.getElementById('bizAttrListContainer');
  if (!container) return;
  const attrs = getBizAttrs();
  if (!attrs.length) { container.innerHTML='<div style="padding:8px 16px;font-size:13px;color:#9ca3af">尚無業務屬性，請新增</div>'; return; }
  container.innerHTML = `<div style="padding:8px 16px;display:flex;flex-wrap:wrap;gap:8px">
    ${attrs.map((a,i) => `
      <div style="display:flex;align-items:center;gap:6px;background:#eff6ff;border:1.5px solid #bfdbfe;border-radius:20px;padding:6px 12px">
        <span style="font-size:13px;font-weight:600;color:#1d4ed8">${a.name}</span>
        <button onclick="deleteBizAttr('${a.id||i}')" style="background:none;border:none;color:#93c5fd;cursor:pointer;font-size:14px;line-height:1;padding:0">✕</button>
      </div>`).join('')}
  </div>`;
}

async function addBizAttr() {
  const input = document.getElementById('bizAttrInput');
  const name  = input?.value.trim();
  if (!name) return;
  try {
    const newAttr = await BizAttrAPI.create(name);
    const attrs   = getBizAttrs();
    attrs.push(newAttr);
    saveBizAttrs(attrs);
    input.value = '';
    renderBizAttrCards();
  } catch(e) { alert(e.message); }
}

async function deleteBizAttr(idOrIdx) {
  if (!confirm('確定刪除此業務屬性？')) return;
  const attrs = getBizAttrs();
  const idx   = attrs.findIndex(a => a.id === idOrIdx || String(attrs.indexOf(a)) === String(idOrIdx));
  if (idx < 0) return;
  try {
    if (attrs[idx].id) await BizAttrAPI.delete(attrs[idx].id);
    attrs.splice(idx, 1);
    saveBizAttrs(attrs);
    renderBizAttrCards();
  } catch(e) { alert(e.message); }
}

// ── 大分類篩選管理 ────────────────────────────────────
function renderCatFilterCards() {
  const container = document.getElementById('catFilterListContainer');
  if (!container) return;
  const cats = getCatFilters();
  if (!cats.length) { container.innerHTML='<div style="padding:8px 16px;font-size:13px;color:#9ca3af">尚無大分類，請新增</div>'; return; }
  container.innerHTML = `<div style="padding:8px 16px;display:flex;flex-wrap:wrap;gap:8px">
    ${cats.map((c,i) => `
      <div style="display:flex;align-items:center;gap:6px;background:#f0fdf4;border:1.5px solid #86efac;border-radius:20px;padding:6px 12px">
        <span style="font-size:13px;font-weight:600;color:#166534">${c}</span>
        <button onclick="deleteCatFilter(${i})" style="background:none;border:none;color:#4ade80;cursor:pointer;font-size:14px;line-height:1;padding:0">✕</button>
      </div>`).join('')}
  </div>`;
}

async function addCatFilter() {
  const input = document.getElementById('catFilterInput');
  const name = input?.value.trim();
  if (!name) return;
  const items = [...getCatFilters(), name];
  saveCatFilters(items);
  try { await CatFilterAPI.save(items); } catch(e) { console.warn(e.message); }
  input.value = '';
  renderCatFilterCards();
}

async function deleteCatFilter(idx) {
  if (!confirm('確定刪除此大分類？')) return;
  const items = getCatFilters(); items.splice(idx,1);
  saveCatFilters(items.length ? items : null);
  try { await CatFilterAPI.save(items.length ? items : DEFAULT_CAT_FILTERS); } catch(e) { console.warn(e.message); }
  renderCatFilterCards();
}

// ── 異常設定管理 ──────────────────────────────────────
function renderDefectMapAdmin() {
  const container = document.getElementById('defectMapContainer');
  if (!container) return;
  const map = getDefectMap();
  const cats = Object.keys(map);
  if (!cats.length) { container.innerHTML='<div style="padding:8px 16px;font-size:13px;color:#9ca3af">尚無分類</div>'; return; }
  container.innerHTML = cats.map((cat, ci) => `
    <div style="margin:0 12px 10px;border:1.5px solid #fde68a;border-radius:12px;overflow:hidden">
      <div style="display:flex;align-items:center;justify-content:space-between;background:#fef3c7;padding:8px 12px;gap:8px">
        <span style="font-size:14px;font-weight:700;color:#92400e;flex-shrink:0">${cat}</span>
        <div style="display:flex;gap:6px;flex:1;min-width:0">
          <input id="defectMapRI_${ci}" placeholder="新增細項..." class="input" style="flex:1;min-width:0;font-size:12px;padding:6px 8px" onkeydown="if(event.key==='Enter')addDefectMapReason(${ci})" />
          <button onclick="addDefectMapReason(${ci})" class="btn btn-primary btn-sm" style="flex-shrink:0;white-space:nowrap">新增</button>
          <button onclick="deleteDefectMapCategory(${ci})" class="btn btn-sm" style="background:#fee2e2;color:#991b1b;border:none;flex-shrink:0">刪除</button>
        </div>
      </div>
      <div style="padding:8px 12px;display:flex;flex-wrap:wrap;gap:6px">
        ${(map[cat]||[]).map((r,ri) => `
          <div style="display:flex;align-items:center;gap:4px;background:#fef2f2;border:1px solid #fecaca;border-radius:16px;padding:4px 10px">
            <span style="font-size:12px;color:#991b1b">${r}</span>
            <button onclick="deleteDefectMapReason(${ci},${ri})" style="background:none;border:none;color:#fca5a5;cursor:pointer;font-size:13px;line-height:1;padding:0">✕</button>
          </div>`).join('')}
        ${!(map[cat]||[]).length ? '<span style="font-size:12px;color:#9ca3af">尚無細項</span>' : ''}
      </div>
    </div>`).join('');
}

async function addDefectMapCategory() {
  const input = document.getElementById('defectNewCatInput');
  const name = input?.value.trim();
  if (!name) return;
  const map = getDefectMap();
  if (map[name]) { alert('大分類已存在'); return; }
  map[name] = [];
  saveDefectConfig({ map });
  try { await DefectConfigAPI.saveMap(map); } catch(e) { console.warn(e.message); }
  input.value = '';
  renderDefectMapAdmin();
}

async function addDefectMapReason(catIdx) {
  const input = document.getElementById(`defectMapRI_${catIdx}`);
  const name = input?.value.trim();
  if (!name) return;
  const map = getDefectMap();
  const cat = Object.keys(map)[catIdx];
  if (!cat) return;
  if ((map[cat]||[]).includes(name)) { alert('細項已存在'); return; }
  map[cat] = [...(map[cat]||[]), name];
  saveDefectConfig({ map });
  try { await DefectConfigAPI.saveMap(map); } catch(e) { console.warn(e.message); }
  input.value = '';
  renderDefectMapAdmin();
}

async function deleteDefectMapCategory(catIdx) {
  if (!confirm('確定刪除此大分類及所有細項？')) return;
  const map = getDefectMap();
  const cat = Object.keys(map)[catIdx];
  if (!cat) return;
  delete map[cat];
  saveDefectConfig({ map });
  try { await DefectConfigAPI.saveMap(map); } catch(e) { console.warn(e.message); }
  renderDefectMapAdmin();
}

async function deleteDefectMapReason(catIdx, reasonIdx) {
  const map = getDefectMap();
  const cat = Object.keys(map)[catIdx];
  if (!cat) return;
  map[cat].splice(reasonIdx, 1);
  saveDefectConfig({ map });
  try { await DefectConfigAPI.saveMap(map); } catch(e) { console.warn(e.message); }
  renderDefectMapAdmin();
}

function renderRoleCards() {
  const container = document.getElementById('roleListContainer');
  if (!container) return;
  const roles = getRoles();
  if (!roles.length) { container.innerHTML='<div style="padding:16px 16px 4px;font-size:13px;color:#9ca3af">尚無自訂角色</div>'; return; }
  container.innerHTML = roles.map((r,i) => `
    <div class="card" style="margin-bottom:8px;display:flex;align-items:center;justify-content:space-between">
      <div>
        <div style="font-size:15px;font-weight:700;color:#111;margin-bottom:4px">${r.name}</div>
        <div style="display:flex;flex-wrap:wrap;gap:4px">${(r.tabs||[]).map(t=>`<span style="font-size:11px;background:#ede9fe;color:#2563eb;border-radius:8px;padding:2px 8px">${TAB_LABELS[t]||t}</span>`).join('')}</div>
      </div>
      <div style="display:flex;gap:8px;flex-shrink:0;margin-left:12px">
        <button onclick="openEditRoleSheet(${i})" class="btn btn-sm" style="background:#ede9fe;color:#2563eb;border:none">編輯</button>
        <button onclick="deleteRole(${i})" class="btn btn-sm" style="background:#fee2e2;color:#991b1b;border:none">刪除</button>
      </div>
    </div>`).join('');
}

function renderUserCards() {
  const container = document.getElementById('userListContainer');
  if (!container) return;
  const users = getUsers();
  if (!users.length) { container.innerHTML='<div style="padding:16px;font-size:13px;color:#9ca3af">尚無帳號</div>'; return; }
  const roleColors = { admin:'background:#ede9fe;color:#2563eb', pending:'background:#f3f4f6;color:#6b7280' };
  container.innerHTML = users.map((u,i) => {
    const rid = getRid(u);
    const rname = getRoleName(rid);
    const rcolor = rid==='admin'?roleColors.admin:rid==='pending'?roleColors.pending:'background:#d1fae5;color:#065f46';
    return `<div class="card" style="margin-bottom:8px;display:flex;align-items:center;justify-content:space-between">
      <div>
        <div style="font-size:15px;font-weight:700;color:#111">${u.name||u.userId}</div>
        <div style="font-size:12px;color:#6b7280;margin-top:2px">@${u.userId||u.user_id}</div>
        <span style="font-size:11px;${rcolor};border-radius:8px;padding:2px 8px;margin-top:4px;display:inline-block">${rname}</span>
      </div>
      <div style="display:flex;gap:8px;flex-shrink:0;margin-left:12px">
        <button onclick="openEditUserSheet(${i})" class="btn btn-sm" style="background:#f3f4f6;color:#374151;border:none">編輯</button>
        ${(u.userId||u.user_id)!=='reyi'?`<button onclick="deleteUser(${i})" class="btn btn-sm" style="background:#fee2e2;color:#991b1b;border:none">刪除</button>`:''}
      </div>
    </div>`;
  }).join('');
}

// 角色 chip toggle
function toggleRoleTab(el) { el.classList.toggle('selected'); }

function openEditRoleSheet(idx) {
  const r = getRoles()[idx];
  editRoleIdx = idx;
  document.getElementById('roleSheetTitle').textContent = '編輯角色';
  document.getElementById('rm-name').value = r.name;
  document.querySelectorAll('#rmTabChips .reason-chip').forEach(c => {
    c.classList.toggle('selected', (r.tabs||[]).includes(c.dataset.tab));
  });
  openSheet('addRoleSheet');
}

async function saveRole() {
  const errDiv = document.getElementById('roleSheetError');
  const name = document.getElementById('rm-name').value.trim();
  const tabs = [...document.querySelectorAll('#rmTabChips .reason-chip.selected')].map(c=>c.dataset.tab);
  errDiv.style.display='none';
  if (!name) { errDiv.textContent='請輸入角色名稱'; errDiv.style.display='block'; return; }
  if (!tabs.length) { errDiv.textContent='請至少選擇一個功能'; errDiv.style.display='block'; return; }
  try {
    const roles = getRoles();
    if (editRoleIdx===null) { const nr=await RoleAPI.create(name,tabs); roles.push(nr); }
    else { await RoleAPI.update(roles[editRoleIdx].id,name,tabs); roles[editRoleIdx].name=name; roles[editRoleIdx].tabs=tabs; }
    saveRoles(roles); editRoleIdx=null;
    closeAllSheets(); renderRoleCards(); refreshRoleOptions();
  } catch(e) { errDiv.textContent=e.message; errDiv.style.display='block'; }
}

async function deleteRole(idx) {
  if (!confirm('確定刪除此角色？')) return;
  const roles=getRoles(); const roleId=roles[idx].id;
  try { await RoleAPI.delete(roleId); roles.splice(idx,1); saveRoles(roles); renderRoleCards(); } catch(e){alert(e.message);}
}

function openEditUserSheet(idx) {
  editUserIdx = idx;
  const u = getUsers()[idx];
  document.getElementById('userSheetTitle').textContent = '編輯帳號';
  document.getElementById('um-userId').value   = u.userId||u.user_id||'';
  document.getElementById('um-userId').disabled = true;
  document.getElementById('um-name').value     = u.name||'';
  document.getElementById('um-password').value = '';
  document.getElementById('um-role').value     = getRid(u);
  openSheet('addUserSheet');
}

function openSheet_addUser() {
  editUserIdx=null;
  document.getElementById('userSheetTitle').textContent='新增帳號';
  document.getElementById('um-userId').disabled=false;
  ['um-userId','um-name','um-password'].forEach(id=>{document.getElementById(id).value='';});
  document.getElementById('um-role').value='pending';
  openSheet('addUserSheet');
}

function refreshRoleOptions() {
  const sel = document.getElementById('um-role');
  if (!sel) return;
  const cur = sel.value;
  [...sel.options].forEach(o=>{ if(o.value!=='pending'&&o.value!=='admin') o.remove(); });
  const adminOpt = sel.querySelector('option[value="admin"]');
  getRoles().forEach(r=>{ const o=document.createElement('option'); o.value=r.id; o.textContent=r.name; sel.insertBefore(o,adminOpt); });
  sel.value = cur||'pending';
}

async function saveUser() {
  const errDiv=document.getElementById('userSheetError');
  const userId=document.getElementById('um-userId').value.trim();
  const name  =document.getElementById('um-name').value.trim();
  const pw    =document.getElementById('um-password').value;
  const roleId=document.getElementById('um-role').value;
  errDiv.style.display='none';
  if (!userId||!name) { errDiv.textContent='帳號與姓名為必填'; errDiv.style.display='block'; return; }
  try {
    const users=getUsers();
    if (editUserIdx===null) {
      if (!pw) { errDiv.textContent='新增帳號時密碼為必填'; errDiv.style.display='block'; return; }
      await UserAPI.create(userId,pw,name,roleId);
      users.push({userId,name,role_id:roleId,createdAt:nowStr()});
    } else {
      await UserAPI.update(userId,name,roleId,pw);
      users[editUserIdx].name=name; users[editUserIdx].role_id=roleId;
    }
    saveUsers(users); editUserIdx=null;
    closeAllSheets(); renderUserCards();
  } catch(e) { errDiv.textContent=e.message; errDiv.style.display='block'; }
}

async function deleteUser(idx) {
  if (!confirm('確定要刪除此帳號？')) return;
  const users=getUsers(); const uid=users[idx].userId||users[idx].user_id;
  try { await UserAPI.delete(uid); users.splice(idx,1); saveUsers(users); renderUserCards(); } catch(e){alert(e.message);}
}

// ── 徽章計數 ─────────────────────────────────────────
function updateBadges() {
  const all = getAllProducts();
  const nb = (id,v) => { const e=document.getElementById(`nb-${id}`); if(e){e.textContent=v; e.style.display=v>0?'flex':'none';} };
  const reviewCount   = all.filter(p=>p.status===STATUS.ABNORMAL).length;
  const purchaseCount = all.filter(p=>p.status===STATUS.PROCUREMENT).length;
  nb('review',   reviewCount);
  nb('purchase', purchaseCount);
  // 異常回覆頁角標：採購已回覆但尚未查看（procReplyUnread）
  const reportCount = all.filter(p=>p.procReplyUnread).length;
  nb('report', reportCount);
}

// ── 匯入 Excel ────────────────────────────────────────
function importExcel(input) {
  const file=input.files[0]; if(!file) return;
  const selectedDate=currentReceivingDate();
  const reader=new FileReader();
  reader.onload=async e=>{
    try {
      const wb=XLSX.read(e.target.result,{type:'binary'});
      const sName=wb.SheetNames.find(s=>s.includes('明細')||s.includes('2'))||wb.SheetNames[0];
      const ws=wb.Sheets[sName];
      const rows=XLSX.utils.sheet_to_json(ws,{header:1,defval:''});
      let hRow=-1;
      for(let i=0;i<rows.length;i++){const r=rows[i].map(String);if(r.includes('序')||r.some(c=>c.includes('採購單號'))){hRow=i;break;}}
      if(hRow<0){alert('找不到欄位標題，請確認為「報表-2-明細」分頁格式');return;}
      const h=rows[hRow].map(String);
      const ix={seq:h.findIndex(x=>x==='序'),po:h.findIndex(x=>x.includes('採購單號')),cat:h.findIndex(x=>x.includes('大分類')),barcode:h.findIndex(x=>x.includes('條碼')),itemNo:h.findIndex(x=>x==='品號'),name:h.findIndex(x=>x==='品名'),spec:h.findIndex(x=>x.includes('規格')),period:h.findIndex(x=>x.includes('期數')),qty:h.findIndex(x=>x.includes('採購數量')),arrival:h.findIndex(x=>x.includes('到貨日'))};
      const parsed=[];
      for(let i=hRow+1;i<rows.length;i++){
        const r=rows[i];if(!r[ix.seq]||String(r[ix.seq]).trim()==='')continue;
        const rawDate=r[ix.arrival];let ad='';
        if(rawDate){const d=new Date(rawDate);if(!isNaN(d))ad=d.toISOString().slice(0,10);else{const s=String(rawDate).replace(/\//g,'-');if(/^\d{4}-\d{2}-\d{2}$/.test(s))ad=s;else if(/^\d{7}$/.test(s)){const y=parseInt(s.slice(0,3))+1911;ad=`${y}-${s.slice(3,5)}-${s.slice(5,7)}`;}}}
        parsed.push({seq:r[ix.seq],po:r[ix.po]||'',cat:r[ix.cat]||'',barcode:r[ix.barcode]||'',itemNo:r[ix.itemNo]||'',name:r[ix.name]||'',spec:r[ix.spec]||'',period:r[ix.period]||'',qty:Number(r[ix.qty])||0,arrivalDate:ad});
      }
      const importDate=document.getElementById('receivingDate').value;
      try { await ProductAPI.importItems(parsed,importDate); } catch(apiErr){console.warn('import:',apiErr.message);}
      await reloadFromFirestore(importDate);
      renderProductCards(); updateStats();
    } catch(err){alert('匯入失敗：'+err.message);}
  };
  reader.readAsBinaryString(file);
  input.value='';
}

// ── 手動新增 ─────────────────────────────────────────
async function saveManualAdd() {
  const errDiv=document.getElementById('manualAddError');
  const name=document.getElementById('ma-name').value.trim();
  const qty=parseInt(document.getElementById('ma-qty').value)||0;
  errDiv.style.display='none';
  if(!name){errDiv.textContent='請輸入品名';errDiv.style.display='block';return;}
  if(qty<=0){errDiv.textContent='請輸入採購數量';errDiv.style.display='block';return;}
  const date=currentReceivingDate()||new Date().toLocaleDateString('sv-SE');
  try {
    await ProductAPI.create({arrivalDate:date,po:document.getElementById('ma-po').value.trim(),cat:document.getElementById('ma-cat').value.trim(),barcode:document.getElementById('ma-barcode').value.trim(),itemNo:document.getElementById('ma-itemNo').value.trim(),name,qty});
  } catch(e){console.warn('create:',e.message);}
  await reloadFromFirestore(date);
  closeAllSheets(); renderProductCards(); updateStats();
}

// ── 照片上傳 ─────────────────────────────────────────
function renderPhotoSlots(gridId, photos, inputId, countId) {
  const grid=document.getElementById(gridId);
  if(!grid) return;
  grid.innerHTML='';
  for(let i=0;i<6;i++){
    const slot=document.createElement('div');
    slot.className='photo-slot';
    if(photos[i]){
      slot.innerHTML=`<img src="${photos[i]}" />`;
      slot.onclick=()=>{photos.splice(i,1);renderPhotoSlots(gridId,photos,inputId,countId);};
      slot.title='點擊移除';
    } else if(i===photos.length){
      slot.innerHTML=`<svg style="width:28px;height:28px;color:#9ca3af" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 4v16m8-8H4"/></svg>`;
      slot.onclick=()=>document.getElementById(inputId).click();
    } else { slot.style.opacity='.3'; slot.style.cursor='default'; }
    grid.appendChild(slot);
  }
  const c=document.getElementById(countId);
  if(c) c.textContent=`已上傳 ${photos.length} / 6 張`;
}

function handlePhotoUpload(input, gridId) {
  const files=Array.from(input.files);
  files.slice(0,6-uploadedPhotos.length).forEach(file=>{
    compressImage(file,200*1024).then(dataUrl=>{
      uploadedPhotos.push(dataUrl);
      renderPhotoSlots(gridId,uploadedPhotos,'rs-photoInput','rs-photoCount');
    });
  });
  input.value='';
}

function compressImage(file,maxBytes){
  return new Promise(resolve=>{
    const img=new Image();const url=URL.createObjectURL(file);
    img.onload=()=>{
      URL.revokeObjectURL(url);
      const canvas=document.createElement('canvas');
      let{width,height}=img;
      // 先限制最大解析度（長邊 1280px）
      const MAX_DIM=1280;
      if(width>MAX_DIM||height>MAX_DIM){
        const s=MAX_DIM/Math.max(width,height);
        width=Math.round(width*s);height=Math.round(height*s);
      }
      let quality=0.82;
      const tryCompress=()=>{
        canvas.width=width;canvas.height=height;canvas.getContext('2d').drawImage(img,0,0,width,height);
        const dataUrl=canvas.toDataURL('image/jpeg',quality);
        const bytes=Math.round((dataUrl.length-22)*3/4);
        if(bytes<=maxBytes||quality<=0.1){resolve(dataUrl);return;}
        if(quality>0.3){quality-=0.1;tryCompress();}
        else{const s=Math.sqrt(maxBytes/bytes);width=Math.round(width*s);height=Math.round(height*s);quality=0.8;tryCompress();}
      };
      tryCompress();
    };
    img.src=url;
  });
}

// ── 照片預覽 ─────────────────────────────────────────
function viewPhotos(arrivalDate, itemNo, startIdx=0) {
  const p=getAllProducts().find(x=>x.arrivalDate===arrivalDate&&x.itemNo===itemNo);
  if(!p||!p.photos.length) return;
  _photoList=p.photos; _photoIdx=startIdx;
  document.getElementById('photoSheetTitle').textContent=p.name;
  renderPhotoSheet();
  openSheet('photoSheet');
}

function renderPhotoSheet() {
  document.getElementById('photoSheetImg').src=_photoList[_photoIdx];
  document.getElementById('photoCounterLabel').textContent=`${_photoIdx+1} / ${_photoList.length}`;
  const thumbs=document.getElementById('photoSheetThumbs');
  thumbs.innerHTML=_photoList.map((s,i)=>`<img src="${s}" onclick="jumpPhoto(${i})" style="width:56px;height:56px;border-radius:10px;object-fit:cover;flex-shrink:0;${i===_photoIdx?'border:3px solid #2563eb;':'opacity:.5'};cursor:pointer" />`).join('');
}
function shiftPhoto(dir){_photoIdx=(_photoIdx+dir+_photoList.length)%_photoList.length;renderPhotoSheet();}
function jumpPhoto(i){_photoIdx=i;renderPhotoSheet();}

// ── Lightbox（全螢幕放大，點任意處關閉）──
function openLightbox(src) {
  const lb  = document.getElementById('imgLightbox');
  const img = document.getElementById('imgLightboxSrc');
  if (!lb || !img || !src) return;
  img.src = src;
  lb.style.display = 'flex';
  // 入場動畫
  requestAnimationFrame(() => { img.style.transform = 'scale(1)'; });
  document.body.style.overflow = 'hidden';
}
function closeLightbox() {
  const lb  = document.getElementById('imgLightbox');
  const img = document.getElementById('imgLightboxSrc');
  if (!lb) return;
  img.style.transform = 'scale(.92)';
  setTimeout(() => {
    lb.style.display = 'none';
    img.src = '';
    document.body.style.overflow = '';
  }, 180);
}

// ── 刪除勾選（驗收頁目前改為長按/滑動，暫用 confirm）──
async function deleteProductCard(date, idx) {
  if (!confirm('確定刪除此筆資料？')) return;
  const list=getDateProducts(date);
  const p=list[idx];
  const firestoreId=p?.id;
  list.splice(idx,1); productsByDate[date]=list;
  if(firestoreId){
    try{await ProductAPI.delete(firestoreId);}catch(e){console.warn('delete:',e.message);}
  } else {saveProductsData();}
  await reloadFromFirestore(date);
  renderProductCards(); updateStats();
}

// ── 匯出 ─────────────────────────────────────────────
function exportWarehouseList() {
  const from=document.getElementById('wh-from')?.value;
  const to=document.getElementById('wh-to')?.value;
  let list=getAllProducts().filter(p=>p.status!==STATUS.PENDING);
  if(from)list=list.filter(p=>!p.arrivalDate||p.arrivalDate>=from);
  if(to)  list=list.filter(p=>!p.arrivalDate||p.arrivalDate<=to);
  if(!list.length){alert('尚無資料可匯出');return;}
  const rows=[['到貨日','品號','條碼','品名','規格','採購數量','良品數量','異常數量','異常原因','照片數','驗收時間']];
  list.forEach(p=>rows.push([p.arrivalDate,p.itemNo,p.barcode,p.name,p.spec,p.qty,p.goodQty,p.badQty,(p.defectReasons||[]).join('、'),p.photos.length,p.time]));
  downloadCsv(rows,'入庫清單.csv');
}
function exportReport() {
  const from=document.getElementById('rp-from')?.value;
  const to=document.getElementById('rp-to')?.value;
  let list=getAllProducts().filter(p=>p.badQty>0);
  if(from)list=list.filter(p=>!p.arrivalDate||p.arrivalDate>=from);
  if(to)  list=list.filter(p=>!p.arrivalDate||p.arrivalDate<=to);
  if(!list.length){alert('尚無異常記錄');return;}
  const rows=[['日期','連動時間','異常分類','廠商','大分類','商品編號','商品名稱','異常原因','其他說明','物流專員','採購人員','採購處理方式','採購回覆']];
  list.forEach(p=>rows.push([p.arrivalDate,p.defectTime||'',p.defectClass||'其他異常',p.po||'',p.cat||'',p.itemNo,p.name,(p.defectReasons||[]).join('、'),p.defectNote||'',p.defectStaff||'',p.procStaffName||'',p.procAction||'',p.procReply||'']));
  downloadCsv(rows,'商品異常回覆商流.csv');
}
function downloadCsv(rows,filename){
  const bom='﻿';const csv=bom+rows.map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'}));a.download=filename;a.click();
}
