/* Firebase data layer shared by the screens.
   Firestore document id is exposed as `id`; business field `id` is `external_id`. */
const FIREBASE_CONFIG={
  apiKey: "AIzaSyBchmRedpv84YDT8G7WOFW7-yd-3v8N0SA",
  authDomain: "test-qlct.firebaseapp.com",
  projectId: "test-qlct",
  storageBucket: "test-qlct.firebasestorage.app",
  messagingSenderId: "44896306415",
  appId: "1:44896306415:web:c99424cf2f2d4e0b43871a",
  measurementId: "G-Y2QYVB6WD4"
};
const FIREBASE_COLLECTIONS={danhMuc:'DanhMuc',giaoDich:'GiaoDich',taiSan:'TaiSan'};

window.FIREBASE_COLLECTIONS=FIREBASE_COLLECTIONS;
window.FIREBASE_STATUS={ok:false,auth:false,authReady:false,user:null,error:null,collections:{}};
console.log('firebase.js loaded',FIREBASE_CONFIG.projectId);

function reportFirebaseStatus(detail){
  window.FIREBASE_STATUS={...window.FIREBASE_STATUS,...detail};
  document.dispatchEvent(new CustomEvent('firebase:status',{detail:window.FIREBASE_STATUS}));
}

function FIREBASE_DEBUG(){
  const status=window.FIREBASE_STATUS||{};
  console.log('Firebase config',{projectId:FIREBASE_CONFIG.projectId,collections:FIREBASE_COLLECTIONS});
  console.log('Firebase status',status);
  console.log('Firebase auth user',window.firebase?.auth?.().currentUser?.email||null);
  if(status.error)console.error(status.error);
  return status;
}
window.FIREBASE_DEBUG=FIREBASE_DEBUG;

