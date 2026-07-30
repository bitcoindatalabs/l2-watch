const DATA_DIR = 'data/liquid';

const formatter = new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 2
});

const btcFormatter = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
});

// Format numbers for display
function formatBTC(value) {
    if (!value && value !== 0) return '-';
    return btcFormatter.format(value) + ' BTC';
}

function formatPercent(value) {
    if (!value && value !== 0) return '-';
    return formatter.format(value) + '%';
}

// Remove skeleton loaders
function removeSkeleton(elementId) {
    const el = document.getElementById(elementId);
    if (el) {
        el.classList.remove('skeleton');
        el.innerHTML = '';
    }
}

function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

// Global chart instances for resizing
const charts = {};



// Fetch and load data
async function loadData() {
    try {
        // Load Reserve Summary
        const summaryRes = await fetch(`${DATA_DIR}/reserve_proof_summary.json`);
        if (summaryRes.ok) {
            const summary = await summaryRes.json();
            removeSkeleton('kpi-minted');
            removeSkeleton('kpi-burned');
            removeSkeleton('kpi-net-circulating');
            removeSkeleton('kpi-verified');
            setText('kpi-minted', formatBTC(summary.total_minted_btc));
            setText('kpi-burned', formatBTC(summary.total_pegout_btc || 0));
            setText('kpi-net-circulating', formatBTC(summary.net_circulating_btc || summary.total_minted_btc));
            setText('kpi-verified', formatBTC(summary.total_verified_btc));
        }

        // Load Reserve Timeseries Chart
        const timeseriesRes = await fetch(`${DATA_DIR}/reserve_proof_timeseries.json`);
        if (timeseriesRes.ok) {
            const timeseries = await timeseriesRes.json();
            renderReserveChart(timeseries);
        }
        
        // Load Size Distribution & Percentiles
        const [sizeRes, pctRes] = await Promise.all([
            fetch(`${DATA_DIR}/pegin_size_distribution.json`),
            fetch(`${DATA_DIR}/pegin_percentiles.json`)
        ]);
        if (sizeRes.ok && pctRes.ok) {
            const size = await sizeRes.json();
            const pct = await pctRes.json();
            renderSizeChart(size, pct);
        }

        // Load TVL Chart
        const tvlRes = await fetch(`${DATA_DIR}/tvl_daily.json`);
        if (tvlRes.ok) {
            const tvl = await tvlRes.json();
            renderTVLChart(tvl);
        }

        // Load Monthly Activity
        const activityRes = await fetch(`${DATA_DIR}/monthly_activity.json`);
        if (activityRes.ok) {
            const activity = await activityRes.json();
            renderNetworkCharts(activity);
            renderAssetsCharts(activity);
            
            // Update KPIs
            const latestMonth = activity[activity.length - 1];
            if (latestMonth) {
                removeSkeleton('kpi-avg-fee');
                removeSkeleton('kpi-ct-rate');
                const avgFee = latestMonth.tx_count > 0 ? (latestMonth.total_fees_lbtc / latestMonth.tx_count) : 0;
                setText('kpi-avg-fee', formatBTC(avgFee));
                setText('kpi-ct-rate', formatPercent(latestMonth.ct_rate));
            }
        }

        // Load Federation Health
        const healthRes = await fetch(`${DATA_DIR}/federation_health.json`);
        if (healthRes.ok) {
            const health = await healthRes.json();
            removeSkeleton('kpi-total-assets');
            removeSkeleton('kpi-double-spends');
            removeSkeleton('kpi-max-gap');
            removeSkeleton('kpi-anomalies');
            setText('kpi-total-assets', new Intl.NumberFormat('en-US').format(health.total_registered_assets));
            setText('kpi-double-spends', health.double_spends_detected);
            setText('kpi-max-gap', health.max_block_gap_seconds);
            setText('kpi-anomalies', health.total_anomalies);
        }

        // Load Audit Trail Data
        const fedRes = await fetch(`${DATA_DIR}/federation_addresses.json`);
        if (fedRes.ok) {
            const fed = await fedRes.json();
            const tbody = document.querySelector('#table-fed-addresses tbody');
            if (tbody) tbody.innerHTML = fed.map(addr => `<tr><td>${addr}</td></tr>`).join('');
        }

        const auditRes = await fetch(`${DATA_DIR}/recent_audits.json`);
        if (auditRes.ok) {
            const audit = await auditRes.json();
            const peginTbody = document.querySelector('#table-recent-pegins tbody');
            if (peginTbody) {
                peginTbody.innerHTML = audit.pegins.map(p => `<tr>
                    <td style="color: #10b981;">+${p.amount_btc}</td>
                    <td>${p.pegin_txid}</td>
                    <td>${p.liquid_txid}</td>
                </tr>`).join('');
            }

            const pegoutTbody = document.querySelector('#table-recent-pegouts tbody');
            if (pegoutTbody) {
                pegoutTbody.innerHTML = audit.pegouts.map(p => `<tr>
                    <td style="color: #f59e0b;">-${p.amount_btc}</td>
                    <td>${p.address}</td>
                    <td>${p.liquid_txid}</td>
                    <td>${p.mainchain_txid}</td>
                </tr>`).join('');
            }
        }

    } catch (error) {
        console.error("Error loading dashboard data:", error);
    }
}

