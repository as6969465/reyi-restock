"""
日翊收發進貨平台 - 後端 API Server
Python Flask + SQLite
"""

import os, json, sqlite3, uuid
from datetime import datetime, date
from functools import wraps
from flask import Flask, request, jsonify, session, g
from flask_cors import CORS

# ── App 設定 ─────────────────────────────────────────
app = Flask(__name__, static_folder='.', static_url_path='')
app.secret_key = os.environ.get('SECRET_KEY', 'reyi-restock-secret-2024')
app.config['SESSION_TYPE'] = 'filesystem'
app.config['SESSION_PERMANENT'] = False
CORS(app, supports_credentials=True, origins=['http://localhost:3000', 'http://localhost:5000', 'http://127.0.0.1:5000'])

DB_PATH = os.path.join(os.path.dirname(__file__), 'reyi_restock.db')

# ── 資料庫初始化 ─────────────────────────────────────
def get_db():
    if 'db' not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
        g.db.execute('PRAGMA foreign_keys = ON')
    return g.db

@app.teardown_appcontext
def close_db(e=None):
    db = g.pop('db', None)
    if db: db.close()

def init_db():
    db = sqlite3.connect(DB_PATH)
    db.row_factory = sqlite3.Row
    c = db.cursor()

    # 角色表
    c.execute('''CREATE TABLE IF NOT EXISTS roles (
        id        TEXT PRIMARY KEY,
        name      TEXT NOT NULL UNIQUE,
        tabs      TEXT NOT NULL DEFAULT '[]',
        created_at TEXT DEFAULT (datetime('now','localtime'))
    )''')

    # 使用者表
    c.execute('''CREATE TABLE IF NOT EXISTS users (
        user_id    TEXT PRIMARY KEY,
        password   TEXT NOT NULL,
        name       TEXT NOT NULL,
        role_id    TEXT NOT NULL DEFAULT 'pending',
        created_at TEXT DEFAULT (datetime('now','localtime'))
    )''')

    # 進貨資料表
    c.execute('''CREATE TABLE IF NOT EXISTS products (
        id           TEXT PRIMARY KEY,
        arrival_date TEXT NOT NULL,
        seq          INTEGER,
        po           TEXT DEFAULT '',
        cat          TEXT DEFAULT '',
        barcode      TEXT DEFAULT '',
        item_no      TEXT DEFAULT '',
        name         TEXT NOT NULL,
        spec         TEXT DEFAULT '',
        period       TEXT DEFAULT '',
        qty          INTEGER DEFAULT 0,
        is_manual    INTEGER DEFAULT 0,
        status       TEXT DEFAULT 'pending',
        received     INTEGER DEFAULT 0,
        good_qty     INTEGER DEFAULT 0,
        bad_qty      INTEGER DEFAULT 0,
        defect_time  TEXT DEFAULT '',
        defect_class TEXT DEFAULT '其他異常',
        defect_reasons TEXT DEFAULT '[]',
        defect_note  TEXT DEFAULT '',
        defect_staff TEXT DEFAULT '',
        proc_contact TEXT DEFAULT '',
        proc_action  TEXT DEFAULT '',
        proc_reply   TEXT DEFAULT '',
        proc_reply_time TEXT DEFAULT '',
        proc_staff_name TEXT DEFAULT '',
        operator_id  TEXT DEFAULT '',
        operator_name TEXT DEFAULT '',
        photos       TEXT DEFAULT '[]',
        recv_time    TEXT DEFAULT '',
        created_at   TEXT DEFAULT (datetime('now','localtime'))
    )''')

    # 操作日誌
    c.execute('''CREATE TABLE IF NOT EXISTS audit_logs (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id    TEXT,
        user_name  TEXT,
        action     TEXT,
        target     TEXT,
        detail     TEXT,
        created_at TEXT DEFAULT (datetime('now','localtime'))
    )''')

    # 預設管理員（密碼由環境變數 ADMIN_PASSWORD 設定，勿在程式碼中硬編碼）
    admin = c.execute("SELECT * FROM users WHERE user_id='reyi'").fetchone()
    if not admin:
        _admin_pw = os.environ.get('ADMIN_PASSWORD', '')
        c.execute("INSERT INTO users (user_id, password, name, role_id) VALUES (?,?,?,?)",
                  ('reyi', _admin_pw, '管理員', 'admin'))

    db.commit()
    db.close()
    print('DB initialized OK')

