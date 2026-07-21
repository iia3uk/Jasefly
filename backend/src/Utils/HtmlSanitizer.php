<?php
declare(strict_types=1);

namespace App\Utils;

/**
 * Server-side HTML sanitizer (defense in depth).
 *
 * Strips dangerous tags and attributes from user-supplied HTML before it is
 * stored or returned. Mirrors the frontend sanitizer so stored content is
 * safe even if a client bypasses the editor.
 */
final class HtmlSanitizer
{
    private const BLOCKED_TAGS = [
        'script', 'iframe', 'object', 'embed', 'form', 'style', 'meta',
        'link', 'base', 'applet', 'frame', 'frameset', 'xml', 'svg',
    ];

    /** Tags whose entire subtree (inner content) is removed, not just the tag. */
    private const DROP_CONTENT_TAGS = ['script', 'style'];

    public static function clean(?string $html): string
    {
        if ($html === null || $html === '') {
            return '';
        }

        // Drop entire subtrees of tags that carry executable content.
        foreach (self::DROP_CONTENT_TAGS as $tag) {
            $html = preg_replace(
                '#<' . $tag . '\b[^>]*>[\s\S]*?</' . $tag . '>#i',
                '',
                $html
            ) ?? $html;
        }

        // Remove blocked tags entirely (keep inner text for non-content tags).
        foreach (self::BLOCKED_TAGS as $tag) {
            if (in_array($tag, self::DROP_CONTENT_TAGS, true)) {
                continue;
            }
            $html = preg_replace('#</?' . $tag . '\b[^>]*>#i', '', $html) ?? $html;
        }

        // Remove on* event handler attributes.
        $html = preg_replace('/\son\w+\s*=\s*("[^"]*"|\'[^\']*\'|[^\s>]+)/i', '', $html) ?? $html;

        // Neutralize javascript: / vbscript: / data:text/html URLs.
        $html = preg_replace(
            '/(href|src|poster|action)\s*=\s*("javascript:[^"]*"|\'javascript:[^\']*\'|javascript:[^\s>]+)/i',
            '$1=""',
            $html
        ) ?? $html;
        $html = preg_replace(
            '/(href|src)\s*=\s*("(vbscript|data:text\/html):[^"]*"|\'(vbscript|data:text\/html):[^\']*\'|(vbscript|data:text\/html):[^\s>]+)/i',
            '$1=""',
            $html
        ) ?? $html;

        return $html;
    }
}
