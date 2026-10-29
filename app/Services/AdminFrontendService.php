<?php

namespace App\Services;

use RuntimeException;

class AdminFrontendService
{
    /** Build a versioned entry without changing the upstream admin Git submodule. */
    public function entry(string $entry): string
    {
        $sourcePath = public_path('assets/admin/' . $entry);
        $patchPath = resource_path('ui/admin-notice-bridge.json');
        $fieldPath = public_path('assets/126/admin-notice.js');
        if (!is_file($sourcePath) || !is_file($patchPath) || !is_file($fieldPath)) {
            throw new RuntimeException('公告管理前端文件不完整，请重新更新代码。');
        }
        $key = substr(hash('sha256', hash_file('sha256', $sourcePath)
            . hash_file('sha256', $patchPath) . hash_file('sha256', $fieldPath)
            . hash_file('sha256', __FILE__)), 0, 20);
        $url = '/theme/126-admin/admin-app.' . $key . '.js';
        $target = public_path(ltrim($url, '/'));
        if (is_file($target)) {
            return $url;
        }

        $source = file_get_contents($sourcePath);
        $patch = json_decode(file_get_contents($patchPath), true, 512, JSON_THROW_ON_ERROR);
        $start = strpos($source, $patch['start']);
        $end = $start === false ? false : strpos($source, $patch['end'], $start);
        if ($start === false || $end === false) {
            throw new RuntimeException('后台前端已变化，无法定位公告表单，请检查前端桥接。');
        }
        $form = substr($source, $start, $end - $start);
        foreach ($patch['replacements'] as [$old, $new]) {
            if (substr_count($form, $old) !== 1) {
                throw new RuntimeException('后台公告表单已变化，请检查前端桥接。');
            }
            $form = str_replace($old, $new, $form);
        }
        $source = substr($source, 0, $start) . $form . substr($source, $end);
        // Moving the entry must not move its original worker/lazy-asset base URL.
        $originalUrl = json_encode('/assets/admin/' . $entry, JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
        $source = str_replace('import.meta.url', 'new URL(' . $originalUrl . ',window.location.origin).href', $source);
        $fieldVersion = substr(hash_file('sha256', $fieldPath), 0, 12);
        $source = 'import{noticePageField as renderNoticePages}from"/assets/126/admin-notice.js?v=' . $fieldVersion . '";' . $source;

        $directory = dirname($target);
        if (!is_dir($directory) && !mkdir($directory, 0755, true) && !is_dir($directory)) {
            throw new RuntimeException('无法创建后台前端目录。');
        }
        $temporary = tempnam($directory, '.admin-');
        try {
            if ($temporary === false || file_put_contents($temporary, $source, LOCK_EX) === false) {
                throw new RuntimeException('无法写入后台前端文件。');
            }
            chmod($temporary, 0644);
            if (!rename($temporary, $target)) {
                throw new RuntimeException('无法发布后台前端文件。');
            }
        } finally {
            if ($temporary !== false && is_file($temporary)) {
                unlink($temporary);
            }
        }
        return $url;
    }
}
