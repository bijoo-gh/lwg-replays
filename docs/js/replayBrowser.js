class ReplayBrowser {
    constructor() {
        this.table = null;
        this.timeline = null;
        this.dateRange = null;          // {a: 'YYYY-MM', b: 'YYYY-MM'} inclusive
        this.downloadQueue = [];
        this.isDownloading = false;
        this.playersArray = [];
        this.totals = { count: 0, size: 0 };
        this.init();
    }

    async init() {
        try {
            const unique = Math.floor(new Date().getTime() / (1000 * 60)); // Once a minute
            const response = await fetch('replays/index.json' + '?unique=' + unique);
            const data = await response.json();

            if (data.collection_info?.timestamp) {
                const collectionDate = new Date(data.collection_info.timestamp).toISOString().split('T')[0];
                document.getElementById('collection-date').textContent = collectionDate;
            }
            this.totals = {
                count: data.replays.length,
                size: data.replays.reduce((s, r) => s + (r.file_size || 0), 0),
            };

            // Unique player names for the custom SearchPane
            const uniquePlayers = new Set();
            data.replays.forEach(replay => {
                replay.players.forEach(player => uniquePlayers.add(player.name));
            });
            this.playersArray = Array.from(uniquePlayers).sort();

            this.setupDateRangeFilter();
            await this.initializeDataTable(data.replays);
            this.setupTimeline(data.replays);
            this.setupEventListeners();
        } catch (error) {
            console.error('Failed to load replay data:', error);
            this.showError('Failed to load replay data. Please try again later.');
        }
    }

    /* The timeline brush filters the table through this predicate. */
    setupDateRangeFilter() {
        $.fn.dataTable.ext.search.push((settings, data, dataIndex, rowData) => {
            if (settings.nTable.id !== 'replays-table') return true;
            if (!this.dateRange || !rowData.file_date) return true;
            const ym = rowData.file_date.slice(0, 7);
            return ym >= this.dateRange.a && ym <= this.dateRange.b;
        });
    }

    setupTimeline(replays) {
        const container = document.getElementById('timeline');
        this.timeline = new ActivityTimeline(container, replays, (a, b) => {
            this.dateRange = a ? { a, b } : null;
            this.updateRangeIndicator();
            this.updateRangeHash();
            this.table.draw();
        });
        document.getElementById('range-clear').addEventListener('click', () => {
            this.timeline.clear();
        });

        // restore a shared link like #range=2025-01:2025-06
        const m = location.hash.match(/range=(\d{4}-\d{2}):(\d{4}-\d{2})/);
        if (m) this.timeline.setRange(m[1], m[2]);
    }

    updateRangeHash() {
        const url = this.dateRange
            ? `#range=${this.dateRange.a}:${this.dateRange.b}`
            : location.pathname + location.search;
        history.replaceState(null, '', url);
    }

    updateRangeIndicator() {
        const box = document.getElementById('range-indicator');
        const text = document.getElementById('range-text');
        if (!this.dateRange) {
            box.classList.add('hidden');
            return;
        }
        const label = ym => {
            const [y, m] = ym.split('-');
            return new Date(Number(y), Number(m) - 1, 1)
                .toLocaleString('en', { month: 'short' }) + ' ' + y;
        };
        text.textContent = this.dateRange.a === this.dateRange.b
            ? label(this.dateRange.a)
            : `${label(this.dateRange.a)} – ${label(this.dateRange.b)}`;
        box.classList.remove('hidden');
    }

    initializeDataTable(replays) {
        var that = this;
        this.table = $('#replays-table').DataTable({
            createdRow: function (row, data) {
                $(row).attr('title', data.filename);
            },
            data: replays,
            dom: 'Plfrtip',
            searchPanes: {
                cascadePanes: true,
                viewTotal: true,
                layout: 'columns-5',
                clear: true,
                controls: false,
                // On small screens the five panes would push the table several
                // viewports down — start them collapsed there.
                initCollapsed: window.matchMedia('(max-width: 720px)').matches,
                orderable: false,
                panes: [
                    {
                        header: 'Player',
                        // most-active players first, not alphabetical
                        dtOpts: { order: [[1, 'desc']] },
                        options: this.playersArray.map(player => ({
                            label: player,
                            value: function (rowData) {
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
                    className: 'col-date',
                    responsivePriority: 1,
                    render: {
                        _: data => (data || '').slice(0, 10),
                        sort: data => data || '',
                        filter: data => (data || '').slice(0, 10),
                    },
                    type: 'string'
                },
                {
                    data: 'map',
                    responsivePriority: 5,
                    searchPanes: { show: true }
                },
                {
                    data: 'players',
                    responsivePriority: 2,
                    render: function (data) {
                        return data.map(p =>
                            p.clan ? `${p.name} [${p.clan}]` : p.name
                        ).join(' vs ');
                    }
                },
                {
                    data: function (row) {
                        return (row.tournament_info && row.tournament_info.tournament_type) || '';
                    },
                    defaultContent: '',
                    responsivePriority: 4,
                    searchPanes: { show: true },
                    render: function (data, type, row) {
                        // Casual games get a real label instead of a blank
                        if (!data) {
                            return (type === 'display')
                                ? '<span class="tournament-badge default">Casual</span>'
                                : 'Casual';
                        }
                        const className = that.getTournamentClassName(data);
                        const season = row.tournament_info && row.tournament_info.season
                            ? ` S${row.tournament_info.season}` : '';
                        if (type === 'display') {
                            return `<span class="tournament-badge ${className}">${data}${season}</span>`;
                        }
                        return data + season;
                    }
                },
                {
                    data: function (row) {
                        let data = row.tournament_info || {};
                        if (data.week) {
                            const weekMatch = data.week.toString().match(/week\s*(\d+)/i);
                            return weekMatch ? `Week ${weekMatch[1]}` : `Week ${data.week}`;
                        } else if (data.stage) {
                            return data.stage;
                        } else if (data.group) {
                            const groupMatch = data.group.match(/group\s*([a-d])/i);
                            return groupMatch ? `Group ${groupMatch[1].toUpperCase()}` : data.group;
                        }
                        return '';
                    },
                    type: 'string',
                    responsivePriority: 6,
                    searchPanes: { show: true, orthogonal: 'sp' },
                    render: function (data, type) {
                        if (type === 'sp') return data || '(none)';
                        return data;
                    }
                },
                {
                    data: 'game_version',
                    responsivePriority: 8,
                    searchPanes: { show: true }
                },
                {
                    data: 'file_size',
                    className: 'col-size',
                    responsivePriority: 7,
                    render: {
                        _: (data) => this.formatFileSize(data),
                        sort: (data) => data,
                        filter: (data) => data
                    },
                    type: 'num'
                },
                {
                    data: 'url',
                    orderable: false,
                    responsivePriority: 3,
                    render: (data) => `
                        <button class="download-button" onclick="browser.downloadReplay('${data}')">
                            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
                            </svg>
                            .lwg
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
            'LWG500': 'lwg500',
        };
        return classMap[type] || 'default';
    }

    formatFileSize(bytes) {
        if (!bytes) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
    }

    setupEventListeners() {
        document.getElementById('download-filtered').addEventListener('click', () => {
            this.downloadFilteredReplays();
        });
        document.getElementById('cancel-download')?.addEventListener('click', () => {
            this.cancelDownload();
        });
        this.table.on('draw.dt', () => this.updateFilteredStats());
        this.updateFilteredStats();
    }

    updateFilteredStats() {
        const filteredData = this.table.rows({ search: 'applied' }).data().toArray();
        const totalSize = filteredData.reduce((sum, replay) => sum + replay.file_size, 0);
        const sizeMB = (totalSize / (1024 * 1024)).toFixed(1);

        document.getElementById('filtered-count').textContent = filteredData.length;
        document.getElementById('filtered-size').textContent = `${sizeMB} MB`;

        // stat tiles reflect the current filter slice
        const players = new Set();
        const maps = new Set();
        filteredData.forEach(r => {
            r.players.forEach(p => players.add(p.name));
            if (r.map) maps.add(r.map);
        });
        const filtered = filteredData.length !== this.totals.count;
        document.getElementById('stat-replays').textContent =
            filteredData.length.toLocaleString();
        document.getElementById('stat-replays-sub').textContent =
            filtered ? `of ${this.totals.count.toLocaleString()}` : '';
        document.getElementById('stat-size').textContent =
            totalSize >= 1024 * 1024 * 1024
                ? `${(totalSize / 1073741824).toFixed(2)} GB`
                : `${Math.round(totalSize / 1048576)} MB`;
        document.getElementById('stat-players').textContent =
            players.size.toLocaleString();
        document.getElementById('stat-maps').textContent =
            maps.size.toLocaleString();
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
        document.querySelector('#download-progress .progress-fill').style.width = `${percentage}%`;
    }

    showError(message) {
        alert(message);
    }
}
