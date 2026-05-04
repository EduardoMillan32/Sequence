// Js/game.js

const TAMANO_TABLERO = 10;

// Conteo LOCAL de sequences por equipo (se reinicia con cada partida)
let secuenciasLogradas = { rojo: 0, azul: 0, verde: 0 };

// Conjunto de combos ya marcados como sequence (evita doble conteo)
// Guardamos la clave como string ordenado de índices: "0,1,2,3,4"
let combosYaMarcados = new Set();

const tableroRef = baseDatos.ref('sala_activa/tablero');
let turnoActualId  = null;
let miTurno        = false;
let listaOrdenTurnos = [];

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

    // Jacks especiales: J1 = 2 ojos (comodín), J2 = 1 ojo (anticomodín)
    const jacksEspeciales = ['J1S', 'J1H', 'J1D', 'J1C', 'J2S', 'J2H', 'J2D', 'J2C'];

    // El mazo de Sequence usa 2 barajas completas + los jacks especiales
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
            // Los Jacks siempre son jugables
            if (carta.startsWith('J')) {
                tieneJugada = true;
                break;
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

        tableroRef.child(indiceTablero).remove();
        actualizarManoTrasJugada(`❌ ${nombreColor} quitó una ficha con su Jack.`);
        return;
    }

    // --- Casilla ya ocupada ---
    if (tieneFicha) return mostrarToast("Esta casilla ya está ocupada.", "warning");

    // --- Jack de 2 ojos (comodín): cualquier casilla libre ---
    // --- Carta normal: debe coincidir con la casilla ---
    const jugadaValida = cartaEnMano.startsWith("J1") || (cartaEnMano === cartaTablero);

    if (!jugadaValida) return mostrarToast("Esa carta no coincide con esta casilla.", "error");

    tableroRef.child(indiceTablero).set(miJugador.color);

    const cartaTraducida = traducirCartaAIcono(cartaTablero);
    const msj = cartaEnMano.startsWith("J1")
        ? `🃏 ${nombreColor} usó un Comodín en ${cartaTraducida}.`
        : `🃏 ${nombreColor} colocó ficha en ${cartaTraducida}.`;

    actualizarManoTrasJugada(msj);
}

function colocarFichaVisual(indice, color) {
    const casillas = document.querySelectorAll('.casilla');
    if (casillas[indice].querySelector('.ficha')) return; // Ya existe, no duplicar

    const ficha = document.createElement('div');
    ficha.classList.add('ficha', `ficha-${color}`);
    ficha.style.transform = 'scale(0)';
    casillas[indice].appendChild(ficha);

    requestAnimationFrame(() => {
        ficha.style.transition = 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)';
        ficha.style.transform  = 'scale(1)';
    });
}

function quitarFichaVisual(indice) {
    const casillas = document.querySelectorAll('.casilla');
    const ficha    = casillas[indice].querySelector('.ficha');
    if (!ficha) return;

    ficha.style.transition = 'transform 0.2s ease-in, opacity 0.2s ease-in';
    ficha.style.transform  = 'scale(0)';
    ficha.style.opacity    = '0';
    ficha.addEventListener('transitionend', () => ficha.remove(), { once: true });
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
    const listaHistorial = document.getElementById('lista-historial');
    if (listaHistorial) listaHistorial.innerHTML = "";
    if (typeof generarTablero === 'function') generarTablero();
}
