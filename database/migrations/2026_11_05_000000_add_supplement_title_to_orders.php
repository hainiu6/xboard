<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('v2_supplement_product', function (Blueprint $table) {
            $table->id();
            $table->char('code', 32)->unique();
            $table->string('title', 100);
            $table->unsignedInteger('amount');
            $table->unsignedInteger('created_at');
            $table->unsignedInteger('updated_at');
        });
        Schema::table('v2_order', function (Blueprint $table) {
            $table->string('supplement_title', 100)->nullable();
            $table->unsignedBigInteger('supplement_product_id')->nullable();
            $table->index(['user_id', 'supplement_product_id']);
        });
    }

    public function down(): void
    {
        Schema::table('v2_order', function (Blueprint $table) {
            $table->dropIndex(['user_id', 'supplement_product_id']);
            $table->dropColumn(['supplement_title', 'supplement_product_id']);
        });
        Schema::dropIfExists('v2_supplement_product');
    }
};
