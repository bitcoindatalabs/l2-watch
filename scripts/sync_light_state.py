import os
import json
from datetime import datetime, timezone

SOURCE_DIR = r"D:\LiquidAudit\data"
DEST_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "docs", "data", "liquid")
os.makedirs(DEST_DIR, exist_ok=True)

def run_sync_light():
    print("Starting Lightweight State Sync...")

    from collections import defaultdict
    # 1. Peg-ins
    pegin_file = os.path.join(SOURCE_DIR, "pegins.jsonl")
    pegin_amounts = {}
    total_minted_btc = 0.0
    total_pegin_count = 0
    processed_pegin_txids = set()
    
    monthly_minted = defaultdict(float)
    pegin_months = {}

    if os.path.exists(pegin_file):
        with open(pegin_file, 'r') as f:
            for line in f:
                try: tx = json.loads(line)
                except json.JSONDecodeError: continue
                liquid_txid = tx.get('txid')
                if liquid_txid in processed_pegin_txids: continue
                processed_pegin_txids.add(liquid_txid)
                total_pegin_count += 1
                
                tx_claimed = 0.0
                for vin in tx.get('inputs', []):
                    if 'pegin_txid' in vin:
                        claimed = vin.get('pegin_claimed_btc', 0.0)
                        if claimed == 0.0 and 'pegin_claimed_sats' in vin:
                            claimed = vin['pegin_claimed_sats'] / 1e8
                        tx_claimed += claimed
                pegin_amounts[liquid_txid] = tx_claimed
                total_minted_btc += tx_claimed
                
                b_time = tx.get('block_time')
                if b_time:
                    month_str = datetime.utcfromtimestamp(b_time).strftime('%Y-%m')
                    pegin_months[liquid_txid] = month_str
                    monthly_minted[month_str] += tx_claimed

    # 2. Peg-in Verifications
    total_verified_btc = 0.0
    verified_txids = set()
    monthly_verified = defaultdict(float)
    verifications_file = os.path.join(SOURCE_DIR, "pegin_verifications.jsonl")
    if os.path.exists(verifications_file):
        with open(verifications_file, 'r') as f:
            for line in f:
                try: ver = json.loads(line)
                except json.JSONDecodeError: continue
                if ver.get('meets_102_threshold') == True:
                    liquid_txid = ver.get('liquid_txid')
                    if liquid_txid and liquid_txid not in verified_txids:
                        verified_txids.add(liquid_txid)
                        amt = pegin_amounts.get(liquid_txid, 0.0)
                        total_verified_btc += amt
                        month_str = pegin_months.get(liquid_txid)
                        if month_str:
                            monthly_verified[month_str] += amt
                            
    # Build Timeseries
    timeseries = []
    cum_minted = 0.0
    cum_verified = 0.0
    all_months = sorted(list(set(monthly_minted.keys()) | set(monthly_verified.keys())))
    for m in all_months:
        cum_minted += monthly_minted.get(m, 0.0)
        cum_verified += monthly_verified.get(m, 0.0)
        unverified = max(0, cum_minted - cum_verified)
        ratio = (cum_verified / cum_minted * 100) if cum_minted > 0 else 100
        timeseries.append({
            "month": m,
            "cum_minted_btc": round(cum_minted, 8),
            "cum_verified_btc": round(cum_verified, 8),
            "unverified_volume_btc": round(unverified, 8),
            "ratio": round(ratio, 4)
        })
    with open(os.path.join(DEST_DIR, "reserve_proof_timeseries.json"), 'w') as f:
        json.dump(timeseries, f, indent=4)

    # 3. Peg-outs (Cumulative)
    cum_pegout = 0.0
    seen_pegout_txids = set()
    total_pegout_count = 0
    pegouts_out_file = os.path.join(SOURCE_DIR, "pegouts.jsonl")
    if os.path.exists(pegouts_out_file):
        with open(pegouts_out_file, 'r') as f:
            for line in f:
                try: tx = json.loads(line)
                except: continue
                txid = tx.get('txid')
                if txid in seen_pegout_txids: continue
                seen_pegout_txids.add(txid)
                total_pegout_count += 1
                for vout in tx.get('outputs', []):
                    if 'pegout_value' in vout:
                        cum_pegout += vout['pegout_value']

    # Calculate Peg-out verification pass rate
    verified_pegout_count = 0
    pegout_ver_file = os.path.join(SOURCE_DIR, "pegout_verifications.jsonl")
    if os.path.exists(pegout_ver_file):
        with open(pegout_ver_file, 'r', encoding='utf-8') as f:
            for line in f:
                try:
                    ver = json.loads(line)
                    if ver.get('address_found') and ver.get('amount_matches'):
                        verified_pegout_count += 1
                except: pass

    # Update Reserve Proof Summary
    collateralization_ratio = (total_verified_btc / total_minted_btc * 100) if total_minted_btc > 0 else 0
    net_circulating_btc = total_minted_btc - cum_pegout
    verification_pass_rate = (len(verified_txids) / total_pegin_count * 100) if total_pegin_count > 0 else 0
    pegout_verification_pass_rate = (verified_pegout_count / total_pegout_count * 100) if total_pegout_count > 0 else 0

    reserve_summary = {
        "total_minted_btc": round(total_minted_btc, 8),
        "total_pegout_btc": round(cum_pegout, 8),
        "net_circulating_btc": round(net_circulating_btc, 8),
        "total_verified_btc": round(total_verified_btc, 8),
        "collateralization_ratio": round(collateralization_ratio, 4),
        "total_pegin_count": total_pegin_count,
        "verification_pass_rate": round(verification_pass_rate, 4),
        "pegout_verification_pass_rate": round(pegout_verification_pass_rate, 4)
    }
    with open(os.path.join(DEST_DIR, "reserve_proof_summary.json"), 'w') as f:
        json.dump(reserve_summary, f, indent=4)

    # 4. Federation Health Metrics
    total_registered_assets = 0
    asset_file = os.path.join(SOURCE_DIR, "asset_registry_cache.json")
    if os.path.exists(asset_file):
        with open(asset_file, 'r', encoding='utf-8') as f:
            try:
                assets = json.load(f)
                total_registered_assets = len(assets)
            except: pass

    total_anomalies = 0
    max_block_gap = 0
    anomalies_file = os.path.join(SOURCE_DIR, "block_signing_anomalies.jsonl")
    if os.path.exists(anomalies_file):
        with open(anomalies_file, 'r', encoding='utf-8') as f:
            for line in f:
                try:
                    an = json.loads(line)
                    total_anomalies += 1
                    gap = an.get('time_diff', 0)
                    if gap > max_block_gap:
                        max_block_gap = gap
                except: pass

    double_spend_count = 0
    double_spend_file = os.path.join(SOURCE_DIR, "double_spend_alerts.jsonl")
    if os.path.exists(double_spend_file):
        with open(double_spend_file, 'r', encoding='utf-8') as f:
            for line in f:
                double_spend_count += 1

    health_summary = {
        "total_registered_assets": total_registered_assets,
        "double_spends_detected": double_spend_count,
        "max_block_gap_seconds": max_block_gap,
        "total_anomalies": total_anomalies
    }
    with open(os.path.join(DEST_DIR, "federation_health.json"), 'w') as f:
        json.dump(health_summary, f, indent=4)

    # 5. Extract Recent Audits (Verified Peg-ins and Peg-outs)
    recent_audits = {"pegins": [], "pegouts": []}
    if os.path.exists(verifications_file):
        with open(verifications_file, 'r', encoding='utf-8') as f:
            lines = f.readlines()
            for line in reversed(lines):
                if len(recent_audits["pegins"]) >= 10: break
                try:
                    ver = json.loads(line)
                    if ver.get('meets_102_threshold'):
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

    # 6. Extract Federation Addresses
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
        
    print("Lightweight sync complete!")

if __name__ == "__main__":
    run_sync_light()
