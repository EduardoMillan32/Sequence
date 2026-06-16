// Js/pantallas/lobby.js
// Sala de espera, listeners Firebase, inicio de partida.
// Usa la sala dinámica: estado.rutaSala = "{idSala}" (ej. "casa")

import { baseDatos, configuracionJuego, inicializarReglas, mostrarToast } from '../nucleo/config.js';
import { obtenerMazoBarajado, reiniciarEstadoJuegoLocal, iniciarListenerTablero, detenerListenerTablero } from '../nucleo/juego.js';
import { inicializarManoFirebase } from '../nucleo/jugador.js';
import { inicializarSesion, iniciarListenerPresencia } from '../nucleo/sesion.js';
import { activarWakeLock, liberarWakeLock } from '../nucleo/pwa.js';
import * as estado from '../nucleo/estado.js';

// ============================================
// ELEMENTOS DEL DOM
// ============================================
const pantallaLogin     = document.getElementById('pantalla-login');
const pantallaLobby     = document.getElementById('pantalla-lobby');
const pantallaJuego     = document.getElementById('pantalla-juego');
const btnListo          = document.getElementById('btn-listo');
const mensajeValidacion = document.getElementById('mensaje-validacion');

// ============================================
// ESTADO LOCAL DEL LOBBY
// ============================================
let nombresEquipos  = { rojo: "Rojo", azul: "Azul", verde: "Verde" };
let partidaIniciada = false;
let yaLimpioSala    = false;

// Referencias Firebase dinámicas — se inicializan al entrar al lobby
let salaRef           = null;
let estadoJuegoRef    = null;
let nombresEquiposRef = null;

// ============================================
// DETENER LISTENERS DEL LOBBY (Evitar fugas de memoria)
// ============================================
import { detenerListenerPresencia } from '../nucleo/sesion.js';

export function detenerListenersLobby() {
    detenerListenerPresencia();

    if (salaRef)           salaRef.off('value');
    if (estadoJuegoRef)    estadoJuegoRef.off('value');
    if (nombresEquiposRef) nombresEquiposRef.off('value');
}

// ============================================
// ENTRADA AL LOBBY — llamada desde el botón de login
// ============================================
async function entrarLobby() {
    const nombre = document.getElementById('input-nombre').value.trim();
    const sala   = document.getElementById('input-sala').value.trim();

    if (!nombre || !sala) {
        return mostrarToast("Por favor ingresa tu nombre y el código de sala.", "warning");
    }

    // Deshabilitar botón para evitar doble envío
    const btnEntrar = document.getElementById('btn-entrar');
    if (btnEntrar) {
        btnEntrar.disabled   = true;
        btnEntrar.innerText  = "Conectando...";
    }

    const ok = await inicializarSesion(nombre, sala);

    if (!ok) {
        if (btnEntrar) {
            btnEntrar.disabled  = false;
            btnEntrar.innerText = "Entrar a la Sala";
        }
        return;
    }

    // Inicializar referencias Firebase con la sala dinámica
    salaRef           = baseDatos.ref(`${estado.rutaSala}/jugadores`);
    estadoJuegoRef    = baseDatos.ref(`${estado.rutaSala}/estado`);
    nombresEquiposRef = baseDatos.ref(`${estado.rutaSala}/nombresEquipos`);

    // Limpiar listeners previos por seguridad antes de registrar nuevos
    detenerListenersLobby();

    // Iniciar listener de presencia (detecta desconexiones y migra host)
    iniciarListenerPresencia();

    // Iniciar listeners de Firebase
    iniciarListenerNombresEquipos();
    iniciarListenerJugadores();
    iniciarListenerEstadoJuego();

    // Mostrar pantalla de lobby
    pantallaLogin.classList.remove('activa');
    pantallaLogin.classList.add('oculta');
    pantallaLobby.classList.remove('oculta');
    pantallaLobby.classList.add('activa');

    // Mostrar el código de sala en el lobby
    const spanSala = document.getElementById('codigo-sala-display');
    if (spanSala) spanSala.innerText = estado.idSala;
}

