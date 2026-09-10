# Gate B scratch evidence checksum manifest

These artefacts contain scratch-only server metadata and redacted loopback target identity; no application rows, credentials, staging connection details, or production data are included.

The manifest intentionally excludes this README file to avoid a recursive self-checksum.

```text
8622bb1696fd2214d47a62978cac6547f0f0cfbb5cacb8f55a1d7489f682f45b  ./historical-diagnostic-context.txt
249be67414829716d0d29e4d7af2de088b6b32a14e6361cbb26333b7b792e1ac  ./historical-diagnostic-replay.log
331f3f36787a1bf34283ba9c9d0b38598e1d9ddf1ee6e7724cb8b5b5a8aa84e4  ./run-a/core-evidence.json
4a6d04dac3379298cfa2b0d14680b02dbe834d259cc72943c0e966a8bd9bfa0f  ./run-a/metadata.json.gz
f2014b02779ebece884987ef540fd94738488a8621523712f82fe6f58f036e77  ./run-a/overlay-journal.json
c8a643decce72c0e86c12a133dce0ed62b4c5e31e296e3f4ec0ef0f852ca60e5  ./run-a/overlay-manifest.json
422b66e1f4a1a90520c98fda20b49ce8f25eab80133ec1f61821e80df0ef132d  ./run-a/replay.json
761f101fb10774568d90fc7584fe9752673fb3622ed1d001332b6784445d3675  ./run-a/run.json
331f3f36787a1bf34283ba9c9d0b38598e1d9ddf1ee6e7724cb8b5b5a8aa84e4  ./run-b/core-evidence.json
4a6d04dac3379298cfa2b0d14680b02dbe834d259cc72943c0e966a8bd9bfa0f  ./run-b/metadata.json.gz
f2014b02779ebece884987ef540fd94738488a8621523712f82fe6f58f036e77  ./run-b/overlay-journal.json
c8a643decce72c0e86c12a133dce0ed62b4c5e31e296e3f4ec0ef0f852ca60e5  ./run-b/overlay-manifest.json
2f2f8b8a2d8b686396a2744dcd566f2244ced77245dc60e36056c03016f1d4ab  ./run-b/replay.json
686bfb5a5670eb37aa508fa39b2c683cffe6a3c604936eff15ba15f3913a4a84  ./run-b/run.json
```
