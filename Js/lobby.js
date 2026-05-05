// Js/lobby.js

let miJugadorId = null;
let miJugadorRef = null;
let miJugador = { nombre: "", color: null, listo: false };
let jugadoresEnSala = [];
let juegoIniciadoVisualmente = false;
let partidaIniciada = false;
// Bandera: solo limpiamos la sala la primera vez que somos el único jugador
// (al entrar). Evita que el listener borre el estado cuando llega un segundo
// jugador y el snapshot intermedio aún no lo incluye.
let yaLimpioSala = false;

const salaRef        = baseDatos.ref('sala_activa/jugadores');
const estadoJuegoRef = baseDatos.ref('sala_activa/estado');
const nombresEquiposRef = baseDatos.ref('sala_activa/nombresEquipos');

const pantallaLogin  = document.getElementById('pantalla-login');
const pantallaLobby  = document.getElementById('pantalla-lobby');
const pantallaJuego  = document.getElementById('pantalla-juego');
const btnListo       = document.getElementById('btn-listo');
const mensajeValidacion = document.getElementById('mensaje-validacion');

let nombresEquipos = { rojo: "Rojo", azul: "Azul", verde: "Verde" };

// ============================================
// LISTENER: Nombres de equipos
// ============================================
nombresEquiposRef.on('value', (snapshot) => {
    nombresEquipos = snapshot.exists()
        ? snapshot.val()
        : { rojo: "Rojo", azul: "Azul", verde: "Verde" };

    const spanEditable = document.getElementById('nombre-editable');
    if (spanEditable && miJugador.color && nombresEquipos[miJugador.color]) {
        // Solo actualiza si el usuario no está editando activamente
        if (document.activeElement !== spanEditable) {
            spanEditable.innerText = nombresEquipos[miJugador.color];
        }
    }
});

// ============================================
// ENTRADA AL LOBBY
// ============================================
function entrarLobby() {
    const nombre = document.getElementById('input-nombre').value.trim();
    if (nombre === "") return mostrarToast("Por favor ingresa un nombre válido.", "warning");

    miJugador.nombre = nombre;

    // ── ANTI-DUPLICADO ──────────────────────────────────────────────
    // Si este dispositivo ya tenía una sesión activa (por recarga o
    // cierre inesperado), eliminamos esa entrada antes de crear una nueva.
    const idAnterior = localStorage.getItem('sequence_jugador_id');
    const promesaLimpieza = idAnterior
        ? salaRef.child(idAnterior).remove()   // borra la entrada huérfana
        : Promise.resolve();
    // ────────────────────────────────────────────────────────────────

    const entrarConDatos = () => {
        // salaRef.push(miJugador) crea el nodo con los datos en UNA SOLA operación.
        // Antes se usaba push() vacío + set() separado, lo que causaba una race condition:
        // el listener 'value' se disparaba con el nodo vacío (sin nombre) antes de que
        // set() lo llenara, haciendo que el jugador anterior desapareciera de la lista.
        miJugadorRef = salaRef.push(miJugador);
        miJugadorId  = miJugadorRef.key;

        // Persistir el ID en este dispositivo para poder limpiar en el futuro
        localStorage.setItem('sequence_jugador_id', miJugadorId);

        // Configurar limpieza automática al desconectarse
        miJugadorRef.onDisconnect().remove();
        estadoJuegoRef.onDisconnect().update({
            abandonado: true,
            nombreAbandono: miJugador.nombre
        });

        pantallaLogin.classList.remove('activa');
        pantallaLogin.classList.add('oculta');
        pantallaLobby.classList.remove('oculta');
        pantallaLobby.classList.add('activa');
    };

    promesaLimpieza.then(entrarConDatos).catch(entrarConDatos);
}

