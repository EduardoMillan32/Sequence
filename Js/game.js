// Js/game.js

const TAMANO_TABLERO = 10;

// Conteo LOCAL de sequences por equipo (se reinicia con cada partida)
let secuenciasLogradas = { rojo: 0, azul: 0, verde: 0 };

// Conjunto de combos ya marcados como sequence (evita doble conteo)
// Guardamos la clave como string ordenado de índices: "0,1,2,3,4"
let combosYaMarcados = new Set();

const tableroRef = baseDatos.ref('sala_activa/tablero');
let turnoActualId    = null;
let miTurno          = false;
let listaOrdenTurnos = [];

// Referencia a la última ficha colocada (para quitar el brillo al siguiente turno)
let ultimaFichaColocadaEl  = null;
// Referencia a la última casilla de la que se quitó una ficha
let ultimaCasillaRemovidaEl = null;
// Timer para auto-limpiar el overlay de Jack
let timerOverlayJack = null;
// Timers para auto-limpiar los efectos de última ficha colocada/removida
let timerUltimaColocada  = null;
let timerUltimaRemovida  = null;

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
    const hex = color === "rojo" ? "#e74c3c"
              : color === "azul" ? "#3498db"
              : color === "verde" ? "#2ecc71"
              : "#ffffff";
    return `<b style="color:${hex}; text-shadow:0 0 6px ${hex}80;">${nombre}</b>`;
}

// ============================================
// HISTORIAL Y CONTADOR DE MAZO
// ============================================
baseDatos.ref('sala_activa/estado/historial').on('child_added', (snapshot) => {
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

baseDatos.ref('sala_activa/mazo').on('value', (snapshot) => {
    const mazo    = snapshot.val() || [];
    const contador = document.getElementById('contador-mazo');
    if (contador) contador.innerText = mazo.length;
});

function registrarAccion(mensaje) {
    baseDatos.ref('sala_activa/estado/historial').push(mensaje);
}

// ============================================
// MUERTE SÚBITA / EMPATE TÉCNICO
// ============================================
baseDatos.ref('sala_activa/estado/turnosPasados').on('value', (snapshot) => {
    const pases = snapshot.val() || 0;

    // Solo actuar si hay jugadores y todos han pasado al menos una vez
    if (!juegoIniciadoVisualmente) return;
    if (jugadoresEnSala.length === 0) return;
    if (pases < jugadoresEnSala.length) return;

    // Solo el anfitrión decide el resultado para evitar escrituras duplicadas
    if (jugadoresEnSala[0].id !== miJugadorId) return;

    let maxSequences   = 0;
    let equipoGanador  = null;
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
        baseDatos.ref('sala_activa/estado/victoria').set(equipoGanador);
    } else {
        baseDatos.ref('sala_activa/estado/empate').set(true);
    }
});

baseDatos.ref('sala_activa/estado/ordenTurnos').on('value', (snapshot) => {
    listaOrdenTurnos = snapshot.val() || [];
});

baseDatos.ref('sala_activa/estado/turnoActual').on('value', (snapshot) => {
    turnoActualId = snapshot.val();
    miTurno = (turnoActualId === miJugadorId);

    const manoElement = document.getElementById('mano-jugador');
    const tituloMano  = document.getElementById('titulo-mano');

    if (miTurno) {
        manoElement.classList.add('mi-turno');
        manoElement.classList.remove('esperando-turno');

        tituloMano.innerText = "Tu Mano (¡ES TU TURNO!)";
        tituloMano.classList.remove('turno-rojo', 'turno-azul', 'turno-verde');
        if (miJugador.color) tituloMano.classList.add(`turno-${miJugador.color}`);

        evaluarOpcionesDeTurno();
    } else {
        manoElement.classList.remove('mi-turno');
        manoElement.classList.add('esperando-turno');

        const jugadorTurno = jugadoresEnSala.find(j => j.id === turnoActualId);
        tituloMano.innerText = `Esperando a ${jugadorTurno ? jugadorTurno.nombre : "el oponente"}...`;
        tituloMano.classList.remove('turno-rojo', 'turno-azul', 'turno-verde');

        document.getElementById('btn-pasar-turno').classList.add('oculta');
    }
});

// Cuando se coloca una ficha nueva en el tablero
tableroRef.on('child_added', (snapshot) => {
    const indice = snapshot.key;
    const color  = snapshot.val();
    colocarFichaVisual(indice, color);
    verificarSequence(color);
});

// Cuando se quita una ficha del tablero
tableroRef.on('child_removed', (snapshot) => {
    quitarFichaVisual(snapshot.key);
});

// ============================================
// LISTENER: Overlay de Jack (para todos los jugadores)
// El jugador que usa el Jack escribe en Firebase,
// todos los demás lo leen y muestran el overlay.
// ============================================
baseDatos.ref('sala_activa/estado/ultimoJack').on('value', (snapshot) => {
    if (!juegoIniciadoVisualmente) return;
    const datos = snapshot.val();
    if (!datos) return;

    // No mostrarlo al jugador que lo usó (ya lo ve localmente)
    if (datos.jugadorId === miJugadorId) return;

    mostrarOverlayJack(datos.tipo, datos.codigoCarta);
});

// ============================================
// GENERACIÓN DEL MAZO
// ============================================
function obtenerMazoBarajado() {
    const palos   = ['S', 'H', 'D', 'C'];
    // 'J' (Jack normal) incluido — los Jacks especiales se agregan por separado
    const valores = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'Q', 'K'];

    let mazoBase = [];
    palos.forEach(palo => {
        valores.forEach(valor => mazoBase.push(valor + palo));
    });

    // Jacks especiales:
    // J1 = 2 ojos (comodín)     → Diamante (JD) y Trébol (JC)
    // J2 = 1 ojo (anticomodín)  → Corazón  (JH) y Pica   (JS)
    // Con 2 barajas hay 2 copias de cada Jack, por lo que hay
    // 4 Jacks de 2 ojos (JD×2, JC×2) y 4 Jacks de 1 ojo (JH×2, JS×2)
    const jacksEspeciales = ['J1D', 'J1D', 'J1C', 'J1C', 'J2H', 'J2H', 'J2S', 'J2S'];

    // El mazo de Sequence usa 2 barajas completas (sin Jacks normales) + los jacks especiales
    let mazoCompleto = [...mazoBase, ...mazoBase, ...jacksEspeciales];

    // Barajado Fisher-Yates
    for (let i = mazoCompleto.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [mazoCompleto[i], mazoCompleto[j]] = [mazoCompleto[j], mazoCompleto[i]];
    }

    return mazoCompleto;
}