// Exponer en window para el onclick del HTML
window.entrarLobby = entrarLobby;

// ============================================
// LISTENER: Nombres de equipos
// ============================================
function iniciarListenerNombresEquipos() {
    nombresEquiposRef.on('value', (snapshot) => {
        nombresEquipos = snapshot.exists()
            ? snapshot.val()
            : { rojo: "Rojo", azul: "Azul", verde: "Verde" };

        const spanEditable = document.getElementById('nombre-editable');
        if (spanEditable && estado.miJugador.color && nombresEquipos[estado.miJugador.color]) {
            if (document.activeElement !== spanEditable) {
                spanEditable.innerText = nombresEquipos[estado.miJugador.color];
            }
        }
    });
}

// ============================================
// SELECCIÓN DE COLOR / EQUIPO
// ============================================
function seleccionarColor(color) {
    estado.setMiJugadorProp('color', color);
    btnListo.disabled = false;

    const nombreDefault = color.charAt(0).toUpperCase() + color.slice(1);
    const nombreMostrar = nombresEquipos[color] || nombreDefault;

    const titulo = document.getElementById('titulo-equipo');
    titulo.innerHTML = `Equipo: <span id="nombre-editable" contenteditable="true" spellcheck="false" style="outline: none;">${nombreMostrar}</span>`;

    document.getElementById('nombre-editable').oninput = function () {
        window.cambiarNombreEquipo(this.innerText);
    };

    document.querySelectorAll('.btn-color').forEach(btn => btn.classList.remove('color-activo'));
    document.querySelector(`.btn-color.${color}`).classList.add('color-activo');

    if (estado.miJugadorRef) estado.miJugadorRef.set(estado.miJugador);
    actualizarVistaLobby();
}

// Exponer en window para el onclick del HTML
window.seleccionarColor = seleccionarColor;

// ============================================
// BOTÓN LISTO
// ============================================
function alternarListo() {
    estado.setMiJugadorProp('listo', !estado.miJugador.listo);
    btnListo.innerText = estado.miJugador.listo ? "Esperando a los demás..." : "Estoy Listo";
    btnListo.style.backgroundColor = estado.miJugador.listo ? "#7f8c8d" : "#2ecc71";
    if (estado.miJugadorRef) estado.miJugadorRef.set(estado.miJugador);
}

// Exponer en window para el onclick del HTML
window.alternarListo = alternarListo;

// ============================================
// LISTENER: Jugadores en sala
// ============================================
function iniciarListenerJugadores() {
    salaRef.on('value', (snapshot) => {
        estado.setJugadoresEnSala([]);
        const datos = snapshot.val();

        if (datos) {
            Object.keys(datos).forEach(key => {
                const jugador = datos[key];
                if (jugador && jugador.nombre && jugador.nombre !== "undefined") {
                    jugador.id = key;
                    estado.pushJugadorEnSala(jugador);
                }
            });
        } else {
            // Sala vacía: limpiar estado del juego
            if (estadoJuegoRef) estadoJuegoRef.set(null);
            partidaIniciada = false;
        }

        // Asegurar que el jugador local siempre esté en la lista
        if (estado.miJugadorId && estado.miJugador.nombre &&
            !estado.jugadoresEnSala.find(j => j.id === estado.miJugadorId)) {
            estado.unshiftJugadorEnSala({ ...estado.miJugador, id: estado.miJugadorId });
            salaRef.child(estado.miJugadorId).set(estado.miJugador);
        }

        // Si somos el único jugador, limpiar la sala (partida anterior)
        if (!yaLimpioSala && estado.miJugadorId &&
            estado.jugadoresEnSala.length === 1 &&
            estado.jugadoresEnSala[0].id === estado.miJugadorId) {
            yaLimpioSala = true;
            nombresEquiposRef.remove();
            estadoJuegoRef.set(null);
            baseDatos.ref(`${estado.rutaSala}/tablero`).set(null);
            baseDatos.ref(`${estado.rutaSala}/mazo`).remove();
        }

        // Si hay múltiples jugadores pero el estado tiene 'abandonado: true'
        // (residuo de una partida anterior), lo limpiamos para desbloquear el lobby.
        if (estado.jugadoresEnSala.length > 0) {
            estadoJuegoRef.once('value', (snap) => {
                const est = snap.val();
                if (est && est.abandonado && !est.iniciado) {
                    estadoJuegoRef.set(null);
                }
            });
        }

        actualizarVistaLobby();
        verificarReglasParaIniciar();
    });
}

