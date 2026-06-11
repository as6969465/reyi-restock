// ── 異常分類與細項（大分類 → 細項清單）──────────────────
const DEFAULT_DEFECT_MAP = {
  '外箱問題': ['外箱無麥頭','外箱嘜頭箱入數不符','外箱嘜頭品號不符','外箱嘜頭品名不符','外箱條碼與商品相同','外箱破損','外箱凹損','外箱濕損','外箱其它問題'],
  '效期問題': ['效期過允收','保不合(保存天數與主檔不符)','無第二效期條件','無效期標示','效期模糊或不完整','外袋無效期，包裝內有多種效期','外袋無效期，包裝內僅看到部份效期','外袋效期與內容物不符','效期用貼紙或手寫或塗改','效期其它問題'],
  '條碼問題': ['條碼不符','條碼無法讀取','未貼條碼','條碼標破損','條碼模糊或不完整','條碼其它問題'],
  '品名規格': ['品名不符或不完整','品名對不到','規格對不到','規格不符','無中標','中標破損','品名規格其它問題'],
  '商品問題': ['凹','破','汙','凹汙','凹破','破汙','凹汙破','瑕疵','生鏽','發霉','有蟲','失真空','多款式','未封口','裸裝','商品混放','商品未綑綁','商品其它問題'],
  '其它問題': ['到錯貨','數量不符','標籤破(污)損或模糊不清','其它異常','臨時到貨']
};
function DEFECT_CATEGORIES() {
  const d = JSON.parse(localStorage.getItem('rr_defect_config') || 'null');
  const map = d?.map || DEFAULT_DEFECT_MAP;
  return Object.keys(map);
}
function DEFECT_REASONS(cat) {
  const d = JSON.parse(localStorage.getItem('rr_defect_config') || 'null');
  const map = d?.map || DEFAULT_DEFECT_MAP;
  return cat ? (map[cat] || []) : Object.values(map).flat();
}
function getDefectMap() {
  const d = JSON.parse(localStorage.getItem('rr_defect_config') || 'null');
  return d?.map || DEFAULT_DEFECT_MAP;
}
const DEFECT_SUB_REASONS = {};
function getDefectDisplay(item) {
  if (!item) return '—';
  if (item.reasons?.length) return `${item.category}・${item.reasons.join('、')}`;
  return item.category || item.reason || '—';
}

// 流程狀態
const STATUS = {
  PENDING:           'pending',          // 待驗收
  RECEIVED:          'received',         // 已驗收（無異常）
  ABNORMAL_PENDING:  'abnormal_pending', // 異常待檢核
  PROCUREMENT:       'procurement',      // 待採購回覆
  RESOLVED:          'resolved'          // 已處理
};

// ── 帳號管理 ─────────────────────────────────────────
const TAB_LABELS = {
  receiving:'當日驗收作業', warehouse:'入庫清單',
  review:'異常檢核', report:'異常紀錄',
  purchase:'待回覆清單'
};

function getUsers()        { return JSON.parse(localStorage.getItem('rr_users') || '[]'); }
function saveUsers(users)  { localStorage.setItem('rr_users', JSON.stringify(users)); }
function getCurrentUser()  { return JSON.parse(sessionStorage.getItem('rr_user') || 'null'); }
function getRoles()        { return JSON.parse(localStorage.getItem('rr_roles') || '[]'); }
function saveRoles(roles)  { localStorage.setItem('rr_roles', JSON.stringify(roles)); }

function getRoleById(roleId) {
  if (roleId === 'admin')   return { id:'admin',   name:'管理員', tabs: Object.keys(TAB_LABELS) };
  if (roleId === 'pending') return { id:'pending', name:'待審核', tabs: [] };
  return getRoles().find(r => r.id === roleId) || null;
}
function getRoleName(roleId) { return getRoleById(roleId)?.name || roleId; }
function getRoleColor(roleId) {
  if (roleId === 'admin')   return 'bg-purple-100 text-purple-700';
  if (roleId === 'pending') return 'bg-gray-100 text-gray-500';
  const colors = ['bg-green-100 text-green-700','bg-orange-100 text-orange-700','bg-blue-100 text-blue-700','bg-teal-100 text-teal-700','bg-pink-100 text-pink-700'];
  const idx = getRoles().findIndex(r => r.id === roleId);
  return colors[idx % colors.length] || 'bg-gray-100 text-gray-600';
}

function initAdmin() {
  const users = getUsers();
  if (!users.find(u => u.userId === 'reyi')) {
    users.unshift({ userId:'reyi', password:'', name:'管理員', role:'admin', createdAt: new Date().toLocaleString('zh-TW') });
    saveUsers(users);
  }
}

// ── 全域狀態 ──────────────────────────────────────────
let productsByDate = {};
let currentRole    = 'field';
let _deskCurrentTab = 'receiving';
let _deskRealtimeUnsub = null;
// ── 已到貨標記（桌電版）─────────────────────────────
const _deskArrivedSet = new Set();
function _deskArrivedKey(date, origIdx) { return `${date}__${origIdx}`; }
function toggleDeskArrived(date, origIdx) {
  const key = _deskArrivedKey(date, origIdx);
  if (_deskArrivedSet.has(key)) _deskArrivedSet.delete(key); else _deskArrivedSet.add(key);
  renderProductTable(); updateStats();
}

let _deskReceivingKw = '';
function onDeskReceivingSearch(val) {
  _deskReceivingKw = (val || '').trim();
  const clearBtn = document.getElementById('deskReceivingSearchClear');
  if (clearBtn) clearBtn.classList.toggle('hidden', !_deskReceivingKw);
  renderProductTable();
}
function clearDeskReceivingSearch() {
  _deskReceivingKw = '';
  const input = document.getElementById('deskReceivingSearch');
  if (input) input.value = '';
  document.getElementById('deskReceivingSearchClear')?.classList.add('hidden');
  renderProductTable();
}
let _deskSyncTimer = null;
let currentIdx     = null;
let reviewIdx      = null;
let purchaseIdx    = null;
let editUserIdx    = null;
let uploadedPhotos = [];
let _deskDefectItems = []; // 桌機版：異常明細 [{photos:[{src,procAction,procReply,procStaffName}], qty, category, reasons[], note}]
let _activeDeskDefectIdx = 0;
let _photoList = [], _photoIdx = 0;
let _reviewStartTime = '';

// ── 業務屬性 ──────────────────────────────────────────
function getBizAttrs() { return JSON.parse(localStorage.getItem('rr_biz_attrs') || '[]'); }
function saveBizAttrs(attrs) { localStorage.setItem('rr_biz_attrs', JSON.stringify(attrs)); }

// ── 異常設定（桌電版）────────────────────────────────
function getDeskDefectMap() { return getDefectMap(); }
function getDeskDefectCategories() { return DEFECT_CATEGORIES(); }
function getDeskDefectReasons(cat) { return DEFECT_REASONS(cat); }
function saveDeskDefectConfig(cfg) {
  if (cfg.map) localStorage.setItem('rr_defect_config', JSON.stringify({ map: cfg.map }));
}
async function loadDeskDefectConfig() {
  try { const cfg=await DefectConfigAPI.get(); if(cfg?.map) saveDeskDefectConfig({ map: cfg.map }); } catch(e) {}
}

// ── 大分類篩選選項（桌電版）──────────────────────────
const _DEF_CAT_FILTERS = ['食品','居家美妝','預購項目'];
function getDeskCatFilters() { const d=JSON.parse(localStorage.getItem('rr_cat_filters')||'null'); return d||_DEF_CAT_FILTERS; }
function saveDeskCatFilters(items) { localStorage.setItem('rr_cat_filters', JSON.stringify(items||null)); }
async function loadBizAttrs() {
  try {
    const attrs = await BizAttrAPI.list();
    saveBizAttrs(attrs);
    return attrs;
  } catch(e) { return getBizAttrs(); }
}


function nowHHMM() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

function getDateProducts(date)  { return productsByDate[date] || []; }
function getAllProducts()        { return Object.values(productsByDate).flat(); }
function currentReceivingDate() { return document.getElementById('receivingDate')?.value || ''; }
function saveProductsData()     { localStorage.setItem('rr_products', JSON.stringify(productsByDate)); }
function loadProductsData()     { productsByDate = JSON.parse(localStorage.getItem('rr_products') || '{}'); }

// ── 登入 (index.html) ─────────────────────────────────
async function handleLogin(e) {
  e.preventDefault();
  const btn    = document.getElementById('loginBtn');
  const errDiv = document.getElementById('loginError');
  const userId = document.getElementById('userId').value.trim();
  const password = document.getElementById('password').value;
  btn.disabled = true; btn.textContent = '驗證中…'; errDiv.classList.add('hidden');
  try {
    const user = await AuthAPI.login(userId, password);
    sessionStorage.setItem('rr_user', JSON.stringify(user));
    // 顯示版本選擇 Modal
    const modal = document.getElementById('versionModal');
    if (modal) { modal.style.display = 'flex'; }
    else { window.location.href = 'main.html'; }
  } catch(e) {
    errDiv.textContent = e.message || '登入失敗，請稍後再試';
    errDiv.classList.remove('hidden');
  } finally { btn.disabled = false; btn.textContent = '登入'; }
}
function showError(el, msg) { el.textContent = msg; el.classList.remove('hidden'); }

// ── 主頁初始化 ────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  if (!document.getElementById('productTableBody')) return;



  // 先嘗試從 session 取得使用者資訊（重整時用 /api/auth/me 驗證）
  let user = getCurrentUser();
  if (!user) {
    try { user = await AuthAPI.me(); sessionStorage.setItem('rr_user', JSON.stringify(user)); }
    catch(e) { window.location.replace('index.html'); return; }
  }

  currentRole = user.roleId || user.role;
  document.getElementById('userDisplay').textContent = user.name;
  document.getElementById('roleDisplay').textContent = user.roleName || getRoleName(currentRole);

  // 設定今日日期，再從 API 取得有資料的最近日期
  const today = new Date().toLocaleDateString('sv-SE');
  document.getElementById('receivingDate').value = today;

  try {
    const dates = await ProductAPI.getDates();
    if (dates && dates.length > 0) {
      const best = dates.includes(today) ? today : dates[0];
      document.getElementById('receivingDate').value = best;
      // 預載當日資料到 productsByDate
      const items = await ProductAPI.getByDate(best);
      productsByDate[best] = normalizeProducts(items);
    }
  } catch(e) { console.error('載入進貨資料失敗', e.message); }

  initTabsByRole(currentRole);
  renderPhotoSlots();

  // 背景載入設定（roles / bizAttrs / defectConfig / catFilters）
  // 新電腦 localStorage 空時確保資料從 Firestore 取回，完成後重繪頁籤
  Promise.all([
    RoleAPI.list().then(r => { if (r?.length) saveRoles(r); }).catch(()=>{}),
    BizAttrAPI.list().then(a => { if (a?.length) saveBizAttrs(a); }).catch(()=>{}),
    DefectConfigAPI.get().then(c => { if (c?.map) saveDeskDefectConfig({ map: c.map }); }).catch(()=>{}),
    CatFilterAPI.get().then(f => { if (f) saveDeskCatFilters(f); }).catch(()=>{})
  ]).then(() => {
    // 重新初始化頁籤（有了 roles 資料後重算可見頁籤）
    initTabsByRole(currentRole);
    // 重繪當前頁籤以套用最新設定
    rerenderDeskCurrentView();
  }).catch(()=>{});

  // 啟動即時同步監聽
  startDeskRealtimeSync();

  // 驗證完成，移除 Loading 遮罩
  const loading = document.getElementById('authLoading');
  if (loading) loading.remove();
});

function logout() {
  if (_deskRealtimeUnsub) { _deskRealtimeUnsub(); _deskRealtimeUnsub = null; }
  AuthAPI.logout().catch(()=>{});
  sessionStorage.clear();
  window.location.href = 'index.html';
}

// ── 即時同步（onSnapshot）────────────────────────────
function isDeskModalOpen() {
  return ['receiveModal','reviewModal','purchaseModal','bizAttrModal'].some(id => {
    const el = document.getElementById(id);
    return el && !el.classList.contains('hidden');
  });
}

function rerenderDeskCurrentView() {
  if (isDeskModalOpen()) return; // 有 Modal 開啟，不打斷使用者
  if (_deskCurrentTab === 'receiving')     { renderProductTable(); updateStats(); }
  else if (_deskCurrentTab === 'warehouse') renderWarehouseTable();
  else if (_deskCurrentTab === 'review')    renderReviewTable();
  else if (_deskCurrentTab === 'report')    renderReportTable();
  else if (_deskCurrentTab === 'purchase')  renderPurchaseTable();
  updateBadges();
}

let _deskSyncReady = false;
let _deskSyncSuppressUntil = 0;
function suppressDeskSyncRender(ms = 3000) { _deskSyncSuppressUntil = Date.now() + ms; }

