import os
import json
from datetime import datetime
from collections import defaultdict

SOURCE_DIR = r"D:\LiquidAudit\data"
DEST_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "docs", "data", "liquid")
os.makedirs(DEST_DIR, exist_ok=True)

def run_sync_heavy():
    print("Starting Heavy Network Sync...")

    monthly_activity = {}
    daily_stats = {}
    pegin_size_distribution = {
        "< 0.001": {"count": 0, "volume_btc": 0.0},
        "0.001 - 0.01": {"count": 0, "volume_btc": 0.0},
        "0.01 - 0.1": {"count": 0, "volume_btc": 0.0},
        "0.1 - 1": {"count": 0, "volume_btc": 0.0},
        "1 - 10": {"count": 0, "volume_btc": 0.0},
        "10 - 100": {"count": 0, "volume_btc": 0.0},
        "> 100": {"count": 0, "volume_btc": 0.0}
    }
    def get_bucket(val):
        if val < 0.001: return "< 0.001"
        if val < 0.01: return "0.001 - 0.01"
        if val < 0.1: return "0.01 - 0.1"
        if val < 1: return "0.1 - 1"
        if val < 10: return "1 - 10"
        if val < 100: return "10 - 100"
        return "> 100"

    whale_txs = []
    utxo_bloat = {"inputs": 0, "outputs": 0}
    seen_txids = set()

    # Pass 1: Transactions
    tx_file = os.path.join(SOURCE_DIR, "transactions.jsonl")
    if os.path.exists(tx_file):
        with open(tx_file, 'r') as f:
            for idx, line in enumerate(f):
                if idx % 1000000 == 0 and idx > 0:
                    print(f"Processed {idx} transactions...")
                try: tx = json.loads(line)
                except: continue

                txid = tx.get('txid')
                if txid in seen_txids: continue
                seen_txids.add(txid)

                b_time = tx.get('block_time')
                if not b_time: continue
                dt = datetime.utcfromtimestamp(b_time)
                month_str = dt.strftime('%Y-%m')
                date_str = dt.strftime('%Y-%m-%d')

                if month_str not in monthly_activity:
                    monthly_activity[month_str] = {
                        "tx_count": 0, "ct_count": 0, "total_fees_lbtc": 0.0, 
                        "total_vsize": 0, "observable_volume_lbtc": 0.0, 
                        "observable_volume_usdt": 0.0, "issuance_count": 0
                    }
                if date_str not in daily_stats:
                    daily_stats[date_str] = {"pegin_btc": 0.0, "pegout_btc": 0.0}

                # Core stats
                monthly_activity[month_str]["tx_count"] += 1
                if tx.get('has_blinded_outputs'):
                    monthly_activity[month_str]["ct_count"] += 1
                monthly_activity[month_str]["total_fees_lbtc"] += tx.get('fee', 0)
                monthly_activity[month_str]["total_vsize"] += tx.get('vsize', 0)
                if tx.get('is_issuance'):
                    monthly_activity[month_str]["issuance_count"] += 1

                # UTXO bloat
                inputs_count = len(tx.get('inputs', []))
                outputs_count = len(tx.get('outputs', []))
                utxo_bloat["inputs"] += inputs_count
                utxo_bloat["outputs"] += outputs_count

                # Observable Volume and Whales
                tx_lbtc_val = 0.0
                tx_usdt_val = 0.0
                for vout in tx.get('outputs', []):
                    if 'asset' in vout and 'value' in vout:
                        asset_id = vout['asset']
                        val = vout['value']
                        if val > 0:
                            if asset_id == '6f0279e9ed041c3d710a9f57d0c02928416460c4b722ae3457a11eec381c526d':
                                monthly_activity[month_str]["observable_volume_lbtc"] += val
                                tx_lbtc_val += val
                            elif asset_id == 'ce091c998b83c78bb71a632313ba3760f1763d9cfcffae02258ffa9865a37bd2':
                                monthly_activity[month_str]["observable_volume_usdt"] += val
                                tx_usdt_val += val

                # Whales tracking (arbitrary thresholds: 10 L-BTC or 100k USDT)
                if tx_lbtc_val >= 10.0 or tx_usdt_val >= 100000.0:
                    whale_txs.append({
                        "txid": txid,
                        "date": date_str,
                        "lbtc": tx_lbtc_val,
                        "usdt": tx_usdt_val
                    })

                # Peg-ins for Capital Flow & Size Distribution
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
                        bucket = get_bucket(tx_claimed)
                        pegin_size_distribution[bucket]["count"] += 1
                        pegin_size_distribution[bucket]["volume_btc"] += tx_claimed

    # Read Pegouts for Capital Flow
    pegouts_file = os.path.join(SOURCE_DIR, "pegouts.jsonl")
    seen_pegout_txids = set()
    if os.path.exists(pegouts_file):
        with open(pegouts_file, 'r') as f:
            for line in f:
                try: tx = json.loads(line)
                except: continue
                txid = tx.get('txid')
                if txid in seen_pegout_txids: continue
                seen_pegout_txids.add(txid)
                b_time = tx.get('block_time')
                if not b_time: continue
                date_str = datetime.utcfromtimestamp(b_time).strftime('%Y-%m-%d')
                
                if date_str not in daily_stats:
                    daily_stats[date_str] = {"pegin_btc": 0.0, "pegout_btc": 0.0}

                for vout in tx.get('outputs', []):
                    if 'pegout_value' in vout:
                        daily_stats[date_str]["pegout_btc"] += vout['pegout_value']

    # 3. Federation Signer Participation & Block Times
    headers_file = os.path.join(SOURCE_DIR, "block_headers.jsonl")
    block_times = []
    if os.path.exists(headers_file):
        with open(headers_file, 'r') as f:
            for line in f:
                try: h = json.loads(line)
                except: continue
                if 'time' in h:
                    block_times.append(h['time'])
    
    # Calculate average block time
    block_times.sort()
    avg_block_time_seconds = 0
    if len(block_times) > 1:
        diffs = [block_times[i] - block_times[i-1] for i in range(1, len(block_times))]
        avg_block_time_seconds = sum(diffs) / len(diffs)

    # 4. Federation Participation
    federation_participation = defaultdict(int)
    coinbase_file = os.path.join(SOURCE_DIR, "coinbase_txs.jsonl")
    if os.path.exists(coinbase_file):
        with open(coinbase_file, 'r') as f:
            for line in f:
                try: tx = json.loads(line)
                except: continue
                for vout in tx.get('outputs', []):
                    addr = vout.get('address')
                    if addr:
                        federation_participation[addr] += 1

    # Save output
    monthly_activity_out = []
    for m in sorted(monthly_activity.keys()):
        stats = monthly_activity[m]
        ct_rate = (stats["ct_count"] / stats["tx_count"] * 100) if stats["tx_count"] > 0 else 0
        sats_per_vb = (stats["total_fees_lbtc"] * 1e8) / stats["total_vsize"] if stats["total_vsize"] > 0 else 0
        monthly_activity_out.append({
            "month": m,
            "tx_count": stats["tx_count"],
            "ct_count": stats["ct_count"],
            "ct_rate": round(ct_rate, 2),
            "total_fees_lbtc": round(stats["total_fees_lbtc"], 8),
            "total_vsize": stats["total_vsize"],
            "avg_sats_per_vbyte": round(sats_per_vb, 2),
            "observable_volume_lbtc": round(stats.get("observable_volume_lbtc", 0.0), 8),
            "observable_volume_usdt": round(stats.get("observable_volume_usdt", 0.0), 8),
            "issuance_count": stats["issuance_count"]
        })
    with open(os.path.join(DEST_DIR, "monthly_activity.json"), 'w') as f:
        json.dump(monthly_activity_out, f, indent=4)
        
    whale_txs.sort(key=lambda x: x['lbtc'], reverse=True)
    with open(os.path.join(DEST_DIR, "whale_activity.json"), 'w') as f:
        json.dump(whale_txs[:100], f, indent=4)

    capital_flow = []
    for d in sorted(daily_stats.keys()):
        capital_flow.append({
            "date": d,
            "pegin_btc": round(daily_stats[d]["pegin_btc"], 8),
            "pegout_btc": round(daily_stats[d]["pegout_btc"], 8),
            "net_flow_btc": round(daily_stats[d]["pegin_btc"] - daily_stats[d]["pegout_btc"], 8)
        })
    with open(os.path.join(DEST_DIR, "capital_flow.json"), 'w') as f:
        json.dump(capital_flow, f, indent=4)

    with open(os.path.join(DEST_DIR, "utxo_bloat.json"), 'w') as f:
        json.dump(utxo_bloat, f, indent=4)

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
        
    fed_part_out = [{"address": k, "blocks": v} for k, v in sorted(federation_participation.items(), key=lambda item: item[1], reverse=True)]
    with open(os.path.join(DEST_DIR, "federation_participation.json"), 'w') as f:
        json.dump(fed_part_out, f, indent=4)

    print("Heavy sync complete!")

if __name__ == "__main__":
    run_sync_heavy()
