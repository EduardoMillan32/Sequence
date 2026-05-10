// Js/nucleo/juego.js
// Toda la lógica del juego: turnos, fichas, sequences, mazo
// Usa la sala dinámica: estado.rutaSala = "{idSala}" (ej. "casa")

import { baseDatos, configuracionJuego, mostrarToast } from './config.js';
import { mapaCartas, generarTablero, registrarManejadorCasilla } from './tablero.js';
import { renderizarMano, ignorarSiguienteActualizacionMano, liberarBloqueosYRenderizar } from './jugador.js';
import * as estado from './estado.js';

const TAMANO_TABLERO = 10;

let secuenciasLogradas = { rojo: 0, azul: 0, verde: 0 };
let combosYaMarcados   = new Set();

// Referencia dinámica al tablero — se asigna en iniciarListenerTablero()
let tableroRef = null;

let turnoActualId    = null;
let miTurno          = false;
let listaOrdenTurnos = [];

let ultimaFichaColocadaEl   = null;
let ultimaCasillaRemovidaEl = null;
let timerOverlayJack        = null;
let timerUltimaColocada     = null;
let timerUltimaRemovida     = null;

// ============================================
// AYUDANTES DE FORMATO VISUAL
// ============================================
function traducirCartaAIcono(codigoCarta) {
    if (codigoCarta === "LIBRE") return "⭐ Esquina Libre";

    const numero     = codigoCarta.substring(0, codigoCarta.length - 1);
    const paloCodigo = codigoCarta.slice(-1);

    let iconoPalo  = "";
    let colorTexto = "white";

    if (paloCodigo === 'H') { iconoPalo = "❤️";  colorTexto = "#e74c3c"; }
    if (paloCodigo === 'D') { iconoPalo = "♦️";  colorTexto = "#e74c3c"; }
    if (paloCodigo === 'S') { iconoPalo = "♠️";  colorTexto = "#bdc3c7"; }
    if (paloCodigo === 'C') { iconoPalo = "♣️";  colorTexto = "#bdc3c7"; }

    return `<span style="color:${colorTexto}; font-weight:bold; padding:2px 6px; background:rgba(0,0,0,0.3); border-radius:4px;">${numero} ${iconoPalo}</span>`;
}

function colorearNombre(nombre, color) {
    const hex = color === "rojo"  ? "#e74c3c"
              : color === "azul"  ? "#3498db"
              : color === "verde" ? "#2ecc71"
              : "#ffffff";
    return `<b style="color:${hex}; text-shadow:0 0 6px ${hex}80;">${nombre}</b>`;
}

// ============================================
// HISTORIAL
// ============================================
function registrarAccion(mensaje) {
    baseDatos.ref(`${estado.rutaSala}/estado/historial`).push(mensaje);
}

// ============================================
// GENERACIÓN DEL MAZO
// ============================================
export function obtenerMazoBarajado() {
    const palos   = ['S', 'H', 'D', 'C'];
    const valores = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'Q', 'K'];

    let mazoBase = [];
    palos.forEach(palo => {
        valores.forEach(valor => mazoBase.push(valor + palo));
    });

    const jacksEspeciales = ['J1D', 'J1D', 'J1C', 'J1C', 'J2H', 'J2H', 'J2S', 'J2S'];
    let mazoCompleto = [...mazoBase, ...mazoBase, ...jacksEspeciales];

    for (let i = mazoCompleto.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [mazoCompleto[i], mazoCompleto[j]] = [mazoCompleto[j], mazoCompleto[i]];
    }

    return mazoCompleto;
}

// ============================================
// EFECTOS VISUALES
// ============================================
function mostrarOverlayJack(tipo, codigoCarta) {
    const overlay = document.getElementById('overlay-jack');
    const img     = document.getElementById('overlay-jack-img');
    if (!overlay || !img) return;

    if (timerOverlayJack) clearTimeout(timerOverlayJack);

    const codigoAPI = "J" + codigoCarta.slice(2);
    img.src = `https://deckofcardsapi.com/static/img/${codigoAPI}.png`;
    img.alt = codigoCarta;

    img.classList.remove('jack-carta-animada');
    overlay.className = `visible jack-${tipo}`;

    requestAnimationFrame(() => {
        img.classList.add('jack-carta-animada');
    });

    timerOverlayJack = setTimeout(() => {
        overlay.className = '';
    }, 2200);
}

