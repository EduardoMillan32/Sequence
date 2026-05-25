// Js/principal.js
// Punto de entrada único — importa todos los módulos en el orden correcto.
// El navegador carga este archivo con <script type="module">.

// 1. Núcleo: configuración y estado (sin dependencias internas)
import './nucleo/config.js';
import './nucleo/estado.js';

// 2. Tablero: mapa de cartas y generación del DOM
import { generarTablero } from './nucleo/tablero.js';

// 3. Jugador: mano y modales (depende de config y estado)
import './nucleo/jugador.js';

// 4. Juego: lógica completa (depende de config, estado, tablero, jugador)
import './nucleo/juego.js';

// 5. Sesión: login con salas, presencia y limpieza (depende de config y estado)
import './nucleo/sesion.js';

// 6. Lobby: sala de espera e inicio de partida (depende de todo lo anterior)
import './pantallas/lobby.js';

// 7. PWA: Wake Lock y detección de cierre de app
import { inicializarPWA } from './nucleo/pwa.js';

// Generar el tablero al cargar la página
generarTablero();

// Inicializar PWA (log de modo standalone, etc.)
inicializarPWA();
