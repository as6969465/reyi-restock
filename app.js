/**
 * 日翊收發進貨平台 - App 核心邏輯（行動版）
 */

// ── 常數 ─────────────────────────────────────────────
// 大分類（三選一）
// 分類與原因改為動態（由 Firestore defect_config 管理），以下 getter 取代固定常數
function DEFECT_CATEGORIES() { return getDefectCategories(); }
function DEFECT_REASONS()    { return getDefectReasonsList(); }
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
const TAB_LABELS = { receiving:'進貨確認', review:'異常檢核', warehouse:'已確認', report:'異常回覆', purchase:'待回覆', resolved:'記錄', admin:'設定' };
const NAV_ICONS = {
  receiving: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>',
  warehouse: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>',
  review:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>',
  report:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>',
  purchase:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"/></svg>',
  resolved:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z"/></svg>',
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
const DEFAULT_DEFECT_CATEGORIES = ['臨時到貨','取消到貨','其他異常'];
const DEFAULT_DEFECT_REASONS = [
  '品名不符','數量不符','規格不符','外箱標示異常','條碼異常',
  '臨時到貨','取消到貨','商品異常-(多筆)','商品異常-殘膠','商品異常-汙損',
  '商品異常-破膜','商品異常-凹損','商品異常-破損','商品異常-未封口',
  '商品異常-效期模糊','裸瓶','混效期','效期異常-無第二條件','效期異常-未來日',
  '效期異常-效期超允收','效期異常-保存期限不合理','其他'
];
function getDefectCategories() {
  const d = JSON.parse(localStorage.getItem('rr_defect_config') || 'null');
  return d?.categories || DEFAULT_DEFECT_CATEGORIES;
}
function getDefectReasonsList() {
  const d = JSON.parse(localStorage.getItem('rr_defect_config') || 'null');
  return d?.reasons || DEFAULT_DEFECT_REASONS;
}
function saveDefectConfig(cfg) {
  // null 表示尚未自訂，保留 null 讓 getter 繼續使用預設清單
  const toSave = {
    categories: cfg.categories || null,
    reasons:    cfg.reasons    || null
  };
  localStorage.setItem('rr_defect_config', JSON.stringify(toSave));
}
async function loadDefectConfig() {
  try {
    const cfg = await DefectConfigAPI.get();
    saveDefectConfig(cfg);
    return cfg;
  } catch(e) { return { categories: getDefectCategories(), reasons: getDefectReasonsList() }; }
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

  // 載入業務屬性
  loadBizAttrs().catch(()=>{});
  loadDefectConfig().catch(()=>{});
  loadCatFilters().catch(()=>{});

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
  const roleObj = getRoleById(currentRole);
  const allowedPages = currentRole==='admin' ? Object.keys(TAB_LABELS) : (roleObj?.tabs || []);
  const savedPage = localStorage.getItem('rr_last_tab');
  const defaultPage = currentRole==='admin' ? 'receiving' : (roleObj?.tabs?.[0] || 'receiving');
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
  const allowedTabs = currentRole==='admin' ? Object.keys(TAB_LABELS) : (roleObj?.tabs || []);
  const pages = allowedTabs.filter(t => document.getElementById(`page-${t}`));
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
  else if (name==='resolved')  ensureAllDatesLoaded(renderResolvedCards);
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

// ── 即時同步（onSnapshot）────────────────────────────
let _realtimeUnsub    = null;
let _syncDebounceTimer = null;
let _syncReady        = false;  // 跳過初始 snapshot
let _syncSuppressUntil = 0;     // 使用者儲存後短暫壓制 re-render

function suppressSyncRender(ms = 2000) { _syncSuppressUntil = Date.now() + ms; }

function isUserOperating() {
  return document.getElementById('overlay')?.classList.contains('open') || false;
}

function rerenderCurrentView() {
  if (isUserOperating()) return;
  if (Date.now() < _syncSuppressUntil) return; // 剛完成儲存，暫不 re-render
  if (currentPage === 'receiving')       { renderProductCards(); updateStats(); }
  else if (currentPage === 'warehouse')  renderWarehouseCards();
  else if (currentPage === 'review')     renderReviewCards();
  else if (currentPage === 'report')     renderReportCards();
  else if (currentPage === 'purchase')   renderPurchaseCards();
  else if (currentPage === 'resolved')   renderResolvedCards();
  updateBadges();
}

function startRealtimeSync() {
  if (_realtimeUnsub) { _realtimeUnsub(); _realtimeUnsub = null; }
  _syncReady = false;
  _realtimeUnsub = db.collection('products').onSnapshot(snapshot => {
    // 第一次回呼是初始狀態（資料已手動載入），跳過避免不必要的重繪
    if (!_syncReady) { _syncReady = true; return; }
    let changed = false;
    snapshot.docChanges().forEach(change => {
      const date = change.doc.data()?.arrival_date;
      if (!date) return;
      if (!_allKnownDates.includes(date)) _allKnownDates.push(date);
      if (change.type === 'removed') {
        if (productsByDate[date]) {
          productsByDate[date] = productsByDate[date].filter(p => p.id !== change.doc.id);
          changed = true;
        }
      } else {
        const p = normalizeProducts([{id: change.doc.id, ...change.doc.data()}])[0];
        if (!productsByDate[date]) productsByDate[date] = [];
        const idx = productsByDate[date].findIndex(x => x.id === change.doc.id);
        if (idx >= 0) { productsByDate[date][idx] = p; }
        else { productsByDate[date].push(p); }
        changed = true;
      }
    });
    if (!changed) return;
    // 防抖：1s 內只重繪一次
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
    photos:p.photos||[], defectItems:p.defect_items||p.defectItems||[], procReplyUnread:!!(p.proc_reply_unread||p.procReplyUnread), time:p.recv_time||p.time||''
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
  const list  = getDateProducts(date).filter(p => p.status === STATUS.PENDING)
    .sort((a,b) => (a.po||'').localeCompare(b.po||''));
  if (!list.length) {
    container.innerHTML = `<div class="empty-state">
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
      </svg>
      <p>${date ? date + ' 尚無進貨資料' : '請選擇日期'}</p>
      <small>點右下角 ↑ 匯入 Excel</small></div>`;
    return;
  }
  container.innerHTML = list.map((p, i) => `
    <div class="product-card slide-up" data-status="${p.status}" onclick="startReceiving('${date}',${i})">
      <div class="product-card-inner">
        ${p.po ? `<div style="font-size:13px;font-weight:600;color:#4b5563;margin-bottom:2px">PO：${p.po}</div>` : ''}
        <div class="product-card-name">${p.name}</div>
        <div class="product-card-sub">${p.itemNo||'—'} · ${p.cat||'—'}</div>
        ${p.received && p.badQty > 0 ? `<div style="margin-top:6px">${(p.defectReasons||[]).slice(0,2).map(r=>`<span class="badge badge-abnormal" style="font-size:10px;margin-right:3px">${r}</span>`).join('')}</div>` : ''}
      </div>
      ${p.barcode ? `<div style="flex-shrink:0;width:108px;display:flex;align-items:center;justify-content:flex-start;padding:0 6px 0 0">
        <canvas id="bc-r-${date}-${i}" style="width:108px;height:40px;display:block"></canvas>
      </div>` : ''}
      <div class="product-card-right">
        ${statusBadgeHtml(p)}
        ${p.received
          ? `<div class="qty-row">
              <div class="qty-item"><div class="qty-num" style="color:#059669">${p.goodQty}</div><div class="qty-lbl">良品</div></div>
              <div class="qty-item"><div class="qty-num" style="color:#dc2626">${p.badQty}</div><div class="qty-lbl">不良</div></div>
             </div>`
          : `<div><div class="qty-lbl">採購</div><div class="qty-big">${p.qty}</div></div>`}
      </div>
    </div>`).join('');

  // 繪製條碼
  if (typeof JsBarcode !== 'undefined') {
    list.forEach((p, i) => {
      if (!p.barcode) return;
      const el = document.getElementById(`bc-r-${date}-${i}`);
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
  const list = getDateProducts(currentReceivingDate());
  const done     = list.filter(p=>p.status!==STATUS.PENDING).length;
  const pending  = list.filter(p=>p.status===STATUS.PENDING).length;
  const abnormal = list.filter(p=>[STATUS.ABNORMAL,STATUS.PROCUREMENT,STATUS.RESOLVED].includes(p.status)).length;
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
      <div class="stat-card-icon">${IC('M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2')}</div>
      <div><div class="stat-card-val">${list.length}</div><div class="stat-card-lbl">今日進貨</div></div>
    </div>
    <div class="stat-card stat-done">
      <div class="stat-card-icon">${IC('M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z')}</div>
      <div><div class="stat-card-val">${done}</div><div class="stat-card-lbl">已確認</div></div>
    </div>
    <div class="stat-card stat-pending">
      <div class="stat-card-icon">${IC('M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z')}</div>
      <div><div class="stat-card-val">${pending}</div><div class="stat-card-lbl">待確認</div></div>
    </div>
    <div class="stat-card stat-bad">
      <div class="stat-card-icon">${IC('M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z')}</div>
      <div><div class="stat-card-val">${abnormal}</div><div class="stat-card-lbl">有異常</div></div>
    </div>`;
}

// ── 驗收 Sheet - 異常明細（每張照片各自原因）────────────
let _defectItems = []; // [{photo, reason, note}]

// 目前顯示的異常明細索引
let _activeDefectIdx = 0;

function renderDefectItems(readonly) {
  const container = document.getElementById('rs-defect-items');
  if (!container) return;
  if (!_defectItems.length && !readonly) {
    container.innerHTML = '<div style="text-align:center;padding:12px 0 4px;color:#9ca3af;font-size:13px">尚未新增，點上方按鈕新增</div>';
    return;
  }
  if (!_defectItems.length) { container.innerHTML=''; return; }

  _activeDefectIdx = Math.min(_activeDefectIdx, _defectItems.length-1);
  if (_activeDefectIdx < 0) _activeDefectIdx = 0;
  const item = _defectItems[_activeDefectIdx];
  const i    = _activeDefectIdx;
  const badQty       = parseInt(document.getElementById('rs-bad')?.value)||0;
  const totalEntered = _defectItems.reduce((s,it)=>(s+(parseInt(it.qty)||0)),0);
  const isMatch      = badQty>0 && totalEntered===badQty;

  const camSvgSm = '<svg style=\"width:16px;height:16px;color:#fca5a5\" fill=\"none\" stroke=\"currentColor\" viewBox=\"0 0 24 24\"><path stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"2\" d=\"M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z\"/><path stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"2\" d=\"M15 13a3 3 0 11-6 0 3 3 0 016 0z\"/></svg>';
  const camSvgLg = '<svg style=\"width:20px;height:20px;color:#fca5a5\" fill=\"none\" stroke=\"currentColor\" viewBox=\"0 0 24 24\"><path stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"2\" d=\"M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z\"/><path stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"2\" d=\"M15 13a3 3 0 11-6 0 3 3 0 016 0z\"/></svg>';

  const thumbs = _defectItems.map((it, idx) => {
    const active = idx === _activeDefectIdx;
    const hasQty = parseInt(it.qty)>0;
    const t = it.photo
      ? `<img src="${it.photo}" style="width:100%;height:100%;object-fit:cover;display:block" />`
      : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center">${camSvgSm}</div>`;
    return `<div onclick="switchDefectItem(${idx})"
      style="width:50px;height:50px;border-radius:10px;flex-shrink:0;cursor:pointer;overflow:hidden;position:relative;
        border:2.5px solid ${active?'#2563eb':hasQty?'#86efac':'#fecaca'};
        background:${active?'#dbeafe':hasQty?'#f0fdf4':'#fff0f0'};
        box-shadow:${active?'0 2px 8px rgba(37,99,235,.25)':'none'};transition:all .15s">${t}
      ${hasQty?`<div style="position:absolute;bottom:1px;right:1px;background:#059669;color:#fff;border-radius:4px;font-size:9px;font-weight:700;padding:0 3px;line-height:14px">${it.qty}</div>`:''}
    </div>`;
  }).join('');

  const statsEl = !readonly ? `<div style="padding:6px 10px;margin-bottom:8px;border-radius:10px;font-size:12px;font-weight:600;background:${isMatch?'#d1fae5':'#fef3c7'};color:${isMatch?'#065f46':'#92400e'}">
    ${isMatch?'✓':'⚠'} 數量合計：${totalEntered} / ${badQty}
  </div>` : '';

  const catBtns = DEFECT_CATEGORIES().map(c=>{const active=item.category===c;return `<button onclick="${readonly?'':`setDefectCategory(${i},'${c}')`}" style="padding:6px 12px;border-radius:18px;border:1.5px solid ${active?'#2563eb':'#e5e7eb'};background:${active?'#dbeafe':'#f8fafc'};color:${active?'#1d4ed8':'#6b7280'};font-size:12px;font-weight:${active?'700':'500'};cursor:pointer;white-space:nowrap">${c}</button>`;}).join('');

  const reasonChips = !readonly
    ? `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:5px;margin-top:6px">${DEFECT_REASONS().map(r=>{const sel=(item.reasons||[]).includes(r);return `<button type="button" onclick="toggleDefectSubReason(${i},'${r}')" style="padding:8px 4px;border-radius:8px;border:1.5px solid ${sel?'#2563eb':'#e5e7eb'};background:${sel?'#dbeafe':'#f8fafc'};color:${sel?'#1d4ed8':'#6b7280'};font-size:12px;font-weight:${sel?'700':'400'};cursor:pointer;line-height:1.4;text-align:center;word-break:break-all">${r}</button>`;}).join('')}</div>`
    : ((item.reasons||[]).length?`<div style="display:flex;flex-wrap:wrap;gap:3px;margin-top:4px">${(item.reasons||[]).map(r=>`<span class="badge badge-abnormal" style="font-size:10px">${r}</span>`).join('')}</div>`:'');

  const photoMain = item.photo
    ? `<div style="position:relative;display:inline-block;flex-shrink:0"><img src="${item.photo}" style="width:80px;height:80px;border-radius:10px;object-fit:cover;display:block;cursor:pointer" onclick="viewDefectPhoto(${i})" />${!readonly?`<button onclick="clearDefectPhotoItem(${i})" style="position:absolute;top:-5px;right:-5px;width:16px;height:16px;background:#ef4444;color:#fff;border:none;border-radius:50%;font-size:10px;cursor:pointer">x</button>`:''}</div>`
    : (!readonly?`<label style="width:80px;height:80px;border:2px dashed #fca5a5;border-radius:10px;background:#fff5f5;display:inline-flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;gap:3px;flex-shrink:0">${camSvgLg}<span style="font-size:10px;color:#fca5a5">上傳</span><input type="file" accept="image/*" class="hidden" onchange="setDefectPhoto(${i},this)" /></label>`:'<span style="font-size:12px;color:#9ca3af">未上傳</span>');

  const qtyInput = !readonly
    ? `<div style="flex-shrink:0;text-align:center;width:80px"><div style="font-size:10px;color:#9ca3af;margin-bottom:3px">不良數量</div><input type="number" min="0" value="${item.qty||''}" placeholder="0" style="width:80px;border:1.5px solid ${(parseInt(item.qty)||0)>0?'#2563eb':'#fecaca'};border-radius:10px;padding:8px 4px;font-size:18px;font-weight:800;text-align:center;outline:none;color:#2563eb;background:#f0f7ff" oninput="_defectItems[${i}].qty=parseInt(this.value)||0;updateDefectQtyStats()" /></div>`
    : `<div style="flex-shrink:0;text-align:center;width:80px"><div style="font-size:10px;color:#9ca3af">數量</div><div style="font-size:22px;font-weight:900;color:#2563eb">${item.qty||0}</div></div>`;

  const noteEl = !readonly
    ? `<input placeholder="補充說明（選填）" value="${item.note||''}" style="width:100%;border:1px solid #e5e7eb;border-radius:8px;padding:7px 10px;font-size:12px;outline:none;background:#fff;margin-top:6px;font-family:inherit" oninput="_defectItems[${i}].note=this.value" />`
    : (item.note?`<div style="font-size:12px;color:#6b7280;margin-top:4px">${item.note}</div>`:'');

  const replyEl = item.procAction?`<div style="padding:7px 10px;background:#d1fae5;font-size:12px;color:#065f46;border-radius:8px;margin-top:6px"><b>採購：</b>${item.procAction}${item.procReply?' — '+item.procReply:''}</div>`:'';

  container.innerHTML = `
    <div style="display:flex;gap:8px;align-items:center;overflow-x:auto;padding-bottom:6px;margin-bottom:8px">
      ${thumbs}
    </div>
    ${statsEl}
    <div style="background:#fef9f9;border-radius:14px;border:1.5px solid #fecaca;padding:12px">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:10px">
        <div style="display:flex;align-items:center;gap:8px">
          ${photoMain}
          ${qtyInput}
          <span style="font-size:11px;color:#9ca3af">${i+1} / ${_defectItems.length}</span>
        </div>
        ${!readonly?`<button onclick="removeDefectItem(${i})" style="background:none;border:none;color:#fca5a5;cursor:pointer;font-size:13px;padding:4px">x 刪除</button>`:''}
      </div>
      <div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:6px">${catBtns}</div>
      ${reasonChips}${noteEl}${replyEl}
    </div>`;
}

function switchDefectItem(idx) { _activeDefectIdx = idx; renderDefectItems(false); }

function updateDefectQtyStats() {
  const badQty       = parseInt(document.getElementById('rs-bad')?.value)||0;
  const totalEntered = _defectItems.reduce((s,it)=>(s+(parseInt(it.qty)||0)),0);
  const isMatch      = badQty>0 && totalEntered===badQty;
  // 更新統計列
  const containers = document.querySelectorAll('#rs-defect-items > div[style*="background"]');
  if (containers.length > 1) {
    const statsDiv = containers[0];
    if (statsDiv && statsDiv.textContent.includes('/')) {
      statsDiv.style.background = isMatch?'#d1fae5':'#fef3c7';
      statsDiv.style.color      = isMatch?'#065f46':'#92400e';
      statsDiv.innerHTML        = `${isMatch?'✓':'⚠'} 數量合計：${totalEntered} / ${badQty}`;
    }
  }
  // 同時更新縮圖徽章（重繪以顯示綠勾）
  renderDefectItems(false);
}

function clearDefectPhotoItem(i) { _defectItems[i].photo=''; renderDefectItems(false); }
function addDefectItem() {
  if (_defectItems.length >= 6) { alert('最多 6 筆'); return; }
  _defectItems.push({ photo: '', category: '', reasons: [], note: '' });
  _activeDefectIdx = _defectItems.length - 1;
  renderDefectItems(false);
}

// 批次匯入多張照片，每張建立一筆異常明細
function batchAddDefectPhotos(input) {
  const files = Array.from(input.files);
  const remaining = 6 - _defectItems.length;
  if (!files.length) return;
  if (remaining <= 0) { alert('最多 6 筆，已達上限'); input.value=''; return; }
  const toProcess = files.slice(0, remaining);
  let done = 0;
  const firstNewIdx = _defectItems.length;
  toProcess.forEach(file => {
    compressImage(file, 800*1024).then(dataUrl => {
      _defectItems.push({ photo: dataUrl, category: '', reasons: [], note: '' });
      done++;
      if (done === toProcess.length) {
        _activeDefectIdx = firstNewIdx;
        renderDefectItems(false);
      }
    });
  });
  input.value = '';
}
function removeDefectItem(i) { _defectItems.splice(i,1); if(_activeDefectIdx>=_defectItems.length)_activeDefectIdx=Math.max(0,_defectItems.length-1); renderDefectItems(false); }
function setDefectCategory(i, cat) {
  _defectItems[i].category = cat;
  if (cat !== '其他異常') _defectItems[i].reasons = [];
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
// 向下相容舊格式
function setDefectReason(i, r) { _defectItems[i].reason = r; renderDefectItems(false); }
function setDefectReasonSelect(i, r) { _defectItems[i].reason = r; }
function setDefectPhoto(i, input) {
  const file = input.files[0]; if (!file) return;
  compressImage(file, 800*1024).then(dataUrl => { _defectItems[i].photo=dataUrl; renderDefectItems(false); });
}
function viewDefectPhoto(i) {
  const p = _defectItems[i];
  if (!p?.photo) return;
  openLightbox(p.photo);
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
  const p   = getDateProducts(date)[idx];
  p.bizAttr = attrName;
  closeAllSheets();
  // 短暫延遲讓 Sheet 關閉動畫完成
  setTimeout(() => openReceiveSheet(date, idx), 200);
}

function openReceiveSheet(date, idx) {
  const p = getDateProducts(date)[idx];
  if (!p) return;
  currentIdx = { date, idx };
  // 載入已有的異常明細（含舊格式自動轉換）
  if ((p.defectItems||[]).length) {
    _defectItems = p.defectItems.map(item => ({
      photo:    item.photo    || '',
      category: item.category || '',
      reasons:  item.reasons  || (item.reason ? [item.reason] : []),
      note:     item.note     || ''
    }));
  } else if (p.photos?.length && p.badQty > 0) {
    // 舊格式備援：照片+原因分開存
    const allReasons = p.defectReasons || [];
    _defectItems = p.photos.map((ph, i) => ({
      photo:    ph,
      category: '',
      reasons:  allReasons.length > 0 ? (i === 0 ? allReasons : []) : [],
      note:     i === 0 ? (p.defectNote || '') : ''
    }));
  } else {
    _defectItems = [];
  }
  _activeDefectIdx = 0;

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
        <label class="field-label">良品數量 *</label>
        <input id="rs-good" type="number" min="0" value="${p.received?p.goodQty:p.qty}" class="input"
          style="font-size:20px;font-weight:700;text-align:center" oninput="onRsBadInput()" ${isResolved?'readonly':''} />
      </div>
      <div>
        <label class="field-label">不良品數量</label>
        <input id="rs-bad" type="number" min="0" value="${p.received?p.badQty:''}" class="input"
          style="font-size:20px;font-weight:700;text-align:center;color:#dc2626" oninput="onRsBadInput()" ${isResolved?'readonly':''} />
      </div>
    </div>

    <!-- 異常明細區（每張照片各自原因）-->
    <div id="rs-defect" style="${(!p.received&&!(p.badQty>0))?'display:none':''}">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
        <div style="font-size:13px;font-weight:700;color:#dc2626">異常明細</div>
        ${!isResolved ? `<label class="btn btn-sm btn-danger" style="cursor:pointer">
          ＋ 匯入照片
          <input type="file" accept="image/*" multiple class="hidden" onchange="batchAddDefectPhotos(this)" />
        </label>` : ''}
      </div>
      <div id="rs-defect-items"></div>
      ${!isResolved ? `<p style="font-size:11px;color:#9ca3af;margin-top:4px;margin-bottom:12px">每張照片可選擇對應的異常原因，供採購單位個別回覆</p>` : ''}
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

function onRsBadInput() {
  const bad  = parseInt(document.getElementById('rs-bad')?.value)||0;
  if (currentIdx) {
    const p = getDateProducts(currentIdx.date)[currentIdx.idx];
    document.getElementById('rs-good').value = Math.max(0, p.qty - bad);
  }
  const sec = document.getElementById('rs-defect');
  if (sec) sec.style.display = bad > 0 ? '' : 'none';
}

function toggleReason(el) { el.classList.toggle('selected'); }

async function saveReceiving() {
  const errDiv = document.getElementById('rs-error');
  errDiv.style.display='none';
  const good = parseInt(document.getElementById('rs-good').value);
  const bad  = parseInt(document.getElementById('rs-bad').value)||0;
  if (isNaN(good)||good<0) { errDiv.textContent='請輸入正確的良品數量'; errDiv.style.display='block'; return; }
  if (bad>0 && _defectItems.length===0) { errDiv.textContent='有不良品時，請新增至少一筆異常明細'; errDiv.style.display='block'; return; }
  const totalQty = _defectItems.reduce((s,it)=>(s+(parseInt(it.qty)||0)),0);
  if (bad>0 && totalQty !== bad) { errDiv.textContent=`照片數量合計（${totalQty}）需等於不良品數量（${bad}）`; errDiv.style.display='block'; return; }
  if (bad>0 && _defectItems.some(item=>!item.category)) { errDiv.textContent='每筆異常明細都需選擇異常大分類'; errDiv.style.display='block'; return; }
  if (bad>0 && _defectItems.some(item=>!(item.reasons&&item.reasons.length>0))) { errDiv.textContent='每筆異常明細都需選擇至少一項異常原因'; errDiv.style.display='block'; return; }


  const { date, idx } = currentIdx;
  const p = getDateProducts(date)[idx];
  const user = getCurrentUser();
  p.received=true; p.goodQty=good; p.badQty=bad;
  p.defectItems  = _defectItems.map(item => ({ ...item, procAction:'', procReply:'', procStaffName:'' }));
  // 向下相容欄位
  p.defectReasons= _defectItems.map(item=>getDefectDisplay(item)).filter(r=>r&&r!=='—');
  p.photos       = _defectItems.map(item=>item.photo).filter(Boolean);
  p.defectNote   = _defectItems.map(item=>item.note).filter(Boolean).join('；');
  p.defectClass  = '其他異常';
  p.defectStaff=user?.name||''; p.time=nowStr(); p.operatorName=user?.name||'';
  // bizAttr 已在 rs_setBizAttr 即時更新，無需再次設定
  p.status = bad>0 ? STATUS.ABNORMAL : STATUS.RECEIVED;
  // 立即重新渲染（不等 Firestore），確保已確認項目馬上顯示在確認頁籤
  suppressSyncRender(3000);
  closeAllSheets();
  renderProductCards(); updateStats();
  if (p.id) {
    ProductAPI.receive(p.id, {goodQty:good,badQty:bad,defectReasons:p.defectReasons,defectNote:p.defectNote,defectClass:p.defectClass,photos:p.photos,defectItems:p.defectItems})
      .then(async()=>{ await reloadFromFirestore(date); renderProductCards(); updateStats(); updateBadges(); })
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
            <div><div style="font-size:10px;color:#9ca3af;margin-bottom:2px">不良品</div><div style="font-size:18px;font-weight:800;color:#dc2626;line-height:1">${p.badQty}</div></div>
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
        <div style="font-size:12px;color:#9ca3af;margin-bottom:6px">${p.arrivalDate||'—'} · 不良：<b style="color:#dc2626">${p.badQty}</b> 件</div>
        ${p.defectReasons?.length>0 ? `<div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:6px">${p.defectReasons.map(r=>`<span class="badge badge-abnormal" style="font-size:10px">${r}</span>`).join('')}</div>` : ''}
        ${p.photos?.length>0 ? `<span style="color:#2563eb;font-size:13px;cursor:pointer" onclick="event.stopPropagation();viewPhotos('${p.arrivalDate}','${p.itemNo}')">${p.photos.length} 張照片 ›</span>` : ''}
      </div>
    </div>`).join('');
}

let _reviewPhotoIdx = 0;

function openReviewSheet(arrivalDate, itemNo) {
  const p = getAllProducts().find(x=>x.arrivalDate===arrivalDate && x.itemNo===itemNo);
  if (!p) return;
  reviewIdx = { arrivalDate, itemNo };
  _reviewStartTime = nowHHMM();
  _reviewPhotoIdx = 0;

  // 確保 p.defectItems 已初始化（從驗收資料預填，每張照片各自獨立）
  if (!(p.defectItems?.length)) {
    const photos  = p.photos || [];
    const reasons = p.defectReasons || [];
    p.defectItems = photos.map((ph, i) => ({
      photo:    ph,
      category: p.defectClass || '',
      reasons:  [...reasons],   // 每張照片初始帶入相同的原因
      note:     i === 0 ? (p.defectNote || '') : ''
    }));
    // 若沒有照片但有不良品，建立一筆空項目
    if (!p.defectItems.length && p.badQty > 0) {
      p.defectItems = [{ photo:'', category: p.defectClass||'', reasons:[...reasons], note: p.defectNote||'' }];
    }
  }

  renderReviewSheetBody(p);
  openSheet('reviewSheet');
}

function renderReviewSheetBody(p) {
  if (!p) { p = getAllProducts().find(x=>x.arrivalDate===reviewIdx.arrivalDate&&x.itemNo===reviewIdx.itemNo); }
  if (!p) return;
  const body = document.getElementById('reviewSheetBody');

  // 直接使用 p.defectItems（已在 openReviewSheet 初始化）
  const items = p.defectItems || [];
  const hasPhotos = items.length > 0;
  _reviewPhotoIdx = Math.min(_reviewPhotoIdx, Math.max(0, items.length-1));
  const cur = items[_reviewPhotoIdx] || {};

  // 頂部縮圖列
  const thumbs = items.map((it, idx) => {
    const active = idx === _reviewPhotoIdx;
    const t = it.photo
      ? `<img src="${it.photo}" style="width:100%;height:100%;object-fit:cover;display:block" />`
      : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#9ca3af;font-size:10px">無圖</div>`;
    const hasQty = parseInt(it.qty) > 0;
    return `<div onclick="_reviewPhotoIdx=${idx};renderReviewSheetBody();"
      style="width:52px;height:52px;border-radius:10px;flex-shrink:0;cursor:pointer;overflow:hidden;position:relative;
        border:2.5px solid ${active?'#f59e0b':'#e5e7eb'};background:${active?'#fef3c7':'#f9fafb'};
        box-shadow:${active?'0 2px 8px rgba(245,158,11,.3)':'none'};transition:all .15s">${t}
      ${hasQty?`<div style="position:absolute;bottom:1px;right:1px;background:#059669;color:#fff;border-radius:3px;font-size:9px;font-weight:700;padding:0 2px;line-height:13px">${it.qty}</div>`:''}
    </div>`;
  }).join('');

  // 當前照片＋可編輯的分類/原因（預填驗收時的資料）
  const i = _reviewPhotoIdx;
  // 分類按鈕（預填，可修改）
  const catBtns = DEFECT_CATEGORIES().map(c => {
    const active = cur?.category === c;
    return `<button onclick="rvSetCategory(${i},'${c}')"
      style="padding:6px 14px;border-radius:20px;border:1.5px solid ${active?'#f59e0b':'#e5e7eb'};
        background:${active?'#fef3c7':'#f8fafc'};color:${active?'#92400e':'#6b7280'};
        font-size:12px;font-weight:${active?'700':'500'};cursor:pointer;white-space:nowrap">${c}</button>`;
  }).join('');
  // 原因勾選（預填，可修改）
  const reasonChips = `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:5px;margin-top:6px">
    ${DEFECT_REASONS().map(r => {
      const sel = (cur?.reasons||[]).includes(r);
      return `<button type="button" onclick="rvToggleReason(${i},'${r}')"
        style="padding:8px 4px;border-radius:8px;border:1.5px solid ${sel?'#f59e0b':'#e5e7eb'};
          background:${sel?'#fef3c7':'#f8fafc'};color:${sel?'#92400e':'#6b7280'};
          font-size:12px;font-weight:${sel?'700':'400'};cursor:pointer;line-height:1.4;
          text-align:center;word-break:break-all">${r}</button>`;
    }).join('')}
  </div>`;

  const curPhotoBlock = hasPhotos ? `
    <div style="display:flex;gap:8px;align-items:center;overflow-x:auto;padding-bottom:6px;margin-bottom:10px">
      ${thumbs}
    </div>
    <div style="background:#fffbeb;border-radius:12px;border:1.5px solid #fde68a;padding:12px;margin-bottom:10px">
      <div style="display:flex;gap:10px;align-items:flex-start;margin-bottom:10px">
        ${cur?.photo ? `<img src="${cur.photo}" style="width:64px;height:64px;border-radius:8px;object-fit:cover;flex-shrink:0;cursor:zoom-in"
          onclick="openLightbox('${cur.photo}')" />` : ''}
        ${(parseInt(cur?.qty)||0)>0 ? `<div style="flex-shrink:0;text-align:center;min-width:44px"><div style="font-size:10px;color:#92400e;margin-bottom:2px">數量</div><div style="font-size:20px;font-weight:900;color:#d97706;line-height:1">${cur.qty}</div></div>` : ''}
        <div>
          <div style="font-size:10px;font-weight:700;color:#92400e;margin-bottom:4px">
            照片 ${items.length>1?`${_reviewPhotoIdx+1}/${items.length} `:''}<span style="font-weight:400;color:#b45309">（可修改原因後確認）</span>
          </div>
          <div style="display:flex;gap:5px;flex-wrap:wrap">${catBtns}</div>
        </div>
      </div>
      ${reasonChips}
      <input id="rv-cur-note" value="${cur?.note||''}" placeholder="補充說明（選填）"
        style="width:100%;margin-top:8px;border:1px solid #e5e7eb;border-radius:8px;padding:7px 10px;font-size:12px;outline:none;background:#fff;font-family:inherit"
        oninput="rvSetNote(${i},this.value)" />
    </div>` : `
    <div style="background:#fffbeb;border-radius:12px;padding:12px;margin-bottom:10px">
      <div style="font-size:12px;font-weight:700;color:#92400e;margin-bottom:6px">現場記錄</div>
      <div style="display:flex;flex-wrap:wrap;gap:3px">${(p.defectReasons||[]).map(r=>`<span class="badge badge-abnormal" style="font-size:10px">${r}</span>`).join('')||'無'}</div>
    </div>`;

  body.innerHTML = `
    ${curPhotoBlock}
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

// 專員修改各照片的分類/原因/說明（直接修改 p.defectItems）
function rvSetCategory(idx, cat) {
  const p = getAllProducts().find(x=>x.arrivalDate===reviewIdx.arrivalDate&&x.itemNo===reviewIdx.itemNo);
  if (p?.defectItems?.[idx]) { p.defectItems[idx].category=cat; renderReviewSheetBody(p); }
}
function rvToggleReason(idx, r) {
  const p = getAllProducts().find(x=>x.arrivalDate===reviewIdx.arrivalDate&&x.itemNo===reviewIdx.itemNo);
  if (!p?.defectItems?.[idx]) return;
  if (!p.defectItems[idx].reasons) p.defectItems[idx].reasons = [];
  const reasons = p.defectItems[idx].reasons;
  const i = reasons.indexOf(r);
  if (i>=0) reasons.splice(i,1); else reasons.push(r);
  // 不重繪（checkbox 原生狀態自動更新）
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
        <div style="font-size:12px;color:#9ca3af;margin-bottom:6px">${p.arrivalDate||'—'} · 不良：<b style="color:#dc2626">${p.badQty}</b> 件</div>
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

  // 每筆異常明細各自回覆
  const itemsHtml = items.length
    ? items.map((item, i) => `
      <div style="background:#f9fafb;border-radius:12px;border:1.5px solid #e5e7eb;padding:12px;margin-bottom:10px">
        <div style="display:flex;gap:10px;align-items:center;margin-bottom:10px">
          ${item.photo ? `<img src="${item.photo}" style="width:56px;height:56px;border-radius:8px;object-fit:cover;flex-shrink:0;cursor:zoom-in" onclick="openLightbox('${item.photo}')" />` : ''}
          ${(parseInt(item.qty)||0)>0?`<div style="flex-shrink:0;text-align:center;min-width:40px"><div style="font-size:10px;color:#9ca3af">數量</div><div style="font-size:20px;font-weight:900;color:#2563eb;line-height:1">${item.qty}</div></div>`:''}
          <div style="flex:1;min-width:0">
            <div style="font-size:11px;color:#9ca3af;margin-bottom:3px">照片 ${i+1} / ${items.length}${item.category?' · '+item.category:''}</div>
            <div style="display:flex;flex-wrap:wrap;gap:3px">${(item.reasons||[]).map(r=>`<span class="badge badge-abnormal" style="font-size:10px">${r}</span>`).join('')||''}</div>
            ${item.note ? `<div style="font-size:12px;color:#6b7280;margin-top:4px">${item.note}</div>` : ''}
          </div>
        </div>
        ${item.procAction
          ? `<div style="background:#d1fae5;border-radius:8px;padding:8px;font-size:12px;color:#065f46">
               已回覆：<b>${item.procAction}</b>${item.procReply?' — '+item.procReply:''}
             </div>`
          : `<div>
              <select id="pur-action-${i}" class="input" style="appearance:auto;margin-bottom:8px">
                <option value="">請選擇處理方式</option>
                ${PROC_ACTIONS.map(v=>`<option>${v}</option>`).join('')}
              </select>
              <textarea id="pur-reply-${i}" class="input" rows="2" style="resize:none"
                placeholder="回覆說明（選填）"></textarea>
             </div>`}
      </div>`).join('')
    : `<!-- 向下相容舊格式 -->
      <div style="background:#f9fafb;border-radius:14px;padding:14px;margin-bottom:14px">
        <div style="font-size:16px;font-weight:700;margin-bottom:6px">${p.name}</div>
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
    // 每筆各自回覆
    let hasReply = false;
    items.forEach((item, i) => {
      const action = document.getElementById(`pur-action-${i}`)?.value;
      const reply  = document.getElementById(`pur-reply-${i}`)?.value.trim() || '';
      if (action) { item.procAction=action; item.procReply=reply; item.procStaffName=purUser?.name||''; item.procReplyTime=nowStr(); hasReply=true; }
    });
    if (!hasReply) { errDiv.textContent='請至少回覆一筆異常明細'; errDiv.style.display='block'; return; }
    const allReplied = items.length > 0 && items.every(item=>item.procAction);
    p.defectItems    = items;
    p.procStaffName  = purUser?.name||'';
    p.procReplyTime  = nowStr();
    p.procReplyUnread= true;   // 有回覆即設未讀，通知物流查看
    // 全部回覆完才轉已處理，否則保持待採購
    p.status    = allReplied ? STATUS.RESOLVED : STATUS.PROCUREMENT;
    p.procAction= items.map(it=>it.procAction).filter(Boolean).join('、') || '';
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
      .then(async()=>{ await reloadFromFirestore(arrivalDate); renderPurchaseCards(); renderResolvedCards(); updateBadges(); })
      .catch(e=>console.warn('reply:',e.message));
  } else { saveProductsData(); }
  closeAllSheets();
}

// ══════════════════════════════════════════════════════
// ── 6. 已處理記錄 ──────────────────────────────────────
// ══════════════════════════════════════════════════════
function renderResolvedCards() {
  const container = document.getElementById('resolvedListContainer');
  if (!container) return;
  const from    = document.getElementById('res-from')?.value;
  const to      = document.getElementById('res-to')?.value;
  const catSel    = document.getElementById('res-cat-filter');
  const catFilter = catSel?.value || '';
  if (catSel) {
    const cur = catSel.value;
    catSel.innerHTML = '<option value="">全部大分類</option>' +
      getCatFilters().map(c=>`<option value="${c}" ${cur===c?'selected':''}>${c}</option>`).join('');
  }
  const list = getAllProducts().filter(p=>p.status===STATUS.RESOLVED).filter(p=>
    (!from||p.arrivalDate>=from) && (!to||p.arrivalDate<=to) &&
    (!catFilter||p.cat===catFilter)
  );
  if (!list.length) { container.innerHTML='<div class="empty-state"><p>尚無已處理記錄</p></div>'; return; }
  container.innerHTML = list.map(p => `
    <div class="product-card slide-up" data-status="${p.status}">
      <div class="product-card-inner">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:4px">
          <div style="font-size:15px;font-weight:700;color:#111;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${p.name}</div>
          <span class="badge badge-resolved" style="flex-shrink:0">已處理</span>
        </div>
        <div style="font-size:12px;color:#9ca3af;margin-bottom:6px">${p.arrivalDate||'—'} · ${p.defectTime||'—'}</div>
        ${(p.defectReasons||[]).length>0 ? `<div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px">${p.defectReasons.map(r=>`<span class="badge badge-abnormal" style="font-size:10px">${r}</span>`).join('')}</div>` : ''}
        <div style="padding:8px 10px;background:#d1fae5;border-radius:10px;font-size:14px;font-weight:700;color:#065f46;margin-bottom:6px">${p.procAction||'—'}</div>
        ${p.procReply ? `<div style="font-size:13px;color:#6b7280;margin-bottom:4px">${p.procReply}</div>` : ''}
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
          <div style="font-size:11px;color:#9ca3af">物流：${p.defectStaff||'—'} · 採購：${p.procStaffName||'—'}</div>
          ${(p.photos||[]).length>0 ? `<button onclick="viewResolvedPhotos(${JSON.stringify((p.photos||[]).filter(Boolean)).replace(/"/g,'&quot;')})" style="display:flex;align-items:center;gap:4px;background:#eff6ff;border:1.5px solid #bfdbfe;border-radius:8px;padding:4px 8px;font-size:11px;font-weight:600;color:#2563eb;cursor:pointer;flex-shrink:0">
            <svg style="width:13px;height:13px" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
            照片(${(p.photos||[]).filter(Boolean).length})
          </button>` : ''}
        </div>
      </div>
    </div>`).join('');
}

function viewResolvedPhotos(photos) {
  const body = document.getElementById('resolvedPhotoBody');
  if (!body) return;
  body.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:4px 0">
      ${photos.map((src, i) => `
        <div style="position:relative;border-radius:12px;overflow:hidden;background:#f3f4f6">
          <img src="${src}" onclick="openLightbox('${src}')"
            style="width:100%;aspect-ratio:1;object-fit:cover;cursor:pointer;display:block" />
          <a href="${src}" download="photo_${i+1}.jpg"
            style="position:absolute;bottom:6px;right:6px;background:rgba(0,0,0,.55);border-radius:8px;padding:5px 8px;display:flex;align-items:center;gap:4px;font-size:11px;color:#fff;text-decoration:none">
            <svg style="width:13px;height:13px" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
            下載
          </a>
        </div>`).join('')}
    </div>`;
  openSheet('resolvedPhotoSheet');
}

// ══════════════════════════════════════════════════════
// ── 7. 帳號管理 ────────────────────────────────════════
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
    saveDefectConfig(defectCfg);
    saveCatFilters(catItems);
  } catch(e) { console.warn('admin load:', e.message); }
  renderRoleCards(); renderUserCards(); refreshRoleOptions(); renderBizAttrCards();
  renderDefectCatCards(); renderDefectReasonCards(); renderCatFilterCards();
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
function renderDefectCatCards() {
  const container = document.getElementById('defectCatListContainer');
  if (!container) return;
  const cats = getDefectCategories();
  if (!cats.length) { container.innerHTML='<div style="padding:8px 16px;font-size:13px;color:#9ca3af">尚無分類，請新增</div>'; return; }
  container.innerHTML = `<div style="padding:8px 16px;display:flex;flex-wrap:wrap;gap:8px">
    ${cats.map((c,i) => `
      <div style="display:flex;align-items:center;gap:6px;background:#fef3c7;border:1.5px solid #fde68a;border-radius:20px;padding:6px 12px">
        <span style="font-size:13px;font-weight:600;color:#92400e">${c}</span>
        <button onclick="deleteDefectCategory(${i})" style="background:none;border:none;color:#d97706;cursor:pointer;font-size:14px;line-height:1;padding:0">✕</button>
      </div>`).join('')}
  </div>`;
}

function renderDefectReasonCards() {
  const container = document.getElementById('defectReasonListContainer');
  if (!container) return;
  const reasons = getDefectReasonsList();
  if (!reasons.length) { container.innerHTML='<div style="padding:8px 16px;font-size:13px;color:#9ca3af">尚無原因，請新增</div>'; return; }
  container.innerHTML = `<div style="padding:8px 16px;display:flex;flex-wrap:wrap;gap:8px">
    ${reasons.map((r,i) => `
      <div style="display:flex;align-items:center;gap:6px;background:#fef2f2;border:1.5px solid #fecaca;border-radius:20px;padding:6px 12px">
        <span style="font-size:13px;font-weight:600;color:#991b1b">${r}</span>
        <button onclick="deleteDefectReason(${i})" style="background:none;border:none;color:#ef4444;cursor:pointer;font-size:14px;line-height:1;padding:0">✕</button>
      </div>`).join('')}
  </div>`;
}

async function addDefectCategory() {
  const input = document.getElementById('defectCatInput');
  const name = input?.value.trim();
  if (!name) return;
  const cfg = { categories: [...getDefectCategories(), name], reasons: getDefectReasonsList() };
  saveDefectConfig(cfg);
  try { await DefectConfigAPI.saveCategories(cfg.categories); } catch(e) { console.warn(e.message); }
  input.value = '';
  renderDefectCatCards();
}

async function deleteDefectCategory(idx) {
  if (!confirm('確定刪除此異常分類？')) return;
  const cats = getDefectCategories();
  cats.splice(idx, 1);
  const cfg = { categories: cats, reasons: getDefectReasonsList() };
  saveDefectConfig(cfg);
  try { await DefectConfigAPI.saveCategories(cats); } catch(e) { console.warn(e.message); }
  renderDefectCatCards();
}

async function addDefectReason() {
  const input = document.getElementById('defectReasonInput');
  const name = input?.value.trim();
  if (!name) return;
  const cfg = { categories: getDefectCategories(), reasons: [...getDefectReasonsList(), name] };
  saveDefectConfig(cfg);
  try { await DefectConfigAPI.saveReasons(cfg.reasons); } catch(e) { console.warn(e.message); }
  input.value = '';
  renderDefectReasonCards();
}

async function deleteDefectReason(idx) {
  if (!confirm('確定刪除此異常原因？')) return;
  const reasons = getDefectReasonsList();
  reasons.splice(idx, 1);
  const cfg = { categories: getDefectCategories(), reasons };
  saveDefectConfig(cfg);
  try { await DefectConfigAPI.saveReasons(reasons); } catch(e) { console.warn(e.message); }
  renderDefectReasonCards();
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
    compressImage(file,1000*1024).then(dataUrl=>{
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
      let{width,height}=img;let quality=0.92;
      const tryCompress=()=>{
        canvas.width=width;canvas.height=height;canvas.getContext('2d').drawImage(img,0,0,width,height);
        const dataUrl=canvas.toDataURL('image/jpeg',quality);
        const bytes=Math.round((dataUrl.length-22)*3/4);
        if(bytes<=maxBytes||quality<=0.1){resolve(dataUrl);return;}
        if(quality>0.3){quality-=0.08;tryCompress();}
        else{const s=Math.sqrt(maxBytes/bytes);width=Math.round(width*s);height=Math.round(height*s);quality=0.85;tryCompress();}
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
  const rows=[['到貨日','品號','條碼','品名','規格','採購數量','良品數量','不良品數量','異常原因','照片數','驗收時間']];
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
function exportResolvedExcel() {
  const list=getAllProducts().filter(p=>p.status===STATUS.RESOLVED);
  if(!list.length){alert('尚無已處理記錄');return;}
  if(typeof XLSX==='undefined'){alert('XLSX 未載入');return;}
  const rows=[['日期','連動時間','異常分類','廠商','大分類','商品編號','商品名稱','異常原因','其他說明','物流回覆專員']];
  list.forEach(p=>rows.push([p.arrivalDate,p.defectTime||'',p.defectClass||'其他異常',p.po||'',p.cat||'',p.itemNo,p.name,(p.defectReasons||[]).join('、'),p.defectNote||'',p.defectStaff||'']));
  const wb=XLSX.utils.book_new();const ws=XLSX.utils.aoa_to_sheet(rows);
  ws['!cols']=[10,14,12,14,10,14,20,30,20,12].map(w=>({wch:w}));
  XLSX.utils.book_append_sheet(wb,ws,'已處理記錄');XLSX.writeFile(wb,'商品異常已處理記錄.xlsx');
}
function downloadCsv(rows,filename){
  const bom='﻿';const csv=bom+rows.map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'}));a.download=filename;a.click();
}
