/**
 * Diagonal Multiple Arrangement Design Generator
 * Implements DBUDC (Diagonal Balanced Unreplicated Design with Checks) for Multiple Experiments
 */
'use strict';

class DiagonalMultipleGenerator {
    constructor(params) {
        this.totalEntries = parseInt(params.totalEntries);
        this.blocksArr = params.blocksArr; // [100, 120, 80]
        this.checksCount = parseInt(params.checksCount);
        this.locationsCount = parseInt(params.locationsCount);
        this.stacked = params.stacked; // "By Row" or "By Column"
        this.planter = params.planter; // "serpentine" or "cartesian"
        this.exptNames = params.exptNames;
        this.locationNames = params.locationNames;
        this.checkModulus = parseInt(params.checkModulus) || 8; // Default to 8

        let s = params.seed;
        this.seed = (s !== null && s !== undefined && !isNaN(s)) ? parseInt(s) : Math.floor(Math.random() * 1000000);

        this.sameEntries = params.sameEntries === 'Yes';
        this.customEntryNames = params.entryNames || [];
        this.customCheckNames = params.checkNames || [];

        this.random = this.mulberry32(this.seed);
        this.fieldBook = [];
        this.matrices = []; // Stores the final design for each location
        this.info = {};
    }

    mulberry32(a) {
        return function () {
            var t = a += 0x6D2B79F5;
            t = Math.imul(t ^ t >>> 15, t | 1);
            t ^= t + Math.imul(t ^ t >>> 7, t | 61);
            return ((t ^ t >>> 14) >>> 0) / 4294967296;
        }
    }

    shuffle(array, randomFunc) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(randomFunc() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    }

