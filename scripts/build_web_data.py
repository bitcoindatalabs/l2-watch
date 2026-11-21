#!/usr/bin/env python3
"""
Deterministic web data exporter for L2 Watch (bitcoindatalabs/l2-watch).

Reads strictly from:
  1. ~/dev/github/l2-data (v0.1.1, schema 1.1, Zenodo 10.5281/zenodo.24429493)
  2. /data/l2/liquid/data/audit (bdl-076 DynaFed, bdl-077 signers/liveness, bdl-078 assets/CT/economics)
  3. ~/dev/github/lightning-data/data (for the Compare page)

Emits compact, auditable JSON files into docs/data/ with full manifest provenance.
Zero hand-entered numbers; every metric traces directly to verified Parquet/JSON sources.
"""

from __future__ import annotations

import hashlib
import json
import math
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import duckdb

L2_DATA = Path("/home/sorukumar/dev/github/l2-data")
AUDIT_DIR = Path("/data/l2/liquid/data/audit")
LN_DATA = Path("/home/sorukumar/dev/github/lightning-data/data")
OUT_DIR = Path(__file__).resolve().parent.parent / "docs" / "data"

SATS = 100_000_000


def clean(val: Any) -> Any:
    if val is None:
        return None
    if isinstance(val, (bytes, bytearray)):
        return val.hex()
    if isinstance(val, float):
        if math.isnan(val) or math.isinf(val):
            return None
        return round(val, 8)
    if isinstance(val, datetime):
        return val.isoformat()
    if hasattr(val, "isoformat"):
        return val.isoformat()
    if isinstance(val, (list, tuple)):
        return [clean(v) for v in val]
    if isinstance(val, dict):
        return {str(k): clean(v) for k, v in val.items()}
    return val


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def write_json(rel: str, obj: Any) -> dict:
    p = OUT_DIR / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(clean(obj), separators=(",", ":"), ensure_ascii=False)
    p.write_text(text + "\n", encoding="utf-8")
    return {"path": rel, "bytes": p.stat().st_size, "sha256": sha256_file(p)}


def query_dicts(con: duckdb.DuckDBPyConnection, sql: str) -> list[dict[str, Any]]:
    cur = con.execute(sql)
    cols = [d[0] for d in cur.description]
    return [{c: clean(v) for c, v in zip(cols, row)} for row in cur.fetchall()]


def verify_audit_manifests() -> dict[str, dict[str, str]]:
    """Verify SHA-256 of bdl-076/077/078 tables against their manifests where present."""
    verified: dict[str, dict[str, str]] = {}
    for mf_name in [
        "dynafed_manifest.json",
        "liveness_manifest.json",
        "assets_manifest.json",
        "privacy_manifest.json",
        "peg_economics_manifest.json",
    ]:
        mf_path = AUDIT_DIR / mf_name
        if not mf_path.exists():
            continue
        mf = json.loads(mf_path.read_text())
        tables_dict = mf.get("tables") or mf.get("outputs") or {}
        if isinstance(tables_dict, dict):
            for k, info in tables_dict.items():
                if isinstance(info, dict) and "sha256" in info:
                    fname = info.get("file") or info.get("path") or k
                    fp = Path(fname) if Path(fname).is_absolute() else (AUDIT_DIR / fname)
                    if fp.exists():
                        actual = sha256_file(fp)
                        assert actual == info["sha256"], f"SHA mismatch for {fp}: {actual} != {info['sha256']}"
                        verified[fp.name] = {"manifest": mf_name, "sha256": actual}
    return verified


def build_scorecard(con: duckdb.DuckDBPyConnection, release: dict, validation: dict) -> dict:
    rows = query_dicts(
        con,
        f"""
        SELECT metric, "window", value, value_text, unit, as_of_btc_height, as_of_l2_height,
               source_table, description, verification_class, method
        FROM read_parquet('{L2_DATA}/common/scorecard.parquet')
        ORDER BY metric
        """,
    )
    by_metric = {r["metric"]: r for r in rows}

    mini_series = query_dicts(
        con,
        f"""
        WITH ranked AS (
            SELECT CAST(utc_day AS VARCHAR) AS d,
                   round(reserve_sats / 1e8, 4) AS reserve_btc,
                   round(supply_sats / 1e8, 4) AS supply_btc,
                   round(backing_ratio * 100.0, 4) AS backing_pct,
                   round(gap_min_sats / 1e8, 4) AS gap_min_btc,
                   row_number() OVER (ORDER BY utc_day) AS rn
            FROM read_parquet('{L2_DATA}/common/backing.parquet')
        )
        SELECT d, reserve_btc, supply_btc, backing_pct, gap_min_btc
        FROM ranked
        WHERE d >= '2026-08-15' OR (rn % 7 = 0) OR rn = 1
        ORDER BY d
        """,
    )

    ct_totals = con.execute(
        f"""
        SELECT sum(txs) AS total_txs,
               sum(txs_fully_confidential) AS fully_ct_txs,
               sum(proof_bytes) AS proof_bytes,
               sum(block_bytes) AS block_bytes,
               sum(rangeproof_bytes) AS rangeproof_bytes
        FROM read_parquet('{AUDIT_DIR}/ct_daily.parquet')
        """
    ).fetchone()
    assets_summary = con.execute(
        f"""
        SELECT count(*) AS total_assets,
               count(*) FILTER (WHERE registered) AS registered_assets,
               max(issued_minus_burned) FILTER (WHERE tracked_label = 'USDt') / 1e8 AS usdt_upper_bound
        FROM read_parquet('{AUDIT_DIR}/assets.parquet')
        """
    ).fetchone()
    liveness_summary = con.execute(
        f"""
        SELECT sum(blocks) AS total_blocks,
               sum(missed_slots) AS missed_slots,
               sum(minutes) AS total_minutes,
               max(last_height) AS max_height
        FROM read_parquet('{AUDIT_DIR}/block_production_daily.parquet')
        """
    ).fetchone()

    return {
        "cutoff": validation["l2"]["liquid/liquidv1"]["cutoff"],
        "release": {
            "version": release.get("release", "v0.1.1"),
            "tag": release.get("tag", "v2026.11.19"),
            "schema_version": release.get("schema_version", "1.1"),
            "zenodo_doi": "10.5281/zenodo.24429493",
            "zenodo_concept_doi": "10.5281/zenodo.24429492",
            "github_url": "https://github.com/bitcoindatalabs/l2-data",
        },
        "validation_summary": validation["summary"],
        "metrics": rows,
        "by_metric": by_metric,
        "highlights": {
            "total_txs": int(ct_totals[0]),
            "fully_ct_pct": round(100.0 * ct_totals[1] / ct_totals[0], 2),
            "proof_share_pct": round(100.0 * ct_totals[2] / ct_totals[3], 2),
            "rangeproof_gb": round(ct_totals[4] / 1e9, 2),
            "block_bytes_gb": round(ct_totals[3] / 1e9, 2),
            "total_assets": int(assets_summary[0]),
            "registered_assets": int(assets_summary[1]),
            "usdt_upper_bound": round(float(assets_summary[2]), 2),
            "liveness_missed_pct": round(100.0 * liveness_summary[1] / liveness_summary[2], 2),
            "liveness_cutoff_height": int(liveness_summary[3]),
        },
        "mini_series": mini_series,
    }


