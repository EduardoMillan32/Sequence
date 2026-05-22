// Js/nucleo/sonidos.js
// Sistema de sonidos basado en archivos de audio.
// Si el archivo no existe o el navegador no puede reproducirlo, simplemente no suena.
//
// ============================================
// CÓMO AGREGAR TUS SONIDOS
// ============================================
// 1. Crea una carpeta llamada  /sounds/  en la raíz del proyecto (junto a index.html)
// 2. Coloca tus archivos de audio ahí. Los nombres deben ser exactamente:
//
//      sounds/ficha.mp3       → se reproduce al colocar una ficha normal
//      sounds/jack-add.mp3    → se reproduce al usar un Jack de 2 ojos (comodín)
//      sounds/jack-remove.mp3 → se reproduce al usar un Jack de 1 ojo (anticomodín)
//      sounds/sequence.mp3    → se reproduce al completar un Sequence
//
// 3. Formatos recomendados: .mp3 (mejor compatibilidad) o .ogg / .wav
// 4. Si un archivo no existe, esa acción simplemente no tendrá sonido. No hay errores.
// ============================================

function reproducir(archivo) {
    try {
        const audio = new Audio(`sounds/${archivo}`);
        audio.volume = 0.6;
        audio.play().catch(() => {
            // El navegador bloqueó la reproducción o el archivo no existe — silencio.
        });
    } catch (_) {
        // Silencio en caso de cualquier error inesperado.
    }
}

export function sonidoFicha()      { reproducir('ficha.mp3');       }
export function sonidoJackAdd()    { reproducir('jack-add.mp3');    }
export function sonidoJackRemove() { reproducir('jack-remove.mp3'); }
export function sonidoSequence()   { reproducir('sequence.mp3');    }
