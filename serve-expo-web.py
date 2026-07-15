import http.server
import socketserver
import os
import urllib.parse

PORT = 8082
DIRECTORY = "expo/dist"

class SPAHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def do_GET(self):
        path = urllib.parse.urlparse(self.path).path
        full_path = os.path.join(DIRECTORY, path.lstrip('/'))
        if path != '/' and os.path.exists(full_path) and os.path.isfile(full_path):
            return super().do_GET()
        self.path = '/index.html'
        return super().do_GET()

with socketserver.TCPServer(("", PORT), SPAHandler) as httpd:
    print(f"Serving {DIRECTORY} at http://localhost:{PORT}")
    httpd.serve_forever()
