class ReplayBrowser {
    constructor() {
        this.table = null;
        this.downloadQueue = [];
        this.isDownloading = false;
        this.playersArray = [];
        this.init();
    }

    async init() {
        try {
            const unique = new Date().getTime();
            const response = await fetch('replays/index.json' + '?unique='+unique);
            const data = await response.json();

            // Update collection date in the banner
            if (data.collection_info?.timestamp) {
                const collectionDate = new Date(data.collection_info.timestamp).toISOString().split('T')[0];
                document.getElementById('collection-date').textContent = collectionDate;
            }

            // Prepare unique players using only player names
            const uniquePlayers = new Set();
            data.replays.forEach(replay => {
                replay.players.forEach(player => {
                    uniquePlayers.add(player.name);  // Use only the player name
                });
            });
            this.playersArray = Array.from(uniquePlayers).sort();

            await this.initializeDataTable(data.replays);
            this.setupEventListeners();
            this.loadStateFromUrl();
        } catch (error) {
            console.error('Failed to load replay data:', error);
            this.showError('Failed to load replay data. Please try again later.');
        }
    }

    initializeDataTable(replays) {
        var that = this
        this.table = $('#replays-table').DataTable({
            createdRow: function(row, data, dataIndex) {
                $(row).attr('title', data.filename);
            },
            data: replays,
            dom: 'Plfrtip',
            searchPanes: {
                cascadePanes: true,
                viewTotal: true,
                layout: 'columns-5',  // Adjust the layout as needed
                clear: true,
                controls: false,
                initCollapsed: false,
                orderable: false,
                panes: [
                    // Custom 'Player' Pane
                    {
                        header: 'Player',
                        options: this.playersArray.map(player => ({
                            label: player,
                            value: function(rowData) {
                                // Compare using only the player name
                                return rowData.players.some(p => p.name === player);
                            }
                        }))
                    }
                ],
                columns: [1, 3, 4, 5]  // Map, Tournament, Stage, Version columns
            },
            columns: [
                {
                    data: 'file_date',
                    render: {
                        _: function(data) {
                            return new Date(data).toISOString().split('T')[0]; // YYYY-MM-DD format
                        },
                        display: function(data) {
                            return new Date(data).toISOString().split('T')[0];
                        },
                        sort: function(data) {
                            return new Date(data).getTime();
                        },
                        filter: function(data) {
                            return new Date(data).getTime();
                        }
                    },
                    type: 'date'
                },
                {
                    data: 'map',
                    searchPanes: {
                        show: true
                    }
                },
                {
                    data: 'players',
                    render: function(data, type, row) {
                        let playerNames = data.map(p =>
                            p.clan ? `${p.name} [${p.clan}]` : p.name
                        ).join(' vs ');
                        return playerNames;
                    }
                    // No automatic SearchPane for this column
                },
                {
                    data: function(row) {
                        return (row.tournament_info && row.tournament_info.tournament_type) || '';
                    },
                    defaultContent: '',
                    searchPanes: {
                        show: true
                    },
                    render: function(data, type, row) {
                        if (!data) return '';
                        const className = that.getTournamentClassName(data);
                        const season = row.tournament_info && row.tournament_info.season ? ` S${row.tournament_info.season}` : '';
                        if (type === 'display') {
                            return `<span class="tournament-badge ${className}">${data}${season}</span>`;
                        }
                        return data + season;
                    }
                },
                {
                    data: function(row) {
                        let data = row.tournament_info || {};
                        if (data.week) {
                            const weekMatch = data.week.toString().match(/week\s*(\d+)/i);
                            if (weekMatch) {
                                return `Week ${weekMatch[1]}`;
                            } else {
                                return `Week ${data.week}`;
                            }
                        } else if (data.stage) {
                            if (data.stage.toLowerCase().includes('group stage')) {
                                return 'Group Stage';
                            } else {
                                return data.stage;
                            }
                        } else if (data.group) {
                            const groupMatch = data.group.match(/group\s*([a-d])/i);
                            if (groupMatch) {
                                return `Group ${groupMatch[1].toUpperCase()}`;
                            } else {
                                return data.group;
                            }
                        }
                        return '';
                    },
                    type: 'string',
                    searchPanes: {
                        show: true
                    }
                },
                {
                    data: 'game_version',
                    searchPanes: {
                        show: true
                    }
                },
                {
                    data: 'file_size',
                    render: {
                        _: (data) => this.formatFileSize(data),
                        sort: (data) => data,
                        filter: (data) => data
                    },
                    type: 'num'
                },
                {
                    data: 'url',
                    render: (data) => `
                        <button class="download-button" onclick="browser.downloadReplay('${data}')">
                            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
                            </svg>
                            Download
                        </button>`
                }
            ],
            order: [[0, 'desc']],
            pageLength: 25,
            responsive: true,
            stateSave: true,
            stateLoadParams: (settings, data) => {
                return {
                    search: data.search,
                    searchPanes: data.searchPanes
                };
            }
        });
    }

    getTournamentClassName(type) {
        const classMap = {
            'Pro League': 'pro-league',
            'Closed Event Cup': 'cup',
            'Global League': 'global-league',
            'Showmatch': 'showmatch'
        };
        return classMap[type] || 'default';
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
    }

