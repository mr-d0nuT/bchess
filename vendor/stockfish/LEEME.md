# Stockfish 19 (stockfish.js 19.0.1, «lite», un solo hilo)

El motor de la CPU de BChess: [Stockfish](https://stockfishchess.org), por los desarrolladores de Stockfish
(ver `AUTHORS` dentro del código fuente), compilado a WebAssembly por
[stockfish.js](https://github.com/nmrugg/stockfish.js) (Nathan Rugg).

- `stockfish-19-lite-single.js` y `stockfish-19-lite-single.wasm`: el motor, sin tocar, de la versión
  [v19.0.1](https://github.com/nmrugg/stockfish.js/releases/tag/v19.0.1) (10/10/2026). Huellas SHA-256, las mismas
  que publica GitHub:
  - `.js`: `ccb130d7ff29408531c47d859a49f91d59d4f482d05a53eb1a3231a4f624c91a`
  - `.wasm`: `ee4f115bdb2d32cadf96cada104a05b5ec257d7ad6f57582190b49bc71f096de`
- `stockfish.js-19.0.1.tar.gz`: su código fuente completo, el de esa misma versión (la licencia obliga a darlo y así
  no depende de que su repositorio siga existiendo). La red neuronal «lite» que lleva dentro es
  `nn-61e7af4bb97d`, de las [redes de Stockfish](https://tests.stockfishchess.org/nns?network_name=nn-61e7af4bb97d).
- `Copying.txt`: su licencia, la GPL v3.
- `package.json`: solo dice que el motor es CommonJS, para poder arrancarlo también con Node (las pruebas). Al
  navegador le da igual: lo abre como un hilo aparte (`new Worker`).

BChess no lo modifica ni lo enlaza con su código: le habla como a un programa aparte, por mensajes de texto (el
protocolo UCI), desde `src/chess/stockfish.js`.