// ============================================
// VISTA DEL LOBBY
// ============================================
function actualizarVistaLobby() {
    const lista = document.getElementById('lista-jugadores');
    lista.innerHTML = "";

    estado.jugadoresEnSala.forEach(jugador => {
        const li = document.createElement('li');
        let colorPublico = 'Pensando...';
        if (jugador.color === 'rojo')  colorPublico = '🔴 Rojo';
        if (jugador.color === 'azul')  colorPublico = '🔵 Azul';
        if (jugador.color === 'verde') colorPublico = '🟢 Verde';

        li.innerText = `${jugador.nombre} — Equipo: ${colorPublico} — ${jugador.listo ? '✅ LISTO' : '⏳ Esperando'}`;
        lista.appendChild(li);
    });
}

// ============================================
// VERIFICACIÓN DE REGLAS PARA INICIAR
// ============================================
function verificarReglasParaIniciar() {
    if (partidaIniciada) return;

    const totalJugadores = estado.jugadoresEnSala.length;
    if (totalJugadores === 0) return;

    const todosListos = estado.jugadoresEnSala.every(j => j.listo);
    if (!todosListos) {
        mensajeValidacion.classList.remove('listo');
        mensajeValidacion.innerText = "Faltan jugadores por confirmar.";
        return;
    }

    const conteo = { rojo: 0, azul: 0, verde: 0 };
    estado.jugadoresEnSala.forEach(j => { if (j.color) conteo[j.color]++; });

    const cantidades = Object.values(conteo).filter(c => c > 0);
    const numEquipos = cantidades.length;

    let juegoValido = false;

    if (numEquipos === 2) {
        if (totalJugadores % 2 === 0 && cantidades[0] === cantidades[1]) {
            juegoValido = true;
        } else {
            mensajeValidacion.classList.remove('listo');
            mensajeValidacion.innerText = "Para 2 equipos, deben ser pares y estar equilibrados.";
        }
    } else if (numEquipos === 3) {
        if (totalJugadores % 3 === 0 && cantidades[0] === cantidades[1] && cantidades[1] === cantidades[2]) {
            juegoValido = true;
        } else {
            mensajeValidacion.classList.remove('listo');
            mensajeValidacion.innerText = "Para 3 equipos, deben tener la misma cantidad de jugadores.";
        }
    } else {
        mensajeValidacion.classList.remove('listo');
        mensajeValidacion.innerText = "Debe haber al menos 2 equipos para jugar.";
    }

    if (!juegoValido) return;

    mensajeValidacion.classList.add('listo');
    mensajeValidacion.innerText = "¡Todo listo! Iniciando partida...";

    // Solo el primer jugador (anfitrión) inicia la partida
    if (estado.jugadoresEnSala[0].id === estado.miJugadorId) {
        partidaIniciada = true;
        baseDatos.ref(`${estado.rutaSala}/tablero`).set(null);

        const verdes = estado.jugadoresEnSala.filter(j => j.color === 'verde');
        const azules = estado.jugadoresEnSala.filter(j => j.color === 'azul');
        const rojos  = estado.jugadoresEnSala.filter(j => j.color === 'rojo');

        const ordenTurnos = [];
        const maxPorEquipo = Math.max(verdes.length, azules.length, rojos.length);
        for (let i = 0; i < maxPorEquipo; i++) {
            if (verdes[i]) ordenTurnos.push(verdes[i].id);
            if (azules[i]) ordenTurnos.push(azules[i].id);
            if (rojos[i])  ordenTurnos.push(rojos[i].id);
        }

        const indiceAleatorio = Math.floor(Math.random() * ordenTurnos.length);
        const primerTurnoId   = ordenTurnos[indiceAleatorio];

        inicializarReglas(totalJugadores, numEquipos);
        const mazoMaestro = obtenerMazoBarajado();

        estado.jugadoresEnSala.forEach(jugador => {
            const mano = [];
            for (let i = 0; i < configuracionJuego.cartasPorJugador; i++) {
                mano.push(mazoMaestro.pop());
            }
            baseDatos.ref(`${estado.rutaSala}/jugadores/${jugador.id}`).update({ mano });
        });

        baseDatos.ref(`${estado.rutaSala}/mazo`).set(mazoMaestro);

        estadoJuegoRef.set({
            iniciado:        true,
            host:            estado.miJugadorId,
            jugadoresTotales: totalJugadores,
            equiposTotales:  numEquipos,
            turnoActual:     primerTurnoId,
            ordenTurnos:     ordenTurnos,
            marcaTiempo:     Date.now(),
            turnosPasados:   0,
            empate:          false,
            historial:       { 0: "🎮 <b>¡La partida ha comenzado!</b>" }
        });
    }
}