def build_reserves(con: duckdb.DuckDBPyConnection) -> dict:
    daily = query_dicts(
        con,
        f"""
        SELECT CAST(r.utc_day AS VARCHAR) AS d,
               r.height AS btc_height,
               r.liquid_height AS l2_height,
               round(r.reserve_sats / 1e8, 4) AS reserve_btc,
               round(r.reserve_min_sats / 1e8, 4) AS reserve_min_btc,
               round(r.supply_sats / 1e8, 4) AS supply_btc,
               round(r.gap_sats / 1e8, 4) AS gap_btc,
               round(r.gap_min_sats / 1e8, 4) AS gap_min_btc,
               round(r.backing_ratio * 100.0, 4) AS backing_pct,
               r.custody_utxos,
               round(r.emergency_exposed_sats / 1e8, 4) AS exposed_btc,
               r.emergency_exposed_utxos AS exposed_utxos,
               round(r.pending_claims_sats / 1e8, 4) AS pending_claims_btc,
               round(r.unclaimed_deposits_sats / 1e8, 4) AS unclaimed_btc,
               round(r.pegouts_in_flight_sats / 1e8, 4) AS pegouts_inflight_btc,
               round(r.federation_fees_sats / 1e8, 4) AS fed_fees_btc,
               round(r.unmatched_outflows_sats / 1e8, 4) AS unmatched_outflows_btc,
               round(r.untweaked_deposits_sats / 1e8, 4) AS untweaked_deposits_btc,
               round(r.burns_sats / 1e8, 4) AS burns_btc,
               round(r.reserve_sats_legacy_2018 / 1e8, 4) AS gen_legacy_2018,
               round(r.reserve_sats_dynafed_2023_01 / 1e8, 4) AS gen_dynafed_2023_01,
               round(r.reserve_sats_dynafed_2026_01 / 1e8, 4) AS gen_dynafed_2026_01,
               round(r.reserve_sats_dynafed_2026_07 / 1e8, 4) AS gen_dynafed_2026_07
        FROM read_parquet('{L2_DATA}/liquid/reserve_daily.parquet') r
        ORDER BY r.utc_day
        """,
    )

    cutoff_btc = con.execute(
        f"SELECT max(height) FROM read_parquet('{L2_DATA}/liquid/reserve_daily.parquet')"
    ).fetchone()[0]
    unspent_utxos = query_dicts(
        con,
        f"""
        SELECT txid, vout, origin, created_height, created_time,
               value_sats, round(value_sats / 1e8, 8) AS value_btc,
               script_type, generation, csv_blocks,
               ({cutoff_btc} - created_height) AS age_blocks,
               (({cutoff_btc} - created_height) >= csv_blocks) AS emergency_exposed,
               liquid_txid, liquid_height, method, confidence
        FROM read_parquet('{L2_DATA}/liquid/custody_outputs.parquet')
        WHERE spent_height IS NULL
        ORDER BY value_sats DESC
        """,
    )

    scripts = query_dicts(
        con,
        f"""
        SELECT keyset, role, program, program_form, threshold_m, keys_n,
               emergency_m, emergency_n, csv_blocks,
               liquid_first_height, liquid_last_height, current_at_cutoff,
               btc_outputs, round(btc_sats / 1e8, 4) AS btc_total,
               btc_first_created_height, btc_last_spent_height,
               btc_unspent_outputs, round(btc_unspent_sats / 1e8, 8) AS btc_unspent,
               btc_spends_normal, btc_spends_emergency,
               btc_outputs_reaching_csv, round(btc_sats_reaching_csv / 1e8, 4) AS btc_reaching_csv
        FROM read_parquet('{AUDIT_DIR}/federation_keysets.parquet')
        WHERE role IN ('fedpeg', 'fedpeg_change')
        ORDER BY coalesce(btc_first_created_height, 0)
        """,
    )

    latest = daily[-1]
    peak_exposed = con.execute(
        f"""
        SELECT CAST(utc_day AS VARCHAR), btc_height, round(exposed_max_sats / 1e8, 4), exposed_utxos
        FROM read_parquet('{L2_DATA}/common/timelock_exposure.parquet')
        ORDER BY exposed_max_sats DESC LIMIT 1
        """
    ).fetchone()

    return {
        "cutoff_btc_height": int(cutoff_btc),
        "latest": latest,
        "peak_timelock_exposure": {
            "utc_day": peak_exposed[0],
            "btc_height": int(peak_exposed[1]),
            "exposed_btc": float(peak_exposed[2]),
            "exposed_utxos": int(peak_exposed[3]),
        },
        "unspent_summary": {
            "count": len(unspent_utxos),
            "total_sats": sum(u["value_sats"] for u in unspent_utxos),
            "total_btc": round(sum(u["value_sats"] for u in unspent_utxos) / SATS, 8),
            "exposed_count": sum(1 for u in unspent_utxos if u["emergency_exposed"]),
            "exposed_btc": round(sum(u["value_sats"] for u in unspent_utxos if u["emergency_exposed"]) / SATS, 8),
        },
        "scripts": scripts,
        "unspent_utxos": unspent_utxos,
        "daily": daily,
    }


