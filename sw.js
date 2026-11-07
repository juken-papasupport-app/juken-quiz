// オンライン時は最新版を取得し、オフライン時は保存しておいた版で動く
var CACHE = "jq-cache-v4";
var FILES = [
  "./",
  "index.html",
  "style.css",
  "app.js",
  "manifest.json",
  "questions/core.js",
  "questions/history.js",
  "questions/geography.js",
  "questions/mapdata.js",
  "questions/maps.js",
  "questions/timeline.js",
  "icon-180.png",
  "icon-192.png",
  "icon-512.png"
];

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(FILES); }));
  self.skipWaiting();
});

self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }));
  self.clients.claim();
});

self.addEventListener("fetch", function (e) {
  if (e.request.method !== "GET") return;
  e.respondWith(
    fetch(e.request).then(function (res) {
      var copy = res.clone();
      caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
      return res;
    }).catch(function () {
      return caches.match(e.request, { ignoreSearch: true });
    })
  );
});