function limpiarEfectosAnteriores() {
    if (timerUltimaColocada)  { clearTimeout(timerUltimaColocada);  timerUltimaColocada  = null; }
    if (timerUltimaRemovida)  { clearTimeout(timerUltimaRemovida);  timerUltimaRemovida  = null; }
    if (ultimaFichaColocadaEl) {
        ultimaFichaColocadaEl.classList.remove('ultima-colocada');
        ultimaFichaColocadaEl = null;
    }
    if (ultimaCasillaRemovidaEl) {
        ultimaCasillaRemovidaEl.classList.remove('ultima-removida');
        ultimaCasillaRemovidaEl = null;
    }
}

// ============================================
// COLOCAR / QUITAR FICHA VISUAL
// ============================================
function colocarFichaVisual(indice, color) {
    const casillas = document.querySelectorAll('.casilla');
    if (casillas[indice].querySelector('.ficha')) return;

    if (timerUltimaColocada) { clearTimeout(timerUltimaColocada); timerUltimaColocada = null; }
    if (ultimaFichaColocadaEl) {
        ultimaFichaColocadaEl.classList.remove('ultima-colocada');
        void ultimaFichaColocadaEl.offsetHeight;
        ultimaFichaColocadaEl = null;
    }

    const ficha = document.createElement('div');
    ficha.classList.add('ficha', `ficha-${color}`);
    ficha.style.transform  = 'translate(-50%, -50%) scale(0)';
    ficha.style.transition = 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)';
    casillas[indice].appendChild(ficha);

    requestAnimationFrame(() => {
        ficha.style.transform = 'translate(-50%, -50%) scale(1)';

        ficha.addEventListener('transitionend', () => {
            if (!ficha.isConnected) return;

            ficha.style.transform  = '';
            ficha.style.transition = '';

            if (ultimaFichaColocadaEl && ultimaFichaColocadaEl !== ficha) {
                ultimaFichaColocadaEl.classList.remove('ultima-colocada');
            }
            if (timerUltimaColocada) { clearTimeout(timerUltimaColocada); timerUltimaColocada = null; }

            ficha.classList.add('ultima-colocada');
            ultimaFichaColocadaEl = ficha;

            timerUltimaColocada = setTimeout(() => {
                ficha.classList.remove('ultima-colocada');
                if (ultimaFichaColocadaEl === ficha) ultimaFichaColocadaEl = null;
                timerUltimaColocada = null;
            }, 5000);
        }, { once: true });
    });
}

function quitarFichaVisual(indice) {
    const casillas = document.querySelectorAll('.casilla');
    const casilla  = casillas[indice];
    const ficha    = casilla.querySelector('.ficha');
    if (!ficha) return;

    if (ultimaCasillaRemovidaEl && ultimaCasillaRemovidaEl !== casilla) {
        ultimaCasillaRemovidaEl.classList.remove('ultima-removida');
    }

    ficha.style.transition = 'transform 0.2s ease-in, opacity 0.2s ease-in';
    ficha.style.transform  = 'translate(-50%, -50%) scale(0)';
    ficha.style.opacity    = '0';
    ficha.addEventListener('transitionend', () => {
        ficha.remove();
        casilla.classList.add('ultima-removida');
        ultimaCasillaRemovidaEl = casilla;

        if (timerUltimaRemovida) clearTimeout(timerUltimaRemovida);
        timerUltimaRemovida = setTimeout(() => {
            casilla.classList.remove('ultima-removida');
            if (ultimaCasillaRemovidaEl === casilla) ultimaCasillaRemovidaEl = null;
            timerUltimaRemovida = null;
        }, 5000);
    }, { once: true });
}

