-- Link payments to orders + help webhook reconciliation.
ALTER TABLE payments ADD COLUMN order_id BIGINT UNSIGNED NULL AFTER external_id;
CREATE INDEX idx_payments_order_id ON payments (order_id);
