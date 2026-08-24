(function(){
  const typeLabels={ALL:'Hiển thị tất cả','Thu nhập':'Thu nhập','Chi tiêu':'Chi tiêu','Đầu tư':'Đầu tư','Thu hồi tài sản':'Thu hồi tài sản','Thu hồi':'Thu hồi'};
  const rangeLabels={'1M':'1 tháng gần nhất','3M':'3 tháng gần nhất','6M':'6 tháng gần nhất','1Y':'1 năm gần nhất','CUSTOM':'Tùy chỉnh'};
  const goldUnitOptions=['Cây','Chỉ','Phân'].map(value=>({value,label:value}));
  const savingTermOptions=['1 tuần','2 tuần','3 tuần','1 tháng','2 tháng','3 tháng','4 tháng','5 tháng','6 tháng','7 tháng','8 tháng','9 tháng','10 tháng','11 tháng','12 tháng','18 tháng','24 tháng','36 tháng'].map(value=>({value,label:value}));
  let categories={large:[],groups:{},children:{}};
  const childKey=(large,group)=>`${large}::${group}`;
  function unique(items){return Array.from(new Set((items||[]).filter(Boolean)));}
  function buildCatalogFromRows(rows){
    const large=unique(rows.map(x=>String(x.large||'').trim())).sort((a,b)=>a.localeCompare(b,'vi'));
    const groups={};
    const children={};
    large.forEach(l=>{
      const groupList=unique(rows.filter(x=>String(x.large||'').trim()===l).map(x=>String(x.group||'').trim())).sort((a,b)=>a.localeCompare(b,'vi'));
      groups[l]=groupList;
      groupList.forEach(g=>{
        children[childKey(l,g)]=unique(rows.filter(x=>String(x.large||'').trim()===l&&String(x.group||'').trim()===g).map(x=>String(x.child||'').trim())).sort((a,b)=>a.localeCompare(b,'vi'));
      });
    });
    return {large,groups,children};
  }
  function readSharedCategories(){
    try{
      if(typeof window.CAT90_getCatalog==='function')return window.CAT90_getCatalog();
      return null;
    }catch(_err){
      return null;
    }
  }
  function refreshCategories(){
    const shared=readSharedCategories();
    categories=(shared&&shared.large&&shared.large.length)?shared:{large:[],groups:{},children:{}};
  }
  function categoryChildren(large,group){
    return categories.children[childKey(large,group)]||categories.children[group]||[];
  }
  refreshCategories();
  let transactions=[];
  const isoDate=d=>d.toISOString().slice(0,10);
  function defaultRange(){
    const to=new Date();
    const from=new Date(to);
    from.setMonth(from.getMonth()-1);
    return {from:isoDate(from),to:isoDate(to)};
  }
  const initialRange=defaultRange();
  const state={search:'',type:'ALL',range:'1M',from:initialRange.from,to:initialRange.to,editing:null,editOriginal:null,saving:false};
  const pad=n=>String(n).padStart(2,'0'); const fmt=n=>Number(n||0).toLocaleString('vi-VN')+' đ';
  const toDMY=v=>{const [y,m,d]=String(v).split('-');return `${d}/${m}/${y}`};
  const dayLabel=v=>{const d=new Date(String(v).replace(/-/g,'/'));return `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()} - ${['Chủ nhật','Thứ 2','Thứ 3','Thứ 4','Thứ 5','Thứ 6','Thứ 7'][d.getDay()]}`};
  const dateValue=v=>v&&typeof v.toDate==='function'?v.toDate().toISOString().slice(0,10):String(v||'').slice(0,10);
  const stampValue=v=>v&&typeof v.toDate==='function'?v.toDate().toISOString():String(v||'');
  function firstValue(row,keys){
    for(const key of keys){
      const value=row?.[key];
      if(value!==undefined&&value!==null&&String(value).trim())return value;
    }
    return '';
  }
  function parseAmount(value){
    if(typeof value==='number')return value;
    return Number(String(value||'').replace(/[^\d.-]/g,''))||0;
  }
  const plainText=value=>String(value||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d');
  const normalizeDong=value=>String(value||'').replace(/[\u0111\u0110]/g,'d');
  function savingTermDays(term,startIso){
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
  function categorySuggestsAsset(t){
    const text=plainText([t?.large,t?.type,t?.loai_giao_dich].join(' '));
    return text.includes('dau tu')||text.includes('thu hoi')||text.includes('invest')||text.includes('divest');
  }
  function clearAssetFields(t){
    t.assetType='';
    t.assetName='';
    t.assetQty=0;
    t.assetUnit='';
    t.assetPrice=0;
  }
  function isAssetTx(t){
    return categorySuggestsAsset(t)||assetTypeOf(t)==='SAVING';
  }
  function assetTypeOf(t){
    const text=plainText([t?.assetType,t?.assetName,t?.group,t?.child].join(' '));
    if(text.includes('vang')||text.includes('gold'))return 'GOLD';
    if(text.includes('bao hiem'))return 'INSURANCE';
    if(text.includes('bat dong san')||text.includes('dat')||text.includes('nha'))return 'LAND';
    if(text.includes('chung khoan')||text.includes('co phieu')||text.includes('quy'))return 'STOCK';
    if(text.includes('tiet kiem'))return 'SAVING';
    return '';
  }
  function goldQtyToChi(qty,unit){
    const n=Number(String(qty||'').replace(',','.'))||1;
    const text=plainText(unit);
    if(text.includes('cay')||text.includes('luong'))return n*10;
    if(text.includes('phan'))return n/10;
    return n;
  }
  function assetUnitPriceForTx(t){
    if(!isAssetTx(t))return 0;
    const qty=Number(t.assetQty||0)||1;
    const unit=t.assetUnit||(assetTypeOf(t)==='GOLD'?'Chỉ':'Đơn vị');
    const priceQty=assetTypeOf(t)==='GOLD'?goldQtyToChi(qty,unit):qty;
    return Math.round(Number(t.amount||0)/Math.max(priceQty,1));
  }
  const normalizeTx=x=>({
    id:String(x.id||''),
    external_id:String(x.external_id||''),
    date:dateValue(firstValue(x,['date','ngay','ngay_giao_dich','ngayGiaoDich','created_at','createdAt','Ngay','NgayGiaoDich']))||new Date().toISOString().slice(0,10),
    time:String(firstValue(x,['time','gio','createdTime'])||'00:00:00'),
    createdAt:stampValue(firstValue(x,['created_at','createdAt'])),
    large:String(firstValue(x,['large','loai_lon','loaiLon','loai','LoaiLon','Loai','typeName'])||'').trim(),
    group:String(firstValue(x,['group','nhom_danh_muc','nhom','nhomDanhMuc','category','Nhom','NhomDanhMuc'])||'').trim(),
    child:String(firstValue(x,['child','hang_muc_con','hangMuc','hangMucCon','ten','name','title','HangMuc','HangMucCon'])||'').trim(),
    type:String(firstValue(x,['type','loai_giao_dich','kieu','loaiGiaoDich'])||typeFromLarge(firstValue(x,['large','loai_lon','loaiLon','loai','LoaiLon','Loai','typeName']))),
    amount:parseAmount(firstValue(x,['amount','so_tien','soTien','money','value','gia_tri','giaTri','SoTien','GiaTri'])),
    note:String(firstValue(x,['note','ghi_chu','ghiChu','description','moTa','GhiChu'])||''),
    assetType:String(firstValue(x,['assetType','loai_tai_san','loaiTaiSan'])||''),
    assetName:String(firstValue(x,['assetName','ten_tai_san','tenTaiSan'])||''),
    assetQty:parseAmount(firstValue(x,['assetQty','so_luong','soLuong','quantity','qty'])),
    assetUnit:String(firstValue(x,['assetUnit','don_vi','donVi'])||''),
    assetPrice:parseAmount(firstValue(x,['assetPrice','don_gia','donGia','price','gia_hien_tai'])),
    fee:parseAmount(firstValue(x,['fee','phi','phí'])),
    assetInterest:String(firstValue(x,['assetInterest','assetRate','lai_suat','laiSuat','interestRate','interest_rate','rate'])||x.chi_tiet_tai_san?.lai_suat||x.assetDetail?.lai_suat||''),
    assetRate:String(firstValue(x,['assetRate','assetInterest','lai_suat','laiSuat','interestRate','interest_rate','rate'])||x.chi_tiet_tai_san?.lai_suat||x.assetDetail?.lai_suat||''),
    savingTerm:String(firstValue(x,['savingTerm','ky_han','kyHan'])||''),
    savingTermDays:parseAmount(firstValue(x,['savingTermDays','so_ngay_ky_han','soNgayKyHan'])),
    savingInterestAmount:parseAmount(firstValue(x,['savingInterestAmount','lai_suat_theo_ky_han','laiSuatTheoKyHan'])),
    savingBookId:String(firstValue(x,['savingBookId','so_tiet_kiem_id','soTietKiemId'])||x.chi_tiet_tai_san?.so_tiet_kiem_id||x.assetDetail?.so_tiet_kiem_id||''),
    savingBookLabel:String(firstValue(x,['savingBookLabel','so_tiet_kiem_label','soTietKiemLabel'])||x.chi_tiet_tai_san?.so_tiet_kiem_label||x.assetDetail?.so_tiet_kiem_label||''),
    settlementCost:parseAmount(firstValue(x,['settlementCost','gia_von_tat_toan','giaVonTatToan'])),
    assetDetail:x.chi_tiet_tai_san||x.assetDetail||null,
    accountId:String(firstValue(x,['tai_khoan_id','accountId'])||''),
    balanceDelta:parseAmount(firstValue(x,['bien_dong_so_du','balanceDelta'])),
    postingStatus:String(firstValue(x,['trang_thai_hach_toan','postingStatus'])||'')
  });
  function txToFirestore(t){
    const saving=assetTypeOf(t)==='SAVING';
    const termDays=saving?savingTermDays(t.savingTerm||'1 tháng',t.date):Number(t.savingTermDays||0);
    const rate=t.assetInterest||t.assetRate||'';
    const interestAmount=saving?proratedInterest(t.amount,rate,termDays):Number(t.savingInterestAmount||0);
    const data={
      ngay:t.date,
      loai_giao_dich:t.type||typeFromLarge(t.large),
      loai_lon:t.large,
      nhom_danh_muc:t.group,
      hang_muc_con:t.child,
      so_tien:Number(t.amount||0),
      ghi_chu:t.note||'',
      loai_tai_san:isAssetTx(t)?(t.assetType||assetTypeOf(t)):'',
      ten_tai_san:isAssetTx(t)?(saving?'Gửi tiết kiệm':(t.assetName||(assetTypeOf(t)==='GOLD'?'Vàng 98%':t.child||t.group||'Tài sản'))):'',
      so_luong:isAssetTx(t)?(saving?1:(Number(t.assetQty||0)||1)):0,
      don_vi:isAssetTx(t)?(saving?'Sổ':(t.assetUnit||(assetTypeOf(t)==='GOLD'?'Chỉ':'Đơn vị'))):'',
      don_gia:assetUnitPriceForTx(t),
      phi:isAssetTx(t)?Number(t.fee||0):0,
      updated_at:new Date().toISOString(),
      lai_suat:rate,
      lai_suat_nam:rate,
      ky_han:saving?(t.savingTerm||'1 tháng'):'',
      so_ngay_ky_han:termDays,
      lai_suat_theo_ky_han:interestAmount,
      so_tiet_kiem_id:t.savingBookId||'',
      so_tiet_kiem_label:t.savingBookLabel||'',
      gia_von_tat_toan:Number(t.settlementCost||0)
    };
    if(t.external_id)data.id=t.external_id;
    return data;
  }
  const chev=()=>'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="m6 9 6 6 6-6"/></svg>';
  const cal=()=>'<span class="txn16-cal-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="4" y="5" width="16" height="16" rx="2.4"/><path d="M8 3v4"/><path d="M16 3v4"/><path d="M4 10h16"/></svg></span>';
  function isIncomeTx(t){return t.type==='INCOME'||t.type==='DIVEST'||t.large==='Thu nhập'||t.large==='Thu hồi tài sản'||t.large==='Thu hồi';}
  const signedAmount=t=>(isIncomeTx(t)?1:-1)*Number(t.amount||0);
  function meta(t){
    if(isIncomeTx(t))return{cls:'txn16-in',icon:'↗',sign:'+'};
    if(t.type==='INVEST'||t.large==='Đầu tư')return{cls:'txn16-invest',icon:'↗',sign:'-'};
    return{cls:'txn16-out',icon:'↘',sign:'-'};
  }
  function init(){const screen=document.getElementById('screenTransactions');if(!screen)return;screen.innerHTML=`<div class="slide-head"><button class="slide-back" data-txn16-back><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M15 18 9 12l6-6"/></svg></button><div class="slide-title">Giao dịch</div></div><div class="slide-body"><div class="txn16-filter"><div class="txn16-row top"><input class="txn16-input" id="txn16Search" placeholder="Tìm giao dịch..."><button class="txn16-select" data-type-sheet><span id="txn16TypeText">Hiển thị tất cả</span>${chev()}</button></div><div class="txn16-row range"><button class="txn16-select" data-range-sheet><span id="txn16RangeText">1 tháng gần nhất</span>${chev()}</button><button class="txn16-clear" id="txn16Clear">Clear</button></div><div class="txn16-row dates" id="txn16Dates" style="display:none"><button class="txn16-date" data-date-field="from"><span id="txn16From">${toDMY(state.from)}</span>${cal()}</button><button class="txn16-date" data-date-field="to"><span id="txn16To">${toDMY(state.to)}</span>${cal()}</button></div><div class="txn16-error" id="txn16Error">Ngày kết thúc không được nhỏ hơn ngày bắt đầu.</div></div><div class="txn16-total neutral" id="txn16Total"><b>0 đ</b></div><div class="txn16-list" id="txn16List"></div></div>`;screen.addEventListener('click',onClick);document.getElementById('txn16Search').addEventListener('input',e=>{state.search=e.target.value;renderList()});document.getElementById('txn16Clear').onclick=()=>{const range=defaultRange();state.search='';state.type='ALL';state.range='1M';state.from=range.from;state.to=range.to;sync();const d=document.getElementById('txn16Dates');if(d)d.style.display='none';const e=document.getElementById('txn16Error');if(e)e.classList.remove('show');renderList();setTimeout(()=>{const d2=document.getElementById('txn16Dates');if(d2)d2.style.display='none';},0)};document.addEventListener('cat90:changed',()=>{refreshCategories();if(state.editing)rerenderEdit();});ensureSheet();sync();renderList();if(!window.FDB){document.dispatchEvent(new CustomEvent('txn16:changed',{detail:{transactions}}));return;}window.FDB.subscribe(FIREBASE_COLLECTIONS.giaoDich,data=>{transactions=data.map(normalizeTx).filter(x=>x.id&&x.large&&x.group&&x.child);if(state.editing){const fresh=transactions.find(x=>x.id===state.editing.id);if(fresh)state.editing=JSON.parse(JSON.stringify(fresh));}document.dispatchEvent(new CustomEvent('txn16:changed',{detail:{transactions}}));renderList();},console.error);}
  function sync(){const custom=state.range==='CUSTOM';document.getElementById('screenTransactions')?.classList.toggle('is-custom-range',custom);document.getElementById('txn16Search').value=state.search;document.getElementById('txn16TypeText').textContent=typeLabels[state.type];document.getElementById('txn16RangeText').textContent=rangeLabels[state.range];document.getElementById('txn16Dates').style.display=custom?'grid':'none';document.getElementById('txn16From').textContent=toDMY(state.from);document.getElementById('txn16To').textContent=toDMY(state.to);validate()}
  function validate(){const bad=state.range==='CUSTOM'&&state.to<state.from;document.querySelectorAll('.txn16-date').forEach(x=>x.classList.toggle('invalid',bad));document.getElementById('txn16Error').classList.toggle('show',bad);return !bad}
  function filtered(){
    let rows=transactions.slice();
    const q=state.search.trim().toLowerCase();
    if(state.type!=='ALL')rows=rows.filter(x=>x.large===state.type);
    if(q)rows=rows.filter(x=>[x.child,x.group,x.large,x.note,x.amount].join(' ').toLowerCase().includes(q));
    let f=state.from,t=state.to;
    if(state.range!=='CUSTOM'){
      const today=new Date();
      const fromDate=new Date(today);
      if(state.range==='3M')fromDate.setMonth(fromDate.getMonth()-3);
      else if(state.range==='6M')fromDate.setMonth(fromDate.getMonth()-6);
      else if(state.range==='1Y')fromDate.setFullYear(fromDate.getFullYear()-1);
      else fromDate.setMonth(fromDate.getMonth()-1);
      const iso=d=>d.toISOString().slice(0,10);
      f=iso(fromDate); t=iso(today);
    }
    return rows.filter(x=>(!f||x.date>=f)&&(!t||x.date<=t)).sort((a,b)=>{
      const ad=(a.date||'')+' '+(a.time||'00:00:00')+' '+(a.createdAt||'');
      const bd=(b.date||'')+' '+(b.time||'00:00:00')+' '+(b.createdAt||'');
      return bd.localeCompare(ad);
    });
  }
  function renderList(){if(!validate())return;const list=document.getElementById('txn16List');const rows=filtered();const total=rows.reduce((sum,x)=>sum+signedAmount(x),0);const totalEl=document.getElementById('txn16Total');if(totalEl){totalEl.className=`txn16-total ${total>0?'positive':total<0?'negative':'neutral'}`;totalEl.innerHTML=`<b>${fmt(total)}</b>`;}if(!rows.length){list.innerHTML='<div class="txn16-empty">Không có giao dịch phù hợp</div>';return}const groups={};rows.forEach(x=>(groups[x.date]||(groups[x.date]=[])).push(x));list.innerHTML=Object.keys(groups).sort((a,b)=>b.localeCompare(a)).map(day=>`<section><div class="txn16-day-label">${dayLabel(day)}</div><div class="txn16-group">${groups[day].map(t=>{const m=meta(t);return `<button class="txn16-item ${m.cls}" data-edit="${t.id}"><span class="txn16-icon">${m.icon}</span><span><div class="txn16-title">${t.child}</div><div class="txn16-note">${t.note}</div></span><span class="txn16-amount">${m.sign}${fmt(t.amount)}</span></button>`}).join('')}</div></section>`).join('')}
  window.TXN_addTransaction=function(tx){
    if(!tx)return;
    if(!tx.createdAt)tx.createdAt=new Date().toISOString();
    if(!tx.time)tx.time=new Date().toTimeString().slice(0,8);
    const {id,...data}=tx;
    const txData={
      id:data.external_id||('GD'+Date.now()),
      ngay:data.date,
      created_at:data.createdAt||new Date().toISOString(),
      updated_at:new Date().toISOString(),
      loai_giao_dich:data.type||typeFromLarge(data.large),
      loai_lon:data.large,
      nhom_danh_muc:data.group,
      hang_muc_con:data.child,
      so_tien:Number(data.amount||0),
      ghi_chu:data.note||'',
      don_gia:assetUnitPriceForTx(data),
      don_vi:isAssetTx(data)?(data.assetUnit||(assetTypeOf(data)==='GOLD'?'Chỉ':'Đơn vị')):'',
      loai_tai_san:isAssetTx(data)?(data.assetType||assetTypeOf(data)):'',
      phi:0,
      so_luong:isAssetTx(data)?(Number(data.assetQty||0)||1):0,
      ten_tai_san:isAssetTx(data)?(data.assetName||(assetTypeOf(data)==='GOLD'?'Vàng 98%':data.child||data.group||'Tài sản')):''
    };
    window.FDB.add(FIREBASE_COLLECTIONS.giaoDich,txData)
      .then(ref=>window.ASSET52_syncTransactionAsset?.({...data,...txData,assetQty:txData.so_luong,assetUnit:txData.don_vi,assetPrice:txData.don_gia,fee:txData.phi,assetType:txData.loai_tai_san,assetName:txData.ten_tai_san},ref.id,{mode:'create'}))
      .catch(console.error);
  };
  window.TXN_renderList=function(){renderList();};
  window.TXN_getTransactions=function(){return transactions.slice();};

  function onClick(e){if(e.target.closest('[data-txn16-back]')){closeScreen('screenTransactions');return}if(e.target.closest('[data-type-sheet]'))return openOptions('Loại lớn',Object.entries(typeLabels).map(([value,label])=>({value,label})),state.type,v=>{state.type=v;sync();renderList()});if(e.target.closest('[data-range-sheet]'))return openOptions('Khoảng thời gian',Object.entries(rangeLabels).map(([value,label])=>({value,label})),state.range,v=>{state.range=v;sync();renderList()});const date=e.target.closest('[data-date-field]');if(date)return openCalendar(state[date.dataset.dateField],v=>{state[date.dataset.dateField]=v;sync();renderList()});const edit=e.target.closest('[data-edit]');if(edit)return openEdit(edit.dataset.edit)}
  function ensureSheet(){const phone=document.getElementById('phone');if(!document.getElementById('txn16Backdrop'))phone.insertAdjacentHTML('beforeend','<div class="txn16-backdrop" id="txn16Backdrop"></div><div class="txn16-sheet" id="txn16Sheet"></div>')}
  function openOptions(title,options,current,onPick){ensureSheet();const sheet=document.getElementById('txn16Sheet'),back=document.getElementById('txn16Backdrop');sheet.innerHTML=`<div class="txn16-handle"></div><div class="txn16-sheet-title">${title}</div>${options.map(o=>`<button class="txn16-option ${o.value===current?'active':''}" data-val="${o.value}"><span>${o.label}</span><span class="txn16-check">${o.value===current?'✓':''}</span></button>`).join('')}`;function close(){sheet.classList.remove('show');back.classList.remove('show')}sheet.onclick=e=>{const b=e.target.closest('[data-val]');if(!b)return;onPick(b.dataset.val);close()};back.onclick=close;sheet.classList.add('show');back.classList.add('show')}
  function openCalendar(current,onPick){ensureSheet();let [y,m]=String(current||new Date().toISOString().slice(0,10)).split('-').map(Number);const sheet=document.getElementById('txn16Sheet'),back=document.getElementById('txn16Backdrop');const monthNames=['Tháng 01','Tháng 02','Tháng 03','Tháng 04','Tháng 05','Tháng 06','Tháng 07','Tháng 08','Tháng 09','Tháng 10','Tháng 11','Tháng 12'];function drawDay(){const first=new Date(y,m-1,1);const offset=(first.getDay()+6)%7;const days=new Date(y,m,0).getDate();let cells=[];const pm=m===1?12:m-1,py=m===1?y-1:y,pdays=new Date(py,pm,0).getDate();for(let i=offset-1;i>=0;i--)cells.push({d:pdays-i,m:pm,y:py,muted:true});for(let d=1;d<=days;d++)cells.push({d,m,y});const nm=m===12?1:m+1,ny=m===12?y+1:y;while(cells.length<42)cells.push({d:cells.length-(offset+days)+1,m:nm,y:ny,muted:true});sheet.innerHTML=`<div class="txn16-handle"></div><div class="txn16-cal-head"><button data-prev>‹</button><button class="txn16-cal-title" data-title>Tháng ${pad(m)}/${y}</button><button data-next>›</button></div><div class="txn16-week"><span>T2</span><span>T3</span><span>T4</span><span>T5</span><span>T6</span><span>T7</span><span>CN</span></div><div class="txn16-cal-grid">${cells.map(c=>{const v=`${c.y}-${pad(c.m)}-${pad(c.d)}`;return `<button class="txn16-day ${c.muted?'muted':''} ${v===current?'selected':''}" data-date="${v}">${c.d}</button>`}).join('')}</div>`}function drawMonth(){sheet.innerHTML=`<div class="txn16-handle"></div><div class="txn16-cal-head"><button data-year-prev>‹</button><button class="txn16-cal-title" data-year-title>${y}</button><button data-year-next>›</button></div><div class="txn16-month-grid">${monthNames.map((name,i)=>`<button class="txn16-month-pick ${i+1===m?'selected':''}" data-month="${i+1}">${name}</button>`).join('')}</div>`}function drawYear(){const start=Math.floor((y-6)/12)*12;sheet.innerHTML=`<div class="txn16-handle"></div><div class="txn16-cal-head"><button data-years-prev>‹</button><button class="txn16-cal-title">${start} - ${start+11}</button><button data-years-next>›</button></div><div class="txn16-year-grid">${Array.from({length:12},(_,i)=>start+i).map(year=>`<button class="txn16-year-pick ${year===y?'selected':''}" data-year="${year}">${year}</button>`).join('')}</div>`}function close(){sheet.classList.remove('show');back.classList.remove('show')}drawDay();sheet.onclick=e=>{if(e.target.closest('[data-title]')){drawMonth();return}if(e.target.closest('[data-year-title]')){drawYear();return}if(e.target.closest('[data-prev]')){m--;if(m<1){m=12;y--}drawDay();return}if(e.target.closest('[data-next]')){m++;if(m>12){m=1;y++}drawDay();return}if(e.target.closest('[data-year-prev]')){y--;drawMonth();return}if(e.target.closest('[data-year-next]')){y++;drawMonth();return}if(e.target.closest('[data-years-prev]')){y-=12;drawYear();return}if(e.target.closest('[data-years-next]')){y+=12;drawYear();return}const month=e.target.closest('[data-month]');if(month){m=Number(month.dataset.month);drawDay();return}const year=e.target.closest('[data-year]');if(year){y=Number(year.dataset.year);drawMonth();return}const d=e.target.closest('[data-date]');if(d){onPick(d.dataset.date);close()}};back.onclick=close;sheet.classList.add('show');back.classList.add('show')}
  function openEdit(id){const found=transactions.find(x=>x.id===id);if(!found)return;state.editing=JSON.parse(JSON.stringify(found));state.editOriginal=JSON.parse(JSON.stringify(found));document.getElementById('txn16Edit')?.remove();document.getElementById('phone').insertAdjacentHTML('beforeend',editHtml());const el=document.getElementById('txn16Edit');window.ensureHomeButtons?.(el);bindEdit(el);bindEditActionButtons(el);requestAnimationFrame(()=>el.classList.add('active'))}
  function typeFromLarge(x){return x==='Thu nhập'?'INCOME':x==='Đầu tư'?'INVEST':(x==='Thu hồi tài sản'||x==='Thu hồi')?'DIVEST':'EXPENSE'}
  function assetEditHtml(t){
    if(!isAssetTx(t))return '';
    const type=assetTypeOf(t);
    if(type==='SAVING'){
      const term=t.savingTerm||'1 tháng';
      const rate=t.assetInterest||t.assetRate||'';
      const interest=proratedInterest(t.amount,rate,savingTermDays(term,t.date));
      return `<div class="txn16-asset-block saving-mode"><div class="txn16-field full"><label class="txn16-label">Kỳ hạn</label><button class="txn16-control" data-edit-saving-term type="button"><span>${term}</span>${chev()}</button></div><div class="txn16-field full"><label class="txn16-label">Lãi suất / năm</label><input class="txn16-money-input" id="txn16AssetInterest" inputmode="decimal" value="${rate}" placeholder="VD: 5.5"></div><div class="txn16-field full"><div class="txn16-saving-preview"><span>Lãi dự kiến: <b id="txn16SavingMaturity">${fmt(interest)}</b></span></div></div></div>`;
    }
    const isGold=type==='GOLD';
    const assetName=t.assetName||(isGold?'Vàng 98%':t.child||'');
    const unit=t.assetUnit||(isGold?'Chỉ':'Đơn vị');
    const unitField=isGold?`<button class="txn16-control" data-edit-asset-unit type="button"><span>${unit}</span>${chev()}</button>`:`<input class="txn16-money-input" id="txn16AssetUnit" value="${unit}">`;
    return `<div class="txn16-asset-block"><div class="txn16-field full"><label class="txn16-label">Tên tài sản</label><input class="txn16-money-input" id="txn16AssetName" value="${assetName}"></div><div class="txn16-field"><label class="txn16-label">Số lượng</label><input class="txn16-money-input" id="txn16AssetQty" inputmode="decimal" value="${t.assetQty||''}"></div><div class="txn16-field"><label class="txn16-label">Đơn vị</label>${unitField}</div><div class="txn16-field full"><label class="txn16-label">Phí / tiền công</label><input class="txn16-money-input" id="txn16Fee" inputmode="numeric" pattern="[0-9]*" value="${t.fee||''}"></div></div>`;
  }
  function editHtml(){const t=state.editing;return `<section class="txn16-edit" id="txn16Edit"><div class="slide-head"><button class="slide-back" data-edit-back><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M15 18 9 12l6-6"/></svg></button><div class="slide-title">Sửa giao dịch</div></div><div class="txn16-edit-body"><div class="txn16-edit-card"><div class="txn16-edit-grid"><div class="txn16-field"><label class="txn16-label">Ngày</label><button class="txn16-control" data-edit-date>${toDMY(t.date)}${cal()}</button></div><div class="txn16-field"><label class="txn16-label">Loại lớn</label><button class="txn16-control" data-edit-large>${t.large}${chev()}</button></div><div class="txn16-field full edit-row"><label class="txn16-label">Nhóm danh mục</label><button class="txn16-control" data-edit-group>${t.group}${chev()}</button></div><div class="txn16-field full edit-row"><label class="txn16-label">Hạng mục con</label><button class="txn16-control" data-edit-child>${t.child}${chev()}</button></div><div class="txn16-field full"><div class="txn16-label-row"><label class="txn16-label">Số tiền</label><span class="txn16-preview">${fmt(t.amount)}</span></div><input class="txn16-money-input" id="txn16Amount" inputmode="numeric" pattern="[0-9]*" value="${t.amount}"></div>${assetEditHtml(t)}<div class="txn16-field full"><label class="txn16-label">Ghi chú</label><textarea class="txn16-note-input" id="txn16Note">${t.note||''}</textarea></div></div><div class="txn16-actions"><button class="txn16-delete" id="txn16Delete">Xóa</button><button class="txn16-save" id="txn16Save">Lưu thay đổi</button></div></div></div></section>`}
  function rerenderEdit(){const old=document.getElementById('txn16Edit');if(old){old.outerHTML=editHtml();const el=document.getElementById('txn16Edit');el.classList.add('active');window.ensureHomeButtons?.(el);bindEdit(el);bindEditActionButtons(el)}}
  function closeEditScreen(){
    const el=document.getElementById('txn16Edit');
    el?.classList.remove('active');
    setTimeout(()=>el?.remove(),330);
  }
  function deleteEditingTransaction(){
    if(!state.editing||state.saving)return Promise.resolve();
    state.saving=true;
    window.QLCT_setBusy?.(true,'Đang xóa giao dịch');
    const tx=state.editOriginal||state.editing;
    const id=state.editing.id;
    const request=window.ASSET52_deleteTransactionAtomic
      ? window.ASSET52_deleteTransactionAtomic(tx,id)
      : window.FDB?.remove(FIREBASE_COLLECTIONS.giaoDich,id);
    return Promise.resolve(request).then(closeEditScreen).catch(error=>{
      console.error('Delete transaction failed',error);
      throw error;
    }).finally(()=>{state.saving=false;window.QLCT_setBusy?.(false);});
  }
  function saveEditingTransaction(){
    if(!state.editing||state.saving)return Promise.resolve();
    state.saving=true;
    window.QLCT_setBusy?.(true,'Đang lưu thay đổi');
    const request=window.ASSET52_saveTransactionAtomic
      ? window.ASSET52_saveTransactionAtomic(state.editing,state.editing.id,txToFirestore(state.editing),{mode:'edit'})
      : window.FDB?.set(FIREBASE_COLLECTIONS.giaoDich,state.editing.id,txToFirestore(state.editing));
    return Promise.resolve(request).then(closeEditScreen).catch(error=>{
      console.error('Save transaction failed',error);
      throw error;
    }).finally(()=>{state.saving=false;window.QLCT_setBusy?.(false);});
  }
  function bindEditActionButtons(el){
    const del=el?.querySelector('#txn16Delete');
    const save=el?.querySelector('#txn16Save');
    const onDelete=e=>{
      e.preventDefault();
      e.stopPropagation();
      deleteEditingTransaction().catch(()=>{});
    };
    const onSave=e=>{
      e.preventDefault();
      e.stopPropagation();
      saveEditingTransaction().catch(()=>{});
    };
    if(del){
      del.onclick=onDelete;
      del.onpointerup=onDelete;
    }
    if(save){
      save.onclick=onSave;
      save.onpointerup=onSave;
    }
  }
  function lockEditScreenMove(e){
    const screen=document.getElementById('txn16Edit');
    if(!screen?.classList.contains('active'))return;
    if(e.target?.closest?.('#txn16Sheet'))return;
    if(e.cancelable)e.preventDefault();
  }
  function updateEditSavingPreview(){
    const t=state.editing;
    const el=document.getElementById('txn16SavingMaturity');
    if(!t||!el)return;
    const term=t.savingTerm||'1 tháng';
    const rate=t.assetInterest||t.assetRate||'';
    t.savingTermDays=savingTermDays(term,t.date);
    t.savingInterestAmount=proratedInterest(t.amount,rate,t.savingTermDays);
    el.textContent=fmt(t.savingInterestAmount);
  }
  document.addEventListener('click',e=>{
    if(!state.editing||!document.getElementById('txn16Edit')?.classList.contains('active'))return;
    const term=e.target.closest('[data-edit-saving-term]');
    if(!term)return;
    e.preventDefault();
    e.stopImmediatePropagation();
    openOptions('Kỳ hạn',savingTermOptions,state.editing.savingTerm||'1 tháng',v=>{state.editing.savingTerm=v;rerenderEdit();});
  },true);
  document.addEventListener('input',e=>{
    if(!state.editing||!document.getElementById('txn16Edit')?.classList.contains('active'))return;
    if(e.target?.id==='txn16AssetInterest'){state.editing.assetInterest=e.target.value;state.editing.assetRate=e.target.value;updateEditSavingPreview();}
    if(e.target?.id==='txn16Amount')setTimeout(updateEditSavingPreview,0);
  },true);
  function bindEdit(el){el.onclick=e=>{const t=state.editing;if(e.target.closest('[data-edit-back]')){el.classList.remove('active');setTimeout(()=>el.remove(),330);return}if(e.target.closest('[data-edit-date]'))openCalendar(t.date,v=>{t.date=v;rerenderEdit()});if(e.target.closest('[data-edit-large]')){refreshCategories();openOptions('Loại lớn',categories.large.map(x=>({value:x,label:x})),t.large,v=>{t.large=v;t.type=typeFromLarge(v);const groups=categories.groups[v]||[];t.group=groups[0]||'';const children=categoryChildren(t.large,t.group);t.child=children[0]||'';if(!isAssetTx(t))clearAssetFields(t);rerenderEdit()});}if(e.target.closest('[data-edit-group]')){refreshCategories();openOptions('Nhóm danh mục',(categories.groups[t.large]||[]).map(x=>({value:x,label:x})),t.group,v=>{t.group=v;const children=categoryChildren(t.large,t.group);t.child=children[0]||'';if(!isAssetTx(t))clearAssetFields(t);rerenderEdit()});}if(e.target.closest('[data-edit-child]')){refreshCategories();openOptions('Hạng mục con',categoryChildren(t.large,t.group).map(x=>({value:x,label:x})),t.child,v=>{t.child=v;if(!isAssetTx(t))clearAssetFields(t);rerenderEdit()});}if(e.target.closest('[data-edit-asset-unit]')){openOptions('Đơn vị',goldUnitOptions,t.assetUnit||'Chỉ',v=>{t.assetUnit=v;rerenderEdit()});}};el.querySelector('#txn16Amount').oninput=e=>{state.editing.amount=Number(String(e.target.value).replace(/\D/g,''))||0;const p=el.querySelector('.txn16-preview');if(p)p.textContent=fmt(state.editing.amount);};el.querySelector('#txn16Note').oninput=e=>state.editing.note=e.target.value;const an=el.querySelector('#txn16AssetName');if(an)an.oninput=e=>state.editing.assetName=e.target.value;const aq=el.querySelector('#txn16AssetQty');if(aq)aq.oninput=e=>state.editing.assetQty=Number(String(e.target.value).replace(',','.'))||0;const au=el.querySelector('#txn16AssetUnit');if(au)au.oninput=e=>state.editing.assetUnit=e.target.value;const fee=el.querySelector('#txn16Fee');if(fee)fee.oninput=e=>state.editing.fee=Number(String(e.target.value).replace(/\D/g,''))||0;}
  document.addEventListener('click',e=>{
    const del=e.target.closest('#txn16Delete');
    const save=e.target.closest('#txn16Save');
    if((!del&&!save)||!state.editing)return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const request=del?deleteEditingTransaction():saveEditingTransaction();
    Promise.resolve(request).catch(()=>{});
  },true);
  document.addEventListener('touchmove',lockEditScreenMove,{passive:false});
  document.addEventListener('wheel',lockEditScreenMove,{passive:false});
  document.addEventListener('asset52:changed',()=>{if(document.getElementById('txn16List'))renderList();});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();




// demo32: class-based custom range visibility controller
(function(){
  function u(){
    var s=document.getElementById('screenTransactions'),r=document.getElementById('txn16RangeText'),d=document.getElementById('txn16Dates'),e=document.getElementById('txn16Error');
    if(!s||!r||!d)return;
    var c=(r.textContent||'').trim()==='Tùy chỉnh';
    s.classList.toggle('is-custom-range',c);
    if(!c){d.style.display='none';if(e)e.classList.remove('show');}
    else d.style.display='grid';
  }
  function reset(){
    var r=document.getElementById('txn16RangeText');
    if(r)r.textContent='1 tháng gần nhất';
    u();
  }
  document.addEventListener('click',function(ev){
    if(ev.target.closest('#txn16Clear')||ev.target.closest('.dock-content .nav-item')){
      setTimeout(reset,20);setTimeout(reset,100);setTimeout(reset,220);
    }
    if(ev.target.closest('[data-range-sheet]')){
      setTimeout(function(){
        document.querySelectorAll('.txn16-option').forEach(function(o){
          o.addEventListener('click',function(){setTimeout(u,20);setTimeout(u,100);},{once:true});
        });
      },0);
    }
  },true);
  document.addEventListener('DOMContentLoaded',u);
  setInterval(u,250);
})();