// ============================================
// SELECCIÓN DE COLOR / EQUIPO
// ============================================
function seleccionarColor(color) {
    miJugador.color = color;
    btnListo.disabled = false;

    const nombreDefault = color.charAt(0).toUpperCase() + color.slice(1);
    const nombreMostrar = nombresEquipos[color] || nombreDefault;

    const titulo = document.getElementById('titulo-equipo');
    titulo.innerHTML = `Equipo: <span id="nombre-editable" contenteditable="true" spellcheck="false" style="outline: none;">${nombreMostrar}</span>`;

    // Adjuntar listener al nuevo span creado
    document.getElementById('nombre-editable').addEventListener('input', function () {
        cambiarNombreEquipo(this.innerText);
    });

    document.querySelectorAll('.btn-color').forEach(btn => btn.classList.remove('color-activo'));
    document.querySelector(`.btn-color.${color}`).classList.add('color-activo');

    if (miJugadorRef) miJugadorRef.set(miJugador);
    actualizarVistaLobby();
}

// ============================================
// BOTÓN LISTO
// ============================================
function alternarListo() {
    miJugador.listo = !miJugador.listo;
    btnListo.innerText = miJugador.listo ? "Esperando a los demás..." : "Estoy Listo";
    btnListo.style.backgroundColor = miJugador.listo ? "#7f8c8d" : "#2ecc71";
    if (miJugadorRef) miJugadorRef.set(miJugador);
}

// ============================================
// LISTENER: Jugadores en sala
// ============================================
salaRef.on('value', (snapshot) => {
    jugadoresEnSala = [];
    const datos = snapshot.val();

    if (datos) {
        Object.keys(datos).forEach(key => {
            const jugador = datos[key];
            if (jugador && jugador.nombre && jugador.nombre !== "undefined") {
                jugador.id = key;
                jugadoresEnSala.push(jugador);
            }
        });
    } else {
        // No hay jugadores: limpiar estado de partida
        estadoJuegoRef.set(null);
        partidaIniciada = false;
    }

    // Si soy el único jugador Y aún no limpié la sala, limpio para empezar fresco.
    // La bandera yaLimpioSala evita que esta limpieza se repita en disparos posteriores
    // del listener (ej: cuando llega un segundo jugador y el snapshot intermedio
    // aún no lo incluye, lo que haría que jugadoresEnSala.length === 1 sea true
    // momentáneamente y borre el estado de la sala).
    if (!yaLimpioSala && jugadoresEnSala.length === 1 && jugadoresEnSala[0].id === miJugadorId) {
        yaLimpioSala = true;
        nombresEquiposRef.remove();
        estadoJuegoRef.set(null);
        baseDatos.ref('sala_activa/tablero').set(null);
        baseDatos.ref('sala_activa/mazo').remove();
    }

    actualizarVistaLobby();
    verificarReglasParaIniciar();
});

