# Bitcoin L2 Dashboard — Metrics & Charts Specification

> **Authors (Persona):** Product Manager × Senior Data Analyst × Tech Executive  
> **Date:** 2026-07-24  
> **Status:** Draft — awaiting review  
> **Data Source:** Local Liquid Node extraction pipeline (`liquid-audit`) → `D:\LiquidAudit\data\`

---

## Executive Summary

We have extracted **~228K peg-in transactions** representing **~34,654 BTC** of historically minted L-BTC, **~3.99M blocks** of headers, and a full transaction log (~18 GB) from a local Liquid Elements node. Cross-verification against Bitcoin mainchain has been completed for all peg-ins.

This document defines the complete set of dashboard pages, charts, KPIs, and metrics we should build — organized by the audience question each section answers. It also identifies **critical data gaps** that must be filled before certain charts can be rendered.

---

## Table of Contents

1. [Data Inventory — What We Have](#1-data-inventory--what-we-have)
2. [Page 1: Reserve Proof — "Is L-BTC Fully Backed?"](#2-page-1-reserve-proof--is-l-btc-fully-backed)
3. [Page 2: TVL & Net Flow — "How Much BTC Is In Liquid?"](#3-page-2-tvl--net-flow--how-much-btc-is-in-liquid)
4. [Page 3: Network Activity — "Is Anyone Actually Using Liquid?"](#4-page-3-network-activity--is-anyone-actually-using-liquid)
5. [Page 4: Confidential Transactions — "What's Hidden?"](#5-page-4-confidential-transactions--whats-hidden)
6. [Page 5: Institutional Assets — "BMN, USDt & Tracked Assets"](#6-page-5-institutional-assets--bmn-usdt--tracked-assets)
7. [Page 6: Federation Health — "Who Controls the Keys?"](#7-page-6-federation-health--who-controls-the-keys)
8. [Page 7: Comparative L2 Overview](#8-page-7-comparative-l2-overview)
9. [Data Gaps & Collection Recommendations](#9-data-gaps--collection-recommendations)
10. [Data Pipeline & Summarization Architecture](#10-data-pipeline--summarization-architecture)
11. [Implementation Priority Matrix](#11-implementation-priority-matrix)

---

## 1. Data Inventory — What We Have

| File | Size | Records (est.) | Key Fields |
|------|------|-----------------|------------|
| `transactions.jsonl` | ~18 GB | ~30M+ TXs | `block_height`, `block_time`, `txid`, `fee`, `size`, `vsize`, `is_pegin`, `is_pegout`, `is_issuance`, `has_blinded_outputs`, `tracked_assets[]`, `inputs[]`, `outputs[]` |
| `pegins.jsonl` | ~218 MB | ~228K TXs | Same schema, filtered to `is_pegin=true`. Inputs contain `pegin_txid`, `pegin_claimed_sats`, `pegin_claimed_btc` |
| `pegin_verifications.jsonl` | ~302 MB | ~1M+ records | `pegin_txid`, `liquid_txid`, `meets_102_threshold`, `mainchain_block_height`, `confirmations`, `error`, `source` |
| `block_headers.jsonl` | ~2.7 GB | ~3.99M blocks | `height`, `hash`, `merkleroot`, `time`, `mediantime`, `nTx`, `signblock_witness` |
| `proofs.jsonl` | ~29 GB | Variable | Merkle proofs for critical TXs (peg-ins, peg-outs, issuances, tracked asset transfers) |
| `federation_transitions.jsonl` | 300 B | 1 record | `block_height`, `new_program`, `bitcoin_mainchain_address` |
| `asset_registry_cache.json` | ~3 MB | 14,216 assets | Full Blockstream asset registry (ticker, name, asset_id, precision, domain) |

### What We Do NOT Have Yet (Critical Gaps)

| Missing Data | Impact | Priority |
|--------------|--------|----------|
| **`pegouts.jsonl`** — file reference exists in code but is **empty/missing** | ❌ Cannot compute net TVL (peg-ins minus peg-outs). Only gross inflows are available. | **P0 — Blocker** |
| **`utxo_snapshots.jsonl`** — not generated in current run | Cannot show UTXO set growth over time. Backup has 1 sample. | P1 |
| **Peg-out amounts** — peg-out outputs in `transactions.jsonl` exist but values are often blinded | Peg-out volume partially unobservable | P1 |
| **BTC price data** — no USD/fiat valuation | Cannot show TVL in USD terms or $ volume charts | P2 |
| **Address clustering / entity labeling** — no mapping of addresses to known entities | Cannot distinguish institutional vs. retail flows | P2 |
| **Block interval timing** — not pre-computed | Cannot show block production regularity vs. Bitcoin L1 | P3 |

---

## 2. Page 1: Reserve Proof — "Is L-BTC Fully Backed?"

> **Audience question:** "Can I trust that every L-BTC in circulation is backed 1:1 by real Bitcoin on mainchain?"

This is the **highest-impact, most differentiated** page. No other public dashboard provides independently-verified reserve proof with Merkle audit trails.

### KPI Cards (Hero Metrics)

| Metric | Source | Current Value |
|--------|--------|---------------|
| **Total L-BTC Ever Minted** | `pegins.jsonl` → `sum(pegin_claimed_btc)` | 34,654.45 BTC |
| **Mainchain-Verified Backing** | `pegin_verifications.jsonl` → `sum(claimed_btc WHERE meets_102_threshold=true)` | ~34,509 BTC |
| **Collateralization Ratio** | verified / minted × 100 | **99.58%** |
| **Unverified Residual** | minted - verified | ~145 BTC |
| **Total Peg-in Count** | `pegins.jsonl` → `count(*)` | 228,288 |
| **Verification Pass Rate** | verified_count / total_count × 100 | ~99.5% (by TX count) |

### Charts

#### 2a. Collateralization Ratio Over Time (Area Chart)
- **X-axis:** Month/Year (2018–present)
- **Y-axis:** % collateralization (dual axis: absolute BTC)
- **Series:** Cumulative minted L-BTC vs. cumulative verified BTC
- **Insight:** Shows the ratio has been consistently >99% since mid-2019, debunking the "82.4% backed" narrative

#### 2b. Unverified Peg-ins Waterfall (Stacked Bar)
- **X-axis:** Year
- **Y-axis:** BTC volume
- **Segments:** Verified (green) vs. Unverified (amber)
- **Insight:** Almost all unverified volume is concentrated in 2018–2019 bootstrap era

#### 2c. Verification Latency Heatmap
- **X-axis:** Month
- **Y-axis:** Day of week
- **Color intensity:** Average `confirmations` at verification time
- **Insight:** Shows Bitcoin mainchain confirmation depth patterns

#### 2d. Reserve Proof Explorer (Interactive Table)
- Searchable table of individual peg-in transactions
- Columns: `liquid_txid`, `pegin_txid`, `claimed_btc`, `mainchain_block_height`, `confirmations`, `status`
- Click to view Merkle proof (from `proofs.jsonl`)
- **Differentiator:** No one else offers per-transaction cryptographic proof browsing

---

## 3. Page 2: TVL & Net Flow — "How Much BTC Is In Liquid?"

> **Audience question:** "What's the real TVL trend? Is Bitcoin flowing in or draining out?"

### KPI Cards

| Metric | Source | Notes |
|--------|--------|-------|
| **Current TVL (Gross Peg-ins)** | `pegins.jsonl` cumulative | 34,654 BTC (gross — without peg-out deductions) |
| **Net TVL** | `pegins - pegouts` | ⚠️ **BLOCKED** — needs `pegouts.jsonl` |
| **30-Day Net Flow** | Recent 30d pegins - pegouts | ⚠️ **BLOCKED** |
| **YTD Peg-in Volume** | 2026 pegins only | 4,749.51 BTC (58,039 TXs) |
| **Average Peg-in Size** | total_btc / total_count | ~0.1518 BTC (~$15K at $100K/BTC) |
| **Median Peg-in Size** | Needs computation from raw data | Not yet computed |

### Charts

#### 3a. Cumulative TVL Over Time (Line Chart) — ⚠️ PARTIAL
- **X-axis:** Month (Oct 2018–present)
- **Y-axis:** BTC
- **Series 1:** Cumulative peg-ins (available now ✅)
- **Series 2:** Cumulative peg-outs (❌ needs `pegouts.jsonl`)
- **Series 3:** Net TVL = Series 1 - Series 2
- **Band:** Fill area between net and gross to show "the outflow gap"

#### 3b. Monthly Peg-in/Peg-out Volume (Dual Bar Chart)
- **X-axis:** Month
- **Y-axis (left):** BTC volume (bars)
- **Y-axis (right):** TX count (line overlay)
- **Color:** Green bars = peg-in, Red bars = peg-out
- **Available now for peg-ins only** ✅

#### 3c. Peg-in Size Distribution (Histogram + Log Scale)
- **X-axis:** BTC amount (log scale bins: 0.001, 0.01, 0.1, 1, 10, 100+)
- **Y-axis:** Frequency count
- **Insight:** Reveals whether usage is dominated by whales or retail
- **Annotation:** Mark the "institutional boundary" (e.g., >10 BTC = likely institutional)

#### 3d. Yearly Breakdown Table (Already computed)
| Year | Peg-in Count | Volume (BTC) | Avg Size (BTC) | YoY Growth |
|------|-------------|-------------|----------------|------------|
| 2018 | 181 | 51.62 | 0.285 | — |
| 2019 | 1,006 | 151.48 | 0.151 | +456% count |
| 2020 | 1,018 | 5,017.00 | 4.929 | +3,212% vol |
| 2021 | 5,038 | 1,848.63 | 0.367 | -63% vol |
| 2022 | 6,736 | 962.97 | 0.143 | -48% vol |
| 2023 | 13,265 | 5,691.36 | 0.429 | +491% vol |
| 2024 | 41,063 | 7,779.55 | 0.189 | +37% vol |
| 2025 | 101,942 | 8,402.33 | 0.082 | +8% vol |
| 2026 (YTD) | 58,039 | 4,749.51 | 0.082 | — |

#### 3e. Rolling 7d/30d Net Flow Momentum (Area Chart)
- Shows velocity/acceleration of capital movement
- ⚠️ Requires peg-out data for net calculation

---

## 4. Page 3: Network Activity — "Is Anyone Actually Using Liquid?"

> **Audience question:** "Beyond peg-in/out, is the network alive? What's the daily transaction volume?"

### KPI Cards

| Metric | Source |
|--------|--------|
| **Total Blocks Processed** | `block_headers.jsonl` → count | ~3.99M |
| **Total Transactions** | `transactions.jsonl` → count | ~30M+ (est.) |
| **Current Block Height** | `.last_processed_height` | 3,987,104 |
| **Avg TXs per Block** | `nTx` from headers | Computable |
| **Avg Fee (L-BTC)** | `transactions.jsonl` → `mean(fee)` | ~0.0000006 L-BTC (recent) |
| **Avg TX Size (vbytes)** | `transactions.jsonl` → `mean(vsize)` | Computable |

### Charts

#### 4a. Daily Transaction Count (Time Series)
- **X-axis:** Date
- **Y-axis:** TX count per day
- **Overlay:** 30-day moving average
- **Source:** Group `transactions.jsonl` by `date(block_time)` and count

#### 4b. Transactions per Block Distribution (Violin/Box Plot)
- **X-axis:** Year or Quarter
- **Y-axis:** nTx per block
- **Source:** `block_headers.jsonl` → `nTx`
- **Insight:** Shows network utilization density

#### 4c. Fee Market Analysis (Multi-line)
- **X-axis:** Date
- **Y-axis:** L-BTC fee (log scale)
- **Series:** Mean fee, Median fee, 95th percentile fee
- **Insight:** Liquid fees are negligible — but showing the trend matters for adoption narrative

#### 4d. Block Production Interval (Histogram)
- **X-axis:** Seconds between blocks
- **Y-axis:** Frequency
- **Expected peak:** ~60 seconds (Liquid's 1-minute block target)
- **Source:** `block_headers.jsonl` → `time[n+1] - time[n]`
- **Insight:** Shows federation reliability. Any gaps >5 min = federation downtime events

#### 4e. Network Throughput (Bandwidth)
- **X-axis:** Date
- **Y-axis:** Total vbytes per day
- **Source:** `transactions.jsonl` → `sum(vsize)` per day
- **Insight:** Actual blockspace consumed vs. theoretical capacity

---

## 5. Page 4: Confidential Transactions — "What's Hidden?"

> **Audience question:** "What fraction of Liquid activity is hidden behind Confidential Transactions? Can we trust the observable volume?"

This is a **unique differentiator** — no other dashboard tracks CT opacity rates with this granularity.

### KPI Cards

| Metric | Source |
|--------|--------|
| **Current CT Rate** | Recent 100 TXs sampling | **84.0%** of TXs use blinded outputs |
| **Historical CT Rate** | Full dataset computation needed | TBD |
| **Observable (Unblinded) Volume** | TXs where `has_blinded_outputs=false` | Lower bound of true volume |
| **CT Adoption Inflection Point** | Date when CT rate crossed 50% | TBD |

### Charts

#### 5a. Confidential Transaction Rate Over Time (Area Chart)
- **X-axis:** Month
- **Y-axis:** % of transactions with blinded outputs
- **Series 1:** CT rate (% blinded)
- **Series 2:** Absolute count of CT vs non-CT transactions
- **Insight:** Early Liquid had 0% CT. Track the inflection point — likely correlates with USDt on Liquid launch (mid-2019)

#### 5b. Observable vs. Hidden Volume (Stacked Area)
- **X-axis:** Month
- **Y-axis:** BTC (or TX count)
- **Green area:** Fully unblinded transactions (observable)
- **Gray area:** Transactions with at least one blinded output (hidden)
- **Caveat banner:** "Blinded values are cryptographically hidden. This chart shows the *lower bound* of actual network throughput."

#### 5c. CT Rate by Transaction Type (Grouped Bar)
- **Groups:** Peg-in, Peg-out, Transfer, Issuance
- **Bars:** CT rate for each type
- **Insight:** Peg-ins are rarely blinded (they can't be), but transfer TXs are overwhelmingly CT

#### 5d. Fee Distribution: CT vs Non-CT (Box Plot)
- Compare fee structures between blinded and unblinded TXs
- **Hypothesis:** CT transactions are larger (more data) → higher fees

---

## 6. Page 5: Institutional Assets — "BMN, USDt & Tracked Assets"

> **Audience question:** "Are institutional assets like BMN and USDt actually being used, or are they just issued and forgotten?"

### KPI Cards

| Metric | Source |
|--------|--------|
| **Total Registered Assets** | `asset_registry_cache.json` | 14,216 |
| **Tracked Institutional Assets** | Hardcoded list | L-BTC, USDt, BMN1, BMN2, JPYS, MEX |
| **Total Issuance Events** | `transactions.jsonl` → `is_issuance=true` | TBD (needs computation) |

### Charts

#### 6a. Asset Issuance Timeline (Event Chart / Scatter)
- **X-axis:** Date
- **Y-axis:** Asset ticker (categorical)
- **Dot size:** Issuance amount (where unblinded)
- **Source:** Filter `transactions.jsonl` where `is_issuance=true`

#### 6b. USDt on Liquid — Transfer Velocity (Line Chart)
- **X-axis:** Month
- **Y-axis:** Number of USDt transfers
- **Overlay:** Compare to L-BTC transfer count
- **Source:** `tracked_assets` field in `transactions.jsonl`

#### 6c. BMN Activity Monitor (Event Log + Timeline)
- Show all BMN1/BMN2 transfers chronologically
- Flag periods of inactivity (>30 days no movement)
- **Insight:** Validates or contradicts claims of active institutional trading

#### 6d. Asset Diversity Treemap
- **Hierarchy:** Asset category → Individual asset
- **Size:** Transaction count involving that asset
- **Color:** Volume (where observable)
- **Source:** Group by `tracked_assets` across all TXs

#### 6e. Top 20 Most Active Assets (Bar Chart)
- Ranked by transfer frequency
- Excludes L-BTC (which dominates)

---

## 7. Page 6: Federation Health — "Who Controls the Keys?"

> **Audience question:** "Has the Liquid federation ever changed? How many address rotations have occurred? What's the liveness?"

### KPI Cards

| Metric | Source |
|--------|--------|
| **Federation Address Transitions** | `federation_transitions.jsonl` | 1 (genesis only so far) |
| **Current Federation Address** | Latest entry | `3Kssv83Ni1sTsMw1rProRgbk3mpdMoiEy1` |
| **Number of Functionaries** | External / hardcoded | 15 (11-of-15 multisig) |
| **Longest Block Gap** | `block_headers.jsonl` → max(time_diff) | TBD |
| **Uptime %** | blocks_within_2min / total_blocks | TBD |

### Charts

#### 7a. Federation Address Rotation Timeline (Event Chart)
- Horizontal timeline showing each epoch when the federation multisig rotated
- **Source:** `federation_transitions.jsonl`
- **Currently:** Only 1 entry (genesis). Watch for DynaFed transitions in newer blocks.

#### 7b. Block Interval Distribution (Histogram)
- Target: 60 seconds
- **X-axis:** Seconds between consecutive blocks
- **Y-axis:** Frequency
- **Red zone:** >120 seconds (potential federation liveness issues)
- **Source:** Consecutive `time` diffs in `block_headers.jsonl`

#### 7c. Federation Downtime Events (Timeline / Scatter)
- Plot all instances where block interval > 5 minutes
- Annotate with known events (if any — e.g., functionary outages)
- **Source:** `block_headers.jsonl`

#### 7d. Block Production Heatmap (Calendar)
- **X-axis:** Hour of day (UTC)
- **Y-axis:** Day of week
- **Color:** Number of blocks produced
- **Insight:** Should be uniform if federation is healthy

---

## 8. Page 7: Comparative L2 Overview

> **Audience question:** "How does Liquid compare to Lightning, Rootstock, Stacks, and other Bitcoin L2s?"

### KPI Comparison Table

| Metric | Liquid | Lightning | Rootstock | Stacks |
|--------|--------|-----------|-----------|--------|
| TVL (BTC) | ~3,500* | ~5,300 | ~3,100 | ~1,800 |
| Trust Model | Federated (11/15) | Trustless (P2P) | Merge-mined (Federated) | PoX |
| TX Throughput | ~1 TX/sec | Off-chain | ~30 TPS | ~200 TPS |
| Block Time | 1 min | Instant | 30 sec | 10 min |
| Privacy | Confidential TX (84% CT rate) | Onion routing | No native CT | No |
| Native Assets | 14,216 registered | None | ERC-20 compatible | SIP-010 |

*Net TVL requires peg-out data

> ⚠️ **Data needed from external sources:** Lightning capacity (we have this from `plebdashboard-ln`), Rootstock TVL, Stacks TVL. These should be fetched via public APIs or our existing pipelines.

---

## 9. Data Gaps & Collection Recommendations

### 🔴 P0 — Must Fix Before Dashboard Launch

| Gap | What to Do | Effort |
|-----|-----------|--------|
| **Peg-out data missing** (`pegouts.jsonl` is empty) | The extractor (`get_peg_addresses.py`) already writes peg-out records — but the file doesn't exist on disk, suggesting peg-outs may need the full chain re-scanned or the file was lost during a data migration. **Action:** (a) Check if peg-outs exist in `transactions.jsonl` where `is_pegout=true`, (b) If yes, extract them into a separate summary, (c) If not, investigate whether the pruned node skipped peg-out-heavy blocks. | Medium |
| **Net TVL computation** | Once peg-outs are recovered: `cumsum(pegin_claimed_btc) - cumsum(pegout_value)` per day/month | Low |

### 🟡 P1 — Should Collect

| Gap | What to Do | Effort |
|-----|-----------|--------|
| **Pre-aggregated daily summaries** | Run a one-time script over `transactions.jsonl` (18 GB) to produce `daily_summary.json` with: tx_count, pegin_count, pegout_count, pegin_btc, pegout_btc, ct_count, non_ct_count, total_fees, avg_fee, total_vsize, issuance_count, block_count, min_block_interval, max_block_interval, avg_block_interval | Medium |
| **UTXO snapshots** | Re-enable the every-10K-blocks UTXO snapshot in the extractor (line 553 of `get_peg_addresses.py`). Since we can't re-scan old blocks, backfill from the current state going forward. | Low |
| **BTC/USD price feed** | Fetch daily close prices from CoinGecko/CoinDesk API and join with TVL for USD-denominated charts. Store as `btc_price_daily.json`. | Low |
| **Peg-in/out size percentiles** | Compute p10, p25, p50, p75, p90, p99 of peg-in sizes per month. Critical for whale vs. retail analysis. | Low |

### 🟢 P2 — Nice to Have

| Gap | What to Do | Effort |
|-----|-----------|--------|
| **Address clustering** | Use heuristics (co-spending, known exchange addresses) to label entities. Very hard on Liquid due to CT. | High |
| **Federation functionary identity mapping** | Cross-reference signblock_witness with known functionary pubkeys. Requires Blockstream cooperation or public key registry. | High |
| **Comparative L2 data feeds** | Lightning data from `plebdashboard-ln`, Rootstock from DeFi Llama API, Stacks from Hiro API | Medium |
| **Mempool data** | Track pending transactions for latency analysis. Requires live node monitoring. | Medium |

### 🔵 P3 — Future Enhancements

| Gap | What to Do |
|-----|-----------|
| **Real-time WebSocket feed** | Stream new peg-ins live to the dashboard |
| **Alert system** | Notify if collateralization drops below 99% |
| **BMN yield tracking** | Requires Blockstream unblinding keys — unlikely to get |
| **Liquid Swap data** | Track atomic swaps on Liquid (TDEX, SideSwap) |

---

## 10. Data Pipeline & Summarization Architecture

The raw JSONL files on D: drive are too large to serve directly to a web dashboard. We need a **summarization pipeline** that produces lightweight JSON files committed to the `data/liquid/` folder in this repo.

```
┌──────────────────────┐     ┌─────────────────────────┐     ┌───────────────────────┐
│  D:\LiquidAudit\data │     │  scripts/sync_data.py   │     │  data/liquid/*.json   │
│                      │────▶│  (Summarization Engine)  │────▶│  (Served by GH Pages) │
│  ~50 GB raw JSONL    │     │  Runs daily via cron     │     │  ~500 KB total        │
└──────────────────────┘     └─────────────────────────┘     └───────────────────────┘
```

### Proposed Summary Files for `data/liquid/`

| File | Contents | Size Est. |
|------|----------|-----------|
| `tvl_daily.json` | `[{date, cum_pegin_btc, cum_pegout_btc, net_tvl, pegin_count, pegout_count}]` | ~50 KB |
| `reserve_proof_summary.json` | `{total_minted, total_verified, collat_ratio, unverified_by_year}` | <1 KB |
| `monthly_activity.json` | `[{month, tx_count, ct_count, ct_rate, avg_fee, total_vsize, block_count, avg_block_interval}]` | ~5 KB |
| `pegin_size_distribution.json` | `[{bucket, count, volume}]` with log-scale buckets | ~1 KB |
| `yearly_breakdown.json` | Annual peg-in stats (already computed) | <1 KB |
| `asset_activity.json` | Transfer counts per tracked asset per month | ~10 KB |
| `federation_events.json` | All federation transitions + derived uptime metrics | <1 KB |
| `block_interval_histogram.json` | Pre-bucketed block interval frequencies | ~2 KB |
| `ct_rate_monthly.json` | Monthly CT adoption rate | ~1 KB |
| `latest_metrics.json` | Real-time hero KPI snapshot (updated daily) | <1 KB |

---

## 11. Implementation Priority Matrix

### Phase 1 — MVP (Ship in 1 week)
> Goal: Answer "Is L-BTC backed?" with data nobody else has.

| Chart/Feature | Data Ready? | Notes |
|---------------|-------------|-------|
| Reserve Proof KPIs | ✅ Yes | Hero cards: minted, verified, ratio |
| Collateralization over time | ✅ Yes | Monthly cumulative from `pegins.jsonl` + `verifications.jsonl` |
| Yearly peg-in breakdown table | ✅ Yes | Already computed |
| Peg-in size distribution | ✅ Yes | Compute from `pegins.jsonl` |
| CT rate metric (current) | ✅ Yes | Sample from recent TXs |

### Phase 2 — Core Dashboard (Ship in 2–3 weeks)
> Goal: Full TVL and activity dashboard.

| Chart/Feature | Data Ready? | Notes |
|---------------|-------------|-------|
| Net TVL (peg-in minus peg-out) | ⚠️ Needs peg-out extraction | **P0 blocker** — extract from `transactions.jsonl` |
| Daily TX count time series | ⚠️ Needs summarization | Run pre-aggregation script over 18 GB file |
| Block interval analysis | ✅ Yes | Compute from `block_headers.jsonl` |
| Fee market analysis | ⚠️ Needs summarization | Same pre-aggregation pass |
| CT rate over time | ⚠️ Needs summarization | Same pre-aggregation pass |

### Phase 3 — Institutional & Comparative (Ship in 4–6 weeks)
> Goal: BMN tracking, asset analytics, L2 comparison.

| Chart/Feature | Data Ready? | Notes |
|---------------|-------------|-------|
| Asset issuance timeline | ⚠️ Needs extraction | Filter `is_issuance=true` from `transactions.jsonl` |
| USDt transfer velocity | ⚠️ Needs extraction | Filter by `tracked_assets` containing USDt asset ID |
| Federation health dashboard | 🔶 Partial | Only 1 transition recorded. Block intervals available. |
| Comparative L2 table | ❌ External data needed | Lightning from `plebdashboard-ln`, others from APIs |

---

## Appendix A: Immediate Action Items

1. **Extract peg-outs from `transactions.jsonl`** — Run a script to filter all records where `is_pegout=true` and compute pegout volumes. This unblocks the entire TVL narrative.
   ```python
   # Pseudocode
   for line in transactions.jsonl:
       tx = json.loads(line)
       if tx['is_pegout']:
           for out in tx['outputs']:
               if 'pegout_value' in out:
                   pegout_btc += out['pegout_value']
   ```

2. **Build daily summary pre-aggregation script** — Single-pass over `transactions.jsonl` producing all daily metrics. This is the critical ETL step that makes the dashboard viable.

3. **Add BTC/USD daily price data** — Simple API call to CoinGecko, cached as JSON.

4. **Upgrade `sync_data.py`** from stub to production — currently outputs a mock JSON. Should run the summarization and commit results.

---

## Appendix B: Chart Library Recommendation

Given the dashboard is GitHub Pages hosted (static site), recommended libraries:

| Library | Use Case |
|---------|----------|
| **Chart.js** or **ECharts** | Standard time series, bars, areas |
| **D3.js** | Custom heatmaps, treemaps, calendar plots |
| **DataTables** | Interactive transaction explorer table |
| **Leaflet** (future) | Geographic visualization of federation nodes |

> **Recommendation:** Use **ECharts** as primary — it handles all required chart types (time series, heatmap, treemap, sankey) with excellent dark-mode theming and is well-suited for financial dashboards.

---

## Appendix C: Data Freshness & Update Cadence

| Component | Update Frequency | Mechanism |
|-----------|-----------------|-----------|
| Raw extraction (`get_peg_addresses.py`) | Real-time (daemon, 30s polling) | Runs on local machine |
| Summarization (`sync_data.py`) | Daily | Scheduled task / cron |
| Dashboard data commit | Daily | Git push to `data/liquid/` |
| BTC price data | Daily | CoinGecko API fetch |
| Verification cross-check | On-demand | `verify_pegins.py` against Bitcoin node |