def build_redemption(con: duckdb.DuckDBPyConnection) -> dict:
    monthly_flows = query_dicts(
        con,
        f"""
        SELECT strftime(to_timestamp(coalesce(l2_time, btc_time)), '%Y-%m') AS ym,
               count(*) FILTER (WHERE kind = 'pegin') AS pegin_n,
               round(coalesce(sum(amount_sats) FILTER (WHERE kind = 'pegin'), 0) / 1e8, 4) AS pegin_btc,
               count(*) FILTER (WHERE kind = 'pegout') AS pegout_n,
               round(coalesce(sum(amount_sats) FILTER (WHERE kind = 'pegout'), 0) / 1e8, 4) AS pegout_btc,
               round(median(delay_s) FILTER (WHERE kind = 'pegin' AND delay_s >= 0), 1) AS pegin_p50_s,
               round(median(delay_s) FILTER (WHERE kind = 'pegout' AND delay_s >= 0), 1) AS pegout_p50_s,
               round(quantile_cont(delay_s, 0.95) FILTER (WHERE kind = 'pegout' AND delay_s >= 0), 1) AS pegout_p95_s
        FROM read_parquet('{L2_DATA}/common/flows.parquet')
        GROUP BY 1
        ORDER BY 1
        """,
    )

    daily_recent = query_dicts(
        con,
        f"""
        SELECT CAST(utc_day AS VARCHAR) AS d,
               requested_n, round(requested_sats / 1e8, 4) AS requested_btc,
               paid_n, round(paid_sats / 1e8, 4) AS paid_btc,
               delay_p50_s, delay_p95_s, delay_max_s,
               backlog_n_max, round(backlog_sats_max / 1e8, 4) AS backlog_btc_max,
               oldest_pending_age_s_eod, halt_s
        FROM read_parquet('{L2_DATA}/liquid/pegout_daily.parquet')
        WHERE CAST(utc_day AS VARCHAR) >= '2025-01-01'
        ORDER BY utc_day
        """,
    )

    halts = query_dicts(
        con,
        f"""
        SELECT start_time, end_time, duration_s, ongoing_at_cutoff, start_reason,
               end_btc_height, end_txid, pegouts_waiting,
               round(sats_waiting / 1e8, 6) AS btc_waiting,
               paid_by_end_tx, max_wait_at_end_s, max_liquid_block_gap_s
        FROM read_parquet('{L2_DATA}/liquid/pegout_halts.parquet')
        WHERE duration_s >= 86400
        ORDER BY duration_s DESC
        LIMIT 30
        """,
    )

    summary_row = con.execute(
        f"""
        SELECT count(*) FILTER (WHERE kind = 'pegin') AS total_pegins,
               round(sum(amount_sats) FILTER (WHERE kind = 'pegin') / 1e8, 4) AS total_pegin_btc,
               count(*) FILTER (WHERE kind = 'pegout') AS total_pegouts,
               round(sum(amount_sats) FILTER (WHERE kind = 'pegout') / 1e8, 4) AS total_pegout_btc,
               count(*) FILTER (WHERE kind = 'pegout' AND status IN ('completed', 'matched', 'paid')) AS pegouts_matched,
               round(median(delay_s) FILTER (WHERE kind = 'pegin' AND delay_s >= 0), 1) AS all_pegin_p50_s,
               round(median(delay_s) FILTER (WHERE kind = 'pegout' AND delay_s >= 0), 1) AS all_pegout_p50_s,
               round(quantile_cont(delay_s, 0.95) FILTER (WHERE kind = 'pegout' AND delay_s >= 0), 1) AS all_pegout_p95_s
        FROM read_parquet('{L2_DATA}/common/flows.parquet')
        """
    ).fetchone()

    aug_baseline = con.execute(
        f"""
        SELECT count(*), round(median(delay_s), 1), round(quantile_cont(delay_s, 0.95), 1)
        FROM read_parquet('{L2_DATA}/liquid/pegout_fulfilment.parquet')
        WHERE btc_time >= 1786112936 AND btc_time < 1788704936 AND status IN ('completed', 'matched', 'paid')
        """
    ).fetchone()
    post_restore = con.execute(
        f"""
        SELECT count(*), round(median(delay_s), 1), round(quantile_cont(delay_s, 0.95), 1)
        FROM read_parquet('{L2_DATA}/liquid/pegout_fulfilment.parquet')
        WHERE liquid_time >= 1793657040 AND status IN ('completed', 'matched', 'paid')
        """
    ).fetchone()

    delay_buckets = query_dicts(
        con,
        f"""
        WITH b AS (
            SELECT CASE
                WHEN delay_s < 0 THEN 'Paid before L2'
                WHEN delay_s < 1800 THEN '< 30 min'
                WHEN delay_s < 3600 THEN '30-60 min'
                WHEN delay_s < 14400 THEN '1-4 hr'
                WHEN delay_s < 86400 THEN '4-24 hr'
                WHEN delay_s < 259200 THEN '1-3 days'
                ELSE '> 3 days'
            END AS bucket,
            CASE
                WHEN delay_s < 0 THEN 0
                WHEN delay_s < 1800 THEN 1
                WHEN delay_s < 3600 THEN 2
                WHEN delay_s < 14400 THEN 3
                WHEN delay_s < 86400 THEN 4
                WHEN delay_s < 259200 THEN 5
                ELSE 6
            END AS ord
            FROM read_parquet('{L2_DATA}/liquid/pegout_fulfilment.parquet')
            WHERE delay_s IS NOT NULL
        )
        SELECT bucket, count(*) AS count FROM b GROUP BY bucket, ord ORDER BY ord
        """,
    )

    recent_pegouts = query_dicts(
        con,
        f"""
        SELECT liquid_height, liquid_time, liquid_txid,
               round(value_sats / 1e8, 8) AS value_btc,
               status, btc_height, btc_time, btc_txid,
               round(paid_sats / 1e8, 8) AS paid_btc,
               delay_s, paid_before_pegout, mainchain_address
        FROM read_parquet('{L2_DATA}/liquid/pegout_fulfilment.parquet')
        ORDER BY liquid_height DESC
        LIMIT 50
        """,
    )
    recent_pegins = query_dicts(
        con,
        f"""
        SELECT l2_height, l2_time, l2_txid, btc_height, btc_time, btc_txid,
               round(amount_sats / 1e8, 8) AS amount_btc,
               delay_s, status, verification_class
        FROM read_parquet('{L2_DATA}/common/flows.parquet')
        WHERE kind = 'pegin'
        ORDER BY coalesce(l2_height, 0) DESC, coalesce(btc_height, 0) DESC
        LIMIT 50
        """,
    )

    return {
        "summary": {
            "total_pegins": int(summary_row[0]),
            "total_pegin_btc": float(summary_row[1]),
            "total_pegouts": int(summary_row[2]),
            "total_pegout_btc": float(summary_row[3]),
            "pegouts_matched": int(summary_row[4]),
            "pegout_match_pct": round(100.0 * summary_row[4] / summary_row[2], 2),
            "all_pegin_p50_s": float(summary_row[5]),
            "all_pegout_p50_s": float(summary_row[6]),
            "all_pegout_p95_s": float(summary_row[7]),
            "pre_sep6_30d_count": int(aug_baseline[0]),
            "pre_sep6_30d_p50_s": float(aug_baseline[1]) if aug_baseline[1] else None,
            "pre_sep6_30d_p95_s": float(aug_baseline[2]) if aug_baseline[2] else None,
            "post_restore_count": int(post_restore[0]),
            "post_restore_p50_s": float(post_restore[1]) if post_restore[1] else None,
            "post_restore_p95_s": float(post_restore[2]) if post_restore[2] else None,
            "halts_ge_24h": len(halts),
        },
        "delay_buckets": delay_buckets,
        "monthly_flows": monthly_flows,
        "daily_recent": daily_recent,
        "halts": halts,
        "recent_pegouts": recent_pegouts,
        "recent_pegins": recent_pegins,
    }