function startDeskRealtimeSync() {
  if (_deskRealtimeUnsub) { _deskRealtimeUnsub(); _deskRealtimeUnsub = null; }
  _deskSyncReady = false;
  _deskRealtimeUnsub = db.collection('products').onSnapshot(snapshot => {
    // 跳過初始 snapshot（資料已手動載入）
    if (!_deskSyncReady) { _deskSyncReady = true; return; }
    let changed = false;
    snapshot.docChanges().forEach(change => {
      const date = change.doc.data()?.arrival_date;
      if (!date) return;
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
    clearTimeout(_deskSyncTimer);
    _deskSyncTimer = setTimeout(() => {
      if (Date.now() < _deskSyncSuppressUntil) return;
      rerenderDeskCurrentView();
    }, 1000);
  }, err => console.warn('desk realtime sync err:', err.message));
}

// 將後端格式轉為前端格式
function normalizeProducts(items) {
  return (items || []).map(p => ({
    id:             p.id,
    seq:            p.seq,
    po:             p.po || '',
    cat:            p.cat || '',
    barcode:        p.barcode || '',
    itemNo:         p.item_no || '',
    name:           p.name || '',
    spec:           p.spec || '',
    period:         p.period || '',
    qty:            p.qty || 0,
    arrivalDate:    p.arrival_date || '',
    isManual:       !!p.is_manual,
    status:         p.status || 'pending',
    received:       !!p.received,
    goodQty:        p.good_qty || 0,
    badQty:         p.bad_qty || 0,
    defectTime:     p.defect_time || '',
    defectClass:    p.defect_class || '其他異常',
    defectReasons:  p.defect_reasons || [],
    defectNote:     p.defect_note || '',
    defectStaff:    p.defect_staff || '',
    procContact:    p.proc_contact || '',
    procAction:     p.proc_action || '',
    procReply:      p.proc_reply || '',
    procReplyTime:  p.proc_reply_time || '',
    procStaffName:  p.proc_staff_name || '',
    operatorName:   p.operator_name || '',
    photos:         p.photos || [],
    defectItems:    p.defect_items || p.defectItems || [],
    procReplyUnread: !!(p.proc_reply_unread || p.procReplyUnread),
    bizAttr:        p.biz_attr || p.bizAttr || '',
    time:           p.recv_time || ''
  }));
}

// ── 依角色初始化頁籤 ─────────────────────────────────
function initTabsByRole(roleId) {
  const roleObj = getRoleById(roleId);
  // 新電腦 localStorage 空時，用 session 內的 tabs 作為 fallback（登入時伺服器回傳）
  const sessionUser = getCurrentUser();
  const allowedTabs = roleId === 'admin'
    ? Object.keys(TAB_LABELS)
    : (roleObj?.tabs || sessionUser?.tabs || []);

  // 管理員顯示所有頁籤；其他角色依設定顯示
  ALL_PAGES.forEach(t => {
    const btn = document.getElementById(`tab-${t}`);
    if (!btn) return;
    if (t === 'admin') {
      btn.classList.toggle('hidden', roleId !== 'admin');
    } else {
      btn.classList.toggle('hidden', roleId !== 'admin' && !allowedTabs.includes(t));
    }
  });

  // 切換至上次頁籤（若有權限），否則切至第一個可用頁籤
  const savedTab = localStorage.getItem('rr_last_tab');
  const defaultTab = roleId === 'admin' ? 'receiving' : (allowedTabs[0] || 'receiving');
  const firstTab = (savedTab && (roleId==='admin' || allowedTabs.includes(savedTab))) ? savedTab : defaultTab;
  switchTab(firstTab);
}

// ── Tab 切換 ──────────────────────────────────────────
const ALL_PAGES = ['receiving','warehouse','review','report','purchase','admin'];
function switchTab(name) {
  _deskCurrentTab = name;
  localStorage.setItem('rr_last_tab', name);
  ALL_PAGES.forEach(t => {
    document.getElementById(`page-${t}`)?.classList.toggle('hidden', t !== name);
    const btn = document.getElementById(`tab-${t}`);
    if (!btn) return;
    if (t === name) { btn.classList.add('border-blue-600','text-blue-600'); btn.classList.remove('border-transparent','text-gray-500'); }
    else            { btn.classList.remove('border-blue-600','text-blue-600'); btn.classList.add('border-transparent','text-gray-500'); }
  });
  const gdf = document.getElementById('globalDateFilter');
  if (name === 'receiving') { gdf.classList.add('hidden'); gdf.classList.remove('flex'); renderProductTable(); updateStats(); }
  else { gdf.classList.remove('hidden'); gdf.classList.add('flex'); }
  if (name === 'warehouse') renderWarehouseTable();
  if (name === 'review')    renderReviewTable();
  if (name === 'report')    renderReportTable();
  if (name === 'purchase')  renderPurchaseTable();
  if (name === 'admin')     { loadAndRenderAdmin(); }
}

// ── 匯入 Excel ────────────────────────────────────────
function importExcel(input) {
  const file = input.files[0]; if (!file) return;
  const selectedDate = currentReceivingDate();
  const reader = new FileReader();
  reader.onload = async e => {
    try {
      const wb   = XLSX.read(e.target.result, { type: 'binary' });
      const sName = wb.SheetNames.find(s => s.includes('明細') || s.includes('2')) || wb.SheetNames[0];
      const ws   = wb.Sheets[sName];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
      let hRow = -1;
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i].map(String);
        if (r.includes('序') || r.some(c => c.includes('採購單號'))) { hRow = i; break; }
      }
      if (hRow < 0) { alert('找不到欄位標題'); return; }
      const headers = rows[hRow].map(String);
      const idx = {
        seq: headers.findIndex(h => h === '序'),
        po:  headers.findIndex(h => h.includes('採購單號')),
        cat: headers.findIndex(h => h.includes('大分類')),
        barcode: headers.findIndex(h => h.includes('條碼')),
        itemNo:  headers.findIndex(h => h === '品號'),
        name:    headers.findIndex(h => h === '品名'),
        spec:    headers.findIndex(h => h.includes('規格')),
        period:  headers.findIndex(h => h.includes('期數')),
        qty:     headers.findIndex(h => h.includes('採購數量')),
        arrival: headers.findIndex(h => h.includes('到貨日'))
      };
      const parsed = [];
      for (let i = hRow + 1; i < rows.length; i++) {
        const r = rows[i];
        const seq = r[idx.seq];
        if (!seq || String(seq).trim() === '') continue;
        const rawDate = r[idx.arrival];
        let arrivalDate = '';
        if (rawDate) {
          const d = new Date(rawDate);
          if (!isNaN(d)) arrivalDate = d.toISOString().slice(0,10);
          else {
            const s = String(rawDate).replace(/\//g,'-');
            if (/^\d{4}-\d{2}-\d{2}$/.test(s)) arrivalDate = s;
            else if (/^\d{7}$/.test(s)) { const y = parseInt(s.slice(0,3))+1911; arrivalDate = `${y}-${s.slice(3,5)}-${s.slice(5,7)}`; }
          }
        }
        parsed.push({
          seq, po: r[idx.po]||'', cat: r[idx.cat]||'', barcode: r[idx.barcode]||'',
          itemNo: r[idx.itemNo]||'', name: r[idx.name]||'', spec: r[idx.spec]||'',
          period: r[idx.period]||'', qty: Number(r[idx.qty])||0, arrivalDate,
          status: STATUS.PENDING,
          received: false, goodQty: 0, badQty: 0,
          defectTime:'', defectClass:'其他異常', defectReasons:[], defectNote:'', defectStaff:'',
          procContact:'', procReply:'', procAction:'', procReplyTime:'',
          photos:[], time:''
        });
      }
      parsed.forEach(p => {
        const key = p.arrivalDate || selectedDate || 'unknown';
        if (!productsByDate[key]) productsByDate[key] = [];
        const exists = productsByDate[key].some(x => x.itemNo === p.itemNo && x.po === p.po);
        if (!exists) productsByDate[key].push(p);
      });
      const dateInput = document.getElementById('receivingDate');
      if (!getDateProducts(dateInput.value).length && parsed.length > 0) {
        const top = Object.entries(productsByDate).sort((a,b)=>b[1].length-a[1].length)[0]?.[0];
        if (top) dateInput.value = top;
      }
      const dates = [...new Set(parsed.map(p=>p.arrivalDate).filter(Boolean))].sort();
      document.getElementById('importStatus').textContent = `已載入 ${parsed.length} 筆 · ${dates.join('、')||file.name}`;
      // 儲存到 Firestore，再重載確保多台同步
      const importDate = document.getElementById('receivingDate').value;
      try {
        const result = await ProductAPI.importItems(parsed, importDate);
        document.getElementById('importStatus').textContent += ` (入庫 ${result?.inserted || 0} 筆)`;
      } catch(apiErr) {
        console.warn('Firestore 匯入失敗:', apiErr.message);
      }
      // 無論成功與否，從 Firestore 重載最新資料
      await reloadFromFirestore(importDate);
      renderProductTable(); updateStats();
    } catch(err) { alert('匯入失敗：'+err.message); }
  };
  reader.readAsBinaryString(file);
  input.value = '';
}

// ── Firestore 重載（確保多台電腦資料同步）────────────────
async function reloadFromFirestore(date) {
  try {
    const key  = date || currentReceivingDate();
    const prev = productsByDate[key] || [];
    const loaded = normalizeProducts(await ProductAPI.getByDate(key));
    // 若 Firestore 沒有 defectItems，從本機補回
    loaded.forEach(p => {
      if (!p.defectItems?.length) {
        const local = prev.find(x => x.id === p.id || (x.itemNo === p.itemNo && x.po === p.po));
        if (local?.defectItems?.length) p.defectItems = local.defectItems;
      }
    });
    productsByDate[key] = loaded;
  } catch(e) { console.warn('Firestore reload failed:', e.message); }
}

// ── 日期篩選 ──────────────────────────────────────────
async function onReceivingDateChange() {
  const date = currentReceivingDate();
  // 每次切換日期都從 Firestore 取最新資料（不用 localStorage 快取）
  await reloadFromFirestore(date);
  renderProductTable(); updateStats();
}
function applyDateFilter() {
  const t = getCurrentTab();
  if (t==='warehouse') renderWarehouseTable();
  else if (t==='review') renderReviewTable();
  else if (t==='report') renderReportTable();
  else if (t==='purchase') renderPurchaseTable();
}
function clearDateFilter() { document.getElementById('filterDateFrom').value=''; document.getElementById('filterDateTo').value=''; applyDateFilter(); }
function getCurrentTab() {
  return ALL_PAGES.find(t => !document.getElementById(`page-${t}`)?.classList.contains('hidden')) || 'receiving';
}
function getFilteredAllProducts() {
  const from = document.getElementById('filterDateFrom')?.value;
  const to   = document.getElementById('filterDateTo')?.value;
  const all  = getAllProducts();
  if (!from && !to) return all;
  return all.filter(p => {
    if (!p.arrivalDate) return true;
    if (from && p.arrivalDate < from) return false;
    if (to   && p.arrivalDate > to)   return false;
    return true;
  });
}

// ── 狀態徽章 ─────────────────────────────────────────
function statusBadge(status) {
  const map = {
    [STATUS.PENDING]:          '<span class="badge badge-pending">待確認</span>',
    [STATUS.RECEIVED]:         '<span class="badge badge-done">已確認</span>',
    [STATUS.ABNORMAL_PENDING]: '<span class="badge badge-abnormal">異常待檢核</span>',
    [STATUS.PROCUREMENT]:      '<span class="badge" style="background:#dbeafe;color:#1d4ed8">待採購回覆</span>',
    [STATUS.RESOLVED]:         '<span class="badge" style="background:#d1fae5;color:#065f46">已處理</span>',
  };
  return map[status] || '';
}

// ── 1. 驗收作業表格 ───────────────────────────────────
function renderProductTable() {
  const tbody = document.getElementById('productTableBody');
  const date  = currentReceivingDate();
  const kw    = _deskReceivingKw.toLowerCase();
  const allProducts = getDateProducts(date);
  const list  = allProducts
    .map((p, origIdx) => ({ p, origIdx }))
    .filter(({ p }) => !kw || [p.po, p.itemNo, p.name, p.barcode]
      .some(v => (v||'').toLowerCase().includes(kw)));
  if (!list.length) {
    const msg = kw
      ? `找不到符合「${kw}」的商品`
      : (date ? `${date} 尚無進貨資料，請匯入 Excel` : '請選擇日期並匯入 Excel');
    tbody.innerHTML = `<tr><td colspan="12" class="px-4 py-16 text-center text-gray-400">
      <div class="flex flex-col items-center gap-2">
        <svg class="w-10 h-10 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
        </svg><span class="text-sm">${msg}</span></div></td></tr>`;
    return;
  }
  tbody.innerHTML = list.map(({ p, origIdx }) => {
    const arrived = p.status === STATUS.PENDING && _deskArrivedSet.has(_deskArrivedKey(date, origIdx));
    const rowCls  = p.status !== STATUS.PENDING
      ? 'received-row border-b border-gray-100'
      : arrived
        ? 'border-b border-green-200 bg-green-50'
        : 'hover:bg-gray-50 border-b border-gray-100';
    return `
    <tr class="${rowCls}">
      <td class="px-4 py-3"><input type="checkbox" data-idx="${origIdx}" onchange="onRowCheck()" class="row-check accent-blue-600 w-4 h-4 cursor-pointer" /></td>
      <td class="px-4 py-3 text-gray-500">${p.seq}</td>
      <td class="px-4 py-3 font-mono text-xs">${p.po}</td>
      <td class="px-4 py-3">${p.cat}</td>
      <td class="px-4 py-3 text-center">
        ${p.barcode
          ? `<div style="display:flex;flex-direction:column;align-items:center">
               <svg class="barcode-svg" data-barcode="${p.barcode}" style="height:32px"></svg>
               <span class="font-mono text-xs text-gray-500">${p.barcode}</span>
             </div>`
          : '<span class="text-gray-400 text-xs">—</span>'}
      </td>
      <td class="px-4 py-3 font-mono text-xs">${p.itemNo}</td>
      <td class="px-4 py-3 font-medium">${p.name}</td>
      <td class="px-4 py-3 text-gray-500 text-xs w-24 max-w-[96px] truncate" title="${p.spec}">${p.spec}</td>
      <td class="px-4 py-3">${p.period}</td>
      <td class="px-4 py-3 text-right font-medium">${p.qty}</td>
      <td class="px-4 py-3 text-center">
        ${statusBadge(p.status)}
        ${p.isManual ? '<span class="badge ml-1" style="background:#fef3c7;color:#92400e">臨時</span>' : ''}
      </td>
      <td class="px-4 py-3 text-center">
        ${p.status === STATUS.PENDING
          ? `<div class="flex items-center gap-1 justify-center">
               <button onclick="toggleDeskArrived('${date}',${origIdx})"
                 class="${arrived
                   ? 'bg-green-100 border border-green-400 text-green-700 hover:bg-green-200'
                   : 'bg-gray-100 border border-gray-300 text-gray-600 hover:bg-gray-200'} text-xs px-2.5 py-1.5 rounded-lg font-medium transition-colors">
                 ${arrived ? '✓ 已到貨' : '已到貨'}
               </button>
               ${arrived ? `<button onclick="startDesktopReceiving('${date}',${origIdx})"
                 class="bg-blue-600 hover:bg-blue-700 text-white text-xs px-3 py-1.5 rounded-lg">確認</button>` : ''}
             </div>`
          : p.status === STATUS.RESOLVED
            ? '<span class="text-xs text-gray-400">已處理</span>'
            : `<button onclick="openModal('${date}',${origIdx})" class="bg-gray-200 hover:bg-gray-300 text-gray-600 text-xs px-3 py-1.5 rounded-lg">修改</button>`}
      </td>
    </tr>`;
  }).join('');

  // 渲染一維條碼（等待 JsBarcode CDN 載入）
  const renderBarcodes = () => {
    document.querySelectorAll('.barcode-svg').forEach(svg => {
      try {
        JsBarcode(svg, svg.dataset.barcode, { format:'CODE128', displayValue:false, width:1, height:32, margin:1, lineColor:'#374151' });
      } catch(e) { svg.style.display='none'; }
    });
  };
  if (typeof JsBarcode !== 'undefined') {
    renderBarcodes();
  } else {
    const wait = setInterval(() => { if (typeof JsBarcode !== 'undefined') { clearInterval(wait); renderBarcodes(); } }, 100);
  }
}

