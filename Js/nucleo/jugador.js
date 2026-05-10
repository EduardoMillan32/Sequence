// Js/nucleo/jugador.js
// Mano del jugador, renderizado de cartas y modales

import { configuracionJuego } from './config.js';
import * as estado from './estado.js';

// Obtenemos el contenedor de forma lazy para evitar que sea null si el DOM
// aún no está completamente listo cuando el módulo se evalúa.
function getContenedorMano() {
    return document.getElementById('contenedor-cartas');
}

function cartaManoACodigoAPI(carta) {
    if (carta.startsWith("10")) {
        return "0" + carta.slice(2);
    }
    if (carta.startsWith("J")) {
        return "J" + carta.slice(2);
    }
    return carta;
}

// ============================================
// BANDERA: bloquea el listener de Firebase mientras se procesa una jugada
// ============================================
let _ignorarSiguienteActualizacionMano = false;

export function ignorarSiguienteActualizacionMano() {
    _ignorarSiguienteActualizacionMano = true;
}

// ============================================
// INICIALIZAR MANO DESDE FIREBASE
// ============================================
export function inicializarManoFirebase() {
    // estado.miJugadorRef es una live binding — siempre refleja el valor actual
    estado.miJugadorRef.child('mano').on('value', (snapshot) => {
        // Si hay una jugada en curso (transacción del mazo aún no confirmada),
        // ignoramos esta actualización para no sobreescribir el estado local
        // con la mano desactualizada (sin la carta nueva robada del mazo).
        if (_ignorarSiguienteActualizacionMano) {
            _ignorarSiguienteActualizacionMano = false;
            return;
        }
        estado.setManoPropia(snapshot.exists() ? snapshot.val() : []);
        renderizarMano();
    });
}

// ============================================
// RENDERIZAR CARTAS EN MANO
// ============================================
export function renderizarMano() {
    const contenedorMano = getContenedorMano();
    if (!contenedorMano) return; // Seguridad: el DOM puede no estar listo aún

    const mano         = estado.manoPropia;
    const seleccionado = estado.cartaSeleccionadaIdx;

    contenedorMano.innerHTML = "";

    mano.forEach((carta, index) => {
        const contenedorCarta = document.createElement('div');
        contenedorCarta.classList.add('contenedor-carta-individual');

        const imgCarta = document.createElement('img');
        imgCarta.src       = `https://deckofcardsapi.com/static/img/${cartaManoACodigoAPI(carta)}.png`;
        imgCarta.alt       = carta;
        imgCarta.loading   = 'lazy';
        imgCarta.draggable = false;
        imgCarta.classList.add('carta-mano');

        if (index === seleccionado) {
            imgCarta.classList.add('carta-seleccionada');
        }

        if (carta.startsWith("J1")) {
            const etiqueta = document.createElement('span');
            etiqueta.innerText = "➕ 2 OJOS";
            etiqueta.classList.add('etiqueta-jack', 'jack-add');
            contenedorCarta.appendChild(etiqueta);
        } else if (carta.startsWith("J2")) {
            const etiqueta = document.createElement('span');
            etiqueta.innerText = "❌ 1 OJO";
            etiqueta.classList.add('etiqueta-jack', 'jack-remove');
            contenedorCarta.appendChild(etiqueta);
        }

        imgCarta.onclick = () => seleccionarCarta(index);

        contenedorCarta.appendChild(imgCarta);
        contenedorMano.appendChild(contenedorCarta);
    });
}

// ============================================
// SELECCIONAR / DESELECCIONAR CARTA
// ============================================
function seleccionarCarta(index) {
    estado.setCartaSeleccionadaIdx(estado.cartaSeleccionadaIdx === index ? null : index);
    renderizarMano();
}

// ============================================
// MODAL DE REGLAS
// ============================================
window.abrirReglas = function () {
    document.getElementById('regla-victoria-dinamica').innerText = configuracionJuego.sequencesParaGanar;
    document.getElementById('modal-reglas').classList.remove('oculta-modal');
    document.getElementById('modal-reglas').style.display = 'flex';
};

window.cerrarReglas = function () {
    document.getElementById('modal-reglas').classList.add('oculta-modal');
    document.getElementById('modal-reglas').style.display = 'none';
};

// ============================================
// MODAL DE HISTORIAL
// ============================================
window.abrirHistorial = function () {
    document.getElementById('modal-historial').classList.remove('oculta-modal');
    document.getElementById('modal-historial').style.display = 'flex';
};

window.cerrarHistorial = function () {
    document.getElementById('modal-historial').classList.add('oculta-modal');
    document.getElementById('modal-historial').style.display = 'none';
};
