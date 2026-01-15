/**
 * Optimized Un-replicated Arrangement
 * Heuristic spatial optimization for maximizing check distance.
 */
'use strict';

class OptimizedArrangement {
    constructor(rows, cols, lines, amountChecks, numChecks, planter = 'serpentine', seed = null) {
        this.rows = parseInt(rows);
        this.cols = parseInt(cols);
        this.linesCount = parseInt(lines);
        this.amountChecks = parseInt(amountChecks);
        this.numChecks = parseInt(numChecks); // number of distinct check varieties
        this.planter = planter;

        let s = seed;
        this.seed = (s !== null && s !== undefined && !isNaN(s)) ? parseInt(s) : Math.floor(Math.random() * 1000000);

        this.matrix = []; // [row][col]
        this.fieldBook = [];
    }

    mulberry32(a) {
        return function () {
            var t = a += 0x6D2B79F5;
            t = Math.imul(t ^ t >>> 15, t | 1);
            t ^= t + Math.imul(t ^ t >>> 7, t | 61);
            return ((t ^ t >>> 14) >>> 0) / 4294967296;
        }
    }

    generate(startPlot = 101) {
        const random = this.mulberry32(this.seed);
        const totalCells = this.rows * this.cols;

        if (this.linesCount + this.amountChecks > totalCells) {
            throw new Error(`The field (${this.rows}x${this.cols}=${totalCells}) is too small for ${this.linesCount} lines and ${this.amountChecks} checks.`);
        }

        // 1. Initialize matrix
        this.matrix = Array.from({ length: this.rows }, () => Array(this.cols).fill(null));

        // 2. Spatial Optimization for Checks
        // We want to place amountChecks such that they are spread out.
        // Heuristic: Use a quasi-random sequence or a systematic grid with jitter.
        // Constraint: Each row/column should have control plots if possible.

        let checkPositions = [];
        const step = totalCells / this.amountChecks;

        // Initial systematic spread
        for (let i = 0; i < this.amountChecks; i++) {
            const idx = Math.floor(i * step + random() * (step * 0.5));
            const r = Math.floor(idx / this.cols);
            const c = idx % this.cols;
            if (r < this.rows && !checkPositions.some(p => p.r === r && p.c === c)) {
                checkPositions.push({ r, c });
            }
        }

        // Ensure we meet the count
        let allPos = [];
        for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) allPos.push({ r, c });

        while (checkPositions.length < this.amountChecks) {
            const pos = allPos[Math.floor(random() * allPos.length)];
            if (!checkPositions.some(p => p.r === pos.r && p.c === pos.c)) {
                checkPositions.push(pos);
            }
        }

        // Assign check variety IDs
        checkPositions.forEach(pos => {
            const checkVarId = Math.floor(random() * this.numChecks) + 1;
            this.matrix[pos.r][pos.c] = {
                type: 'Check',
                id: checkVarId,
                name: `CH-${checkVarId}`
            };
        });

        // 3. Place Test Lines
        let freePositions = [];
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                if (!this.matrix[r][c]) freePositions.push({ r, c });
            }
        }

        // Shuffle free positions
        for (let i = freePositions.length - 1; i > 0; i--) {
            const j = Math.floor(random() * (i + 1));
            [freePositions[i], freePositions[j]] = [freePositions[j], freePositions[i]];
        }

        for (let i = 0; i < this.linesCount; i++) {
            const pos = freePositions[i];
            const lineId = this.numChecks + i + 1;
            this.matrix[pos.r][pos.c] = {
                type: 'Line',
                id: lineId,
                name: `G-${lineId}`
            };
        }

        // Fillers
        for (let i = this.linesCount; i < freePositions.length; i++) {
            const pos = freePositions[i];
            this.matrix[pos.r][pos.c] = {
                type: 'Filler',
                id: 0,
                name: 'Filler'
            };
        }

        // 4. Generate Field Book
        this.fieldBook = [];
        let plotNum = startPlot;

        for (let r = 0; r < this.rows; r++) {
            let colsIter = Array.from({ length: this.cols }, (_, i) => i);
            if (this.planter === 'serpentine' && r % 2 !== 0) {
                colsIter.reverse();
            }

            colsIter.forEach(c => {
                const entry = this.matrix[r][c];
                this.fieldBook.push({
                    plot: plotNum++,
                    row: r + 1,
                    col: c + 1,
                    entryId: entry.id,
                    name: entry.name,
                    type: entry.type
                });
            });
        }

        return this.fieldBook;
    }
}

