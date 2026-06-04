/**
 * 日翊收發進貨平台 - App 核心邏輯（行動版）
 */

// ── 常數 ─────────────────────────────────────────────
const DEFECT_REASONS = [
  '品名不符','數量不符','規格不符','外箱標示異常','條碼異常','裸瓶','混效期',
  '商品異常-凹損','商品異常-破損','商品異常-破膜','商品異常-汙損','商品異常-殘膠',
  '商品異常-未封口','商品異常-效期模糊','商品異常-(多筆)',
  '效期異常-效期超允收','效期異常-未來日','效期異常-無第二條件','效期異常-保存期限不合理',
  '臨時到貨','取消到貨','其他'
];
const PROC_ACTIONS = ['正常收貨','退貨','換貨','補貨','折讓','報廢','廠商確認後處理','其他'];
const STATUS = { PENDING:'pending', RECEIVED:'received', ABNORMAL:'abnormal_pending', PROCUREMENT:'procurement', RESOLVED:'resolved' };
const TAB_LABELS = { receiving:'驗收', warehouse:'入庫', review:'檢核', report:'報表', purchase:'待回覆', resolved:'記錄', admin:'設定' };
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
let productsByDate = {};
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

  if (typeof ensureAdmin==='function') { try { await ensureAdmin(); } catch(e){} }

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

  // 載入 Firestore 資料
  try {
    const dates = await ProductAPI.getDates();
    if (dates && dates.length > 0) {
      const best = dates.includes(today) ? today : dates[0];
      if (dateEl) dateEl.value = best;
      const items = await ProductAPI.getByDate(best);
      productsByDate[best] = normalizeProducts(items);
    }
  } catch(e) { console.warn('load failed:', e.message); }

  // 切換到第一個可用頁面
  const roleObj = getRoleById(currentRole);
  const firstPage = currentRole==='admin' ? 'receiving' : (roleObj?.tabs?.[0] || 'receiving');
  switchPage(firstPage);

  // 移除 Loading 遮罩
  const loading = document.getElementById('authLoading');
  if (loading) { loading.style.opacity='0'; loading.style.transition='opacity .3s'; setTimeout(()=>loading.remove(), 300); }
});

function logout() { AuthAPI.logout().catch(()=>{}); sessionStorage.clear(); window.location.replace('index.html'); }

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

