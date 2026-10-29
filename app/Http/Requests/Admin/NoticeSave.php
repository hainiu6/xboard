<?php

namespace App\Http\Requests\Admin;

use Illuminate\Foundation\Http\FormRequest;

class NoticeSave extends FormRequest
{
    /**
     * Get the validation rules that apply to the request.
     *
     * @return array
     */
    public function rules()
    {
        return [
            'title' => 'required',
            'content' => 'required',
            'img_url' => 'nullable|url',
            'tags' => 'nullable|array',
            'display_pages' => 'nullable|array',
            'display_pages.*' => 'required|string|distinct|in:' . implode(',', \App\Models\Notice::DISPLAY_PAGES),
        ];
    }

    public function messages()
    {
        return [
            'title.required' => '标题不能为空',
            'content.required' => '内容不能为空',
            'img_url.url' => '图片URL格式不正确',
            'tags.array' => '标签格式不正确',
            'display_pages.array' => '显示页面格式不正确',
            'display_pages.*.in' => '请选择有效的公告显示页面',
        ];
    }
}
