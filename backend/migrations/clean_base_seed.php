<?php
declare(strict_types=1);

/**
 * Neutral base content for a clean Jasefly CMS install (no portfolio data).
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
        site_name='Jasefly CMS',
        maintenance_mode=0,
        timezone='UTC',
        locale='en',
        posts_per_page=9,
        projects_per_page=12
      WHERE id=1");

    $pdo->exec("UPDATE seo_settings SET
        site_title='Jasefly CMS',
        site_description='Modular AI-ready CMS',
        site_keywords='cms, jasefly, modular',
        og_title='Jasefly CMS',
        og_description='Modular AI-ready CMS',
        twitter_card='summary_large_image'
      WHERE id=1");

    $pdo->exec("UPDATE footer_settings SET
        copyright_text='© {year} Jasefly CMS',
        tagline='Modular AI-ready CMS',
        show_social=0
      WHERE id=1");

    $pdo->exec("UPDATE hero_settings SET
        headline='Jasefly CMS',
        subheadline='Modular AI-ready CMS',
        badge_text='',
        primary_cta_label='Get started',
        primary_cta_href='/about',
        secondary_cta_label='',
        secondary_cta_href='',
        show_scroll_indicator=0,
        animation_style='fade'
      WHERE id=1");

    $pdo->exec("UPDATE profile SET
        name='Jasefly CMS',
        job_title='Content management',
        short_bio='Modular AI-ready CMS',
        bio='<p>Welcome to Jasefly CMS. Edit this site from the admin panel.</p>',
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
        from_name='Jasefly CMS',
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

    // Ensure home page exists (005 may already insert).
    try {
        $pdo->exec("INSERT INTO pages (title, slug, status, template, is_home)
            SELECT 'Home', '__home', 'published', 'builder', 1
            WHERE NOT EXISTS (SELECT 1 FROM pages WHERE is_home=1 OR slug='__home')");
    } catch (Throwable) {
    }
    try {
        $pdo->exec("UPDATE pages SET title='Home', status='published', template='builder', is_home=1 WHERE slug='__home'");
    } catch (Throwable) {
    }

    // About
    try {
        $pdo->exec("INSERT INTO pages (title, slug, status, template, is_home, seo_title, seo_description)
            SELECT 'About', 'about', 'published', 'builder', 0,
                   'About — Jasefly CMS', 'About this site'
            WHERE NOT EXISTS (SELECT 1 FROM pages WHERE slug='about')");
    } catch (Throwable) {
    }

    // Privacy Policy template
    try {
        $pdo->exec("INSERT INTO pages (title, slug, status, template, is_home, seo_title, seo_description)
            SELECT 'Privacy Policy', 'privacy', 'published', 'builder', 0,
                   'Privacy Policy', 'Privacy Policy template — replace with your legal text'
            WHERE NOT EXISTS (SELECT 1 FROM pages WHERE slug='privacy')");
    } catch (Throwable) {
    }

    // Basic navigation (idempotent-ish: clear default empty then insert if none)
    try {
        $cnt = (int) $pdo->query('SELECT COUNT(*) FROM navigation_items')->fetchColumn();
        if ($cnt === 0) {
            $pdo->exec("INSERT INTO navigation_items (label, href, target, parent_id, location, sort_order, is_visible) VALUES
                ('Home', '/', '_self', NULL, 'header', 1, 1),
                ('About', '/about', '_self', NULL, 'header', 2, 1),
                ('Privacy', '/privacy', '_self', NULL, 'footer', 1, 1)");
        }
    } catch (Throwable) {
    }
}
