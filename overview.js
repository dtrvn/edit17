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
let bgImagesDirectoryHandle=null;
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
  function appendValue(value){
    setValue(String(target?.value||'')+String(value||''));
  }
  function handleNumkeyAction(action){
    if(!target)return true;
    if(action==='done'){close();return true;}
    if(action==='clear'){setValue('');return true;}
    if(action==='back'){setValue(String(target?.value||'').slice(0,-1));return true;}
    if(action==='decimal'){
      if(decimalAllowed()&&!String(target?.value||'').includes('.'))appendValue('.');
      return true;
    }
    appendValue(action);
    return true;
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
      window.__numkeyClosedAt=Date.now();
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
  function panelPress(e){
    const action=e.target.closest('[data-numkey-done]')?'done'
      :e.target.closest('[data-numkey-clear]')?'clear'
      :e.target.closest('[data-numkey-back]')?'back'
      :e.target.closest('[data-numkey-decimal]')?'decimal'
      :e.target.closest('[data-numkey]')?.dataset.numkey;
    if(action===undefined)return;
    if(e.cancelable)e.preventDefault();
    handleNumkeyAction(action);
  }
  panel.addEventListener('pointerdown',panelPress,{passive:false});
  panel.addEventListener('click',e=>{
    if(e.detail===0)panelPress(e);
  });
  document.addEventListener('keydown',e=>{
    if(!target||!panel?.classList.contains('show'))return;
    const key=e.key;
    const code=e.code;
    let action;
    if(/^\d$/.test(key))action=key;
    else if(/^Numpad\d$/.test(code))action=code.slice(-1);
    else if(key==='Backspace')action='back';
    else if(key==='Delete')action='clear';
    else if(key==='Enter'||key==='NumpadEnter')action='done';
    else if(key==='Escape')action='done';
    else if(key==='.'||key===','||key==='Decimal'||code==='NumpadDecimal')action='decimal';
    else return;
    if(e.cancelable)e.preventDefault();
    handleNumkeyAction(action);
  },true);
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
  if(typeof window.TXN_closeEditScreen==='function')window.TXN_closeEditScreen();
  else document.querySelectorAll('#txn16Edit').forEach(el=>el.remove());
  if(typeof window.closeCategoryEditor==='function')window.closeCategoryEditor();
  else {
    const catEditor=document.getElementById('cat90Editor');
    catEditor?.classList.remove('active');
    catEditor?.setAttribute('aria-hidden','true');
  }
}

