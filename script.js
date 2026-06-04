// ── 異常原因選項 ──────────────────────────────────────
const DEFECT_REASONS = [
  '品名不符','數量不符','規格不符',
  '外箱標示異常','條碼異常','裸瓶','混效期',
  '商品異常-凹損','商品異常-破損','商品異常-破膜',
  '商品異常-汙損','商品異常-殘膠','商品異常-未封口',
  '商品異常-效期模糊','商品異常-(多筆)',
  '效期異常-效期超允收','效期異常-未來日',
  '效期異常-無第二條件','效期異常-保存期限不合理',
  '臨時到貨','取消到貨','其他'
];

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
  review:'異常檢核', report:'異常報表',
  purchase:'待回覆清單', resolved:'已處理記錄'
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
    users.unshift({ userId:'reyi', password:'8963', name:'管理員', role:'admin', createdAt: new Date().toLocaleString('zh-TW') });
    saveUsers(users);
  }
}

// ── 全域狀態 ──────────────────────────────────────────
let productsByDate = {};
let currentRole    = 'field';
let currentIdx     = null;
let reviewIdx      = null;
let purchaseIdx    = null;
let editUserIdx    = null;
let uploadedPhotos = [];
let _photoList = [], _photoIdx = 0;
let _reviewStartTime = '';

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
    window.location.href = 'main.html';
  } catch(e) {
    errDiv.textContent = e.message || '登入失敗，請稍後再試';
    errDiv.classList.remove('hidden');
  } finally { btn.disabled = false; btn.textContent = '登入'; }
}
function showError(el, msg) { el.textContent = msg; el.classList.remove('hidden'); }

// ── 主頁初始化 ────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  if (!document.getElementById('productTableBody')) return;

  // Firebase：確保管理員帳號存在
  if (typeof ensureAdmin === 'function') {
    try { await ensureAdmin(); } catch(e) { console.warn('ensureAdmin:', e.message); }
  }

  // 先嘗試從 session 取得使用者資訊（重整時用 /api/auth/me 驗證）
  let user = getCurrentUser();
  if (!user) {
    try { user = await AuthAPI.me(); sessionStorage.setItem('rr_user', JSON.stringify(user)); }
    catch(e) { window.location.href = 'index.html'; return; }
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
});

function logout() {
  AuthAPI.logout().catch(()=>{});
  sessionStorage.clear();
  window.location.href = 'index.html';
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
    time:           p.recv_time || ''
  }));
}

// ── 依角色初始化頁籤 ─────────────────────────────────
function initTabsByRole(roleId) {
  const roleObj = getRoleById(roleId);
  const allowedTabs = roleObj?.tabs || [];

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

  // 切換至第一個可用頁籤
  const firstTab = roleId === 'admin' ? 'receiving' : (allowedTabs[0] || 'receiving');
  switchTab(firstTab);
}

