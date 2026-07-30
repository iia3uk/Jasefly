-- Navbar style: overlay (transparent until scroll, over hero) | solid (classic sticky)
ALTER TABLE theme_settings
  ADD COLUMN header_style VARCHAR(20) NOT NULL DEFAULT 'overlay' AFTER glass_opacity;
