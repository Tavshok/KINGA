# D-03 Wave 3 Marker-Split Statement Hash Ledger

This manifest is generated deterministically from `audit/gate-c-scratch-baseline/wave-03-generated/wave-03-assessment-evidence-reporting.sql`. The source file is immutable; it is split only on the exact literal `--> statement-breakpoint`, each fragment is UTF-8 trimmed, and the source's one empty terminal fragment is discarded because Wave 3 ends with a marker. Each emitted statement retains its terminal semicolon and is hashed with SHA-256. The JSON companion ledger contains the exact full SQL for every row.

| Control | Value |
|---|---|
| Full source SHA-256 | `ccdca4a47d9d82c04cc9b9a12e6d49960d4271a052773a342282086a9aff9254` |
| Marker count | 187 (trailing marker present) |
| Executable statement count | 187 |
| Statement class totals | 50 `CREATE TABLE`, 26 `ADD FOREIGN KEY`, 111 `CREATE INDEX` |
| JSON companion | `../../audit/gate-d-d03-statement-hash-ledger-2026-09-13.json` |

> Do not run the raw source through `mysql < file.sql`. The `--> statement-breakpoint` literal is repository tooling, not a MySQL/TiDB comment. For each future owner-operated statement, compare the prepared SQL text and its SHA-256 with the matching row below before execution.

## Ordered execution ledger

