<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('v2_order', function (Blueprint $table) {
            $table->uuid('checkout_token')->nullable();
            $table->unique(['user_id', 'checkout_token']);
        });
    }

    public function down(): void
    {
        Schema::table('v2_order', function (Blueprint $table) {
            $table->dropUnique(['user_id', 'checkout_token']);
            $table->dropColumn('checkout_token');
        });
    }
};