// ============================================
// EVALUACIÓN DE OPCIONES DE TURNO
// ============================================
export function evaluarOpcionesDeTurno() {
    const pantallaJuego = document.getElementById('pantalla-juego');
    if (!miTurno || !pantallaJuego.classList.contains('activa')) return;

    let tieneJugada      = false;
    let tieneCartaMuerta = false;
    const casillas = document.querySelectorAll('.casilla');

    if (estado.manoPropia && estado.manoPropia.length > 0) {
        for (const carta of estado.manoPropia) {
            if (carta.startsWith('J1')) {
                const hayLibre = [...casillas].some(c =>
                    c.dataset.carta !== "LIBRE" && !c.querySelector('.ficha')
                );
                if (hayLibre) { tieneJugada = true; break; }
                continue;
            }
            if (carta.startsWith('J2')) {
                const hayRival = [...casillas].some(c => {
                    const ficha = c.querySelector('.ficha');
                    if (!ficha) return false;
                    if (ficha.classList.contains(`ficha-${estado.miJugador.color}`)) return false;
                    return !c.classList.contains('protegida-rojo') &&
                           !c.classList.contains('protegida-azul') &&
                           !c.classList.contains('protegida-verde');
                });
                if (hayRival) { tieneJugada = true; break; }
                continue;
            }

            let hayEspacioLibre    = false;
            let totalPosiciones    = 0;
            let posicionesOcupadas = 0;

            casillas.forEach(c => {
                if (c.dataset.carta === carta) {
                    totalPosiciones++;
                    if (c.querySelector('.ficha')) posicionesOcupadas++;
                    else hayEspacioLibre = true;
                }
            });

            if (hayEspacioLibre) {
                tieneJugada = true;
                break;
            }

            if (totalPosiciones > 0 && totalPosiciones === posicionesOcupadas) {
                tieneCartaMuerta = true;
            }
        }
    }

    const btnPasar = document.getElementById('btn-pasar-turno');

    if (!tieneJugada && !tieneCartaMuerta) {
        btnPasar.classList.remove('oculta');
        mostrarToast("No tienes jugadas posibles. Debes pasar tu turno.", "warning", 5000);
    } else if (!tieneJugada && tieneCartaMuerta) {
        btnPasar.classList.add('oculta');
        mostrarToast("Estás bloqueado, pero puedes DESCARTAR una carta muerta para robar.", "info", 5000);
    } else {
        btnPasar.classList.add('oculta');
    }
}

// ============================================
// PASAR TURNO
// ============================================
function pasarTurno() {
    const indiceActual    = listaOrdenTurnos.indexOf(estado.miJugadorId);
    const siguienteIndice = (indiceActual + 1) % listaOrdenTurnos.length;
    baseDatos.ref(`${estado.rutaSala}/estado/turnoActual`).set(listaOrdenTurnos[siguienteIndice]);
}

export function ejecutarPasoDeTurno() {
    const nombreColor = colorearNombre(estado.miJugador.nombre, estado.miJugador.color);
    registrarAccion(`⏭️ ${nombreColor} tuvo que pasar su turno.`);

    baseDatos.ref(`${estado.rutaSala}/estado/turnosPasados`).transaction(val => (val || 0) + 1)
        .then(() => pasarTurno());
}

// Exponer en window para el onclick del HTML
window.ejecutarPasoDeTurno = ejecutarPasoDeTurno;

// ============================================
// INTENTAR PONER FICHA (manejador de click en casilla)
// ============================================
function intentarPonerFicha(indiceTablero, cartaTablero) {
    if (!miTurno)                              return mostrarToast("¡Paciencia! Aún no es tu turno.", "warning");
    if (estado.cartaSeleccionadaIdx === null)  return mostrarToast("¡Primero selecciona una carta de tu mano!", "warning");
    if (cartaTablero === "LIBRE")              return mostrarToast("Las esquinas son comodines para todos.", "info");

    const cartaEnMano   = estado.manoPropia[estado.cartaSeleccionadaIdx];
    const casillas      = document.querySelectorAll('.casilla');
    const casillaActual = casillas[indiceTablero];
    const tieneFicha    = casillaActual.querySelector('.ficha');
    const nombreColor   = colorearNombre(estado.miJugador.nombre, estado.miJugador.color);

    if (cartaEnMano.startsWith("J2")) {
        if (!tieneFicha) return mostrarToast("Usa el Jack sobre una ficha del oponente.", "warning");

        if (tieneFicha.classList.contains(`ficha-${estado.miJugador.color}`)) {
            return mostrarToast("No puedes quitar tus propias fichas con el Jack de 1 Ojo.", "error");
        }

        const estaProtegida = casillaActual.classList.contains('protegida-rojo') ||
                              casillaActual.classList.contains('protegida-azul') ||
                              casillaActual.classList.contains('protegida-verde');
        if (estaProtegida) return mostrarToast("No puedes quitar una ficha de un Sequence ya completado.", "error");

        limpiarEfectosAnteriores();
        ultimaCasillaRemovidaEl = casillaActual;

        mostrarOverlayJack('remove', cartaEnMano);

        actualizarManoTrasJugadaConAccion(
            `❌ ${nombreColor} quitó una ficha con su Jack de 1 Ojo.`,
            { tipo: 'remove', indice: indiceTablero, jackCarta: cartaEnMano }
        );
        return;
    }

    if (tieneFicha) return mostrarToast("Esta casilla ya está ocupada.", "warning");

    const jugadaValida = cartaEnMano.startsWith("J1") || (cartaEnMano === cartaTablero);
    if (!jugadaValida) return mostrarToast("Esa carta no coincide con esta casilla.", "error");

    limpiarEfectosAnteriores();

    if (cartaEnMano.startsWith("J1")) {
        mostrarOverlayJack('add', cartaEnMano);
    }

    const cartaTraducida = traducirCartaAIcono(cartaTablero);
    const msj = cartaEnMano.startsWith("J1")
        ? `🃏 ${nombreColor} usó un Comodín (2 Ojos) en ${cartaTraducida}.`
        : `🃏 ${nombreColor} colocó ficha en ${cartaTraducida}.`;

    actualizarManoTrasJugadaConAccion(
        msj,
        { tipo: 'add', indice: indiceTablero, color: estado.miJugador.color, jackCarta: cartaEnMano.startsWith("J1") ? cartaEnMano : null }
    );
}

