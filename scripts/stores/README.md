# Official store metadata

The checked-in factual snapshot comes from the PDF linked by https://dcd.aikatsu.com/encore/ (https://dcd.aikatsu.com/ redirects there). Source: https://dcd.aikatsu.com/encore/pdf/shoplist.pdf. The PDF says **2026-10-02**; retrieval timestamp and exact PDF SHA-256 are in `apps/web/src/features/stores/data/stores.json`. The snapshot contains all **1,370** rows, all **47** prefectures, and per-prefecture counts (福岡県: 54). All 18 PDF pages were extracted by `pdftotext -layout`; every nonempty nonheader row must parse, prefecture/address/phone must validate, and normalized identities and IDs must be unique. No pagination endpoint exists: this is a single complete PDF. Machine counts are absent in the official source and remain null.

Only factual store names, prefectures, and addresses are distributed. No official artwork, PDF, HTML, or third-party executable code is copied into the application. The official source retains its rights; no open redistribution license was identified. UI links to the original, labels its date, and warns that listings can change. Personal favorites, counts and notes are explicitly local user records, not official facts.

## Manual refresh

Requirements: Node 22+, curl (with system TLS verification), and Poppler `pdftotext`.

```sh
node scripts/stores/stage.mjs /tmp/stores-candidate.json
```

Review the official PDF and candidate, compare total/per-prefecture counts and additions/removals, then replace the checked-in JSON only after review. The tool downloads into a newly created temporary directory; no source PDF or text belongs in Git. Do not run this command in a scheduled job or on every application load. `curl` uses the environment's configured proxy; TLS verification is never disabled.

IDs initially hash NFKC-normalized prefecture/name/address (first 16 SHA-256 hex digits). Updates must preserve historical identity for renamed/moved stores: compare candidate with existing registry first and provide a JSON object mapping the new normalized `prefecture|name|address` key (whitespace removed, lowercased) to its existing store ID:

```sh
node scripts/stores/stage.mjs /tmp/stores-candidate.json /tmp/store-identity-map.json
```

Review ambiguous matches manually; never silently infer a store identity from similar names or regenerate IDs for known renamed/moved stores. Preserve reviewed identity mappings with the update provenance when one is needed. Duplicate normalized keys and conflicting IDs fail staging. Retired stores can disappear from the published listing, but their personal records must remain in persistence/backups so later reappearance or identity mapping can restore them. The current initial snapshot has no collisions and needs no manual mapping.

## Initial verification evidence

The retrieved PDF SHA-256 is `0be1bbfb779caf78c0800ea31d49de2c5ee014802fd4b584efcbd9a0ab0fa100` (18 pages). Spot checks against source text include GiGOドリームタウン白樺 / 北海道帯広市白樺16条西2丁目 ﾄﾞﾘｰﾑﾀｳﾝ白樺内; GiGO秋葉原3号館 / 東京都千代田区外神田1-11-11 外神田１丁目ビルディング; GiGO福岡天神 / 福岡県福岡市中央区天神2-7-6 DADAビル1～3F; ｎａｍｃｏイオン具志川店 / 沖縄県うるま市字前原幸崎原３０３番地 イオン具志川ＳＣ２Ｆ. Official names/address spelling is retained without guessing corrections.

The refresh also compares candidate IDs with the existing snapshot and prints additions/retirements. When any differ, it writes a sibling `.identity-review.json` report to the staging destination; examine those rows for moved/renamed stores before replacement. The report is an update review artifact, not permission to discard retired personal data.

Run `node --test scripts/stores/test/stores.test.mjs` for coverage/provenance, normalized search + combined filters, and correctly encoded map/directions links. Browser interaction and async storage behavior are checked by the application integration suite.