def log_action(action, target='', detail=''):
    try:
        db = get_db()
        user_id   = session.get('user_id', '')
        user_name = session.get('user_name', '')
        db.execute('INSERT INTO audit_logs (user_id, user_name, action, target, detail) VALUES (?,?,?,?,?)',
                   (user_id, user_name, action, target, detail))
        db.commit()
    except Exception:
        pass

# ── 工具函式 ─────────────────────────────────────────
def row_to_dict(row):
    if row is None: return None
    d = dict(row)
    # JSON 欄位反序列化
    for key in ('tabs', 'defect_reasons', 'photos'):
        if key in d and isinstance(d[key], str):
            try: d[key] = json.loads(d[key])
            except Exception: d[key] = []
    return d

def ok(data=None, msg='success'):
    return jsonify({'success': True, 'message': msg, 'data': data})

def err(msg, code=400):
    return jsonify({'success': False, 'message': msg, 'data': None}), code

def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if not session.get('user_id'):
            return err('請先登入', 401)
        return f(*args, **kwargs)
    return decorated

def admin_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if not session.get('user_id'):
            return err('請先登入', 401)
        if session.get('role_id') != 'admin':
            return err('權限不足，僅管理員可操作', 403)
        return f(*args, **kwargs)
    return decorated

# ── 靜態頁面 ─────────────────────────────────────────
@app.route('/')
def index():
    return app.send_static_file('index.html')

@app.route('/main.html')
def main():
    return app.send_static_file('main.html')

# ════════════════════════════════════════════════════
# ── 帳號驗證 API ─────────────────────────────────────
# ════════════════════════════════════════════════════

@app.route('/api/auth/login', methods=['POST'])
def login():
    data    = request.get_json() or {}
    user_id = data.get('userId', '').strip()
    password = data.get('password', '')

    if not user_id or not password:
        return err('帳號密碼不可空白')

    db   = get_db()
    user = row_to_dict(db.execute('SELECT * FROM users WHERE user_id=?', (user_id,)).fetchone())

    if not user:
        return err('帳號不存在，請先申請帳號')
    if user['password'] != password:
        return err('密碼錯誤，請重新輸入')
    if user['role_id'] == 'pending':
        return err('帳號尚待管理員審核，請稍後再試')

    # 取得角色資訊
    role = None
    if user['role_id'] == 'admin':
        role = {'id': 'admin', 'name': '管理員', 'tabs': ['receiving','warehouse','review','report','purchase','resolved','admin']}
    else:
        role = row_to_dict(db.execute('SELECT * FROM roles WHERE id=?', (user['role_id'],)).fetchone())

    session['user_id']   = user['user_id']
    session['user_name'] = user['name']
    session['role_id']   = user['role_id']
    session['role_name'] = role['name'] if role else user['role_id']

    log_action('login', user_id)
    return ok({
        'userId':   user['user_id'],
        'name':     user['name'],
        'roleId':   user['role_id'],
        'roleName': role['name'] if role else '',
        'tabs':     role['tabs'] if role else []
    })

@app.route('/api/auth/logout', methods=['POST'])
def logout():
    log_action('logout')
    session.clear()
    return ok(msg='已登出')

@app.route('/api/auth/me', methods=['GET'])
@login_required
def me():
    db   = get_db()
    role = None
    if session['role_id'] == 'admin':
        role = {'id': 'admin', 'name': '管理員', 'tabs': ['receiving','warehouse','review','report','purchase','resolved','admin']}
    else:
        role = row_to_dict(db.execute('SELECT * FROM roles WHERE id=?', (session['role_id'],)).fetchone())
    return ok({
        'userId':   session['user_id'],
        'name':     session['user_name'],
        'roleId':   session['role_id'],
        'roleName': session.get('role_name',''),
        'tabs':     role['tabs'] if role else []
    })