// ── Tab 切換 ──────────────────────────────────────────
const ALL_PAGES = ['receiving','warehouse','review','report','purchase','resolved','admin'];
function switchTab(name) {
  ALL_PAGES.forEach(t => {
    document.getElementById(`page-${t}`)?.classList.toggle('hidden', t !== name);
    const btn = document.getElementById(`tab-${t}`);
    if (!btn) return;
    if (t === name) { btn.classList.add('border-indigo-600','text-indigo-600'); btn.classList.remove('border-transparent','text-gray-500'); }
    else            { btn.classList.remove('border-indigo-600','text-indigo-600'); btn.classList.add('border-transparent','text-gray-500'); }
  });
  const gdf = document.getElementById('globalDateFilter');
  if (name === 'receiving') { gdf.classList.add('hidden'); gdf.classList.remove('flex'); renderProductTable(); updateStats(); }
  else { gdf.classList.remove('hidden'); gdf.classList.add('flex'); }
  if (name === 'warehouse') renderWarehouseTable();
  if (name === 'review')    renderReviewTable();
  if (name === 'report')    renderReportTable();
  if (name === 'purchase')  renderPurchaseTable();
  if (name === 'resolved')  renderResolvedTable();
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
    const items = await ProductAPI.getByDate(date || currentReceivingDate());
    productsByDate[date || currentReceivingDate()] = normalizeProducts(items);
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
  else if (t==='resolved') renderResolvedTable();
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
    [STATUS.PENDING]:          '<span class="badge badge-pending">待驗收</span>',
    [STATUS.RECEIVED]:         '<span class="badge badge-done">已驗收</span>',
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
  const list  = getDateProducts(date);
  if (!list.length) {
    const msg = date ? `${date} 尚無進貨資料，請匯入 Excel` : '請選擇日期並匯入 Excel';
    tbody.innerHTML = `<tr><td colspan="12" class="px-4 py-16 text-center text-gray-400">
      <div class="flex flex-col items-center gap-2">
        <svg class="w-10 h-10 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
        </svg><span class="text-sm">${msg}</span></div></td></tr>`;
    return;
  }
  tbody.innerHTML = list.map((p, i) => `
    <tr class="${p.status !== STATUS.PENDING ? 'received-row' : 'hover:bg-gray-50'} border-b border-gray-100">
      <td class="px-4 py-3"><input type="checkbox" data-idx="${i}" onchange="onRowCheck()" class="row-check accent-indigo-600 w-4 h-4 cursor-pointer" /></td>
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
          ? `<button onclick="openModal('${date}',${i})" class="bg-indigo-600 hover:bg-indigo-700 text-white text-xs px-3 py-1.5 rounded-lg">驗收</button>`
          : p.status === STATUS.RESOLVED
            ? '<span class="text-xs text-gray-400">已處理</span>'
            : `<button onclick="openModal('${date}',${i})" class="bg-gray-200 hover:bg-gray-300 text-gray-600 text-xs px-3 py-1.5 rounded-lg">修改</button>`}
      </td>
    </tr>`).join('');

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
  const list = getDateProducts(currentReceivingDate());
  document.getElementById('stat-total').textContent    = list.length;
  document.getElementById('stat-done').textContent     = list.filter(p => p.status !== STATUS.PENDING).length;
  document.getElementById('stat-pending').textContent  = list.filter(p => p.status === STATUS.PENDING).length;
  document.getElementById('stat-abnormal').textContent = list.filter(p => [STATUS.ABNORMAL_PENDING, STATUS.PROCUREMENT, STATUS.RESOLVED].includes(p.status)).length;
  const manualEl = document.getElementById('stat-manual');
  if (manualEl) manualEl.textContent = list.filter(p => p.isManual).length;
}

