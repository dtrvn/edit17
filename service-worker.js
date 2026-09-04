const CACHE_NAME = 'qlct-pwa-v20260904-asset-wide-detail-fit-a';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './overview.css',
  './overview.js',
  './transaction.css',
  './transaction.js',
  './add-transaction.js',
  './category.css',
  './category.js',
  './asset.css',
  './asset.js',
  './report.css',
  './report.js',
  './gold.css',
  './gold.js',
  './firebase.js',
  './images/image1.jpg',
  './images/image2.jpg',
  './images/image3.jpg',
  './icons/favicon.ico',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install',event=>{
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache=>cache.addAll(APP_SHELL.map(url=>new Request(url,{cache:'reload'}))))
      .then(()=>self.skipWaiting())
  );
});

self.addEventListener('activate',event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(key=>key!==CACHE_NAME).map(key=>caches.delete(key))))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  event.respondWith(
    fetch(event.request).then(response=>{
      if(new URL(event.request.url).origin===self.location.origin&&response.ok){
        const copy=response.clone();
        caches.open(CACHE_NAME).then(cache=>cache.put(event.request,copy));
      }
      return response;
    }).catch(()=>caches.match(event.request).then(cached=>cached||caches.match('./index.html')))
  );
});
