"""Isolated deployment checks: real Git and archives, fake PHP/services. No server access."""
import os
import shutil
import shlex
import subprocess
import tempfile
import unittest
from pathlib import Path

SOURCE = Path(__file__).resolve().parents[1]
REAL_GIT = shutil.which('git')


class DeployTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix='xboard-deploy-')
        self.base = Path(self.tmp.name)
        self.site = self.base / 'site'
        self.site.mkdir()
        self.bin = self.base / 'bin'
        self.bin.mkdir()
        self.log = self.base / 'php.log'
        self.env = dict(os.environ, PHP_BIN=str(self.bin / 'php'),
                        BACKUP_ROOT=str(self.base / 'backups'), MOCK_LOG=str(self.log),
                        PATH=str(self.bin) + ':' + os.environ['PATH'],
                        GIT_CONFIG_GLOBAL=os.devnull, GIT_CONFIG_NOSYSTEM='1',
                        GIT_AUTHOR_NAME='Fixture', GIT_AUTHOR_EMAIL='fixture@example.test',
                        GIT_COMMITTER_NAME='Fixture', GIT_COMMITTER_EMAIL='fixture@example.test')
        for name in ('init.sh', 'update.sh', '.gitignore'):
            shutil.copy(SOURCE / name, self.site / name)
        shutil.copytree(SOURCE / 'scripts', self.site / 'scripts')
        (self.site / 'composer.lock').write_text('{}')
        (self.site / 'payload.txt').write_text('old')
        self.git('init', '-b', 'main')
        self.git('add', '.')
        self.git('commit', '-qm', 'initial')
        self.old = self.git('rev-parse', 'HEAD').stdout.strip()
        self.remote = self.base / 'remote.git'
        self.git('clone', '--bare', str(self.site), str(self.remote))
        (self.site / 'payload.txt').write_text('new')
        self.git('add', 'payload.txt')
        self.git('commit', '-qm', 'update')
        self.target = self.git('rev-parse', 'HEAD').stdout.strip()
        self.git('push', str(self.remote), 'main')
        self.git('reset', '--hard', self.old)
        self.git('remote', 'add', 'origin', 'https://github.com/hainiu6/xboard.git')
        # Rewrite only the transport to an isolated local bare repository.
        self.git('config', 'url.' + str(self.remote) + '.insteadOf', 'https://github.com/hainiu6/xboard.git')
        (self.site / '.env').write_text('APP_KEY=keep-this-key\nINSTALLED=true\n')
        (self.site / 'vendor').mkdir()
        (self.site / 'vendor/autoload.php').touch()
        (self.site / '.tools').mkdir()
        (self.site / '.tools/composer.phar').touch()
        self.write_executable('uname', '#!/bin/sh\necho Linux\n')
        self.write_executable('mysqldump', '#!/bin/sh\nexit 0\n')
        # macOS lacks flock. Its lock shares the inherited open file description.
        if not shutil.which('flock'):
            self.write_executable('flock', '#!/usr/bin/python3\nimport fcntl,sys\ntry: fcntl.flock(int(sys.argv[-1]),fcntl.LOCK_EX|fcntl.LOCK_NB)\nexcept BlockingIOError: sys.exit(1)\n')
        self.write_executable('php', '''#!/bin/sh
printf '%s\\n' "$*" >> "$MOCK_LOG"
case "$1" in
  scripts/backup-mysql.php)
    [ "${MOCK_FAIL:-}" != backup ] || exit 1
    printf 'CREATE TABLE test(id INT);\\n' > "$2" ;;
  artisan)
    [ "${MOCK_FAIL:-}" != "$2" ] || exit 1 ;;
esac
exit 0
''')

    def tearDown(self):
        self.tmp.cleanup()

    def write_executable(self, name, content):
        path = self.bin / name
        path.write_text(content)
        path.chmod(0o755)

    def git(self, *args):
        return subprocess.run([REAL_GIT, *args], cwd=self.site, env=self.env,
                              text=True, capture_output=True, check=True)

    def run_deploy(self, script='update.sh', **extra):
        result = subprocess.run(['bash', script], cwd=self.site,
                                env=dict(self.env, **extra), text=True, capture_output=True)
        return result

    def assert_stopped_before_update(self, result):
        self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(self.git('rev-parse', 'HEAD').stdout.strip(), self.old)

    def test_update_preserves_env_and_backs_up_old_code(self):
        result = self.run_deploy()
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(self.git('rev-parse', 'HEAD').stdout.strip(), self.target)
        self.assertIn('keep-this-key', (self.site / '.env').read_text())
        backups = list((self.base / 'backups').iterdir())
        self.assertEqual(len(backups), 1)
        self.assertEqual((backups[0] / 'commit.txt').read_text().strip(), self.old)
        self.assertTrue((backups[0] / 'database.sql.gz').is_file())
        import tarfile
        with tarfile.open(backups[0] / 'site.tar.gz') as archive:
            self.assertEqual(archive.extractfile('./payload.txt').read(), b'old')
            self.assertIn(b'keep-this-key', archive.extractfile('./.env').read())
            self.assertNotIn('./vendor/autoload.php', archive.getnames())
        calls = self.log.read_text()
        self.assertLess(calls.index('backup-mysql.php'), calls.index('artisan down'))
        self.assertLess(calls.index('artisan migrate'), calls.index('artisan up'))

    def test_update_supports_git_without_show_current(self):
        self.write_executable('git', '#!/bin/sh\n'
                              'for arg do\n'
                              '  if [ "$arg" = --show-current ]; then\n'
                              '    echo "error: unknown option show-current" >&2; exit 129\n'
                              '  fi\n'
                              'done\n'
                              'exec ' + shlex.quote(REAL_GIT) + ' "$@"\n')
        result = self.run_deploy()
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(self.git('rev-parse', 'HEAD').stdout.strip(), self.target)

    def test_bootstrap_from_ignored_tools_keeps_worktree_clean(self):
        bootstrap = self.site / '.tools/aapanel-update.sh'
        bootstrap.write_text(self.git('show', self.target + ':scripts/aapanel.sh').stdout)
        self.assertEqual(self.git('status', '--porcelain').stdout, '')
        result = subprocess.run(['bash', str(bootstrap), 'update'], cwd=self.site,
                                env=self.env, text=True, capture_output=True)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(self.git('rev-parse', 'HEAD').stdout.strip(), self.target)
        self.assertIn('keep-this-key', (self.site / '.env').read_text())

    def test_detached_head_is_reported_without_changing_code(self):
        self.git('checkout', '--detach', self.old)
        result = self.run_deploy()
        self.assert_stopped_before_update(result)
        self.assertIn('detached HEAD', result.stderr)

    def test_other_branch_is_reported_without_changing_code(self):
        self.git('checkout', '-b', 'local-work')
        result = self.run_deploy()
        self.assert_stopped_before_update(result)
        self.assertIn('当前：local-work', result.stderr)

    def test_failed_backup_does_not_touch_code_or_enter_maintenance(self):
        result = self.run_deploy(MOCK_FAIL='backup')
        self.assert_stopped_before_update(result)
        self.assertNotIn('artisan down', self.log.read_text())

    def test_failed_migration_stays_in_maintenance(self):
        result = self.run_deploy(MOCK_FAIL='migrate')
        self.assertNotEqual(result.returncode, 0)
        calls = self.log.read_text()
        self.assertIn('artisan down', calls)
        self.assertNotIn('artisan up', calls)
        self.assertNotIn('artisan xboard:update', calls)
        self.assertIn('维护状态', result.stderr)

    def test_dirty_code_is_not_overwritten(self):
        (self.site / 'payload.txt').write_text('local-edit')
        self.assert_stopped_before_update(self.run_deploy())
        self.assertEqual((self.site / 'payload.txt').read_text(), 'local-edit')

    def test_divergent_branch_is_rejected(self):
        (self.site / 'local.txt').write_text('local-commit')
        self.git('add', 'local.txt')
        self.git('commit', '-qm', 'divergent')
        before = self.git('rev-parse', 'HEAD').stdout
        result = self.run_deploy()
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.git('rev-parse', 'HEAD').stdout, before)
        self.assertIn('分叉', result.stderr)

    def test_install_refuses_existing_configuration(self):
        result = self.run_deploy('init.sh')
        self.assert_stopped_before_update(result)
        self.assertIn('已有 .env', result.stderr)
        self.assertIn('keep-this-key', (self.site / '.env').read_text())

    def test_wrong_origin_is_rejected(self):
        self.git('remote', 'set-url', 'origin', 'https://github.com/cedar2025/Xboard.git')
        self.assert_stopped_before_update(self.run_deploy())

    def test_lock_blocks_concurrent_deploy(self):
        import fcntl
        with (self.site / '.git/xboard-deploy.lock').open('w') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            self.assert_stopped_before_update(self.run_deploy())


if __name__ == '__main__':
    unittest.main(verbosity=2)