// ── 2. 入庫清單 ───────────────────────────────────────
function renderWarehouseTable() {
  const tbody = document.getElementById('warehouseTableBody');
  const list  = getFilteredAllProducts().filter(p => p.status !== STATUS.PENDING);
  if (!list.length) { tbody.innerHTML='<tr><td colspan="10" class="px-4 py-12 text-center text-gray-400 text-sm">尚無已驗收資料</td></tr>'; return; }
  tbody.innerHTML = list.map(p => `
    <tr class="border-b border-gray-100 hover:bg-gray-50">
      <td class="px-4 py-3 text-xs text-gray-400">${p.arrivalDate||'—'}</td>
      <td class="px-4 py-3 font-mono text-xs">${p.itemNo}</td>
      <td class="px-4 py-3 font-mono text-xs">${p.barcode}</td>
      <td class="px-4 py-3 font-medium">${p.name}</td>
      <td class="px-4 py-3 text-right">${p.qty}</td>
      <td class="px-4 py-3 text-right text-green-600 font-medium">${p.goodQty}</td>
      <td class="px-4 py-3 text-right ${p.badQty>0?'text-red-500 font-medium':'text-gray-400'}">${p.badQty}</td>
      <td class="px-4 py-3 text-xs text-gray-600">${(p.defectReasons||[]).join('、')||'—'}</td>
      <td class="px-4 py-3 text-center">${p.photos.length>0 ? `<span class="text-indigo-600 text-xs cursor-pointer" onclick="viewPhotos('${p.arrivalDate}','${p.itemNo}')">${p.photos.length} 張</span>` : '<span class="text-gray-400 text-xs">無</span>'}</td>
      <td class="px-4 py-3 text-xs text-gray-500">${p.time}</td>
    </tr>`).join('');
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
      <td class="px-4 py-3 text-center">${p.photos.length>0 ? `<span class="text-indigo-600 text-xs cursor-pointer" onclick="viewPhotos('${p.arrivalDate}','${p.itemNo}')">${p.photos.length} 張</span>` : '<span class="text-gray-400 text-xs">無</span>'}</td>
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
  tbody.innerHTML = list.map(p => `
    <tr class="border-b border-gray-100 hover:bg-red-50">
      <td class="px-4 py-3 text-xs text-gray-500">${p.arrivalDate||'—'}</td>
      <td class="px-4 py-3 text-xs text-gray-500">${p.defectTime||'—'}</td>
      <td class="px-4 py-3"><span class="bg-red-100 text-red-700 px-2 py-0.5 rounded-full text-xs">${p.defectClass||'其他異常'}</span></td>
      <td class="px-4 py-3 text-xs text-gray-500">${p.cat||'—'}</td>
      <td class="px-4 py-3 font-mono text-xs">${p.itemNo}</td>
      <td class="px-4 py-3 font-medium text-sm max-w-[160px] truncate" title="${p.name}">${p.name}</td>
      <td class="px-4 py-3 text-xs">${(p.defectReasons||[]).map(r=>`<span class="inline-block bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full mr-1 mb-0.5">${r}</span>`).join('')||'—'}</td>
      <td class="px-4 py-3 text-xs text-gray-600 max-w-[140px] truncate" title="${p.defectNote||''}">${p.defectNote||'—'}</td>
      <td class="px-4 py-3 text-xs text-gray-600">${p.defectStaff||'—'}</td>
      <td class="px-4 py-3 text-xs text-gray-600">${p.procStaffName||'—'}</td>
      <td class="px-4 py-3 text-xs text-gray-600">${p.procAction ? `<span class="font-medium">${p.procAction}</span>${p.procReply ? '<br><span class="text-gray-400">'+p.procReply+'</span>' : ''}` : '—'}</td>
      <td class="px-4 py-3 text-center">${p.photos.length>0 ? `<span class="text-indigo-600 text-xs cursor-pointer" onclick="viewPhotos('${p.arrivalDate}','${p.itemNo}')">${p.photos.length} 張</span>` : '<span class="text-gray-400 text-xs">無</span>'}</td>
    </tr>`).join('');
}