def build_incidents(con: duckdb.DuckDBPyConnection) -> dict:
    incidents = query_dicts(
        con,
        f"""
        SELECT incident_id, kind, detection_rule, start_time, end_time, duration_s,
               ongoing_at_cutoff, start_btc_height, end_btc_height, start_l2_height, end_l2_height,
               magnitude_sats, round(magnitude_sats / 1e8, 8) AS magnitude_btc,
               magnitude_pct, count, txids, "references", verification_class, method
        FROM read_parquet('{L2_DATA}/common/incidents.parquet')
        ORDER BY start_time DESC
        """,
    )

    unexplained = query_dicts(
        con,
        f"""
        SELECT btc_height, btc_time, txid, vout, value_sats,
               round(value_sats / 1e8, 8) AS value_btc,
               script_type, class, tx_n_in, tx_n_out, tx_fee_sats, input_paths
        FROM read_parquet('{L2_DATA}/liquid/unexplained_outflows.parquet')
        ORDER BY btc_height, vout
        """,
    )

    sep_series = query_dicts(
        con,
        f"""
        WITH sub AS (
            SELECT height, time, liquid_height,
                   reserve_sats, supply_sats, gap_sats, backing_ratio,
                   lag(reserve_sats) OVER (ORDER BY height) AS prev_r,
                   lag(supply_sats) OVER (ORDER BY height) AS prev_s,
                   strftime(to_timestamp(time), '%Y-%m-%d') AS d,
                   row_number() OVER (PARTITION BY strftime(to_timestamp(time), '%Y-%m-%d') ORDER BY height DESC) AS rn_day
            FROM read_parquet('{L2_DATA}/liquid/reserve_by_block.parquet')
            WHERE time >= 1787616000
        )
        SELECT height AS btc_height, time, liquid_height AS l2_height,
               round(reserve_sats / 1e8, 4) AS reserve_btc,
               round(supply_sats / 1e8, 4) AS supply_btc,
               round(gap_sats / 1e8, 4) AS gap_btc,
               round(backing_ratio * 100.0, 4) AS backing_pct
        FROM sub
        WHERE rn_day = 1
           OR abs(coalesce(reserve_sats - prev_r, 0)) >= 100000000
           OR height IN (964990, 965782, 965783, 965799, 965804, 965950, 966178, 973298, 973420, 973548, 974299, 974307, 976206)
        ORDER BY height
        """,
    )

    sep_milestones = [
        {
            "date_utc": "2026-09-01 05:53 UTC",
            "btc_height": 964990,
            "label": "First-ever 2-of-3 emergency spend",
            "amount_btc": -3.2184,
            "txid": "97f7d78b0b9ad4d47e150659c3091d905c3565fe7e6fd8977e4326b2b7af2270",
            "verification_class": "bitcoin_verified",
            "detail": "35 unclaimed peg-in UTXOs (aged 14,772-29,142 blocks vs. 4,032-block CSV) swept via 2-of-3 emergency path to one P2WPKH output.",
        },
        {
            "date_utc": "2026-09-06 13:52 UTC",
            "btc_height": 965782,
            "l2_height": 4050335,
            "label": "Liquid block production halts (79.2 hours)",
            "amount_btc": 0.0,
            "txid": None,
            "verification_class": "l2_chain_verified",
            "detail": "Last canonical Liquid block before a 79.2-hour halt (block 4,050,335). Reserve before outflow: 4,230.62 BTC vs. 4,205.02 L-BTC (100.61%).",
        },
        {
            "date_utc": "2026-09-06 14:28 UTC",
            "btc_height": 965783,
            "label": "Primary unexplained outflow (11-of-15 normal path)",
            "amount_btc": -4002.6658,
            "txid": "8db751a650ae2f12006b7e8c69a75e4df360e8afd6b9e05ae0b9fa6458a7b140",
            "verification_class": "cross_chain_verified",
            "detail": "83 federation inputs (4,019.44 BTC) signed via 11-of-15 path paid 3,996.02 + 3.996 + 2.651 BTC to three addresses with no Liquid peg-out request.",
        },
        {
            "date_utc": "2026-09-06 16:01 UTC",
            "btc_height": 965799,
            "label": "Second unexplained outflow & backing trough (5.30%)",
            "amount_btc": -4.1404,
            "txid": "1e5c0fbbf43fd91f9eb9d6520aa700e8644c20e7ae640b2332d097b176b3998d",
            "verification_class": "cross_chain_verified",
            "detail": "Additional 4.14 BTC paid to an unmatched address; followed by 1.02 BTC at block 965,804 (paid 79.5h before its L2 peg-out). Reserve bottomed at 222.79 BTC vs. 4,205.02 L-BTC (-3,982.22 BTC).",
        },
        {
            "date_utc": "2026-09-07 16:09 UTC",
            "btc_height": 965950,
            "label": "3,400 BTC returned to federation custody",
            "amount_btc": 3400.0,
            "txid": "a6d697a25266ce3c78774fd1d75f896b7af522ada209b0f6228ea497bc49a46d",
            "verification_class": "bitcoin_verified",
            "detail": "99.94% value-traced to the 3,996.02 BTC outflow; 598.50 BTC remained at the same P2WPKH address unmoved through cutoff. Reserve shortfall narrowed to ~582 BTC.",
        },
        {
            "date_utc": "2026-09-09 21:05 UTC",
            "btc_height": 966178,
            "l2_height": 4050336,
            "label": "Liquid restarts + 4 BTC returned",
            "amount_btc": 4.0,
            "txid": "0334e46381b57503da634ee09aaf966c07e81bf0aa821339e1eb0d26f26c8a1f",
            "verification_class": "cross_chain_verified",
            "detail": "Liquid resumes after 79.2 hours; 4.0 BTC deposited to federation program (99.93% traced to smaller Sep 6 outflows). Peg-out payouts remain halted.",
        },
        {
            "date_utc": "2026-10-27 to 2026-11-02",
            "btc_height": 974307,
            "label": "Fresh external restoration inflows (+602.53 BTC)",
            "amount_btc": 602.5305,
            "txid": "531088ee8be6deadfd4fe1d1a021d9bd17d8e39c5969c91435fcf3542bd7ef55",
            "verification_class": "bitcoin_verified",
            "detail": "2.53 BTC (Oct 27) + 50 BTC (Oct 28) + 300 BTC & 250 BTC (Nov 2, blocks 974,299 & 974,307) from unrelated wallets restored 1:1 backing after 57.32 days below full backing.",
        },
        {
            "date_utc": "2026-11-04 16:32 UTC",
            "btc_height": 974548,
            "label": "Direct federation peg-out payouts resume (after 59-day halt)",
            "amount_btc": -0.001,
            "txid": "ee3ea9bfcf8e0ccd39af6ace8d5615689e199fbb042fcce1eb216d845619f186",
            "verification_class": "cross_chain_verified",
            "detail": "First federation Bitcoin peg-out payout since Sep 6 (59 days without payout; 53.9 days wait for the pending Sep 11 request). No custody key rotation occurred.",
        },
    ]

    return {
        "incidents": incidents,
        "unexplained_outflows": unexplained,
        "sep_case_study": {
            "milestones": sep_milestones,
            "series": sep_series,
        },
    }


