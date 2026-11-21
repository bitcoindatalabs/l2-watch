# L2 Watch — Cross-Chain Bitcoin Layer 2 Audit Dashboard

**Live Site:** https://bitcoindatalabs.github.io/l2-watch/  
**Canonical Open Dataset:** [`bitcoindatalabs/l2-data`](https://github.com/bitcoindatalabs/l2-data) (`v0.1.1`, Schema `1.1`, **78/78 invariants passing**)  
**Zenodo Archival DOI:** [10.5281/zenodo.24429493](https://doi.org/10.5281/zenodo.24429493) (Concept DOI: [10.5281/zenodo.24429492](https://doi.org/10.5281/zenodo.24429492))

L2 Watch is part of the **Bitcoin Data Labs** open-source research suite. Every metric is measured directly from public Bitcoin and Liquid chain data (zero operator self-reporting) and carries an explicit verification class (`cross_chain_verified`, `bitcoin_verified`, `l2_chain_verified`, `inferred`).

## Dashboard Pages (`docs/`)

| Page | Coverage |
|---|---|
| `index.html` (**Scorecard**) | Executive 26-metric scorecard, 2018–2026 reserve vs. L-BTC supply overview, and audit pillar links |
| `reserve.html` (**Reserves**) | Block-by-block backing ratio, gap decomposition, emergency 2-of-3 CSV timelock exposure, verified federation scripts, and live 164-UTXO custody explorer |
| `redemption.html` (**Redemption**) | Cross-chain peg-in & peg-out matching, pre- vs. post-Sep 6 delay regimes, 59-day payout halt register, and latest matched transactions |
| `incidents.html` (**Incidents**) | September–November 2026 chain-facts case study (4,006.81 BTC outflows, 3,400 BTC return trace, 602.53 BTC fresh restoration inflows) + complete 20-entry incident register |
| `federation.html` (**Federation**) | 8 DynaFed governance transitions, 14 PAK list versions, 51.9M verified block signatures across 3 signing regimes, and 1-minute slot liveness |
| `usage.html` (**Privacy & Fees**) | Confidential Transaction adoption (94.0%), 84.5% proof byte share (73.2 GB rangeproofs), UTXO set growth, hidden-amount burns, and peg economics |
| `assets.html` (**Assets**) | Complete 356,037-asset issuance ledger, Tether USDt explicit upper bound (97.56M), tracked assets, and duplicate ticker collisions |
| `methods.html` (**Methods**) | Exact cutoff heights, verification taxonomy, live 78/78 automated invariant table, Parquet SHA-256 manifest, and BibTeX citation |
| `compare.html` (**Compare**) | Empirical comparison of Liquid (`l2-data v0.1.1`) vs. Lightning (`lightning-data`), plus planned Ark & Spark research slots |

## Regenerating Web Data

```bash
python3 scripts/build_web_data.py
```

Reads strictly from `~/dev/github/l2-data`, `/data/l2/liquid/data/audit/` (checking manifest SHA-256 hashes), and `~/dev/github/lightning-data/data/`, writing compact auditable JSON bundles into `docs/data/`.
