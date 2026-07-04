// Js/nucleo/sesion.js
// Sistema de login con salas: inicialización, presencia, limpieza y onDisconnect.
//
// Flujo:
//   1. Usuario ingresa nombre + código de sala en la pantalla de login.
//   2. inicializarSesion() limpia sesiones huérfanas, crea/une al jugador en Firebase
//      bajo la ruta dinámica "{idSala}/jugadores/{pushKey}".
//   3. Se registra presencia + onDisconnect para limpieza automática.
//   4. Se guarda la sesión en localStorage para detectar recargas/cierres abruptos.
//   5. El lobby.js escucha la sala dinámica y gestiona el resto.
//
// NOTA DE RUTAS: Se usa el código de sala directamente como nodo raíz en Firebase
// (ej. "casa/jugadores"), igual que el sistema original usaba "sala_activa/jugadores".
// Esto garantiza compatibilidad con las reglas de seguridad de Firebase existentes.
//
// NOTA DE LIMPIEZA AL CERRAR:
//   - El onDisconnect de Firebase es la red de seguridad principal.
//   - pwa.js maneja la limpieza adicional al cerrar la app (pagehide + visibilitychange).
//   - sesion.js NO registra beforeunload porque en móviles no es confiable y
//     causaría conflicto con el sistema de pwa.js.

import { baseDatos, mostrarToast } from './config.js';
import * as estado from './estado.js';

// ============================================
// CLAVE DE SESIÓN EN localStorage
// ============================================
const CLAVE_SESION = 'sequence_sesion_activa';

// ============================================
// LIMPIAR SESIÓN HUÉRFANA (de una recarga o cierre abrupto anterior)
// ============================================
async function limpiarSesionAnterior() {
    const raw = localStorage.getItem(CLAVE_SESION);
    if (!raw) return;

    try {
        const { sala, jugadorId } = JSON.parse(raw);
        if (sala && jugadorId) {
            await Promise.all([
                baseDatos.ref(`${sala}/jugadores/${jugadorId}`).remove(),
                baseDatos.ref(`${sala}/presencia/${jugadorId}`).remove()
            ]);
        }
    } catch (_) {
        // Si los datos están corruptos o la red falla, continuamos de todas formas
    } finally {
        localStorage.removeItem(CLAVE_SESION);
    }
}

// ============================================
// GUARDAR SESIÓN ACTIVA EN localStorage
// ============================================
function guardarSesionActiva(sala, jugadorId) {
    localStorage.setItem(CLAVE_SESION, JSON.stringify({ sala, jugadorId }));
}

// ============================================
// REGISTRAR PRESENCIA + TESTAMENTO onDisconnect
// ============================================
function registrarPresencia(sala, jugadorId) {
    const presenciaRef  = baseDatos.ref(`${sala}/presencia/${jugadorId}`);
    const jugadorRef    = baseDatos.ref(`${sala}/jugadores/${jugadorId}`);

    // Escribimos presencia activa
    presenciaRef.set(true);

    // Testamento: Firebase elimina presencia automáticamente si se pierde la conexión.
    presenciaRef.onDisconnect().remove();
    
    // IMPORTANTE: Ya NO usamos jugadorRef.onDisconnect().remove() aquí.
    // Si lo hacemos, Firebase borra la mano del jugador inmediatamente al minimizar la app (PWA).
    // La limpieza de jugadores desconectados ahora se maneja exclusivamente mediante
    // la lógica de tolerancia de 60 segundos en iniciarListenerPresencia().
    jugadorRef.onDisconnect().cancel(); // Cancelamos cualquier testamento previo por seguridad
}