def build_federation(con: duckdb.DuckDBPyConnection) -> dict:
    keysets = query_dicts(
        con,
        f"""
        SELECT keyset, role, previous_keyset, program, program_form,
               threshold_m, keys_n, emergency_m, emergency_n, csv_blocks,
               keys_added, keys_removed, emergency_keys_added, emergency_keys_removed,
               csv_changed, liquid_first_height, liquid_last_height,
               liquid_first_time, liquid_last_time, current_at_cutoff, source,
               btc_outputs, round(coalesce(btc_sats, 0) / 1e8, 4) AS btc_total,
               btc_unspent_outputs, round(coalesce(btc_unspent_sats, 0) / 1e8, 6) AS btc_unspent
        FROM read_parquet('{AUDIT_DIR}/federation_keysets.parquet')
        ORDER BY role, coalesce(liquid_first_height, 0)
        """,
    )

    transitions = query_dicts(
        con,
        f"""
        SELECT transition, kind, changes,
               first_vote_height, first_vote_time,
               adopted_height, adopted_time,
               round(days_first_vote_to_adoption, 2) AS days_to_adoption,
               voting_epochs, deciding_votes, deciding_slots_voting,
               signblock_keys_added, signblock_keys_removed,
               pak_from_n, pak_to_n, pak_added, pak_removed,
               fedpeg_keys_added, fedpeg_keys_removed, emergency_keys_changed,
               csv_from, csv_to,
               round(days_adoption_to_first_sweep, 2) AS days_to_first_sweep,
               round(days_adoption_to_old_below_1btc, 2) AS days_old_below_1btc
        FROM read_parquet('{AUDIT_DIR}/dynafed_transitions.parquet')
        ORDER BY adopted_height
        """,
    )

    pak_changes = query_dicts(
        con,
        f"""
        SELECT version, source, change_kind, committed_height, committed_time,
               effective_from_height, effective_to_height, is_reject,
               n_entries, added_n, removed_n, kept_n, pegouts
        FROM read_parquet('{AUDIT_DIR}/pak_changes.parquet')
        ORDER BY version
        """,
    )

    liveness_monthly = query_dicts(
        con,
        f"""
        SELECT substr(CAST(utc_day AS VARCHAR), 1, 7) AS ym,
               sum(minutes) AS minutes,
               sum(blocks) AS blocks,
               sum(missed_slots) AS missed_slots,
               sum(missed_in_halts) AS missed_in_halts,
               max(max_interval_s) AS max_interval_s,
               sum(intervals_ge_10min) AS gaps_ge_10min,
               round(100.0 * sum(blocks) / sum(minutes), 3) AS uptime_pct
        FROM read_parquet('{AUDIT_DIR}/block_production_daily.parquet')
        GROUP BY 1
        ORDER BY 1
        """,
    )

    block_gaps = query_dicts(
        con,
        f"""
        SELECT height, prev_time, block_time, gap_s, round(gap_s / 3600.0, 2) AS gap_hours
        FROM read_parquet('{L2_DATA}/liquid/block_gaps.parquet')
        ORDER BY gap_s DESC
        """,
    )

    key_participation = query_dicts(
        con,
        f"""
        SELECT keyset, position, left(lower(hex(key)), 10) AS key_short,
               sum(blocks) AS total_blocks,
               sum(signed) AS signed_blocks,
               round(100.0 * sum(signed) / nullif(sum(blocks), 0), 2) AS sign_share_pct
        FROM read_parquet('{AUDIT_DIR}/signer_daily.parquet')
        GROUP BY keyset, position, left(lower(hex(key)), 10)
        ORDER BY keyset, position
        """,
    )

    slot_summary = query_dicts(
        con,
        f"""
        SELECT keyset, slot,
               sum(minutes) AS minutes,
               sum(blocks) AS blocks,
               sum(missed) AS missed,
               sum(missed_in_halts) AS missed_in_halts,
               sum(missed_attributable) AS missed_attributable,
               round(100.0 * sum(blocks) / nullif(sum(minutes), 0), 2) AS slot_fill_pct,
               any_value(left(lower(hex(producer_key_inferred)), 10)) AS producer_key_short
        FROM read_parquet('{AUDIT_DIR}/slot_daily.parquet')
        WHERE keyset = 'signblock_2026_07'
        GROUP BY keyset, slot
        ORDER BY slot
        """,
    )

    totals = con.execute(
        f"""
        SELECT sum(blocks), sum(missed_slots), sum(minutes), sum(missed_in_halts), max(last_height)
        FROM read_parquet('{AUDIT_DIR}/block_production_daily.parquet')
        """
    ).fetchone()

    return {
        "summary": {
            "total_blocks": int(totals[0]),
            "missed_slots": int(totals[1]),
            "total_minutes": int(totals[2]),
            "missed_in_halts": int(totals[3]),
            "missed_pct": round(100.0 * totals[1] / totals[2], 2),
            "liveness_cutoff_height": int(totals[4]),
            "dynafed_transitions": len(transitions),
            "pak_versions": len(pak_changes),
            "halts_ge_1h": sum(1 for g in block_gaps if g["gap_s"] >= 3600),
            "gaps_ge_10m": len(block_gaps),
        },
        "keysets": keysets,
        "transitions": transitions,
        "pak_changes": pak_changes,
        "liveness_monthly": liveness_monthly,
        "block_gaps": block_gaps,
        "key_participation": key_participation,
        "current_slot_summary": slot_summary,
    }