// Registrar el manejador de casillas en tablero.js
registrarManejadorCasilla(intentarPonerFicha);

// ============================================
// ESCRITURA ATÓMICA MULTI-PATH TRAS JUGADA
// ============================================
function actualizarManoTrasJugadaConAccion(mensajeHistorial, accion) {
    const idxJugado = estado.cartaSeleccionadaIdx;
    estado.spliceManoPropia(idxJugado, 1);
    estado.setCartaSeleccionadaIdx(null);

    let cartaRobadaDeMazo = null;

    // Bloqueamos el listener de la mano para que no sobreescriba el estado local
    ignorarSiguienteActualizacionMano();

    // Transacción atómica en el mazo para evitar condiciones de carrera
    baseDatos.ref(`${estado.rutaSala}/mazo`).transaction((mazoActual) => {
        if (mazoActual === null || mazoActual === undefined) return;

        const mazoNuevo = [...mazoActual];

        if (mazoNuevo.length > 0) {
            cartaRobadaDeMazo = mazoNuevo[mazoNuevo.length - 1];
            mazoNuevo.pop();
        } else {
            cartaRobadaDeMazo = null;
        }

        return mazoNuevo;

    }, (error, committed) => {
        if (error) {
            console.error('Transacción del mazo falló con error:', error);
            // Liberamos los bloqueos y forzamos re-render para que la mano
            // no quede vacía si la transacción falló definitivamente.
            liberarBloqueosYRenderizar();
            return;
        }
        if (!committed) return;

        if (cartaRobadaDeMazo) {
            estado.pushManoPropia(cartaRobadaDeMazo);
        }

        // Renderizamos de inmediato (el listener fue bloqueado intencionalmente)
        renderizarMano();

        const indiceActual    = listaOrdenTurnos.indexOf(estado.miJugadorId);
        const siguienteIndice = (indiceActual + 1) % listaOrdenTurnos.length;
        const siguienteTurno  = listaOrdenTurnos[siguienteIndice];
        const historialKey    = Date.now().toString();

        const updates = {};

        if (accion.tipo === 'add') {
            updates[`${estado.rutaSala}/tablero/${accion.indice}`] = accion.color;
            if (accion.jackCarta) {
                updates[`${estado.rutaSala}/estado/ultimoJack`] = {
                    tipo: 'add',
                    codigoCarta: accion.jackCarta,
                    jugadorId: estado.miJugadorId,
                    ts: Date.now()
                };
            }
        } else if (accion.tipo === 'remove') {
            updates[`${estado.rutaSala}/tablero/${accion.indice}`] = null;
            updates[`${estado.rutaSala}/estado/ultimoJack`] = {
                tipo: 'remove',
                codigoCarta: accion.jackCarta,
                jugadorId: estado.miJugadorId,
                ts: Date.now()
            };
        }

        updates[`${estado.rutaSala}/jugadores/${estado.miJugadorId}/mano`] = estado.manoPropia;
        updates[`${estado.rutaSala}/estado/turnoActual`]                   = siguienteTurno;
        updates[`${estado.rutaSala}/estado/turnosPasados`]                 = 0;
        updates[`${estado.rutaSala}/estado/historial/${historialKey}`]     = mensajeHistorial;

        baseDatos.ref().update(updates);

    }, false);
}

