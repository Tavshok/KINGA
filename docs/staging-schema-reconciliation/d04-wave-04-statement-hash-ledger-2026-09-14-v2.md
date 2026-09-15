# D-04 Wave 4 Marker-Split Statement Hash Ledger

This manifest is generated deterministically from `audit/gate-d-text-index-compatibility-2026-09-14/wave-04-tidb-compatible-source-v2.sql`, the revised TiDB-compatible Wave 4 execution source. The immutable historical Gate C source remains unchanged; this packet source retains the five documented JSON-shaped TEXT default corrections and deliberately omits the Gate-B-excluded no-consumer whole-TEXT `idx_recipients` index. The source is split only on the exact literal `--> statement-breakpoint`, each fragment is UTF-8 trimmed, and the source's one empty terminal fragment is discarded because Wave 4 ends with a marker. Each emitted statement retains its terminal semicolon and is hashed with SHA-256. The JSON companion ledger contains the exact full SQL for every row.

| Control | Value |
|---|---|
| Full revised source SHA-256 | `7e5802c2a4c57cee21a951a0ca85d174b1f03fb5c560c00925564455ef9cfd69` |
| Marker count | 134 (trailing marker present) |
| Executable statement count | 134 |
| Statement class totals | 40 `CREATE TABLE`, 7 `ADD FOREIGN KEY`, 87 `CREATE INDEX` |
| JSON companion | `../../audit/gate-d-d04-statement-hash-ledger-2026-09-14.json` |

> Do not run the raw source through `mysql < file.sql`. The `--> statement-breakpoint` literal is repository tooling, not a MySQL/TiDB comment. Before any separately authorised execution, compare each prepared statement text and its SHA-256 with the matching row below. This review packet grants no execution authority.

## Ordered execution ledger

