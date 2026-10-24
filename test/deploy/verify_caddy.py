"""Real Caddy redaction/rotation probe on an isolated loopback listener."""

import gzip
import json
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request


def verify(template, binary="caddy"):
	with tempfile.TemporaryDirectory(prefix="libiamo-caddy-probe-") as d:
		root = Path(d)
		with socket.socket() as sock:
			sock.bind(("127.0.0.1", 0))
			port = sock.getsockname()[1]
		log = root / "access.log"
		snippet = Path(template).read_text().replace("__LOGGER__", "probe").replace("__LOG_FILE__", str(log))
		snippet = snippet.replace("20MiB", "1MiB").replace("roll_keep 10", "roll_keep 2")
		config = root / "Caddyfile"
		runtime = Path(template).with_name("runtime-log.caddy").read_text()
		config.write_text("{\n admin off\n auto_https off\n" + runtime + "\n}\nhttp://127.0.0.1:" + str(port) + " {\n" + snippet
			+ '\nhandle /fail* {\n reverse_proxy 127.0.0.1:1\n}\nhandle {\n respond "ok"\n}\n}\n')
		with (root / "runtime.log").open("wb") as output:
			process = subprocess.Popen([binary, "run", "--config", str(config), "--adapter", "caddyfile"], stdout=output, stderr=output)
			try:
				opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
				base = "http://127.0.0.1:" + str(port)
				def request(path, expected=200):
					req = urllib.request.Request(base + path, headers={"Authorization": "Bearer synthetic-authorization",
						"Cookie": "session=synthetic-cookie", "X-Sensitive": "synthetic-header",
						"CF-Connecting-IP": "203.0.113.77", "User-Agent": "probe-" + "a" * 500, "CF-Ray": "synthetic-ray"})
					try:
						response = opener.open(req, timeout=3)
					except urllib.error.HTTPError as error:
						response = error
					with response:
						assert response.getcode() == expected
						response.read()
				for _ in range(50):
					try:
						request("/health")
						break
					except urllib.error.URLError:
						if process.poll() is not None:
							raise RuntimeError("Isolated synthetic Caddy failed to start: " + (root / "runtime.log").read_text()[-2000:])
						time.sleep(.1)
				else:
					raise RuntimeError("Isolated Caddy did not become ready")
				request("/fail" + "p" * 1100 + "/%61pi/auth/reset-password/synthetic%0Apath-token?token=synthetic-query-secret", expected=502)
				time.sleep(.2)
				rows = [json.loads(line) for line in log.read_text().splitlines()]
				token_row = rows[-1]
				serialized = json.dumps(token_row)
				for secret in ("path-token", "synthetic-query-secret", "synthetic-authorization", "synthetic-cookie", "synthetic-header"):
					assert secret not in serialized, "Sensitive request data leaked"
					assert secret not in (root / "runtime.log").read_text(), "Runtime error log leaked sensitive request data"
				assert token_row["path"] == "/api/auth/reset-password/", token_row["path"]
				assert len(token_row["user_agent"]) <= 256
				assert token_row["cf_ray"] == "synthetic-ray"
				assert token_row["request"]["client_ip"] == "127.0.0.1", "Untrusted IP header accepted"
				assert "headers" not in token_row["request"] and "uri" not in token_row["request"]
				assert "resp_headers" not in token_row
				for i in range(1800):
					request("/rotation/" + str(i) + "/" + "x" * 1800)
				time.sleep(2)
				files = list(root.glob("access*.log*"))
				assert 2 <= len(files) <= 3, "Rotation count bound failed"
				assert log.stat().st_size <= 1024**2
				assert list(root.glob("access*.gz")), "Archives were not compressed"
				for p in files:
					if p.suffix == ".gz":
						with gzip.open(p, "rt") as f:
							assert json.loads(f.readline())["status"] == 200
				print("PASS: real Caddy query/header/path-token redaction, field bounds, trusted IP and compressed rotation.")
			finally:
				process.terminate()
				try:
					process.wait(timeout=10)
				except subprocess.TimeoutExpired:
					process.kill()
					process.wait()


if __name__ == "__main__":
	verify(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else "caddy")