// ============================================
// INICIALIZAR SESIÓN — punto de entrada principal
// ============================================
export async function inicializarSesion(nombreRaw, salaRaw) {
    // 1. Normalizar datos
    const nombre = nombreRaw.trim();
    // Limpiamos espacios Y los caracteres prohibidos por Firebase en rutas:
    // punto (.), numeral (#), dólar ($), corchetes ([ y ])
    const sala   = salaRaw.trim().toLowerCase().replace(/[\s.#$[\]]/g, '');

    if (!nombre || !sala) {
        mostrarToast("Por favor ingresa tu nombre y el código de sala.", "warning");
        return false;
    }

    // 2. Limpiar sesión huérfana del mismo dispositivo
    await limpiarSesionAnterior();

    // 3. Guardar sala en el estado compartido (todos los módulos la usarán)
    //    estado.rutaSala quedará igual a sala (ej. "casa")
    estado.setIdSala(sala);
    estado.setMiJugadorProp('nombre', nombre);

    // 4. Crear/unir al jugador en Firebase bajo la sala dinámica
    const jugadoresRef = baseDatos.ref(`${sala}/jugadores`);
    const ref          = jugadoresRef.push(estado.miJugador);

    estado.setMiJugadorRef(ref);
    estado.setMiJugadorId(ref.key);

    // 5. Registrar presencia + testamento onDisconnect para el jugador.
    //    El abandono durante una partida activa se detecta en iniciarListenerPresencia():
    //    cuando un jugador pierde presencia y hay una partida iniciada, se escribe
    //    { abandonado: true } en el estado y lobby.js muestra la pantalla de fin.
    //    NO usamos onDisconnect en el nodo 'estado' porque Firebase puede ejecutarlo
    //    durante reconexiones al cargar la página, bloqueando el lobby prematuramente.
    registrarPresencia(sala, ref.key);

    // 6. Guardar sesión en localStorage para detectar recargas/cierres abruptos.
    //    pwa.js usa esta clave para limpiar la sesión al cerrar la app (pagehide).
    guardarSesionActiva(sala, ref.key);

    return true;
}

// ============================================
// LISTENER DE PRESENCIA — detecta desconexiones de otros jugadores.
// Gestiona migración de host y limpieza de estados pendientes.
// Solo el primer jugador activo y presente ejecuta la limpieza.
// ============================================
export function detenerListenerPresencia() {
    const sala = estado.idSala;
    if (sala) {
        baseDatos.ref(`${sala}/presencia`).off('value');
    }
}

// ============================================
// LIMPIEZA AL CERRAR PESTAÑA / RECARGAR
// ============================================
// Función auxiliar para obtener la URL base de Firebase
function obtenerUrlFirebaseREST() {
    try {
        if (typeof firebase !== 'undefined' && firebase.apps.length > 0) {
            return firebase.database().ref().toString().replace(/\/$/, '');
        }
    } catch (e) {}
    return "https://secuence-7d7af-default-rtdb.firebaseio.com";
}

// Atrapar recargas y cierres de pestaña
window.addEventListener('beforeunload', () => {
    const sala = estado.idSala;
    const miId = estado.miJugadorId;

    if (sala && miId) {
        // Si NO estamos en una partida activa, forzamos el borrado inmediato.
        // Si estamos jugando, confiamos en la presencia/Tolerancia de 60s.
        if (!estado.juegoIniciadoVisualmente) {
            const baseUrl = obtenerUrlFirebaseREST();
            // fetch con keepalive: true se envía aunque la pestaña se cierre
            fetch(`${baseUrl}/${sala}/jugadores/${miId}.json`, { method: 'DELETE', keepalive: true }).catch(()=>{});
            fetch(`${baseUrl}/${sala}/presencia/${miId}.json`, { method: 'DELETE', keepalive: true }).catch(()=>{});
        }
    }
});

let timersToleranciaDesconexion = {};

export function iniciarListenerPresencia() {
    const sala = estado.idSala;
    if (!sala) return;

    // Limpiar listener previo por seguridad
    baseDatos.ref(`${sala}/presencia`).off('value');

    baseDatos.ref(`${sala}/presencia`).on('value', async (snapPresencia) => {
        const presentes = snapPresencia.val() || {};

        // Solo actuamos si hay jugadores en sala
        if (estado.jugadoresEnSala.length === 0) return;

        // 1. Si un jugador que estaba desconectado vuelve a aparecer como presente,
        // cancelamos su temporizador de expulsión inmediatamente.
        Object.keys(presentes).forEach(idJugador => {
            if (timersToleranciaDesconexion[idJugador]) {
                clearTimeout(timersToleranciaDesconexion[idJugador]);
                delete timersToleranciaDesconexion[idJugador];
                mostrarToast(`⚡ Un jugador se ha reconectado.`, "success", 3000);
            }
        });

        // Detectamos jugadores sin presencia activa
        const desconectados = estado.jugadoresEnSala.filter(
            j => j.id && !presentes[j.id]
        );

        if (desconectados.length === 0) return;

        // Solo el primer jugador presente ejecuta la limpieza (evita escrituras duplicadas)
        const primerPresente = estado.jugadoresEnSala.find(
            j => j.id && presentes[j.id]
        );
        if (!primerPresente || primerPresente.id !== estado.miJugadorId) return;

        // --- ELIMINACIÓN DE BOTS (se queda igual) ---
        for (const jugador of desconectados) {
            // Evitamos borrar jugadores humanos de inmediato si la partida está en curso
            const estadoSnap = await baseDatos.ref(`${sala}/estado`).once('value');
            const estadoJuego = estadoSnap.val();
            const esPartidaActiva = estadoJuego && estadoJuego.iniciado;

            if (!esPartidaActiva && !jugador.esBot) {
                // Si no hay partida iniciada (están en el lobby), sí los borramos normalmente
                await baseDatos.ref(`${sala}/jugadores/${jugador.id}`).remove();
            }
        }

        const jugadoresRestantes = estado.jugadoresEnSala.filter(j => j.id && presentes[j.id] && !j.esBot);
        if (jugadoresRestantes.length === 0) {
            const bots = estado.jugadoresEnSala.filter(j => j.esBot);
            for (const bot of bots) {
                await baseDatos.ref(`${sala}/jugadores/${bot.id}`).remove();
                await baseDatos.ref(`${sala}/presencia/${bot.id}`).remove();
            }
            await baseDatos.ref(`${sala}`).remove();
            return;
        }

        const estadoSnap  = await baseDatos.ref(`${sala}/estado`).once('value');
        const estadoJuego = estadoSnap.val();

        // ── PARTIDA EN CURSO: Aplicar tolerancia de 60 segundos antes de marcar abandono ──
        if (estadoJuego && estadoJuego.iniciado) {
            const jugadorFaltante = desconectados[0];
            // Si es un bot o no se encuentra el jugador, no aplicamos tolerancia
            if (!jugadorFaltante || jugadorFaltante.esBot) return;

            const nombreAbandono = jugadorFaltante.nombre || "Un jugador";  

            // Si no hay un temporizador activo para este jugador, creamos uno
            if (!timersToleranciaDesconexion[jugadorFaltante.id]) {
                mostrarToast(`⚠️ ${nombreAbandono} perdió conexión. Esperando 60s para reconexión...`, "warning", 5000);

                timersToleranciaDesconexion[jugadorFaltante.id] = setTimeout(async () => {
                    // Pasados los 60 segundos, verificamos el estado de presencia real en Firebase
                    const snapPresenciaActual = await baseDatos.ref(`${sala}/presencia/${jugadorFaltante.id}`).once('value');
                    const sigueDesconectado = !snapPresenciaActual.val();

                    if (sigueDesconectado) {
                        // Confirmamos el abandono definitivo
                        await baseDatos.ref(`${sala}/jugadores/${jugadorFaltante.id}`).remove();
                        await baseDatos.ref(`${sala}/estado`).update({
                            abandonado: true,
                            nombreAbandono: nombreAbandono
                        });
                    }
                    delete timersToleranciaDesconexion[jugadorFaltante.id];
                }, 60000); // 60 segundos de gracia
            }
            return; 
        }

        // ── LOBBY (sin partida activa): migrar host si es necesario ────────
        if (!estadoJuego) return;

        const hostActual      = estadoJuego.host;
        const hostSigueSiendo = estado.jugadoresEnSala.find(
            j => j.id === hostActual && presentes[j.id]
        );

        if (!hostSigueSiendo) {
            await baseDatos.ref(`${sala}/estado/host`).set(estado.miJugadorId);
            mostrarToast("¡Eres el nuevo anfitrión de la sala! 👑", "info", 4000);
        }
    });
}