// ============================================
// DESCARTAR CARTA MUERTA
// ============================================
function descartarYRobarSinPasarTurno(cartaDescartada) {
    estado.spliceManoPropia(estado.cartaSeleccionadaIdx, 1);
    estado.setCartaSeleccionadaIdx(null);

    const nombreColor      = colorearNombre(estado.miJugador.nombre, estado.miJugador.color);
    const cartaTraducida   = traducirCartaAIcono(cartaDescartada);
    const historialKey     = Date.now().toString();
    const mensajeHistorial = `🗑️ ${nombreColor} descartó un ${cartaTraducida} muerto.`;

    ignorarSiguienteActualizacionMano();

    let cartaRobadaDescartar = null;

    baseDatos.ref(`${estado.rutaSala}/mazo`).transaction((mazoActual) => {
        if (mazoActual === null || mazoActual === undefined) return;

        const mazoNuevo = [...mazoActual];

        if (mazoNuevo.length > 0) {
            cartaRobadaDescartar = mazoNuevo[mazoNuevo.length - 1];
            mazoNuevo.pop();
        } else {
            cartaRobadaDescartar = null;
        }

        return mazoNuevo;

    }, (error, committed) => {
        if (error || !committed) {
            console.error('Transacción de descarte falló:', error);
            // Liberamos bloqueos para que el listener de la mano pueda
            // volver a actualizar la vista normalmente.
            liberarBloqueosYRenderizar();
            return;
        }

        if (cartaRobadaDescartar) {
            estado.pushManoPropia(cartaRobadaDescartar);
        }

        renderizarMano();

        const updates = {};
        updates[`${estado.rutaSala}/jugadores/${estado.miJugadorId}/mano`] = estado.manoPropia;
        updates[`${estado.rutaSala}/estado/historial/${historialKey}`]     = mensajeHistorial;

        baseDatos.ref().update(updates).then(() => {
            setTimeout(evaluarOpcionesDeTurno, 500);
        });
    }, false);
}

export function intentarDescartarCartaMuerta() {
    if (!miTurno)                             return mostrarToast("¡Paciencia! Aún no es tu turno.", "warning");
    if (estado.cartaSeleccionadaIdx === null) return mostrarToast("Selecciona la carta que quieres descartar.", "warning");

    const cartaEnMano = estado.manoPropia[estado.cartaSeleccionadaIdx];
    if (cartaEnMano.startsWith("J")) return mostrarToast("Los Jacks son comodines, nunca pueden ser cartas muertas.", "info");

    const casillas = document.querySelectorAll('.casilla');
    let totalPosiciones    = 0;
    let posicionesOcupadas = 0;

    casillas.forEach((casilla) => {
        if (casilla.dataset.carta === cartaEnMano) {
            totalPosiciones++;
            if (casilla.querySelector('.ficha')) posicionesOcupadas++;
        }
    });

    if (totalPosiciones > 0 && posicionesOcupadas === totalPosiciones) {
        mostrarToast("¡Efectivamente! Es una carta muerta.", "success");
        descartarYRobarSinPasarTurno(cartaEnMano);
    } else {
        mostrarToast("Esta carta NO es una carta muerta. Aún hay espacios libres en el tablero para ella.", "error");
    }
}

// Exponer en window para el onclick del HTML
window.intentarDescartarCartaMuerta = intentarDescartarCartaMuerta;

