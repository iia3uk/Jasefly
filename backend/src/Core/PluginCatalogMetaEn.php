<?php
declare(strict_types=1);

namespace App\Core;

/**
 * English catalog strings for admin Plugins page (Accept-Language: en).
 *
 * @internal Used by PluginCatalogMeta only.
 */
final class PluginCatalogMetaEn
{
    public const CATEGORIES = [
        'core' => 'Core',
        'content' => 'Content',
        'commerce' => 'Commerce',
        'comms' => 'Communications',
        'security' => 'Security',
        'integrations' => 'Integrations',
        'other' => 'Other',
    ];

    public const LABELS = [
        'system' => 'System',
        'users' => 'Users',
        'registration' => 'Registration',
        'portfolio' => 'Portfolio',
        'projects' => 'Projects',
        'blog' => 'Blog',
        'content' => 'Content API',
        'media' => 'Media',
        'seo' => 'SEO',
        'template' => 'Templates',
        'products' => 'Products',
        'payments' => 'Payments',
        'orders' => 'Orders',
        'comments' => 'Comments',
        'analytics' => 'Analytics',
        'mail' => 'Mail',
        'ddos' => 'DDoS protection',
        'overload' => 'Overload protection',
        'translate' => 'Translator',
        'webhooks' => 'Webhooks',
        'support' => 'Support',
        'lab' => 'Jasefly Lab',
        'scheduler' => 'Scheduler',
        'module-manager' => 'Modules',
        'forms' => 'Forms',
        'notifications' => 'Notifications',
        'automation' => 'Automation',
        'newsletter' => 'Newsletter',
    ];

