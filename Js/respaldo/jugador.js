// Js/jugador.js

let manoPropia = [];
let cartaSeleccionadaIdx = null;
const contenedorMano = document.getElementById('contenedor-cartas');

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
// INICIALIZAR MANO DESDE FIREBASE
// ============================================
function inicializarManoFirebase() {
    miJugadorRef.child('mano').on('value', (snapshot) => {
        manoPropia = snapshot.exists() ? snapshot.val() : [];
        renderizarMano();
    });
}

// ============================================
// RENDERIZAR CARTAS EN MANO
// ============================================
function renderizarMano() {
    contenedorMano.innerHTML = "";

    manoPropia.forEach((carta, index) => {
        const contenedorCarta = document.createElement('div');
        contenedorCarta.classList.add('contenedor-carta-individual');

        const imgCarta = document.createElement('img');
        imgCarta.src       = `https://deckofcardsapi.com/static/img/${cartaManoACodigoAPI(carta)}.png`;
        imgCarta.alt       = carta;
        imgCarta.loading   = 'lazy';
        imgCarta.draggable = false;
        imgCarta.classList.add('carta-mano');

        if (index === cartaSeleccionadaIdx) {
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
    cartaSeleccionadaIdx = (cartaSeleccionadaIdx === index) ? null : index;
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
