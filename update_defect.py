path = 'C:/Users/c830627/Desktop/reyi-restock/app.js'
content = open(path, encoding='utf-8').read()

start = content.find('function renderDefectItems(readonly)')
end   = content.find('\nfunction addDefectItem()', start)

new_fn = """function renderDefectItems(readonly) {
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

  const camSvgSm = '<svg style=\\"width:16px;height:16px;color:#fca5a5\\" fill=\\"none\\" stroke=\\"currentColor\\" viewBox=\\"0 0 24 24\\"><path stroke-linecap=\\"round\\" stroke-linejoin=\\"round\\" stroke-width=\\"2\\" d=\\"M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z\\"/><path stroke-linecap=\\"round\\" stroke-linejoin=\\"round\\" stroke-width=\\"2\\" d=\\"M15 13a3 3 0 11-6 0 3 3 0 016 0z\\"/></svg>';
  const camSvgLg = '<svg style=\\"width:20px;height:20px;color:#fca5a5\\" fill=\\"none\\" stroke=\\"currentColor\\" viewBox=\\"0 0 24 24\\"><path stroke-linecap=\\"round\\" stroke-linejoin=\\"round\\" stroke-width=\\"2\\" d=\\"M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z\\"/><path stroke-linecap=\\"round\\" stroke-linejoin=\\"round\\" stroke-width=\\"2\\" d=\\"M15 13a3 3 0 11-6 0 3 3 0 016 0z\\"/></svg>';

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

  const catBtns = DEFECT_CATEGORIES.map(c=>{const active=item.category===c;return `<button onclick="${readonly?'':`setDefectCategory(${i},'${c}')`}" style="padding:6px 12px;border-radius:18px;border:1.5px solid ${active?'#2563eb':'#e5e7eb'};background:${active?'#dbeafe':'#f8fafc'};color:${active?'#1d4ed8':'#6b7280'};font-size:12px;font-weight:${active?'700':'500'};cursor:pointer;white-space:nowrap">${c}</button>`;}).join('');

  const reasonChips = !readonly
    ? `<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:2px 6px;margin-top:6px">${DEFECT_REASONS.map(r=>{const sel=(item.reasons||[]).includes(r);return `<label style="display:flex;align-items:center;gap:4px;cursor:pointer;padding:2px 0"><input type="checkbox" ${sel?'checked':''} onchange="toggleDefectSubReason(${i},'${r}')" style="width:13px;height:13px;accent-color:#2563eb;flex-shrink:0;cursor:pointer" /><span style="font-size:11px;color:#374151;line-height:1.3">${r}</span></label>`;}).join('')}</div>`
    : ((item.reasons||[]).length?`<div style="display:flex;flex-wrap:wrap;gap:3px;margin-top:4px">${(item.reasons||[]).map(r=>`<span class="badge badge-abnormal" style="font-size:10px">${r}</span>`).join('')}</div>`:'');

  const photoMain = item.photo
    ? `<div style="position:relative;display:inline-block;flex-shrink:0"><img src="${item.photo}" style="height:72px;border-radius:10px;object-fit:cover;display:block;cursor:pointer" onclick="viewDefectPhoto(${i})" />${!readonly?`<button onclick="clearDefectPhotoItem(${i})" style="position:absolute;top:-5px;right:-5px;width:16px;height:16px;background:#ef4444;color:#fff;border:none;border-radius:50%;font-size:10px;cursor:pointer">x</button>`:''}</div>`
    : (!readonly?`<label style="height:72px;padding:0 12px;border:2px dashed #fca5a5;border-radius:10px;background:#fff5f5;display:inline-flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;gap:3px;flex-shrink:0">${camSvgLg}<span style="font-size:10px;color:#fca5a5">上傳</span><input type="file" accept="image/*" class="hidden" onchange="setDefectPhoto(${i},this)" /></label>`:'<span style="font-size:12px;color:#9ca3af">未上傳</span>');

  const qtyInput = !readonly
    ? `<div style="flex-shrink:0;text-align:center"><div style="font-size:10px;color:#9ca3af;margin-bottom:3px">不良數量</div><input type="number" min="0" value="${item.qty||''}" placeholder="0" style="width:64px;border:1.5px solid ${(parseInt(item.qty)||0)>0?'#2563eb':'#fecaca'};border-radius:10px;padding:8px 4px;font-size:18px;font-weight:800;text-align:center;outline:none;color:#2563eb;background:#f0f7ff" oninput="_defectItems[${i}].qty=parseInt(this.value)||0;updateDefectQtyStats()" /></div>`
    : `<div style="flex-shrink:0;text-align:center;min-width:52px"><div style="font-size:10px;color:#9ca3af">數量</div><div style="font-size:22px;font-weight:900;color:#2563eb">${item.qty||0}</div></div>`;

  const noteEl = !readonly
    ? `<input placeholder="補充說明（選填）" value="${item.note||''}" style="width:100%;border:1px solid #e5e7eb;border-radius:8px;padding:7px 10px;font-size:12px;outline:none;background:#fff;margin-top:6px;font-family:inherit" oninput="_defectItems[${i}].note=this.value" />`
    : (item.note?`<div style="font-size:12px;color:#6b7280;margin-top:4px">${item.note}</div>`:'');

  const replyEl = item.procAction?`<div style="padding:7px 10px;background:#d1fae5;font-size:12px;color:#065f46;border-radius:8px;margin-top:6px"><b>採購：</b>${item.procAction}${item.procReply?' — '+item.procReply:''}</div>`:'';

  container.innerHTML = `
    <div style="display:flex;gap:8px;align-items:center;overflow-x:auto;padding-bottom:6px;margin-bottom:8px">
      ${thumbs}
      ${!readonly?`<button onclick="addDefectItem()" style="width:50px;height:50px;border-radius:10px;flex-shrink:0;border:2px dashed #e5e7eb;background:#f8fafc;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:20px;color:#9ca3af;line-height:1">+</button>`:''}
    </div>
    ${statsEl}
    <div style="background:#fef9f9;border-radius:14px;border:1.5px solid #fecaca;padding:12px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
        <div style="display:flex;align-items:center;gap:10px">${photoMain}${qtyInput}<span style="font-size:11px;color:#9ca3af">${i+1} / ${_defectItems.length}</span></div>
        ${!readonly?`<button onclick="removeDefectItem(${i})" style="background:none;border:none;color:#fca5a5;cursor:pointer;font-size:13px;padding:4px">x 刪除</button>`:''}
      </div>
      <div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:6px">${catBtns}</div>
      ${reasonChips}${noteEl}${replyEl}
    </div>`;
}

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

function clearDefectPhotoItem(i) { _defectItems[i].photo=''; renderDefectItems(false); }"""

content = content[:start] + new_fn + content[end:]
open(path, 'w', encoding='utf-8').write(content)
print('done')
