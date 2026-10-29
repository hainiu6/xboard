<?php
// Real SQLite queries and validation, with no production database or credentials.
require dirname(__DIR__) . '/vendor/autoload.php';

use App\Http\Controllers\V1\User\NoticeController;
use App\Http\Requests\Admin\NoticeSave;
use App\Models\Notice;
use Illuminate\Database\Capsule\Manager as Capsule;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Foundation\Application;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Facade;
use Illuminate\Translation\ArrayLoader;
use Illuminate\Translation\Translator;
use Illuminate\Validation\Factory;
use Illuminate\Validation\ValidationException;

$app = new Application(dirname(__DIR__));
Facade::setFacadeApplication($app);
$db = new Capsule($app);
$db->addConnection(['driver' => 'sqlite', 'database' => ':memory:', 'prefix' => '']);
$db->setAsGlobal();
$db->bootEloquent();
$app->instance('db', $db->getDatabaseManager());
$app->bind('db.schema', fn () => $db->schema());
$validator = new Factory(new Translator(new ArrayLoader(), 'zh-CN'), $app);
Request::macro('validate', function (array $rules) use ($validator) {
    return $validator->make($this->all(), $rules)->validate();
});
$app->instance(\Illuminate\Contracts\Routing\ResponseFactory::class, new class {
    public function make($content = '', $status = 200, array $headers = []) { return new Response($content, $status, $headers); }
});
$db->schema()->create('v2_notice', function (Blueprint $table) {
    $table->increments('id'); $table->integer('sort')->nullable();
    $table->string('title'); $table->text('content'); $table->boolean('show')->default(false);
    $table->text('tags')->nullable(); $table->string('img_url')->nullable();
    $table->integer('created_at')->nullable(); $table->integer('updated_at')->nullable();
});
$legacy = Notice::create(['title' => '旧公告', 'content' => '保留原内容', 'show' => true, 'sort' => 5]);
$migration = require dirname(__DIR__) . '/database/migrations/2026_10_29_120000_add_display_pages_to_v2_notice.php';
$migration->up();
function check($value, $message) { if (!$value) throw new RuntimeException($message); }
$fetch = function (?string $page = null) {
    $response = (new NoticeController())->fetch(Request::create('/user/notice/fetch', 'GET', $page === null ? [] : ['page' => $page]));
    return json_decode($response->getContent(), true);
};
check($fetch()['data'][0]['title'] === '旧公告', 'Legacy notice must retain its dashboard placement.');
check($fetch('plan')['data'] === [], 'Legacy notice must not appear on purchase pages.');
check(Notice::find($legacy->id)->content === '保留原内容', 'Migration changed existing content.');
Notice::create(['title' => '隐藏公告', 'content' => '不可见', 'show' => false, 'sort' => 0, 'display_pages' => ['dashboard', 'plan']]);
Notice::create(['title' => '未勾选页面', 'content' => '不可见', 'show' => true, 'sort' => 0, 'display_pages' => []]);
$notice = Notice::create(['title' => '第一条', 'content' => '**直接展示内容**', 'show' => true, 'sort' => 1, 'display_pages' => ['plan', 'order']]);
Notice::create(['title' => '第二条', 'content' => '不展示', 'show' => true, 'sort' => 2, 'display_pages' => ['plan']]);
$actual = $fetch('plan');
check($actual['total'] === 1 && $actual['data'][0]['id'] === $notice->id, 'Only the first enabled matching notice should be returned: ' . json_encode(['actual' => $actual, 'expected_id' => $notice->id, 'records' => Notice::all()->toArray()], JSON_UNESCAPED_UNICODE));
check($fetch('order')['data'][0]['content'] === '**直接展示内容**', 'Selected pages lost notice content.');
check($fetch('ticket')['data'] === [], 'Notice leaked to an unselected page.');
$notice->update(['display_pages' => []]);
check($fetch('order')['data'] === [], 'Clearing all pages must hide the notice.');
check($fetch('plan')['data'][0]['title'] === '第二条', 'The next eligible notice was not selected.');
try { $fetch('not-a-page'); throw new RuntimeException('Invalid page accepted.'); } catch (ValidationException $expected) {}
$rules = (new NoticeSave())->rules();
foreach ([['plan', 'order'], [], null] as $selection) {
    check(!$validator->make(['title' => '测试', 'content' => '内容', 'display_pages' => $selection], $rules)->fails(), 'Valid selection rejected.');
}
foreach ([['admin'], ['plan', 'plan'], 'plan'] as $selection) {
    check($validator->make(['title' => '测试', 'content' => '内容', 'display_pages' => $selection], $rules)->fails(), 'Invalid selection accepted.');
}
echo "Notice migration, visibility, first-item ordering and page validation passed.\n";