// ============================================
// EVALUACIÓN DE OPCIONES DE TURNO
// ============================================
window.evaluarOpcionesDeTurno = function () {
    const pantallaJuego = document.getElementById('pantalla-juego');
    if (!miTurno || !pantallaJuego.classList.contains('activa')) return;

    let tieneJugada      = false;
    let tieneCartaMuerta = false;
    const casillas = document.querySelectorAll('.casilla');

    if (manoPropia && manoPropia.length > 0) {
        for (const carta of manoPropia) {
            // Jack de 2 ojos: jugable si hay al menos una casilla libre (no esquina)
            if (carta.startsWith('J1')) {
                const hayLibre = [...casillas].some(c =>
                    c.dataset.carta !== "LIBRE" && !c.querySelector('.ficha')
                );
                if (hayLibre) { tieneJugada = true; break; }
                continue;
            }
            // Jack de 1 ojo: jugable si hay al menos una ficha rival no protegida
            if (carta.startsWith('J2')) {
                const hayRival = [...casillas].some(c => {
                    const ficha = c.querySelector('.ficha');
                    if (!ficha) return false;
                    if (ficha.classList.contains(`ficha-${miJugador.color}`)) return false;
                    return !c.classList.contains('protegida-rojo') &&
                           !c.classList.contains('protegida-azul') &&
                           !c.classList.contains('protegida-verde');
                });
                if (hayRival) { tieneJugada = true; break; }
                continue;
            }

            let hayEspacioLibre   = false;
            let totalPosiciones   = 0;
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

            // Carta muerta: existe en el tablero pero todas sus casillas están ocupadas
            if (totalPosiciones > 0 && totalPosiciones === posicionesOcupadas) {
                tieneCartaMuerta = true;
            }
        }
    }

    const btnPasar = document.getElementById('btn-pasar-turno');

    if (!tieneJugada && !tieneCartaMuerta) {
        // Sin jugadas y sin cartas muertas: debe pasar turno
        btnPasar.classList.remove('oculta');
        mostrarToast("No tienes jugadas posibles. Debes pasar tu turno.", "warning", 5000);
    } else if (!tieneJugada && tieneCartaMuerta) {
        // Bloqueado pero puede descartar
        btnPasar.classList.add('oculta');
        mostrarToast("Estás bloqueado, pero puedes DESCARTAR una carta muerta para robar.", "info", 5000);
    } else {
        btnPasar.classList.add('oculta');
    }
};

