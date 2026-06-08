path = 'C:/Users/c830627/Desktop/reyi-restock/app.js'
content = open(path, encoding='utf-8').read()

start = content.find('function renderDefectItems(readonly)')
end   = content.find('\nfunction addDefectItem()', start)

new_fn = """// 目前顯示的異常明細索引
let _activeDefectIdx = 0;

function renderDefectItems(readonly) {
  const container = document.getElementById('rs-defect-items');
  if (!container) return;
  if (!_defectItems.length && !readonly) {
    container.innerHTML = '<div style="text-align:center;padding:16px 0;color:#9ca3af;font-size:13px">尚未新增，點下方按鈕新增</div>';
    return;
  }
  if (!_defectItems.length) { container.innerHTML = ''; return; }
  _activeDefectIdx = Math.min(_activeDefectIdx, _defectItems.length - 1);
  if (_activeDefectIdx < 0) _activeDefectIdx = 0;
  const item = _defectItems[_activeDefectIdx];
  const i    = _activeDefectIdx;

  // 頂部照片縮圖列
  const camSvg = '<svg style=\\"width:18px;height:18px\\" fill=\\"none\\" stroke=\\"currentColor\\" viewBox=\\"0 0 24 24\\"><path stroke-linecap=\\"round\\" stroke-linejoin=\\"round\\" stroke-width=\\"2\\" d=\\"M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z\\"/><path stroke-linecap=\\"round\\" stroke-linejoin=\\"round\\" stroke-width=\\"2\\" d=\\"M15 13a3 3 0 11-6 0 3 3 0 016 0z\\"/></svg>';
  const thumbs = _defectItems.map((it, idx) => {
    const active = idx === _activeDefectIdx;
    const t = it.photo
      ? `<img src="${it.photo}" style="width:100%;height:100%;object-fit:cover;display:block" />`
      : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:${active?'#2563eb':'#fca5a5'}">${camSvg}</div>`;
    return `<div onclick="switchDefectItem(${idx})"
      style="width:52px;height:52px;border-radius:10px;flex-shrink:0;cursor:pointer;overflow:hidden;
        border:2.5px solid ${active?'#2563eb':'#fecaca'};
        background:${active?'#dbeafe':'#fff0f0'};
        box-shadow:${active?'0 2px 8px rgba(37,99,235,.25)':'none'};
        transition:all .15s">${t}</div>`;
  }).join('');

  // 大分類按鈕
  const catBtns = DEFECT_CATEGORIES.map(c => {
    const active = item.category === c;
    return `<button onclick="${readonly?'':`setDefectCategory(${i},'${c}')`}"
      style="padding:7px 14px;border-radius:20px;border:1.5px solid ${active?'#2563eb':'#e5e7eb'};
        background:${active?'#dbeafe':'#f8fafc'};color:${active?'#1d4ed8':'#6b7280'};
        font-size:13px;font-weight:${active?'700':'500'};cursor:pointer;white-space:nowrap">${c}</button>`;
  }).join('');

  // 原因勾選
  const reasonChips = !readonly
    ? `<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:3px 8px;margin-top:8px">
        ${DEFECT_REASONS.map(r => {
          const sel = (item.reasons||[]).includes(r);
          return `<label style="display:flex;align-items:center;gap:5px;cursor:pointer;padding:3px 0">
            <input type="checkbox" ${sel?'checked':''} onchange="toggleDefectSubReason(${i},'${r}')"
              style="width:14px;height:14px;accent-color:#2563eb;flex-shrink:0;cursor:pointer" />
            <span style="font-size:12px;color:#374151;line-height:1.3">${r}</span>
          </label>`;
        }).join('')}
       </div>`
    : ((item.reasons||[]).length ? `<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:6px">${(item.reasons||[]).map(r=>`<span style="padding:3px 8px;border-radius:12px;background:#dbeafe;color:#1d4ed8;font-size:11px">${r}</span>`).join('')}</div>` : '');

  const noteEl = !readonly
    ? `<input placeholder="補充說明（選填）" value="${item.note||''}"
        style="width:100%;border:1px solid #e5e7eb;border-radius:8px;padding:8px 10px;font-size:13px;outline:none;background:#fff;margin-top:8px;font-family:inherit"
        oninput="_defectItems[${i}].note=this.value" />`
    : (item.note ? `<div style="font-size:12px;color:#6b7280;margin-top:4px">${item.note}</div>` : '');

  const replyEl = item.procAction
    ? `<div style="padding:8px 10px;background:#d1fae5;font-size:12px;color:#065f46;border-radius:8px;margin-top:8px"><b>採購：</b>${item.procAction}${item.procReply?' — '+item.procReply:''}</div>`
    : '';

  // 照片上傳（當前項目）
  const photoMain = item.photo
    ? `<div style="position:relative;display:inline-block;flex-shrink:0">
        <img src="${item.photo}" style="height:64px;border-radius:8px;object-fit:cover;display:block;cursor:pointer"
          onclick="viewDefectPhoto(${i})" />
        ${!readonly ? `<button onclick="clearDefectPhoto(${i})"
          style="position:absolute;top:-5px;right:-5px;width:16px;height:16px;background:#ef4444;color:#fff;border:none;border-radius:50%;font-size:10px;cursor:pointer;line-height:1;display:flex;align-items:center;justify-content:center">✕</button>` : ''}
      </div>`
    : (!readonly ? `<label style="height:64px;padding:0 14px;border:2px dashed #fca5a5;border-radius:8px;background:#fff5f5;
        display:inline-flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;gap:3px;flex-shrink:0">
        <svg style="width:20px;height:20px;color:#fca5a5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/>
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"/>
        </svg>
        <span style="font-size:10px;color:#fca5a5">點擊上傳</span>
        <input type="file" accept="image/*" class="hidden" onchange="setDefectPhoto(${i},this)" />
      </label>` : '<span style="font-size:12px;color:#9ca3af">未上傳</span>');

  container.innerHTML = `
    <div style="display:flex;gap:8px;align-items:center;margin-bottom:10px;overflow-x:auto;padding-bottom:2px">
      ${thumbs}
      ${!readonly ? `<button onclick="addDefectItem()"
        style="width:52px;height:52px;border-radius:10px;flex-shrink:0;border:2px dashed #e5e7eb;
          background:#f8fafc;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:22px;color:#9ca3af;line-height:1">
        +</button>` : ''}
    </div>
    <div style="background:#fef9f9;border-radius:14px;border:1.5px solid #fecaca;padding:12px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
        <div style="display:flex;align-items:center;gap:8px">
          ${photoMain}
          <span style="font-size:11px;color:#9ca3af">${i+1} / ${_defectItems.length}</span>
        </div>
        ${!readonly ? `<button onclick="removeDefectItem(${i})"
          style="background:none;border:none;color:#fca5a5;cursor:pointer;font-size:13px;padding:4px">✕ 刪除</button>` : ''}
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px">${catBtns}</div>
      ${reasonChips}${noteEl}${replyEl}
    </div>`;
}

function switchDefectItem(idx) {
  _activeDefectIdx = idx;
  renderDefectItems(false);
}

function clearDefectPhoto(i) {
  _defectItems[i].photo = '';
  renderDefectItems(false);
}"""

content = content[:start] + new_fn + content[end:]
open(path, 'w', encoding='utf-8').write(content)
print('done, new fn length:', len(new_fn))
