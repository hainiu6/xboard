<?php
// Fail on backup errors; the upstream backup:database command catches them and returns success.
use Illuminate\Contracts\Console\Kernel;
use Spatie\DbDumper\Databases\MySql;

require dirname(__DIR__) . '/vendor/autoload.php';
try {
    $app = require dirname(__DIR__) . '/bootstrap/app.php';
    $app->make(Kernel::class)->bootstrap();
    if (config('database.default') !== 'mysql') {
        throw new RuntimeException('此 aaPanel 更新脚本仅支持 MySQL。');
    }
    $destination = $argv[1] ?? '';
    if ($destination === '' || file_exists($destination)) {
        throw new RuntimeException('备份目标无效或已经存在。');
    }
    $config = config('database.connections.mysql');
    $dumper = MySql::create()
        ->setHost($config['host'])
        ->setPort((int) $config['port'])
        ->setDbName($config['database'])
        ->setUserName($config['username'])
        ->setPassword($config['password'] ?? '')
        ->useSingleTransaction();
    if (!empty($config['unix_socket'])) {
        $dumper->setSocket($config['unix_socket']);
    }
    $dumper->dumpToFile($destination);
    if (!is_file($destination) || filesize($destination) === 0) {
        throw new RuntimeException('数据库备份文件为空。');
    }
    chmod($destination, 0600);
    echo "MySQL 备份成功。\n";
} catch (Throwable $error) {
    // Do not print connection details or dump commands, which may contain credentials.
    fwrite(STDERR, 'MySQL 备份失败（' . get_class($error) . '），请检查数据库连接、磁盘空间和 mysqldump 权限。' . PHP_EOL);
    exit(1);
}