// ── 手動新增臨時到貨 ──────────────────────────────────
function openManualAddModal() {
  ['ma-po','ma-cat','ma-barcode','ma-itemNo','ma-name','ma-spec'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('ma-qty').value = '';
  document.getElementById('manualAddError').classList.add('hidden');
  document.getElementById('manualAddModal').classList.remove('hidden');
}
function closeManualAddModal() { document.getElementById('manualAddModal').classList.add('hidden'); }

async function saveManualAdd() {
  const errDiv = document.getElementById('manualAddError');
  errDiv.classList.add('hidden');
  const name = document.getElementById('ma-name').value.trim();
  const qty  = parseInt(document.getElementById('ma-qty').value) || 0;
  if (!name) { errDiv.textContent='請輸入品名'; errDiv.classList.remove('hidden'); return; }
  if (qty <= 0) { errDiv.textContent='請輸入採購數量'; errDiv.classList.remove('hidden'); return; }

  const date = currentReceivingDate() || new Date().toLocaleDateString('sv-SE');
  if (!productsByDate[date]) productsByDate[date] = [];
  const list = productsByDate[date];
  const seq  = list.length + 1;

  list.push({
    seq,
    po:          document.getElementById('ma-po').value.trim(),
    cat:         document.getElementById('ma-cat').value.trim(),
    barcode:     document.getElementById('ma-barcode').value.trim(),
    itemNo:      document.getElementById('ma-itemNo').value.trim(),
    name,
    spec:        document.getElementById('ma-spec').value.trim(),
    period:      '',
    qty,
    arrivalDate: date,
    isManual:    true,   // 臨時到貨標記
    status:      STATUS.PENDING,
    received:    false,
    goodQty:     0,
    badQty:      0,
    defectTime:  '', defectClass:'其他異常', defectReasons:[], defectNote:'', defectStaff:'',
    photos:      [],
    time:        ''
  });

  // 儲存到 Firestore
  try {
    await ProductAPI.create({
      arrivalDate: date, seq, po: document.getElementById('ma-po').value.trim(),
      cat: document.getElementById('ma-cat').value.trim(),
      barcode: document.getElementById('ma-barcode').value.trim(),
      itemNo: document.getElementById('ma-itemNo').value.trim(),
      name, spec: document.getElementById('ma-spec').value.trim(), qty
    });
  } catch(e) { console.warn('Firestore create failed:', e.message); }
  // 重載確保同步
  await reloadFromFirestore(date);
  closeManualAddModal();
  renderProductTable();
  updateStats();
}

// ── 勾選刪除 ─────────────────────────────────────────
function toggleCheckAll(master) {
  document.querySelectorAll('.row-check').forEach(cb => cb.checked = master.checked);
  syncDeleteBtn();
}
function onRowCheck() {
  const all   = document.querySelectorAll('.row-check');
  const checked = document.querySelectorAll('.row-check:checked');
  const master = document.getElementById('checkAll');
  if (master) master.checked = all.length > 0 && checked.length === all.length;
  syncDeleteBtn();
}
function syncDeleteBtn() {
  const btn = document.getElementById('deleteSelectedBtn');
  if (!btn) return;
  const count = document.querySelectorAll('.row-check:checked').length;
  btn.classList.toggle('hidden', count === 0);
  btn.textContent = count > 0 ? `刪除勾選（${count}）` : '';
}
async function deleteSelected() {
  const date = currentReceivingDate();
  const checkedIdxs = [...document.querySelectorAll('.row-check:checked')].map(cb => parseInt(cb.dataset.idx));
  if (!checkedIdxs.length) return;
  if (!confirm(`確定刪除選取的 ${checkedIdxs.length} 筆資料？`)) return;
  const list = getDateProducts(date);
  // 收集 Firestore ID
  const firestoreIds = checkedIdxs.map(i => list[i]?.id).filter(Boolean);
  // 從後往前刪本機記憶體
  checkedIdxs.sort((a,b) => b-a).forEach(i => list.splice(i,1));
  productsByDate[date] = list;
  // 同步刪除 Firestore
  if (firestoreIds.length) {
    try {
      await ProductAPI.batchDelete(firestoreIds);
    } catch(e) { console.warn('Firestore delete failed:', e.message); }
  }
  saveProductsData();
  const master = document.getElementById('checkAll');
  if (master) master.checked = false;
  // 重載確保同步
  await reloadFromFirestore(date);
  renderProductTable(); updateStats();
}

function updateStats() {
  const date = currentReceivingDate();
  const list = getDateProducts(date);
  const arrived    = list.filter((p,i) => _deskArrivedSet.has(_deskArrivedKey(date, i))).length;
  const notArrived = list.filter((p,i) => p.status === STATUS.PENDING && !_deskArrivedSet.has(_deskArrivedKey(date, i))).length;
  const sv = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  sv('stat-total',    list.length);
  sv('stat-arrived',  arrived);
  sv('stat-done',     list.filter(p => p.status !== STATUS.PENDING).length);
  sv('stat-pending',  notArrived);
  sv('stat-abnormal', list.filter(p => [STATUS.ABNORMAL_PENDING, STATUS.PROCUREMENT, STATUS.RESOLVED].includes(p.status)).length);
}

// ── 2. 入庫清單 ───────────────────────────────────────
function renderWarehouseTable() {
  const tbody = document.getElementById('warehouseTableBody');
  // 填充業務屬性篩選下拉
  const bizSel = document.getElementById('wh-biz-filter');
  if (bizSel) {
    const attrs  = getBizAttrs();
    const curVal = bizSel.value;
    bizSel.innerHTML = '<option value="">全部</option>' +
      attrs.map(a=>`<option value="${a.name}" ${curVal===a.name?'selected':''}>${a.name}</option>`).join('');
  }
  const bizFilter = bizSel?.value || '';
  let list = getFilteredAllProducts().filter(p => p.status !== STATUS.PENDING);
  if (bizFilter) list = list.filter(p => p.bizAttr === bizFilter);
  if (!list.length) { tbody.innerHTML='<tr><td colspan="10" class="px-4 py-12 text-center text-gray-400 text-sm">尚無已確認資料</td></tr>'; return; }
  tbody.innerHTML = list.map(p => {
    const hasReply = p.badQty > 0 && ((p.defectItems||[]).some(it=>it.procAction)||(p.procAction&&p.procAction!=='—'));
    return `
    <tr class="border-b border-gray-100 hover:bg-gray-50">
      <td class="px-4 py-3 text-xs text-gray-400">${p.arrivalDate||'—'}</td>
      <td class="px-4 py-3 text-xs">
        ${p.bizAttr ? `<span class="bg-blue-50 text-blue-600 border border-blue-200 px-2 py-0.5 rounded-full text-xs font-medium">${p.bizAttr}</span>` : '<span class="text-gray-400">—</span>'}
      </td>
      <td class="px-4 py-3 font-mono text-xs">${p.itemNo}</td>
      <td class="px-4 py-3 font-mono text-xs">${p.barcode}</td>
      <td class="px-4 py-3 font-medium">${p.name}</td>
      <td class="px-4 py-3 text-center">${p.qty}</td>
      <td class="px-4 py-3 text-center text-green-600 font-medium">${p.goodQty}</td>
      <td class="px-4 py-3 text-center ${p.badQty>0?'text-red-500 font-medium':'text-gray-400'}">${p.badQty}</td>
      <td class="px-4 py-3 text-center">
        ${p.badQty > 0
          ? (hasReply
              ? `<button onclick="openReplyDetailModal('${p.arrivalDate}','${p.itemNo}')"
                  class="bg-green-600 hover:bg-green-700 text-white text-xs px-3 py-1.5 rounded-lg">查看回覆</button>`
              : `<span class="text-amber-500 text-xs font-medium">待採購回覆</span>`)
          : '<span class="text-gray-400 text-xs">—</span>'}
      </td>
      <td class="px-4 py-3 text-xs text-gray-500">${p.time}</td>
    </tr>`;
  }).join('');
}

// ── 3. 異常檢核 (物流專員) ────────────────────────────
function renderReviewTable() {
  const tbody = document.getElementById('reviewTableBody');
  const list  = getFilteredAllProducts().filter(p => p.badQty > 0);
  const pending = list.filter(p => p.status === STATUS.ABNORMAL_PENDING).length;
  const proc    = list.filter(p => p.status === STATUS.PROCUREMENT).length;
  const done    = list.filter(p => p.status === STATUS.RESOLVED).length;
  document.getElementById('rev-stat-pending').textContent = pending;
  document.getElementById('rev-stat-proc').textContent    = proc;
  document.getElementById('rev-stat-done').textContent    = done;
  updateBadges();
  if (!list.length) { tbody.innerHTML='<tr><td colspan="9" class="px-4 py-12 text-center text-gray-400 text-sm">尚無異常資料</td></tr>'; return; }
  tbody.innerHTML = list.map(p => {
    const isReviewed = [STATUS.PROCUREMENT, STATUS.RESOLVED].includes(p.status);
    return `<tr class="border-b border-gray-100 hover:bg-gray-50">
      <td class="px-4 py-3 text-xs text-gray-400">${p.arrivalDate||'—'}</td>
      <td class="px-4 py-3 font-mono text-xs">${p.itemNo}</td>
      <td class="px-4 py-3 font-medium">${p.name}</td>
      <td class="px-4 py-3 text-xs">${p.cat}</td>
      <td class="px-4 py-3 text-right">${p.qty}</td>
      <td class="px-4 py-3 text-right text-red-500 font-medium">${p.badQty}</td>
      <td class="px-4 py-3 text-center">${p.photos.length>0 ? `<span class="text-blue-600 text-xs cursor-pointer" onclick="viewPhotos('${p.arrivalDate}','${p.itemNo}')">${p.photos.length} 張</span>` : '<span class="text-gray-400 text-xs">無</span>'}</td>
      <td class="px-4 py-3 text-center">${statusBadge(p.status)}</td>
      <td class="px-4 py-3 text-center">
        ${p.status === STATUS.RESOLVED
          ? '<span class="text-xs text-gray-400">已處理</span>'
          : !isReviewed
            ? `<button onclick="openReviewModal('${p.arrivalDate}','${p.itemNo}')" class="bg-orange-500 hover:bg-orange-600 text-white text-xs px-3 py-1.5 rounded-lg">檢核</button>`
            : `<button onclick="openReviewModal('${p.arrivalDate}','${p.itemNo}')" class="bg-gray-200 hover:bg-gray-300 text-gray-600 text-xs px-3 py-1.5 rounded-lg">檢視</button>`}
      </td>
    </tr>`;
  }).join('');
}

// ── 4. 異常報表 ───────────────────────────────────────
function renderReportTable() {
  const tbody = document.getElementById('reportTableBody');
  const list  = getFilteredAllProducts().filter(p => p.badQty > 0);
  if (!list.length) { tbody.innerHTML='<tr><td colspan="11" class="px-4 py-12 text-center text-gray-400 text-sm">尚無異常記錄</td></tr>'; return; }
  const hasReplyBtn = p => (p.defectItems||[]).some(it=>it.procAction) || (p.procAction && p.procAction!=='—');
  tbody.innerHTML = list.map(p => `
    <tr class="border-b border-gray-100 hover:bg-red-50" style="${p.procReplyUnread?'background:#f3f4f6':''}">
      <td class="px-4 py-3 text-xs text-gray-500">${p.arrivalDate||'—'}</td>
      <td class="px-4 py-3 text-xs text-gray-500">${p.defectTime||'—'}</td>
      <td class="px-4 py-3"><span class="bg-red-100 text-red-700 px-2 py-0.5 rounded-full text-xs">${p.defectClass||'其他異常'}</span></td>
      <td class="px-4 py-3 text-xs text-gray-500">${p.cat||'—'}</td>
      <td class="px-4 py-3 font-mono text-xs">${p.itemNo}</td>
      <td class="px-4 py-3 font-medium text-sm max-w-[160px] truncate" title="${p.name}">${p.name}</td>
      <td class="px-4 py-3 text-xs">${(p.defectReasons||[]).map(r=>`<span class="inline-block bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full mr-1 mb-0.5">${r}</span>`).join('')||'—'}</td>
      <td class="px-4 py-3 text-xs text-gray-600 max-w-[140px] truncate" title="${p.defectNote||''}">${p.defectNote||'—'}</td>
      <td class="px-4 py-3 text-center">
        ${hasReplyBtn(p)
          ? `<button onclick="openReplyDetailModal('${p.arrivalDate}','${p.itemNo}')"
              class="bg-green-600 hover:bg-green-700 text-white text-xs px-3 py-1.5 rounded-lg">查看回覆</button>`
          : '<span class="text-gray-400 text-xs">—</span>'}
      </td>
      <td class="px-4 py-3 text-center">
        ${(() => { const photos = (p.defectItems||[]).flatMap(it=>(it.photos||[]).map(ph=>ph.src)).filter(Boolean); return photos.length ? `<button onclick="downloadDefectPhotos('${p.arrivalDate}','${p.itemNo}')" class="bg-blue-50 hover:bg-blue-100 text-blue-600 text-xs px-3 py-1.5 rounded-lg border border-blue-200">${photos.length} 張↓</button>` : '<span class="text-gray-400 text-xs">—</span>'; })()}
      </td>
    </tr>`).join('');
}

let _photoDownloadTarget = null;

function downloadDefectPhotos(arrivalDate, itemNo) {
  const p = getAllProducts().find(x=>x.arrivalDate===arrivalDate&&x.itemNo===itemNo);
  if (!p) return;
  const photos = (p.defectItems||[]).flatMap((it, ei) =>
    (it.photos||[]).map((ph, pi) => ({ src: ph.src, label: `異常${ei+1}_照片${pi+1}` }))
  ).filter(x=>x.src);
  if (!photos.length) { alert('此筆無照片'); return; }
  _photoDownloadTarget = { p, photos };
  document.getElementById('photoDownloadTitle').textContent = `照片下載 — ${p.name}`;
  const body = document.getElementById('photoDownloadBody');
  body.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:12px">
      ${photos.map((ph, i) => `
        <div style="border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;background:#f9fafb">
          <img src="${ph.src}" style="width:100%;aspect-ratio:1;object-fit:cover;cursor:zoom-in"
            onclick="openPhotoModal(['${ph.src}'],'${p.name}',0)" />
          <div style="padding:6px 8px;display:flex;justify-content:space-between;align-items:center">
            <span style="font-size:11px;color:#6b7280">${ph.label}</span>
            <button onclick="downloadSinglePhoto('${ph.src}','${p.name}_${p.arrivalDate}_${ph.label}.jpg')"
              style="font-size:11px;color:#2563eb;background:none;border:none;cursor:pointer;padding:2px 4px;border-radius:4px"
              onmouseover="this.style.background='#dbeafe'" onmouseout="this.style.background='none'">↓下載</button>
          </div>
        </div>`).join('')}
    </div>`;
  document.getElementById('photoDownloadModal').classList.remove('hidden');
}

function downloadSinglePhoto(src, filename) {
  const a = document.createElement('a');
  a.href = src; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
}

function downloadAllDefectPhotos() {
  if (!_photoDownloadTarget) return;
  const { p, photos } = _photoDownloadTarget;
  photos.forEach(ph => downloadSinglePhoto(ph.src, `${p.name}_${p.arrivalDate}_${ph.label}.jpg`));
}

function openReplyDetailModal(arrivalDate, itemNo) {
  const p = getAllProducts().find(x=>x.arrivalDate===arrivalDate&&x.itemNo===itemNo);
  if (!p) return;
  if (p.procReplyUnread) {
    p.procReplyUnread = false;
    if (p.id) ProductAPI._clearUnread(p.id).catch(()=>{});
    updateBadges();
    renderReportTable(); // 重繪報表列，底色恢復白色
  }
  const items = p.defectItems || [];
  const title = document.getElementById('replyDetailTitle');
  const body  = document.getElementById('replyDetailBody');
  if (title) title.textContent = p.name;
  if (!body) return;

  const NUMS = ['一','二','三','四','五','六'];
  const allSrcs = items.flatMap(it=>(it.photos||[]).map(ph=>ph.src||ph)).filter(Boolean);

  const content = items.length
    ? items.map((item, i) => {
        const photos = item.photos || [];
        const reasonsHtml = (item.reasons||[]).length
          ? `<div class="flex flex-wrap gap-1 mt-1">${(item.reasons||[]).map(r=>`<span class="text-xs px-1.5 py-0.5 bg-red-100 text-red-600 rounded">${r}</span>`).join('')}</div>` : '';

        // 照片列表 + 個別回覆
        let photosSection;
        if (photos.length) {
          photosSection = photos.map((ph, pi) => {
            const src = ph.src || ph;
            const globalIdx = items.slice(0,i).reduce((s,it)=>s+(it.photos||[]).length,0) + pi;
            const replied = !!ph.procAction;
            return `
              <div class="flex gap-3 items-start p-3 border-t border-gray-100 ${replied?'bg-green-50':'bg-gray-50'}">
                <img src="${src}" onclick="openPhotoModal([${allSrcs.map(s=>`'${s}'`).join(',')}],'${p.name}',${globalIdx})"
                  class="w-14 h-14 object-cover rounded-lg cursor-pointer flex-shrink-0" />
                <div class="flex-1 min-w-0">
                  <div class="text-xs text-gray-400 mb-1">照片 ${pi+1}</div>
                  ${replied
                    ? `<div class="text-sm font-semibold text-green-700">✓ ${ph.procAction}</div>
                       ${ph.procReply?`<div class="text-xs text-green-600 mt-0.5">${ph.procReply}</div>`:''}
                       <div class="text-xs text-gray-400 mt-0.5">${ph.procStaffName||''} ${ph.procReplyTime?'· '+ph.procReplyTime:''}</div>`
                    : `<div class="text-xs text-gray-400">尚未回覆</div>`}
                </div>
              </div>`;
          }).join('');
        } else {
          // 無照片 → entry 層級回覆
          const replied = !!(item.procAction);
          photosSection = `
            <div class="p-3 border-t border-gray-100 ${replied?'bg-green-50':'bg-gray-50'}">
              <div class="text-xs text-gray-400 mb-1">無照片</div>
              ${replied
                ? `<div class="text-sm font-semibold text-green-700">✓ ${item.procAction}</div>
                   ${item.procReply?`<div class="text-xs text-green-600 mt-0.5">${item.procReply}</div>`:''}
                   <div class="text-xs text-gray-400 mt-0.5">${item.procStaffName||''} ${item.procReplyTime?'· '+item.procReplyTime:''}</div>`
                : `<div class="text-xs text-gray-400">尚未回覆</div>`}
            </div>`;
        }

        return `
          <div class="border border-gray-200 rounded-xl overflow-hidden mb-3">
            <div class="flex items-center justify-between px-3 py-2 bg-red-50">
              <span class="text-sm font-bold text-red-600">異常${NUMS[i]||i+1}</span>
              ${(parseInt(item.qty)||0)>0?`<span class="text-xs font-semibold text-blue-600">異常數量：${item.qty}</span>`:''}
            </div>
            <div class="px-3 py-2">
              ${item.category?`<span class="text-xs font-semibold text-gray-600">${item.category}</span>`:''}
              ${reasonsHtml}
              ${item.note?`<div class="text-xs text-gray-500 mt-1">${item.note}</div>`:''}
            </div>
            ${photosSection}
          </div>`;
      }).join('')
    : `<div class="p-3 bg-green-50 rounded-xl text-sm font-semibold text-green-700">採購回覆：${p.procAction||'—'}${p.procReply?'<br><span class="font-normal text-xs">'+p.procReply+'</span>':''}</div>`;

  body.innerHTML = `
    <div class="text-xs text-gray-400 mb-3">${p.arrivalDate||'—'} · 物流：${p.defectStaff||'—'} · 採購：${p.procStaffName||'—'}</div>
    ${content}`;

  document.getElementById('replyDetailModal').classList.remove('hidden');
}

// ── 5. 待採購回覆 ─────────────────────────────────────
function renderPurchaseTable() {
  const tbody = document.getElementById('purchaseTableBody');
  const catSel = document.getElementById('pur-cat-filter-desk');
  const catFilter = catSel?.value || '';
  if (catSel) {
    const cur = catSel.value;
    catSel.innerHTML = '<option value="">全部大分類</option>' +
      getDeskCatFilters().map(c=>`<option value="${c}" ${cur===c?'selected':''}>${c}</option>`).join('');
  }
  const list = getFilteredAllProducts().filter(p => p.status === STATUS.PROCUREMENT)
    .filter(p => !catFilter || p.cat === catFilter);
  updateBadges();
  if (!list.length) { tbody.innerHTML='<tr><td colspan="8" class="px-4 py-12 text-center text-gray-400 text-sm">尚無待回覆項目</td></tr>'; return; }
  tbody.innerHTML = list.map(p => `
    <tr class="border-b border-gray-100 hover:bg-blue-50">
      <td class="px-4 py-3 text-xs text-gray-400">${p.arrivalDate||'—'}</td>
      <td class="px-4 py-3 font-mono text-xs">${p.itemNo}</td>
      <td class="px-4 py-3 font-medium">${p.name}</td>
      <td class="px-4 py-3 text-xs">${(p.defectReasons||[]).map(r=>`<span class="inline-block bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full mr-1">${r}</span>`).join('')||'—'}</td>
      <td class="px-4 py-3 text-xs text-gray-600 max-w-[120px] truncate" title="${p.defectNote||''}">${p.defectNote||'—'}</td>
      <td class="px-4 py-3 text-xs text-gray-600">${p.defectStaff||'—'}</td>
      <td class="px-4 py-3 text-center">${p.photos.length>0 ? `<span class="text-blue-600 text-xs cursor-pointer" onclick="viewPhotos('${p.arrivalDate}','${p.itemNo}')">${p.photos.length} 張</span>` : '<span class="text-gray-400 text-xs">無</span>'}</td>
      <td class="px-4 py-3 text-center">
        <button onclick="openPurchaseModal('${p.arrivalDate}','${p.itemNo}')" class="bg-blue-600 hover:bg-blue-700 text-white text-xs px-3 py-1.5 rounded-lg">回覆</button>
      </td>
    </tr>`).join('');
}

// ── 徽章計數 ─────────────────────────────────────────
function updateBadges() {
  const all = getAllProducts();
  const reviewCount   = all.filter(p => p.status === STATUS.ABNORMAL_PENDING).length;
  const purchaseCount = all.filter(p => p.status === STATUS.PROCUREMENT).length;
  // 異常回覆頁角標：採購已回覆但尚未查看
  const reportCount = all.filter(p => p.procReplyUnread).length;
  const rb = document.getElementById('badge-review');
  const pb = document.getElementById('badge-purchase');
  const rpb = document.getElementById('badge-report');
  if (rb)  { rb.textContent  = reviewCount;   rb.classList.toggle('hidden',  reviewCount===0); }
  if (pb)  { pb.textContent  = purchaseCount; pb.classList.toggle('hidden',  purchaseCount===0); }
  if (rpb) { rpb.textContent = reportCount;   rpb.classList.toggle('hidden', reportCount===0); }
}

// ── 驗收 Modal ────────────────────────────────────────
function openModal(date, idx) {
  currentIdx = { date, idx };
  const p = getDateProducts(date)[idx];
  // 載入已有的異常明細（含舊格式自動轉換）
  if ((p.defectItems||[]).length) {
    _deskDefectItems = p.defectItems.map(item => {
      if (item.photos) return {
        photos:   item.photos.map(ph => typeof ph === 'string' ? { src: ph, procAction:'', procReply:'', procStaffName:'' } : { ...ph }),
        qty:      parseInt(item.qty) || 0,
        category: item.category || '',
        reasons:  item.reasons  || [],
        note:     item.note     || ''
      };
      // 舊格式：單張照片 → 轉換
      return {
        photos:   item.photo ? [{ src: item.photo, procAction: item.procAction||'', procReply: item.procReply||'', procStaffName: item.procStaffName||'' }] : [],
        qty:      parseInt(item.qty) || 0,
        category: item.category || '',
        reasons:  item.reasons  || (item.reason ? [item.reason] : []),
        note:     item.note     || ''
      };
    });
  } else if (p.photos?.length && p.badQty > 0) {
    const allReasons = p.defectReasons || [];
    _deskDefectItems = [{ photos: p.photos.map(ph => ({ src: ph, procAction:'', procReply:'', procStaffName:'' })), qty: p.badQty||0, category:'', reasons: allReasons, note: p.defectNote||'' }];
  } else {
    _deskDefectItems = [];
  }
  document.getElementById('modalTitle').textContent = p.status === STATUS.PENDING ? '確認登錄' : '修改確認';
  // 業務屬性選擇區
  const bizContainer = document.getElementById('m-biz-attrs');
  if (bizContainer) {
    const attrs = getBizAttrs();
    bizContainer.innerHTML = attrs.map(a => {
      const active = p.bizAttr === a.name;
      return `<span onclick="desktopSetBizAttr('${date}',${idx},'${a.name}',this)"
        class="text-xs px-3 py-1.5 rounded-full cursor-pointer border transition-colors
          ${active?'bg-blue-100 border-blue-400 text-blue-700 font-semibold':'bg-gray-50 border-gray-200 text-gray-500 hover:border-blue-300'}">${a.name}</span>`;
    }).join('');
    bizContainer.parentElement.style.display = attrs.length ? '' : 'none';
  }
  document.getElementById('m-itemCode').textContent = p.itemNo;
  document.getElementById('m-poNo').textContent     = p.po;
  document.getElementById('m-itemName').textContent = p.name;
  document.getElementById('m-spec').textContent     = p.spec;
  document.getElementById('m-barcode').textContent  = p.barcode;
  document.getElementById('m-qty').textContent      = p.qty;
  document.getElementById('goodQty').value = p.received ? p.goodQty : p.qty;
  // 不良品數量由 defect items qty 加總自動計算，初始顯示
  const initBad = p.received ? p.badQty : 0;
  document.getElementById('badQtyDisplay').textContent = initBad || 0;
  document.getElementById('defectSection').classList.remove('hidden');
  document.getElementById('modalError').classList.add('hidden');
  renderDeskDefectItems();
  document.getElementById('receiveModal').classList.remove('hidden');
}
function closeModal() { document.getElementById('receiveModal').classList.add('hidden'); currentIdx = null; }

