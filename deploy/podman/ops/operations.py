#!/usr/bin/env python3
"""User-scoped Podman operations; no third-party Python dependencies."""

import argparse
import contextlib
from collections import deque
import datetime
import email.message
import fcntl
import gzip
import hashlib
import json
import os
from pathlib import Path
import resource
import shlex
import shutil
import signal
import smtplib
import socket
import ssl
import subprocess
import sys
import time
import urllib.request
import uuid


HOME = Path.home()
CONFIG = HOME / ".config/libiamo/ops.json"
STATE = HOME / ".local/state/libiamo-ops"
BACKUPS = HOME / ".local/share/libiamo-backups"
DEFAULTS = {
	"app_container": "libiamo-app",
	"db_container": "libiamo-db",
	"health_url": "http://127.0.0.1:3000/health",
	"access_log": None,
	"alert_to": [],
	"backup_keep": 14,
	"backup_budget_bytes": 2 * 1024**3,
	"backup_min_free_bytes": 1024**3,
	"llm_calls_per_hour": 500,
	"llm_output_tokens_per_hour": 2_000_000,
	"restore_memory": "256m",
	"restore_tmpfs": "512m",
}


def run(args, **kwargs):
	return subprocess.run(args, check=True, timeout=kwargs.pop("timeout", 30), **kwargs)


def private_dir(path):
	path.mkdir(parents=True, exist_ok=True, mode=0o700)
	path.chmod(0o700)


def read_json(path, default=None):
	try:
		return json.loads(path.read_text())
	except FileNotFoundError:
		return {} if default is None else default


def write_json(path, value):
	private_dir(path.parent)
	tmp = path.with_suffix(".tmp")
	try:
		with tmp.open("w") as f:
			json.dump(value, f, indent=2)
			f.flush()
			os.fsync(f.fileno())
		tmp.chmod(0o600)
		tmp.replace(path)
	finally:
		tmp.unlink(missing_ok=True)


@contextlib.contextmanager
def lock(name, timeout=1200):
	private_dir(STATE)
	with (STATE / f"{name}.lock").open("w") as f:
		deadline = time.monotonic() + timeout
		while True:
			try:
				fcntl.flock(f, fcntl.LOCK_EX | fcntl.LOCK_NB)
				break
			except BlockingIOError:
				if time.monotonic() >= deadline:
					raise TimeoutError("Timed out waiting for operations lock")
				time.sleep(.25)
		yield