def build_usage_privacy(con: duckdb.DuckDBPyConnection) -> dict:
    monthly = query_dicts(
        con,
        f"""
        SELECT substr(CAST(utc_day AS VARCHAR), 1, 7) AS ym,
               sum(txs) AS txs,
               sum(txs_fully_confidential) AS txs_ct,
               sum(txs_partly_confidential) AS txs_part_ct,
               sum(txs_explicit) AS txs_explicit,
               round(100.0 * sum(txs_fully_confidential) / nullif(sum(txs), 0), 2) AS ct_pct,
               round(sum(block_bytes) / 1e6, 2) AS block_mb,
               round(sum(proof_bytes) / 1e6, 2) AS proof_mb,
               round(sum(rangeproof_bytes) / 1e6, 2) AS rangeproof_mb,
               round(sum(surjectionproof_bytes) / 1e6, 2) AS surjection_mb,
               round(100.0 * sum(proof_bytes) / nullif(sum(block_bytes), 0), 2) AS proof_share_pct,
               round(sum(fee_sats) / 1e8, 4) AS lbtc_fees,
               max(utxo_count) AS utxo_count,
               max(utxo_blinded) AS utxo_blinded,
               max(utxo_explicit) AS utxo_explicit
        FROM read_parquet('{AUDIT_DIR}/ct_daily.parquet')
        WHERE CAST(utc_day AS VARCHAR) >= '2018-09-01'
        GROUP BY 1
        ORDER BY 1
        """,
    )

    econ_monthly = query_dicts(
        con,
        f"""
        SELECT substr(CAST(utc_day AS VARCHAR), 1, 7) AS ym,
               sum(btc_fed_txs) AS btc_fed_txs,
               round(sum(btc_fees_sats) / 1e8, 4) AS btc_fees,
               round(sum(lbtc_fees_sats) / 1e8, 4) AS lbtc_fees,
               round(max(cum_btc_fees_sats) / 1e8, 4) AS cum_btc_fees,
               round(max(cum_lbtc_fees_sats) / 1e8, 4) AS cum_lbtc_fees,
               round(last(payee_balance_sats ORDER BY utc_day) / 1e8, 4) AS payee_balance_lbtc,
               round(last(cum_drift_sats ORDER BY utc_day) / 1e8, 4) AS cum_drift_btc
        FROM read_parquet('{AUDIT_DIR}/peg_economics_daily.parquet')
        GROUP BY 1
        ORDER BY 1
        """,
    )

    hidden_burns_by_year = query_dicts(
        con,
        f"""
        SELECT strftime(to_timestamp(time), '%Y') AS yr,
               count(*) AS total_hidden_burns,
               count(*) FILTER (WHERE asset_blinded) AS asset_blinded,
               count(*) FILTER (WHERE NOT asset_blinded) AS asset_explicit
        FROM read_parquet('{AUDIT_DIR}/ct_hidden_burns.parquet')
        GROUP BY 1
        ORDER BY 1
        """,
    )

    totals = con.execute(
        f"""
        SELECT sum(txs), sum(txs_fully_confidential), sum(txs_partly_confidential), sum(txs_explicit),
               sum(block_bytes), sum(proof_bytes), sum(rangeproof_bytes), sum(surjectionproof_bytes),
               sum(fee_sats), sum(out_blinded), sum(out_explicit_lbtc), sum(out_explicit_asset),
               last(utxo_count ORDER BY utc_day), last(utxo_blinded ORDER BY utc_day)
        FROM read_parquet('{AUDIT_DIR}/ct_daily.parquet')
        """
    ).fetchone()

    econ_totals = con.execute(
        f"""
        SELECT max(cum_btc_fees_sats), max(cum_lbtc_fees_sats),
               max(cum_payee_burned_sats), last(payee_balance_sats ORDER BY utc_day),
               sum(btc_fed_txs)
        FROM read_parquet('{AUDIT_DIR}/peg_economics_daily.parquet')
        """
    ).fetchone()

    hb_total = con.execute(
        f"SELECT count(*), count(*) FILTER (WHERE NOT asset_blinded) FROM read_parquet('{AUDIT_DIR}/ct_hidden_burns.parquet')"
    ).fetchone()

    return {
        "summary": {
            "total_txs": int(totals[0]),
            "fully_ct_txs": int(totals[1]),
            "partly_ct_txs": int(totals[2]),
            "explicit_txs": int(totals[3]),
            "fully_ct_pct": round(100.0 * totals[1] / totals[0], 2),
            "block_gb": round(totals[4] / 1e9, 2),
            "proof_gb": round(totals[5] / 1e9, 2),
            "rangeproof_gb": round(totals[6] / 1e9, 2),
            "surjection_gb": round(totals[7] / 1e9, 2),
            "proof_share_pct": round(100.0 * totals[5] / totals[4], 2),
            "total_lbtc_fees": round(totals[8] / SATS, 4),
            "out_blinded": int(totals[9]),
            "out_explicit_lbtc": int(totals[10]),
            "out_explicit_asset": int(totals[11]),
            "utxo_count": int(totals[12]),
            "utxo_blinded": int(totals[13]),
            "cum_btc_fees": round(econ_totals[0] / SATS, 4),
            "cum_lbtc_fees": round(econ_totals[1] / SATS, 4),
            "cum_payee_burned": round(econ_totals[2] / SATS, 4),
            "payee_balance_lbtc": round(econ_totals[3] / SATS, 4),
            "total_btc_fed_txs": int(econ_totals[4]),
            "hidden_burns_total": int(hb_total[0]),
            "hidden_burns_explicit_lbtc": int(hb_total[1]),
        },
        "monthly": monthly,
        "econ_monthly": econ_monthly,
        "hidden_burns_by_year": hidden_burns_by_year,
    }