function startDesktopReceiving(date, idx) {
  const attrs = getBizAttrs();
  if (!attrs.length) { openModal(date, idx); return; }

  const p = getDateProducts(date)[idx];
  const modal = document.getElementById('bizAttrSelectModal');
  const body  = document.getElementById('bizAttrSelectModalBody');
  if (!modal || !body) { openModal(date, idx); return; }

  body.innerHTML = attrs.map(a => {
    const active = p.bizAttr === a.name;
    return `<div onclick="desktopSelectBizAttr('${date}',${idx},'${a.name}')"
      class="flex items-center justify-between p-3 mb-2 rounded-xl border cursor-pointer hover:bg-blue-50 transition-colors
        ${active?'bg-blue-50 border-blue-400':'bg-white border-gray-200'}">
      <span class="font-medium ${active?'text-blue-700':'text-gray-700'}">${a.name}</span>
      ${active?'<span class="text-blue-600 text-lg">✓</span>':''}
    </div>`;
  }).join('') + `<div onclick="desktopSelectBizAttr('${date}',${idx},'')"
    class="flex items-center justify-center p-3 rounded-xl border border-dashed border-gray-200 cursor-pointer hover:bg-gray-50 text-gray-400 text-sm">
    略過（不選擇）
  </div>`;

  modal.classList.remove('hidden');
}

function desktopSelectBizAttr(date, idx, attrName) {
  const p   = getDateProducts(date)[idx];
  p.bizAttr = attrName;
  document.getElementById('bizAttrSelectModal').classList.add('hidden');
  openModal(date, idx);
}

function desktopSetBizAttr(date, idx, name, el) {
  const p = getDateProducts(date)[idx];
  p.bizAttr = (p.bizAttr === name) ? '' : name;
  // 更新所有 chips 樣式
  el.parentElement.querySelectorAll('span').forEach(chip => {
    const active = chip.textContent.trim() === p.bizAttr;
    chip.className = `text-xs px-3 py-1.5 rounded-full cursor-pointer border transition-colors ${active?'bg-blue-100 border-blue-400 text-blue-700 font-semibold':'bg-gray-50 border-gray-200 text-gray-500 hover:border-blue-300'}`;
  });
}

// ── 桌機版異常明細（頁籤切換模式）──────────────────────
let _deskActiveDefectTab = 0;
function switchDeskDefectTab(i) { _deskActiveDefectTab = i; renderDeskDefectItems(); }

