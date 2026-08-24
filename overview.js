const phone=document.getElementById('phone');
const eye=document.getElementById('eyeBtn');
const themeBtn=document.getElementById('themeBtn');
let bgBtn=null;
const appLoader=document.getElementById('appLoader');
const appLoaderTitle=document.getElementById('appLoaderTitle');
const appLoaderText=document.getElementById('appLoaderText');
const appLoaderLogin=document.getElementById('appLoaderLogin');
const themes=['','theme-violet','theme-emerald','theme-rose','theme-cyan','theme-amber','theme-indigo','theme-teal','theme-slate','theme-pink'];
const bgUserKey='qlctUserBackgrounds';
const bgHiddenPresetKey='qlctHiddenPresetBackgrounds';
const presetBackgrounds=[
  // Đặt ảnh có sẵn vào thư mục images rồi thêm tên file vào danh sách này.
  // Ví dụ: {name:'Xanh dịu',src:'images/xanh-diu.jpg'}
];
presetBackgrounds.push(
  {name:'Image 1',src:'images/image1.jpg'},
  {name:'Image 2',src:'images/image2.jpg'},
  {name:'Image 3',src:'images/image3.jpg'}
);
const faceIdKey='qlctFaceIdCredentialId';
let appDataReady=false;
let appUnlocked=false;
let faceIdPrompted=false;
let lastTouchEndAt=0;

let themeIndex=Number(localStorage.getItem('demoThemeIndex')||0);

function preventPwaDoubleTapZoom(){
  document.documentElement.style.touchAction='manipulation';
  document.body.style.touchAction='manipulation';
  phone?.style.setProperty('touch-action','manipulation');
  document.addEventListener('gesturestart',e=>{if(e.cancelable)e.preventDefault();},{passive:false});
  document.addEventListener('gesturechange',e=>{if(e.cancelable)e.preventDefault();},{passive:false});
  document.addEventListener('gestureend',e=>{if(e.cancelable)e.preventDefault();},{passive:false});
  document.addEventListener('dblclick',e=>{if(e.cancelable)e.preventDefault();},{passive:false});
  document.addEventListener('touchend',e=>{
    const now=Date.now();
    if(now-lastTouchEndAt<420&&e.cancelable)e.preventDefault();
    lastTouchEndAt=now;
  },{passive:false});
}

function ensureNumberKeyboard(){
  const numericSelector=[
    'input[inputmode="numeric"]',
    'input[inputmode="decimal"]',
    'input[data-numkey-mode]',
    '#gold77Input',
    '#add39Amount',
    '#add39AssetQty',
    '#add39AssetInterest',
    '#add39Fee',
    '#txn16Amount',
    '#txn16AssetQty',
    '#txn16AssetInterest',
    '#txn16Fee'
  ].join(',');
  const phoneEl=document.getElementById('phone');
  if(!phoneEl||document.getElementById('numkeyPanel'))return;
  phoneEl.insertAdjacentHTML('beforeend',`
    <div class="numkey-backdrop" id="numkeyBackdrop"></div>
    <div class="numkey-panel" id="numkeyPanel" aria-hidden="true">
      <div class="numkey-display">
        <div class="numkey-value" id="numkeyValue">0</div>
        <button class="numkey-done" type="button" data-numkey-done>Xong</button>
      </div>
      <div class="numkey-grid">
        <button class="numkey-key" type="button" data-numkey="1">1</button>
        <button class="numkey-key" type="button" data-numkey="2">2</button>
        <button class="numkey-key" type="button" data-numkey="3">3</button>
        <button class="numkey-key" type="button" data-numkey="4">4</button>
        <button class="numkey-key" type="button" data-numkey="5">5</button>
        <button class="numkey-key" type="button" data-numkey="6">6</button>
        <button class="numkey-key" type="button" data-numkey="7">7</button>
        <button class="numkey-key" type="button" data-numkey="8">8</button>
        <button class="numkey-key" type="button" data-numkey="9">9</button>
        <button class="numkey-key wide" type="button" data-numkey="00">00</button>
        <button class="numkey-key" type="button" data-numkey="0">0</button>
        <button class="numkey-key wide" type="button" data-numkey="000">000</button>
        <button class="numkey-key action" type="button" data-numkey-clear>C</button>
        <button class="numkey-key action" type="button" data-numkey-decimal>.</button>
        <button class="numkey-key action" type="button" data-numkey-back>&#9003;</button>
      </div>
    </div>`);
  const panel=document.getElementById('numkeyPanel');
  const backdrop=document.getElementById('numkeyBackdrop');
  const valueEl=document.getElementById('numkeyValue');
  let target=null;
  let lastManualOpenAt=0;

  function isNumericInput(el){
    return el?.matches?.(numericSelector)&&!el.disabled;
  }
  function prepareNumericInput(input){
    if(!isNumericInput(input))return;
    if(!input.dataset.numkeyMode)input.dataset.numkeyMode=input.getAttribute('inputmode')||'numeric';
    input.dataset.numkeyManaged='1';
    input.setAttribute('inputmode','none');
    input.setAttribute('readonly','readonly');
    input.setAttribute('autocomplete','off');
  }
  function prepareAllNumericInputs(root=document){
    root.querySelectorAll?.(numericSelector).forEach(prepareNumericInput);
  }
  function decimalAllowed(){
    return target?.dataset.numkeyMode==='decimal'||/Interest|Qty/i.test(target?.id||'');
  }
  function displayValue(){
    if(!valueEl)return;
    const value=String(target?.value||'');
    valueEl.textContent=value||'0';
  }
  function emitInput(){
    if(!target)return;
    target.dispatchEvent(new Event('input',{bubbles:true}));
    displayValue();
  }
  function setValue(next){
    if(!target)return;
    const allowDecimal=decimalAllowed();
    let value=String(next||'');
    value=allowDecimal?value.replace(/[^\d.]/g,''):value.replace(/\D/g,'');
    if(allowDecimal){
      const parts=value.split('.');
      value=parts.shift()+(parts.length?'.'+parts.join(''):'');
    }
    target.value=value;
    emitInput();
  }
  function openFor(input){
    prepareNumericInput(input);
    target=input;
    target.setAttribute('inputmode','none');
    target.setAttribute('readonly','readonly');
    target.classList.add('numkey-active-input');
    try{target.focus({preventScroll:true});}catch(_err){}
    displayValue();
    panel?.classList.add('show');
    backdrop?.classList.add('show');
    panel?.setAttribute('aria-hidden','false');
  }
  function close(){
    if(target){
      try{target.blur();}catch(_err){}
      target.classList.remove('numkey-active-input');
      target.setAttribute('inputmode','none');
      target.setAttribute('readonly','readonly');
      target.dispatchEvent(new Event('change',{bubbles:true}));
    }
    panel?.classList.remove('show');
    backdrop?.classList.remove('show');
    panel?.setAttribute('aria-hidden','true');
    target=null;
  }
  function beginOpen(e){
    const input=e.target.closest?.(numericSelector);
    if(!isNumericInput(input))return;
    if(e.cancelable)e.preventDefault();
    lastManualOpenAt=Date.now();
    openFor(input);
  }

  ['pointerdown','touchstart','mousedown'].forEach(type=>{
    document.addEventListener(type,e=>{
      if(type==='mousedown'&&Date.now()-lastManualOpenAt<700)return;
      beginOpen(e);
    },{capture:true,passive:false});
  });
  document.addEventListener('focusin',e=>{
    if(isNumericInput(e.target)){
      if(target===e.target&&panel?.classList.contains('show'))return;
      openFor(e.target);
    }
  },true);
  panel.addEventListener('click',e=>{
    if(e.target.closest('[data-numkey-done]')){close();return;}
    if(e.target.closest('[data-numkey-clear]')){setValue('');return;}
    if(e.target.closest('[data-numkey-back]')){setValue(String(target?.value||'').slice(0,-1));return;}
    if(e.target.closest('[data-numkey-decimal]')){
      if(decimalAllowed()&&!String(target?.value||'').includes('.'))setValue((target?.value||'')+'.');
      return;
    }
    const key=e.target.closest('[data-numkey]')?.dataset.numkey;
    if(key!==undefined)setValue(String(target?.value||'')+key);
  });
  backdrop.addEventListener('click',close);
  prepareAllNumericInputs();
  new MutationObserver(mutations=>{
    mutations.forEach(mutation=>{
      mutation.addedNodes.forEach(node=>{
        if(node.nodeType!==1)return;
        if(isNumericInput(node))prepareNumericInput(node);
        prepareAllNumericInputs(node);
      });
    });
  }).observe(phoneEl,{childList:true,subtree:true});
}