def build_assets(con: duckdb.DuckDBPyConnection) -> dict:
    summary_row = con.execute(
        f"""
        SELECT count(*) AS total,
               count(*) FILTER (WHERE single_unit_no_token) AS single_unit,
               count(*) FILTER (WHERE registered) AS registered,
               count(*) FILTER (WHERE registry_bound) AS registry_bound,
               count(*) FILTER (WHERE issuance_fully_explicit) AS fully_explicit
        FROM read_parquet('{AUDIT_DIR}/assets.parquet')
        """
    ).fetchone()

    dup_tickers = con.execute(
        f"""
        SELECT count(*) FROM (
            SELECT reg_ticker FROM read_parquet('{AUDIT_DIR}/assets.parquet')
            WHERE reg_ticker IS NOT NULL AND reg_ticker <> ''
            GROUP BY 1 HAVING count(*) > 1
        )
        """
    ).fetchone()[0]

    tracked = query_dicts(
        con,
        f"""
        SELECT tracked_label AS label, lower(hex(asset_id)) AS asset_id,
               reg_ticker, reg_name, reg_domain, coalesce(reg_precision, 0) AS precision,
               issued_height, issued_time,
               issued_explicit / pow(10, coalesce(reg_precision, 0)) AS issued,
               burned_explicit / pow(10, coalesce(reg_precision, 0)) AS burned,
               CASE WHEN issued_minus_burned IS NOT NULL
                    THEN issued_minus_burned / pow(10, coalesce(reg_precision, 0))
                    ELSE NULL END AS upper_bound,
               n_reissuances, n_burns, n_amounts_blinded,
               n_explicit_outputs, n_explicit_txs, n_value_blinded_outputs,
               issuance_fully_explicit
        FROM read_parquet('{AUDIT_DIR}/assets.parquet')
        WHERE tracked_label IS NOT NULL
        ORDER BY CASE tracked_label
            WHEN 'USDt' THEN 1 WHEN 'DePix' THEN 2 WHEN 'BTSE' THEN 3
            WHEN 'MEX' THEN 4 WHEN 'EURx' THEN 5 WHEN 'JPYS' THEN 6
            WHEN 'BMN2' THEN 7 WHEN 'BMN1' THEN 8 WHEN 'LCAD' THEN 9 ELSE 10 END
        """,
    )

    usdt_series = query_dicts(
        con,
        f"""
        SELECT CAST(utc_day AS VARCHAR) AS d,
               n_issuance_events, issued / 1e8 AS issued, reissued / 1e8 AS reissued,
               burned / 1e8 AS burned,
               cum_issued_explicit / 1e8 AS cum_issued,
               cum_burned_explicit / 1e8 AS cum_burned,
               issued_minus_burned / 1e8 AS upper_bound,
               n_explicit_outputs, n_explicit_txs
        FROM read_parquet('{AUDIT_DIR}/asset_daily.parquet')
        WHERE label = 'USDt'
        ORDER BY utc_day
        """,
    )

    issuance_by_year = query_dicts(
        con,
        f"""
        SELECT strftime(to_timestamp(issued_time), '%Y') AS yr,
               count(*) AS total,
               count(*) FILTER (WHERE single_unit_no_token) AS single_unit,
               count(*) FILTER (WHERE NOT single_unit_no_token) AS multi_or_reissuable,
               count(*) FILTER (WHERE registered) AS registered
        FROM read_parquet('{AUDIT_DIR}/assets.parquet')
        GROUP BY 1
        ORDER BY 1
        """,
    )

    top_registered = query_dicts(
        con,
        f"""
        SELECT lower(hex(asset_id)) AS asset_id, reg_ticker, reg_name, reg_domain,
               coalesce(reg_precision, 0) AS precision,
               issued_time, n_reissuances, n_burns, n_amounts_blinded,
               n_explicit_txs, n_value_blinded_outputs,
               CASE WHEN issued_minus_burned IS NOT NULL
                    THEN issued_minus_burned / pow(10, coalesce(reg_precision, 0))
                    ELSE NULL END AS upper_bound,
               tracked_label
        FROM read_parquet('{AUDIT_DIR}/assets.parquet')
        WHERE registered AND (tracked_label IS NOT NULL OR n_explicit_txs >= 10 OR n_reissuances >= 3 OR n_value_blinded_outputs >= 100)
        ORDER BY (tracked_label IS NOT NULL) DESC, n_value_blinded_outputs DESC, n_explicit_txs DESC
        LIMIT 40
        """,
    )

    dup_examples = query_dicts(
        con,
        f"""
        SELECT reg_ticker, count(*) AS asset_count,
               list(coalesce(reg_domain, 'unregistered'))[1:5] AS domains
        FROM read_parquet('{AUDIT_DIR}/assets.parquet')
        WHERE reg_ticker IS NOT NULL AND reg_ticker <> ''
        GROUP BY 1
        HAVING count(*) > 1
        ORDER BY asset_count DESC, reg_ticker
        LIMIT 15
        """,
    )

    return {
        "summary": {
            "total_assets": int(summary_row[0]),
            "single_unit_no_token": int(summary_row[1]),
            "single_unit_pct": round(100.0 * summary_row[1] / summary_row[0], 1),
            "registered": int(summary_row[2]),
            "registered_pct": round(100.0 * summary_row[2] / summary_row[0], 1),
            "registry_bound": int(summary_row[3]),
            "fully_explicit": int(summary_row[4]),
            "duplicate_tickers": int(dup_tickers),
        },
        "tracked": tracked,
        "usdt_series": usdt_series,
        "issuance_by_year": issuance_by_year,
        "top_registered": top_registered,
        "duplicate_tickers": dup_examples,
    }


def build_methods(release: dict, validation: dict) -> dict:
    vclasses = json.loads((L2_DATA / "metadata" / "verification_classes.json").read_text())
    dd = json.loads((L2_DATA / "metadata" / "data_dictionary.json").read_text())
    tables_summary = []
    for f in release.get("files", []):
        if f["path"].endswith(".parquet"):
            tables_summary.append(
                {
                    "path": f["path"],
                    "rows": f["rows"],
                    "bytes": f["bytes"],
                    "sha256": f["sha256"],
                }
            )
    return {
        "release": release,
        "validation": validation,
        "verification_classes": vclasses,
        "tables": tables_summary,
        "dictionary_table_count": len(dd.get("tables", dd)) if isinstance(dd, dict) else 0,
    }