function renderDeskDefectItems() {
  const container = document.getElementById('desktopDefectItems');
  if (!container) return;
  if (!_deskDefectItems.length) {
    container.innerHTML = '<p class="text-xs text-gray-400 py-2 text-center">尚未新增，點「＋ 新增異常」按鈕</p>';
    return;
  }

  const totalEntered = _deskDefectItems.reduce((s,it)=>(s+(parseInt(it.qty)||0)),0);
  const bdEl = document.getElementById('badQtyDisplay');
  if (bdEl) bdEl.textContent = totalEntered || 0;

  if (_deskActiveDefectTab >= _deskDefectItems.length) _deskActiveDefectTab = _deskDefectItems.length - 1;
  const i = _deskActiveDefectTab;
  const item = _deskDefectItems[i];

  const camSvg = `<svg style="width:16px;height:16px;color:#fca5a5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"/></svg>`;
  const NUMS = ['一','二','三','四','五','六'];

  const tabs = _deskDefectItems.map((it, idx) => {
    const active = idx === i;
    const hasQty = (parseInt(it.qty)||0) > 0;
    return `<button type="button" onclick="switchDeskDefectTab(${idx})"
      class="${active ? 'bg-red-600 text-white border-red-600' : 'bg-white text-gray-500 border-gray-200 hover:border-red-300'} text-xs px-3 py-1.5 rounded-full border font-medium transition-colors whitespace-nowrap">
      異常${NUMS[idx]||idx+1}${hasQty&&!active?` (${it.qty})`:''}
    </button>`;
  }).join('');

  const photos = item.photos || [];
  const photoThumbs = photos.map((ph, pi) => `
    <div style="position:relative;flex-shrink:0">
      <img src="${ph.src}" onclick="deskViewDefectEntryPhoto(${i},${pi})"
        style="width:56px;height:56px;border-radius:8px;object-fit:cover;cursor:pointer;display:block;border:1.5px solid #fde68a" />
      <button onclick="deskRemoveDefectEntryPhoto(${i},${pi})" style="position:absolute;top:-4px;right:-4px;width:16px;height:16px;background:#ef4444;color:#fff;border:none;border-radius:50%;font-size:10px;cursor:pointer;line-height:1;padding:0">×</button>
    </div>`).join('');

  const addPhotoBtn = `
    <label style="width:56px;height:56px;border:2px dashed #fca5a5;border-radius:8px;background:#fff5f5;display:inline-flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;gap:2px;flex-shrink:0">
      ${camSvg}<span style="font-size:9px;color:#fca5a5">新增</span>
      <input type="file" accept="image/*" multiple class="hidden" onchange="deskAddDefectEntryPhotos(${i},this)" />
    </label>`;

  const qtyEl = `<input type="number" min="0" value="${item.qty||''}" placeholder="0"
    style="width:72px;border:1.5px solid ${(parseInt(item.qty)||0)>0?'#2563eb':'#fecaca'};border-radius:10px;padding:8px 4px;font-size:18px;font-weight:800;text-align:center;outline:none;color:#2563eb;background:#f0f7ff"
    oninput="_deskDefectItems[${i}].qty=parseInt(this.value)||0;updateDeskDefectQtyStats()" />`;

  const catBtns = DEFECT_CATEGORIES().map(c => {
    const active = item.category === c;
    return `<button type="button" onclick="deskSetDefectCategory(${i},'${c}')"
      style="padding:5px 10px;border-radius:16px;border:1.5px solid ${active?'#f59e0b':'#e5e7eb'};
        background:${active?'#fef3c7':'#f8fafc'};color:${active?'#92400e':'#6b7280'};
        font-size:11px;font-weight:${active?'700':'500'};cursor:pointer;white-space:nowrap;flex-shrink:0">${c}</button>`;
  }).join('');

  const reasonsForCat = item.category ? DEFECT_REASONS(item.category) : [];
  const reasonChips = item.category
    ? `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:4px;margin-top:8px">
         ${reasonsForCat.map(r => {
           const sel = (item.reasons||[]).includes(r);
           return `<button type="button" onclick="deskToggleSubReason(${i},'${r}')"
             style="padding:6px 3px;border-radius:8px;border:1.5px solid ${sel?'#2563eb':'#e5e7eb'};
               background:${sel?'#dbeafe':'#f8fafc'};color:${sel?'#1d4ed8':'#6b7280'};
               font-size:11px;font-weight:${sel?'700':'400'};cursor:pointer;line-height:1.3;text-align:center;word-break:break-all">${r}</button>`;
         }).join('')}
       </div>`
    : `<div style="margin-top:6px;padding:8px;background:#f3f4f6;border-radius:8px;font-size:12px;color:#9ca3af;text-align:center">請先選擇大分類</div>`;

  container.innerHTML = `
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">${tabs}</div>
    <div style="background:#fef9f9;border-radius:12px;border:1.5px solid #fecaca;padding:12px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
        <span style="font-size:13px;font-weight:800;color:#dc2626">異常${NUMS[i]||i+1}</span>
        <button onclick="deskRemoveDefectItem(${i})" style="background:none;border:none;color:#fca5a5;cursor:pointer;font-size:12px;padding:2px 6px">✕ 刪除</button>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px;align-items:center">
        ${photoThumbs}${addPhotoBtn}
      </div>
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:4px">
        <div style="flex-shrink:0">
          <div style="font-size:10px;color:#9ca3af;margin-bottom:3px;text-align:center">異常數量</div>
          ${qtyEl}
        </div>
        <div style="flex:1;overflow-x:auto">
          <div style="display:flex;gap:5px;padding-bottom:2px;flex-wrap:wrap">${catBtns}</div>
        </div>
      </div>
      ${reasonChips}
      <input type="text" value="${item.note||''}" placeholder="補充說明（選填）"
        style="width:100%;border:1px solid #e5e7eb;border-radius:8px;padding:7px 10px;font-size:12px;outline:none;background:#fff;margin-top:8px;font-family:inherit;box-sizing:border-box"
        oninput="_deskDefectItems[${i}].note=this.value" />
    </div>`;
}

function updateDeskDefectQtyStats() {
  const totalEntered = _deskDefectItems.reduce((s,it)=>(s+(parseInt(it.qty)||0)),0);
  const badDisplay = document.getElementById('badQtyDisplay');
  if (badDisplay) badDisplay.textContent = totalEntered || 0;
  renderDeskDefectItems();
}

function desktopAddDefectItem() {
  if (_deskDefectItems.length >= 6) { alert('最多 6 筆異常'); return; }
  _deskDefectItems.push({ photos: [], qty: 0, category: '', reasons: [], note: '' });
  _deskActiveDefectTab = _deskDefectItems.length - 1;
  renderDeskDefectItems();
}
function batchAddDeskDefectPhotos(input) {
  const files = Array.from(input.files);
  const remaining = 6 - _deskDefectItems.length;
  if (!files.length || remaining <= 0) { input.value=''; return; }
  const toProcess = files.slice(0, remaining);
  let done = 0;
  toProcess.forEach(file => {
    compressImage(file, 200*1024).then(src => {
      _deskDefectItems.push({ photos: [{ src, procAction:'', procReply:'', procStaffName:'' }], qty: 0, category:'', reasons:[], note:'' });
      done++;
      if (done === toProcess.length) renderDeskDefectItems();
    });
  });
  input.value = '';
}
function deskAddDefectEntryPhotos(i, input) {
  const files = Array.from(input.files);
  if (!files.length) return;
  const item = _deskDefectItems[i];
  if (!item) return;
  let done = 0;
  files.forEach(file => {
    compressImage(file, 200*1024).then(src => {
      item.photos.push({ src, procAction:'', procReply:'', procStaffName:'' });
      done++;
      if (done === files.length) renderDeskDefectItems();
    });
  });
  input.value = '';
}
function deskRemoveDefectEntryPhoto(i, pi) { _deskDefectItems[i]?.photos.splice(pi,1); renderDeskDefectItems(); }
function deskViewDefectEntryPhoto(i, pi) {
  const src = _deskDefectItems[i]?.photos[pi]?.src;
  if (src) { const w=window.open(); w.document.write(`<img src="${src}" style="max-width:100%;height:auto" />`); }
}
function deskRemoveDefectItem(i) {
  _deskDefectItems.splice(i,1);
  if (_deskActiveDefectTab >= _deskDefectItems.length) _deskActiveDefectTab = Math.max(0, _deskDefectItems.length - 1);
  renderDeskDefectItems();
}
function deskSetDefectCategory(i, cat) { _deskDefectItems[i].category=cat; _deskDefectItems[i].reasons=[]; renderDeskDefectItems(); }
function deskToggleSubReason(i, r) { const item=_deskDefectItems[i]; if(!item.reasons)item.reasons=[]; const idx=item.reasons.indexOf(r); if(idx>=0)item.reasons.splice(idx,1); else item.reasons.push(r); renderDeskDefectItems(); }

// onBadQtyInput 已移除：不良品數量改由 defect items qty 加總自動計算

function saveReceiving() {
  const errDiv = document.getElementById('modalError');
  errDiv.classList.add('hidden');
  const good = parseInt(document.getElementById('goodQty').value);
  // 不良品數量 = defect items qty 加總
  const bad  = _deskDefectItems.reduce((s,it)=>(s+(parseInt(it.qty)||0)),0);
  if (isNaN(good) || good < 0) { errDiv.textContent='請輸入正確的到貨數量'; errDiv.classList.remove('hidden'); return; }
  if (_deskDefectItems.length > 0 && _deskDefectItems.some(item=>!(parseInt(item.qty)>0))) { errDiv.textContent='每筆異常明細都需輸入異常數量'; errDiv.classList.remove('hidden'); return; }
  if (bad > 0 && _deskDefectItems.some(item=>!item.category)) { errDiv.textContent='每筆異常明細都需選擇異常大分類'; errDiv.classList.remove('hidden'); return; }
  if (bad > 0 && _deskDefectItems.some(item=>!(item.reasons&&item.reasons.length>0))) { errDiv.textContent='每筆異常明細都需選擇至少一項異常原因'; errDiv.classList.remove('hidden'); return; }
  const { date, idx } = currentIdx;
  const p = getDateProducts(date)[idx];
  const user = getCurrentUser();
  p.received      = true;
  p.goodQty       = good;
  p.badQty        = bad;
  p.defectItems   = _deskDefectItems.map(item=>({ ...item }));
  p.defectReasons = _deskDefectItems.map(item=>getDefectDisplay(item)).filter(r=>r&&r!=='—');
  p.photos        = _deskDefectItems.flatMap(item=>(item.photos||[]).map(ph=>ph.src||ph)).filter(Boolean);
  p.defectNote    = _deskDefectItems.map(item=>item.note).filter(Boolean).join('；');
  p.defectClass   = '其他異常';
  p.defectStaff   = user?.name || '';
  p.time          = new Date().toLocaleString('zh-TW');
  p.operatorId    = user?.userId || '';
  p.operatorName  = user?.name  || '';
  p.status        = bad > 0 ? STATUS.ABNORMAL_PENDING : STATUS.RECEIVED;
  _deskArrivedSet.delete(_deskArrivedKey(date, currentIdx.idx)); // 確認完成後移除已到貨標記
  suppressDeskSyncRender(3000);
  // 呼叫後端 API 後重載 Firestore 資料（確保多台同步）
  const receiveDate = date;
  if (p.id) {
    ProductAPI.receive(p.id, {
      goodQty: good, badQty: bad, defectReasons: p.defectReasons,
      defectNote: p.defectNote, defectClass: p.defectClass, photos: p.photos,
      defectItems: p.defectItems, bizAttr: p.bizAttr || ''
    }).then(async () => {
      await reloadFromFirestore(receiveDate);
      renderProductTable(); updateStats(); updateBadges();
    }).catch(e => console.warn('receive API:', e.message));
  } else {
    saveProductsData();
  }
  closeModal();
}

// ── 異常檢核 Modal (物流專員) ─────────────────────────
let _deskReviewPhotoIdx = 0;

function openReviewModal(arrivalDate, itemNo) {
  const list = getDateProducts(arrivalDate);
  const p = list.find(x => x.itemNo === itemNo);
  if (!p) return;
  reviewIdx = { arrivalDate, itemNo };
  _reviewStartTime = nowHHMM();
  _deskReviewPhotoIdx = 0;

  // 確保 p.defectItems 已初始化（含新舊格式兼容）
  if (!(p.defectItems?.length)) {
    const photos  = p.photos || [];
    const reasons = p.defectReasons || [];
    if (photos.length) {
      p.defectItems = [{ photos: photos.map(ph=>({src:ph,procAction:'',procReply:'',procStaffName:''})), qty:p.badQty||0, category:p.defectClass||'', reasons:[...reasons], note:p.defectNote||'' }];
    } else if (p.badQty > 0) {
      p.defectItems = [{ photos:[], qty:p.badQty||0, category:p.defectClass||'', reasons:[...reasons], note:p.defectNote||'' }];
    }
  } else {
    // 舊格式自動升級
    p.defectItems = p.defectItems.map(item => item.photos ? item : {
      photos: item.photo ? [{src:item.photo,procAction:item.procAction||'',procReply:item.procReply||'',procStaffName:item.procStaffName||''}] : [],
      qty: parseInt(item.qty)||0, category:item.category||'', reasons:item.reasons||[], note:item.note||''
    });
  }

  document.getElementById('rv-itemCode').textContent = p.itemNo;
  document.getElementById('rv-cat').textContent      = p.cat;
  document.getElementById('rv-name').textContent     = p.name;
  document.getElementById('rv-qty').textContent      = p.qty;
  document.getElementById('rv-badQty').textContent   = p.badQty;
  document.getElementById('rv-defectTime').value = p.defectTime || `${_reviewStartTime}～`;
  _deskActiveReviewTab = 0;
  renderReviewPhotoPanel(p);
  document.getElementById('reviewModalError').classList.add('hidden');
  document.getElementById('reviewModal').classList.remove('hidden');
}

let _deskActiveReviewTab = 0;
function switchDeskReviewTab(i) { _deskActiveReviewTab = i; renderReviewPhotoPanel(null); }

function renderReviewPhotoPanel(p) {
  if (!p) {
    const { arrivalDate, itemNo } = reviewIdx;
    p = getDateProducts(arrivalDate).find(x=>x.itemNo===itemNo);
  }
  if (!p) return;
  const row = document.getElementById('rv-photos-row');
  if (!row) return;

  const items = p.defectItems || [];
  if (!items.length) { row.innerHTML='<p class="text-xs text-gray-400 py-2">無異常明細</p>'; return; }
  const NUMS = ['一','二','三','四','五','六'];
  const allPhotos = items.flatMap(it=>(it.photos||[]).map(ph=>ph.src||ph)).filter(Boolean);

  if (_deskActiveReviewTab >= items.length) _deskActiveReviewTab = items.length - 1;
  const i = _deskActiveReviewTab;
  const item = items[i];

  const tabs = items.map((it, idx) => {
    const active = idx === i;
    return `<button type="button" onclick="switchDeskReviewTab(${idx})"
      class="${active ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-500 border-gray-200 hover:border-blue-300'} text-xs px-3 py-1.5 rounded-full border font-medium transition-colors whitespace-nowrap">
      異常${NUMS[idx]||idx+1}${(parseInt(it.qty)||0)>0&&!active?` (${it.qty})`:''}
    </button>`;
  }).join('');

  const photos = item.photos || [];
  const photoThumbs = photos.map((ph, pi) => {
    const src = ph.src || ph;
    const globalIdx = items.slice(0,i).reduce((s,it)=>s+(it.photos||[]).length,0) + pi;
    return `<img src="${src}" onclick="openPhotoModal([${allPhotos.map(s=>`'${s}'`).join(',')}],'${p.name}',${globalIdx})"
      style="width:52px;height:52px;border-radius:8px;object-fit:cover;cursor:pointer;border:1.5px solid #fde68a" />`;
  }).join('');

  const catBtns = DEFECT_CATEGORIES().map(c =>
    `<button type="button" onclick="deskRvSetCategory(${i},'${c}')"
      style="padding:5px 10px;border-radius:16px;border:1.5px solid ${item.category===c?'#f59e0b':'#e5e7eb'};
        background:${item.category===c?'#fef3c7':'#f8fafc'};color:${item.category===c?'#92400e':'#6b7280'};
        font-size:11px;font-weight:${item.category===c?'700':'500'};cursor:pointer;white-space:nowrap">${c}</button>`
  ).join('');

  const reasonsForRv = item.category ? DEFECT_REASONS(item.category) : [];
  const reasonChips = item.category
    ? `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:4px;margin-top:8px">
         ${reasonsForRv.map(r=>{const s=(item.reasons||[]).includes(r);return `<button type="button" onclick="deskRvToggleReason(${i},'${r}')" style="padding:6px 3px;border-radius:8px;border:1.5px solid ${s?'#2563eb':'#e5e7eb'};background:${s?'#dbeafe':'#f8fafc'};color:${s?'#1d4ed8':'#6b7280'};font-size:11px;font-weight:${s?'700':'400'};cursor:pointer;line-height:1.3;text-align:center;word-break:break-all">${r}</button>`;}).join('')}
       </div>`
    : `<div style="margin-top:6px;padding:8px;background:#f3f4f6;border-radius:8px;font-size:12px;color:#9ca3af;text-align:center">請先選擇大分類</div>`;

  row.innerHTML = `
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">${tabs}</div>
    <div style="background:#eff6ff;border-radius:12px;border:1.5px solid #bfdbfe;padding:12px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
        <span style="font-size:13px;font-weight:800;color:#1d4ed8">異常${NUMS[i]||i+1}</span>
        ${(parseInt(item.qty)||0)>0?`<span style="font-size:12px;font-weight:700;color:#2563eb">異常數量：${item.qty}</span>`:''}
      </div>
      ${photos.length?`<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">${photoThumbs}</div>`:'<div style="font-size:12px;color:#9ca3af;margin-bottom:8px">無照片</div>'}
      <div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:4px">${catBtns}</div>
      ${reasonChips}
      <input type="text" value="${item.note||''}" placeholder="補充說明（選填）"
        style="width:100%;border:1px solid #bfdbfe;border-radius:8px;padding:7px 10px;font-size:12px;outline:none;background:#fff;margin-top:8px;font-family:inherit;box-sizing:border-box"
        oninput="deskRvSetNote(${i},this.value)" />
    </div>`;
}

function deskRvSetCategory(idx, cat) {
  const { arrivalDate, itemNo } = reviewIdx;
  const p = getDateProducts(arrivalDate).find(x=>x.itemNo===itemNo);
  if (p?.defectItems?.[idx]) { p.defectItems[idx].category=cat; renderReviewPhotoPanel(p); }
}
function deskRvToggleReason(idx, r) {
  const { arrivalDate, itemNo } = reviewIdx;
  const p = getDateProducts(arrivalDate).find(x=>x.itemNo===itemNo);
  if (!p?.defectItems?.[idx]) return;
  const reasons = p.defectItems[idx].reasons||[];
  const i = reasons.indexOf(r);
  if (i>=0) reasons.splice(i,1); else reasons.push(r);
  p.defectItems[idx].reasons = reasons;
}
function deskRvSetNote(idx, val) {
  const { arrivalDate, itemNo } = reviewIdx;
  const p = getDateProducts(arrivalDate).find(x=>x.itemNo===itemNo);
  if (p?.defectItems?.[idx]) p.defectItems[idx].note = val;
}

function closeReviewModal() { document.getElementById('reviewModal').classList.add('hidden'); reviewIdx = null; }

function submitReview() {
  const errDiv = document.getElementById('reviewModalError');
  errDiv.classList.add('hidden');
  const rvUser = getCurrentUser();
  const { arrivalDate, itemNo } = reviewIdx;
  const p = getDateProducts(arrivalDate).find(x => x.itemNo === itemNo);
  // 驗證：每筆異常明細都需選擇分類與原因
  if (p.defectItems?.length) {
    if (p.defectItems.some(it=>!it.category)) { errDiv.textContent='每筆異常明細都需選擇異常大分類'; errDiv.classList.remove('hidden'); return; }
    if (p.defectItems.some(it=>!(it.reasons&&it.reasons.length>0))) { errDiv.textContent='每筆異常明細都需選擇至少一項異常原因'; errDiv.classList.remove('hidden'); return; }
  }
  // 保存起始時間（格式 HH:MM～），結束由採購回覆時補入
  let rvDefectTime = document.getElementById('rv-defectTime').value.trim();
  if (!rvDefectTime) rvDefectTime = `${_reviewStartTime}～`;
  p.defectTime  = rvDefectTime;
  p.defectStaff = rvUser?.name || '';
  p.procContact = '';
  // 彙整所有異常明細的最終原因
  if (p.defectItems?.length) {
    p.defectReasons = p.defectItems.flatMap(it=>it.reasons||[]).filter(Boolean);
    p.defectClass   = p.defectItems[0]?.category || p.defectClass || '其他異常';
    p.defectNote    = p.defectItems.map(it=>it.note).filter(Boolean).join('；');
    p.photos        = p.defectItems.flatMap(it=>(it.photos||[]).map(ph=>ph.src||ph)).filter(Boolean);
  }
  p.status = STATUS.PROCUREMENT;
  suppressDeskSyncRender(3000);
  if (p.id) {
    ProductAPI.review(p.id, {
      defectTime: p.defectTime, defectClass: p.defectClass,
      defectReasons: p.defectReasons, defectNote: p.defectNote,
      defectItems: p.defectItems
    }).then(async () => {
      await reloadFromFirestore(arrivalDate);
      renderReviewTable(); updateBadges();
    }).catch(e => console.warn('review API:', e.message));
  } else { saveProductsData(); }
  closeReviewModal();
}

// ── 採購回覆 Modal ────────────────────────────────────
let _deskPurchasePhotoIdx = 0;
const PROC_ACTIONS_DESKTOP = ['正常收貨','退貨','換貨','補貨','折讓','報廢','廠商確認後處理','其他'];

function openPurchaseModal(arrivalDate, itemNo) {
  const p = getDateProducts(arrivalDate).find(x => x.itemNo === itemNo);
  if (!p) return;
  purchaseIdx = { arrivalDate, itemNo };
  _deskPurchasePhotoIdx = 0;
  // 確保 defectItems 已初始化（含新舊格式兼容）
  if (!(p.defectItems?.length)) {
    const photos  = p.photos || [];
    const reasons = p.defectReasons || [];
    if (photos.length) {
      p.defectItems = [{ photos: photos.map(ph=>({src:ph,procAction:'',procReply:'',procStaffName:''})), qty:p.badQty||0, category:p.defectClass||'', reasons:[...reasons], note:p.defectNote||'' }];
    } else if (p.badQty > 0) {
      p.defectItems = [{ photos:[], qty:p.badQty||0, category:p.defectClass||'', reasons:[...reasons], note:p.defectNote||'' }];
    }
  } else {
    // 舊格式升級 + 確保每張照片都有 procAction/procReply
    p.defectItems = p.defectItems.map(item => {
      if (!item.photos) {
        return { photos: item.photo?[{src:item.photo,procAction:item.procAction||'',procReply:item.procReply||'',procStaffName:item.procStaffName||''}]:[], qty:parseInt(item.qty)||0, category:item.category||'', reasons:item.reasons||[], note:item.note||'' };
      }
      item.photos = item.photos.map(ph => typeof ph==='string' ? {src:ph,procAction:'',procReply:'',procStaffName:''} : ph);
      return item;
    });
  }
  document.getElementById('pur-itemCode').textContent = p.itemNo;
  document.getElementById('pur-cat').textContent      = p.cat;
  document.getElementById('pur-name').textContent     = p.name;
  _deskActivePurchaseTab = 0;
  document.getElementById('purchaseModalError').classList.add('hidden');
  renderPurchasePhotoPanel(p);
  document.getElementById('purchaseModal').classList.remove('hidden');
}

let _deskActivePurchaseTab = 0;
function switchDeskPurchaseTab(i) { _deskActivePurchaseTab = i; renderPurchasePhotoPanel(null); }

function renderPurchasePhotoPanel(p) {
  if (!p) {
    const { arrivalDate, itemNo } = purchaseIdx;
    p = getDateProducts(arrivalDate).find(x=>x.itemNo===itemNo);
  }
  if (!p) return;
  const panel = document.getElementById('pur-photos-panel');
  if (!panel) return;

  const items = p.defectItems || [];
  if (!items.length) { panel.innerHTML='<p class="text-xs text-gray-400 py-2">無異常明細</p>'; return; }

  const NUMS = ['一','二','三','四','五','六'];
  const allPhotos = items.flatMap(it=>(it.photos||[]).map(ph=>ph.src||ph)).filter(Boolean);
  const totalSlots = items.reduce((s,it)=>s+((it.photos||[]).length||1),0);
  const repliedSlots = items.reduce((s,it)=>{
    if ((it.photos||[]).length) return s+(it.photos||[]).filter(ph=>ph.procAction).length;
    return s+(it.procAction?1:0);
  },0);

  if (_deskActivePurchaseTab >= items.length) _deskActivePurchaseTab = items.length - 1;
  const i = _deskActivePurchaseTab;
  const item = items[i];

  const tabs = items.map((it, idx) => {
    const active = idx === i;
    const replied = (it.photos||[]).length ? (it.photos||[]).every(ph=>ph.procAction) : !!it.procAction;
    return `<button type="button" onclick="switchDeskPurchaseTab(${idx})"
      class="${active ? 'bg-blue-600 text-white border-blue-600' : replied ? 'bg-green-50 text-green-700 border-green-300' : 'bg-white text-gray-500 border-gray-200 hover:border-blue-300'} text-xs px-3 py-1.5 rounded-full border font-medium transition-colors whitespace-nowrap">
      ${replied&&!active?'✓ ':''}異常${NUMS[idx]||idx+1}
    </button>`;
  }).join('');

  const statHtml = totalSlots > 1
    ? `<div class="text-xs text-gray-400 mb-3">已回覆 ${repliedSlots} / ${totalSlots} 筆</div>` : '';

  const photos = item.photos || [];
  const reasonsHtml = (item.reasons||[]).length
    ? `<div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px">${(item.reasons||[]).map(r=>`<span style="font-size:11px;padding:2px 8px;background:#fee2e2;color:#dc2626;border-radius:10px">${r}</span>`).join('')}</div>` : '';

  let photosHtml;
  if (photos.length) {
    photosHtml = photos.map((ph, pi) => {
      const src = ph.src || ph;
      const globalIdx = items.slice(0,i).reduce((s,it)=>s+(it.photos||[]).length,0) + pi;
      const actionOptions = PROC_ACTIONS_DESKTOP.map(v=>`<option value="${v}" ${ph.procAction===v?'selected':''}>${v}</option>`).join('');
      return `
        <div style="border:1px solid ${ph.procAction?'#86efac':'#e5e7eb'};border-radius:10px;padding:12px;margin-bottom:8px;background:${ph.procAction?'#f0fdf4':'#fff'}">
          <div style="font-size:11px;color:#9ca3af;margin-bottom:8px">照片 ${pi+1}</div>
          <div style="display:flex;gap:12px;align-items:stretch">
            <img src="${src}" onclick="openPhotoModal([${allPhotos.map(s=>`'${s}'`).join(',')}],'${p.name}',${globalIdx})"
              style="width:110px;min-height:110px;height:100%;border-radius:10px;object-fit:cover;flex-shrink:0;cursor:pointer" />
            <div style="flex:1;min-width:0">
              <select onchange="deskPurSetAction(${i},${pi},this.value)"
                style="width:100%;border:1px solid ${ph.procAction?'#34d399':'#d1d5db'};border-radius:8px;padding:6px 8px;font-size:12px;outline:none;background:#fff;margin-bottom:6px">
                <option value="">請選擇處理方式 *</option>
                ${actionOptions}
              </select>
              <textarea rows="2" placeholder="回覆說明..." oninput="deskPurSetReply(${i},${pi},this.value)"
                style="width:100%;border:1px solid #d1d5db;border-radius:8px;padding:6px 8px;font-size:11px;outline:none;resize:none;font-family:inherit;box-sizing:border-box">${ph.procReply||''}</textarea>
              ${ph.procAction?`<div style="font-size:11px;color:#059669;font-weight:600;margin-top:4px">✓ ${ph.procAction}</div>`:''}
            </div>
          </div>
        </div>`;
    }).join('');
  } else {
    const actionOptions = PROC_ACTIONS_DESKTOP.map(v=>`<option value="${v}" ${item.procAction===v?'selected':''}>${v}</option>`).join('');
    photosHtml = `
      <div style="border:1px solid ${item.procAction?'#86efac':'#e5e7eb'};border-radius:10px;padding:10px;background:${item.procAction?'#f0fdf4':'#fff'}">
        <div style="font-size:11px;color:#9ca3af;margin-bottom:8px">無照片</div>
        <select onchange="deskPurSetEntryAction(${i},this.value)"
          style="width:100%;border:1px solid ${item.procAction?'#34d399':'#d1d5db'};border-radius:8px;padding:6px 8px;font-size:12px;outline:none;background:#fff;margin-bottom:6px">
          <option value="">請選擇處理方式 *</option>
          ${actionOptions}
        </select>
        <textarea rows="2" placeholder="回覆說明..." oninput="deskPurSetEntryReply(${i},this.value)"
          style="width:100%;border:1px solid #d1d5db;border-radius:8px;padding:6px 8px;font-size:11px;outline:none;resize:none;font-family:inherit;box-sizing:border-box">${item.procReply||''}</textarea>
        ${item.procAction?`<div style="font-size:11px;color:#059669;font-weight:600;margin-top:4px">✓ ${item.procAction}</div>`:''}
      </div>`;
  }

  panel.innerHTML = `
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">${tabs}</div>
    ${statHtml}
    <div style="background:#eff6ff;border-radius:12px;border:1.5px solid #bfdbfe;padding:12px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
        <span style="font-size:13px;font-weight:800;color:#1d4ed8">異常${NUMS[i]||i+1}</span>
        ${(parseInt(item.qty)||0)>0?`<span style="font-size:12px;font-weight:700;color:#2563eb">異常數量：${item.qty}</span>`:''}
      </div>
      ${item.category?`<div style="font-size:12px;font-weight:600;color:#374151;margin-bottom:4px">${item.category}</div>`:''}
      ${reasonsHtml}
      ${item.note?`<div style="font-size:12px;color:#6b7280;margin-bottom:8px">${item.note}</div>`:''}
      ${photosHtml}
    </div>`;
}