// ============================================
// VISTA DEL LOBBY
// ============================================
function actualizarVistaLobby() {
    const lista = document.getElementById('lista-jugadores');
    lista.innerHTML = "";

    jugadoresEnSala.forEach(jugador => {
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

    const totalJugadores = jugadoresEnSala.length;
    if (totalJugadores === 0) return;

    // Todos deben estar listos
    const todosListos = jugadoresEnSala.every(j => j.listo);
    if (!todosListos) {
        mensajeValidacion.innerText = "Faltan jugadores por confirmar.";
        return;
    }

    // Contar jugadores por equipo
    const conteo = { rojo: 0, azul: 0, verde: 0 };
    jugadoresEnSala.forEach(j => { if (j.color) conteo[j.color]++; });

    const cantidades = Object.values(conteo).filter(c => c > 0);
    const numEquipos = cantidades.length;

    let juegoValido = false;

    if (numEquipos === 2) {
        if (totalJugadores % 2 === 0 && cantidades[0] === cantidades[1]) {
            juegoValido = true;
        } else {
            mensajeValidacion.innerText = "Para 2 equipos, deben ser pares y estar equilibrados.";
        }
    } else if (numEquipos === 3) {
        if (totalJugadores % 3 === 0 && cantidades[0] === cantidades[1] && cantidades[1] === cantidades[2]) {
            juegoValido = true;
        } else {
            mensajeValidacion.innerText = "Para 3 equipos, deben tener la misma cantidad de jugadores.";
        }
    } else {
        mensajeValidacion.innerText = "Debe haber al menos 2 equipos para jugar.";
    }

    if (!juegoValido) return;

    mensajeValidacion.innerText = "¡Todo listo! Iniciando partida...";

    // Solo el primer jugador (anfitrión) inicializa la partida en Firebase
    if (jugadoresEnSala[0].id === miJugadorId) {
        partidaIniciada = true;
        baseDatos.ref('sala_activa/tablero').set(null);

        // Construir orden de turnos intercalando equipos
        const verdes = jugadoresEnSala.filter(j => j.color === 'verde');
        const azules  = jugadoresEnSala.filter(j => j.color === 'azul');
        const rojos   = jugadoresEnSala.filter(j => j.color === 'rojo');

        const ordenTurnos = [];
        const maxPorEquipo = Math.max(verdes.length, azules.length, rojos.length);
        for (let i = 0; i < maxPorEquipo; i++) {
            if (verdes[i]) ordenTurnos.push(verdes[i].id);
            if (azules[i])  ordenTurnos.push(azules[i].id);
            if (rojos[i])   ordenTurnos.push(rojos[i].id);
        }

        const indiceAleatorio = Math.floor(Math.random() * ordenTurnos.length);
        const primerTurnoId   = ordenTurnos[indiceAleatorio];

        inicializarReglas(totalJugadores, numEquipos);
        const mazoMaestro = obtenerMazoBarajado();

        // Repartir cartas a cada jugador
        jugadoresEnSala.forEach(jugador => {
            const mano = [];
            for (let i = 0; i < configuracionJuego.cartasPorJugador; i++) {
                mano.push(mazoMaestro.pop());
            }
            baseDatos.ref(`sala_activa/jugadores/${jugador.id}`).update({ mano });
        });

        baseDatos.ref('sala_activa/mazo').set(mazoMaestro);

        estadoJuegoRef.set({
            iniciado: true,
            jugadoresTotales: totalJugadores,
            equiposTotales: numEquipos,
            turnoActual: primerTurnoId,
            ordenTurnos: ordenTurnos,
            marcaTiempo: Date.now(),
            turnosPasados: 0,
            empate: false,
            historial: { 0: "🎮 <b>¡La partida ha comenzado!</b>" }
        });
    }
}

// ============================================
// LISTENER: Estado del juego
// ============================================
estadoJuegoRef.on('value', (snapshot) => {
    const estado = snapshot.val();
    if (miJugador.nombre === "") return;

    const bloqueCartas   = document.getElementById('interfaz-cartas');
    const bloqueVictoria = document.getElementById('interfaz-victoria-mano');

    // --- Jugador abandonó ---
    if (estado && estado.abandonado) {
        bloqueCartas.classList.add('oculta');
        bloqueVictoria.classList.remove('oculta');
        document.getElementById('texto-victoria-mano').innerText =
            `PARTIDA TERMINADA: ${estado.nombreAbandono} abandonó la sala. 🚪`;
        document.getElementById('texto-victoria-mano').style.color = "#f1c40f";
        const btnRevancha = document.getElementById('btn-revancha');
        btnRevancha.innerText = "Volver al Lobby principal";
        btnRevancha.disabled = false;
        return;
    }

    // --- Empate técnico ---
    if (estado && estado.empate) {
        bloqueCartas.classList.add('oculta');
        bloqueVictoria.classList.remove('oculta');
        const textoWin = document.getElementById('texto-victoria-mano');
        textoWin.innerText = "¡EMPATE TÉCNICO! 🤝";
        textoWin.style.color = "#bdc3c7";
        const btnRevancha = document.getElementById('btn-revancha');
        const esAnfitrion = jugadoresEnSala.length > 0 && jugadoresEnSala[0].id === miJugadorId;
        btnRevancha.innerText  = esAnfitrion ? "Volver al Lobby 🔄" : "Esperando al anfitrión...";
        btnRevancha.disabled   = !esAnfitrion;
        return;
    }

    // --- Sin estado o partida no iniciada: volver al lobby ---
    if (!estado || !estado.iniciado) {
        if (juegoIniciadoVisualmente) {
            juegoIniciadoVisualmente = false;
            partidaIniciada = false;

            bloqueCartas.classList.remove('oculta');
            bloqueVictoria.classList.add('oculta');

            pantallaJuego.classList.remove('activa');
            pantallaJuego.classList.add('oculta');
            pantallaLobby.classList.remove('oculta');
            pantallaLobby.classList.add('activa');

            // Resetear estado del botón listo
            miJugador.listo = false;
            btnListo.innerText = "Estoy Listo";
            btnListo.style.backgroundColor = "";
            if (miJugadorRef) miJugadorRef.update({ listo: false });
        }
        return;
    }

    // --- Victoria ---
    if (estado.victoria) {
        bloqueCartas.classList.add('oculta');
        bloqueVictoria.classList.remove('oculta');
        const nombreGanador = nombresEquipos[estado.victoria] || estado.victoria;
        const textoWin = document.getElementById('texto-victoria-mano');
        textoWin.innerText = `¡GANA EL EQUIPO ${nombreGanador.toUpperCase()}! 🎉`;
        textoWin.style.color = "#f1c40f";
        const btnRevancha = document.getElementById('btn-revancha');
        const esAnfitrion = jugadoresEnSala.length > 0 && jugadoresEnSala[0].id === miJugadorId;
        btnRevancha.innerText = esAnfitrion ? "Volver al Lobby 🔄" : "Esperando al anfitrión...";
        btnRevancha.disabled  = !esAnfitrion;
        return;
    }

    // --- Partida iniciada: transición a pantalla de juego ---
    if (estado.iniciado === true && !juegoIniciadoVisualmente) {
        partidaIniciada = true;
        juegoIniciadoVisualmente = true;
        reiniciarEstadoJuegoLocal();
        inicializarReglas(estado.jugadoresTotales, estado.equiposTotales);
        inicializarManoFirebase();

        setTimeout(() => {
            pantallaLobby.classList.remove('activa');
            pantallaLobby.classList.add('oculta');
            pantallaJuego.classList.remove('oculta');
            pantallaJuego.classList.add('activa');
        }, 1000);
    }
});

// ============================================
// VOLVER AL LOBBY (solo el anfitrión)
// ============================================
window.volverAlLobby = function () {
    if (jugadoresEnSala.length === 0 || jugadoresEnSala[0].id !== miJugadorId) return;

    // Resetear la bandera para que la próxima vez que quede solo en sala
    // pueda volver a limpiar el estado correctamente
    yaLimpioSala = false;

    estadoJuegoRef.set(null);
    baseDatos.ref('sala_activa/tablero').set(null);
    nombresEquiposRef.remove();
    baseDatos.ref('sala_activa/mazo').set(null);
    // Limpiar el último Jack para que no se dispare en la siguiente partida
    baseDatos.ref('sala_activa/estado/ultimoJack').remove();
    jugadoresEnSala.forEach(j => {
        baseDatos.ref(`sala_activa/jugadores/${j.id}/mano`).remove();
    });
};

// ============================================
// LIMPIEZA AL CERRAR / RECARGAR LA PÁGINA
// Garantiza que el jugador se elimine de Firebase
// incluso si onDisconnect no alcanza a ejecutarse.
// ============================================
window.addEventListener('beforeunload', () => {
    // Eliminación síncrona (best-effort) al cerrar la pestaña
    if (miJugadorRef) {
        miJugadorRef.remove();
    }
    // Limpiar el ID guardado para que la próxima sesión empiece limpia
    localStorage.removeItem('sequence_jugador_id');
});

// ============================================
// CAMBIAR NOMBRE DE EQUIPO
// ============================================
window.cambiarNombreEquipo = function (nuevoNombre) {
    if (!miJugador.color || nuevoNombre.trim() === "") return;
    nombresEquiposRef.child(miJugador.color).set(nuevoNombre.trim());
};
