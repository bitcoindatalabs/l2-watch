// Centralized app configuration for L2 Watch
document.addEventListener('DOMContentLoaded', () => {
    if (typeof BitcoinLabsApp !== 'undefined') {
        BitcoinLabsApp.init({
            isApp: true,
            appName: "L2 Watch",
            appHomeUrl: "https://sorukumar.github.io/l2-watch/",
            navLinks: [
                { name: 'Network Activity', url: 'index.html' },
                { name: 'Reserve Proof', url: 'reserve.html' },
                { name: 'Security & Health', url: 'health.html' },
                { name: 'Audit Trail', url: 'audit.html' }
            ],
            suiteLinks: [
                { name: 'Liquid (Current)', url: '#', icon: 'fa-solid fa-water' },
                { name: 'Spark (Coming Soon)', url: '#', icon: 'fa-solid fa-bolt' },
                { name: 'RGB (Coming Soon)', url: '#', icon: 'fa-solid fa-palette' },
                { name: 'Botanix (Coming Soon)', url: '#', icon: 'fa-brands fa-pagelines' }
            ]
        });

        // Override the hardcoded "orange-dev-suite" label in the injected dropdown
        const updateDropdownLabel = () => {
            const summary = document.querySelector('.bdl-suite-summary');
            // Check if it exists and contains the default text
            if (summary && summary.innerHTML.includes('orange-dev-suite')) {
                summary.innerHTML = '<i class="fa-solid fa-water" style="margin-right: 4px;"></i> Liquid Network <i class="fas fa-chevron-down" style="font-size: 0.7em; opacity: 0.7; margin-left: 4px;"></i>';
                summary.style.background = 'var(--accent-btc, #f7931a)';
                summary.style.color = '#fff';
            } else if (!summary) {
                setTimeout(updateDropdownLabel, 100);
            }
        };
        updateDropdownLabel();
    } else {
        console.error("BitcoinLabsApp is not defined. Ensure app-components.js is loaded.");
    }
});