// ============================================
// PASAR TURNO
// ============================================
window.ejecutarPasoDeTurno = function () {
    const nombreColor = colorearNombre(miJugador.nombre, miJugador.color);
    registrarAccion(`⏭️ ${nombreColor} tuvo que pasar su turno.`);

    baseDatos.ref('sala_activa/estado/turnosPasados').transaction(val => (val || 0) + 1)
        .then(() => pasarTurno());
};

// ============================================
// EFECTOS VISUALES
// ============================================

/**
 * Muestra el overlay animado cuando se usa un Jack.
 * @param {'add'|'remove'} tipo    - 'add' = 2 ojos, 'remove' = 1 ojo
 * @param {string} codigoCarta     - Código interno de la carta (ej: "J1S", "J2H")
 */
function mostrarOverlayJack(tipo, codigoCarta) {
    const overlay = document.getElementById('overlay-jack');
    const img     = document.getElementById('overlay-jack-img');
    if (!overlay || !img) return;

    // Limpiar timer anterior si existía
    if (timerOverlayJack) clearTimeout(timerOverlayJack);

    // Construir URL de la carta:
    // J1S → JS, J2H → JH (la API solo conoce J sin número de ojo)
    const codigoAPI = "J" + codigoCarta.slice(2);
    img.src = `https://deckofcardsapi.com/static/img/${codigoAPI}.png`;
    img.alt = codigoCarta;

    // Forzar re-animación: quitar y re-añadir la clase CSS en el siguiente frame
    // (NO clonar el nodo — clonar haría que document.getElementById lo pierda)
    img.classList.remove('jack-carta-animada');
    overlay.className = `visible jack-${tipo}`;

    requestAnimationFrame(() => {
        img.classList.add('jack-carta-animada');
    });

    // Auto-ocultar después de 2.2 segundos
    timerOverlayJack = setTimeout(() => {
        overlay.className = '';
    }, 2200);
}

