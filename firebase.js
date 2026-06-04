/**
 * 日翊收發進貨平台 - Firebase 後端模組
 * Firestore 取代 Flask + SQLite
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.8.1/firebase-app.js";
import {
  getFirestore, collection, doc,
  getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc,
  query, where, orderBy, serverTimestamp, Timestamp
} from "https://www.gstatic.com/firebasejs/11.8.1/firebase-firestore.js";
import {
  getStorage, ref, uploadString, getDownloadURL, deleteObject
} from "https://www.gstatic.com/firebasejs/11.8.1/firebase-storage.js";

// ── Firebase 初始化 ────────────────────────────────────
// Firebase 設定由 config.js 注入（已加入 .gitignore）
const firebaseConfig = window.FIREBASE_CONFIG || {};

const fbApp     = initializeApp(firebaseConfig);
const db        = getFirestore(fbApp);
const storage   = getStorage(fbApp);

// ── Firestore Collection 名稱 ─────────────────────────
const COL = {
  users:     'users',
  roles:     'roles',
  products:  'products',
  auditLogs: 'audit_logs'
};

// ── 工具函式 ──────────────────────────────────────────
function nowStr() {
  return new Date().toLocaleString('zh-TW');
}

// 密碼 SHA-256 雜湊（瀏覽器 Web Crypto API）
async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data    = encoder.encode(password);
  const hashBuf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2,'0')).join('');
}

async function logAction(action, target = '', detail = '') {
  try {
    const user = getCurrentUser();
    await addDoc(collection(db, COL.auditLogs), {
      userId:    user?.userId   || '',
      userName:  user?.name     || '',
      action, target, detail,
      createdAt: serverTimestamp()
    });
  } catch(e) { console.warn('audit log failed:', e.message); }
}

// ── 管理員初始化（首次使用建立 reyi 帳號）──────────────
async function ensureAdmin() {
  const adminRef = doc(db, COL.users, 'reyi');
  const snap     = await getDoc(adminRef);
  if (!snap.exists()) {
    // 管理員帳號需由系統管理員手動建立，不在程式碼中預設密碼
    console.warn('Admin account not found. Please create via Firebase Console > Firestore > users collection.');
  }
}

// ════════════════════════════════════════════════════
// ── 帳號驗證 API ─────────────────────────────────────
// ════════════════════════════════════════════════════

const AuthAPI = {
  async login(userId, password) {
    const snap = await getDoc(doc(db, COL.users, userId));
    if (!snap.exists())          throw new Error('帳號不存在，請先申請帳號');
    const user = snap.data();
    const hashed = await hashPassword(password);
    if (user.password !== hashed && user.password !== password) throw new Error('密碼錯誤，請重新輸入');
    if (user.roleId === 'pending')  throw new Error('帳號尚待管理員審核，請稍後再試');

    // 取得角色資訊
    let roleName = '管理員', tabs = Object.keys(TAB_LABELS);
    if (user.roleId !== 'admin') {
      const roleSnap = await getDoc(doc(db, COL.roles, user.roleId));
      if (roleSnap.exists()) {
        const role = roleSnap.data();
        roleName   = role.name;
        tabs       = role.tabs || [];
      }
    }

    await logAction('login', userId);
    return { userId: user.userId, name: user.name, roleId: user.roleId, roleName, tabs };
  },

  async logout() {
    await logAction('logout');
    sessionStorage.clear();
  },

  async me() {
    const user = getCurrentUser();
    if (!user) throw new Error('未登入');
    return user;
  },

  async register(userId, password, name) {
    const snap = await getDoc(doc(db, COL.users, userId));
    if (snap.exists()) throw new Error('此帳號已存在');
    const hashedPw = await hashPassword(password);
    await setDoc(doc(db, COL.users, userId), {
      userId, password: hashedPw, name, roleId: 'pending', createdAt: nowStr()
    });
    return `申請成功！帳號「${userId}」已送出，請等待管理員開通後即可登入。`;
  }
};

// ════════════════════════════════════════════════════
// ── 角色管理 API ─────────────────────────────────────
// ════════════════════════════════════════════════════

const RoleAPI = {
  async list() {
    const snap = await getDocs(collection(db, COL.roles));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },

  async create(name, tabs) {
    const id = 'role_' + Date.now();
    await setDoc(doc(db, COL.roles, id), { id, name, tabs, createdAt: nowStr() });
    await logAction('create_role', id, name);
    return { id, name, tabs };
  },

  async update(id, name, tabs) {
    await updateDoc(doc(db, COL.roles, id), { name, tabs });
    await logAction('update_role', id, name);
  },

  async delete(id) {
    // 將持有此角色的帳號改為 pending
    const usersSnap = await getDocs(query(collection(db, COL.users), where('roleId', '==', id)));
    const batch = usersSnap.docs.map(d => updateDoc(d.ref, { roleId: 'pending' }));
    await Promise.all(batch);
    await deleteDoc(doc(db, COL.roles, id));
    await logAction('delete_role', id);
  }
};

// ════════════════════════════════════════════════════
// ── 使用者管理 API ────────────────────────────────────
// ════════════════════════════════════════════════════

const UserAPI = {
  async list() {
    const snap = await getDocs(collection(db, COL.users));
    return snap.docs.map(d => {
      const u = d.data();
      return { userId: d.id, name: u.name, role_id: u.roleId, createdAt: u.createdAt };
    });
  },

  async create(userId, password, name, roleId) {
    const snap = await getDoc(doc(db, COL.users, userId));
    if (snap.exists()) throw new Error('此帳號已存在');
    const hpw = await hashPassword(password);
    await setDoc(doc(db, COL.users, userId), {
      userId, password: hpw, name, roleId, createdAt: nowStr()
    });
    await logAction('create_user', userId);
  },

  async update(userId, name, roleId, password) {
    const data = { name, roleId };
    if (password) data.password = await hashPassword(password);
    await updateDoc(doc(db, COL.users, userId), data);
    await logAction('update_user', userId);
  },

  async delete(userId) {
    if (userId === 'reyi') throw new Error('無法刪除管理員帳號');
    await deleteDoc(doc(db, COL.users, userId));
    await logAction('delete_user', userId);
  }
};

// ════════════════════════════════════════════════════
// ── 進貨資料 API ──────────────────────────────────────
// ════════════════════════════════════════════════════

const ProductAPI = {
  async getByDate(date) {
    const q    = query(collection(db, COL.products), where('arrival_date', '==', date), orderBy('seq'));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },

  async getDates() {
    const snap = await getDocs(collection(db, COL.products));
    const dates = [...new Set(snap.docs.map(d => d.data().arrival_date))].filter(Boolean).sort().reverse();
    return dates;
  },

  async importItems(items, date) {
    let inserted = 0;
    for (const p of items) {
      const arrDate = p.arrivalDate || date;
      // 去重：同日期+品號+採購單
      const q = query(collection(db, COL.products),
        where('arrival_date', '==', arrDate),
        where('item_no', '==', p.itemNo || ''),
        where('po', '==', p.po || ''));
      const exists = await getDocs(q);
      if (exists.empty) {
        await addDoc(collection(db, COL.products), {
          arrival_date: arrDate,
          seq:      p.seq    || 0,
          po:       p.po     || '',
          cat:      p.cat    || '',
          barcode:  p.barcode|| '',
          item_no:  p.itemNo || '',
          name:     p.name   || '',
          spec:     p.spec   || '',
          period:   p.period || '',
          qty:      p.qty    || 0,
          is_manual:    0,
          status:       'pending',
          received:     false,
          good_qty:     0,  bad_qty: 0,
          defect_time:  '',  defect_class: '其他異常',
          defect_reasons: [],  defect_note: '',  defect_staff: '',
          proc_action:  '',  proc_reply: '',  proc_reply_time: '',
          proc_staff_name: '',
          operator_id: '',  operator_name: '',
          photos:   [],  recv_time: ''
        });
        inserted++;
      }
    }
    await logAction('import', date, `${inserted} 筆`);
    return { inserted };
  },

  async create(data) {
    const ref = await addDoc(collection(db, COL.products), {
      arrival_date: data.arrivalDate || new Date().toLocaleDateString('sv-SE'),
      seq:      data.seq  || 0,
      po:       data.po   || '',
      cat:      data.cat  || '',
      barcode:  data.barcode || '',
      item_no:  data.itemNo  || '',
      name:     data.name,
      spec:     data.spec || '',
      period:   '',
      qty:      data.qty  || 0,
      is_manual: 1,
      status:   'pending',
      received: false,
      good_qty: 0,  bad_qty: 0,
      defect_time: '',  defect_class: '其他異常',
      defect_reasons: [],  defect_note: '',  defect_staff: '',
      proc_action: '',  proc_reply: '',  proc_reply_time: '',
      proc_staff_name: '',
      operator_id: '',  operator_name: '',
      photos: [],  recv_time: ''
    });
    await logAction('manual_add', ref.id, data.name);
    return { id: ref.id };
  },

  async delete(id) {
    await deleteDoc(doc(db, COL.products, id));
  },

  async batchDelete(ids) {
    await Promise.all(ids.map(id => deleteDoc(doc(db, COL.products, id))));
  },

  async receive(id, data) {
    const user   = getCurrentUser();
    const status = (data.badQty || 0) > 0 ? 'abnormal_pending' : 'received';
    await updateDoc(doc(db, COL.products, id), {
      received:       true,
      good_qty:       data.goodQty       || 0,
      bad_qty:        data.badQty        || 0,
      defect_class:   data.defectClass   || '其他異常',
      defect_reasons: data.defectReasons || [],
      defect_note:    data.defectNote    || '',
      photos:         data.photos        || [],
      operator_id:    user?.userId || '',
      operator_name:  user?.name   || '',
      status,
      recv_time: nowStr()
    });
    await logAction('receive', id, `良${data.goodQty} 不良${data.badQty}`);
    return { status };
  },

  async review(id, data) {
    const user = getCurrentUser();
    await updateDoc(doc(db, COL.products, id), {
      defect_time:    data.defectTime    || '',
      defect_class:   data.defectClass   || '其他異常',
      defect_reasons: data.defectReasons || [],
      defect_note:    data.defectNote    || '',
      defect_staff:   user?.name         || '',
      status:         'procurement'
    });
    await logAction('review', id, user?.name || '');
    return { status: 'procurement' };
  },

  async reply(id, data) {
    const user = getCurrentUser();
    // 補連動結束時間
    const snap = await getDoc(doc(db, COL.products, id));
    let defectTime = snap.exists() ? (snap.data().defect_time || '') : '';
    if (defectTime.endsWith('～')) {
      defectTime += new Date().toLocaleTimeString('zh-TW', { hour:'2-digit', minute:'2-digit', hour12: false });
    }
    await updateDoc(doc(db, COL.products, id), {
      proc_action:    data.procAction || '',
      proc_reply:     data.procReply  || '',
      proc_staff_name: user?.name     || '',
      proc_reply_time: nowStr(),
      defect_time:    defectTime,
      status:         'resolved'
    });
    await logAction('reply', id, `${user?.name}: ${data.procAction}`);
    return { status: 'resolved' };
  }
};

// ── 匯出給全域使用 ────────────────────────────────────
window.AuthAPI    = AuthAPI;
window.RoleAPI    = RoleAPI;
window.UserAPI    = UserAPI;
window.ProductAPI = ProductAPI;
window.ensureAdmin = ensureAdmin;

export { AuthAPI, RoleAPI, UserAPI, ProductAPI, ensureAdmin, db };
