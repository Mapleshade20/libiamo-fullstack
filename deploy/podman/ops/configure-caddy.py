#!/usr/bin/env python3
"""Root-only, repeatable integration with an unambiguous Caddy site block."""

import argparse
import datetime
import os
from pathlib import Path
import pwd
import re
import shutil
import subprocess
import sys
from urllib.parse import urlsplit


def integrate(original, host, import_line, runtime_import):
	"""Edit only unambiguous block headers; leave final syntax validation to Caddy."""
	lines = original.splitlines(keepends=True)
	depth = 0
	global_start = global_end = None
	sites = []
	default_logger = False
	for index, line in enumerate(lines):
		tokens = re.findall(r'"(?:\\.|[^"\\])*"|`[^`]*`|#[^\n]*|[^\s]+', line)
		tokens = [t for t in tokens if not t.startswith('#')]
		if not tokens:
			continue
		if depth == 0 and tokens == ['{']:
			if global_start is not None:
				raise RuntimeError('Multiple global options blocks require manual integration')
			global_start = index
		elif depth == 0 and tokens[-1] == '{':
			addresses = ' '.join(tokens[:-1]).split(',')
			for address in addresses:
				for value in address.split():
					u = urlsplit(value if '://' in value else '//' + value)
					if u.hostname == host:
						sites.append(index)
		elif global_start is not None and global_end is None and depth == 1:
			if tokens[0] == 'log' and (len(tokens) == 1 or tokens[1] in ('default', '{')):
				default_logger = True
		depth += tokens.count('{') - tokens.count('}')
		if depth < 0:
			raise RuntimeError('Unbalanced Caddy blocks')
		if global_start is not None and global_end is None and depth == 0:
			global_end = index
	if depth:
		raise RuntimeError('Unsupported or unbalanced Caddy syntax; integrate imports manually')
	insertions = {}
	if import_line not in original:
		if len(set(sites)) != 1:
			raise RuntimeError('Expected one matching site block; integrate logging manually')
		insertions[sites[0]] = import_line
	if runtime_import not in original:
		if default_logger:
			raise RuntimeError('Existing global default logger requires manual redaction integration')
		if global_start is not None:
			insertions[global_start] = runtime_import
	updated = ''.join(line + ('\n' + insertions[i] + '\n' if i in insertions else '') for i, line in enumerate(lines))
	if runtime_import not in original and global_start is None:
		updated = '{\n' + runtime_import + '\n}\n' + updated
	return updated


def main():
	parser = argparse.ArgumentParser(description=__doc__)
	parser.add_argument("--user", required=True)
	parser.add_argument("--host", required=True)
	parser.add_argument("--template", type=Path, required=True)
	parser.add_argument("--caddyfile", type=Path, default=Path("/etc/caddy/Caddyfile"))
	a = parser.parse_args()
	if os.geteuid() != 0:
		raise RuntimeError("Run with sudo")
	if not re.fullmatch(r"[A-Za-z0-9.-]+", a.host):
		raise ValueError("Expected a DNS hostname")
	user = pwd.getpwnam(a.user)
	caddy = pwd.getpwnam("caddy")
	logdir = Path(f"/var/log/libiamo-{user.pw_uid}")
	logdir.mkdir(mode=0o2750, exist_ok=True)
	os.chown(logdir, caddy.pw_uid, user.pw_gid)
	logdir.chmod(0o2750)
	logfile = logdir / "access.log"
	logfile.touch(mode=0o640, exist_ok=True)
	os.chown(logfile, caddy.pw_uid, user.pw_gid)
	logfile.chmod(0o640)
	snippet = Path(f"/etc/caddy/libiamo-{user.pw_uid}.caddy")
	runtime_snippet = Path(f"/etc/caddy/libiamo-{user.pw_uid}-runtime.caddy")
	runtime_content = a.template.with_name("runtime-log.caddy").read_text()
	content = a.template.read_text().replace("__LOGGER__", f"libiamo_{user.pw_uid}").replace("__LOG_FILE__", str(logdir / "access.log"))
	original = a.caddyfile.read_text()
	old_snippet = snippet.read_text() if snippet.exists() else None
	old_runtime = runtime_snippet.read_text() if runtime_snippet.exists() else None
	import_line = f"\timport {snippet}"
	runtime_import = f"\timport {runtime_snippet}"
	updated = integrate(original, a.host, import_line, runtime_import)
	backup = Path(f"/var/backups/libiamo-ops-{user.pw_uid}")
	backup.mkdir(mode=0o700, exist_ok=True)
	backup.chmod(0o700)
	stamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
	if updated != original or old_snippet != content:
		shutil.copy2(a.caddyfile, backup / ("Caddyfile-" + stamp))
		for stale in sorted(backup.glob("Caddyfile-*"), reverse=True)[5:]:
			stale.unlink()
	env = os.environ.copy()
	pid = subprocess.check_output(["systemctl", "show", "caddy", "-p", "MainPID", "--value"], text=True).strip()
	binary = "caddy"
	if pid != "0":
		# PATH may contain an older hand-installed Caddy with different plugins.
		binary = f"/proc/{pid}/exe"
		# Reuse the running service's DNS credentials without putting them in argv/logs.
		needed = set(re.findall(r"\{(?:env\.|\$)([A-Za-z_][A-Za-z0-9_]*)\}", updated))
		for entry in Path(f"/proc/{pid}/environ").read_bytes().split(b"\0"):
			if b"=" in entry:
				key, value = entry.decode().split("=", 1)
				if key in needed:
					env[key] = value
	try:
		snippet.write_text(content)
		snippet.chmod(0o644)
		runtime_snippet.write_text(runtime_content)
		runtime_snippet.chmod(0o644)
		a.caddyfile.write_text(updated)
		for command in ([binary, "validate", "--config", str(a.caddyfile), "--adapter", "caddyfile"],
			[binary, "reload", "--config", str(a.caddyfile), "--adapter", "caddyfile"]):
			subprocess.run(command, env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True, timeout=60)
	except BaseException as error:
		if isinstance(error, (subprocess.CalledProcessError, subprocess.TimeoutExpired)):
			# Keep diagnostics private; redact service credentials even in that file.
			diagnostic = (error.stdout or b"") + (error.stderr or b"")
			for key, value in env.items():
				if value and re.search(r"TOKEN|SECRET|PASSWORD|PASS|API_KEY", key, re.I):
					diagnostic = diagnostic.replace(value.encode(), b"[REDACTED]")
			failure = backup / "last-error.log"
			failure.write_bytes(diagnostic)
			failure.chmod(0o600)
			print("Failed integration stage:", " ".join(error.cmd[:2]), file=sys.stderr)
		a.caddyfile.write_text(original)
		if old_snippet is None:
			snippet.unlink(missing_ok=True)
		else:
			snippet.write_text(old_snippet)
		if old_runtime is None:
			runtime_snippet.unlink(missing_ok=True)
		else:
			runtime_snippet.write_text(old_runtime)
		subprocess.run([binary, "reload", "--config", str(a.caddyfile), "--adapter", "caddyfile"],
			env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=60)
		raise
	print("Caddy access logging configured; bounded private logs at", logdir)


if __name__ == "__main__":
	try:
		main()
	except Exception as error:
		print("Caddy integration failed; configuration rolled back where necessary: " + type(error).__name__, file=sys.stderr)
		sys.exit(1)
