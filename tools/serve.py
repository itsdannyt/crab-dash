# Local test server with caching disabled, so edited scripts are always reloaded.
import http.server, functools
class H(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()
http.server.ThreadingHTTPServer(('127.0.0.1', 8766), functools.partial(H, directory='.')).serve_forever()
