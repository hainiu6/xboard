<?php

namespace App\Http\Controllers\V1\Guest;

use App\Http\Controllers\Controller;
use App\Models\Order;
use App\Services\OrderService;
use App\Services\PaymentService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use App\Services\Plugin\HookManager;

class PaymentController extends Controller
{
    public function notify($method, $uuid, Request $request)
    {
        HookManager::call('payment.notify.before', [$method, $uuid, $request]);
        try {
            $paymentService = new PaymentService($method, null, $uuid);
            $verify = $paymentService->notify($request->input());
            if (!$verify) {
                HookManager::call('payment.notify.failed', [$method, $uuid, $request]);
                return $this->fail([422, 'verify error']);
            }
            HookManager::call('payment.notify.verified', $verify);
            if (!$this->handle($verify['trade_no'], $verify['callback_no'], $paymentService->paymentId(), $verify['settled_amount'] ?? null)) {
                return $this->fail([400, 'handle error']);
            }
            return (isset($verify['custom_result']) ? $verify['custom_result'] : 'success');
        } catch (\Exception $e) {
            Log::error($e);
            return $this->fail([500, 'fail']);
        }
    }

    private function handle($tradeNo, $callbackNo, int $paymentId, mixed $settledAmount): bool
    {
        $order = Order::where('trade_no', $tradeNo)->first();
        if (!$order) {
            return false;
        }
        if ($order->isSupplement()) {
            $expected = (int) $order->total_amount + (int) $order->handling_amount;
            if ((int) $order->payment_id !== $paymentId
                || (!is_string($settledAmount) && !is_int($settledAmount))
                || !preg_match('/\A([0-9]{1,9})(?:\.([0-9]{1,2}))?\z/', (string) $settledAmount, $parts)
                || (int) $parts[1] * 100 + (int) str_pad($parts[2] ?? '', 2, '0') !== $expected) {
                return false;
            }
            return (new OrderService($order))->paid($callbackNo);
        }
        if ($order->status !== Order::STATUS_PENDING)
            return true;
        $orderService = new OrderService($order);
        if (!$orderService->paid($callbackNo)) {
            return false;
        }

        HookManager::call('payment.notify.success', $order);
        return true;
    }
}
