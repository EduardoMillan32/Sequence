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
// CONTADOR: bloquea el listener de Firebase mientras se procesa una jugada.
// Se usa un contador (no un booleano) porque Firebase puede reintentar la
// transacción del mazo varias veces, disparando el listener múltiples veces
// antes de que la transacción se confirme. Con un booleano solo se bloqueaba
// el primer disparo; los siguientes sobreescribían la mano local con la versión
// desactualizada de Firebase → las cartas "desaparecían" visualmente.
// ============================================
let _bloqueosManoRestantes = 0;

export function ignorarSiguienteActualizacionMano() {
    // Incrementamos el contador: cada reintento de la transacción disparará
    // el listener una vez, y cada disparo decrementará el contador.
    // Usamos 2 como valor inicial para cubrir el disparo optimista (null)
    // y el disparo real (valor del servidor) que Firebase hace en cada transacción.
    _bloqueosManoRestantes += 2;

    // Timeout de seguridad: si la transacción tarda más de 8 segundos
    // (p.ej. por pérdida de conexión), liberamos los bloqueos automáticamente
    // para que la mano no quede vacía indefinidamente.
    setTimeout(() => {
        if (_bloqueosManoRestantes > 0) {
            _bloqueosManoRestantes = 0;
            renderizarMano();
        }
    }, 8000);
}

// Libera todos los bloqueos pendientes y fuerza un re-render de la mano.
// Se llama cuando una transacción falla o es abortada, para que el listener
// de Firebase pueda volver a actualizar la mano normalmente.
export function liberarBloqueosYRenderizar() {
    _bloqueosManoRestantes = 0;
    renderizarMano();
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
        // El contador garantiza que se ignoren TODOS los disparos intermedios,
        // no solo el primero (que era el bug: con booleano solo se bloqueaba uno).
        if (_bloqueosManoRestantes > 0) {
            _bloqueosManoRestantes--;
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
            etiqueta.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:2px;"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>2 OJOS`;
            etiqueta.classList.add('etiqueta-jack', 'jack-add');
            contenedorCarta.appendChild(etiqueta);
        } else if (carta.startsWith("J2")) {
            const etiqueta = document.createElement('span');
            etiqueta.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:2px;"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>1 OJO`;
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