@app.route('/api/auth/register', methods=['POST'])
def register():
    data     = request.get_json() or {}
    user_id  = data.get('userId','').strip()
    password = data.get('password','')
    name     = data.get('name','').strip()

    if not user_id or not password or not name:
        return err('帳號、密碼、姓名為必填')

    db = get_db()
    if db.execute('SELECT 1 FROM users WHERE user_id=?', (user_id,)).fetchone():
        return err('此帳號已存在')

    db.execute('INSERT INTO users (user_id, password, name, role_id) VALUES (?,?,?,?)',
               (user_id, password, name, 'pending'))
    db.commit()
    log_action('register', user_id)
    return ok(msg=f'申請成功！帳號「{user_id}」已送出，請等待管理員審核後即可登入。')

# ════════════════════════════════════════════════════
# ── 角色管理 API ─────────────────────────────────────
# ════════════════════════════════════════════════════

@app.route('/api/roles', methods=['GET'])
@login_required
def get_roles():
    db    = get_db()
    roles = [row_to_dict(r) for r in db.execute('SELECT * FROM roles ORDER BY created_at').fetchall()]
    return ok(roles)

@app.route('/api/roles', methods=['POST'])
@admin_required
def create_role():
    data = request.get_json() or {}
    name = data.get('name','').strip()
    tabs = data.get('tabs', [])
    if not name: return err('角色名稱為必填')
    if not tabs: return err('請至少選擇一個功能頁籤')

    db = get_db()
    if db.execute('SELECT 1 FROM roles WHERE name=?', (name,)).fetchone():
        return err('此角色名稱已存在')

    role_id = 'role_' + str(uuid.uuid4())[:8]
    db.execute('INSERT INTO roles (id, name, tabs) VALUES (?,?,?)', (role_id, name, json.dumps(tabs)))
    db.commit()
    log_action('create_role', role_id, name)
    return ok({'id': role_id, 'name': name, 'tabs': tabs})

@app.route('/api/roles/<role_id>', methods=['PUT'])
@admin_required
def update_role(role_id):
    data = request.get_json() or {}
    name = data.get('name','').strip()
    tabs = data.get('tabs', [])
    if not name: return err('角色名稱為必填')

    db = get_db()
    db.execute('UPDATE roles SET name=?, tabs=? WHERE id=?', (name, json.dumps(tabs), role_id))
    db.commit()
    log_action('update_role', role_id, name)
    return ok()

@app.route('/api/roles/<role_id>', methods=['DELETE'])
@admin_required
def delete_role(role_id):
    db = get_db()
    db.execute('UPDATE users SET role_id=? WHERE role_id=?', ('pending', role_id))
    db.execute('DELETE FROM roles WHERE id=?', (role_id,))
    db.commit()
    log_action('delete_role', role_id)
    return ok()

# ════════════════════════════════════════════════════
# ── 使用者管理 API ────────────────────────────────────
# ════════════════════════════════════════════════════

@app.route('/api/users', methods=['GET'])
@admin_required
def get_users():
    db    = get_db()
    users = [row_to_dict(u) for u in db.execute(
        'SELECT user_id, name, role_id, created_at FROM users ORDER BY created_at').fetchall()]
    return ok(users)

@app.route('/api/users', methods=['POST'])
@admin_required
def create_user():
    data     = request.get_json() or {}
    user_id  = data.get('userId','').strip()
    password = data.get('password','')
    name     = data.get('name','').strip()
    role_id  = data.get('roleId','pending')

    if not user_id or not name or not password:
        return err('帳號、姓名、密碼為必填')

    db = get_db()
    if db.execute('SELECT 1 FROM users WHERE user_id=?', (user_id,)).fetchone():
        return err('此帳號已存在')

    db.execute('INSERT INTO users (user_id, password, name, role_id) VALUES (?,?,?,?)',
               (user_id, password, name, role_id))
    db.commit()
    log_action('create_user', user_id)
    return ok()

@app.route('/api/users/<user_id>', methods=['PUT'])
@admin_required
def update_user(user_id):
    data     = request.get_json() or {}
    name     = data.get('name','').strip()
    role_id  = data.get('roleId','')
    password = data.get('password','')

    if not name: return err('姓名為必填')

    db = get_db()
    if password:
        db.execute('UPDATE users SET name=?, role_id=?, password=? WHERE user_id=?',
                   (name, role_id, password, user_id))
    else:
        db.execute('UPDATE users SET name=?, role_id=? WHERE user_id=?',
                   (name, role_id, user_id))
    db.commit()
    log_action('update_user', user_id, f'role={role_id}')
    return ok()