// ============================================
// DETECCIÓN DE SEQUENCES
// ============================================
function verificarSequence(colorJugador) {
    const casillas = document.querySelectorAll('.casilla');

    const esDelJugador = (indice) => {
        const c = casillas[indice];
        return c.querySelector(`.ficha-${colorJugador}`) !== null || mapaCartas[indice] === "LIBRE";
    };

    const combosACandidatos = [];

    for (let f = 0; f < TAMANO_TABLERO; f++) {
        for (let c = 0; c <= TAMANO_TABLERO - 5; c++) {
            const combo = [];
            for (let i = 0; i < 5; i++) combo.push(f * TAMANO_TABLERO + (c + i));
            combosACandidatos.push(combo);
        }
    }
    for (let c = 0; c < TAMANO_TABLERO; c++) {
        for (let f = 0; f <= TAMANO_TABLERO - 5; f++) {
            const combo = [];
            for (let i = 0; i < 5; i++) combo.push((f + i) * TAMANO_TABLERO + c);
            combosACandidatos.push(combo);
        }
    }
    for (let f = 0; f <= TAMANO_TABLERO - 5; f++) {
        for (let c = 0; c <= TAMANO_TABLERO - 5; c++) {
            const combo = [];
            for (let i = 0; i < 5; i++) combo.push((f + i) * TAMANO_TABLERO + (c + i));
            combosACandidatos.push(combo);
        }
    }
    for (let f = 0; f <= TAMANO_TABLERO - 5; f++) {
        for (let c = 4; c < TAMANO_TABLERO; c++) {
            const combo = [];
            for (let i = 0; i < 5; i++) combo.push((f + i) * TAMANO_TABLERO + (c - i));
            combosACandidatos.push(combo);
        }
    }

    for (const combo of combosACandidatos) {
        if (combo.every(esDelJugador)) {
            marcarSequence(combo, colorJugador);
        }
    }
}

function marcarSequence(indices, colorJugador) {
    const casillas = document.querySelectorAll('.casilla');

    const claveCombo = [...indices].sort((a, b) => a - b).join(',');
    if (combosYaMarcados.has(claveCombo)) return;

    let fichasNuevas = 0;
    indices.forEach(indice => {
        if (!casillas[indice].classList.contains(`protegida-${colorJugador}`)) {
            fichasNuevas++;
        }
    });

    if (fichasNuevas < 4) return;

    combosYaMarcados.add(claveCombo);

    indices.forEach(indice => {
        casillas[indice].classList.add(`protegida-${colorJugador}`);
    });

    secuenciasLogradas[colorJugador]++;

    const nombreEquipo = colorearNombre(`Equipo ${colorJugador.toUpperCase()}`, colorJugador);
    registrarAccion(`🔥 ¡El ${nombreEquipo} logró un Sequence! (${secuenciasLogradas[colorJugador]}/${configuracionJuego.sequencesParaGanar})`);

    if (secuenciasLogradas[colorJugador] >= configuracionJuego.sequencesParaGanar) {
        baseDatos.ref(`${estado.rutaSala}/estado/victoria`).set(colorJugador);
    }
}

// ============================================
// LISTENERS DINÁMICOS — se inician desde iniciarListenerTablero()
// ============================================
export let tableroListenerActivo = false;