function closeAllScreens(options={}){
  document.querySelectorAll('.slide-screen.active').forEach(el=>{
    if(options.instant)el.classList.add('no-exit-transition');
    el.classList.remove('active');
    el.setAttribute('aria-hidden','true');
    if(options.instant)requestAnimationFrame(()=>el.classList.remove('no-exit-transition'));
  });
  const assetDetail=document.getElementById('screenAssetDetail');
  if(options.instant)assetDetail?.classList.add('no-exit-transition');
  assetDetail?.classList.remove('active');
  assetDetail?.setAttribute('aria-hidden','true');
  if(options.instant)requestAnimationFrame(()=>assetDetail?.classList.remove('no-exit-transition'));
  if(!options.skipDock)syncDockNavigation();
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
  document.getElementById('bg90Apply').addEventListener('click',async ()=>{
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
  async function nextImageFileName(dir=null){
    const all=presetBackgrounds.concat(userBackgrounds());
    let max=all.reduce((highest,item)=>{
      const match=String(item?.src||item?.name||'').match(/(?:^|\/)image(\d+)\.(?:jpe?g|png|webp)$/i);
      return match?Math.max(highest,Number(match[1])||0):highest;
    },0);
    if(dir?.entries){
      for await(const [name] of dir.entries()){
        const match=String(name||'').match(/^image(\d+)\.(?:jpe?g|png|webp)$/i);
        if(match)max=Math.max(max,Number(match[1])||0);
      }
    }
    return `image${max+1}.jpg`;
  }
  async function imagesDirectory(){
    if(bgImagesDirectoryHandle)return bgImagesDirectoryHandle;
    if(!window.showDirectoryPicker)return null;
    const handle=await window.showDirectoryPicker({mode:'readwrite'});
    if(handle.name&&handle.name.toLowerCase()!=='images')throw new Error('Chọn sai thư mục images');
    bgImagesDirectoryHandle=handle;
    return handle;
  }
  async function saveCanvasToImages(canvasTarget){
    const blob=await new Promise(resolve=>canvasTarget.toBlob(resolve,'image/jpeg',0.9));
    if(!blob)throw new Error('Không tạo được file ảnh');
    const dir=await imagesDirectory();
    const fileName=await nextImageFileName(dir);
    if(!dir){
      return {name:fileName.replace(/\.[^.]+$/,''),src:canvasTarget.toDataURL('image/jpeg',0.9),stored:'local'};
    }
    const fileHandle=await dir.getFileHandle(fileName,{create:true});
    const writable=await fileHandle.createWritable();
    await writable.write(blob);
    await writable.close();
    return {name:fileName.replace(/\.[^.]+$/,''),src:`images/${fileName}`,fileName,stored:'images'};
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
      closeScreen('screenBackgrounds');
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
  async function removeItem(item){
    if(item.kind==='preset'){
      const hidden=readJson(bgHiddenPresetKey,[]);
      if(!hidden.includes(item.src))hidden.push(item.src);
      saveJson(bgHiddenPresetKey,hidden);
    }else{
      saveJson(bgUserKey,userBackgrounds().filter(x=>x.id!==item.id));
      if(item.stored==='images'&&item.fileName&&bgImagesDirectoryHandle){
        try{await bgImagesDirectoryHandle.removeEntry(item.fileName);}catch(_err){}
      }
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
  document.getElementById('bg90Default').addEventListener('click',()=>{clearBackground();renderGrid();closeScreen('screenBackgrounds');});
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
        cancelValue:false,
        actions:[
          {label:'Xóa',value:true,kind:'danger'},
          {label:'Hủy',value:false,kind:'ghost'}
        ]
      });
      if(confirmed)await removeItem(item);
      return;
    }
    if(use){
      const item=items[Number(use.dataset.bg90Use)];
      if(!item?.src)return;
      const confirmed=await showAppDialog({
        title:'Chọn hình nền',
        message:`Bạn có muốn chọn "${item.name||'ảnh này'}" làm background không?`,
        cancelValue:false,
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
  document.getElementById('bg90Apply').addEventListener('click',async ()=>{
    if(!cropState.img)return;
    const out=document.createElement('canvas');
    out.width=phone.clientWidth||390;
    out.height=phone.clientHeight||844;
    const outCtx=out.getContext('2d');
    const sx=out.width/canvas.width,sy=out.height/canvas.height;
    outCtx.drawImage(cropState.img,cropState.x*sx,cropState.y*sy,cropState.img.width*cropState.scale*sx,cropState.img.height*cropState.scale*sy);
    try{
      const saved=await saveCanvasToImages(out);
      const list=userBackgrounds();
      list.unshift({id:'bg'+Date.now(),...saved});
      saveJson(bgUserKey,list.slice(0,12));
      closeCrop();
      renderGrid();
    }catch(_err){
      await showAppMessage('Chưa lưu được ảnh','Vui lòng chọn đúng thư mục images và cấp quyền ghi để lưu ảnh mới.');
    }
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

function showAppDialog({title='',message='',actions=[],cancelValue=undefined}={}){
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
      if(e.target===overlay){
        overlay.remove();
        resolve(cancelValue);
        return;
      }
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

const dockNavScreens={screenTransactions:1,screenAssets:2,screenReports:3};

function syncDockNavigation(activeScreenId){
  const content=document.querySelector('.dock-content');
  const items=Array.from(document.querySelectorAll('.dock-content .nav-item'));
  const activeId=activeScreenId&&Object.prototype.hasOwnProperty.call(dockNavScreens,activeScreenId)
    ? activeScreenId
    : document.querySelector('#screenTransactions.active,#screenAssets.active,#screenReports.active')?.id;
  const activeIndex=activeId?dockNavScreens[activeId]:0;
  items.forEach((item,index)=>item.classList.toggle('active',index===activeIndex));
  if(phone){
    const detailActive=!!document.querySelector('#screenTxnForm.active,#screenReportDetail.active,#screenReportChildDetail.active,#screenAssetDetail.active,#screenCategories.active,#screenDataTools.active,#screenGold.active');
    phone.classList.toggle('dock-over-slide',activeIndex>0&&!detailActive);
    phone.dataset.navIndex=String(activeIndex);
  }
  const activeItem=items[activeIndex];
  if(!content||!activeItem)return;
  requestAnimationFrame(()=>{
    const contentRect=content.getBoundingClientRect();
    const itemRect=activeItem.getBoundingClientRect();
    const width=Math.min(62,Math.max(52,itemRect.width-8));
    const left=itemRect.left-contentRect.left+(itemRect.width-width)/2;
    content.style.setProperty('--dock-active-left',`${left}px`);
    content.style.setProperty('--dock-active-width',`${width}px`);
  });
}

function openScreen(id){
  closeTransientLayers();
  closeAllScreens({instant:true,skipDock:true});
  ensureHomeButtons();
  const el=document.getElementById(id);
  if(el){
    ensureHomeButtons(el);
    el.classList.add('active');
    el.setAttribute('aria-hidden','false');
  }
  syncDockNavigation(id);
}

function closeScreen(id){
  const el=document.getElementById(id);
  if(el){
    el.classList.remove('active');
    el.setAttribute('aria-hidden','true');
  }
  closeTransientLayers();
  syncDockNavigation();
  playOverviewAnimations();
}

function resetTransactionFilters(){
  const clearBtn=document.getElementById('txn16Clear');
  if(clearBtn) clearBtn.click();
}

let homeRefreshPromise=null;

async function reloadAllDataFromHome(){
  if(!window.FDB?.refreshAll)return;
  if(homeRefreshPromise)return homeRefreshPromise;
  closeTransientLayers();
  closeAllScreens();
  playOverviewAnimations();
  window.QLCT_setBusy?.(true,'Đang tải lại dữ liệu');
  homeRefreshPromise=window.FDB.refreshAll()
    .catch(error=>{
      console.error('Home refresh failed',error);
      window.showAppMessage?.('Không tải lại được dữ liệu',error?.message||'Vui lòng thử lại.');
    })
    .finally(()=>{
      homeRefreshPromise=null;
      closeTransientLayers();
      closeAllScreens();
      playOverviewAnimations();
      window.QLCT_setBusy?.(false);
    });
  return homeRefreshPromise;
}

function cleanExportRow(row){
  return JSON.parse(JSON.stringify(row||{}));
}

function exportText(value){
  return String(value??'').trim();
}

function exportPlainText(value){
  return exportText(value).toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'')
    .replace(/[đĐ]/g,'d');
}

function exportFirstValue(row,keys){
  for(const key of keys){
    const value=row?.[key];
    if(value!==undefined&&value!==null&&String(value).trim())return value;
  }
  return '';
}

function exportNumber(value){
  if(typeof value==='number')return value;
  return Number(String(value||'').replace(/[^\d.-]/g,''))||0;
}

function exportDate(value){
  const text=exportText(value);
  if(value&&typeof value.toDate==='function')return value.toDate().toISOString().slice(0,10);
  let match=text.match(/^(\d{4})[-/](\d{1,2})(?:[-/](\d{1,2}))?/);
  if(match)return `${match[1]}-${String(match[2]).padStart(2,'0')}-${String(match[3]||1).padStart(2,'0')}`;
  match=text.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if(match)return `${match[3]}-${String(match[2]).padStart(2,'0')}-${String(match[1]).padStart(2,'0')}`;
  return text.slice(0,10);
}

function normalizeExportTx(row){
  const large=exportText(exportFirstValue(row,['large','loai_lon','loaiLon','loai','LoaiLon','Loai','typeName']));
  const type=exportText(exportFirstValue(row,['type','loai_giao_dich','kieu','loaiGiaoDich']));
  return {
    id:exportText(row?._docId||row?.id||row?.external_id),
    date:exportDate(exportFirstValue(row,['date','ngay','ngay_giao_dich','ngayGiaoDich','created_at','createdAt','Ngay','NgayGiaoDich'])),
    time:exportText(exportFirstValue(row,['time','gio','createdTime'])||'00:00:00'),
    large,
    group:exportText(exportFirstValue(row,['group','nhom_danh_muc','nhom','nhomDanhMuc','category','Nhom','NhomDanhMuc'])),
    child:exportText(exportFirstValue(row,['child','hang_muc_con','hangMuc','hangMucCon','ten','name','title','HangMuc','HangMucCon'])),
    type,
    amount:exportNumber(exportFirstValue(row,['amount','so_tien','soTien','money','value','gia_tri','giaTri','SoTien','GiaTri'])),
    note:exportText(exportFirstValue(row,['note','ghi_chu','ghiChu','description','moTa','GhiChu'])),
    assetType:exportText(exportFirstValue(row,['assetType','loai_tai_san','loaiTaiSan'])),
    assetName:exportText(exportFirstValue(row,['assetName','ten_tai_san','tenTaiSan'])),
    assetQty:exportNumber(exportFirstValue(row,['assetQty','so_luong','soLuong','quantity','qty'])),
    assetUnit:exportText(exportFirstValue(row,['assetUnit','don_vi','donVi'])),
    assetPrice:exportNumber(exportFirstValue(row,['assetPrice','don_gia','donGia','price','gia_hien_tai'])),
    fee:exportNumber(exportFirstValue(row,['fee','phi','phí'])),
    raw:row
  };
}

function normalizeExportAsset(row){
  const key=exportText(row?.key||row?.type||row?.assetType||row?.category||row?.loai_tai_san||row?.loaiTaiSan||row?.loai||row?.name||row?.ten_tai_san||row?.ten||'');
  const name=exportText(row?.name||row?.ten_tai_san||row?.ten||row?.title||row?.groupName||row?.assetName||row?.label||key||'Tài sản');
  return {
    id:exportText(row?._docId||row?.id||row?.external_id),
    key,
    name,
    type:exportText(row?.loai_tai_san||row?.loaiTaiSan||row?.assetType||row?.type||key),
    group:exportText(row?.nhom_danh_muc||row?.group||row?.category||''),
    value:exportNumber(row?.value??row?.gia_tri_hien_tai??row?.current??row?.gia_tri??row?.giaTri??row?.so_tien),
    cost:exportNumber(row?.tong_gia_von??row?.cost??row?.gia_von_binh_quan??row?.so_tien),
    qty:exportNumber(row?.so_luong??row?.soLuong??row?.qty??row?.quantity),
    unit:exportText(row?.don_vi||row?.donVi),
    price:exportNumber(row?.gia_hien_tai??row?.price??row?.don_gia),
    date:exportDate(row?.ngay||row?.date||row?.ngay_mua_ban||row?.ngay_mua||row?.updated_at||row?.created_at),
    raw:row
  };
}

function exportTxKind(tx){
  const text=exportPlainText([tx.large,tx.type].join(' '));
  if(text.includes('thu-nhap')||text.includes('thu nhap')||text.includes('income'))return 'income';
  if(text.includes('thu-hoi')||text.includes('thu hoi')||text.includes('divest')||text.includes('sell'))return 'divest';
  if(text.includes('dau-tu')||text.includes('dau tu')||text.includes('invest')||exportPlainText([tx.group,tx.child,tx.assetType].join(' ')).match(/vang|bao hiem|chung khoan|co phieu|tiet kiem|bat dong san|land|stock|saving|insurance|gold/))return 'invest';
  return 'expense';
}

function exportAssetKind(asset){
  const text=exportPlainText([asset.key,asset.type,asset.name,asset.group].join(' '));
  if(text.match(/cash|bank|tien mat|tien gui|ngan hang/))return 'Tiền & ngân hàng';
  if(text.match(/vang|gold/))return 'Vàng';
  if(text.match(/tiet kiem|saving|deposit/))return 'Tiết kiệm';
  if(text.match(/bao hiem|insurance/))return 'Bảo hiểm tích lũy';
  if(text.match(/bat dong san|bds|nha|dat|land|real/))return 'Bất động sản';
  if(text.match(/chung khoan|co phieu|stock|quy/))return 'Chứng khoán';
  return 'Tài sản khác';
}

function groupSum(rows,keyFn,valueFn){
  return rows.reduce((acc,row)=>{
    const key=keyFn(row)||'Khác';
    acc[key]=(acc[key]||0)+Number(valueFn(row)||0);
    return acc;
  },{});
}

function monthKeyFromParts(year,month){
  return `${year}-${String(month).padStart(2,'0')}`;
}

function availableExportYears(txns){
  return Array.from(new Set(txns.map(tx=>String(tx.date||'').slice(0,4)).filter(Boolean))).sort((a,b)=>Number(b)-Number(a));
}

function xmlEscape(value){
  return String(value??'')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,'')
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&apos;');
}

function colName(index){
  let name='';
  while(index>0){
    const mod=(index-1)%26;
    name=String.fromCharCode(65+mod)+name;
    index=Math.floor((index-1)/26);
  }
  return name;
}

function sheetCell(ref,value,style=0){
  if(value===null||value===undefined)value='';
  const s=style?` s="${style}"`:'';
  if(typeof value==='number'&&Number.isFinite(value))return `<c r="${ref}"${s}><v>${value}</v></c>`;
  return `<c r="${ref}" t="inlineStr"${s}><is><t>${xmlEscape(value)}</t></is></c>`;
}

function sheetRow(index,cells,height){
  const h=height?` ht="${height}" customHeight="1"`:'';
  return `<row r="${index}"${h}>${cells.map((cell,i)=>sheetCell(`${colName(i+1)}${index}`,cell.value,cell.style)).join('')}</row>`;
}

function tableRows(start,rows,styleHeader=2,styleText=0){
  const xml=[];
  rows.forEach((row,idx)=>{
    const style=idx===0?styleHeader:styleText;
    xml.push(sheetRow(start+idx,row.map(value=>({value,style}))));
  });
  return xml;
}

function barText(value,max){
  const count=max?Math.round(Number(value||0)/max*18):0;
  return '█'.repeat(Math.max(1,count));
}

function buildWorksheet({rows,merges=[],cols=[]}){
  const colXml=cols.length?`<cols>${cols.map((w,i)=>`<col min="${i+1}" max="${i+1}" width="${w}" customWidth="1"/>`).join('')}</cols>`:'';
  const mergeXml=merges.length?`<mergeCells count="${merges.length}">${merges.map(ref=>`<mergeCell ref="${ref}"/>`).join('')}</mergeCells>`:'';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${colXml}<sheetData>${rows.join('')}</sheetData>${mergeXml}</worksheet>`;
}

function buildExportSummarySheet(txns,assets,scopeLabel){
  const income=txns.filter(tx=>exportTxKind(tx)==='income').reduce((s,tx)=>s+tx.amount,0);
  const expense=txns.filter(tx=>exportTxKind(tx)==='expense').reduce((s,tx)=>s+tx.amount,0);
  const invest=txns.filter(tx=>exportTxKind(tx)==='invest').reduce((s,tx)=>s+tx.amount,0);
  const divest=txns.filter(tx=>exportTxKind(tx)==='divest').reduce((s,tx)=>s+tx.amount,0);
  const assetTotal=assets.reduce((s,a)=>s+a.value,0);
  const monthGroups=groupSum(txns,tx=>String(tx.date||'').slice(0,7),tx=>tx.amount);
  const expenseGroups=groupSum(txns.filter(tx=>exportTxKind(tx)==='expense'),tx=>tx.group||tx.child,tx=>tx.amount);
  const assetGroups=groupSum(assets,exportAssetKind,a=>a.value);
  const monthly=Object.keys(monthGroups).sort().map(key=>{
    const rows=txns.filter(tx=>String(tx.date||'').slice(0,7)===key);
    return [key,rows.filter(tx=>exportTxKind(tx)==='income').reduce((s,tx)=>s+tx.amount,0),rows.filter(tx=>exportTxKind(tx)==='expense').reduce((s,tx)=>s+tx.amount,0),rows.filter(tx=>exportTxKind(tx)==='invest').reduce((s,tx)=>s+tx.amount,0)];
  });
  const maxMonth=Math.max(...monthly.flatMap(row=>row.slice(1)),1);
  const expenseEntries=Object.entries(expenseGroups).sort((a,b)=>b[1]-a[1]);
  const assetEntries=Object.entries(assetGroups).sort((a,b)=>b[1]-a[1]);
  const maxExpense=Math.max(...expenseEntries.map(x=>x[1]),1);
  const maxAsset=Math.max(...assetEntries.map(x=>x[1]),1);
  const rows=[];
  rows.push(sheetRow(1,[{value:'Báo cáo tổng quan tài chính',style:1}],26));
  rows.push(sheetRow(2,[{value:`Phạm vi: ${scopeLabel}`,style:6},{value:`Export: ${new Date().toLocaleString('vi-VN')}`,style:6}],20));
  rows.push(sheetRow(4,[{value:'Thu nhập',style:3},{value:'Chi tiêu',style:4},{value:'Đầu tư',style:5},{value:'Thu hồi tài sản',style:3},{value:'Thu - Chi',style:1},{value:'Tổng tài sản',style:1}],22));
  rows.push(sheetRow(5,[{value:income,style:7},{value:expense,style:7},{value:invest,style:7},{value:divest,style:7},{value:income+divest-expense-invest,style:7},{value:assetTotal,style:7}],24));
  rows.push(sheetRow(7,[{value:'Biểu đồ thu/chi/đầu tư theo tháng',style:1}],22));
  rows.push(sheetRow(8,[{value:'Tháng',style:2},{value:'Thu nhập',style:2},{value:'Chi tiêu',style:2},{value:'Đầu tư',style:2},{value:'Thanh mô tả',style:2}],18));
  let cursor=9;
  monthly.forEach(row=>{
    rows.push(sheetRow(cursor,[{value:row[0],style:0},{value:row[1],style:7},{value:row[2],style:7},{value:row[3],style:7},{value:`Thu ${barText(row[1],maxMonth)}  Chi ${barText(row[2],maxMonth)}  ĐT ${barText(row[3],maxMonth)}`,style:8}]));
    cursor++;
  });
  cursor+=2;
  rows.push(sheetRow(cursor,[{value:'Chi tiêu theo nhóm',style:1},{value:'',style:1},{value:'Tài sản theo loại',style:1}],22));
  cursor++;
  rows.push(sheetRow(cursor,[{value:'Nhóm chi tiêu',style:2},{value:'Giá trị',style:2},{value:'Loại tài sản',style:2},{value:'Giá trị',style:2},{value:'Thanh mô tả',style:2}],18));
  cursor++;
  const chartLen=Math.max(expenseEntries.length,assetEntries.length,1);
  for(let i=0;i<chartLen;i++){
    const exp=expenseEntries[i]||['',0];
    const asset=assetEntries[i]||['',0];
    rows.push(sheetRow(cursor,[{value:exp[0],style:0},{value:exp[1]||'',style:7},{value:asset[0],style:0},{value:asset[1]||'',style:7},{value:asset[0]?barText(asset[1],maxAsset):barText(exp[1],maxExpense),style:8}]));
    cursor++;
  }
  return {name:'Tong quan',xml:buildWorksheet({rows,merges:['A1:F1'],cols:[20,16,20,16,16,44]})};
}

function buildMonthSheet(year,month,txns){
  const key=monthKeyFromParts(year,month);
  const rowsForMonth=txns.filter(tx=>String(tx.date||'').slice(0,7)===key);
  const income=rowsForMonth.filter(tx=>exportTxKind(tx)==='income').reduce((s,tx)=>s+tx.amount,0);
  const expense=rowsForMonth.filter(tx=>exportTxKind(tx)==='expense').reduce((s,tx)=>s+tx.amount,0);
  const invest=rowsForMonth.filter(tx=>exportTxKind(tx)==='invest').reduce((s,tx)=>s+tx.amount,0);
  const divest=rowsForMonth.filter(tx=>exportTxKind(tx)==='divest').reduce((s,tx)=>s+tx.amount,0);
  const byGroup=Object.entries(groupSum(rowsForMonth,tx=>tx.group||tx.child,tx=>tx.amount)).sort((a,b)=>b[1]-a[1]);
  const rows=[];
  rows.push(sheetRow(1,[{value:`Tháng ${month}/${year}`,style:1}],26));
  rows.push(sheetRow(3,[{value:'Thu nhập',style:3},{value:'Chi tiêu',style:4},{value:'Đầu tư',style:5},{value:'Thu hồi tài sản',style:3},{value:'Thu - Chi',style:1}],22));
  rows.push(sheetRow(4,[{value:income,style:7},{value:expense,style:7},{value:invest,style:7},{value:divest,style:7},{value:income+divest-expense-invest,style:7}],24));
  rows.push(sheetRow(6,[{value:'Cơ cấu theo nhóm',style:1}],22));
  rows.push(sheetRow(7,[{value:'Nhóm',style:2},{value:'Số tiền',style:2},{value:'Thanh mô tả',style:2}],18));
  const maxGroup=Math.max(...byGroup.map(x=>x[1]),1);
  let cursor=8;
  byGroup.forEach(([name,value])=>{
    rows.push(sheetRow(cursor,[{value:name,style:0},{value:value,style:7},{value:barText(value,maxGroup),style:8}]));
    cursor++;
  });
  cursor+=2;
  rows.push(sheetRow(cursor,[{value:'Ngày',style:2},{value:'Loại',style:2},{value:'Nhóm',style:2},{value:'Hạng mục',style:2},{value:'Ghi chú',style:2},{value:'Số tiền',style:2},{value:'Loại tài sản',style:2},{value:'Tên tài sản',style:2}],18));
  cursor++;
  rowsForMonth.sort((a,b)=>(a.date+' '+a.time).localeCompare(b.date+' '+b.time)).forEach(tx=>{
    rows.push(sheetRow(cursor,[{value:tx.date},{value:tx.large||tx.type},{value:tx.group},{value:tx.child},{value:tx.note},{value:tx.amount,style:7},{value:tx.assetType},{value:tx.assetName}]));
    cursor++;
  });
  return {name:`T${month}.${year}`,xml:buildWorksheet({rows,merges:['A1:H1'],cols:[13,17,22,24,34,16,16,24]})};
}

function crc32(bytes){
  const table=crc32.table||(crc32.table=Array.from({length:256},(_,n)=>{
    let c=n;
    for(let k=0;k<8;k++)c=(c&1)?(0xedb88320^(c>>>1)):(c>>>1);
    return c>>>0;
  }));
  let crc=0xffffffff;
  for(const b of bytes)crc=table[(crc^b)&255]^(crc>>>8);
  return (crc^0xffffffff)>>>0;
}

function u16(n){return [n&255,(n>>>8)&255];}
function u32(n){return [n&255,(n>>>8)&255,(n>>>16)&255,(n>>>24)&255];}

function concatBytes(parts){
  const arrays=parts.map(part=>part instanceof Uint8Array?part:new Uint8Array(part));
  const total=arrays.reduce((sum,part)=>sum+part.length,0);
  const out=new Uint8Array(total);
  let offset=0;
  arrays.forEach(part=>{out.set(part,offset);offset+=part.length;});
  return out;
}

function zipStore(files){
  const encoder=new TextEncoder();
  const chunks=[];
  const central=[];
  let offset=0;
  const now=new Date();
  const dosTime=(now.getHours()<<11)|(now.getMinutes()<<5)|(Math.floor(now.getSeconds()/2));
  const dosDate=((now.getFullYear()-1980)<<9)|((now.getMonth()+1)<<5)|now.getDate();
  files.forEach(file=>{
    const nameBytes=encoder.encode(file.name);
    const data=typeof file.content==='string'?encoder.encode(file.content):file.content;
    const crc=crc32(data);
    const local=concatBytes([[...u32(0x04034b50),...u16(20),...u16(0x0800),...u16(0),...u16(dosTime),...u16(dosDate),...u32(crc),...u32(data.length),...u32(data.length),...u16(nameBytes.length),...u16(0)],nameBytes,data]);
    chunks.push(local);
    central.push({file,nameBytes,data,crc,offset,dosTime,dosDate});
    offset+=local.length;
  });
  const centralStart=offset;
  central.forEach(item=>{
    const c=concatBytes([[...u32(0x02014b50),...u16(20),...u16(20),...u16(0x0800),...u16(0),...u16(item.dosTime),...u16(item.dosDate),...u32(item.crc),...u32(item.data.length),...u32(item.data.length),...u16(item.nameBytes.length),...u16(0),...u16(0),...u16(0),...u16(0),...u32(0),...u32(item.offset)],item.nameBytes]);
    chunks.push(c);
    offset+=c.length;
  });
  const centralSize=offset-centralStart;
  chunks.push(new Uint8Array([...u32(0x06054b50),...u16(0),...u16(0),...u16(files.length),...u16(files.length),...u32(centralSize),...u32(centralStart),...u16(0)]));
  return new Blob(chunks,{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
}

function buildWorkbookSheets(txns,assets,scope){
  const selectedTxns=scope.year?txns.filter(tx=>String(tx.date||'').startsWith(`${scope.year}-`)):txns.slice();
  const scopeLabel=scope.year?`Năm ${scope.year}`:'Tất cả các năm';
  const sheets=[buildExportSummarySheet(selectedTxns,assets,scopeLabel)];
  if(scope.year){
    for(let month=1;month<=12;month++)sheets.push(buildMonthSheet(scope.year,month,selectedTxns));
  }else{
    const keys=Array.from(new Set(selectedTxns.map(tx=>String(tx.date||'').slice(0,7)).filter(Boolean))).sort();
    keys.forEach(key=>sheets.push(buildMonthSheet(Number(key.slice(0,4)),Number(key.slice(5,7)),selectedTxns)));
  }
  return sheets;
}

function workbookXml(sheets){
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((sheet,index)=>`<sheet name="${xmlEscape(sheet.name)}" sheetId="${index+1}" r:id="rId${index+1}"/>`).join('')}</sheets></workbook>`;
}

function workbookRels(sheets){
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_sheet,index)=>`<Relationship Id="rId${index+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index+1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
}

function stylesXml(){
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0 &quot;đ&quot;"/></numFmts><fonts count="3"><font><sz val="11"/><color rgb="FF0F172A"/><name val="Aptos"/></font><font><b/><sz val="16"/><color rgb="FF0F172A"/><name val="Aptos Display"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Aptos"/></font></fonts><fills count="8"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEFF6FF"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FF10B981"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEF4444"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FF8B5CF6"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF8FAFC"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFDBEAFE"/></patternFill></fill></fills><borders count="2"><border/><border><left style="thin"><color rgb="FFE2E8F0"/></left><right style="thin"><color rgb="FFE2E8F0"/></right><top style="thin"><color rgb="FFE2E8F0"/></top><bottom style="thin"><color rgb="FFE2E8F0"/></bottom></border></borders><cellXfs count="9"><xf fontId="0" fillId="0" borderId="0" xfId="0"/><xf fontId="1" fillId="6" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf fontId="2" fillId="7" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/><xf fontId="2" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/><xf fontId="2" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/><xf fontId="2" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/><xf fontId="0" fillId="6" borderId="0" xfId="0" applyFill="1"/><xf fontId="0" fillId="0" borderId="1" xfId="0" numFmtId="164" applyNumberFormat="1" applyBorder="1"/><xf fontId="0" fillId="2" borderId="1" xfId="0" applyFill="1" applyBorder="1"/></cellXfs></styleSheet>`;
}

function buildXlsxBlob(sheets){
  const files=[
    {name:'[Content_Types].xml',content:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_s,i)=>`<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`},
    {name:'_rels/.rels',content:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`},
    {name:'xl/workbook.xml',content:workbookXml(sheets)},
    {name:'xl/_rels/workbook.xml.rels',content:workbookRels(sheets)},
    {name:'xl/styles.xml',content:stylesXml()},
    ...sheets.map((sheet,index)=>({name:`xl/worksheets/sheet${index+1}.xml`,content:sheet.xml}))
  ];
  return zipStore(files);
}

function downloadBlob(blob,name){
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;
  a.download=name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
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
    downloadBlob(blob,`qlct-data-${new Date().toISOString().slice(0,10)}.json`);
  }finally{
    window.QLCT_setBusy?.(false);
  }
}

async function exportExcelData(scope){
  if(!window.FDB?.refreshAll||!window.FIREBASE_COLLECTIONS)return;
  window.QLCT_setBusy?.(true,'Đang tạo file Excel');
  try{
    const rows=await window.FDB.refreshAll();
    const txns=(rows[1]||[]).map(normalizeExportTx).filter(tx=>tx.date&&tx.amount);
    const assetState=typeof window.ASSET52_getAssets==='function'?window.ASSET52_getAssets():null;
    const assets=(assetState?.assets?.length?assetState.assets:(rows[2]||[])).map(normalizeExportAsset);
    const sheets=buildWorkbookSheets(txns,assets,scope||{});
    const blob=buildXlsxBlob(sheets);
    const suffix=scope?.year?`nam-${scope.year}`:'tat-ca-cac-nam';
    downloadBlob(blob,`qlct-report-${suffix}-${new Date().toISOString().slice(0,10)}.xlsx`);
  }catch(error){
    console.error('Excel export failed',error);
    await showAppMessage('Export Excel thất bại',error?.message||'Không tạo được file Excel.');
  }finally{
    window.QLCT_setBusy?.(false);
  }
}

async function chooseExportYear(txns){
  const years=availableExportYears(txns);
  if(!years.length)return new Date().getFullYear();
  const actions=years.slice(0,8).map(year=>({label:`Năm ${year}`,value:Number(year),kind:'primary'}));
  actions.push({label:'Hủy',value:null,kind:'ghost'});
  return showAppDialog({title:'Chọn năm export',message:'File Excel theo năm sẽ có sheet tổng quan và 12 sheet tháng trong năm đã chọn.',actions,cancelValue:null});
}

async function exportDataPrompt(){
  const format=await showAppDialog({
    title:'Export dữ liệu',
    message:'Bạn muốn export data dạng JSON như cũ hay tạo file Excel để theo dõi trực tiếp?',
    actions:[
      {label:'Excel file',value:'excel',kind:'primary'},
      {label:'JSON file',value:'json',kind:'ghost'},
      {label:'Hủy',value:null,kind:'ghost'}
    ],
    cancelValue:null
  });
  if(format==='json')return exportAllData();
  if(format!=='excel')return;
  const scope=await showAppDialog({
    title:'Export Excel',
    message:'Chọn phạm vi dữ liệu cho workbook Excel.',
    actions:[
      {label:'Theo năm',value:'year',kind:'primary'},
      {label:'Tất cả các năm',value:'all',kind:'ghost'},
      {label:'Hủy',value:null,kind:'ghost'}
    ],
    cancelValue:null
  });
  if(!scope)return;
  if(scope==='all')return exportExcelData({});
  window.QLCT_setBusy?.(true,'Đang đọc danh sách năm');
  try{
    const rows=await window.FDB.refreshAll();
    const txns=(rows[1]||[]).map(normalizeExportTx).filter(tx=>tx.date);
    window.QLCT_setBusy?.(false);
    const year=await chooseExportYear(txns);
    if(!year)return;
    return exportExcelData({year});
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

document.addEventListener('click',e=>{
  if(!e.target.closest('[data-overview-refresh]'))return;
  reloadAllDataFromHome();
});

document.addEventListener('keydown',e=>{
  if(!e.target.closest?.('[data-overview-refresh]'))return;
  if(e.key!=='Enter'&&e.key!==' ')return;
  e.preventDefault();
  reloadAllDataFromHome();
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
  if(typeof window.FIREBASE_SIGN_IN==='function'){
    try{
      if(appLoaderLogin)appLoaderLogin.textContent='Đang mở Google...';
      await window.FIREBASE_SIGN_IN();
    }catch(error){
      console.error('Google login failed',error);
      appLoader.classList.add('auth-needed');
      if(appLoaderTitle)appLoaderTitle.textContent='Không đăng nhập được Google';
      if(appLoaderText)appLoaderText.textContent=`${error?.code||'auth/error'}: ${error?.message||'Vui lòng kiểm tra Firebase Authentication.'}`;
      if(appLoaderLogin)appLoaderLogin.textContent='Thử lại';
    }
  }
});
document.addEventListener('firebase:status',e=>updateAppLoader(e.detail));
setTimeout(()=>updateAppLoader(),0);

document.querySelector('.add-btn')?.addEventListener('click',()=>openScreen('screenTxnForm'));

const navs=document.querySelectorAll('.dock-content .nav-item');
navs[0]?.addEventListener('click',()=>{closeTransientLayers();closeAllScreens();playOverviewAnimations();});
navs[1]?.addEventListener('click',()=>{openScreen('screenTransactions');setTimeout(resetTransactionFilters,60);});
navs[2]?.addEventListener('click',()=>openScreen('screenAssets'));
navs[3]?.addEventListener('click',()=>openScreen('screenReports'));
window.addEventListener('resize',()=>syncDockNavigation());
syncDockNavigation();

const toolsEls=document.querySelectorAll('.tool');
toolsEls[0]?.addEventListener('click',()=>openScreen('screenGold'));
toolsEls[1]?.addEventListener('click',()=>openScreen('screenCategories'));
toolsEls[2]?.addEventListener('click',importAllData);
toolsEls[3]?.addEventListener('click',exportDataPrompt);

window.openScreen=openScreen;
window.closeScreen=closeScreen;
window.ensureHomeButtons=ensureHomeButtons;
window.syncDockNavigation=syncDockNavigation;

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
  if(key.includes('real')||key.includes('nha')||key.includes('dat'))return '#475569';
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
  if(key.includes('real')||key.includes('nha')||key.includes('dat'))return '#475569';
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
    if(typeof window.ASSET52_closeDetail==='function')window.ASSET52_closeDetail();
    else {
      active.classList.remove('active');
      active.setAttribute('aria-hidden','true');
      syncDockNavigation();
    }
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