function deskPurSetAction(entryIdx, photoIdx, val) {
  const { arrivalDate, itemNo } = purchaseIdx;
  const p = getDateProducts(arrivalDate).find(x=>x.itemNo===itemNo);
  const ph = p?.defectItems?.[entryIdx]?.photos?.[photoIdx];
  if (ph) { ph.procAction=val; renderPurchasePhotoPanel(p); }
}
function deskPurSetReply(entryIdx, photoIdx, val) {
  const { arrivalDate, itemNo } = purchaseIdx;
  const p = getDateProducts(arrivalDate).find(x=>x.itemNo===itemNo);
  const ph = p?.defectItems?.[entryIdx]?.photos?.[photoIdx];
  if (ph) ph.procReply=val;
}
function deskPurSetEntryAction(entryIdx, val) {
  const { arrivalDate, itemNo } = purchaseIdx;
  const p = getDateProducts(arrivalDate).find(x=>x.itemNo===itemNo);
  const it = p?.defectItems?.[entryIdx];
  if (it) { it.procAction=val; renderPurchasePhotoPanel(p); }
}
function deskPurSetEntryReply(entryIdx, val) {
  const { arrivalDate, itemNo } = purchaseIdx;
  const p = getDateProducts(arrivalDate).find(x=>x.itemNo===itemNo);
  const it = p?.defectItems?.[entryIdx];
  if (it) it.procReply=val;
}
function closePurchaseModal() { document.getElementById('purchaseModal').classList.add('hidden'); purchaseIdx = null; }

