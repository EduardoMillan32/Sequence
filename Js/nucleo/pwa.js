// Js/nucleo/pwa.js
// Módulo PWA: Wake Lock (evitar bloqueo de pantalla) y detección de cierre de app.
//
// Wake Lock API:
//   - Se activa automáticamente cuando el juego inicia (pantalla-juego visible).
//   - Se libera cuando el juego termina o el usuario vuelve al lobby.
//   - Se reactiva si el usuario regresa a la pestaña/app (visibilitychange).
//
// Detección de cierre de PWA:
//   - En modo standalone (instalada), el evento 'pagehide' es más confiable que
//     'beforeunload' para detectar cuando el usuario cierra la app desde el botón
//     de inicio del teléfono o desliza para cerrar.
//   - Usamos 'visibilitychange' + un temporizador para detectar cuando la app
//     pasa a segundo plano por mucho tiempo (equivalente a "cerrar" en móvil).
//   - El timer de segundo plano SOLO se activa si hay una partida en curso
//     (juegoIniciadoVisualmente = true), para no desconectar al usuario que
//     minimiza la app mientras espera en el lobby.
//   - El sistema de sesión ya maneja la limpieza en Firebase vía onDisconnect,
//     pero este módulo refuerza la limpieza inmediata cuando es posible.

import * as estado from './estado.js';

// ============================================
// ESTADO INTERNO DEL MÓDULO
// ============================================
let wakeLockSentinel  = null;   // Referencia al Wake Lock activo
let wakeLockActivo    = false;  // Flag para saber si debemos mantenerlo activo
let timerSegundoPlano = null;   // Timer para detectar app en segundo plano

// Tiempo en segundo plano antes de considerar "cierre" (1 minuto / 60 segundos)
const TIEMPO_SEGUNDO_PLANO_MS = 60_000;

// ============================================
// WAKE LOCK — Solicitar (evitar bloqueo de pantalla)
// ============================================
export async function activarWakeLock() {
    // La Wake Lock API solo está disponible en contextos seguros (HTTPS o localhost)
    if (!('wakeLock' in navigator)) {
        console.info('[PWA] Wake Lock API no disponible en este navegador/dispositivo.');
        return;
    }

    // No solicitar si el documento no está visible (causaría error NotAllowedError)
    if (document.visibilityState !== 'visible') {
        return;
    }

    try {
        wakeLockSentinel = await navigator.wakeLock.request('screen');
        wakeLockActivo   = true;

        // Cuando el sistema libera el lock (ej. batería baja), lo registramos
        wakeLockSentinel.addEventListener('release', () => {
            console.info('[PWA] Wake Lock liberado por el sistema.');
            wakeLockSentinel = null;
        });

        console.info('[PWA] Wake Lock activado — la pantalla no se bloqueará.');
    } catch (err) {
        // Puede fallar si el documento no está visible o el sistema lo rechaza
        console.warn('[PWA] No se pudo activar Wake Lock:', err.message);
    }
}

// ============================================
// WAKE LOCK — Liberar
// ============================================
export async function liberarWakeLock() {
    wakeLockActivo = false;

    if (wakeLockSentinel) {
        try {
            await wakeLockSentinel.release();
            console.info('[PWA] Wake Lock liberado manualmente.');
        } catch (_) {}
        wakeLockSentinel = null;
    }
}

// ============================================
// VISIBILITYCHANGE — Reactivar Wake Lock al volver a la app
// ============================================
document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible') {
        // La app volvió al primer plano — cancelar timer de "cierre"
        if (timerSegundoPlano) {
            clearTimeout(timerSegundoPlano);
            timerSegundoPlano = null;
        }

        // Reactivar Wake Lock solo si estaba activo antes de ir a segundo plano
        // y el sentinel fue liberado por el sistema
        if (wakeLockActivo && !wakeLockSentinel) {
            await activarWakeLock();
        }
    } else {
        // La app pasó a segundo plano.
        // IMPORTANTE: Solo iniciamos el timer de "cierre" si hay una partida
        // activa. Si el usuario está en el lobby o login, minimizar la app
        // es normal y no debe contar como desconexión.
        if (estado.juegoIniciadoVisualmente && estado.idSala && estado.miJugadorId) {
            timerSegundoPlano = setTimeout(() => {
                console.info('[PWA] App en segundo plano por mucho tiempo durante partida — limpiando sesión.');
                limpiarSesionPWA();
            }, TIEMPO_SEGUNDO_PLANO_MS);
        }
    }
});

