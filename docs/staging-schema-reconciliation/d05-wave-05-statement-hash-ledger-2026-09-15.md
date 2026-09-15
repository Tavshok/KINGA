# D-05 Wave 5 Marker-Split Statement Hash Ledger

This record is generated deterministically from `audit/gate-d-text-index-compatibility-2026-09-14/wave-05-tidb-compatible-source-v2.sql`, the revised TiDB-compatible final Wave 5 execution source. The historical Gate C source remains immutable. Before generation, the source passed a compatibility audit for literal marker framing, JSON-shaped TEXT defaults, and plain TEXT/BLOB indexes. The source is split only on the exact literal `--> statement-breakpoint`; each non-empty fragment is UTF-8 trimmed, retains its terminal semicolon, and is SHA-256 hashed.

| Control | Value |
|---|---|
| Revised full-source SHA-256 | `416de72140bb50ea254031c841e9ee1d027bc710d5fc9aba5b6c074e487764df` |
| Literal markers | 290; one empty terminal fragment excluded |
| Executable statements | 290 |
| Class totals | 75 `CREATE TABLE`, 25 `ADD FOREIGN KEY`, 190 `CREATE INDEX` |
| JSON companion | `../../audit/gate-d-d05-statement-hash-ledger-2026-09-15.json` |

> Do not submit the raw source through `mysql < file.sql`. The `--> statement-breakpoint` literal is repository tooling, not a MySQL/TiDB comment. This ledger is review material and grants no execution authority.

## Ordered execution ledger

