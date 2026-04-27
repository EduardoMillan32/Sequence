// Js/game.js
const TAMANO_TABLERO = 10;
let secuenciasLogradas = { rojo: 0, azul: 0, verde: 0 };
const tableroRef = baseDatos.ref('sala_activa/tablero');
let turnoActualId = null;
let miTurno = false;
let listaOrdenTurnos = [];

// ==========================================
// AYUDANTES DE FORMATO VISUAL
// ==========================================
function traducirCartaAIcono(codigoCarta) {
    if (codigoCarta === "LIBRE") return "⭐ Esquina Libre";
    
    let numero = codigoCarta.substring(0, codigoCarta.length - 1);
    let paloCodigo = codigoCarta.slice(-1);
    
    let iconoPalo = "";
    let colorTexto = "white"; 

    if (paloCodigo === 'H') { iconoPalo = "❤️"; colorTexto = "#e74c3c"; } 
    if (paloCodigo === 'D') { iconoPalo = "♦️"; colorTexto = "#e74c3c"; } 
    if (paloCodigo === 'S') { iconoPalo = "♠️"; colorTexto = "#bdc3c7"; } 
    if (paloCodigo === 'C') { iconoPalo = "♣️"; colorTexto = "#bdc3c7"; } 
    
    return `<span style="color: ${colorTexto}; font-weight: bold; padding: 2px 6px; background: rgba(0,0,0,0.3); border-radius: 4px;">${numero} ${iconoPalo}</span>`;
}

// ¡NUEVO! Pincel para pintar el nombre según el equipo
function colorearNombre(nombre, color) {
    let hex = "#ffffff"; 
    if (color === "rojo") hex = "#e74c3c";
    if (color === "azul") hex = "#3498db";
    if (color === "verde") hex = "#2ecc71";
    
    // Devuelve el texto en negritas, con el color del equipo y un pequeño brillo
    return `<b style="color: ${hex}; text-shadow: 0 0 6px ${hex}80;">${nombre}</b>`;
}

// ==========================================
// SISTEMA DE HISTORIAL Y MAZO
// ==========================================
baseDatos.ref('sala_activa/estado/historial').on('child_added', (snapshot) => {
    const msj = snapshot.val();
    const ul = document.getElementById('lista-historial');
    if (!ul) return;
    const li = document.createElement('li');
    li.style.padding = "8px 0";
    li.style.borderBottom = "1px dashed rgba(255,255,255,0.1)";
    li.innerHTML = msj;
    ul.appendChild(li);
    ul.scrollTop = ul.scrollHeight; 
});

baseDatos.ref('sala_activa/mazo').on('value', (snapshot) => {
    const mazo = snapshot.val() || [];
    const contador = document.getElementById('contador-mazo');
    if (contador) contador.innerText = mazo.length;
});

function registrarAccion(mensaje) {
    baseDatos.ref('sala_activa/estado/historial').push(mensaje);
}

// ==========================================
// REGLA MUERTE SÚBITA / EMPATE TÉCNICO
// ==========================================
baseDatos.ref('sala_activa/estado/turnosPasados').on('value', (snapshot) => {
    const pases = snapshot.val() || 0;
    
    if (jugadoresEnSala.length > 0 && pases >= jugadoresEnSala.length) {
        let maxSequences = 0;
        let equiposEmpatados = [];
        let equipoGanador = null;

        for (const equipo in secuenciasLogradas) {
            const seqs = secuenciasLogradas[equipo];
            if (seqs > maxSequences) {
                maxSequences = seqs;
                equipoGanador = equipo;
                equiposEmpatados = [equipo];
            } else if (seqs === maxSequences && seqs > 0) {
                equiposEmpatados.push(equipo);
            }
        }

        if (jugadoresEnSala[0].id === miJugadorId) {
            if (maxSequences > 0 && equiposEmpatados.length === 1) {
                baseDatos.ref('sala_activa/estado/victoria').set(equipoGanador);
            } else {
                baseDatos.ref('sala_activa/estado/empate').set(true);
            }
        }
    }
});

baseDatos.ref('sala_activa/estado/ordenTurnos').on('value', (snapshot) => {
    listaOrdenTurnos = snapshot.val() || [];
});

