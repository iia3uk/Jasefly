<?php
declare(strict_types=1);

/**
 * Optional DEMO dataset for Jasefly CMS (installer checkbox / seed-demo.php).
 * Clearly fictional “Jasefly Demo” content — safe to delete after exploring the admin.
 */
function seedDemoContent(PDO $pdo): void
{
    $pdo->exec('SET FOREIGN_KEY_CHECKS = 0');

    $clean = __DIR__ . '/clean_base_seed.php';
    if (is_file($clean)) {
        require_once $clean;
        try {
            seedCleanInstall($pdo);
        } catch (Throwable) {
        }
    }

    $pdo->exec("UPDATE profile SET
        name='Jasefly Demo',
        job_title='Demo profile (delete me)',
        short_bio='[DEMO] Sample profile for exploring Jasefly CMS. Safe to replace or delete.',
        bio='<p><strong>[DEMO]</strong> This is sample content shipped with Jasefly CMS. Replace it with your own from the admin panel.</p>',
        location='Demo City',
        availability_status='Demo only',
        years_experience=1
      WHERE id=1");

    $pdo->exec("UPDATE hero_settings SET
        headline='[DEMO] Welcome to Jasefly CMS',
        subheadline='Sample homepage copy — replace from Site settings / Page builder.',
        badge_text='Demo content',
        primary_cta_label='About', primary_cta_href='/about',
        secondary_cta_label='Privacy', secondary_cta_href='/privacy',
        show_scroll_indicator=1, animation_style='fade'
      WHERE id=1");

    $pdo->exec("UPDATE site_settings SET
        site_name='Jasefly CMS (Demo)', maintenance_mode=0, timezone='UTC', locale='en',
        posts_per_page=9, projects_per_page=12
      WHERE id=1");

    $pdo->exec("UPDATE seo_settings SET
        site_title='Jasefly CMS — Demo',
        site_description='[DEMO] Modular AI-ready CMS sample site.',
        site_keywords='jasefly, cms, demo',
        og_title='Jasefly CMS — Demo',
        og_description='[DEMO] Sample site. Replace with your content.',
        twitter_card='summary_large_image'
      WHERE id=1");

    $pdo->exec("UPDATE contact_info SET
        email='demo@example.com', phone='',
        address='Demo only', city='', country='',
        form_enabled=1,
        form_success_message='[DEMO] Form works — configure real contact details in admin.'
      WHERE id=1");

    $pdo->exec("UPDATE footer_settings SET
        copyright_text='© {year} Jasefly CMS — Demo content',
        tagline='[DEMO] Modular AI-ready CMS',
        show_social=1
      WHERE id=1");

    $pdo->exec("UPDATE theme_settings SET
        preset='midnight', primary_color='#5b8cff', accent_color='#8eb6ff',
        background_color='#06080c', surface_color='#0e1219',
        text_color='#f4f6fa', muted_color='#8b95a8',
        font_display='Sora', font_body='DM Sans', border_radius='14px', glass_opacity=0.08
      WHERE id=1");

    $pdo->exec("UPDATE email_settings SET
        mailer='php', from_email='noreply@example.com', from_name='Jasefly CMS Demo',
        to_email='demo@example.com'
      WHERE id=1");

    foreach ([
        'project_tag_pivot', 'project_technologies', 'project_features', 'project_timeline', 'project_media',
        'blog_post_tags', 'blog_posts', 'blog_tags', 'blog_categories',
        'projects', 'project_categories', 'project_tags',
        'skills', 'skill_categories', 'experience', 'education',
        'services', 'testimonials', 'statistics', 'social_links',
        'homepage_sections',
    ] as $t) {
        try { $pdo->exec("DELETE FROM `$t`"); } catch (Throwable) {}
        try { $pdo->exec("ALTER TABLE `$t` AUTO_INCREMENT = 1"); } catch (Throwable) {}
    }

    $pdo->exec("INSERT INTO social_links (platform, label, url, icon, sort_order, is_visible) VALUES
        ('github','GitHub (demo)','https://example.com','github',1,1),
        ('website','Website (demo)','https://example.com','globe',2,1)");

    $pdo->exec("INSERT INTO statistics (label, value, suffix, icon, sort_order, is_visible) VALUES
        ('[DEMO] Modules','12','+','box',1,1),
        ('[DEMO] Widgets','20','+','layers',2,1)");

    $pdo->exec("INSERT INTO experience (company, role, location, description, start_date, end_date, is_current, technologies, sort_order, is_visible) VALUES
        ('[DEMO] Example Studio','Demo Role','Remote',
         '<p>[DEMO] Sample experience entry. Delete in admin.</p>',
         '2024-01-01',NULL,1,'[\"PHP\",\"React\"]',1,1)");

    $pdo->exec("INSERT INTO education (institution, degree, field_of_study, description, start_date, end_date, sort_order, is_visible) VALUES
        ('[DEMO] Example University','B.Sc.','Computer Science',
         '[DEMO] Sample education entry.',
         '2018-09-01','2022-06-30',1,1)");

    $pdo->exec("INSERT INTO skill_categories (name, slug, description, icon, sort_order) VALUES
        ('[DEMO] Frontend','demo-frontend','Demo category','monitor',1),
        ('[DEMO] Backend','demo-backend','Demo category','server',2)");

    $pdo->exec("INSERT INTO skills (category_id, name, percentage, icon, sort_order, is_visible) VALUES
        (1,'React',90,'react',1,1),
        (2,'PHP',90,'php',1,1)");

    $pdo->exec("INSERT INTO project_categories (name, slug, description, sort_order) VALUES
        ('[DEMO] Sample','demo-sample','Demo category',1)");

    $pdo->exec("INSERT INTO projects (
        title, slug, short_description, description, content, category_id, status, project_status,
        is_featured, sort_order, role, team_size, completion_date,
        github_url, website_url, challenges, seo_title, seo_description, published_at
      ) VALUES
      ('[DEMO] Sample Project','demo-sample-project',
       '[DEMO] Example project card.',
       '[DEMO] Replace or delete this project in the admin panel.',
       '<p><strong>[DEMO]</strong> Sample project body.</p>',
       1,'published','completed',1,1,'Demo',1,'2025-01-01',
       'https://example.com','https://example.com',
       NULL,
       '[DEMO] Sample Project','Demo project SEO', NOW())");

    $pdo->exec("INSERT INTO blog_categories (name, slug, description, sort_order) VALUES
        ('[DEMO] News','demo-news','Demo category',1)");

    $pdo->exec("INSERT INTO blog_posts (title, slug, excerpt, content, category_id, status, is_featured, seo_title, seo_description, published_at) VALUES
        ('[DEMO] Hello Jasefly','demo-hello-jasefly',
         '[DEMO] First sample post.',
         '<p><strong>[DEMO]</strong> Sample blog post. Delete after exploring.</p>',
         1,'published',0,'[DEMO] Hello Jasefly','Demo post', NOW())");

    $pdo->exec("INSERT INTO services (title, slug, short_description, description, icon, sort_order, is_visible) VALUES
        ('[DEMO] Consulting','demo-consulting',
         'Sample service',
         '<p>[DEMO] Sample service description.</p>',
         'sparkles',1,1)");

    $pdo->exec("INSERT INTO testimonials (author_name, author_title, company, content, rating, sort_order, is_visible) VALUES
        ('Demo Author','Demo Title','Demo Co',
         '[DEMO] Sample testimonial. Delete in admin.',
         5,1,1)");

    try {
        $cnt = (int) $pdo->query('SELECT COUNT(*) FROM navigation_items')->fetchColumn();
        if ($cnt === 0) {
            $pdo->exec("INSERT INTO navigation_items (label, href, target, parent_id, location, sort_order, is_visible) VALUES
                ('Home', '/', '_self', NULL, 'header', 1, 1),
                ('About', '/about', '_self', NULL, 'header', 2, 1),
                ('Projects', '/projects', '_self', NULL, 'header', 3, 1),
                ('Blog', '/blog', '_self', NULL, 'header', 4, 1),
                ('Privacy', '/privacy', '_self', NULL, 'footer', 1, 1)");
        }
    } catch (Throwable) {
    }

    try {
        $pdo->exec('SET FOREIGN_KEY_CHECKS = 1');
    } catch (Throwable) {
    }
}