/**
 * Quita el brillo de la última ficha colocada y el marcado de la última removida.
 * Se llama al inicio de cada nueva jugada para limpiar el estado anterior.
 */
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
// COLOCAR / QUITAR FICHA
// ============================================
function intentarPonerFicha(indiceTablero, cartaTablero) {
    if (!miTurno)                    return mostrarToast("¡Paciencia! Aún no es tu turno.", "warning");
    if (cartaSeleccionadaIdx === null) return mostrarToast("¡Primero selecciona una carta de tu mano!", "warning");
    if (cartaTablero === "LIBRE")    return mostrarToast("Las esquinas son comodines para todos.", "info");

    const cartaEnMano  = manoPropia[cartaSeleccionadaIdx];
    const casillas     = document.querySelectorAll('.casilla');
    const casillaActual = casillas[indiceTablero];
    const tieneFicha   = casillaActual.querySelector('.ficha');
    const nombreColor  = colorearNombre(miJugador.nombre, miJugador.color);

    // --- Jack de 1 ojo (anticomodín): quita ficha rival ---
    if (cartaEnMano.startsWith("J2")) {
        if (!tieneFicha) return mostrarToast("Usa el Jack sobre una ficha del oponente.", "warning");

        const estaProtegida = casillaActual.classList.contains('protegida-rojo') ||
                              casillaActual.classList.contains('protegida-azul') ||
                              casillaActual.classList.contains('protegida-verde');
        if (estaProtegida) return mostrarToast("No puedes quitar una ficha de un Sequence ya completado.", "error");

        // Guardar referencia a la casilla ANTES de quitar la ficha (para el efecto visual)
        limpiarEfectosAnteriores();
        ultimaCasillaRemovidaEl = casillaActual;

        // Mostrar overlay localmente y notificar a los demás via Firebase
        mostrarOverlayJack('remove', cartaEnMano);
        baseDatos.ref('sala_activa/estado/ultimoJack').set({
            tipo: 'remove',
            codigoCarta: cartaEnMano,
            jugadorId: miJugadorId,
            ts: Date.now()
        });

        tableroRef.child(indiceTablero).remove();
        actualizarManoTrasJugada(`❌ ${nombreColor} quitó una ficha con su Jack de 1 Ojo.`);
        return;
    }

    // --- Casilla ya ocupada ---
    if (tieneFicha) return mostrarToast("Esta casilla ya está ocupada.", "warning");

    // --- Jack de 2 ojos (comodín): cualquier casilla libre ---
    // --- Carta normal: debe coincidir con la casilla ---
    const jugadaValida = cartaEnMano.startsWith("J1") || (cartaEnMano === cartaTablero);

    if (!jugadaValida) return mostrarToast("Esa carta no coincide con esta casilla.", "error");

    // Limpiar efectos de la jugada anterior antes de registrar la nueva
    limpiarEfectosAnteriores();

    // Mostrar overlay si es Jack de 2 ojos y notificar a los demás via Firebase
    if (cartaEnMano.startsWith("J1")) {
        mostrarOverlayJack('add', cartaEnMano);
        baseDatos.ref('sala_activa/estado/ultimoJack').set({
            tipo: 'add',
            codigoCarta: cartaEnMano,
            jugadorId: miJugadorId,
            ts: Date.now()
        });
    }

    tableroRef.child(indiceTablero).set(miJugador.color);

    const cartaTraducida = traducirCartaAIcono(cartaTablero);
    const msj = cartaEnMano.startsWith("J1")
        ? `🃏 ${nombreColor} usó un Comodín (2 Ojos) en ${cartaTraducida}.`
        : `🃏 ${nombreColor} colocó ficha en ${cartaTraducida}.`;

    actualizarManoTrasJugada(msj);
}

function colocarFichaVisual(indice, color) {
    const casillas = document.querySelectorAll('.casilla');
    if (casillas[indice].querySelector('.ficha')) return; // Ya existe, no duplicar

    // Quitar brillo de la ficha anterior antes de colocar la nueva
    if (ultimaFichaColocadaEl) {
        ultimaFichaColocadaEl.classList.remove('ultima-colocada');
        ultimaFichaColocadaEl = null;
    }

    const ficha = document.createElement('div');
    // Añadir clase 'entrando' ANTES de insertar en el DOM:
    // así el estado inicial (scale 0) está definido en CSS y no en estilos inline.
    // Esto evita que un reflow posterior afecte a fichas ya colocadas en el tablero.
    ficha.classList.add('ficha', `ficha-${color}`, 'entrando');
    casillas[indice].appendChild(ficha);

    // Forzar que el navegador registre el estado inicial (scale 0) antes de
    // quitar la clase 'entrando', lo que dispara la transición CSS a scale(1).
    // Usamos requestAnimationFrame doble para garantizar al menos un frame pintado.
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            ficha.classList.remove('entrando');

            // Aplicar brillo dorado tras la animación de entrada
            ficha.addEventListener('transitionend', () => {
                ficha.classList.add('ultima-colocada');
                ultimaFichaColocadaEl = ficha;

                // Auto-limpiar el brillo después de 8 segundos
                if (timerUltimaColocada) clearTimeout(timerUltimaColocada);
                timerUltimaColocada = setTimeout(() => {
                    ficha.classList.remove('ultima-colocada');
                    if (ultimaFichaColocadaEl === ficha) ultimaFichaColocadaEl = null;
                    timerUltimaColocada = null;
                }, 8000);
            }, { once: true });
        });
    });
}