baseDatos.ref('sala_activa/estado/turnoActual').on('value', (snapshot) => {
    turnoActualId = snapshot.val();
    miTurno = (turnoActualId === miJugadorId);
    
    const manoElement = document.getElementById('mano-jugador');
    const tituloMano = document.getElementById('titulo-mano');
    
    if (miTurno) {
        manoElement.classList.add('mi-turno');
        manoElement.classList.remove('esperando-turno');
        
        tituloMano.innerText = "Tu Mano (¡ES TU TURNO!)";
        tituloMano.classList.remove('turno-rojo', 'turno-azul', 'turno-verde');
        if(miJugador.color) {
            tituloMano.classList.add(`turno-${miJugador.color}`);
        }
        
        evaluarOpcionesDeTurno();
    } else {
        manoElement.classList.remove('mi-turno');
        manoElement.classList.add('esperando-turno');
        
        let jugadorTurno = jugadoresEnSala.find(j => j.id === turnoActualId);
        let nombreTurno = jugadorTurno ? jugadorTurno.nombre : "el oponente";
        tituloMano.innerText = `Esperando a ${nombreTurno}...`;
        
        tituloMano.classList.remove('turno-rojo', 'turno-azul', 'turno-verde');
        
        document.getElementById('btn-pasar-turno').classList.add('oculta');
    }
});

tableroRef.on('child_added', (snapshot) => {
    const indice = snapshot.key;
    const color = snapshot.val();
    colocarFichaVisual(indice, color);
    verificarSequence(color);
});

tableroRef.on('child_removed', (snapshot) => {
    const indice = snapshot.key;
    quitarFichaVisual(indice);
});

function obtenerMazoBarajado() {
    let mazoNuevo = [];
    const palos = ['S', 'H', 'D', 'C']; 
    const valores = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'Q', 'K'];
    
    palos.forEach(palo => {
        valores.forEach(valor => mazoNuevo.push(valor + palo));
    });

    const jacksEspeciales = ['J1S', 'J1H', 'J1D', 'J1C', 'J2S', 'J2H', 'J2D', 'J2C'];
    mazoNuevo = [...mazoNuevo, ...mazoNuevo, ...jacksEspeciales];
    
    for (let i = mazoNuevo.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [mazoNuevo[i], mazoNuevo[j]] = [mazoNuevo[j], mazoNuevo[i]];
    }
    return mazoNuevo;
}

// ==========================================
// DETECCIÓN MATEMÁTICA
// ==========================================
window.evaluarOpcionesDeTurno = function() {
    const pantallaJuego = document.getElementById('pantalla-juego');
    if (!miTurno || !pantallaJuego.classList.contains('activa')) return;

    let tieneJugada = false;
    let tieneCartaMuerta = false; // NUEVO: Evaluamos si tiene cartas muertas
    const casillas = document.querySelectorAll('.casilla');
    
    if (manoPropia && manoPropia.length > 0) {
        for (let carta of manoPropia) {
            if (carta.startsWith('J')) {
                tieneJugada = true;
                break;
            }
            
            let espaciosLibres = false;
            let posicionesTotales = 0;
            let posicionesOcupadas = 0;

            casillas.forEach(c => {
                if (c.dataset.carta === carta) {
                    posicionesTotales++;
                    if (!c.querySelector('.ficha')) espaciosLibres = true;
                    else posicionesOcupadas++;
                }
            });
            
            if (espaciosLibres) {
                tieneJugada = true;
                break;
            }

            // Si no hay espacios libres, pero la carta existe en el tablero, es muerta
            if (!espaciosLibres && posicionesTotales > 0 && posicionesTotales === posicionesOcupadas) {
                tieneCartaMuerta = true;
            }
        }
    }

    const btnPasar = document.getElementById('btn-pasar-turno');
    
    // NUEVA LÓGICA: Decide qué mensaje dar
    if (!tieneJugada && !tieneCartaMuerta) {
        btnPasar.classList.remove('oculta');
        mostrarToast("No tienes jugadas posibles. Debes pasar tu turno.", "warning", 5000);
    } else if (!tieneJugada && tieneCartaMuerta) {
        btnPasar.classList.add('oculta');
        mostrarToast("Estás bloqueado, pero puedes DESCARTAR una carta muerta para robar.", "info", 5000);
    } else {
        btnPasar.classList.add('oculta');
    }
};

window.ejecutarPasoDeTurno = function() {
    let nombreColor = colorearNombre(miJugador.nombre, miJugador.color);
    registrarAccion(`⏭️ ${nombreColor} tuvo que pasar su turno.`);
    
    baseDatos.ref('sala_activa/estado/turnosPasados').transaction((val) => {
        return (val || 0) + 1;
    }).then(() => {
        pasarTurno();
    });
};