window.FDB=(function(){
  if(typeof firebase==='undefined'){
    const error=new Error('Firebase SDK chua load duoc.');
    reportFirebaseStatus({ok:false,error});
    console.error(error);
    return null;
  }

  const appName=`qlct-${FIREBASE_CONFIG.projectId}`;
  const app=firebase.apps.find(item=>item.name===appName)||firebase.initializeApp(FIREBASE_CONFIG,appName);
  if(typeof firebase.auth!=='function'){
    const error=new Error('Firebase Auth SDK chua load duoc.');
    reportFirebaseStatus({ok:false,auth:false,error});
    console.error(error);
    return null;
  }

  const auth=firebase.auth(app);
  const db=firebase.firestore(app);
  const provider=new firebase.auth.GoogleAuthProvider();
  const subscribers=new Map();
  const cache=new Map();
  const pendingLoads=new Map();
  let authReady=false;

  provider.setCustomParameters({prompt:'select_account'});
  try{auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(e=>console.warn('Auth persistence error:',e));}
  catch(e){console.warn('Auth persistence error:',e);}
  function clearAuthRedirectUrl(){
    if(!/[?&]__/.test(window.location.search))return;
    const clean=window.location.origin+window.location.pathname+window.location.hash;
    window.history.replaceState({},document.title,clean);
  }

  try{auth.getRedirectResult().then(clearAuthRedirectUrl).catch(e=>console.warn('Firebase redirect result error:',e));}
  catch(e){console.warn('Firebase redirect result error:',e);}

  const collection=name=>db.collection(name);
  const rowsFrom=snapshot=>snapshot.docs.map(doc=>{
    const data=doc.data();
    return {...data,_docId:doc.id,id:doc.id,external_id:data.id||''};
  });
  const getSubscribers=name=>{
    if(!subscribers.has(name))subscribers.set(name,new Set());
    return subscribers.get(name);
  };
  const cloneRows=rows=>(rows||[]).map(row=>({...row}));
  const cachedRows=name=>cloneRows(cache.get(name)||[]);
  function isDeleteFieldValue(value){
    return value&&typeof value==='object'&&String(value._methodName||value.methodName||value.toString?.()||'').includes('delete');
  }
  function cacheData(data){
    const clean={};
    Object.entries(data||{}).forEach(([key,value])=>{
      if(isDeleteFieldValue(value))return;
      clean[key]=value;
    });
    return clean;
  }
  function notifySubscribers(name,rows){
    const next=cloneRows(rows);
    getSubscribers(name).forEach(item=>item.callback(next,{collection:name,cache:true}));
  }
  function setCache(name,rows){
    cache.set(name,cloneRows(rows));
    reportFirebaseStatus({
      ok:true,
      error:null,
      collections:{...window.FIREBASE_STATUS.collections,[name]:rows.length}
    });
    notifySubscribers(name,rows);
    return cachedRows(name);
  }
  function patchCache(name,id,data,options){
    if(!cache.has(name))return;
    const rows=cachedRows(name);
    const index=rows.findIndex(row=>String(row.id)===String(id)||String(row._docId)===String(id));
    const current=index>=0?rows[index]:{_docId:id,id,external_id:data?.id||''};
    const cleanData=cacheData(data);
    const next=options&&options.delete
      ? null
      : {
        ...(options&&options.merge!==false?current:{}),
        ...cleanData,
        _docId:id,
        id,
        external_id:(cleanData&&cleanData.id!==undefined)?cleanData.id:(current.external_id||'')
      };
    if(options&&options.delete){
      if(index>=0)rows.splice(index,1);
      else return;
    }else if(index>=0)rows[index]=next;
    else rows.push(next);
    setCache(name,rows);
  }

  function showFirebaseLogin(error){
    if(error)console.warn('Firebase auth required',error);
  }

  function hideFirebaseLogin(){
  }

  function isStandaloneIos(){
    const ua=navigator.userAgent||'';
    const isIos=/iPad|iPhone|iPod/.test(ua)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
    return isIos&&(window.navigator.standalone===true||window.matchMedia?.('(display-mode: standalone)').matches);
  }

  async function firebasePopupLogin(){
    console.log('Firebase Google sign-in start');
    try{
      await auth.signInWithPopup(provider);
    }catch(error){
      const canFallback=error&&['auth/popup-blocked','auth/popup-closed-by-user','auth/cancelled-popup-request','auth/operation-not-supported-in-this-environment'].includes(error.code);
      if(isStandaloneIos()&&canFallback){
        await auth.signInWithRedirect(provider);
        return;
      }
      reportFirebaseStatus({ok:false,error});
      console.error('Firebase login error code:',error&&error.code);
      console.error('Firebase login error message:',error&&error.message);
      console.error('Firebase login full error:',error);
      showFirebaseLogin(error);
      throw error;
    }
  }

  function signOut(){
    return auth.signOut();
  }

  window.FIREBASE_SIGN_IN=firebasePopupLogin;
  window.FIREBASE_SIGN_OUT=signOut;

  function startFirebaseApp(){
    if(!auth.currentUser)console.log('Firebase auth: waiting for existing Google session.');
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',startFirebaseApp);
  else startFirebaseApp();

  function notifyEmptyAuth(name){
    reportFirebaseStatus({
      ok:false,
      auth:false,
      authReady,
      error:new Error('Can dang nhap Google de doc Firestore.'),
      collections:{...window.FIREBASE_STATUS.collections,[name]:'auth-required'}
    });
    getSubscribers(name).forEach(item=>item.callback([]));
  }

  function loadCollection(name){
    if(!auth.currentUser){
      notifyEmptyAuth(name);
      return Promise.resolve([]);
    }
    if(pendingLoads.has(name))return pendingLoads.get(name).then(cloneRows);
    const request=collection(name).get().then(snapshot=>{
      const rows=rowsFrom(snapshot);
      return setCache(name,rows);
    }).catch(error=>{
      reportFirebaseStatus({
        ok:false,
        error,
        collections:{...window.FIREBASE_STATUS.collections,[name]:'error'}
      });
      console.error(`Firebase read failed: ${name}`,error);
      getSubscribers(name).forEach(item=>{if(item.onError)item.onError(error);});
      return [];
    }).finally(()=>pendingLoads.delete(name));
    pendingLoads.set(name,request);
    return request.then(cloneRows);
  }

  async function testReads(){
    const user=auth.currentUser;
    const names=[FIREBASE_COLLECTIONS.danhMuc,FIREBASE_COLLECTIONS.giaoDich,FIREBASE_COLLECTIONS.taiSan];
    const results={user:user?{uid:user.uid,email:user.email}:null};
    for(const name of names){
      try{
        const snapshot=await collection(name).limit(3).get();
        results[name]={ok:true,count:snapshot.size,ids:snapshot.docs.map(doc=>doc.id)};
      }catch(error){
        results[name]={ok:false,code:error.code,message:error.message};
      }
    }
    console.table(results);
    console.log('Firebase test reads',results);
    return results;
  }
  window.FIREBASE_TEST_READS=testReads;
  window.FIREBASE_REFRESH_ALL=function(){
    return Promise.all(Object.values(FIREBASE_COLLECTIONS).map(name=>loadCollection(name)));
  };

  auth.onAuthStateChanged(user=>{
    authReady=true;
    reportFirebaseStatus({auth:!!user,authReady:true,user:user?{uid:user.uid,email:user.email,displayName:user.displayName}:null,error:null,collections:user?{}:window.FIREBASE_STATUS.collections});
    if(user){
      hideFirebaseLogin();
      subscribers.forEach((_items,name)=>loadCollection(name));
    }else{
      showFirebaseLogin();
      subscribers.forEach((_items,name)=>notifyEmptyAuth(name));
    }
  },error=>{
    reportFirebaseStatus({auth:false,error});
    showFirebaseLogin(error);
    console.error('Firebase auth state failed',error);
  });

  function requireAuth(){
    if(auth.currentUser)return null;
    return new Error('Can dang nhap Google de ghi Firestore.');
  }

  function withWriteCache(name,id,data,promise,options){
    return promise.then(result=>{
      patchCache(name,id,data,options);
      return result;
    });
  }

  return {
    subscribe(name,callback,onError){
      const item={callback,onError};
      getSubscribers(name).add(item);
      if(cache.has(name)){
        callback(cachedRows(name),{collection:name,cache:true});
      }else if(auth.currentUser){
        loadCollection(name);
      }else if(authReady){
        notifyEmptyAuth(name);
      }
      return ()=>getSubscribers(name).delete(item);
    },
    add(name,data){
      const error=requireAuth();
      if(error)return Promise.reject(error);
      return collection(name)
        .add({...data,createdAt:firebase.firestore.FieldValue.serverTimestamp(),updatedAt:firebase.firestore.FieldValue.serverTimestamp()})
        .then(result=>{
          patchCache(name,result.id,{...data,_docId:result.id,id:result.id}, {merge:false});
          return result;
        });
    },
    set(name,id,data){
      const error=requireAuth();
      if(error)return Promise.reject(error);
      return withWriteCache(name,id,data,collection(name)
        .doc(id)
        .set({...data,updatedAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true}),{merge:true});
    },
    setNoRefresh(name,id,data){
      const error=requireAuth();
      if(error)return Promise.reject(error);
      return collection(name)
        .doc(id)
        .set({...data,updatedAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true});
    },
    remove(name,id){
      const error=requireAuth();
      if(error)return Promise.reject(error);
      return withWriteCache(name,id,null,collection(name).doc(id).delete(),{delete:true});
    },
    removeNoRefresh(name,id){
      const error=requireAuth();
      if(error)return Promise.reject(error);
      return collection(name).doc(id).delete();
    },
    runTransaction(handler){
      const error=requireAuth();
      if(error)return Promise.reject(error);
      const writes=[];
      return db.runTransaction(tx=>handler({
        get(name,id){
          return tx.get(collection(name).doc(id)).then(doc=>doc.exists?{...doc.data(),_docId:doc.id,id:doc.id,external_id:doc.data().id||''}:null);
        },
        set(name,id,data,options){
          tx.set(collection(name).doc(id),{...data,updatedAt:firebase.firestore.FieldValue.serverTimestamp()},options||{merge:true});
          writes.push({type:'set',name,id,data,options:options||{merge:true}});
        },
        remove(name,id){
          tx.delete(collection(name).doc(id));
          writes.push({type:'remove',name,id});
        },
        fieldDelete(){
          return firebase.firestore.FieldValue.delete();
        }
      })).then(result=>{
        writes.forEach(write=>{
          if(write.type==='remove')patchCache(write.name,write.id,null,{delete:true});
          else patchCache(write.name,write.id,write.data,{merge:write.options?.merge!==false});
        });
        return result;
      });
    },
    refresh(name){return loadCollection(name);},
    refreshAll(){return window.FIREBASE_REFRESH_ALL();},
    testReads,
    signIn:firebasePopupLogin,
    signOut,
    currentUser(){return auth.currentUser;}
  };
})();
