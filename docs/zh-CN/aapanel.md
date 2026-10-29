# aaPanel 原生安装、更新与本地开发

本仓库：<https://github.com/hainiu6/xboard>；发布分支：`main`。
上游：<https://github.com/cedar2025/Xboard>，已保留源码历史和 MIT 许可。

适用于 **全新 Xboard 站点**：Nginx + PHP-FPM + MySQL + Redis，不使用 Docker。
已有 V2board 或旧版本 Xboard 站点，必须先按其版本的迁移文档处理，不能直接执行首次安装命令覆盖。

## 1. 在 aaPanel 准备环境

- 安装 Nginx、MySQL、Redis、PHP；PHP 最低为 **8.2.35**，建议将所用版本更新至当前安全补丁。
- 在 PHP 扩展中安装/启用 `curl`、`ctype`、`dom`、`fileinfo`、`mbstring`、`openssl`、`pcntl`、`pdo_mysql`、`posix`、`redis`、`tokenizer`、`xml`、`zip`。内置扩展不需要重复安装。
- 在“禁用函数”中移除 `putenv`、`proc_open`、`pcntl_alarm`、`pcntl_signal`。
- PHP-FPM、命令行、Supervisor、定时任务使用相同 PHP 版本。默认脚本优先选 `/www/server/php/82/bin/php`，也可用 `PHP_BIN` 指定其他版本。
- 安装 Git、curl、tar、gzip、flock（通常来自 util-linux）及 `mysqldump`。脚本自动把 `/www/server/mysql/bin` 加入 PATH。
- 创建网站、MySQL 数据库及专用数据库用户，记录账号密码；确认 Redis 正在运行。
- 为网站绑定域名和 HTTPS。安装器会交互询问数据库、Redis、管理员邮箱，并生成管理员密码。

## 2. 首次安装

在 aaPanel 服务器终端执行。把 `panel.example.com` 换成自己的域名；目标目录必须不存在。
如果 aaPanel 已建立目录，先将默认占位目录改名保存，再克隆到原路径；不要清空已有业务站点。

```bash
git clone --recurse-submodules --branch main https://github.com/hainiu6/xboard.git /www/wwwroot/panel.example.com
cd /www/wwwroot/panel.example.com
PHP_BIN=/www/server/php/82/bin/php bash init.sh
```

这一组命令会安装锁定的 Composer 依赖、拉取管理员前端子模块，并运行官方交互安装器。
数据库类型选择 **MySQL**。Redis 通常填 `127.0.0.1`、`6379`，密码按实际配置填写。保存终端输出的管理员密码和后台地址。
安装后编辑 `.env` 的 `APP_URL=https://你的域名`，保留生成的 `APP_KEY`，再执行：

```bash
/www/server/php/82/bin/php artisan optimize:clear
```

安装脚本遇到非空 `.env` 会停止，以免重新安装覆盖现有配置。
它只会调整运行目录及 `.env` 权限，不会修改 MySQL、Nginx、其他网站或 aaPanel 配置。

## 3. Nginx 设置

在 aaPanel 网站设置中：

1. 网站目录选择 `/www/wwwroot/panel.example.com`，运行目录选择 `/public`。
2. PHP 版本选择与命令行相同的版本，关闭“防跨站攻击（open_basedir）”对 Laravel 父目录访问的限制，或在 PHP 配置中允许本网站根目录。
3. 在该网站“伪静态”中填写以下规则，使用正常 PHP-FPM 模式，不配置反向代理：

```nginx
location / {
    try_files $uri $uri/ /index.php$is_args$query_string;
}
```

保留 aaPanel 生成的 PHP 配置引用和敏感文件拦截规则。保存后检查 Nginx 配置并重载。

## 4. Horizon 队列与定时任务（必须配置）

在 aaPanel 安装 Supervisor，添加一个守护进程：

| 项目 | 值 |
| --- | --- |
| 名称 | Xboard-Horizon |
| 运行用户 | www |
| 工作目录 | /www/wwwroot/panel.example.com |
| 启动命令 | /www/server/php/82/bin/php /www/wwwroot/panel.example.com/artisan horizon |
| 进程数量 | 1 |
| 自动重启 | 开启 |

