<?php
// Exercise the real controllers and signed EPay callbacks against an isolated database.
require dirname(__DIR__) . '/vendor/autoload.php';
require dirname(__DIR__) . '/plugins-core/Epay/Plugin.php';

use App\Http\Controllers\V1\Guest\PaymentController;
use App\Http\Controllers\V1\User\OrderController;
use App\Http\Controllers\V2\Admin\OrderController as AdminOrders;
use App\Models\Order;
use App\Models\Payment;
use App\Models\User;
use App\Services\OrderService;
use App\Services\Plugin\PluginManager;
use App\Services\UserService;
use Illuminate\Database\Capsule\Manager as Capsule;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Foundation\Application;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Facade;
use Illuminate\Translation\ArrayLoader;
use Illuminate\Translation\Translator;
use Illuminate\Validation\Factory;
use Plugin\Epay\Plugin;

$app = new Application(dirname(__DIR__));
Facade::setFacadeApplication($app);
$db = new Capsule($app);
$db->addConnection(['driver' => 'sqlite', 'database' => ':memory:']);
$db->setAsGlobal();
$db->bootEloquent();
$app->instance('db', $db->getDatabaseManager());
$app->bind('db.schema', fn () => $db->schema());
$app->instance('translator', $translator = new Translator(new ArrayLoader(), 'en'));
$app->instance('log', new \Psr\Log\NullLogger());
$validator = new Factory($translator, $app);
Request::macro('validate', function (array $rules) use ($validator) {
    return $validator->make($this->all(), $rules)->validate();
});
$app->instance(\Illuminate\Contracts\Routing\ResponseFactory::class, new class {
    public function json($data, $status) { return new JsonResponse($data, $status); }
});

$db->schema()->create('v2_user', function (Blueprint $table) {
    $table->id();
    $table->string('email');
    $table->boolean('banned')->default(false);
    $table->integer('plan_id')->default(9);
    $table->integer('expired_at')->default(1234567890);
    $table->integer('balance')->default(0);
    $table->integer('created_at');
    $table->integer('updated_at');
});
$db->schema()->create('v2_order', function (Blueprint $table) {
    $table->id();
    $table->integer('user_id');
    $table->integer('plan_id');
    $table->integer('payment_id')->nullable();
    $table->string('period');
    $table->integer('type');
    $table->integer('status');
    $table->string('trade_no')->unique();
    $table->integer('total_amount');
    $table->integer('handling_amount')->nullable();
    $table->integer('paid_at')->nullable();
    $table->string('callback_no')->nullable();
    $table->integer('created_at');
    $table->integer('updated_at');
});
$db->schema()->create('v2_payment', function (Blueprint $table) {
    $table->id();
    $table->string('uuid')->unique();
    $table->string('payment');
    $table->boolean('enable');
    $table->text('config');
    $table->integer('created_at');
    $table->integer('updated_at');
});
$migration = require dirname(__DIR__) . '/database/migrations/2026_11_05_000000_add_supplement_title_to_orders.php';
$migration->up();

$plugin = new Plugin('epay');
$plugin->boot();
$app->instance(PluginManager::class, new class($plugin) extends PluginManager {
    public function __construct(private Plugin $plugin) {}
    public function getEnabledPaymentPlugins(): array { return [$this->plugin]; }
});
$gateway = ['payment' => 'EPay', 'enable' => true, 'config' => ['key' => 'test-secret', 'pid' => '123']];
$primary = Payment::create(['uuid' => 'primary', ...$gateway]);
Payment::create(['uuid' => 'other', ...$gateway]);
$first = User::create(['email' => 'first@example.test']);
$second = User::create(['email' => 'second@example.test']);
$admin = new AdminOrders();
$users = new OrderController();
$payments = new PaymentController();
$data = fn (JsonResponse $response) => $response->getData(true)['data'];
$check = function (bool $ok, string $message) { if (!$ok) throw new RuntimeException($message); };
$request = function (User $user, array $input = []) {
    return Request::create('/', 'POST', $input)->setUserResolver(fn () => $user);
};
$makeProduct = fn (string $amount) => $admin->supplement(Request::create('/', 'POST', ['title' => '补差价', 'amount' => $amount]));
$check($makeProduct('0')->getStatusCode() === 422, 'A free supplement product was accepted.');
$product = $data($makeProduct('25.09'));
$check($product['amount'] === 2509 && count($data($admin->supplementProducts())) === 1, 'Admin amount or listing is incorrect.');
$check(preg_match('~^/#/supplement/[a-f0-9]{32}$~', $product['payment_path']) === 1, 'Admin link is invalid.');
$code = basename($product['payment_path']);
$one = $data($users->orderSupplement($request($first, ['amount' => '0.01', 'user_id' => $second->id]), $code));
$two = $data($users->orderSupplement($request($second), $code));
$check($one !== $two && Order::count() === 2, 'The same link did not give two users their own orders.');
$check($data($users->orderSupplement($request($first), $code)) === $one, 'A retry duplicated an unpaid order.');
$check($data($users->supplementProduct($request($second), $code))['trade_no'] === $two, 'The link leaked another user’s order.');
$check($users->check($request($second, ['trade_no' => $one]))->getStatusCode() === 400, 'Another user could read the order.');
$check(!(new UserService())->isNotCompleteOrderByUserId($first->id), 'Supplement order blocked ordinary purchases.');
$order = Order::where('trade_no', $one)->firstOrFail();
$check($order->total_amount === 2509 && $order->user_id === $first->id, 'Client altered the server amount or order owner.');
$order->update(['payment_id' => $primary->id, 'handling_amount' => 23]);
$check(!(new OrderService($order))->cancel(), 'A payment already sent to a gateway was cancellable.');

$notify = function ($amount, $uuid = 'primary', $secret = 'test-secret') use ($payments, $one) {
    $params = ['pid' => '123', 'trade_status' => 'TRADE_SUCCESS', 'out_trade_no' => $one, 'trade_no' => 'gateway-tx-1', 'money' => $amount];
    ksort($params);
    $params['sign'] = md5(stripslashes(urldecode(http_build_query($params))) . $secret);
    return $payments->notify('EPay', $uuid, Request::create('/', 'POST', $params));
};
$check($notify('25.31')->getStatusCode() === 400, 'A signed callback with the wrong amount was accepted.');
$check($notify('25.32', 'other')->getStatusCode() === 400, 'A callback from the wrong gateway was accepted.');
$check($notify('25.32', 'primary', 'bad-signature')->getStatusCode() === 422, 'An invalid signature was accepted.');
$check($order->refresh()->status === Order::STATUS_PENDING, 'Rejected callbacks changed payment state.');
$check($notify('25.32') === 'success' && $order->refresh()->status === Order::STATUS_COMPLETED, 'Signed exact payment did not settle.');
$paidAt = $order->paid_at;
$check($notify('25.32') === 'success' && $order->refresh()->paid_at === $paidAt, 'Repeated callback was not idempotent.');
$check($data($users->orderSupplement($request($first), $code)) === $one, 'A completed order could be charged again on the same link.');
$check($first->refresh()->plan_id === 9 && $first->expired_at === 1234567890 && $first->balance === 0, 'Payment changed user subscription or balance.');
echo "Reusable product, owner isolation, order retries and signed payment settlement passed.\n";