    // Finds possible field dimensions (Rows x Cols) that can accommodate the entries
    static findFieldOptions(totalLines, checksCount) {
        const total = totalLines + checksCount;
        // Search in a range of total plots (allowing some fillers)
        const minPlots = Math.floor(total * 1.05);
        const maxPlots = Math.ceil(total * 1.30);

        let options = [];
        for (let n = minPlots; n <= maxPlots; n++) {
            for (let r = 5; r <= Math.sqrt(n) + 5; r++) {
                if (n % r === 0) {
                    let c = n / r;
                    // Prefer designs that aren't too skinny
                    if (r >= 5 && c >= 5) {
                        options.push({ rows: r, cols: c, total: n, diff: Math.abs(r - c) });
                        if (r !== c) options.push({ rows: c, cols: r, total: n, diff: Math.abs(r - c) });
                    }
                }
            }
        }

        // Sort by how square they are
        options.sort((a, b) => a.diff - b.diff);
        // Deduplicate and return top 15
        const seen = new Set();
        return options.filter(o => {
            const key = `${o.rows}x${o.cols}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        }).slice(0, 15);
    }

    generate(rows, cols, startPlot = 1001) {
        this.rows = rows;
        this.cols = cols;
        this.matrices = [];
        this.fieldBook = [];

        let currentSeed = this.seed;

        for (let l = 0; l < this.locationsCount; l++) {
            const random = this.mulberry32(currentSeed++);
            const matrix = Array.from({ length: rows }, () => Array(cols).fill(null));
            const exptMatrix = Array.from({ length: rows }, () => Array(cols).fill(null));
            const plotMatrix = Array.from({ length: rows }, () => Array(cols).fill(null));

            // 1. Place Checks in Diagonal Pattern
            // We use a systematic diagonal placement
            let checkList = [];
            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    // Adaptive K based on user selection
                    if ((r + c) % this.checkModulus === 0) {
                        const checkIdx = Math.floor(random() * this.checksCount);
                        const checkId = checkIdx + 1;
                        const checkName = this.customCheckNames[checkIdx] || `CH-${checkId}`;
                        matrix[r][c] = {
                            type: 'Check',
                            name: checkName,
                            id: checkId,
                            isCheck: true
                        };
                        exptMatrix[r][c] = 'Check';
                    }
                }
            }
            // ... (rest of logic) ...

            // 2. Define sub-blocks (experiments) in the matrix
            // This is the tricky part. We need to divide the remaining plots among blocks.
            const freePlots = [];
            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    if (!matrix[r][c]) freePlots.push({ r, c });
                }
            }

            // Sort free plots by Stacked preference
            if (this.stacked === 'By Row') {
                // Keep default R-order (row by row)
            } else {
                // Column major sort
                freePlots.sort((a, b) => a.c - b.c || a.r - b.r);
            }

            // Assign Plots to Experiments
            let currentPlotIdx = 0;
            this.blocksArr.forEach((blockSize, bIdx) => {
                const exptName = this.exptNames[bIdx] || `Expt${bIdx + 1}`;
                for (let i = 0; i < blockSize; i++) {
                    if (currentPlotIdx < freePlots.length) {
                        const pos = freePlots[currentPlotIdx++];
                        exptMatrix[pos.r][pos.c] = exptName;
                    }
                }
            });

            // Fillers
            while (currentPlotIdx < freePlots.length) {
                const pos = freePlots[currentPlotIdx++];
                matrix[pos.r][pos.c] = { type: 'Filler', name: 'Filler', id: 0, isCheck: false };
                exptMatrix[pos.r][pos.c] = 'Filler';
            }

            // 3. Randomize Entries into designated plots
            // If sameEntries is True, we reuse the same list of entries for each block
            // Otherwise, we use unique entries across all blocks
            let entryPool = [];
            if (!this.sameEntries) {
                for (let i = 1; i <= this.totalEntries; i++) {
                    const name = this.customEntryNames[i - 1] || `G-${i}`;
                    entryPool.push({ id: this.checksCount + i, name: name });
                }
            }

            this.blocksArr.forEach((blockSize, bIdx) => {
                const exptName = this.exptNames[bIdx] || `Expt${bIdx + 1}`;
                let blockEntryPool = [];
                if (this.sameEntries) {
                    for (let i = 1; i <= blockSize; i++) {
                        const name = this.customEntryNames[i - 1] || `G-${i}`;
                        blockEntryPool.push({ id: this.checksCount + i, name: name });
                    }
                } else {
                    blockEntryPool = entryPool.splice(0, blockSize);
                }

                this.shuffle(blockEntryPool, random);

                let assignedInBlock = 0;
                for (let r = 0; r < rows; r++) {
                    for (let c = 0; c < cols; c++) {
                        if (exptMatrix[r][c] === exptName && !matrix[r][c]) {
                            const entry = blockEntryPool[assignedInBlock++];
                            matrix[r][c] = {
                                type: 'Entry',
                                name: entry.name,
                                id: entry.id,
                                isCheck: false,
                                expt: exptName
                            };
                        }
                    }
                }
            });

            // 4. Assign Plot Numbers based on Planter Movement
            let currentPlotNum = startPlot + (l * 1000);
            for (let r = 0; r < rows; r++) {
                let colsIter = Array.from({ length: cols }, (_, i) => i);
                if (this.planter === 'serpentine' && r % 2 !== 0) colsIter.reverse();

                colsIter.forEach(c => {
                    const item = matrix[r][c];
                    plotMatrix[r][c] = currentPlotNum;

                    this.fieldBook.push({
                        id: this.fieldBook.length + 1,
                        plot: currentPlotNum++,
                        location: this.locationNames[l] || `Loc ${l + 1}`,
                        row: r + 1,
                        col: c + 1,
                        expt: item.expt || (item.type === 'Check' ? 'Check' : 'Filler'),
                        entryId: item.id,
                        name: item.name,
                        type: item.type,
                        isCheck: item.isCheck,
                        yield: null
                    });
                });
            }

            this.matrices.push({
                design: matrix,
                expt: exptMatrix,
                plot: plotMatrix
            });
        }

        const totalPlots = rows * cols;
        const checkPlots = this.fieldBook.filter(f => f.location === this.fieldBook[0].location && f.isCheck).length;
        this.info = {
            dim: `${rows} x ${cols}`,
            checkPct: ((checkPlots / totalPlots) * 100).toFixed(1) + '%',
            totalPlots: totalPlots * this.locationsCount,
            totalEntries: this.totalEntries,
            fillers: (totalPlots - (this.checksCount + (this.sameEntries ? this.blocksArr[0] : this.totalEntries))) // simplified
        };

        return this.fieldBook;
    }

    simulate(min = 50, max = 150) {
        const random = this.mulberry32(this.seed + 99);
        this.fieldBook.forEach(row => {
            // Simple spatial correlation approximation (local noise + trend)
            const spatialTrend = (row.row / this.rows) * 10 + (row.col / this.cols) * 5;
            const val = min + (random() * (max - min)) + spatialTrend;
            row.yield = val.toFixed(2);
        });
        return this.fieldBook;
    }
}

// UI Controller
document.addEventListener('DOMContentLoaded', () => {
    try {
        const runBtn = document.getElementById('run-btn');
        const generateBtn = document.getElementById('generate-btn');
        const simulateBtn = document.getElementById('simulate-btn');
        const exportBtn = document.getElementById('export-btn');
        const optionsPanel = document.getElementById('options-panel');
        const dimSelect = document.getElementById('dimensions-multiple');
        const resultsSection = document.getElementById('results');
        const fbTableBody = document.querySelector('#field-book-table tbody');
        const locViewSelect = document.getElementById('locView-diagonal-db');
        const heatmapTrigger = document.getElementById('heatmap-trigger');

        const matrixWrapper = document.getElementById('matrix-wrapper');
        const exptMatrixWrapper = document.getElementById('expt-matrix-wrapper');
        const plotMatrixWrapper = document.getElementById('plot-matrix-wrapper');
        const heatmapWrapper = document.getElementById('heatmap-wrapper');

        let currentGenerator = null;

        if (runBtn) {
            runBtn.addEventListener('click', () => {
                try {
                    const totalEntries = parseInt(document.getElementById('lines-db').value);
                    const checksCount = parseInt(document.getElementById('checks-db').value);
                    const blocksStr = document.getElementById('blocks-db').value;
                    const blocksArr = blocksStr.split(',').map(s => parseInt(s.trim()));

                    const sumBlocks = blocksArr.reduce((a, b) => a + b, 0);
                    const sameEntries = document.getElementById('sameEntries').value;

                    if (isNaN(totalEntries) || isNaN(checksCount) || blocksArr.some(isNaN)) {
                        alert("Please check your inputs.");
                        return;
                    }

                    if (sameEntries === 'No' && sumBlocks !== totalEntries) {
                        alert(`Error: Sum of blocks (${sumBlocks}) must equal total entries (${totalEntries}) when entries are not repeated.`);
                        return;
                    }

                    const options = DiagonalMultipleGenerator.findFieldOptions(sameEntries === 'Yes' ? blocksArr[0] : totalEntries, checksCount);

                    dimSelect.innerHTML = '';
                    options.forEach(opt => {
                        const el = document.createElement('option');
                        el.value = `${opt.rows},${opt.cols}`;
                        el.textContent = `${opt.rows} Rows x ${opt.cols} Columns (Total Plots: ${opt.total})`;
                        dimSelect.appendChild(el);
                    });

                    optionsPanel.style.display = 'block';
                    runBtn.innerHTML = '<i class="fas fa-check"></i> Options Loaded';
                } catch (e) {
                    alert("Error processing options: " + e.message);
                }
            });
        }

        if (generateBtn) {
            generateBtn.addEventListener('click', () => {
                if (!window.requireAuth || !window.requireAuth()) {
                    console.warn("Auth required");
                    return;
                }
                try {
                    if (!dimSelect.value) return;
                    const [rows, cols] = dimSelect.value.split(',').map(Number);

                    const seedVal = document.getElementById('seed-multiple').value;

                    const params = {
                        totalEntries: document.getElementById('lines-db').value,
                        blocksArr: document.getElementById('blocks-db').value.split(',').map(s => parseInt(s.trim())),
                        checksCount: document.getElementById('checks-db').value,
                        locationsCount: document.getElementById('locs-db').value,
                        stacked: document.getElementById('stacked-input').value,
                        planter: document.getElementById('planter-multiple').value,
                        exptNames: document.getElementById('expt-name-multiple').value.split(',').map(s => s.trim()),
                        locationNames: document.getElementById('location-multiple').value.split(',').map(s => s.trim()),
                        seed: seedVal,
                        sameEntries: document.getElementById('sameEntries').value,
                        entryNames: document.getElementById('entry-names-db').value.split(',').map(s => s.trim()).filter(s => s !== ""),
                        checkNames: document.getElementById('check-names-db').value.split(',').map(s => s.trim()).filter(s => s !== ""),
                        checkModulus: document.getElementById('check-intensity').value
                    };

                    currentGenerator = new DiagonalMultipleGenerator(params);
                    const startPlot = parseInt(document.getElementById('plot-start-multiple').value);
                    const data = currentGenerator.generate(rows, cols, startPlot);

                    // Update Location View Select
                    if (locViewSelect) {
                        locViewSelect.innerHTML = '';
                        for (let i = 1; i <= params.locationsCount; i++) {
                            const opt = document.createElement('option');
                            opt.value = i - 1;
                            opt.textContent = params.locationNames[i - 1] || `Location ${i}`;
                            locViewSelect.appendChild(opt);
                        }
                    }

                    updateUI();
                    resultsSection.style.display = 'block';
                    if (simulateBtn) simulateBtn.style.display = 'block';
                    if (exportBtn) exportBtn.style.display = 'block';
                    if (document.getElementById('copy-btn')) document.getElementById('copy-btn').style.display = 'block';
                    if (document.getElementById('download-map-btn')) document.getElementById('download-map-btn').style.display = 'block';
                    resultsSection.scrollIntoView({ behavior: 'smooth' });

                } catch (e) {
                    alert("Generation error: " + e.message);
                }
            });
        }

        if (document.getElementById('download-map-btn')) {
            document.getElementById('download-map-btn').addEventListener('click', () => {
                const container = document.getElementById('matrix-wrapper'); // Capture full wrapper
                if (!container || typeof html2canvas === 'undefined') {
                    alert('Map container error or library missing');
                    return;
                }
                // use backgroundColor: null for transparency
                html2canvas(container, { backgroundColor: null, scale: 3 }).then(canvas => {
                    const a = document.createElement('a');
                    a.download = `diagonal_multiple_map_${Date.now()}.png`;
                    a.href = canvas.toDataURL("image/png");
                    a.click();
                });
            });
        }

        if (locViewSelect) locViewSelect.addEventListener('change', updateUI);

        if (simulateBtn) {
            simulateBtn.addEventListener('click', () => {
                if (!currentGenerator) return;
                currentGenerator.simulate();
                updateUI();
                if (heatmapTrigger) heatmapTrigger.style.display = 'block';
                alert("Simulation complete! Check the Heatmap tab.");
            });
        }

        function updateUI() {
            if (!currentGenerator || !locViewSelect) return;
            const locIdx = parseInt(locViewSelect.value);
            const matrixObj = currentGenerator.matrices[locIdx];

            // Info Cards
            if (document.getElementById('info-dim')) document.getElementById('info-dim').textContent = currentGenerator.info.dim;
            if (document.getElementById('info-check-pct')) document.getElementById('info-check-pct').textContent = currentGenerator.info.checkPct;
            if (document.getElementById('info-total-plots')) document.getElementById('info-total-plots').textContent = currentGenerator.info.totalPlots;

            renderMatrix(matrixObj.design, matrixWrapper, 'design');
            // renderMatrix(matrixObj.expt, exptMatrixWrapper, 'expt'); // Removed tab
            renderMatrix(matrixObj.plot, plotMatrixWrapper, 'plot');
            renderTable(currentGenerator.fieldBook);

            if (currentGenerator.fieldBook[0].yield) {
                renderHeatmap(currentGenerator.matrices[locIdx].design, currentGenerator.fieldBook, locIdx);
            }
        }

        function renderMatrix(matrix, container, type) {
            if (!container) return;
            container.innerHTML = '';
            const rows = matrix.length;
            const cols = matrix[0].length;
            container.style.gridTemplateColumns = `repeat(${cols}, 60px)`; // Increased size for better visibility

            // R-style numbering (bottom up)
            for (let r = rows - 1; r >= 0; r--) {
                for (let c = 0; c < cols; c++) {
                    const cell = document.createElement('div');
                    cell.className = 'cell';

                    // High contrast styling: Light BG, Dark Text
                    cell.style.color = '#1f2937'; // Gray-900
                    cell.style.fontWeight = '600';
                    cell.style.display = 'flex';
                    cell.style.flexDirection = 'column';
                    cell.style.justifyContent = 'center';
                    cell.style.alignItems = 'center';
                    cell.style.border = '1px solid rgba(0,0,0,0.1)';

                    if (type === 'design') {
                        const item = matrix[r][c];
                        if (item.type === 'Check') {
                            cell.style.background = '#dcfce7'; // Green-100
                            cell.style.color = '#14532d';     // Green-900
                        } else if (item.type === 'Entry') {
                            cell.style.background = '#ffe4e6'; // Rose-100
                            cell.style.color = '#881337';     // Rose-900
                        } else {
                            cell.style.background = '#f3f4f6'; // Gray-100
                            cell.style.color = '#374151';     // Gray-700
                        }

                        cell.innerHTML = `<span style="font-size: 0.9rem;">${item.id || ''}</span><small style="font-size: 0.6rem; opacity: 0.8;">${item.type[0]}</small>`;
                    } else if (type === 'expt') {
                        // ... (Legacy logic, though tab is removed) ...
                    } else {
                        // Plot numbers
                        cell.style.background = '#e0f2fe'; // Sky-100
                        cell.style.color = '#0c4a6e';     // Sky-900
                        cell.textContent = matrix[r][c];
                    }
                    container.appendChild(cell);
                }
            }
        }

        function renderTable(data) {
            if (!fbTableBody) return;
            fbTableBody.innerHTML = '';

            const header = document.querySelector('#field-book-table thead tr');
            const hasYield = data.length > 0 && data[0].yield;

            // Sync Header
            if (header) {
                const yieldTh = Array.from(header.cells).find(c => c.textContent === "Yield");
                if (hasYield && !yieldTh) {
                    const th = document.createElement('th');
                    th.textContent = "Yield";
                    header.appendChild(th);
                } else if (!hasYield && yieldTh) {
                    yieldTh.remove();
                }
            }

            data.forEach(row => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${row.id}</td>
                    <td><strong>${row.plot}</strong></td>
                    <td>${row.location}</td>
                    <td>${row.row}</td>
                    <td>${row.col}</td>
                    <td>${row.expt}</td>
                    <td>${row.entryId}</td>
                    <td>${row.name}</td>
                    <td>${row.isCheck ? '<span style="color: #2ecc71;"><i class="fas fa-check"></i></span>' : '-'}</td>
                    ${row.yield ? `<td style="color: var(--secondary); font-weight: 700;">${row.yield}</td>` : ''}
                `;
                fbTableBody.appendChild(tr);
            });
        }

