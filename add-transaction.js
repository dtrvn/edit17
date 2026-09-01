(function(){
  const defaultState=()=>({date:new Date().toISOString().slice(0,10),type:'',group:'',child:'',amount:0,note:'',assetName:'',assetQty:'',assetUnit:'',assetPrice:'',fee:0,savingTerm:'1 tháng',assetInterest:'',savingBookId:'',assetHoldingId:'',newInsuranceContract:false});
  let state=defaultState();
  let catalog={types:[],groups:{},children:{}};
  let saving=false;
  const GOLD_UNITS=['Cây','Chỉ','Phân'];
  const SAVING_TERMS=['1 tuần','2 tuần','3 tuần','1 tháng','2 tháng','3 tháng','4 tháng','5 tháng','6 tháng','7 tháng','8 tháng','9 tháng','10 tháng','11 tháng','12 tháng','18 tháng','24 tháng','36 tháng'];
  const FALLBACK_CATEGORIES=[
    {large:'Thu nhập',group:'Lương',child:'Lương'},
    {large:'Chi tiêu',group:'Sinh hoạt',child:'Ăn uống'},
    {large:'Đầu tư',group:'Vàng',child:'Mua vàng'},
    {large:'Thu hồi tài sản',group:'Vàng',child:'Bán vàng'},
    {large:'Đầu tư',group:'Tiết kiệm',child:'Gửi tiết kiệm'},
    {large:'Thu hồi tài sản',group:'Tiết kiệm',child:'Rút tiết kiệm'},
    {large:'Đầu tư',group:'Chứng khoán',child:'Mua cổ phiếu'},
    {large:'Thu hồi tài sản',group:'Chứng khoán',child:'Bán cổ phiếu'}
  ];

  const unique=items=>Array.from(new Set((items||[]).filter(Boolean)));
  const pad=n=>String(n).padStart(2,'0');
  const money=n=>Number(n||0).toLocaleString('vi-VN')+' đ';
  const dmy=iso=>{const [y,m,d]=String(iso).split('-');return `${d}/${m}/${y}`;};
  const txType=type=>{
    const text=normalizeDong(plainText(type));
    if(text.includes('thu nhap'))return 'INCOME';
    if(text.includes('dau tu'))return 'INVEST';
    if(text.includes('thu hoi'))return 'DIVEST';
    return 'EXPENSE';
  };
  const chev='<svg class="add39-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="m6 9 6 6 6-6"/></svg>';
  const calIcon='<span class="add39-cal-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="4" y="5" width="16" height="16" rx="2.4"/><path d="M8 3v4"/><path d="M16 3v4"/><path d="M4 10h16"/></svg></span>';
  const childKey=(type,group)=>`${type}::${group}`;
  const normalizeDong=value=>String(value||'').replace(/[\u0111\u0110]/g,'d');
  const plainText=value=>String(value||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d');
  function goldQtyToChi(qty,unit){
    const n=Number(String(qty||'').replace(',','.'))||1;
    const text=normalizeDong(plainText(unit));
    if(text.includes('cay')||text.includes('luong'))return n*10;
    if(text.includes('phan'))return n/10;
    return n;
  }
  const isGoldState=()=>normalizeDong(plainText([state.type,state.group,state.child,state.assetName].join(' '))).includes('vang')||normalizeDong(plainText([state.type,state.group,state.child,state.assetName].join(' '))).includes('gold');
  const isDivestGoldState=()=>isGoldState()&&txType(state.type)==='DIVEST';
  const isAssetState=()=>{
    const text=normalizeDong(plainText(state.type));
    return text.includes('dau tu')||text.includes('thu hoi')||isSavingState();
  };
  const isSavingState=()=>classifiedAssetType(state.type,state.group,state.child)==='SAVING';
  const isInsurancePremiumState=()=>txType(state.type)==='INVEST'&&classifiedAssetType(state.type,state.group,state.child)==='INSURANCE'&&normalizeDong(plainText(state.child)).includes('dong phi');
  function classifiedAssetType(type,group,child){
    const g=normalizeDong(plainText(group)),c=normalizeDong(plainText(child));
    if(g.includes('vang'))return 'GOLD';
    if(g.includes('bao hiem'))return 'INSURANCE';
    if(g.includes('bat dong san')||c.includes('dat')||c.includes('nha'))return 'LAND';
    if(g.includes('chung khoan')||c.includes('co phieu')||c.includes('quy'))return 'STOCK';
    if(g.includes('tiet kiem')||c.includes('tiet kiem'))return 'SAVING';
    return '';
  }

  function savingTermDays(term,startIso=state.date){
    const n=Number(String(term||'').match(/\d+/)?.[0]||0);
    const text=normalizeDong(plainText(term));
    if(text.includes('tuan'))return n*7;
    if(text.includes('thang')){
      const [year,month,day]=String(startIso||new Date().toISOString().slice(0,10)).split('-').map(Number);
      const start=new Date(year,month-1,day);
      const targetMonth=(month-1)+n;
      const lastDay=new Date(year,targetMonth+1,0).getDate();
      const end=new Date(year,targetMonth,Math.min(day,lastDay));
      return Math.max(0,Math.round((end-start)/86400000));
    }
    return 0;
  }

  function proratedInterest(amount,annualRate,days){
    const principal=Number(amount||0);
    const rate=Number(String(annualRate||'').replace(',','.'))||0;
    return Math.round(principal*rate/100*Math.max(days,0)/365);
  }

  function updateSavingPreview(){
    const maturity=document.getElementById('add39SavingMaturity');
    if(maturity)maturity.textContent=money(proratedInterest(state.amount,state.assetInterest,savingTermDays(state.savingTerm)));
  }

  function savingBookOptions(){
    const transactionBooks=savingBookOptionsFromTransactions();
    if(transactionBooks.length)return transactionBooks;
    const snapshot=typeof window.ASSET52_getAssets==='function'?window.ASSET52_getAssets():null;
    const data=snapshot?.detailData||{};
    const allRows=Object.entries(data)
      .filter(([key])=>String(key)==='saving')
      .flatMap(([,items])=>Array.isArray(items)?items:[])
      .sort((a,b)=>String(a.sortDate||a.date||'').localeCompare(String(b.sortDate||b.date||'')));
    const rows=[];
    allRows.forEach(row=>{
      const qty=Number(row.qtyRaw||0);
      const action=String(row.action||'').toUpperCase();
      if(qty>0&&!action.includes('SELL'))rows.push(row);
      if(qty<0||action.includes('SELL'))rows.shift();
    });
    const books=rows.map((row,index)=>{
      const rate=String(row.interestRate||row.lai_suat||'').trim();
      const id=String(row.savingBookId||row.so_tiet_kiem_id||row.sourceTxnDocId||row.id||index);
      const label=[`Sổ ${index+1}`,row.date,rate?`LS ${rate.includes('%')?rate:rate+'%'}`:'',money(Math.abs(Number(row.totalCost||row.cost||row.current||0)))].filter(Boolean).join(' · ');
      return {
        value:id,
        label,
        term:String(row.ky_han||row.savingTerm||''),
        rate,
        cost:Math.abs(Number(row.totalCost||row.cost||row.current||0)),
        name:String(row.name||row.assetName||'Gửi tiết kiệm')
      };
    });
    return books.length?books:savingBookOptionsFromTransactions();
  }

  function savingBookOptionsFromTransactions(){
    const txns=typeof window.TXN_getTransactions==='function'?window.TXN_getTransactions():[];
    const books=[];
    (Array.isArray(txns)?txns:[])
      .filter(tx=>classifiedAssetType(tx.large||tx.loai_lon,tx.group||tx.nhom_danh_muc,tx.child||tx.hang_muc_con)==='SAVING')
      .sort((a,b)=>[a.date||a.ngay||'',a.time||a.gio||'',a.createdAt||a.created_at||'',a.id||''].join(' ').localeCompare([b.date||b.ngay||'',b.time||b.gio||'',b.createdAt||b.created_at||'',b.id||''].join(' ')))
      .forEach(tx=>{
        if(String(tx.postingStatus||tx.trang_thai_hach_toan||'').toUpperCase()==='REVERSED')return;
        const rawAction=String(tx.type||tx.loai_giao_dich||'').toUpperCase();
        const action=rawAction==='DIVEST'||rawAction==='SELL'?'DIVEST':(rawAction==='INVEST'||rawAction==='BUY'?'INVEST':txType(tx.large||tx.loai_lon||tx.type||tx.loai_giao_dich));
        if(action==='DIVEST'){
          const detail=tx.assetDetail||tx.chi_tiet_tai_san||{};
          const id=String(tx.savingBookId||tx.so_tiet_kiem_id||detail.so_tiet_kiem_id||'');
          const closedCost=Number(tx.settlementCost||tx.gia_von_tat_toan||detail.gia_von_da_ban||0);
          if(id){
            const idx=books.findIndex(book=>book.value===id||book.ids?.includes(id));
            if(idx>=0){
              books.splice(idx,1);
              return;
            }
          }
          if(closedCost){
            const idx=books.findIndex(book=>Math.abs(Number(book.cost||0)-closedCost)<1);
            if(idx>=0){
              books.splice(idx,1);
              return;
            }
          }
          const amount=Number(tx.amount||tx.so_tien||0);
          if(amount){
            const idx=books.findIndex(book=>Math.abs(Number(book.cost||0)-amount)<1);
            if(idx>=0){
              books.splice(idx,1);
              return;
            }
          }
          books.shift();
          return;
        }
        if(action!=='INVEST')return;
        const amount=Number(tx.amount||tx.so_tien||0);
        if(amount<=0)return;
        const status=String(tx.status||tx.trang_thai||'').toUpperCase();
        if(status==='CLOSED')return;
        const rate=String(tx.assetInterest||tx.assetRate||tx.lai_suat||'').trim();
        const term=String(tx.savingTerm||tx.ky_han||'').trim();
        const date=String(tx.date||tx.ngay||'');
        const value=String(tx.savingBookId||tx.so_tiet_kiem_id||tx.id||tx.external_id||books.length);
        const external=String(tx.external_id||tx.id||'');
        const label=[`Sổ ${books.length+1}`,date,rate?`LS ${rate.includes('%')?rate:rate+'%'}`:'',money(amount)].filter(Boolean).join(' - ');
        books.push({value,label,term,rate,cost:amount,name:String(tx.assetName||tx.ten_tai_san||'Gui tiet kiem'),ids:[value,external].filter(Boolean)});
      });
    return books;
  }

  function selectedSavingBook(){
    const books=savingBookOptions();
    return books.find(book=>book.value===state.savingBookId)||books[0]||null;
  }

  function goldHoldingOptions(){
    const snapshot=typeof window.ASSET52_getAssets==='function'?window.ASSET52_getAssets():null;
    const items=Array.isArray(snapshot?.assets)?snapshot.assets:[];
    return items
      .filter(asset=>{
        const key=normalizeDong(plainText([asset.key,asset.cls,asset.name].join(' ')));
        return (key.includes('gold')||key.includes('vang'))&&Number(asset.aggregateQty||0)>0;
      })
      .map(asset=>({
        name:String(asset.name||'Vàng 98%').trim(),
        qty:Number(asset.aggregateQty||0),
        label:[String(asset.name||'Vàng 98%').trim(),asset.qtyText].filter(Boolean).join(' - ')
      }));
  }

  function selectedGoldHolding(){
    const rows=goldHoldingOptions();
    const wanted=plainText(state.assetName);
    return rows.find(row=>plainText(row.name)===wanted)||rows[0]||null;
  }

  function assetClassForType(type){
    if(type==='LAND')return 'realestate';
    if(type==='STOCK')return 'stock';
    if(type==='INSURANCE')return 'insurance';
    return '';
  }

  function assetLabelForType(type){
    if(type==='LAND')return 'Tên bất động sản';
    if(type==='STOCK')return 'Mã cổ phiếu';
    if(type==='INSURANCE')return 'Tên hợp đồng bảo hiểm';
    return 'Tên tài sản';
  }

  function assetUnitOptionsForType(type){
    if(type==='LAND')return ['m2','Lô'];
    if(type==='STOCK')return ['Cổ'];
    if(type==='INSURANCE')return ['Hợp đồng'];
    if(type==='GOLD')return GOLD_UNITS;
    return [];
  }

  function defaultAssetUnitForType(type){
    const options=assetUnitOptionsForType(type);
    return options[0]||'';
  }

  function unitFromQtyText(type,qtyText){
    const text=plainText(qtyText);
    return assetUnitOptionsForType(type).find(unit=>text.includes(plainText(unit)))||defaultAssetUnitForType(type);
  }

  function applyManagedAssetPick(picked,type,{fillQty=false}={}){
    if(!picked)return;
    state.assetName=picked.name||state.assetName;
    state.assetHoldingId=picked.id||state.assetHoldingId||'';
    state.assetUnit=picked.unit||state.assetUnit||defaultAssetUnitForType(type);
    if(fillQty&&type==='LAND'&&Number(picked.qty||0)>0)state.assetQty=String(picked.qty);
  }

  function insuranceContractOptionsFromTransactions(){
    const txns=typeof window.TXN_getTransactions==='function'?window.TXN_getTransactions():[];
    const contracts=new Map();
    (Array.isArray(txns)?txns:[]).forEach(tx=>{
      const type=classifiedAssetType(tx.large||tx.loai_lon,tx.group||tx.nhom_danh_muc,tx.child||tx.hang_muc_con)||String(tx.assetType||tx.loai_tai_san||'').toUpperCase();
      if(type!=='INSURANCE')return;
      const rawKind=String(tx.type||tx.loai_giao_dich||'').toUpperCase();
      const kind=rawKind==='INVEST'||rawKind==='BUY'?'INVEST':(rawKind==='DIVEST'||rawKind==='SELL'?'DIVEST':txType(tx.large||tx.loai_lon));
      const name=String(tx.assetName||tx.ten_tai_san||tx.tenTaiSan||tx.note||tx.ghi_chu||'Hợp đồng bảo hiểm').trim();
      const date=String(tx.date||tx.ngay||'').slice(0,10);
      const amount=Number(tx.amount||tx.so_tien||tx.soTien||0)||0;
      const id=String(tx.assetHoldingId||tx.tai_san_thu_hoi_id||tx.id||tx.external_id||`${date}-${name}-${contracts.size}`);
      const key=plainText(name);
      const existing=contracts.get(key)||{id,name,unit:defaultAssetUnitForType('INSURANCE'),qty:1,value:0,recovered:0,label:name,latest:''};
      if(kind==='DIVEST')existing.recovered+=amount;
      if(kind==='INVEST'){
        existing.value+=amount;
        existing.id=existing.id||id;
        existing.label=name;
      }
      existing.latest=String(existing.latest||'')>date?existing.latest:date;
      contracts.set(key,existing);
    });
    return Array.from(contracts.values())
      .filter(row=>!(typeof window.ASSET52_isInsuranceContractSettled==='function'&&window.ASSET52_isInsuranceContractSettled(row.name)))
      .sort((a,b)=>String(b.latest||'').localeCompare(String(a.latest||'')));
  }

  function realestateHoldingOptionsFromTransactions(){
    const txns=typeof window.TXN_getTransactions==='function'?window.TXN_getTransactions():[];
    const buys=[];
    const soldIds=[];
    const soldNames=[];
    (Array.isArray(txns)?txns:[]).forEach(tx=>{
      const type=classifiedAssetType(tx.large||tx.loai_lon,tx.group||tx.nhom_danh_muc,tx.child||tx.hang_muc_con)||String(tx.assetType||tx.loai_tai_san||'').toUpperCase();
      if(type!=='LAND')return;
      const rawKind=String(tx.type||tx.loai_giao_dich||'').toUpperCase();
      const kind=rawKind==='INVEST'||rawKind==='BUY'?'INVEST':(rawKind==='DIVEST'||rawKind==='SELL'?'DIVEST':txType(tx.large||tx.loai_lon));
      const name=String(tx.assetName||tx.ten_tai_san||tx.tenTaiSan||tx.note||tx.ghi_chu||tx.child||tx.hang_muc_con||'Bất động sản').trim();
      const qty=Number(String(tx.assetQty||tx.so_luong||tx.soLuong||1).replace(',','.'))||1;
      const unit=String(tx.assetUnit||tx.don_vi||tx.donVi||defaultAssetUnitForType('LAND')).trim()||defaultAssetUnitForType('LAND');
      const amount=Number(tx.amount||tx.so_tien||tx.soTien||0)||0;
      const date=String(tx.date||tx.ngay||'').slice(0,10);
      const id=String(tx.id||tx.external_id||`${date}-${name}-${buys.length}`);
      if(kind==='DIVEST'){
        const holdingId=String(tx.assetHoldingId||tx.tai_san_thu_hoi_id||tx.landHoldingId||'').trim();
        if(holdingId)soldIds.push(holdingId);
        soldNames.push(plainText(name));
        return;
      }
      if(kind==='INVEST')buys.push({id,name,qty,unit,label:[name,`${qty.toLocaleString('vi-VN')} ${unit}`,amount?money(amount):''].filter(Boolean).join(' - ')});
    });
    soldIds.forEach(id=>{
      const index=buys.findIndex(row=>String(row.id)===String(id));
      if(index>=0)buys.splice(index,1);
    });
    soldNames.forEach(name=>{
      const index=buys.findIndex(row=>plainText(row.name)===name);
      if(index>=0)buys.splice(index,1);
    });
    return buys;
  }

  function assetHoldingOptions(type){
    if(type==='LAND'){
      const realestateRows=realestateHoldingOptionsFromTransactions();
      if(realestateRows.length)return realestateRows;
    }
    if(type==='INSURANCE'){
      const insuranceRows=insuranceContractOptionsFromTransactions();
      return insuranceRows;
    }
    const cls=assetClassForType(type);
    if(!cls)return [];
    const snapshot=typeof window.ASSET52_getAssets==='function'?window.ASSET52_getAssets():null;
    const items=Array.isArray(snapshot?.assets)?snapshot.assets:[];
    return items
      .filter(asset=>{
        const text=normalizeDong(plainText([asset.key,asset.cls,asset.name].join(' ')));
        const matches=String(asset.cls||'')===cls||text.includes(cls)||(cls==='realestate'&&(text.includes('bat-dong-san')||text.includes('land')||text.includes('nha')||text.includes('dat')));
        const active=Number(asset.aggregateQty||0)>0||Number(asset.value||0)>0||Number(asset.aggregateCost||0)>0;
        return matches&&active;
      })
      .map(asset=>{
        const name=String(asset.name||'').trim();
        const qtyText=String(asset.qtyText||'').trim();
        const value=Number(asset.value||asset.aggregateValue||asset.aggregateCost||0);
        return {
          name,
          unit:unitFromQtyText(type,qtyText),
          qty:Number(asset.aggregateQty||0),
          label:type==='INSURANCE'?name:[name,qtyText,value?money(value):''].filter(Boolean).join(' - ')
        };
      })
      .filter(row=>row.name);
  }

  function selectedAssetHolding(type){
    const rows=assetHoldingOptions(type);
    const wanted=plainText(state.assetName);
    return rows.find(row=>plainText(row.name)===wanted)||rows[0]||null;
  }

  function showSaveIssue(title,message){
    if(window.showAppMessage)window.showAppMessage(title,message);
    else window.alert?.(`${title}: ${message}`);
  }

  function generatedSavingBookId(businessId){
    const text=String(businessId||'');
    const match=text.match(/^GD(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/);
    if(match)return `STK${match[3]}${match[2]}${match[1]}${match[4]}${match[5]}${match[6]}`;
    const now=new Date();
    return `STK${pad(now.getDate())}${pad(now.getMonth()+1)}${now.getFullYear()}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  }

  function buildCatalog(rows){
    const types=unique(rows.map(x=>String(x.large||'').trim())).sort((a,b)=>a.localeCompare(b,'vi'));
    const groups={};
    const children={};
    types.forEach(type=>{
      groups[type]=unique(rows.filter(x=>String(x.large||'').trim()===type).map(x=>String(x.group||'').trim())).sort((a,b)=>a.localeCompare(b,'vi'));
      groups[type].forEach(group=>{
        children[childKey(type,group)]=unique(rows.filter(x=>String(x.large||'').trim()===type&&String(x.group||'').trim()===group).map(x=>String(x.child||'').trim())).sort((a,b)=>a.localeCompare(b,'vi'));
      });
    });
    return {types,groups,children};
  }

  function refreshCatalog(){
    const shared=typeof window.CAT90_getCatalog==='function'?window.CAT90_getCatalog():null;
    if(shared&&Array.isArray(shared.large)&&shared.large.length){
      catalog={types:shared.large,groups:shared.groups||{},children:shared.children||{}};
      return;
    }
    const rows=typeof window.CAT90_getRows==='function'?window.CAT90_getRows():[];
    catalog=buildCatalog(Array.isArray(rows)&&rows.length?rows:FALLBACK_CATEGORIES);
  }
  function childOptions(type,group){
    return catalog.children[childKey(type,group)]||catalog.children[group]||[];
  }

  function normalize(){
    refreshCatalog();
    if(!catalog.types.includes(state.type))state.type=catalog.types[0]||'';
    const groups=catalog.groups[state.type]||[];
    if(!groups.includes(state.group))state.group=groups[0]||'';
    const children=childOptions(state.type,state.group);
    if(!children.includes(state.child))state.child=children[0]||'';
  }

  function ensureSheet(){
    const phone=document.getElementById('phone');
    if(phone&&!document.getElementById('add39Backdrop')){
      phone.insertAdjacentHTML('beforeend','<div class="add39-backdrop" id="add39Backdrop"></div><div class="add39-sheet" id="add39Sheet"></div>');
    }
  }

  function closeSheet(){
    const sheet=document.getElementById('add39Sheet');
    sheet?.classList.remove('show','add39-insurance-name-sheet');
    document.getElementById('add39Backdrop')?.classList.remove('show');
  }

  function openOptions(title,items,current,onPick){
    ensureSheet();
    const sheet=document.getElementById('add39Sheet');
    const back=document.getElementById('add39Backdrop');
    if(!sheet||!back)return;
    sheet.classList.remove('add39-insurance-name-sheet');
    sheet.innerHTML=`<div class="add39-handle"></div><div class="add39-sheet-title">${title}</div>${items.map(v=>{
      const create=String(v)==='Tạo hợp đồng mới';
      return `<button class="${create?'add39-create':'add39-option'} ${v===current?'active':''}" data-val="${encodeURIComponent(v)}"><span>${v}</span>${create?'':`<span class="add39-check">${v===current?'✓':''}</span>`}</button>`;
    }).join('')}`;
    sheet.onclick=e=>{
      const btn=e.target.closest('[data-val]');
      if(!btn)return;
      onPick(decodeURIComponent(btn.dataset.val||''));
      closeSheet();
      renderForm();
    };
    back.onclick=closeSheet;
    sheet.classList.add('show');
    back.classList.add('show');
  }

  function openInsuranceContractNameSheet(value='',restoreState=null){
    ensureSheet();
    const sheet=document.getElementById('add39Sheet');
    const back=document.getElementById('add39Backdrop');
    if(!sheet||!back)return;
    const escaped=String(value||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    sheet.classList.add('add39-insurance-name-sheet');
    sheet.innerHTML=`<div class="add39-handle"></div><div class="add39-sheet-title">Tạo hợp đồng bảo hiểm mới</div><input class="add39-input add39-sheet-input" id="add39InsuranceContractName" value="${escaped}" placeholder="Nhập tên hợp đồng bảo hiểm"><div class="add39-sheet-actions"><button type="button" class="add39-btn cancel" data-add39-contract-cancel>Hủy</button><button type="button" class="add39-btn save" data-add39-contract-save>Lưu</button></div>`;
    function close(restore=false){
      if(restore&&restoreState)Object.assign(state,restoreState);
      sheet.classList.remove('show','add39-insurance-name-sheet');
      back.classList.remove('show');
      renderForm();
    }
    sheet.onclick=e=>{
      if(e.target.closest('[data-add39-contract-cancel]')){
        close(true);
        return;
      }
      if(e.target.closest('[data-add39-contract-save]')){
        const input=document.getElementById('add39InsuranceContractName');
        const name=String(input?.value||'').trim();
        if(!name){input?.focus();return;}
        state.newInsuranceContract=true;
        state.assetName=name;
        state.assetHoldingId='';
        state.assetUnit=defaultAssetUnitForType('INSURANCE');
        close();
      }
    };
    back.onclick=()=>close(true);
    sheet.classList.add('show');
    back.classList.add('show');
    setTimeout(()=>document.getElementById('add39InsuranceContractName')?.focus(),40);
  }

  function openCalendar(current,onPick){
    ensureSheet();
    let [y,m]=String(current).split('-').map(Number);
    const sheet=document.getElementById('add39Sheet');
    const back=document.getElementById('add39Backdrop');
    if(!sheet||!back)return;
    const monthNames=['Tháng 01','Tháng 02','Tháng 03','Tháng 04','Tháng 05','Tháng 06','Tháng 07','Tháng 08','Tháng 09','Tháng 10','Tháng 11','Tháng 12'];
    function drawDay(){
      const first=new Date(y,m-1,1);
      const offset=(first.getDay()+6)%7;
      const days=new Date(y,m,0).getDate();
      const cells=[];
      const pm=m===1?12:m-1;
      const py=m===1?y-1:y;
      const pdays=new Date(py,pm,0).getDate();
      for(let i=offset-1;i>=0;i--)cells.push({d:pdays-i,m:pm,y:py,muted:true});
      for(let d=1;d<=days;d++)cells.push({d,m,y});
      const nm=m===12?1:m+1;
      const ny=m===12?y+1:y;
      while(cells.length<42)cells.push({d:cells.length-(offset+days)+1,m:nm,y:ny,muted:true});
      sheet.innerHTML=`<div class="add39-handle"></div><div class="add39-cal-head"><button data-prev>‹</button><button class="add39-cal-title" data-title>Tháng ${pad(m)}/${y}</button><button data-next>›</button></div><div class="add39-week"><span>T2</span><span>T3</span><span>T4</span><span>T5</span><span>T6</span><span>T7</span><span>CN</span></div><div class="add39-cal-grid">${cells.map(c=>{const v=`${c.y}-${pad(c.m)}-${pad(c.d)}`;return `<button class="add39-day ${c.muted?'muted':''} ${v===current?'selected':''}" data-date="${v}">${c.d}</button>`}).join('')}</div>`;
    }
    function drawMonth(){
      sheet.innerHTML=`<div class="add39-handle"></div><div class="add39-cal-head"><button data-year-prev>‹</button><button class="add39-cal-title" data-year-title>${y}</button><button data-year-next>›</button></div><div class="add39-month-grid">${monthNames.map((name,i)=>`<button class="add39-month-pick ${i+1===m?'selected':''}" data-month="${i+1}">${name}</button>`).join('')}</div>`;
    }
    function drawYear(){
      const start=Math.floor((y-6)/12)*12;
      sheet.innerHTML=`<div class="add39-handle"></div><div class="add39-cal-head"><button data-years-prev>‹</button><button class="add39-cal-title">${start} - ${start+11}</button><button data-years-next>›</button></div><div class="add39-year-grid">${Array.from({length:12},(_,i)=>start+i).map(year=>`<button class="add39-year-pick ${year===y?'selected':''}" data-year="${year}">${year}</button>`).join('')}</div>`;
    }
    drawDay();
    sheet.onclick=e=>{
      if(e.target.closest('[data-title]')){drawMonth();return;}
      if(e.target.closest('[data-year-title]')){drawYear();return;}
      if(e.target.closest('[data-prev]')){m--;if(m<1){m=12;y--}drawDay();return;}
      if(e.target.closest('[data-next]')){m++;if(m>12){m=1;y++}drawDay();return;}
      if(e.target.closest('[data-year-prev]')){y--;drawMonth();return;}
      if(e.target.closest('[data-year-next]')){y++;drawMonth();return;}
      if(e.target.closest('[data-years-prev]')){y-=12;drawYear();return;}
      if(e.target.closest('[data-years-next]')){y+=12;drawYear();return;}
      const month=e.target.closest('[data-month]');
      if(month){m=Number(month.dataset.month);drawDay();return;}
      const year=e.target.closest('[data-year]');
      if(year){y=Number(year.dataset.year);drawMonth();return;}
      const btn=e.target.closest('[data-date]');
      if(btn){onPick(btn.dataset.date);closeSheet();renderForm();}
    };
    back.onclick=closeSheet;
    sheet.classList.add('show');
    back.classList.add('show');
  }

  function renderForm(){
    const form=document.querySelector('#screenTxnForm .demo-form, #screenTxnForm .add39-form');
    if(!form)return;
    normalize();
    form.className='add39-form';
    const emptyText=catalog.types.length?'':'Chưa có danh mục trong Firebase';
    const isGold=isGoldState();
    const divestGold=isDivestGoldState();
    const currentAssetType=classifiedAssetType(state.type,state.group,state.child);
    const premiumInsurance=isInsurancePremiumState();
    const divestManagedAsset=txType(state.type)==='DIVEST'&&['LAND','STOCK','INSURANCE'].includes(currentAssetType);
    const managedRows=divestManagedAsset?assetHoldingOptions(currentAssetType):[];
    const selectedManaged=divestManagedAsset?selectedAssetHolding(currentAssetType):null;
    const insuranceRows=premiumInsurance?assetHoldingOptions('INSURANCE'):[];
    const selectedInsurance=insuranceRows.find(row=>plainText(row.name)===plainText(state.assetName))||null;
    const unitOptions=assetUnitOptionsForType(currentAssetType);
    const goldRows=goldHoldingOptions();
    if(divestGold&&goldRows.length&&!goldRows.some(row=>plainText(row.name)===plainText(state.assetName)))state.assetName=goldRows[0].name;
    if(divestManagedAsset&&managedRows.length&&!managedRows.some(row=>plainText(row.name)===plainText(state.assetName)))applyManagedAssetPick(managedRows[0],currentAssetType,{fillQty:true});
    if(premiumInsurance&&insuranceRows.length&&!state.newInsuranceContract&&!selectedInsurance)applyManagedAssetPick(insuranceRows[0],'INSURANCE');
    if(premiumInsurance&&!insuranceRows.length&&!state.assetName)state.newInsuranceContract=true;
    if(unitOptions.length&&!state.assetUnit)state.assetUnit=defaultAssetUnitForType(currentAssetType);
    const selectedGold=selectedGoldHolding();
    const assetNameValue=state.assetName||(isGold?'Vàng 98%':(divestManagedAsset?(selectedManaged?.name||''):state.child||''));
    const unitValue=state.assetUnit||(isGold?'Chỉ':(divestManagedAsset?defaultAssetUnitForType(currentAssetType):''));
    const unitField=(isGold||unitOptions.length)
      ? `<button class="add39-control" data-add39-asset-unit type="button"><span>${unitValue}</span>${chev}</button>`
      : `<input class="add39-input" id="add39AssetUnit" value="${unitValue}" placeholder="Đơn vị">`;
    const termDays=savingTermDays(state.savingTerm);
    const maturityInterest=proratedInterest(state.amount,state.assetInterest,termDays);
    const divestSaving=isSavingState()&&txType(state.type)==='DIVEST';
    const books=savingBookOptions();
    const selectedBook=selectedSavingBook();
    if(divestSaving&&selectedBook&&state.savingBookId!==selectedBook.value)state.savingBookId=selectedBook.value;
    const amountLabel=divestSaving?'Số tiền tất toán sổ':'Số tiền';
    const savingFields=`<div class="add39-asset-block saving-mode"><div class="add39-field full"><label class="add39-label">Kỳ hạn</label><button class="add39-control" data-add39-saving-term type="button"><span>${state.savingTerm||'1 tháng'}</span>${chev}</button></div><div class="add39-field full"><label class="add39-label">Lãi suất / năm</label><input class="add39-input" id="add39AssetInterest" inputmode="decimal" value="${state.assetInterest||''}" placeholder="VD: 5.5"></div><div class="add39-field full"><div class="add39-saving-preview"><span>Lãi dự kiến: <b id="add39SavingMaturity">${money(maturityInterest)}</b></span></div></div></div>`;
    const savingWithdrawFields=`<div class="add39-asset-block saving-mode"><div class="add39-field full"><label class="add39-label">Sổ tiết kiệm</label><button class="add39-control" data-add39-saving-book type="button"><span>${selectedBook?.label||'Chưa có sổ tiết kiệm'}</span>${chev}</button></div></div>`;
    const assetNameControl=divestGold
      ? `<button class="add39-control" data-add39-gold-asset type="button"><span>${selectedGold?.label||'Chưa có vàng để bán'}</span>${chev}</button>`
      : premiumInsurance
      ? `<button class="add39-control" data-add39-insurance-contract type="button"><span>${state.newInsuranceContract?(state.assetName||'Tạo hợp đồng mới'):(selectedInsurance?.label||state.assetName||'Tạo hợp đồng mới')}</span>${chev}</button>`
      : divestManagedAsset
      ? `<button class="add39-control" data-add39-asset-holding type="button"><span>${selectedManaged?.label||'Chưa có tài sản để thu hồi'}</span>${chev}</button>`
      : `<input class="add39-input" id="add39AssetName" value="${assetNameValue}" placeholder="${isGold?'Vàng 98%':'Tên tài sản'}">`;
    const hideInsuranceQtyUnit=currentAssetType==='INSURANCE'&&(premiumInsurance||txType(state.type)==='DIVEST');
    const qtyField=hideInsuranceQtyUnit?'':`<div class="add39-field"><label class="add39-label">Số lượng</label><input class="add39-input" id="add39AssetQty" inputmode="decimal" value="${state.assetQty||''}" placeholder="1"></div>`;
    const unitBlock=hideInsuranceQtyUnit?'':`<div class="add39-field"><label class="add39-label">Đơn vị</label>${unitField}</div>`;
    const defaultAssetFields=`<div class="add39-asset-block"><div class="add39-field full"><label class="add39-label">${assetLabelForType(currentAssetType)}</label>${assetNameControl}</div>${qtyField}${unitBlock}<div class="add39-field full"><label class="add39-label">Phí / tiền công</label><input class="add39-input" id="add39Fee" inputmode="numeric" pattern="[0-9]*" value="${state.fee||''}" placeholder="0"></div></div>`;
    const assetFields=isAssetState()?(isSavingState()?(divestSaving?savingWithdrawFields:savingFields):defaultAssetFields):'';
    form.innerHTML=`<div class="add39-field"><label class="add39-label">Ngày giao dịch</label><button class="add39-control" data-add39-date><span>${dmy(state.date)}</span>${calIcon}</button></div><div class="add39-field"><label class="add39-label">Loại giao dịch</label><button class="add39-control" data-add39-type><span>${state.type||emptyText}</span>${chev}</button></div><div class="add39-field cat-row"><label class="add39-label">Nhóm danh mục</label><button class="add39-control" data-add39-group><span>${state.group||emptyText}</span>${chev}</button></div><div class="add39-field cat-row"><label class="add39-label">Hạng mục con</label><button class="add39-control" data-add39-child><span>${state.child||emptyText}</span>${chev}</button></div><div class="add39-field full"><div class="add39-label-row"><label class="add39-label">${amountLabel}</label><span class="add39-money-preview" id="add39MoneyPreview">${money(state.amount)}</span></div><input class="add39-input" id="add39Amount" inputmode="numeric" pattern="[0-9]*" placeholder="0" value="${state.amount||''}"></div>${assetFields}<div class="add39-field full"><label class="add39-label">Ghi chú</label><textarea class="add39-note" id="add39Note" placeholder="Nhập ghi chú">${state.note||''}</textarea></div><div class="add39-actions"><button type="button" class="add39-cancel" data-close="screenTxnForm">Hủy</button><button type="button" class="add39-save" id="add39Save">Lưu giao dịch</button></div>`;
  }

  function resetForm(){
    state=defaultState();
    renderForm();
  }

  function lockAddScreenMove(e){
    const screen=document.getElementById('screenTxnForm');
    if(!screen?.classList.contains('active'))return;
    if(e.target?.closest?.('#add39Sheet'))return;
    if(e.cancelable)e.preventDefault();
  }

  function createTransaction(){
    if(saving)return;
    normalize();
    const amount=Number(state.amount||0);
    if(!state.type||!state.group||!state.child)return;
    const currentAssetType=classifiedAssetType(state.type,state.group,state.child);
    const premiumInsurance=isInsurancePremiumState();
    const divestSaving=isSavingState()&&txType(state.type)==='DIVEST';
    const divestManagedAsset=txType(state.type)==='DIVEST'&&['LAND','STOCK','INSURANCE'].includes(currentAssetType);
    const managedHolding=divestManagedAsset?selectedAssetHolding(currentAssetType):null;
    const book=divestSaving?selectedSavingBook():null;
    if(divestSaving&&!book){
      console.warn('Khong co so tiet kiem dang mo de tat toan.');
      document.querySelector('[data-add39-saving-book]')?.focus();
      return;
    }
    if(divestManagedAsset&&!managedHolding){
      showSaveIssue('Chưa có tài sản để thu hồi','Vui lòng thêm tài sản trước, hoặc chọn đúng nhóm tài sản đang còn trong màn hình Tài sản.');
      document.querySelector('[data-add39-asset-holding]')?.focus();
      return;
    }
    if(!amount){
      document.getElementById('add39Amount')?.focus();
      return;
    }
    if(premiumInsurance&&state.newInsuranceContract&&!String(state.assetName||'').trim()){
      document.querySelector('[data-add39-insurance-contract]')?.focus();
      return;
    }
    if(!window.FDB){
      console.error('Firebase chưa sẵn sàng, không thể lưu giao dịch.', window.FIREBASE_STATUS);
      return;
    }
    const now=new Date();
    const businessId='GD'+now.getFullYear()+String(now.getMonth()+1).padStart(2,'0')+String(now.getDate()).padStart(2,'0')+String(now.getHours()).padStart(2,'0')+String(now.getMinutes()).padStart(2,'0')+String(now.getSeconds()).padStart(2,'0')+String(now.getMilliseconds()).padStart(3,'0');
    const saveAsset=isSavingState();
    const fee=Number(String(state.fee||0).replace(/\D/g,''))||0;
    if(divestManagedAsset&&managedHolding)applyManagedAssetPick(managedHolding,currentAssetType,{fillQty:!state.assetQty});
    const qty=(saveAsset||currentAssetType==='INSURANCE')?1:(Number(String(state.assetQty||'').replace(',','.'))||1);
    const unitForTx=saveAsset?'Sổ':(state.assetUnit||defaultAssetUnitForType(currentAssetType)||(currentAssetType==='GOLD'?'Chỉ':'Đơn vị'));
    const priceQty=currentAssetType==='GOLD'?goldQtyToChi(qty,unitForTx):qty;
    if(isDivestGoldState()){
      const holding=selectedGoldHolding();
      const sellQty=goldQtyToChi(qty,unitForTx);
      if(!holding){
        showSaveIssue('Chưa có vàng để bán','Vui lòng thêm giao dịch mua vàng trước, hoặc chọn đúng loại vàng đang có trong Tài sản.');
        return;
      }
      if(sellQty>Number(holding.qty||0)){
        showSaveIssue('Không đủ số lượng vàng',`Bạn đang bán ${sellQty} chỉ nhưng ${holding.name} chỉ còn ${holding.qty} chỉ.`);
        return;
      }
      state.assetName=holding.name;
    }
    const price=Math.round(amount/Math.max(priceQty,1));
    const savingTerm=book?.term||state.savingTerm||'1 tháng';
    const savingRate=book?.rate||state.assetInterest||'';
    const savingBookId=saveAsset?(divestSaving?book?.value:generatedSavingBookId(businessId)):'';
    const savingBookLabel=saveAsset?(divestSaving?book?.label:`So tiet kiem ${savingBookId}`):'';
    const termDays=saveAsset?savingTermDays(savingTerm):0;
    const annualInterest=saveAsset?Number(String(savingRate).replace(',','.'))||0:0;
    const maturityInterest=saveAsset?proratedInterest(amount,annualInterest,termDays):0;
    const fallbackAssetName=currentAssetType==='GOLD'?'Vàng 98%':(state.child||state.group||'Tài sản');
    const txData={
      id:businessId,
      ngay:state.date,
      created_at:now.toISOString(),
      updated_at:now.toISOString(),
      loai_giao_dich:txType(state.type),
      loai_lon:state.type,
      nhom_danh_muc:state.group,
      hang_muc_con:state.child,
      so_tien:amount,
      ghi_chu:(state.note||'').trim(),
      don_gia:isAssetState()?price:0,
      don_vi:isAssetState()?unitForTx:'',
      loai_tai_san:isAssetState()?classifiedAssetType(state.type,state.group,state.child):'',
      phi:fee,
      so_luong:isAssetState()?qty:0,
      ten_tai_san:isAssetState()?(saveAsset?'Gửi tiết kiệm':((state.assetName||fallbackAssetName).trim())):'',
      tai_san_thu_hoi_id:divestManagedAsset&&['LAND','INSURANCE'].includes(currentAssetType)?state.assetHoldingId:'',
      assetHoldingId:divestManagedAsset&&['LAND','INSURANCE'].includes(currentAssetType)?state.assetHoldingId:'',
      so_tiet_kiem_id:savingBookId,
      so_tiet_kiem_label:savingBookLabel,
      gia_von_tat_toan:book?.cost||0,
      ky_han:saveAsset?savingTerm:'',
      so_ngay_ky_han:termDays,
      lai_suat:annualInterest,
      lai_suat_nam:annualInterest,
      lai_suat_theo_ky_han:maturityInterest
    };
    const savedDate=state.date;
    const txForAsset={...txData,date:savedDate,amount,large:state.type,group:state.group,child:state.child,type:txType(state.type),note:state.note,assetQty:qty,assetUnit:txData.don_vi,assetPrice:price,fee,assetType:txData.loai_tai_san,assetName:txData.ten_tai_san,assetInterest:annualInterest,assetRate:annualInterest,savingBookId:txData.so_tiet_kiem_id,savingBookLabel:txData.so_tiet_kiem_label,settlementCost:txData.gia_von_tat_toan,savingTerm:txData.ky_han,savingTermDays:txData.so_ngay_ky_han,savingInterestAmount:txData.lai_suat_theo_ky_han};
    saving=true;
    const request=window.ASSET52_saveTransactionAtomic
      ? window.ASSET52_saveTransactionAtomic(txForAsset,businessId,txData,{mode:'create'})
      : Promise.resolve(window.FDB.setNoRefresh
        ? window.FDB.setNoRefresh(FIREBASE_COLLECTIONS.giaoDich,businessId,txData)
        : window.FDB.set(FIREBASE_COLLECTIONS.giaoDich,businessId,txData));
    window.QLCT_setBusy?.(true,'Đang lưu giao dịch');
    Promise.resolve(request).then(()=>{
      window.TXN_upsertTransaction?.({...txData,_docId:businessId});
      closeScreen('screenTxnForm');
      openScreen('screenTransactions');
      window.TXN_showDate?.(savedDate);
      resetForm();
    }).catch(error=>{
      console.error('Save transaction failed',error);
      const message=error?.message||'Vui lòng thử lại.';
      if(window.showAppMessage)window.showAppMessage('Không lưu được giao dịch',message);
      else window.alert?.(`Không lưu được giao dịch: ${message}`);
    }).finally(()=>{saving=false;window.QLCT_setBusy?.(false);});
  }

  document.addEventListener('click',e=>{
    if(e.target.closest('#screenTxnForm [data-close="screenTxnForm"], #screenTxnForm .add39-cancel')){
      closeScreen('screenTxnForm');
      return;
    }
    if(e.target.closest('.add-btn'))setTimeout(resetForm,20);
    if(e.target.closest('[data-add39-date]'))openCalendar(state.date,v=>state.date=v);
    if(e.target.closest('[data-add39-type]'))openOptions('Loại giao dịch',catalog.types,state.type,v=>{state.type=v;state.group=(catalog.groups[v]||[])[0]||'';state.child=childOptions(state.type,state.group)[0]||'';state.assetName='';state.assetQty='';state.assetUnit='';state.savingBookId='';state.assetHoldingId='';state.newInsuranceContract=false;});
    if(e.target.closest('[data-add39-group]'))openOptions('Nhóm danh mục',catalog.groups[state.type]||[],state.group,v=>{state.group=v;state.child=childOptions(state.type,state.group)[0]||'';state.assetName='';state.assetQty='';state.assetUnit='';state.savingBookId='';state.assetHoldingId='';state.newInsuranceContract=false;});
    if(e.target.closest('[data-add39-child]'))openOptions('Hạng mục con',childOptions(state.type,state.group),state.child,v=>{state.child=v;state.assetName='';state.assetQty='';state.assetUnit='';state.savingBookId='';state.assetHoldingId='';state.newInsuranceContract=false;});
    if(e.target.closest('[data-add39-asset-unit]')){
      const type=classifiedAssetType(state.type,state.group,state.child);
      const options=assetUnitOptionsForType(type);
      openOptions('Đơn vị',options.length?options:GOLD_UNITS,state.assetUnit||defaultAssetUnitForType(type)||'Chỉ',v=>state.assetUnit=v);
    }
    if(e.target.closest('[data-add39-gold-asset]')){
      const rows=goldHoldingOptions();
      openOptions('Loại vàng',rows.length?rows.map(row=>row.label):['Chưa có vàng để bán'],selectedGoldHolding()?.label||'Chưa có vàng để bán',label=>{
        const picked=rows.find(row=>row.label===label);
        state.assetName=picked?.name||state.assetName;
      });
    }
    if(e.target.closest('[data-add39-asset-holding]')){
      const type=classifiedAssetType(state.type,state.group,state.child);
      const rows=assetHoldingOptions(type);
      const current=selectedAssetHolding(type);
      openOptions(assetLabelForType(type),rows.length?rows.map(row=>row.label):['Chưa có tài sản để thu hồi'],current?.label||'Chưa có tài sản để thu hồi',label=>{
        const picked=rows.find(row=>row.label===label);
        applyManagedAssetPick(picked,type,{fillQty:true});
      });
    }
    if(e.target.closest('[data-add39-insurance-contract]')){
      const rows=assetHoldingOptions('INSURANCE');
      const createLabel='Tạo hợp đồng mới';
      const current=state.newInsuranceContract?createLabel:(rows.find(row=>plainText(row.name)===plainText(state.assetName))?.label||createLabel);
      const restoreState={assetName:state.assetName,assetHoldingId:state.assetHoldingId,assetUnit:state.assetUnit,newInsuranceContract:state.newInsuranceContract};
      openOptions('Tên hợp đồng bảo hiểm',[...rows.map(row=>row.label),createLabel],current,label=>{
        if(label===createLabel){
          state.newInsuranceContract=true;
          state.assetName='';
          state.assetHoldingId='';
          state.assetUnit=defaultAssetUnitForType('INSURANCE');
          setTimeout(()=>openInsuranceContractNameSheet('',restoreState),0);
          return;
        }
        const picked=rows.find(row=>row.label===label);
        state.newInsuranceContract=false;
        applyManagedAssetPick(picked,'INSURANCE');
      });
    }
    if(e.target.closest('[data-add39-saving-term]'))openOptions('Kỳ hạn',SAVING_TERMS,state.savingTerm||'1 tháng',v=>state.savingTerm=v);
    if(e.target.closest('[data-add39-saving-book]')){
      const books=savingBookOptions();
      const current=selectedSavingBook();
      openOptions('Sổ tiết kiệm',books.length?books.map(book=>book.label):['Chưa có sổ tiết kiệm'],current?.label||'Chưa có sổ tiết kiệm',label=>{
        const picked=books.find(book=>book.label===label);
        state.savingBookId=picked?.value||'';
        state.savingTerm=picked?.term||state.savingTerm;
        state.assetInterest=picked?.rate||state.assetInterest;
        state.assetName=picked?.name||state.assetName;
      });
    }
    if(e.target.closest('#add39Save'))createTransaction();
  },true);
  document.addEventListener('touchmove',lockAddScreenMove,{passive:false});
  document.addEventListener('wheel',lockAddScreenMove,{passive:false});

  document.addEventListener('cat90:changed',renderForm);
  document.addEventListener('input',e=>{
    if(e.target?.id==='add39Amount'){
      state.amount=Number(String(e.target.value||'').replace(/\D/g,''))||0;
      const preview=document.getElementById('add39MoneyPreview');
      if(preview)preview.textContent=money(state.amount);
      updateSavingPreview();
    }
    if(e.target?.id==='add39Note')state.note=e.target.value;
    if(e.target?.id==='add39AssetName')state.assetName=e.target.value;
    if(e.target?.id==='add39AssetQty')state.assetQty=e.target.value;
    if(e.target?.id==='add39AssetUnit')state.assetUnit=e.target.value;
    if(e.target?.id==='add39AssetInterest'){state.assetInterest=e.target.value;updateSavingPreview();}
    if(e.target?.id==='add39Fee')state.fee=Number(String(e.target.value||'').replace(/\D/g,''))||0;
  },true);

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',resetForm);else resetForm();
})();