function applyTheme(){
  phone.classList.remove(...themes.filter(Boolean));
  if(themes[themeIndex]) phone.classList.add(themes[themeIndex]);
  localStorage.setItem('demoThemeIndex',themeIndex);
}

function closeTransientLayers(){
  document.querySelectorAll('.add39-backdrop.show,.add39-sheet.show,.txn16-backdrop.show,.txn16-sheet.show,.gold77-backdrop.show,.gold77-sheet.show,.cat90-backdrop.show,.cat90-sheet.show,.report72-backdrop.show,.report72-sheet.show')
    .forEach(el=>el.classList.remove('show'));
  document.querySelectorAll('#txn16Edit.active')
    .forEach(el=>{
      el.classList.remove('active');
      el.setAttribute('aria-hidden','true');
    });
  if(typeof window.closeCategoryEditor==='function')window.closeCategoryEditor();
  else {
    const catEditor=document.getElementById('cat90Editor');
    catEditor?.classList.remove('active');
    catEditor?.setAttribute('aria-hidden','true');
  }
}

function closeAllScreens(){
  document.querySelectorAll('.slide-screen.active').forEach(el=>{
    el.classList.remove('active');
    el.setAttribute('aria-hidden','true');
  });
  const assetDetail=document.getElementById('screenAssetDetail');
  assetDetail?.classList.remove('active');
  assetDetail?.setAttribute('aria-hidden','true');
}

function bgIcon(){
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="4" y="5" width="16" height="14" rx="2"/><path d="m8 14 2.4-2.4a1.4 1.4 0 0 1 2 0L16 15"/><circle cx="9" cy="9" r="1"/></svg>';
}

function ensureBackgroundButton(){
  if(!themeBtn||document.getElementById('bgBtn'))return;
  const wrap=document.createElement('div');
  wrap.className='top-actions';
  bgBtn=document.createElement('button');
  bgBtn.className='bg-btn';
  bgBtn.id='bgBtn';
  bgBtn.type='button';
  bgBtn.title='Chọn hình nền';
  bgBtn.innerHTML=bgIcon();
  themeBtn.parentNode.insertBefore(wrap,themeBtn);
  wrap.appendChild(bgBtn);
  wrap.appendChild(themeBtn);
}

function applyStoredBackground(){
  const image=localStorage.getItem('qlctCustomBackground');
  const tone=localStorage.getItem('qlctCustomBackgroundTone')||'light';
  const edgeColor=localStorage.getItem('qlctCustomBackgroundEdge')||'#eef5fb';
  const themeMeta=document.querySelector('meta[name="theme-color"]');
  if(themeMeta)themeMeta.setAttribute('content',image?edgeColor:'#2563eb');
  [document.documentElement,document.body,phone].filter(Boolean).forEach(el=>{
    el.classList.toggle('custom-bg',!!image);
    el.classList.toggle('custom-bg-dark',!!image&&tone==='dark');
    el.classList.toggle('custom-bg-light',!!image&&tone!=='dark');
    if(image){
      el.style.setProperty('--custom-bg',`url("${image}")`);
      el.style.setProperty('--safe-bg-color',edgeColor);
    }else{
      el.style.removeProperty('--custom-bg');
      el.style.removeProperty('--safe-bg-color');
    }
  });
}

function canvasTone(canvas){
  const ctx=canvas.getContext('2d');
  const w=Math.max(1,Math.min(48,canvas.width));
  const h=Math.max(1,Math.min(96,canvas.height));
  const sample=document.createElement('canvas');
  sample.width=w;sample.height=h;
  const sctx=sample.getContext('2d');
  sctx.drawImage(canvas,0,0,w,h);
  const data=sctx.getImageData(0,0,w,h).data;
  let total=0,count=0;
  for(let i=0;i<data.length;i+=4){
    total+=(0.2126*data[i]+0.7152*data[i+1]+0.0722*data[i+2]);
    count++;
  }
  return total/Math.max(count,1)<132?'dark':'light';
}

function canvasEdgeColor(canvas){
  const ctx=canvas.getContext('2d');
  const sampleH=Math.max(1,Math.min(36,Math.round(canvas.height*.08)));
  const data=ctx.getImageData(0,canvas.height-sampleH,canvas.width,sampleH).data;
  let r=0,g=0,b=0,count=0;
  for(let i=0;i<data.length;i+=4){
    const a=data[i+3]/255;
    r+=data[i]*a;g+=data[i+1]*a;b+=data[i+2]*a;count+=a;
  }
  const toHex=v=>Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,'0');
  count=Math.max(count,1);
  return `#${toHex(r/count)}${toHex(g/count)}${toHex(b/count)}`;
}