function intentarPonerFicha(indiceTablero, cartaTablero) {
    if (!miTurno) return mostrarToast("¡Paciencia! Aún no es tu turno.", "warning");
    if (cartaSeleccionadaIdx === null) return mostrarToast("¡Primero selecciona una carta de tu mano!", "warning");

    const cartaEnMano = manoPropia[cartaSeleccionadaIdx];
    const casillas = document.querySelectorAll('.casilla');
    const casillaActual = casillas[indiceTablero];
    const tieneFicha = casillaActual.querySelector('.ficha');

    let nombreColor = colorearNombre(miJugador.nombre, miJugador.color);

    if (cartaTablero === "LIBRE") return mostrarToast("Las esquinas son comodines para todos.", "info");

    if (cartaEnMano.startsWith("J2")) {
        if (tieneFicha) {
            if (casillaActual.classList.contains('protegida-rojo') || 
                casillaActual.classList.contains('protegida-azul') || 
                casillaActual.classList.contains('protegida-verde')) {
                mostrarToast("No puedes quitar una ficha de un Sequence ya completado.", "error");
            } else {
                tableroRef.child(indiceTablero).remove(); 
                actualizarManoTrasJugada(`❌ ${nombreColor} quitó una ficha con su Jack.`); 
            }
        } else {
            mostrarToast("Usa el Jack sobre una ficha del oponente.", "warning");
        }
        return;
    }

    if (tieneFicha) return mostrarToast("Esta casilla ya está ocupada.", "warning");

    let jugadaValida = (cartaEnMano === cartaTablero || cartaEnMano.startsWith("J1"));

    if (jugadaValida) {
        tableroRef.child(indiceTablero).set(miJugador.color); 
        
        let cartaTraducida = traducirCartaAIcono(cartaTablero);
        
        let msj = cartaEnMano.startsWith("J1") 
            ? `🃏 ${nombreColor} usó un Comodín en ${cartaTraducida}.` 
            : `🃏 ${nombreColor} colocó ficha en ${cartaTraducida}.`;
        actualizarManoTrasJugada(msj); 
    } else {
        mostrarToast("Esa carta no coincide con esta casilla.", "error");
    }
}

function colocarFichaVisual(indice, color) {
    const casillas = document.querySelectorAll('.casilla');
    if (casillas[indice].querySelector('.ficha')) return; 

    const ficha = document.createElement('div');
    ficha.classList.add('ficha', `ficha-${color}`); 
    ficha.style.transform = 'scale(0)';
    casillas[indice].appendChild(ficha);
    
    requestAnimationFrame(() => {
        ficha.style.transition = 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)';
        ficha.style.transform = 'scale(1)';
    });
}

function quitarFichaVisual(indice) {
    const casillas = document.querySelectorAll('.casilla');
    const ficha = casillas[indice].querySelector('.ficha');
    if (ficha) {
        ficha.style.transition = 'transform 0.2s ease-in, opacity 0.2s ease-in';
        ficha.style.transform = 'scale(0)';
        ficha.style.opacity = '0';
        ficha.addEventListener('transitionend', () => ficha.remove());
    }
}

function actualizarManoTrasJugada(mensajeHistorial) {
    manoPropia.splice(cartaSeleccionadaIdx, 1);
    cartaSeleccionadaIdx = null;
    
    registrarAccion(mensajeHistorial);
    baseDatos.ref('sala_activa/estado/turnosPasados').set(0); 

    let cartaExtraidaSegura = null; // Variable trampa para evitar clones

    baseDatos.ref('sala_activa/mazo').transaction((mazoActual) => {
        if (mazoActual && mazoActual.length > 0) {
            cartaExtraidaSegura = mazoActual[mazoActual.length - 1]; // Tomamos la última
            mazoActual.pop(); // La quitamos del mazo
            return mazoActual;
        }
        return mazoActual || [];
    }).then((resultado) => {
        // Solo inyectamos la carta SI la transacción fue exitosa
        if (resultado.committed && cartaExtraidaSegura) {
            manoPropia.push(cartaExtraidaSegura);
        }
        
        miJugadorRef.child('mano').set(manoPropia).then(() => {
            pasarTurno();
        });
    });
}

function pasarTurno() {
    let indiceActual = listaOrdenTurnos.indexOf(miJugadorId);
    let siguienteIndice = (indiceActual + 1) % listaOrdenTurnos.length;
    let siguienteJugadorId = listaOrdenTurnos[siguienteIndice];
    baseDatos.ref('sala_activa/estado/turnoActual').set(siguienteJugadorId);
}

