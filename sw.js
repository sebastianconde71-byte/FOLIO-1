/* Folio - uso sin conexion. Guarda la pagina y sus librerias para abrirlas aunque no haya internet o el servidor este apagado.
   Funciona igual en la raiz de un sitio (https://dominio/) y en una subruta (https://usuario.github.io/folio/).
   Si cambias algo dentro de /libs, sube el numero de CACHE para que se vuelva a descargar. */
const CACHE = "folio-offline-v3";
const BASE = new URL(self.registration.scope).pathname;                 // "/" o "/folio/"
const PAGINAS = ["index.html", "folio-voz.html"];
const PRECACHE = PAGINAS.concat(["manifest.webmanifest", "icon-192.png", "icon-512.png",
  "libs/pdf.min.js", "libs/pdf.worker.min.js", "libs/jszip.min.js", "libs/supabase.js", "libs/fonts/fonts.css", "config.js"]).map(function (u) { return BASE + u; });

function relativa(p) { return p.indexOf(BASE) === 0 ? p.slice(BASE.length) : p.replace(/^\//, ""); }

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) {
    return Promise.all(PRECACHE.map(function (u) { return c.add(u).catch(function () {}); }));
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

function paginaSinConexion() {
  return new Response("<meta charset=utf-8><body style='font-family:sans-serif;padding:40px;max-width:520px;margin:auto'>" +
    "<h2>Folio todavía no está guardado para usarse sin conexión</h2><p>Ábrelo una vez con internet (o con el servidor encendido) y vuelve a intentarlo.</p>",
    { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

function guardada() {
  return caches.match(BASE + "index.html").then(function (c) { return c || caches.match(BASE + "folio-voz.html"); });
}

/* config.js (tus datos de la nube): primero la red, para que un cambio se vea enseguida; sin red, la copia guardada */
function configuracion(req) {
  const red = fetch(req).then(function (r) {
    if (r.ok) { const copia = r.clone(); caches.open(CACHE).then(function (c) { c.put(req, copia); }); }
    return r;
  });
  const limite = new Promise(function (res) { setTimeout(function () { res(null); }, 2500); });
  return Promise.race([red.catch(function () { return null; }), limite]).then(function (r) {
    return r || caches.match(req).then(function (c) { return c || red.catch(function () { return new Response("window.FOLIO_CLOUD = window.FOLIO_CLOUD || {};", { headers: { "Content-Type": "text/javascript" } }); }); });
  });
}

/* La pagina: primero la red (asi llegan las versiones nuevas); si tarda mas de 3.5 s o no hay red, la copia guardada */
function pagina(req) {
  const rel = relativa(new URL(req.url).pathname);
  const red = fetch(req).then(function (r) {
    if (r.ok && (PAGINAS.indexOf(rel) !== -1 || rel === "")) {
      const copia = r.clone();
      caches.open(CACHE).then(function (c) { c.put(BASE + (rel || "index.html"), copia); });
    }
    return r;
  });
  const limite = new Promise(function (res) { setTimeout(function () { res(null); }, 3500); });
  return Promise.race([red.catch(function () { return null; }), limite]).then(function (r) {
    return r || guardada().then(function (c) { return c || red.catch(paginaSinConexion); });
  });
}

self.addEventListener("fetch", function (e) {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  const rel = relativa(url.pathname);
  if (/^(ai|backup|vs|perfil)(\/|$)/.test(rel)) return;                 // lo del servidor (voz, IA, copias, perfil) nunca se guarda
  if (rel === "config.js") { e.respondWith(configuracion(req)); return; }
  if (req.mode === "navigate" || PAGINAS.indexOf(rel) !== -1) { e.respondWith(pagina(req)); return; }
  e.respondWith(caches.match(req).then(function (hit) {                 // librerias, tipografias, iconos: primero lo guardado
    return hit || fetch(req).then(function (r) {
      if (r.ok) { const copia = r.clone(); caches.open(CACHE).then(function (c) { c.put(req, copia); }); }
      return r;
    });
  }));
});