        function renderHeatmap(matrix, fieldBook, locIdx) {
            if (!heatmapWrapper) return;
            heatmapWrapper.innerHTML = '';
            const rows = matrix.length;
            const cols = matrix[0].length;
            heatmapWrapper.style.gridTemplateColumns = `repeat(${cols}, 50px)`;

            const locName = currentGenerator.locationNames[locIdx] || `Loc ${locIdx + 1}`;
            const locData = fieldBook.filter(f => f.location === locName);
            const yields = locData.map(f => parseFloat(f.yield)).filter(y => !isNaN(y));

            let min = 0, max = 100;
            if (yields.length > 0) {
                min = Math.min(...yields);
                max = Math.max(...yields);
            }

            for (let r = rows - 1; r >= 0; r--) {
                for (let c = 0; c < cols; c++) {
                    const fbEntry = locData.find(f => f.row === r + 1 && f.col === c + 1);
                    const cell = document.createElement('div');
                    cell.className = 'cell';

                    if (fbEntry && fbEntry.yield) {
                        const val = parseFloat(fbEntry.yield);
                        const ratio = (val - min) / (max - min || 1);
                        cell.style.background = `rgba(244, 63, 94, ${0.1 + ratio * 0.9})`;
                        cell.style.color = ratio > 0.5 ? 'white' : 'var(--text-dim)';
                        cell.innerHTML = `<span style="font-size: 0.6rem;">${val.toFixed(1)}</span>`;
                    } else {
                        cell.style.background = '#ccc';
                    }
                    heatmapWrapper.appendChild(cell);
                }
            }
        }