// ── 5. 待採購回覆 ─────────────────────────────────────
function renderPurchaseTable() {
  const tbody = document.getElementById('purchaseTableBody');
  const list  = getFilteredAllProducts().filter(p => p.status === STATUS.PROCUREMENT);
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
      <td class="px-4 py-3 text-center">${p.photos.length>0 ? `<span class="text-indigo-600 text-xs cursor-pointer" onclick="viewPhotos('${p.arrivalDate}','${p.itemNo}')">${p.photos.length} 張</span>` : '<span class="text-gray-400 text-xs">無</span>'}</td>
      <td class="px-4 py-3 text-center">
        <button onclick="openPurchaseModal('${p.arrivalDate}','${p.itemNo}')" class="bg-blue-600 hover:bg-blue-700 text-white text-xs px-3 py-1.5 rounded-lg">回覆</button>
      </td>
    </tr>`).join('');
}

// ── 6. 已處理記錄 ─────────────────────────────────────
function renderResolvedTable() {
  const tbody = document.getElementById('resolvedTableBody');
  const list  = getFilteredAllProducts().filter(p => p.status === STATUS.RESOLVED);
  if (!list.length) { tbody.innerHTML='<tr><td colspan="10" class="px-4 py-12 text-center text-gray-400 text-sm">尚無已處理記錄</td></tr>'; return; }
  tbody.innerHTML = list.map(p => `
    <tr class="border-b border-gray-100 hover:bg-green-50">
      <td class="px-4 py-3 text-xs text-gray-500">${p.arrivalDate||'—'}</td>
      <td class="px-4 py-3 text-xs text-gray-500">${p.defectTime||'—'}</td>
      <td class="px-4 py-3"><span class="bg-red-100 text-red-700 px-2 py-0.5 rounded-full text-xs">${p.defectClass||'其他異常'}</span></td>
      <td class="px-4 py-3 text-xs text-gray-500">${p.po||'—'}</td>
      <td class="px-4 py-3 text-xs text-gray-500">${p.cat||'—'}</td>
      <td class="px-4 py-3 font-mono text-xs">${p.itemNo}</td>
      <td class="px-4 py-3 font-medium text-sm max-w-[160px] truncate" title="${p.name}">${p.name}</td>
      <td class="px-4 py-3 text-xs">${(p.defectReasons||[]).map(r=>`<span class="inline-block bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full mr-1 mb-0.5">${r}</span>`).join('')||'—'}</td>
      <td class="px-4 py-3 text-xs text-gray-600 max-w-[140px] truncate" title="${p.defectNote||''}">${p.defectNote||'—'}</td>
      <td class="px-4 py-3 text-xs text-gray-600">${p.defectStaff||'—'}</td>
    </tr>`).join('');
}

function exportResolvedExcel() {
  // TODO: IT 工程師請在此串接後端 API 邏輯
  const list = getFilteredAllProducts().filter(p => p.status === STATUS.RESOLVED);
  if (!list.length) { alert('尚無已處理記錄可匯出'); return; }
  const headers = ['日期','連動時間','異常分類','廠商','大分類','商品編號','商品名稱','異常原因','其他說明','物流回覆專員'];
  const rows = list.map(p => [
    p.arrivalDate   || '',
    p.defectTime    || '',
    p.defectClass   || '其他異常',
    p.po            || '',
    p.cat           || '',
    p.itemNo,
    p.name,
    (p.defectReasons||[]).join('、'),
    p.defectNote    || '',
    p.defectStaff   || ''
  ]);
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  // 欄寬設定
  ws['!cols'] = [10,14,12,14,10,14,20,30,20,12].map(w=>({wch:w}));
  XLSX.utils.book_append_sheet(wb, ws, '已處理記錄');
  XLSX.writeFile(wb, '商品異常已處理記錄.xlsx');
}

// ── 徽章計數 ─────────────────────────────────────────
function updateBadges() {
  const all = getAllProducts();
  const reviewCount   = all.filter(p => p.status === STATUS.ABNORMAL_PENDING).length;
  const purchaseCount = all.filter(p => p.status === STATUS.PROCUREMENT).length;
  const rb = document.getElementById('badge-review');
  const pb = document.getElementById('badge-purchase');
  if (rb) { rb.textContent = reviewCount;   rb.classList.toggle('hidden', reviewCount===0); }
  if (pb) { pb.textContent = purchaseCount; pb.classList.toggle('hidden', purchaseCount===0); }
}

// ── 驗收 Modal ────────────────────────────────────────
function openModal(date, idx) {
  currentIdx = { date, idx };
  _modalStartTime = nowHHMM();
  const p = getDateProducts(date)[idx];
  uploadedPhotos = p.received ? [...p.photos] : [];
  document.getElementById('modalTitle').textContent = p.status === STATUS.PENDING ? '驗收登錄' : '修改驗收';
  document.getElementById('m-itemCode').textContent = p.itemNo;
  document.getElementById('m-poNo').textContent     = p.po;
  document.getElementById('m-itemName').textContent = p.name;
  document.getElementById('m-spec').textContent     = p.spec;
  document.getElementById('m-barcode').textContent  = p.barcode;
  document.getElementById('m-qty').textContent      = p.qty;
  document.getElementById('goodQty').value  = p.received ? p.goodQty : p.qty;
  document.getElementById('badQty').value   = p.received ? p.badQty  : '';
  document.getElementById('defectClass').value  = p.defectClass || '其他異常';
  document.getElementById('defectNote').value   = p.defectNote  || '';
  renderDefectReasonList('defectReasonList', p.defectReasons||[]);
  document.getElementById('defectSection').classList.toggle('hidden', !p.received || p.badQty<=0);
  document.getElementById('modalError').classList.add('hidden');
  renderPhotoSlots();
  document.getElementById('receiveModal').classList.remove('hidden');
}
function closeModal() { document.getElementById('receiveModal').classList.add('hidden'); currentIdx = null; }

function onBadQtyInput() {
  const { date, idx } = currentIdx;
  const p   = getDateProducts(date)[idx];
  const bad = parseInt(document.getElementById('badQty').value) || 0;
  document.getElementById('goodQty').value = Math.max(0, p.qty - bad);
  document.getElementById('defectSection').classList.toggle('hidden', bad <= 0);
}

function saveReceiving() {
  const errDiv = document.getElementById('modalError');
  errDiv.classList.add('hidden');
  const good = parseInt(document.getElementById('goodQty').value);
  const bad  = parseInt(document.getElementById('badQty').value) || 0;
  if (isNaN(good) || good < 0) { errDiv.textContent='請輸入正確的良品數量'; errDiv.classList.remove('hidden'); return; }
  const reasons = getSelectedReasons('defectReasonList');
  if (bad > 0 && reasons.length===0) { errDiv.textContent='有不良品時，請至少選擇一個異常原因'; errDiv.classList.remove('hidden'); return; }
  const { date, idx } = currentIdx;
  const p = getDateProducts(date)[idx];
  p.received      = true;
  p.goodQty       = good;
  p.badQty        = bad;
  // 連動時間由物流專員起始，現場人員不處理
  const user = getCurrentUser();
  p.defectClass    = document.getElementById('defectClass').value;
  p.defectReasons  = reasons;
  p.defectNote     = document.getElementById('defectNote').value.trim();
  p.defectStaff    = user?.name || '';
  p.photos         = [...uploadedPhotos];
  p.time           = new Date().toLocaleString('zh-TW');
  p.operatorId     = user?.userId || user?.roleId || '';
  p.operatorName   = user?.name  || '';
  p.status         = bad > 0 ? STATUS.ABNORMAL_PENDING : STATUS.RECEIVED;

  // 呼叫後端 API 後重載 Firestore 資料（確保多台同步）
  const receiveDate = date;
  if (p.id) {
    ProductAPI.receive(p.id, {
      goodQty: good, badQty: bad, defectReasons: reasons,
      defectNote: p.defectNote, defectClass: p.defectClass, photos: p.photos
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
function openReviewModal(arrivalDate, itemNo) {
  const list = getDateProducts(arrivalDate);
  const p = list.find(x => x.itemNo === itemNo);
  if (!p) return;
  reviewIdx = { arrivalDate, itemNo };
  _reviewStartTime = nowHHMM();
  document.getElementById('rv-itemCode').textContent = p.itemNo;
  document.getElementById('rv-cat').textContent      = p.cat;
  document.getElementById('rv-name').textContent     = p.name;
  document.getElementById('rv-qty').textContent      = p.qty;
  document.getElementById('rv-badQty').textContent   = p.badQty;
  document.getElementById('rv-reasons').textContent  = (p.defectReasons||[]).join('、') || '未填寫';
  document.getElementById('rv-note').textContent     = p.defectNote || '—';
  // 現場照片
  const row = document.getElementById('rv-photos-row');
  row.innerHTML = p.photos.map((src,i) => `<img src="${src}" onclick="openPhotoModal([${p.photos.map(s=>'\''+s+'\'').join(',')}],'${p.name}',${i})" class="w-16 h-16 object-cover rounded-lg cursor-pointer border border-gray-200" />`).join('') || '<span class="text-xs text-gray-400">無照片</span>';
  // 預填
  // 連動時間：起始由專員開啟檢核時記錄，結束由採購回覆時補入
  document.getElementById('rv-defectTime').value = p.defectTime || `${_reviewStartTime}～`;
  document.getElementById('rv-defectClass').value   = p.defectClass || '其他異常';
  document.getElementById('rv-defectNote').value    = p.defectNote  || '';
  // 物流回覆專員與採購聯絡人由登入帳號自動記錄，不需手動輸入
  renderDefectReasonList('rv-defectReasonList', p.defectReasons||[]);
  document.getElementById('reviewModalError').classList.add('hidden');
  document.getElementById('reviewModal').classList.remove('hidden');
}
function closeReviewModal() { document.getElementById('reviewModal').classList.add('hidden'); reviewIdx = null; }

function submitReview() {
  const errDiv = document.getElementById('reviewModalError');
  errDiv.classList.add('hidden');
  const rvUser = getCurrentUser();
  const { arrivalDate, itemNo } = reviewIdx;
  const p = getDateProducts(arrivalDate).find(x => x.itemNo === itemNo);
  // 保存起始時間（格式 HH:MM～），結束由採購回覆時補入
  let rvDefectTime = document.getElementById('rv-defectTime').value.trim();
  if (!rvDefectTime) rvDefectTime = `${_reviewStartTime}～`;
  p.defectTime = rvDefectTime;
  p.defectClass   = document.getElementById('rv-defectClass').value;
  p.defectReasons = getSelectedReasons('rv-defectReasonList');
  p.defectNote    = document.getElementById('rv-defectNote').value.trim();
  p.defectStaff   = rvUser?.name || '';
  p.procContact   = '';
  p.status        = STATUS.PROCUREMENT;
  if (p.id) {
    ProductAPI.review(p.id, {
      defectTime: p.defectTime, defectClass: p.defectClass,
      defectReasons: p.defectReasons, defectNote: p.defectNote
    }).then(async () => {
      await reloadFromFirestore(arrivalDate);
      renderReviewTable(); updateBadges();
    }).catch(e => console.warn('review API:', e.message));
  } else { saveProductsData(); }
  closeReviewModal();
}

// ── 採購回覆 Modal ────────────────────────────────────
function openPurchaseModal(arrivalDate, itemNo) {
  const p = getDateProducts(arrivalDate).find(x => x.itemNo === itemNo);
  if (!p) return;
  purchaseIdx = { arrivalDate, itemNo };
  document.getElementById('pur-itemCode').textContent = p.itemNo;
  document.getElementById('pur-cat').textContent      = p.cat;
  document.getElementById('pur-name').textContent     = p.name;
  document.getElementById('pur-reasons').textContent  = (p.defectReasons||[]).join('、') || '—';
  document.getElementById('pur-note').textContent     = p.defectNote   || '—';
  document.getElementById('pur-staff').textContent    = p.defectStaff  || '—';
  document.getElementById('pur-action').value = p.procAction || '';
  document.getElementById('pur-reply').value  = p.procReply  || '';
  document.getElementById('purchaseModalError').classList.add('hidden');
  document.getElementById('purchaseModal').classList.remove('hidden');
}
function closePurchaseModal() { document.getElementById('purchaseModal').classList.add('hidden'); purchaseIdx = null; }

function submitPurchaseReply() {
  const errDiv = document.getElementById('purchaseModalError');
  errDiv.classList.add('hidden');
  const action = document.getElementById('pur-action').value;
  if (!action) { errDiv.textContent='請選擇處理方式'; errDiv.classList.remove('hidden'); return; }
  const { arrivalDate, itemNo } = purchaseIdx;
  const p = getDateProducts(arrivalDate).find(x => x.itemNo === itemNo);
  const purUser   = getCurrentUser();
  p.procAction    = action;
  p.procReply     = document.getElementById('pur-reply').value.trim();
  p.procReplyTime = new Date().toLocaleString('zh-TW');
  p.procStaffId   = purUser?.userId || '';
  p.procStaffName = purUser?.name   || '';
  p.status        = STATUS.RESOLVED;
  const replyArrivalDate = arrivalDate;
  if (p.id) {
    ProductAPI.reply(p.id, { procAction: action, procReply: p.procReply })
      .then(async () => {
        await reloadFromFirestore(replyArrivalDate);
        renderPurchaseTable(); renderResolvedTable(); updateBadges();
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
    compressImage(file, 1000*1024).then(dataUrl => { uploadedPhotos.push(dataUrl); renderPhotoSlots(); });
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
      let quality = 0.92;
      const tryCompress = () => {
        canvas.width=width; canvas.height=height;
        canvas.getContext('2d').drawImage(img,0,0,width,height);
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        const bytes = Math.round((dataUrl.length-22)*3/4);
        if (bytes<=maxBytes||quality<=0.1) { resolve(dataUrl); return; }
        if (quality>0.3) { quality-=0.08; tryCompress(); }
        else { const s=Math.sqrt(maxBytes/bytes); width=Math.round(width*s); height=Math.round(height*s); quality=0.85; tryCompress(); }
      };
      tryCompress();
    };
    img.src = url;
  });
}
function removePhoto(i) { uploadedPhotos.splice(i,1); renderPhotoSlots(); }

// ── 異常原因複選 ─────────────────────────────────────
function renderDefectReasonList(containerId, selected=[]) {
  document.getElementById(containerId).innerHTML = DEFECT_REASONS.map(r => `
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
    const [roles, users] = await Promise.all([RoleAPI.list(), UserAPI.list()]);
    saveRoles(roles);
    saveUsers(users);
  } catch(e) { console.warn('admin load:', e.message); }
  renderRoleTable();
  renderUserTable();
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
  const rows=[['到貨日','品號','條碼','品名','規格','採購數量','良品數量','不良品數量','異常原因','照片數','驗收時間']];
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
