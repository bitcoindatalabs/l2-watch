// Centralized Bitcoin Data Labs shell configuration for L2 Watch
document.addEventListener('DOMContentLoaded', () => {
    if (typeof BitcoinLabsApp !== 'undefined') {
        BitcoinLabsApp.init({
            isApp: true,
            appName: 'L2 Watch',
            appHomeUrl: 'index.html',
            suiteName: 'L2 Suite',
            navLinks: [
                { name: 'Scorecard', url: 'index.html' },
                { name: 'Reserves', url: 'reserve.html' },
                { name: 'Redemption', url: 'redemption.html' },
                { name: 'Incidents', url: 'incidents.html' },
                { name: 'Federation', url: 'federation.html' },
                { name: 'Privacy & Fees', url: 'usage.html' },
                { name: 'Assets', url: 'assets.html' },
                { name: 'Methods', url: 'methods.html' },
                { name: 'Compare', url: 'compare.html' }
            ],
            suiteLinks: [
                { name: 'Liquid Network Audit', url: 'index.html', icon: 'fa-solid fa-water' },
                { name: 'Compare Bitcoin L2s', url: 'compare.html', icon: 'fa-solid fa-scale-balanced' },
                { name: 'Plebdashboard (Lightning)', url: 'https://plebdashboard.com/', icon: 'fa-solid fa-bolt' },
                { name: 'l2-data Repo (GitHub)', url: 'https://github.com/bitcoindatalabs/l2-data', icon: 'fa-brands fa-github' },
                { name: 'Zenodo DOI Archive', url: 'https://doi.org/10.5281/zenodo.24429493', icon: 'fa-solid fa-book-bookmark' }
            ],
            footerLinks: [
                { name: 'l2-data v0.1.1 (GitHub)', url: 'https://github.com/bitcoindatalabs/l2-data' },
                { name: 'Zenodo DOI', url: 'https://doi.org/10.5281/zenodo.24429493' },
                { name: 'Methods & Invariants', url: 'methods.html' },
                { name: 'Bitcoin Data Labs', url: 'https://bitcoindatalabs.org/' }
            ]
        });
    } else {
        console.error('BitcoinLabsApp is not defined.');
    }
});
