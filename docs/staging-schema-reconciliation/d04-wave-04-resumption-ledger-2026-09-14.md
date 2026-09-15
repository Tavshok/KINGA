# D-04 Wave 4 Resumption Ledger

This ledger is generated from the historical 135-statement D-04 ledger and its 134-statement revised counterpart. It proves that accepted historical ordinals **1–98** are unchanged, historical ordinal **99** is deliberately omitted, and each pending historical ordinal **100–135** has byte-identical SQL and SHA-256 in the revised source.

| Control | Value |
|---|---|
| Accepted historical ordinals | 1–98 — do not rerun |
| Omitted historical ordinal | 99 — `idx_recipients` whole-TEXT index, SHA-256 `8c311efadee5252063684a34415396d947f6dc4dcc2c823376386f0014b4041b` |
| Resumption range | Historical ordinals 100–135 only |
| Resumption statements | 36 |
| Revised full-source SHA-256 | `7e5802c2a4c57cee21a951a0ca85d174b1f03fb5c560c00925564455ef9cfd69` |
| Resumption-ledger SHA-256 | `c0253bdb9edc9f0aa6433bb95d44db468f89cce38fc89bcdb97da578b0d7f1f3` |

> Do not run the historical source or historical full ledger. Do not rerun statements 1–98. After a new immediate preflight and hash verification, begin with file `100-idx_read_at.sql` and follow this ledger in order.

## Ordered pending statements

