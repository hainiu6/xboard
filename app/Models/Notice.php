<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Notice extends Model
{
    public const DISPLAY_PAGES = ['dashboard', 'plan', 'order', 'knowledge', 'profile', 'invite', 'ticket', 'traffic'];

    protected $table = 'v2_notice';
    protected $dateFormat = 'U';
    protected $guarded = ['id'];
    // Explicit fields also work if a long-running process cached the old schema
    // before the display_pages migration was applied.
    protected $fillable = ['title', 'content', 'img_url', 'tags', 'show', 'popup', 'sort', 'display_pages'];
    protected $casts = [
        'created_at' => 'timestamp',
        'updated_at' => 'timestamp',
        'tags' => 'array',
        'show' => 'boolean',
        'display_pages' => 'array',
    ];

    public function scopeDisplayedOn($query, string $page)
    {
        return $query->where(function ($query) use ($page) {
            $query->whereJsonContains('display_pages', $page);
            // Existing announcements keep their original dashboard-only placement.
            if ($page === 'dashboard') {
                $query->orWhereNull('display_pages');
            }
        });
    }
}
