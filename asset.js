(function(){
  let assets=[];
  let detailData={};
  let categoryAssets={};
  let rawAssetRows=[];
  let cleanedGeneratedCashRows=false;
  let cleanedNonAssetTransactionRows=false;
  let cleanedOrphanTransactionRows=false;
  const pendingPostAttempts=new Set();
  const BANK_ASSET_DOC_ID='TS_BANK_220820260000';
  const colors={cash:'#2563eb',gold:'#f59e0b',goldWedding:'#ec4899',gold98:'#d97706',stock:'#10b981',saving:'#8b5cf6',insurance:'#06b6d4',realestate:'#7c2d12',other:'#06b6d4'};
  const fmt=n=>Number(n||0).toLocaleString('vi-VN')+' đ';
  const fmtProfit=n=>Number(n||0)===0?'0 đ':(Number(n)>0?'+':'')+fmt(n);

  function slug(v){
    return String(v||'').trim().toLowerCase().normalize('NFD')
      .replace(/[\u0300-\u036f]/g,'')
      .replace(/[\u0111\u0110]/g,'d')
      .replace(/[^a-z0-9]+/g,'-')
      .replace(/^-+|-+$/g,'')||'other';
  }

  function isGoldKey(key){
    const text=String(key||'').toLowerCase();
    return text.includes('gold')||text.includes('vang');
  }

  function isGoldRow(row,key){
    const text=String(key||row?.loai_tai_san||row?.loaiTaiSan||row?.type||row?.assetType||row?.category||'').toLowerCase();
    return isGoldKey(text);
  }

  function plainText(value){
    return String(value||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d');
  }

  function firstValue(row,keys){
    for(const key of keys){
      const value=row?.[key];
      if(value!==undefined&&value!==null&&String(value).trim())return value;
    }
    return '';
  }

  function parseNumber(value){
    if(typeof value==='number')return value;
    return Number(String(value||'').replace(/[^\d.-]/g,''))||0;
  }

  function goldProfitState(state){
    const currentValue=Math.round(Number(state.qty||0)*Number(state.currentPrice||0));
    const purchased=Math.round(Number(state.purchasedTotal||0));
    const recovered=Math.round(Number(state.recoveredTotal||0));
    return {
      currentValue,
      totalProfit:Math.round(currentValue+recovered-purchased)
    };
  }

  function amountOf(tx){
    return parseNumber(firstValue(tx,['amount','so_tien','soTien','money','value','gia_tri','giaTri']));
  }

  const assetRules=[
    {large:'Đầu tư',group:'Bảo hiểm tích lũy',child:'Đóng phí định kỳ',txType:'INVEST',assetType:'INSURANCE',action:'BUY',unit:'Hợp đồng'},
    {large:'Đầu tư',group:'Bất động sản',child:'Mua đất/ nhà',txType:'INVEST',assetType:'LAND',action:'BUY',unit:'Mảnh'},
    {large:'Đầu tư',group:'Chứng khoán',child:'Mua cổ phiếu',txType:'INVEST',assetType:'STOCK',action:'BUY',unit:'Đơn vị'},
    {large:'Đầu tư',group:'Chứng khoán',child:'Mua quỹ',txType:'INVEST',assetType:'STOCK',action:'BUY',unit:'Đơn vị'},
    {large:'Đầu tư',group:'Tiết kiệm',child:'Gửi tiết kiệm',txType:'INVEST',assetType:'SAVING',action:'BUY',unit:'Sổ'},
    {large:'Đầu tư',group:'Vàng',child:'Mua vàng',txType:'INVEST',assetType:'GOLD',action:'BUY',unit:'Chỉ'},
    {large:'Thu hồi tài sản',group:'Bảo hiểm tích lũy',child:'Rút giá trị hợp đồng',txType:'DIVEST',assetType:'INSURANCE',action:'SELL',unit:'Hợp đồng'},
    {large:'Thu hồi tài sản',group:'Bất động sản',child:'Bán đất/ nhà',txType:'DIVEST',assetType:'LAND',action:'SELL',unit:'Mảnh'},
    {large:'Thu hồi tài sản',group:'Chứng khoán',child:'Bán cổ phiếu',txType:'DIVEST',assetType:'STOCK',action:'SELL',unit:'Đơn vị'},
    {large:'Thu hồi tài sản',group:'Chứng khoán',child:'Bán quỹ',txType:'DIVEST',assetType:'STOCK',action:'SELL',unit:'Đơn vị'},
    {large:'Thu hồi tài sản',group:'Tiết kiệm',child:'Rút tiết kiệm',txType:'DIVEST',assetType:'SAVING',action:'SELL',unit:'Sổ'},
    {large:'Thu hồi tài sản',group:'Vàng',child:'Bán vàng',txType:'DIVEST',assetType:'GOLD',action:'SELL',unit:'Chỉ'}
  ];

  function assetRuleFor(tx){
    const large=plainText(firstValue(tx,['large','loai_lon']));
    const group=plainText(firstValue(tx,['group','nhom_danh_muc']));
    const child=plainText(firstValue(tx,['child','hang_muc_con']));
    const exact=assetRules.find(rule=>plainText(rule.large)===large&&plainText(rule.group)===group&&plainText(rule.child)===child);
    if(exact)return exact;
    if(group.includes('vang')&&child.includes('ban'))return assetRules.find(rule=>rule.assetType==='GOLD'&&rule.action==='SELL')||null;
    if(group.includes('vang')&&child.includes('mua'))return assetRules.find(rule=>rule.assetType==='GOLD'&&rule.action==='BUY')||null;
    if(group.includes('tiet kiem')||child.includes('tiet kiem')){
      const rawType=String(firstValue(tx,['type','loai_giao_dich'])||'').toUpperCase();
      if(rawType==='DIVEST'||rawType==='SELL'||large.includes('thu hoi')||child.includes('rut'))return assetRules.find(rule=>rule.assetType==='SAVING'&&rule.action==='SELL')||null;
      if(rawType==='INVEST'||rawType==='BUY'||large.includes('dau tu')||child.includes('gui'))return assetRules.find(rule=>rule.assetType==='SAVING'&&rule.action==='BUY')||null;
    }
    return null;
  }

  function transactionAssetAction(tx){
    const rule=assetRuleFor(tx);
    if(rule)return rule.action;
    return '';
  }

  function isTransactionAsset(tx){
    const rule=assetRuleFor(tx);
    if(!rule)return false;
    const assetType=firstValue(tx,['assetType','loai_tai_san','loaiTaiSan']);
    const assetName=firstValue(tx,['assetName','ten_tai_san','tenTaiSan']);
    const qty=parseNumber(firstValue(tx,['assetQty','so_luong','soLuong','quantity','qty']));
    const action=transactionAssetAction(tx);
    if(!['BUY','SELL'].includes(action))return false;
    const text=plainText([assetType,assetName,tx?.large,tx?.loai_lon,tx?.group,tx?.nhom_danh_muc,tx?.child,tx?.hang_muc_con].join(' '));
    return !!assetType||!!assetName||!!qty||['BUY','SELL'].includes(action)||/(vang|gold|co phieu|chung khoan|tai san|bat dong san|nha|dat|tiet kiem|bao hiem)/.test(text);
  }

  function transactionAssetDocId(txnDocId){
    return txnDocId?`TS_${txnDocId}_ASSET`:'';
  }

  function transactionCashDocId(txnDocId){
    return txnDocId?`TS_${txnDocId}_CASH`:'';
  }

  function legacyTransactionAssetDocId(txnDocId){
    return txnDocId?`TS_${txnDocId}`:'';
  }

  function transactionCashSign(tx){
    const action=transactionAssetAction(tx);
    if(action==='SELL')return 1;
    if(action==='BUY')return -1;
    const text=plainText([tx?.large,tx?.loai_lon,tx?.type,tx?.loai_giao_dich].join(' '));
    if(text.includes('thu nhap')||text.includes('income'))return 1;
    if(text.includes('thu hoi')||text.includes('divest'))return 1;
    return -1;
  }

  function transactionAssetName(tx){
    const rule=assetRuleFor(tx);
    if(!rule)return 'Tài sản';
    if(rule.assetType==='SAVING')return 'Gửi tiết kiệm';
    const entered=String(firstValue(tx,['assetName','ten_tai_san','tenTaiSan'])||'').trim();
    if(entered&&plainText(entered)!==plainText(firstValue(tx,['child','hang_muc_con'])))return entered;
    if(rule.assetType==='GOLD')return entered||'Vàng 98%';
    return String(firstValue(tx,['group','nhom_danh_muc'])||rule.group).trim();
  }

  function transactionMovementName(tx){
    return String(firstValue(tx,['child','hang_muc_con','note','ghi_chu','group','nhom_danh_muc'])||'Biến động tài sản').trim();
  }

  function transactionAssetPayload(tx,txnDocId){
    if(!tx||!txnDocId||!isTransactionAsset(tx))return null;
    const action=transactionAssetAction(tx)||'BUY';
    const sign=action==='SELL'?-1:1;
    const amount=amountOf(tx);
    const qtyRaw=parseNumber(firstValue(tx,['assetQty','so_luong','soLuong','quantity','qty']))||1;
    const unit=String(firstValue(tx,['assetUnit','don_vi','donVi'])||'Đơn vị').trim();
    const name=transactionAssetName(tx);
    const movementName=transactionMovementName(tx);
    const rule=assetRuleFor(tx);
    const type=rule.assetType;
    const input=convertedAssetInput(tx,rule);
    const unitPrice=input.unitPrice;
    const qty=sign*input.qty;
    const saleBasis=action==='SELL'?saleCostBasis(name,type,input.qty,unitPrice,txnDocId):null;
    const netAmount=action==='SELL'?Math.round(amount-input.fee):Math.round((amount||Math.round(input.qty*unitPrice))+input.fee);
    const costValue=action==='SELL'?-saleBasis.costBasis:netAmount;
    const date=firstValue(tx,['date','ngay','ngay_giao_dich'])||new Date().toISOString().slice(0,10);
    const assetId=assetDocIdFor(tx,rule);
    return {
      id:assetId,
      source_txn_doc_id:txnDocId,
      source_txn_external_id:String(tx.external_id||tx.id||''),
      source_collection:FIREBASE_COLLECTIONS.giaoDich,
      loai_tai_san:type,
      ten_tai_san:name,
      nhom_danh_muc:String(firstValue(tx,['group','nhom_danh_muc'])||name).trim(),
      hang_muc_con:movementName,
      so_luong:qty,
      don_vi:input.unit||unit,
      don_gia:unitPrice,
      gia_hien_tai:unitPrice,
      gia_tri_hien_tai:costValue,
      tong_gia_von:costValue,
      gia_von_binh_quan:action==='SELL'?saleBasis.avgCost:unitPrice,
      so_tien:amount,
      lai_suat:input.interestRate||'',
      so_tiet_kiem_id:firstValue(tx,['so_tiet_kiem_id','savingBookId']),
      so_tiet_kiem_label:firstValue(tx,['so_tiet_kiem_label','savingBookLabel']),
      lai_lo_tam_tinh:action==='SELL'?netAmount-saleBasis.costBasis:0,
      lai_lo_da_thuc_hien:action==='SELL'?netAmount-saleBasis.costBasis:0,
      ngay:date,
      ngay_mua_ban:date,
      giao_dich_action:action,
      trang_thai:'ACTIVE',
      ghi_chu:firstValue(tx,['note','ghi_chu','ghiChu'])||''
    };
  }

  function saleCostBasis(name,type,qtyRaw,fallbackAvg,txnDocId){
    const key=assetKey({loai_tai_san:type,ten_tai_san:name});
    const rows=displayAssetRows(visibleAssetRows(rawAssetRows))
      .filter(row=>row.id!==transactionAssetDocId(txnDocId)&&row.id!==formattedAssetDocId(type,{id:txnDocId,external_id:txnDocId})&&row.source_txn_doc_id!==txnDocId&&assetKey(row)===key)
      .map(row=>normalizeDetail(row,key));
    const costed=applyCostBasis(rows,key);
    const qtyField=isGoldKey(key)?'qtyChi':'qtyRaw';
    const qtyBalance=costed.reduce((sum,row)=>sum+Number(row[qtyField]||0),0);
    const costBalance=costed.reduce((sum,row)=>sum+Number(row.totalCost||0),0);
    const avgCost=qtyBalance?Math.round(costBalance/Math.max(qtyBalance,1)):Number(fallbackAvg||0);
    return {avgCost,costBasis:Math.round(Math.abs(Number(qtyRaw||1))*avgCost)};
  }

  function transactionAssetPayloads(tx,txnDocId){
    if(!['BUY','SELL'].includes(transactionAssetAction(tx)))return [];
    return [transactionAssetPayload(tx,txnDocId)].filter(Boolean);
  }

  function normalizeGoldQuantity(qty,unit){
    const n=Number(qty||0)||1;
    const text=plainText(unit);
    if(text.includes('cay')||text.includes('luong'))return n*10;
    if(text.includes('phan'))return n/10;
    return n;
  }

  function normalizeGoldPrice(price,unit){
    const n=Number(price||0);
    const text=plainText(unit);
    if(text.includes('cay')||text.includes('luong'))return Math.round(n/10);
    if(text.includes('phan'))return Math.round(n*10);
    return n;
  }

  function convertedAssetInput(tx,rule){
    const qty=parseNumber(firstValue(tx,['assetQty','so_luong','soLuong','quantity','qty']))||1;
    const unit=String(firstValue(tx,['assetUnit','don_vi','donVi'])||rule.unit||'Đơn vị').trim();
    const amount=amountOf(tx);
    const fee=parseNumber(firstValue(tx,['fee','phi','phí']))||0;
    const interestRate=String(firstValue(tx,['assetInterest','assetRate','lai_suat','laiSuat','interestRate','interest_rate','rate'])||'').trim();
    const settlementCost=parseNumber(firstValue(tx,['gia_von_tat_toan','settlementCost']));
    if(rule.assetType==='GOLD'){
      const q=normalizeGoldQuantity(qty,unit);
      const storedPrice=parseNumber(firstValue(tx,['assetPrice','don_gia','donGia','price']));
      const p=amount?Math.round(amount/Math.max(q,1)):normalizeGoldPrice(storedPrice,unit);
      return {qty:q,unit:'Chỉ',unitPrice:p,fee,interestRate,settlementCost};
    }
    const rawPrice=amount?Math.round(amount/Math.max(qty,1)):parseNumber(firstValue(tx,['assetPrice','don_gia','donGia','price']));
    const p=rawPrice||Math.round(amount/Math.max(qty,1));
    return {qty,unit:unit||rule.unit||'Đơn vị',unitPrice:p,fee,interestRate,settlementCost};
  }

  function assetTypeCode(type){
    const value=String(type||'').toUpperCase();
    if(value==='LAND')return 'LAND';
    if(value==='STOCK')return 'STOCK';
    if(value==='SAVING')return 'SAVING';
    if(value==='INSURANCE')return 'INSURANCE';
    if(value==='GOLD')return 'GOLD';
    return 'BANK';
  }

  function timestampPartsFromTransaction(tx){
    const businessId=String(firstValue(tx,['external_id','id'])||'');
    const match=businessId.match(/GD(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/);
    if(match)return {year:match[1],month:match[2],day:match[3],hour:match[4],second:match[6]};
    const raw=firstValue(tx,['created_at','createdAt','date','ngay'])||new Date().toISOString();
    const date=new Date(String(raw).length<=10?`${raw}T00:00:00`:raw);
    const safe=Number.isNaN(date.getTime())?new Date():date;
    return {
      year:String(safe.getFullYear()),
      month:String(safe.getMonth()+1).padStart(2,'0'),
      day:String(safe.getDate()).padStart(2,'0'),
      hour:String(safe.getHours()).padStart(2,'0'),
      second:String(safe.getSeconds()).padStart(2,'0')
    };
  }

  function formattedAssetDocId(type,tx){
    const p=timestampPartsFromTransaction(tx);
    return `TS_${assetTypeCode(type)}_${p.day}${p.month}${p.year}${p.hour}${p.second}`;
  }

  function stableAssetDocId(type,name,tx){
    const code=assetTypeCode(type);
    if(code==='BANK')return BANK_ASSET_DOC_ID;
    const savingId=String(firstValue(tx,['so_tiet_kiem_id','savingBookId'])||'').trim();
    const rawName=code==='SAVING'&&savingId
      ? savingId
      : (String(name||'').trim()||code.toLowerCase());
    return `TS_${code}_${slug(rawName).toUpperCase().replace(/-/g,'_')}`;
  }

  function findAssetRowByName(type,name,tx){
    const code=assetTypeCode(type);
    const wanted=plainText(name);
    const savingId=String(firstValue(tx,['so_tiet_kiem_id','savingBookId'])||'').trim();
    return rawAssetRows.find(row=>{
      const rowType=assetTypeCode(row.loai_tai_san||row.loaiTaiSan||row.assetType||row.type);
      if(rowType!==code)return false;
      if(code==='SAVING'&&savingId&&String(row.so_tiet_kiem_id||row.savingBookId||'')===savingId)return true;
      return wanted&&plainText(row.ten_tai_san||row.name||row.ten)===wanted;
    })||null;
  }

  function assetDocIdFor(tx,rule){
    const detail=tx?.assetDetail||tx?.chi_tiet_tai_san;
    const name=transactionAssetName(tx);
    const stableId=stableAssetDocId(rule.assetType,name,tx);
    const matched=findAssetRowByName(rule.assetType,name,tx);
    if(matched?.id)return String(matched.id);
    if(detail?.tai_san_id&&String(detail.tai_san_id)===stableId)return String(detail.tai_san_id);
    return stableId;
  }

  function txSortValue(tx){
    return [firstValue(tx,['date','ngay'])||'',firstValue(tx,['time','gio'])||'',firstValue(tx,['createdAt','created_at'])||'',tx.id||''].join(' ');
  }

  function buildAssetLedgerRows(transactions){
    const rows=[];
    (transactions||[]).filter(isTransactionAsset).sort((a,b)=>txSortValue(a).localeCompare(txSortValue(b))).forEach(tx=>{
      const rule=assetRuleFor(tx);
      const input=convertedAssetInput(tx,rule);
      rows.push({...tx,_assetRule:rule,_assetInput:input,_assetDocId:assetDocIdFor(tx,rule)});
    });
    return rows;
  }

  function rebuildAssetState(transactions){
    const ledgers={};
    buildAssetLedgerRows(transactions).forEach(tx=>{
      const rule=tx._assetRule;
      const input=tx._assetInput;
      const id=tx._assetDocId;
      const name=transactionAssetName(tx);
      const state=ledgers[id]||(ledgers[id]={
        id,
        type:rule.assetType,
        name,
        unit:input.unit,
        qty:0,
        totalCost:0,
        avgCost:0,
        currentPrice:0,
        purchasedTotal:0,
        recoveredTotal:0,
        realizedProfit:0,
        interestRate:'',
        lastDate:firstValue(tx,['date','ngay'])||new Date().toISOString().slice(0,10),
        note:'',
        transactions:[]
      });
      const amount=amountOf(tx);
      const date=firstValue(tx,['date','ngay'])||state.lastDate;
      state.lastDate=date;
      state.interestRate=input.interestRate||state.interestRate;
      if(rule.assetType!=='GOLD')state.currentPrice=input.unitPrice||state.currentPrice;
      if(rule.action==='BUY'){
        const buyCost=Math.round(input.qty*input.unitPrice+input.fee);
        state.qty+=input.qty;
        state.purchasedTotal+=buyCost;
        state.totalCost+=buyCost;
        state.avgCost=state.qty?Math.round(state.totalCost/state.qty):0;
        state.note=firstValue(tx,['note','ghi_chu','ghiChu'])||state.note;
        if(rule.assetType==='SAVING')state.currentPrice=state.avgCost;
        state.transactions.push({tx,detail:{
          tai_san_id:id,
          giao_dich_action:'BUY',
          so_luong_quy_doi:input.qty,
          don_vi_quy_doi:input.unit,
          don_gia_quy_doi:input.unitPrice,
          lai_suat:input.interestRate||'',
          so_tiet_kiem_id:firstValue(tx,['so_tiet_kiem_id','savingBookId']),
          so_tiet_kiem_label:firstValue(tx,['so_tiet_kiem_label','savingBookLabel']),
          source_txn_doc_id:firstValue(tx,['id','_docId']),
          source_txn_external_id:firstValue(tx,['external_id','id']),
          so_luong_ton_sau_giao_dich:state.qty,
          tong_gia_von_sau_giao_dich:Math.round(state.totalCost),
          gia_von_binh_quan_sau_giao_dich:state.avgCost,
          migration_version:2
        }});
        return;
      }
      const sellQty=Math.min(input.qty,state.qty);
      const avgBefore=state.avgCost;
      const selectedCost=rule.assetType==='SAVING'&&Number(input.settlementCost||0)?Number(input.settlementCost||0):0;
      const costSold=Math.round(selectedCost||sellQty*avgBefore);
      const gross=input.qty*input.unitPrice;
      const proceeds=Math.round((amount||gross)-input.fee);
      const realized=proceeds-costSold;
      state.qty=Math.max(0,state.qty-sellQty);
      state.totalCost=Math.max(0,state.totalCost-costSold);
      state.recoveredTotal+=proceeds;
      state.realizedProfit+=realized;
      state.avgCost=state.qty?avgBefore:0;
      if(rule.assetType==='SAVING')state.currentPrice=state.avgCost;
      state.transactions.push({tx,detail:{
        tai_san_id:id,
        giao_dich_action:'SELL',
        so_luong_quy_doi:sellQty,
        don_vi_quy_doi:input.unit,
        don_gia_quy_doi:input.unitPrice,
        lai_suat:input.interestRate||state.interestRate||'',
        gia_von_binh_quan_luc_ban:avgBefore,
        gia_von_da_ban:costSold,
        so_tiet_kiem_id:firstValue(tx,['so_tiet_kiem_id','savingBookId']),
        so_tiet_kiem_label:firstValue(tx,['so_tiet_kiem_label','savingBookLabel']),
        source_txn_doc_id:firstValue(tx,['id','_docId']),
        source_txn_external_id:firstValue(tx,['external_id','id']),
        lai_lo_thuc_hien:realized,
        so_luong_ton_sau_giao_dich:state.qty,
        tong_gia_von_sau_giao_dich:Math.round(state.totalCost),
        gia_von_binh_quan_sau_giao_dich:state.avgCost,
        migration_version:2
      }});
    });
    return Object.values(ledgers);
  }

  function assetAggregatePayload(state){
    const saving=state.type==='SAVING';
    const value=saving?Math.round(Number(state.totalCost||0)):Math.round(state.qty*Number(state.currentPrice||0));
    const profitState=saving?{totalProfit:Math.round(Number(state.realizedProfit||0))}:goldProfitState(state);
    return {
      loai_tai_san:state.type,
      ten_tai_san:state.name,
      so_luong:state.qty,
      don_vi:state.unit,
      gia_hien_tai:state.currentPrice||0,
      gia_tri_hien_tai:value,
      tong_gia_von:Math.round(state.totalCost),
      gia_von_binh_quan:state.avgCost,
      so_tien_da_mua:Math.round(state.purchasedTotal||0),
      so_tien_da_thu_hoi:Math.round(state.recoveredTotal||0),
      tong_lai_lo:profitState.totalProfit,
      lai_lo_tam_tinh:profitState.totalProfit,
      lai_lo_da_thuc_hien:Math.round(state.realizedProfit),
      lai_suat:state.interestRate||'',
      ngay_mua_ban:state.lastDate,
      trang_thai:state.qty>0?'ACTIVE':'CLOSED',
      ghi_chu:state.note,
      migration_version:2
    };
  }

  function bankRow(){
    return rawAssetRows.find(row=>row.id===BANK_ASSET_DOC_ID)
      ||rawAssetRows.find(row=>!row.source_txn_doc_id&&isCashKey(assetKey(row)))
      ||null;
  }

  function removeStaleTransactionAssets(txnDocId,keepIds,sourceTx){
    return Promise.resolve([]);
  }

  function cleanupGeneratedTransactionCashRows(){
    if(cleanedGeneratedCashRows||!window.FDB)return;
    cleanedGeneratedCashRows=true;
    const rows=rawAssetRows.filter(row=>row.source_txn_doc_id&&isCashKey(assetKey(row)));
    if(!rows.length)return;
    Promise.all(rows.map(row=>window.FDB.remove(FIREBASE_COLLECTIONS.taiSan,row.id).catch(console.error))).catch(console.error);
  }

  function cleanupNonAssetTransactionRows(){
    if(cleanedNonAssetTransactionRows||!window.FDB||typeof window.TXN_getTransactions!=='function')return;
    const txns=window.TXN_getTransactions();
    if(!Array.isArray(txns)||!txns.length)return;
    const byId=transactionLookup(txns);
    const rows=rawAssetRows.filter(row=>{
      if(!row.source_txn_doc_id&&!row.source_txn_external_id)return false;
      if(isCashKey(assetKey(row)))return false;
      const tx=sourceTransaction(row,byId);
      return tx&&!['BUY','SELL'].includes(transactionAssetAction(tx));
    });
    if(!rows.length)return;
    cleanedNonAssetTransactionRows=true;
    Promise.all(rows.map(row=>window.FDB.remove(FIREBASE_COLLECTIONS.taiSan,row.id).catch(console.error))).catch(console.error);
  }

  function transactionsLoaded(){
    const name=window.FIREBASE_COLLECTIONS?.giaoDich;
    return name&&typeof window.FIREBASE_STATUS?.collections?.[name]==='number';
  }

  function cleanupOrphanTransactionAssetRows(){
    cleanedOrphanTransactionRows=true;
  }

  function transactionLookup(txns){
    const map=new Map();
    (txns||[]).forEach(tx=>{
      [tx.id,tx.external_id,tx.source_txn_doc_id,tx.source_txn_external_id,tx.savingBookId,tx.so_tiet_kiem_id].forEach(id=>{
        if(id)map.set(String(id),tx);
      });
    });
    return map;
  }

  function sourceTransaction(row,lookup){
    if(!lookup)return null;
    return lookup.get(String(row.source_txn_doc_id||''))
      ||lookup.get(String(row.source_txn_external_id||''))
      ||lookup.get(String(row.so_tiet_kiem_id||row.savingBookId||''))
      ||lookup.get(String(row.external_id||''))
      ||null;
  }

  function isClosedEmptyAssetRow(row){
    const status=String(row.trang_thai||row.status||'').trim().toUpperCase();
    if(!['CLOSED','INACTIVE','DELETED'].includes(status))return false;
    const qty=Number(row.so_luong??row.soLuong??row.qty??row.quantity??0);
    const value=parseNumber(row.gia_tri_hien_tai??row.currentValue??row.current??row.value??row.gia_tri??row.giaTri??row.so_tien??row.soTien);
    const cost=parseNumber(row.tong_gia_von??row.totalCost??row.cost);
    return !qty&&!value&&!cost;
  }

  function isSavingAssetRow(row){
    const key=assetKey(row);
    return semanticAssetType(key,row)==='saving'
      || String(row.loai_tai_san||row.loaiTaiSan||'').toUpperCase()==='SAVING';
  }

  function isClosedSavingAssetRow(row){
    if(!isSavingAssetRow(row))return false;
    const status=String(row.trang_thai||row.status||'').trim().toUpperCase();
    const qty=Number(row.so_luong??row.soLuong??row.qty??row.quantity??0);
    const value=parseNumber(row.gia_tri_hien_tai??row.currentValue??row.current??row.value??row.gia_tri??row.giaTri??row.so_tien??row.soTien);
    const cost=parseNumber(row.tong_gia_von??row.totalCost??row.cost);
    return ['CLOSED','INACTIVE','DELETED','REVERSED'].includes(status)||qty<=0||(!value&&!cost);
  }

  function visibleAssetRows(rows){
    const base=(rows||[]).filter(row=>!isClosedEmptyAssetRow(row)&&!isClosedSavingAssetRow(row)&&String(row.id||'')!=='TS_SAVING');
    if(typeof window.TXN_getTransactions!=='function')return base;
    const txns=window.TXN_getTransactions();
    if(!Array.isArray(txns)||!txns.length)return base;
    const lookup=transactionLookup(txns);
    return base.filter(row=>{
      if(!row.source_txn_doc_id&&!row.source_txn_external_id&&!row.so_tiet_kiem_id&&!row.savingBookId)return true;
      if(isCashKey(assetKey(row)))return false;
      const tx=sourceTransaction(row,lookup);
      return !!tx&&['BUY','SELL'].includes(transactionAssetAction(tx));
    });
  }

  function displayAssetRows(rows){
    if(typeof window.TXN_getTransactions!=='function')return rows;
    const txns=window.TXN_getTransactions();
    if(!Array.isArray(txns)||!txns.length)return rows;
    const lookup=transactionLookup(txns);
    return rows.map(row=>{
      const tx=sourceTransaction(row,lookup);
      if(!tx||!['BUY','SELL'].includes(transactionAssetAction(tx)))return row;
      const assetName=transactionAssetName(tx);
      const movementName=transactionMovementName(tx);
      return {
        ...row,
        ten_tai_san:assetName,
        nhom_danh_muc:firstValue(tx,['group','nhom_danh_muc'])||assetName,
        hang_muc_con:movementName
      };
    });
  }

  function goldVariant(key,row){
    const text=String([key,row?.ten_tai_san,row?.name,row?.ten,row?.external_id,row?.id].filter(Boolean).join(' ')).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
    if(text.includes('cuoi')||text.includes('wedding'))return 'wedding';
    if(text.includes('98'))return '98';
    return '';
  }

  function assetClass(key,row){
    if(isGoldKey(key)){
      const variant=goldVariant(key,row);
      return ['gold',variant&&`gold-${variant}`].filter(Boolean).join(' ');
    }
    return semanticAssetType(key,row);
  }

  function colorForKey(key,row){
    if(isGoldKey(key)){
      const variant=goldVariant(key,row);
      if(variant==='wedding')return colors.goldWedding;
      if(variant==='98')return colors.gold98;
      return colors.gold;
    }
    return colors[semanticAssetType(key,row)]||colors.other;
  }

  function semanticAssetType(key,row){
    const text=slug([key,row?.cls,row?.ten_tai_san,row?.name,row?.ten,row?.nhom_danh_muc,row?.loai_tai_san,row?.loaiTaiSan].filter(Boolean).join(' '));
    if(isCashKey(text))return 'cash';
    if(text.includes('bao-hiem')||text.includes('insurance')||text.includes('hop-dong'))return 'insurance';
    if(text.includes('co-phieu')||text.includes('chung-khoan')||text.includes('stock'))return 'stock';
    if(text.includes('tiet-kiem')||text.includes('saving')||text.includes('deposit'))return 'saving';
    if(text.includes('bat-dong-san')||text.includes('bds')||text.includes('nha')||text.includes('dat')||text.includes('land')||text.includes('real'))return 'realestate';
    return 'other';
  }

  function assetKey(row){
    const raw=String(row.key||row.type||row.assetType||row.category||row.loai_tai_san||row.loaiTaiSan||row.loai||row.name||row.ten_tai_san||row.ten||'other').trim().toLowerCase();
    const rawSlug=slug(raw);
    if(['bank','cash','cash-bank','tien-mat','tien-gui','ngan-hang'].includes(raw)||['bank','cash','cash-bank','tien-mat','tien-gui','ngan-hang'].includes(rawSlug))return 'cash';
    if(isGoldRow(row,raw))return `gold-${slug(row.ten_tai_san||row.name||row.ten||row.external_id||row.id||'vang')}`;
    if(['asset','tai-san','other'].includes(rawSlug))return slug(row.ten_tai_san||row.name||row.ten||row.groupName||row.assetName||row.label||raw);
    return slug(raw);
  }

  function dateValue(v){
    if(v&&typeof v.toDate==='function')return v.toDate().toLocaleDateString('vi-VN');
    return String(v||'');
  }

  function isoDateValue(v){
    if(v&&typeof v.toDate==='function')return v.toDate().toISOString().slice(0,10);
    return String(v||'').slice(0,10);
  }

  function normalizeDetail(row,key){
    const cost=Number(row.cost??row.tong_gia_von??row.gia_von_binh_quan??row.giaVon??row.originalValue??row.value??row.gia_tri??row.giaTri??row.so_tien??row.soTien??0);
    const totalCost=Number(row.tong_gia_von??row.totalCost??row.cost??row.so_tien??row.soTien??0);
    const qtyValue=String(row.qty||row.quantity||row.so_luong||row.soLuong||row.khoiLuong||'').trim();
    const unit=String(row.don_vi||row.donVi||'').trim();
    const qtyChi=toGoldChi(row.so_luong??row.soLuong??row.qtyChi??0,row.don_vi||row.donVi);
    const unitPrice=Number(row.gia_hien_tai??row.price??0);
    const qtyRawNumber=Number(row.so_luong??row.soLuong??row.qty??row.quantity??0);
    const avgCost=Number(row.gia_von_binh_quan??row.giaVonBinhQuan??row.avgCost??0)||Math.round(Math.abs(totalCost||cost)/Math.max(Math.abs(qtyRawNumber)||1,1));
    const storedCurrent=Number(row.current??row.gia_tri_hien_tai??row.currentValue??row.giaTriHienTai??row.value??row.gia_tri??row.giaTri??row.so_tien??row.soTien??0);
    const current=storedCurrent||(isGoldKey(key)&&unitPrice&&qtyChi?Math.round(unitPrice*qtyChi):cost);
    const action=String(row.giao_dich_action||row.action||'').trim();
    const proceeds=Math.abs(Number(row.so_tien??row.soTien??row.gia_tri_hien_tai??row.current??row.value??0));
    const purchasedTotal=Number(row.so_tien_da_mua??row.purchasedTotal??row.totalPurchased??0);
    const recoveredTotal=Number(row.so_tien_da_thu_hoi??row.recoveredTotal??row.totalRecovered??0);
    const totalProfit=Number(row.tong_lai_lo??row.totalProfit??row.lai_lo_tong??row.profit??row.lai_lo_tam_tinh??row.laiLo??(current+recoveredTotal-purchasedTotal));
    const interestRate=firstValue(row,['lai_suat','laiSuat','interestRate','interest_rate','rate','assetInterest','assetRate']);
    const savingTerm=firstValue(row,['ky_han','kyHan','savingTerm']);
    return {
      id:String(row.id||''),
      external_id:String(row.external_id||''),
      date:dateValue(row.date||row.ngay_mua_ban||row.ngay_mua||row.ngay||row.updatedAt||row.updated_at||row.created_at||row.createdAt),
      sortDate:isoDateValue(row.ngay||row.date||row.ngay_mua_ban||row.ngay_mua||row.updatedAt||row.updated_at||row.created_at||row.createdAt),
      name:String(row.name||row.ten_tai_san||row.ten||row.title||'Tài sản').trim(),
      movementName:String(row.hang_muc_con||row.movementName||row.title||row.ghi_chu||row.note||'').trim(),
      groupName:String(row.nhom_danh_muc||row.group||row.category||'').trim(),
      qty:isGoldKey(key)?formatGoldQty(qtyChi):[qtyValue,unit].filter(Boolean).join(' '),
      cost,
      totalCost,
      avgCost,
      current,
      proceeds,
      realizedProfit:Number(row.realizedProfit??row.lai_lo_da_thuc_hien??row.laiLoDaThucHien??0),
      profit:totalProfit,
      purchasedTotal,
      recoveredTotal,
      totalProfit,
      remainingCost:totalCost,
      action,
      note:String(row.ghi_chu||row.note||row.description||'').trim(),
      interestRate:String(interestRate||'').trim(),
      savingTerm:String(savingTerm||'').trim(),
      ky_han:String(savingTerm||'').trim(),
      savingBookId:String(row.so_tiet_kiem_id||row.savingBookId||''),
      savingBookLabel:String(row.so_tiet_kiem_label||row.savingBookLabel||''),
      sourceTxnDocId:String(row.source_txn_doc_id||''),
      sourceTxnExternalId:String(row.source_txn_external_id||row.external_id||''),
      goldTypeId:row.goldTypeId||row.typeId||row.external_id||row.id,
      price:unitPrice,
      qtyRaw:qtyRawNumber,
      unit,
      qtyChi,
      key
    };
  }

  function toGoldChi(value,unit){
    const n=Number(value||0);
    const text=String(unit||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
    if(!n)return 0;
    if(text.includes('cay')||text.includes('luong'))return n*10;
    if(text.includes('phan'))return n/10;
    return n;
  }
  function formatGoldQty(totalChi){
    const totalPhan=Math.round(Number(totalChi||0)*10);
    const cay=Math.floor(totalPhan/100);
    const chi=Math.floor((totalPhan%100)/10);
    const phan=totalPhan%10;
    const parts=[];
    if(cay)parts.push(`${cay} cây`);
    if(chi)parts.push(`${chi} chỉ`);
    if(phan)parts.push(`${phan} phân`);
    return parts.length?parts.join(' '):'0 phân';
  }

  function formatGoldQtyFull(totalChi){
    const totalPhan=Math.round(Number(totalChi||0)*10);
    const cay=Math.floor(totalPhan/100);
    const chi=Math.floor((totalPhan%100)/10);
    const phan=totalPhan%10;
    return `${cay} Cây ${chi} Chỉ ${phan} Phân`;
  }

  function formatAssetQty(rows,key){
    if(isCashKey(key))return '';
    if(isGoldKey(key))return formatGoldQtyFull(rows.reduce((sum,row)=>sum+Number(row.qtyChi||0),0));
    if(assetSection({key})==='saving'){
      const total=Math.max(0,rows.reduce((sum,row)=>sum+Number(row.qtyRaw||0),0));
      return `${total.toLocaleString('vi-VN')} Sổ tiết kiệm`;
    }
    const total=rows.reduce((sum,row)=>sum+Number(row.qtyRaw||0),0);
    const units=[...new Set(rows.map(row=>String(row.unit||'').trim()).filter(Boolean))];
    if(!total&&!units.length)return '';
    return `${total.toLocaleString('vi-VN')}${units.length===1?' '+units[0]:''}`.trim();
  }

  function costQty(row,key){
    return isGoldKey(key)?Number(row.qtyChi||0):Number(row.qtyRaw||0);
  }

  function applyCostBasis(rows,key){
    if(isCashKey(key))return rows;
    let qtyBalance=0;
    let costBalance=0;
    return rows.slice().sort((a,b)=>String(a.sortDate||a.date||'').localeCompare(String(b.sortDate||b.date||''))).map(row=>{
      const qty=costQty(row,key);
      const action=String(row.action||'').toUpperCase();
      if(action==='SELL'||qty<0){
        const soldQty=Math.abs(qty)||1;
        const avg=qtyBalance?Math.round(costBalance/Math.max(qtyBalance,1)):Math.abs(Number(row.avgCost||0));
        const costBasis=Math.round(avg*soldQty);
        const proceeds=Math.abs(Number(row.proceeds||row.current||0));
        const realized=proceeds-costBasis;
        qtyBalance-=soldQty;
        costBalance-=costBasis;
        if(qtyBalance<0)qtyBalance=0;
        if(costBalance<0)costBalance=0;
        return {
          ...row,
          current:-costBasis,
          cost:-costBasis,
          totalCost:-costBasis,
          avgCost:avg,
          realizedProfit:realized,
          profit:realized
        };
      }
      const buyQty=Math.abs(qty)||1;
      const buyCost=Math.abs(Number(row.totalCost||row.cost||row.current||0));
      const avg=Math.round(buyCost/Math.max(buyQty,1));
      qtyBalance+=buyQty;
      costBalance+=buyCost;
      return {
        ...row,
        current:buyCost,
        cost:buyCost,
        totalCost:buyCost,
        avgCost:avg,
        realizedProfit:0,
        profit:0
      };
    });
  }

  function normalizeAssets(rows){
    const groups={};
    detailData={};
    displayAssetRows(visibleAssetRows(rows)).forEach(row=>{
      const key=assetKey(row);
      const aggregate=normalizeDetail(row,key);
      const details=Array.isArray(row.items)?row.items:Array.isArray(row.details)?row.details:null;
      if(details){
        detailData[key]=applyCostBasis(details.map(item=>normalizeDetail({...item,id:item.id||row.id},key)),key);
      }else{
        (detailData[key]||(detailData[key]=[])).push(aggregate);
      }
      if(!groups[key]){
        groups[key]={
          key,
          cls:assetClass(key,row),
          name:String(isGoldKey(key)?(row.ten_tai_san||row.name||row.ten||'V\u00e0ng'):(row.ten_tai_san||row.name||row.ten||row.groupName||row.assetName||row.label||row.loai_tai_san||row.loaiTaiSan||row.loai||key)).trim(),
          icon:row.icon||iconForKey(assetClass(key,row)),
          value:0,
          aggregateValue:0,
          aggregateCost:0,
          aggregateProfit:0,
          aggregateRealized:0,
          aggregatePurchased:0,
          aggregateRecovered:0,
          aggregateCurrentPrice:0,
          aggregateQty:0,
          aggregateRows:0
        };
      }
      groups[key].aggregateRows+=1;
      groups[key].aggregateValue+=Number(aggregate.current||0);
      groups[key].aggregateCost+=Number(aggregate.totalCost||aggregate.cost||0);
      groups[key].aggregateProfit+=Number(aggregate.profit||0);
      groups[key].aggregateRealized+=Number(aggregate.realizedProfit||0);
      groups[key].aggregatePurchased+=Number(aggregate.purchasedTotal||0);
      groups[key].aggregateRecovered+=Number(aggregate.recoveredTotal||0);
      if(Number(aggregate.price||0))groups[key].aggregateCurrentPrice=Number(aggregate.price||0);
      groups[key].aggregateQty+=assetSection({key})==='saving'?costQty(aggregate,key):Math.abs(costQty(aggregate,key));
      groups[key].aggregateQtyText=formatAssetQty([aggregate],key);
    });
    appendTransactionDetailData(groups);
    Object.keys(detailData).forEach(key=>{detailData[key]=applyCostBasis(detailData[key],key);});
    assets=Object.values(groups).map(asset=>{
      const rows=detailData[asset.key]||[];
      const explicit=rows.length===1?Number(rows[0].value||0):0;
      const hasAggregate=Number(asset.aggregateRows||0)>0;
      const next={...asset,value:hasAggregate?Number(asset.aggregateValue||0):aggregateAssetValue(rows,asset.key,explicit)};
      next.qtyText=assetSection(asset)==='saving'
        ? formatAssetQty(rows,asset.key)
        : (hasAggregate?(asset.aggregateQtyText||formatAssetQty(rows,asset.key)):formatAssetQty(rows,asset.key));
      next.lastText=isCashKey(next.key)?'':lastChangeText(rows,next.key);
      return next;
    }).sort((a,b)=>a.name.localeCompare(b.name,'vi'));
  }

  function appendTransactionDetailData(groups){
    if(typeof window.TXN_getTransactions!=='function')return;
    const states=rebuildAssetState(window.TXN_getTransactions());
    states.forEach(state=>{
      const row={id:state.id,loai_tai_san:state.type,ten_tai_san:state.name};
      const key=assetKey(row);
      const existing=groups[key];
      if(!groups[key]){
        groups[key]={
          key,
          cls:assetClass(key,row),
          name:state.name,
          icon:iconForKey(assetClass(key,row)),
          value:0,
          aggregateValue:0,
          aggregateCost:0,
          aggregateProfit:0,
          aggregateRealized:0,
          aggregatePurchased:0,
          aggregateRecovered:0,
          aggregateCurrentPrice:0,
          aggregateQty:0,
          aggregateRows:0
        };
      }
      if(isGoldKey(key)){
        const price=Number(existing?.aggregateCurrentPrice||groups[key].aggregateCurrentPrice||state.currentPrice||0);
        const currentValue=Math.round(Number(state.qty||0)*price);
        const totalProfit=Math.round(currentValue+Number(state.recoveredTotal||0)-Number(state.purchasedTotal||0));
        groups[key].aggregateRows=1;
        groups[key].aggregateValue=currentValue;
        groups[key].aggregateCost=Math.round(Number(state.totalCost||0));
        groups[key].aggregateProfit=totalProfit;
        groups[key].aggregateRealized=Math.round(Number(state.realizedProfit||0));
        groups[key].aggregatePurchased=Math.round(Number(state.purchasedTotal||0));
        groups[key].aggregateRecovered=Math.round(Number(state.recoveredTotal||0));
        groups[key].aggregateCurrentPrice=price;
        groups[key].aggregateQty=Number(state.qty||0);
        groups[key].aggregateQtyText=formatAssetQty([{qtyChi:Number(state.qty||0)}],key);
        groups[key].value=currentValue;
      }
      if(state.type==='SAVING'){
        const currentValue=Math.round(Number(state.totalCost||0));
        groups[key].aggregateRows=state.transactions.length;
        groups[key].aggregateValue=currentValue;
        groups[key].aggregateCost=currentValue;
        groups[key].aggregateProfit=Math.round(Number(state.realizedProfit||0));
        groups[key].aggregateRealized=Math.round(Number(state.realizedProfit||0));
        groups[key].aggregatePurchased=Math.round(Number(state.purchasedTotal||0));
        groups[key].aggregateRecovered=Math.round(Number(state.recoveredTotal||0));
        groups[key].aggregateCurrentPrice=Number(state.currentPrice||0);
        groups[key].aggregateQty=Number(state.qty||0);
        groups[key].aggregateQtyText=`${Math.max(0,Number(state.qty||0)).toLocaleString('vi-VN')} Sổ tiết kiệm`;
        groups[key].value=currentValue;
      }
      detailData[key]=state.transactions.map(item=>{
        const detail=item.detail;
        const tx=item.tx;
        const sign=detail.giao_dich_action==='SELL'?-1:1;
        const fee=parseNumber(firstValue(tx,['fee','phi','phí']));
        const totalCost=detail.giao_dich_action==='SELL'?-Number(detail.gia_von_da_ban||0):amountOf(tx)+fee;
        const proceeds=detail.giao_dich_action==='SELL'?amountOf(tx)-fee:amountOf(tx);
        return normalizeDetail({
          id:tx.id,
          ngay:firstValue(tx,['date','ngay']),
          ten_tai_san:state.name,
          nhom_danh_muc:firstValue(tx,['group','nhom_danh_muc']),
          hang_muc_con:firstValue(tx,['child','hang_muc_con']),
          so_luong:sign*Number(detail.so_luong_quy_doi||0),
          don_vi:detail.don_vi_quy_doi,
          gia_hien_tai:detail.don_gia_quy_doi,
          gia_von_binh_quan:detail.gia_von_binh_quan_luc_ban||detail.gia_von_binh_quan_sau_giao_dich,
          tong_gia_von:totalCost,
          gia_tri_hien_tai:totalCost,
          so_tien:proceeds,
          lai_suat:detail.lai_suat||firstValue(tx,['assetInterest','assetRate','lai_suat','laiSuat','interestRate','interest_rate','rate']),
          ky_han:detail.ky_han||firstValue(tx,['savingTerm','ky_han','kyHan']),
          so_tiet_kiem_id:detail.so_tiet_kiem_id||firstValue(tx,['savingBookId','so_tiet_kiem_id']),
          so_tiet_kiem_label:detail.so_tiet_kiem_label||firstValue(tx,['savingBookLabel','so_tiet_kiem_label']),
          source_txn_doc_id:detail.source_txn_doc_id||firstValue(tx,['id','_docId']),
          source_txn_external_id:detail.source_txn_external_id||firstValue(tx,['external_id','id']),
          lai_lo_da_thuc_hien:detail.lai_lo_thuc_hien||0,
          giao_dich_action:detail.giao_dich_action,
          ghi_chu:firstValue(tx,['note','ghi_chu','ghiChu'])
        },key);
      });
    });
  }

  function isCashKey(key){
    const text=String(key||'').toLowerCase();
    return text.includes('cash')||text.includes('bank')||text.includes('tien-mat')||text.includes('tien-gui')||text.includes('ngan-hang');
  }

  function signedFmt(n){
    const value=Number(n||0);
    if(!value)return fmt(0);
    return `${value>0?'+':'-'}${fmt(Math.abs(value))}`;
  }

  function aggregateAssetValue(rows,key,explicit){
    if(isCashKey(key))return rows.reduce((sum,row)=>sum+Number(row.current||0),explicit||0);
    const qtyField=isGoldKey(key)?'qtyChi':'qtyRaw';
    const totalQty=rows.reduce((sum,row)=>sum+Number(row[qtyField]||0),0);
    const priced=rows.filter(row=>Number(row.price||0));
    if(totalQty&&priced.length){
      const latest=priced.slice().sort((a,b)=>String(b.sortDate||b.date||'').localeCompare(String(a.sortDate||a.date||'')))[0];
      return Math.round(totalQty*Number(latest.price||0));
    }
    if(!totalQty&&priced.length)return 0;
    return rows.reduce((sum,row)=>sum+Number(row.current||0),explicit||0);
  }

  function remainingCost(rows,key){
    if(isCashKey(key))return 0;
    const qtyField=isGoldKey(key)?'qtyChi':'qtyRaw';
    const bought=rows.filter(row=>Number(row[qtyField]||0)>0&&Number(row.cost||0)>0);
    const boughtQty=bought.reduce((sum,row)=>sum+Number(row[qtyField]||0),0);
    const boughtCost=bought.reduce((sum,row)=>sum+Number(row.cost||0),0);
    const remainingQty=Math.max(0,rows.reduce((sum,row)=>sum+Number(row[qtyField]||0),0));
    if(boughtQty&&remainingQty)return Math.round(boughtCost*remainingQty/boughtQty);
    if(!remainingQty)return 0;
    return boughtCost;
  }

  function lastChangeText(rows,key){
    const latest=(rows||[]).slice().sort((a,b)=>String(b.sortDate||b.date||'').localeCompare(String(a.sortDate||a.date||'')))[0];
    if(!latest)return '';
    const label=isCashKey(key)?(latest.current>=0?'Tiền vào':'Tiền ra'):(latest.current>=0?'Tăng gần nhất':'Giảm gần nhất');
    return `${label} ${signedFmt(latest.current)}`;
  }

  function iconForKey(key){
    const type=semanticAssetType(key,{});
    if(key.includes('gold')||key.includes('vang'))return 'Au';
    if(type==='cash')return '₫';
    if(type==='stock')return 'trend';
    if(type==='saving')return '%';
    if(type==='insurance')return 'shield';
    if(type==='realestate')return 'home';
    return '₫';
  }

  function iconSvg(kind){
    if(kind==='trend') return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M7 17 17 7"/><path d="M9 7h8v8"/></svg>';
    if(kind==='shield') return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 3 19 6v5c0 4.5-2.8 8-7 10-4.2-2-7-5.5-7-10V6l7-3Z"/><path d="m9 12 2 2 4-5"/></svg>';
    if(kind==='check') return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="m6 12 4 4 8-9"/></svg>';
    if(kind==='home') return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M5 11.5 12 6l7 5.5"/><path d="M7.5 10.5V18h9v-7.5"/></svg>';
    return kind;
  }

  function card(asset){
    const cash=isCashKey(asset.key);
    return `<button class="asset52-card ${asset.cls} ${cash?'is-static':''}" type="button" data-asset-key="${asset.key}">
      <span class="asset52-icon">${iconSvg(asset.icon)}</span>
      <span class="asset52-info"><span class="asset52-name">${asset.name}</span><span class="asset52-sub">${asset.qtyText||asset.lastText||''}</span></span>
      <span class="asset52-value">${fmt(asset.value)}</span>
      <svg class="asset52-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="m9 18 6-6-6-6"/></svg>
    </button>`;
  }

  function assetSection(asset){
    if(isCashKey(asset.key))return 'cash';
    if(isGoldKey(asset.key))return 'gold';
    const type=semanticAssetType(asset.key,asset);
    if(['insurance','realestate','stock','saving'].includes(type))return type;
    return 'other';
  }

  function summaryHtml(){
    const total=assets.reduce((sum,x)=>sum+Number(x.value||0),0);
    const cash=assets.filter(x=>assetSection(x)==='cash').reduce((sum,x)=>sum+Number(x.value||0),0);
    const invested=assets.filter(x=>assetSection(x)!=='cash').reduce((sum,x)=>sum+Number(x.value||0),0);
    return `<div class="asset52-summary">
      <div class="asset52-summary-main">
        <label>Tổng tài sản</label>
        <b>${fmt(total)}</b>
      </div>
      <div class="asset52-summary-grid">
        <div class="asset52-mini cash"><label>Tiền hiện có</label><b>${fmt(cash)}</b></div>
        <div class="asset52-mini invest"><label>Tài sản đầu tư</label><b>${fmt(invested)}</b></div>
      </div>
    </div>`;
  }

  function sectionHtml(title,items){
    const total=items.reduce((sum,x)=>sum+Number(x.value||0),0);
    return `<section class="asset52-section">
      <div class="asset52-section-head"><span>${title}</span><b>${fmt(total)}</b></div>
      <div class="asset52-section-list">${items.length?items.map(card).join(''):'<div class="asset52-section-empty">Chưa có tài sản</div>'}</div>
    </section>`;
  }

  function categoryDetailKey(cls){
    return `category-${cls}`;
  }

  function buildCategoryDetail(label,cls,items){
    const key=categoryDetailKey(cls);
    const rows=items.flatMap(asset=>(detailData[asset.key]||[]).map(row=>({...row,assetName:asset.name,categoryKey:key})));
    const total=items.reduce((sum,x)=>sum+Number(x.value||0),0);
    const cost=items.reduce((sum,x)=>sum+Number(x.aggregateCost||0),0);
    const profit=items.reduce((sum,x)=>sum+Number(x.aggregateProfit||0),0);
    const realized=items.reduce((sum,x)=>sum+Number(x.aggregateRealized||0),0);
    const saving=cls==='saving';
    const qty=saving?Math.max(0,rows.reduce((sum,row)=>sum+Number(row.qtyRaw||0),0)):items.reduce((sum,x)=>sum+Number(x.aggregateQty||0),0);
    detailData[key]=rows;
    const asset={
      key,
      cls,
      name:label,
      icon:iconForKey(cls),
      value:total,
      aggregateRows:items.length,
      aggregateCost:cost,
      aggregateProfit:profit,
      aggregateRealized:realized,
      aggregateQty:qty,
      qtyText:saving?`${qty.toLocaleString('vi-VN')} Sổ tiết kiệm`:(items.length?`${items.length} tài sản`:'-'),
      isCategory:true
    };
    categoryAssets[key]=asset;
    return asset;
  }

  function categoryCard({label,cls,icon,items}){
    const total=items.reduce((sum,x)=>sum+Number(x.value||0),0);
    const count=items.length;
    const key=count?categoryDetailKey(cls):'';
    const detail=count?buildCategoryDetail(label,cls,items):null;
    const subText=cls==='saving'?(detail?.qtyText||'Chưa có tài sản'):(count?`${count} tài sản`:'Chưa có tài sản');
    return `<button class="asset52-card ${cls} ${key?'':'is-static'}" type="button" ${key?`data-asset-key="${key}"`:''}>
      <span class="asset52-icon">${iconSvg(icon)}</span>
      <span class="asset52-info"><span class="asset52-name">${label}</span><span class="asset52-sub">${subText}</span></span>
      <span class="asset52-value">${fmt(total)}</span>
      ${key?'<svg class="asset52-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="m9 18 6-6-6-6"/></svg>':'<span class="asset52-static-spacer"></span>'}
    </button>`;
  }

  function categorySectionHtml(title,categories){
    const total=categories.reduce((sum,category)=>sum+category.items.reduce((part,item)=>part+Number(item.value||0),0),0);
    return `<section class="asset52-section">
      <div class="asset52-section-head"><span>${title}</span><b>${fmt(total)}</b></div>
      <div class="asset52-section-list">${categories.map(categoryCard).join('')}</div>
    </section>`;
  }

  function renderAssets(){
    const screen=document.getElementById('screenAssets');
    if(!screen)return;
    screen.classList.add('asset52-screen');
    const body=screen.querySelector('.slide-body');
    if(!body)return;
    const groups={
      cash:assets.filter(x=>assetSection(x)==='cash'),
      gold:assets.filter(x=>assetSection(x)==='gold'),
      insurance:assets.filter(x=>assetSection(x)==='insurance'),
      realestate:assets.filter(x=>assetSection(x)==='realestate'),
      stock:assets.filter(x=>assetSection(x)==='stock'),
      saving:assets.filter(x=>assetSection(x)==='saving'),
      other:assets.filter(x=>assetSection(x)==='other')
    };
    categoryAssets={};
    body.innerHTML=assets.length
      ? `<div class="asset52-list" id="asset52List">${summaryHtml()}${sectionHtml('Tiền & ngân hàng',groups.cash)}${sectionHtml('Vàng',groups.gold)}${categorySectionHtml('Tài sản đầu tư',[{label:'Bảo hiểm tích lũy',cls:'insurance',icon:'shield',items:groups.insurance},{label:'Bất động sản',cls:'realestate',icon:'home',items:groups.realestate},{label:'Chứng khoán',cls:'stock',icon:'trend',items:groups.stock}])}${categorySectionHtml('Tiết kiệm',[{label:'Tiết kiệm',cls:'saving',icon:'%',items:groups.saving}])}${groups.other.length?sectionHtml('Tài sản khác',groups.other):''}</div>`
      : '<div class="asset53-empty">Chưa có dữ liệu tài sản trong Firebase.</div>';
    document.dispatchEvent(new CustomEvent('asset52:changed',{detail:{assets,detailData}}));
  }

  function ensureDetailScreen(){
    const phone=document.getElementById('phone');
    if(!phone)return null;
    let screen=document.getElementById('screenAssetDetail');
    if(screen)return screen;
    phone.insertAdjacentHTML('beforeend',`<section class="asset53-detail-screen" id="screenAssetDetail" aria-hidden="true">
      <div class="slide-head"><button class="slide-back" data-asset-detail-back><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M15 18 9 12l6-6"/></svg></button><div class="slide-title">Chi tiết tài sản</div></div>
      <div class="slide-body" id="asset53DetailBody"></div>
    </section>`);
    return document.getElementById('screenAssetDetail');
  }

  let detailState={key:'',tab:'overview',year:new Date().getFullYear(),flow:'buy',cashTab:'income'};

  function pairFor(item){
    if(!item?.sourceTxnDocId)return null;
    return Object.values(detailData).flat().find(row=>row.sourceTxnDocId===item.sourceTxnDocId&&row.id!==item.id);
  }

  function movementTitle(item){
    if(item.movementName)return item.movementName;
    if(item.action==='BUY')return `Mua ${item.name}`;
    if(item.action==='SELL')return `Bán ${item.name}`;
    if(item.action==='CASH_IN')return 'Tiền vào ngân hàng';
    if(item.action==='CASH_OUT')return 'Tiền ra ngân hàng';
    if(item.note)return item.note;
    return item.name;
  }

  function isCategoryKey(key){
    return String(key||'').startsWith('category-');
  }

  function overviewHtml(asset,rows){
    const cash=assetSection(asset)==='cash';
    const now=Number(asset?.value||0);
    if(cash){
      return `<div class="asset53-overview">
        <div class="asset53-hero"><label>Số dư hiện tại</label><b>${fmt(now)}</b></div>
      </div>`;
    }
    if(isGoldKey(asset.key)){
      const hasAggregate=Number(asset?.aggregateRows||0)>0;
      const qty=hasAggregate?Number(asset.aggregateQty||0):Math.max(0,rows.reduce((sum,row)=>sum+Number(row.qtyChi||0),0));
      const currentPrice=Number(asset.aggregateCurrentPrice||0)||(qty?Math.round(now/qty):0);
      const currentValue=Math.round(qty*currentPrice);
      const rowPurchased=rows.filter(row=>Number(row.qtyChi||0)>0).reduce((sum,row)=>sum+Math.abs(Number(row.totalCost||row.cost||0)),0);
      const rowRecovered=rows.filter(row=>isSellMovement(row)).reduce((sum,row)=>sum+Math.abs(Number(row.proceeds||0)),0);
      const purchased=hasAggregate&&Number(asset.aggregatePurchased||0)>0?Number(asset.aggregatePurchased||0):rowPurchased;
      const recovered=hasAggregate&&Number(asset.aggregateRecovered||0)>0?Number(asset.aggregateRecovered||0):rowRecovered;
      const cost=hasAggregate?Number(asset.aggregateCost||0):remainingCost(rows,asset.key);
      const avgCost=qty?Math.round(cost/qty):0;
      const totalProfit=Math.round(currentValue+recovered-purchased);
      const profitClass=totalProfit<0?'asset53-loss':(totalProfit>0?'asset53-profit':'asset53-even');
      return `<div class="asset53-overview">
        <div class="asset53-hero"><label>Giá trị hiện tại</label><b>${fmt(currentValue)}</b></div>
        <div class="asset53-kpis">
          <div><label>Số lượng</label><b>${asset.qtyText||formatGoldQtyFull(qty)}</b></div>
          <div><label>Giá hiện tại/chỉ</label><b>${fmt(currentPrice)}</b></div>
          <div><label>Giá vốn còn lại</label><b>${fmt(cost)}</b></div>
          <div><label>Giá vốn bình quân/chỉ</label><b>${fmt(avgCost)}</b></div>
          <div><label>Số tiền đã mua</label><b>${fmt(purchased)}</b></div>
          <div><label>Số tiền đã thu hồi</label><b>${fmt(recovered)}</b></div>
          <div class="asset53-profit-row"><label>Tổng lãi/lỗ</label><span><b class="${profitClass}">${fmtProfit(totalProfit)}</b><small class="asset53-formula">Giá trị hiện tại + Số tiền đã thu hồi − Số tiền đã mua</small></span></div>
        </div>
      </div>`;
    }
    const hasAggregate=Number(asset?.aggregateRows||0)>0;
    const cost=hasAggregate?Number(asset.aggregateCost||0):remainingCost(rows,asset.key);
    const realized=hasAggregate?Number(asset.aggregateRealized||0):rows.reduce((sum,x)=>sum+Number(x.realizedProfit||0),0);
    const saving=assetSection(asset)==='saving';
    const profit=saving?realized:(hasAggregate?Number(asset.aggregateProfit||0)+realized:now-cost+realized);
    const qty=saving?Math.max(0,rows.reduce((sum,row)=>sum+Number(row.qtyRaw||0),0)):(hasAggregate?Number(asset.aggregateQty||0):Math.abs(rows.reduce((sum,row)=>sum+costQty(row,asset.key),0)));
    const unit=isGoldKey(asset.key)?'chỉ':'đơn vị';
    const averageKpis=isGoldKey(asset.key)&&qty?`
        <div><label>Giá vốn bình quân / ${unit}</label><b>${fmt(Math.round(cost/qty))}</b></div>
        <div><label>Giá hiện tại / ${unit}</label><b>${fmt(Math.round(now/qty))}</b></div>`:'';
    return `<div class="asset53-overview">
      <div class="asset53-hero"><label>Giá trị hiện tại</label><b>${fmt(now)}</b></div>
      <div class="asset53-kpis">
        <div><label>Số lượng</label><b>${saving?`${qty.toLocaleString('vi-VN')} Sổ tiết kiệm`:(asset.qtyText||'-')}</b></div>
        <div><label>Giá vốn</label><b>${fmt(cost)}</b></div>
        ${averageKpis}
        <div><label>Lãi/Lỗ tạm tính</label><b class="${profit<0?'asset53-loss':'asset53-profit'}">${fmtProfit(profit)}</b></div>
      </div>
    </div>`;
  }

  function detailRow(item,color,key){
    const cashView=assetSection({key})==='cash';
    const sell=isSellMovement(item);
    const unitPriceText=convertedUnitPriceText(item,key);
    const savingView=assetSection({key})==='saving';
    const amountPrefix=savingView?(sell?'Số tiền tất toán':'Số tiền gửi'):(sell?'Số tiền bán':'Số tiền mua');
    const amountValue=sell?Number(item.proceeds||0):Math.abs(Number(item.totalCost||item.cost||item.current||0));
    const categoryView=isCategoryKey(key);
    const interestValue=item.interestRate?String(item.interestRate).trim():'-';
    const interestText=interestValue==='-'?'LS -':`LS ${interestValue.includes('%')?interestValue:interestValue+'%'}`;
    const savingId=savingMovementId(item);
    const leftTop=savingView
      ? `${movementDateHyphen(item)} (${interestText})${savingId?` - ${savingId}`:''}`
      : categoryView?[item.date,item.assetName||item.name].filter(Boolean).join(' · '):(item.date||'');
    const recalled=savingView&&!sell&&isSavingMovementRecalled(item);
    const recallIcon=recalled?`<span class="asset53-saving-recalled" title="Sổ tiết kiệm đã tất toán" aria-label="Sổ tiết kiệm đã tất toán"></span>`:'';
    const rightBottom=unitPriceText;
    const firstSpan=savingView?`<span style="width:350px;max-width:none;display:block;overflow:visible;text-overflow:clip;white-space:nowrap">${leftTop}</span>`:`<span>${leftTop}</span>`;
    const assetInfo=cashView?'':`<div class="asset53-flow-grid">
        ${firstSpan}
        <span class="${sell?'minus':'plus'}">${movementQtyText(item,key)}</span>
        <span>${amountPrefix}: ${fmt(Math.abs(amountValue))}</span>
        <span>${rightBottom}</span>
      </div>`;
    const cashLine=cashView?`<div class="asset53-flow-line ${item.current>=0?'plus':'minus'}"><span>Ngân hàng</span><b>${signedFmt(item.current)}</b></div>`:'';
    return `<div class="asset53-detail-row asset53-flow-row" style="--asset-detail-color:${color}">
      ${recallIcon}
      ${assetInfo||`<div class="asset53-flow-lines">${cashLine}</div>`}
    </div>`;
  }

  function isSellMovement(item){
    return String(item.action||'').toUpperCase()==='SELL'||Number(item.qtyChi||item.qtyRaw||0)<0||Number(item.current||0)<0;
  }

  function savingMovementKeys(item){
    return [item?.savingBookId,item?.sourceTxnExternalId,item?.sourceTxnDocId,item?.external_id,item?.id]
      .map(value=>String(value||'').trim())
      .filter(Boolean);
  }

  function displaySavingBookId(id){
    const value=String(id||'').trim();
    const match=value.match(/^STK(20\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(?:\d{3})?$/);
    if(match)return `STK${match[3]}${match[2]}${match[1]}${match[4]}${match[5]}${match[6]}`;
    return value;
  }

  function savingMovementId(item){
    return displaySavingBookId(savingMovementKeys(item)[0]||'');
  }

  function recalledSavingBookIds(rows){
    const ids=new Set();
    (rows||[]).filter(isSellMovement).forEach(row=>{
      savingMovementKeys(row).forEach(id=>ids.add(id));
    });
    return ids;
  }

  function isSavingMovementRecalled(item){
    const ids=detailState.recalledSavingBookIds;
    if(!ids||!ids.size)return false;
    return savingMovementKeys(item).some(id=>ids.has(id));
  }

  function movementQtyText(item,key){
    const sell=isSellMovement(item);
    const sign=sell?'- ':'+ ';
    if(isGoldKey(key)){
      const qty=Math.abs(Number(item.qtyChi||0));
      return `${sign}${formatGoldQty(qty)}`;
    }
    const qty=Math.abs(Number(item.qtyRaw||0));
    const unit=assetSection({key})==='saving'?'Sổ':String(item.unit||'').trim();
    if(qty)return `${sign}${qty.toLocaleString('vi-VN')}${unit?' '+unit:''}`;
    return `${sign}${String(item.qty||'').replace(/^-/, '').trim()||'-'}`;
  }

  function convertedUnitPriceText(item,key){
    const unit=isGoldKey(key)?'chỉ':String(item.unit||'đơn vị').trim().toLowerCase();
    const price=Number(item.price||0)||Number(item.avgCost||0);
    return price?`${fmt(Math.abs(price))} / ${unit}`:'-';
  }

  function movementYear(item){
    const raw=String(item.sortDate||item.date||'');
    const iso=raw.match(/^(\d{4})-/);
    if(iso)return Number(iso[1]);
    const local=raw.match(/(\d{4})$/);
    return local?Number(local[1]):new Date().getFullYear();
  }

  function movementMonth(item){
    const raw=String(item.sortDate||item.date||'');
    const iso=raw.match(/^\d{4}-(\d{2})/);
    if(iso)return Number(iso[1]);
    const local=raw.match(/^\d{1,2}\/(\d{1,2})\//);
    return local?Number(local[1]):1;
  }

  function movementDateHyphen(item){
    const raw=String(item.sortDate||item.date||'');
    const iso=raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if(iso)return `${iso[3]}-${iso[2]}-${iso[1]}`;
    const local=raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if(local)return `${String(local[1]).padStart(2,'0')}-${String(local[2]).padStart(2,'0')}-${local[3]}`;
    return raw;
  }

  function chartPath(values,width,height,pad){
    const max=Math.max(...values,1);
    return values.map((value,index)=>{
      const x=pad+(index*(width-pad*2)/11);
      const y=height-pad-(value*(height-pad*2)/max);
      return `${index?'L':'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
    }).join(' ');
  }

  function chartGeometry(values,width,height,pad,labeler){
    const max=Math.max(...values,1);
    const coords=values.map((value,index)=>{
      const x=pad+(index*(width-pad*2)/11);
      const y=height-pad-(value*(height-pad*2)/max);
      return {value,x,y};
    });
    const path=coords.map((point,index)=>`${index?'L':'M'}${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' ');
    const polyline=coords.map(point=>`${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ');
    const area=`${path} L${coords[coords.length-1].x.toFixed(1)} ${height-pad} L${coords[0].x.toFixed(1)} ${height-pad} Z`;
    const guides=coords.map(point=>`<line x1="${point.x.toFixed(1)}" y1="${pad+8}" x2="${point.x.toFixed(1)}" y2="${height-pad}"></line>`).join('');
    const points=coords.map(point=>`<g><text x="${point.x.toFixed(1)}" y="${Math.max(12,point.y-7).toFixed(1)}">${labeler(point.value)}</text><circle cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="${point.value?3.2:2.3}"></circle></g>`).join('');
    return {path,polyline,area,guides,points};
  }

  function goldQtyShort(value){
    const totalPhan=Math.round(Number(value||0)*10);
    if(!totalPhan)return '0';
    const cay=Math.floor(totalPhan/100);
    const chi=Math.floor((totalPhan%100)/10);
    const phan=totalPhan%10;
    const parts=[];
    if(cay)parts.push(`${cay}c`);
    if(chi)parts.push(`${chi}ch`);
    if(phan)parts.push(`${phan}p`);
    return parts.join(' ');
  }

  function goldFlowChartHtml(rows,year,mode){
    const monthly=Array.from({length:12},()=>0);
    rows.forEach(row=>{
      const month=Math.max(1,Math.min(12,movementMonth(row)));
      monthly[month-1]+=Math.abs(Number(row.qtyChi||0));
    });
    const width=380,height=132,pad=20;
    const chart=chartGeometry(monthly,width,height,pad,goldQtyShort);
    const total=monthly.reduce((sum,value)=>sum+value,0);
    const isSell=mode==='sell';
    return `<div class="asset53-movement-chart gold-flow-chart ${isSell?'sell':'buy'}">
      <div class="asset53-chart-meta"><span>${isSell?'Tổng bán':'Tổng mua'} ${year}</span><b>${formatGoldQty(total)}</b><button type="button" data-asset-flow="${isSell?'buy':'sell'}" aria-label="${isSell?'Xem mua vàng':'Xem bán vàng'}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="${isSell?'m15 18-6-6 6-6':'m9 18 6-6-6-6'}"/></svg></button></div>
      <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Biểu đồ số lượng ${isSell?'bán':'mua'} vàng năm ${year}">
        <path class="area" d="${chart.area}"></path>
        <path class="grid" d="M20 34H360M20 66H360M20 98H360"></path>
        <g class="guides">${chart.guides}</g>
        <line class="baseline" x1="${pad}" y1="${height-pad}" x2="${width-pad}" y2="${height-pad}"></line>
        <polyline class="line" points="${chart.polyline}"></polyline>
        <g class="points">${chart.points}</g>
      </svg>
      <div class="asset53-chart-months">${Array.from({length:12},(_,i)=>`<span>${i+1}</span>`).join('')}</div>
    </div>`;
  }

  function savingBookLabel(value){
    return `${Math.max(0,Number(value||0)).toLocaleString('vi-VN')} sổ`;
  }

  function savingFlowChartHtml(rows,year,mode){
    const isSell=mode==='sell';
    const monthly=Array.from({length:12},()=>0);
    (rows||[]).forEach(row=>{
      const month=Math.max(1,Math.min(12,movementMonth(row)));
      monthly[month-1]+=Math.abs(Number(row.qtyRaw||0));
    });
    const width=380,height=132,pad=20;
    const chart=chartGeometry(monthly,width,height,pad,savingBookLabel);
    const total=monthly.reduce((sum,value)=>sum+value,0);
    return `<div class="asset53-movement-chart saving-flow-chart ${isSell?'sell':'buy'}">
      <div class="asset53-chart-meta"><span>${isSell?'Tổng rút':'Tổng gửi'} ${year}</span><b>${savingBookLabel(total)}</b><button type="button" data-asset-flow="${isSell?'buy':'sell'}" aria-label="${isSell?'Xem gửi tiết kiệm':'Xem rút tiết kiệm'}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="${isSell?'m15 18-6-6 6-6':'m9 18 6-6-6-6'}"/></svg></button></div>
      <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Biểu đồ số sổ tiết kiệm ${isSell?'rút':'gửi'} năm ${year}">
        <path class="area" d="${chart.area}"></path>
        <path class="grid" d="M20 34H360M20 66H360M20 98H360"></path>
        <g class="guides">${chart.guides}</g>
        <line class="baseline" x1="${pad}" y1="${height-pad}" x2="${width-pad}" y2="${height-pad}"></line>
        <polyline class="line" points="${chart.polyline}"></polyline>
        <g class="points">${chart.points}</g>
      </svg>
      <div class="asset53-chart-months">${Array.from({length:12},(_,i)=>`<span>${i+1}</span>`).join('')}</div>
    </div>`;
  }

  function moneyShort(value){
    const n=Math.abs(Number(value||0));
    if(n>=1000000){
      const v=n/1000000;
      return `${Number.isInteger(v)?v:v.toLocaleString('vi-VN',{maximumFractionDigits:1})} tr`;
    }
    return `${Math.round(n/1000).toLocaleString('vi-VN')} k`;
  }

  function txYear(tx){
    const raw=String(firstValue(tx,['date','ngay'])||tx?.date||tx?.ngay||'');
    const iso=raw.match(/^(\d{4})-/);
    if(iso)return Number(iso[1]);
    const local=raw.match(/(\d{4})$/);
    return local?Number(local[1]):new Date().getFullYear();
  }

  function txMonth(tx){
    const raw=String(firstValue(tx,['date','ngay'])||tx?.date||tx?.ngay||'');
    const iso=raw.match(/^\d{4}-(\d{2})/);
    if(iso)return Number(iso[1]);
    const local=raw.match(/^\d{1,2}\/(\d{1,2})\//);
    return local?Number(local[1]):1;
  }

  function txKind(tx){
    const type=String(firstValue(tx,['type','loai_giao_dich'])||tx?.type||tx?.loai_giao_dich||'').toUpperCase();
    const large=plainText(firstValue(tx,['large','loai_lon'])||tx?.large||tx?.loai_lon);
    if(type==='DIVEST'||large.includes('thu hoi'))return 'income';
    if(type==='INVEST'||large.includes('dau tu'))return 'expense';
    if(type==='INCOME'||large.includes('thu nhap'))return 'income';
    if(type==='EXPENSE'||large.includes('chi tieu'))return 'expense';
    return '';
  }

  function cashFlowChartHtml(rows,year,mode){
    const monthly=Array.from({length:12},()=>0);
    rows.forEach(tx=>{
      const month=Math.max(1,Math.min(12,txMonth(tx)));
      monthly[month-1]+=amountOf(tx);
    });
    const width=380,height=132,pad=20;
    const chart=chartGeometry(monthly,width,height,pad,moneyShort);
    const total=monthly.reduce((sum,value)=>sum+value,0);
    return `<div class="asset53-movement-chart cash-flow-chart ${mode==='income'?'income':'expense'}">
      <div class="asset53-chart-meta"><span>${mode==='income'?'Thu nhập':'Chi tiêu'} ${year}</span><b>${moneyShort(total)}</b></div>
      <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Biểu đồ ${mode==='income'?'thu nhập':'chi tiêu'} năm ${year}">
        <path class="area" d="${chart.area}"></path>
        <path class="grid" d="M20 34H360M20 66H360M20 98H360"></path>
        <g class="guides">${chart.guides}</g>
        <line class="baseline" x1="${pad}" y1="${height-pad}" x2="${width-pad}" y2="${height-pad}"></line>
        <polyline class="line" points="${chart.polyline}"></polyline>
        <g class="points">${chart.points}</g>
      </svg>
      <div class="asset53-chart-months">${Array.from({length:12},(_,i)=>`<span>${i+1}</span>`).join('')}</div>
    </div>`;
  }

  function bankTransactionRows(year,mode){
    const rows=typeof window.TXN_getTransactions==='function'?window.TXN_getTransactions():[];
    return (Array.isArray(rows)?rows:[]).filter(tx=>txKind(tx)===mode&&txYear(tx)===year);
  }

  function bankGroupedListHtml(rows){
    if(!rows.length)return '<div class="asset53-empty">Chưa có giao dịch trong năm này.</div>';
    const groups={};
    const grandTotal=rows.reduce((sum,tx)=>sum+amountOf(tx),0)||1;
    const listAnim=detailState.bankListAnim==='group'?'group-only':'full-anim';
    rows.forEach(tx=>{
      const name=String(firstValue(tx,['group','nhom_danh_muc'])||tx.group||tx.nhom_danh_muc||'Khác').trim()||'Khác';
      const child=String(firstValue(tx,['child','hang_muc_con'])||tx.child||tx.hang_muc_con||'Khác').trim()||'Khác';
      groups[name]||(groups[name]={total:0,children:{}});
      groups[name].total+=amountOf(tx);
      groups[name].children[child]=(groups[name].children[child]||0)+amountOf(tx);
    });
    return `<div class="asset53-bank-list ${listAnim}">${Object.entries(groups).sort((a,b)=>b[1].total-a[1].total).map(([name,group],groupIndex)=>{
      const key=encodeURIComponent(name);
      const open=detailState.expandedGroup===key;
      const pct=Math.round(group.total*100/grandTotal);
      const tone=(groupIndex%6)+1;
      const children=Object.entries(group.children).sort((a,b)=>b[1]-a[1]).map(([child,total],childIndex)=>`
        <div class="asset53-bank-child tone-${((groupIndex+childIndex)%6)+1}"><div><span>${child}</span><small>${Math.round(total*100/group.total)}%</small></div><b>${fmt(total)}</b><i style="--pct:${Math.max(2,Math.round(total*100/group.total))}%"></i></div>`).join('');
      return `<div class="asset53-bank-group tone-${tone} ${open?'open':''}">
        <button type="button" data-bank-group-toggle="${key}"><span>${name}</span><small>${pct}%</small><b>${fmt(group.total)}</b><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="m6 9 6 6 6-6"/></svg><i style="--pct:${Math.max(2,pct)}%"></i></button>
        ${open?`<div class="asset53-bank-children">${children}</div>`:''}
      </div>`;
    }).join('')}</div>`;
  }

  function bankDetailHtml(){
    const year=Number(detailState.year||new Date().getFullYear());
    const mode=detailState.cashTab==='expense'?'expense':'income';
    const rows=bankTransactionRows(year,mode);
    const anim=detailState.yearAnim?` ${detailState.yearAnim}`:'';
    return `<div class="asset53-fixed-panel">
      <div class="asset53-tabs cash-tabs">
        <button class="${mode==='income'?'active':''}" data-asset-cash-tab="income">Thu nhập</button>
        <button class="${mode==='expense'?'active':''}" data-asset-cash-tab="expense">Chi tiêu</button>
      </div>
      <div class="asset53-movement-pin">
        ${goldMovementHeaderHtml(year,bankYearRatioHtml(year))}
        <div class="asset53-movement-stage${anim}">
        ${cashFlowChartHtml(rows,year,mode)}
        </div>
      </div>
    </div>
    <div class="asset53-scroll-list">
      ${bankGroupedListHtml(rows)}
    </div>`;
  }

  function bankYearRatioHtml(year){
    const income=bankTransactionRows(year,'income').reduce((sum,tx)=>sum+amountOf(tx),0);
    const expense=bankTransactionRows(year,'expense').reduce((sum,tx)=>sum+amountOf(tx),0);
    const delta=income-expense;
    return `<div class="asset53-year-ratio ${delta>=0?'positive':'negative'}"><span>Thu - Chi :</span><b>${fmtProfit(delta)}</b></div>`;
  }

  function goldMovementHeaderHtml(year,middleHtml=''){
    return `<div class="asset53-movement-head">
      <div class="asset53-movement-year">${year}</div>
      ${middleHtml||'<div></div>'}
      <div class="asset53-year-actions">
        <button type="button" data-asset-year="prev" aria-label="Năm trước"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="m15 18-6-6 6-6"/></svg></button>
        <button type="button" data-asset-year="current" aria-label="Năm hiện tại"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="4"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3"/></svg></button>
        <button type="button" data-asset-year="next" aria-label="Năm sau"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="m9 18 6-6-6-6"/></svg></button>
      </div>
    </div>`;
  }

  function movementsHtml(rows,color,key){
    if(isGoldKey(key)){
      const year=Number(detailState.year||new Date().getFullYear());
      const mode=detailState.flow==='sell'?'sell':'buy';
      const anim=(detailState.flowAnim||detailState.yearAnim||detailState.tabAnim)?` ${detailState.flowAnim||detailState.yearAnim||detailState.tabAnim}`:'';
      const movementRows=rows.filter(row=>(mode==='sell'?isSellMovement(row):!isSellMovement(row))&&movementYear(row)===year);
      return `<div class="asset53-fixed-panel">
        <div class="asset53-movement-pin">
          ${goldMovementHeaderHtml(year)}
          <div class="asset53-movement-stage${anim}">
            ${goldFlowChartHtml(movementRows,year,mode)}
          </div>
        </div>
      </div>
      <div class="asset53-scroll-list">
        ${movementRows.length
          ? `<div class="asset53-detail-card gold-buy-list saving-book-list">${movementRows.map(row=>detailRow(row,isSellMovement(row)?'#ef4444':'#16a34a',key)).join('')}</div>`
          : `<div class="asset53-empty">Chưa có giao dịch ${mode==='sell'?'bán':'mua'} vàng trong năm này.</div>`}
      </div>`;
    }
    if(assetSection({key})==='saving'){
      const year=Number(detailState.year||new Date().getFullYear());
      const mode=detailState.flow==='sell'?'sell':'buy';
      const anim=(detailState.flowAnim||detailState.yearAnim||detailState.tabAnim)?` ${detailState.flowAnim||detailState.yearAnim||detailState.tabAnim}`:'';
      detailState.recalledSavingBookIds=recalledSavingBookIds(rows);
      const movementRows=rows.filter(row=>(mode==='sell'?isSellMovement(row):!isSellMovement(row))&&movementYear(row)===year);
      return `<div class="asset53-fixed-panel">
        <div class="asset53-movement-pin">
          ${goldMovementHeaderHtml(year)}
          <div class="asset53-movement-stage${anim}">
            ${savingFlowChartHtml(movementRows,year,mode)}
          </div>
        </div>
      </div>
      <div class="asset53-scroll-list">
        ${movementRows.length
          ? `<div class="asset53-detail-card gold-buy-list saving-book-list">${movementRows.map(row=>detailRow(row,isSellMovement(row)?'#ef4444':'#16a34a',key)).join('')}</div>`
          : `<div class="asset53-empty">Chưa có giao dịch ${mode==='sell'?'rút':'gửi'} tiết kiệm trong năm này.</div>`}
      </div>`;
    }
    return rows.length
      ? `<div class="asset53-detail-card">${rows.map(row=>detailRow(row,color,key)).join('')}</div>`
      : '<div class="asset53-empty">Chưa có dữ liệu biến động.</div>';
  }

  function renderDetail(){
    const key=detailState.key;
    const rows=(detailData[key]||[]).slice().sort((a,b)=>String(b.sortDate||b.date||'').localeCompare(String(a.sortDate||a.date||'')));
    const body=document.getElementById('asset53DetailBody');
    const asset=assets.find(x=>x.key===key)||categoryAssets[key]||{key,name:'Chi tiết tài sản',value:0};
    const color=colorForKey(key,rows[0]||asset);
    const cash=assetSection(asset)==='cash';
    const screen=document.getElementById('screenAssetDetail');
    const title=screen?.querySelector('.slide-title');
    if(title)title.textContent=asset.name||'Chi tiết tài sản';
    if(!body)return;
    body.style.setProperty('--asset-detail-color',color);
    body.style.setProperty('--asset-detail-soft',`${color}18`);
    body.classList.toggle('asset53-compact-ledger',['insurance','realestate','stock','saving'].includes(assetSection(asset)));
    body.classList.toggle('asset53-fixed-detail',cash||detailState.tab==='movement');
    if(cash){
      body.innerHTML=bankDetailHtml();
      return;
    }
    body.innerHTML=`<div class="asset53-tabs">
      <button class="${detailState.tab==='overview'?'active':''}" data-asset-detail-tab="overview">Tổng quan</button>
      <button class="${detailState.tab==='movement'?'active':''}" data-asset-detail-tab="movement">Biến động</button>
    </div>${detailState.tab==='overview'?overviewHtml(asset,rows):movementsHtml(rows,color,key)}`;
  }

  function openDetail(key){
    const screen=ensureDetailScreen();
    if(!screen)return;
    detailState={key,tab:'overview',year:new Date().getFullYear(),flow:'buy',cashTab:'income'};
    renderDetail();
    screen.classList.remove('active');
    screen.setAttribute('aria-hidden','true');
    void screen.offsetWidth;
    requestAnimationFrame(()=>{
      screen.classList.add('active');
      screen.setAttribute('aria-hidden','false');
    });
  }

  function closeDetail(){
    const screen=document.getElementById('screenAssetDetail');
    if(!screen)return;
    screen.classList.remove('active');
    screen.setAttribute('aria-hidden','true');
  }

  function parseGoldQtyToChi(qtyText){
    const text=String(qtyText||'').toLowerCase();
    let total=0;
    const cay=text.match(/(\d+(?:[.,]\d+)?)\s*cây/);
    const chi=text.match(/(\d+(?:[.,]\d+)?)\s*chỉ/);
    const phan=text.match(/(\d+(?:[.,]\d+)?)\s*phân/);
    if(cay)total+=Number(cay[1].replace(',','.'))*10;
    if(chi)total+=Number(chi[1].replace(',','.'));
    if(phan)total+=Number(phan[1].replace(',','.'))/10;
    return total;
  }

  function updateGoldPriceFromGoldScreen(payload){
    if(!payload||!window.FDB)return;
    const typeId=payload.id||payload.typeId;
    const name=payload.name||'Vàng';
    const price=Number(payload.price||0);
    if(!typeId||!price)return;
    const rows=rawAssetRows.filter(row=>isGoldRow(row,row.loai_tai_san||row.loaiTaiSan||row.ten_tai_san||row.name));
    const matched=rows.filter(r=>r.id===typeId||r.external_id===typeId||r.ten_tai_san===name||r.name===name);
    if(!matched.length){
      const qtyChi=Number(payload.qtyChi||parseGoldQtyToChi(payload.qtyText)||1);
      const current=Math.round(qtyChi*price);
      return window.FDB.set(FIREBASE_COLLECTIONS.taiSan,stableAssetDocId('GOLD',name),{
        loai_tai_san:'GOLD',
        ten_tai_san:name,
        so_luong:qtyChi,
        don_vi:'Chỉ',
        gia_hien_tai:price,
        gia_tri_hien_tai:current,
        so_tien_da_mua:0,
        so_tien_da_thu_hoi:0,
        tong_gia_von:0,
        gia_von_binh_quan:0,
        tong_lai_lo:current,
        lai_lo_tam_tinh:current,
        ngay_mua_ban:new Date().toISOString().slice(0,10),
        trang_thai:'ACTIVE',
        ghi_chu:''
      }).catch(error=>{console.error(error);throw error;});
    }
    return Promise.all(matched.map(row=>{
      const qtyChi=Number((row.so_luong??row.soLuong??row.qtyChi??parseGoldQtyToChi(row.qty))||1);
      const current=Math.round(qtyChi*price);
      const purchased=Number(row.so_tien_da_mua??row.purchasedTotal??0);
      const recovered=Number(row.so_tien_da_thu_hoi??row.recoveredTotal??0);
      const totalProfit=Math.round(current+recovered-purchased);
      return window.FDB.set(FIREBASE_COLLECTIONS.taiSan,row.id,{
        gia_hien_tai:price,
        gia_tri_hien_tai:current,
        tong_lai_lo:totalProfit,
        lai_lo_tam_tinh:totalProfit,
        ngay_cap_nhat:window.firebase.firestore.FieldValue.delete()
      });
    })).catch(error=>{console.error(error);throw error;});
  }

  function currentTransactionsWith(tx,txnDocId){
    const rows=typeof window.TXN_getTransactions==='function'?window.TXN_getTransactions():[];
    const list=Array.isArray(rows)?rows.filter(item=>String(item.id||'')!==String(txnDocId)):[]; 
    if(tx)list.push({...tx,id:txnDocId});
    return list;
  }

  function transactionUpdatePayload(tx,rule,detail,balanceDelta){
    return {
      loai_giao_dich:rule.txType,
      loai_tai_san:rule.assetType,
      chi_tiet_tai_san:detail,
      lai_suat:detail?.lai_suat||'',
      so_tiet_kiem_id:firstValue(tx,['so_tiet_kiem_id','savingBookId'])||detail?.so_tiet_kiem_id||'',
      so_tiet_kiem_label:firstValue(tx,['so_tiet_kiem_label','savingBookLabel'])||detail?.so_tiet_kiem_label||'',
      gia_von_tat_toan:parseNumber(firstValue(tx,['gia_von_tat_toan','settlementCost'])||detail?.gia_von_da_ban),
      tai_khoan_id:bankRow()?.id||'',
      bien_dong_so_du:balanceDelta,
      trang_thai_hach_toan:'POSTED'
    };
  }

  function accountingPayload(tx){
    const amount=amountOf(tx);
    const type=String(firstValue(tx,['type','loai_giao_dich'])||'').toUpperCase();
    const large=plainText(firstValue(tx,['large','loai_lon']));
    const positive=type==='INCOME'||type==='DIVEST'||large.includes('thu nhap')||large.includes('thu hoi');
    return {
      tai_khoan_id:bankRow()?.id||'',
      bien_dong_so_du:positive?amount:-amount,
      trang_thai_hach_toan:'POSTED'
    };
  }

  function assetPayloadFromRow(row){
    return {
      id:row?.id||'',
      sourceTxnDocId:String(row?.source_txn_doc_id||row?.sourceTxnDocId||''),
      sourceTxnExternalId:String(row?.source_txn_external_id||row?.sourceTxnExternalId||''),
      savingBookId:String(row?.so_tiet_kiem_id||row?.savingBookId||''),
      savingBookLabel:String(row?.so_tiet_kiem_label||row?.savingBookLabel||''),
      type:String(row?.loai_tai_san||row?.loaiTaiSan||''),
      name:String(row?.ten_tai_san||row?.name||''),
      qty:parseNumber(row?.so_luong??row?.soLuong),
      unit:String(row?.don_vi||row?.donVi||''),
      currentPrice:parseNumber(row?.gia_hien_tai??row?.price),
      currentValue:parseNumber(row?.gia_tri_hien_tai??row?.currentValue??row?.value),
      totalCost:parseNumber(row?.tong_gia_von??row?.cost),
      avgCost:parseNumber(row?.gia_von_binh_quan??row?.avgCost),
      tempProfit:parseNumber(row?.lai_lo_tam_tinh??row?.profit),
      realizedProfit:parseNumber(row?.lai_lo_da_thuc_hien??row?.realizedProfit),
      purchasedTotal:parseNumber(row?.so_tien_da_mua??row?.purchasedTotal),
      recoveredTotal:parseNumber(row?.so_tien_da_thu_hoi??row?.recoveredTotal),
      totalProfit:parseNumber(row?.tong_lai_lo??row?.totalProfit),
      status:String(row?.trang_thai||'ACTIVE'),
      interestRate:String(row?.lai_suat||row?.laiSuat||row?.interestRate||row?.interest_rate||row?.rate||''),
      note:String(row?.ghi_chu||''),
      date:String(row?.ngay_mua_ban||row?.ngay||new Date().toISOString().slice(0,10))
    };
  }

  function defaultAssetState(id,tx,rule,input){
    const name=transactionAssetName(tx);
    const currentPrice=rule.assetType==='GOLD'?0:input.unitPrice;
    return {
      id,
      sourceTxnDocId:'',
      sourceTxnExternalId:'',
      savingBookId:firstValue(tx,['so_tiet_kiem_id','savingBookId']),
      savingBookLabel:firstValue(tx,['so_tiet_kiem_label','savingBookLabel']),
      type:rule.assetType,
      name,
      qty:0,
      unit:input.unit,
      currentPrice,
      currentValue:0,
      totalCost:0,
      avgCost:0,
      tempProfit:0,
      realizedProfit:0,
      purchasedTotal:0,
      recoveredTotal:0,
      totalProfit:0,
      status:'ACTIVE',
      interestRate:input.interestRate||'',
      note:'',
      date:firstValue(tx,['date','ngay'])||new Date().toISOString().slice(0,10)
    };
  }

  function applyAssetDelta(state,tx,rule,input){
    const amount=amountOf(tx);
    const date=firstValue(tx,['date','ngay'])||new Date().toISOString().slice(0,10);
    const next={
      ...state,
      date,
      sourceTxnDocId:'',
      sourceTxnExternalId:'',
      savingBookId:state.savingBookId||firstValue(tx,['so_tiet_kiem_id','savingBookId']),
      savingBookLabel:state.savingBookLabel||firstValue(tx,['so_tiet_kiem_label','savingBookLabel']),
      interestRate:input.interestRate||state.interestRate||'',
      note:firstValue(tx,['note','ghi_chu','ghiChu'])||state.note
    };
    if(rule.action==='BUY'){
      const buyCost=Math.round(input.qty*input.unitPrice+input.fee);
      next.qty=Number(next.qty||0)+input.qty;
      next.purchasedTotal=Number(next.purchasedTotal||0)+buyCost;
      next.totalCost=Number(next.totalCost||0)+buyCost;
      next.avgCost=next.qty?Math.round(next.totalCost/next.qty):0;
      if(rule.assetType!=='GOLD')next.currentPrice=input.unitPrice;
      if(rule.assetType==='SAVING')next.currentPrice=next.avgCost;
      next.currentValue=rule.assetType==='SAVING'?Math.round(next.totalCost):Math.round(next.qty*(rule.assetType==='GOLD'?Number(next.currentPrice||0):(next.currentPrice||next.avgCost||0)));
      next.totalProfit=rule.assetType==='SAVING'?Number(next.realizedProfit||0):(rule.assetType==='GOLD'?goldProfitState(next).totalProfit:next.currentValue-next.totalCost+Number(next.realizedProfit||0));
      next.tempProfit=next.totalProfit;
      next.status='ACTIVE';
      return {state:next,detail:{
        tai_san_id:state.id,
        giao_dich_action:'BUY',
        so_luong_quy_doi:input.qty,
        don_vi_quy_doi:input.unit,
        don_gia_quy_doi:input.unitPrice,
        lai_suat:input.interestRate||'',
        so_tiet_kiem_id:firstValue(tx,['so_tiet_kiem_id','savingBookId']),
        so_tiet_kiem_label:firstValue(tx,['so_tiet_kiem_label','savingBookLabel']),
        so_luong_ton_sau_giao_dich:next.qty,
        tong_gia_von_sau_giao_dich:Math.round(next.totalCost),
        gia_von_binh_quan_sau_giao_dich:next.avgCost,
        migration_version:3
      }};
    }
    if(rule.assetType!=='SAVING'&&input.qty>Number(next.qty||0))throw new Error('Không thể bán nhiều hơn số lượng tài sản đang có.');
    const avgBefore=Number(next.avgCost||0);
    const selectedCost=rule.assetType==='SAVING'&&Number(input.settlementCost||0)?Number(input.settlementCost||0):0;
    const sellQty=rule.assetType==='SAVING'?Math.min(input.qty,Math.max(Number(next.qty||0),input.qty)):input.qty;
    const costSold=Math.round(selectedCost||sellQty*avgBefore);
    const gross=Math.round(input.qty*input.unitPrice);
    const proceeds=Math.round((amount||gross)-input.fee);
    const realized=proceeds-costSold;
    next.qty=Math.max(0,Number(next.qty||0)-sellQty);
    next.totalCost=Math.max(0,Number(next.totalCost||0)-costSold);
    next.recoveredTotal=Number(next.recoveredTotal||0)+proceeds;
    next.realizedProfit=Number(next.realizedProfit||0)+realized;
    next.avgCost=next.qty?avgBefore:0;
    if(rule.assetType!=='GOLD')next.currentPrice=input.unitPrice;
    if(rule.assetType==='SAVING')next.currentPrice=next.avgCost;
    next.currentValue=rule.assetType==='SAVING'?Math.round(next.totalCost):(next.qty?Math.round(next.qty*(rule.assetType==='GOLD'?Number(next.currentPrice||0):(next.currentPrice||next.avgCost||0))):0);
    next.totalProfit=rule.assetType==='SAVING'?Number(next.realizedProfit||0):(rule.assetType==='GOLD'?goldProfitState(next).totalProfit:next.currentValue-next.totalCost+Number(next.realizedProfit||0));
    next.tempProfit=next.totalProfit;
    next.status=next.qty>0?'ACTIVE':'CLOSED';
    return {state:next,detail:{
      tai_san_id:state.id,
      giao_dich_action:'SELL',
      so_luong_quy_doi:sellQty,
      don_vi_quy_doi:input.unit,
      don_gia_quy_doi:input.unitPrice,
      lai_suat:input.interestRate||state.interestRate||'',
      gia_von_binh_quan_luc_ban:avgBefore,
      gia_von_da_ban:costSold,
      so_tiet_kiem_id:firstValue(tx,['so_tiet_kiem_id','savingBookId']),
      so_tiet_kiem_label:firstValue(tx,['so_tiet_kiem_label','savingBookLabel']),
      lai_lo_thuc_hien:realized,
      so_luong_ton_sau_giao_dich:next.qty,
      tong_gia_von_sau_giao_dich:Math.round(next.totalCost),
      gia_von_binh_quan_sau_giao_dich:next.avgCost,
      migration_version:3
    }};
  }

  function assetStatePayload(state){
    const isGold=String(state.type||'').toUpperCase()==='GOLD';
    const isSaving=String(state.type||'').toUpperCase()==='SAVING';
    const currentValue=isGold
      ? Math.round(Number(state.qty||0)*Number(state.currentPrice||0))
      : (isSaving?Math.round(Number(state.totalCost||0)):Math.round(Number(state.currentValue||0)));
    const totalProfit=isGold
      ? Math.round(currentValue+Number(state.recoveredTotal||0)-Number(state.purchasedTotal||0))
      : (isSaving?Math.round(Number(state.realizedProfit||0)):Math.round(Number(state.totalProfit??state.tempProfit??0)));
    return {
      loai_tai_san:state.type,
      source_txn_doc_id:state.sourceTxnDocId||'',
      source_txn_external_id:state.sourceTxnExternalId||'',
      so_tiet_kiem_id:state.savingBookId||'',
      so_tiet_kiem_label:state.savingBookLabel||'',
      ten_tai_san:state.name,
      so_luong:state.qty,
      don_vi:state.unit,
      gia_hien_tai:state.currentPrice,
      gia_tri_hien_tai:currentValue,
      tong_gia_von:Math.round(state.totalCost),
      gia_von_binh_quan:state.avgCost,
      so_tien_da_mua:Math.round(state.purchasedTotal||0),
      so_tien_da_thu_hoi:Math.round(state.recoveredTotal||0),
      tong_lai_lo:totalProfit,
      lai_lo_tam_tinh:totalProfit,
      lai_lo_da_thuc_hien:Math.round(state.realizedProfit||0),
      lai_suat:state.interestRate||'',
      ngay_mua_ban:state.date,
      trang_thai:state.status,
      ghi_chu:state.note,
      migration_version:3
    };
  }

  function recalcAssetState(state){
    state.avgCost=state.qty?Math.round(state.totalCost/state.qty):0;
    const isGold=String(state.type||'').toUpperCase()==='GOLD';
    const isSaving=String(state.type||'').toUpperCase()==='SAVING';
    state.currentValue=isSaving?Math.round(Number(state.totalCost||0)):(state.qty?Math.round(state.qty*(isGold?Number(state.currentPrice||0):(state.currentPrice||state.avgCost||0))):0);
    state.totalProfit=isSaving?Math.round(Number(state.realizedProfit||0)):(isGold?goldProfitState(state).totalProfit:state.currentValue-state.totalCost+Number(state.realizedProfit||0));
    state.tempProfit=state.totalProfit;
    state.status=state.qty>0?'ACTIVE':'CLOSED';
    return state;
  }

  function shouldRemoveAssetAfterReverse(state){
    const type=String(state.type||'').toUpperCase();
    if(type==='BANK')return false;
    const qty=Number(state.qty||0);
    const currentValue=Number(state.currentValue||0);
    const totalCost=Number(state.totalCost||0);
    return qty<=0&&currentValue<=0&&totalCost<=0;
  }

  function bankPayloadAfter(row,delta){
    const value=parseNumber(row?.gia_tri_hien_tai??row?.so_tien??row?.value)+delta;
    return {
      loai_tai_san:'BANK',
      ten_tai_san:row?.ten_tai_san||row?.name||'Tài khoản ngân hàng',
      so_luong:0,
      don_vi:'đ',
      gia_hien_tai:value,
      gia_tri_hien_tai:value,
      tong_gia_von:value,
      gia_von_binh_quan:value,
      so_tien:value,
      lai_lo_tam_tinh:0,
      trang_thai:'ACTIVE'
    };
  }

  function applyNewTransactionOnly(tx,txnDocId){
    if(!tx||!txnDocId||!window.FDB)return Promise.resolve();
    const rule=assetRuleFor(tx);
    const bankId=bankRow()?.id||BANK_ASSET_DOC_ID;
    const amount=amountOf(tx);
    const run=async writer=>{
      const storedTx=await writer.get(FIREBASE_COLLECTIONS.giaoDich,txnDocId);
      const sourceTx=storedTx?{...tx,...storedTx}:tx;
      const input=rule?convertedAssetInput(sourceTx,rule):null;
      const missingAssetDetail=rule&&storedTx&&storedTx.trang_thai_hach_toan==='POSTED'&&!storedTx.chi_tiet_tai_san;
      if(storedTx&&storedTx.trang_thai_hach_toan==='POSTED'&&!missingAssetDetail)return;
      const sourceAmount=amountOf(sourceTx);
      const balanceDelta=rule
        ? (rule.txType==='INVEST'?-(sourceAmount+input.fee):(sourceAmount-input.fee))
        : accountingPayload(tx).bien_dong_so_du;
      if(missingAssetDetail){
        const assetId=assetDocIdFor(sourceTx,rule);
        const currentAsset=await writer.get(FIREBASE_COLLECTIONS.taiSan,assetId);
        const currentState=currentAsset?assetPayloadFromRow(currentAsset):defaultAssetState(assetId,sourceTx,rule,input);
        currentState.id=assetId;
        const applied=applyAssetDelta(currentState,sourceTx,rule,input);
        writer.set(FIREBASE_COLLECTIONS.taiSan,assetId,assetStatePayload(applied.state),{merge:true});
        writer.set(FIREBASE_COLLECTIONS.giaoDich,txnDocId,{
          loai_giao_dich:rule.txType,
          loai_tai_san:rule.assetType,
          chi_tiet_tai_san:applied.detail,
          tai_khoan_id:storedTx.tai_khoan_id||bankId,
          bien_dong_so_du:Number(storedTx.bien_dong_so_du||balanceDelta),
          trang_thai_hach_toan:'POSTED'
        },{merge:true});
        return;
      }
      const bank=await writer.get(FIREBASE_COLLECTIONS.taiSan,bankId);
      if(!rule){
        writer.set(FIREBASE_COLLECTIONS.taiSan,bankId,bankPayloadAfter(bank||{},balanceDelta),{merge:true});
        writer.set(FIREBASE_COLLECTIONS.giaoDich,txnDocId,{tai_khoan_id:bankId,bien_dong_so_du:balanceDelta,trang_thai_hach_toan:'POSTED'},{merge:true});
        return;
      }
      const assetId=assetDocIdFor(tx,rule);
      const currentAsset=await writer.get(FIREBASE_COLLECTIONS.taiSan,assetId);
      const currentState=currentAsset?assetPayloadFromRow(currentAsset):defaultAssetState(assetId,tx,rule,input);
      currentState.id=assetId;
      const applied=applyAssetDelta(currentState,tx,rule,input);
      writer.set(FIREBASE_COLLECTIONS.taiSan,bankId,bankPayloadAfter(bank||{},balanceDelta),{merge:true});
      writer.set(FIREBASE_COLLECTIONS.taiSan,assetId,assetStatePayload(applied.state),{merge:true});
      writer.set(FIREBASE_COLLECTIONS.giaoDich,txnDocId,transactionUpdatePayload(tx,rule,applied.detail,balanceDelta),{merge:true});
    };
    if(typeof window.FDB.runTransaction==='function')return window.FDB.runTransaction(run);
    return Promise.resolve();
  }

  function reversePostedTransaction(tx,txnDocId){
    if(!tx||!txnDocId||!window.FDB)return Promise.resolve();
    const detail=tx.assetDetail||tx.chi_tiet_tai_san;
    const balanceDelta=Number(tx.balanceDelta||tx.bien_dong_so_du||0);
    const run=async writer=>{
      const storedTx=await writer.get(FIREBASE_COLLECTIONS.giaoDich,txnDocId);
      const source=storedTx||tx;
      if(source.trang_thai_hach_toan!=='POSTED'&&tx.postingStatus!=='POSTED')return;
      const bankId=source.tai_khoan_id||tx.accountId||bankRow()?.id||BANK_ASSET_DOC_ID;
      const bank=await writer.get(FIREBASE_COLLECTIONS.taiSan,bankId);
      const d=source.chi_tiet_tai_san||detail;
      const asset=d?.tai_san_id?await writer.get(FIREBASE_COLLECTIONS.taiSan,d.tai_san_id):null;
      writer.set(FIREBASE_COLLECTIONS.taiSan,bankId,bankPayloadAfter(bank||{},-(Number(source.bien_dong_so_du||balanceDelta)||0)),{merge:true});
      if(d?.tai_san_id){
        if(asset){
          const state=assetPayloadFromRow(asset);
          const qty=Number(d.so_luong_quy_doi||0);
          if(d.giao_dich_action==='BUY'){
            const buyCost=amountOf(source)+parseNumber(source.phi||source.fee);
            state.qty=Math.max(0,state.qty-qty);
            state.purchasedTotal=Math.max(0,Number(state.purchasedTotal||0)-buyCost);
            state.totalCost=Math.max(0,state.totalCost-buyCost);
          }else if(d.giao_dich_action==='SELL'){
            const proceeds=amountOf(source)-parseNumber(source.phi||source.fee);
            state.qty+=qty;
            state.totalCost+=Number(d.gia_von_da_ban||0);
            state.recoveredTotal=Math.max(0,Number(state.recoveredTotal||0)-proceeds);
            state.realizedProfit-=Number(d.lai_lo_thuc_hien||0);
          }
          recalcAssetState(state);
          if(shouldRemoveAssetAfterReverse(state)&&typeof writer.remove==='function')writer.remove(FIREBASE_COLLECTIONS.taiSan,d.tai_san_id);
          else writer.set(FIREBASE_COLLECTIONS.taiSan,d.tai_san_id,assetStatePayload(state),{merge:true});
        }
      }
      writer.set(FIREBASE_COLLECTIONS.giaoDich,txnDocId,{trang_thai_hach_toan:'REVERSED'},{merge:true});
    };
    if(typeof window.FDB.runTransaction==='function')return window.FDB.runTransaction(run);
    return Promise.resolve();
  }

  async function reversePostedInWriter(writer,txnDocId,fallbackTx){
    const storedTx=await writer.get(FIREBASE_COLLECTIONS.giaoDich,txnDocId);
    const source=storedTx||fallbackTx||{};
    if(source.trang_thai_hach_toan!=='POSTED'&&fallbackTx?.postingStatus!=='POSTED')return;
    const d=source.chi_tiet_tai_san||fallbackTx?.assetDetail||fallbackTx?.chi_tiet_tai_san;
    const bankId=source.tai_khoan_id||fallbackTx?.accountId||bankRow()?.id||BANK_ASSET_DOC_ID;
    const bank=await writer.get(FIREBASE_COLLECTIONS.taiSan,bankId);
    const asset=d?.tai_san_id?await writer.get(FIREBASE_COLLECTIONS.taiSan,d.tai_san_id):null;
    writer.set(FIREBASE_COLLECTIONS.taiSan,bankId,bankPayloadAfter(bank||{},-(Number(source.bien_dong_so_du||fallbackTx?.balanceDelta||0)||0)),{merge:true});
    if(!d?.tai_san_id||!asset)return;
    const state=assetPayloadFromRow(asset);
    const qty=Number(d.so_luong_quy_doi||0);
    if(d.giao_dich_action==='BUY'){
      const buyCost=amountOf(source)+parseNumber(source.phi||source.fee);
      state.qty=Math.max(0,Number(state.qty||0)-qty);
      state.purchasedTotal=Math.max(0,Number(state.purchasedTotal||0)-buyCost);
      state.totalCost=Math.max(0,Number(state.totalCost||0)-buyCost);
    }else if(d.giao_dich_action==='SELL'){
      const proceeds=amountOf(source)-parseNumber(source.phi||source.fee);
      state.qty=Number(state.qty||0)+qty;
      state.totalCost=Number(state.totalCost||0)+Number(d.gia_von_da_ban||0);
      state.recoveredTotal=Math.max(0,Number(state.recoveredTotal||0)-proceeds);
      state.realizedProfit=Number(state.realizedProfit||0)-Number(d.lai_lo_thuc_hien||0);
    }
    recalcAssetState(state);
    if(shouldRemoveAssetAfterReverse(state)&&typeof writer.remove==='function')writer.remove(FIREBASE_COLLECTIONS.taiSan,d.tai_san_id);
    else writer.set(FIREBASE_COLLECTIONS.taiSan,d.tai_san_id,assetStatePayload(state),{merge:true});
  }

  async function postTransactionInWriter(writer,tx,txnDocId,baseData){
    const rule=assetRuleFor(tx);
    const bankId=bankRow()?.id||BANK_ASSET_DOC_ID;
    if(!rule){
      const delta=accountingPayload(tx).bien_dong_so_du;
      const bank=await writer.get(FIREBASE_COLLECTIONS.taiSan,bankId);
      writer.set(FIREBASE_COLLECTIONS.taiSan,bankId,bankPayloadAfter(bank||{},delta),{merge:true});
      writer.set(FIREBASE_COLLECTIONS.giaoDich,txnDocId,{...(baseData||{}),tai_khoan_id:bankId,bien_dong_so_du:delta,trang_thai_hach_toan:'POSTED'},{merge:true});
      return;
    }
    const input=convertedAssetInput(tx,rule);
    const amount=amountOf(tx);
    const balanceDelta=rule.txType==='INVEST'?-(amount+input.fee):(amount-input.fee);
    const assetId=assetDocIdFor(tx,rule);
    const bank=await writer.get(FIREBASE_COLLECTIONS.taiSan,bankId);
    const currentAsset=await writer.get(FIREBASE_COLLECTIONS.taiSan,assetId);
    const currentState=currentAsset?assetPayloadFromRow(currentAsset):defaultAssetState(assetId,tx,rule,input);
    currentState.id=assetId;
    const applied=applyAssetDelta(currentState,tx,rule,input);
    writer.set(FIREBASE_COLLECTIONS.taiSan,bankId,bankPayloadAfter(bank||{},balanceDelta),{merge:true});
    writer.set(FIREBASE_COLLECTIONS.taiSan,assetId,assetStatePayload(applied.state),{merge:true});
    writer.set(FIREBASE_COLLECTIONS.giaoDich,txnDocId,{...(baseData||{}),...transactionUpdatePayload(tx,rule,applied.detail,balanceDelta)},{merge:true});
  }

  function saveTransactionAtomic(tx,txnDocId,baseData,options){
    if(!tx||!txnDocId||!window.FDB||typeof window.FDB.runTransaction!=='function')return Promise.resolve();
    const run=async writer=>{
      const stored=await writer.get(FIREBASE_COLLECTIONS.giaoDich,txnDocId);
      if(options?.mode==='create'&&stored?.trang_thai_hach_toan==='POSTED')return;
      const source={...tx,...(baseData||{})};
      const oldSource=stored||{};
      const oldDetail=oldSource.chi_tiet_tai_san;
      const shouldReverse=oldSource.trang_thai_hach_toan==='POSTED';
      const newRule=assetRuleFor(source);
      const newInput=newRule?convertedAssetInput(source,newRule):null;
      const oldBankId=shouldReverse?(oldSource.tai_khoan_id||bankRow()?.id||BANK_ASSET_DOC_ID):'';
      const newBankId=bankRow()?.id||BANK_ASSET_DOC_ID;
      const oldAssetId=shouldReverse&&oldDetail?.tai_san_id?oldDetail.tai_san_id:'';
      const newAssetId=newRule?assetDocIdFor(source,newRule):'';
      const bankIds=[...new Set([oldBankId,newBankId].filter(Boolean))];
      const assetIds=[...new Set([oldAssetId,newAssetId].filter(Boolean))];
      const bankRows={};
      const assetRows={};
      const removedAssetIds=new Set();
      for(const id of bankIds)bankRows[id]=await writer.get(FIREBASE_COLLECTIONS.taiSan,id);
      for(const id of assetIds)assetRows[id]=await writer.get(FIREBASE_COLLECTIONS.taiSan,id);
      if(shouldReverse&&oldBankId){
        bankRows[oldBankId]=bankPayloadAfter(bankRows[oldBankId]||{},-(Number(oldSource.bien_dong_so_du||0)||0));
      }
      if(shouldReverse&&oldAssetId&&assetRows[oldAssetId]){
        const state=assetPayloadFromRow(assetRows[oldAssetId]);
        const qty=Number(oldDetail.so_luong_quy_doi||0);
        if(oldDetail.giao_dich_action==='BUY'){
          const buyCost=amountOf(oldSource)+parseNumber(oldSource.phi||oldSource.fee);
          state.qty=Math.max(0,Number(state.qty||0)-qty);
          state.purchasedTotal=Math.max(0,Number(state.purchasedTotal||0)-buyCost);
          state.totalCost=Math.max(0,Number(state.totalCost||0)-buyCost);
        }else if(oldDetail.giao_dich_action==='SELL'){
          const proceeds=amountOf(oldSource)-parseNumber(oldSource.phi||oldSource.fee);
          state.qty=Number(state.qty||0)+qty;
          state.totalCost=Number(state.totalCost||0)+Number(oldDetail.gia_von_da_ban||0);
          state.recoveredTotal=Math.max(0,Number(state.recoveredTotal||0)-proceeds);
          state.realizedProfit=Number(state.realizedProfit||0)-Number(oldDetail.lai_lo_thuc_hien||0);
        }
        recalcAssetState(state);
        if(oldAssetId!==newAssetId&&shouldRemoveAssetAfterReverse(state)&&typeof writer.remove==='function'){
          removedAssetIds.add(oldAssetId);
          assetRows[oldAssetId]=null;
        }else{
          assetRows[oldAssetId]=assetStatePayload(state);
        }
      }
      if(!newRule){
        const delta=accountingPayload(source).bien_dong_so_du;
        bankRows[newBankId]=bankPayloadAfter(bankRows[newBankId]||{},delta);
        writer.set(FIREBASE_COLLECTIONS.giaoDich,txnDocId,{...(baseData||{}),tai_khoan_id:newBankId,bien_dong_so_du:delta,trang_thai_hach_toan:'POSTED'},{merge:true});
      }else{
        const amount=amountOf(source);
        const balanceDelta=newRule.txType==='INVEST'?-(amount+newInput.fee):(amount-newInput.fee);
        const currentState=assetRows[newAssetId]?assetPayloadFromRow(assetRows[newAssetId]):defaultAssetState(newAssetId,source,newRule,newInput);
        currentState.id=newAssetId;
        const applied=applyAssetDelta(currentState,source,newRule,newInput);
        bankRows[newBankId]=bankPayloadAfter(bankRows[newBankId]||{},balanceDelta);
        assetRows[newAssetId]=assetStatePayload(applied.state);
        writer.set(FIREBASE_COLLECTIONS.giaoDich,txnDocId,{...(baseData||{}),...transactionUpdatePayload(source,newRule,applied.detail,balanceDelta)},{merge:true});
      }
      bankIds.forEach(id=>writer.set(FIREBASE_COLLECTIONS.taiSan,id,bankRows[id],{merge:true}));
      removedAssetIds.forEach(id=>writer.remove(FIREBASE_COLLECTIONS.taiSan,id));
      assetIds.forEach(id=>{if(assetRows[id])writer.set(FIREBASE_COLLECTIONS.taiSan,id,assetRows[id],{merge:true});});
    };
    return window.FDB.runTransaction(run);
  }

  function deleteTransactionAtomic(tx,txnDocId){
    if(!txnDocId||!window.FDB)return Promise.resolve();
    if(typeof window.FDB.runTransaction!=='function'){
      return window.FDB.remove(FIREBASE_COLLECTIONS.giaoDich,txnDocId);
    }
    const run=async writer=>{
      const stored=await writer.get(FIREBASE_COLLECTIONS.giaoDich,txnDocId);
      const source=stored||tx||{};
      const wasPosted=source.trang_thai_hach_toan==='POSTED'||tx?.postingStatus==='POSTED'||source.bien_dong_so_du!==undefined;
      if(wasPosted)await reversePostedInWriter(writer,txnDocId,tx);
      if(typeof writer.remove==='function')writer.remove(FIREBASE_COLLECTIONS.giaoDich,txnDocId);
      else throw new Error('Transaction writer does not support remove().');
      return source;
    };
    return window.FDB.runTransaction(run);
  }

  function todayBusinessPrefix(){
    const d=new Date();
    return 'GD'+d.getFullYear()+String(d.getMonth()+1).padStart(2,'0')+String(d.getDate()).padStart(2,'0');
  }

  function shouldPostCurrentTransaction(tx){
    if(!tx||!isTransactionAsset(tx))return false;
    if(tx.assetDetail||tx.chi_tiet_tai_san)return false;
    const status=String(tx.postingStatus||tx.trang_thai_hach_toan||'').toUpperCase();
    if(status==='POSTED'){
      const rule=assetRuleFor(tx);
      if(rule?.assetType!=='GOLD')return false;
    }
    const businessId=String(tx.external_id||'');
    if(businessId.startsWith(todayBusinessPrefix()))return true;
    const rule=assetRuleFor(tx);
    if(rule?.assetType!=='GOLD')return false;
    const date=String(firstValue(tx,['date','ngay'])||'').slice(0,10);
    if(!date)return false;
    const txDate=new Date(date+'T00:00:00');
    const today=new Date();
    today.setHours(0,0,0,0);
    const ageDays=Math.round((today-txDate)/86400000);
    return ageDays>=0&&ageDays<=7;
  }

  function postPendingCurrentTransactions(){
    if(typeof window.TXN_getTransactions!=='function'||!window.FDB)return;
    window.TXN_getTransactions().filter(shouldPostCurrentTransaction).forEach(tx=>{
      if(!tx.id||pendingPostAttempts.has(tx.id))return;
      pendingPostAttempts.add(tx.id);
      console.info('Posting pending asset transaction',tx.id,tx.external_id||'',tx.child||tx.hang_muc_con||'');
      applyNewTransactionOnly(tx,tx.id)
        .then(()=>console.info('Posted pending asset transaction',tx.id))
        .catch(error=>console.error('Post pending asset transaction failed',tx.id,error))
        .finally(()=>pendingPostAttempts.delete(tx.id));
    });
  }

  window.ASSET52_renderAssets=renderAssets;
  window.ASSET52_updateGoldPrice=updateGoldPriceFromGoldScreen;
  window.ASSET52_syncTransactionAsset=function(tx,txnDocId,options){
    if(!window.FDB||!txnDocId)return Promise.resolve();
    return applyNewTransactionOnly(tx,txnDocId);
  };
  window.ASSET52_saveTransactionAtomic=saveTransactionAtomic;
  window.ASSET52_deleteTransactionAtomic=deleteTransactionAtomic;
  window.ASSET52_removeTransactionAsset=function(txnDocId){
    if(!window.FDB||!txnDocId)return Promise.resolve();
    return removeStaleTransactionAssets(txnDocId,[]);
  };
  window.ASSET52_reverseTransactionAsset=reversePostedTransaction;
  window.ASSET52_isTransactionAsset=isTransactionAsset;
  window.ASSET52_colorForTransaction=function(tx){
    const rule=assetRuleFor(tx);
    const type=rule?.assetType||firstValue(tx,['assetType','loai_tai_san','loaiTaiSan']);
    const name=firstValue(tx,['assetName','ten_tai_san','tenTaiSan','group','nhom_danh_muc','child','hang_muc_con']);
    return colorForKey(assetKey({loai_tai_san:type,ten_tai_san:name,nhom_danh_muc:name}),{loai_tai_san:type,ten_tai_san:name,nhom_danh_muc:name});
  };
  window.ASSET52_getAssets=()=>({assets:assets.slice(),detailData:{...detailData}});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
  function start(){
    renderAssets();
    if(!window.FDB)return;
    window.FDB.subscribe(FIREBASE_COLLECTIONS.taiSan,data=>{
      rawAssetRows=data.slice();
      cleanupOrphanTransactionAssetRows();
      normalizeAssets(data);
      renderAssets();
    },console.error);
  }
  document.addEventListener('click',e=>{
    const nav=e.target.closest('.dock-content .nav-item');
    if(nav&&nav.textContent.trim()==='Tài sản')setTimeout(renderAssets,0);
    const asset=e.target.closest('[data-asset-key]');
    if(asset)openDetail(asset.dataset.assetKey);
    const tab=e.target.closest('[data-asset-detail-tab]');
    if(tab){
      const nextTab=tab.dataset.assetDetailTab;
      detailState.tabAnim=nextTab==='movement'?'slide-left':'';
      detailState.tab=nextTab;
      renderDetail();
      setTimeout(()=>{if(detailState.tabAnim){detailState.tabAnim='';}},260);
    }
    const yearBtn=e.target.closest('[data-asset-year]');
    if(yearBtn){
      const action=yearBtn.dataset.assetYear;
      const current=new Date().getFullYear();
      if(action==='prev')detailState.year=Number(detailState.year||current)-1;
      if(action==='next')detailState.year=Number(detailState.year||current)+1;
      if(action==='current')detailState.year=current;
      detailState.yearAnim=action==='prev'?'slide-right':'slide-left';
      detailState.bankListAnim='full';
      detailState.expandedGroup='';
      renderDetail();
      setTimeout(()=>{if(detailState.yearAnim){detailState.yearAnim='';}},260);
    }
    const flowBtn=e.target.closest('[data-asset-flow]');
    if(flowBtn){
      const nextFlow=flowBtn.dataset.assetFlow==='sell'?'sell':'buy';
      detailState.flowAnim=nextFlow==='sell'?'slide-left':'slide-right';
      detailState.flow=nextFlow;
      renderDetail();
      setTimeout(()=>{if(detailState.flowAnim){detailState.flowAnim='';}},260);
    }
    const cashTab=e.target.closest('[data-asset-cash-tab]');
    if(cashTab){
      detailState.cashTab=cashTab.dataset.assetCashTab==='expense'?'expense':'income';
      detailState.yearAnim=detailState.cashTab==='expense'?'slide-left':'slide-right';
      detailState.bankListAnim='full';
      detailState.expandedGroup='';
      renderDetail();
      setTimeout(()=>{if(detailState.yearAnim){detailState.yearAnim='';}},260);
    }
    const bankGroup=e.target.closest('[data-bank-group-toggle]');
    if(bankGroup){
      const key=bankGroup.dataset.bankGroupToggle;
      detailState.expandedGroup=detailState.expandedGroup===key?'':key;
      detailState.bankListAnim='group';
      renderDetail();
    }
    if(e.target.closest('[data-asset-detail-back]'))closeDetail();
  },true);
  document.addEventListener('txn16:changed',()=>{
    cleanedOrphanTransactionRows=false;
    cleanupOrphanTransactionAssetRows();
    normalizeAssets(rawAssetRows);
    renderAssets();
    postPendingCurrentTransactions();
  });
})();

