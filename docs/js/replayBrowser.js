class ReplayBrowser {
    constructor() {
        this.replays = [];
        this.grid = null;
        this.filters = new Map();
        this.searchTerm = '';
        this.init();
    }

    async init() {
        const response = await fetch('replays/index.json');
        const data = await response.json();
        this.replays = data.replays;
        
        // Load initial state from URL
        this.loadStateFromUrl();
        
        this.setupFilters();
        this.setupGrid();
        this.setupEventListeners();
        this.updateActiveFilters();
        this.updateDownloadCount();

        // Listen for browser back/forward
        window.addEventListener('popstate', (event) => {
            if (event.state) {
                this.loadState(event.state);
            }
        });
    }

    setupEventListeners() {
        document.getElementById('download-all').addEventListener('click', () => {
            this.downloadFilteredReplays();
        });
    }

    async downloadFilteredReplays() {
        const filteredData = this.getFilteredData();
        if (filteredData.length === 0) {
            alert('No replays match the current filters');
            return;
        }

        // Create a progress indicator
        const button = document.getElementById('download-all');
        const originalText = button.innerHTML;
        button.innerHTML = `
            <svg class="animate-spin h-5 w-5 mr-2" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"/>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
            </svg>
            Preparing Download...
        `;
        button.disabled = true;

        try {
            // Create a zip file
            const zip = new JSZip();
            
            // Add each replay to the zip
            for (const [index, replay] of filteredData.entries()) {
                const url = `replays/${replay[4]}`; // replay[4] contains the URL
                const response = await fetch(url);
                const blob = await response.blob();
                
                // Use the original filename from the URL
                const filename = replay[4].split('/').pop();
                zip.file(filename, blob);

                // Update progress
                button.innerHTML = `
                    <svg class="animate-spin h-5 w-5 mr-2" viewBox="0 0 24 24">
                        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"/>
                        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                    </svg>
                    Processing ${index + 1}/${filteredData.length}...
                `;
            }

            // Generate the zip file
            const content = await zip.generateAsync({ type: 'blob' });
            
            // Create a download link
            const downloadUrl = URL.createObjectURL(content);
            const link = document.createElement('a');
            link.href = downloadUrl;
            link.download = `lwg-replays-${new Date().toISOString().split('T')[0]}.zip`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(downloadUrl);

        } catch (error) {
            console.error('Download failed:', error);
            alert('Failed to download replays. Please try again.');
        } finally {
            // Restore button state
            button.innerHTML = originalText;
            button.disabled = false;
        }
    }

    updateDownloadCount() {
        const count = this.getFilteredData().length;
        document.getElementById('download-count').textContent = count;
    }

    loadStateFromUrl() {
        const params = new URLSearchParams(window.location.search);
        
        // Load search term
        if (params.has('search')) {
            this.searchTerm = params.get('search');
        }

        // Load filters
        ['map', 'player', 'tournament'].forEach(key => {
            if (params.has(key)) {
                this.filters.set(key, params.get(key));
            }
        });
    }

    updateUrl() {
        const params = new URLSearchParams();
        
        // Add search term
        if (this.searchTerm) {
            params.set('search', this.searchTerm);
        }

        // Add filters
        this.filters.forEach((value, key) => {
            if (value) {
                params.set(key, value);
            }
        });

        // Update URL without reloading
        const newUrl = `${window.location.pathname}${params.toString() ? '?' + params.toString() : ''}`;
        window.history.pushState(
            { filters: Object.fromEntries(this.filters), searchTerm: this.searchTerm },
            '',
            newUrl
        );
    }

    loadState(state) {
        this.filters = new Map(Object.entries(state.filters));
        this.searchTerm = state.searchTerm;
        this.updateGrid();
        this.updateActiveFilters();
        this.syncFilterControls();
    }

    syncFilterControls() {
        // Update dropdown selections
        this.filters.forEach((value, key) => {
            const select = document.querySelector(`select[data-filter="${key}"]`);
            if (select) select.value = value;
        });

        // Update search input
        const searchInput = document.querySelector('.gridjs-search-input');
        if (searchInput) searchInput.value = this.searchTerm;
    }

    setupFilters() {
        const maps = new Set();
        const tournaments = new Set();
        const players = new Set();

        this.replays.forEach(replay => {
            if (replay.map) maps.add(replay.map);
            if (replay.tournament_info.tournament_path) {
                tournaments.add(replay.tournament_info.tournament_path);
            }
            replay.players.forEach(p => players.add(p.name));
        });

        this.addFilter('map', Array.from(maps), 'Map');
        this.addFilter('player', Array.from(players), 'Player');
        this.addFilter('tournament', Array.from(tournaments), 'Tournament');
    }

    addFilter(key, options, label) {
        const select = document.createElement('select');
        select.className = 'w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500';
        select.dataset.filter = key;
        select.innerHTML = `<option value="">All ${label}s</option>` +
            options.sort().map(opt => `<option value="${opt}">${opt}</option>`).join('');
        
        // Set initial value from URL params
        if (this.filters.has(key)) {
            select.value = this.filters.get(key);
        }

        select.addEventListener('change', (e) => {
            this.filters.set(key, e.target.value);
            this.updateGrid();
            this.updateActiveFilters();
            this.updateUrl();
        });

        const container = document.createElement('div');
        container.className = 'flex flex-col';
        container.innerHTML = `<label class="mb-1 text-sm text-gray-600">${label}</label>`;
        container.appendChild(select);

        document.getElementById('filters').appendChild(container);
    }

    setupGrid() {
        this.grid = new gridjs.Grid({
            columns: [
                {
                    name: 'Date',
                    formatter: (cell) => {
                        return new Date(cell).toLocaleDateString();
                    }
                },
                { name: 'Map' },
                { 
                    name: 'Players',
                    formatter: (players) => {
                        return players.map(p => 
                            p.clan ? `${p.name} [${p.clan}]` : p.name
                        ).join(' vs ');
                    }
                },
                { name: 'Tournament' },
                {
                    name: 'Download',
                    formatter: (cell) => {
                        return gridjs.html(
                            `<a href="replays/${cell}" class="text-blue-600 hover:text-blue-800" download>Download</a>`
                        );
                    }
                }
            ],
            data: this.getFilteredData(),
            search: {
                enabled: true,
                keyword: this.searchTerm,
                onChange: (value) => {
                    this.searchTerm = value;
                    this.updateActiveFilters();
                    this.updateUrl();
                    this.updateDownloadCount();
                }
            },
            sort: true,
            pagination: {
                limit: 20
            },
            style: {
                table: {
                    width: '100%'
                }
            }
        }).render(document.getElementById('replay-table'));
    }

    updateActiveFilters() {
        const container = document.getElementById('active-filters');
        container.innerHTML = '';

        // Add dropdown filters
        this.filters.forEach((value, key) => {
            if (value) {
                this.addFilterPill(container, key, value);
            }
        });

        // Add search term if exists
        if (this.searchTerm) {
            this.addFilterPill(container, 'search', this.searchTerm, true);
        }

        if (container.children.length === 0) {
            container.innerHTML = '<span class="text-gray-500 text-sm">No active filters</span>';
        }
    }

    addFilterPill(container, key, value, isSearch = false) {
        const pill = document.createElement('div');
        pill.className = 'filter-pill bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm flex items-center';
        if (isSearch) {
            pill.dataset.type = 'search';
        }
        
        const label = isSearch ? 'Search' : key;
        pill.innerHTML = `
            ${label}: ${value}
            <button class="ml-2 text-blue-600 hover:text-blue-800" 
                    onclick="browser.removeFilter('${key}', ${isSearch})">×</button>
        `;
        container.appendChild(pill);
    }

    removeFilter(key, isSearch = false) {
        if (isSearch) {
            this.searchTerm = '';
            // Update Grid.js search input
            const searchInput = document.querySelector('.gridjs-search-input');
            if (searchInput) searchInput.value = '';
            this.grid.search('');
        } else {
            this.filters.delete(key);
            document.querySelector(`select[data-filter="${key}"]`).value = '';
            this.updateGrid();
        }
        this.updateActiveFilters();
        this.updateUrl();
        this.updateDownloadCount();
    }

    getFilteredData() {
        return this.replays
            .filter(replay => {
                return (!this.filters.get('map') || replay.map === this.filters.get('map')) &&
                       (!this.filters.get('tournament') || replay.tournament_info.tournament_path === this.filters.get('tournament')) &&
                       (!this.filters.get('player') || replay.players.some(p => p.name === this.filters.get('player')));
            })
            .map(replay => [
                replay.file_date,
                replay.map,
                replay.players,
                replay.tournament_info.tournament_path || '',
                replay.url
            ]);
    }

    updateGrid() {
        this.grid.updateConfig({
            data: this.getFilteredData()
        }).forceRender();
        this.updateDownloadCount();
    }
}