function quitarFichaVisual(indice) {
    const casillas = document.querySelectorAll('.casilla');
    const casilla  = casillas[indice];
    const ficha    = casilla.querySelector('.ficha');
    if (!ficha) return;

    // Quitar marcado de casilla removida anterior
    if (ultimaCasillaRemovidaEl && ultimaCasillaRemovidaEl !== casilla) {
        ultimaCasillaRemovidaEl.classList.remove('ultima-removida');
    }

    ficha.style.transition = 'transform 0.2s ease-in, opacity 0.2s ease-in';
    ficha.style.transform  = 'scale(0)';
    ficha.style.opacity    = '0';
    ficha.addEventListener('transitionend', () => {
        ficha.remove();
        // Aplicar marcado rojo a la casilla vacía para indicar dónde se quitó la ficha
        casilla.classList.add('ultima-removida');
        ultimaCasillaRemovidaEl = casilla;

        // Auto-limpiar el marcado después de 5 segundos
        if (timerUltimaRemovida) clearTimeout(timerUltimaRemovida);
        timerUltimaRemovida = setTimeout(() => {
            casilla.classList.remove('ultima-removida');
            if (ultimaCasillaRemovidaEl === casilla) ultimaCasillaRemovidaEl = null;
            timerUltimaRemovida = null;
        }, 5000);
    }, { once: true });
}

// ============================================
// ACTUALIZAR MANO TRAS JUGADA
// ============================================
function actualizarManoTrasJugada(mensajeHistorial) {
    manoPropia.splice(cartaSeleccionadaIdx, 1);
    cartaSeleccionadaIdx = null;

    registrarAccion(mensajeHistorial);
    // Reiniciar contador de turnos pasados porque alguien jugó
    baseDatos.ref('sala_activa/estado/turnosPasados').set(0);

    let cartaExtraidaSegura = null;

    baseDatos.ref('sala_activa/mazo').transaction((mazoActual) => {
        if (mazoActual && mazoActual.length > 0) {
            cartaExtraidaSegura = mazoActual[mazoActual.length - 1];
            mazoActual.pop();
            return mazoActual;
        }
        return mazoActual || [];
    }).then((resultado) => {
        if (resultado.committed && cartaExtraidaSegura) {
            manoPropia.push(cartaExtraidaSegura);
        }
        miJugadorRef.child('mano').set(manoPropia).then(() => pasarTurno());
    });
}

function pasarTurno() {
    const indiceActual    = listaOrdenTurnos.indexOf(miJugadorId);
    const siguienteIndice = (indiceActual + 1) % listaOrdenTurnos.length;
    baseDatos.ref('sala_activa/estado/turnoActual').set(listaOrdenTurnos[siguienteIndice]);
}