| Historical # | Revised # | Phase | Class | Table | Object | SHA-256 |
|---:|---:|---|---|---|---|---|
| 100 | 99 | indexes | CREATE INDEX | `governance_notifications` | `idx_read_at` | `5a93184ffaa42afbeca3ae9b29c7fb9cc1f0f3774e0084d127aefdda201e5e0a` |
| 101 | 100 | indexes | CREATE INDEX | `governance_notifications` | `idx_created_at` | `72569b87ad56b6003e3cc463f5bc2ad2fb71e63c0c278433a74841aaf2e6fc48` |
| 102 | 101 | indexes | CREATE INDEX | `governance_violation_log` | `idx_gov_violation_tenant` | `4553ef3ad538a1cb114341bd9652af865c5d1f39fac1d9425c905b53156c0b5a` |
| 103 | 102 | indexes | CREATE INDEX | `governance_violation_log` | `idx_gov_violation_user` | `7c29fcdb964fd2b38655213e7f2c38eaf2f5f6591da882a43739a1c9b6df433d` |
| 104 | 103 | indexes | CREATE INDEX | `governance_violation_log` | `idx_gov_violation_type` | `c24e6a46e154ea573dc629f232cb8903b72f00257c62c5f3f5d7553f841d4d99` |
| 105 | 104 | indexes | CREATE INDEX | `governance_violation_log` | `idx_gov_violation_at` | `7cf4e8cfb489af645c8dbf9246a4d5ddb46275e9cf6263c7b8acca1fc5aceaeb` |
| 106 | 105 | indexes | CREATE INDEX | `governance_violation_log` | `idx_gov_violation_tenant_time` | `3091425e7a98c38ef6170115b91debca3ce110bc208e25975498e6c98fa15025` |
| 107 | 106 | indexes | CREATE INDEX | `notification_events` | `idx_ne_idempotency_key` | `00b1ecb514c6f8102a65955606393cb388b0338cdc3e9182acdd8ee4bd4379c3` |
| 108 | 107 | indexes | CREATE INDEX | `notification_events` | `idx_ne_recipient` | `10b6a01f500bb87b91c2e4cba2095bc047dd50d29270f7595f2cad7c2c8171a4` |
| 109 | 108 | indexes | CREATE INDEX | `notification_events` | `idx_ne_event_type` | `5f27c8a7b97482b934559adcdeb3ab3637e74ee7150f03856ad08a6a331e9987` |
| 110 | 109 | indexes | CREATE INDEX | `notification_events` | `idx_ne_created_at` | `5d9d641d7d7b339b8fcb52b6ddce5177b8a378df17faee0ae062bf8c68965a2a` |
| 111 | 110 | indexes | CREATE INDEX | `notification_preferences` | `idx_notif_pref_user` | `92eed1cd8cf45070adbe0daa7a28edd513d94dac9e32d25540e13fa8fd70c66a` |
| 112 | 111 | indexes | CREATE INDEX | `notification_preferences` | `idx_notif_pref_tenant` | `ebfb25b64da4f5e700208b0e7cacff0cdf318267fcb60f9ee56ade1834c735c7` |
| 113 | 112 | indexes | CREATE INDEX | `platform_governance_limits` | `idx_gov_limits_version` | `41ead3a8e570fac9b7b9c583aadcf86a4cf52f2333f1cd01cbc1a169fb588c5f` |
| 114 | 113 | indexes | CREATE INDEX | `platform_governance_limits` | `idx_gov_limits_effective` | `df72cc7f2dc4bf881a8ebec07ea69dfcf894741396760632a1b69d6619bdd0b3` |
| 115 | 114 | indexes | CREATE INDEX | `rate_limit_tracking` | `idx_user_tenant_action_window` | `eda86d82cab4105ee1afc3e42732baf90f9fa4494c0348eea3b16f0da6009a61` |
| 116 | 115 | indexes | CREATE INDEX | `rate_limit_tracking` | `idx_window_start` | `c5adcb8e263ebe1d5363eba9e708f94de8b3d316ade845d1ad7faeb3def48d01` |
| 117 | 116 | indexes | CREATE INDEX | `recovery_cases` | `idx_rc_tenant_id` | `4165431f82353e164691ab1a8819f764de767d9c9904e862e25dfca2e3fe2505` |
| 118 | 117 | indexes | CREATE INDEX | `recovery_cases` | `idx_rc_claim_id` | `04a3159d8f92639f9e6e7a83ad272007fd82dd72c283463c573750cfa79e4d08` |
| 119 | 118 | indexes | CREATE INDEX | `recovery_cases` | `idx_rc_status` | `c4fbb3acb1714969dbded93b22948a931768fd8b6fda297774707271b2dae14c` |
| 120 | 119 | indexes | CREATE INDEX | `recovery_cases` | `idx_rc_tenant_status` | `f4819870dd01ac28833ebb00f864aebf819e31ac4dc70d0d5f54a8a108706084` |
| 121 | 120 | indexes | CREATE INDEX | `recovery_cases` | `idx_rc_assigned_officer` | `5a8a38ec62db6d877b65850f178349a2bac6b1e8e451399a79b22799e070496a` |
| 122 | 121 | indexes | CREATE INDEX | `recovery_cases` | `idx_rc_rps` | `62d3f962be0f609406cb20497b69dbede3ddcd549896e0518eb21a73456450c8` |
| 123 | 122 | indexes | CREATE INDEX | `recovery_cases` | `idx_rc_recovery_deadline` | `58668a66eef6ec5a7c37bf8108d5e3163c6bb77bf03301bff87c30ce7b3b3d7f` |
| 124 | 123 | indexes | CREATE INDEX | `recovery_correspondence_log` | `idx_rcl_case_id` | `c31d6bd5a1d5aed81bbfacbb68a7e858464bf3789951cf6313b63c81d2e5ca17` |
| 125 | 124 | indexes | CREATE INDEX | `recovery_correspondence_log` | `idx_rcl_tenant_id` | `38702f43abe3b8ce7e126033bb6bb441dd02e268963b2ae8cf7bb3c5481ff90b` |
| 126 | 125 | indexes | CREATE INDEX | `recovery_correspondence_log` | `idx_rcl_created_at` | `4db3cac9242792376dd35eaa2274574baff30e0042f888e868a1b8423af90c17` |
| 127 | 126 | indexes | CREATE INDEX | `tenant_workflow_configs` | `tenant_id` | `b47c0ec43463e80d2447978416d40b907d6046bb237d50bdba9a97b30587afba` |
| 128 | 127 | indexes | CREATE INDEX | `whatsapp_sessions` | `idx_wa_phone` | `21045d37b01bfa1621714ecbaba66aa9f2b004096276ea897d9d89bb1fb91a04` |
| 129 | 128 | indexes | CREATE INDEX | `whatsapp_sessions` | `idx_wa_status` | `a0a09eab1a6ece622240325cb233af77c086dded0130ef1fd209ac5d4de5bdae` |
| 130 | 129 | indexes | CREATE INDEX | `workflow_audit_trail` | `idx_workflow_audit_claim_state_time` | `ee0a2afa4389024a95dd832e63e9ef8693cfa2ef8a6a9a8555f2185822b99795` |
| 131 | 130 | indexes | CREATE INDEX | `workflow_audit_trail` | `idx_workflow_audit_override` | `b3ed17ee74473317aa38ae061cbcaa88569e036ed637913b2b88ec2362b40d0d` |
| 132 | 131 | indexes | CREATE INDEX | `workflow_audit_trail` | `idx_audit_claim_timestamp` | `e0f8013b005f1ea6dd9eefa6e76a6fd8c02894f289feb02b24e33ec8db0eed79` |
| 133 | 132 | indexes | CREATE INDEX | `workflow_configuration` | `tenant_id` | `d7a9515ed0209d0670d3bfdecdeadc184710bc5867839042c74a8c5044dfcb65` |
| 134 | 133 | indexes | CREATE INDEX | `workflow_templates` | `idx_wt_tenant_id` | `8813264b5775ef807d9f64e7754d184f53891c45e01498f12a0de82789abac53` |
| 135 | 134 | indexes | CREATE INDEX | `workflow_templates` | `idx_wt_is_default` | `ebc88150fca05f6c22ab34c503a4e786132315dbe142328c40bb16b6e8500f92` |