function ensureBackgroundPicker(){
  if(document.getElementById('bg90Backdrop'))return;
  const presetHtml=presetBackgrounds.length
    ? presetBackgrounds.map((item,index)=>`<button class="bg90-preset" type="button" data-bg90-preset="${index}" style="background-image:url('${item.src}')"><span>${item.name}</span></button>`).join('')
    : '<div class="bg90-empty">Chưa có ảnh trong thư mục images. Thêm ảnh vào thư mục này rồi khai báo trong presetBackgrounds.</div>';
  phone.insertAdjacentHTML('beforeend',`
    <div class="bg90-backdrop" id="bg90Backdrop"></div>
    <div class="bg90-panel" id="bg90Panel">
      <div class="bg90-handle"></div>
      <div class="bg90-title">Hình nền giao diện</div>
      <button class="bg90-option primary" id="bg90Choose" type="button"><span>Chọn ảnh mới</span><span>›</span></button>
      <button class="bg90-option" id="bg90PresetToggle" type="button"><span>Chọn ảnh có sẵn</span><span>⌄</span></button>
      <div class="bg90-presets" id="bg90Presets">${presetHtml}</div>
      <button class="bg90-option" id="bg90Default" type="button"><span>Background mặc định</span><span>↺</span></button>
    </div>
    <input id="bg90File" type="file" accept="image/*" hidden>
    <div class="bg90-crop" id="bg90Crop">
      <div class="bg90-crop-card">
        <div class="bg90-crop-head"><b>Căn chỉnh hình nền</b><button type="button" id="bg90Close">×</button></div>
        <div class="bg90-canvas-wrap" id="bg90CanvasWrap"><canvas id="bg90Canvas"></canvas></div>
        <label class="bg90-zoom"><span>Zoom</span><input id="bg90Zoom" type="range" min="1" max="3.5" step="0.01" value="1"></label>
        <div class="bg90-actions"><button class="bg90-cancel" id="bg90Cancel" type="button">Hủy</button><button class="bg90-apply" id="bg90Apply" type="button">Áp dụng</button></div>
      </div>
    </div>`);
  const backdrop=document.getElementById('bg90Backdrop');
  const panel=document.getElementById('bg90Panel');
  const file=document.getElementById('bg90File');
  const crop=document.getElementById('bg90Crop');
  const canvas=document.getElementById('bg90Canvas');
  const wrap=document.getElementById('bg90CanvasWrap');
  const zoom=document.getElementById('bg90Zoom');
  const ctx=canvas.getContext('2d');
  const cropState={img:null,scale:1,x:0,y:0,drag:false,lastX:0,lastY:0};
  function closePanel(){backdrop.classList.remove('show');panel.classList.remove('show');}
  function openPanel(){backdrop.classList.add('show');panel.classList.add('show');}
  function closeCrop(){crop.classList.remove('show');cropState.img=null;}
  function drawImageCoverTo(canvasTarget,img){
    const outCtx=canvasTarget.getContext('2d');
    const scale=Math.max(canvasTarget.width/img.width,canvasTarget.height/img.height);
    const w=img.width*scale,h=img.height*scale;
    outCtx.clearRect(0,0,canvasTarget.width,canvasTarget.height);
    outCtx.drawImage(img,(canvasTarget.width-w)/2,(canvasTarget.height-h)/2,w,h);
  }
  function applyPresetBackground(src){
    const img=new Image();
    img.onload=()=>{
      const out=document.createElement('canvas');
      out.width=phone.clientWidth||390;
      out.height=phone.clientHeight||844;
      drawImageCoverTo(out,img);
      localStorage.setItem('qlctCustomBackground',src);
      localStorage.setItem('qlctCustomBackgroundTone',canvasTone(out));
      localStorage.setItem('qlctCustomBackgroundEdge',canvasEdgeColor(out));
      applyStoredBackground();
      closePanel();
    };
    img.src=src;
  }
  function canvasSize(){
    const ratio=phone.clientWidth/Math.max(phone.clientHeight,1);
    const w=Math.min(340,wrap.clientWidth||340);
    const h=Math.round(w/ratio);
    canvas.width=w;
    canvas.height=h;
  }
  function baseScale(){
    if(!cropState.img)return 1;
    return Math.max(canvas.width/cropState.img.width,canvas.height/cropState.img.height);
  }
  function drawCrop(){
    if(!cropState.img)return;
    canvasSize();
    const coverScale=baseScale();
    const scale=coverScale*Math.max(1,Number(zoom.value||1));
    cropState.scale=scale;
    const w=cropState.img.width*scale,h=cropState.img.height*scale;
    if(!cropState.x&&!cropState.y){
      cropState.x=(canvas.width-w)/2;
      cropState.y=(canvas.height-h)/2;
    }
    cropState.x=w<=canvas.width?(canvas.width-w)/2:Math.min(0,Math.max(canvas.width-w,cropState.x));
    cropState.y=h<=canvas.height?(canvas.height-h)/2:Math.min(0,Math.max(canvas.height-h,cropState.y));
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.drawImage(cropState.img,cropState.x,cropState.y,w,h);
  }
  function pointerPoint(e){const p=e.touches?.[0]||e;return {x:p.clientX,y:p.clientY};}
  bgBtn?.addEventListener('click',openPanel);
  backdrop.addEventListener('click',closePanel);
  document.getElementById('bg90Choose').addEventListener('click',()=>{closePanel();file.click();});
  document.getElementById('bg90PresetToggle').addEventListener('click',()=>document.getElementById('bg90Presets')?.classList.toggle('show'));
  document.getElementById('bg90Presets').addEventListener('click',e=>{
    const btn=e.target.closest('[data-bg90-preset]');
    if(!btn)return;
    const item=presetBackgrounds[Number(btn.dataset.bg90Preset)];
    if(item?.src)applyPresetBackground(item.src);
  });
  document.getElementById('bg90Default').addEventListener('click',()=>{localStorage.removeItem('qlctCustomBackground');localStorage.removeItem('qlctCustomBackgroundTone');localStorage.removeItem('qlctCustomBackgroundEdge');applyStoredBackground();closePanel();});
  file.addEventListener('change',e=>{
    const selected=e.target.files?.[0];
    if(!selected)return;
    const reader=new FileReader();
    reader.onload=()=>{
      const img=new Image();
      img.onload=()=>{
        cropState.img=img;cropState.x=0;cropState.y=0;zoom.value='1';crop.classList.add('show');drawCrop();
      };
      img.src=reader.result;
    };
    reader.readAsDataURL(selected);
    file.value='';
  });
  zoom.addEventListener('input',drawCrop);
  wrap.addEventListener('pointerdown',e=>{cropState.drag=true;const p=pointerPoint(e);cropState.lastX=p.x;cropState.lastY=p.y;wrap.setPointerCapture?.(e.pointerId);});
  wrap.addEventListener('pointermove',e=>{
    if(!cropState.drag)return;
    const p=pointerPoint(e);
    cropState.x+=p.x-cropState.lastX;cropState.y+=p.y-cropState.lastY;
    cropState.lastX=p.x;cropState.lastY=p.y;drawCrop();
  });
  ['pointerup','pointercancel','pointerleave'].forEach(type=>wrap.addEventListener(type,()=>{cropState.drag=false;}));
  document.getElementById('bg90Close').addEventListener('click',closeCrop);
  document.getElementById('bg90Cancel').addEventListener('click',closeCrop);
  document.getElementById('bg90Apply').addEventListener('click',()=>{
    if(!cropState.img)return;
    const out=document.createElement('canvas');
    out.width=phone.clientWidth||390;
    out.height=phone.clientHeight||844;
    const outCtx=out.getContext('2d');
    const sx=out.width/canvas.width,sy=out.height/canvas.height;
    outCtx.drawImage(cropState.img,cropState.x*sx,cropState.y*sy,cropState.img.width*cropState.scale*sx,cropState.img.height*cropState.scale*sy);
    localStorage.setItem('qlctCustomBackground',out.toDataURL('image/jpeg',0.9));
    localStorage.setItem('qlctCustomBackgroundTone',canvasTone(out));
    localStorage.setItem('qlctCustomBackgroundEdge',canvasEdgeColor(out));
    applyStoredBackground();
    closeCrop();
  });
  window.addEventListener('resize',()=>{if(crop.classList.contains('show'))drawCrop();});
}