// ============================================
// PAGEHIDE — Evento más confiable en móviles para detectar cierre
// Se dispara cuando el usuario cierra la app o navega fuera.
// Solo limpiamos si hay una sesión activa (usuario ya entró a la sala).
// ============================================
window.addEventListener('pagehide', (event) => {
    // event.persisted = true → la página va al bfcache (no es cierre real)
    // event.persisted = false → cierre real de la app/pestaña
    
    // En iOS (Safari/PWA), pagehide se dispara INCLUSO cuando la app solo se minimiza.
    // Si limpiamos la sesión aquí, el usuario es expulsado inmediatamente al minimizar.
    // Por lo tanto, en dispositivos móviles (especialmente iOS), confiamos en el 
    // timer de 'visibilitychange' (segundo plano) y en el onDisconnect de Firebase
    // en lugar de forzar la limpieza inmediata en pagehide.
    
    const esIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    
    if (!event.persisted && estado.idSala && estado.miJugadorId && !esIOS) {
        limpiarSesionPWA();
    }
});

// ============================================
// LIMPIAR SESIÓN DESDE PWA (cierre de app)
// Limpia localStorage y envía peticiones keepalive a Firebase REST API.
// El onDisconnect de Firebase actúa como red de seguridad si esto falla.
// ============================================
function limpiarSesionPWA() {
    // Limpiar localStorage para que la próxima apertura no encuentre sesión huérfana
    localStorage.removeItem('sequence_sesion_activa');

    const sala      = estado.idSala;
    const jugadorId = estado.miJugadorId;

    if (!sala || !jugadorId) return;

    // Obtener URL base de Firebase para usar la REST API con keepalive
    const baseUrl = obtenerFirebaseUrl();
    if (!baseUrl) return;

    try {
        // keepalive: true garantiza que la petición se complete aunque la página se cierre
        fetch(`${baseUrl}/${sala}/jugadores/${jugadorId}.json`, {
            method: 'DELETE',
            keepalive: true
        }).catch(() => {});

        fetch(`${baseUrl}/${sala}/presencia/${jugadorId}.json`, {
            method: 'DELETE',
            keepalive: true
        }).catch(() => {});
    } catch (_) {
        // Si falla, onDisconnect de Firebase se encargará automáticamente
    }
}

// ============================================
// OBTENER URL BASE DE FIREBASE (para REST API)
// Lee la URL de la base de datos desde el SDK global ya inicializado.
// ============================================
function obtenerFirebaseUrl() {
    try {
        // El SDK compat de Firebase expone la URL de la base de datos
        // a través de firebase.database().ref().toString()
        if (typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length > 0) {
            const db = firebase.database();
            // La URL tiene formato: https://[proyecto].firebaseio.com/
            // Eliminamos la barra final para construir rutas correctamente
            return db.ref().toString().replace(/\/$/, '');
        }
    } catch (_) {}
    return null;
}

// ============================================
// DETECTAR MODO STANDALONE (app instalada en pantalla de inicio)
// ============================================
export function esModoStandalone() {
    return (
        window.matchMedia('(display-mode: standalone)').matches ||
        window.navigator.standalone === true // iOS Safari
    );
}

// ============================================
// INICIALIZAR PWA — llamar desde principal.js
// ============================================
export function inicializarPWA() {
    if (esModoStandalone()) {
        console.info('[PWA] Ejecutándose en modo standalone (app instalada) 📱');
    } else {
        console.info('[PWA] Ejecutándose en navegador normal 🌐');
    }
}
