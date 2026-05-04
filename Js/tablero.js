// Js/tablero.js

const tableroElemento = document.getElementById('tablero');

// Mapeo real del tablero de Sequence (10x10)
const mapaCartas = [
    "LIBRE", "2S",  "3S",  "4S",  "5S",  "6S",  "7S",  "8S",  "9S",  "LIBRE",
    "6C",    "5C",  "4C",  "3C",  "2C",  "AH",  "KH",  "QH",  "10H", "10S",
    "7C",    "AS",  "2D",  "3D",  "4D",  "5D",  "6D",  "7D",  "9H",  "QS",
    "8C",    "KS",  "6C",  "5C",  "4C",  "3C",  "2C",  "8D",  "8H",  "KS",
    "9C",    "QS",  "7C",  "6H",  "5H",  "4H",  "AH",  "9D",  "7H",  "AS",
    "10C",   "10S", "8C",  "7H",  "2H",  "3H",  "KH",  "10D", "6H",  "2D",
    "QC",    "9S",  "9C",  "8H",  "9H",  "10H", "QH",  "QD",  "5H",  "3D",
    "KC",    "8S",  "10C", "QC",  "KC",  "AC",  "AD",  "KD",  "4H",  "4D",
    "AC",    "7S",  "6S",  "5S",  "4S",  "3S",  "2S",  "2H",  "3H",  "5D",
    "LIBRE", "AD",  "KD",  "QD",  "10D", "9D",  "8D",  "7D",  "6D",  "LIBRE"
];

/**
 * Convierte un código de carta interno (ej: "10S", "AH", "KD")
 * al código que usa la API de deckofcardsapi.com (ej: "0S", "AH", "KD").
 * La API usa "0" en lugar de "10" para los dieces.
 */
function cartaACodigoAPI(carta) {
    if (carta.startsWith("10")) {
        // "10S" → "0S", "10H" → "0H", etc.
        return "0" + carta.slice(2);
    }
    return carta;
}

function generarTablero() {
    tableroElemento.innerHTML = "";

    mapaCartas.forEach((carta, indice) => {
        const casilla = document.createElement('div');
        casilla.classList.add('casilla');
        casilla.dataset.carta  = carta;
        casilla.dataset.indice = indice;

        casilla.onclick = () => intentarPonerFicha(indice, carta);

        if (carta === "LIBRE") {
            casilla.classList.add('esquina');
            casilla.innerHTML = "⭐";
        } else {
            const img = document.createElement('img');
            img.src       = `https://deckofcardsapi.com/static/img/${cartaACodigoAPI(carta)}.png`;
            img.alt       = carta;
            img.loading   = 'lazy';
            img.draggable = false;
            casilla.appendChild(img);
        }

        tableroElemento.appendChild(casilla);
    });
}

generarTablero();
