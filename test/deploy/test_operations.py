"""Run with python3 -m unittest discover -s test/deploy -v."""

import importlib.util
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile
import gzip
import os
import sys
import unittest
from unittest.mock import patch, MagicMock

SOURCE = Path(__file__).resolve().parents[2] / "deploy/podman/ops/operations.py"
spec = importlib.util.spec_from_file_location("operations", SOURCE)
ops = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ops)


class OperationsTest(unittest.TestCase):
	def test_compressed_tail_and_irrelevant_archives(self):
		with tempfile.TemporaryDirectory() as d:
			p = Path(d)/'access.log'
			p.write_text(json.dumps({'ts':1000,'status':200})+'\n')
			with gzip.open(Path(d)/'access-old.log.gz','wt') as f:
				for _ in range(40):f.write(json.dumps({'ts':1,'status':200,'padding':'x'*80})+'\n')
				for _ in range(5):f.write(json.dumps({'ts':999,'status':503})+'\n')
			v=ops.recent_requests(p,1000,512)
			self.assertEqual((v['requests'],v['errors']),(6,5))
			p.write_text(json.dumps({'ts':600,'status':200})+'\n'+json.dumps({'ts':1000,'status':200})+'\n')
			with patch.object(ops.gzip,'open',side_effect=AssertionError('archive unnecessary')):
				self.assertFalse(ops.recent_requests(p,1000,512)['truncated'])

	def test_lock_waits_and_times_out_without_running_job(self):
		with tempfile.TemporaryDirectory() as d, patch.object(ops,'STATE',Path(d)):
			with ops.lock('backup'):
				with self.assertRaises(TimeoutError):
					with ops.lock('backup',timeout=0):self.fail('lock acquired twice')
			with patch.object(ops.fcntl,'flock',side_effect=[BlockingIOError(),None]), patch.object(ops.time,'sleep') as sleep:
				with ops.lock('backup'):pass
				sleep.assert_called_once()

	def test_caddy_block_scope_and_site_aliases(self):
		spec=importlib.util.spec_from_file_location('caddy',SOURCE.with_name('configure-caddy.py'))
		caddy=importlib.util.module_from_spec(spec);spec.loader.exec_module(caddy)
		for header in ['example.com','https://example.com','other.com, example.com']:
			s='{\n servers {\n }\n}\nfirst.com {\n log {\n }\n}\n'+header+' {\n respond "}"\n}\n'
			v=caddy.integrate(s,'example.com','\timport site','\timport runtime')
			self.assertIn(header+' {\n\n\timport site\n',v)
			self.assertEqual(v,caddy.integrate(v,'example.com','\timport site','\timport runtime'))
		with self.assertRaises(RuntimeError):caddy.integrate('{\n log {\n }\n}\nexample.com {\n}\n','example.com','import site','import runtime')

	def test_first_install_reports_pending_without_calling_sudo(self):
		with tempfile.TemporaryDirectory() as d:
			root=Path(d);bin=root/'bin';bin.mkdir();home=root/'home';home.mkdir()
			stubs={'id':'echo 1000','podman':'echo "podman version 5.6.1"','systemctl':'exit 0',
				'loginctl':'echo Linger=yes','openssl':'echo synthetic','sudo':'echo unexpected-sudo >&2; exit 1'}
			for name,body in stubs.items():
				p=bin/name;p.write_text('#!/bin/sh\n'+body+'\n');p.chmod(0o700)
			env={**os.environ,'HOME':str(home),'USER':'testuser','PATH':str(bin)+':'+os.environ['PATH'],'LIBIAMO_DEFER_CADDY_SETUP':'0'}
			r=subprocess.run(['bash',str(SOURCE.parents[1]/'install.sh')],env=env,capture_output=True,text=True,timeout=30)
			self.assertEqual(r.returncode,0,r.stderr)
			self.assertIn('Secrets still need filling',r.stderr)
			self.assertIn('Config:',r.stdout)
			self.assertNotIn('unexpected-sudo',r.stderr)
			unit=(home/'.config/systemd/user/libiamo-backup.service').read_text()
			self.assertIn('TimeoutStartSec=45min',unit)
			self.assertIn('ExecStart="',unit)
			# A later real integration failure remains fatal, but does not hide the report.
			p=home/'.config/libiamo/app.env';p.write_text(p.read_text().replace('CHANGE_ME','synthetic'))
			r=subprocess.run(['bash',str(SOURCE.parents[1]/'install.sh')],env=env,capture_output=True,text=True,timeout=30)
			self.assertNotEqual(r.returncode,0)
			self.assertIn('Config:',r.stdout)

	def test_http_origin_does_not_assume_public_probe_traffic(self):
		with tempfile.TemporaryDirectory() as d:
			root=Path(d)
			info={'Config':{'Env':['ORIGIN=http://example.com']},'State':{'Running':True}}
			opener=MagicMock();opener.open.return_value.__enter__.return_value.status=200
			opener.open.return_value.__enter__.return_value.read.return_value=b'{"status":"ok"}'
			with patch.object(ops,'BACKUPS',root),patch.object(ops,'inspect',return_value=info), \
				patch.object(ops.Path,'read_text',return_value='MemTotal: 1000 kB\nMemAvailable: 900 kB\n'), \
				patch.object(ops,'read_json',return_value={'completed_at':1000}), \
				patch.object(ops,'run',return_value=subprocess.CompletedProcess([],0,stdout=b'success')), \
				patch.object(ops,'db_query',return_value='0|0'),patch.object(ops.urllib.request,'build_opener',return_value=opener), \
				patch.object(ops,'recent_requests',return_value={'requests':0,'errors':0,'truncated':False,'latest_entry':0}):
				issues,_=ops.collect_issues({**ops.DEFAULTS,'access_log':str(root/'access.log')},{},10000)
			self.assertNotIn('access_log_stale',issues)
			opener.open.assert_called_once()

	def test_partial_recovery_email_lists_recovered_check(self):
		with tempfile.TemporaryDirectory() as d,patch.object(ops,'STATE',Path(d)):
			ops.write_json(Path(d)/'monitor.json',{'delivered':{'old':'down','keep':'down'},'clears':{'old':2},'streaks':{'keep':3}})
			with patch.object(ops,'collect_issues',return_value=({'keep':'down'},{})),patch.object(ops,'send_email') as send:
				ops.monitor(ops.DEFAULTS)
			self.assertIn('Recovered checks:\nold',send.call_args.args[2])
			self.assertIn('keep: down',send.call_args.args[2])
	def test_retention_bounds_count_and_bytes_without_touching_other_files(self):
		with tempfile.TemporaryDirectory() as d:
			p = Path(d)
			for day in range(1, 6):
				(p / f"libiamo-2026010{day}.dump").write_bytes(b"dump" * 2)
			(p / "other.dump").write_text("keep")
			(p / "libiamo-link.dump").symlink_to(p / "other.dump")
			ops.prune_backups(p, 3, 16)
			self.assertEqual(sorted(f.name for f in p.glob("libiamo-2026*.dump")),
				["libiamo-20260104.dump", "libiamo-20260105.dump"])
			self.assertEqual((p / "other.dump").read_text(), "keep")
			self.assertTrue((p / "libiamo-link.dump").is_symlink())

	def test_invalid_retention_does_not_delete_last_backup(self):
		with tempfile.TemporaryDirectory() as d:
			p = Path(d)
			f = p / "libiamo-20260101.dump"
			f.write_text("backup")
			with self.assertRaises(ValueError):
				ops.prune_backups(p, 0, 100)
			self.assertTrue(f.exists())
			with self.assertRaises(ValueError):
				ops.prune_backups(p, 1, 1)
			self.assertTrue(f.exists())

	def test_dump_failure_preserves_old_archive_and_manifest_and_removes_partial(self):
		with tempfile.TemporaryDirectory() as d:
			root = Path(d)
			backups, state = root / "backups", root / "state"
			backups.mkdir()
			state.mkdir()
			old = backups / "libiamo-20260101.dump"
			old.write_text("old")
			ops.write_json(state / "backup.json", {"completed_at": 1})
			def fail_dump(args, **kwargs):
				kwargs["stdout"].write(b"partial")
				raise subprocess.CalledProcessError(1, args)
			with patch.object(ops, "BACKUPS", backups), patch.object(ops, "STATE", state), \
				patch.object(ops, "db_args", return_value=[]), patch.object(ops, "run", side_effect=fail_dump):
				with self.assertRaises(subprocess.CalledProcessError):
					ops.backup({**ops.DEFAULTS, "backup_min_free_bytes": 0})
			self.assertEqual(old.read_text(), "old")
			self.assertEqual(ops.read_json(state / "backup.json"), {"completed_at": 1})
			self.assertFalse(list(backups.glob("*.part")))

	def test_alerts_debounce_both_failure_and_recovery_and_retry_delivery(self):
		state = {}
		for i in range(3):
			state, due = ops.alert_transition(state, {"readiness": "down"}, 100 + i)
			self.assertEqual(due, i == 2)
		# Failed delivery is retried, not recorded as delivered.
		state["retry_after"] = 1000
		state, due = ops.alert_transition(state, {"readiness": "down"}, 200)
		self.assertFalse(due)
		state, due = ops.alert_transition(state, {"readiness": "down"}, 1001)
		self.assertTrue(due)
		state.update(delivered=state["active"], last_sent=1001, retry_after=0)
		for i in range(3):
			state, due = ops.alert_transition(state, {}, 1010 + i)
			self.assertEqual(due, i == 2)
		self.assertEqual(state["active"], {})

	def test_recent_requests_counts_only_window_and_reports_scan_bound(self):
		with tempfile.TemporaryDirectory() as d:
			p = Path(d) / "access.log"
			rows = [{"ts": 1, "status": 500}, {"ts": 800, "status": 200}, {"ts": 900, "status": 503}]
			p.write_text("\n".join(json.dumps(v) for v in rows) + "\ninvalid\n")
			v = ops.recent_requests(p, 1000)
			self.assertEqual(v, {"requests": 2, "errors": 1, "truncated": False, "latest_entry": 900})
			self.assertTrue(ops.recent_requests(p, 1000, limit=40)["truncated"])

	def test_restore_checksum_failure_never_starts_container(self):
		with tempfile.TemporaryDirectory() as d:
			root = Path(d)
			f = root / "libiamo-20260101.dump"
			f.write_bytes(b"corrupted")
			ops.write_json(root / "backup.json", {"file": f.name, "sha256": "wrong"})
			with patch.object(ops, "BACKUPS", root), patch.object(ops, "STATE", root), patch.object(ops, "run") as run:
				with self.assertRaises(RuntimeError):
					ops.restore_check(ops.DEFAULTS)
				run.assert_not_called()

	def test_restore_failure_cleans_isolated_container_without_publishing_success(self):
		with tempfile.TemporaryDirectory() as d:
			root = Path(d)
			f = root / "libiamo-20260101.dump"
			f.write_bytes(b"PGDMP")
			ops.write_json(root / "backup.json", {"file": f.name, "sha256": hashlib.sha256(f.read_bytes()).hexdigest()})
			calls = []
			def command(args, **kwargs):
				calls.append(args)
				if "pg_restore" in args:
					raise subprocess.CalledProcessError(1, args)
				return subprocess.CompletedProcess(args, 0)
			info = {"Image": "sha256:test", "Config": {"Env": ["POSTGRES_USER=learner", "POSTGRES_DB=learning"]}}
			with patch.object(ops, "BACKUPS", root), patch.object(ops, "STATE", root), \
				patch.object(ops, "inspect", return_value=info), patch.object(ops, "run", side_effect=command), \
				patch.object(ops.subprocess, "run", return_value=subprocess.CompletedProcess([], 0)):
				with self.assertRaises(subprocess.CalledProcessError):
					ops.restore_check(ops.DEFAULTS)
			self.assertIn("--network=none", calls[0])
			self.assertFalse(any("--publish" in a or "--volume" in a for a in calls[0]))
			self.assertEqual(calls[-1][:5], ["podman", "rm", "--force", "--volumes", "--ignore"])
			self.assertFalse((root / "restore.json").exists())


if __name__ == "__main__":
	unittest.main()