@app.route('/api/users/<user_id>', methods=['DELETE'])
@admin_required
def delete_user(user_id):
    if user_id == 'reyi': return err('無法刪除管理員帳號')
    db = get_db()
    db.execute('DELETE FROM users WHERE user_id=?', (user_id,))
    db.commit()
    log_action('delete_user', user_id)
    return ok()

# ════════════════════════════════════════════════════
# ── 進貨資料 API ──────────────────────────────────────
# ════════════════════════════════════════════════════

@app.route('/api/products', methods=['GET'])
@login_required
def get_products():
    arrival_date = request.args.get('date', '')
    db = get_db()
    if arrival_date:
        rows = db.execute('SELECT * FROM products WHERE arrival_date=? ORDER BY seq', (arrival_date,)).fetchall()
    else:
        rows = db.execute('SELECT * FROM products ORDER BY arrival_date DESC, seq').fetchall()
    return ok([row_to_dict(r) for r in rows])

@app.route('/api/products/dates', methods=['GET'])
@login_required
def get_product_dates():
    db   = get_db()
    rows = db.execute('SELECT DISTINCT arrival_date FROM products ORDER BY arrival_date DESC').fetchall()
    return ok([r['arrival_date'] for r in rows])

@app.route('/api/products/import', methods=['POST'])
@login_required
def import_products():
    data   = request.get_json() or {}
    items  = data.get('items', [])
    date   = data.get('date', '')

    if not items: return err('匯入資料不可空白')

    db = get_db()
    inserted = 0
    for p in items:
        pid = str(uuid.uuid4())
        arr_date = p.get('arrivalDate') or date or str(date.today())
        # 避免重複匯入（同日期+品號+採購單）
        exists = db.execute(
            'SELECT 1 FROM products WHERE arrival_date=? AND item_no=? AND po=?',
            (arr_date, p.get('itemNo',''), p.get('po',''))
        ).fetchone()
        if not exists:
            db.execute('''INSERT INTO products
                (id, arrival_date, seq, po, cat, barcode, item_no, name, spec, period, qty)
                VALUES (?,?,?,?,?,?,?,?,?,?,?)''', (
                pid, arr_date,
                p.get('seq', 0),
                p.get('po', ''),
                p.get('cat', ''),
                p.get('barcode', ''),
                p.get('itemNo', ''),
                p.get('name', ''),
                p.get('spec', ''),
                p.get('period', ''),
                p.get('qty', 0)
            ))
            inserted += 1
    db.commit()
    log_action('import_products', date, f'共 {inserted} 筆')
    return ok({'inserted': inserted})

@app.route('/api/products', methods=['POST'])
@login_required
def create_product():
    """手動新增臨時到貨"""
    data = request.get_json() or {}
    name = data.get('name','').strip()
    qty  = int(data.get('qty', 0))
    if not name: return err('品名為必填')
    if qty <= 0: return err('採購數量需大於 0')

    db   = get_db()
    date = data.get('arrivalDate', str(datetime.now().date()))
    seq  = (db.execute('SELECT COUNT(*) as c FROM products WHERE arrival_date=?', (date,)).fetchone()['c'] or 0) + 1
    pid  = str(uuid.uuid4())

    db.execute('''INSERT INTO products
        (id, arrival_date, seq, po, cat, barcode, item_no, name, spec, qty, is_manual)
        VALUES (?,?,?,?,?,?,?,?,?,?,1)''', (
        pid, date, seq,
        data.get('po',''), data.get('cat',''), data.get('barcode',''),
        data.get('itemNo',''), name, data.get('spec',''), qty
    ))
    db.commit()
    log_action('manual_add', pid, name)
    return ok({'id': pid})

@app.route('/api/products/<pid>', methods=['DELETE'])
@login_required
def delete_product(pid):
    db = get_db()
    db.execute('DELETE FROM products WHERE id=?', (pid,))
    db.commit()
    log_action('delete_product', pid)
    return ok()