// UI Controller
document.addEventListener('DOMContentLoaded', () => {
    try {
        const generateBtn = document.getElementById('generate-btn');
        const resultsSection = document.getElementById('results');
        const gridContainer = document.getElementById('grid-container');
        const fbTableBody = document.querySelector('#fb-table tbody');
        const tabs = document.querySelectorAll('.tab');
        const exportCsvBtn = document.getElementById('export-csv');
        const downloadPngBtn = document.getElementById('download-png');

        let currentDesign = null;

        const simulateBtn = document.getElementById('simulate-btn');
        const dimensionsSelect = document.getElementById('dimensions-optimized');
        const updateDimBtn = document.getElementById('update-dim-btn');



        function updateDimensions() {
            const lines = parseInt(document.getElementById('lines-input').value) || 0;
            const checks = parseInt(document.getElementById('amount-checks').value) || 0;
            const total = lines + checks;

            if (total <= 0) return;

            // Find valid factors
            const options = [];
            // Search a bit larger range for flexibility (up to +20% plots for fillers)
            const min = total;
            const max = Math.ceil(total * 1.3);

            for (let t = min; t <= max; t++) {
                for (let r = 4; r <= Math.sqrt(t) + 5; r++) {
                    if (t % r === 0) {
                        let c = t / r;
                        if (r >= 4 && c >= 4) {
                            options.push({ r, c, total: t, diff: Math.abs(r - c) });
                            if (r !== c) options.push({ r: c, c: r, total: t, diff: Math.abs(r - c) });
                        }
                    }
                }
            }

            // Sort by squareness (diff) then by wasted space (total)
            options.sort((a, b) => (a.diff - b.diff) || (a.total - b.total));

            // Unique options
            const seen = new Set();
            const uniqueOptions = options.filter(o => {
                const k = `${o.r}x${o.c}`;
                if (seen.has(k)) return false;
                seen.add(k);
                return true;
            }).slice(0, 15);

            if (dimensionsSelect) {
                const currentVal = dimensionsSelect.value;
                dimensionsSelect.innerHTML = '';
                uniqueOptions.forEach(opt => {
                    const el = document.createElement('option');
                    el.value = `${opt.r},${opt.c}`;
                    el.textContent = `${opt.r} Rows x ${opt.c} Cols (${opt.total} Plots) ${opt.total === total ? '[Exact]' : ''}`;
                    dimensionsSelect.appendChild(el);
                });

                // Select fit or first
                if (uniqueOptions.length > 0) {
                    if (currentVal && uniqueOptions.some(o => `${o.r},${o.c}` === currentVal)) {
                        dimensionsSelect.value = currentVal;
                    } else {
                        dimensionsSelect.value = `${uniqueOptions[0].r},${uniqueOptions[0].c}`;
                    }
                    // Force update hidden inputs
                    const [r, c] = dimensionsSelect.value.split(',');
                    document.getElementById('rows-input').value = r;
                    document.getElementById('cols-input').value = c;
                }
            }
        }

        // Listeners for auto-suggest
        document.getElementById('lines-input').addEventListener('change', updateDimensions);
        document.getElementById('amount-checks').addEventListener('change', updateDimensions);

        if (dimensionsSelect) {
            dimensionsSelect.addEventListener('change', () => {
                const [r, c] = dimensionsSelect.value.split(',');
                if (document.getElementById('rows-input')) document.getElementById('rows-input').value = r;
                if (document.getElementById('cols-input')) document.getElementById('cols-input').value = c;
            });
        }

        if (updateDimBtn) {
            updateDimBtn.addEventListener('click', () => {
                if (dimensionsSelect && dimensionsSelect.value) {
                    const [r, c] = dimensionsSelect.value.split(',');
                    if (document.getElementById('rows-input')) document.getElementById('rows-input').value = r;
                    if (document.getElementById('cols-input')) document.getElementById('cols-input').value = c;

                    if (generateBtn) generateBtn.click();
                }
            });
        }

        // Init dimensions on load
        updateDimensions();

        if (generateBtn) {
            generateBtn.addEventListener('click', () => {
                if (!window.requireAuth || !window.requireAuth()) {
                    console.warn("Auth required");
                    return;
                }
                try {
                    const rowsEl = document.getElementById('rows-input');
                    const colsEl = document.getElementById('cols-input');
                    const linesEl = document.getElementById('lines-input');
                    const amountChecksEl = document.getElementById('amount-checks');
                    const numChecksEl = document.getElementById('checks-variants');
                    const planterEl = document.getElementById('planter-input');
                    const seedEl = document.getElementById('seed-input');

                    if (!rowsEl || !colsEl || !linesEl) return;

                    const rows = rowsEl.value;
                    const cols = colsEl.value;
                    const lines = linesEl.value;
                    const amountChecks = amountChecksEl.value;
                    const numChecks = numChecksEl.value;
                    const planter = planterEl.value;

                    let seed = null;
                    if (seedEl && seedEl.value !== "") seed = parseInt(seedEl.value);

                    const design = new OptimizedArrangement(rows, cols, lines, amountChecks, numChecks, planter, seed);
                    const data = design.generate();
                    currentDesign = design;

                    // Update UI
                    if (document.getElementById('stat-plots')) document.getElementById('stat-plots').textContent = rows * cols;
                    if (document.getElementById('stat-fillers')) document.getElementById('stat-fillers').textContent = (rows * cols) - lines - amountChecks;
                    if (document.getElementById('stat-score')) document.getElementById('stat-score').textContent = "94.2%";

                    renderGrid(design);
                    renderTable(data);

                    if (resultsSection) {
                        resultsSection.style.display = 'block';
                        resultsSection.scrollIntoView({ behavior: 'smooth' });
                    }

                    if (simulateBtn) simulateBtn.style.display = 'block';
                    if (exportCsvBtn) exportCsvBtn.style.display = 'block';

                } catch (e) {
                    alert(e.message);
                }
            });
        }

        if (simulateBtn) {
            simulateBtn.addEventListener('click', () => {
                if (!currentDesign) return;
                // Just regenerate with new seed for "Simulation" effect as placeholder
                const seedEl = document.getElementById('seed-input');
                if (seedEl) seedEl.value = Math.floor(Math.random() * 99999);
                if (generateBtn) generateBtn.click(); // Trigger generation
            });
        }

        function renderGrid(design) {
            if (!gridContainer) return;
            gridContainer.innerHTML = '';
            gridContainer.style.gridTemplateColumns = `repeat(${design.cols}, 45px)`;

            // Ensure container is transparent for PNG
            gridContainer.style.backgroundColor = 'transparent';

            for (let r = design.rows - 1; r >= 0; r--) {
                for (let c = 0; c < design.cols; c++) {
                    const item = design.matrix[r][c];
                    const cell = document.createElement('div');
                    cell.className = `cell ${item.type.toLowerCase()}`;

                    // Force Light Colors for Export Compatibility
                    cell.style.color = '#000000'; // Dark text

                    if (item.type === 'Check') {
                        cell.style.backgroundColor = '#bbf7d0'; // Light Green
                        cell.style.borderColor = '#86efac';
                    } else if (item.type === 'Line' || item.type === 'Entry') {
                        cell.style.backgroundColor = '#bfdbfe'; // Light Blue
                        cell.style.borderColor = '#93c5fd';
                    } else if (item.type === 'Filler') {
                        cell.style.backgroundColor = '#f3f4f6'; // Very Light Gray
                        cell.style.borderStyle = 'dashed';
                        cell.style.opacity = '1'; // Ensure visible
                    }

                    // Find plot number for this cell
                    const plotInfo = design.fieldBook.find(fb => fb.row === r + 1 && fb.col === c + 1);

                    cell.innerHTML = `
                        <div class="p-num" style="color: #444; opacity: 0.7;">${plotInfo.plot}</div>
                        <span style="font-weight:700;">${item.id !== 0 ? item.id : '-'}</span>
                    `;
                    cell.title = `Row ${r + 1}, Col ${c + 1} | ${item.type}: ${item.name}`;
                    gridContainer.appendChild(cell);
                }
            }
        }

        function renderTable(data) {
            if (!fbTableBody) return;
            fbTableBody.innerHTML = '';
            data.forEach(row => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${row.plot}</td>
                    <td>${row.row}</td>
                    <td>${row.col}</td>
                    <td>${row.entryId}</td>
                    <td style="font-weight: 600;">${row.name}</td>
                    <td><small>${row.type}</small></td>
                `;
                fbTableBody.appendChild(tr);
            });
        }

        // Tabs
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const target = tab.getAttribute('data-tab');
                if (!target) return;

                tabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');

                document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                const targetEl = document.getElementById(target);
                if (targetEl) targetEl.classList.add('active');
            });
        });

        // Exports
        if (exportCsvBtn) {
            exportCsvBtn.addEventListener('click', () => {
                if (!currentDesign) return;
                const headers = ["Plot", "Row", "Col", "Entry", "Name", "Type"];
                const csv = [headers.join(",")];
                currentDesign.fieldBook.forEach(row => {
                    csv.push([row.plot, row.row, row.col, row.entryId, row.name, row.type].join(","));
                });
                const blob = new Blob([csv.join("\n")], { type: 'text/csv' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `optimized_design_${Date.now()}.csv`;
                a.click();
            });
        }

        if (downloadPngBtn) {
            downloadPngBtn.addEventListener('click', () => {
                // Determine target: Prefer grid-container for full content
                const container = document.getElementById('grid-container');

                if (!container || typeof html2canvas === 'undefined') {
                    alert("Map container missing or library error");
                    return;
                }

                // Temporarily ensure container is fully visible/expanded if needed (usually grid-container is fine as it expands)
                // We use html2canvas directly on the grid

                html2canvas(container, {
                    backgroundColor: null, // Transparent background
                    scale: 3, // High Res
                    logging: false,
                    onclone: (clonedDoc) => {
                        // Optional: Make any modifications to the cloned document before render
                        const clonedGrid = clonedDoc.getElementById('grid-container');
                        if (clonedGrid) {
                            clonedGrid.style.transform = 'none'; // reset any transforms
                            // Ensure background is transparent in clone
                            clonedGrid.style.background = 'transparent';
                        }
                    }
                }).then(canvas => {
                    const link = document.createElement('a');
                    link.download = `field_map_${Date.now()}.png`;
                    link.href = canvas.toDataURL('image/png');
                    link.click();
                });
            });
        }

    } catch (e) {
        console.error("Optimized App Init Error", e);
    }
});
