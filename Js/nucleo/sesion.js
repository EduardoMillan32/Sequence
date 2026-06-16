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

    // Testamento: Firebase elimina presencia y jugador automáticamente
    // si se pierde la conexión de forma abrupta.
    presenciaRef.onDisconnect().remove();
    jugadorRef.onDisconnect().remove();
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

export function iniciarListenerPresencia() {
    const sala = estado.idSala;
    if (!sala) return;

    // Limpiar listener previo por seguridad
    baseDatos.ref(`${sala}/presencia`).off('value');

    baseDatos.ref(`${sala}/presencia`).on('value', async (snapPresencia) => {
        const presentes = snapPresencia.val() || {};

        // Solo actuamos si hay jugadores en sala
        if (estado.jugadoresEnSala.length === 0) return;

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

        // Limpiamos cada jugador desconectado
        for (const jugador of desconectados) {
            await baseDatos.ref(`${sala}/jugadores/${jugador.id}`).remove();
        }

        // Consultamos el estado actual del juego
        const estadoSnap  = await baseDatos.ref(`${sala}/estado`).once('value');
        const estadoJuego = estadoSnap.val();

        // ── PARTIDA EN CURSO: marcar abandono ──────────────────────────────
        // Si hay una partida activa y alguien se desconectó, la marcamos como
        // abandonada. El listener de lobby.js detectará esto y mostrará la
        // pantalla de "Partida Terminada" a todos los jugadores restantes.
        if (estadoJuego && estadoJuego.iniciado) {
            const nombreAbandono = desconectados[0].nombre || "Un jugador";
            await baseDatos.ref(`${sala}/estado`).update({
                abandonado:     true,
                nombreAbandono: nombreAbandono
            });
            return; // El listener de lobby.js se encarga del resto
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