// ── 頁面切換 ──────────────────────────────────────────
function switchPage(name) {
  currentPage = name;
  document.querySelectorAll('.app-page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const page = document.getElementById(`page-${name}`);
  const nav  = document.getElementById(`nav-${name}`);
  if (page) page.classList.add('active');
  if (nav)  nav.classList.add('active');
  // 渲染對應頁面
  if (name==='receiving')  { renderProductCards(); updateStats(); }
  if (name==='warehouse')  renderWarehouseCards();
  if (name==='review')     renderReviewCards();
  if (name==='report')     renderReportCards();
  if (name==='purchase')   renderPurchaseCards();
  if (name==='resolved')   renderResolvedCards();
  if (name==='admin')      loadAndRenderAdmin();
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

// ── Firestore 重載 ────────────────────────────────────
async function reloadFromFirestore(date) {
  try {
    const items = await ProductAPI.getByDate(date || currentReceivingDate());
    productsByDate[date || currentReceivingDate()] = normalizeProducts(items);
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
    photos:p.photos||[], time:p.recv_time||p.time||''
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
  const m = { pending:'<span class="badge badge-pending">待驗收</span>',
    received:'<span class="badge badge-done">已驗收</span>',
    abnormal_pending:'<span class="badge badge-abnormal">異常待檢核</span>',
    procurement:'<span class="badge badge-proc">待採購回覆</span>',
    resolved:'<span class="badge badge-resolved">已處理</span>' };
  return (m[p.status]||'') + (p.isManual ? '<span class="badge badge-manual" style="margin-left:4px">臨時</span>' : '');
}

function renderProductCards() {
  const container = document.getElementById('productListContainer');
  if (!container) return;
  const date = currentReceivingDate();
  const list  = getDateProducts(date);
  if (!list.length) {
    container.innerHTML = `<div class="empty-state">
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
      <p style="font-size:15px;font-weight:600">${date ? date+' 尚無進貨資料' : '請選擇日期'}</p>
      <p style="font-size:13px;margin-top:4px">點右下角匯入 Excel</p></div>`;
    return;
  }
  container.innerHTML = list.map((p, i) => `
    <div class="product-card ${p.status!==STATUS.PENDING?'received':''} slide-up" onclick="openReceiveSheet('${date}',${i})">
      <div class="product-card-header">
        <div style="flex:1;min-width:0">
          <div style="font-size:15px;font-weight:700;color:#111;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${p.name}</div>
          <div style="font-size:12px;color:#6b7280;margin-top:2px">${p.itemNo} · ${p.cat||'—'}</div>
        </div>
        <div style="text-align:right;flex-shrink:0">
          ${statusBadgeHtml(p)}
        </div>
      </div>
      <div class="product-card-footer">
        <div style="display:flex;gap:16px">
          <div><div style="font-size:11px;color:#9ca3af">採購數量</div><div style="font-size:16px;font-weight:700;color:#4f46e5">${p.qty}</div></div>
          ${p.received ? `<div><div style="font-size:11px;color:#9ca3af">良品</div><div style="font-size:16px;font-weight:700;color:#059669">${p.goodQty}</div></div>
          <div><div style="font-size:11px;color:#9ca3af">不良品</div><div style="font-size:16px;font-weight:700;color:#dc2626">${p.badQty}</div></div>` : ''}
        </div>
        <div style="font-size:12px;color:#9ca3af">${p.barcode||''}</div>
      </div>
    </div>`).join('');
  // 渲染條碼
  setTimeout(() => {
    if (typeof JsBarcode==='undefined') return;
    container.querySelectorAll('[data-barcode]').forEach(svg => {
      try { JsBarcode(svg, svg.dataset.barcode, {format:'CODE128',displayValue:false,height:28,margin:1,lineColor:'#374151',width:1}); } catch(e){}
    });
  }, 50);
}

function updateStats() {
  const list = getDateProducts(currentReceivingDate());
  const set = el => { const e=document.getElementById(el.id); if(e) e.textContent=el.val; };
  [
    {id:'stat-total',    val:list.length},
    {id:'stat-done',     val:list.filter(p=>p.status!==STATUS.PENDING).length},
    {id:'stat-pending',  val:list.filter(p=>p.status===STATUS.PENDING).length},
    {id:'stat-abnormal', val:list.filter(p=>[STATUS.ABNORMAL,STATUS.PROCUREMENT,STATUS.RESOLVED].includes(p.status)).length}
  ].forEach(set);
}

// ── 驗收 Sheet 開啟 ───────────────────────────────────
function openReceiveSheet(date, idx) {
  const p = getDateProducts(date)[idx];
  if (!p) return;
  currentIdx = { date, idx };
  uploadedPhotos = p.received ? [...p.photos] : [];

  const isResolved = p.status === STATUS.RESOLVED;
  document.getElementById('receiveSheetTitle').textContent = p.status===STATUS.PENDING ? '驗收登錄' : (isResolved ? '已處理（唯讀）' : '修改驗收');

  const body = document.getElementById('receiveSheetBody');
  body.innerHTML = `
    <div style="background:#f9fafb;border-radius:14px;padding:14px;margin-bottom:16px">
      <div style="font-size:16px;font-weight:700;color:#111;margin-bottom:6px">${p.name}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:13px;color:#6b7280">
        <div>品號：<b style="color:#374151">${p.itemNo||'—'}</b></div>
        <div>採購單：<b style="color:#374151">${p.po||'—'}</b></div>
        <div>條碼：<b style="color:#374151">${p.barcode||'—'}</b></div>
        <div>採購數量：<b style="color:#4f46e5;font-size:16px">${p.qty}</b></div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">
      <div>
        <label class="field-label">良品數量 *</label>
        <input id="rs-good" type="number" min="0" value="${p.received?p.goodQty:p.qty}" class="input" style="font-size:20px;font-weight:700;text-align:center" oninput="onRsBadInput()" ${isResolved?'readonly':''} />
      </div>
      <div>
        <label class="field-label">不良品數量</label>
        <input id="rs-bad" type="number" min="0" value="${p.received?p.badQty:''}" class="input" style="font-size:20px;font-weight:700;text-align:center;color:#dc2626" oninput="onRsBadInput()" ${isResolved?'readonly':''} />
      </div>
    </div>
    <div id="rs-defect" style="${(!p.received||p.badQty<=0)?'display:none':''}">
      <div style="background:#fef2f2;border-radius:14px;padding:14px;margin-bottom:16px">
        <div style="font-size:12px;font-weight:700;color:#dc2626;text-transform:uppercase;letter-spacing:.05em;margin-bottom:10px">異常資訊</div>
        <div style="margin-bottom:12px">
          <label class="field-label">異常分類</label>
          <select id="rs-class" class="input" ${isResolved?'disabled':''}>
            <option ${p.defectClass==='其他異常'?'selected':''}>其他異常</option>
            <option ${p.defectClass==='效期異常'?'selected':''}>效期異常</option>
            <option ${p.defectClass==='數量異常'?'selected':''}>數量異常</option>
            <option ${p.defectClass==='品名異常'?'selected':''}>品名異常</option>
          </select>
        </div>
        <div style="margin-bottom:12px">
          <label class="field-label">異常原因（可複選）</label>
          <div style="display:flex;flex-wrap:wrap;gap:2px">${DEFECT_REASONS.map(r=>`<span class="reason-chip ${(p.defectReasons||[]).includes(r)?'selected':''}" onclick="${isResolved?'':` toggleReason(this)`}">${r}</span>`).join('')}</div>
        </div>
        <div style="margin-bottom:12px">
          <label class="field-label">其他說明</label>
          <textarea id="rs-note" class="input" rows="2" style="resize:none" ${isResolved?'readonly':''}>${p.defectNote||''}</textarea>
        </div>
      </div>
    </div>
    <div style="margin-bottom:16px">
      <label class="field-label">上傳照片（最多 6 張）</label>
      <div id="rs-photos" style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px"></div>
      <input type="file" id="rs-photoInput" accept="image/*" multiple class="hidden" onchange="handlePhotoUpload(this,'rs-photos')" />
      <p id="rs-photoCount" style="font-size:12px;color:#9ca3af;margin-top:6px;text-align:center">已上傳 ${uploadedPhotos.length} / 6 張</p>
    </div>
    <div id="rs-error" style="display:none;padding:12px;background:#fee2e2;border-radius:12px;font-size:13px;color:#991b1b;margin-bottom:12px"></div>
    ${isResolved ? `<button onclick="closeAllSheets()" class="btn" style="width:100%;background:#f3f4f6;color:#374151;border:none">關閉</button>`
    : `<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <button onclick="closeAllSheets()" class="btn" style="background:#f3f4f6;color:#374151;border:none">取消</button>
        <button onclick="saveReceiving()" class="btn btn-primary">確認驗收</button>
       </div>`}`;

  renderPhotoSlots('rs-photos', uploadedPhotos, 'rs-photoInput', 'rs-photoCount');
  openSheet('receiveSheet');
}

function onRsBadInput() {
  const good = parseInt(document.getElementById('rs-good')?.value)||0;
  const bad  = parseInt(document.getElementById('rs-bad')?.value)||0;
  if (currentIdx) {
    const p = getDateProducts(currentIdx.date)[currentIdx.idx];
    const auto = Math.max(0, p.qty - bad);
    document.getElementById('rs-good').value = auto;
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
  const reasons = [...document.querySelectorAll('#receiveSheet .reason-chip.selected')].map(el=>el.textContent);
  if (bad>0 && reasons.length===0) { errDiv.textContent='有不良品時，請至少選擇一個異常原因'; errDiv.style.display='block'; return; }
  const { date, idx } = currentIdx;
  const p = getDateProducts(date)[idx];
  const user = getCurrentUser();
  p.received=true; p.goodQty=good; p.badQty=bad;
  p.defectClass=document.getElementById('rs-class')?.value||'其他異常';
  p.defectReasons=reasons; p.defectNote=document.getElementById('rs-note')?.value.trim()||'';
  p.defectStaff=user?.name||''; p.photos=[...uploadedPhotos];
  p.time=nowStr(); p.operatorName=user?.name||'';
  p.status = bad>0 ? STATUS.ABNORMAL : STATUS.RECEIVED;
  if (p.id) {
    ProductAPI.receive(p.id, {goodQty:good,badQty:bad,defectReasons:reasons,defectNote:p.defectNote,defectClass:p.defectClass,photos:p.photos})
      .then(async()=>{ await reloadFromFirestore(date); renderProductCards(); updateStats(); updateBadges(); })
      .catch(e=>console.warn('receive:',e.message));
  } else { saveProductsData(); }
  closeAllSheets();
}

// ══════════════════════════════════════════════════════
// ── 2. 入庫清單 ────────────────────────────────────────
// ══════════════════════════════════════════════════════
function renderWarehouseCards() {
  const container = document.getElementById('warehouseListContainer');
  if (!container) return;
  const from = document.getElementById('wh-from')?.value;
  const to   = document.getElementById('wh-to')?.value;
  let list = getAllProducts().filter(p=>p.status!==STATUS.PENDING);
  if (from) list = list.filter(p=>!p.arrivalDate||p.arrivalDate>=from);
  if (to)   list = list.filter(p=>!p.arrivalDate||p.arrivalDate<=to);
  if (!list.length) { container.innerHTML='<div class="empty-state"><svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style="width:64px;height:64px;opacity:.3"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/></svg><p style="font-size:15px;font-weight:600;margin-top:12px">尚無已驗收資料</p></div>'; return; }
  container.innerHTML = list.map(p => `
    <div class="product-card slide-up">
      <div class="product-card-header">
        <div style="flex:1"><div style="font-size:15px;font-weight:700;color:#111">${p.name}</div>
        <div style="font-size:12px;color:#6b7280">${p.arrivalDate||'—'} · ${p.itemNo||'—'}</div></div>
        ${p.badQty>0 ? '<span class="badge badge-abnormal">有異常</span>' : '<span class="badge badge-done">正常</span>'}
      </div>
      <div class="product-card-footer">
        <div style="display:flex;gap:16px">
          <div><div style="font-size:11px;color:#9ca3af">良品</div><div style="font-size:16px;font-weight:700;color:#059669">${p.goodQty}</div></div>
          <div><div style="font-size:11px;color:#9ca3af">不良品</div><div style="font-size:16px;font-weight:700;color:#dc2626">${p.badQty}</div></div>
        </div>
        ${p.photos.length>0 ? `<span style="color:#4f46e5;font-size:13px;cursor:pointer" onclick="viewPhotos('${p.arrivalDate}','${p.itemNo}')">${p.photos.length} 張照片</span>` : ''}
      </div>
      ${p.defectReasons?.length>0 ? `<div style="padding:0 16px 12px;display:flex;flex-wrap:wrap;gap:4px">${p.defectReasons.map(r=>`<span class="badge badge-abnormal" style="font-size:11px">${r}</span>`).join('')}</div>` : ''}
    </div>`).join('');
}

// ══════════════════════════════════════════════════════
// ── 3. 異常檢核 ────────────────────────────────────────
// ══════════════════════════════════════════════════════
function renderReviewCards() {
  const container = document.getElementById('reviewListContainer');
  if (!container) return;
  const list = getAllProducts().filter(p=>p.badQty>0);
  const pending = list.filter(p=>p.status===STATUS.ABNORMAL).length;
  const proc    = list.filter(p=>p.status===STATUS.PROCUREMENT).length;
  const done    = list.filter(p=>p.status===STATUS.RESOLVED).length;
  const s = (id,v) => { const e=document.getElementById(id); if(e) e.textContent=v; };
  s('rev-stat-pending',pending); s('rev-stat-proc',proc); s('rev-stat-done',done);
  updateBadges();
  if (!list.length) { container.innerHTML='<div class="empty-state"><p>尚無異常資料</p></div>'; return; }
  container.innerHTML = list.map(p => `
    <div class="product-card slide-up" onclick="${p.status!==STATUS.RESOLVED?`openReviewSheet('${p.arrivalDate}','${p.itemNo}')`:``}" style="${p.status===STATUS.RESOLVED?'opacity:.7':''}">
      <div class="product-card-header">
        <div style="flex:1"><div style="font-size:15px;font-weight:700;color:#111">${p.name}</div>
        <div style="font-size:12px;color:#6b7280">${p.arrivalDate||'—'} · 不良：${p.badQty} 件</div></div>
        <span class="badge ${p.status===STATUS.RESOLVED?'badge-resolved':p.status===STATUS.PROCUREMENT?'badge-proc':'badge-abnormal'}">${{abnormal_pending:'待檢核',procurement:'待採購',resolved:'已處理'}[p.status]||p.status}</span>
      </div>
      ${p.defectReasons?.length>0 ? `<div style="padding:0 16px 12px;display:flex;flex-wrap:wrap;gap:4px">${p.defectReasons.map(r=>`<span class="badge badge-abnormal" style="font-size:11px">${r}</span>`).join('')}</div>` : ''}
      ${p.photos.length>0 ? `<div style="padding:0 16px 12px"><span style="color:#4f46e5;font-size:13px;cursor:pointer" onclick="event.stopPropagation();viewPhotos('${p.arrivalDate}','${p.itemNo}')">${p.photos.length} 張照片 ›</span></div>` : ''}
    </div>`).join('');
}

function openReviewSheet(arrivalDate, itemNo) {
  const p = getAllProducts().find(x=>x.arrivalDate===arrivalDate && x.itemNo===itemNo);
  if (!p) return;
  reviewIdx = { arrivalDate, itemNo };
  _reviewStartTime = nowHHMM();
  const body = document.getElementById('reviewSheetBody');
  body.innerHTML = `
    <div style="background:#fff7ed;border-radius:14px;padding:14px;margin-bottom:16px">
      <div style="font-size:12px;font-weight:700;color:#d97706;margin-bottom:8px">現場記錄</div>
      <div style="font-size:15px;font-weight:700;color:#111;margin-bottom:4px">${p.name}</div>
      <div style="font-size:13px;color:#6b7280;margin-bottom:8px">不良品：${p.badQty} 件</div>
      <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:6px">${(p.defectReasons||[]).map(r=>`<span class="badge badge-abnormal" style="font-size:11px">${r}</span>`).join('')||'無'}</div>
      ${p.defectNote?`<div style="font-size:13px;color:#6b7280">${p.defectNote}</div>`:''}
      ${p.photos.length>0?`<div style="margin-top:8px;display:flex;gap:6px;overflow-x:auto">${p.photos.map((s,i)=>`<img src="${s}" onclick="viewPhotos('${arrivalDate}','${itemNo}',${i})" style="width:60px;height:60px;border-radius:8px;object-fit:cover;flex-shrink:0" />`).join('')}</div>`:''}
    </div>
    <div style="margin-bottom:12px">
      <label class="field-label">連動時間</label>
      <input id="rv-time" class="input" value="${p.defectTime||_reviewStartTime+'～'}" placeholder="09:00～09:30" />
    </div>
    <div style="margin-bottom:12px">
      <label class="field-label">異常分類</label>
      <select id="rv-class" class="input">
        ${['其他異常','效期異常','數量異常','品名異常'].map(v=>`<option ${p.defectClass===v?'selected':''}>${v}</option>`).join('')}
      </select>
    </div>
    <div style="margin-bottom:12px">
      <label class="field-label">異常原因（可複選）</label>
      <div style="display:flex;flex-wrap:wrap;gap:2px">${DEFECT_REASONS.map(r=>`<span class="reason-chip ${(p.defectReasons||[]).includes(r)?'selected':''}" onclick="toggleReason(this)">${r}</span>`).join('')}</div>
    </div>
    <div style="margin-bottom:20px">
      <label class="field-label">補充說明</label>
      <textarea id="rv-note" class="input" rows="2" style="resize:none">${p.defectNote||''}</textarea>
    </div>
    <div id="rv-error" style="display:none;padding:12px;background:#fee2e2;border-radius:12px;font-size:13px;color:#991b1b;margin-bottom:12px"></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <button onclick="closeAllSheets()" class="btn" style="background:#f3f4f6;color:#374151;border:none">取消</button>
      <button onclick="submitReview()" class="btn" style="background:#f59e0b;color:#fff;border:none">確認・轉採購</button>
    </div>`;
  openSheet('reviewSheet');
}

async function submitReview() {
  const { arrivalDate, itemNo } = reviewIdx;
  const p     = getAllProducts().find(x=>x.arrivalDate===arrivalDate&&x.itemNo===itemNo);
  const rvUser= getCurrentUser();
  let dt = document.getElementById('rv-time').value.trim();
  if (!dt) dt = `${_reviewStartTime}～`;
  p.defectTime    = dt;
  p.defectClass   = document.getElementById('rv-class').value;
  p.defectReasons = [...document.querySelectorAll('#reviewSheet .reason-chip.selected')].map(el=>el.textContent);
  p.defectNote    = document.getElementById('rv-note').value.trim();
  p.defectStaff   = rvUser?.name||'';
  p.status        = STATUS.PROCUREMENT;
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
  container.innerHTML = list.map(p => `
    <div class="product-card slide-up">
      <div class="product-card-header">
        <div style="flex:1"><div style="font-size:15px;font-weight:700;color:#111">${p.name}</div>
        <div style="font-size:12px;color:#6b7280">${p.arrivalDate||'—'} · ${p.defectTime||'—'}</div></div>
        <span class="badge" style="background:#fee2e2;color:#991b1b;font-size:11px">${p.defectClass||'其他異常'}</span>
      </div>
      <div style="padding:0 16px 10px">
        <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:6px">${(p.defectReasons||[]).map(r=>`<span class="badge badge-abnormal" style="font-size:11px">${r}</span>`).join('')||'—'}</div>
        ${p.defectNote?`<div style="font-size:13px;color:#6b7280;margin-bottom:4px">${p.defectNote}</div>`:''}
        <div style="font-size:12px;color:#9ca3af">物流專員：${p.defectStaff||'—'}</div>
        ${p.procAction?`<div style="margin-top:6px;padding:8px;background:#d1fae5;border-radius:10px;font-size:13px;font-weight:600;color:#065f46">採購回覆：${p.procAction}${p.procReply?'・'+p.procReply:''}</div>`:''}
      </div>
    </div>`).join('');
}

// ══════════════════════════════════════════════════════
// ── 5. 採購待回覆 ──────────────────────────────────────
// ══════════════════════════════════════════════════════
function renderPurchaseCards() {
  const container = document.getElementById('purchaseListContainer');
  if (!container) return;
  const list = getAllProducts().filter(p=>p.status===STATUS.PROCUREMENT);
  updateBadges();
  if (!list.length) { container.innerHTML='<div class="empty-state"><p style="font-size:15px;font-weight:600">尚無待回覆項目</p></div>'; return; }
  container.innerHTML = list.map(p => `
    <div class="product-card slide-up" onclick="openPurchaseSheet('${p.arrivalDate}','${p.itemNo}')">
      <div class="product-card-header">
        <div style="flex:1"><div style="font-size:15px;font-weight:700;color:#111">${p.name}</div>
        <div style="font-size:12px;color:#6b7280">${p.arrivalDate||'—'} · 不良：${p.badQty} 件</div></div>
        <span class="badge badge-proc">待回覆</span>
      </div>
      <div style="padding:0 16px 12px">
        <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:6px">${(p.defectReasons||[]).map(r=>`<span class="badge badge-abnormal" style="font-size:11px">${r}</span>`).join('')||'—'}</div>
        <div style="font-size:12px;color:#9ca3af">物流專員：${p.defectStaff||'—'}</div>
        ${p.defectNote?`<div style="font-size:13px;color:#6b7280;margin-top:4px">${p.defectNote}</div>`:''}
        ${p.photos.length>0?`<span style="color:#4f46e5;font-size:13px;cursor:pointer;display:block;margin-top:6px" onclick="event.stopPropagation();viewPhotos('${p.arrivalDate}','${p.itemNo}')">${p.photos.length} 張照片 ›</span>`:''}
      </div>
    </div>`).join('');
}

function openPurchaseSheet(arrivalDate, itemNo) {
  const p = getAllProducts().find(x=>x.arrivalDate===arrivalDate&&x.itemNo===itemNo);
  if (!p) return;
  purchaseIdx = { arrivalDate, itemNo };
  const body = document.getElementById('purchaseSheetBody');
  body.innerHTML = `
    <div style="background:#f9fafb;border-radius:14px;padding:14px;margin-bottom:16px">
      <div style="font-size:16px;font-weight:700;color:#111;margin-bottom:6px">${p.name}</div>
      <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:6px">${(p.defectReasons||[]).map(r=>`<span class="badge badge-abnormal" style="font-size:11px">${r}</span>`).join('')}</div>
      <div style="font-size:13px;color:#6b7280">${p.defectNote||'—'}</div>
      <div style="font-size:12px;color:#9ca3af;margin-top:4px">物流專員：${p.defectStaff||'—'}</div>
    </div>
    <div style="margin-bottom:14px">
      <label class="field-label">處理方式 *</label>
      <select id="pur-action" class="input" style="appearance:auto">
        <option value="">請選擇</option>
        ${PROC_ACTIONS.map(v=>`<option>${v}</option>`).join('')}
      </select>
    </div>
    <div style="margin-bottom:20px">
      <label class="field-label">回覆說明</label>
      <textarea id="pur-reply" class="input" rows="3" style="resize:none" placeholder="詳細說明處理方式…"></textarea>
    </div>
    <div id="pur-error" style="display:none;padding:12px;background:#fee2e2;border-radius:12px;font-size:13px;color:#991b1b;margin-bottom:12px"></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <button onclick="closeAllSheets()" class="btn" style="background:#f3f4f6;color:#374151;border:none">取消</button>
      <button onclick="submitPurchaseReply()" class="btn btn-primary">確認回覆</button>
    </div>`;
  openSheet('purchaseSheet');
}

async function submitPurchaseReply() {
  const errDiv = document.getElementById('pur-error');
  const action = document.getElementById('pur-action').value;
  if (!action) { errDiv.textContent='請選擇處理方式'; errDiv.style.display='block'; return; }
  errDiv.style.display='none';
  const { arrivalDate, itemNo } = purchaseIdx;
  const p     = getAllProducts().find(x=>x.arrivalDate===arrivalDate&&x.itemNo===itemNo);
  const purUser = getCurrentUser();
  p.procAction=action; p.procReply=document.getElementById('pur-reply').value.trim();
  p.procReplyTime=nowStr(); p.procStaffName=purUser?.name||''; p.status=STATUS.RESOLVED;
  let dt = p.defectTime||'';
  if (dt.endsWith('～')) dt += nowHHMM();
  p.defectTime = dt;
  if (p.id) {
    ProductAPI.reply(p.id, {procAction:action,procReply:p.procReply})
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
  const list = getAllProducts().filter(p=>p.status===STATUS.RESOLVED);
  if (!list.length) { container.innerHTML='<div class="empty-state"><p>尚無已處理記錄</p></div>'; return; }
  container.innerHTML = list.map(p => `
    <div class="product-card slide-up">
      <div class="product-card-header">
        <div style="flex:1"><div style="font-size:15px;font-weight:700;color:#111">${p.name}</div>
        <div style="font-size:12px;color:#6b7280">${p.arrivalDate||'—'} · ${p.defectTime||'—'}</div></div>
        <span class="badge badge-resolved">已處理</span>
      </div>
      <div style="padding:0 16px 12px">
        <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px">${(p.defectReasons||[]).map(r=>`<span class="badge badge-abnormal" style="font-size:11px">${r}</span>`).join('')}</div>
        <div style="padding:10px;background:#d1fae5;border-radius:10px;font-size:14px;font-weight:700;color:#065f46">${p.procAction}</div>
        ${p.procReply?`<div style="font-size:13px;color:#6b7280;margin-top:6px">${p.procReply}</div>`:''}
        <div style="font-size:12px;color:#9ca3af;margin-top:4px">物流：${p.defectStaff||'—'} · 採購：${p.procStaffName||'—'}</div>
      </div>
    </div>`).join('');
}

// ══════════════════════════════════════════════════════
// ── 7. 帳號管理 ────────────────────────────────════════
// ══════════════════════════════════════════════════════
async function loadAndRenderAdmin() {
  try {
    const [roles, users] = await Promise.all([RoleAPI.list(), UserAPI.list()]);
    saveRoles(roles); saveUsers(users);
  } catch(e) { console.warn('admin load:', e.message); }
  renderRoleCards(); renderUserCards(); refreshRoleOptions();
  const user = getCurrentUser();
  const el = document.getElementById('userDisplay-a');
  if (el) el.textContent = `${user?.name||''} · ${getRoleName(currentRole)}`;
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
        <div style="display:flex;flex-wrap:wrap;gap:4px">${(r.tabs||[]).map(t=>`<span style="font-size:11px;background:#ede9fe;color:#4f46e5;border-radius:8px;padding:2px 8px">${TAB_LABELS[t]||t}</span>`).join('')}</div>
      </div>
      <div style="display:flex;gap:8px;flex-shrink:0;margin-left:12px">
        <button onclick="openEditRoleSheet(${i})" class="btn btn-sm" style="background:#ede9fe;color:#4f46e5;border:none">編輯</button>
        <button onclick="deleteRole(${i})" class="btn btn-sm" style="background:#fee2e2;color:#991b1b;border:none">刪除</button>
      </div>
    </div>`).join('');
}

function renderUserCards() {
  const container = document.getElementById('userListContainer');
  if (!container) return;
  const users = getUsers();
  if (!users.length) { container.innerHTML='<div style="padding:16px;font-size:13px;color:#9ca3af">尚無帳號</div>'; return; }
  const roleColors = { admin:'background:#ede9fe;color:#4f46e5', pending:'background:#f3f4f6;color:#6b7280' };
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
  nb('review',  all.filter(p=>p.status===STATUS.ABNORMAL).length);
  nb('purchase', all.filter(p=>p.status===STATUS.PROCUREMENT).length);
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
  thumbs.innerHTML=_photoList.map((s,i)=>`<img src="${s}" onclick="jumpPhoto(${i})" style="width:56px;height:56px;border-radius:10px;object-fit:cover;flex-shrink:0;${i===_photoIdx?'border:3px solid #4f46e5;':'opacity:.5'};cursor:pointer" />`).join('');
}
function shiftPhoto(dir){_photoIdx=(_photoIdx+dir+_photoList.length)%_photoList.length;renderPhotoSheet();}
function jumpPhoto(i){_photoIdx=i;renderPhotoSheet();}

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