@app.route('/api/products/batch-delete', methods=['POST'])
@login_required
def batch_delete_products():
    ids = (request.get_json() or {}).get('ids', [])
    if not ids: return err('請提供要刪除的 ID 清單')
    db  = get_db()
    db.execute(f"DELETE FROM products WHERE id IN ({','.join('?'*len(ids))})", ids)
    db.commit()
    log_action('batch_delete', '', f'{len(ids)} 筆')
    return ok()

# ════════════════════════════════════════════════════
# ── 驗收作業 API ──────────────────────────────────────
# ════════════════════════════════════════════════════

@app.route('/api/products/<pid>/receive', methods=['PUT'])
@login_required
def receive_product(pid):
    data      = request.get_json() or {}
    good_qty  = int(data.get('goodQty', 0))
    bad_qty   = int(data.get('badQty', 0))
    reasons   = data.get('defectReasons', [])
    note      = data.get('defectNote', '')
    cls       = data.get('defectClass', '其他異常')
    photos    = data.get('photos', [])
    user_name = session.get('user_name', '')
    user_id   = session.get('user_id', '')

    status = 'abnormal_pending' if bad_qty > 0 else 'received'

    db = get_db()
    db.execute('''UPDATE products SET
        received=1, good_qty=?, bad_qty=?, defect_class=?,
        defect_reasons=?, defect_note=?, photos=?,
        operator_id=?, operator_name=?, status=?, recv_time=?
        WHERE id=?''', (
        good_qty, bad_qty, cls,
        json.dumps(reasons), note, json.dumps(photos),
        user_id, user_name, status,
        datetime.now().strftime('%Y/%m/%d %H:%M:%S'),
        pid
    ))
    db.commit()
    log_action('receive', pid, f'良品:{good_qty} 不良:{bad_qty}')
    return ok({'status': status})

# ════════════════════════════════════════════════════
# ── 異常檢核 API ──────────────────────────────────────
# ════════════════════════════════════════════════════

@app.route('/api/products/<pid>/review', methods=['PUT'])
@login_required
def review_product(pid):
    data    = request.get_json() or {}
    db      = get_db()
    staff   = session.get('user_name', '')

    db.execute('''UPDATE products SET
        defect_time=?, defect_class=?, defect_reasons=?,
        defect_note=?, defect_staff=?, status=?
        WHERE id=?''', (
        data.get('defectTime',''),
        data.get('defectClass','其他異常'),
        json.dumps(data.get('defectReasons',[])),
        data.get('defectNote',''),
        staff,
        'procurement',
        pid
    ))
    db.commit()
    log_action('review', pid, staff)
    return ok({'status': 'procurement'})

# ════════════════════════════════════════════════════
# ── 採購回覆 API ──────────────────────────────────────
# ════════════════════════════════════════════════════

@app.route('/api/products/<pid>/reply', methods=['PUT'])
@login_required
def reply_product(pid):
    data       = request.get_json() or {}
    action     = data.get('procAction','')
    reply      = data.get('procReply','')
    staff_name = session.get('user_name','')

    if not action: return err('請選擇處理方式')

    now = datetime.now().strftime('%Y/%m/%d %H:%M:%S')

    # 補入連動結束時間
    db = get_db()
    prod = row_to_dict(db.execute('SELECT defect_time FROM products WHERE id=?', (pid,)).fetchone())
    defect_time = prod.get('defect_time','') if prod else ''
    if defect_time.endswith('～'):
        defect_time += datetime.now().strftime('%H:%M')

    db.execute('''UPDATE products SET
        proc_action=?, proc_reply=?, proc_staff_name=?,
        proc_reply_time=?, defect_time=?, status=?
        WHERE id=?''', (
        action, reply, staff_name, now, defect_time, 'resolved', pid
    ))
    db.commit()
    log_action('reply', pid, f'{staff_name}: {action}')
    return ok({'status': 'resolved'})

# ════════════════════════════════════════════════════
# ── 健康檢查 ──────────────────────────────────────────
# ════════════════════════════════════════════════════

@app.route('/api/health', methods=['GET'])
def health():
    return ok({'status': 'running', 'version': '1.0.0'})

# ── 啟動 ─────────────────────────────────────────────
if __name__ == '__main__':
    init_db()
    print('Server starting...')
    print('API: http://localhost:5000')
    print('Web: http://localhost:5000/')
    app.run(host='0.0.0.0', port=5000, debug=True)
