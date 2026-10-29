<?php
// Verify real theme copying without a database, Redis or production files.
$settings = [];
function admin_setting($key = null, $default = null) {
    global $settings;
    if (is_array($key)) { $settings = array_merge($settings, $key); return ''; }
    return $settings[$key] ?? $default;
}
require dirname(__DIR__) . '/vendor/autoload.php';

use App\Services\ThemeService;
use Illuminate\Cache\ArrayStore;
use Illuminate\Cache\Repository;
use Illuminate\Filesystem\Filesystem;
use Illuminate\Foundation\Application;
use Illuminate\Support\Facades\Facade;

$root = sys_get_temp_dir() . '/xboard-publish-' . bin2hex(random_bytes(5));
$files = new Filesystem();
$files->makeDirectory($root . '/theme/Xboard/assets', 0755, true);
$files->makeDirectory($root . '/public/theme/Xboard/assets', 0755, true);
$files->put($root . '/theme/Xboard/assets/umi.js', 'new-catalog-bridge');
$files->put($root . '/public/theme/Xboard/assets/umi.js', 'old-bundle');
$app = new Application($root);
Facade::setFacadeApplication($app);
$app->instance('files', $files);
$app->instance('cache', new Repository(new ArrayStore()));
$app->instance('view', new class {
    public function addNamespace(...$args) { return $this; }
    public function prependNamespace(...$args) { return $this; }
});
$app->instance('log', new class {
    public function info(...$args) {}
    public function warning(...$args) {}
    public function error(...$args) {}
});
try {
    $service = new ThemeService();
    if (!$service->refreshCurrentTheme() || $files->get($root . '/public/theme/Xboard/assets/umi.js') !== 'new-catalog-bridge') {
        throw new RuntimeException('A fresh installation did not publish the default frontend.');
    }
    if (($settings['current_theme'] ?? null) !== 'Xboard') {
        throw new RuntimeException('The published theme was not recorded.');
    }
    $files->makeDirectory($root . '/storage/theme/Custom/assets', 0755, true);
    $files->put($root . '/storage/theme/Custom/assets/umi.js', 'custom-frontend');
    $settings = ['frontend_theme' => 'Custom', 'current_theme' => 'Xboard'];
    if (!$service->refreshCurrentTheme() || $files->get($root . '/public/theme/Custom/assets/umi.js') !== 'custom-frontend') {
        throw new RuntimeException('The configured frontend theme was not published.');
    }
    $settings = ['frontend_theme' => 'Missing'];
    if ($service->refreshCurrentTheme() !== false) {
        throw new RuntimeException('Missing theme source was reported as a successful publication.');
    }
    echo "Fresh/default/custom frontend publication and missing-source failure checks passed.\n";
} finally {
    $files->deleteDirectory($root);
}
