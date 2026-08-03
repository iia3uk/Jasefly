-- Switch default provider to Yandex (RF-friendly) and Red Square sample coords
UPDATE `maps_settings`
SET
  `provider` = 'yandex',
  `default_lat` = 55.7539000,
  `default_lng` = 37.6208000,
  `default_zoom` = 16,
  `updated_at` = NOW()
WHERE `id` = 1;