    /**
     * @return array<string, array{category: string, description: string, long_description: string}>
     */
    public static function all(): array
    {
        return [
            'system' => [
                'category' => 'core',
                'description' => 'CMS core: site settings, themes, pages, backups, system status.',
                'long_description' => "Base plugin that cannot be disabled.\n\n"
                    . "• System pages and page builder\n"
                    . "• Theme, SEO defaults, navigation\n"
                    . "• Backups, activity, trash\n"
                    . "• Plugin management and system APIs\n\n"
                    . "Without System the admin and public site do not run.",
            ],
            'users' => [
                'category' => 'core',
                'description' => 'Admin users, roles and permissions.',
                'long_description' => "Editor and administrator accounts.\n\n"
                    . "• Create and delete users\n"
                    . "• Roles (editor / admin / super_admin)\n"
                    . "• Section permissions\n"
                    . "• Sign-in, sessions, password change\n\n"
                    . "Core: cannot be disabled.",
            ],
            'registration' => [
                'category' => 'core',
                'description' => 'Public registration: form, default role, email verification.',
                'long_description' => "Self-service signup at /register.\n\n"
                    . "• Enable/disable registration\n"
                    . "• Default role (member / editor)\n"
                    . "• Email verification via Mail plugin\n"
                    . "• Auto sign-in, redirects, terms consent\n"
                    . "• Honeypot, rate limit, captcha\n\n"
                    . "Members do not get admin access.",
            ],
            'portfolio' => [
                'category' => 'content',
                'description' => 'Portfolio: profile, skills, experience, home, services and testimonials.',
                'long_description' => "Portfolio product layer on top of the CMS core.\n\n"
                    . "• Profile, photo, statistics\n"
                    . "• Experience, education, skills\n"
                    . "• Home templates: Classic or Builder\n"
                    . "• Services, testimonials, homepage sections\n\n"
                    . "Edit copy under Content; home layout in plugin settings.",
            ],
            'projects' => [
                'category' => 'content',
                'description' => 'Case studies and projects: cards, detail pages, tags and categories.',
                'long_description' => "Work catalog for /projects.\n\n"
                    . "• List and project page\n"
                    . "• Covers, gallery, stack, timeline\n"
                    . "• Categories and tags\n"
                    . "• Featured projects on the home page\n\n"
                    . "Uses Media for covers.",
            ],
            'blog' => [
                'category' => 'content',
                'description' => 'Blog: posts, categories, tags and home previews.',
                'long_description' => "Publishing for /blog.\n\n"
                    . "• Drafts and publish\n"
                    . "• SEO fields, excerpt, full body\n"
                    . "• Categories and tags\n"
                    . "• Home previews when enabled in Portfolio\n\n"
                    . "Disable if you do not need a blog.",
            ],
            'content' => [
                'category' => 'content',
                'description' => 'Public content API: profile, skills, experience, home, forms.',
                'long_description' => "REST layer for portfolio entities.\n\n"
                    . "• Serves site data (/api/v1/…)\n"
                    . "• Links profile, experience, skills, homepage tables\n"
                    . "• Contact and helper endpoints\n\n"
                    . "Usually kept on with Portfolio.",
            ],
            'media' => [
                'category' => 'content',
                'description' => 'Media library: upload and attach images to content.',
                'long_description' => "Files on disk and DB records.\n\n"
                    . "• Upload images and documents\n"
                    . "• Media folders / categories\n"
                    . "• Cover pickers in projects, blog, profile\n\n"
                    . "Without Media, covers cannot be assigned.",
            ],
            'seo' => [
                'category' => 'content',
                'description' => 'SEO: site title/description, sitemap, page meta.',
                'long_description' => "Search engine optimization.\n\n"
                    . "• Global SEO settings\n"
                    . "• Sitemap.xml\n"
                    . "• Meta for pages and posts\n\n"
                    . "Complements SEO fields in content editors.",
            ],
            'template' => [
                'category' => 'content',
                'description' => 'Page layout templates and presets.',
                'long_description' => "Helper plugin for templates.\n\n"
                    . "• Layout presets for the builder\n"
                    . "• Ties to system demo pages\n\n"
                    . "Needed when using ready-made page templates.",
            ],
            'products' => [
                'category' => 'commerce',
                'description' => 'Product storefront: catalog, product page, storefront templates.',
                'long_description' => "Commerce catalog and product page.\n\n"
                    . "• Products with price, attrs, tabs, gallery, variants\n"
                    . "• Storefront templates\n"
                    . "• Dynamic form fields per template\n"
                    . "• Works with Payments for checkout\n\n"
                    . "Template settings under Commerce → Storefront templates.",
            ],
            'payments' => [
                'category' => 'commerce',
                'description' => 'Payments: providers, orders, success/fail pages, offer terms.',
                'long_description' => "Multi-acquirer checkout.\n\n"
                    . "• Enable providers (YooKassa, etc.)\n"
                    . "• Orders and payment statuses\n"
                    . "• Payment and offer system pages\n"
                    . "• Payment method icons, seller info\n\n"
                    . "Works with Products for storefront purchases.",
            ],
            'orders' => [
                'category' => 'commerce',
                'description' => 'Orders, carts, statuses, refunds and export.',
                'long_description' => "Full order flow on top of Products.\n\n"
                    . "• Carts and server-side totals\n"
                    . "• Status history, notes, refunds\n"
                    . "• Payments integration without duplicating orders",
            ],
            'comments' => [
                'category' => 'comms',
                'description' => 'Comments and reviews with moderation and ratings.',
                'long_description' => "Discussions for pages, posts, projects and products.\n\n"
                    . "• Moderation queue\n"
                    . "• Verified purchase\n"
                    . "• Comment and review widgets",
            ],
            'analytics' => [
                'category' => 'other',
                'description' => 'Private event/goal analytics without storing raw IPs.',
                'long_description' => "Built-in CMS analytics.\n\n"
                    . "• Events, sessions, pages and goals\n"
                    . "• HMAC visitor hashes instead of raw IPs\n"
                    . "• Aggregation and retention via Scheduler",
            ],
            'mail' => [
                'category' => 'comms',
                'description' => 'Mail and contact form: SMTP, captcha, notifications.',
                'long_description' => "Outbound email from the site.\n\n"
                    . "• SMTP (host, port, encryption)\n"
                    . "• From/to for form submissions\n"
                    . "• Optional captcha\n"
                    . "• Form widget on pages\n\n"
                    . "Without working SMTP the contact form cannot send.",
            ],
            'ddos' => [
                'category' => 'security',
                'description' => 'Flood protection: request limits and blocks.',
                'long_description' => "Basic anti-abuse for API and forms.\n\n"
                    . "• IP rate limits\n"
                    . "• Temporary blocks\n"
                    . "• Threshold settings in admin\n\n"
                    . "Does not replace a hosting WAF.",
            ],
            'overload' => [
                'category' => 'security',
                'description' => 'Load average monitoring: 503, email and overload log.',
                'long_description' => "Server overload protection and observation.\n\n"
                    . "• Watches load average (1m / optional 5m)\n"
                    . "• Can close the site with HTTP 503\n"
                    . "• Email alerts via Mail plugin\n"
                    . "• Log-only mode without actions\n"
                    . "• Per-CPU thresholds and quiet window after ZIP updates\n\n"
                    . "On Windows / some hosts loadavg is unavailable — fail-open.",
            ],
            'translate' => [
                'category' => 'integrations',
                'description' => 'On-the-fly site translation widget.',
                'long_description' => "Visitor-facing translator overlay.\n\n"
                    . "• Language picker on the public site\n"
                    . "• Translation cache + warmup / sync on save\n"
                    . "• DeepL, MyMemory or self-hosted LibreTranslate\n"
                    . "• Settings in Plugins → Translator\n\n"
                    . "Machine quality; DeepL is usually better than MyMemory.",
            ],
            'webhooks' => [
                'category' => 'integrations',
                'description' => 'Outbound webhooks on CMS events (orders, content).',
                'long_description' => "Integrations with external systems.\n\n"
                    . "• Subscribe to core events\n"
                    . "• HTTP callbacks to your URL\n"
                    . "• Useful for CRM, Telegram bots, CI\n\n"
                    . "Enable only when you have a receiver.",
            ],
            'support' => [
                'category' => 'comms',
                'description' => 'Live chat and tickets: site widget, admin inbox, FAQ bot.',
                'long_description' => "Visitor support without WebSockets (polling).\n\n"
                    . "• Floating chat widget on the public site\n"
                    . "• Agent inbox with support.agent permission\n"
                    . "• Contact handoff when leaving the page\n"
                    . "• FAQ bot when no agents online\n"
                    . "• Email / Telegram / Discord / Max alerts\n\n"
                    . "Replies only in admin; messengers are notifications.",
            ],
            'lab' => [
                'category' => 'other',
                'description' => 'Jasefly Lab: isolated visual and functional experiments.',
                'long_description' => "Sandbox for UI/UX experiments without affecting production.\n\n"
                    . "• Separate /lab/:slug pages outside SiteLayout\n"
                    . "• Frontend entries from a whitelist only\n"
                    . "• Drafts, publish, noindex, soft delete\n\n"
                    . "Does not change Page Builder, normal pages or global theme.",
            ],
            'scheduler' => [
                'category' => 'core',
                'description' => 'Job scheduler: queue, cron tick, retry/cancel.',
                'long_description' => "Background CMS jobs without a separate worker.\n\n"
                    . "• scheduled_jobs queue + job_attempts\n"
                    . "• CLI: php backend/bin/scheduler.php run\n"
                    . "• HTTP tick by token or lazy tick in admin\n"
                    . "• Admin inbox: cron status, retry, cancel\n\n"
                    . "Base system module for deferred work.",
            ],
            'module-manager' => [
                'category' => 'core',
                'description' => 'Module manager: install, update and roll back ZIP packages.',
                'long_description' => "System Module Package Manager.\n\n"
                    . "• Upload and inspect ZIP (module.json + checksums)\n"
                    . "• Install / update / enable / disable / uninstall / rollback\n"
                    . "• installed_modules registry, migrations, health-check\n"
                    . "• CLI: php backend/bin/modules.php\n"
                    . "• Public SPA loader: GET /api/v1/modules/runtime-assets\n\n"
                    . "Core for extensions under api/modules/{slug}.",
            ],
            'forms' => [
                'category' => 'comms',
                'description' => 'Form builder: fields, submissions, form widget in the builder.',
                'long_description' => "Universal forms on the CMS core.\n\n"
                    . "• Form and field CRUD in admin\n"
                    . "• Submission inbox with statuses\n"
                    . "• Form widget — GET/POST /forms/{slug}\n"
                    . "• Honeypot, timing, rate limit\n\n"
                    . "Recommended with Mail for email actions.",
            ],
            'notifications' => [
                'category' => 'comms',
                'description' => 'Admin notifications with email and Telegram delivery.',
                'long_description' => "CMS notification center.\n\n"
                    . "• Bell and inbox\n"
                    . "• User and broadcast messages\n"
                    . "• Email / Telegram per settings",
            ],
            'automation' => [
                'category' => 'integrations',
                'description' => 'Event scenarios: conditions, actions, branches and delays.',
                'long_description' => "No-code event automation.\n\n"
                    . "• Triggers for forms, orders and content\n"
                    . "• Webhook, email, Telegram and notifications\n"
                    . "• Delay queue via Scheduler",
            ],
            'newsletter' => [
                'category' => 'comms',
                'description' => 'Subscribers, double opt-in, lists and email campaigns.',
                'long_description' => "Email newsletters for the site.\n\n"
                    . "• Double opt-in and unsubscribe\n"
                    . "• CSV import / export\n"
                    . "• Batched sending via Scheduler",
            ],
        ];
    }
}