function ensureBackgroundPicker(){
  if(document.getElementById('screenBackgrounds'))return;
  phone.insertAdjacentHTML('beforeend',`
    <section class="slide-screen bg90-screen" id="screenBackgrounds" aria-hidden="true">
      <div class="slide-head">
        <button class="slide-back" data-bg90-back type="button" aria-label="Quay lại"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M15 18 9 12l6-6"/></svg></button>
        <div class="slide-title">Chọn Hình Nền</div>
      </div>
      <div class="slide-body bg90-body">
        <div class="bg90-toolbar">
          <button class="bg90-add" id="bg90Choose" type="button"><span>+</span><b>Thêm ảnh</b></button>
          <button class="bg90-default" id="bg90Default" type="button"><span>&#8634;</span><b>Hình Mặc định</b></button>
        </div>
        <div class="bg90-grid" id="bg90Grid"></div>
      </div>
    </section>
    <input id="bg90File" type="file" accept="image/*" hidden>
    <div class="bg90-crop" id="bg90Crop">
      <div class="bg90-crop-card">
        <div class="bg90-crop-head"><b>Căn chỉnh hình nền</b><button type="button" id="bg90Close">x</button></div>
        <div class="bg90-canvas-wrap" id="bg90CanvasWrap"><canvas id="bg90Canvas"></canvas></div>
        <label class="bg90-zoom"><span>Zoom</span><input id="bg90Zoom" type="range" min="1" max="3.5" step="0.01" value="1"></label>
        <div class="bg90-actions"><button class="bg90-cancel" id="bg90Cancel" type="button">Hủy</button><button class="bg90-apply" id="bg90Apply" type="button">Áp dụng</button></div>
      </div>
    </div>`);

  const screen=document.getElementById('screenBackgrounds');
  const grid=document.getElementById('bg90Grid');
  const file=document.getElementById('bg90File');
  const crop=document.getElementById('bg90Crop');
  const canvas=document.getElementById('bg90Canvas');
  const wrap=document.getElementById('bg90CanvasWrap');
  const zoom=document.getElementById('bg90Zoom');
  const ctx=canvas.getContext('2d');
  const cropState={img:null,scale:1,x:0,y:0,drag:false,lastX:0,lastY:0,fileName:''};

  function readJson(key,fallback){
    try{return JSON.parse(localStorage.getItem(key)||JSON.stringify(fallback));}
    catch(_err){return fallback;}
  }
  function saveJson(key,value){
    localStorage.setItem(key,JSON.stringify(value));
  }
  function esc(value){
    return String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  }
  function visiblePresets(){
    const hidden=new Set(readJson(bgHiddenPresetKey,[]));
    return presetBackgrounds.filter(item=>item?.src&&!hidden.has(item.src)).map(item=>({...item,kind:'preset'}));
  }
  function userBackgrounds(){
    return readJson(bgUserKey,[]);
  }
  function allBackgrounds(){
    return visiblePresets().concat(userBackgrounds().map(item=>({...item,kind:'user'})));
  }
  function clearBackground(){
    localStorage.removeItem('qlctCustomBackground');
    localStorage.removeItem('qlctCustomBackgroundTone');
    localStorage.removeItem('qlctCustomBackgroundEdge');
    applyStoredBackground();
  }
  function drawImageCoverTo(canvasTarget,img){
    const outCtx=canvasTarget.getContext('2d');
    const scale=Math.max(canvasTarget.width/img.width,canvasTarget.height/img.height);
    const w=img.width*scale,h=img.height*scale;
    outCtx.clearRect(0,0,canvasTarget.width,canvasTarget.height);
    outCtx.drawImage(img,(canvasTarget.width-w)/2,(canvasTarget.height-h)/2,w,h);
  }
  function applyBackground(src){
    const img=new Image();
    img.onload=()=>{
      const out=document.createElement('canvas');
      out.width=phone.clientWidth||390;
      out.height=phone.clientHeight||844;
      drawImageCoverTo(out,img);
      localStorage.setItem('qlctCustomBackground',src);
      localStorage.setItem('qlctCustomBackgroundTone',canvasTone(out));
      localStorage.setItem('qlctCustomBackgroundEdge',canvasEdgeColor(out));
      applyStoredBackground();
      renderGrid();
    };
    img.src=src;
  }
  function renderGrid(){
    const items=allBackgrounds();
    grid.innerHTML=items.length
      ? items.map((item,index)=>`
          <article class="bg90-card ${localStorage.getItem('qlctCustomBackground')===item.src?'active':''}">
            <button class="bg90-thumb" type="button" data-bg90-use="${index}" style="background-image:url('${esc(item.src)}')" aria-label="Chon ${esc(item.name)}"></button>
            <div class="bg90-card-foot">
              <span>${esc(item.name||'Anh nen')}</span>
              <button class="bg90-delete" type="button" data-bg90-delete="${index}" aria-label="Xoa ${esc(item.name)}">x</button>
            </div>
          </article>`).join('')
      : '<div class="bg90-empty">Chua co anh nao. Hay them anh moi de hien thi tai day.</div>';
  }
  function removeItem(item){
    if(item.kind==='preset'){
      const hidden=readJson(bgHiddenPresetKey,[]);
      if(!hidden.includes(item.src))hidden.push(item.src);
      saveJson(bgHiddenPresetKey,hidden);
    }else{
      saveJson(bgUserKey,userBackgrounds().filter(x=>x.id!==item.id));
    }
    if(localStorage.getItem('qlctCustomBackground')===item.src)clearBackground();
    renderGrid();
  }
  function canvasSize(){
    const ratio=phone.clientWidth/Math.max(phone.clientHeight,1);
    const w=Math.min(340,wrap.clientWidth||340);
    const h=Math.round(w/ratio);
    canvas.width=w;
    canvas.height=h;
  }
  function baseScale(){
    if(!cropState.img)return 1;
    return Math.max(canvas.width/cropState.img.width,canvas.height/cropState.img.height);
  }
  function drawCrop(){
    if(!cropState.img)return;
    canvasSize();
    const coverScale=baseScale();
    const scale=coverScale*Math.max(1,Number(zoom.value||1));
    cropState.scale=scale;
    const w=cropState.img.width*scale,h=cropState.img.height*scale;
    if(!cropState.x&&!cropState.y){
      cropState.x=(canvas.width-w)/2;
      cropState.y=(canvas.height-h)/2;
    }
    cropState.x=w<=canvas.width?(canvas.width-w)/2:Math.min(0,Math.max(canvas.width-w,cropState.x));
    cropState.y=h<=canvas.height?(canvas.height-h)/2:Math.min(0,Math.max(canvas.height-h,cropState.y));
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.drawImage(cropState.img,cropState.x,cropState.y,w,h);
  }
  function closeCrop(){
    crop.classList.remove('show');
    cropState.img=null;
  }
  function pointerPoint(e){
    const p=e.touches?.[0]||e;
    return {x:p.clientX,y:p.clientY};
  }

  bgBtn?.addEventListener('click',()=>{renderGrid();openScreen('screenBackgrounds');});
  screen.querySelector('[data-bg90-back]')?.addEventListener('click',()=>closeScreen('screenBackgrounds'));
  document.getElementById('bg90Choose').addEventListener('click',()=>file.click());
  document.getElementById('bg90Default').addEventListener('click',()=>{clearBackground();renderGrid();});
  grid.addEventListener('click',async e=>{
    const items=allBackgrounds();
    const use=e.target.closest('[data-bg90-use]');
    const del=e.target.closest('[data-bg90-delete]');
    if(del){
      const item=items[Number(del.dataset.bg90Delete)];
      if(!item)return;
      const confirmed=await showAppDialog({
        title:'Xóa hình ảnh',
        message:`Bạn có muốn xóa "${item.name||'ảnh này'}" khỏi danh sách hình nền không?`,
        actions:[
          {label:'Xóa',value:true,kind:'danger'},
          {label:'Hủy',value:false,kind:'ghost'}
        ]
      });
      if(confirmed)removeItem(item);
      return;
    }
    if(use){
      const item=items[Number(use.dataset.bg90Use)];
      if(!item?.src)return;
      const confirmed=await showAppDialog({
        title:'Chọn hình nền',
        message:`Bạn có muốn chọn "${item.name||'ảnh này'}" làm background không?`,
        actions:[
          {label:'Chọn',value:true,kind:'primary'},
          {label:'Hủy',value:false,kind:'ghost'}
        ]
      });
      if(confirmed)applyBackground(item.src);
    }
  });
  file.addEventListener('change',e=>{
    const selected=e.target.files?.[0];
    if(!selected)return;
    const reader=new FileReader();
    reader.onload=()=>{
      const img=new Image();
      img.onload=()=>{
        cropState.img=img;
        cropState.fileName=selected.name||'Anh moi';
        cropState.x=0;
        cropState.y=0;
        zoom.value='1';
        crop.classList.add('show');
        drawCrop();
      };
      img.src=reader.result;
    };
    reader.readAsDataURL(selected);
    file.value='';
  });
  zoom.addEventListener('input',drawCrop);
  wrap.addEventListener('pointerdown',e=>{cropState.drag=true;const p=pointerPoint(e);cropState.lastX=p.x;cropState.lastY=p.y;wrap.setPointerCapture?.(e.pointerId);});
  wrap.addEventListener('pointermove',e=>{
    if(!cropState.drag)return;
    const p=pointerPoint(e);
    cropState.x+=p.x-cropState.lastX;
    cropState.y+=p.y-cropState.lastY;
    cropState.lastX=p.x;
    cropState.lastY=p.y;
    drawCrop();
  });
  ['pointerup','pointercancel','pointerleave'].forEach(type=>wrap.addEventListener(type,()=>{cropState.drag=false;}));
  document.getElementById('bg90Close').addEventListener('click',closeCrop);
  document.getElementById('bg90Cancel').addEventListener('click',closeCrop);
  document.getElementById('bg90Apply').addEventListener('click',()=>{
    if(!cropState.img)return;
    const out=document.createElement('canvas');
    out.width=phone.clientWidth||390;
    out.height=phone.clientHeight||844;
    const outCtx=out.getContext('2d');
    const sx=out.width/canvas.width,sy=out.height/canvas.height;
    outCtx.drawImage(cropState.img,cropState.x*sx,cropState.y*sy,cropState.img.width*cropState.scale*sx,cropState.img.height*cropState.scale*sy);
    const src=out.toDataURL('image/jpeg',0.9);
    const list=userBackgrounds();
    list.unshift({id:'bg'+Date.now(),name:cropState.fileName.replace(/\.[^.]+$/,''),src});
    saveJson(bgUserKey,list.slice(0,12));
    closeCrop();
    renderGrid();
  });
  window.addEventListener('resize',()=>{if(crop.classList.contains('show'))drawCrop();});
  renderGrid();
}

function ensureBusyOverlay(){
  if(document.getElementById('qlctBusy'))return;
  phone.insertAdjacentHTML('beforeend',`<div class="qlct-busy" id="qlctBusy" aria-live="polite">
    <div class="qlct-busy-card">
      <div class="loader-mark"><span></span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M4 11.5 12 5l8 6.5"/><path d="M6.5 10.5V19h11v-8.5"/><path d="M9.5 19v-5h5v5"/></svg></div>
      <div class="qlct-busy-text" id="qlctBusyText">Đang xử lý</div>
    </div>
  </div>`);
}

window.QLCT_setBusy=function(show,text='Đang xử lý'){
  ensureBusyOverlay();
  const overlay=document.getElementById('qlctBusy');
  const label=document.getElementById('qlctBusyText');
  if(label)label.textContent=text;
  overlay?.classList.toggle('show',!!show);
};

function closeAppDialog(){
  document.getElementById('qlctDialog')?.remove();
}

