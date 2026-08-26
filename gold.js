(function(){
  let goldTypes=[];
  let selectedId='';
  let hasRendered=false;
  let saveStatus={type:'',text:'',until:0};
  const fmt=n=>Number(n||0).toLocaleString('vi-VN')+' đ';
  const icon='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M8 11h8l2 8H6l2-8Z"/><path d="M10 11V7h4v4"/><path d="M9 15h6"/></svg>';
  const nowText=()=>{const d=new Date();return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;};

  function parseMoney(v){return Number(String(v||'').replace(/[^0-9]/g,''))||0;}
  function cleanInputValue(v){const digits=String(v||'').replace(/[^0-9]/g,'');return digits?String(Number(digits)):'';}
  function selected(){return goldTypes.find(x=>x.id===selectedId)||goldTypes[0]||null;}
  function isGoldKey(key){const text=String(key||'').toLowerCase();return text.includes('gold')||text.includes('vang');}
  function goldGroupKey(name){return String(name||'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');}
  function numericValue(...values){
    for(const value of values){
      const n=Number(value||0);
      if(n)return n;
    }
    return 0;
  }
  function formatGoldQty(totalChi){
    const totalPhan=Math.round(Number(totalChi||0)*10);
    const cay=Math.floor(totalPhan/100);
    const chi=Math.floor((totalPhan%100)/10);
    const phan=totalPhan%10;
    const parts=[];
    if(cay)parts.push(`${cay} c\u00e2y`);
    if(chi)parts.push(`${chi} ch\u1ec9`);
    if(phan)parts.push(`${phan} ph\u00e2n`);
    return parts.length?parts.join(' '):'0 ph\u00e2n';
  }
  function refreshGoldTypesGrouped(){
    const data=typeof window.ASSET52_getAssets==='function'?window.ASSET52_getAssets():null;
    const aggregateRows=(data?.assets||[]).filter(row=>isGoldKey([row.key,row.cls,row.name].join(' ')));
    if(aggregateRows.length){
      goldTypes=aggregateRows.map(row=>{
        const qtyChi=numericValue(row.aggregateQty,row.qtyChi);
        const value=numericValue(row.aggregateValue,row.value);
        const price=numericValue(row.aggregateCurrentPrice,row.price,qtyChi&&value?Math.round(value/qtyChi):0);
        return {
          id:String(row.key||row.id||row.name),
          name:String(row.name||'Vàng').trim(),
          qtyText:row.aggregateQtyText||row.qtyText||formatGoldQty(qtyChi),
          qtyChi,
          price,
          key:row.key,
          docId:row.docId||row.id
        };
      }).filter(x=>x.id&&x.name);
      if(!goldTypes.some(x=>x.id===selectedId))selectedId=goldTypes[0]?.id||'';
      return;
    }
    const rows=Object.values(data?.detailData||{}).flat().filter(row=>isGoldKey(row.key));
    const groups={};
    rows.forEach(row=>{
      const name=String(row.name||'V\u00e0ng').trim();
      const key=goldGroupKey(name);
      const qtyChi=Number(row.qtyChi||0);
      const current=Number(row.current||0);
      if(!groups[key]){
        groups[key]={id:String(row.goldTypeId||row.id||name),name,qtyChi:0,current:0,price:0,docId:row.id};
      }
      groups[key].qtyChi+=qtyChi;
      groups[key].current+=current;
      if(row.price)groups[key].price=Number(row.price||0);
    });
    goldTypes=Object.values(groups).map(row=>{
      const qtyChi=Number(row.qtyChi||0);
      const current=Number(row.current||0);
      return {
        id:String(row.id||row.name),
        name:String(row.name||'V\u00e0ng'),
        qtyText:formatGoldQty(qtyChi),
        qtyChi,
        price:Number(row.price||((qtyChi&&current)?Math.round(current/qtyChi):0)),
        docId:row.docId
      };
    }).filter(x=>x.id&&x.name);
    if(!goldTypes.some(x=>x.id===selectedId))selectedId=goldTypes[0]?.id||'';
  }

  function renderGold(){
    refreshGoldTypesGrouped();
    const screen=document.getElementById('screenGold');
    const root=document.getElementById('gold77Root');
    if(!screen||!root)return;
    screen.classList.add('gold77-screen');
    const item=selected();
    const activeStatus=saveStatus.text&&Date.now()<Number(saveStatus.until||0)?saveStatus:null;
    root.innerHTML=item?`<div class="gold77-card"><div class="gold77-top"><div class="gold77-icon">${icon}</div><div><div class="gold77-top-label" id="gold77CurrentType">${item.name}</div><div class="gold77-current-price" id="gold77CurrentPrice">${fmt(item.price)}</div><div class="gold77-time" id="gold77UpdatedAt">Cập nhật: ${nowText()}</div></div></div><div class="gold77-form"><div><div class="gold77-label-row"><label class="gold77-label">Loại vàng</label></div><button class="gold77-select" id="gold77Select" type="button"><span class="mini">${icon}</span><span class="name">${item.name}</span><svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="m6 9 6 6 6-6"/></svg></button></div><div><div class="gold77-label-row"><label class="gold77-label">Giá vàng mới</label><span class="gold77-live-value" id="gold77LiveValue">0 đ</span></div><input id="gold77Input" class="gold77-input" inputmode="numeric" autocomplete="off" value="0" /><div class="gold77-field-status ${activeStatus?.type||''}" id="gold77FieldStatus" aria-live="polite">${activeStatus?.text||''}</div></div><div class="gold77-stat-grid"><div class="gold77-stat"><span>Tổng số lượng</span><b>${item.qtyText||'-'}</b></div><div class="gold77-stat"><span>Giá trị hiện tại</span><b id="gold77Value">${fmt(Number(item.qtyChi||0)*Number(item.price||0))}</b></div></div><button id="gold77Update" class="gold77-update" type="button"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M20 12a8 8 0 0 1-13.66 5.66"/><path d="M4 12A8 8 0 0 1 17.66 6.34"/><path d="M18 3v4h-4"/><path d="M6 21v-4h4"/></svg> Cập nhật giá vàng</button></div></div>`:'<div class="gold77-card"><div class="gold77-note">Chưa có dữ liệu vàng trong collection TaiSan.</div></div>';
    ensureSheet();
    bindGold();
    hasRendered=true;
  }

  function ensureSheet(){
    const screen=document.getElementById('screenGold');
    if(!screen||document.getElementById('gold77Backdrop'))return;
    screen.insertAdjacentHTML('beforeend','<div class="gold77-backdrop" id="gold77Backdrop"></div><div class="gold77-sheet" id="gold77Sheet"></div>');
  }

  function renderOptions(){
    const sheet=document.getElementById('gold77Sheet');
    if(!sheet)return;
    sheet.innerHTML=`<div class="gold77-sheet-handle"></div><div class="gold77-sheet-title">Chọn loại vàng</div>${goldTypes.map(x=>`<button class="gold77-option ${x.id===selectedId?'active':''}" type="button" data-gold-id="${x.id}"><span>${x.name}</span><span class="gold77-check">${x.id===selectedId?'✓':''}</span></button>`).join('')}`;
  }

  function openSheet(){
    ensureSheet();
    clearTimeout(closeSheet.timer);
    const backdrop=document.getElementById('gold77Backdrop');
    const sheet=document.getElementById('gold77Sheet');
    renderOptions();
    sheet?.classList.remove('show');
    backdrop?.classList.add('show');
    if(sheet)void sheet.offsetHeight;
    requestAnimationFrame(()=>sheet?.classList.add('show'));
  }

  function closeSheet(){
    const backdrop=document.getElementById('gold77Backdrop');
    const sheet=document.getElementById('gold77Sheet');
    backdrop?.classList.remove('show');
    sheet?.classList.remove('show');
    clearTimeout(closeSheet.timer);
    closeSheet.timer=setTimeout(()=>{if(sheet&&!sheet.classList.contains('show'))sheet.innerHTML='';},300);
  }

  function bindGold(){
    const input=document.getElementById('gold77Input');
    const live=document.getElementById('gold77LiveValue');
    const fieldStatus=document.getElementById('gold77FieldStatus');
    function setFieldStatus(type,text){
      saveStatus={type:type||'',text:text||'',until:text?Date.now()+4500:0};
      if(!fieldStatus)return;
      fieldStatus.className='gold77-field-status'+(type?` ${type}`:'');
      fieldStatus.textContent=text||'';
    }
    input?.addEventListener('focus',()=>{if(input.value==='0')input.value='';});
    input?.addEventListener('input',()=>{const cleaned=cleanInputValue(input.value);input.value=cleaned;live.textContent=fmt(parseMoney(cleaned));if(saveStatus.type!=='success')setFieldStatus('','');});
    input?.addEventListener('blur',()=>{if(!input.value){input.value='0';live.textContent='0 đ';}});
    document.getElementById('gold77Select')?.addEventListener('click',openSheet);
    document.getElementById('gold77Update')?.addEventListener('click',()=>{
      if(Date.now()-Number(window.__numkeyClosedAt||0)<500)return;
      const item=selected();
      const price=parseMoney(input?.value);
      if(!item)return;
      if(!price){setFieldStatus('error','Vui lòng nhập giá vàng mới.');input?.focus();return;}
      live.textContent=fmt(price);
      const request=window.ASSET52_updateGoldPrice?window.ASSET52_updateGoldPrice({...item,price}):null;
      Promise.resolve(request).then(()=>{
        saveStatus={type:'success',text:'Cập nhật giá vàng thành công',until:Date.now()+4500};
        if(document.getElementById('screenGold')?.classList.contains('active'))renderGold();
      }).catch(error=>{
        console.error(error);
        saveStatus={type:'error',text:'Không cập nhật được Firebase. Kiểm tra quyền ghi TaiSan.',until:Date.now()+4500};
        if(document.getElementById('screenGold')?.classList.contains('active'))renderGold();
      });
    });
  }

  window.GOLD77_render=renderGold;
  document.addEventListener('asset52:changed',()=>{if(document.getElementById('screenGold')?.classList.contains('active'))renderGold();});
  document.addEventListener('click',e=>{const tool=e.target.closest('.tool');if(tool&&tool.textContent.trim()==='Giá vàng')setTimeout(renderGold,0);const opt=e.target.closest('[data-gold-id]');if(opt){selectedId=opt.dataset.goldId;saveStatus={type:'',text:'',until:0};renderGold();closeSheet();return;}if(e.target.closest('#gold77Backdrop'))closeSheet();if(e.target.closest('[data-close="screenGold"]'))closeSheet();},true);
  const observer=new MutationObserver(()=>{const screen=document.getElementById('screenGold');if(screen&&screen.classList.contains('active')&&!hasRendered)renderGold();});
  const start=()=>{const s=document.getElementById('screenGold');if(s)observer.observe(s,{attributes:true,attributeFilter:['class']});};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();


