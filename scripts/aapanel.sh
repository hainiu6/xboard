#!/usr/bin/env bash
# aaPanel native deployment: PHP-FPM + Nginx + MySQL + Redis.
set -Eeuo pipefail
umask 022
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
cd "$ROOT"
export PATH="/www/server/mysql/bin:/usr/local/bin:/usr/bin:/bin:$PATH"
MODE="${1:-help}"
PHP_BIN="${PHP_BIN:-}"
BACKUP_DIR=""
MAINTENANCE=0

fail() { echo "错误：$*" >&2; exit 1; }
php_run() { "$PHP_BIN" "$@"; }
git_run() { git -c safe.directory="$ROOT" -c safe.directory="$ROOT/public/assets/admin" "$@"; }
on_exit() {
    local status=$?
    if (( status != 0 )); then
        echo "操作失败，已停止。${BACKUP_DIR:+备份目录：$BACKUP_DIR}" >&2
        if (( MAINTENANCE )); then
            echo "站点保留维护状态。修复后重新运行 bash update.sh；恢复访问前请检查数据库与代码版本。" >&2
        fi
    fi
}
trap on_exit EXIT

help_text() {
    cat <<'HELP'
用法：
  bash scripts/aapanel.sh check   检查 PHP 版本、扩展和基础命令
  bash init.sh                   首次安装（交互填写 MySQL、Redis、管理员邮箱）
  bash update.sh                 备份后更新 origin/main，安装依赖并迁移数据库
可选环境变量：PHP_BIN=/www/server/php/82/bin/php
  BACKUP_ROOT=/www/backup/xboard（必须在网站目录之外）
  OCTANE_ENABLED=1（仅已配置 Octane 守护进程时使用）
详情：docs/zh-CN/aapanel.md
HELP
}

preflight() {
    local tool candidate
    for tool in git curl tar gzip flock; do
        command -v "$tool" >/dev/null || fail "缺少 $tool，请先在服务器安装。"
    done
    if [[ -z "$PHP_BIN" ]]; then
        for candidate in /www/server/php/{82,83,84,85}/bin/php; do
            if [[ -x "$candidate" ]]; then PHP_BIN="$candidate"; break; fi
        done
        [[ -n "$PHP_BIN" ]] || PHP_BIN="$(command -v php || true)"
    fi
    [[ -x "$PHP_BIN" ]] || fail "找不到 PHP；请指定 PHP_BIN=/www/server/php/82/bin/php。"
    export PATH="$(dirname "$PHP_BIN"):$PATH"
    php_run -r '
        if (version_compare(PHP_VERSION, "8.2.35", "<")) {
            fwrite(STDERR, "需要 PHP >= 8.2.35，当前为 ".PHP_VERSION."\n"); exit(1);
        }
        $missing = array_filter(["curl", "ctype", "dom", "fileinfo", "mbstring", "openssl", "pcntl", "pdo_mysql", "posix", "redis", "tokenizer", "xml", "zip"], fn($e) => !extension_loaded($e));
        if ($missing) { fwrite(STDERR, "缺少 PHP 扩展：".implode(", ", $missing)."\n"); exit(1); }
        foreach (["putenv", "proc_open", "pcntl_alarm", "pcntl_signal"] as $fn) {
            if (!is_callable($fn)) { fwrite(STDERR, "请在 PHP 禁用函数中移除：$fn\n"); exit(1); }
        }
        echo "PHP ".PHP_VERSION."，扩展和函数检查通过。\n";
    '
    [[ -f composer.lock ]] || fail "缺少 composer.lock。"
    git_run rev-parse --show-toplevel >/dev/null
    echo "使用 PHP：$PHP_BIN"
}

install_dependencies() {
    local signature
    mkdir -p .tools
    # Verify Composer's official installer before executing it.
    if [[ ! -f .tools/composer.phar ]]; then
        curl -fsSL --retry 3 https://composer.github.io/installer.sig -o .tools/installer.sig
        curl -fsSL --retry 3 https://getcomposer.org/installer -o .tools/composer-setup.php
        signature="$(cat .tools/installer.sig)"
        php_run -r 'if (!hash_equals($argv[1], hash_file("sha384", $argv[2]))) {fwrite(STDERR, "Composer 安装器校验失败\n"); exit(1);}' "$signature" .tools/composer-setup.php
        php_run .tools/composer-setup.php --install-dir=.tools --filename=composer.phar --quiet
        rm -f .tools/composer-setup.php .tools/installer.sig
    fi
    COMPOSER_ALLOW_SUPERUSER=1 php_run .tools/composer.phar install --no-dev --prefer-dist --no-interaction --optimize-autoloader
    git_run submodule sync --recursive
    git_run submodule update --init --recursive
}

