-- Site template builder: custom HTML/JS on theme_settings
ALTER TABLE theme_settings ADD COLUMN custom_html TEXT NULL AFTER custom_css;
ALTER TABLE theme_settings ADD COLUMN custom_js TEXT NULL AFTER custom_html;