function showAppDialog({title='',message='',actions=[]}={}){
  closeAppDialog();
  return new Promise(resolve=>{
    const overlay=document.createElement('div');
    overlay.className='qlct-dialog show';
    overlay.id='qlctDialog';
    const actionHtml=actions.map((action,index)=>`<button type="button" class="qlct-dialog-btn ${action.kind||''}" data-dialog-action="${index}">${action.label}</button>`).join('');
    overlay.innerHTML=`<div class="qlct-dialog-card" role="dialog" aria-modal="true">
      <div class="qlct-dialog-title">${title}</div>
      <div class="qlct-dialog-message">${message}</div>
      <div class="qlct-dialog-actions">${actionHtml}</div>
    </div>`;
    overlay.addEventListener('click',e=>{
      const actionBtn=e.target.closest('[data-dialog-action]');
      if(!actionBtn)return;
      const action=actions[Number(actionBtn.dataset.dialogAction)];
      overlay.remove();
      resolve(action?.value);
    });
    phone.appendChild(overlay);
  });
}

function showAppMessage(title,message){
  return showAppDialog({title,message,actions:[{label:'Đã hiểu',value:true,kind:'primary'}]});
}

function isMoneyInput(input){
  if(!input||input.tagName!=='INPUT')return false;
  const id=input.id||'';
  const label=input.closest('.add39-field,.txn16-field')?.querySelector('label')?.textContent||'';
  return /amount|money|fee|price|sotien|so-tien/i.test(id)||/số tiền|phí|tiền công|tất toán/i.test(label);
}

function ensureNumberQuickBar(){
  if(document.getElementById('numQuickBar'))return;
  const bar=document.createElement('div');
  bar.className='numquick';
  bar.id='numQuickBar';
  bar.innerHTML='<button type="button" data-numquick="00">00</button><button type="button" data-numquick="000">000</button>';
  phone.appendChild(bar);
  let activeInput=null;
  const show=input=>{
    activeInput=input;
    bar.classList.add('show');
  };
  const hide=()=>{
    activeInput=null;
    bar.classList.remove('show');
  };
  const insertDigits=digits=>{
    const input=activeInput;
    if(!input)return;
    input.focus({preventScroll:true});
    const start=input.selectionStart??input.value.length;
    const end=input.selectionEnd??start;
    input.value=input.value.slice(0,start)+digits+input.value.slice(end);
    const next=start+digits.length;
    input.setSelectionRange?.(next,next);
    input.dispatchEvent(new Event('input',{bubbles:true}));
  };
  bar.addEventListener('pointerdown',e=>e.preventDefault());
  bar.addEventListener('click',e=>{
    const btn=e.target.closest('[data-numquick]');
    if(btn)insertDigits(btn.dataset.numquick);
  });
  document.addEventListener('focusin',e=>{
    if(isMoneyInput(e.target))show(e.target);
  });
  document.addEventListener('focusout',()=>{
    setTimeout(()=>{if(!isMoneyInput(document.activeElement))hide();},120);
  });
  document.addEventListener('click',e=>{
    if(e.target.closest('#numQuickBar'))return;
    if(!isMoneyInput(e.target)&&!isMoneyInput(document.activeElement))hide();
  });
}

function spinOverviewDonut(){
  const donut=document.querySelector('.donut-wrap');
  if(!donut)return;
  donut.classList.remove('donut-spin');
  void donut.offsetWidth;
  donut.classList.add('donut-spin');
}

function animateExpenseChart(){
  const card=document.querySelector('.expense-card');
  if(!card)return;
  card.classList.remove('expense-animate');
  void card.offsetWidth;
  card.classList.add('expense-animate');
}

function playOverviewAnimations(){
  spinOverviewDonut();
  animateExpenseChart();
}

function eyeOpenIcon(){
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>';
}

function eyeOffIcon(){
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 3l18 18"/><path d="M10.6 10.6a2 2 0 0 0 2.8 2.8"/><path d="M9.9 5.3A10.5 10.5 0 0 1 12 5c6.5 0 10 7 10 7a16.2 16.2 0 0 1-3.1 4.2"/><path d="M6.1 6.8C3.5 8.6 2 12 2 12s3.5 7 10 7a10.6 10.6 0 0 0 5.1-1.3"/></svg>';
}

function syncMoneyVisibility(){
  const hidden=localStorage.getItem('moneyHidden')==='1';
  phone.classList.toggle('money-hidden',hidden);
  if(eye){
    eye.innerHTML=hidden?eyeOffIcon():eyeOpenIcon();
    eye.setAttribute('aria-label',hidden?'Hiện số tiền':'Ẩn số tiền');
    eye.setAttribute('title',hidden?'Hiện số tiền':'Ẩn số tiền');
  }
}

function homeIcon(){
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M4 11.5 12 5l8 6.5"/><path d="M6.5 10.5V19h11v-8.5"/></svg>';
}

function ensureHomeButtons(root=document){
  root.querySelectorAll('.slide-screen .slide-head,.asset53-detail-screen .slide-head,.txn16-edit .slide-head,.cat90-editor .slide-head').forEach(head=>{
    if(head.querySelector('.slide-home'))return;
    head.insertAdjacentHTML('beforeend',`<button class="slide-home" data-home-screen title="Tổng quan" aria-label="Tổng quan">${homeIcon()}</button>`);
  });
}

function openScreen(id){
  closeTransientLayers();
  closeAllScreens();
  ensureHomeButtons();
  const el=document.getElementById(id);
  if(el){
    ensureHomeButtons(el);
    el.classList.add('active');
    el.setAttribute('aria-hidden','false');
  }
}

function closeScreen(id){
  const el=document.getElementById(id);
  if(el){
    el.classList.remove('active');
    el.setAttribute('aria-hidden','true');
  }
  closeTransientLayers();
  playOverviewAnimations();
}

function resetTransactionFilters(){
  const clearBtn=document.getElementById('txn16Clear');
  if(clearBtn) clearBtn.click();
}

function cleanExportRow(row){
  return JSON.parse(JSON.stringify(row||{}));
}