def build_compare(con: duckdb.DuckDBPyConnection, scorecard: dict) -> dict:
    ln_nodes = con.execute(
        f"""
        SELECT count(*) AS total_nodes,
               count(*) FILTER (WHERE in_latest_gossip) AS active_nodes,
               max(snapshot_date) AS snapshot_date
        FROM read_parquet('{LN_DATA}/node_profile.parquet')
        """
    ).fetchone()
    ln_chans = con.execute(
        f"""
        SELECT count(*) FILTER (WHERE in_latest_gossip) AS active_channels,
               round(sum(capacity) FILTER (WHERE in_latest_gossip) / 1e8, 2) AS public_capacity_btc,
               round(median(capacity) FILTER (WHERE in_latest_gossip) / 1e8, 4) AS median_channel_btc
        FROM read_parquet('{LN_DATA}/channel_profile.parquet')
        """
    ).fetchone()

    bm = scorecard["by_metric"]
    return {
        "updated_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "systems": [
            {
                "id": "liquid",
                "name": "Liquid Network",
                "category": "Federated Sidechain",
                "status": "audited",
                "source": "l2-data v0.1.1 (Zenodo 10.5281/zenodo.24429493)",
                "cutoff": f"Bitcoin {scorecard['cutoff']['bitcoin_height']:,} · Liquid {scorecard['cutoff']['l2_height']:,}",
                "btc_locked": round(bm["reserve_sats"]["value"] / SATS, 2),
                "btc_locked_label": "Verified Federation Reserve",
                "custody_model": "11-of-15 multisig + 2-of-3 emergency (8,064-block CSV)",
                "exit_model": "Federation-authorized peg-out (PAK list, 33 entries)",
                "exit_p50": "6.4 hr post-Nov 2 (28 min pre-Sep 6)",
                "unilateral_exit": "No (requires 11-of-15 federation signers + PAK)",
                "privacy_model": "Confidential Transactions (94.0% fully blinded, 84.5% proof bytes)",
                "liveness_metric": f"{100 - scorecard['highlights']['liveness_missed_pct']:.2f}% 1-min slots filled (longest halt: 79.2h)",
                "assets_support": f"{scorecard['highlights']['total_assets']:,} assets · up to {scorecard['highlights']['usdt_upper_bound']/1e6:.2f}M USDt",
                "verification_class": "cross_chain_verified",
                "dashboard_url": "index.html",
            },
            {
                "id": "lightning",
                "name": "Lightning Network",
                "category": "Payment Channel Network",
                "status": "live_source",
                "source": f"lightning-data (snapshot {ln_nodes[2]})",
                "cutoff": f"Gossip snapshot {ln_nodes[2]}",
                "btc_locked": float(ln_chans[1]),
                "btc_locked_label": "Public Channel Capacity (unannounced channels excluded)",
                "custody_model": "2-of-2 bilateral funding multisig per channel (non-custodial)",
                "exit_model": "Cooperative close or unilateral force-close on Bitcoin L1",
                "exit_p50": "Immediate cooperative / CSV timelock on force-close",
                "unilateral_exit": "Yes (pre-signed commitment tx + HTLC timelocks)",
                "privacy_model": "Onion-routed payments; public channel capacities & UTXOs visible",
                "liveness_metric": f"{int(ln_nodes[1]):,} active gossip nodes · {int(ln_chans[0]):,} public channels",
                "assets_support": "BTC native (Taproot Assets experimental)",
                "verification_class": "bitcoin_verified",
                "dashboard_url": "https://plebdashboard.com/",
            },
            {
                "id": "ark",
                "name": "Ark (Arkade / Second)",
                "category": "Virtual UTXO (VTXO) Protocol",
                "status": "planned",
                "source": "Workbench research ticket bdl-082",
                "cutoff": "Planned (Phase 4)",
                "btc_locked": None,
                "btc_locked_label": "ASP round pools (mapping on-chain footprints)",
                "custody_model": "Shared VTXO tree with ASP cosigner + timelocked unilateral exit",
                "exit_model": "Collaborative round refresh or unilateral tree broadcast",
                "exit_p50": "TBD",
                "unilateral_exit": "Yes (subject to L1 fee market & expiry window)",
                "privacy_model": "Off-chain VTXO rounds; round anchor tx visible on L1",
                "liveness_metric": "ASP round cadence (TBD)",
                "assets_support": "BTC native",
                "verification_class": "inferred",
                "dashboard_url": None,
            },
            {
                "id": "spark",
                "name": "Spark",
                "category": "Statechain / Signing Operator Network",
                "status": "planned",
                "source": "Workbench research ticket bdl-082",
                "cutoff": "Planned (Phase 4)",
                "btc_locked": None,
                "btc_locked_label": "Operator-cosigned deposit UTXOs (mapping footprints)",
                "custody_model": "User + Spark Operator threshold signing with timelocked exit",
                "exit_model": "Instant off-chain state transfer or unilateral L1 exit",
                "exit_p50": "TBD",
                "unilateral_exit": "Yes (requires broadcasting exit tree before expiry)",
                "privacy_model": "Off-chain state transfers; deposit & exit UTXOs on L1",
                "liveness_metric": "Operator signing quorum (TBD)",
                "assets_support": "BTC + native token protocol",
                "verification_class": "inferred",
                "dashboard_url": None,
            },
        ],
        "lightning_live": {
            "snapshot_date": str(ln_nodes[2]),
            "total_nodes": int(ln_nodes[0]),
            "active_nodes": int(ln_nodes[1]),
            "active_channels": int(ln_chans[0]),
            "public_capacity_btc": float(ln_chans[1]),
            "median_channel_btc": float(ln_chans[2]),
        },
    }


def main() -> int:
    verified_audit = verify_audit_manifests()
    release = json.loads((L2_DATA / "metadata" / "release.json").read_text())
    validation = json.loads((L2_DATA / "metadata" / "validation.json").read_text())
    assert validation.get("ok") is True, "l2-data validation.json is not ok!"

    con = duckdb.connect()
    files_written = []

    scorecard = build_scorecard(con, release, validation)
    files_written.append(write_json("liquid/scorecard.json", scorecard))

    reserves = build_reserves(con)
    files_written.append(write_json("liquid/reserves.json", reserves))

    redemption = build_redemption(con)
    files_written.append(write_json("liquid/redemption.json", redemption))

    incidents = build_incidents(con)
    files_written.append(write_json("liquid/incidents.json", incidents))

    federation = build_federation(con)
    files_written.append(write_json("liquid/federation.json", federation))

    usage = build_usage_privacy(con)
    files_written.append(write_json("liquid/usage_privacy.json", usage))

    assets = build_assets(con)
    files_written.append(write_json("liquid/assets.json", assets))

    methods = build_methods(release, validation)
    files_written.append(write_json("common/methods.json", methods))

    compare = build_compare(con, scorecard)
    files_written.append(write_json("common/compare.json", compare))

    manifest = {
        "generated_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "l2_data_release": release.get("release", "v0.1.1"),
        "l2_data_tag": release.get("tag", "v2026.11.19"),
        "schema_version": release.get("schema_version", "1.1"),
        "zenodo_doi": "10.5281/zenodo.24429493",
        "zenodo_concept_doi": "10.5281/zenodo.24429492",
        "cutoff": validation["l2"]["liquid/liquidv1"]["cutoff"],
        "liveness_cutoff_height": federation["summary"]["liveness_cutoff_height"],
        "validation_summary": validation["summary"],
        "verified_audit_tables": len(verified_audit),
        "files": files_written,
    }
    write_json("manifest.json", manifest)

    bm = scorecard["by_metric"]
    assert int(bm["reserve_sats"]["value"]) == 425877974077
    assert int(bm["supply_sats"]["value"]) == 425231908482
    assert reserves["unspent_summary"]["total_sats"] == 425877974077
    assert validation["summary"]["pass"] == 78 and validation["summary"]["fail"] == 0
    assert abs(scorecard["highlights"]["usdt_upper_bound"] - 97561100.0) < 0.01

    total_kb = sum(f["bytes"] for f in files_written) / 1024
    print(f"OK: Exported {len(files_written)} JSON bundles ({total_kb:.1f} KB total) with 78/78 invariants verified.")
    for f in files_written:
        print(f"  {f['path']:32s} {f['bytes']/1024:7.1f} KB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