// ============================================
// LISTENER: Estado del juego
// ============================================
function iniciarListenerEstadoJuego() {
    estadoJuegoRef.on('value', (snapshot) => {
        const estadoJuego = snapshot.val();
        if (estado.miJugador.nombre === "") return;

        const bloqueCartas   = document.getElementById('interfaz-cartas');
        const bloqueVictoria = document.getElementById('interfaz-victoria-mano');

        if (!bloqueCartas || !bloqueVictoria) return;

        // Partida abandonada
        if (estadoJuego && estadoJuego.abandonado) {
            if (!estado.juegoIniciadoVisualmente) return;
            // Liberar Wake Lock al terminar la partida por abandono
            liberarWakeLock();
            bloqueCartas.classList.add('oculta');
            bloqueVictoria.classList.remove('oculta');
            document.getElementById('texto-victoria-mano').innerText =
                `PARTIDA TERMINADA: ${estadoJuego.nombreAbandono} abandonó la sala. 🚪`;
            document.getElementById('texto-victoria-mano').style.color = "#f1c40f";
            const btnRevancha = document.getElementById('btn-revancha');
            btnRevancha.innerText = "Volver al Lobby";
            btnRevancha.disabled  = false;
            return;
        }

        // Empate técnico
        if (estadoJuego && estadoJuego.empate) {
            if (!estado.juegoIniciadoVisualmente) return;
            // Liberar Wake Lock al terminar la partida por empate
            liberarWakeLock();
            bloqueCartas.classList.add('oculta');
            bloqueVictoria.classList.remove('oculta');
            const textoWin = document.getElementById('texto-victoria-mano');
            textoWin.innerText = "¡EMPATE TÉCNICO! 🤝";
            textoWin.style.color = "#bdc3c7";
            const btnRevancha = document.getElementById('btn-revancha');
            const esAnfitrion = estado.jugadoresEnSala.length > 0 &&
                                estado.jugadoresEnSala[0].id === estado.miJugadorId;
            btnRevancha.innerText = esAnfitrion ? "Volver al Lobby 🔄" : "Esperando al anfitrión...";
            btnRevancha.disabled  = !esAnfitrion;
            return;
        }

        // Sin partida activa → volver al lobby
        if (!estadoJuego || !estadoJuego.iniciado) {
            if (estado.juegoIniciadoVisualmente) {
                estado.setJuegoIniciadoVisualmente(false);
                partidaIniciada = false;

                // Liberar Wake Lock al volver al lobby
                liberarWakeLock();

                bloqueCartas.classList.remove('oculta');
                bloqueVictoria.classList.add('oculta');

                pantallaJuego.classList.remove('activa');
                pantallaJuego.classList.add('oculta');
                pantallaLobby.classList.remove('oculta');
                pantallaLobby.classList.add('activa');

                estado.setMiJugadorProp('listo', false);
                btnListo.innerText = "Estoy Listo";
                btnListo.style.backgroundColor = "";
                if (estado.miJugadorRef) estado.miJugadorRef.update({ listo: false });
            }
            return;
        }

        // Victoria
        if (estadoJuego.victoria) {
            // Liberar Wake Lock al terminar la partida por victoria
            liberarWakeLock();
            bloqueCartas.classList.add('oculta');
            bloqueVictoria.classList.remove('oculta');
            const nombreGanador = nombresEquipos[estadoJuego.victoria] || estadoJuego.victoria;
            const textoWin = document.getElementById('texto-victoria-mano');
            textoWin.innerText = `¡GANA EL EQUIPO ${nombreGanador.toUpperCase()}! 🎉`;
            textoWin.style.color = "#f1c40f";
            const btnRevancha = document.getElementById('btn-revancha');
            const esAnfitrion = estado.jugadoresEnSala.length > 0 &&
                                estado.jugadoresEnSala[0].id === estado.miJugadorId;
            btnRevancha.innerText = esAnfitrion ? "Volver al Lobby 🔄" : "Esperando al anfitrión...";
            btnRevancha.disabled  = !esAnfitrion;
            return;
        }

        // Partida iniciada → pasar a pantalla de juego
        if (estadoJuego.iniciado === true && !estado.juegoIniciadoVisualmente) {
            partidaIniciada = true;
            estado.setJuegoIniciadoVisualmente(true);

            reiniciarEstadoJuegoLocal();
            iniciarListenerTablero();

            inicializarReglas(estadoJuego.jugadoresTotales, estadoJuego.equiposTotales);
            inicializarManoFirebase();

            // Activar Wake Lock: evitar que la pantalla se bloquee durante el juego
            activarWakeLock();

            setTimeout(() => {
                pantallaLobby.classList.remove('activa');
                pantallaLobby.classList.add('oculta');
                pantallaJuego.classList.remove('oculta');
                pantallaJuego.classList.add('activa');
            }, 1000);
        }
    });
}