async function exportAllData(){
  if(!window.FDB?.refreshAll||!window.FIREBASE_COLLECTIONS)return;
  window.QLCT_setBusy?.(true,'Đang export dữ liệu');
  try{
    const names=[FIREBASE_COLLECTIONS.danhMuc,FIREBASE_COLLECTIONS.giaoDich,FIREBASE_COLLECTIONS.taiSan];
    const rows=await window.FDB.refreshAll();
    const payload={version:1,exportedAt:new Date().toISOString(),collections:{}};
    names.forEach((name,index)=>{payload.collections[name]=(rows[index]||[]).map(cleanExportRow);});
    const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url;
    a.download=`qlct-data-${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }finally{
    window.QLCT_setBusy?.(false);
  }
}

function importDoc(row){
  const docId=String(row?._docId||row?.id||row?.docId||row?.external_id||('import_'+Date.now()+'_'+Math.random().toString(36).slice(2)));
  const data={...(row||{})};
  delete data._docId;
  delete data.docId;
  if(row?.external_id)data.id=row.external_id;
  delete data.external_id;
  return {docId,data};
}

function chooseImportFile(replaceAll){
  const input=document.createElement('input');
  input.type='file';
  input.accept='application/json,.json';
  input.onchange=()=>{
    const file=input.files?.[0];
    if(!file)return;
    const reader=new FileReader();
    reader.onload=async()=>{
      try{
        const parsed=JSON.parse(String(reader.result||'{}'));
        const collections=parsed.collections||parsed;
        const names=[FIREBASE_COLLECTIONS.danhMuc,FIREBASE_COLLECTIONS.giaoDich,FIREBASE_COLLECTIONS.taiSan];
        window.QLCT_setBusy?.(true,replaceAll?'Đang xóa và import':'Đang import dữ liệu');
        if(replaceAll){
          const current=await window.FDB.refreshAll();
          for(let i=0;i<names.length;i++){
            for(const row of current[i]||[]){
              const id=row._docId||row.id;
              if(id)await window.FDB.remove(names[i],id);
            }
          }
        }
        for(const name of names){
          const list=Array.isArray(collections[name])?collections[name]:[];
          for(const row of list){
            const {docId,data}=importDoc(row);
            await window.FDB.set(name,docId,data);
          }
        }
        await window.FDB.refreshAll?.();
        await showAppMessage('Import hoàn tất',replaceAll?'Đã xóa dữ liệu cũ và import dữ liệu mới.':'Đã import thêm dữ liệu từ file JSON.');
      }catch(error){
        console.error('Import failed',error);
        await showAppMessage('Import thất bại','File JSON không hợp lệ hoặc import thất bại.');
      }finally{
        window.QLCT_setBusy?.(false);
      }
    };
    reader.readAsText(file);
  };
  input.click();
}

async function importAllData(){
  if(!window.FDB||!window.FIREBASE_COLLECTIONS)return;
  const replaceAll=await showAppDialog({
    title:'Import dữ liệu',
    message:'Bạn muốn xóa toàn bộ dữ liệu hiện tại trước khi import, hay giữ dữ liệu hiện tại và import thêm?',
    actions:[
      {label:'Xóa rồi import',value:true,kind:'danger'},
      {label:'Import thêm',value:false,kind:'primary'},
      {label:'Hủy',value:null,kind:'ghost'}
    ]
  });
  if(replaceAll===null||replaceAll===undefined)return;
  chooseImportFile(replaceAll);
}

applyTheme();
ensureBackgroundButton();
applyStoredBackground();
ensureBackgroundPicker();
ensureBusyOverlay();

themeBtn?.addEventListener('click',()=>{
  themeIndex=(themeIndex+1)%themes.length;
  applyTheme();
});

syncMoneyVisibility();

eye?.addEventListener('click',()=>{
  const hidden=!phone.classList.contains('money-hidden');
  localStorage.setItem('moneyHidden', hidden?'1':'0');
  syncMoneyVisibility();
});

document.querySelectorAll('[data-close]').forEach(btn=>btn.addEventListener('click',()=>closeScreen(btn.dataset.close)));
document.addEventListener('click',e=>{
  if(!e.target.closest('[data-home-screen]'))return;
  closeTransientLayers();
  closeAllScreens();
  playOverviewAnimations();
});
ensureHomeButtons();
new MutationObserver(mutations=>{
  if(mutations.some(m=>m.addedNodes.length))ensureHomeButtons();
}).observe(phone,{childList:true,subtree:true});

function updateAppLoader(status=window.FIREBASE_STATUS||{}){
  if(!appLoader)return;
  const collections=status.collections||{};
  const expected=[window.FIREBASE_COLLECTIONS?.danhMuc,window.FIREBASE_COLLECTIONS?.giaoDich,window.FIREBASE_COLLECTIONS?.taiSan].filter(Boolean);
  const hasAuthRequired=Object.values(collections).some(value=>value==='auth-required');
  const hasError=Object.values(collections).some(value=>value==='error')||status.error;
  const loaded=expected.length&&expected.every(name=>typeof collections[name]==='number');

  if(!(loaded&&appUnlocked))appLoader.classList.remove('ready');
  if(!status.authReady){
    appLoader.classList.remove('auth-needed');
    if(appLoaderTitle)appLoaderTitle.textContent='Đang kiểm tra phiên đăng nhập';
    if(appLoaderText)appLoaderText.textContent='Đang khôi phục phiên Firebase đã lưu trên thiết bị.';
    if(appLoaderLogin)appLoaderLogin.textContent='Đăng nhập Google';
    return;
  }
  appLoader.classList.toggle('auth-needed',!status.auth&&hasAuthRequired);
  if(!status.auth&&hasAuthRequired){
    appUnlocked=false;
    appDataReady=false;
    if(appLoaderTitle)appLoaderTitle.textContent='Đăng nhập lần đầu';
    if(appLoaderText)appLoaderText.textContent='Ứng dụng iPhone dùng phiên riêng với Safari. Đăng nhập Google một lần, sau đó có thể mở app bằng Face ID.';
    if(appLoaderLogin)appLoaderLogin.textContent='Đăng nhập Google';
    return;
  }
  if(hasError&&!status.auth){
    if(appLoaderTitle)appLoaderTitle.textContent='Chưa kết nối được dữ liệu';
    if(appLoaderText)appLoaderText.textContent='Vui lòng kiểm tra đăng nhập Google hoặc kết nối mạng rồi thử lại.';
    appLoader.classList.add('auth-needed');
    return;
  }
  if(status.auth&&!loaded){
    if(appLoaderTitle)appLoaderTitle.textContent='Đang đồng bộ dữ liệu';
    if(appLoaderText)appLoaderText.textContent='Phiên đăng nhập đã sẵn sàng, đang tải dữ liệu từ Firebase.';
    if(appLoaderLogin)appLoaderLogin.textContent='Đăng nhập Google';
    return;
  }
  if(appLoaderTitle)appLoaderTitle.textContent='Đang đồng bộ dữ liệu';
  if(appLoaderText)appLoaderText.textContent='Kết nối Firebase và chuẩn bị không gian tài chính của bạn.';
  if(loaded){
    appDataReady=true;
    handleUnlockFlow();
  }
}

function bufferToBase64url(buffer){
  return btoa(String.fromCharCode(...new Uint8Array(buffer))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}

function base64urlToBuffer(value){
  const base64=String(value).replace(/-/g,'+').replace(/_/g,'/');
  const padded=base64+'='.repeat((4-base64.length%4)%4);
  return Uint8Array.from(atob(padded),c=>c.charCodeAt(0)).buffer;
}

function faceIdAvailable(){
  return !!(window.PublicKeyCredential&&navigator.credentials&&window.crypto?.getRandomValues);
}

async function platformFaceIdAvailable(){
  if(!faceIdAvailable())return false;
  if(typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable!=='function')return true;
  try{return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();}
  catch(_err){return false;}
}

async function registerFaceId(){
  if(!await platformFaceIdAvailable())return false;
  const user=window.FIREBASE_STATUS?.user;
  if(!user)return false;
  const idBytes=new TextEncoder().encode(user.uid||user.email||String(Date.now()));
  const credential=await navigator.credentials.create({
    publicKey:{
      challenge:crypto.getRandomValues(new Uint8Array(32)),
      rp:{name:'QLCT'},
      user:{id:idBytes,name:user.email||'qlct-user',displayName:user.displayName||user.email||'QLCT User'},
      pubKeyCredParams:[{type:'public-key',alg:-7},{type:'public-key',alg:-257}],
      authenticatorSelection:{authenticatorAttachment:'platform',residentKey:'preferred',userVerification:'required'},
      extensions:{credProps:true},
      timeout:60000,
      attestation:'none'
    }
  });
  if(!credential)return false;
  localStorage.setItem(faceIdKey,bufferToBase64url(credential.rawId));
  return true;
}

async function unlockWithFaceId(){
  if(!await platformFaceIdAvailable())return false;
  const credentialId=localStorage.getItem(faceIdKey);
  if(!credentialId)return false;
  await navigator.credentials.get({
    publicKey:{
      challenge:crypto.getRandomValues(new Uint8Array(32)),
      allowCredentials:[{type:'public-key',id:base64urlToBuffer(credentialId),transports:['internal']}],
      userVerification:'required',
      hints:['client-device'],
      timeout:60000
    }
  });
  return true;
}

async function handleUnlockFlow(){
  if(!appDataReady||appUnlocked)return;
  const credentialId=localStorage.getItem(faceIdKey);
  if(credentialId){
    appLoader.classList.add('auth-needed');
    if(appLoaderTitle)appLoaderTitle.textContent='Mở khóa bằng Face ID';
    if(appLoaderText)appLoaderText.textContent='Xác thực trên iPhone để vào ứng dụng.';
    if(appLoaderLogin)appLoaderLogin.textContent='Mở khóa';
    return;
  }
  if(!faceIdPrompted&&window.FIREBASE_STATUS?.auth&&await platformFaceIdAvailable()){
    faceIdPrompted=true;
    appLoader.classList.add('auth-needed');
    if(appLoaderTitle)appLoaderTitle.textContent='Thiết lập Face ID';
    if(appLoaderText)appLoaderText.textContent='Bật Face ID để các lần mở app sau không cần đăng nhập Google lại.';
    if(appLoaderLogin)appLoaderLogin.textContent='Bật Face ID';
    return;
  }
  appUnlocked=true;
  setTimeout(()=>appLoader.classList.add('ready'),260);
}

appLoaderLogin?.addEventListener('click',async()=>{
  if(localStorage.getItem(faceIdKey)&&appDataReady){
    try{
      const unlocked=await unlockWithFaceId();
      if(!unlocked)throw new Error('Face ID unavailable');
      appUnlocked=true;
      appLoader.classList.remove('auth-needed');
      appLoader.classList.add('ready');
    }catch(_err){
      localStorage.removeItem(faceIdKey);
      if(appLoaderTitle)appLoaderTitle.textContent='Đăng nhập Google';
      if(appLoaderText)appLoaderText.textContent='Face ID đã lưu không còn hợp lệ trên thiết bị này. Vui lòng đăng nhập Google lại một lần.';
      if(appLoaderLogin)appLoaderLogin.textContent='Đăng nhập Google';
    }
    return;
  }
  if(appDataReady&&window.FIREBASE_STATUS?.auth){
    try{await registerFaceId();}catch(_err){}
    appUnlocked=true;
    appLoader.classList.remove('auth-needed');
    appLoader.classList.add('ready');
    return;
  }
  if(typeof window.FIREBASE_SIGN_IN==='function')window.FIREBASE_SIGN_IN();
});
document.addEventListener('firebase:status',e=>updateAppLoader(e.detail));
setTimeout(()=>updateAppLoader(),0);

document.querySelector('.add-btn')?.addEventListener('click',()=>openScreen('screenTxnForm'));

const navs=document.querySelectorAll('.dock-content .nav-item');
navs[1]?.addEventListener('click',()=>{openScreen('screenTransactions');setTimeout(resetTransactionFilters,60);});
navs[2]?.addEventListener('click',()=>openScreen('screenAssets'));
navs[3]?.addEventListener('click',()=>openScreen('screenReports'));

const toolsEls=document.querySelectorAll('.tool');
toolsEls[0]?.addEventListener('click',()=>openScreen('screenGold'));
toolsEls[1]?.addEventListener('click',()=>openScreen('screenCategories'));
toolsEls[2]?.addEventListener('click',importAllData);
toolsEls[3]?.addEventListener('click',exportAllData);

window.openScreen=openScreen;
window.closeScreen=closeScreen;
window.ensureHomeButtons=ensureHomeButtons;

function fmt(n){
  return Number(n||0).toLocaleString('vi-VN')+' ₫';
}

function compactMoney(n){
  const value=Number(n||0);
  if(Math.abs(value)>=1000000000)return (value/1000000000).toLocaleString('vi-VN',{maximumFractionDigits:1})+' t\u1ef7';
  if(Math.abs(value)>=1000000)return Math.round(value/1000000).toLocaleString('vi-VN')+' tr';
  return fmt(value);
}

function assetColor(asset,index){
  const key=String([asset?.key,asset?.cls,asset?.name].filter(Boolean).join(' ')).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  if(key.includes('asset-overview-invest'))return '#10b981';
  if(key.includes('asset-overview-cash'))return '#2563eb';
  if(key.includes('asset-overview-gold'))return '#f59e0b';
  if((key.includes('gold')||key.includes('vang'))&&(key.includes('cuoi')||key.includes('wedding')))return '#ec4899';
  if((key.includes('gold')||key.includes('vang'))&&key.includes('98'))return '#d97706';
  if(key.includes('gold')||key.includes('vang'))return '#f59e0b';
  if(key.includes('cash')||key.includes('bank'))return '#2563eb';
  if(key.includes('stock')||key.includes('co-phieu'))return '#10b981';
  if(key.includes('saving')||key.includes('tiet-kiem'))return '#8b5cf6';
  if(key.includes('real')||key.includes('nha')||key.includes('dat'))return '#ef4444';
  return ['#06b6d4','#14b8a6','#6366f1','#f97316','#84cc16'][index%5];
}

function plainAssetText(asset){
  return String([asset?.key,asset?.cls,asset?.name].filter(Boolean).join(' '))
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'')
    .replace(/đ/g,'d');
}

function overviewAssetGroups(assets){
  const groups=[
    {key:'asset-overview-cash',cls:'cash',name:'Tiền & ngân hàng',value:0},
    {key:'asset-overview-gold',cls:'gold',name:'Vàng',value:0},
    {key:'asset-overview-invest',cls:'stock',name:'Tài sản đầu tư',value:0}
  ];
  (assets||[]).forEach(asset=>{
    const text=plainAssetText(asset);
    const value=Number(asset.value||0);
    if(text.includes('cash')||text.includes('bank')||text.includes('tien-mat')||text.includes('tien-gui')||text.includes('ngan-hang')){
      groups[0].value+=value;
    }else if(text.includes('gold')||text.includes('vang')){
      groups[1].value+=value;
    }else{
      groups[2].value+=value;
    }
  });
  return groups.filter(group=>Number(group.value||0)>0);
}

function plainOverviewText(value){
  return String(value||'')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'')
    .replace(/[Äđ]/g,'d')
    .replace(/[^a-z0-9]+/g,'-')
    .replace(/^-+|-+$/g,'');
}

function assetColor(asset,index){
  const key=plainOverviewText([asset?.key,asset?.cls,asset?.name].filter(Boolean).join(' '));
  if(key.includes('asset-overview-cash'))return '#2563eb';
  if(key.includes('asset-overview-gold-wedding'))return '#ec4899';
  if(key.includes('asset-overview-gold-98'))return '#d97706';
  if(key.includes('asset-overview-gold'))return '#f59e0b';
  if(key.includes('asset-overview-saving'))return '#8b5cf6';
  if(key.includes('asset-overview-invest'))return '#10b981';
  if((key.includes('gold')||key.includes('vang'))&&(key.includes('cuoi')||key.includes('wedding')))return '#ec4899';
  if((key.includes('gold')||key.includes('vang'))&&key.includes('98'))return '#d97706';
  if(key.includes('gold')||key.includes('vang'))return '#f59e0b';
  if(key.includes('cash')||key.includes('bank'))return '#2563eb';
  if(key.includes('saving')||key.includes('tiet-kiem'))return '#8b5cf6';
  if(key.includes('stock')||key.includes('co-phieu'))return '#10b981';
  if(key.includes('real')||key.includes('nha')||key.includes('dat'))return '#ef4444';
  return ['#06b6d4','#14b8a6','#6366f1','#f97316','#84cc16'][index%5];
}

function overviewAssetGroups(assets){
  const groups=[
    {key:'asset-overview-cash',cls:'cash',name:'Tiền & ngân hàng',value:0},
    {key:'asset-overview-gold-wedding',cls:'gold gold-wedding',name:'Vàng cưới',value:0},
    {key:'asset-overview-gold-98',cls:'gold gold-98',name:'Vàng 98%',value:0},
    {key:'asset-overview-gold',cls:'gold',name:'Vàng',value:0},
    {key:'asset-overview-saving',cls:'saving',name:'Tiết kiệm',value:0},
    {key:'asset-overview-invest',cls:'stock',name:'Tài sản đầu tư',value:0}
  ];
  (assets||[]).forEach(asset=>{
    const text=plainOverviewText([asset?.key,asset?.cls,asset?.name].filter(Boolean).join(' '));
    const value=Number(asset.value||0);
    if(text.includes('cash')||text.includes('bank')||text.includes('tien-mat')||text.includes('tien-gui')||text.includes('ngan-hang')){
      groups[0].value+=value;
    }else if((text.includes('gold')||text.includes('vang'))&&(text.includes('cuoi')||text.includes('wedding'))){
      groups[1].value+=value;
    }else if((text.includes('gold')||text.includes('vang'))&&text.includes('98')){
      groups[2].value+=value;
    }else if(text.includes('gold')||text.includes('vang')){
      groups[3].value+=value;
    }else if(text.includes('saving')||text.includes('tiet-kiem')){
      groups[4].value+=value;
    }else{
      groups[5].value+=value;
    }
  });
  return groups.filter(group=>Number(group.value||0)>0);
}

function formatOverviewMonth(month){
  const [year,value]=String(month||currentMonth()).split('-');
  return `${value||String(new Date().getMonth()+1).padStart(2,'0')}/${year||new Date().getFullYear()}`;
}

function isInvestmentExpense(tx){
  const text=plainOverviewText([tx?.large,tx?.group,tx?.child,tx?.type,tx?.assetType,tx?.loai_tai_san,tx?.loaiTaiSan].filter(Boolean).join(' '));
  return text.includes('dau-tu')
    ||text.includes('thu-hoi-tai-san')
    ||text.includes('bao-hiem-tich-luy')
    ||text.includes('bao-hiem')
    ||text.includes('tiet-kiem')
    ||text.includes('chung-khoan')
    ||text.includes('co-phieu')
    ||text.includes('bat-dong-san')
    ||text.includes('bds')
    ||text.includes('nha')
    ||text.includes('dat');
}

function renderAssetDonut(assets,totalAssets){
  const svg=document.querySelector('.donut-svg');
  if(!svg)return;
  const radius=60;
  const circumference=2*Math.PI*radius;
  const segments=assets.filter(x=>Number(x.value||0)>0);
  let offset=0;
  const base='<circle cx="80" cy="80" r="60" stroke="#e6eef8"/>';
  if(!segments.length){
    svg.innerHTML=base+'<circle cx="80" cy="80" r="60" stroke="#cbd5e1" stroke-dasharray="0 377" stroke-dashoffset="0"/>';
    return;
  }
  svg.innerHTML=base+segments.map((asset,index)=>{
    const length=Number(asset.value||0)/totalAssets*circumference;
    const dash=`${Math.max(length-.8,0).toFixed(2)} ${circumference.toFixed(2)}`;
    const circle=`<circle cx="80" cy="80" r="${radius}" stroke="${assetColor(asset,index)}" stroke-dasharray="${dash}" stroke-dashoffset="${(-offset).toFixed(2)}"/>`;
    offset+=length;
    return circle;
  }).join('');
}

function currentMonth(){
  const d=new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}

function activeMonth(rows){
  const month=currentMonth();
  if(rows.some(x=>String(x.date||'').slice(0,7)===month))return month;
  return rows.map(x=>String(x.date||'').slice(0,7)).filter(Boolean).sort().pop()||month;
}

function renderOverviewFromFirebase(){
  const txns=typeof window.TXN_getTransactions==='function'?window.TXN_getTransactions():[];
  const assetState=typeof window.ASSET52_getAssets==='function'?window.ASSET52_getAssets():null;
  const assets=assetState?.assets||[];
  const month=activeMonth(txns);
  const monthRows=txns.filter(x=>String(x.date||'').slice(0,7)===month);
  const income=monthRows
    .filter(x=>x.large==='Thu nhập'||x.type==='INCOME')
    .reduce((sum,x)=>sum+Number(x.amount||0),0);
  const expenseRows=monthRows.filter(x=>!(x.large==='Thu nhập'||x.type==='INCOME'));
  const expense=expenseRows.reduce((sum,x)=>sum+Number(x.amount||0),0);
  const totalAssets=assets.reduce((sum,x)=>sum+Number(x.value||0),0);
  const overviewAssets=overviewAssetGroups(assets);
  const cashAssets=assets.filter(x=>{
    const key=String([x.key,x.cls,x.name].filter(Boolean).join(' ')).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
    return key.includes('cash')||key.includes('bank')||key.includes('tien-mat')||key.includes('tien-gui')||key.includes('ngan-hang');
  });
  const cashTotal=cashAssets.reduce((sum,x)=>sum+Number(x.value||0),0);

  const cashValue=document.querySelector('.cash-value .real');
  const incomeValue=document.querySelector('.stat.income .real');
  const expenseValue=document.querySelector('.stat.expense .real');
  const expenseTotal=document.querySelector('.expense-total');
  const expenseTitle=document.querySelector('.expense-head h3');
  const expenseChart=document.querySelector('.expense-chart');
  const donutCenter=document.querySelector('.donut-center b');
  const legend=document.querySelector('.legend');

  if(cashValue)cashValue.textContent=fmt(cashTotal);
  if(incomeValue)incomeValue.textContent=fmt(income);
  if(expenseValue)expenseValue.textContent=fmt(expense);
  if(expenseTotal)expenseTotal.textContent=fmt(expense);
  if(expenseTitle)expenseTitle.textContent=`Chi tiêu theo nhóm tháng ${formatOverviewMonth(month)}`;
  if(donutCenter)donutCenter.textContent=compactMoney(totalAssets);
  renderAssetDonut(overviewAssets,totalAssets);

  if(expenseChart){
    const byGroup={};
    let expenseGroups=[];
    try{
      const categoryRows=typeof window.CAT90_getRows==='function'?window.CAT90_getRows():[];
      expenseGroups=Array.from(new Set(categoryRows.filter(x=>x.large==='Chi tiêu').map(x=>x.group).filter(Boolean)));
    }catch(_err){
      expenseGroups=[];
    }
    expenseGroups.filter(group=>!isInvestmentExpense({group})).forEach(group=>{byGroup[group]=0;});
    expenseRows.filter(x=>!isInvestmentExpense(x)).forEach(x=>{
      const key=x.group||x.child||x.large||'Khác';
      byGroup[key]=(byGroup[key]||0)+Number(x.amount||0);
    });
    const rows=Object.entries(byGroup).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],'vi'));
    const max=Math.max(...rows.map(x=>x[1]),1);
    expenseChart.innerHTML=rows.length
      ? rows.map(([name,value])=>`<div class="expense-row"><span class="expense-name">${name}</span><div class="bar-track"><div class="bar-fill" style="width:${Math.round(value/max*100)}%"></div></div><span class="expense-percent">${fmt(value)}</span></div>`).join('')
      : '<div class="expense-row"><span class="expense-name">Chưa có dữ liệu</span><div class="bar-track"><div class="bar-fill" style="width:0%"></div></div><span class="expense-percent">0 ₫</span></div>';
  }

  if(legend){
    legend.innerHTML=overviewAssets.length
      ? overviewAssets.map((x,i)=>{
          const percent=totalAssets?Math.round(Number(x.value||0)/totalAssets*100):0;
          return `<div class="legend-row"><span class="legend-name"><span class="dot" style="background:${assetColor(x,i)}"></span><span>${x.name}</span></span><b class="legend-money">${fmt(x.value)}</b><b>${percent}%</b></div>`;
        }).join('')
      : '<div class="legend-row"><span class="dot" style="background:#cbd5e1"></span><span>Chưa có tài sản</span><b>0%</b></div>';
  }
}

document.addEventListener('txn16:changed',renderOverviewFromFirebase);
document.addEventListener('asset52:changed',renderOverviewFromFirebase);
document.addEventListener('DOMContentLoaded',()=>{renderOverviewFromFirebase();syncMoneyVisibility();playOverviewAnimations();});
preventPwaDoubleTapZoom();
ensureNumberKeyboard();
renderOverviewFromFirebase();
setTimeout(playOverviewAnimations,0);

function activeSlideScreen(){
  const detail=document.getElementById('screenAssetDetail');
  if(detail?.classList.contains('active'))return detail;
  return [...document.querySelectorAll('.slide-screen.active')].pop()||null;
}

function goBackBySwipe(){
  const active=activeSlideScreen();
  if(active?.id==='screenAssetDetail'){
    active.classList.remove('active');
    active.setAttribute('aria-hidden','true');
    return;
  }
  if(active)closeScreen(active.id);
}

(function bindSwipeNavigation(){
  if(!phone)return;
  let startX=0,startY=0,startTarget=null;
  phone.addEventListener('touchstart',e=>{
    const t=e.touches[0];
    if(!t)return;
    startX=t.clientX;
    startY=t.clientY;
    startTarget=e.target;
  },{passive:true});
  phone.addEventListener('touchend',e=>{
    if(startTarget?.closest('#cat90Editor'))return;
    if(document.getElementById('cat90Editor')?.classList.contains('active'))return;
    if(startTarget?.closest('input,textarea,select,button,.gold77-sheet,.txn16-sheet,.add39-sheet,.cat90-sheet,.report72-sheet'))return;
    const t=e.changedTouches[0];
    if(!t)return;
    const dx=t.clientX-startX;
    const dy=t.clientY-startY;
    if(Math.abs(dx)<72||Math.abs(dx)<Math.abs(dy)*1.25)return;
    if(dx>0)goBackBySwipe();
  },{passive:true});
})();

(function lockOuterPageScroll(){
  if(!phone)return;
  const scrollableSelector=[
    '.slide-body',
    '.txn16-list',
    '.txn16-edit-body',
    '.txn16-sheet',
    '.add39-sheet',
    '.cat90-sheet',
    '.cat90-editor-body',
    '.report72-sheet',
    '.report72-detail-list',
    '.asset53-scroll-list',
    '.gold77-sheet'
  ].join(',');

  document.addEventListener('touchmove',e=>{
    const scroller=e.target?.closest?.(scrollableSelector);
    if(!phone.contains(e.target)||!scroller){
      e.preventDefault();
    }
  },{passive:false});
})();
