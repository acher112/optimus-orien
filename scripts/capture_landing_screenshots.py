import os
import sys
import time
import subprocess
import threading
from http.server import HTTPServer, SimpleHTTPRequestHandler

PORT = 5199
CHROME_PATH = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
DIST_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "frontend", "dist"))
OUTPUT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "design", "screenshots", "after", "landing"))

os.makedirs(OUTPUT_DIR, exist_ok=True)

class QuietHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIST_DIR, **kwargs)
    def log_message(self, format, *args):
        pass

def run_server():
    server = HTTPServer(('127.0.0.1', PORT), QuietHandler)
    server.serve_forever()

def capture_screenshot(width, height, output_file, url):
    cmd = [
        CHROME_PATH,
        "--headless=new",
        "--disable-gpu",
        "--hide-scrollbars",
        "--virtual-time-budget=3000",
        f"--window-size={width},{height}",
        f"--screenshot={output_file}",
        url
    ]
    subprocess.run(cmd, check=True)
    print(f"Captured: {output_file} ({width}x{height})")

def main():
    if not os.path.exists(CHROME_PATH):
        print("Chrome not found at", CHROME_PATH)
        return

    # Start local HTTP server in thread
    t = threading.Thread(target=run_server, daemon=True)
    t.start()
    time.sleep(1)

    viewports = [
        (1280, 900, "landing-1280-en.png", f"http://127.0.0.1:{PORT}/"),
        (768, 1024, "landing-768-en.png", f"http://127.0.0.1:{PORT}/"),
        (375, 812, "landing-375-en.png", f"http://127.0.0.1:{PORT}/"),
    ]

    for w, h, fname, url in viewports:
        out_path = os.path.join(OUTPUT_DIR, fname)
        capture_screenshot(w, h, out_path, url)

    # For Urdu screenshots, write a temporary index-ur.html that sets localStorage or dir=rtl
    ur_html_path = os.path.join(DIST_DIR, "index-ur.html")
    with open(os.path.join(DIST_DIR, "index.html"), "r", encoding="utf-8") as f:
        html = f.read()
    ur_script = "<script>localStorage.setItem('optimus_landing_locale', 'ur');</script></head>"
    html_ur = html.replace("</head>", ur_script)
    with open(ur_html_path, "w", encoding="utf-8") as f:
        f.write(html_ur)

    ur_viewports = [
        (1280, 900, "landing-1280-ur.png", f"http://127.0.0.1:{PORT}/index-ur.html"),
        (768, 1024, "landing-768-ur.png", f"http://127.0.0.1:{PORT}/index-ur.html"),
        (375, 812, "landing-375-ur.png", f"http://127.0.0.1:{PORT}/index-ur.html"),
    ]

    for w, h, fname, url in ur_viewports:
        out_path = os.path.join(OUTPUT_DIR, fname)
        capture_screenshot(w, h, out_path, url)

    if os.path.exists(ur_html_path):
        os.remove(ur_html_path)

    print("All screenshots generated successfully in", OUTPUT_DIR)

if __name__ == "__main__":
    main()