permissions() {
    mkdir -p storage/logs storage/framework/{cache/data,sessions,views} bootstrap/cache public/theme public/plugins plugins
    if [[ $(id -u) == 0 ]] && id www >/dev/null 2>&1; then
        chown -R www:www storage bootstrap/cache public/theme public/plugins plugins
        [[ ! -f .env ]] || chown www:www .env
    fi
    chmod -R u+rwX,g+rwX storage bootstrap/cache public/theme public/plugins plugins
    [[ ! -f .env ]] || chmod 640 .env
}

backup() {
    local backup_root="${BACKUP_ROOT:-/www/backup/xboard}"
    mkdir -p "$backup_root"
    backup_root="$(cd "$backup_root" && pwd -P)"
    case "$backup_root/" in "$ROOT/"*) fail "备份目录必须在网站目录之外。";; esac
    BACKUP_DIR="$backup_root/$(basename "$ROOT")-$(date +%Y%m%d-%H%M%S)-$$"
    mkdir -m 700 "$BACKUP_DIR"
    git_run rev-parse HEAD > "$BACKUP_DIR/commit.txt"
    tar --exclude='./.git' --exclude='./vendor' --exclude='./node_modules' --exclude='./.tools' \
        --exclude='./storage/logs' --exclude='./storage/framework' --exclude='./storage/backup' \
        -czf "$BACKUP_DIR/site.tar.gz" .
    php_run scripts/backup-mysql.php "$BACKUP_DIR/database.sql"
    [[ -s "$BACKUP_DIR/database.sql" ]] || fail "数据库备份为空，停止更新。"
    gzip "$BACKUP_DIR/database.sql"
    gzip -t "$BACKUP_DIR/database.sql.gz"
    echo "备份完成：$BACKUP_DIR"
}

main() {
    case "$MODE" in help|-h|--help) help_text; return;; check|install|update) ;; *) help_text; exit 2;; esac
    preflight
    [[ "$MODE" != check ]] || return 0
    [[ $(uname -s) == Linux ]] || fail "安装和更新命令只用于 Linux 服务器。"
    exec 9>"$(git_run rev-parse --git-dir)/xboard-deploy.lock"
    flock -n 9 || fail "另一个安装或更新任务正在运行。"
    if [[ "$MODE" == install ]]; then
        [[ ! -s .env ]] || fail "发现已有 .env；为避免覆盖配置，请使用更新命令或在全新目录安装。"
        install_dependencies
        permissions
        php_run artisan xboard:install
        php_run -r 'require "vendor/autoload.php"; $e=Dotenv\Dotenv::parse(file_get_contents(".env")); if (!filter_var($e["INSTALLED"]??false, FILTER_VALIDATE_BOOLEAN)) {fwrite(STDERR,"安装未完成，请检查上面的错误\n");exit(1);}'
        php_run artisan storage:link
        php_run artisan optimize:clear
        permissions
        echo "安装完成。请按 docs/zh-CN/aapanel.md 配置 Nginx、Horizon 和每分钟定时任务。"
        return
    fi
    [[ -s .env && -f vendor/autoload.php ]] || fail "找不到已安装站点的 .env 或 vendor，请先安装。"
    [[ "$(git_run branch --show-current)" == main ]] || fail "线上站点必须使用 main 分支。"
    case "$(git_run config --get remote.origin.url)" in
        https://github.com/hainiu6/xboard|https://github.com/hainiu6/xboard.git|git@github.com:hainiu6/xboard.git) ;;
        *) fail "origin 必须指向 https://github.com/hainiu6/xboard.git。";;
    esac
    git_run diff --quiet && git_run diff --cached --quiet || fail "有未提交的代码修改，请先保存到 GitHub 再更新。"
    git_run fetch origin main
    local target
    target="$(git_run rev-parse refs/remotes/origin/main)"
    git_run merge-base --is-ancestor HEAD "$target" || fail "本地与 origin/main 分叉，停止更新。"
    command -v mysqldump >/dev/null || fail "找不到 mysqldump，请安装 MySQL 客户端。"
    backup
    php_run artisan down --retry=60
    MAINTENANCE=1
    php_run artisan horizon:pause
    git_run merge --ff-only "$target"
    install_dependencies
    php_run artisan optimize:clear
    # The upstream xboard:update command does not propagate migrate's failure code.
    php_run artisan migrate --force
    php_run artisan xboard:update
    php_run artisan queue:restart
    php_run artisan horizon:terminate
    if [[ "${OCTANE_ENABLED:-0}" == 1 ]]; then php_run artisan octane:reload; fi
    permissions
    php_run artisan up
    MAINTENANCE=0
    echo "更新完成：$(git_run rev-parse --short HEAD)。备份目录：$BACKUP_DIR"
    echo "如运行了可选 WebSocket 服务，请在 aaPanel Supervisor 中重启 Xboard-WS。"
}
main "$@"
