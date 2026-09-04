(function(){
  let assets=[];
  let detailData={};
  let categoryAssets={};
  let rawAssetRows=[];
  let cleanedGeneratedCashRows=false;
  let cleanedNonAssetTransactionRows=false;
  let cleanedOrphanTransactionRows=false;
  let repairingBankBalance=false;
  const pendingPostAttempts=new Set();
  const BANK_ASSET_DOC_ID='TS_BANK_220820260000';
  const BANK_EXPECTED_BALANCE=133670533;
  const BANK_BALANCE_REPAIR_KEY='asset52-bank-balance-repair-20260829';
  const colors={cash:'#2563eb',gold:'#f59e0b',goldWedding:'#ec4899',gold98:'#d97706',stock:'#10b981',saving:'#8b5cf6',insurance:'#06b6d4',realestate:'#475569',other:'#06b6d4'};
  const fmt=n=>Number(n||0).toLocaleString('vi-VN')+' đ';
  const fmtProfit=n=>Number(n||0)===0?'0 đ':(Number(n)>0?'+':'')+fmt(n);
  const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

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

  function assetProfitState(state){
    const type=String(state?.type||'').toUpperCase();
    if(type==='GOLD')return goldProfitState(state);
    const currentValue=type==='SAVING'
      ? Math.round(Number(state?.totalCost||0))
      : Math.round(Number(state?.qty||0)*Number(state?.currentPrice||0));
    const totalProfit=type==='SAVING'
      ? Math.round(Number(state?.realizedProfit||0))
      : Math.round(currentValue-Number(state?.totalCost||0)+Number(state?.realizedProfit||0));
    return {currentValue,totalProfit};
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
    const assetType=String(firstValue(tx,['assetType','loai_tai_san','loaiTaiSan'])||'').toUpperCase();
    const rawType=String(firstValue(tx,['type','loai_giao_dich'])||'').toUpperCase();
    const exact=assetRules.find(rule=>plainText(rule.large)===large&&plainText(rule.group)===group&&plainText(rule.child)===child);
    if(exact)return exact;
    if(group.includes('vang')&&child.includes('ban'))return assetRules.find(rule=>rule.assetType==='GOLD'&&rule.action==='SELL')||null;
    if(group.includes('vang')&&child.includes('mua'))return assetRules.find(rule=>rule.assetType==='GOLD'&&rule.action==='BUY')||null;
    if(assetType==='LAND'||group.includes('bat dong san')||group.includes('bds')||child.includes('bat dong san')){
      if(rawType==='DIVEST'||rawType==='SELL'||large.includes('thu hoi')||child.includes('ban')||child.includes('thu hoi'))return assetRules.find(rule=>rule.assetType==='LAND'&&rule.action==='SELL')||null;
      if(rawType==='INVEST'||rawType==='BUY'||large.includes('dau tu')||child.includes('mua'))return assetRules.find(rule=>rule.assetType==='LAND'&&rule.action==='BUY')||null;
    }
    if(assetType==='INSURANCE'||group.includes('bao hiem')||child.includes('bao hiem')||child.includes('hop dong')){
      if(rawType==='DIVEST'||rawType==='SELL'||large.includes('thu hoi')||child.includes('rut')||child.includes('thu hoi'))return assetRules.find(rule=>rule.assetType==='INSURANCE'&&rule.action==='SELL')||null;
      if(rawType==='INVEST'||rawType==='BUY'||large.includes('dau tu')||child.includes('dong')||child.includes('mua'))return assetRules.find(rule=>rule.assetType==='INSURANCE'&&rule.action==='BUY')||null;
    }
    if(group.includes('tiet kiem')||child.includes('tiet kiem')){
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
    if(rule.assetType==='INSURANCE')return entered||String(firstValue(tx,['note','ghi_chu','ghiChu','group','nhom_danh_muc'])||rule.group).trim();
    if(rule.assetType==='STOCK')return entered||String(firstValue(tx,['child','hang_muc_con','group','nhom_danh_muc'])||rule.group).trim();
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
      .map(row=>normalizeDetail(row,key))
      .filter(row=>String(type||'').toUpperCase()!=='STOCK'||plainText(stockName(row))===plainText(name));
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
    if(rule.assetType==='LAND'){
      const storedPrice=parseNumber(firstValue(tx,['assetPrice','don_gia','donGia','price','gia_hien_tai']));
      const p=amount||storedPrice||Math.round(amount||0);
      return {qty:1,unit:'tài sản',unitPrice:p,fee,interestRate,settlementCost,displayQty:qty,displayUnit:unit,displayUnitPrice:Math.round((amount||storedPrice||0)/Math.max(qty,1))};
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
    if(rule.assetType==='INSURANCE')return stableAssetDocId(rule.assetType,name,tx);
    if(rule.assetType==='LAND'){
      const holdingId=String(firstValue(tx,['assetHoldingId','tai_san_thu_hoi_id','landHoldingId'])||detail?.tai_san_thu_hoi_id||detail?.assetHoldingId||'').trim();
      if(holdingId){
        const buyTx=typeof window.TXN_getTransactions==='function'
          ? (window.TXN_getTransactions()||[]).find(item=>String(item.id||item.external_id||'')===holdingId)
          : null;
        const buyName=buyTx?transactionAssetName(buyTx):name;
        const matched=buyTx?findAssetRowByName(rule.assetType,buyName,buyTx):null;
        if(matched?.id)return String(matched.id);
        return `TS_LAND_${slug(holdingId).toUpperCase().replace(/-/g,'_')}`;
      }
      const id=String(firstValue(tx,['id','_docId','external_id'])||'').trim();
      if(id)return `TS_LAND_${slug(id).toUpperCase().replace(/-/g,'_')}`;
    }
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
          so_luong_hien_thi:input.displayQty||input.qty,
          don_vi_hien_thi:input.displayUnit||input.unit,
          don_gia_hien_thi:input.displayUnitPrice||input.unitPrice,
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
      const insuranceSell=rule.assetType==='INSURANCE';
      const insuranceRemaining=Number(state.totalCost||0);
      const insuranceProceeds=Math.round((amount||Math.round(input.qty*input.unitPrice))-input.fee);
      const sellQty=insuranceSell
        ? (insuranceRemaining&&insuranceProceeds>=insuranceRemaining?state.qty:Math.min(input.qty,state.qty))
        : Math.min(input.qty,state.qty);
      const avgBefore=state.avgCost;
      const selectedCost=rule.assetType==='SAVING'&&Number(input.settlementCost||0)?Number(input.settlementCost||0):0;
      const costSold=insuranceSell?Math.min(insuranceRemaining,insuranceProceeds):Math.round(selectedCost||sellQty*avgBefore);
      const gross=input.qty*input.unitPrice;
      const proceeds=insuranceProceeds||Math.round(gross-input.fee);
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
        so_luong_hien_thi:input.displayQty||sellQty,
        don_vi_hien_thi:input.displayUnit||input.unit,
        don_gia_hien_thi:input.displayUnitPrice||input.unitPrice,
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
    const profitState=assetProfitState(state);
    return {
      loai_tai_san:state.type,
      ten_tai_san:state.name,
      so_luong:state.qty,
      don_vi:state.unit,
      gia_hien_tai:state.currentPrice||0,
      gia_tri_hien_tai:profitState.currentValue,
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

  function isPrimaryBankRow(row){
    return String(row?.id||'')===BANK_ASSET_DOC_ID;
  }

  function isCashAssetRow(row){
    return isCashKey(assetKey(row));
  }

  function bankDisplayRow(rows){
    return (rows||[]).find(isPrimaryBankRow)
      ||(rows||[]).find(row=>!row.source_txn_doc_id&&!row.source_txn_external_id&&isCashAssetRow(row))
      ||null;
  }

  function bankCurrentValue(row){
    return parseNumber(row?.gia_tri_hien_tai??row?.so_tien??row?.value);
  }

  function repairBankBalanceOnce(){
    if(!window.FDB||typeof window.FDB.set!=='function')return;
    if(repairingBankBalance)return;
    const key=BANK_BALANCE_REPAIR_KEY;
    try{
      if(window.localStorage?.getItem(key)==='done')return;
    }catch(_){}
    const row=rawAssetRows.find(isPrimaryBankRow);
    if(!row)return;
    const current=bankCurrentValue(row);
    if(current===BANK_EXPECTED_BALANCE){
      try{window.localStorage?.setItem(key,'done');}catch(_){}
      return;
    }
    repairingBankBalance=true;
    window.FDB.set(FIREBASE_COLLECTIONS.taiSan,BANK_ASSET_DOC_ID,bankPayloadAfter(row,BANK_EXPECTED_BALANCE-current))
      .then(()=>{try{window.localStorage?.setItem(key,'done');}catch(_){}})
      .catch(error=>console.error('Repair bank balance failed',error))
      .finally(()=>{repairingBankBalance=false;});
  }

  function removeStaleTransactionAssets(txnDocId,keepIds,sourceTx){
    return Promise.resolve([]);
  }

  function cleanupGeneratedTransactionCashRows(){
    if(cleanedGeneratedCashRows||!window.FDB)return;
    cleanedGeneratedCashRows=true;
    const rows=rawAssetRows.filter(row=>(row.source_txn_doc_id||row.source_txn_external_id)&&isCashKey(assetKey(row)));
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

  function summaryAssetRows(rows){
    const visible=visibleAssetRows(rows);
    const bank=bankDisplayRow(visible);
    if(!bank)return visible;
    const bankId=String(bank.id||'');
    return visible.filter(row=>!isCashAssetRow(row)||String(row.id||'')===bankId);
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
    if(rawSlug==='insurance'||rawSlug==='bao-hiem'||rawSlug==='bao-hiem-tich-luy'||rawSlug.includes('bao-hiem')){
      return `insurance-${slug(row.ten_tai_san||row.name||row.ten||row.assetName||row.label||row.external_id||row.id||'hop-dong')}`;
    }
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
    const displayQty=Number(row.so_luong_hien_thi??row.displayQty??0);
    const displayUnit=String(row.don_vi_hien_thi??row.displayUnit??'').trim();
    const displayPrice=Number(row.don_gia_hien_thi??row.displayUnitPrice??0);
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
      assetHoldingId:String(row.assetHoldingId||row.tai_san_thu_hoi_id||row.landHoldingId||''),
      tai_san_thu_hoi_id:String(row.tai_san_thu_hoi_id||row.assetHoldingId||row.landHoldingId||''),
      goldTypeId:row.goldTypeId||row.typeId||row.external_id||row.id,
      price:unitPrice,
      qtyRaw:qtyRawNumber,
      unit,
      displayQty,
      displayUnit,
      displayPrice,
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
    if(assetSection({key})==='realestate'&&total<=0)return '0 tài sản';
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
    displayAssetRows(summaryAssetRows(rows)).forEach(row=>{
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
    const rebuiltInsuranceKeys=new Set();
    const rebuiltStockKeys=new Set();
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
      if(state.type==='INSURANCE'&&!rebuiltInsuranceKeys.has(key)){
        rebuiltInsuranceKeys.add(key);
        detailData[key]=[];
        groups[key].aggregateRows=0;
        groups[key].aggregateValue=0;
        groups[key].aggregateCost=0;
        groups[key].aggregateProfit=0;
        groups[key].aggregateRealized=0;
        groups[key].aggregatePurchased=0;
        groups[key].aggregateRecovered=0;
        groups[key].aggregateQty=0;
        groups[key].value=0;
      }
      if(state.type==='STOCK'&&!rebuiltStockKeys.has(key)){
        rebuiltStockKeys.add(key);
        detailData[key]=[];
        groups[key].aggregateRows=0;
        groups[key].aggregateValue=0;
        groups[key].aggregateCost=0;
        groups[key].aggregateProfit=0;
        groups[key].aggregateRealized=0;
        groups[key].aggregatePurchased=0;
        groups[key].aggregateRecovered=0;
        groups[key].aggregateQty=0;
        groups[key].value=0;
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
      if(!isGoldKey(key)&&state.type!=='SAVING'){
        const profitState=assetProfitState(state);
        const append=state.type==='INSURANCE'||state.type==='STOCK';
        const settledInsurance=state.type==='INSURANCE'&&isInsuranceContractSettled(state.name);
        const currentValue=state.type==='INSURANCE'
          ? (settledInsurance?0:Math.max(0,Math.round(Number(state.totalCost||0))))
          : profitState.currentValue;
        const activeQty=settledInsurance?0:Number(state.qty||0);
        groups[key].aggregateRows=append?Number(groups[key].aggregateRows||0)+state.transactions.length:state.transactions.length;
        groups[key].aggregateValue=append?Number(groups[key].aggregateValue||0)+currentValue:currentValue;
        groups[key].aggregateCost=append?Number(groups[key].aggregateCost||0)+Math.round(Number(state.totalCost||0)):Math.round(Number(state.totalCost||0));
        groups[key].aggregateProfit=append?Number(groups[key].aggregateProfit||0)+profitState.totalProfit:profitState.totalProfit;
        groups[key].aggregateRealized=append?Number(groups[key].aggregateRealized||0)+Math.round(Number(state.realizedProfit||0)):Math.round(Number(state.realizedProfit||0));
        groups[key].aggregatePurchased=append?Number(groups[key].aggregatePurchased||0)+Math.round(Number(state.purchasedTotal||0)):Math.round(Number(state.purchasedTotal||0));
        groups[key].aggregateRecovered=append?Number(groups[key].aggregateRecovered||0)+Math.round(Number(state.recoveredTotal||0)):Math.round(Number(state.recoveredTotal||0));
        groups[key].aggregateCurrentPrice=Number(state.currentPrice||0);
        groups[key].aggregateQty=append?Number(groups[key].aggregateQty||0)+activeQty:activeQty;
        groups[key].aggregateQtyText=formatAssetQty([{qtyRaw:state.type==='STOCK'?groups[key].aggregateQty:activeQty,unit:state.unit}],key);
        groups[key].value=append?Number(groups[key].value||0)+currentValue:currentValue;
      }
      const transactionRows=state.transactions.map(item=>{
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
          so_luong_hien_thi:detail.so_luong_hien_thi,
          don_vi_hien_thi:detail.don_vi_hien_thi,
          don_gia_hien_thi:detail.don_gia_hien_thi,
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
          assetHoldingId:firstValue(tx,['assetHoldingId','tai_san_thu_hoi_id','landHoldingId']),
          tai_san_thu_hoi_id:firstValue(tx,['tai_san_thu_hoi_id','assetHoldingId','landHoldingId']),
          lai_lo_da_thuc_hien:detail.lai_lo_thuc_hien||0,
          giao_dich_action:detail.giao_dich_action,
          ghi_chu:firstValue(tx,['note','ghi_chu','ghiChu'])
        },key);
      });
      detailData[key]=state.type==='INSURANCE'||state.type==='STOCK'
        ? (detailData[key]||[]).concat(transactionRows)
        : transactionRows;
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
    if(key.includes('gold')||key.includes('vang'))return 'gold';
    if(type==='cash')return 'wallet';
    if(type==='stock')return 'chart';
    if(type==='saving')return 'saving';
    if(type==='insurance')return 'insurance';
    if(type==='realestate')return 'realestate';
    return 'wallet';
  }

  function iconSvg(kind){
    if(kind==='wallet'||kind==='cash') return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H18a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6.5A2.5 2.5 0 0 1 4 17.5Z"/><path d="M4 8h15.5"/><path d="M15 13.5h5v4h-5a2 2 0 0 1 0-4Z"/><path d="M17 15.5h.01"/></svg>';
    if(kind==='bank') return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M4 10h16"/><path d="M5 20h14"/><path d="M6 10v8"/><path d="M10 10v8"/><path d="M14 10v8"/><path d="M18 10v8"/><path d="M3.5 8 12 4l8.5 4"/></svg>';
    if(kind==='gold') return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M8.5 7.5h7l2 5h-11Z"/><path d="M4.5 13h7l2 5h-11Z"/><path d="M12.5 13h7l2 5h-11Z"/></svg>';
    if(kind==='saving') return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M6 9.5A5.5 5.5 0 0 1 11.5 4H18a2 2 0 0 1 2 2v13a1 1 0 0 1-1 1H7a3 3 0 0 1-3-3V9.5a2.5 2.5 0 0 1 2.5-2.5H18"/><path d="M9 9h6"/><path d="M9 13h4"/><path d="M16 17h.01"/></svg>';
    if(kind==='insurance'||kind==='shield') return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 3 19 6.5v5.2c0 4.2-2.7 7.5-7 9.3-4.3-1.8-7-5.1-7-9.3V6.5Z"/><path d="m9 12 2 2 4-5"/></svg>';
    if(kind==='realestate'||kind==='home') return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M4 11.5 12 5l8 6.5"/><path d="M6.5 10.5V20h11v-9.5"/><path d="M9.5 20v-5h5v5"/><path d="M16.5 7.5V5h2v4"/></svg>';
    if(kind==='stock'||kind==='chart'||kind==='trend') return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M4 19V5"/><path d="M4 19h16"/><path d="M8 16v-5"/><path d="M12 16V8"/><path d="M16 16v-3"/><path d="m7 9 4-4 3 3 5-5"/></svg>';
    if(kind==='check') return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="m6 12 4 4 8-9"/></svg>';
    if(kind==='list') return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/></svg>';
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
    const realestateStates=cls==='realestate'&&typeof window.TXN_getTransactions==='function'
      ? rebuildAssetState(window.TXN_getTransactions()).filter(state=>state.type==='LAND')
      : null;
    const rows=realestateStates
      ? realestateStates
        .flatMap(state=>state.transactions.map(item=>{
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
            so_luong_hien_thi:detail.so_luong_hien_thi,
            don_vi_hien_thi:detail.don_vi_hien_thi,
            don_gia_hien_thi:detail.don_gia_hien_thi,
            gia_von_binh_quan:detail.gia_von_binh_quan_luc_ban||detail.gia_von_binh_quan_sau_giao_dich,
            tong_gia_von:totalCost,
            gia_tri_hien_tai:totalCost,
            so_tien:proceeds,
            source_txn_doc_id:detail.source_txn_doc_id||firstValue(tx,['id','_docId']),
            source_txn_external_id:detail.source_txn_external_id||firstValue(tx,['external_id','id']),
            assetHoldingId:firstValue(tx,['assetHoldingId','tai_san_thu_hoi_id','landHoldingId']),
            tai_san_thu_hoi_id:firstValue(tx,['tai_san_thu_hoi_id','assetHoldingId','landHoldingId']),
            lai_lo_da_thuc_hien:detail.lai_lo_thuc_hien||0,
            giao_dich_action:detail.giao_dich_action,
            ghi_chu:firstValue(tx,['note','ghi_chu','ghiChu'])
          },state.id);
        }).map(row=>({...row,assetName:state.name,categoryKey:key})))
      : items.flatMap(asset=>(detailData[asset.key]||[]).map(row=>({...row,assetName:cls==='stock'?stockName(row):asset.name,categoryKey:key})));
    const activeStocks=cls==='stock'?stockHoldingGroups(rows).filter(stock=>Number(stock.qty||0)>0):null;
    const total=realestateStates?realestateStates.reduce((sum,state)=>sum+assetProfitState(state).currentValue,0):(activeStocks?activeStocks.reduce((sum,stock)=>sum+Number(stock.currentValue||0),0):items.reduce((sum,x)=>sum+Number(x.value||0),0));
    const cost=realestateStates?realestateStates.reduce((sum,state)=>sum+Number(state.totalCost||0),0):(activeStocks?activeStocks.reduce((sum,stock)=>sum+Number(stock.cost||0),0):items.reduce((sum,x)=>sum+Number(x.aggregateCost||0),0));
    const profit=realestateStates?realestateStates.reduce((sum,state)=>sum+assetProfitState(state).totalProfit,0):(activeStocks?activeStocks.reduce((sum,stock)=>sum+Number(stock.totalProfit||0),0):items.reduce((sum,x)=>sum+Number(x.aggregateProfit||0),0));
    const realized=realestateStates?realestateStates.reduce((sum,state)=>sum+Number(state.realizedProfit||0),0):(activeStocks?activeStocks.reduce((sum,stock)=>sum+Number(stock.realized||0),0):items.reduce((sum,x)=>sum+Number(x.aggregateRealized||0),0));
    const saving=cls==='saving';
    const activeInsuranceCount=cls==='insurance'?items.filter(item=>!isInsuranceContractSettled(item.name)).length:0;
    const qty=activeStocks?activeStocks.length:(realestateStates?realestateStates.reduce((sum,state)=>sum+Number(state.qty||0),0):(saving?Math.max(0,rows.reduce((sum,row)=>sum+Number(row.qtyRaw||0),0)):items.reduce((sum,x)=>sum+Number(x.aggregateQty||0),0)));
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
      qtyText:saving?`${qty.toLocaleString('vi-VN')} Sổ tiết kiệm`:(cls==='realestate'?`${qty.toLocaleString('vi-VN')} tài sản`:(cls==='insurance'?`${activeInsuranceCount} hợp đồng`:(cls==='stock'?`${qty.toLocaleString('vi-VN')} mã chứng khoán`:(items.length?`${items.length} tài sản`:'-')))),
      isCategory:true
    };
    categoryAssets[key]=asset;
    return asset;
  }

  function categoryCard({label,cls,icon,items}){
    const count=items.length;
    const key=count?categoryDetailKey(cls):'';
    const detail=count?buildCategoryDetail(label,cls,items):null;
    const total=(cls==='realestate'||cls==='stock')&&detail?Number(detail.value||0):items.reduce((sum,x)=>sum+Number(x.value||0),0);
    const subText=cls==='saving'
      ? (detail?.qtyText||'Chưa có tài sản')
      : cls==='realestate'
        ? (detail?.qtyText||'0 tài sản')
        : cls==='insurance'
          ? (detail?.qtyText||`${count} hợp đồng`)
          : cls==='stock'
            ? (detail?.qtyText||'0 mã chứng khoán')
            : (count?`${count} tài sản`:'Chưa có tài sản');
    return `<button class="asset52-card ${cls} ${key?'':'is-static'}" type="button" ${key?`data-asset-key="${key}"`:''}>
      <span class="asset52-icon">${iconSvg(icon)}</span>
      <span class="asset52-info"><span class="asset52-name">${label}</span><span class="asset52-sub">${subText}</span></span>
      <span class="asset52-value">${fmt(total)}</span>
      ${key?'<svg class="asset52-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="m9 18 6-6-6-6"/></svg>':'<span class="asset52-static-spacer"></span>'}
    </button>`;
  }

  function categorySectionHtml(title,categories){
    const total=categories.reduce((sum,category)=>{
      if(category.cls==='stock'&&category.items.length){
        const detail=buildCategoryDetail(category.label,category.cls,category.items);
        return sum+Number(detail?.value||0);
      }
      return sum+category.items.reduce((part,item)=>part+Number(item.value||0),0);
    },0);
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
      ? `<div class="asset52-list" id="asset52List">${summaryHtml()}${sectionHtml('Tiền & ngân hàng',groups.cash)}${sectionHtml('Vàng',groups.gold)}${categorySectionHtml('Tài sản đầu tư',[{label:'Bảo hiểm tích lũy',cls:'insurance',icon:'insurance',items:groups.insurance},{label:'Bất động sản',cls:'realestate',icon:'realestate',items:groups.realestate},{label:'Chứng khoán',cls:'stock',icon:'stock',items:groups.stock}])}${categorySectionHtml('Tiết kiệm',[{label:'Tiết kiệm',cls:'saving',icon:'saving',items:groups.saving}])}${groups.other.length?sectionHtml('Tài sản khác',groups.other):''}</div>`
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

  let detailState={key:'',tab:'overview',year:new Date().getFullYear(),flow:'buy',cashTab:'income',stockSearch:'',stockOverviewFilter:'all',stockMovementView:'chart',stockTradeFilter:'all',stockTradeSearch:''};

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

  function insuranceAmount(row){
    if(isSellMovement(row))return Math.abs(Number(row.proceeds||row.so_tien||row.soTien||row.current||row.totalCost||row.cost||0));
    return Math.abs(Number(row.totalCost||row.cost||row.current||row.proceeds||0));
  }

  function insuranceAssetRowForName(name){
    const wanted=plainText(name);
    if(!wanted)return null;
    const targetId=stableAssetDocId('INSURANCE',name);
    return rawAssetRows.find(row=>String(row.id||row._docId||'')===targetId)
      ||rawAssetRows.find(row=>{
        const type=String(row.loai_tai_san||row.loaiTaiSan||row.assetType||row.type||'').toUpperCase();
        const rowName=plainText(row.ten_tai_san||row.name||row.ten||row.assetName);
        return type==='INSURANCE'&&rowName===wanted;
      })
      ||null;
  }

  function isInsuranceContractSettled(name){
    const row=insuranceAssetRowForName(name);
    if(!row)return false;
    const status=String(row.trang_thai_bao_hiem||row.insuranceStatus||'').toUpperCase();
    return row.bao_hiem_da_tat_toan===true||row.insuranceSettled===true||row.settled===true||status==='SETTLED';
  }

  function insuranceSettledDate(name){
    const row=insuranceAssetRowForName(name);
    if(!row)return '';
    return String(row.ngay_tat_toan_bao_hiem||row.insuranceSettledAt||row.settledAt||'');
  }

  function insuranceContractGroups(rows){
    const groups=new Map();
    (rows||[]).forEach(row=>{
      const name=String(row.assetName||row.name||'Hợp đồng bảo hiểm').trim()||'Hợp đồng bảo hiểm';
      const nameKey=plainText(name);
      const id=String(row.assetHoldingId||row.tai_san_thu_hoi_id||row.sourceTxnDocId||row.sourceTxnExternalId||row.id||'').trim();
      const rowDate=String(row.sortDate||row.date||'');
      const item=groups.get(nameKey)||{name,id:'',total:0,recovered:0,latest:'',startDate:'',endDate:''};
      if(!item.id&&id&&!isSellMovement(row))item.id=id;
      if(isSellMovement(row)){
        item.recovered+=insuranceAmount(row);
        item.endDate=String(item.endDate||'')>rowDate?item.endDate:rowDate;
      }else{
        item.total+=insuranceAmount(row);
        item.startDate=!item.startDate||rowDate<String(item.startDate)?rowDate:item.startDate;
      }
      item.latest=String(item.latest||'')>rowDate?item.latest:rowDate;
      groups.set(nameKey,item);
    });
    return Array.from(groups.values())
      .filter(item=>Number(item.total||0)>0)
      .map(item=>{
        const remaining=Math.max(0,Number(item.total||0)-Number(item.recovered||0));
        const settled=isInsuranceContractSettled(item.name);
        return {...item,remaining,settled,endDate:settled?(item.endDate||insuranceSettledDate(item.name)):''};
      })
      .sort((a,b)=>String(b.latest||'').localeCompare(String(a.latest||'')));
  }

  function insuranceDateSlash(value){
    const raw=String(value||'').trim();
    const iso=raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if(iso)return `${iso[3]}/${iso[2]}/${iso[1]}`;
    const local=raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
    if(local)return `${String(local[1]).padStart(2,'0')}/${String(local[2]).padStart(2,'0')}/${local[3]}`;
    return raw;
  }

  function insuranceDateRangeText(item){
    const start=insuranceDateSlash(item.startDate);
    if(!start)return '';
    const end=item.settled?insuranceDateSlash(item.endDate):'';
    return end?`${start} ~ ${end}`:`Ngày bắt đầu: ${start}`;
  }

  function insuranceContractCardHtml(item,options={}){
    const header=options.header===true;
    const encoded=encodeURIComponent(item.name);
    const profitLoss=Number(item.recovered||0)-Number(item.total||0);
    const finalLabel=item.settled?'Lãi/Lỗ':'Số tiền còn lại';
    const finalClass=item.settled
      ? (profitLoss>=0?'profit':'loss')
      : (item.settled?'settled-amount':'');
    const finalValue=item.settled
      ? `${profitLoss>=0?'+':'-'}${fmt(Math.abs(profitLoss))}`
      : fmt(item.remaining);
    const dateText=insuranceDateRangeText(item);
    return `<div class="asset53-detail-row asset53-insurance-contract-row ${item.settled?'settled':''} ${header?'asset53-insurance-header-card':''}">
      <div class="asset53-insurance-contract-name">
        <span>${item.name}</span>
        <span class="asset53-insurance-contract-dates">${dateText}${item.settled?`<i class="asset53-insurance-settled" title="Đã tất toán" aria-label="Đã tất toán">${iconSvg('check')}</i>`:''}</span>
      </div>
      <small>Tổng phí đã đóng</small>
      <b>${fmt(item.total)}</b>
      <small>Tổng số tiền đã thu hồi</small>
      <b class="recovered">${fmt(item.recovered)}</b>
      <small>${finalLabel}</small>
      <b class="${finalClass}">${finalValue}</b>
    </div>`;
  }

  function insuranceContractTransactions(rows,name,kind='buy'){
    const wanted=plainText(name);
    const sell=kind==='sell';
    return (rows||[])
      .filter(row=>isSellMovement(row)===sell&&plainText(row.assetName||row.name||'Hợp đồng bảo hiểm')===wanted)
      .sort((a,b)=>String(b.sortDate||b.date||'').localeCompare(String(a.sortDate||a.date||'')));
  }

  function insuranceContractDetailHtml(rows){
    const contracts=insuranceContractGroups(rows);
    const contract=contracts.find(item=>plainText(item.name)===plainText(detailState.insuranceContractDetail))||contracts[0];
    if(!contract)return '<div class="asset53-empty">Chưa có hợp đồng bảo hiểm.</div>';
    const detailMode=detailState.insuranceContractFlow==='sell'?'sell':'buy';
    const isRecovery=detailMode==='sell';
    const transactionRows=insuranceContractTransactions(rows,contract.name,detailMode);
    return `<div class="asset53-overview asset53-insurance-detail-view">
      <div class="asset53-insurance-detail-header">
        <div class="asset53-detail-card">${insuranceContractCardHtml(contract,{header:true})}</div>
      </div>
      <div class="asset53-insurance-detail-toolbar">
        <button type="button" data-asset-insurance-detail-back aria-label="Danh sách bảo hiểm"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M15 18 9 12l6-6"/></svg><span>Danh sách bảo hiểm</span></button>
        <button class="asset53-insurance-detail-toggle ${isRecovery?'is-recovery':'is-invest'}" type="button" data-asset-insurance-detail-flow="${isRecovery?'buy':'sell'}" aria-label="${isRecovery?'Giao dịch đầu tư':'Giao dịch thu hồi'}">${isRecovery?iconSvg('trend'):'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="m3 7 4-4 4 4"/><path d="M7 3v12a4 4 0 0 0 4 4h10"/></svg>'}<span>${isRecovery?'Giao dịch đầu tư':'Giao dịch thu hồi'}</span></button>
      </div>
      <div class="asset53-insurance-detail-list">
        ${transactionRows.length
          ? `<div class="asset53-detail-card gold-buy-list saving-book-list insurance-flow-list">${transactionRows.map(row=>detailRow(row,isRecovery?'#ef4444':'#16a34a',detailState.key)).join('')}</div>`
          : `<div class="asset53-empty">Chưa có giao dịch ${isRecovery?'thu hồi':'đóng bảo hiểm'}.</div>`}
      </div>
    </div>`;
  }

  function insuranceOverviewHtml(rows){
    if(detailState.insuranceContractDetail)return insuranceContractDetailHtml(rows);
    const contracts=insuranceContractGroups(rows);
    const list=contracts.length
      ? `<div class="asset53-insurance-contract-list">${contracts.map(item=>{
        const encoded=encodeURIComponent(item.name);
        const action=item.settled
          ? `<button class="asset53-insurance-swipe-btn redo" type="button" data-asset-insurance-unsettle="${encoded}" title="Hủy tất toán" aria-label="Hủy tất toán"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 7v6h6"/><path d="M21 17a8 8 0 0 0-13.6-5.7L3 15"/></svg></button>`
          : `<button class="asset53-insurance-swipe-btn settle" type="button" data-asset-insurance-settle="${encoded}" title="Tất toán" aria-label="Tất toán">${iconSvg('check')}</button>`;
        return `<div class="asset53-insurance-contract-item">
          <div class="asset53-insurance-swipe">
            <div class="asset53-insurance-swipe-track">
              ${insuranceContractCardHtml(item)}
              <div class="asset53-insurance-swipe-action">
                <button class="asset53-insurance-swipe-btn detail" type="button" data-asset-insurance-detail="${encoded}" title="Xem giao dịch đóng bảo hiểm" aria-label="Xem giao dịch đóng bảo hiểm">${iconSvg('list')}</button>
                ${action}
              </div>
            </div>
          </div>
        </div>`;
      }).join('')}</div>`
      : '<div class="asset53-empty">Chưa có hợp đồng bảo hiểm.</div>';
    return `<div class="asset53-overview">
      ${list}
    </div>`;
  }

  function stockName(row){
    return String(row.assetName||row.name||row.ten_tai_san||row.groupName||row.movementName||'Chứng khoán').trim()||'Chứng khoán';
  }

  function stockHoldingGroups(rows){
    const grouped=new Map();
    (rows||[]).forEach(row=>{
      const name=stockName(row);
      const key=plainText(name);
      (grouped.get(key)||grouped.set(key,{name,rows:[]}).get(key)).rows.push(row);
    });
    return Array.from(grouped.values()).map(group=>{
      const costed=applyCostBasis(group.rows,'stock');
      const sorted=costed.slice().sort((a,b)=>String(a.sortDate||a.date||'').localeCompare(String(b.sortDate||b.date||'')));
      const buys=sorted.filter(row=>!isSellMovement(row));
      const sells=sorted.filter(row=>isSellMovement(row));
      const qty=Math.max(0,sorted.reduce((sum,row)=>sum+Number(row.qtyRaw||0),0));
      const cost=Math.max(0,sorted.reduce((sum,row)=>sum+Number(row.totalCost||0),0));
      const purchased=buys.reduce((sum,row)=>sum+Math.abs(Number(row.totalCost||row.cost||row.current||0)),0);
      const recovered=sells.reduce((sum,row)=>sum+Math.abs(Number(row.proceeds||0)),0);
      const realized=sells.reduce((sum,row)=>sum+Number(row.realizedProfit||0),0);
      const avgCost=qty?Math.round(cost/Math.max(qty,1)):0;
      const priceRows=sorted.filter(row=>Number(row.price||0));
      const currentPrice=Number(priceRows[priceRows.length-1]?.price||0)||avgCost;
      const currentValue=Math.round(qty*currentPrice);
      const totalProfit=Math.round(currentValue+recovered-purchased);
      const firstBuy=buys[0]?.sortDate||buys[0]?.date||'';
      const latest=sorted[sorted.length-1]?.sortDate||sorted[sorted.length-1]?.date||'';
      const unit=String(sorted.find(row=>row.unit)?.unit||'đơn vị').trim()||'đơn vị';
      return {...group,rows:costed,qty,cost,purchased,recovered,realized,avgCost,currentPrice,currentValue,totalProfit,startDate:firstBuy,latest,unit,closed:qty<=0};
    }).sort((a,b)=>{
      if(a.closed!==b.closed)return a.closed?1:-1;
      return String(b.latest||'').localeCompare(String(a.latest||''));
    });
  }

  function stockHoldingCardHtml(item,options={}){
    const header=options.header===true;
    const finalClass=item.totalProfit<0?'loss':(item.totalProfit>0?'profit':'');
    const closedIcon=item.closed?`<i class="asset53-stock-sold-tick" title="Đã bán hết" aria-label="Đã bán hết">${iconSvg('check')}</i>`:'';
    return `<div class="asset53-detail-row asset53-stock-holding-row ${item.closed?'settled':''} ${header?'asset53-insurance-header-card':''}">
      <div class="asset53-stock-name"><span>${item.name}</span>${closedIcon}</div>
      <div class="asset53-stock-metrics">
        <small>Số lượng còn lại</small>
        <b>${Number(item.qty||0).toLocaleString('vi-VN')}</b>
        <small>Giá vốn còn lại</small>
        <b>${fmt(item.cost)}</b>
        <small>Tổng lãi/lỗ</small>
        <b class="${finalClass}">${fmtProfit(item.totalProfit)}</b>
        <small>Giá vốn bình quân</small>
        <b>${fmt(item.avgCost)}</b>
      </div>
    </div>`;
  }

  function stockHoldingTransactions(rows,name,kind='buy'){
    const wanted=plainText(name);
    const sell=kind==='sell';
    const group=(rows||[]).filter(row=>plainText(stockName(row))===wanted);
    return applyCostBasis(group,'stock')
      .filter(row=>isSellMovement(row)===sell)
      .sort((a,b)=>String(b.sortDate||b.date||'').localeCompare(String(a.sortDate||a.date||'')));
  }

  function stockHoldingDetailHtml(rows){
    const stocks=stockHoldingGroups(rows);
    const stock=stocks.find(item=>plainText(item.name)===plainText(detailState.stockDetail))||stocks[0];
    if(!stock)return '<div class="asset53-empty">Chưa có chứng khoán.</div>';
    const detailMode=detailState.stockDetailFlow==='sell'?'sell':'buy';
    const isSell=detailMode==='sell';
    const transactionRows=stockHoldingTransactions(rows,stock.name,detailMode);
    return `<div class="asset53-overview asset53-insurance-detail-view asset53-stock-detail-view">
      <div class="asset53-insurance-detail-header">
        <div class="asset53-detail-card">${stockHoldingCardHtml(stock,{header:true})}</div>
      </div>
      <div class="asset53-insurance-detail-toolbar asset53-stock-detail-toolbar">
        <button type="button" data-asset-stock-detail-back aria-label="Danh sách chứng khoán"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M15 18 9 12l6-6"/></svg><span>Danh sách chứng khoán</span></button>
        <button class="asset53-insurance-detail-toggle ${isSell?'is-recovery':'is-invest'}" type="button" data-asset-stock-detail-flow="${isSell?'buy':'sell'}" aria-label="${isSell?'Giao dịch mua':'Giao dịch bán'}">${isSell?iconSvg('chart'):'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="m3 7 4-4 4 4"/><path d="M7 3v12a4 4 0 0 0 4 4h10"/></svg>'}<span>${isSell?'Giao dịch mua':'Giao dịch bán'}</span></button>
      </div>
      <div class="asset53-insurance-detail-list">
        ${transactionRows.length
          ? `<div class="asset53-detail-card gold-buy-list saving-book-list stock-flow-list">${transactionRows.map(row=>detailRow(row,isSellMovement(row)?'#ef4444':'#16a34a',detailState.key)).join('')}</div>`
          : `<div class="asset53-empty">Chưa có giao dịch ${isSell?'bán':'mua'} chứng khoán.</div>`}
      </div>
    </div>`;
  }

  function stockOverviewHtml(rows){
    if(detailState.stockDetail)return stockHoldingDetailHtml(rows);
    const query=String(detailState.stockSearch||'').trim();
    const normalizedQuery=plainText(query);
    const filter=detailState.stockOverviewFilter==='holding'||detailState.stockOverviewFilter==='sold'?detailState.stockOverviewFilter:'all';
    const labels={all:'Hiển thị tất cả',holding:'Đang nắm giữ',sold:'Đã bán hết'};
    const stocks=stockHoldingGroups(rows);
    const visibleStocks=stocks.filter(item=>{
      if(filter==='holding'&&item.closed)return false;
      if(filter==='sold'&&!item.closed)return false;
      return !normalizedQuery||plainText(item.name).includes(normalizedQuery);
    });
    const search=`<div class="asset53-stock-search">
      <button type="button" class="asset53-stock-filter-btn" data-asset-stock-overview-filter-sheet><span>${labels[filter]}</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="m6 9 6 6 6-6"/></svg></button>
      <input type="search" data-asset-stock-search placeholder="Tìm mã chứng khoán" value="${escapeHtml(query)}" autocomplete="off" />
    </div>`;
    const list=visibleStocks.length
      ? `<div class="asset53-insurance-contract-list asset53-stock-holding-list">${visibleStocks.map(item=>{
        const encoded=encodeURIComponent(item.name);
        return `<div class="asset53-insurance-contract-item asset53-stock-holding-item">
          <div class="asset53-insurance-swipe asset53-stock-swipe">
            <div class="asset53-insurance-swipe-track asset53-stock-swipe-track">
              ${stockHoldingCardHtml(item)}
              <div class="asset53-insurance-swipe-action asset53-stock-swipe-action">
                <button class="asset53-insurance-swipe-btn detail asset53-stock-detail-btn" type="button" data-asset-stock-detail="${encoded}" title="Xem giao dịch chứng khoán" aria-label="Xem giao dịch chứng khoán">${iconSvg('list')}</button>
              </div>
            </div>
          </div>
        </div>`;
      }).join('')}</div>`
      : `<div class="asset53-empty">${stocks.length?'Không tìm thấy mã chứng khoán.':'Chưa có chứng khoán.'}</div>`;
    return `<div class="asset53-overview asset53-stock-overview-wrap">
      ${search}
      <div class="asset53-stock-overview-list">${list}</div>
    </div>`;
  }

  function currentInsuranceContract(name){
    const asset=assets.find(item=>item.key===detailState.key)||{key:detailState.key};
    const rows=detailData[detailState.key]||[];
    if(assetSection(asset)!=='insurance')return null;
    return insuranceContractGroups(rows).find(item=>plainText(item.name)===plainText(name))||null;
  }

  function settleInsuranceContract(name){
    const contract=currentInsuranceContract(name);
    if(!contract||contract.settled||!window.FDB)return;
    const assetId=stableAssetDocId('INSURANCE',contract.name);
    const now=new Date();
    const request=window.FDB.set(FIREBASE_COLLECTIONS.taiSan,assetId,{
      loai_tai_san:'INSURANCE',
      ten_tai_san:contract.name,
      bao_hiem_da_tat_toan:true,
      insuranceSettled:true,
      trang_thai_bao_hiem:'SETTLED',
      ngay_tat_toan_bao_hiem:now.toISOString(),
      phi_da_dong_luc_tat_toan:Math.round(Number(contract.total||0)),
      so_tien_da_thu_hoi_luc_tat_toan:Math.round(Number(contract.recovered||0)),
      so_tien_con_lai_luc_tat_toan:Math.round(Number(contract.remaining||0))
    },{merge:true});
    window.QLCT_setBusy?.(true,'Đang cập nhật tất toán');
    Promise.resolve(request).then(()=>{
      renderDetail();
    }).catch(error=>{
      console.error('Settle insurance failed',error);
      const message=error?.message||'Vui lòng thử lại.';
      if(window.showAppMessage)window.showAppMessage('Không tất toán được bảo hiểm',message);
      else window.alert?.(`Không tất toán được bảo hiểm: ${message}`);
    }).finally(()=>window.QLCT_setBusy?.(false));
  }

  function unsettleInsuranceContract(name){
    const contract=currentInsuranceContract(name);
    if(!contract||!window.FDB)return;
    const assetId=stableAssetDocId('INSURANCE',contract.name);
    const request=window.FDB.set(FIREBASE_COLLECTIONS.taiSan,assetId,{
      loai_tai_san:'INSURANCE',
      ten_tai_san:contract.name,
      bao_hiem_da_tat_toan:false,
      insuranceSettled:false,
      trang_thai_bao_hiem:'ACTIVE'
    },{merge:true});
    window.QLCT_setBusy?.(true,'Đang hủy tất toán');
    Promise.resolve(request).then(()=>renderDetail()).catch(error=>{
      console.error('Unsettle insurance failed',error);
      const message=error?.message||'Vui lòng thử lại.';
      if(window.showAppMessage)window.showAppMessage('Không hủy tất toán được bảo hiểm',message);
      else window.alert?.(`Không hủy tất toán được bảo hiểm: ${message}`);
    }).finally(()=>window.QLCT_setBusy?.(false));
  }

  function closeInsuranceSwipeActions(){
    const open=Array.from(document.querySelectorAll('.asset53-insurance-swipe')).filter(item=>Number(item.scrollLeft||0)>4);
    open.forEach(item=>item.scrollTo({left:0,behavior:'smooth'}));
    return open.length>0;
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
    if(assetSection(asset)==='insurance')return insuranceOverviewHtml(rows);
    if(assetSection(asset)==='stock')return stockOverviewHtml(rows);
    const hasAggregate=Number(asset?.aggregateRows||0)>0;
    const cost=hasAggregate?Number(asset.aggregateCost||0):remainingCost(rows,asset.key);
    const realized=hasAggregate?Number(asset.aggregateRealized||0):rows.reduce((sum,x)=>sum+Number(x.realizedProfit||0),0);
    const saving=assetSection(asset)==='saving';
    const profit=saving?realized:(hasAggregate?Number(asset.aggregateProfit||0):now-cost+realized);
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
    const realestateView=assetSection({key})==='realestate';
    const insuranceView=assetSection({key})==='insurance';
    const amountPrefix=savingView
      ? (sell?'Tất toán':'Số tiền gửi')
      : insuranceView
        ? (sell?'Giá trị rút':'Phí đóng')
        : (sell?'Số tiền bán':'Số tiền mua');
    const amountValue=sell?Number(item.proceeds||0):Math.abs(Number(item.totalCost||item.cost||item.current||0));
    const categoryView=isCategoryKey(key);
    const interestValue=item.interestRate?String(item.interestRate).trim():'-';
    const interestText=interestValue==='-'?'LS -':`LS ${interestValue.includes('%')?interestValue:interestValue+'%'}`;
    const savingId=savingMovementId(item);
    const leftTop=savingView
      ? `${movementDateHyphen(item)} (${interestText})${savingId?` - ${savingId}`:''}`
      : realestateView?movementDateWithRealestateName(item)
      : insuranceView?[movementDateHyphen(item),item.assetName||item.name].filter(Boolean).join(' · ')
      : categoryView?[item.date,item.assetName||item.name].filter(Boolean).join(' · '):(item.date||'');
    const insuranceSettled=insuranceView&&!sell&&isInsuranceContractSettled(item.assetName||item.name);
    const recalled=(savingView&&!sell&&isSavingMovementRecalled(item))||(realestateView&&!sell&&isRealestateMovementRecalled(item))||insuranceSettled;
    const recallTitle=insuranceView?'Hợp đồng đã tất toán':(realestateView?'Bất động sản đã bán':'Sổ tiết kiệm đã tất toán');
    const recallIcon=recalled?`<span class="asset53-saving-recalled" title="${recallTitle}" aria-label="${recallTitle}"></span>`:'';
    const rightBottom=unitPriceText;
    const firstSpan=(savingView||realestateView)?`<span style="width:350px;max-width:none;display:block;overflow:visible;text-overflow:clip;white-space:nowrap">${leftTop}</span>`:`<span>${leftTop}</span>`;
    const noteText=String(item.note||'').trim();
    const assetInfo=cashView?'':insuranceView?`<div class="asset53-flow-grid asset53-insurance-flow-grid ${sell?'sell':'buy'}">
        ${firstSpan}
        <span>${fmt(Math.abs(amountValue))}</span>
        ${noteText?`<span class="asset53-insurance-note">${noteText}</span>`:''}
      </div>`:`<div class="asset53-flow-grid">
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

  function realestateMovementKeys(item){
    return [item?.sourceTxnDocId,item?.sourceTxnExternalId,item?.external_id,item?.id]
      .map(value=>String(value||'').trim())
      .filter(Boolean);
  }

  function recalledRealestateIds(rows){
    const ids=new Set();
    (rows||[]).filter(isSellMovement).forEach(row=>{
      [row?.assetHoldingId,row?.tai_san_thu_hoi_id,row?.landHoldingId,row?.sourceTxnDocId,row?.sourceTxnExternalId]
        .map(value=>String(value||'').trim())
        .filter(Boolean)
        .forEach(id=>ids.add(id));
    });
    return ids;
  }

  function isRealestateMovementRecalled(item){
    const ids=detailState.recalledRealestateIds;
    if(!ids||!ids.size)return false;
    return realestateMovementKeys(item).some(id=>ids.has(id));
  }

  function movementQtyText(item,key){
    const sell=isSellMovement(item);
    const sign=sell?'- ':'+ ';
    if(isGoldKey(key)){
      const qty=Math.abs(Number(item.qtyChi||0));
      return `${sign}${formatGoldQty(qty)}`;
    }
    if(assetSection({key})==='realestate'){
      const qty=Math.abs(Number(item.displayQty||0))||Math.abs(Number(item.qtyRaw||0));
      const unit=String(item.displayUnit||item.unit||'').trim();
      if(qty)return `${sign}${qty.toLocaleString('vi-VN')}${unit?' '+unit:''}`;
    }
    const qty=Math.abs(Number(item.qtyRaw||0));
    const unit=assetSection({key})==='saving'?'Sổ':String(item.unit||'').trim();
    if(qty)return `${sign}${qty.toLocaleString('vi-VN')}${unit?' '+unit:''}`;
    return `${sign}${String(item.qty||'').replace(/^-/, '').trim()||'-'}`;
  }

  function convertedUnitPriceText(item,key){
    if(assetSection({key})==='realestate'){
      const unit=String(item.displayUnit||item.unit||'đơn vị').trim().toLowerCase();
      const price=Number(item.displayPrice||0)||Number(item.price||0)||Number(item.avgCost||0);
      return price?`${fmt(Math.abs(price))} / ${unit}`:'-';
    }
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
    if(iso)return `${iso[3]}/${iso[2]}/${iso[1]}`;
    const local=raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if(local)return `${String(local[1]).padStart(2,'0')}/${String(local[2]).padStart(2,'0')}/${local[3]}`;
    return raw;
  }

  function movementDateWithRealestateName(item){
    const name=String(item?.assetName||item?.name||'').trim();
    return [movementDateHyphen(item),name].filter(Boolean).join(' · ');
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

  function realestateFlowChartHtml(rows,year,mode){
    const isSell=mode==='sell';
    const monthly=Array.from({length:12},()=>0);
    (rows||[]).forEach(row=>{
      const month=Math.max(1,Math.min(12,movementMonth(row)));
      const value=isSell?Number(row.proceeds||0):Math.abs(Number(row.totalCost||row.cost||row.current||0));
      monthly[month-1]+=Math.abs(value);
    });
    const width=380,height=132,pad=20;
    const chart=chartGeometry(monthly,width,height,pad,moneyShort);
    const total=monthly.reduce((sum,value)=>sum+value,0);
    return `<div class="asset53-movement-chart saving-flow-chart ${isSell?'sell':'buy'}">
      <div class="asset53-chart-meta"><span>${isSell?'Tổng bán':'Tổng mua'} ${year}</span><b>${moneyShort(total)}</b><button type="button" data-asset-flow="${isSell?'buy':'sell'}" aria-label="${isSell?'Xem mua bất động sản':'Xem bán bất động sản'}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="${isSell?'m15 18-6-6 6-6':'m9 18 6-6-6-6'}"/></svg></button></div>
      <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Biểu đồ ${isSell?'bán':'mua'} bất động sản năm ${year}">
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

  function stockQtyLabel(value){
    return Math.max(0,Number(value||0)).toLocaleString('vi-VN');
  }

  function stockYearProfitHtml(rows,year){
    const cutoff=Number(year||new Date().getFullYear());
    const profit=stockHoldingGroups((rows||[]).filter(row=>movementYear(row)<=cutoff)).reduce((sum,item)=>sum+Number(item.totalProfit||0),0);
    return `<div class="asset53-year-ratio ${profit>=0?'positive':'negative'}"><span>Tổng lãi/lỗ: </span><b>${fmtProfit(profit)}</b></div>`;
  }

  function stockFlowChartHtml(rows,year,mode){
    const isSell=mode==='sell';
    const monthly=Array.from({length:12},()=>0);
    (rows||[]).forEach(row=>{
      const month=Math.max(1,Math.min(12,movementMonth(row)));
      const value=isSell?Number(row.proceeds||0):Math.abs(Number(row.totalCost||row.cost||row.current||0));
      monthly[month-1]+=Math.abs(value);
    });
    const width=380,height=132,pad=20;
    const chart=chartGeometry(monthly,width,height,pad,moneyShort);
    const total=monthly.reduce((sum,value)=>sum+value,0);
    return `<div class="asset53-movement-chart saving-flow-chart stock-flow-chart ${isSell?'sell':'buy'}">
      <div class="asset53-chart-meta"><span>${isSell?'Tổng bán':'Tổng mua'} ${year}</span><b>${moneyShort(total)}</b><button type="button" data-asset-flow="${isSell?'buy':'sell'}" aria-label="${isSell?'Xem mua chứng khoán':'Xem bán chứng khoán'}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="${isSell?'m15 18-6-6 6-6':'m9 18 6-6-6-6'}"/></svg></button></div>
      <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Biểu đồ ${isSell?'bán':'mua'} chứng khoán năm ${year}">
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

  function stockYearCloseStats(rows,year){
    const byStock=new Map();
    (rows||[]).forEach(row=>{
      const name=stockName(row);
      const key=plainText(name);
      const current=byStock.get(key)||{name,rows:[],profit:0,count:0};
      current.rows.push(row);
      byStock.set(key,current);
    });
    byStock.forEach(item=>{
      applyCostBasis(item.rows,'stock')
        .filter(row=>isSellMovement(row)&&movementYear(row)===Number(year))
        .forEach(row=>{
          item.profit+=Math.round(Number(row.realizedProfit||0));
          item.count+=1;
        });
    });
    const items=Array.from(byStock.values()).filter(item=>item.count>0);
    const totalGain=items.reduce((sum,item)=>sum+(item.profit>0?item.profit:0),0);
    const totalLoss=items.reduce((sum,item)=>sum+(item.profit<0?Math.abs(item.profit):0),0);
    return {
      totalGain,
      totalLoss,
      topGain:items.filter(item=>item.profit>0).sort((a,b)=>b.profit-a.profit).slice(0,6),
      topLoss:items.filter(item=>item.profit<0).sort((a,b)=>a.profit-b.profit).slice(0,6)
    };
  }

  function stockProfitBarsHtml(items,type){
    const label=type==='gain'?'Top mã chốt lãi':'Top mã chốt lỗ';
    const max=Math.max(...items.map(item=>Math.abs(Number(item.profit||0))),1);
    const rows=items.length
      ? items.map(item=>{
        const pct=Math.max(4,Math.round(Math.abs(Number(item.profit||0))*100/max));
        const scale=(pct/100).toFixed(2);
        return `<div class="asset53-stock-top-row">
          <span>${item.name}</span>
          <div><i style="--bar:${scale}"></i></div>
          <b>${fmtProfit(item.profit)}</b>
        </div>`;
      }).join('')
      : '<div class="asset53-stock-top-empty">Chưa có mã phù hợp</div>';
    return `<div class="asset53-stock-top-card ${type}">
      <div class="asset53-stock-analysis-title">${label}</div>
      ${rows}
    </div>`;
  }

  function stockProfitAnalysisHtml(rows,year){
    const stats=stockYearCloseStats(rows,year);
    const total=stats.totalGain+stats.totalLoss;
    const gainPct=total?Math.round(stats.totalGain*100/total):0;
    const lossPct=total?100-gainPct:0;
    return `<div class="asset53-stock-analysis ${total?'':'is-empty'}">
      <div class="asset53-stock-donut-card">
        <div class="asset53-stock-analysis-title">Tỉ lệ lãi/lỗ đã chốt ${year}</div>
        <div class="asset53-stock-donut-wrap">
          <div class="asset53-stock-donut">
            <svg viewBox="0 0 80 80" aria-hidden="true">
              <circle class="gain-glow" cx="40" cy="40" r="30" pathLength="100" style="--dash:${gainPct};--gap:${lossPct};--offset:0;"></circle>
              <circle class="loss-glow" cx="40" cy="40" r="30" pathLength="100" style="--dash:${lossPct};--gap:${gainPct};--offset:${-gainPct};"></circle>
              <circle class="track" cx="40" cy="40" r="30" pathLength="100"></circle>
              <circle class="gain-ring" cx="40" cy="40" r="30" pathLength="100" style="--dash:${gainPct};--gap:${lossPct};--offset:0;"></circle>
              <circle class="loss-ring" cx="40" cy="40" r="30" pathLength="100" style="--dash:${lossPct};--gap:${gainPct};--offset:${-gainPct};"></circle>
            </svg>
            <span><b>${gainPct}%</b><small>${lossPct}%</small></span>
          </div>
          <div class="asset53-stock-donut-legend">
            <span><i class="gain"></i>Lãi ${gainPct}% <b>${fmt(stats.totalGain)}</b></span>
            <span><i class="loss"></i>Lỗ ${lossPct}% <b>${fmt(stats.totalLoss)}</b></span>
          </div>
        </div>
      </div>
      <div class="asset53-stock-top-grid">
        ${stockProfitBarsHtml(stats.topLoss,'loss')}
        ${stockProfitBarsHtml(stats.topGain,'gain')}
      </div>
    </div>`;
  }

  function stockTradeTableHtml(rows){
    const filter=detailState.stockTradeFilter==='buy'||detailState.stockTradeFilter==='sell'?detailState.stockTradeFilter:'all';
    const query=plainText(detailState.stockTradeSearch||'');
    const costed=applyCostBasis(rows||[],'stock');
    const filtered=costed.filter(row=>{
      if(filter==='buy'&&isSellMovement(row))return false;
      if(filter==='sell'&&!isSellMovement(row))return false;
      return !query||plainText(stockName(row)).includes(query);
    });
    const sorted=filtered
      .sort((a,b)=>String(b.sortDate||b.date||'').localeCompare(String(a.sortDate||a.date||'')));
    const groups=new Map();
    sorted.forEach(row=>{
      const day=movementDateHyphen(row);
      (groups.get(day)||groups.set(day,[]).get(day)).push(row);
    });
    return Array.from(groups.entries()).map(([day,items])=>`<div class="asset53-stock-trade-day">
      <div class="asset53-stock-trade-date">${day}</div>
      <div class="asset53-stock-trade-day-card">
      ${items.map(row=>{
        const sell=isSellMovement(row);
        const cost=Math.abs(Number(row.totalCost||row.cost||row.current||0));
        const sale=sell?Math.abs(Number(row.proceeds||0)):0;
        const profit=sell?Number(row.realizedProfit||0):0;
        return `<div class="asset53-stock-trade-row ${sell?'sell':'buy'}">
          <div class="asset53-stock-trade-code">${stockName(row)}</div>
          <div class="asset53-stock-trade-cell"><b>${sell?'Bán':'Mua'}</b><span>${stockQtyLabel(Math.abs(Number(row.qtyRaw||0)))}</span></div>
          <div class="asset53-stock-trade-cell"><b>${fmt(cost)}</b><span>${sell?fmt(sale):'-'}</span></div>
          <div class="asset53-stock-trade-profit ${profit<0?'loss':(profit>0?'gain':'')}">${sell?fmtProfit(profit):'-'}</div>
        </div>`;
      }).join('')}
      </div>
    </div>`).join('')||'<div class="asset53-empty">Không tìm thấy giao dịch phù hợp.</div>';
  }

  function stockTradeHeaderHtml(){
    return `<div class="asset53-stock-trade-head">
        <div>Mã chứng khoán</div>
        <div><b>Sự kiện</b><span>Số lượng</span></div>
        <div><b>Giá vốn</b><span>Giá bán</span></div>
        <div>Lãi/lỗ</div>
    </div>`;
  }

  function stockMovementToolsHtml(detailMode){
    const filter=detailState.stockTradeFilter==='buy'||detailState.stockTradeFilter==='sell'?detailState.stockTradeFilter:'all';
    const labels={all:'Hiển thị tất cả',buy:'Giao dịch mua',sell:'Giao dịch bán'};
    const search=String(detailState.stockTradeSearch||'');
    return `<div class="asset53-stock-movement-tools ${detailMode?'detail':'chart'}">
      <button type="button" class="asset53-stock-view-toggle" data-asset-stock-view="${detailMode?'chart':'detail'}">
        ${detailMode?iconSvg('chart'):iconSvg('list')}<span>${detailMode?'Biểu đồ':'Chi tiết giao dịch'}</span>
      </button>
      ${detailMode?`<div class="asset53-stock-trade-filters">
        <button type="button" class="asset53-stock-filter-btn" data-asset-stock-trade-filter-sheet><span>${labels[filter]}</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="m6 9 6 6 6-6"/></svg></button>
        <input type="search" data-asset-stock-trade-search placeholder="Tìm mã chứng khoán" value="${escapeHtml(search)}" autocomplete="off" />
      </div>`:''}
    </div>`;
  }

  function ensureAssetStockSheet(){
    const phone=document.getElementById('phone');
    if(!phone)return {};
    if(!document.getElementById('asset53StockBackdrop')){
      phone.insertAdjacentHTML('beforeend','<div class="asset53-stock-backdrop" id="asset53StockBackdrop"></div><div class="asset53-stock-sheet" id="asset53StockSheet"></div>');
    }
    return {sheet:document.getElementById('asset53StockSheet'),backdrop:document.getElementById('asset53StockBackdrop')};
  }

  function closeAssetStockSheet(){
    const sheet=document.getElementById('asset53StockSheet');
    const backdrop=document.getElementById('asset53StockBackdrop');
    sheet?.classList.remove('show');
    backdrop?.classList.remove('show');
  }

  function openStockFilterSheet(kind='trade'){
    const {sheet,backdrop}=ensureAssetStockSheet();
    if(!sheet||!backdrop)return;
    const overview=kind==='overview';
    const current=overview
      ? (detailState.stockOverviewFilter==='holding'||detailState.stockOverviewFilter==='sold'?detailState.stockOverviewFilter:'all')
      : (detailState.stockTradeFilter==='buy'||detailState.stockTradeFilter==='sell'?detailState.stockTradeFilter:'all');
    const options=overview
      ? [{value:'all',label:'Hiển thị tất cả'},{value:'holding',label:'Đang nắm giữ'},{value:'sold',label:'Đã bán hết'}]
      : [{value:'all',label:'Hiển thị tất cả'},{value:'buy',label:'Giao dịch mua'},{value:'sell',label:'Giao dịch bán'}];
    sheet.innerHTML=`<div class="asset53-stock-sheet-handle"></div>
      ${options.map(option=>`<button type="button" class="asset53-stock-sheet-option ${option.value===current?'active':''}" data-asset-stock-filter="${option.value}"><span>${option.label}</span>${option.value===current?iconSvg('check'):''}</button>`).join('')}`;
    sheet.onclick=e=>{
      const option=e.target.closest('[data-asset-stock-filter]');
      if(!option)return;
      const value=option.dataset.assetStockFilter||'all';
      if(overview)detailState.stockOverviewFilter=value==='holding'||value==='sold'?value:'all';
      else detailState.stockTradeFilter=value==='buy'||value==='sell'?value:'all';
      closeAssetStockSheet();
      renderDetail();
    };
    backdrop.onclick=closeAssetStockSheet;
    sheet.classList.add('show');
    backdrop.classList.add('show');
  }

  function insuranceFlowChartHtml(rows,year,mode){
    const isSell=mode==='sell';
    const monthly=Array.from({length:12},()=>0);
    (rows||[]).forEach(row=>{
      const month=Math.max(1,Math.min(12,movementMonth(row)));
      monthly[month-1]+=insuranceAmount(row);
    });
    const width=380,height=132,pad=20;
    const chart=chartGeometry(monthly,width,height,pad,moneyShort);
    const total=monthly.reduce((sum,value)=>sum+value,0);
    return `<div class="asset53-movement-chart saving-flow-chart ${isSell?'sell':'buy'}">
      <div class="asset53-chart-meta"><span>${isSell?'Tổng thu hồi':'Tổng đóng'} ${year}</span><b>${moneyShort(total)}</b><button type="button" data-asset-flow="${isSell?'buy':'sell'}" aria-label="${isSell?'Xem đóng phí bảo hiểm':'Xem thu hồi bảo hiểm'}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="${isSell?'m15 18-6-6 6-6':'m9 18 6-6-6-6'}"/></svg></button></div>
      <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Biểu đồ ${isSell?'thu hồi':'đóng phí'} bảo hiểm năm ${year}">
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
    if(n>=1000000000){
      const whole=Math.floor(n/1000000000);
      const millionRemainder=Math.floor((n%1000000000)/1000000);
      const hasSubMillion=n%1000000!==0;
      if(!millionRemainder)return `${whole} tỷ`;
      if(hasSubMillion)return `${whole}.${String(millionRemainder).padStart(3,'0')} tỷ`;
      if(millionRemainder%100===0)return `${whole}.${Math.floor(millionRemainder/100)} tỷ`;
      if(millionRemainder%10===0)return `${whole}.${String(Math.floor(millionRemainder/10)).padStart(2,'0')} tỷ`;
      return `${whole}.${String(millionRemainder).padStart(3,'0')} tỷ`;
    }
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
    if(assetSection({key})==='realestate'){
      const year=Number(detailState.year||new Date().getFullYear());
      const mode=detailState.flow==='sell'?'sell':'buy';
      const anim=(detailState.flowAnim||detailState.yearAnim||detailState.tabAnim)?` ${detailState.flowAnim||detailState.yearAnim||detailState.tabAnim}`:'';
      detailState.recalledRealestateIds=recalledRealestateIds(rows);
      const chartRows=rows.filter(row=>(mode==='sell'?isSellMovement(row):!isSellMovement(row))&&movementYear(row)===year);
      const movementRows=chartRows;
      return `<div class="asset53-fixed-panel">
        <div class="asset53-movement-pin">
          ${goldMovementHeaderHtml(year)}
          <div class="asset53-movement-stage${anim}">
            ${realestateFlowChartHtml(chartRows,year,mode)}
          </div>
        </div>
      </div>
      <div class="asset53-scroll-list">
        ${movementRows.length
          ? `<div class="asset53-detail-card gold-buy-list saving-book-list realestate-flow-list">${movementRows.map(row=>detailRow(row,isSellMovement(row)?'#ef4444':'#16a34a',key)).join('')}</div>`
          : `<div class="asset53-empty">Chưa có giao dịch ${mode==='sell'?'bán':'mua'} bất động sản trong năm này.</div>`}
      </div>`;
    }
    if(assetSection({key})==='stock'){
      const year=Number(detailState.year||new Date().getFullYear());
      const mode=detailState.flow==='sell'?'sell':'buy';
      const detailMode=detailState.stockMovementView==='detail';
      const anim=(detailState.flowAnim||detailState.yearAnim||detailState.tabAnim)?` ${detailState.flowAnim||detailState.yearAnim||detailState.tabAnim}`:'';
      const movementRows=rows.filter(row=>(mode==='sell'?isSellMovement(row):!isSellMovement(row))&&movementYear(row)===year);
      const tradeRows=rows.filter(row=>movementYear(row)===year);
      return `<div class="asset53-fixed-panel">
        <div class="asset53-movement-pin">
          ${goldMovementHeaderHtml(year,stockYearProfitHtml(rows,year))}
          ${detailMode?`${stockMovementToolsHtml(true)}${stockTradeHeaderHtml()}`:`<div class="asset53-movement-stage${anim}">
            ${stockFlowChartHtml(movementRows,year,mode)}
            ${stockProfitAnalysisHtml(rows,year)}
            ${stockMovementToolsHtml(false)}
          </div>`}
        </div>
      </div>
      ${detailMode?`<div class="asset53-scroll-list asset53-stock-trade-scroll">
        ${tradeRows.length
          ? stockTradeTableHtml(tradeRows)
          : '<div class="asset53-empty">Chưa có giao dịch chứng khoán trong năm này.</div>'}
      </div>`:''}`;
    }
    if(assetSection({key})==='insurance'){
      const year=Number(detailState.year||new Date().getFullYear());
      const mode=detailState.flow==='sell'?'sell':'buy';
      const anim=(detailState.flowAnim||detailState.yearAnim||detailState.tabAnim)?` ${detailState.flowAnim||detailState.yearAnim||detailState.tabAnim}`:'';
      const movementRows=rows.filter(row=>(mode==='sell'?isSellMovement(row):!isSellMovement(row))&&movementYear(row)===year);
      return `<div class="asset53-fixed-panel">
        <div class="asset53-movement-pin">
          ${goldMovementHeaderHtml(year)}
          <div class="asset53-movement-stage${anim}">
            ${insuranceFlowChartHtml(movementRows,year,mode)}
          </div>
        </div>
      </div>
      <div class="asset53-scroll-list">
        ${movementRows.length
          ? `<div class="asset53-detail-card gold-buy-list saving-book-list insurance-flow-list">${movementRows.map(row=>detailRow(row,isSellMovement(row)?'#ef4444':'#16a34a',key)).join('')}</div>`
          : `<div class="asset53-empty">Chưa có giao dịch ${mode==='sell'?'thu hồi':'đóng phí'} bảo hiểm trong năm này.</div>`}
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
    screen?.classList.toggle('asset53-stock-screen',assetSection(asset)==='stock');
    screen?.classList.toggle('asset53-insurance-movement',assetSection(asset)==='insurance'&&detailState.tab==='movement');
    screen?.classList.toggle('asset53-insurance-contract-detail-screen',assetSection(asset)==='insurance'&&detailState.tab==='overview'&&!!detailState.insuranceContractDetail);
    screen?.classList.toggle('asset53-stock-detail-screen',assetSection(asset)==='stock'&&detailState.tab==='overview'&&!!detailState.stockDetail);
    body.classList.toggle('asset53-insurance-contract-detail',assetSection(asset)==='insurance'&&detailState.tab==='overview'&&!!detailState.insuranceContractDetail);
    body.classList.toggle('asset53-stock-detail',assetSection(asset)==='stock'&&detailState.tab==='overview'&&!!detailState.stockDetail);
    body.classList.toggle('asset53-stock-trade-mode',assetSection(asset)==='stock'&&detailState.tab==='movement'&&detailState.stockMovementView==='detail');
    body.classList.toggle('asset53-stock-overview-mode',assetSection(asset)==='stock'&&detailState.tab==='overview'&&!detailState.stockDetail);
    body.classList.toggle('asset53-compact-ledger',['insurance','realestate','stock','saving'].includes(assetSection(asset)));
    body.classList.toggle('asset53-fixed-detail',cash||detailState.tab==='movement'||(assetSection(asset)==='stock'&&detailState.tab==='overview'&&!detailState.stockDetail));
    if(cash){
      body.innerHTML=bankDetailHtml();
      return;
    }
    body.innerHTML=`<div class="asset53-tabs">
      <button class="${detailState.tab==='overview'?'active':''}" data-asset-detail-tab="overview">Tổng quan</button>
      <button class="${detailState.tab==='movement'?'active':''}" data-asset-detail-tab="movement">Biến động</button>
    </div>${detailState.tab==='overview'?overviewHtml(asset,rows):movementsHtml(rows,color,key)}`;
  }

  function scrollBankGroupIntoView(groupKey){
    requestAnimationFrame(()=>{
      const body=document.getElementById('asset53DetailBody');
      const scroller=body?.querySelector('.asset53-scroll-list');
      const list=scroller?.querySelector('.asset53-bank-list');
      if(!scroller||!list)return;
      const button=Array.from(list.querySelectorAll('[data-bank-group-toggle]')).find(item=>item.dataset.bankGroupToggle===groupKey);
      const group=button?.closest('.asset53-bank-group');
      if(!group)return;
      const targetTop=group.offsetTop-list.offsetTop;
      scroller.scrollTo({top:Math.max(0,targetTop),behavior:'smooth'});
    });
  }

  function openDetail(key){
    const screen=ensureDetailScreen();
    if(!screen)return;
    detailState={key,tab:'overview',year:new Date().getFullYear(),flow:'buy',cashTab:'income',stockSearch:'',stockOverviewFilter:'all',stockMovementView:'chart',stockTradeFilter:'all',stockTradeSearch:'',insuranceContractDetail:'',insuranceContractFlow:'buy',stockDetail:'',stockDetailFlow:'buy'};
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
    closeAssetStockSheet();
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

  function transactionUpdatePayload(tx,rule,detail,balanceDelta,bankId){
    return {
      loai_giao_dich:rule.txType,
      loai_tai_san:rule.assetType,
      chi_tiet_tai_san:detail,
      lai_suat:detail?.lai_suat||'',
      so_tiet_kiem_id:firstValue(tx,['so_tiet_kiem_id','savingBookId'])||detail?.so_tiet_kiem_id||'',
      so_tiet_kiem_label:firstValue(tx,['so_tiet_kiem_label','savingBookLabel'])||detail?.so_tiet_kiem_label||'',
      gia_von_tat_toan:parseNumber(firstValue(tx,['gia_von_tat_toan','settlementCost'])||detail?.gia_von_da_ban),
      tai_san_thu_hoi_id:firstValue(tx,['tai_san_thu_hoi_id','assetHoldingId','landHoldingId'])||detail?.tai_san_thu_hoi_id||detail?.assetHoldingId||'',
      assetHoldingId:firstValue(tx,['assetHoldingId','tai_san_thu_hoi_id','landHoldingId'])||detail?.assetHoldingId||detail?.tai_san_thu_hoi_id||'',
      tai_khoan_id:bankId||bankRow()?.id||BANK_ASSET_DOC_ID,
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

  function explicitBalanceDelta(tx){
    if(!tx)return null;
    const stored=firstValue(tx,['bien_dong_so_du']);
    if(stored!=='')return parseNumber(stored);
    const normalized=firstValue(tx,['balanceDelta']);
    const value=parseNumber(normalized);
    return normalized!==''&&value!==0?value:null;
  }

  function balanceDeltaForSource(source,fallback){
    const tx={...(fallback||{}),...(source||{})};
    const rule=assetRuleFor(tx);
    const explicit=explicitBalanceDelta(source);
    if(explicit!==null&&(!rule||explicit!==0||amountOf(tx)===0))return explicit;
    const fallbackExplicit=explicitBalanceDelta(fallback);
    if(fallbackExplicit!==null&&(!rule||fallbackExplicit!==0||amountOf(tx)===0))return fallbackExplicit;
    if(rule){
      const input=convertedAssetInput(tx,rule);
      const amount=amountOf(tx);
      return rule.txType==='INVEST'?-(amount+input.fee):(amount-input.fee);
    }
    return accountingPayload(tx).bien_dong_so_du;
  }

  function hasPostedAccounting(source,fallback){
    const status=String(source?.trang_thai_hach_toan||fallback?.postingStatus||fallback?.trang_thai_hach_toan||'').toUpperCase();
    return status==='POSTED'||explicitBalanceDelta(source)!==null||explicitBalanceDelta(fallback)!==null;
  }

  function assetPayloadFromRow(row){
    const type=String(row?.loai_tai_san||row?.loaiTaiSan||'');
    const isLand=type.toUpperCase()==='LAND';
    const rawQty=parseNumber(row?.so_luong??row?.soLuong);
    const rawCurrentValue=parseNumber(row?.gia_tri_hien_tai??row?.currentValue??row?.value);
    const rawTotalCost=parseNumber(row?.tong_gia_von??row?.cost);
    const landUnitPrice=rawCurrentValue||rawTotalCost||parseNumber(row?.gia_hien_tai??row?.price);
    return {
      id:row?.id||'',
      sourceTxnDocId:String(row?.source_txn_doc_id||row?.sourceTxnDocId||''),
      sourceTxnExternalId:String(row?.source_txn_external_id||row?.sourceTxnExternalId||''),
      savingBookId:String(row?.so_tiet_kiem_id||row?.savingBookId||''),
      savingBookLabel:String(row?.so_tiet_kiem_label||row?.savingBookLabel||''),
      type,
      name:String(row?.ten_tai_san||row?.name||''),
      qty:isLand&&rawQty>0?1:rawQty,
      unit:isLand?'tài sản':String(row?.don_vi||row?.donVi||''),
      currentPrice:isLand?landUnitPrice:parseNumber(row?.gia_hien_tai??row?.price),
      currentValue:rawCurrentValue,
      totalCost:rawTotalCost,
      avgCost:isLand?(rawTotalCost||landUnitPrice):parseNumber(row?.gia_von_binh_quan??row?.avgCost),
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
        so_luong_hien_thi:input.displayQty||input.qty,
        don_vi_hien_thi:input.displayUnit||input.unit,
        don_gia_hien_thi:input.displayUnitPrice||input.unitPrice,
        lai_suat:input.interestRate||'',
        so_tiet_kiem_id:firstValue(tx,['so_tiet_kiem_id','savingBookId']),
        so_tiet_kiem_label:firstValue(tx,['so_tiet_kiem_label','savingBookLabel']),
        so_luong_ton_sau_giao_dich:next.qty,
        tong_gia_von_sau_giao_dich:Math.round(next.totalCost),
        gia_von_binh_quan_sau_giao_dich:next.avgCost,
        migration_version:3
      }};
    }
    if(rule.assetType!=='SAVING'&&rule.assetType!=='INSURANCE'&&input.qty>Number(next.qty||0))throw new Error('Không thể bán nhiều hơn số lượng tài sản đang có.');
    const avgBefore=Number(next.avgCost||0);
    const selectedCost=rule.assetType==='SAVING'&&Number(input.settlementCost||0)?Number(input.settlementCost||0):0;
    const gross=Math.round(input.qty*input.unitPrice);
    const proceeds=Math.round((amount||gross)-input.fee);
    const insuranceRemaining=Number(next.totalCost||0);
    const sellQty=rule.assetType==='SAVING'
      ? Math.min(input.qty,Math.max(Number(next.qty||0),input.qty))
      : (rule.assetType==='INSURANCE'
        ? (insuranceRemaining&&proceeds>=insuranceRemaining?Number(next.qty||0):Math.min(input.qty,Number(next.qty||0)))
        : input.qty);
    const costSold=rule.assetType==='INSURANCE'?Math.min(insuranceRemaining,proceeds):Math.round(selectedCost||sellQty*avgBefore);
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
      so_luong_hien_thi:input.displayQty||sellQty,
      don_vi_hien_thi:input.displayUnit||input.unit,
      don_gia_hien_thi:input.displayUnitPrice||input.unitPrice,
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
      const storedPosted=hasPostedAccounting(storedTx,tx);
      const missingAssetDetail=rule&&storedTx&&storedPosted&&!storedTx.chi_tiet_tai_san;
      if(storedTx&&storedPosted&&!missingAssetDetail)return;
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
          bien_dong_so_du:balanceDeltaForSource(storedTx,sourceTx),
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
      writer.set(FIREBASE_COLLECTIONS.giaoDich,txnDocId,transactionUpdatePayload(tx,rule,applied.detail,balanceDelta,bankId),{merge:true});
    };
    if(typeof window.FDB.runTransaction==='function')return window.FDB.runTransaction(run);
    return Promise.resolve();
  }

  function reversePostedTransaction(tx,txnDocId){
    if(!tx||!txnDocId||!window.FDB)return Promise.resolve();
    const detail=tx.assetDetail||tx.chi_tiet_tai_san;
    const run=async writer=>{
      const storedTx=await writer.get(FIREBASE_COLLECTIONS.giaoDich,txnDocId);
      const source=storedTx||tx;
      if(!hasPostedAccounting(source,tx))return;
      const bankId=source.tai_khoan_id||tx.accountId||bankRow()?.id||BANK_ASSET_DOC_ID;
      const bank=await writer.get(FIREBASE_COLLECTIONS.taiSan,bankId);
      const d=source.chi_tiet_tai_san||detail;
      const asset=d?.tai_san_id?await writer.get(FIREBASE_COLLECTIONS.taiSan,d.tai_san_id):null;
      writer.set(FIREBASE_COLLECTIONS.taiSan,bankId,bankPayloadAfter(bank||{},-balanceDeltaForSource(source,tx)),{merge:true});
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
    if(!hasPostedAccounting(source,fallbackTx))return;
    const d=source.chi_tiet_tai_san||fallbackTx?.assetDetail||fallbackTx?.chi_tiet_tai_san;
    const bankId=source.tai_khoan_id||fallbackTx?.accountId||bankRow()?.id||BANK_ASSET_DOC_ID;
    const bank=await writer.get(FIREBASE_COLLECTIONS.taiSan,bankId);
    const asset=d?.tai_san_id?await writer.get(FIREBASE_COLLECTIONS.taiSan,d.tai_san_id):null;
    writer.set(FIREBASE_COLLECTIONS.taiSan,bankId,bankPayloadAfter(bank||{},-balanceDeltaForSource(source,fallbackTx)),{merge:true});
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
    writer.set(FIREBASE_COLLECTIONS.giaoDich,txnDocId,{...(baseData||{}),...transactionUpdatePayload(tx,rule,applied.detail,balanceDelta,bankId)},{merge:true});
  }

  function saveTransactionAtomic(tx,txnDocId,baseData,options){
    if(!tx||!txnDocId||!window.FDB||typeof window.FDB.runTransaction!=='function')return Promise.resolve();
    const run=async writer=>{
      const stored=await writer.get(FIREBASE_COLLECTIONS.giaoDich,txnDocId);
      if(options?.mode==='create'&&hasPostedAccounting(stored,tx))return;
      const source={...tx,...(baseData||{})};
      const oldSource=stored||{};
      const oldDetail=oldSource.chi_tiet_tai_san;
      const shouldReverse=hasPostedAccounting(oldSource,tx);
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
        bankRows[oldBankId]=bankPayloadAfter(bankRows[oldBankId]||{},-balanceDeltaForSource(oldSource,tx));
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
        writer.set(FIREBASE_COLLECTIONS.giaoDich,txnDocId,{...(baseData||{}),...transactionUpdatePayload(source,newRule,applied.detail,balanceDelta,newBankId)},{merge:true});
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
      const wasPosted=hasPostedAccounting(source,tx);
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
  window.ASSET52_isInsuranceContractSettled=isInsuranceContractSettled;
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
      repairBankBalanceOnce();
      cleanupOrphanTransactionAssetRows();
      normalizeAssets(data);
      renderAssets();
    },console.error);
  }
  document.addEventListener('click',e=>{
    const clickedInsuranceAction=e.target.closest('[data-asset-insurance-settle], [data-asset-insurance-unsettle], [data-asset-insurance-detail], [data-asset-insurance-detail-back], [data-asset-insurance-detail-flow], [data-asset-stock-detail], [data-asset-stock-detail-back], [data-asset-stock-detail-flow]');
    if(!clickedInsuranceAction&&closeInsuranceSwipeActions()){
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    const nav=e.target.closest('.dock-content .nav-item');
    if(nav&&nav.textContent.trim()==='Tài sản')setTimeout(renderAssets,0);
    const asset=e.target.closest('[data-asset-key]');
    if(asset)openDetail(asset.dataset.assetKey);
    const settleInsurance=e.target.closest('[data-asset-insurance-settle]');
    if(settleInsurance){
      e.preventDefault();
      e.stopPropagation();
      settleInsuranceContract(decodeURIComponent(settleInsurance.dataset.assetInsuranceSettle||''));
      return;
    }
    const unsettleInsurance=e.target.closest('[data-asset-insurance-unsettle]');
    if(unsettleInsurance){
      e.preventDefault();
      e.stopPropagation();
      unsettleInsuranceContract(decodeURIComponent(unsettleInsurance.dataset.assetInsuranceUnsettle||''));
      return;
    }
    const insuranceDetail=e.target.closest('[data-asset-insurance-detail]');
    if(insuranceDetail){
      e.preventDefault();
      e.stopPropagation();
      detailState.insuranceContractDetail=decodeURIComponent(insuranceDetail.dataset.assetInsuranceDetail||'');
      detailState.insuranceContractFlow='buy';
      renderDetail();
      return;
    }
    const insuranceDetailFlow=e.target.closest('[data-asset-insurance-detail-flow]');
    if(insuranceDetailFlow){
      e.preventDefault();
      e.stopPropagation();
      detailState.insuranceContractFlow=insuranceDetailFlow.dataset.assetInsuranceDetailFlow==='sell'?'sell':'buy';
      renderDetail();
      return;
    }
    const insuranceDetailBack=e.target.closest('[data-asset-insurance-detail-back]');
    if(insuranceDetailBack){
      e.preventDefault();
      e.stopPropagation();
      detailState.insuranceContractDetail='';
      detailState.insuranceContractFlow='buy';
      renderDetail();
      return;
    }
    const stockDetail=e.target.closest('[data-asset-stock-detail]');
    if(stockDetail){
      e.preventDefault();
      e.stopPropagation();
      detailState.stockDetail=decodeURIComponent(stockDetail.dataset.assetStockDetail||'');
      detailState.stockDetailFlow='buy';
      renderDetail();
      return;
    }
    const stockDetailFlow=e.target.closest('[data-asset-stock-detail-flow]');
    if(stockDetailFlow){
      e.preventDefault();
      e.stopPropagation();
      detailState.stockDetailFlow=stockDetailFlow.dataset.assetStockDetailFlow==='sell'?'sell':'buy';
      renderDetail();
      return;
    }
    const stockDetailBack=e.target.closest('[data-asset-stock-detail-back]');
    if(stockDetailBack){
      e.preventDefault();
      e.stopPropagation();
      detailState.stockDetail='';
      detailState.stockDetailFlow='buy';
      renderDetail();
      return;
    }
    const tab=e.target.closest('[data-asset-detail-tab]');
    if(tab){
      const nextTab=tab.dataset.assetDetailTab;
      detailState.tabAnim=nextTab==='movement'?'slide-left':'';
      detailState.tab=nextTab;
      detailState.insuranceContractDetail='';
      detailState.insuranceContractFlow='buy';
      detailState.stockDetail='';
      detailState.stockDetailFlow='buy';
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
    const stockViewBtn=e.target.closest('[data-asset-stock-view]');
    if(stockViewBtn){
      e.preventDefault();
      e.stopPropagation();
      detailState.stockMovementView=stockViewBtn.dataset.assetStockView==='detail'?'detail':'chart';
      detailState.tabAnim=detailState.stockMovementView==='detail'?'slide-left':'slide-right';
      renderDetail();
      setTimeout(()=>{if(detailState.tabAnim){detailState.tabAnim='';}},260);
      return;
    }
    const stockFilterSheet=e.target.closest('[data-asset-stock-trade-filter-sheet], [data-asset-stock-overview-filter-sheet]');
    if(stockFilterSheet){
      e.preventDefault();
      e.stopPropagation();
      openStockFilterSheet(stockFilterSheet.matches('[data-asset-stock-overview-filter-sheet]')?'overview':'trade');
      return;
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
      if(detailState.expandedGroup===key)scrollBankGroupIntoView(key);
    }
    if(e.target.closest('[data-asset-detail-back]'))closeDetail();
  },true);
  document.addEventListener('input',e=>{
    const stockSearch=e.target.closest('[data-asset-stock-search]');
    const tradeSearch=e.target.closest('[data-asset-stock-trade-search]');
    if(!stockSearch&&!tradeSearch)return;
    if(stockSearch)detailState.stockSearch=stockSearch.value||'';
    if(tradeSearch)detailState.stockTradeSearch=tradeSearch.value||'';
    renderDetail();
    requestAnimationFrame(()=>{
      const next=document.querySelector(stockSearch?'[data-asset-stock-search]':'[data-asset-stock-trade-search]');
      if(next){
        next.focus();
        const pos=next.value.length;
        try{next.setSelectionRange(pos,pos);}catch(_){}
      }
    });
  });
  document.addEventListener('txn16:changed',()=>{
    cleanedOrphanTransactionRows=false;
    cleanupOrphanTransactionAssetRows();
    normalizeAssets(rawAssetRows);
    renderAssets();
    postPendingCurrentTransactions();
  });
})();

