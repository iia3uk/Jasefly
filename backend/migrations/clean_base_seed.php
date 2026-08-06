<?php
declare(strict_types=1);

/**
 * Neutral base content for a clean Jasefly install (no portfolio data).
 * Called when installer runs without demo checkbox.
 */
function seedCleanInstall(PDO $pdo): void
{
    foreach (['profile', 'site_settings', 'theme_settings', 'seo_settings', 'footer_settings', 'hero_settings', 'contact_info', 'email_settings'] as $tbl) {
        try {
            $pdo->exec("INSERT INTO `$tbl` (id) SELECT 1 WHERE NOT EXISTS (SELECT 1 FROM `$tbl` WHERE id=1)");
        } catch (Throwable) {
        }
    }

    $pdo->exec("UPDATE site_settings SET
        site_name='Jasefly',
        maintenance_mode=0,
        timezone='Europe/Moscow',
        locale='ru',
        posts_per_page=9,
        projects_per_page=12
      WHERE id=1");

    $pdo->exec("UPDATE seo_settings SET
        site_title='Jasefly',
        site_description='AI-first dual-runtime платформа для сайтов и агентов: Page Builder, модули и MCP. PHP на shared-хостинге или Node на VPS.',
        site_keywords='jasefly, cms, page builder, mcp, dual runtime, php, react, node, модули, агенты',
        og_title='Jasefly — платформа для сайтов и агентов',
        og_description='Page Builder, модули и MCP в одном ядре. Shared-хостинг или Node VPS — без лишней инфраструктуры.',
        twitter_card='summary_large_image',
        twitter_title='Jasefly — платформа для сайтов и агентов',
        twitter_description='AI-first dual-runtime платформа: билдер страниц, модули и MCP для агентов.',
        robots_txt='User-agent: *\nAllow: /\n',
        target_regions='[\"CIS\",\"EU\",\"USA\",\"ASIA\"]',
        structured_data_json='{\"@context\":\"https://schema.org\",\"@graph\":[{\"@type\":\"WebSite\",\"name\":\"Jasefly\",\"description\":\"AI-first dual-runtime платформа для сайтов и агентов: Page Builder, модули и MCP.\",\"publisher\":{\"@type\":\"Organization\",\"name\":\"Jasefly\"}},{\"@type\":\"SoftwareApplication\",\"name\":\"Jasefly\",\"applicationCategory\":\"DeveloperApplication\",\"operatingSystem\":\"Web\",\"description\":\"Dual-runtime CMS/platform (PHP shared + Node VPS) with Page Builder and MCP for agents.\"}]}'
      WHERE id=1");

    // Empty footer OOB — SiteLayout hides it until real content is added.
    $pdo->exec("UPDATE footer_settings SET
        copyright_text='',
        tagline='',
        show_social=0
      WHERE id=1");

    $pdo->exec("UPDATE hero_settings SET
        headline='Jasefly',
        subheadline='Платформа для сайтов и агентов',
        badge_text='Jasefly',
        primary_cta_label='Открыть админку',
        primary_cta_href='/admin',
        secondary_cta_label='',
        secondary_cta_href='',
        show_scroll_indicator=0,
        animation_style='fade'
      WHERE id=1");

    $pdo->exec("UPDATE profile SET
        name='Jasefly',
        job_title='Platform',
        short_bio='AI-first dual-runtime платформа для сайтов и агентов',
        bio='<p>Jasefly — Page Builder, модули и MCP. Настройте сайт в админке.</p>',
        location='',
        availability_status='',
        years_experience=0
      WHERE id=1");

    $pdo->exec("UPDATE contact_info SET
        email='', phone='', address='', city='', country='',
        form_enabled=1,
        form_success_message='Thank you. Your message has been received.'
      WHERE id=1");

    $pdo->exec("UPDATE email_settings SET
        mailer='php',
        from_email='noreply@example.com',
        from_name='Jasefly',
        to_email=''
      WHERE id=1");

    $pdo->exec("UPDATE theme_settings SET
        preset='midnight',
        primary_color='#5b8cff',
        accent_color='#8eb6ff',
        background_color='#06080c',
        surface_color='#0e1219',
        text_color='#f4f6fa',
        muted_color='#8b95a8',
        font_display='Sora',
        font_body='DM Sans',
        border_radius='14px',
        glass_opacity=0.08
      WHERE id=1");

    // Ensure home page exists (005 may already insert). No default nav — empty header/footer OOB.
    try {
        $pdo->exec("INSERT INTO pages (title, slug, status, template, is_home, seo_title, seo_description)
            SELECT 'Главная', '__home', 'published', 'builder', 1,
                   'Jasefly — платформа для сайтов и агентов',
                   'AI-first dual-runtime платформа для сайтов и агентов: Page Builder, модули и MCP. PHP на shared-хостинге или Node на VPS.'
            WHERE NOT EXISTS (SELECT 1 FROM pages WHERE is_home=1 OR slug='__home')");
    } catch (Throwable) {
    }
    try {
        $pdo->exec("UPDATE pages SET
            title='Главная',
            status='published',
            template='builder',
            is_home=1,
            seo_title=COALESCE(NULLIF(TRIM(seo_title), ''), 'Jasefly — платформа для сайтов и агентов'),
            seo_description=COALESCE(NULLIF(TRIM(seo_description), ''), 'AI-first dual-runtime платформа для сайтов и агентов: Page Builder, модули и MCP. PHP на shared-хостинге или Node на VPS.')
          WHERE slug='__home'");
    } catch (Throwable) {
    }

    // Privacy Policy template (no nav link until site owner adds it)
    try {
        $pdo->exec("INSERT INTO pages (title, slug, status, template, is_home, seo_title, seo_description)
            SELECT 'Политика конфиденциальности', 'privacy', 'published', 'builder', 0,
                   'Политика конфиденциальности — Jasefly',
                   'Шаблон политики конфиденциальности. Замените на свой юридический текст.'
            WHERE NOT EXISTS (SELECT 1 FROM pages WHERE slug='privacy')");
    } catch (Throwable) {
    }
}
