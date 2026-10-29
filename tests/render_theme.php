<?php
// Render the real Blade views without a database or a running application.
require dirname(__DIR__) . '/vendor/autoload.php';

use Illuminate\Events\Dispatcher;
use Illuminate\Filesystem\Filesystem;
use Illuminate\Foundation\Application;
use Illuminate\View\Compilers\BladeCompiler;
use Illuminate\View\Engines\CompilerEngine;
use Illuminate\View\Engines\EngineResolver;
use Illuminate\View\Factory;
use Illuminate\View\FileViewFinder;

$root = dirname(__DIR__);
$app = new Application($root);
$files = new Filesystem();
$cache = sys_get_temp_dir() . '/xboard-theme-' . bin2hex(random_bytes(5));
$files->makeDirectory($cache);
try {
    $compiler = new BladeCompiler($files, $cache);
    $resolver = new EngineResolver();
    $resolver->register('blade', fn () => new CompilerEngine($compiler));
    $finder = new FileViewFinder($files, []);
    $finder->addNamespace('theme', $root . '/theme');
    $factory = new Factory($resolver, $finder, new Dispatcher($app));
    $factory->setContainer($app);
    $app->instance('view', $factory);
    $data = [
        'title' => "126 ' </script><script>alert(1)</script>",
        'description' => 'Theme rendering check',
        'theme' => 'Xboard',
        'version' => 'test',
        'logo' => null,
        'theme_config' => [],
    ];
    $html = $factory->make('theme::Xboard.dashboard', $data)->render();
    foreach (['id="site-home"', 'id="auth-story"', 'id="app"', 'href="/#/login"', 'href="/#/register"', '/assets/126/theme.css?v=', '/assets/126/home.css?v=', 'class="hn-hero hn-container"'] as $required) {
        if (!str_contains($html, $required)) {
            throw new RuntimeException('Missing rendered element: ' . $required);
        }
    }
    if (str_contains($html, '<script>alert(1)</script>')) {
        throw new RuntimeException('Site title was not safely escaped.');
    }
    if (str_contains($html, 'type="module" crossorigin src="/theme/')) {
        throw new RuntimeException('The homepage must not boot the SPA before login.');
    }
    echo "Blade theme rendering and settings escaping passed.\n";
} finally {
    $files->deleteDirectory($cache);
}
