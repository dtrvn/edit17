(function(){
  let monthOffset=0;
  let yearOffset=0;
  const detailState={tab:'Thu nhập',mode:'month',monthKey:'',year:0};
  const childDetailState={large:'',child:'',mode:'year',monthKey:'',year:0,color:'#2563eb'};
  const pad=n=>String(n).padStart(2,'0');
  const fmt=n=>Number(n||0).toLocaleString('vi-VN')+' đ';
  const firstValue=(obj,keys)=>{
    for(const key of keys){
      const value=obj?.[key];
      if(value!==undefined&&value!==null&&String(value).trim()!=='')return value;
    }
    return '';
  };
  const plainText=value=>String(value||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\u0111/g,'d');
  function compactMoney(n){
    const value=Number(n||0);
    if(Math.abs(value)>=1000000000)return (value/1000000000).toLocaleString('vi-VN',{maximumFractionDigits:1})+' tỷ';
    if(Math.abs(value)>=1000000)return Math.round(value/1000000).toLocaleString('vi-VN')+' tr';
    return fmt(value);
  }
  function compactChartMoney(n){
    const value=Number(n||0);
    if(Math.abs(value)>=1000000000)return (value/1000000000).toLocaleString('vi-VN',{maximumFractionDigits:1})+' tỷ';
    if(Math.abs(value)>=1000000)return Math.round(value/1000000).toLocaleString('vi-VN')+' tr';
    if(Math.abs(value)>=1000)return Math.round(value/1000).toLocaleString('vi-VN')+' k';
    return value.toLocaleString('vi-VN');
  }
  const colors=['#3b6df2','#f5a524','#35c69a','#8b5cf6','#06b6d4','#ef4444'];
  const detailColors=['#2563eb','#f59e0b','#10b981','#8b5cf6','#06b6d4','#ef4444','#ec4899','#14b8a6','#84cc16','#f97316','#6366f1','#eab308','#0ea5e9','#22c55e','#d946ef','#f43f5e'];
  function detailColor(index,total){
    if(index<detailColors.length)return detailColors[index];
    const hue=Math.round((index*137.508)%360);
    const light=44+(index%3)*6;
    return `hsl(${hue} 72% ${light}%)`;
  }
  function assetColor(asset,index){
    const key=String([asset?.key,asset?.cls,asset?.name].filter(Boolean).join(' ')).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
    if((key.includes('gold')||key.includes('vang'))&&(key.includes('cuoi')||key.includes('wedding')))return '#ec4899';
    if((key.includes('gold')||key.includes('vang'))&&key.includes('98'))return '#d97706';
    if(key.includes('gold')||key.includes('vang'))return '#f59e0b';
    if(key.includes('cash')||key.includes('bank'))return '#2563eb';
    if(key.includes('stock')||key.includes('co-phieu'))return '#10b981';
    if(key.includes('saving')||key.includes('tiet-kiem'))return '#8b5cf6';
    if(key.includes('real')||key.includes('nha')||key.includes('dat'))return '#ef4444';
    return colors[index%colors.length];
  }
  function addMonths(date,offset){return new Date(date.getFullYear(),date.getMonth()+offset,1);}
  function monthLabel(offset){const d=addMonths(new Date(),offset);return `${pad(d.getMonth()+1)}/${d.getFullYear()}`;}
  function yearLabel(offset){const d=addMonths(new Date(),offset*12);return `Năm ${d.getFullYear()}`;}
  function monthKey(offset){const d=addMonths(new Date(),offset);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;}
  function shiftMonthKey(key,delta){
    const [year,month]=String(key||monthKey(0)).split('-').map(Number);
    const d=new Date(year,month-1+delta,1);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
  }
  function shiftYear(value,delta){
    return Number(value||new Date().getFullYear())+delta;
  }
  function yearValue(offset){return addMonths(new Date(),offset*12).getFullYear();}
  function transactions(){
    return typeof window.TXN_getTransactions==='function'?window.TXN_getTransactions():[];
  }
  function assets(){return typeof window.ASSET52_getAssets==='function'?window.ASSET52_getAssets().assets:[];}
  function localDateValue(date){
    return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}`;
  }
  function normalizedDateValue(value){
    if(value&&typeof value.toDate==='function')return localDateValue(value.toDate());
    const text=String(value||'').trim();
    let match=text.match(/^(\d{4})[-/](\d{1,2})(?:[-/](\d{1,2}))?/);
    if(match)return `${match[1]}-${pad(match[2])}-${pad(match[3]||1)}`;
    match=text.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
    if(match)return `${match[3]}-${pad(match[2])}-${pad(match[1])}`;
    return text.slice(0,10);
  }
  function transactionDate(tx){
    return normalizedDateValue(firstValue(tx,['date','ngay','ngay_giao_dich','ngayGiaoDich','created_at','createdAt']));
  }
  function transactionPeriodKey(tx,mode){
    return transactionDate(tx).slice(0,mode==='year'?4:7);
  }
  function incomeLargeNames(){return ['Thu nhập','Thu hồi tài sản','Thu hồi'];}
  function expenseLargeNames(){return ['Chi tiêu','Đầu tư'];}
  function tabLargeNames(tab){return tab==='Chi tiêu'?expenseLargeNames():incomeLargeNames();}
  function normalizedLargeOf(tx){
    return plainText(firstValue(tx,['loai_lon','large'])||largeOf(tx));
  }
  function isIncomeLarge(tx){
    const large=normalizedLargeOf(tx);
    return large.includes('thu nhap')||large.includes('thu hoi');
  }
  function isExpenseLarge(tx){
    const large=normalizedLargeOf(tx);
    return large.includes('chi tieu')||large.includes('dau tu');
  }
  function matchesReportTab(tx,tab){
    return tab==='Chi tiêu'?isExpenseLarge(tx):isIncomeLarge(tx);
  }
  function byGroup(rows,largeNames){
    const totals={};
    const tab=(largeNames||[]).some(name=>isExpenseLarge({loai_lon:name}))?'Chi tiêu':'Thu nhập';
    rows.filter(x=>matchesReportTab(x,tab)).forEach(x=>{const key=x.group||x.child||largeOf(x);totals[key]=(totals[key]||0)+Number(x.amount||0);});
    return Object.entries(totals).map(([name,value],i)=>({name,value,color:colors[i%colors.length]})).sort((a,b)=>b.value-a.value);
  }
  function monthlySummary(){
    const key=monthKey(monthOffset);
    const rows=transactions().filter(x=>transactionPeriodKey(x,'month')===key);
    return {
      income:byGroup(rows,incomeLargeNames()),
      expense:byGroup(rows,expenseLargeNames())
    };
  }
  function monthsOfYear(){
    const year=yearValue(yearOffset);
    return Array.from({length:12},(_,i)=>{
      const m=String(i+1).padStart(2,'0');
      const rows=transactions().filter(x=>transactionPeriodKey(x,'month')===`${year}-${m}`);
      const income=rows.filter(x=>matchesReportTab(x,'Thu nhập')).reduce((s,x)=>s+Number(x.amount||0),0);
      const expense=rows.filter(x=>matchesReportTab(x,'Chi tiêu')).reduce((s,x)=>s+Number(x.amount||0),0);
      return {m:'T'+(i+1),income,expense};
    });
  }
  function seg(scope,offset){return `<div class="report72-seg" data-report-scope="${scope}">
    <button data-report-nav="prev" class="${offset<0?'active':''}">Trước</button><button data-report-nav="current" class="${offset===0?'active':''}">Hiện tại</button><button data-report-nav="next" class="${offset>0?'active':''}">Sau</button>
  </div>`;}
  function summaryBox(title,total,items){
    const max=Math.max(...items.map(x=>x.value),1);
    return `<div class="report72-summary-box"><div class="report72-group-head"><div class="report72-group-name">${title}</div><div class="report72-group-total">${fmt(total)}</div></div>${items.length?items.map(x=>`<div class="report72-row"><div class="report72-label">${x.name}</div><div class="report72-track"><div class="report72-fill" style="--w:${Math.max(7,Math.round(x.value/max*100))}%;--c:${x.color}"></div></div><div class="report72-value">${fmt(x.value)}</div></div>`).join(''):'<div class="report72-row"><div class="report72-label">Chưa có dữ liệu</div></div>'}</div>`;
  }
  function escapeHtml(value){
    return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  function formatDate(v){
    const [y,m,d]=String(v||'').split('-');
    return d&&m&&y?`${d}/${m}/${y}`:'';
  }
  function isGoldAssetTx(tx){
    const text=plainText([
      largeOf(tx),
      tx?.type,
      tx?.loai_giao_dich,
      firstValue(tx,['assetType','loai_tai_san','loaiTaiSan']),
      firstValue(tx,['assetName','ten_tai_san','tenTaiSan']),
      tx?.group,
      tx?.child,
      tx?.hang_muc_con
    ].join(' '));
    return text.includes('gold')||text.includes('vang');
  }
  function childTxNote(tx){
    const note=String(tx.note||tx.ghi_chu||'').trim();
    if(!isGoldAssetTx(tx))return note;
    const assetName=String(firstValue(tx,['assetName','ten_tai_san','tenTaiSan'])||'Vàng 98%').trim();
    return [assetName,note].filter(Boolean).join(' - ');
  }
  function largeOf(tx){
    if(tx.large)return tx.large;
    if(tx.loai_lon)return tx.loai_lon;
    if(tx.type==='INCOME')return 'Thu nhập';
    if(tx.type==='INVEST')return 'Đầu tư';
    if(tx.type==='DIVEST')return 'Thu hồi tài sản';
    return 'Chi tiêu';
  }
  function categoryChildren(largeNames){
    largeNames=Array.isArray(largeNames)?largeNames:[largeNames];
    const rows=typeof window.CAT90_getRows==='function'?window.CAT90_getRows():[];
    const seen=new Set();
    return rows.filter(x=>largeNames.includes(x.large)).map(x=>x.child||x.group).filter(Boolean).filter(name=>{
      if(seen.has(name))return false;
      seen.add(name);
      return true;
    });
  }
  function detailChartData(){
    const large=detailState.tab==='Chi tiêu'?'Chi tiêu':'Thu nhập';
    const largeNames=tabLargeNames(detailState.tab);
    const isYear=detailState.mode==='year';
    const key=isYear?String(detailState.year||yearValue(yearOffset)):detailState.monthKey||monthKey(monthOffset);
    const rows=transactions().filter(x=>{
      const dateKey=transactionPeriodKey(x,isYear?'year':'month');
      return dateKey===key&&matchesReportTab(x,detailState.tab);
    });
    const totals={};
    rows.forEach(x=>{
      const name=x.child||x.group||large;
      totals[name]=(totals[name]||0)+Number(x.amount||0);
    });
    const ordered=categoryChildren(largeNames);
    rows.forEach(x=>{
      const name=x.child||x.group||large;
      if(name&&!ordered.includes(name))ordered.push(name);
    });
    const names=ordered.length?ordered:Object.keys(totals);
    const activeNames=names.filter(name=>(totals[name]||0)>0);
    const items=activeNames.map((name,index)=>({name,value:totals[name]||0,color:detailColor(index,activeNames.length)}));
    const total=items.reduce((sum,x)=>sum+x.value,0);
    const max=Math.max(...items.map(x=>x.value),1);
    return {large,key,items,total,max,isYear};
  }
  function detailDonutGradient(items,total){
    if(!items.length||!total)return '#e8edf4';
    let cursor=0;
    return `conic-gradient(${items.map(item=>{
      const start=cursor;
      cursor+=Number(item.value||0)/total*100;
      return `${item.color} ${start.toFixed(2)}% ${cursor.toFixed(2)}%`;
    }).join(', ')})`;
  }
  function ensureDetailScreen(){
    const phone=document.getElementById('phone');
    if(!phone||document.getElementById('screenReportDetail'))return;
    phone.insertAdjacentHTML('beforeend','<section class="slide-screen report72-detail-screen" id="screenReportDetail" aria-hidden="true"></section>');
  }
  function ensureChildDetailScreen(){
    const phone=document.getElementById('phone');
    if(!phone||document.getElementById('screenReportChildDetail'))return;
    phone.insertAdjacentHTML('beforeend','<section class="slide-screen report72-child-screen" id="screenReportChildDetail" aria-hidden="true"></section>');
  }
  function renderDetailScreen(){
    ensureDetailScreen();
    const screen=document.getElementById('screenReportDetail');
    if(!screen)return;
    const data=detailChartData();
    const isExpenseTab=plainText(detailState.tab).includes('chi tieu');
    screen.classList.toggle('report72-expense-tab',isExpenseTab);
    screen.classList.toggle('report72-income-tab',!isExpenseTab);
    const periodLabel=data.isYear?data.key:`Tháng ${Number(data.key.slice(5,7))}/${data.key.slice(0,4)}`;
    const title=data.isYear?'Chi tiết Thu chi năm':'Chi tiết Thu chi tháng';
    screen.innerHTML=`<div class="slide-head"><button class="slide-back" data-report-detail-back><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M15 18 9 12l6-6"/></svg></button><div class="slide-title">${title}</div></div>
      <div class="slide-body">
        <div class="report72-detail-tabs" role="tablist">
          <button type="button" class="${detailState.tab==='Thu nhập'?'active':''}" data-report-detail-tab="Thu nhập">Thu nhập</button>
          <button type="button" class="${detailState.tab==='Chi tiêu'?'active':''}" data-report-detail-tab="Chi tiêu">Chi tiêu</button>
        </div>
        <div class="report72-detail-period-row">
          <div class="report72-detail-month">${periodLabel}</div>
          <div class="report72-detail-month-nav" aria-label="Chọn tháng">
            <button type="button" data-report-detail-month-nav="prev" aria-label="Tháng trước"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M15 18 9 12l6-6"/></svg></button>
            <button type="button" data-report-detail-month-nav="current" aria-label="Tháng hiện tại"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="4"/></svg></button>
            <button type="button" data-report-detail-month-nav="next" aria-label="Tháng sau"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="m9 18 6-6-6-6"/></svg></button>
          </div>
          <div class="report72-detail-total ${data.large==='Thu nhập'?'positive':'negative'}"><b>${fmt(data.total)}</b></div>
        </div>
        <div class="report72-detail-donut" style="background:${detailDonutGradient(data.items,data.total)}" aria-hidden="true"></div>
        <div class="report72-detail-bars">${data.items.length?data.items.map((item,index)=>`<button type="button" class="report72-detail-bar-row" style="--i:${index};--c:${item.color}" data-report-child="${escapeHtml(item.name)}" data-report-child-color="${item.color}" aria-label="Xem chi tiết ${escapeHtml(item.name)}">
          <div class="report72-detail-bar-top">
            <div class="report72-detail-bar-label">${escapeHtml(item.name)}</div>
            <div class="report72-detail-bar-percent">${data.total?Math.round(item.value/data.total*100):0}%</div>
          </div>
          <div class="report72-detail-bar-track"><div class="report72-detail-bar-fill" style="--w:${Math.round(item.value/data.max*100)}%"></div></div>
          <div class="report72-detail-bar-value">${fmt(item.value)}</div>
          <span class="report72-detail-bar-next" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="m9 18 6-6-6-6"/></svg></span>
        </button>`).join(''):'<div class="report72-detail-empty">Chưa có dữ liệu</div>'}</div>
      </div>`;
  }
  function openDetail(){
    const key=monthKey(monthOffset);
    detailState.tab='Thu nhập';
    detailState.mode='month';
    detailState.monthKey=key;
    detailState.year=Number(key.slice(0,4));
    renderDetailScreen();
    const screen=document.getElementById('screenReportDetail');
    screen?.classList.add('active');
    screen?.setAttribute('aria-hidden','false');
  }
  function openYearDetail(){
    detailState.tab='Thu nhập';
    detailState.mode='year';
    detailState.year=yearValue(yearOffset);
    detailState.monthKey='';
    renderDetailScreen();
    const screen=document.getElementById('screenReportDetail');
    screen?.classList.add('active');
    screen?.setAttribute('aria-hidden','false');
  }
  function childDetailData(){
    const mode=childDetailState.mode==='month'?'month':'year';
    const year=Number(childDetailState.year||new Date().getFullYear());
    const month=childDetailState.monthKey||monthKey(monthOffset);
    const periodKey=mode==='month'?month:String(year);
    const large=childDetailState.large;
    const largeNames=tabLargeNames(large);
    const child=childDetailState.child;
    const rows=transactions().filter(x=>transactionPeriodKey(x,mode)===periodKey&&matchesReportTab(x,large)&&(x.child||x.group||largeOf(x))===child);
    const months=Array.from({length:12},(_,i)=>{
      const key=`${year}-${pad(i+1)}`;
      const value=rows.filter(x=>transactionPeriodKey(x,'month')===key).reduce((sum,x)=>sum+Number(x.amount||0),0);
      return {name:'T'+(i+1),value};
    });
    const sorted=rows.slice().sort((a,b)=>{
      const ad=(a.date||'')+' '+(a.time||'00:00:00')+' '+(a.createdAt||'');
      const bd=(b.date||'')+' '+(b.time||'00:00:00')+' '+(b.createdAt||'');
      return bd.localeCompare(ad);
    });
    const groups={};
    sorted.forEach(tx=>{
      const day=transactionDate(tx)||tx.date||'';
      (groups[day]||(groups[day]=[])).push(tx);
    });
    const rowColor=childDetailState.color||'#2563eb';
    const groupedRows=Object.keys(groups).sort((a,b)=>b.localeCompare(a)).map(day=>`<section class="report72-child-day-group" style="--c:${rowColor}">
      <div class="report72-child-day">${formatDate(day)}</div>
      <div class="report72-child-tx-stack">${groups[day].map(tx=>`<div class="report72-child-tx"><div class="report72-child-tx-note">${escapeHtml(childTxNote(tx))}</div><div class="report72-child-tx-amount">${fmt(tx.amount)}</div></div>`).join('')}</div>
    </section>`).join('');
    const total=rows.reduce((sum,x)=>sum+Number(x.amount||0),0);
    const max=Math.max(...months.map(x=>x.value),1);
    return {mode,year,month,large,child,months,rows:sorted,groupedRows,total,max,color:childDetailState.color||'#2563eb'};
  }
  function childLineAreaChart(data){
    const width=400, height=152, left=16, right=384, top=28, base=112;
    const step=(right-left)/11;
    const points=data.months.map((m,index)=>{
      const x=left+step*index;
      const rawY=base-(m.value/data.max)*(base-top);
      const y=Math.max(top,Math.min(base,rawY));
      return {x,y,value:m.value,name:m.name};
    });
    const line=points.map(p=>`${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    const area=`${left},${base} ${line} ${right},${base}`;
    const lineLength=points.slice(1).reduce((sum,p,index)=>{
      const prev=points[index];
      return sum+Math.hypot(p.x-prev.x,p.y-prev.y);
    },0);
    return `<div class="report72-child-chart" style="--c:${data.color};--line:${Math.ceil(lineLength)}">
      <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Biểu đồ 12 tháng">
        <polygon class="report72-child-area" points="${area}"></polygon>
        <path class="report72-child-grid" d="M${left} ${top}H${right}M${left} ${(top+base)/2}H${right}M${left} ${base}H${right}"/>
        <polyline class="report72-child-line" points="${line}"></polyline>
        ${points.map(p=>`<circle class="report72-child-dot" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="2.8"></circle><text class="report72-child-money" x="${p.x.toFixed(1)}" y="${Math.max(10,p.y-7).toFixed(1)}">${compactChartMoney(p.value)}</text><text class="report72-child-month-label" x="${p.x.toFixed(1)}" y="140">${p.name.replace('T','')}</text>`).join('')}
      </svg>
    </div>`;
  }
  function renderChildDetailScreen(){
    ensureChildDetailScreen();
    const screen=document.getElementById('screenReportChildDetail');
    if(!screen)return;
    const data=childDetailData();
    const periodLabel=data.mode==='month'?`Tháng ${Number(data.month.slice(5,7))}/${data.month.slice(0,4)}`:data.year;
    const chartHtml=data.mode==='year'?childLineAreaChart(data):'';
    screen.innerHTML=`<div class="slide-head"><button class="slide-back" data-report-child-back><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M15 18 9 12l6-6"/></svg></button><div class="slide-title">Chi tiết ${escapeHtml(data.child)}</div></div>
      <div class="slide-body">
        <div class="report72-child-period-row">
          <div class="report72-detail-month">${periodLabel}</div>
          <div class="report72-detail-month-nav" aria-label="Chọn thời gian">
            <button type="button" data-report-child-year-nav="prev" aria-label="Năm trước"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M15 18 9 12l6-6"/></svg></button>
            <button type="button" data-report-child-year-nav="current" aria-label="Năm hiện tại"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="4"/></svg></button>
            <button type="button" data-report-child-year-nav="next" aria-label="Năm sau"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="m9 18 6-6-6-6"/></svg></button>
          </div>
          <div class="report72-detail-total ${data.large==='Thu nhập'?'positive':'negative'}"><b>${fmt(data.total)}</b></div>
        </div>
        ${chartHtml}
        <div class="report72-child-list">${data.rows.length?data.groupedRows:'<div class="report72-detail-empty">Chưa có giao dịch</div>'}</div>
      </div>`;
  }
  function openChildDetail(child,color){
    const mode=detailState.mode==='year'?'year':'month';
    const key=detailState.monthKey||monthKey(monthOffset);
    childDetailState.large=detailState.tab==='Chi tiêu'?'Chi tiêu':'Thu nhập';
    childDetailState.child=child;
    childDetailState.mode=mode;
    childDetailState.monthKey=mode==='month'?key:'';
    childDetailState.year=mode==='year'?(detailState.year||yearValue(yearOffset)):Number(key.slice(0,4));
    childDetailState.color=color||'#2563eb';
    renderChildDetailScreen();
    const screen=document.getElementById('screenReportChildDetail');
    screen?.classList.add('active');
    screen?.setAttribute('aria-hidden','false');
  }
  function yearlyChart(months,animate){
    months=months||monthsOfYear();
    const max=Math.max(...months.flatMap(x=>[x.income,x.expense]),1);
    const ticks=[max,max*.75,max*.5,max*.25,0];
    return `<div class="report72-year-vchart ${animate?'report72-animate':''}">
      <div class="report72-year-plot">
        <div class="report72-year-yaxis">${ticks.map(x=>`<span>${compactChartMoney(x)}</span>`).join('')}</div>
        <div class="report72-year-bars">${months.map((x,index)=>`<div class="report72-year-month" style="--i:${index}">
          <div class="report72-year-cols">
            <span class="report72-year-col in" style="--h:${x.income?Math.max(6,Math.round(x.income/max*100)):0}%"></span>
            <span class="report72-year-col out" style="--h:${x.expense?Math.max(6,Math.round(x.expense/max*100)):0}%"></span>
          </div>
          <div class="report72-year-name">${x.m}</div>
        </div>`).join('')}</div>
      </div>
      <div class="report72-year-note"><span><i style="background:#23b26b"></i>Thu nhập</span><span><i style="background:#f4586b"></i>Chi tiêu</span></div>
    </div>`;
  }
  function donutGradient(rows,total){
    if(!rows.length||!total)return '#e8edf4';
    let cursor=0;
    return `conic-gradient(${rows.map((x,i)=>{
      const start=cursor;
      cursor+=Number(x.value||0)/total*100;
      return `${assetColor(x,i)} ${start.toFixed(2)}% ${cursor.toFixed(2)}%`;
    }).join(', ')})`;
  }
  function assetStructure(){
    const rows=assets();
    const total=rows.reduce((s,x)=>s+Number(x.value||0),0);
    return `<div class="report72-asset-content"><div class="report72-donut" style="background:${donutGradient(rows,total)}"><div class="report72-donut-center"><div><b>${compactMoney(total)}</b><span>Tổng tài sản</span></div></div></div><div class="report72-asset-list">${rows.length?rows.map((x,i)=>`<div class="report72-asset-row"><i class="report72-asset-dot" style="--c:${assetColor(x,i)}"></i><span>${x.name}</span><b>${fmt(x.value)}</b></div>`).join(''):'<div class="report72-asset-row"><span>Chưa có dữ liệu tài sản</span><b>0 đ</b></div>'}</div></div>`;
  }
  function renderReport(animateScope='all'){
    const root=document.getElementById('report72Root');const screen=document.getElementById('screenReports');if(!root||!screen)return;
    screen.classList.add('report72-screen');
    const summary=monthlySummary();
    const incomeTotal=summary.income.reduce((s,x)=>s+x.value,0);
    const expenseTotal=summary.expense.reduce((s,x)=>s+x.value,0);
    const yearMonths=monthsOfYear();
    const yearIncomeTotal=yearMonths.reduce((sum,x)=>sum+x.income,0);
    const yearExpenseTotal=yearMonths.reduce((sum,x)=>sum+x.expense,0);
    const animateMonth=animateScope==='all'||animateScope==='month';
    const animateYear=animateScope==='all'||animateScope==='year';
    const monthDelta=incomeTotal-expenseTotal;
    root.innerHTML=`<section class="report72-card report72-month-card ${animateMonth?'report72-animate':''}"><div class="report72-card-head"><div class="report72-title">Thu chi tháng</div>${seg('month',monthOffset)}</div><div class="report72-month-line"><div class="report72-chip">${monthLabel(monthOffset)}</div><div class="report72-month-delta ${monthDelta>=0?'positive':'negative'}"><span>Thu - Chi :</span><b>${monthDelta>=0?'+':''}${fmt(monthDelta)}</b></div><button class="report72-detail-link" data-report-detail>Chi tiết</button></div>${summaryBox('Thu nhập',incomeTotal,summary.income)}${summaryBox('Chi tiêu',expenseTotal,summary.expense)}</section><section class="report72-card"><div class="report72-card-head"><div class="report72-title">Thu chi năm</div>${seg('year',yearOffset)}</div><div class="report72-year-line"><div class="report72-chip">${yearLabel(yearOffset)}</div><div class="report72-year-line-metric in"><i></i><span>Thu ${compactMoney(yearIncomeTotal)}</span></div><div class="report72-year-line-metric out"><i></i><span>Chi ${compactMoney(yearExpenseTotal)}</span></div><button class="report72-detail-link report72-year-detail" data-report-year-detail type="button">Chi tiết</button></div>${yearlyChart(yearMonths,animateYear)}</section>`;
  }
  function rerenderOpenDetails(){
    const detail=document.getElementById('screenReportDetail');
    const child=document.getElementById('screenReportChildDetail');
    if(detail?.classList.contains('active'))renderDetailScreen();
    if(child?.classList.contains('active'))renderChildDetailScreen();
  }
  window.REPORT72_render=renderReport;
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',renderReport);else renderReport();
  document.addEventListener('cat90:changed',renderReport);
  document.addEventListener('txn16:changed',()=>{renderReport();rerenderOpenDetails();});
  document.addEventListener('asset52:changed',renderReport);
  document.addEventListener('click',e=>{
    const nav=e.target.closest('[data-report-nav]');
    if(nav){
      const scope=nav.closest('[data-report-scope]')?.dataset.reportScope;
      const action=nav.dataset.reportNav;
      if(scope==='month')monthOffset=action==='prev'?monthOffset-1:action==='next'?monthOffset+1:0;
      if(scope==='year')yearOffset=action==='prev'?yearOffset-1:action==='next'?yearOffset+1:0;
      renderReport(scope);
      return;
    }
    if(e.target.closest('[data-report-detail]')){
      openDetail();
      return;
    }
    if(e.target.closest('[data-report-year-detail]')){
      openYearDetail();
      return;
    }
    if(e.target.closest('[data-report-detail-back]')){
      const childScreen=document.getElementById('screenReportChildDetail');
      childScreen?.classList.remove('active');
      childScreen?.setAttribute('aria-hidden','true');
      const screen=document.getElementById('screenReportDetail');
      screen?.classList.remove('active');
      screen?.setAttribute('aria-hidden','true');
      return;
    }
    if(e.target.closest('[data-report-child-back]')){
      const screen=document.getElementById('screenReportChildDetail');
      screen?.classList.remove('active');
      screen?.setAttribute('aria-hidden','true');
      renderDetailScreen();
      return;
    }
    const detailTab=e.target.closest('[data-report-detail-tab]');
    if(detailTab){
      detailState.tab=detailTab.dataset.reportDetailTab==='Chi tiêu'?'Chi tiêu':'Thu nhập';
      renderDetailScreen();
      return;
    }
    const detailMonthNav=e.target.closest('[data-report-detail-month-nav]');
    if(detailMonthNav){
      const action=detailMonthNav.dataset.reportDetailMonthNav;
      if(detailState.mode==='year'){
        detailState.year=action==='current'?new Date().getFullYear():shiftYear(detailState.year||yearValue(yearOffset),action==='prev'?-1:1);
      }else{
        if(action==='current')detailState.monthKey=monthKey(0);
        else detailState.monthKey=shiftMonthKey(detailState.monthKey||monthKey(monthOffset),action==='prev'?-1:1);
      }
      renderDetailScreen();
      return;
    }
    const childBtn=e.target.closest('[data-report-child]');
    if(childBtn){
      openChildDetail(childBtn.dataset.reportChild,childBtn.dataset.reportChildColor);
      return;
    }
    const childYearNav=e.target.closest('[data-report-child-year-nav]');
    if(childYearNav){
      const action=childYearNav.dataset.reportChildYearNav;
      if(childDetailState.mode==='month'){
        if(action==='current')childDetailState.monthKey=monthKey(0);
        else childDetailState.monthKey=shiftMonthKey(childDetailState.monthKey||monthKey(monthOffset),action==='prev'?-1:1);
        childDetailState.year=Number(childDetailState.monthKey.slice(0,4));
      }else{
        childDetailState.year=action==='current'?new Date().getFullYear():shiftYear(childDetailState.year||new Date().getFullYear(),action==='prev'?-1:1);
      }
      renderChildDetailScreen();
      return;
    }
    const item=e.target.closest('.dock-content .nav-item');
    if(item&&item.textContent.trim()==='Báo cáo')setTimeout(renderReport,0);
  },true);
})();