在 aaPanel 计划任务中添加 Shell 任务，用户 `www`，每分钟执行一次：

```bash
cd /www/wwwroot/panel.example.com && /www/server/php/82/bin/php artisan schedule:run >> /dev/null 2>&1
```

PHP-FPM 部署不需要 Octane 或 Swoole。若后续自行启用 Octane，需另装 Swoole、配置 Supervisor 和 Nginx 反向代理；更新时设置 `OCTANE_ENABLED=1`。
可选 WebSocket 服务命令为 `php artisan ws-server start`，按上游文档单独配置；更新后手动重启该守护进程。

## 5. 后续线上更新（一条命令）

先在本地修改代码并推送到自己的 GitHub `main`，然后在服务器执行：

```bash
cd /www/wwwroot/panel.example.com && PHP_BIN=/www/server/php/82/bin/php bash update.sh
```

更新脚本会：

- 检查环境、部署分支、仓库地址及未提交修改，使用进程锁防止重复执行。
- 仅拉取 **hainiu6/xboard 的 main**，仅允许快进更新；不执行强制重置或 `composer update`。
- 在网站目录之外保存代码、`.env`、上传内容、主题及插件，并使用 `mysqldump` 备份 MySQL；备份失败即停止。
- 开启维护模式并暂停 Horizon，然后更新代码、按 `composer.lock` 安装依赖、同步前端子模块、执行数据库迁移并清理缓存。
- 通知 Horizon/队列重启，由 Supervisor 自动拉起，最后退出维护模式。

备份默认位于 `/www/backup/xboard/站点名-时间-进程号/`，包含 `site.tar.gz`、`database.sql.gz`、`commit.txt`。
脚本保留备份，不自动清理；自行定期备份到其他设备并管理磁盘空间。可设置 `BACKUP_ROOT=/其他/非网站目录`。
备份不包含 `.git`、`vendor`、日志和框架缓存；恢复时需按 `commit.txt` 获取对应代码并重新安装依赖。
更新期间 Horizon 已经在运行的任务可能继续完成；流量繁忙时应在维护窗口更新，并在 aaPanel 等待队列完成后再执行。

若依赖安装或迁移失败，脚本停止并保留维护状态。检查输出及 `storage/logs`，修复原因后重新执行更新命令。
涉及数据库变更的恢复需同时恢复旧代码、`.env`、上传文件及 `database.sql.gz`，不要仅回退 Git 提交。
确认应用已恢复后，可执行 `php artisan horizon:continue`、`php artisan horizon:terminate`、`php artisan up`。
本脚本不自动还原数据库，避免覆盖更新后产生的数据。

检查环境可单独运行：

```bash
PHP_BIN=/www/server/php/82/bin/php bash scripts/aapanel.sh check
```

## 6. 本地修改并提交到自己的 GitHub

已建立的本地目录：`/Users/a/Documents/ChatGPT/开发/Xboard`。

```bash
cd /Users/a/Documents/ChatGPT/开发/Xboard
git status
# 修改代码后，只添加本次需要提交的文件
git add 文件路径
git commit -m "说明本次修改"
git push origin main
```

`origin` 指向你的仓库；`upstream` 指向原作者仓库。`.env`、运行数据和 Composer 工具文件不应提交。
管理员前端是 `public/assets/admin` 子模块，指向原作者已编译资源；修改它需另建自己的前端源码/子模块仓库。
PHP 后端、模板和其他主仓库文件可直接修改提交。

主动合并上游代码时，在本地建立分支、检查冲突和部署脚本，不要让线上服务器直接拉上游：

```bash
git fetch upstream
git switch -c codex/sync-upstream
git merge upstream/master
# 解决冲突、检查本仓库的部署脚本并验证后，合并到 main 再推送
```

## 7. 验证边界

交付时完成脚本语法和隔离流程检查，未连接或安装到你的线上服务器。
首次部署后需实际验证登录、管理员页面、数据库连接、Redis、Horizon、定时任务，以及一次完整更新流程。