| # | Phase | Statement class | Table | Object / constraint / index | SHA-256 of emitted SQL |
|---:|---|---|---|---|---|
| 1 | tables | CREATE TABLE | `—` | `adjuster_sign_offs` | `f857a112c94e9e559e5bc8969cd5a18e6ff7053bb003f6cf4d7da0b12e01bbab` |
| 2 | tables | CREATE TABLE | `—` | `agency_documents` | `8be801894b61752d9ba6e87ebbc75ded3af1252d7dacbab50271623f4a752739` |
| 3 | tables | CREATE TABLE | `—` | `ai_assessments` | `ff72a757012e7c52aa17997f33f23ca1ff2fae6a07721899553b4f9ed2822ed4` |
| 4 | tables | CREATE TABLE | `—` | `ai_prediction_logs` | `d55210fb343a73987b711984d092c285ac4017b7f69ba2444ca56796e568ce81` |
| 5 | tables | CREATE TABLE | `—` | `assessor_report_attachments` | `23fb53559513552562592c8f26bab099aa2ef83f570ecae6f6ba4a6f34d31bab` |
| 6 | tables | CREATE TABLE | `—` | `assessor_report_reviews` | `ecc2a3eb2734954256ae84a4874919ef5e46d00591b888629d72908d6b7e6f41` |
| 7 | tables | CREATE TABLE | `—` | `assessor_reports` | `13f82a0b095e24c1fc38e786d909f250ec22868005ee2f36556870a8cc42142e` |
| 8 | tables | CREATE TABLE | `—` | `automation_policies` | `b2c3e2c98216e5d30bf3d290ab989323e381023517f836473a7f115779b6b05f` |
| 9 | tables | CREATE TABLE | `—` | `claim_confidence_scores` | `1046edfe6d52e07317d09aa9320c38fcf6902be22fd43104f594e4924063eb27` |
| 10 | tables | CREATE TABLE | `—` | `claim_decision_lifecycle` | `b158a89a0665f9dc888e3db749dbcc194a1924039eec8098a045dc59ed08a03c` |
| 11 | tables | CREATE TABLE | `—` | `claim_routing_decisions` | `c12385ae8555c7ef749482ff11de86e2b1be510993e3c3c45352c64ebf057679` |
| 12 | tables | CREATE TABLE | `—` | `component_repair_outcomes` | `a2da09a1a609838a3296d555989683ef0a373307acf853d4a768d104f6d4770f` |
| 13 | tables | CREATE TABLE | `—` | `cost_components` | `81407e132df4696fbfe52d8752c4d0637916dec8e1fb07fbaaaa7141032fc144` |
| 14 | tables | CREATE TABLE | `—` | `cost_learning_records` | `706fb95e86213d9bd88f9c7375649d16ec2a56a2912af58cf3b30bd378b8ce8e` |
| 15 | tables | CREATE TABLE | `—` | `country_repair_index` | `4d0d1a10be5448ede2f3aad531d5f81c0b0aa9cbf1218452cc6f37077bbf337b` |
| 16 | tables | CREATE TABLE | `—` | `currency_exchange_rates` | `4c0e8be93087f0205eeda92b3e654151d8adb5dc59abc9381b2ca68ce0c65456` |
| 17 | tables | CREATE TABLE | `—` | `customer_documents` | `0a213d475d103e19d783c733fbb1e39ce008f1b2d7f63daf9dd0631f2478cf52` |
| 18 | tables | CREATE TABLE | `—` | `decision_snapshots` | `f1bb6d49569f7d0f3437403f105484c81e47f9bd6b106c5aca76d1bc396a8f54` |
| 19 | tables | CREATE TABLE | `—` | `document_naming_templates` | `a8b9b67d24d880314eb939cd5fcc468bc5cfa4e23d555b17f3f04ab8afa0944d` |
| 20 | tables | CREATE TABLE | `—` | `extracted_document_data` | `b100845cbd7802c51271701873bfb228b567814490494bb90be9aa0170206828` |
| 21 | tables | CREATE TABLE | `—` | `extracted_repair_items` | `313cfe359bf1f37dad1c1c3bbd2eceb87bfce831c74299058f9220d1425ac8c3` |
| 22 | tables | CREATE TABLE | `—` | `fleet_documents` | `3ff91d5698ad11d88a8b5a7823528fda8be4648be6334930d45f546130b0bcef` |
| 23 | tables | CREATE TABLE | `—` | `fleet_incident_reports` | `0894e278f383c773d6f8b3ecad579e23b1664b4b5c0e1d9b576cd96eb7d60e7f` |
| 24 | tables | CREATE TABLE | `—` | `fraud_alerts` | `749f58361b22245f8201e4a7cd2bfb44df08ddd57da31712a9c4ce4fb3425b3b` |
| 25 | tables | CREATE TABLE | `—` | `fraud_indicators` | `3865d2f283c1a4e5a304a27fb31a044be939fce74710755e6f0b7e151f9ddf9a` |
| 26 | tables | CREATE TABLE | `—` | `fraud_rules` | `ff48eafdd63f3fc643d26120bc640b6aa0dcd32bd939abe953a59c5d5b8a2a8b` |
| 27 | tables | CREATE TABLE | `—` | `generated_reports` | `0335314fe40beacef7fb62f09160b03bbd53840e63c437e471fdcce0555538aa` |
| 28 | tables | CREATE TABLE | `—` | `ingestion_documents` | `414aa8a889f1ae55df64640a0c84360f400a98cbfb9728e7de069d43311f6a50` |
| 29 | tables | CREATE TABLE | `—` | `insurer_marketplace_links` | `10c634f88dc1329ddf4c0841e59c7fca9f8bf2d367dd3afbc9a75d0846a3ac1d` |
| 30 | tables | CREATE TABLE | `—` | `insurer_marketplace_relationships` | `85e6cc6e71582054b4d39d3ca02774325daf4e353224fd41ead9f4197ee6d3ad` |
| 31 | tables | CREATE TABLE | `—` | `insurer_quote_requests` | `4fe5eaf04c074d53d895d939bae88b277aa13bebd1087d46205b800fd9dc77c5` |
| 32 | tables | CREATE TABLE | `—` | `marketplace_profiles` | `57e12680fd2730f7472692d199e22b6a20d09bbb69e512531422f45bc33dd3af` |
| 33 | tables | CREATE TABLE | `—` | `panel_beater_quotes` | `8cbf40f4ecb509dcdc5dd8da0685d505f6f4d0299fa4a4e7b17bf1e4ebe1e24e` |
| 34 | tables | CREATE TABLE | `—` | `pdf_reports` | `70a57d8c569d34615ecc480cab0ef2b880508e5158078795364617258e1d395e` |
| 35 | tables | CREATE TABLE | `—` | `physics_validation_records` | `3bf7c1d2d889d979cfec56bcd4c93107233cf82eb4a1bd2ee1590a407feb42b1` |
| 36 | tables | CREATE TABLE | `—` | `police_reports` | `fe67a55b4b2b0c083db10a7d2ead5f7ee46eabb74d055121a13c4ba943c1ddb3` |
| 37 | tables | CREATE TABLE | `—` | `policy_documents` | `af6c8b7bfdb1a5186638cf1840054c82ce709987f30ea88d0785cf4edb19a1c3` |
| 38 | tables | CREATE TABLE | `—` | `pre_accident_damage` | `145ee9d2955eb81a81124c23e1c29c366d5232f9e8a0fb328d573db2ef4c123e` |
| 39 | tables | CREATE TABLE | `—` | `quotation_request_documents` | `875681dc5fe22712f403ddc67bc152df7bf0f470fd7fa3d7cb9171552401c2fe` |
| 40 | tables | CREATE TABLE | `—` | `quote_line_items` | `c978068f7715a586dbf0732218c4a289a1bde1094059c3ff85f25b1a82d5c1da` |
| 41 | tables | CREATE TABLE | `—` | `quote_optimisation_results` | `a727dc3e4d5fe0254d16240e4512a54159e8854818edfb99d9fd0b9d3777e270` |
| 42 | tables | CREATE TABLE | `—` | `repair_cost_intelligence` | `41ec19263e5f7a26e1517604bf5fa5aa5b0849d571455b4b8a205cf3273ec31c` |
| 43 | tables | CREATE TABLE | `—` | `repair_history` | `eefe3a0c500b2cb63bd6391936b56c7207395aa956c7f15254fef6059141303c` |
| 44 | tables | CREATE TABLE | `—` | `report_access_audit` | `0e2ed5a1e727e1053f9c3347ceaf5de0afa94d9476dce2dd17793d07a277d822` |
| 45 | tables | CREATE TABLE | `—` | `report_links` | `9760a97fab33d5128e6d2b924cb77da63bf250dce512a36542bf4d5556bbea1d` |
| 46 | tables | CREATE TABLE | `—` | `report_snapshots` | `13bb82163ba250420bb6ce2d534303d1c75a8063e4ad2baf9acf58d9434d2e04` |
| 47 | tables | CREATE TABLE | `—` | `service_quotes` | `0ba54ba721d5ed80cc01f507002936a4aa6cb1623958f8f4da93a16c54b65f1d` |
| 48 | tables | CREATE TABLE | `—` | `supplier_quote_line_items` | `5ca2220c9ee9a37e35d6630e0c3b7f575cf08d9283730c262c066caeb68c1cc8` |
| 49 | tables | CREATE TABLE | `—` | `supplier_quotes` | `b8c42daf93836358b900836a33b565b51a231a7197e4a2ce1e5366e7c19cecac` |
| 50 | tables | CREATE TABLE | `—` | `valuation_comparable_evidence` | `004aa499a1f31401e7277b670415380288943f42e14e22c40acc39df5c451618` |
| 51 | foreign_keys | ADD FOREIGN KEY | `adjuster_sign_offs` | `adjuster_sign_offs_claim_id_claims_id_fk` | `c20db2c6fc19045f86ef95ad5511424c305bc895f95e5efcf718f70e2ed89521` |
| 52 | foreign_keys | ADD FOREIGN KEY | `ai_assessments` | `ai_assessments_claim_id_claims_id_fk` | `b764d07ac96c0b31c4c1eccab46c204f2b59059e0ca0114aacc6d0d41eb48287` |
| 53 | foreign_keys | ADD FOREIGN KEY | `assessor_report_attachments` | `assessor_report_attachments_report_id_assessor_reports_id_fk` | `cbf38a63a9f338fbfa1c4d17a8d0642bec932ef622fa6e2e34b3cc0df26f5508` |
| 54 | foreign_keys | ADD FOREIGN KEY | `assessor_report_reviews` | `assessor_report_reviews_report_id_assessor_reports_id_fk` | `d37ebf23d44b8c169648df89e53795125f803940eea9f94d390035a3b8e5740e` |
| 55 | foreign_keys | ADD FOREIGN KEY | `assessor_report_reviews` | `assessor_report_reviews_claim_id_claims_id_fk` | `45cd63af87f421ee8242f19a22203c924bff544c6872eb99054afd636d3ef094` |
| 56 | foreign_keys | ADD FOREIGN KEY | `assessor_report_reviews` | `assessor_report_reviews_reviewer_user_id_users_id_fk` | `8a6ab0a28b57d5fd6f3dd88ff4772c9158a9f57f807c70b8a0cc8ae4711980af` |
| 57 | foreign_keys | ADD FOREIGN KEY | `assessor_reports` | `assessor_reports_claim_id_claims_id_fk` | `f29c91274d1a57bf9dda68cd02f576c91adfae4db400850ec6bd78a1d65d298e` |
| 58 | foreign_keys | ADD FOREIGN KEY | `assessor_reports` | `assessor_reports_assessor_user_id_users_id_fk` | `8699d633675378fc7e0118f1e8fc1c40971bc9fd2d57ff2c88ca8968944fe1c3` |
| 59 | foreign_keys | ADD FOREIGN KEY | `assessor_reports` | `assessor_reports_assignment_id_claim_assignments_id_fk` | `b7942ee07182fe281d20f98243655b52eb0b46f4d85d399d4f9d3b306692b973` |
| 60 | foreign_keys | ADD FOREIGN KEY | `assessor_reports` | `assessor_reports_attested_by_user_id_users_id_fk` | `86a2e249f52c105b1bdf1fd25dc448c8fe3714c18a71386257ec47bf8ce621af` |
| 61 | foreign_keys | ADD FOREIGN KEY | `claim_confidence_scores` | `claim_confidence_scores_claim_id_claims_id_fk` | `d0cd099f77740ec7713ea5ecb5447f9f8b43dbfc8ee476d43a34a5d1add0e11e` |
| 62 | foreign_keys | ADD FOREIGN KEY | `claim_routing_decisions` | `claim_routing_decisions_claim_id_claims_id_fk` | `a40945c0a3458c79a6f8191ea608664b2ac19d1370982ed94338ccec6c46d3d7` |
| 63 | foreign_keys | ADD FOREIGN KEY | `claim_routing_decisions` | `fk_crd_confidence_score` | `2c7481e2b7e4ee5460309d7f9689ccba3206d6822bb82d238302f6f4d33fdd9a` |
| 64 | foreign_keys | ADD FOREIGN KEY | `claim_routing_decisions` | `fk_crd_automation_policy` | `330124e4c835e2fae66556268453e4b531e77b572460ba840dbe69443317c7d9` |
| 65 | foreign_keys | ADD FOREIGN KEY | `component_repair_outcomes` | `component_repair_outcomes_claim_id_claims_id_fk` | `b30769e977951e54d4e53031ff481085c7f4ecb1fffbd1f7fc8473a12a53fce3` |
| 66 | foreign_keys | ADD FOREIGN KEY | `cost_learning_records` | `cost_learning_records_claim_id_claims_id_fk` | `0433928590430248d551e508cb3456038d44b7e028583684812f12a706c479f2` |
| 67 | foreign_keys | ADD FOREIGN KEY | `fraud_alerts` | `fraud_alerts_claim_id_claims_id_fk` | `6cca4660861bbf995b186a8f789111252783b6ad988c0aa3054723c413fb8377` |
| 68 | foreign_keys | ADD FOREIGN KEY | `fraud_indicators` | `fraud_indicators_claim_id_claims_id_fk` | `08f2b7c7724d337435a805a60dcd49d744b10622a1349d125d2a3aa6f4aac222` |
| 69 | foreign_keys | ADD FOREIGN KEY | `generated_reports` | `generated_reports_claim_id_claims_id_fk` | `5230d5b4f9b4246526c04e0bc1fa77229ff1c928b7608a3b5d617ab5e5e0027d` |
| 70 | foreign_keys | ADD FOREIGN KEY | `insurer_quote_requests` | `insurer_quote_requests_claim_id_claims_id_fk` | `674d7527c634eada7d2a492dcc33422c7f506582d7b0af336cb7376dc9912c4f` |
| 71 | foreign_keys | ADD FOREIGN KEY | `panel_beater_quotes` | `panel_beater_quotes_claim_id_claims_id_fk` | `69919457ed9fa685c2cb5cc15bf04093104ef2c6e827c05f1c1e8a62e99384e2` |
| 72 | foreign_keys | ADD FOREIGN KEY | `police_reports` | `police_reports_claim_id_claims_id_fk` | `3b3ab405f963d16ca4fc1842e99d4e928cdd2af82704487c99a021322ee332a3` |
| 73 | foreign_keys | ADD FOREIGN KEY | `pre_accident_damage` | `pre_accident_damage_claim_id_claims_id_fk` | `132a6a35f917c64d7119a7185e467f3c22e7cf107882b394adf38bedf7b84e59` |
| 74 | foreign_keys | ADD FOREIGN KEY | `quote_optimisation_results` | `quote_optimisation_results_claim_id_claims_id_fk` | `62130ee87038457bcfd8e129acbdb7728adc6400eddac66fa189af3e1d0fdab3` |
| 75 | foreign_keys | ADD FOREIGN KEY | `repair_history` | `repair_history_claim_id_claims_id_fk` | `b2f331d938cdcea006e72288ae4c9e1938ff3e9d63a9ea1d55b4cc2678f52ec2` |
| 76 | foreign_keys | ADD FOREIGN KEY | `report_snapshots` | `report_snapshots_claim_id_claims_id_fk` | `77262dc555981124bf7e983371aa1665f26d9a4657460b92b73e06ce76c505e3` |
| 77 | indexes | CREATE INDEX | `adjuster_sign_offs` | `idx_aso_claim_id` | `c5fa3ed3d609caec7c7ac0a40e5b9a6ba774568454cb9f67213eb1d383bdc321` |
| 78 | indexes | CREATE INDEX | `adjuster_sign_offs` | `idx_aso_adjuster_user_id` | `53e1d177f94e4be8638a1242e9c5952ee89ff91261e403067b94de6cdf4385d0` |
| 79 | indexes | CREATE INDEX | `ai_assessments` | `idx_ai_assessments_claim_id` | `60d6a399e4cb9834ba2c05a86c83791c13f4723b086c2aef056f6d1f316d17ad` |
| 80 | indexes | CREATE INDEX | `ai_assessments` | `idx_ai_claim_confidence` | `7db3db13e161a69e60c082b68e520d12379189f4ab323ca29d5dc26c44d01260` |
| 81 | indexes | CREATE INDEX | `ai_assessments` | `idx_ai_tenant_fraud` | `9a0cb5d9f4abf8d72ff6d805203e0eccc143d27b00aab098d508b0ffa12b5882` |
| 82 | indexes | CREATE INDEX | `ai_prediction_logs` | `idx_apl_claim` | `fdf3ec0e88d384c2da4602f43260b224752f5f2df1c9addd010f87ff23c5ef5c` |
| 83 | indexes | CREATE INDEX | `ai_prediction_logs` | `idx_apl_tenant` | `77d0443564fe329dbaf480e5776596b9e734831f0602a30bde94ec64f91926df` |
| 84 | indexes | CREATE INDEX | `assessor_report_attachments` | `idx_assessor_report_attachments_report` | `43e914b7f5e59fd83d2e2f70aaac3df0093aba83c4423d4b743ce7038c3b8d51` |
| 85 | indexes | CREATE INDEX | `assessor_report_attachments` | `idx_assessor_report_attachments_tenant` | `8951b26a5b09692c22f441554d0c09c03f916fd59f0ec90ee361653afe96e89c` |
| 86 | indexes | CREATE INDEX | `assessor_report_reviews` | `idx_assessor_report_reviews_reviewer_state` | `15cc18e0d4b7b76b6c5a5da089a5ad30e960eecfb4ec9de291c8edda1ee95e2d` |
| 87 | indexes | CREATE INDEX | `assessor_report_reviews` | `idx_assessor_report_reviews_claim_state` | `2464dee718386f2bdc62ff290c599ca9ddd9530352c05603bdd39cf28d098503` |
| 88 | indexes | CREATE INDEX | `assessor_report_reviews` | `idx_assessor_report_reviews_tenant_state` | `7eedc4d1eef8106461a0e4e6d50f4f3d54f889ca19358158bb7f03fa175f402d` |
| 89 | indexes | CREATE INDEX | `assessor_reports` | `idx_assessor_reports_claim_state` | `f656b643b1d8877b8c4646ae961ea9cc9fc17c164d7944309771a30488fdad6c` |
| 90 | indexes | CREATE INDEX | `assessor_reports` | `idx_assessor_reports_assessor_state` | `972948e186a856eb1bfac42716bddba84a7872245a3e0c52b5f6002016b250e3` |
| 91 | indexes | CREATE INDEX | `assessor_reports` | `idx_assessor_reports_tenant_state` | `088cad499ed1e806de7c85d2db09d41b515d7c9991877ef3c00aa671ac2e1fbc` |
| 92 | indexes | CREATE INDEX | `automation_policies` | `idx_tenant_active` | `c8cf40a91844e07f68853a00a10d2aff66213e799768e2544d025014aa812afa` |
| 93 | indexes | CREATE INDEX | `automation_policies` | `idx_policy_name` | `356fd3978f8da734e78cbbddaa5ce5b1971aca015f721e9a8296468d931a6e7e` |
| 94 | indexes | CREATE INDEX | `claim_confidence_scores` | `idx_claim_id` | `cd0fca08abb303561addeeca00f7b7a63e6facc4e6c3b4502de3cd4aae9e5e0b` |
| 95 | indexes | CREATE INDEX | `claim_confidence_scores` | `idx_tenant_id` | `722e38399249202bf0445cf38bfa00ac2f07053a1d00a90becbbd2e7cb796805` |
| 96 | indexes | CREATE INDEX | `claim_confidence_scores` | `idx_composite_score` | `910ecb01cfaa6c0a7d8d01a16e5ca059da0ddd44df8f5b90c61c63336bd31b6a` |
| 97 | indexes | CREATE INDEX | `claim_confidence_scores` | `idx_scoring_timestamp` | `c4da7e545983feff5f9d9f8b2f1798ef86bf0dab50bbf1c48efcd8c0244d1aa2` |
| 98 | indexes | CREATE INDEX | `claim_decision_lifecycle` | `idx_cdl_tenant` | `cf128c8e9dca82203789bc9471bb254d5c3e167cd8b420125704813995780567` |
| 99 | indexes | CREATE INDEX | `claim_decision_lifecycle` | `idx_cdl_state` | `e4eb55b221ec2769d305e12894a4a1a49672320fa2905b1daf9e47b1a8aec623` |
| 100 | indexes | CREATE INDEX | `claim_routing_decisions` | `idx_claim_id` | `1ec38f0e7f2cbf70744fb1e1ef93da93cfdd926a02757991b8766010d298d812` |
| 101 | indexes | CREATE INDEX | `claim_routing_decisions` | `idx_tenant_id` | `9a6ea11fb5a5bb5001e991a8948261a09e21fda93221089a1f94ef0f9cb8b79b` |
| 102 | indexes | CREATE INDEX | `claim_routing_decisions` | `idx_routed_workflow` | `b78e5f6883761581e1a2d6430c16569ec7c365a9b4c7eed60cc7be6212178803` |
| 103 | indexes | CREATE INDEX | `claim_routing_decisions` | `idx_decision_timestamp` | `db150abf2eb8c8f65264808c2b6fa900c4af0b818a04e7b8a8214e8f89f4c664` |
| 104 | indexes | CREATE INDEX | `component_repair_outcomes` | `idx_cro_claim_id` | `fe8969839e5700f6cf1d95fe12164ea4511a7e55551ee6473a5cf79955286954` |
| 105 | indexes | CREATE INDEX | `component_repair_outcomes` | `idx_cro_component_severity` | `4bde10765257df3f0115819e3880d767c499925b85f963b899a22790f475db5f` |
| 106 | indexes | CREATE INDEX | `component_repair_outcomes` | `idx_cro_make_model` | `465c3c8d0c03838de5611bba0baf52e50188a9dd9756048608c5e9926512d2e0` |
| 107 | indexes | CREATE INDEX | `component_repair_outcomes` | `idx_cro_vehicle_precision` | `9306c07b77dc0e63dc06918e9b59e8c7edf6337b14848e0de4159f9019de5129` |
| 108 | indexes | CREATE INDEX | `component_repair_outcomes` | `idx_cro_market_currency` | `64ff35801232d5a681ae2a8611f99458b063ceda2b891d489eaf71724c2c5c6a` |
| 109 | indexes | CREATE INDEX | `component_repair_outcomes` | `idx_cro_outcome` | `0a446e5a577f1b21073ccd85ec1f1cd14e2f77ee6fc29a8af833e8df7daee7ea` |
| 110 | indexes | CREATE INDEX | `cost_components` | `idx_cc_claim` | `df513b6f94c332984ded61900ea8c7853aaf804f349a2c9a616cd490ac6ad405` |
| 111 | indexes | CREATE INDEX | `cost_learning_records` | `idx_clr_claim_id` | `220645fa24dcdd03db86683d9d37a0530e1ec397bbc18c6f21f3b3b0f71ac423` |
| 112 | indexes | CREATE INDEX | `cost_learning_records` | `idx_clr_tenant_id` | `85609ef0c44f9728e3a170375295799bb825c70dd33ecf0ae65bb425dc7d9133` |
| 113 | indexes | CREATE INDEX | `cost_learning_records` | `idx_clr_case_signature` | `a7f07bc975bfb93cc8d1bc4f2171288e0bbbc7f9d91071f0b92a0c3612d4e994` |
| 114 | indexes | CREATE INDEX | `cost_learning_records` | `idx_clr_vehicle_descriptor` | `dc37ab7493bc2052a43e28c1f00cbed5e581018eaddf61e985dc4ed5ad30b090` |
| 115 | indexes | CREATE INDEX | `cost_learning_records` | `idx_clr_vehicle_precision` | `da9630e50ea8763d5fa00384b318e7695e1050820036195afe498c0d70233137` |
| 116 | indexes | CREATE INDEX | `cost_learning_records` | `idx_clr_market_currency` | `7bd1e51b42c643708efdb72c7073be48ee76b7d1e0eb782de2d606a9c4fa9ebc` |
| 117 | indexes | CREATE INDEX | `cost_learning_records` | `idx_clr_collision_direction` | `155db64c1e426c774b28dede94a3bf291bbefa00a84b1c8f09ac6b9fce360bd7` |
| 118 | indexes | CREATE INDEX | `cost_learning_records` | `idx_clr_recorded_at` | `3ec696519593c3e8d453f216b29da5875bc07513e8175dc226ef4151405723c7` |
| 119 | indexes | CREATE INDEX | `country_repair_index` | `idx_cri_country` | `f75b1aa7eef60d33257809ae86aba587d054e4e656287541a0a716ae24dd4833` |
| 120 | indexes | CREATE INDEX | `country_repair_index` | `idx_cri_effective` | `2ae8ac29e4a3037cee2a290f2f6513ef6fbddb7fc262e127a0d857a254e6619f` |
| 121 | indexes | CREATE INDEX | `currency_exchange_rates` | `currency_exchange_rates_currency_code_unique` | `47fd7e37fbe33923cfa7496761739e5d68519f27bc1c91e9029d4c81ee567a56` |
| 122 | indexes | CREATE INDEX | `decision_snapshots` | `idx_ds_claim` | `1797c19b1cfd92d01060bd7b02e1feabd5dacea31e627fe3b6b75d5562f08dfd` |
| 123 | indexes | CREATE INDEX | `decision_snapshots` | `idx_ds_tenant` | `83b025375c81ef5a7047c4596987ce3cc2d50a224a2a27f4aea5242fb7e8ff88` |
| 124 | indexes | CREATE INDEX | `decision_snapshots` | `idx_ds_created` | `6df23539a0c365aa68be453905053dbad8f17760c2deb1e19c90a1a755773c68` |
| 125 | indexes | CREATE INDEX | `decision_snapshots` | `idx_ds_verdict` | `b7550c267096d20217b1bd468898651b0043a480064a9b7d2708125ea7df2356` |
| 126 | indexes | CREATE INDEX | `decision_snapshots` | `idx_ds_lifecycle` | `ebff519db2508ef9d93b7fa0636247924444b434276013ae71f49fb49e5b24ea` |
| 127 | indexes | CREATE INDEX | `document_naming_templates` | `document_naming_templates_tenant_id_doc_type_unique` | `f830f0898e2e5691b0f7e08ed83d4b86681fd649965e5ec8360e23fd5198fde0` |
| 128 | indexes | CREATE INDEX | `extracted_repair_items` | `idx_eri_claim` | `0d8b467c0f365f6782ab7876f89155263e88d299ae9cd19d565eb0fe93952a26` |
| 129 | indexes | CREATE INDEX | `fleet_incident_reports` | `idx_fleet_incident_reports_tenant_id` | `3e220eed23ceb7db5e3cb15d151d715d3e4fa69a2a4d9b43f1bffe3b83877f54` |
| 130 | indexes | CREATE INDEX | `fleet_incident_reports` | `idx_fleet_incident_reports_fleet_id` | `fa19c824c38d04dc76fc9028b8d688c32d4ba7cf067a1a3c9ff2c99abf1636be` |
| 131 | indexes | CREATE INDEX | `fleet_incident_reports` | `idx_fleet_incident_reports_vehicle_id` | `8d4050d95d5515b2b1a32946b494af4329e4c5cbcd37e1716927f27e170a9702` |
| 132 | indexes | CREATE INDEX | `fleet_incident_reports` | `idx_fleet_incident_reports_driver_id` | `1444618fb358caea883d2ea1f3d3938ee14460b8fad22397872d6656565fdb34` |
| 133 | indexes | CREATE INDEX | `fleet_incident_reports` | `idx_fleet_incident_reports_status` | `099aef75c92b10e080689669f0b9d7d5465d63b263b3f20e06b2bc371b363e81` |
| 134 | indexes | CREATE INDEX | `fraud_rules` | `rule_name` | `6e2901798ec5ff608b479088fc58eb3e7cf7e7fa143d9428f92643473701f150` |
| 135 | indexes | CREATE INDEX | `generated_reports` | `idx_gr_tenant_id` | `6b849b113942e48c96a6466e71898d4962c706c161d45a557a99f34071946589` |
| 136 | indexes | CREATE INDEX | `generated_reports` | `idx_gr_claim_id` | `ca3cd2ac637d0fa7549035049a7d793bffbd4f6f50fdd1d4e2ade06878bc915f` |
| 137 | indexes | CREATE INDEX | `generated_reports` | `idx_gr_report_type` | `6bf1cddb456655d03efeb790b74bb43b8797364eeed38500b892ab4527e14d5a` |
| 138 | indexes | CREATE INDEX | `generated_reports` | `idx_gr_generated_by` | `a6336bd9a70d8e7ebff109bc3e0bf989ba33d7fa5dc205a0b78c82cb0d61bef0` |
| 139 | indexes | CREATE INDEX | `generated_reports` | `idx_gr_created_at` | `71c0fa52bc6a395ceec4b8c7ef91c088216b9947e15bd14e15a46280c0414026` |
| 140 | indexes | CREATE INDEX | `ingestion_documents` | `document_id` | `d014f8fbf587c54d054055736f84307693dbb512ac4ab50d2c2c14eaf56716fd` |
| 141 | indexes | CREATE INDEX | `insurer_marketplace_links` | `idx_insurer_marketplace_links_tenant` | `29b04612aa1571612ad9aa892de8fb5c0dde1de98142bc310281794515783836` |
| 142 | indexes | CREATE INDEX | `insurer_marketplace_links` | `idx_insurer_marketplace_links_profile` | `c4a6388cb506467a6634142633c4565a8d5a44537ddabb41480e8316d9ffff5e` |
| 143 | indexes | CREATE INDEX | `insurer_marketplace_relationships` | `idx_imr_tenant` | `097d5aa24a74eaf594a1f6cdbb795c7bcff16a26a93d8480ed05ccfadf0ce06e` |
| 144 | indexes | CREATE INDEX | `insurer_marketplace_relationships` | `idx_imr_profile` | `8ad13ce0fd3a102d0a4d69c37adb53b844e5952d4f70a36d345e81fd654a23a1` |
| 145 | indexes | CREATE INDEX | `insurer_marketplace_relationships` | `idx_imr_status` | `aea622a5dc0a5219fd745760580a289388786cdf5b5c47dd3c367bac08c71fc7` |
| 146 | indexes | CREATE INDEX | `insurer_quote_requests` | `idx_iqr_claim_id` | `192d01c9799d1bea4a9322a0a021c91b1f7501e8ee2aa220ef44394d45dd26b4` |
| 147 | indexes | CREATE INDEX | `insurer_quote_requests` | `idx_iqr_insurer_tenant` | `79b7e8e8e089f93a06a479893adc649628e67ef33ccb87b1b5e99be8cb438f0c` |
| 148 | indexes | CREATE INDEX | `insurer_quote_requests` | `idx_iqr_agency_tenant` | `63e5edfe9cdd33306c218fee73dfdb238ad1a028e8c81651370a0cd542c35361` |
| 149 | indexes | CREATE INDEX | `insurer_quote_requests` | `idx_iqr_status` | `13b1a565f9c0797a4ba80914abfd3b8ade12610cb04ba8523550a6b2ada73947` |
| 150 | indexes | CREATE INDEX | `marketplace_profiles` | `idx_marketplace_profiles_type` | `772ab954f85a83c40fca5e46f7d98de0a3d7d4a8e088d4ecdf1af611f9626186` |
| 151 | indexes | CREATE INDEX | `marketplace_profiles` | `idx_marketplace_profiles_approval_status` | `a352c83f6b301ce37066f588c69272c9572a6dece5ec014c6b0e4489f9424f03` |
| 152 | indexes | CREATE INDEX | `marketplace_profiles` | `idx_marketplace_profiles_country_id` | `fd0db956ec7145b07d005402cf18924c93094badd144915b406432e5fa6c5fbe` |
| 153 | indexes | CREATE INDEX | `panel_beater_quotes` | `idx_quotes_claim_id` | `0025185fdc8d19afc1f0243572a2791e9c7ca47d75d0118a6ec362b6e6e99b07` |
| 154 | indexes | CREATE INDEX | `panel_beater_quotes` | `idx_quotes_panel_beater_id` | `21adc65cfca03772d2413baa63fa0404b02c0c323026f7d6acb0c56f0dfa90d3` |
| 155 | indexes | CREATE INDEX | `panel_beater_quotes` | `idx_panel_beater_quotes_panel_beater_id` | `5c0fb4ff805a1d79fd1c3a58ec6d3b09487ebff779efe372e1668e7670293b52` |
| 156 | indexes | CREATE INDEX | `pdf_reports` | `idx_snapshot_id` | `26a0eb97345f2d219dbd2f373f7308acd613e6df1a257202af9c697fa516df1a` |
| 157 | indexes | CREATE INDEX | `pdf_reports` | `idx_tenant_id` | `972fe6eb8bfcce1fa65c32ee246b5e8691c77d7104b583c778b2e7efd008d07b` |
| 158 | indexes | CREATE INDEX | `quotation_request_documents` | `qrd_quotation_request_id` | `77e7527d5018df1453ed71d246a5c7b82ca1f04755c501b23331d00baa90b1b7` |
| 159 | indexes | CREATE INDEX | `quotation_request_documents` | `qrd_client_user_id` | `4d8cea7fd1aff2fda645ae394e66fa0c683e6b3fe64d77705b786a5222e5f9d9` |
| 160 | indexes | CREATE INDEX | `quote_optimisation_results` | `idx_qor_claim_id` | `eddd474c3a70925a5bf10f06472fad09ae923e4d42608db02b343a330248a425` |
| 161 | indexes | CREATE INDEX | `quote_optimisation_results` | `idx_qor_status` | `c7a67446ef9518df44a00811d7f98175c4e3ca5a825051cafda588e4ec145a9f` |
| 162 | indexes | CREATE INDEX | `quote_optimisation_results` | `idx_qor_risk` | `0817fa6f3c8bd43ec4072e794c40ef573ac767ad05dc6e6f08f9b90208502744` |
| 163 | indexes | CREATE INDEX | `repair_cost_intelligence` | `idx_rci_make_model` | `98963ac400e6db61e5040585e97dc1b3080f0aae0aec27e0195411b3e34a3932` |
| 164 | indexes | CREATE INDEX | `repair_cost_intelligence` | `idx_rci_damage_category` | `5c11b8401fb0889617d2cf04bb633c503326fa2afc5067e3b4851512a2874d0a` |
| 165 | indexes | CREATE INDEX | `repair_cost_intelligence` | `idx_rci_country` | `8c056a0ac451b8e4ae9cdc01fdf45fa04dc8699edfeeaf8042ee63e6f5a56aa2` |
| 166 | indexes | CREATE INDEX | `repair_history` | `idx_rh_repairer_id` | `001d4ce273b4124f286bb43c6700ade0d20c4dc48d82cca396ba981e0de64bb0` |
| 167 | indexes | CREATE INDEX | `repair_history` | `idx_rh_vehicle_id` | `ac7764e3022e757b0d9cb5274e7fd77fdd0e695c9de1ffd3ba6038e249c8c805` |
| 168 | indexes | CREATE INDEX | `repair_history` | `idx_rh_claim_id` | `c3f9205cea502cbff7211b5692f18a801b4f02d8d9baa384a7f3ff6d405d4806` |
| 169 | indexes | CREATE INDEX | `repair_history` | `idx_rh_repair_date` | `9fbdb44d4a29954bcd9344cb2522aa3c55ee76b35b80c3c92d4d607873e52289` |
| 170 | indexes | CREATE INDEX | `repair_history` | `idx_rh_quality_score` | `de5df75bf3a05dcdcc05244ebf759909baaab84faac7a6ab06d0c59a3c46a99d` |
| 171 | indexes | CREATE INDEX | `repair_history` | `idx_rh_repeat_damage` | `e35735ac104707e5cd944972aeacfafb0dc7bc2d982c40a43c4adf98dee9eb94` |
| 172 | indexes | CREATE INDEX | `repair_history` | `idx_rh_warranty_repair` | `c41a3b7b6e96decfe7d8e4302246d6dc9fe8642d2dffa3e52eab5d13791aee2e` |
| 173 | indexes | CREATE INDEX | `repair_history` | `idx_rh_fraud_flagged` | `48649994aa476abad8e2d24eb2549170011d1347e59ae144afd1bfe944b616fa` |
| 174 | indexes | CREATE INDEX | `repair_history` | `idx_rh_tenant` | `202eba66a2474914f197cb1ffd89e17f4d17905d45674f37abb792828b582af4` |
| 175 | indexes | CREATE INDEX | `report_access_audit` | `idx_report_id` | `3ca47608846cd907c497d9dd4a95d5bd9294e32c2b7c6e870355a76b03131691` |
| 176 | indexes | CREATE INDEX | `report_access_audit` | `idx_accessed_by` | `405b750a8f05bdc917e53ed6f5f765c8b62a368d33b7fa34eb10f1ba5be914ed` |
| 177 | indexes | CREATE INDEX | `report_access_audit` | `idx_tenant_id` | `3aa541c92b602eeccd30d71258386e5ca2e03ba726a75af93f9da16de365697d` |
| 178 | indexes | CREATE INDEX | `report_access_audit` | `idx_accessed_at` | `9067cd7d279a39d1b27f74d21df2074d1c316f66530486db8c57b4ed04efd3e9` |
| 179 | indexes | CREATE INDEX | `report_links` | `idx_snapshot_id` | `ee359a450d614f95413dd0f1a707179b1cfdffd6e7bde53843523a7b18f8ed4a` |
| 180 | indexes | CREATE INDEX | `report_links` | `idx_access_token` | `ddf8137c639b5ba458823991371494f6e9c4c4277ed3aaed170731d0f8e26657` |
| 181 | indexes | CREATE INDEX | `report_links` | `idx_tenant_id` | `b99d3fb38516f65e350141661663982808dc45f7a7d51e2dff86ef7fff328da8` |
| 182 | indexes | CREATE INDEX | `report_snapshots` | `idx_claim_version` | `883af4ead96f38273742ca6e23a4e3e4272ce2483ff2e6734151ed27b4c84b26` |
| 183 | indexes | CREATE INDEX | `report_snapshots` | `idx_audit_hash` | `16ad6cbc760ef245166b47b8dee67ff1bfc8f2cce3fd4456943bfe8b515670b2` |
| 184 | indexes | CREATE INDEX | `report_snapshots` | `idx_tenant_id` | `6c18804b23ee137dc9b551461822d0c93c116630ad203773608aafacf77e33dc` |
| 185 | indexes | CREATE INDEX | `report_snapshots` | `idx_generated_by` | `f094ee8179ba53cd21afc32e42f3dc4747c708a1a5d6fc8b2a67163b5a19a558` |
| 186 | indexes | CREATE INDEX | `valuation_comparable_evidence` | `valuation_comparable_request_idx` | `c28222f92cbc81e9f197960adbb0b300f23121f8e6a2ae36173a48538fe59589` |
| 187 | indexes | CREATE INDEX | `valuation_comparable_evidence` | `valuation_comparable_source_idx` | `005b75226197c670223e84cc52fd4858610450717d5ee7c2e06de5dc2156f3f8` |

## Reproducibility command

```bash
node scripts/generate-d03-statement-ledger.mjs verify audit/gate-c-scratch-baseline/wave-03-generated/wave-03-assessment-evidence-reporting.sql audit/gate-d-d03-statement-hash-ledger-2026-09-13.json
```
