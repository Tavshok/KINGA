# D-02 Wave 2 Marker-Split Statement Hash Ledger

This manifest is generated deterministically from `audit/gate-c-scratch-baseline/wave-02-generated/wave-02-vehicle-claim-core.sql`. The source file is immutable; it is split only on the exact literal `--> statement-breakpoint`, then each resulting UTF-8 fragment is trimmed. Each emitted statement retains its terminal semicolon and is hashed with SHA-256. The JSON companion ledger contains the exact full SQL for every row.

| Control | Value |
|---|---|
| Full source SHA-256 | `15661c69490a4360931ef5fc3d17e2b4521f692730b2d113f1342117b067e7b9` |
| Marker count | 86 |
| Executable statement count | 87 |
| Statement class totals | 20 `CREATE TABLE`, 9 `ADD FOREIGN KEY`, 58 `CREATE INDEX` |
| JSON companion | `../../audit/gate-d-d02-statement-hash-ledger-2026-09-12.json` |

> Do not run the raw source through `mysql < file.sql`. The `--> statement-breakpoint` literal is repository tooling, not a MySQL/TiDB comment. For each future owner-operated statement, compare the prepared SQL text and its SHA-256 with the matching row below before execution.

## Ordered execution ledger

| # | Phase | Statement class | Table | Object / constraint / index | SHA-256 of emitted SQL |
|---:|---|---|---|---|---|
| 1 | tables | CREATE TABLE | `—` | `claim_assignments` | `35e35582b08eeae2707524f063d0a5c54728ba86170aababd04a692cc14ce6ed` |
| 2 | tables | CREATE TABLE | `—` | `claim_documents` | `1dbfcd2f29568f7225cad29f15878d9133d506f2d5df9d494ab113641a6dc219` |
| 3 | tables | CREATE TABLE | `—` | `claims` | `62dbd789709e5b3ce2c71e4c40f7a7082d40cbddb83a88475ab19e29d4adac0c` |
| 4 | tables | CREATE TABLE | `—` | `drivers` | `e223034d7dfbaa1fb3339775a628da239bbe536f4ccd46a4305ae0cca3a38a96` |
| 5 | tables | CREATE TABLE | `—` | `inspections` | `151cbd52cc15f10fd2c9dd13906fcf3e309271befbb90c682ae5f13e10a342e8` |
| 6 | tables | CREATE TABLE | `—` | `insurance_audit_logs` | `86e362ea78f074f518e729669bc64a4fdb68db59431cc4c7f05e5bbbb4c789c2` |
| 7 | tables | CREATE TABLE | `—` | `insurance_carriers` | `f3d2e0fe623d6cd986c4d08e3a438904202f58f7330c6b79336a51a5ae37142e` |
| 8 | tables | CREATE TABLE | `—` | `insurance_policies` | `954072f35d3309ba673fd5e9c5ed349885f30fe860642491afbe3d43ee746a09` |
| 9 | tables | CREATE TABLE | `—` | `insurance_products` | `a67ee17c828119dcf6f67367329a36106fd33889c9ee812872e9dd6b8a49fa8d` |
| 10 | tables | CREATE TABLE | `—` | `insurance_quotes` | `9732e15cdb0dd6b81bb27d6bf7a2efa270edbe591975018e494f0b0e5d4dc868` |
| 11 | tables | CREATE TABLE | `—` | `measurement_types` | `8ec24f9fd84221da16be547e239a2764b3aea8176a1129791990ba50f2113274` |
| 12 | tables | CREATE TABLE | `—` | `vehicle_condition_assessment` | `0141ceb42e52b763e0ab220c88faa6304c4a68203ddf9df29baf213889968129` |
| 13 | tables | CREATE TABLE | `—` | `vehicle_condition_snapshots` | `cec5a20b7638d16c8e7c44a815ba61cf6bad3de1b373235e30abe5b8b64c1f32` |
| 14 | tables | CREATE TABLE | `—` | `vehicle_damage_history` | `8eaa1dd9a5b830ae17cabffad94cb810e2c58633998686eebb81055072474318` |
| 15 | tables | CREATE TABLE | `—` | `vehicle_geometry_measurements` | `9546fde23ecc9c763316a5fa3d38243d3dbb2fa01e5943793f08e317dc46c2d0` |
| 16 | tables | CREATE TABLE | `—` | `vehicle_market_valuations` | `7bd15dee50fc6e042fcaa90f29168db1fc101d79d8a3e61a6edadc70cf4199bf` |
| 17 | tables | CREATE TABLE | `—` | `vehicle_mileage_logs` | `6fd4eb1f0dcbb9180327adc939ff05abe230b33c8c2001de913d374c69d07818` |
| 18 | tables | CREATE TABLE | `—` | `vehicle_models` | `26455fea545c91ee47fe58be7ad90513cc1e769dbc4d553fdda185aea02b5b82` |
| 19 | tables | CREATE TABLE | `—` | `vehicle_passport_snapshots` | `feaddb18e1a5aa79a92b0bd4be9cb53440f75d661d9b21443922efb72ef6fd66` |
| 20 | tables | CREATE TABLE | `—` | `vehicle_registry` | `e24c98595af401c729189de3e2e73aa3ca146590797d4f41d694d3c05abd747e` |
| 21 | foreign_keys | ADD FOREIGN KEY | `claim_assignments` | `claim_assignments_claim_id_claims_id_fk` | `9902163d5fbac1d63d800c38596d30a63657af1609e9c0ef83c4ecb986023ac9` |
| 22 | foreign_keys | ADD FOREIGN KEY | `claim_assignments` | `claim_assignments_assigned_to_user_id_users_id_fk` | `1b6fe0343278ffb6530e38851c334e9105510f63c14dbd396511c7fb0f0304c3` |
| 23 | foreign_keys | ADD FOREIGN KEY | `claim_assignments` | `claim_assignments_assigned_by_user_id_users_id_fk` | `74e44fe458773ac3365f99331010b3b050abb1f92a1fe63de6aefa9852560910` |
| 24 | foreign_keys | ADD FOREIGN KEY | `claim_documents` | `claim_documents_claim_id_claims_id_fk` | `a46655f0cd0f760ea9a275dfd323265ac2f6608293acc8c079bf759bde47b4b1` |
| 25 | foreign_keys | ADD FOREIGN KEY | `claim_documents` | `claim_documents_inspection_id_inspections_id_fk` | `b271049d1b1e35d318bad11253b55c66fd291793d732f1ff2003b9bfab6bd2f5` |
| 26 | foreign_keys | ADD FOREIGN KEY | `vehicle_condition_assessment` | `vehicle_condition_assessment_claim_id_claims_id_fk` | `a8ad4eeb437d754ee25de14cda92aea6cff4476b764798c97b9e57b4c0fa32a1` |
| 27 | foreign_keys | ADD FOREIGN KEY | `vehicle_damage_history` | `vehicle_damage_history_claim_id_claims_id_fk` | `e8d106a22f68ad0d9b92455ee59020fe69f1edf6519bcc93afbe04cecbf68757` |
| 28 | foreign_keys | ADD FOREIGN KEY | `vehicle_geometry_measurements` | `fk_vgm_vehicle_model` | `af3ad1b02c9d8aae0090b03d81a6b5142953020166cea5bc6c15827abed82a5e` |
| 29 | foreign_keys | ADD FOREIGN KEY | `vehicle_market_valuations` | `vehicle_market_valuations_claim_id_claims_id_fk` | `765d8c9921f542fc1af882bb9e29eb83c97772bd37a6413a51a0c169219818a5` |
| 30 | indexes | CREATE INDEX | `claim_assignments` | `idx_claim_assignments_claim_active` | `c17d88001cf29d4c77a2904eed0d49d02ac4fb24d94f39351badffb5c617ed7f` |
| 31 | indexes | CREATE INDEX | `claim_assignments` | `idx_claim_assignments_assignee_active` | `ca839ed7066104f448936902051dd1de17480c44fb4036e899aa12645e7e18c9` |
| 32 | indexes | CREATE INDEX | `claim_assignments` | `idx_claim_assignments_tenant_role` | `f285c11d07bf686b012330f14f38b5f9b911ca45ec35c45b5791e4aebb05f195` |
| 33 | indexes | CREATE INDEX | `claim_assignments` | `idx_claim_assignments_parent` | `9130e1f948a395742ed5b6e1a5ceba8c30bad35a37aa2bc8b7531a4a40d391f5` |
| 34 | indexes | CREATE INDEX | `claim_documents` | `idx_claim_id` | `f3dea32f50fed9d0c4a3fff5027462990731090d354faeec20d94d0ab08b129d` |
| 35 | indexes | CREATE INDEX | `claim_documents` | `idx_uploaded_by` | `4bc801353e7d38344d7cf4d72763551f085bb4b4a4de54defcfe1a0b90a2b22c` |
| 36 | indexes | CREATE INDEX | `claim_documents` | `idx_category` | `00b80ce6336a951199d1e5271ca55fe8647b54dee7007e4900ec7eb2a72e9815` |
| 37 | indexes | CREATE INDEX | `claim_documents` | `idx_cd_inspection_id` | `94e2660d9d5e49a2345d00380e901beef991e717a678feb7da49222cb0da24fd` |
| 38 | indexes | CREATE INDEX | `claims` | `claims_claim_number_unique` | `caa94cc76bb08e6f0df635acdc2eb76616a3b1403510934f8457f22a55a2b262` |
| 39 | indexes | CREATE INDEX | `claims` | `idx_claims_vehicle_registry_id` | `2a46111e0a356ec7a6d9d3d260fa9f522387cd609cda07ce517db7688e61e426` |
| 40 | indexes | CREATE INDEX | `claims` | `idx_claims_claimant_id` | `a747cca677a122ce219e6e83f8c91b41c5c2777cd0cb2063c18dc2417bf99c9f` |
| 41 | indexes | CREATE INDEX | `claims` | `idx_claims_assigned_assessor_id` | `78dd6211281848fc87b07545ff58bde19099361413c8d4ed31e93ae77bd0748c` |
| 42 | indexes | CREATE INDEX | `claims` | `idx_claims_status` | `e364aead76a629122db77a03700f3eed948d3d150e345c347a7aac46e41be2a1` |
| 43 | indexes | CREATE INDEX | `claims` | `idx_claims_created_at` | `0fed4ea91d3174fc44ae8090843ff005ee4520650baed74841497862b9850552` |
| 44 | indexes | CREATE INDEX | `claims` | `idx_claims_tenant_workflow_created` | `c13635352bd2c43e17ae353791001bfd1bedefbdee80ba5b910ac04da6b154a3` |
| 45 | indexes | CREATE INDEX | `claims` | `idx_fraud_risk_score` | `f944f0dac6081c39348c12dbf1bd1e61f66817d6302a1ab4f30ddbff32414928` |
| 46 | indexes | CREATE INDEX | `claims` | `idx_confidence_score` | `046d8ce25f4593cefb46c9e8f5e0233e97243feb97757370140aa15109b215aa` |
| 47 | indexes | CREATE INDEX | `claims` | `idx_routing_decision` | `6ff4d4ea86e7bf5ee373f7bc6eca427588ac519a05394bd6700e92fbd1a62b38` |
| 48 | indexes | CREATE INDEX | `claims` | `idx_policy_version_id` | `20fb1dbd036edba8d43baf15b37e07f9df98cada150a9bd94a2ef5c72c5b3329` |
| 49 | indexes | CREATE INDEX | `claims` | `idx_claims_tenant_status` | `359d9f8de9e6bd11af196c04aae371348b07c67e66cfe7efab476dedc56013c7` |
| 50 | indexes | CREATE INDEX | `claims` | `idx_claims_tenant_created` | `02ab158efef9af918b2e165ec7c4f6014ca8a2634a83c5c9235bd2ab9a15a2a5` |
| 51 | indexes | CREATE INDEX | `claims` | `idx_claims_fleet_driver_id` | `ce2a6a43cf15fd87c9169384ebc00b66f6511e1848b0e288750ed39ddb246642` |
| 52 | indexes | CREATE INDEX | `drivers` | `idx_drivers_full_name` | `1f893678f2e2df2522be183a4836d8d2ed96f104429d4c589a7ae9db4486614a` |
| 53 | indexes | CREATE INDEX | `drivers` | `idx_drivers_email` | `f6c89a398bae7789d5f42d36fa0aa465f6bd62767cad812e58f2abae20115c6e` |
| 54 | indexes | CREATE INDEX | `drivers` | `idx_drivers_phone` | `68c5f4923291935a8b2db4da9332451c2cca626d5b7bddfef0cb3f265ab1e947` |
| 55 | indexes | CREATE INDEX | `drivers` | `idx_drivers_national_id` | `adf2be1483f6c1fe5e11d0828ba373809fc75e8f459d7079d618994d46b5eda7` |
| 56 | indexes | CREATE INDEX | `drivers` | `idx_drivers_tenant` | `1aa870e8c6c3831b66d0bdcec88c79e1d0f31df0f851a4c0def222615c5b5fa0` |
| 57 | indexes | CREATE INDEX | `drivers` | `idx_drivers_risk_score` | `305c9c74190d3556aa67b89242df085f14abd33376f496bd78f429c7229dff7c` |
| 58 | indexes | CREATE INDEX | `drivers` | `idx_drivers_repeat_claimer` | `dcb198846b9490fdf718365be94e13590f413ed4ecbc44738995a4e323b178ae` |
| 59 | indexes | CREATE INDEX | `inspections` | `idx_inspections_tenant` | `b08e499e56ad48aa656fee8efc49d2d7750cb0089e5cd3f6d7b9ef7e8fc60995` |
| 60 | indexes | CREATE INDEX | `inspections` | `idx_inspections_claim` | `0adb43399c38dde3f4c0f5d0221a6eedeacbc77fd18e25cd6295f015108f09f8` |
| 61 | indexes | CREATE INDEX | `inspections` | `idx_inspections_project` | `05be6f40cb47b8f48c886d54a9f6e61f52e312b9fac783f79b7312664b8c1485` |
| 62 | indexes | CREATE INDEX | `inspections` | `idx_inspections_engineer` | `05ef7adf447176e697d9bcc5f393405415ca12d5e3cf3cfbefc318c4b82f1083` |
| 63 | indexes | CREATE INDEX | `inspections` | `idx_inspections_asset` | `e52ed0b0c1354820d3bad26fcd154e3c045e03b9ef4aae663c07d97c22ab6774` |
| 64 | indexes | CREATE INDEX | `inspections` | `idx_inspections_vehicle` | `a07b58afef7ee9774ccb36deacb1cea5c60adbaac0945d4f5274c73beab01c9e` |
| 65 | indexes | CREATE INDEX | `inspections` | `idx_inspections_status` | `4eb5999e080e9e290c117897d31ef6a1740d65c125ac4a296af60ce444edf531` |
| 66 | indexes | CREATE INDEX | `insurance_carriers` | `insurance_carriers_short_code_unique` | `3642b8a261446c6f4e477697c99bd628d49c8a439dd3be433a87fa8fa6df56c0` |
| 67 | indexes | CREATE INDEX | `insurance_policies` | `insurance_policies_policy_number_unique` | `b052e15231f0f64ba85739775bb403a8472bb2b9e38a542d6314785d0a4a9de5` |
| 68 | indexes | CREATE INDEX | `insurance_quotes` | `insurance_quotes_quote_number_unique` | `ba38d4c13d04bea7f344357328b5f69cd25bede95a9ae9572ff3d3e2a7627078` |
| 69 | indexes | CREATE INDEX | `vehicle_condition_snapshots` | `idx_vehicle_condition_snapshot_vehicle_date` | `589a223a7744aa28fbe1de4a85b618da1d7ea9db6598026dad0acc0a7f3c6503` |
| 70 | indexes | CREATE INDEX | `vehicle_condition_snapshots` | `idx_vehicle_condition_snapshot_tenant_vehicle` | `9b792bf2a1df755986236fbb105bf583877ecb569581fbebd6e1c30b869a26c2` |
| 71 | indexes | CREATE INDEX | `vehicle_damage_history` | `idx_vdh_vehicle_id` | `aac72fd4ebc11235fdca41ba0ba7837a184b0b593fba9ce40e4c9bbaea983d1e` |
| 72 | indexes | CREATE INDEX | `vehicle_damage_history` | `idx_vdh_claim_id` | `7388bc2e3ee13188f4b65fd64da77b45340164899fe868a7bc6ff37335618afb` |
| 73 | indexes | CREATE INDEX | `vehicle_damage_history` | `idx_vdh_vehicle_reg` | `15e6d55657f8c89c04269227b65770a979a76c825b8ded3f51f9b3e16cbb21a5` |
| 74 | indexes | CREATE INDEX | `vehicle_damage_history` | `idx_vdh_damage_zone` | `85342d0bf347a1d4ea2368f5f78a18a9fd17835c5bcea21937f6c04afdcf3a8f` |
| 75 | indexes | CREATE INDEX | `vehicle_damage_history` | `idx_vdh_severity` | `7586dde63a8d3932ec3d6729a0f2a4f0e5411f9fa7bb40bb396ae03b18d0088c` |
| 76 | indexes | CREATE INDEX | `vehicle_damage_history` | `idx_vdh_tenant` | `8be022380e19bf1cca9b0dccddaa4dc7eb26e1d67ca49551c0961fda4c0f1cac` |
| 77 | indexes | CREATE INDEX | `vehicle_damage_history` | `idx_vdh_repairer` | `dfbbb09d4b53762c0d552812909591d6c95265975fd3b9b88bb6a3af60cb98c7` |
| 78 | indexes | CREATE INDEX | `vehicle_damage_history` | `idx_vdh_repeat_zone` | `c6b91acc405afc85915a7867a1702a23a2bcc81c925bfeb666a6a2704f20212d` |
| 79 | indexes | CREATE INDEX | `vehicle_passport_snapshots` | `idx_vps_vehicle_registry_id` | `c47a2aa34061968e1261d03e913d4d9314e8388f11c571f4e3899d947772bedd` |
| 80 | indexes | CREATE INDEX | `vehicle_passport_snapshots` | `idx_vps_registration_number` | `c07ecc00971283bcd6d2ed0dbc8d889c7883e5fe8241c75725fed2640cadc053` |
| 81 | indexes | CREATE INDEX | `vehicle_passport_snapshots` | `idx_vps_tenant_id` | `a244ccc63a0cfdb72ebbdc1a73022fcdafbcb3bdf76938638b7f192e72483b98` |
| 82 | indexes | CREATE INDEX | `vehicle_passport_snapshots` | `idx_vps_generated_at` | `8fe7357e7049746a689d70aa6eeb4c804ce1e170bb38842426e4beac80d066a4` |
| 83 | indexes | CREATE INDEX | `vehicle_registry` | `idx_vehicle_registry_registration` | `2e91d971e879709a145e04a8b05cfec3456e88e46c827b9aef92d88a548a013b` |
| 84 | indexes | CREATE INDEX | `vehicle_registry` | `idx_vehicle_registry_make_model` | `656bbded450a88edfc162fc40e30aa144fa305c00f0998c3d516e229b820e5f7` |
| 85 | indexes | CREATE INDEX | `vehicle_registry` | `idx_vehicle_registry_tenant` | `bfb51f90203cc508596d521366cbeffe148dde986a7cbad95b6e7734d177e1c9` |
| 86 | indexes | CREATE INDEX | `vehicle_registry` | `idx_vehicle_registry_risk_score` | `915476753fab3371267436b4f3561700d1e0ce3e300fd03ca558f45a57950bd3` |
| 87 | indexes | CREATE INDEX | `vehicle_registry` | `idx_vehicle_registry_repeat_claimer` | `f9d97561b7d9d5bb3dda635eb2f5912791e88641d91648c20df337cba7aad25a` |

## Reproducibility command

```bash
node scripts/generate-d02-statement-ledger.mjs verify audit/gate-c-scratch-baseline/wave-02-generated/wave-02-vehicle-claim-core.sql audit/gate-d-d02-statement-hash-ledger-2026-09-12.json
```
