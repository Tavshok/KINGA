-- Add KINGA reference number column to claims table
ALTER TABLE `claims` ADD COLUMN `kinga_ref` varchar(40);

-- Add KINGA sequence counter columns to tenants table
ALTER TABLE `tenants` ADD COLUMN `kinga_sequence` int NOT NULL DEFAULT 0;
ALTER TABLE `tenants` ADD COLUMN `kinga_sequence_year` int NOT NULL DEFAULT 0;