| # | Phase | Statement class | Table | Object / constraint / index | SHA-256 of emitted SQL |
|---:|---|---|---|---|---|
| 1 | tables | CREATE TABLE | `—` | `access_denial_log` | `71bae7a3bef8ac36916c897dc9d354bb0888c0126cfd008bf02f3045a92a1925` |
| 2 | tables | CREATE TABLE | `—` | `anonymization_audit_log` | `74bc5c82a935ef7637a3a765d1f65bdbaf9f91a8b58cc5b607ff603c581d64de` |
| 3 | tables | CREATE TABLE | `—` | `appointments` | `c6f8286aafc2f5841cc2460bb0517acea336b0878b79d6b103e3d189dff0633d` |
| 4 | tables | CREATE TABLE | `—` | `assessor_deviation_metrics` | `c741265f6eeb9d42b2ac8bda4aae2c1b6ae967f8a62b63b4b74e035d35c33673` |
| 5 | tables | CREATE TABLE | `—` | `assessor_evaluations` | `f55a9496bcb7b472770951d3a3bb08418e6c56c6b166f952359b7b9e6e405113` |
| 6 | tables | CREATE TABLE | `—` | `assessor_insurer_relationships` | `af5e9bec7fa1f7ff4a4401058850ffd387740308573be66a8cf921a73fff55db` |
| 7 | tables | CREATE TABLE | `—` | `assessor_subscriptions` | `6d6a771e974a855a78ceb5d8801e4865ae5c47c58f2316b20ab18da80ff66129` |
| 8 | tables | CREATE TABLE | `—` | `assessors` | `a4d6dcafb6c0bf668a4f7ea35bf3ad554871bb0d09ca7ffdc9b3a198945b3296` |
| 9 | tables | CREATE TABLE | `—` | `asset_registry` | `19a3331333f6fcaeb95d820897c6a84d6fb61c2fb87b38fb117051120c704ac8` |
| 10 | tables | CREATE TABLE | `—` | `audit_trail` | `3d206b365fb92009e092385a832f423175ce127d13c11606c86612afaafad0dd` |
| 11 | tables | CREATE TABLE | `—` | `automation_audit_log` | `78fad491ec9deeb0aba6cbc7f0e5c8fd5644dbd9075d1e48c3ea8173153a2dc6` |
| 12 | tables | CREATE TABLE | `—` | `bias_detection_flags` | `65371eb666202b7c422bf14001dfc5cc0128d534e4780ea9763326b8a1d42d14` |
| 13 | tables | CREATE TABLE | `—` | `calibration_overrides` | `f44db54e7c4afb52fe11db57934c1e1a707966a0d115c98cfb8e4ff39476fa82` |
| 14 | tables | CREATE TABLE | `—` | `claim_approvals` | `e1bb3036bda5b617ba3c111c35428b89438d3d3495b525ab012b335127d12542` |
| 15 | tables | CREATE TABLE | `—` | `claim_events` | `4cf6ef3a9a93c2b51e1a39a2459056ebbcc96f9dae9900b2ba528f4b001eb74e` |
| 16 | tables | CREATE TABLE | `—` | `claim_intake_requests` | `8a9fcaf86c40d1e8301131297d9eab15b87c49c3d121c07a1eeb6cb2860414cc` |
| 17 | tables | CREATE TABLE | `—` | `claim_intelligence_dataset` | `341cb71aea2aa9609990a31e554282e1a81c9344fdef39dd5c08d2cbde6fc254` |
| 18 | tables | CREATE TABLE | `—` | `claim_involvement_tracking` | `34a6246f642a2effcf75e2a7a328fb5b9b8ca6b29e2cfd69f1d88c468a4dd488` |
| 19 | tables | CREATE TABLE | `—` | `claim_review_queue` | `8e89a9dc3006aa19c57b2df9250ad571036c687c9812b9093134939b70f602c3` |
| 20 | tables | CREATE TABLE | `—` | `commission_records` | `2582f43f49afb776836b2f42081b14a21cae592dec7b58c32945e5036e3c4de7` |
| 21 | tables | CREATE TABLE | `—` | `component_benchmarks` | `da72d0a85fe11341abcb3dd3bd6edd86e6f7f18b053260bee3d8be2a3648a002` |
| 22 | tables | CREATE TABLE | `—` | `cross_claim_signals` | `8772b7143ad3b9d5682dc284fd975e98bd50128169f317381423fa69ed7d24b4` |
| 23 | tables | CREATE TABLE | `—` | `customer_consent` | `1244da42b6d081ed13be117a7289e2cc51ea988bf300fb5fc497ab1a1a2fe3ca` |
| 24 | tables | CREATE TABLE | `—` | `dataset_access_grants` | `0767c0c18f06d8b34e8ce9133e39151c1ed224def6ca826482284aa979a461f3` |
| 25 | tables | CREATE TABLE | `—` | `driver_claims` | `28f6e51495f63a642e35bca9ee0229dd39e35f92815effc3fb4adfc18e59f1a5` |
| 26 | tables | CREATE TABLE | `—` | `fast_track_config` | `e2a94c734e14685d2620391abf4ec96bb101805435132fc1028259a5500841c8` |
| 27 | tables | CREATE TABLE | `—` | `fast_track_routing_log` | `9b19242f1645632d1d95dff25eb9d3dbaf90822df2a0d361683454f72ee92975` |
| 28 | tables | CREATE TABLE | `—` | `federated_learning_metadata` | `0eaa794309e1c731ec2781d1f4181af6b3a968e508a6d68eb8a3efa03d46602f` |
| 29 | tables | CREATE TABLE | `—` | `final_approval_records` | `8713b43906f927c64a2f6a12be551a764692dd09ff43695fecc2ae905312bafb` |
| 30 | tables | CREATE TABLE | `—` | `fuel_records` | `618c8db9f4d5a7b91c838de519314422c4bc90919ac0ded60ce90d793d57507b` |
| 31 | tables | CREATE TABLE | `—` | `global_anonymized_dataset` | `d5510b2171d68143c7c8499269773796c60af1ab1236876b387436e4adf20441` |
| 32 | tables | CREATE TABLE | `—` | `global_search_analytics` | `599b2fac319e4e334ea019008d9a84e3fe42cbc24574990c72466c705bbe6617` |
| 33 | tables | CREATE TABLE | `—` | `global_search_history` | `22c082c21c4fd10ae8b0ab92adc30d23a3369df96f6b18f847f3554d51d3d8eb` |
| 34 | tables | CREATE TABLE | `—` | `historical_claims` | `ec1bdbdb86d09caabf38afd650dfbff0855b0762f4db834629881587f8c160a7` |
| 35 | tables | CREATE TABLE | `—` | `historical_replay_results` | `67db68852f7031c431aa40c9fae9e5e551aed937acb12aacd890465f0a933d6a` |
| 36 | tables | CREATE TABLE | `—` | `human_review_queue` | `2666eb7f191ea26144e21f9da0291b78df330e6f19a14efb4d1f0a293b59a9db` |
| 37 | tables | CREATE TABLE | `—` | `ingestion_batches` | `9679d53e9725a9ac873a0ae195f48be66ef0063e70e15c028d4f782fa8545fa3` |
| 38 | tables | CREATE TABLE | `—` | `insurer_tenants` | `cd347dc51b72418a4e042abbbbce8d983fc29e23c25316c1e59966a7c5de62eb` |
| 39 | tables | CREATE TABLE | `—` | `iso_audit_logs` | `c87e468333a464c9e07915be5239a3aa56d922e80bce3f383d553e8d5e1dd659` |
| 40 | tables | CREATE TABLE | `—` | `licensing_records` | `0045a90d2df88b46aba884a40a82e8931ddc19aa1831de56d350570aacef1e94` |
| 41 | tables | CREATE TABLE | `—` | `maintenance_alerts` | `1b66e6a0ca6e3e098dda9a114dec75a790bbe4b3e5728611e5f36be57eb05690` |
| 42 | tables | CREATE TABLE | `—` | `maintenance_records` | `b65bc149f1ef444308871da7881f80c5e8d2c44f3296d6b55ebfa16e8c093cd3` |
| 43 | tables | CREATE TABLE | `—` | `maintenance_schedules` | `a44a4f9df688117f20ae4da390eae198534b816e71ae940edd559983b6d76c41` |
| 44 | tables | CREATE TABLE | `—` | `mismatch_annotations` | `8c4388aa8fae55a48268f5b64296b826d291d9c51ea4051d9833d45f0d57533a` |
| 45 | tables | CREATE TABLE | `—` | `model_training_queue` | `4f50ba970a498b6e90e43faaa375042ad35b2f7c23c7d1a38e54987e196fadc9` |
| 46 | tables | CREATE TABLE | `—` | `multi_reference_truth` | `7196905bc72a7b11e78d8054fd49ca3eda5981e123bd6e3538f5a011cbf29f2e` |
| 47 | tables | CREATE TABLE | `—` | `narrative_versions` | `131129218299d0302773aeb42045908c4783263b1bac21570cf2be401acdc6db` |
| 48 | tables | CREATE TABLE | `—` | `parts_pricing_baseline` | `be80e483d27cf0d673b8d8929655ca7bde6237fc56a26b7ccab58e41e20e6e66` |
| 49 | tables | CREATE TABLE | `—` | `personal_vehicles` | `5a3fac3dbf7374d5359d318ae82cc451171150b2d65b6d2d12674e9596756fb8` |
| 50 | tables | CREATE TABLE | `—` | `physical_measurements` | `0cb610506e7241a18e0cb2ecd927cb562b362da36dc9527fdce6c38f3a9c40a1` |
| 51 | tables | CREATE TABLE | `—` | `pipeline_jobs` | `07da93ca51954bd66346307e5230a945479ff5a40b03bfa59fd03edbdb7f2f4b` |
| 52 | tables | CREATE TABLE | `—` | `pipeline_runs` | `aec372e96062a8033977e2ac9cc1764863eb326040bd5206e70f8317a8126571` |
| 53 | tables | CREATE TABLE | `—` | `policy_claim_links` | `d947ba1ed508ce5ab1390c9fc7cff4219ab3ee8088dbca68d351f90af83ab414` |
| 54 | tables | CREATE TABLE | `—` | `policy_endorsements` | `940a7b6be35518a6776ba25b8cdaab23d1a20e0fb5ed862eff6a80c1ca742bbf` |
| 55 | tables | CREATE TABLE | `—` | `predictive_risk_scores` | `53e82a6847617112d022c39f4ed110b587752d4fc4c64461c2442ea9618efe3f` |
| 56 | tables | CREATE TABLE | `—` | `quotation_requests` | `cb61c0b54437da49cc691f7676e84f8a8780ca585cfea498ec2aeb7e555f64df` |
| 57 | tables | CREATE TABLE | `—` | `replay_logs` | `96afa1444f3eaecd040e6919d58d99a826468abee5ef4e204962f0da261be955` |
| 58 | tables | CREATE TABLE | `—` | `risk_register` | `0742b157f38eba6315df6b68cec0f18add8a5093b74928200c7622389a44d6a2` |
| 59 | tables | CREATE TABLE | `—` | `role_assignment_audit` | `3bffa322862e6c479adb16cdcf9fdfa0dec8754ec641c065931bd2a3f0ce7d4f` |
| 60 | tables | CREATE TABLE | `—` | `routing_history` | `bc5d67e31ab96e5ae6aa90d339829068d75ea778b20608cf5c6985868857d69e` |
| 61 | tables | CREATE TABLE | `—` | `routing_threshold_config` | `5788051bd4c9aa0db89bb4b6352a2b17f76f82c635b6660440430283507c92b8` |
| 62 | tables | CREATE TABLE | `—` | `service_providers` | `687f5789c1069d06f68e74819157388d8ead752d71f85f82cabe0256a9159511` |
| 63 | tables | CREATE TABLE | `—` | `shadow_override_monitor` | `b1fe984eeef79d5dac5952bb7ceabc36337ab47038065c935d63e057817efe57` |
| 64 | tables | CREATE TABLE | `—` | `similar_claims_clusters` | `c31f051f0044552573433c55e8d41aa09d2d253f5ea310681803dffab3024fb2` |
| 65 | tables | CREATE TABLE | `—` | `super_audit_sessions` | `4ab6953a076615bb30b3c27a07b0640de0a974d4a09c406f1be564f27c02d2a7` |
| 66 | tables | CREATE TABLE | `—` | `supplier_performance_metrics` | `0068181990174e06370121e4052dd98e20f5fc5f015e7e01b1f117646e2531a3` |
| 67 | tables | CREATE TABLE | `—` | `system_errors` | `a6453bee205d492ea9c4334a1bbf033f7def33e263a8d25381c247ce5ce9104d` |
| 68 | tables | CREATE TABLE | `—` | `tenant_isolation_violations` | `7ded04b9869cc0f01ecd62ec77860c4b4acc6d65aeb3064c99e7bdfc24628c14` |
| 69 | tables | CREATE TABLE | `—` | `tenant_role_configs` | `43b0d1c4e003871154b8e7fb199b84d9dd424461bab1c4290f41f76059c20375` |
| 70 | tables | CREATE TABLE | `—` | `third_party_vehicles` | `8eade053199b5fbb99e5fa279283f4cc1f68742b3359d86cffb1a0ec6e3c1172` |
| 71 | tables | CREATE TABLE | `—` | `training_data_scores` | `6b9a7e2ee86a6b7e24560dbbe8f344ae86e97c0e8192b8e880905446a6d9a24b` |
| 72 | tables | CREATE TABLE | `—` | `training_dataset` | `748c0a78d02b39950332bda13640a70fa058392494f48efed652f00f7ffeeae7` |
| 73 | tables | CREATE TABLE | `—` | `usage_events` | `5fa4588a3116f2dea15f3913cf859e3f7c33adb04e23b818ea0a4631a47c0220` |
| 74 | tables | CREATE TABLE | `—` | `variance_datasets` | `d61cad7a14cdba4481fe5e3482421a7f2745fe77532b02cc2abc4dc6ca6202b6` |
| 75 | tables | CREATE TABLE | `—` | `weight_adjustment_log` | `1c3221ad8916ac8aca26567f3d58e4e6ad26702f63693cd47a931a269d25727d` |
| 76 | foreign_keys | ADD FOREIGN KEY | `appointments` | `appointments_claim_id_claims_id_fk` | `92634c3f78a3f4fac37a59c006b1fc3225eec78b1f5d70e2da326e9a0576475d` |
| 77 | foreign_keys | ADD FOREIGN KEY | `assessor_evaluations` | `assessor_evaluations_claim_id_claims_id_fk` | `78eaf1a57fd3f907918bd8afc8171eab20a6f3cac954a13fc52c7452e34b2961` |
| 78 | foreign_keys | ADD FOREIGN KEY | `assessor_evaluations` | `assessor_evaluations_source_report_id_assessor_reports_id_fk` | `5b9f1d09b8d8b840cb69742e3ef9ae49c5ebb97aa545d2f063efc9a70485575d` |
| 79 | foreign_keys | ADD FOREIGN KEY | `assessor_evaluations` | `fk_ae_accepted_review` | `bd34cdf6a7497c8973ff6530a4a49d7a26ed57a8e87d13035aea5973a311c2c4` |
| 80 | foreign_keys | ADD FOREIGN KEY | `audit_trail` | `audit_trail_claim_id_claims_id_fk` | `baef788d6dfbb51422d5e863363ef8ec37bba54c02d80965adf7593b515dd1ec` |
| 81 | foreign_keys | ADD FOREIGN KEY | `automation_audit_log` | `automation_audit_log_claim_id_claims_id_fk` | `546b7a2007e7a2476804f59b6f9668b677862ce1c7f641d9feadc2182ad05dcb` |
| 82 | foreign_keys | ADD FOREIGN KEY | `automation_audit_log` | `fk_aal_confidence_score` | `19892741bd2c02a451eab2b966554785df86974ffe2d73dad0cc843725c76d71` |
| 83 | foreign_keys | ADD FOREIGN KEY | `automation_audit_log` | `fk_aal_routing_decision` | `fff6203f0fc3d889d6a97453a2ffeee102f042211c563953b04fa6dc0f184995` |
| 84 | foreign_keys | ADD FOREIGN KEY | `automation_audit_log` | `fk_aal_automation_policy` | `cf26640eef56aa2d39292f85236afcf6c7a22f61b229a47140baa52fe0c81f12` |
| 85 | foreign_keys | ADD FOREIGN KEY | `claim_approvals` | `claim_approvals_claim_id_claims_id_fk` | `a2746924ac213a12e57c63a72fc3409f6dbf5ff8483631a2fea9571030090531` |
| 86 | foreign_keys | ADD FOREIGN KEY | `claim_events` | `claim_events_claim_id_claims_id_fk` | `b4342a414b0dd8bd17b95b656958de33b1e80f0a1b01e74b4c4fe246145a01c4` |
| 87 | foreign_keys | ADD FOREIGN KEY | `claim_intake_requests` | `claim_intake_requests_claim_id_claims_id_fk` | `86553f387e33553f7d95dbba2f84c97dc8e286a150d64069a938e7d3ebed821a` |
| 88 | foreign_keys | ADD FOREIGN KEY | `claim_intelligence_dataset` | `claim_intelligence_dataset_claim_id_claims_id_fk` | `344db4b36093d9328f2947fcce7eac291c06bc84e49218b3f5c568bf586da669` |
| 89 | foreign_keys | ADD FOREIGN KEY | `claim_involvement_tracking` | `claim_involvement_tracking_claim_id_claims_id_fk` | `aa1f6482427dcd0024d3815f0bdb7fef78c71ff9d0c37ca4b1776262e2a278e1` |
| 90 | foreign_keys | ADD FOREIGN KEY | `cross_claim_signals` | `cross_claim_signals_claim_id_claims_id_fk` | `d01e11ea59237880ff0d1f9ee2100de19707ab1874a7a82ff9c786c7fd354139` |
| 91 | foreign_keys | ADD FOREIGN KEY | `driver_claims` | `driver_claims_claim_id_claims_id_fk` | `7a69a699561186f24c6d6812e3ffe9009614e07ee779442a94a68e4da6068c63` |
| 92 | foreign_keys | ADD FOREIGN KEY | `fast_track_routing_log` | `fast_track_routing_log_claim_id_claims_id_fk` | `ee60c7d5d6b8761b94bd6baa54b1026cd91697126d1777e64e0b97cdb9275f79` |
| 93 | foreign_keys | ADD FOREIGN KEY | `mismatch_annotations` | `mismatch_annotations_claim_id_claims_id_fk` | `def2dcd59937469a5783d1c2af8b5bb019bd3af30b20d66c16b73fa776a2aa69` |
| 94 | foreign_keys | ADD FOREIGN KEY | `model_training_queue` | `model_training_queue_claim_id_claims_id_fk` | `48b537da8b5508308af715af9922ab7a9e92f0c3cdf5b52c6fd32bad94619d16` |
| 95 | foreign_keys | ADD FOREIGN KEY | `narrative_versions` | `narrative_versions_claim_id_claims_id_fk` | `877495d9647df072eb90281f340919620677c6f43d1adb6fbe6ea44ac0c736e1` |
| 96 | foreign_keys | ADD FOREIGN KEY | `policy_claim_links` | `policy_claim_links_claim_id_claims_id_fk` | `f088c1eeafff7948e535f4edba1af27cc42dd49b872fc1bce778ee0f70caa9b9` |
| 97 | foreign_keys | ADD FOREIGN KEY | `risk_register` | `risk_register_claim_id_claims_id_fk` | `ce2de4fd4ca20792dedd7bb8054e2ac4c2c8a7335259d78660462bd4c875205e` |
| 98 | foreign_keys | ADD FOREIGN KEY | `routing_history` | `routing_history_claim_id_claims_id_fk` | `7ad23fa043c3b2e68e7512ed8c60a9b31f5a9858e48ade9bb44bbf8d1faec9c4` |
| 99 | foreign_keys | ADD FOREIGN KEY | `third_party_vehicles` | `third_party_vehicles_claim_id_claims_id_fk` | `863629929eaf74f868940d775a44542f4653577179c1e23e30a9ea52506a5106` |
| 100 | foreign_keys | ADD FOREIGN KEY | `usage_events` | `usage_events_claim_id_claims_id_fk` | `73bee7053dd72aeb49a3c2c21986b1009725f9a4e267e9d1de6f49300a78a863` |
| 101 | indexes | CREATE INDEX | `anonymization_audit_log` | `idx_aal_source_record` | `3be16b3a1d3c6c9128e3657b6aae9838310d777c02041f289bae0ec85449d83c` |
| 102 | indexes | CREATE INDEX | `anonymization_audit_log` | `idx_aal_status` | `709ed5f1567c9a2c413d4dfb8639a8cab528cd6fc962ade05ba912bdf0f4c2b1` |
| 103 | indexes | CREATE INDEX | `anonymization_audit_log` | `idx_aal_anonymized_at` | `94fad3c02fe785e5a4686dc05e77c87c2a1e8607f63c13c1394df33b7a6474df` |
| 104 | indexes | CREATE INDEX | `assessor_evaluations` | `idx_evaluations_claim_id` | `36448d90d1b6117719edf603a7e813767cf7b0a8cec929e11fd1ece44ba2c654` |
| 105 | indexes | CREATE INDEX | `assessor_evaluations` | `idx_evaluations_assessor_id` | `6ac25671383071e0618b7e02d9110d8f1563a87717bf8cdd9d146dd1f48b6db4` |
| 106 | indexes | CREATE INDEX | `assessor_insurer_relationships` | `unique_assessor_tenant` | `e5a3d559646593c2c5f61020aa327f8fa5346416ce526885587636d7fa92a22d` |
| 107 | indexes | CREATE INDEX | `assessor_insurer_relationships` | `idx_tenant` | `f36c17fb78c097e8ed19237d7b83a75123395be4b6deb05b8a53e24766ba7f57` |
| 108 | indexes | CREATE INDEX | `assessor_insurer_relationships` | `idx_type` | `6c3fabc2d7153bb2a86a91ab34c82ed6f2da919c9ed0d7a7f7337803820f51ef` |
| 109 | indexes | CREATE INDEX | `assessor_insurer_relationships` | `idx_status` | `f59fd3475698cff7633fa34d92e2c7ec10d2639481b0997b7649155d2ed696c4` |
| 110 | indexes | CREATE INDEX | `assessor_insurer_relationships` | `idx_preferred` | `744171c065e4e0d5755e693dcdac4a6bd608877bb306316ff238b179b294fdc3` |
| 111 | indexes | CREATE INDEX | `assessor_subscriptions` | `idx_asub_profile` | `22cf9e8cda07e84bd088e61659ec50f83b3897cc4f949a12407ea29ba71ec403` |
| 112 | indexes | CREATE INDEX | `assessor_subscriptions` | `idx_asub_user` | `916f0faa68664f4ff36069cf5f4f63449fe28b6a6ffb09a1e605f369d60ed7df` |
| 113 | indexes | CREATE INDEX | `assessor_subscriptions` | `idx_asub_tier` | `20cad1e729fb054edddf2152ca24b4b4264c5086816f6b5525fc8a3d862b42ab` |
| 114 | indexes | CREATE INDEX | `assessors` | `idx_type` | `2960155323b42337f7adf4a4002d0d07d299c8a32d50bb5d4c051990c26b9202` |
| 115 | indexes | CREATE INDEX | `assessors` | `idx_marketplace_status` | `34ae6bb709988f294ba5def8a32357d25c7ab47ec4568d652e874705c60763c4` |
| 116 | indexes | CREATE INDEX | `assessors` | `idx_primary_tenant` | `8d72d0fbb6289e58b92ed4601ee745a7f3709a17505e9f89160bdf58fd331e70` |
| 117 | indexes | CREATE INDEX | `assessors` | `idx_performance` | `2f3aff49b071d71000a92acf79775b2589f943639087f75bea82bbad8552db76` |
| 118 | indexes | CREATE INDEX | `assessors` | `idx_rating` | `c745a17d332e092b2d44f0831eb335ade055d06ffc78965cd5489a9bb3496308` |
| 119 | indexes | CREATE INDEX | `assessors` | `user_id` | `c83804bd321a99a0102003d12b03fe4824a270f3e4b89d97e52a26f7bec0c77c` |
| 120 | indexes | CREATE INDEX | `assessors` | `professional_license_number` | `8d07eb1c4e9511707b82f5db27fcdd096dd75082bdc6997fe91b2b3e4e3572b1` |
| 121 | indexes | CREATE INDEX | `asset_registry` | `idx_ar_tenant` | `56c6bdb68dfa3eafee560341ad103ced00ec0ee924f21432fe453fd4ac7e38e1` |
| 122 | indexes | CREATE INDEX | `asset_registry` | `idx_ar_type` | `5bf8e3af75ce498b90ae09d9f4c28c8ab3d8482e74910efd00fcd9ac5a2b562f` |
| 123 | indexes | CREATE INDEX | `asset_registry` | `idx_ar_vehicle_reg` | `40d7b39a9ad074248c927c1e47a5bccb30ce1044cdf37a077615eb4702ac5820` |
| 124 | indexes | CREATE INDEX | `asset_registry` | `idx_ar_owner` | `ffac37ffa269062a06864387e31d535388dacb338cb9d6511e016475b7a747f0` |
| 125 | indexes | CREATE INDEX | `audit_trail` | `idx_audit_claim_id` | `0ba71613b7a8fccd4d69825c018f1034c289240a2802f3fcb8f49defb2df3afe` |
| 126 | indexes | CREATE INDEX | `audit_trail` | `idx_audit_user_id` | `630c48b7aa04a4f7857abef223653438f61c14763b84bdd4b27fa71ce8ca4114` |
| 127 | indexes | CREATE INDEX | `audit_trail` | `idx_audit_created_at` | `3ee062b56d7b9f58eb2e8c3bfc10d2b610e5713137d3518d61ffde75e1fc4c43` |
| 128 | indexes | CREATE INDEX | `automation_audit_log` | `idx_claim_id` | `09bac601286506fc24a7e1c68c5efa7985fdd11600f6aacb1f5bc66d09258e2f` |
| 129 | indexes | CREATE INDEX | `automation_audit_log` | `idx_tenant_id` | `68506791d2196a9c6bec5d11e6b032dce418d160965ee7638bf907e5612b8f10` |
| 130 | indexes | CREATE INDEX | `automation_audit_log` | `idx_routed_workflow` | `040b1646f272e93707c7a0bd70cb116ef221321fe4ff6abe6bb42df6c46dbeea` |
| 131 | indexes | CREATE INDEX | `automation_audit_log` | `idx_composite_score` | `2f421c134b788d1d928f766c1ba7e8585cbaee88b0e428745ff659b91108b2d7` |
| 132 | indexes | CREATE INDEX | `automation_audit_log` | `idx_decision_made_at` | `cd82c04b2d8148eb72c4cd9b6dece8bd0e8d05a5fbecd510d60322719e285140` |
| 133 | indexes | CREATE INDEX | `automation_audit_log` | `idx_was_overridden` | `14c8839a908274ef54a889b207206a999a405abc597ba2f4e23201d279992aba` |
| 134 | indexes | CREATE INDEX | `calibration_overrides` | `idx_cal_tenant_jurisdiction` | `0b935409af524def9afafe77e5011d85d266ecbf823927079eaf4e8074152459` |
| 135 | indexes | CREATE INDEX | `calibration_overrides` | `idx_cal_status` | `4cd0e79a3e33eadba90b25b4c0b5b89fe2ba73d8e37e93a3e30c6981af6108c3` |
| 136 | indexes | CREATE INDEX | `calibration_overrides` | `idx_cal_scenario` | `79aed7cb2a4d578d6b0b49313777485dcca63a508dea3303e3e2bf00b5637e5d` |
| 137 | indexes | CREATE INDEX | `claim_approvals` | `idx_ca_claim_id` | `d9aa9d992819a85fcfa5a4356ed5f9ea2a5545c4dd9f68d44563d1ecb417df85` |
| 138 | indexes | CREATE INDEX | `claim_approvals` | `idx_ca_tenant_id` | `be6ee443463d3265d12163620306a64f096062bb73da5ad799880a6e3a83fcc8` |
| 139 | indexes | CREATE INDEX | `claim_approvals` | `idx_ca_stage_order` | `2451f26b920a418e6979556aa683aa8c9e806c9dac3ba71aa104bda12fbee249` |
| 140 | indexes | CREATE INDEX | `claim_approvals` | `idx_ca_role_key` | `9ba80f263f8fc2374a49e5189092af7658e685e84da0d3a53984db35ce698b77` |
| 141 | indexes | CREATE INDEX | `claim_approvals` | `idx_ca_acted_at` | `05009f97795f94af84b1f97ca527290f604c985c210ee5a5bee53f769d9f2c78` |
| 142 | indexes | CREATE INDEX | `claim_events` | `idx_ce_claim_id` | `d1fce2b7dcacbfc8eec822d2b613398b15b57dbdf0e63db5b54daf51c09fd4a0` |
| 143 | indexes | CREATE INDEX | `claim_events` | `idx_ce_event_type` | `2b3970825642921d7cd2af5c3dd92217f7849973a0045add036e683c1c9cd393` |
| 144 | indexes | CREATE INDEX | `claim_events` | `idx_ce_emitted_at` | `4bda222539172ab27a62a9c36eb6aa51d034a8f3728d6c83aba6479456635db8` |
| 145 | indexes | CREATE INDEX | `claim_intake_requests` | `idx_claim_intake_request_claim` | `7d854e56ab92055d5cc637e195a5ac291dbfb62690926f56e28ce23e5ed2b7b6` |
| 146 | indexes | CREATE INDEX | `claim_intake_requests` | `idx_claim_intake_request_tenant_status` | `c6db5eb601dc1181d2143905d9042a46701ca98fdcc3641de161bd0afbe26eb3` |
| 147 | indexes | CREATE INDEX | `claim_intelligence_dataset` | `idx_cid_tenant_id` | `869d41e5ff48a23aef19dfe588144870ccd4824e79f6929c3dbd107ed91ba717` |
| 148 | indexes | CREATE INDEX | `claim_intelligence_dataset` | `idx_cid_captured_at` | `5406e344f8a30207cedd88779ac1ec54ad4ed2faae040caaa851aa21c71bcbc7` |
| 149 | indexes | CREATE INDEX | `claim_intelligence_dataset` | `idx_cid_schema_version` | `5a75e6d861d09316499de620068e145aac7f87ef527370598be0ab5bdf514979` |
| 150 | indexes | CREATE INDEX | `claim_intelligence_dataset` | `idx_data_scope` | `cb2c8eb3088f92e7e17ca3e4bf3d8b8005a063d7cff1dd9026d5bbabb90f5218` |
| 151 | indexes | CREATE INDEX | `claim_intelligence_dataset` | `idx_global_sharing` | `4a813313b6d022ba40cf24d7350d083e2aa1892e60c6112441e9ad741afc3adb` |
| 152 | indexes | CREATE INDEX | `claim_intelligence_dataset` | `idx_anonymized_at` | `94c95f85b1caa1c0b0244c8bb5b3315bff13553103d1a4d2b186f2dffa3bf8bb` |
| 153 | indexes | CREATE INDEX | `claim_involvement_tracking` | `idx_involvement_claim_user_stage` | `5fff6a1abd5840aeaa6685add0b5f53aa0e8592ac88480cad00176299ee6abb3` |
| 154 | indexes | CREATE INDEX | `claim_involvement_tracking` | `idx_involvement_claim_user` | `e7ba0f82903916d91805aaff73e78d4709cfbf2477811e66b4918b7cddeaa923` |
| 155 | indexes | CREATE INDEX | `claim_review_queue` | `claim_review_queue_historical_claim_id_unique` | `3dd43f7d50dc33393ffc9d16a9aeca255738169c76a88a0fcbdb6f22abcf98fb` |
| 156 | indexes | CREATE INDEX | `component_benchmarks` | `idx_cb_component_make` | `3b4873f8ee9475582a6cdaf2004a8d9e6134d988080227227507aee89a9aeb9a` |
| 157 | indexes | CREATE INDEX | `component_benchmarks` | `idx_cb_vehicle_precision` | `38f8f2f817fe90707e40d7f4a4b7d872dcdf073dc3abd8a9a9eaff37dbf5da02` |
| 158 | indexes | CREATE INDEX | `component_benchmarks` | `idx_cb_market_currency` | `b7e462af2496affc2424999426607f17217509f83232caee9fdf4f3ec2145195` |
| 159 | indexes | CREATE INDEX | `component_benchmarks` | `idx_cb_component_id` | `e9f4b91318a64561691d9c5f20a5eecc9e0371fa9e0c1362cb0984d03d4d1d8a` |
| 160 | indexes | CREATE INDEX | `cross_claim_signals` | `idx_ccs_claim_id` | `108b6885582ba078f3ecbd8cf8fd791704c0de390e5977e7067b9c57c4386ec7` |
| 161 | indexes | CREATE INDEX | `cross_claim_signals` | `idx_ccs_signal_type` | `e7156923381d3088f3c13f2b8fbfe04d2efe2a1b65efe13241ac0f9f5d28332c` |
| 162 | indexes | CREATE INDEX | `cross_claim_signals` | `idx_ccs_confidence` | `55e208247f7668fce0cc1306b7ee310a7c33c30202350d5f95f57678448c4701` |
| 163 | indexes | CREATE INDEX | `cross_claim_signals` | `idx_ccs_dismissed` | `ee859bbd6b7f513de14f428bff18836f1ab6550c84bc5a069eca75723e39ac39` |
| 164 | indexes | CREATE INDEX | `cross_claim_signals` | `idx_ccs_tenant` | `19b22558b9af7ff4a0bb040e213449f24c41de56098ea3b4b859c4952c6279d7` |
| 165 | indexes | CREATE INDEX | `dataset_access_grants` | `idx_dag_tenant_id` | `4c4dc2330c497a2517a888b947e29d4e4a6ad32e3f4609708c41b6b7f418f649` |
| 166 | indexes | CREATE INDEX | `dataset_access_grants` | `idx_dag_data_scope` | `b8ce5fc0183f352ba3f3403fafa3712bc97e617fe0ed17418ced2fb15ec00f75` |
| 167 | indexes | CREATE INDEX | `dataset_access_grants` | `idx_dag_granted_to_user` | `c7d58fbc645763c08820f753567bf5c7aa3a9b642fe12e0979e94eff833e72f9` |
| 168 | indexes | CREATE INDEX | `dataset_access_grants` | `idx_dag_expiry_date` | `4fcbaaaa75ec3df4d7d500520adaf434a3006f73382f49ac140552dc18268c19` |
| 169 | indexes | CREATE INDEX | `driver_claims` | `idx_dc_driver_id` | `7737b8503e55c17af110d7a530cbc0faead166d9d4bc9f0eda3ae94b1ceb4af5` |
| 170 | indexes | CREATE INDEX | `driver_claims` | `idx_dc_claim_id` | `c843f9ec01a1cf219a2be684494d4ee1bb998f8ca4a5a9f572b9ae2fbe679b11` |
| 171 | indexes | CREATE INDEX | `driver_claims` | `idx_dc_role` | `bb55cd7ba48768822bd0058ff942a06105a5e1056f9fb7716aa353aca88fd52f` |
| 172 | indexes | CREATE INDEX | `driver_claims` | `idx_dc_tenant` | `f8922d78587e16a1c9f4445d541675889ecfc1ebf33e884edd66c55d3fdaa3de` |
| 173 | indexes | CREATE INDEX | `fast_track_config` | `idx_ft_config_tenant` | `1d61baa87f868fa2f7aaf3f125506cd0ddb1be45814a708747f160c6fbc6ce6a` |
| 174 | indexes | CREATE INDEX | `fast_track_config` | `idx_ft_config_product` | `0b33b232aa65e7530b2d146e17ca58bb219fca5f87ff00d2f9f0d73938866b87` |
| 175 | indexes | CREATE INDEX | `fast_track_config` | `idx_ft_config_claim_type` | `5a6136a7dfb6f631bd66eb59116d768cec9ab78082f069323ce4293f36d2f390` |
| 176 | indexes | CREATE INDEX | `fast_track_config` | `idx_ft_config_enabled` | `68fa733a9f3f51eb3e01f52754d3a5260f227063f938977968e3e51fb7dbd05a` |
| 177 | indexes | CREATE INDEX | `fast_track_config` | `idx_ft_config_effective` | `4aebce533fd677bbe1938c39a36bba87b496113687261912085c882f70f272aa` |
| 178 | indexes | CREATE INDEX | `fast_track_config` | `idx_ft_config_hierarchy` | `4da21812b118c1922ab870ee551978476d3d1576e1494a64368f413ec45feded` |
| 179 | indexes | CREATE INDEX | `fast_track_routing_log` | `idx_ft_log_claim` | `e8341542625196425fe05a5529dcc06b78f9dccaf01df5c81faa62155629acae` |
| 180 | indexes | CREATE INDEX | `fast_track_routing_log` | `idx_ft_log_tenant` | `771fbff565961953fbe030db723f114cdc721eece8aa18ff3f76a3546cd48f45` |
| 181 | indexes | CREATE INDEX | `fast_track_routing_log` | `idx_ft_log_config` | `5f5b50d31dcb6976d0f1e2af2e96eb3428788c8f704890751358cccb557b243c` |
| 182 | indexes | CREATE INDEX | `fast_track_routing_log` | `idx_ft_log_decision` | `c9868bc82ca44067245689982e1bd6947941e016d76a8dc332042dc636329a48` |
| 183 | indexes | CREATE INDEX | `fast_track_routing_log` | `idx_ft_log_evaluated` | `722c91e40b0ebcb4a934c2d109d7efc93669ad0b4b2696ceee265cb659706e25` |
| 184 | indexes | CREATE INDEX | `fast_track_routing_log` | `idx_ft_log_claim_tenant` | `cb1e3993687412e11c8e92838e411554a2b4b87f4217849bf838b269a5b6ab25` |
| 185 | indexes | CREATE INDEX | `federated_learning_metadata` | `idx_flm_round_number` | `1c3017088b2d1b28b58c02bd422d4328b7c19e4c7f89472042a25abe0bc44aef` |
| 186 | indexes | CREATE INDEX | `federated_learning_metadata` | `idx_flm_model_type` | `ae8287f58effb7ef07532c36807df152469e70b3dee357cd2aba1a84cfbffe68` |
| 187 | indexes | CREATE INDEX | `federated_learning_metadata` | `idx_flm_training_started` | `5514d782cb6e23c60b7be52a3e4b2f5465bf740511bdf3080689b8231801d8c6` |
| 188 | indexes | CREATE INDEX | `final_approval_records` | `historical_claim_id` | `e387e91721098f7f89dbcca40c1940aa3c32bb3e1b57870bbd7b7c5b4194016c` |
| 189 | indexes | CREATE INDEX | `global_anonymized_dataset` | `anonymous_record_id` | `f565d44e891102fa043669cb9bdc1c041acb127ecba4c8925f4ee43a8f13aea8` |
| 190 | indexes | CREATE INDEX | `global_anonymized_dataset` | `idx_gad_capture_month` | `9fe83489252edff51c3aeb3f67bb8d47919c88da1343aa1f3071c0ccbce1d0d0` |
| 191 | indexes | CREATE INDEX | `global_anonymized_dataset` | `idx_gad_vehicle_make` | `9ae32951b60a1a036df7949f5d798b3e2ab92acb7e3d90100e6eeb41e29d8aab` |
| 192 | indexes | CREATE INDEX | `global_anonymized_dataset` | `idx_gad_province` | `283d7bd8bf4d1a5f5043056d0272a31bfa9eca239aeaedc8e5957cd243c33414` |
| 193 | indexes | CREATE INDEX | `global_anonymized_dataset` | `idx_gad_accident_type` | `3e423dfb07d79ef3feba2e6e9f2a40be44337d7892e4350e651318de9e4fa71c` |
| 194 | indexes | CREATE INDEX | `global_anonymized_dataset` | `idx_gad_anonymized_at` | `8e632400c6229cff6483d805877d7fb7da02e1d89a9d3022b2fcc1661dc53700` |
| 195 | indexes | CREATE INDEX | `global_search_analytics` | `idx_gsa_tenant_id` | `6ca277a4c45183c30d693e749f52f3f61e29bc6e5c8a0fceac0305e976da6be6` |
| 196 | indexes | CREATE INDEX | `global_search_analytics` | `idx_gsa_searched_at` | `581e2249b7ccd94e5fab3e4244e66cf04e2c950aea3c345e2f67cbf82528c084` |
| 197 | indexes | CREATE INDEX | `global_search_analytics` | `idx_gsa_query` | `86aa3302ed9b5c6454de532d966855a9f2132d3a9beb6f230c6473e2b735644c` |
| 198 | indexes | CREATE INDEX | `global_search_history` | `idx_gsh_user_id` | `4355a2b95ac45afed30fab8d7cf833dd92be7a5487cadb854f27b9290a8e6688` |
| 199 | indexes | CREATE INDEX | `global_search_history` | `idx_gsh_tenant_id` | `7c3fd8af4ab33ba0731ad59237a4fd1825d03746fc4a32e305b2c4b660a631c5` |
| 200 | indexes | CREATE INDEX | `global_search_history` | `idx_gsh_searched_at` | `27b0a7f96e14443b62c1fee4151c3108cc49fdafd51e8443bdc44b6439872b79` |
| 201 | indexes | CREATE INDEX | `historical_claims` | `idx_hc_tenant` | `3fd111c42d073d24a3a40c3b7f51f6143fb739fa6b3268f1d6898e92ac5936b0` |
| 202 | indexes | CREATE INDEX | `historical_claims` | `idx_hc_batch` | `0c655b4ee2a4d4ccecb5445b2b75310e9accf8058c7e446123727404d5dcf531` |
| 203 | indexes | CREATE INDEX | `historical_claims` | `idx_hc_status` | `ebcd112467d76327def8db6fb56150509fbd0ecb5a491e94d8c25033aaa477b5` |
| 204 | indexes | CREATE INDEX | `historical_replay_results` | `idx_historical_replay_results_tenant_id` | `931463303fbc241cb991d4286acf250a1dd0f7c3f1a928c09cf4552ca53e8d33` |
| 205 | indexes | CREATE INDEX | `historical_replay_results` | `idx_historical_replay_results_historical_claim_id` | `4c6f57b9a1ec484865688d327c412df3cd458d49693a23bd8b7233ff5babdeec` |
| 206 | indexes | CREATE INDEX | `historical_replay_results` | `idx_historical_replay_results_replayed_at` | `8af991f8ae6a5895afedb363ebe89aa2e79014f86918b7cda3d421c7bcc08eb3` |
| 207 | indexes | CREATE INDEX | `historical_replay_results` | `idx_historical_replay_results_policy_version_id` | `ecc554c716a05eeb0de44c173fbc63df047bbe192e26a44827904718dc3b7162` |
| 208 | indexes | CREATE INDEX | `iso_audit_logs` | `idx_iso_audit_logs_tenant_id` | `6f0c2bdec28158dbb0e58df20ce634aac25427209d85fd4de992a77fee17947e` |
| 209 | indexes | CREATE INDEX | `iso_audit_logs` | `idx_iso_audit_logs_user_id` | `e0c43877a69c86dac009f4e65da5fca893723eaaf3cea1d3bb782fbb86bb1d8a` |
| 210 | indexes | CREATE INDEX | `iso_audit_logs` | `idx_iso_audit_logs_timestamp` | `66f6e48934e26a7ccc0b20e70c2e2bcd48582efb89bddda294019482b9e113bd` |
| 211 | indexes | CREATE INDEX | `mismatch_annotations` | `idx_ma_claim` | `d223070fa7d8b94c740336d60ad9596f9ac8a4f5beeae1de316ea36a5676e5ae` |
| 212 | indexes | CREATE INDEX | `mismatch_annotations` | `idx_ma_type` | `35cc63d44f9f652bb6cac32b5236605bbaa2e16925dcf3027501f1d58ae43b70` |
| 213 | indexes | CREATE INDEX | `mismatch_annotations` | `idx_ma_user` | `29b998cea6b2d0bf29a57fecee1a5c08e0842a6e9da78390e442a2bba1f9c31a` |
| 214 | indexes | CREATE INDEX | `mismatch_annotations` | `idx_ma_action` | `cb3595d04f03e8fd8605310712959ad07fd86fbf25d4cb8f00b5475dbbb8a8bc` |
| 215 | indexes | CREATE INDEX | `model_training_queue` | `idx_mtq_processed` | `8a0f57bc821131c9f274515ec35685540d7101bccc0b526765bf185a8b742a95` |
| 216 | indexes | CREATE INDEX | `model_training_queue` | `idx_mtq_training_priority` | `1730fbc57f5f8b0946b2e6ebdeef25d09fa900f134bfcf7ae62475b48aefa9af` |
| 217 | indexes | CREATE INDEX | `model_training_queue` | `idx_mtq_created_at` | `ebd29ad5c37aaf0bd54b25e26ffd64ed063d6b09d44ca1c1d99359084acbcaeb` |
| 218 | indexes | CREATE INDEX | `narrative_versions` | `idx_nv_claim` | `728bed7aeb2627e11a72eee3f4d6349c451eb95317fa8ef77a52e8ed549c6627` |
| 219 | indexes | CREATE INDEX | `narrative_versions` | `idx_nv_assessment` | `b55a2941ccd7c9c20b692b2b3ddb8e60e33a682d4dec8ce826f9d9faf470baeb` |
| 220 | indexes | CREATE INDEX | `narrative_versions` | `idx_nv_type` | `d7fda87af9f53e841e27761dc93fb2aaae2265986023d8de541b12a81f8bf81c` |
| 221 | indexes | CREATE INDEX | `narrative_versions` | `idx_nv_active` | `9efa8a89133381e2974f6c25f3a338ba8b29a9a984d72e79ce9102ac8d2c4ab4` |
| 222 | indexes | CREATE INDEX | `personal_vehicles` | `personal_vehicles_user_id` | `61965535585ea518636b6115d878c03889376dde78570d8203f215500fcd9192` |
| 223 | indexes | CREATE INDEX | `physical_measurements` | `idx_pm_inspection` | `67c6340bf1a25c66f1db80f16e8d5462b8d4f58e21bdd8f7d78044700eaef22c` |
| 224 | indexes | CREATE INDEX | `physical_measurements` | `idx_pm_tenant` | `99e68b8ae02bfc091770256f0f1d94fe8c5d507870b128dbac4b00227abe967f` |
| 225 | indexes | CREATE INDEX | `physical_measurements` | `idx_pm_category` | `62b0c73086b666204f2bd3db8f33cfaa490a036517a621309f7e940abf76203f` |
| 226 | indexes | CREATE INDEX | `physical_measurements` | `idx_pm_captured_by` | `8ce828a51bff8ec897081fb90694940902bb9f9a6a7bf30e70d755213c6d99b2` |
| 227 | indexes | CREATE INDEX | `physical_measurements` | `idx_pm_captured_at` | `e36ca9607267779ccfa0feb5a14cc49a86afcc011a796aaead5ca1b944348bf4` |
| 228 | indexes | CREATE INDEX | `pipeline_jobs` | `idx_pj_claim_id` | `7940eca503a7345036da3894786188b29e3ab6ec150e23518d1a591cb3deb104` |
| 229 | indexes | CREATE INDEX | `pipeline_jobs` | `idx_pj_run_id` | `22f969ac36512590d1de07294e4171695c6d294862afde5dfada62a9d530460e` |
| 230 | indexes | CREATE INDEX | `pipeline_jobs` | `idx_pj_stage_id` | `892cbfda1347e38bdae0327b3bdd3377d8f4b3d399152e54529094a1348f570b` |
| 231 | indexes | CREATE INDEX | `pipeline_jobs` | `idx_pj_status` | `16211af079277f640d7f9521e6768eb9a7e576e8fa86ed7acd926aa0a83cbf47` |
| 232 | indexes | CREATE INDEX | `pipeline_runs` | `idx_pr_claim_id` | `59e7550e86a7f5cb27d7ac18bee2dd9c1f54ed168ec038c21d1299234eb12c3c` |
| 233 | indexes | CREATE INDEX | `pipeline_runs` | `idx_pr_run_id` | `8fd86aa4a71036d6d8fd019d2c659a094f8c0057a39bc030b5aee6cd1d18bd02` |
| 234 | indexes | CREATE INDEX | `pipeline_runs` | `idx_pr_status` | `7f30b8f87ca5e27bc2d2bced5bbf89b692ebc7d8bd60d64c569b5f1d1873b504` |
| 235 | indexes | CREATE INDEX | `pipeline_runs` | `idx_pr_started_at` | `ef73e08c84cd0520627eafe080ca03e690a52868f874869c0f6c5e56f3a50d71` |
| 236 | indexes | CREATE INDEX | `policy_endorsements` | `policy_endorsements_endorsement_number_unique` | `ae122b74bc6d64e9bcd5fa2613a2e5cee1731cb57a284ed9a2cb5c1df4ffc834` |
| 237 | indexes | CREATE INDEX | `predictive_risk_scores` | `idx_prs_entity` | `f31dbe5680ab2ad024cba6294411d67d1d5b3cf2309b98c19b01f46236eb23ac` |
| 238 | indexes | CREATE INDEX | `predictive_risk_scores` | `idx_prs_tenant_id` | `3d33203ef4414d21aa52710d8c67c646d29920fdf725bdfb5ebe7d61977540ac` |
| 239 | indexes | CREATE INDEX | `predictive_risk_scores` | `idx_prs_score_type` | `ad04ff86cd2cf391fc4f59d57ba354ad44cc8fda32772ab124594f285046dfcf` |
| 240 | indexes | CREATE INDEX | `predictive_risk_scores` | `idx_prs_valid_from` | `e656cb6040c8014deac83d974ce5abda241d5beda1fa98f42870311fd25b45a0` |
| 241 | indexes | CREATE INDEX | `quotation_requests` | `request_number` | `853933a0ef2641e60416c5c7311758381b44ced394203e4536a7da245e3fdcea` |
| 242 | indexes | CREATE INDEX | `replay_logs` | `idx_rl_claim` | `ebab2d2cc301de4e5257fcc9e659095afbfbd19630290d014b43f6d77285f5c3` |
| 243 | indexes | CREATE INDEX | `replay_logs` | `idx_rl_tenant` | `784ba3184f428d2a0d755a0d61b3d0671cb2f7fa0acf6bf903e39a0611ef81e8` |
| 244 | indexes | CREATE INDEX | `replay_logs` | `idx_rl_replayed_at` | `0c78fc8fc992415792dc2924180aa9351ba491a4170e2b00282549bd556a31fe` |
| 245 | indexes | CREATE INDEX | `replay_logs` | `idx_rl_changed` | `fd292ebed977dda8d254d8f112ddb8017372e6c25fcb1df7088c8e2742834721` |
| 246 | indexes | CREATE INDEX | `risk_register` | `idx_risk_register_claim_id` | `b5d2f8ae0f64358d68cb03f8c8a86cc960892ad13f83c1bfd49e1961dd0a5a7b` |
| 247 | indexes | CREATE INDEX | `risk_register` | `idx_risk_register_tenant_id` | `f47b0ee998a02f8ae7ad1de2f604e50f9c3ca8a07beadaa02d6eb820bbbaf8bf` |
| 248 | indexes | CREATE INDEX | `role_assignment_audit` | `idx_tenant_id` | `4cbf48ac4db4295fd2d113e9c5a7b4bf831794883504e62e365c73f3967c2867` |
| 249 | indexes | CREATE INDEX | `role_assignment_audit` | `idx_user_id` | `99ba76af7cac8d0f4f7550f1d48349755cd4492ce9b234245c379839e1b6fa5f` |
| 250 | indexes | CREATE INDEX | `role_assignment_audit` | `idx_changed_by` | `01991c7fc6d2662c3edd60b52f65c5f46013471be9a60830df1944879ebce47d` |
| 251 | indexes | CREATE INDEX | `role_assignment_audit` | `idx_timestamp` | `8f4d8fa0ea92fa054dd0fa42132c29a3a168f2fca1dc33aa2c005dc687e14d6f` |
| 252 | indexes | CREATE INDEX | `role_assignment_audit` | `idx_role_audit_user_time` | `a4ca65fd5177baab12f111cacc84ca4aa6ebb0c66674d1fa1c64173fdd9d7bb6` |
| 253 | indexes | CREATE INDEX | `role_assignment_audit` | `idx_role_audit_tenant_time` | `ded2c9ddbceea969e4437216cdf08511c2601ff72cdbce2e5b48ac00d59199e8` |
| 254 | indexes | CREATE INDEX | `routing_history` | `idx_routing_claim_id` | `e4394bae0b49be96cfc203fcf9beffda4e6491dad5316b991062d22d2a5fe9c4` |
| 255 | indexes | CREATE INDEX | `routing_history` | `idx_routing_tenant_id` | `37a55fd9cc9c0e0d06028669b02f9352e76bb0cd87b0205982b534769e73c50a` |
| 256 | indexes | CREATE INDEX | `routing_history` | `idx_routing_timestamp` | `ff10e2ed633fa30457032ec9320659cb65641f448a681ac4d79a0c2745280edd` |
| 257 | indexes | CREATE INDEX | `routing_history` | `idx_routing_claim_tenant` | `96e4a990d7fabb1e1d797d655a4e42b40c18d43c825f8fdc25dfc4f1ff2a524f` |
| 258 | indexes | CREATE INDEX | `routing_threshold_config` | `unique_threshold_tenant_version` | `a3d161fffbc24449248cb77f595c249db7e5e4695ee1538ee286ce056d2c9106` |
| 259 | indexes | CREATE INDEX | `routing_threshold_config` | `idx_threshold_tenant_id` | `2b676d11eb53c7d541d4cdcc7b7aa6497783d3814e11cc2f703a3c8e8e8eda0c` |
| 260 | indexes | CREATE INDEX | `routing_threshold_config` | `idx_threshold_active` | `f3beda9f5a12e1aa7875de878e11b08dd31a2d7bc1e8ab315932bb67ba68f8a2` |
| 261 | indexes | CREATE INDEX | `routing_threshold_config` | `idx_threshold_tenant_active` | `33268c254714ccf4134a447df244dca180ec6793e033791df29bc635b53bd571` |
| 262 | indexes | CREATE INDEX | `shadow_override_monitor` | `idx_som_user` | `17d622ca0310a65f261ba4540fb57be11f8b2ac94f1defb75a3a562ec453cc24` |
| 263 | indexes | CREATE INDEX | `shadow_override_monitor` | `idx_som_tenant` | `ceaa2c3b2f0e1d647b9247e92ae6883d665276907da1fff9e52ce8857ec1d4f5` |
| 264 | indexes | CREATE INDEX | `shadow_override_monitor` | `idx_som_scanned` | `6d05e8e583dcc8f36eeaef0c02a7d884f126c4c87bb4adf92e8fa1c28e5b550e` |
| 265 | indexes | CREATE INDEX | `shadow_override_monitor` | `idx_som_activity` | `f4a953d5516663ce6cfdd5a6349b46859e00adc1bc161b8aeb57c080f1b5cad5` |
| 266 | indexes | CREATE INDEX | `super_audit_sessions` | `idx_super_audit_sessions_super_admin_user_id` | `e5d85a79e25061bbc057cf95cb470bffdaaa5f47be7837415821523ec11c4c9d` |
| 267 | indexes | CREATE INDEX | `super_audit_sessions` | `idx_super_audit_sessions_audited_tenant_id` | `b21b2654b167eeb18aa5e0efb8bba73f1a6a0af4609bfaa68835c0f5ce434b09` |
| 268 | indexes | CREATE INDEX | `super_audit_sessions` | `idx_super_audit_sessions_session_started_at` | `3d55b41d9a5dec41581914a8e287007dee632b660a752f8e08fd4a2ea3e62a56` |
| 269 | indexes | CREATE INDEX | `supplier_performance_metrics` | `supplier_performance_metrics_supplier_name_unique` | `226ce845c84650fcfee6d386a390359301033979c38a56d5225c48ecef15760d` |
| 270 | indexes | CREATE INDEX | `system_errors` | `idx_se_procedure` | `ae3c712afbcb343fb12202941d12d87399214dc25960e4b090fcb4c595242039` |
| 271 | indexes | CREATE INDEX | `system_errors` | `idx_se_user_id` | `f2dd9043463dec61c1b69c78b379c2292921e21eceece7adf24a9acc196e618e` |
| 272 | indexes | CREATE INDEX | `system_errors` | `idx_se_occurred_at` | `373dbdf808c20dbeca2d813e096bfd4c6874448a06fc479881f2b9962421bd7d` |
| 273 | indexes | CREATE INDEX | `system_errors` | `idx_se_error_code` | `1e10a905f5eb5ad290cc32f11e598ec63823824a2374877bc3bac592c5326d7a` |
| 274 | indexes | CREATE INDEX | `tenant_isolation_violations` | `idx_tiv_user_id` | `b9113d7544e842ffd6220478795b683da1fb8d9965961c0a07125610e414e391` |
| 275 | indexes | CREATE INDEX | `tenant_isolation_violations` | `idx_tiv_user_tenant` | `ae974992df18e96f9ecf51a0807f291e2bbaf110cd6d4762c67676815ceaaadd` |
| 276 | indexes | CREATE INDEX | `tenant_isolation_violations` | `idx_tiv_occurred_at` | `f2d445fbb9569e8e8d4c762a97ba5afe9f322b9f1ad9eceb3f8257f6b997d04c` |
| 277 | indexes | CREATE INDEX | `tenant_isolation_violations` | `idx_tiv_procedure` | `4be9289556c056418f96c01ae4f2c0d1ca0d6790106537aefda3e5b28878bcb6` |
| 278 | indexes | CREATE INDEX | `training_data_scores` | `training_data_scores_historical_claim_id_unique` | `be69c3dc10e0946c48cfecd80051c18d45e096fcc9f55cc749297a1fb1c62eec` |
| 279 | indexes | CREATE INDEX | `training_dataset` | `training_dataset_historical_claim_id_unique` | `bbceb44ce90254937cc81ab82edc7674ecd0a6d6b5737ffce8751bba08c74679` |
| 280 | indexes | CREATE INDEX | `usage_events` | `tenant_idx` | `e4c1422e536ce461e54f957352fee833aad2a80b7831e4c86c464278f8bbc1be` |
| 281 | indexes | CREATE INDEX | `usage_events` | `claim_idx` | `844bd4d6746704bd7bc681a9f2b3b29a68dac8c2924a9c5599ff5eaa87ff6fa1` |
| 282 | indexes | CREATE INDEX | `usage_events` | `event_type_idx` | `aac3ccf889f1524016ed702477addaa8d64e6a67f07becacdc01d92bbc0f7ac3` |
| 283 | indexes | CREATE INDEX | `usage_events` | `timestamp_idx` | `9581f5f6b6b4f137af248f6208367cf0499ef89a6301d4d2c763003d32c63862` |
| 284 | indexes | CREATE INDEX | `usage_events` | `reference_idx` | `a4e6e3dfa539073c817f036be3d9e1525e89d5a75aefc13ae3ac0f07b669d0ce` |
| 285 | indexes | CREATE INDEX | `variance_datasets` | `idx_vd_claim` | `92712d5d707a0fc439c491f9bef9e45c5e29fdd27bcc6883b6fd4e3f9f025a01` |
| 286 | indexes | CREATE INDEX | `variance_datasets` | `idx_vd_tenant` | `cbe92774a4afeaf5c33157ad18725dfb95c2734075dbbeca668683ddf7a76b60` |
| 287 | indexes | CREATE INDEX | `variance_datasets` | `idx_vd_type` | `a56c5948d8ba41d816e9533ff12bea9885281512552a78881c4f12481e697ed8` |
| 288 | indexes | CREATE INDEX | `weight_adjustment_log` | `idx_wal_type` | `d2292b775f76cfa08ad06f3e7653f1665a38d1f359574560b84574895185882d` |
| 289 | indexes | CREATE INDEX | `weight_adjustment_log` | `idx_wal_created_at` | `39f49c0e8e948dc9382b26e08a131b9461c5cdd1f728347461bb196e882ae214` |
| 290 | indexes | CREATE INDEX | `weight_adjustment_log` | `idx_wal_direction` | `5f94d8f5ea7bc3efc50bed45c8f0bae569783dd66a09507d31520d41d5c59cf3` |

## Reproducibility command

```bash
node scripts/generate-d05-statement-ledger.mjs verify audit/gate-d-text-index-compatibility-2026-09-14/wave-05-tidb-compatible-source-v2.sql audit/gate-d-d05-statement-hash-ledger-2026-09-15.json
```
