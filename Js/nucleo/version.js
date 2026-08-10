// Js/nucleo/version.js
// Módulo para manejar el Easter Egg de la versión de la aplicación

import { mostrarToast } from './config.js';

const VERSION_APP = "1.0.0";
let contadorToques = 0;
let temporizadorToques = null;

export function inicializarEasterEggVersion() {
    const tituloPrincipal = document.getElementById('titulo-principal');
    
    if (!tituloPrincipal) return;

    // Prevenir el comportamiento por defecto del doble toque (zoom) en móviles
    tituloPrincipal.addEventListener('touchstart', (e) => {
        e.preventDefault(); // Evita el zoom y la selección de texto
        registrarToque();
    }, { passive: false });

    // Para clics con el ratón en PC
    tituloPrincipal.addEventListener('click', (e) => {
        registrarToque();
    });
}

function registrarToque() {
    contadorToques++;

    // Reiniciar el contador si pasa más de 1 segundo entre toques
    if (temporizadorToques) {
        clearTimeout(temporizadorToques);
    }

    temporizadorToques = setTimeout(() => {
        contadorToques = 0;
    }, 1000);

    // Si llega a 5 toques, mostrar la versión
    if (contadorToques >= 5) {
        mostrarToast(`Versión instalada: ${VERSION_APP}`, "info", 4000);
        contadorToques = 0; // Reiniciar después de mostrar
    }
}
