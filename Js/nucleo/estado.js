// Js/nucleo/estado.js
// Variables de estado compartidas entre juego.js, jugador.js y lobby.js
// Este módulo NO importa nada del proyecto — solo exporta estado mutable.

// ============================================
// ESTADO DEL JUGADOR LOCAL
// ============================================
export let miJugadorId = null;
export let miJugadorRef = null;
export let miJugador = { nombre: "", color: null, listo: false };

// ============================================
// ESTADO DE LA SALA
// ============================================
export let jugadoresEnSala = [];
export let juegoIniciadoVisualmente = false;

// ============================================
// ESTADO DE LA MANO
// ============================================
export let manoPropia = [];
export let cartaSeleccionadaIdx = null;

// ============================================
// SETTERS — permiten que los módulos actualicen el estado compartido
// ============================================
export function setMiJugadorId(val)               { miJugadorId = val; }
export function setMiJugadorRef(val)              { miJugadorRef = val; }
export function setMiJugador(val)                 { miJugador = val; }
export function setMiJugadorProp(prop, val)       { miJugador[prop] = val; }

export function setJugadoresEnSala(val)           { jugadoresEnSala = val; }
export function pushJugadorEnSala(jugador)        { jugadoresEnSala.push(jugador); }
export function unshiftJugadorEnSala(jugador)     { jugadoresEnSala.unshift(jugador); }

export function setJuegoIniciadoVisualmente(val)  { juegoIniciadoVisualmente = val; }

export function setManoPropia(val)                { manoPropia = val; }
export function spliceManoPropia(idx, count)      { manoPropia.splice(idx, count); }
export function pushManoPropia(carta)             { manoPropia.push(carta); }

export function setCartaSeleccionadaIdx(val)      { cartaSeleccionadaIdx = val; }