function verificarSequence(colorJugador) {
    const casillas = document.querySelectorAll('.casilla');
    const esDelJugador = (indice) => {
        const c = casillas[indice];
        return c.querySelector(`.ficha-${colorJugador}`) || mapaCartas[indice] === "LIBRE"; 
    };

    for (let f = 0; f < TAMANO_TABLERO; f++) {
        for (let c = 0; c <= TAMANO_TABLERO - 5; c++) {
            let combo = [];
            for (let i = 0; i < 5; i++) combo.push(f * TAMANO_TABLERO + (c + i));
            if (combo.every(esDelJugador)) marcarSequence(combo, colorJugador);
        }
    }
    for (let c = 0; c < TAMANO_TABLERO; c++) {
        for (let f = 0; f <= TAMANO_TABLERO - 5; f++) {
            let combo = [];
            for (let i = 0; i < 5; i++) combo.push((f + i) * TAMANO_TABLERO + c);
            if (combo.every(esDelJugador)) marcarSequence(combo, colorJugador);
        }
    }
    for (let f = 0; f <= TAMANO_TABLERO - 5; f++) {
        for (let c = 0; c <= TAMANO_TABLERO - 5; c++) {
            let combo = [];
            for (let i = 0; i < 5; i++) combo.push((f + i) * TAMANO_TABLERO + (c + i));
            if (combo.every(esDelJugador)) marcarSequence(combo, colorJugador);
        }
    }
    for (let f = 0; f <= TAMANO_TABLERO - 5; f++) {
        for (let c = 4; c < TAMANO_TABLERO; c++) {
            let combo = [];
            for (let i = 0; i < 5; i++) combo.push((f + i) * TAMANO_TABLERO + (c - i));
            if (combo.every(esDelJugador)) marcarSequence(combo, colorJugador);
        }
    }
}

function marcarSequence(indices, colorJugador) {
    const casillas = document.querySelectorAll('.casilla');
    let fichasNuevasParaSequence = 0;

    indices.forEach(indice => {
        if (!casillas[indice].classList.contains('protegida-rojo') &&
            !casillas[indice].classList.contains('protegida-azul') &&
            !casillas[indice].classList.contains('protegida-verde')) {
            fichasNuevasParaSequence++;
        }
    });

    if (fichasNuevasParaSequence === 5 || fichasNuevasParaSequence === 4) {
        indices.forEach(indice => {
            casillas[indice].classList.add(`protegida-${colorJugador}`);
        });

        secuenciasLogradas[colorJugador]++;
        
        let nombreEquipoColor = colorearNombre(`Equipo ${colorJugador.toUpperCase()}`, colorJugador);
        registrarAccion(`🔥 ¡El ${nombreEquipoColor} logró un Sequence!`);

        if (secuenciasLogradas[colorJugador] >= configuracionJuego.sequencesParaGanar) {
            baseDatos.ref('sala_activa/estado').onDisconnect().cancel();
            baseDatos.ref('sala_activa/estado/victoria').set(colorJugador);
        }
    }
}

function reiniciarEstadoJuegoLocal() {
    secuenciasLogradas = { rojo: 0, azul: 0, verde: 0 };
    document.getElementById('lista-historial').innerHTML = ""; 
    if (typeof generarTablero === 'function') generarTablero();
}

function descartarYRobarSinPasarTurno(cartaDescartada) {
    manoPropia.splice(cartaSeleccionadaIdx, 1);
    cartaSeleccionadaIdx = null;
    
    let nombreColor = colorearNombre(miJugador.nombre, miJugador.color);
    let cartaTraducida = traducirCartaAIcono(cartaDescartada);
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

window.intentarDescartarCartaMuerta = function() {
    if (!miTurno) return mostrarToast("¡Paciencia! Aún no es tu turno.", "warning");
    if (cartaSeleccionadaIdx === null) return mostrarToast("Selecciona la carta que quieres descartar.", "warning");

    const cartaEnMano = manoPropia[cartaSeleccionadaIdx];
    if (cartaEnMano.startsWith("J")) return mostrarToast("Los Jacks son comodines, nunca pueden ser cartas muertas.", "info");

    const casillas = document.querySelectorAll('.casilla');
    let indicesCarta = [];
    
    casillas.forEach((casilla, index) => {
        if (casilla.dataset.carta === cartaEnMano) indicesCarta.push(index);
    });

    let ocupadas = 0;
    indicesCarta.forEach(indice => {
        if (casillas[indice].querySelector('.ficha')) ocupadas++;
    });

    if (ocupadas === indicesCarta.length && indicesCarta.length > 0) {
        mostrarToast("¡Efectivamente! Es una carta muerta.", "success");
        descartarYRobarSinPasarTurno(cartaEnMano); 
    } else {
        mostrarToast("Esta carta NO es una carta muerta. Aún hay espacios libres en el tablero para ella.", "error");
    }
};