/**
 * 日翊收發進貨平台 - Firebase 後端（Compat SDK）
 */
const firebaseConfig = {
  apiKey:"AIzaSyDenrHO9G8TRxs3glpQLwG7HymXTqqyCRk",authDomain:"reyi-mailroom.firebaseapp.com",
  projectId:"reyi-mailroom",storageBucket:"reyi-mailroom.firebasestorage.app",
  messagingSenderId:"119280647295",appId:"1:119280647295:web:a97bd142a57f4ef89e934a"
};
firebase.initializeApp(firebaseConfig);
const db=firebase.firestore();
const COL={users:'users',roles:'roles',products:'products',auditLogs:'audit_logs'};
function nowStr(){return new Date().toLocaleString('zh-TW');}
async function hashPassword(pw){
  const buf=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(pw));
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
}
async function logAction(a,t,d){
  try{const u=getCurrentUser();await db.collection(COL.auditLogs).add({userId:u?.userId||'',userName:u?.name||'',action:a,target:t||'',detail:d||'',createdAt:firebase.firestore.FieldValue.serverTimestamp()});}catch(e){}
}
async function ensureAdmin(){const s=await db.collection(COL.users).doc('reyi').get();if(!s.exists)console.warn('Admin not found. Create in Firestore > users > reyi');}
const AuthAPI={
  async login(userId,password){
    const s=await db.collection(COL.users).doc(userId).get();
    if(!s.exists)throw new Error('帳號不存在，請先申請帳號');
    const u=s.data();const h=await hashPassword(password);
    if(u.password!==h&&u.password!==password)throw new Error('密碼錯誤，請重新輸入');
    if(u.roleId==='pending')throw new Error('帳號尚待管理員審核，請稍後再試');
    let rn='管理員',tabs=['receiving','warehouse','review','report','purchase','resolved','admin'];
    if(u.roleId!=='admin'){const rs=await db.collection(COL.roles).doc(u.roleId).get();if(rs.exists){rn=rs.data().name;tabs=rs.data().tabs||[];}}
    await logAction('login',userId);
    return{userId:u.userId,name:u.name,roleId:u.roleId,roleName:rn,tabs};
  },
  async logout(){await logAction('logout');sessionStorage.clear();},
  async me(){const u=getCurrentUser();if(!u)throw new Error('未登入');return u;},
  async register(userId,password,name){
    if((await db.collection(COL.users).doc(userId).get()).exists)throw new Error('此帳號已存在');
    await db.collection(COL.users).doc(userId).set({userId,password:await hashPassword(password),name,roleId:'pending',createdAt:nowStr()});
    return `申請成功！帳號「${userId}」已送出，請等待管理員開通後即可登入。`;
  }
};
const RoleAPI={
  async list(){return(await db.collection(COL.roles).get()).docs.map(d=>({id:d.id,...d.data()}));},
  async create(name,tabs){const id='role_'+Date.now();await db.collection(COL.roles).doc(id).set({id,name,tabs,createdAt:nowStr()});return{id,name,tabs};},
  async update(id,name,tabs){await db.collection(COL.roles).doc(id).update({name,tabs});},
  async delete(id){const s=await db.collection(COL.users).where('roleId','==',id).get();await Promise.all(s.docs.map(d=>d.ref.update({roleId:'pending'})));await db.collection(COL.roles).doc(id).delete();}
};
const UserAPI={
  async list(){return(await db.collection(COL.users).get()).docs.map(d=>{const u=d.data();return{userId:d.id,name:u.name,role_id:u.roleId,createdAt:u.createdAt};});},
  async create(userId,password,name,roleId){if((await db.collection(COL.users).doc(userId).get()).exists)throw new Error('此帳號已存在');await db.collection(COL.users).doc(userId).set({userId,password:await hashPassword(password),name,roleId,createdAt:nowStr()});},
  async update(userId,name,roleId,password){const d={name,roleId};if(password)d.password=await hashPassword(password);await db.collection(COL.users).doc(userId).update(d);},
  async delete(userId){if(userId==='reyi')throw new Error('無法刪除管理員帳號');await db.collection(COL.users).doc(userId).delete();}
};
const ProductAPI={
  async getByDate(date){const snap=await db.collection(COL.products).where('arrival_date','==',date).get();return snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(a.seq||0)-(b.seq||0));},
  async getDates(){return[...new Set((await db.collection(COL.products).get()).docs.map(d=>d.data().arrival_date))].filter(Boolean).sort().reverse();},
  async importItems(items,date){let n=0;for(const p of items){const ad=p.arrivalDate||date;const docId=(ad+'_'+(p.itemNo||'x')+'_'+(p.po||'x')).replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,100);const ref=db.collection(COL.products).doc(docId);const snap=await ref.get();if(!snap.exists){await ref.set({arrival_date:ad,seq:p.seq||0,po:p.po||'',cat:p.cat||'',barcode:p.barcode||'',item_no:p.itemNo||'',name:p.name||'',spec:p.spec||'',period:p.period||'',qty:p.qty||0,is_manual:0,status:'pending',received:false,good_qty:0,bad_qty:0,defect_time:'',defect_class:'其他異常',defect_reasons:[],defect_note:'',defect_staff:'',proc_action:'',proc_reply:'',proc_reply_time:'',proc_staff_name:'',operator_id:'',operator_name:'',photos:[],recv_time:''});n++;}}return{inserted:n};},
  async create(data){const ref=await db.collection(COL.products).add({arrival_date:data.arrivalDate||new Date().toLocaleDateString('sv-SE'),seq:data.seq||0,po:data.po||'',cat:data.cat||'',barcode:data.barcode||'',item_no:data.itemNo||'',name:data.name,spec:data.spec||'',period:'',qty:data.qty||0,is_manual:1,status:'pending',received:false,good_qty:0,bad_qty:0,defect_time:'',defect_class:'其他異常',defect_reasons:[],defect_note:'',defect_staff:'',proc_action:'',proc_reply:'',proc_reply_time:'',proc_staff_name:'',operator_id:'',operator_name:'',photos:[],recv_time:''});return{id:ref.id};},
  async delete(id){await db.collection(COL.products).doc(id).delete();},
  async batchDelete(ids){await Promise.all(ids.map(id=>db.collection(COL.products).doc(id).delete()));},
  async receive(id,data){const u=getCurrentUser();const st=(data.badQty||0)>0?'abnormal_pending':'received';const _rcv={received:true,good_qty:data.goodQty||0,bad_qty:data.badQty||0,defect_class:data.defectClass||'其他異常',defect_reasons:data.defectReasons||[],defect_note:data.defectNote||'',photos:data.photos||[],operator_id:u?.userId||'',operator_name:u?.name||'',status:st,recv_time:nowStr()};if(data.defectItems)_rcv.defect_items=data.defectItems;await db.collection(COL.products).doc(id).update(_rcv);return{status:st};},
  async review(id,data){const u=getCurrentUser();const _rev={defect_time:data.defectTime||'',defect_class:data.defectClass||'其他異常',defect_reasons:data.defectReasons||[],defect_note:data.defectNote||'',defect_staff:u?.name||'',status:'procurement'};if(data.defectItems)_rev.defect_items=data.defectItems;await db.collection(COL.products).doc(id).update(_rev);return{status:'procurement'};},
  async reply(id,data){const u=getCurrentUser();const s=await db.collection(COL.products).doc(id).get();let dt=data.defectTime||(s.exists?(s.data().defect_time||''):'');if(dt.endsWith('～'))dt+=new Date().toLocaleTimeString('zh-TW',{hour:'2-digit',minute:'2-digit',hour12:false});const _ri={proc_action:data.procAction||'',proc_reply:data.procReply||'',proc_staff_name:u?.name||'',proc_reply_time:nowStr(),defect_time:dt,status:'resolved',proc_reply_unread:true};if(data.defectItems)_ri.defect_items=data.defectItems;await db.collection(COL.products).doc(id).update(_ri);return{status:'resolved'};}
};
ProductAPI._clearUnread=async function(id){await db.collection(COL.products).doc(id).update({proc_reply_unread:false});};
window.AuthAPI=AuthAPI;window.RoleAPI=RoleAPI;window.UserAPI=UserAPI;window.ProductAPI=ProductAPI;window.ensureAdmin=ensureAdmin;
