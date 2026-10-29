<?php
require dirname(__DIR__) . '/vendor/autoload.php';

use App\Services\AdminFrontendService;
use Illuminate\Filesystem\Filesystem;
use Illuminate\Foundation\Application;

$sourceRoot = dirname(__DIR__);
$root = sys_get_temp_dir() . '/xboard-admin-' . bin2hex(random_bytes(5));
$files = new Filesystem();
$files->makeDirectory($root . '/public/assets/admin/assets', 0755, true);
$files->makeDirectory($root . '/public/assets/126', 0755, true);
$files->makeDirectory($root . '/resources/frontend', 0755, true);
$manifest = json_decode(file_get_contents($sourceRoot . '/public/assets/admin/manifest.json'), true);
$entry = $manifest['index.html']['file'];
$files->copy($sourceRoot . '/public/assets/admin/' . $entry, $root . '/public/assets/admin/' . $entry);
$files->copy($sourceRoot . '/public/assets/126/admin-notice.js', $root . '/public/assets/126/admin-notice.js');
$files->copy($sourceRoot . '/resources/frontend/admin-notice-bridge.json', $root . '/resources/frontend/admin-notice-bridge.json');
$app = new Application($root);
try {
    $original = hash_file('sha256', public_path('assets/admin/' . $entry));
    $service = new AdminFrontendService();
    $url = $service->entry($entry);
    $compiled = file_get_contents(public_path(ltrim($url, '/')));
    foreach (['name:"display_pages"', 'display_pages:gy(cy()).nullable().optional()', 'renderNoticePages(Q,e)', '/assets/126/admin-notice.js?v=', 'new URL("/assets/admin/' . $entry . '",window.location.origin).href'] as $required) {
        if (!str_contains($compiled, $required)) throw new RuntimeException('Missing admin integration: ' . $required);
    }
    if (str_contains($compiled, 'import.meta.url')) throw new RuntimeException('Worker asset base was not preserved.');
    if (hash_file('sha256', public_path('assets/admin/' . $entry)) !== $original) throw new RuntimeException('Upstream admin source was modified.');
    if ($service->entry($entry) !== $url) throw new RuntimeException('Cached asset was not reused.');
    file_put_contents(public_path('assets/126/admin-notice.js'), "\n// new field version", FILE_APPEND);
    if ($service->entry($entry) === $url) throw new RuntimeException('Field update did not invalidate the cache.');
    file_put_contents(public_path('assets/admin/' . $entry), 'invalid upstream component');
    try {
        $service->entry($entry);
        throw new LogicException('Changed upstream boundary was accepted.');
    } catch (RuntimeException $expected) {
    }
    echo "Admin form integration, worker URLs, cache invalidation and upstream isolation passed.\n";
} finally {
    $files->deleteDirectory($root);
}