        // Tabs
        document.querySelectorAll('.tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                tab.classList.add('active');
                if (tab.dataset.tab && document.getElementById(tab.dataset.tab)) {
                    document.getElementById(tab.dataset.tab).classList.add('active');
                }
            });
        });

        if (exportBtn) {
            exportBtn.addEventListener('click', () => {
                if (!currentGenerator) return;
                const headers = ["ID", "Plot", "Location", "Row", "Col", "Expt", "Entry", "Name", "Type"];
                if (currentGenerator.fieldBook[0].yield) headers.push("Yield");

                const csv = [headers.join(","), ...currentGenerator.fieldBook.map(r => {
                    const row = [r.id, r.plot, r.location, r.row, r.col, r.expt, r.entryId, r.name, r.type];
                    if (r.yield) row.push(r.yield);
                    return row.join(",");
                })].join("\n");

                const blob = new Blob([csv], { type: 'text/csv' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `multiple_diagonal_${Date.now()}.csv`;
                a.click();
            });
        }

        const dlExcelBtn = document.getElementById('download-excel-btn');
        if (dlExcelBtn) {
            dlExcelBtn.addEventListener('click', () => {
                if (exportBtn) exportBtn.click();
            });
        }

    } catch (e) {
        console.error("Diagonal Multiple App Init Error: ", e);
    }
});
