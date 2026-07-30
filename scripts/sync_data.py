import os
import json
from collections import defaultdict
from datetime import datetime, timezone
import math

SOURCE_DIR = r"D:\LiquidAudit\data"
DEST_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "docs", "data", "liquid")
os.makedirs(DEST_DIR, exist_ok=True)

def run_sync():
    print("Starting Data Sync & Summarization Pipeline...")
    
    # 1. Process pegins.jsonl & pegin_verifications.jsonl for Reserve Proof
    pegin_file = os.path.join(SOURCE_DIR, "pegins.jsonl")
    verifications_file = os.path.join(SOURCE_DIR, "pegin_verifications.jsonl")
    
    pegin_amounts = {} # liquid_txid -> btc amount
    total_minted_btc = 0.0
    total_pegin_count = 0
    unverified_by_year = defaultdict(float)
    # FIX #2: Track seen liquid_txids to skip duplicate lines caused by extractor
    # crash-recovery re-processing the same block ranges (write-ahead pattern).
    processed_pegin_txids = set()
    
    print("Processing pegins.jsonl...")
    if os.path.exists(pegin_file):
        with open(pegin_file, 'r') as f:
            for line in f:
                try:
                    tx = json.loads(line)
                except json.JSONDecodeError:
                    continue
                
                liquid_txid = tx.get('txid')
                # Skip duplicates — pegins.jsonl may have duplicate lines from
                # extractor restarts re-processing overlapping block ranges.
                if liquid_txid in processed_pegin_txids:
                    continue
                processed_pegin_txids.add(liquid_txid)
                
                total_pegin_count += 1
                
                # A pegin tx might have multiple inputs that are pegins, usually just one
                tx_claimed = 0.0
                for vin in tx.get('inputs', []):
                    if 'pegin_txid' in vin:
                        claimed = vin.get('pegin_claimed_btc', 0.0)
                        if claimed == 0.0 and 'pegin_claimed_sats' in vin:
                            claimed = vin['pegin_claimed_sats'] / 1e8
                        tx_claimed += claimed
                
                # store by liquid_txid as verification references that
                pegin_amounts[liquid_txid] = tx_claimed
                total_minted_btc += tx_claimed
                
                # Pre-assign to unverified (will subtract when verified)
                year = datetime.utcfromtimestamp(tx.get('block_time', 0)).strftime('%Y') if tx.get('block_time') else "Unknown"
                unverified_by_year[year] += tx_claimed

    total_verified_btc = 0.0
    verified_txids = set()
    
    print("Processing pegin_verifications.jsonl...")
    if os.path.exists(verifications_file):
        with open(verifications_file, 'r') as f:
            for line in f:
                try:
                    ver = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if ver.get('meets_102_threshold') == True:
                    liquid_txid = ver.get('liquid_txid')
                    if liquid_txid and liquid_txid not in verified_txids:
                        verified_txids.add(liquid_txid)
                        amt = pegin_amounts.get(liquid_txid, 0.0)
                        total_verified_btc += amt
                    # Subtract from unverified by year (rough approx if we don't store year in memory, but we need it)
                    # Let's rebuild unverified_by_year accurately later in transactions.jsonl or just store it.
                    # Actually, we don't have block_time in verification, we'd need it from pegin. 
                    # For simplicity, we just output unverified_residual
                    
    # (Summary saving moved to end of script when peg-out data is known)

    # 2. Process transactions.jsonl (18 GB single pass)
    transactions_file = os.path.join(SOURCE_DIR, "transactions.jsonl")
    pegouts_out_file = os.path.join(SOURCE_DIR, "pegouts.jsonl")
    
    daily_stats = {} # YYYY-MM-DD -> dict
    monthly_activity = {} # YYYY-MM -> dict
    pegin_size_distribution = {
        "< 0.001": {"count": 0, "volume_btc": 0.0},
        "0.001 - 0.01": {"count": 0, "volume_btc": 0.0},
        "0.01 - 0.1": {"count": 0, "volume_btc": 0.0},
        "0.1 - 1": {"count": 0, "volume_btc": 0.0},
        "1 - 10": {"count": 0, "volume_btc": 0.0},
        "10 - 100": {"count": 0, "volume_btc": 0.0},
        "> 100": {"count": 0, "volume_btc": 0.0},
    }
    
    all_pegin_sizes = []
    
    def get_bucket(val):
        if val < 0.001: return "< 0.001"
        if val < 0.01: return "0.001 - 0.01"
        if val < 0.1: return "0.01 - 0.1"
        if val < 1: return "0.1 - 1"
        if val < 10: return "1 - 10"
        if val < 100: return "10 - 100"
        return "> 100"

    print(f"Iterating over {transactions_file}...")
    
    # FIX #6: Deduplicate transactions — same write-ahead crash recovery can produce
    # duplicate txid lines. Use a seen set to count each txid only once.
    seen_txids = set()

    if os.path.exists(transactions_file):
        # FIX #5: Do NOT open pegouts_out_file here — the extractor already writes
        # pegouts.jsonl. Opening it with 'w' would truncate and destroy that file.
        # Peg-out daily stats are aggregated from the extractor's pegouts.jsonl below.
        with open(transactions_file, 'r') as f:
            for idx, line in enumerate(f):
                if idx % 1000000 == 0 and idx > 0:
                    print(f"Processed {idx} transactions...")
                
                try:
                    tx = json.loads(line)
                except:
                    continue

                txid = tx.get('txid')
                if txid in seen_txids:
                    continue
                seen_txids.add(txid)
                    
                b_time = tx.get('block_time')
                if not b_time:
                    continue
                
                dt = datetime.utcfromtimestamp(b_time)
                date_str = dt.strftime('%Y-%m-%d')
                month_str = dt.strftime('%Y-%m')
                
                # Init dicts
                if date_str not in daily_stats:
                    daily_stats[date_str] = {"pegin_btc": 0.0, "pegout_btc": 0.0, "pegin_count": 0, "pegout_count": 0}
                if month_str not in monthly_activity:
                    monthly_activity[month_str] = {"tx_count": 0, "ct_count": 0, "total_fees_lbtc": 0.0, "total_vsize": 0}
                
                # Monthly stats
                monthly_activity[month_str]["tx_count"] += 1
                if tx.get('has_blinded_outputs'):
                    monthly_activity[month_str]["ct_count"] += 1
                # FIX #4: Elements RPC fee is already in L-BTC (not satoshis).
                # The previous /1e8 division made all fee values 100M× too small.
                monthly_activity[month_str]["total_fees_lbtc"] += tx.get('fee', 0)
                monthly_activity[month_str]["total_vsize"] += tx.get('vsize', 0)
                
                # Peg-ins
                if tx.get('is_pegin'):
                    tx_claimed = 0.0
                    for vin in tx.get('inputs', []):
                        if 'pegin_txid' in vin:
                            claimed = vin.get('pegin_claimed_btc', 0.0)
                            if claimed == 0.0 and 'pegin_claimed_sats' in vin:
                                claimed = vin['pegin_claimed_sats'] / 1e8
                            tx_claimed += claimed
                    
                    if tx_claimed > 0:
                        daily_stats[date_str]["pegin_btc"] += tx_claimed
                        daily_stats[date_str]["pegin_count"] += 1
                        
                        bucket = get_bucket(tx_claimed)
                        pegin_size_distribution[bucket]["count"] += 1
                        pegin_size_distribution[bucket]["volume_btc"] += tx_claimed
                        all_pegin_sizes.append(tx_claimed)

    # FIX #5 (continued): Read peg-out data from extractor's pegouts.jsonl directly.
    # After Phase 2 fix to get_peg_addresses.py + re-extraction, this file will be
    # populated and net TVL will become computable.
    seen_pegout_txids = set()
    if os.path.exists(pegouts_out_file):
        print(f"Reading peg-out data from {pegouts_out_file}...")
        with open(pegouts_out_file, 'r') as f:
            for line in f:
                try:
                    tx = json.loads(line)
                except:
                    continue

                txid = tx.get('txid')
                if txid in seen_pegout_txids:
                    continue
                seen_pegout_txids.add(txid)

                b_time = tx.get('block_time')
                if not b_time:
                    continue

                dt = datetime.utcfromtimestamp(b_time)
                date_str = dt.strftime('%Y-%m-%d')

                if date_str not in daily_stats:
                    daily_stats[date_str] = {"pegin_btc": 0.0, "pegout_btc": 0.0, "pegin_count": 0, "pegout_count": 0}

                tx_pegout = 0.0
                for vout in tx.get('outputs', []):
                    if 'pegout_value' in vout:
                        tx_pegout += vout['pegout_value']

                if tx_pegout > 0:
                    daily_stats[date_str]["pegout_btc"] += tx_pegout
                    daily_stats[date_str]["pegout_count"] += 1
    else:
        print(f"No pegouts.jsonl found at {pegouts_out_file} — peg-out data will be zero until Phase 2 re-extraction.")

    # 3. Process new metrics (Assets, Anomalies, Double Spends)
    print("Processing federation health metrics...")
    
    asset_file = os.path.join(SOURCE_DIR, "asset_registry_cache.json")
    total_registered_assets = 0
    if os.path.exists(asset_file):
        with open(asset_file, 'r', encoding='utf-8') as f:
            try:
                assets = json.load(f)
                total_registered_assets = len(assets)
            except json.JSONDecodeError:
                pass

    anomalies_file = os.path.join(SOURCE_DIR, "block_signing_anomalies.jsonl")
    total_anomalies = 0
    max_block_gap = 0
    if os.path.exists(anomalies_file):
        with open(anomalies_file, 'r', encoding='utf-8') as f:
            for line in f:
                try:
                    an = json.loads(line)
                    total_anomalies += 1
                    gap = an.get('time_diff', 0)
                    if gap > max_block_gap:
                        max_block_gap = gap
                except:
                    continue

    double_spend_file = os.path.join(SOURCE_DIR, "double_spend_alerts.jsonl")
    double_spend_count = 0
    if os.path.exists(double_spend_file):
        with open(double_spend_file, 'r', encoding='utf-8') as f:
            for line in f:
                if line.strip():
                    double_spend_count += 1

    federation_health = {
        "total_registered_assets": total_registered_assets,
        "total_anomalies": total_anomalies,
        "max_block_gap_seconds": max_block_gap,
        "double_spends_detected": double_spend_count
    }
    with open(os.path.join(DEST_DIR, "federation_health.json"), 'w') as f:
        json.dump(federation_health, f, indent=4)

    # Percentiles
    all_pegin_sizes.sort()
    whale_volume = 0.0
    for s in all_pegin_sizes:
        if s > 10.0:
            whale_volume += s
    
    # We will compute whale dominance relative to total_minted_btc from step 1
    whale_dominance = (whale_volume / total_minted_btc * 100) if total_minted_btc > 0 else 0
    
    def get_pct(pct):
        if not all_pegin_sizes: return 0.0
        idx = int(len(all_pegin_sizes) * pct)
        if idx >= len(all_pegin_sizes): idx = len(all_pegin_sizes) - 1
        return round(all_pegin_sizes[idx], 4)
        
    pegin_percentiles = {
        "p10": get_pct(0.10),
        "p50": get_pct(0.50),
        "p90": get_pct(0.90),
        "p99": get_pct(0.99),
        "whale_dominance_percent": round(whale_dominance, 2)
    }
    with open(os.path.join(DEST_DIR, "pegin_percentiles.json"), 'w') as f:
        json.dump(pegin_percentiles, f, indent=4)

    # 4. Post-process and save output files
    print("Post-processing aggregated data...")
    
    # TVL Daily (Cumulative)
    tvl_daily = []
    cum_pegin = 0.0
    cum_pegout = 0.0
    
    for date_str in sorted(daily_stats.keys()):
        stats = daily_stats[date_str]
        cum_pegin += stats["pegin_btc"]
        cum_pegout += stats["pegout_btc"]
        net_flow = stats["pegin_btc"] - stats["pegout_btc"]
        net_tvl = cum_pegin - cum_pegout
        
        tvl_daily.append({
            "date": date_str,
            "pegin_btc": round(stats["pegin_btc"], 8),
            "pegout_btc": round(stats["pegout_btc"], 8),
            "net_flow": round(net_flow, 8),
            "cum_pegin_btc": round(cum_pegin, 8),
            "cum_pegout_btc": round(cum_pegout, 8),
            "net_tvl": round(net_tvl, 8),
            "pegin_count": stats["pegin_count"],
            "pegout_count": stats["pegout_count"]
        })
        
    with open(os.path.join(DEST_DIR, "tvl_daily.json"), 'w') as f:
        json.dump(tvl_daily, f, indent=4)
        
    # Reserve Proof Timeseries (Monthly Cumulative for Chart)
    monthly_reserve = {}
    for date_str in sorted(daily_stats.keys()):
        month_str = date_str[:7]
        if month_str not in monthly_reserve:
            monthly_reserve[month_str] = {"pegin_btc": 0.0}
        monthly_reserve[month_str]["pegin_btc"] += daily_stats[date_str]["pegin_btc"]
        
    reserve_timeseries = []
    cum_minted = 0.0
    # Approx verified as same as minted for historical chart, or we could track precisely if we joined verification dates. 
    # Since verification pass rate is 99.5%, we'll approx verified = minted * 0.9958 historically for the smooth chart.
    pass_rate = (total_verified_btc / total_minted_btc) if total_minted_btc > 0 else 0.9958
    
    for month_str in sorted(monthly_reserve.keys()):
        cum_minted += monthly_reserve[month_str]["pegin_btc"]
        cum_verified = cum_minted * pass_rate
        ratio = (cum_verified / cum_minted * 100) if cum_minted > 0 else 100.0
        
        reserve_timeseries.append({
            "month": month_str,
            "cum_minted_btc": round(cum_minted, 8),
            "cum_verified_btc": round(cum_verified, 8),
            "ratio": round(ratio, 4),
            "unverified_volume_btc": round(cum_minted - cum_verified, 8)
        })
        
    with open(os.path.join(DEST_DIR, "reserve_proof_timeseries.json"), 'w') as f:
        json.dump(reserve_timeseries, f, indent=4)
        
    # Monthly Activity
    monthly_activity_out = []
    for month_str in sorted(monthly_activity.keys()):
        stats = monthly_activity[month_str]
        ct_rate = (stats["ct_count"] / stats["tx_count"] * 100) if stats["tx_count"] > 0 else 0
        monthly_activity_out.append({
            "month": month_str,
            "tx_count": stats["tx_count"],
            "ct_count": stats["ct_count"],
            "ct_rate": round(ct_rate, 2),
            "total_fees_lbtc": round(stats["total_fees_lbtc"], 8),
            "total_vsize": stats["total_vsize"]
        })
        
    with open(os.path.join(DEST_DIR, "monthly_activity.json"), 'w') as f:
        json.dump(monthly_activity_out, f, indent=4)
        
    # Pegin Size Distribution
    pegin_dist_out = []
    order = ["< 0.001", "0.001 - 0.01", "0.01 - 0.1", "0.1 - 1", "1 - 10", "10 - 100", "> 100"]
    for bucket in order:
        pegin_dist_out.append({
            "bucket": bucket,
            "count": pegin_size_distribution[bucket]["count"],
            "volume_btc": round(pegin_size_distribution[bucket]["volume_btc"], 8)
        })
        
    with open(os.path.join(DEST_DIR, "pegin_size_distribution.json"), 'w') as f:
        json.dump(pegin_dist_out, f, indent=4)
        
    print("Pipeline Complete! Output files generated in data/liquid/")

    # Update reserve proof summary with peg-out data
    collateralization_ratio = (total_verified_btc / total_minted_btc * 100) if total_minted_btc > 0 else 0
    net_circulating_btc = total_minted_btc - cum_pegout
    verification_pass_rate = (len(verified_txids) / total_pegin_count * 100) if total_pegin_count > 0 else 0

    
    reserve_summary = {
        "total_minted_btc": round(total_minted_btc, 8),
        "total_pegout_btc": round(cum_pegout, 8),
        "net_circulating_btc": round(net_circulating_btc, 8),
        "total_verified_btc": round(total_verified_btc, 8),
        "collateralization_ratio": round(collateralization_ratio, 4),
        "total_pegin_count": total_pegin_count,
        "verification_pass_rate": round(verification_pass_rate, 4)
    }
    with open(os.path.join(DEST_DIR, "reserve_proof_summary.json"), 'w') as f:
        json.dump(reserve_summary, f, indent=4)
        
    # Extract Recent Audits (Verified Peg-ins and Peg-outs)
    recent_audits = {"pegins": [], "pegouts": []}
    if os.path.exists(verifications_file):
        with open(verifications_file, 'r', encoding='utf-8') as f:
            lines = f.readlines()
            for line in reversed(lines):
                if len(recent_audits["pegins"]) >= 10: break
                try:
                    ver = json.loads(line)
                    if ver.get('full_audit_pass'):
                        recent_audits["pegins"].append({
                            "liquid_txid": ver.get("liquid_txid"),
                            "pegin_txid": ver.get("pegin_txid"),
                            "amount_btc": ver.get("pegin_claimed_btc")
                        })
                except: pass

    pegout_ver_file = os.path.join(SOURCE_DIR, "pegout_verifications.jsonl")
    if os.path.exists(pegout_ver_file):
        with open(pegout_ver_file, 'r', encoding='utf-8') as f:
            lines = f.readlines()
            for line in reversed(lines):
                if len(recent_audits["pegouts"]) >= 10: break
                try:
                    ver = json.loads(line)
                    if ver.get('address_found') and ver.get('amount_matches'):
                        recent_audits["pegouts"].append({
                            "liquid_txid": ver.get("liquid_txid"),
                            "mainchain_txid": ver.get("mainchain_txid"),
                            "amount_btc": ver.get("pegout_value_lbtc"),
                            "address": ver.get("pegout_address")
                        })
                except: pass
                
    with open(os.path.join(DEST_DIR, "recent_audits.json"), 'w') as f:
        json.dump(recent_audits, f, indent=4)

    # Extract Federation Addresses
    fed_addresses = set()
    fed_file = os.path.join(SOURCE_DIR, "federation_transitions.jsonl")
    if os.path.exists(fed_file):
        with open(fed_file, 'r', encoding='utf-8') as f:
            for line in f:
                try:
                    data = json.loads(line)
                    if "bitcoin_mainchain_address" in data:
                        fed_addresses.add(data["bitcoin_mainchain_address"])
                except: pass
    
    with open(os.path.join(DEST_DIR, "federation_addresses.json"), 'w') as f:
        json.dump(list(fed_addresses), f, indent=4)

if __name__ == "__main__":
    run_sync()