// Common Chart Theme Options
const darkTheme = {
    color: ['#10b981', '#f7931a', '#f59e0b', '#3b82f6', '#8b5cf6'],
    textStyle: { fontFamily: 'Inter, sans-serif' },
    tooltip: {
        backgroundColor: 'rgba(20, 25, 40, 0.9)',
        borderColor: 'rgba(255,255,255,0.1)',
        textStyle: { color: '#f8fafc' },
        padding: 12,
        backdropFilter: 'blur(8px)'
    },
    legend: { textStyle: { color: '#94a3b8' } },
    xAxis: {
        axisLine: { lineStyle: { color: 'rgba(255,255,255,0.1)' } },
        axisLabel: { color: '#94a3b8' },
        splitLine: { show: false }
    },
    yAxis: {
        axisLine: { show: false },
        axisLabel: { color: '#94a3b8' },
        splitLine: { lineStyle: { color: 'rgba(255,255,255,0.05)' } }
    }
};

function renderReserveChart(data) {
    removeSkeleton('chart-reserve-history');
    const el = document.getElementById('chart-reserve-history');
    if (!el) return;
    const chart = echarts.init(el);
    charts['reserve'] = chart;
    
    const months = data.map(d => d.month);
    const verified = data.map(d => d.cum_verified_btc);
    const unverified = data.map(d => d.unverified_volume_btc);
    const ratio = data.map(d => d.ratio);

    const option = {
        ...darkTheme,
        tooltip: {
            trigger: 'axis',
            axisPointer: { type: 'cross' }
        },
        legend: { data: ['Verified BTC', 'Unverified', 'Ratio %'] },
        grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
        xAxis: [
            {
                type: 'category',
                boundaryGap: false,
                data: months,
                ...darkTheme.xAxis
            }
        ],
        yAxis: [
            {
                type: 'value',
                name: 'BTC',
                ...darkTheme.yAxis
            },
            {
                type: 'value',
                name: 'Ratio (%)',
                min: 90,
                max: 100,
                ...darkTheme.yAxis
            }
        ],
        series: [
            {
                name: 'Verified BTC',
                type: 'line',
                stack: 'Total',
                areaStyle: {
                    color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                        { offset: 0, color: 'rgba(16, 185, 129, 0.5)' },
                        { offset: 1, color: 'rgba(16, 185, 129, 0.05)' }
                    ])
                },
                lineStyle: { color: '#10b981', width: 2 },
                itemStyle: { color: '#10b981' },
                showSymbol: false,
                data: verified
            },
            {
                name: 'Unverified',
                type: 'line',
                stack: 'Total',
                areaStyle: {
                    color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                        { offset: 0, color: 'rgba(245, 158, 11, 0.5)' },
                        { offset: 1, color: 'rgba(245, 158, 11, 0.05)' }
                    ])
                },
                lineStyle: { color: '#f59e0b', width: 2 },
                itemStyle: { color: '#f59e0b' },
                showSymbol: false,
                data: unverified
            },
            {
                name: 'Ratio %',
                type: 'line',
                yAxisIndex: 1,
                lineStyle: { color: '#3b82f6', type: 'dashed', width: 2 },
                itemStyle: { color: '#3b82f6' },
                showSymbol: false,
                data: ratio
            }
        ]
    };

    chart.setOption(option);
    window.addEventListener('resize', () => chart.resize());
}

function renderSizeChart(data, pct) {
    removeSkeleton('chart-pegin-size');
    const el = document.getElementById('chart-pegin-size');
    if (!el) return;
    const chart = echarts.init(el);
    charts['size'] = chart;
    
    // Create label strings to find approximate X-axis indexes for markLines
    const categories = data.map(d => d.bucket);
    
    const option = {
        ...darkTheme,
        title: {
            text: `Whale Dominance (>10 BTC): ${pct ? pct.whale_dominance_percent + '%' : 'N/A'}`,
            right: 20,
            top: 10,
            textStyle: { color: 'var(--text-secondary)', fontSize: 13, fontWeight: 'normal' }
        },
        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
        grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
        xAxis: { type: 'category', data: categories, ...darkTheme.xAxis, axisLabel: { interval: 0, rotate: 30 } },
        yAxis: { type: 'value', name: 'Volume (L-BTC)', ...darkTheme.yAxis },
        series: [{
            name: 'Volume',
            type: 'bar',
            data: data.map(d => d.volume_btc),
            itemStyle: {
                color: '#f59e0b',
                borderRadius: [4, 4, 0, 0]
            },
            markLine: {
                symbol: ['none', 'none'],
                lineStyle: { type: 'dashed', color: '#10b981', width: 2 },
                label: { formatter: '{b}', position: 'insideEndTop', color: '#10b981' },
                data: [
                    { xAxis: "0.1 - 1", name: `Median: ${pct ? pct.p50 : ''} BTC` },
                    { xAxis: "> 100", name: `99th Pct: ${pct ? pct.p99 : ''} BTC` }
                ]
            }
        }]
    };
    
    chart.setOption(option);
    window.addEventListener('resize', () => chart.resize());
}