def inspect(name):
	r = run(["podman", "inspect", name], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
	return json.loads(r.stdout)[0]


def container_env(info):
	return dict(item.split("=", 1) for item in info["Config"]["Env"] if "=" in item)


def db_args(config, info=None):
	e = container_env(info or inspect(config["db_container"]))
	return ["-U", e.get("POSTGRES_USER", "postgres"), "-d", e.get("POSTGRES_DB", e.get("POSTGRES_USER", "postgres"))]


def db_query(config, sql):
	r = run(["podman", "exec", "--env", "PGOPTIONS=-c statement_timeout=5000", config["db_container"],
		"psql", *db_args(config), "-At", "-v", "ON_ERROR_STOP=1", "-c", sql],
		stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=15)
	return r.stdout.decode().strip()


def prune_backups(directory, keep, budget):
	if keep < 1 or budget < 1:
		raise ValueError("Backup retention must keep at least one archive")
	files = sorted((p for p in directory.glob("libiamo-*.dump") if not p.is_symlink()), reverse=True)
	total = 0
	for i, p in enumerate(files):
		size = p.stat().st_size
		if i == 0 and size > budget:
			raise ValueError("Newest backup exceeds configured budget")
		if i >= keep or total + size > budget:
			p.unlink()
		else:
			total += size


def backup(config):
	with lock("backup"):
		private_dir(BACKUPS)
		if shutil.disk_usage(BACKUPS).free < config["backup_min_free_bytes"]:
			raise RuntimeError("Insufficient free space for backup")
		max_dump = min(config["backup_budget_bytes"], shutil.disk_usage(BACKUPS).free - config["backup_min_free_bytes"])
		for stale in BACKUPS.glob("libiamo-*.part"):
			stale.unlink()
		stamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%S.%fZ")
		final = BACKUPS / f"libiamo-{stamp}.dump"
		part = final.with_suffix(".part")
		try:
			with part.open("wb") as f:
				run(["podman", "exec", config["db_container"], "pg_dump", *db_args(config), "--format=custom"],
					stdout=f, stderr=subprocess.DEVNULL, timeout=900,
					preexec_fn=lambda: resource.setrlimit(resource.RLIMIT_FSIZE, (max_dump, max_dump)))
				f.flush()
				os.fsync(f.fileno())
			if part.stat().st_size < 5 or part.stat().st_size > config["backup_budget_bytes"]:
				raise RuntimeError("Backup size outside configured bounds")
			with part.open("rb") as f:
				run(["podman", "exec", "-i", config["db_container"], "pg_restore", "--list"],
					stdin=f, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=60)
			part.chmod(0o600)
			part.replace(final)
			hash_value = hashlib.sha256()
			with final.open("rb") as f:
				for chunk in iter(lambda: f.read(1024 * 1024), b""):
					hash_value.update(chunk)
			prune_backups(BACKUPS, config["backup_keep"], config["backup_budget_bytes"])
			write_json(STATE / "backup.json", {"completed_at": time.time(), "file": final.name,
				"bytes": final.stat().st_size, "sha256": hash_value.hexdigest()})
			print("Database backup completed and archive table of contents validated.")
		finally:
			part.unlink(missing_ok=True)


def restore_check(config):
	with lock("backup"):
		meta = read_json(STATE / "backup.json")
		name = meta.get("file", "")
		if Path(name).name != name or not name.startswith("libiamo-") or not name.endswith(".dump"):
			raise RuntimeError("No valid completed backup manifest")
		dump = BACKUPS / name
		if dump.is_symlink():
			raise RuntimeError("Backup must not be a symlink")
		hash_value = hashlib.sha256()
		with dump.open("rb") as f:
			for chunk in iter(lambda: f.read(1024 * 1024), b""):
				hash_value.update(chunk)
		if hash_value.hexdigest() != meta["sha256"]:
			raise RuntimeError("Backup checksum mismatch")
		info = inspect(config["db_container"])
		e = container_env(info)
		user = e.get("POSTGRES_USER", "postgres")
		database = e.get("POSTGRES_DB", user)
		name = "libiamo-restore-check-" + uuid.uuid4().hex[:12]
		try:
			run(["podman", "run", "--detach", "--pull=never", "--name", name, "--network=none",
				"--memory=" + config["restore_memory"], "--pids-limit=128", "--tmpfs", "/var/lib/postgresql:rw,size=" + config["restore_tmpfs"],
				"--env", "POSTGRES_HOST_AUTH_METHOD=trust", "--env", "POSTGRES_USER=" + user,
				"--env", "POSTGRES_DB=" + database, info["Image"]], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
			for _ in range(60):
				r = subprocess.run(["podman", "exec", name, "sh", "-c",
					'test "$(cat /proc/1/comm)" = postgres && exec pg_isready "$@"', "ready", "-U", user, "-d", database],
					stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=5)
				if r.returncode == 0:
					break
				time.sleep(1)
			else:
				raise RuntimeError("Restore database did not become ready")
			with dump.open("rb") as f:
				run(["podman", "exec", "-i", name, "pg_restore", "-U", user, "-d", database,
					"--exit-on-error", "--single-transaction", "--no-owner"], stdin=f,
					stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=600)
			query = '''SELECT (SELECT count(*) FROM information_schema.tables WHERE table_schema='public'),
				(SELECT count(*) FROM drizzle.__drizzle_migrations), (SELECT count(*) FROM public."user");'''
			r = run(["podman", "exec", name, "psql", "-U", user, "-d", database, "-At",
				"-v", "ON_ERROR_STOP=1", "-c", query], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
			counts = [int(v) for v in r.stdout.decode().strip().split("|")]
			if len(counts) != 3 or counts[0] < 1 or counts[1] < 1:
				raise RuntimeError("Restored application schema is incomplete")
			write_json(STATE / "restore.json", {"completed_at": time.time(), "backup": dump.name,
				"public_tables": counts[0], "migrations": counts[1], "users": counts[2]})
			print("Isolated transactional restore verified: tables, migrations and user rows are readable.")
		finally:
			run(["podman", "rm", "--force", "--volumes", "--ignore", name],
				stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=60)


def recent_requests(path, now, limit=8 * 1024**2):
	"""Bound work under a flood; report incomplete coverage rather than exact rates."""
	path = Path(path)
	files = [path]
	archives = sorted(path.parent.glob(path.stem + "-*.log*"), key=lambda p: p.stat().st_mtime, reverse=True)
	if archives:
		files.append(archives[0])
	total = errors = 0
	latest = 0
	earliest = 0
	truncated = False
	for p in files:
		if p != path and earliest and earliest <= now - 300:
			break
		if p.suffix == ".gz":
			with gzip.open(p, "rb") as f:
				chunks = deque()
				buffered = 0
				read_bytes = 0
				for chunk in iter(lambda: f.read(64 * 1024), b""):
					read_bytes += len(chunk)
					chunks.append(chunk)
					buffered += len(chunk)
					while buffered - len(chunks[0]) >= limit:
						buffered -= len(chunks.popleft())
				data = b"".join(chunks)[-limit:]
			if read_bytes > limit:
				data = data.partition(b"\n")[2]
		else:
			with p.open("rb") as f:
				size = f.seek(0, 2)
				f.seek(max(0, size - limit))
				if size > limit:
					f.readline()
				data = f.read(limit)
			read_bytes = size
		file_earliest = 0
		for line in data.splitlines():
			try:
				v = json.loads(line)
				file_earliest = min(file_earliest or float(v["ts"]), float(v["ts"]))
				latest = max(latest, float(v["ts"]))
				if now - 300 <= float(v["ts"]) <= now + 5:
					total += 1
					errors += int(int(v["status"]) >= 500)
			except (ValueError, KeyError, TypeError):
				continue
		if p == path:
			earliest = file_earliest
		if read_bytes > limit and (not file_earliest or file_earliest > now - 300):
			truncated = True
	return {"requests": total, "errors": errors, "truncated": truncated, "latest_entry": latest}


def alert_transition(previous, issues, now):
	"""A failed email must not advance the delivered-state watermark."""
	previous = previous or {}
	streaks = {key: previous.get("streaks", {}).get(key, 0) + 1 for key in issues}
	active = {key: value for key, value in issues.items() if streaks[key] >= 3}
	delivered = previous.get("delivered", {})
	clears = {key: previous.get("clears", {}).get(key, 0) + 1 for key in delivered if key not in issues}
	for key, value in delivered.items():
		if key not in active and (key in issues or clears.get(key, 0) < 3):
			active[key] = value
	changed = active != delivered
	due = (changed or (active and now - previous.get("last_sent", 0) >= 21600))
	due = bool(due and now >= previous.get("retry_after", 0))
	state = {**previous, "checked_at": now, "issues": issues, "streaks": streaks, "clears": clears, "active": active}
	return state, due


def send_email(config, subject, body):
	recipients = config["alert_to"]
	if not recipients:
		raise RuntimeError("No alert recipients configured")
	try:
		e = container_env(inspect(config["app_container"]))
	except (subprocess.SubprocessError, ValueError, KeyError):
		# A removed app container must not disable host notifications.
		e = {}
		for line in (HOME / ".config/libiamo/app.env").read_text().splitlines():
			key, separator, value = line.partition("=")
			if separator and key.strip().startswith("SMTP_"):
				e[key.strip()] = " ".join(shlex.split(value))
	message = email.message.EmailMessage()
	message["From"] = e["SMTP_FROM"]
	message["To"] = ", ".join(recipients)
	message["Subject"] = subject
	message.set_content(body)
	secure = e.get("SMTP_SECURE", "").lower() in ("1", "true", "yes", "on")
	context = ssl.create_default_context()
	if secure:
		client = smtplib.SMTP_SSL(e["SMTP_HOST"], int(e.get("SMTP_PORT", "465")), timeout=15, context=context)
	else:
		client = smtplib.SMTP(e["SMTP_HOST"], int(e.get("SMTP_PORT", "587")), timeout=15)
	try:
		if not secure:
			client.starttls(context=context)
		client.login(e["SMTP_USER"], e["SMTP_PASS"])
		refused = client.send_message(message)
		if refused:
			raise RuntimeError("At least one alert recipient was refused")
	finally:
		client.close()


def collect_issues(config, previous, now):
	issues = {}
	metrics = {}
	public_url = None
	for label, path in (("data", BACKUPS), ("logs", Path(config["access_log"]).parent)):
		try:
			v = os.statvfs(path)
			used = 1 - v.f_bavail / v.f_blocks
			inodes = 1 - v.f_favail / v.f_files if v.f_files else 0
			metrics[label + "_disk_used"] = round(used, 3)
			if used >= .8:
				issues[label + "_disk"] = "CRITICAL: disk >=90%" if used >= .9 else "Disk >=80%"
			if inodes >= .8:
				issues[label + "_inodes"] = "Inodes >=80%"
		except OSError:
			issues[label + "_storage"] = "Storage path unavailable"
	mem = dict((line.split(":")[0], int(line.split()[1])) for line in Path("/proc/meminfo").read_text().splitlines())
	metrics["available_memory_ratio"] = round(mem["MemAvailable"] / mem["MemTotal"], 3)
	if metrics["available_memory_ratio"] < .1:
		issues["memory"] = "Available memory <10%"
	for key in ("app_container", "db_container"):
		name = config[key]
		try:
			d = inspect(name)
			if key == "app_container":
				e = container_env(d)
				origin = e.get("ORIGIN", "").rstrip("/")
				if origin.startswith("https://"):
					public_url = origin + e.get("BASE_PATH", "") + "/health"
			s = d["State"]
			if not s.get("Running") or s.get("Health", {}).get("Status") == "unhealthy":
				issues[name] = "Container stopped or unhealthy"
			if s.get("OOMKilled"):
				issues[name + "_oom"] = "Container reports an OOM kill"
			started = s.get("StartedAt")
			metrics[name + "_started"] = started
			history = [t for t in previous.get("metrics", {}).get(name + "_restarts", []) if now - t < 600]
			old = previous.get("metrics", {}).get(name + "_started")
			if old and old != started:
				history.append(now)
			metrics[name + "_restarts"] = history
			if len(history) >= 3:
				issues[name + "_restarts"] = "At least 3 observed restarts in 10 minutes"
		except (subprocess.SubprocessError, ValueError, KeyError):
			issues[name] = "Container inspection failed"
	try:
		# Ignore proxy environment variables for this loopback-only readiness check.
		opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
		with opener.open(config["health_url"], timeout=8) as response:
			if response.status != 200 or json.loads(response.read(4096)).get("status") != "ok":
				raise ValueError("Readiness response invalid")
	except (OSError, ValueError):
		issues["readiness"] = "Local application/database readiness check failed"
	if public_url:
		try:
			request = urllib.request.Request(public_url, headers={"User-Agent": "Libiamo-Operations/1.0"})
			with opener.open(request, timeout=10) as response:
				if response.status != 200 or json.loads(response.read(4096)).get("status") != "ok":
					raise ValueError("Public readiness response invalid")
		except (OSError, ValueError):
			issues["public_readiness"] = "Public HTTPS readiness check failed (observed from this host)"
	for key, max_age in (("backup", 30 * 3600), ("restore", 8 * 86400)):
		try:
			t = read_json(STATE / (key + ".json")).get("completed_at", 0)
			if now - t > max_age:
				issues[key] = "No sufficiently recent successful " + key
		except (OSError, ValueError):
			issues[key] = "Cannot read " + key + " status"
	for job in ("backup", "restore-check"):
		try:
			r = run(["systemctl", "--user", "show", "libiamo-" + job + ".service", "-p", "Result", "--value"],
				stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
			if r.stdout.decode().strip() not in ("success", ""):
				issues[job + "_job"] = "Last scheduled operation failed"
		except subprocess.SubprocessError:
			issues[job + "_job"] = "Cannot read scheduled operation status"
	try:
		requests = recent_requests(config["access_log"], now)
		metrics.update(requests)
		if public_url and now - requests["latest_entry"] > 900:
			issues["access_log_stale"] = "No access log entries in 15 minutes despite periodic public readiness probes"
		if requests["requests"] >= 20 and requests["errors"] / requests["requests"] >= .2:
			issues["http_5xx"] = "At least 20% 5xx in recent access-log sample (minimum 20 requests)"
		# Reaching the scan bound is observable, not a false claim of exact totals.
		metrics["http_sample_limited"] = requests["truncated"]
	except OSError:
		issues["access_log"] = "Access log unreadable or not provisioned"
	try:
		counts = db_query(config, "SELECT count(*),coalesce(sum(completion_tokens),0) FROM llm_trace WHERE created_at > now()-interval '1 hour';")
		calls, tokens = map(int, counts.split("|"))
		metrics.update(llm_calls_hour=calls, llm_output_tokens_hour=tokens)
		if calls >= config["llm_calls_per_hour"] or tokens >= config["llm_output_tokens_per_hour"]:
			issues["llm_volume"] = "Hourly LLM call/token volume above configured threshold (not a cost estimate)"
	except (subprocess.SubprocessError, ValueError, KeyError):
		issues["llm_metrics"] = "Cannot query LLM usage counters"
	return issues, metrics


def monitor(config):
	with lock("monitor"):
		previous = read_json(STATE / "monitor.json")
		now = time.time()
		issues, metrics = collect_issues(config, previous, now)
		state, due = alert_transition(previous, issues, now)
		state["metrics"] = metrics
		if due:
			active = state["active"]
			recovered = sorted(set(previous.get("delivered", {})) - set(active))
			try:
				send_email(config, "[Libiamo] " + ("Operational alert" if active else "Recovered"),
					socket.gethostname() + "\n" + ("\n".join(k + ": " + v for k, v in active.items()) or "Previously reported checks have recovered.")
					+ ("\n\nRecovered checks:\n" + "\n".join(recovered) if recovered else "")
					+ "\n\nThis check runs on the host; it cannot report a total host outage.")
				state.update(delivered=active, last_sent=now, retry_after=0, notification="accepted_by_smtp")
			except Exception as error:
				# Provider errors can include addresses or credentials; never print their text.
				state.update(retry_after=now + 900, notification="failed:" + type(error).__name__)
		write_json(STATE / "monitor.json", state)
		print(json.dumps({"checks": "warning" if issues else "ok", "issue_keys": sorted(issues),
			"notification": state.get("notification", "not_sent")}))


def main():
	os.umask(0o077)
	parser = argparse.ArgumentParser(description=__doc__)
	parser.add_argument("command", choices=("init", "backup", "restore-check", "monitor", "test-email", "status"))
	args = parser.parse_args()
	config = {**DEFAULTS, **read_json(CONFIG)}
	private_dir(STATE)
	if args.command != "init" and not config["access_log"]:
		config["access_log"] = f"/var/log/libiamo-{os.getuid()}/access.log"
	if args.command == "init":
		if not CONFIG.exists():
			write_json(CONFIG, config)
		private_dir(BACKUPS)
	elif args.command == "backup":
		backup(config)
	elif args.command == "restore-check":
		restore_check(config)
	elif args.command == "monitor":
		monitor(config)
	elif args.command == "test-email":
		send_email(config, "[Libiamo] Operations notification test", "SMTP notification test from " + socket.gethostname()
			+ ".\nThis is an on-host monitor, not independent external uptime monitoring.")
		print("Test email accepted by SMTP for configured recipients.")
	else:
		print(json.dumps({key: read_json(STATE / (key + ".json")) for key in ("backup", "restore", "monitor")}, indent=2))


if __name__ == "__main__":
	def interrupted(_signum, _frame):
		raise SystemExit("Operation interrupted; cleaning up.")
	signal.signal(signal.SIGTERM, interrupted)
	try:
		main()
	except Exception as error:
		print("Operations command failed (details withheld): " + type(error).__name__, file=sys.stderr)
		sys.exit(1)