| # | Phase | Statement class | Table | Object / constraint / index | SHA-256 of emitted SQL |
|---:|---|---|---|---|---|
| 1 | tables | CREATE TABLE | `—` | `agency_assisted_claimant_identities` | `e422c2e2d9a715e128a688e76185349e74cb11680d45075c73ccf22a8d148ba1` |
| 2 | tables | CREATE TABLE | `—` | `agency_clients` | `a88c420ce3e2751843cf1e42fae3f38c525a0b3ab85c8a5a2a2221f088d95b48` |
| 3 | tables | CREATE TABLE | `—` | `agency_insurance_service_request_insurers` | `894e492064a37189c905266f90fa715b44a4153b3dc130343751c1cf740971e2` |
| 4 | tables | CREATE TABLE | `—` | `agency_insurance_service_requests` | `9086cf7bc7856f2393630ffaabdf13c2b128fd0f82ed7ea157e206111bab55c1` |
| 5 | tables | CREATE TABLE | `—` | `agency_insurance_valuation_deviations` | `6b7cd2323c445cd4d2b649383dca02d75df1720870768efeb64747ca0aab9c1d` |
| 6 | tables | CREATE TABLE | `—` | `agency_product_commission_configs` | `762b876ec0f9662a3b6dd1515940fbdb039a43a4ace56835529a4be980779343` |
| 7 | tables | CREATE TABLE | `—` | `approval_workflow` | `3a29b9248329815913a0ae8b47c0942a685385cc8be33a89b3316db15a32715d` |
| 8 | tables | CREATE TABLE | `—` | `claim_comment_reads` | `5d21caf6aa78ca3cbf2666f35fccf1e76eee7be49a14e0a529b357673f6aa05a` |
| 9 | tables | CREATE TABLE | `—` | `claim_comments` | `8bcb07aca092a9d5b0f19133be640513c4e3131948b7430b08d754f1edf650e6` |
| 10 | tables | CREATE TABLE | `—` | `client_insurance_service_requests` | `9484cd20fe891adc2b427e212ac05d68f6a115047422142d5332972faa5b6298` |
| 11 | tables | CREATE TABLE | `—` | `client_vehicle_valuation_requests` | `ca4f54d694a71e4015b6be8b689dc3bfc7b67ed68892736afb91afce1e7bac5f` |
| 12 | tables | CREATE TABLE | `—` | `engineer_observations` | `2d99aebf8bae42cc324c8bb91490623f09d58ee4f207b27cb3a7c227b614dc9b` |
| 13 | tables | CREATE TABLE | `—` | `engineer_profiles` | `e0a090af553d981d6d6e490d19a8c3127ae67e2358ed91c1170435ddd485a1c3` |
| 14 | tables | CREATE TABLE | `—` | `fleet_accounts` | `ef75d3fd27fd77576266a2555981b072e0608399356ec4c41e45d5d6852108da` |
| 15 | tables | CREATE TABLE | `—` | `fleet_audit_logs` | `acf3daa39f90837802b6f09ec61987533cce00bc393182131a34c1a1fcf6cc53` |
| 16 | tables | CREATE TABLE | `—` | `fleet_drivers` | `4c916e900b625cee5e668fcc2eda93fdcd4b062acc6647ad1487e444ecac8cd6` |
| 17 | tables | CREATE TABLE | `—` | `fleet_intelligence_snapshots` | `234ccce70b12d0998a7314a30fa66e60557ec05adc37355785a387a2571219fe` |
| 18 | tables | CREATE TABLE | `—` | `fleet_manager_requests` | `1cef3b11bc1ee40e3a67b96d51b04d79f378f54371a9c70ee2d9e3b5b4a49316` |
| 19 | tables | CREATE TABLE | `—` | `fleet_rfq_client_instructions` | `86ab8a396df8b1d8fd1e995a2638e7ef8cc96779f6e96985f6fe351b4c6db9ee` |
| 20 | tables | CREATE TABLE | `—` | `fleet_risk_scores` | `15272efafc03ef1ed40ee4545ca482e241e60297371d46d894c7afd90b0d251a` |
| 21 | tables | CREATE TABLE | `—` | `fleet_vehicles` | `562eac4028a01b630f96441ded52472c97805fac1d0c903b92b805d97f2267f1` |
| 22 | tables | CREATE TABLE | `—` | `fleets` | `7f10f3949bfb0164b64fec0f9bc3aec03ff5522a3e9ed443f1cd045596b2dc98` |
| 23 | tables | CREATE TABLE | `—` | `governance_audit_log` | `f5b59972725234e9159a5b20d5f1acb7e7b5fd0dbe3eaa186442df1782acdaf0` |
| 24 | tables | CREATE TABLE | `—` | `governance_notifications` | `3afce1067e102f4a6edf835e86c20adde69914268759a0358c29603d1221fb86` |
| 25 | tables | CREATE TABLE | `—` | `governance_violation_log` | `d0a77d152d4bd87e9267be8f5c5f8fb0cf375018c287ce689a0e6f664f36d909` |
| 26 | tables | CREATE TABLE | `—` | `inspection_projects` | `2cf92389855cc6579d428fc052a09558c6566664fff8bcd67ad7815a0abe6413` |
| 27 | tables | CREATE TABLE | `—` | `notification_events` | `3475bb20a4183e1df9e4819c91685a67c9da70cb8a39f437c8cad4822c387e62` |
| 28 | tables | CREATE TABLE | `—` | `notification_preferences` | `66280fbe648bfd1b7af698ab37033ada4f1feffef13e19c70f53e9688eb2968b` |
| 29 | tables | CREATE TABLE | `—` | `notifications` | `2df6c3d7833dad39189b2df06d5f62a9fee278a4a1d1ebbce3d3baf2c1694512` |
| 30 | tables | CREATE TABLE | `—` | `panel_beaters` | `7bfb6265dd33a79953c5493e273530bdb11a4fc96bf584db07235023d3ecfae5` |
| 31 | tables | CREATE TABLE | `—` | `platform_governance_limits` | `44c0a08332488c0bd24e100eec2813f4e1a1d811af9d733eb8ca23b6cb0c6d83` |
| 32 | tables | CREATE TABLE | `—` | `rate_limit_tracking` | `1e4c0e6e9924e70bb9a211dcf9e1e31d4e5ec1e40ee90f749fbf27ccbd619ba6` |
| 33 | tables | CREATE TABLE | `—` | `recovery_cases` | `98eea6604a94b73a371f6855e3871ce97a20a17999f8f6c2e1b99f82d1d60fb7` |
| 34 | tables | CREATE TABLE | `—` | `recovery_correspondence_log` | `c8174c07186cb56a0c28a5bd147d2e78e46f1d61e70928fd8d31e5313f3e68cf` |
| 35 | tables | CREATE TABLE | `—` | `service_requests` | `543fb587ce7b1159220c6ba034c06f3294c6929b4ffaa60f090ad188b84c90e9` |
| 36 | tables | CREATE TABLE | `—` | `tenant_workflow_configs` | `8d4432be1965a91aaa79151635f067ce82add170ed46b356c605399503730680` |
| 37 | tables | CREATE TABLE | `—` | `whatsapp_sessions` | `cd473d339464ece1f6c297f0eb04a1e51593b9f46d076c7a8aa6cd1c4b8dfe49` |
| 38 | tables | CREATE TABLE | `—` | `workflow_audit_trail` | `a54e893ebf2b02052dc05c71f81925968d2a869cad4e7a0986a6e3648cb1221b` |
| 39 | tables | CREATE TABLE | `—` | `workflow_configuration` | `1daada31d682beeda7e1ec71279d3214f7bbca388395d3293f92d2cc51cac02f` |
| 40 | tables | CREATE TABLE | `—` | `workflow_templates` | `96cf9b7936719ace2d502d4566134adbdc0a4cb3faa7865cba212cdcf14fdd76` |
| 41 | foreign_keys | ADD FOREIGN KEY | `approval_workflow` | `approval_workflow_claim_id_claims_id_fk` | `ba653e5fa3a366d46e420bb637c0ccc535e26cb28ba616f57acbb0f8f1d01e2c` |
| 42 | foreign_keys | ADD FOREIGN KEY | `claim_comments` | `claim_comments_claimId_claims_id_fk` | `25eddff01e17650865273bba4c6334f615f1319983c1d8c75168ea19f83cabff` |
| 43 | foreign_keys | ADD FOREIGN KEY | `claim_comments` | `claim_comments_author_user_id_users_id_fk` | `6334910f41c8691095997986241de93e90a986a6778ca18b872d153a42570220` |
| 44 | foreign_keys | ADD FOREIGN KEY | `governance_notifications` | `governance_notifications_claim_id_claims_id_fk` | `c4020c36ee5df42e486ab74c7e00c45c03f04fde2a1e020ac28cf63b66eaf88a` |
| 45 | foreign_keys | ADD FOREIGN KEY | `notifications` | `notifications_claim_id_claims_id_fk` | `9a4fd3f4fc67d5209ee53f9b2d4d17826e67f64fef24da81ae857072553a8ade` |
| 46 | foreign_keys | ADD FOREIGN KEY | `recovery_cases` | `recovery_cases_claim_id_claims_id_fk` | `5fdd439f2e472796306afa97816b0b4a7f95972fbd9411fd10334efec6946ccc` |
| 47 | foreign_keys | ADD FOREIGN KEY | `workflow_audit_trail` | `workflow_audit_trail_claim_id_claims_id_fk` | `262d13ec631867026eb3e26f24dcdcff6949f7dc797b54454905e2aa779666aa` |
| 48 | indexes | CREATE INDEX | `agency_assisted_claimant_identities` | `idx_agency_assisted_claimant_insurer` | `01ed6d25cfd60cd7cf7f54fedde77e09c0ebde31d96b45ec01f1a0ba40050ba6` |
| 49 | indexes | CREATE INDEX | `agency_clients` | `idx_agency_clients_tenant` | `08ca2a3750d16196c04e8d930ab7371c300b12e1cc134bff51b73ca4409f7b42` |
| 50 | indexes | CREATE INDEX | `agency_clients` | `idx_agency_clients_id_number` | `fcfdcfb19a205b63b69330b301a59b24c654051cd77a5504dcb594c953f7b287` |
| 51 | indexes | CREATE INDEX | `agency_clients` | `idx_agency_clients_email` | `edddb23446eb8b1986626db7bf2a6e6756c51a2ad06b255585d6f52d0f1c6856` |
| 52 | indexes | CREATE INDEX | `agency_insurance_service_request_insurers` | `idx_agency_service_request_insurer_tenant` | `989a37bae74f2ceb645603ce6e4def1f388bb3b8590185056b8f3b51e7ea948e` |
| 53 | indexes | CREATE INDEX | `agency_insurance_service_requests` | `idx_agency_insurance_service_request_tenant_status` | `09e0ef74f8c80b05d29759aea0bcdbbea8c636ec0207421e4038dc0e2f2a72c8` |
| 54 | indexes | CREATE INDEX | `agency_insurance_service_requests` | `idx_agency_insurance_service_request_client` | `22d4bf154019b2034e1da030ac4cb7299d0d168bb34b79013feb0f9e1a6503c0` |
| 55 | indexes | CREATE INDEX | `agency_insurance_service_requests` | `idx_agency_insurance_service_request_vehicle` | `f0b3df159f093faef40aa8d794d5fb17c97af4a63861f2281bbd10b7b10b4e2f` |
| 56 | indexes | CREATE INDEX | `agency_insurance_valuation_deviations` | `idx_agency_insurance_valuation_deviation_tenant` | `8e530acb2d6f6be7fd676b51498b1f473951f11a4efe4956bd886484dff1416e` |
| 57 | indexes | CREATE INDEX | `agency_product_commission_configs` | `idx_agency_product_commission_tenant` | `05c7b8ca5b0d78bbc434eccaee937eaf4eb560863dccf4896f0ed3a17cf8060d` |
| 58 | indexes | CREATE INDEX | `claim_comment_reads` | `idx_ccr_comment_id` | `c14cb2b1d03761a610819ce118faafc44ed2e8f7e7a05fd481f5f6181ca86874` |
| 59 | indexes | CREATE INDEX | `claim_comment_reads` | `idx_ccr_user_id` | `841fa0815a73192177095d6e8887bd256e8bedda6cbae972a4aab4e86d97638c` |
| 60 | indexes | CREATE INDEX | `client_insurance_service_requests` | `client_insurance_service_request_number_idx` | `801c63b2679d8f5d8129c7be38d93a509e16f2681c9ee1aa55d128104e429f54` |
| 61 | indexes | CREATE INDEX | `client_insurance_service_requests` | `client_insurance_service_user_idx` | `ab736224b825db0ff18695a0b09c1d9fb84fa869b44524c02928bdd9d690564a` |
| 62 | indexes | CREATE INDEX | `client_vehicle_valuation_requests` | `client_valuation_request_number_idx` | `68d544efc7065413fb88411942aa425d47785b20c79dc5f9c435e59eed5cf2b8` |
| 63 | indexes | CREATE INDEX | `client_vehicle_valuation_requests` | `client_valuation_token_idx` | `61d7f1d66c865e33ffe972884801015988d3b68893ef7874a23b0125ae12fafb` |
| 64 | indexes | CREATE INDEX | `client_vehicle_valuation_requests` | `client_valuation_user_idx` | `ca6b192cba6d9134d0e1d7d49a19a840adc1555dbff19ae260f012efd57a886d` |
| 65 | indexes | CREATE INDEX | `engineer_observations` | `idx_eo_inspection` | `0e85a4dd77cf7eb35a9f76f12de9b103d7fbaa70bd910396dbe7433d18db4898` |
| 66 | indexes | CREATE INDEX | `engineer_observations` | `idx_eo_tenant` | `152203826b86b7730b9088808efb9e765b9c88382682859f3efcb4d9e27edb96` |
| 67 | indexes | CREATE INDEX | `engineer_observations` | `idx_eo_type` | `a01069457ec16d586cbfbd94e6f5f04185f07ff678b61160e9e3230cbda93369` |
| 68 | indexes | CREATE INDEX | `engineer_observations` | `idx_eo_severity` | `0cb0cc107cc5e0a2b6b10c6dfc1a403dbacddcf1aef7d0179a925653a26994ac` |
| 69 | indexes | CREATE INDEX | `engineer_observations` | `idx_eo_authored_by` | `ba9a112bf6bfe099d3cf3379ab53da937a4d5a145107e7bd205f06d93b459dac` |
| 70 | indexes | CREATE INDEX | `engineer_profiles` | `idx_ep_tenant` | `a17bae1eb3a09e920d14e06cabcd307f7aa81355f0ced51fa41684cac611e715` |
| 71 | indexes | CREATE INDEX | `engineer_profiles` | `idx_ep_region` | `39aa80c77e51b7809e65438993048a947d2ed8a54bf74366920aaae2c5a53b2e` |
| 72 | indexes | CREATE INDEX | `engineer_profiles` | `idx_ep_available` | `101d3b66209760fa08c430c194e95be667dc552608161d7f047a96d12cc76cec` |
| 73 | indexes | CREATE INDEX | `fleet_accounts` | `idx_fleet_accounts_owner` | `a5050150674925f04c4720715e90f617acbdb4239a6e86c0be9854f121b604a3` |
| 74 | indexes | CREATE INDEX | `fleet_accounts` | `idx_fleet_accounts_insurer` | `7bc135e6c068ee1c6ca4c4778ab1eeb4d697688089b0cb6f37442f2b165791dd` |
| 75 | indexes | CREATE INDEX | `fleet_accounts` | `idx_fleet_accounts_agency` | `3e83162d2cb648c2db8c1c65d076b29f1f6c00e345d85aebbdb3598aadf7c3a8` |
| 76 | indexes | CREATE INDEX | `fleet_accounts` | `idx_fleet_accounts_status` | `f664f67379b03dfbd9efc48cfcabd3eb5c59d951182839bae0043d67ba11460e` |
| 77 | indexes | CREATE INDEX | `fleet_drivers` | `idx_fleet_drivers_tenant_id` | `a9509194a2c5c1834c92cde8787f9fccdbab1a7fbc7b786975c908c4a9e42f1c` |
| 78 | indexes | CREATE INDEX | `fleet_drivers` | `idx_fleet_drivers_fleet_id` | `b3f0c278629cb5fd09442a82f2b437bdaad1ffff82fad203a2ae9ea7a2228011` |
| 79 | indexes | CREATE INDEX | `fleet_drivers` | `idx_fleet_drivers_user_id` | `5f5a15e3ccb3ff45108da2468f830841335e9d32a9a05893d8e7b879cfd53a01` |
| 80 | indexes | CREATE INDEX | `fleet_intelligence_snapshots` | `idx_fis_fleet_id` | `6ac7e93b95539e42131a963a4db81acccfd39682799b81e2cb1fb93d6305edee` |
| 81 | indexes | CREATE INDEX | `fleet_intelligence_snapshots` | `idx_fis_tenant_id` | `292bbb56d558687f87985a3a80915e05a39b626f45bde57b1fdf1f4786f31f4f` |
| 82 | indexes | CREATE INDEX | `fleet_intelligence_snapshots` | `idx_fis_generated_at` | `71cc93592c77ce240d3afd90e6e47b0496b794f26b2183c5281f2233cf78ff8f` |
| 83 | indexes | CREATE INDEX | `fleet_manager_requests` | `idx_fmr_user_id` | `07b5169edb0ea7778009c795b759ed4950a4a6a8fff1b9bffced7691b16eb2c0` |
| 84 | indexes | CREATE INDEX | `fleet_manager_requests` | `idx_fmr_fleet_account_id` | `62e454c98499f2db5bcf36ff366a3db023d0cb5b73711e2f2d5da0ae0919afa4` |
| 85 | indexes | CREATE INDEX | `fleet_manager_requests` | `idx_fmr_status` | `592aebddaa0e91f0eefdc0270a24694abf36b795409fcba887db05c517de0a4e` |
| 86 | indexes | CREATE INDEX | `fleet_manager_requests` | `idx_fmr_created_at` | `acca345214d5fe5b5307a2f2b37743a0387d3738d573e556aea0060e583f5ab2` |
| 87 | indexes | CREATE INDEX | `fleet_rfq_client_instructions` | `idx_fleet_rfq_instruction_agency_status` | `1cdcf3e6b785b3ef613c39ac09fbf787996e45bebc21263d73e88031db77bc6b` |
| 88 | indexes | CREATE INDEX | `fleet_rfq_client_instructions` | `idx_fleet_rfq_instruction_fleet` | `f9e176243879e265ab84ac88ef92be9d9a15a478d808fe8b3459c0e78284451f` |
| 89 | indexes | CREATE INDEX | `fleet_risk_scores` | `fleet_risk_scores_vehicle_id_unique` | `c02d7e6f4890b082b848a5b4490f00dda4706c4c59bd26a465b7bffa0e46918e` |
| 90 | indexes | CREATE INDEX | `fleet_vehicles` | `fleet_vehicles_vin_unique` | `e819a85fd051621bf382adea9ec599a6131c05077846b409e5d38412f9973cdf` |
| 91 | indexes | CREATE INDEX | `fleet_vehicles` | `fleet_vehicles_registration_number_unique` | `869e3156263feb0ec037947519b6ec73833b8ef22cd4efba6792bdd3136db867` |
| 92 | indexes | CREATE INDEX | `governance_audit_log` | `idx_gal_claim` | `9708d180c827c92b06f9f1c5798751f646a6616dad33cf66701708afd2eebae9` |
| 93 | indexes | CREATE INDEX | `governance_audit_log` | `idx_gal_tenant` | `74ae5e7ba701b99956dbb54303d84df167241ecf84357a712a3adbfea71626ed` |
| 94 | indexes | CREATE INDEX | `governance_audit_log` | `idx_gal_action` | `6dd5817e3eaee524ce5f592cf490be7779fba4ae793b105b584bb67e2ae83a1c` |
| 95 | indexes | CREATE INDEX | `governance_audit_log` | `idx_gal_timestamp` | `5ff987efa5648a4bbd3c9ca051ee448e29572fd16a97bed93c662e68aa1cafbb` |
| 96 | indexes | CREATE INDEX | `governance_audit_log` | `idx_gal_override` | `96ae3599c3362c16e94391dd61437531752d348b8ea28f098a1a8ac6a2555c12` |
| 97 | indexes | CREATE INDEX | `governance_notifications` | `idx_tenant_id` | `57c1bd9cd66798976c49cecd3cdbf42d0d19a9829a9ecf11979fc027b6567df7` |
| 98 | indexes | CREATE INDEX | `governance_notifications` | `idx_claim_id` | `4082af3dd2836f26cd2015c446e32b0e1d18e13fdc9623e901e339b3275efd4f` |
| 99 | indexes | CREATE INDEX | `governance_notifications` | `idx_read_at` | `5a93184ffaa42afbeca3ae9b29c7fb9cc1f0f3774e0084d127aefdda201e5e0a` |
| 100 | indexes | CREATE INDEX | `governance_notifications` | `idx_created_at` | `72569b87ad56b6003e3cc463f5bc2ad2fb71e63c0c278433a74841aaf2e6fc48` |
| 101 | indexes | CREATE INDEX | `governance_violation_log` | `idx_gov_violation_tenant` | `4553ef3ad538a1cb114341bd9652af865c5d1f39fac1d9425c905b53156c0b5a` |
| 102 | indexes | CREATE INDEX | `governance_violation_log` | `idx_gov_violation_user` | `7c29fcdb964fd2b38655213e7f2c38eaf2f5f6591da882a43739a1c9b6df433d` |
| 103 | indexes | CREATE INDEX | `governance_violation_log` | `idx_gov_violation_type` | `c24e6a46e154ea573dc629f232cb8903b72f00257c62c5f3f5d7553f841d4d99` |
| 104 | indexes | CREATE INDEX | `governance_violation_log` | `idx_gov_violation_at` | `7cf4e8cfb489af645c8dbf9246a4d5ddb46275e9cf6263c7b8acca1fc5aceaeb` |
| 105 | indexes | CREATE INDEX | `governance_violation_log` | `idx_gov_violation_tenant_time` | `3091425e7a98c38ef6170115b91debca3ce110bc208e25975498e6c98fa15025` |
| 106 | indexes | CREATE INDEX | `notification_events` | `idx_ne_idempotency_key` | `00b1ecb514c6f8102a65955606393cb388b0338cdc3e9182acdd8ee4bd4379c3` |
| 107 | indexes | CREATE INDEX | `notification_events` | `idx_ne_recipient` | `10b6a01f500bb87b91c2e4cba2095bc047dd50d29270f7595f2cad7c2c8171a4` |
| 108 | indexes | CREATE INDEX | `notification_events` | `idx_ne_event_type` | `5f27c8a7b97482b934559adcdeb3ab3637e74ee7150f03856ad08a6a331e9987` |
| 109 | indexes | CREATE INDEX | `notification_events` | `idx_ne_created_at` | `5d9d641d7d7b339b8fcb52b6ddce5177b8a378df17faee0ae062bf8c68965a2a` |
| 110 | indexes | CREATE INDEX | `notification_preferences` | `idx_notif_pref_user` | `92eed1cd8cf45070adbe0daa7a28edd513d94dac9e32d25540e13fa8fd70c66a` |
| 111 | indexes | CREATE INDEX | `notification_preferences` | `idx_notif_pref_tenant` | `ebfb25b64da4f5e700208b0e7cacff0cdf318267fcb60f9ee56ade1834c735c7` |
| 112 | indexes | CREATE INDEX | `platform_governance_limits` | `idx_gov_limits_version` | `41ead3a8e570fac9b7b9c583aadcf86a4cf52f2333f1cd01cbc1a169fb588c5f` |
| 113 | indexes | CREATE INDEX | `platform_governance_limits` | `idx_gov_limits_effective` | `df72cc7f2dc4bf881a8ebec07ea69dfcf894741396760632a1b69d6619bdd0b3` |
| 114 | indexes | CREATE INDEX | `rate_limit_tracking` | `idx_user_tenant_action_window` | `eda86d82cab4105ee1afc3e42732baf90f9fa4494c0348eea3b16f0da6009a61` |
| 115 | indexes | CREATE INDEX | `rate_limit_tracking` | `idx_window_start` | `c5adcb8e263ebe1d5363eba9e708f94de8b3d316ade845d1ad7faeb3def48d01` |
| 116 | indexes | CREATE INDEX | `recovery_cases` | `idx_rc_tenant_id` | `4165431f82353e164691ab1a8819f764de767d9c9904e862e25dfca2e3fe2505` |
| 117 | indexes | CREATE INDEX | `recovery_cases` | `idx_rc_claim_id` | `04a3159d8f92639f9e6e7a83ad272007fd82dd72c283463c573750cfa79e4d08` |
| 118 | indexes | CREATE INDEX | `recovery_cases` | `idx_rc_status` | `c4fbb3acb1714969dbded93b22948a931768fd8b6fda297774707271b2dae14c` |
| 119 | indexes | CREATE INDEX | `recovery_cases` | `idx_rc_tenant_status` | `f4819870dd01ac28833ebb00f864aebf819e31ac4dc70d0d5f54a8a108706084` |
| 120 | indexes | CREATE INDEX | `recovery_cases` | `idx_rc_assigned_officer` | `5a8a38ec62db6d877b65850f178349a2bac6b1e8e451399a79b22799e070496a` |
| 121 | indexes | CREATE INDEX | `recovery_cases` | `idx_rc_rps` | `62d3f962be0f609406cb20497b69dbede3ddcd549896e0518eb21a73456450c8` |
| 122 | indexes | CREATE INDEX | `recovery_cases` | `idx_rc_recovery_deadline` | `58668a66eef6ec5a7c37bf8108d5e3163c6bb77bf03301bff87c30ce7b3b3d7f` |
| 123 | indexes | CREATE INDEX | `recovery_correspondence_log` | `idx_rcl_case_id` | `c31d6bd5a1d5aed81bbfacbb68a7e858464bf3789951cf6313b63c81d2e5ca17` |
| 124 | indexes | CREATE INDEX | `recovery_correspondence_log` | `idx_rcl_tenant_id` | `38702f43abe3b8ce7e126033bb6bb441dd02e268963b2ae8cf7bb3c5481ff90b` |
| 125 | indexes | CREATE INDEX | `recovery_correspondence_log` | `idx_rcl_created_at` | `4db3cac9242792376dd35eaa2274574baff30e0042f888e868a1b8423af90c17` |
| 126 | indexes | CREATE INDEX | `tenant_workflow_configs` | `tenant_id` | `b47c0ec43463e80d2447978416d40b907d6046bb237d50bdba9a97b30587afba` |
| 127 | indexes | CREATE INDEX | `whatsapp_sessions` | `idx_wa_phone` | `21045d37b01bfa1621714ecbaba66aa9f2b004096276ea897d9d89bb1fb91a04` |
| 128 | indexes | CREATE INDEX | `whatsapp_sessions` | `idx_wa_status` | `a0a09eab1a6ece622240325cb233af77c086dded0130ef1fd209ac5d4de5bdae` |
| 129 | indexes | CREATE INDEX | `workflow_audit_trail` | `idx_workflow_audit_claim_state_time` | `ee0a2afa4389024a95dd832e63e9ef8693cfa2ef8a6a9a8555f2185822b99795` |
| 130 | indexes | CREATE INDEX | `workflow_audit_trail` | `idx_workflow_audit_override` | `b3ed17ee74473317aa38ae061cbcaa88569e036ed637913b2b88ec2362b40d0d` |
| 131 | indexes | CREATE INDEX | `workflow_audit_trail` | `idx_audit_claim_timestamp` | `e0f8013b005f1ea6dd9eefa6e76a6fd8c02894f289feb02b24e33ec8db0eed79` |
| 132 | indexes | CREATE INDEX | `workflow_configuration` | `tenant_id` | `d7a9515ed0209d0670d3bfdecdeadc184710bc5867839042c74a8c5044dfcb65` |
| 133 | indexes | CREATE INDEX | `workflow_templates` | `idx_wt_tenant_id` | `8813264b5775ef807d9f64e7754d184f53891c45e01498f12a0de82789abac53` |
| 134 | indexes | CREATE INDEX | `workflow_templates` | `idx_wt_is_default` | `ebc88150fca05f6c22ab34c503a4e786132315dbe142328c40bb16b6e8500f92` |

## Reproducibility command

```bash
node scripts/generate-d04-statement-ledger.mjs verify audit/gate-d-text-index-compatibility-2026-09-14/wave-04-tidb-compatible-source-v2.sql audit/gate-d-d04-statement-hash-ledger-2026-09-14.json
```
