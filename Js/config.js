// Js/config.js

const firebaseConfig = {
  apiKey: "AIzaSyBO5oECBqVUBQzBX4Yb61DAHeIOw6hLm-Y",
  authDomain: "secuence-7d7af.firebaseapp.com",
  databaseURL: "https://secuence-7d7af-default-rtdb.firebaseio.com/",
  projectId: "secuence-7d7af",
  storageBucket: "secuence-7d7af.firebasestorage.app",
  messagingSenderId: "576327423344",
  appId: "1:576327423344:web:30f213dcfc5b2b133d2bb5"
};

firebase.initializeApp(firebaseConfig);
const baseDatos = firebase.database();

// Objeto global para mantener el estado de las reglas de la partida
const configuracionJuego = {
    numeroJugadores: 0,
    numeroEquipos: 0,
    cartasPorJugador: 0,
    sequencesParaGanar: 0
};

function inicializarReglas(jugadoresTotales, equiposTotales) {
    configuracionJuego.numeroJugadores = jugadoresTotales;
    configuracionJuego.numeroEquipos = equiposTotales;

    // Regla de victoria: 3 equipos = 1 sequence, resto = 2
    configuracionJuego.sequencesParaGanar = (equiposTotales === 3) ? 1 : 2;

    // Regla de cartas a repartir según número de jugadores
    if (jugadoresTotales === 2)                                     configuracionJuego.cartasPorJugador = 7;
    else if (jugadoresTotales >= 3 && jugadoresTotales <= 4)        configuracionJuego.cartasPorJugador = 6;
    else if (jugadoresTotales === 6)                                configuracionJuego.cartasPorJugador = 5;
    else if (jugadoresTotales >= 8 && jugadoresTotales <= 9)        configuracionJuego.cartasPorJugador = 4;
    else if (jugadoresTotales >= 10 && jugadoresTotales <= 12)      configuracionJuego.cartasPorJugador = 3;

    console.log("Reglas configuradas:", configuracionJuego);
}

// ============================================
// SISTEMA DE NOTIFICACIONES TOAST
// ============================================
window.mostrarToast = function(mensaje, tipo = "info", duracion = 3000) {
    const contenedor = document.getElementById('contenedor-toast');
    if (!contenedor) return alert(mensaje); // Respaldo de seguridad

    const toast = document.createElement('div');
    toast.classList.add('toast', `toast-${tipo}`);
    toast.innerText = mensaje;
    contenedor.appendChild(toast);

    // Forzar reflow para que la animación de entrada funcione
    toast.offsetHeight;
    toast.classList.add('toast-visible');

    setTimeout(() => {
        toast.classList.remove('toast-visible');
        toast.addEventListener('transitionend', () => toast.remove(), { once: true });
    }, duracion);
};
