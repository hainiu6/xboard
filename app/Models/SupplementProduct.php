<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class SupplementProduct extends Model
{
    protected $table = 'v2_supplement_product';
    protected $dateFormat = 'U';
    protected $fillable = ['code', 'title', 'amount'];
    protected $casts = ['amount' => 'integer'];

    public function orders(): HasMany
    {
        return $this->hasMany(Order::class, 'supplement_product_id');
    }

    public function currentOrder(int $userId): ?Order
    {
        return $this->orders()->where('user_id', $userId)
            ->whereIn('status', [Order::STATUS_PENDING, Order::STATUS_COMPLETED])
            ->orderByDesc('status')->latest('id')->first();
    }

    public function paymentPath(): string
    {
        return '/#/supplement/' . $this->code;
    }
}