// ============================================
// VOLVER AL LOBBY
// ============================================
function volverAlLobby() {
    if (estado.jugadoresEnSala.length === 0 ||
        estado.jugadoresEnSala[0].id !== estado.miJugadorId) return;

    yaLimpioSala = false;

    detenerListenerTablero();

    estadoJuegoRef.set(null);
    baseDatos.ref(`${estado.rutaSala}/tablero`).set(null);
    nombresEquiposRef.remove();
    baseDatos.ref(`${estado.rutaSala}/mazo`).set(null);
    baseDatos.ref(`${estado.rutaSala}/estado/ultimoJack`).remove();
    estado.jugadoresEnSala.forEach(j => {
        baseDatos.ref(`${estado.rutaSala}/jugadores/${j.id}/mano`).remove();
    });
}

// ============================================
// SALIR DE LA SALA / VOLVER AL LOGIN (Limpieza completa)
// ============================================
export function abandonarSalaYVolverAlLogin() {
    detenerListenersLobby();
    detenerListenerTablero();

    // Limpiar localStorage
    localStorage.removeItem('sequence_sesion_activa');

    // Resetear estado visual
    pantallaLobby.classList.remove('activa');
    pantallaLobby.classList.add('oculta');
    pantallaJuego.classList.remove('activa');
    pantallaJuego.classList.add('oculta');
    pantallaLogin.classList.remove('oculta');
    pantallaLogin.classList.add('activa');

    // Habilitar botón de login de nuevo
    const btnEntrar = document.getElementById('btn-entrar');
    if (btnEntrar) {
        btnEntrar.disabled  = false;
        btnEntrar.innerText = "Entrar a la Sala";
    }
}
window.abandonarSalaYVolverAlLogin = abandonarSalaYVolverAlLogin;

// Exponer en window para el onclick del HTML
window.volverAlLobby = volverAlLobby;

// ============================================
// CAMBIAR NOMBRE DE EQUIPO
// ============================================
window.cambiarNombreEquipo = function (nuevoNombre) {
    if (!estado.miJugador.color || nuevoNombre.trim() === "" || !nombresEquiposRef) return;
    nombresEquiposRef.child(estado.miJugador.color).set(nuevoNombre.trim());
};
