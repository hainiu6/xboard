<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('v2_notice', function (Blueprint $table) {
            $table->json('display_pages')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('v2_notice', function (Blueprint $table) {
            $table->dropColumn('display_pages');
        });
    }
};