function submitPurchaseReply() {
  const errDiv = document.getElementById('purchaseModalError');
  errDiv.classList.add('hidden');
  const { arrivalDate, itemNo } = purchaseIdx;
  const p = getDateProducts(arrivalDate).find(x => x.itemNo === itemNo);
  const purUser = getCurrentUser();
  const items   = p.defectItems || [];
  const allPhotos = items.flatMap(it=>it.photos||[]);
  // 至少一筆需有回覆才能送出（有照片看照片，無照片看 entry 層級）
  const hasAnyReply = items.some(it =>
    (it.photos||[]).length ? (it.photos||[]).some(ph=>ph.procAction) : !!it.procAction
  );
  if (!hasAnyReply) {
    errDiv.textContent='請至少為一筆異常選擇處理方式'; errDiv.classList.remove('hidden'); return;
  }
  // 儲存各照片回覆（已填的更新人員）
  const nowTs = new Date().toLocaleString('zh-TW');
  allPhotos.forEach(ph=>{ if(ph.procAction) { if(!ph.procStaffName) ph.procStaffName=purUser?.name||''; if(!ph.procReplyTime) ph.procReplyTime=nowTs; } });
  // 無照片的 entry 也補上人員時間
  items.forEach(it=>{ if(!(it.photos||[]).length && it.procAction) { if(!it.procStaffName) it.procStaffName=purUser?.name||''; if(!it.procReplyTime) it.procReplyTime=nowTs; } });
  p.defectItems      = items;
  const photoActions  = allPhotos.map(ph=>ph.procAction).filter(Boolean);
  const entryActions  = items.filter(it=>!(it.photos||[]).length && it.procAction).map(it=>it.procAction);
  p.procAction       = [...photoActions, ...entryActions].join('、') || '—';
  const photoReplies  = allPhotos.map(ph=>ph.procReply).filter(Boolean);
  const entryReplies  = items.filter(it=>!(it.photos||[]).length && it.procReply).map(it=>it.procReply);
  p.procReply        = [...photoReplies, ...entryReplies].join('；');
  p.procReplyTime    = new Date().toLocaleString('zh-TW');
  p.procStaffId      = purUser?.userId || '';
  p.procStaffName    = purUser?.name   || '';
  p.procReplyUnread  = true;  // 有回覆後設未讀（讓異常回覆頁角標出現）
  // 全部槽位回覆完才轉已處理
  const allReplied = items.every(it =>
    (it.photos||[]).length ? (it.photos||[]).every(ph=>ph.procAction) : !!it.procAction
  );
  p.status = allReplied ? STATUS.RESOLVED : STATUS.PROCUREMENT;
  // 每次回覆都更新連動時間結束（取最後一筆採購回覆時間）
  const nowT = nowHHMM();
  if (p.defectTime) {
    if (p.defectTime.includes('～')) {
      p.defectTime = p.defectTime.split('～')[0] + '～' + nowT;
    } else {
      p.defectTime = p.defectTime + '～' + nowT;
    }
  } else {
    p.defectTime = '～' + nowT;
  }
  suppressDeskSyncRender(3000);
  const replyArrivalDate = arrivalDate;
  if (p.id) {
    ProductAPI.reply(p.id, { procAction: p.procAction, procReply: p.procReply, defectItems: p.defectItems, defectTime: p.defectTime, status: p.status })
      .then(async () => {
        await reloadFromFirestore(replyArrivalDate);
        renderPurchaseTable(); updateBadges();
      })
      .catch(e => console.warn('reply API:', e.message));
  } else { saveProductsData(); }
  closePurchaseModal();
}

// ── 照片上傳 ──────────────────────────────────────────
function renderPhotoSlots() {
  const grid = document.getElementById('photoGrid');
  if (!grid) return;
  grid.innerHTML = '';
  for (let i = 0; i < 6; i++) {
    const slot = document.createElement('div');
    slot.className = 'photo-slot';
    if (uploadedPhotos[i]) {
      slot.innerHTML = `<img src="${uploadedPhotos[i]}" alt="photo-${i}" />`;
      slot.onclick = () => removePhoto(i); slot.title = '點擊移除';
    } else if (i === uploadedPhotos.length) {
      slot.innerHTML = `<svg class="w-7 h-7 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 4v16m8-8H4"/></svg>`;
      slot.onclick = () => document.getElementById('photoInput').click();
    } else { slot.style.opacity='0.3'; slot.style.cursor='default'; }
    grid.appendChild(slot);
  }
  document.getElementById('photoCount').textContent = `已上傳 ${uploadedPhotos.length} / 6 張`;
}
function handlePhotoUpload(input) {
  const files = Array.from(input.files);
  files.slice(0, 6 - uploadedPhotos.length).forEach(file => {
    compressImage(file, 200*1024).then(dataUrl => { uploadedPhotos.push(dataUrl); renderPhotoSlots(); });
  });
  input.value = '';
}
function compressImage(file, maxBytes) {
  return new Promise(resolve => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      let { width, height } = img;
      // 先限制最大解析度（長邊 1280px）
      const MAX_DIM = 1280;
      if (width > MAX_DIM || height > MAX_DIM) {
        const s = MAX_DIM / Math.max(width, height);
        width = Math.round(width * s); height = Math.round(height * s);
      }
      let quality = 0.82;
      const tryCompress = () => {
        canvas.width=width; canvas.height=height;
        canvas.getContext('2d').drawImage(img,0,0,width,height);
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        const bytes = Math.round((dataUrl.length-22)*3/4);
        if (bytes<=maxBytes||quality<=0.1) { resolve(dataUrl); return; }
        if (quality>0.3) { quality-=0.1; tryCompress(); }
        else { const s=Math.sqrt(maxBytes/bytes); width=Math.round(width*s); height=Math.round(height*s); quality=0.8; tryCompress(); }
      };
      tryCompress();
    };
    img.src = url;
  });
}
function removePhoto(i) { uploadedPhotos.splice(i,1); renderPhotoSlots(); }

// ── 異常原因複選 ─────────────────────────────────────
function renderDefectReasonList(containerId, selected=[], cat='') {
  const reasons = cat ? DEFECT_REASONS(cat) : DEFECT_REASONS();
  document.getElementById(containerId).innerHTML = reasons.map(r => `
    <label class="flex items-center gap-2 text-xs cursor-pointer hover:text-red-600">
      <input type="checkbox" value="${r}" ${selected.includes(r)?'checked':''}
        class="accent-red-500 w-3.5 h-3.5 flex-shrink-0" />${r}
    </label>`).join('');
}
function getSelectedReasons(containerId) {
  return Array.from(document.querySelectorAll(`#${containerId} input:checked`)).map(el=>el.value);
}

// ── 照片預覽 Modal ────────────────────────────────────
function openPhotoModal(photos, title, startIdx=0) {
  _photoList = Array.isArray(photos) ? photos : [];
  _photoIdx  = startIdx;
  document.getElementById('photoModalTitle').textContent = title;
  document.getElementById('photoModal').classList.remove('hidden');
  renderPhotoModal();
}
function viewPhotos(arrivalDate, itemNo) {
  const p = getDateProducts(arrivalDate).find(x=>x.itemNo===itemNo);
  if (!p||!p.photos.length) return;
  openPhotoModal(p.photos, p.name, 0);
}
function renderPhotoModal() {
  const total = _photoList.length;
  document.getElementById('photoModalImg').src = _photoList[_photoIdx];
  document.getElementById('photoCounter').textContent = `${_photoIdx+1} / ${total}`;
  document.getElementById('photoPrev').classList.toggle('hidden', total<=1);
  document.getElementById('photoNext').classList.toggle('hidden', total<=1);
  document.getElementById('photoThumbs').innerHTML = _photoList.map((src,i) =>
    `<img src="${src}" onclick="jumpPhoto(${i})" class="w-14 h-14 object-cover rounded-lg cursor-pointer flex-shrink-0 transition-all ${i===_photoIdx?'ring-2 ring-white opacity-100':'opacity-50 hover:opacity-80'}" />`).join('');
}
function shiftPhoto(dir) { _photoIdx = (_photoIdx+dir+_photoList.length)%_photoList.length; renderPhotoModal(); }
function jumpPhoto(i) { _photoIdx=i; renderPhotoModal(); }
function closePhotoModal(event) {
  if (event && event.target !== document.getElementById('photoModal')) return;
  document.getElementById('photoModal').classList.add('hidden');
}

// ── 管理頁載入 ───────────────────────────────────────
async function loadAndRenderAdmin() {
  try {
    const [roles, users, attrs, defectCfg, catItems] = await Promise.all([
      RoleAPI.list(), UserAPI.list(),
      (window.BizAttrAPI?.list?.()||Promise.resolve([])),
      (window.DefectConfigAPI?.get?.()||Promise.resolve({})),
      (window.CatFilterAPI?.get?.()||Promise.resolve(null))
    ]);
    saveRoles(roles); saveUsers(users);
    if(attrs.length) saveBizAttrs(attrs);
    if(defectCfg?.map) saveDeskDefectConfig({ map: defectCfg.map });
    saveDeskCatFilters(catItems);
  } catch(e) { console.warn('admin load:', e.message); }
  renderRoleTable(); renderUserTable(); renderDesktopBizAttrList();
  renderDeskDefectMapAdmin(); renderDeskCatFilterList();
}

// ── 業務屬性管理 ─────────────────────────────────────
function renderDesktopBizAttrList() {
  const el = document.getElementById('desktopBizAttrList');
  if (!el) return;
  const attrs = getBizAttrs();
  el.innerHTML = attrs.length
    ? attrs.map((a,i) => `
        <div class="flex items-center gap-1.5 bg-blue-50 border border-blue-200 rounded-full px-3 py-1.5">
          <span class="text-sm font-medium text-blue-700">${a.name}</span>
          <button onclick="desktopDeleteBizAttr('${a.id||i}')" class="text-blue-300 hover:text-blue-500 text-sm leading-none">✕</button>
        </div>`).join('')
    : '<span class="text-sm text-gray-400">尚無業務屬性</span>';
}

async function desktopAddBizAttr() {
  const input = document.getElementById('desktopBizAttrInput');
  const name  = input?.value.trim();
  if (!name) return;
  try {
    const newAttr = await BizAttrAPI.create(name);
    const attrs   = getBizAttrs(); attrs.push(newAttr); saveBizAttrs(attrs);
    input.value = ''; renderDesktopBizAttrList();
  } catch(e) { alert(e.message); }
}

async function desktopDeleteBizAttr(idOrIdx) {
  if (!confirm('確定刪除此業務屬性？')) return;
  const attrs = getBizAttrs();
  const idx   = attrs.findIndex(a => a.id === idOrIdx || String(attrs.indexOf(a)) === String(idOrIdx));
  if (idx < 0) return;
  try {
    if (attrs[idx].id) await BizAttrAPI.delete(attrs[idx].id);
    attrs.splice(idx,1); saveBizAttrs(attrs); renderDesktopBizAttrList();
  } catch(e) { alert(e.message); }
}

// ── 異常設定管理（桌電版）────────────────────────────
function renderDeskDefectMapAdmin() {
  const container = document.getElementById('deskDefectMapContainer');
  if (!container) return;
  const map = getDefectMap();
  const cats = Object.keys(map);
  if (!cats.length) { container.innerHTML='<div class="text-sm text-gray-400 p-2">尚無分類</div>'; return; }
  container.innerHTML = cats.map((cat, ci) => `
    <div class="border border-yellow-200 rounded-xl overflow-hidden mb-3">
      <div class="flex items-center justify-between bg-yellow-50 px-4 py-2 gap-2">
        <span class="text-sm font-bold text-yellow-800 flex-shrink-0">${cat}</span>
        <div class="flex gap-2 flex-1 min-w-0">
          <input id="deskDefectMapRI_${ci}" type="text" placeholder="新增細項..."
            class="flex-1 min-w-0 border border-gray-300 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-yellow-400"
            onkeydown="if(event.key==='Enter')deskAddDefectMapReason(${ci})" />
          <button onclick="deskAddDefectMapReason(${ci})" class="bg-yellow-500 hover:bg-yellow-600 text-white text-xs px-3 py-1 rounded-lg flex-shrink-0">新增</button>
          <button onclick="deskDeleteDefectMapCategory(${ci})" class="bg-red-100 hover:bg-red-200 text-red-600 text-xs px-3 py-1 rounded-lg flex-shrink-0">刪除</button>
        </div>
      </div>
      <div class="p-3 flex flex-wrap gap-2">
        ${(map[cat]||[]).map((r,ri) => `
          <span class="flex items-center gap-1 bg-red-50 border border-red-200 rounded-full px-3 py-1 text-xs text-red-700">
            ${r}
            <button onclick="deskDeleteDefectMapReason(${ci},${ri})" class="text-red-300 hover:text-red-500 leading-none ml-0.5">✕</button>
          </span>`).join('')}
        ${!(map[cat]||[]).length ? '<span class="text-xs text-gray-400">尚無細項</span>' : ''}
      </div>
    </div>`).join('');
}