function renderTVLChart(data) {
    removeSkeleton('chart-tvl');
    const el = document.getElementById('chart-tvl');
    if (!el) return;
    const chart = echarts.init(el);
    charts['tvl'] = chart;
    
    const option = {
        ...darkTheme,
        tooltip: { trigger: 'axis' },
        legend: { data: ['Daily Net Flow', 'Net TVL'] },
        grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
        xAxis: {
            type: 'category',
            data: data.map(d => d.date),
            ...darkTheme.xAxis
        },
        yAxis: [
            {
                type: 'value',
                name: 'Net Flow (BTC)',
                ...darkTheme.yAxis
            },
            {
                type: 'value',
                name: 'TVL (BTC)',
                ...darkTheme.yAxis
            }
        ],
        series: [
            {
                name: 'Daily Net Flow',
                type: 'bar',
                data: data.map(d => d.net_flow),
                itemStyle: {
                    color: (params) => params.value >= 0 ? '#10b981' : '#ef4444'
                }
            },
            {
                name: 'Net TVL',
                type: 'line',
                yAxisIndex: 1,
                data: data.map(d => d.net_tvl),
                lineStyle: { color: '#f7931a', width: 2 },
                showSymbol: false,
                areaStyle: {
                    color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                        { offset: 0, color: 'rgba(247, 147, 26, 0.3)' },
                        { offset: 1, color: 'rgba(247, 147, 26, 0.0)' }
                    ])
                }
            }
        ]
    };
    
    chart.setOption(option);
    window.addEventListener('resize', () => chart.resize());
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadData();
});

// New Render Functions for Monthly Activity
function renderNetworkCharts(data) {
    removeSkeleton('chart-tx-count');
    removeSkeleton('chart-fees');
    
    const elTx = document.getElementById('chart-tx-count');
    const elFees = document.getElementById('chart-fees');
    if (!elTx || !elFees) return;
    
    const chartTx = echarts.init(elTx);
    const chartFees = echarts.init(elFees);
    charts['txCount'] = chartTx;
    charts['fees'] = chartFees;
    
    const months = data.map(d => d.month);
    
    // TX Count Chart
    chartTx.setOption({
        ...darkTheme,
        tooltip: { trigger: 'axis' },
        grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
        xAxis: { type: 'category', data: months, ...darkTheme.xAxis },
        yAxis: { type: 'value', name: 'Transactions', ...darkTheme.yAxis },
        series: [{
            name: 'TX Count',
            type: 'bar',
            data: data.map(d => d.tx_count),
            itemStyle: {
                color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                    { offset: 0, color: '#3b82f6' },
                    { offset: 1, color: 'rgba(59, 130, 246, 0.2)' }
                ]),
                borderRadius: [4, 4, 0, 0]
            }
        }]
    });
    
    // Fees Chart
    chartFees.setOption({
        ...darkTheme,
        tooltip: { trigger: 'axis' },
        grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
        xAxis: { type: 'category', data: months, ...darkTheme.xAxis },
        yAxis: { type: 'value', name: 'Total Fees (L-BTC)', ...darkTheme.yAxis },
        series: [{
            name: 'Total Fees',
            type: 'line',
            data: data.map(d => d.total_fees_lbtc),
            lineStyle: { color: '#8b5cf6', width: 2 },
            showSymbol: false,
            areaStyle: {
                color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                    { offset: 0, color: 'rgba(139, 92, 246, 0.3)' },
                    { offset: 1, color: 'rgba(139, 92, 246, 0)' }
                ])
            }
        }]
    });
}

function renderAssetsCharts(data) {
    removeSkeleton('chart-ct-rate');
    const el = document.getElementById('chart-ct-rate');
    if (!el) return;
    const chartCt = echarts.init(el);
    charts['ctRate'] = chartCt;
    
    const months = data.map(d => d.month);
    
    chartCt.setOption({
        ...darkTheme,
        tooltip: { trigger: 'axis', axisPointer: { type: 'cross' } },
        legend: { data: ['CT Rate %', 'Blind TXs'] },
        grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
        xAxis: { type: 'category', data: months, ...darkTheme.xAxis },
        yAxis: [
            { type: 'value', name: 'CT Rate (%)', min: 0, max: 100, ...darkTheme.yAxis },
            { type: 'value', name: 'Blind TX Count', ...darkTheme.yAxis }
        ],
        series: [
            {
                name: 'CT Rate %',
                type: 'line',
                data: data.map(d => d.ct_rate),
                lineStyle: { color: '#10b981', width: 3 },
                showSymbol: false
            },
            {
                name: 'Blind TXs',
                type: 'bar',
                yAxisIndex: 1,
                data: data.map(d => d.ct_count),
                itemStyle: {
                    color: 'rgba(255,255,255,0.1)',
                    borderRadius: [4, 4, 0, 0]
                }
            }
        ]
    });
}
