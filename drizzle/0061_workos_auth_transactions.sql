CREATE TABLE `workos_auth_transactions` (
  `state_hash` varchar(43) NOT NULL,
  `provider` varchar(32) NOT NULL,
  `browser_binding_hash` varchar(43) NOT NULL,
  `code_verifier` varchar(128) NOT NULL,
  `redirect_uri` varchar(2048) NOT NULL,
  `return_to` varchar(2048) NOT NULL,
  `created_at` timestamp NOT NULL,
  `expires_at` timestamp NOT NULL,
  PRIMARY KEY (`state_hash`),
  KEY `workos_auth_transactions_expires_at_idx` (`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