async function deskAddDefectMapCategory() {
  const input = document.getElementById('deskDefectNewCatInput');
  const name = input?.value.trim();
  if (!name) return;
  const map = getDefectMap();
  if (map[name]) { alert('大分類已存在'); return; }
  map[name] = [];
  saveDeskDefectConfig({ map });
  try { await DefectConfigAPI.saveMap(map); } catch(e) { console.warn(e.message); }
  input.value = '';
  renderDeskDefectMapAdmin();
}

async function deskAddDefectMapReason(catIdx) {
  const input = document.getElementById(`deskDefectMapRI_${catIdx}`);
  const name = input?.value.trim();
  if (!name) return;
  const map = getDefectMap();
  const cat = Object.keys(map)[catIdx];
  if (!cat) return;
  if ((map[cat]||[]).includes(name)) { alert('細項已存在'); return; }
  map[cat] = [...(map[cat]||[]), name];
  saveDeskDefectConfig({ map });
  try { await DefectConfigAPI.saveMap(map); } catch(e) { console.warn(e.message); }
  input.value = '';
  renderDeskDefectMapAdmin();
}

async function deskDeleteDefectMapCategory(catIdx) {
  if (!confirm('確定刪除此大分類及所有細項？')) return;
  const map = getDefectMap();
  const cat = Object.keys(map)[catIdx];
  if (!cat) return;
  delete map[cat];
  saveDeskDefectConfig({ map });
  try { await DefectConfigAPI.saveMap(map); } catch(e) { console.warn(e.message); }
  renderDeskDefectMapAdmin();
}

async function deskDeleteDefectMapReason(catIdx, reasonIdx) {
  const map = getDefectMap();
  const cat = Object.keys(map)[catIdx];
  if (!cat) return;
  map[cat].splice(reasonIdx, 1);
  saveDeskDefectConfig({ map });
  try { await DefectConfigAPI.saveMap(map); } catch(e) { console.warn(e.message); }
  renderDeskDefectMapAdmin();
}

// ── 大分類篩選管理（桌電版）──────────────────────────
function renderDeskCatFilterList() {
  const el = document.getElementById('deskCatFilterList');
  if (!el) return;
  const cats = getDeskCatFilters();
  el.innerHTML = cats.length
    ? cats.map((c,i) => `
        <div class="flex items-center gap-1.5 bg-green-50 border border-green-300 rounded-full px-3 py-1.5">
          <span class="text-sm font-medium text-green-800">${c}</span>
          <button onclick="deskDeleteCatFilter(${i})" class="text-green-400 hover:text-green-600 text-sm leading-none">✕</button>
        </div>`).join('')
    : '<span class="text-sm text-gray-400">尚無大分類選項</span>';
}

async function deskAddCatFilter() {
  const input = document.getElementById('deskCatFilterInput');
  const name  = input?.value.trim();
  if (!name) return;
  const items = [...getDeskCatFilters(), name];
  saveDeskCatFilters(items);
  try { await CatFilterAPI.save(items); } catch(e) { console.warn(e.message); }
  input.value = ''; renderDeskCatFilterList();
}

async function deskDeleteCatFilter(idx) {
  if (!confirm('確定刪除此大分類？')) return;
  const items = getDeskCatFilters(); items.splice(idx,1);
  saveDeskCatFilters(items.length ? items : null);
  try { await CatFilterAPI.save(items.length ? items : _DEF_CAT_FILTERS); } catch(e) { console.warn(e.message); }
  renderDeskCatFilterList();
}

// ── 角色管理 CRUD ─────────────────────────────────────
let editRoleIdx = null;

function renderRoleTable() {
  const tbody = document.getElementById('roleTableBody');
  const roles = getRoles();
  if (!roles.length) { tbody.innerHTML='<tr><td colspan="3" class="px-4 py-8 text-center text-gray-400 text-sm">尚無自訂角色，請新增角色</td></tr>'; return; }
  tbody.innerHTML = roles.map((r, i) => `
    <tr class="border-b border-gray-100 hover:bg-gray-50">
      <td class="px-4 py-3 font-medium text-left">
        <span class="px-2.5 py-1 rounded-full text-xs font-medium ${getRoleColor(r.id)}">${r.name}</span>
      </td>
      <td class="px-4 py-3 text-left">
        <div class="flex flex-wrap gap-1">
          ${(r.tabs||[]).map(t=>`<span class="bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded">${TAB_LABELS[t]||t}</span>`).join('')||'<span class="text-gray-400 text-xs">無</span>'}
        </div>
      </td>
      <td class="px-4 py-3 text-center">
        <div class="flex gap-2 justify-center">
          <button onclick="openEditRoleModal(${i})" class="bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs px-3 py-1.5 rounded-lg">編輯</button>
          <button onclick="deleteRole(${i})" class="bg-red-50 hover:bg-red-100 text-red-500 text-xs px-3 py-1.5 rounded-lg">刪除</button>
        </div>
      </td>
    </tr>`).join('');
}

function openAddRoleModal() {
  editRoleIdx = null;
  document.getElementById('roleModalTitle').textContent = '新增角色';
  document.getElementById('rm-name').value = '';
  document.querySelectorAll('.rm-tab').forEach(cb => cb.checked = false);
  document.getElementById('roleModalError').classList.add('hidden');
  document.getElementById('roleModal').classList.remove('hidden');
}
function openEditRoleModal(idx) {
  const r = getRoles()[idx];
  editRoleIdx = idx;
  document.getElementById('roleModalTitle').textContent = '編輯角色';
  document.getElementById('rm-name').value = r.name;
  document.querySelectorAll('.rm-tab').forEach(cb => { cb.checked = (r.tabs||[]).includes(cb.value); });
  document.getElementById('roleModalError').classList.add('hidden');
  document.getElementById('roleModal').classList.remove('hidden');
}
function closeRoleModal() { document.getElementById('roleModal').classList.add('hidden'); editRoleIdx = null; }

async function saveRole() {
  const errDiv = document.getElementById('roleModalError');
  const name   = document.getElementById('rm-name').value.trim();
  const tabs   = [...document.querySelectorAll('.rm-tab:checked')].map(cb => cb.value);
  errDiv.classList.add('hidden');
  if (!name) { errDiv.textContent='請輸入角色名稱'; errDiv.classList.remove('hidden'); return; }
  if (!tabs.length) { errDiv.textContent='請至少選擇一個功能頁籤'; errDiv.classList.remove('hidden'); return; }
  try {
    const roles = getRoles();
    if (editRoleIdx === null) {
      const newRole = await RoleAPI.create(name, tabs);
      roles.push(newRole);
    } else {
      await RoleAPI.update(roles[editRoleIdx].id, name, tabs);
      roles[editRoleIdx].name = name;
      roles[editRoleIdx].tabs = tabs;
    }
    saveRoles(roles);
    closeRoleModal();
    renderRoleTable();
    refreshRoleOptions();
  } catch(e) { errDiv.textContent = e.message; errDiv.classList.remove('hidden'); }
}

async function deleteRole(idx) {
  if (!confirm('確定刪除此角色？已指派此角色的帳號將變為「待審核」')) return;
  const roles = getRoles();
  const roleId = roles[idx].id;
  try {
    await RoleAPI.delete(roleId);
    roles.splice(idx, 1);
    saveRoles(roles);
    const users = getUsers();
    users.forEach(u => { if (u.role === roleId) u.role = 'pending'; });
    saveUsers(users);
    renderRoleTable(); renderUserTable();
  } catch(e) { alert('刪除失敗：' + e.message); }
}

function refreshRoleOptions() {
  const sel = document.getElementById('um-role');
  if (!sel) return;
  const cur = sel.value;
  // 移除舊的動態選項（保留 pending 和 admin）
  [...sel.options].forEach(o => { if (o.value !== 'pending' && o.value !== 'admin') o.remove(); });
  // 插入自訂角色
  const roles = getRoles();
  const adminOpt = sel.querySelector('option[value="admin"]');
  roles.forEach(r => {
    const opt = document.createElement('option');
    opt.value = r.id; opt.textContent = r.name;
    sel.insertBefore(opt, adminOpt);
  });
  sel.value = cur || 'pending';
}

// ── 帳號管理 CRUD ─────────────────────────────────────
function renderUserTable() {
  const tbody  = document.getElementById('userTableBody');
  const users  = getUsers();
  const getRid = u => u.role_id || u.roleId || u.role || 'pending';
  const pending = users.filter(u => getRid(u) === 'pending').length;
  const alert  = document.getElementById('pendingAlert');
  if (alert) alert.classList.toggle('hidden', pending === 0);
  if (!users.length) { tbody.innerHTML='<tr><td colspan="5" class="px-4 py-12 text-center text-gray-400 text-sm">尚無帳號</td></tr>'; return; }
  tbody.innerHTML = users.map((u, i) => `
    <tr class="border-b border-gray-100 hover:bg-gray-50">
      <td class="px-4 py-3 font-mono text-sm">${u.userId || u.user_id}</td>
      <td class="px-4 py-3 font-medium">${u.name}</td>
      <td class="px-4 py-3">
        <span class="px-2.5 py-1 rounded-full text-xs font-medium ${getRoleColor(getRid(u))}">
          ${getRoleName(getRid(u))}
        </span>
      </td>
      <td class="px-4 py-3 text-xs text-gray-400">${u.createdAt||'—'}</td>
      <td class="px-4 py-3 text-center">
        <div class="flex gap-2 justify-center">
          <button onclick="openEditUserModal(${i})" class="bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs px-3 py-1.5 rounded-lg">編輯</button>
          ${u.userId !== 'reyi' ? `<button onclick="deleteUser(${i})" class="bg-red-50 hover:bg-red-100 text-red-500 text-xs px-3 py-1.5 rounded-lg">刪除</button>` : ''}
        </div>
      </td>
    </tr>`).join('');
}

function openAddUserModal() {
  editUserIdx = null;
  refreshRoleOptions();
  document.getElementById('userModalTitle').textContent = '新增帳號';
  document.getElementById('um-userId').value    = '';
  document.getElementById('um-name').value      = '';
  document.getElementById('um-password').value  = '';
  document.getElementById('um-role').value      = 'pending';
  document.getElementById('um-userId').disabled = false;
  document.getElementById('userModalError').classList.add('hidden');
  document.getElementById('userModal').classList.remove('hidden');
}

function openEditUserModal(idx) {
  refreshRoleOptions();
  const users = getUsers();
  const u = users[idx];
  editUserIdx = idx;
  document.getElementById('userModalTitle').textContent = '編輯帳號';
  document.getElementById('um-userId').value    = u.userId;
  document.getElementById('um-name').value      = u.name;
  document.getElementById('um-password').value  = '';
  document.getElementById('um-role').value      = u.role;
  document.getElementById('um-userId').disabled = true;
  document.getElementById('userModalError').classList.add('hidden');
  document.getElementById('userModal').classList.remove('hidden');
}

function closeUserModal() { document.getElementById('userModal').classList.add('hidden'); editUserIdx = null; }

async function saveUser() {
  const errDiv   = document.getElementById('userModalError');
  const userId   = document.getElementById('um-userId').value.trim();
  const name     = document.getElementById('um-name').value.trim();
  const password = document.getElementById('um-password').value;
  const roleId   = document.getElementById('um-role').value;
  errDiv.classList.add('hidden');
  if (!userId || !name) { errDiv.textContent='帳號與姓名為必填'; errDiv.classList.remove('hidden'); return; }
  try {
    const users = getUsers();
    if (editUserIdx === null) {
      if (!password) { errDiv.textContent='新增帳號時密碼為必填'; errDiv.classList.remove('hidden'); return; }
      await UserAPI.create(userId, password, name, roleId);
      users.push({ userId, name, role_id: roleId, createdAt: new Date().toLocaleString('zh-TW') });
    } else {
      await UserAPI.update(userId, name, roleId, password);
      users[editUserIdx].name    = name;
      users[editUserIdx].role_id = roleId;
      if (password) users[editUserIdx].password = password;
    }
    saveUsers(users);
    closeUserModal();
    renderUserTable();
  } catch(e) { errDiv.textContent = e.message; errDiv.classList.remove('hidden'); }
}

async function deleteUser(idx) {
  if (!confirm('確定要刪除此帳號？')) return;
  const users  = getUsers();
  const userId = users[idx].user_id || users[idx].userId;
  try {
    await UserAPI.delete(userId);
    users.splice(idx, 1);
    saveUsers(users);
    renderUserTable();
  } catch(e) { alert('刪除失敗：' + e.message); }
}

// ── 匯出 ──────────────────────────────────────────────
function exportWarehouseList() {
  // TODO: IT 工程師請在此串接後端 API 邏輯
  const list = getFilteredAllProducts().filter(p=>p.status!==STATUS.PENDING);
  if (!list.length) { alert('尚無資料可匯出'); return; }
  const rows=[['到貨日','品號','條碼','品名','規格','採購數量','良品數量','異常數量','異常原因','照片數','驗收時間']];
  list.forEach(p=>rows.push([p.arrivalDate,p.itemNo,p.barcode,p.name,p.spec,p.qty,p.goodQty,p.badQty,(p.defectReasons||[]).join('、'),p.photos.length,p.time]));
  downloadCsv(rows,'入庫清單.csv');
}
function exportReport() {
  // TODO: IT 工程師請在此串接後端 API 邏輯
  const list = getFilteredAllProducts().filter(p=>p.badQty>0);
  if (!list.length) { alert('尚無異常記錄可匯出'); return; }
  const rows=[['日期','連動時間','異常分類','廠商','大分類','商品編號','商品名稱','異常原因','其他說明','物流專員','採購人員','採購處理方式','採購回覆說明','回覆時間']];
  list.forEach(p=>rows.push([p.arrivalDate,p.defectTime||'',p.defectClass||'其他異常',p.po||'',p.cat||'',p.itemNo,p.name,(p.defectReasons||[]).join('、'),p.defectNote||'',p.defectStaff||'',p.procStaffName||'',p.procAction||'',p.procReply||'',p.procReplyTime||'']));
  downloadCsv(rows,'商品異常回覆商流.csv');
}
function downloadCsv(rows, filename) {
  const bom='﻿';
  const csv=bom+rows.map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'}));
  a.download=filename; a.click();
}
