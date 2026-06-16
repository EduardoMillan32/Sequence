// sw.js — Service Worker para Sequence PWA
// Permite que la app se instale en pantalla de inicio y funcione como app nativa.
// Estrategia: Network First para recursos dinámicos, Cache First para assets estáticos.
//
// NOTA DE RUTAS: Se usan rutas relativas (sin / inicial) para que el SW funcione
// correctamente tanto en la raíz como en subcarpetas (ej. GitHub Pages /Sequence/).
// El scope del SW es automáticamente la carpeta donde está sw.js.

const CACHE_NAME = 'sequence-v3'; // Incrementamos la versión para forzar la actualización de caché

// Generar dinámicamente las rutas de las 52 cartas estándar + 4 Jacks especiales
const palos = ['S', 'H', 'D', 'C'];
const valores = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'Q', 'K'];
const cartasEstaticas = [];

palos.forEach(palo => {
    valores.forEach(valor => {
        cartasEstaticas.push(`./images/cartas/${valor}${palo}.png`);
    });
});

// Jacks especiales de Sequence (J1 = 2 ojos, J2 = 1 ojo)
const jacks = ['J1D', 'J1C', 'J2H', 'J2S'];
jacks.forEach(jack => {
    cartasEstaticas.push(`./images/cartas/${jack}.png`);
});

// Archivos que se cachean al instalar el SW (shell de la app)
const ASSETS_ESTATICOS = [
    './',
    './index.html',
    './manifest.json',
    './css/base/general.css',
    './css/pantallas/lobby.css',
    './css/componentes/tablero.css',
    './css/componentes/jugador.css',
    './Js/principal.js',
    './Js/nucleo/config.js',
    './Js/nucleo/estado.js',
    './Js/nucleo/juego.js',
    './Js/nucleo/jugador.js',
    './Js/nucleo/pwa.js',
    './Js/nucleo/sesion.js',
    './Js/nucleo/sonidos.js',
    './Js/nucleo/tablero.js',
    './Js/pantallas/lobby.js',
    './icons/icon-192.png',
    './icons/icon-512.png',
    ...cartasEstaticas
];

// ============================================
// INSTALL — cachear el shell de la app
// ============================================
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS_ESTATICOS);
        }).then(() => {
            // Activar inmediatamente sin esperar a que se cierren otras pestañas
            return self.skipWaiting();
        })
    );
});

// ============================================
// ACTIVATE — limpiar caches viejos
// ============================================
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys
                    .filter(key => key !== CACHE_NAME)
                    .map(key => caches.delete(key))
            );
        }).then(() => {
            // Tomar control de todas las pestañas abiertas inmediatamente
            return self.clients.claim();
        })
    );
});

// ============================================
// FETCH — estrategia Network First
// Firebase y CDNs siempre van a la red.
// Assets locales: intenta red, si falla usa caché.
// ============================================
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Dejar pasar siempre: Firebase, CDNs externos, chrome-extension, etc.
    if (
        url.hostname.includes('firebase') ||
        url.hostname.includes('gstatic') ||
        url.hostname.includes('unpkg') ||
        url.hostname.includes('deckofcardsapi') ||
        url.protocol === 'chrome-extension:'
    ) {
        return; // El navegador maneja estas peticiones normalmente
    }

    // Para assets locales: Network First con fallback a caché
    event.respondWith(
        fetch(event.request)
            .then((response) => {
                // Si la respuesta es válida, actualizamos la caché
                if (response && response.status === 200) {
                    const responseClone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseClone);
                    });
                }
                return response;
            })
            .catch(() => {
                // Sin red: servir desde caché
                return caches.match(event.request).then((cached) => {
                    return cached || new Response(
                        '<h1>Sin conexión</h1><p>Sequence necesita internet para jugar en multijugador.</p>',
                        { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
                    );
                });
            })
    );
});
