(function(){
  const defaults=[];

  let rows=[];
  let draftCatalog={large:[],groups:{},children:{}};
  let mode='add';
  let editingId='';
  let formMessage={type:'',text:''};
  let pendingDeleteAction=null;
  let eventsBound=false;
  let catTouchStart=null;
  let catEditorSwipeStart=null;
  const baseLargeOptions=['Thu nhập','Chi tiêu','Đầu tư','Thu hồi tài sản'];
  let formState={large:'Thu nhập',group:'',child:''};

  function saveRows(){
    document.dispatchEvent(new CustomEvent('cat90:changed',{detail:{rows}}));
    if(typeof window!=='undefined'){
      window.dispatchEvent(new CustomEvent('cat90:changed',{detail:{rows}}));
    }
  }

  function escapeHtml(s){
    return String(s||'')
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;')
      .replace(/'/g,'&#39;');
  }

  function mergeUnique(items){
    return Array.from(new Set((items||[]).filter(Boolean)));
  }

  function firstText(row,keys){
    for(const key of keys){
      const value=row?.[key];
      if(value!==undefined&&value!==null&&String(value).trim())return String(value).trim();
    }
    return '';
  }

  function normalizeCategory(row){
    return {
      id:String(row.id||''),
      external_id:String(row.external_id||''),
      type:firstText(row,['type','loai_giao_dich','loaiGiaoDich']),
      large:firstText(row,['large','loai_lon','loaiLon','loai','type','LoaiLon','Loai','nhomLon']),
      group:firstText(row,['group','nhom_danh_muc','nhom','nhomDanhMuc','category','DanhMuc','Nhom','NhomDanhMuc']),
      child:firstText(row,['child','hang_muc_con','hangMuc','hangMucCon','ten','name','title','Ten','TenDanhMuc','HangMuc','HangMucCon'])
    };
  }

  function categoryToFirestore(row){
    const data={
      loai_lon:row.large,
      nhom_danh_muc:row.group,
      hang_muc_con:row.child,
      loai_giao_dich:row.type||'',
      ghi_chu:'',
      loai_tai_san:'',
      trang_thai:'ACTIVE'
    };
    if(row.external_id)data.id=row.external_id;
    return data;
  }

  function largeOptions(){
    return mergeUnique(baseLargeOptions.concat(rows.map(x=>x.large)).concat(defaults.map(x=>x.large)).concat(draftCatalog.large||[]));
  }

  function groupOptions(large){
    const preset=defaults.filter(x=>x.large===large).map(x=>x.group);
    const data=rows.filter(x=>x.large===large).map(x=>x.group);
    const draft=(draftCatalog.groups[large]||[]);
    return mergeUnique(data.concat(preset).concat(draft));
  }

  function childOptions(large,group){
    const preset=defaults.filter(x=>x.large===large&&x.group===group).map(x=>x.child);
    const data=rows.filter(x=>x.large===large&&x.group===group).map(x=>x.child);
    const draft=(draftCatalog.children[`${large}::${group}`]||[]);
    return mergeUnique(data.concat(preset).concat(draft));
  }

  function addDraftValue(level,value){
    const text=String(value||'').trim();
    if(!text)return;

    if(level==='large'){
      draftCatalog.large=mergeUnique([...(draftCatalog.large||[]), text]);
    } else if(level==='group'){
      const key=formState.large;
      draftCatalog.groups[key]=mergeUnique([...(draftCatalog.groups[key]||[]), text]);
    } else if(level==='child'){
      const key=`${formState.large}::${formState.group}`;
      draftCatalog.children[key]=mergeUnique([...(draftCatalog.children[key]||[]), text]);
    }
  }

  function normalizeForm(){
    const largeList=largeOptions();
    if(!largeList.includes(formState.large))formState.large=largeList.includes('Thu nhập')?'Thu nhập':(largeList[0]||'Thu nhập');
    const groups=groupOptions(formState.large);
    if(!groups.includes(formState.group))formState.group=groups[0]||'';
    const children=childOptions(formState.large,formState.group);
    if(!children.includes(formState.child))formState.child=children[0]||'';
  }

  function defaultAddState(){
    const large='Thu nhập';
    const groups=groupOptions(large);
    const group=groups[0]||'';
    const children=childOptions(large,group);
    return {large,group,child:children[0]||''};
  }

  function ensureTopAddButton(){
    const head=document.querySelector('#screenCategories.cat90-screen > .slide-head');
    if(!head)return;
    let btn=head.querySelector('#cat90TopAddBtn');
    if(!btn){
      btn=document.createElement('button');
      btn.id='cat90TopAddBtn';
      btn.className='cat90-top-add';
      btn.type='button';
      btn.title='Thêm danh mục mới';
      btn.setAttribute('aria-label','Thêm danh mục mới');
      btn.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 5v14"/><path d="M5 12h14"/></svg>';
    }
    const home=head.querySelector('.slide-home');
    if(home&&btn.nextElementSibling!==home)head.insertBefore(btn,home);
    else if(!home&&!head.contains(btn))head.appendChild(btn);
    btn.onclick=()=>openEditor('add');
  }

  function treeData(){
    const tree={};
    rows.forEach(r=>{
      if(!tree[r.large])tree[r.large]={};
      if(!tree[r.large][r.group])tree[r.large][r.group]=[];
      tree[r.large][r.group].push(r);
    });
    return tree;
  }

  function openQuickAdd(level){
    openEditor('add');
    const fallbackLarge='Thu nhập';
    const fallbackGroup=groupOptions(fallbackLarge)[0]||'';
    const fallbackChild=childOptions(fallbackLarge,fallbackGroup)[0]||'';

    if(level==='group'){
      formState={large:fallbackLarge,group:'',child:''};
    }else if(level==='child'){
      formState={large:fallbackLarge,group:fallbackGroup,child:''};
    }else{
      formState={large:fallbackLarge,group:fallbackGroup,child:fallbackChild};
    }
    normalizeForm();
    renderEditor();
  }

  function deleteCategory(id){
    if(!id)return;
    window.FDB.remove(FIREBASE_COLLECTIONS.danhMuc,id).catch(console.error);
    if(editingId===id)closeEditor();
    saveRows();
    renderCategories();
  }

  function requestDeleteLarge(large){
    const count=rows.filter(x=>x.large===large).length;
    if(!count)return;
    openDeleteConfirm('Xóa loại lớn?',`"${large}" và ${count} hạng mục bên trong sẽ bị xóa. Giao dịch cũ không bị ảnh hưởng.`,()=>{
      Promise.all(rows.filter(x=>x.large===large).map(x=>window.FDB.remove(FIREBASE_COLLECTIONS.danhMuc,x.id))).catch(console.error);
    });
  }

  function requestDeleteGroup(large,group){
    const count=rows.filter(x=>x.large===large&&x.group===group).length;
    if(!count)return;
    openDeleteConfirm('Xóa nhóm danh mục?',`"${group}" và ${count} hạng mục con bên trong sẽ bị xóa. Giao dịch cũ không bị ảnh hưởng.`,()=>{
      Promise.all(rows.filter(x=>x.large===large&&x.group===group).map(x=>window.FDB.remove(FIREBASE_COLLECTIONS.danhMuc,x.id))).catch(console.error);
    });
  }

  function ensureDeleteConfirm(){
    let dialog=document.getElementById('cat90DeleteConfirm');
    if(dialog)return dialog;
    const screen=document.getElementById('screenCategories');
    if(!screen)return null;
    screen.insertAdjacentHTML('beforeend',`
      <div class="cat90-confirm" id="cat90DeleteConfirm" aria-hidden="true">
        <div class="cat90-confirm-backdrop" data-cat-confirm-cancel></div>
        <section class="cat90-confirm-card" role="alertdialog" aria-modal="true" aria-labelledby="cat90ConfirmTitle">
          <div class="cat90-confirm-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M8 10v8"/><path d="M16 10v8"/><path d="M5 7l1 13h12l1-13"/></svg></div>
          <h3 id="cat90ConfirmTitle"></h3><p id="cat90ConfirmMessage"></p>
          <div class="cat90-confirm-actions"><button class="cat90-confirm-cancel" type="button" data-cat-confirm-cancel>Hủy</button><button class="cat90-confirm-delete" type="button" data-cat-confirm-delete>Xóa danh mục</button></div>
        </section>
      </div>
    `);
    dialog=document.getElementById('cat90DeleteConfirm');
    dialog.addEventListener('click',e=>{
      if(e.target.closest('[data-cat-confirm-cancel]'))closeDeleteConfirm();
      if(e.target.closest('[data-cat-confirm-delete]')){
        const action=pendingDeleteAction;
        closeDeleteConfirm();
        if(action)action();
      }
    });
    return dialog;
  }

  function openDeleteConfirm(title,message,onConfirm){
    const dialog=ensureDeleteConfirm();
    if(!dialog)return;
    pendingDeleteAction=onConfirm;
    dialog.querySelector('#cat90ConfirmTitle').textContent=title;
    dialog.querySelector('#cat90ConfirmMessage').textContent=message;
    dialog.classList.add('show');
    dialog.setAttribute('aria-hidden','false');
  }

  function closeDeleteConfirm(){
    const dialog=document.getElementById('cat90DeleteConfirm');
    if(!dialog)return;
    dialog.classList.remove('show');
    dialog.setAttribute('aria-hidden','true');
    pendingDeleteAction=null;
  }

  function bindCategoryListEvents(root){
    if(!root)return;
    root.onclick=function(e){
      const addBtn=e.target.closest('#cat90AddBtn');
      if(addBtn){
        openEditor('add');
        return;
      }

      const quickAdd=e.target.closest('[data-cat-level-action]');
      if(quickAdd){
        openQuickAdd(quickAdd.dataset.catLevelAction);
        return;
      }

      const remove=e.target.closest('[data-cat-delete]');
      if(remove){
        deleteCategory(remove.dataset.catDelete);
        return;
      }

      const removeGroup=e.target.closest('[data-cat-delete-group]');
      if(removeGroup){
        requestDeleteGroup(removeGroup.dataset.catDeleteLarge,removeGroup.dataset.catDeleteGroup);
        return;
      }

      const removeLarge=e.target.closest('[data-cat-delete-large]:not([data-cat-delete-group])');
      if(removeLarge){
        requestDeleteLarge(removeLarge.dataset.catDeleteLarge);
        return;
      }

      const edit=e.target.closest('[data-cat-edit]');
      if(edit){
        openEditor('edit',edit.dataset.catEdit);
        return;
      }
    };
  }

  function renderCategories(){
    const screen=document.getElementById('screenCategories');
    const root=document.getElementById('catDemoList');
    if(!screen||!root)return;

    const tree=treeData();
    const largeNames=Object.keys(tree).sort((a,b)=>a.localeCompare(b,'vi'));
    const total=rows.length;
    ensureTopAddButton();

    root.className='cat90-root';
    root.innerHTML=`
      <section class="cat90-head">
        <div class="cat90-title-row">
          <div class="cat90-title-block">
            <div class="cat90-kicker">Danh mục</div>
            <h4>Quản lý danh mục chi tiêu</h4>
            <p>${total} hạng mục con đang sẵn sàng để sử dụng</p>
          </div>
          <button class="cat90-add cat90-add-in-head" type="button" aria-hidden="true" tabindex="-1">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path d="M12 5v14"/>
              <path d="M5 12h14"/>
            </svg>
            Thêm danh mục
          </button>
        </div>

        <div class="cat90-level-actions">
          <button class="cat90-level-pill" type="button" data-cat-level-action="large">Loại lớn</button>
          <button class="cat90-level-pill" type="button" data-cat-level-action="group">Loại danh mục</button>
          <button class="cat90-level-pill" type="button" data-cat-level-action="child">Hạng mục con</button>
        </div>

        <p class="cat90-sub">Nhấn vào mục để sửa. Nhấn nút xóa để bỏ khỏi danh sách.</p>
      </section>

      <section class="cat90-tree">
        ${
          largeNames.length
            ? largeNames.map(large=>`
              <article class="cat90-large">
                <div class="cat90-large-head">
                  <div class="cat90-large-label">
                    <span class="cat90-large-dot"></span>
                    <div class="cat90-large-name">${escapeHtml(large)}</div>
                  </div>
                  <button class="cat90-delete-level" type="button" data-cat-delete-large="${escapeHtml(large)}" aria-label="Xóa loại lớn" title="Xóa loại lớn">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M8 10v8"/><path d="M16 10v8"/><path d="M5 7l1 13h12l1-13"/></svg>
                  </button>
                </div>

                <div class="cat90-group-list">
                  ${
                    Object.keys(tree[large]).sort((a,b)=>a.localeCompare(b,'vi')).map(group=>`
                      <div class="cat90-group">
                        <div class="cat90-group-head">
                          <div class="cat90-group-title">${escapeHtml(group)}</div>
                          <button class="cat90-delete-level" type="button" data-cat-delete-large="${escapeHtml(large)}" data-cat-delete-group="${escapeHtml(group)}" aria-label="Xóa nhóm danh mục" title="Xóa nhóm danh mục">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M8 10v8"/><path d="M16 10v8"/><path d="M5 7l1 13h12l1-13"/></svg>
                          </button>
                        </div>
                        <div class="cat90-child-wrap">
                          ${
                            tree[large][group].map(item=>`
                              <div class="cat90-child-item">
                                <button class="cat90-child-delete" type="button" data-cat-delete="${escapeHtml(item.id)}" aria-label="Xóa danh mục">
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                    <path d="M4 7h16"/>
                                    <path d="M9 7V4h6v3"/>
                                    <path d="M8 10v8"/>
                                    <path d="M16 10v8"/>
                                    <path d="M5 7l1 13h12l1-13"/>
                                  </svg>
                                </button>
                                <button class="cat90-child" type="button" data-cat-edit="${escapeHtml(item.id)}">
                                  <i></i><span>${escapeHtml(item.child)}</span>
                                </button>
                              </div>
                            `).join('')
                          }
                        </div>
                      </div>
                    `).join('')
                  }
                </div>
              </article>
            `).join('')
            : "<div class='cat90-empty'>Chưa có danh mục nào. Hãy thêm danh mục đầu tiên.</div>"
        }
      </section>
    `;

    bindCategoryListEvents(root);
  }

  function ensureEditor(){
    const screen=document.getElementById('screenCategories');
    if(!screen)return null;
    let editor=document.getElementById('cat90Editor');
    if(editor)return editor;

    screen.insertAdjacentHTML('beforeend',`
      <section class="cat90-editor" id="cat90Editor" aria-hidden="true">
        <div class="slide-head">
          <button class="slide-back" type="button" data-cat-editor-close>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M15 18 9 12l6-6"/></svg>
          </button>
          <div class="slide-title" id="cat90EditorTitle">Thêm danh mục</div>
        </div>
        <div class="cat90-editor-body">
          <div class="cat90-form-card">
            <div class="cat90-field">
              <label class="cat90-label">Loại lớn</label>
              <button class="cat90-control" type="button" data-cat-pick="large">
                <span id="cat90LargeText"></span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="m6 9 6 6 6-6"/></svg>
              </button>
            </div>
            <div class="cat90-field">
              <label class="cat90-label">Nhóm danh mục</label>
              <button class="cat90-control" type="button" data-cat-pick="group">
                <span id="cat90GroupText"></span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="m6 9 6 6 6-6"/></svg>
              </button>
            </div>
            <div class="cat90-field">
              <label class="cat90-label">Hạng mục con</label>
              <button class="cat90-control" type="button" data-cat-pick="child">
                <span id="cat90ChildText"></span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="m6 9 6 6 6-6"/></svg>
              </button>
            </div>
            <div class="cat90-helper">Nhấn vào từng ô để chọn hoặc sửa loại lớn, nhóm danh mục và hạng mục con.</div>
            <div id="cat90FormMessage" class="cat90-form-message"></div>
            <div class="cat90-actions">
              <button class="cat90-btn cancel" type="button" data-cat-editor-close>Hủy</button>
              <button class="cat90-btn save" type="button" id="cat90SaveBtn">Lưu danh mục</button>
            </div>
          </div>
        </div>
      </section>
      <div class="cat90-backdrop" id="cat90Backdrop"></div>
      <div class="cat90-sheet" id="cat90Sheet"></div>
    `);
    return document.getElementById('cat90Editor');
  }

  function renderEditor(){
    const editor=ensureEditor();
    if(!editor)return;
    normalizeForm();
    const title=document.getElementById('cat90EditorTitle');
    const msg=document.getElementById('cat90FormMessage');
    const largeText=document.getElementById('cat90LargeText');
    const groupText=document.getElementById('cat90GroupText');
    const childText=document.getElementById('cat90ChildText');
    if(title)title.textContent=mode==='edit'?'Chỉnh sửa danh mục':'Thêm danh mục mới';
    if(msg){
      msg.className='cat90-form-message'+(formMessage.type?` ${formMessage.type}`:'');
      msg.textContent=formMessage.text||'';
    }
    if(largeText)largeText.textContent=formState.large||'Chọn loại lớn';
    if(groupText)groupText.textContent=formState.group||'Chọn nhóm danh mục';
    if(childText)childText.textContent=formState.child||'Chọn hạng mục con';
  }

  function openEditor(newMode,id){
    const editor=ensureEditor();
    if(!editor)return;
    mode=newMode;
    editingId=id||'';
    formMessage={type:'',text:''};

    if(newMode==='edit'){
      const item=rows.find(x=>x.id===id);
      if(!item)return;
      formState={large:item.large,group:item.group,child:item.child};
    }else{
      formState=defaultAddState();
      normalizeForm();
    }

    renderEditor();
    // Force the initial off-canvas state to paint before enabling the
    // transition; otherwise the first open can appear without animation.
    editor.classList.remove('active');
    void editor.offsetWidth;
    requestAnimationFrame(()=>{
      editor.classList.add('active');
      editor.setAttribute('aria-hidden','false');
    });
  }

  function closeEditor(){
    const editor=document.getElementById('cat90Editor');
    if(!editor)return;
    editor.classList.remove('active');
    editor.setAttribute('aria-hidden','true');
    closeSheet();
  }
  window.closeCategoryEditor=closeEditor;

  function openCategoryScreen(){
    const screen=document.getElementById('screenCategories');
    if(!screen)return;
    if(typeof window.openScreen==='function')window.openScreen('screenCategories');
    else {
      screen.classList.add('active');
      screen.setAttribute('aria-hidden','false');
    }
    renderCategories();
  }

  function ensureCategoryIdle(){
    closeSheet();
    closeDeleteConfirm();
    const editor=document.getElementById('cat90Editor');
    if(editor){
      editor.classList.remove('active');
      editor.setAttribute('aria-hidden','true');
    }
  }

  function openSheet(html){
    const backdrop=document.getElementById('cat90Backdrop');
    const sheet=document.getElementById('cat90Sheet');
    if(!backdrop||!sheet)return;
    sheet.innerHTML=html;
    sheet.classList.add('show');
    backdrop.classList.add('show');
  }

  function closeSheet(){
    const backdrop=document.getElementById('cat90Backdrop');
    const sheet=document.getElementById('cat90Sheet');
    if(!backdrop||!sheet)return;
    sheet.classList.remove('show');
    backdrop.classList.remove('show');
    setTimeout(()=>{if(!sheet.classList.contains('show'))sheet.innerHTML='';},260);
  }

  function openPicker(level){
    const current = level === 'large'
      ? formState.large
      : level === 'group'
        ? formState.group
        : formState.child;

    const title = level === 'large'
      ? 'Chọn loại lớn'
      : level === 'group'
        ? 'Chọn nhóm danh mục'
        : 'Chọn hạng mục con';

    const options = level === 'large'
      ? largeOptions()
      : level === 'group'
        ? groupOptions(formState.large)
        : childOptions(formState.large, formState.group);

    const actionText = mode === 'edit'
      ? '✎ Sửa giá trị hiện tại'
      : '+ Tạo giá trị mới';

    openSheet(`
      <div class="cat90-sheet-handle"></div>
      <div class="cat90-sheet-title">${escapeHtml(title)}</div>
      ${options.map(v => `
        <button
          class="cat90-option ${v === current ? 'active' : ''}"
          type="button"
          data-cat-opt="${escapeHtml(v)}"
          data-cat-level="${level}">
          <span>${escapeHtml(v)}</span>
          <span class="cat90-check">${v === current ? '✓' : ''}</span>
        </button>
      `).join('')}
      <button class="cat90-create" type="button" data-cat-edit-current="${level}">
        ${actionText}
      </button>
    `);
  }

  function openEditCurrentValue(level){
    const current = level === 'large'
      ? formState.large
      : level === 'group'
        ? formState.group
        : formState.child;

    const levelName = level === 'large'
      ? 'loại lớn'
      : level === 'group'
        ? 'nhóm danh mục'
        : 'hạng mục con';

    const isEditing = mode === 'edit';

    const title = isEditing
      ? `Sửa ${levelName} hiện tại`
      : `Tạo ${levelName} mới`;

    const hint = isEditing
      ? `Nhập tên ${levelName} mới`
      : `Nhập tên ${levelName}`;

    openSheet(`
      <div class="cat90-sheet-handle"></div>
      <div class="cat90-sheet-title">${escapeHtml(title)}</div>
      <input
        id="cat90NewValue"
        class="cat90-sheet-input"
        value="${isEditing ? escapeHtml(current) : ''}"
        placeholder="${escapeHtml(hint)}"
      />
      <div class="cat90-sheet-actions">
        <button class="cat90-btn cancel" type="button" data-cat-cancel-create>Hủy</button>
        <button class="cat90-btn save" type="button" data-cat-apply-create="${level}">Lưu</button>
      </div>
    `);
  }

  function applyPicked(level,value){
    if(level==='large'){
      formState.large=value;
      const groups=groupOptions(value);
      formState.group=groups.includes(formState.group)?formState.group:(groups[0]||'');
      const children=childOptions(formState.large,formState.group);
      formState.child=children.includes(formState.child)?formState.child:(children[0]||'');
    }else if(level==='group'){
      formState.group=value;
      const children=childOptions(formState.large,formState.group);
      formState.child=children.includes(formState.child)?formState.child:(children[0]||'');
    }else{
      formState.child=value;
    }
    formMessage={type:'',text:''};
    renderEditor();
    closeSheet();
  }

  function applyCreated(level){
    const input = document.getElementById('cat90NewValue');
    const value = String(input?.value || '').trim();

    if(!value){
      input?.focus();
      return;
    }

    const oldValue = {
      large: formState.large,
      group: formState.group,
      child: formState.child
    };

    // Màn THÊM danh mục: chỉ tạo giá trị tạm để chọn vào form.
    // Chỉ khi bấm "Lưu danh mục" mới tạo document Danhmuc mới.
    if(mode === 'add'){
      addDraftValue(level, value);

      if(level === 'large'){
        formState.large = value;
        formState.group = '';
        formState.child = '';
      }else if(level === 'group'){
        formState.group = value;
        formState.child = '';
      }else{
        formState.child = value;
      }

      formMessage = {type:'', text:''};
      renderEditor();
      closeSheet();
      return;
    }

    // Màn SỬA danh mục: đổi tên trên toàn bộ các document liên quan.
    let updatedRows;

    if(level === 'large'){
      updatedRows = rows.map(row =>
        row.large === oldValue.large
          ? {...row, large: value}
          : row
      );
      formState.large = value;
    }else if(level === 'group'){
      updatedRows = rows.map(row =>
        row.large === oldValue.large && row.group === oldValue.group
          ? {...row, group: value}
          : row
      );
      formState.group = value;
    }else{
      updatedRows = rows.map(row =>
        row.large === oldValue.large &&
        row.group === oldValue.group &&
        row.child === oldValue.child
          ? {...row, child: value}
          : row
      );
      formState.child = value;
    }

    // Không cho phép sau khi đổi tên tạo ra hai tổ hợp trùng nhau.
    const keys = updatedRows.map(row =>
      `${row.large}__${row.group}__${row.child}`
    );

    if(new Set(keys).size !== keys.length){
      formMessage = {
        type: 'error',
        text: 'Tên mới tạo ra danh mục trùng. Vui lòng dùng tên khác.'
      };
      renderEditor();
      return;
    }

    Promise.all(updatedRows.filter((row,index)=>row.large!==rows[index].large||row.group!==rows[index].group||row.child!==rows[index].child).map(row=>window.FDB.set(FIREBASE_COLLECTIONS.danhMuc,row.id,categoryToFirestore(row)))).catch(console.error);

    formMessage = {type:'success', text:'Đã cập nhật danh mục.'};
    renderEditor();
    closeSheet();
  }

  function saveCategory(){
    formState.large=String(formState.large||'').trim();
    formState.group=String(formState.group||'').trim();
    formState.child=String(formState.child||'').trim();

    if(!formState.large||!formState.group||!formState.child){
      formMessage={type:'error',text:'Vui lòng chọn đủ loại lớn, nhóm danh mục và hạng mục con.'};
      renderEditor();
      return;
    }

    const duplicate=rows.find(x=>x.large===formState.large&&x.group===formState.group&&x.child===formState.child&&x.id!==editingId);
    if(duplicate){
      formMessage={type:'error',text:'Danh mục này đã tồn tại.'};
      renderEditor();
      return;
    }

    if(mode==='edit') window.FDB.set(FIREBASE_COLLECTIONS.danhMuc,editingId,categoryToFirestore({...formState,external_id:rows.find(x=>x.id===editingId)?.external_id||''})).catch(console.error);
    else window.FDB.add(FIREBASE_COLLECTIONS.danhMuc,categoryToFirestore({...formState,external_id:'DM'+Date.now()})).catch(console.error);
    formMessage={type:'success',text:'Đã lưu danh mục thành công.'};
    renderEditor();
    setTimeout(closeEditor,320);
  }

  function bindEvents(){
    if(eventsBound)return;
    eventsBound=true;
    document.addEventListener('touchstart',function(e){
      const editor=e.target.closest?.('#cat90Editor.active');
      if(editor){
        const t=e.touches?.[0];
        if(t)catEditorSwipeStart={x:t.clientX,y:t.clientY};
      }
      const body=e.target.closest?.('#screenCategories.cat90-screen.active .slide-body');
      if(!body)return;
      const t=e.touches?.[0];
      if(!t)return;
      catTouchStart={x:t.clientX,y:t.clientY};
    },{capture:true,passive:true});
    document.addEventListener('touchmove',function(e){
      if(catEditorSwipeStart){
        const editor=e.target.closest?.('#cat90Editor.active');
        const t=e.touches?.[0];
        if(editor&&t){
          const dx=t.clientX-catEditorSwipeStart.x;
          const dy=t.clientY-catEditorSwipeStart.y;
          if(catEditorSwipeStart.x<=44&&dx>12&&Math.abs(dx)>Math.abs(dy)*1.25&&e.cancelable)e.preventDefault();
        }
      }
      if(!catTouchStart)return;
      const body=e.target.closest?.('#screenCategories.cat90-screen.active .slide-body');
      if(!body){catTouchStart=null;return;}
      const t=e.touches?.[0];
      if(!t)return;
      const dx=t.clientX-catTouchStart.x;
      const dy=t.clientY-catTouchStart.y;
      if(Math.abs(dx)>Math.abs(dy)&&Math.abs(dx)>6&&e.cancelable)e.preventDefault();
    },{capture:true,passive:false});
    document.addEventListener('touchend',function(e){
      if(catEditorSwipeStart){
        const t=e.changedTouches?.[0];
        if(t){
          const dx=t.clientX-catEditorSwipeStart.x;
          const dy=t.clientY-catEditorSwipeStart.y;
          if(catEditorSwipeStart.x<=44&&dx>58&&Math.abs(dx)>Math.abs(dy)*1.35){
            closeEditor();
          }
        }
      }
      catTouchStart=null;
      catEditorSwipeStart=null;
    },{capture:true,passive:true});
    document.addEventListener('touchcancel',()=>{catTouchStart=null;catEditorSwipeStart=null;},{capture:true,passive:true});
    document.addEventListener('click',function(e){
      if(e.target.closest('[data-cat-editor-close]')){
        e.preventDefault();
        e.stopPropagation();
        closeEditor();
        return;
      }

      const pick=e.target.closest('[data-cat-pick]');
      if(pick){
        openPicker(pick.dataset.catPick);
        return;
      }

      const option=e.target.closest('[data-cat-opt]');
      if(option){
        applyPicked(option.dataset.catLevel,option.dataset.catOpt);
        return;
      }

      const editCurrent=e.target.closest('[data-cat-edit-current]');
      if(editCurrent){
        openEditCurrentValue(editCurrent.dataset.catEditCurrent);
        return;
      }

      const applyCreate=e.target.closest('[data-cat-apply-create]');
      if(applyCreate){
        applyCreated(applyCreate.dataset.catApplyCreate);
        return;
      }

      if(e.target.closest('[data-cat-cancel-create]')||e.target.closest('#cat90Backdrop')){
        closeSheet();
        return;
      }

      if(e.target.closest('#cat90SaveBtn')){
        saveCategory();
        return;
      }

      const tool=e.target.closest('.tool');
      if(tool&&tool.textContent.trim()==='Danh mục'){
        openCategoryScreen();
        return;
      }
    },true);
  }

  function start(){
    window.CAT90_getRows=()=>rows.slice();
    window.CAT90_getCatalog=()=>{
      const large=largeOptions();
      const groups=Object.fromEntries(large.map(x=>[x,groupOptions(x)]));
      const children={}; rows.forEach(x=>children[`${x.large}::${x.group}`]=childOptions(x.large,x.group));
      return {large,groups,children};
    };
    if(!window.FDB){
      rows=[];
      saveRows();
      renderCategories();
      bindEvents();
      return;
    }
    window.FDB.subscribe(FIREBASE_COLLECTIONS.danhMuc,data=>{
      rows=data.map(normalizeCategory).filter(x=>x.large&&x.group&&x.child);
      saveRows();
      renderCategories();
    });
    renderCategories();
    bindEvents();
    const screen=document.getElementById('screenCategories');
    if(screen){
      const observer=new MutationObserver(function(){
        if(screen.classList.contains('active'))renderCategories();
        else ensureCategoryIdle();
      });
      observer.observe(screen,{attributes:true,attributeFilter:['class']});
    }
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
