<?php

namespace App\Http\Controllers\V1\User;

use App\Http\Controllers\Controller;
use App\Models\Notice;
use Illuminate\Http\Request;

class NoticeController extends Controller
{
    public function fetch(Request $request)
    {
        $request->validate(['page' => 'nullable|string|in:' . implode(',', Notice::DISPLAY_PAGES)]);
        $page = $request->input('page') ?: 'dashboard';
        $res = Notice::displayedOn($page)->orderBy('sort', 'ASC')
            ->orderBy('id', 'DESC')
            ->where('show', true)
            ->limit(1)
            ->get();
        return response([
            'data' => $res,
            'total' => $res->count()
        ]);
    }
}