export function iniciarListenerTablero() {
    if (tableroListenerActivo) return;
    tableroListenerActivo = true;

    // Asignar la referencia dinámica al tablero
    tableroRef = baseDatos.ref(`${estado.rutaSala}/tablero`);

    // Listener: tablero
    tableroRef.on('value', (snapshot) => {
        const casillas = document.querySelectorAll('.casilla');
        if (casillas.length < TAMANO_TABLERO * TAMANO_TABLERO) return;

        const rawVal = snapshot.val();
        const estadoServidor = {};
        if (rawVal !== null && rawVal !== undefined) {
            if (Array.isArray(rawVal)) {
                rawVal.forEach((color, idx) => {
                    if (color !== null && color !== undefined) {
                        estadoServidor[idx] = color;
                    }
                });
            } else {
                Object.keys(rawVal).forEach(k => {
                    if (rawVal[k] !== null && rawVal[k] !== undefined) {
                        estadoServidor[Number(k)] = rawVal[k];
                    }
                });
            }
        }

        casillas.forEach((casilla, idx) => {
            if (casilla.querySelector('.ficha') && !(idx in estadoServidor)) {
                quitarFichaVisual(idx);
            }
        });

        for (const idx in estadoServidor) {
            const indice = Number(idx);
            if (!casillas[indice].querySelector('.ficha')) {
                colocarFichaVisual(indice, estadoServidor[indice]);
                verificarSequence(estadoServidor[indice]);
            }
        }
    });

    // Listener: historial
    baseDatos.ref(`${estado.rutaSala}/estado/historial`).on('child_added', (snapshot) => {
        const msj = snapshot.val();
        const ul  = document.getElementById('lista-historial');
        if (!ul) return;

        const li = document.createElement('li');
        li.style.padding      = "8px 0";
        li.style.borderBottom = "1px dashed rgba(255,255,255,0.1)";
        li.innerHTML = msj;
        ul.appendChild(li);
        ul.scrollTop = ul.scrollHeight;
    });

    // Listener: contador de mazo
    baseDatos.ref(`${estado.rutaSala}/mazo`).on('value', (snapshot) => {
        const mazo     = snapshot.val() || [];
        const contador = document.getElementById('contador-mazo');
        if (contador) contador.innerText = mazo.length;
    });

    // Listener: orden de turnos
    baseDatos.ref(`${estado.rutaSala}/estado/ordenTurnos`).on('value', (snapshot) => {
        listaOrdenTurnos = snapshot.val() || [];
    });

    // Listener: turno actual
    baseDatos.ref(`${estado.rutaSala}/estado/turnoActual`).on('value', (snapshot) => {
        turnoActualId = snapshot.val();
        miTurno = (turnoActualId === estado.miJugadorId);

        const manoElement = document.getElementById('mano-jugador');
        const tituloMano  = document.getElementById('titulo-mano');

        if (miTurno) {
            manoElement.classList.add('mi-turno');
            manoElement.classList.remove('esperando-turno');

            tituloMano.innerText = "Tu Mano (¡ES TU TURNO!)";
            tituloMano.classList.remove('turno-rojo', 'turno-azul', 'turno-verde');
            if (estado.miJugador.color) tituloMano.classList.add(`turno-${estado.miJugador.color}`);

            evaluarOpcionesDeTurno();
        } else {
            manoElement.classList.remove('mi-turno');
            manoElement.classList.add('esperando-turno');

            const jugadorTurno = estado.jugadoresEnSala.find(j => j.id === turnoActualId);
            tituloMano.innerText = `Esperando a ${jugadorTurno ? jugadorTurno.nombre : "el oponente"}...`;
            tituloMano.classList.remove('turno-rojo', 'turno-azul', 'turno-verde');

            document.getElementById('btn-pasar-turno').classList.add('oculta');
        }
    });

    // Listener: muerte súbita / empate técnico
    baseDatos.ref(`${estado.rutaSala}/estado/turnosPasados`).on('value', (snapshot) => {
        const pases = snapshot.val() || 0;

        if (!estado.juegoIniciadoVisualmente) return;
        if (estado.jugadoresEnSala.length === 0) return;
        if (estado.jugadoresEnSala[0].id !== estado.miJugadorId) return;
        if (pases < estado.jugadoresEnSala.length) return;

        baseDatos.ref(`${estado.rutaSala}/mazo`).once('value', (mazoSnap) => {
            const mazo = mazoSnap.val() || [];
            if (mazo.length > 0) return;

            let maxSequences     = 0;
            let equipoGanador    = null;
            let equiposEmpatados = [];

            for (const equipo in secuenciasLogradas) {
                const seqs = secuenciasLogradas[equipo];
                if (seqs > maxSequences) {
                    maxSequences     = seqs;
                    equipoGanador    = equipo;
                    equiposEmpatados = [equipo];
                } else if (seqs === maxSequences && seqs > 0) {
                    equiposEmpatados.push(equipo);
                }
            }

            if (maxSequences > 0 && equiposEmpatados.length === 1) {
                baseDatos.ref(`${estado.rutaSala}/estado/victoria`).set(equipoGanador);
            } else {
                baseDatos.ref(`${estado.rutaSala}/estado/empate`).set(true);
            }
        });
    });

    // Listener: overlay de Jack (para otros jugadores)
    baseDatos.ref(`${estado.rutaSala}/estado/ultimoJack`).on('value', (snapshot) => {
        if (!estado.juegoIniciadoVisualmente) return;
        const datos = snapshot.val();
        if (!datos) return;
        if (datos.jugadorId === estado.miJugadorId) return;

        mostrarOverlayJack(datos.tipo, datos.codigoCarta);
    });
}

// ============================================
// REINICIO DE ESTADO LOCAL
// ============================================
export function reiniciarEstadoJuegoLocal() {
    secuenciasLogradas = { rojo: 0, azul: 0, verde: 0 };
    combosYaMarcados.clear();

    limpiarEfectosAnteriores();
    if (timerOverlayJack) {
        clearTimeout(timerOverlayJack);
        timerOverlayJack = null;
    }
    const overlay = document.getElementById('overlay-jack');
    if (overlay) overlay.className = '';

    const listaHistorial = document.getElementById('lista-historial');
    if (listaHistorial) listaHistorial.innerHTML = "";

    generarTablero();
}

// Setter para que lobby.js pueda resetear el flag del listener
export function setTableroListenerActivo(val) {
    tableroListenerActivo = val;
}