    setupEventListeners() {
        document.getElementById('download-filtered').addEventListener('click', () => {
            this.downloadFilteredReplays();
        });

        document.getElementById('cancel-download')?.addEventListener('click', () => {
            this.cancelDownload();
        });

        this.table.on('stateLoaded search.dt', () => {
            this.updateFilteredStats();
            this.saveStateToUrl();
        });

        window.addEventListener('popstate', (event) => {
            if (event.state) {
                this.loadState(event.state);
            }
        });
    }

    updateFilteredStats() {
        const filteredData = this.table.rows({ search: 'applied' }).data().toArray();
        const totalSize = filteredData.reduce((sum, replay) => sum + replay.file_size, 0);
        const sizeMB = (totalSize / (1024 * 1024)).toFixed(1);

        document.getElementById('filtered-count').textContent = filteredData.length;
        document.getElementById('filtered-size').textContent = `${sizeMB} MB`;
    }

    saveStateToUrl() {
        // disable this for now
        if (true) {
            return;
        }
        const state = this.table.state.loaded();
        if (!state) return;

        const urlState = {
            search: state.search.search,
            searchPanes: state.searchPanes
        };

        const stateStr = btoa(JSON.stringify(urlState));
        const newUrl = `${window.location.pathname}?state=${stateStr}`;
        window.history.pushState(state, '', newUrl);
    }

    loadStateFromUrl() {
        const params = new URLSearchParams(window.location.search);
        const stateStr = params.get('state');

        if (stateStr) {
            try {
                const state = JSON.parse(atob(stateStr));
                this.loadState(state);
            } catch (e) {
                console.error('Failed to load state from URL:', e);
            }
        }
    }

    loadState(state) {
        if (!state) return;

        if (state.search) {
            this.table.search(state.search);
        }

        if (state.searchPanes) {
            this.table.searchPanes.clearSelections();
            this.table.searchPanes.stateRestore(state.searchPanes);
        }

        this.table.draw();
        this.updateFilteredStats();
    }

    async downloadFilteredReplays() {
        const filteredData = this.table.rows({ search: 'applied' }).data().toArray();
        if (filteredData.length === 0) {
            this.showError('No replays match the current filters');
            return;
        }

        const totalSize = filteredData.reduce((sum, replay) => sum + replay.file_size, 0);
        const sizeMB = (totalSize / (1024 * 1024)).toFixed(1);

        if (!confirm(`Download ${filteredData.length} replays (${sizeMB} MB)?`)) {
            return;
        }

        this.downloadQueue = [...filteredData];
        this.showDownloadModal(filteredData.length, sizeMB);
        this.startDownload();
    }

    async startDownload() {
        if (this.isDownloading || this.downloadQueue.length === 0) return;

        this.isDownloading = true;
        const zip = new JSZip();
        const total = this.downloadQueue.length;
        let processed = 0;

        try {
            while (this.downloadQueue.length > 0 && this.isDownloading) {
                const replay = this.downloadQueue.shift();
                const response = await fetch(`replays/${replay.url}`);
                const blob = await response.blob();

                const pathParts = replay.url.split('/');
                const filename = pathParts.pop();
                const folderPath = pathParts.join('/');

                zip.file(`${folderPath}/${filename}`, blob);

                processed++;
                this.updateDownloadProgress(processed, total);
            }

            if (this.isDownloading) {
                const content = await zip.generateAsync({ type: 'blob' });
                const downloadUrl = URL.createObjectURL(content);
                const link = document.createElement('a');
                link.href = downloadUrl;
                link.download = `lwg-replays-${new Date().toISOString().split('T')[0]}.zip`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(downloadUrl);
            }
        } catch (error) {
            console.error('Download failed:', error);
            this.showError('Failed to download replays. Please try again.');
        } finally {
            this.isDownloading = false;
            this.hideDownloadModal();
        }
    }

    cancelDownload() {
        this.isDownloading = false;
        this.downloadQueue = [];
        this.hideDownloadModal();
    }

    async downloadReplay(url) {
        try {
            const response = await fetch(`replays/${url}`);
            const blob = await response.blob();
            const downloadUrl = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = downloadUrl;
            link.download = url.split('/').pop();
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(downloadUrl);
        } catch (error) {
            console.error('Download failed:', error);
            this.showError('Failed to download replay. Please try again.');
        }
    }

    showDownloadModal(count, size) {
        const modal = document.getElementById('download-modal');
        document.getElementById('download-count').textContent = count;
        document.getElementById('download-size').textContent = size;
        document.getElementById('download-total').textContent = count;
        document.getElementById('download-current').textContent = '0';
        modal.classList.remove('hidden');
    }

    hideDownloadModal() {
        document.getElementById('download-modal').classList.add('hidden');
    }

    updateDownloadProgress(current, total) {
        document.getElementById('download-current').textContent = current;
        const percentage = (current / total) * 100;
        document.querySelector('#download-progress .bg-blue-600').style.width = `${percentage}%`;
    }

    showError(message) {
        alert(message);
    }
}