// ============================================
// DETECCIÓN DE SEQUENCES
// ============================================
function verificarSequence(colorJugador) {
    const casillas = document.querySelectorAll('.casilla');

    // Una casilla cuenta para el jugador si tiene su ficha O es esquina libre
    const esDelJugador = (indice) => {
        const c = casillas[indice];
        return c.querySelector(`.ficha-${colorJugador}`) !== null || mapaCartas[indice] === "LIBRE";
    };

    const combosACandidatos = [];

    // Horizontal
    for (let f = 0; f < TAMANO_TABLERO; f++) {
        for (let c = 0; c <= TAMANO_TABLERO - 5; c++) {
            const combo = [];
            for (let i = 0; i < 5; i++) combo.push(f * TAMANO_TABLERO + (c + i));
            combosACandidatos.push(combo);
        }
    }
    // Vertical
    for (let c = 0; c < TAMANO_TABLERO; c++) {
        for (let f = 0; f <= TAMANO_TABLERO - 5; f++) {
            const combo = [];
            for (let i = 0; i < 5; i++) combo.push((f + i) * TAMANO_TABLERO + c);
            combosACandidatos.push(combo);
        }
    }
    // Diagonal ↘
    for (let f = 0; f <= TAMANO_TABLERO - 5; f++) {
        for (let c = 0; c <= TAMANO_TABLERO - 5; c++) {
            const combo = [];
            for (let i = 0; i < 5; i++) combo.push((f + i) * TAMANO_TABLERO + (c + i));
            combosACandidatos.push(combo);
        }
    }
    // Diagonal ↙
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

    // Clave única para este combo (índices ordenados)
    const claveCombo = [...indices].sort((a, b) => a - b).join(',');
    if (combosYaMarcados.has(claveCombo)) return; // Ya fue contado

    // Contar cuántas casillas del combo NO están ya protegidas por este equipo
    let fichasNuevas = 0;
    indices.forEach(indice => {
        if (!casillas[indice].classList.contains(`protegida-${colorJugador}`)) {
            fichasNuevas++;
        }
    });

    // Un sequence válido necesita al menos 4 fichas nuevas
    // (puede compartir 1 casilla con un sequence anterior del mismo equipo)
    if (fichasNuevas < 4) return;

    // Registrar el combo como marcado
    combosYaMarcados.add(claveCombo);

    // Aplicar clase de protección visual
    indices.forEach(indice => {
        casillas[indice].classList.add(`protegida-${colorJugador}`);
    });

    secuenciasLogradas[colorJugador]++;

    const nombreEquipo = colorearNombre(`Equipo ${colorJugador.toUpperCase()}`, colorJugador);
    registrarAccion(`🔥 ¡El ${nombreEquipo} logró un Sequence! (${secuenciasLogradas[colorJugador]}/${configuracionJuego.sequencesParaGanar})`);

    if (secuenciasLogradas[colorJugador] >= configuracionJuego.sequencesParaGanar) {
        // Cancelar limpieza automática al desconectarse antes de escribir victoria
        baseDatos.ref('sala_activa/estado').onDisconnect().cancel();
        baseDatos.ref('sala_activa/estado/victoria').set(colorJugador);
    }
}

// ============================================
// DESCARTAR CARTA MUERTA
// ============================================
function descartarYRobarSinPasarTurno(cartaDescartada) {
    manoPropia.splice(cartaSeleccionadaIdx, 1);
    cartaSeleccionadaIdx = null;

    const nombreColor    = colorearNombre(miJugador.nombre, miJugador.color);
    const cartaTraducida = traducirCartaAIcono(cartaDescartada);
    registrarAccion(`🗑️ ${nombreColor} descartó un ${cartaTraducida} muerto.`);

    let cartaExtraidaSegura = null;

    baseDatos.ref('sala_activa/mazo').transaction((mazoActual) => {
        if (mazoActual && mazoActual.length > 0) {
            cartaExtraidaSegura = mazoActual[mazoActual.length - 1];
            mazoActual.pop();
            return mazoActual;
        }
        return mazoActual || [];
    }).then((resultado) => {
        if (resultado.committed && cartaExtraidaSegura) {
            manoPropia.push(cartaExtraidaSegura);
        }
        miJugadorRef.child('mano').set(manoPropia).then(() => {
            renderizarMano();
            setTimeout(evaluarOpcionesDeTurno, 500);
        });
    });
}

window.intentarDescartarCartaMuerta = function () {
    if (!miTurno)                    return mostrarToast("¡Paciencia! Aún no es tu turno.", "warning");
    if (cartaSeleccionadaIdx === null) return mostrarToast("Selecciona la carta que quieres descartar.", "warning");

    const cartaEnMano = manoPropia[cartaSeleccionadaIdx];
    if (cartaEnMano.startsWith("J")) return mostrarToast("Los Jacks son comodines, nunca pueden ser cartas muertas.", "info");

    const casillas = document.querySelectorAll('.casilla');
    let totalPosiciones   = 0;
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
};

// ============================================
// REINICIO DE ESTADO LOCAL
// ============================================
function reiniciarEstadoJuegoLocal() {
    secuenciasLogradas = { rojo: 0, azul: 0, verde: 0 };
    combosYaMarcados.clear();

    // Limpiar efectos visuales de la partida anterior
    limpiarEfectosAnteriores();
    if (timerOverlayJack) {
        clearTimeout(timerOverlayJack);
        timerOverlayJack = null;
    }
    const overlay = document.getElementById('overlay-jack');
    if (overlay) overlay.className = '';

    const listaHistorial = document.getElementById('lista-historial');
    if (listaHistorial) listaHistorial.innerHTML = "";
    if (typeof generarTablero === 'function') generarTablero();
}
