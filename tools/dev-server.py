#!/usr/bin/env python3
"""Servidor estático de desarrollo con Cache-Control: no-store.

El navegador de vista previa cachea los módulos ES con fuerza; sin esto se sirven
versiones viejas y se depura código que no se está ejecutando.
Uso: python3 tools/dev-server.py 8741
"""
import http.server
import sys
from functools import partial
from pathlib import Path


class NoStoreHandler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        '.js': 'text/javascript',
        '.mjs': 'text/javascript',
        '.glb': 'model/gltf-binary',
        '.hdr': 'application/octet-stream',
    }

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8741
    root = Path(__file__).resolve().parent.parent
    handler = partial(NoStoreHandler, directory=str(root))
    with http.server.ThreadingHTTPServer(('127.0.0.1', port), handler) as httpd:
        print(f'BChess en http://127.0.0.1:{port}/', flush=True)
        httpd.serve_forever()


if __name__ == '__main__':
    main()
