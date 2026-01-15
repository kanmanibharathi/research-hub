/**
 * Diagonal Arrangement Design Generator
 * Implements SUDC (Single Un-replicated Diagonal Checks) algorithm
 * Supports variable check density and automatic dimension suggestions.
 */
'use strict';

class DiagonalGenerator {
    constructor(rows, cols, lines, checkNames, locations = 1, planter = 'serpentine', seed = null, checkModulus = 8) {
        this.rows = parseInt(rows);
        this.cols = parseInt(cols);
        this.linesCount = parseInt(lines);
        this.checkNames = Array.isArray(checkNames) ? checkNames : [checkNames];
        this.locations = parseInt(locations);
        this.planter = planter;
        this.checkModulus = parseInt(checkModulus);

        // Robust seed handling
        this.seed = (seed !== null && seed !== undefined && !isNaN(seed)) ? seed : Math.floor(Math.random() * 1000000);

        this.fieldBook = [];
        this.matrices = []; // One matrix per location
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

    generate(startPlot = 101, experimentName = "Expt1") {
        let currentSeed = this.seed;
        this.fieldBook = [];
        this.matrices = [];
        let globalId = 1;

        for (let l = 1; l <= this.locations; l++) {
            const random = this.mulberry32(currentSeed++);
            const matrix = Array.from({ length: this.rows }, () => Array(this.cols).fill(null));

            // 1. Place checks in diagonal pattern
            // Logic: (r + c) % modulus == 0
            let checkCount = 0;
            for (let r = 0; r < this.rows; r++) {
                for (let c = 0; c < this.cols; c++) {
                    if ((r + c) % this.checkModulus === 0) {
                        const checkIdx = Math.floor(random() * this.checkNames.length);
                        matrix[r][c] = {
                            type: 'Check',
                            name: this.checkNames[checkIdx],
                            id: checkIdx + 1,
                            value: null
                        };
                        checkCount++;
                    }
                }
            }

            // 2. Fill remaining with Lines
            const freePlots = [];
            for (let r = 0; r < this.rows; r++) {
                for (let c = 0; c < this.cols; c++) {
                    if (!matrix[r][c]) freePlots.push({ r, c });
                }
            }

            this.shuffle(freePlots, random);
            let linesAssigned = 0;
            let fillersCount = 0;

            freePlots.forEach(pos => {
                if (linesAssigned < this.linesCount) {
                    matrix[pos.r][pos.c] = {
                        type: 'Line',
                        name: `G-${linesAssigned + 1}`,
                        id: this.checkNames.length + linesAssigned + 1,
                        value: null
                    };
                    linesAssigned++;
                } else {
                    matrix[pos.r][pos.c] = {
                        type: 'Filler',
                        name: 'Filler',
                        id: 0,
                        value: null
                    };
                    fillersCount++;
                }
            });

            this.matrices.push(matrix);

            // 3. Flatten to Field Book
            let plotNum = startPlot + (l - 1) * 1000;
            for (let r = 0; r < this.rows; r++) {
                let colsIter = Array.from({ length: this.cols }, (_, i) => i);
                if (this.planter === 'serpentine' && r % 2 !== 0) {
                    colsIter.reverse();
                }

                colsIter.forEach(c => {
                    const item = matrix[r][c];
                    this.fieldBook.push({
                        id: globalId++,
                        plot: plotNum++,
                        location: `Loc ${l}`,
                        row: r + 1,
                        col: c + 1,
                        entryId: item.id,
                        type: item.type,
                        name: item.name,
                        yield: null
                    });
                });
            }

            this.info = {
                checkPct: (((checkCount) / (this.rows * this.cols)) * 100).toFixed(1) + '%',
                totalPlots: this.rows * this.cols * this.locations,
                actualChecks: checkCount,
                fillers: fillersCount,
                seed: this.seed
            };
        }

        return this.fieldBook;
    }

    simulate(min = 80, max = 150, spatialFactor = 0.4) {
        let currentSeed = this.seed + 555;
        const random = this.mulberry32(currentSeed);

        this.matrices.forEach((matrix, lIdx) => {
            const rowTrends = Array.from({ length: this.rows }, () => (random() - 0.5) * spatialFactor * (max - min));
            const colTrends = Array.from({ length: this.cols }, () => (random() - 0.5) * spatialFactor * (max - min));

            for (let r = 0; r < this.rows; r++) {
                for (let c = 0; c < this.cols; c++) {
                    const noise = (random() - 0.5) * (1 - spatialFactor) * (max - min);
                    const base = (min + max) / 2;
                    const val = base + rowTrends[r] + colTrends[c] + noise;
                    if (matrix[r][c]) matrix[r][c].value = val.toFixed(2);

                    const fbEntry = this.fieldBook.find(f => f.location === `Loc ${lIdx + 1}` && f.row === r + 1 && f.col === c + 1);
                    if (fbEntry) fbEntry.yield = val.toFixed(2);
                }
            }
        });
        return this.fieldBook;
    }
}

// UI Controller
document.addEventListener('DOMContentLoaded', () => {
    try {
        const generateBtn = document.getElementById('generate-btn');
        const simulateBtn = document.getElementById('simulate-btn');
        const exportBtn = document.getElementById('export-btn');
        const downloadExcelBtn = document.getElementById('download-excel-btn');
        const resultsSection = document.getElementById('results');
        const fbTableBody = document.querySelector('#field-book-table tbody');
        const matrixWrapper = document.getElementById('matrix-wrapper');
        const heatmapContainer = document.getElementById('heatmap-container');
        const heatmapTrigger = document.getElementById('heatmap-trigger');
        const tabs = document.querySelectorAll('.tab');

        // New Controls
        const resultLayoutControls = document.getElementById('layout-controls');
        const checkPctSelect = document.getElementById('result-check-pct');
        const dimensionsSelect = document.getElementById('result-dimensions');
        const locationSelect = document.getElementById('result-location');

        if (!generateBtn) return;

        let currentGenerator = null;

        // ... existing functions ...

        if (downloadExcelBtn) {
            downloadExcelBtn.addEventListener('click', () => {
                if (!currentGenerator || !currentGenerator.fieldBook.length) {
                    alert('Please generate a design first.');
                    return;
                }

                // CSV Header
                let csvContent = "data:text/csv;charset=utf-8,";
                csvContent += "Plot,Location,Row,Col,Entry,Type,Treatment Name,Yield\n";

                // CSV Rows
                currentGenerator.fieldBook.forEach(row => {
                    let r = [
                        row.plot,
                        row.location,
                        row.row,
                        row.col,
                        row.entryId,
                        row.type,
                        `"${row.name}"`, // Quote name to handle potential commas
                        row.yield || ''
                    ];
                    csvContent += r.join(",") + "\n";
                });

                // Trigger Download
                const encodedUri = encodeURI(csvContent);
                const link = document.createElement("a");
                link.setAttribute("href", encodedUri);
                // Naming file .csv effectively makes it open in Excel by default
                link.setAttribute("download", `diagonal_field_book_${Date.now()}.csv`);
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            });
        }

        // Auto-Calc Logic
        function calculateDimensionOptions(lines, modulus) {
            // Rough logic: 
            // Total Capacity >= Lines + Checks
            // Checks ~= Capacity / Modulus
            // Capacity >= Lines + Capacity/Modulus
            // Capacity (1 - 1/M) >= Lines
            // Capacity >= Lines / (1 - 1/M)

            const minCapacity = Math.ceil(lines / (1 - 1.0 / modulus));
            // Generate options with roughly minCapacity to minCapacity + 10% fillers
            const searchMax = Math.ceil(minCapacity * 1.2);

            const options = [];

            // Search ideal rectangles
            for (let area = minCapacity; area <= searchMax; area++) {
                // Find factors
                for (let r = 2; r <= Math.sqrt(area); r++) {
                    if (area % r === 0) {
                        const c = area / r;
                        // Check aspect ratio (not too thin)
                        const ratio = c / r;
                        if (ratio <= 6) { // Allow up to 1:6 ratio (e.g. 5x30)
                            // Accurate check count
                            let checks = 0;
                            for (let i = 0; i < r; i++) {
                                for (let j = 0; j < c; j++) {
                                    if ((i + j) % modulus === 0) checks++;
                                }
                            }
                            const fillers = area - lines - checks;
                            if (fillers >= 0) {
                                options.push({ r, c, checks, fillers, area });
                            }
                        }
                    }
                }
            }

            // Sort by fewest fillers, then by squareness
            options.sort((a, b) => {
                if (a.fillers !== b.fillers) return a.fillers - b.fillers;
                const ratioA = Math.abs(1 - a.c / a.r);
                const ratioB = Math.abs(1 - b.c / b.r);
                return ratioA - ratioB;
            });

            // Unique by string representation to avoid exact duplicates
            const unique = [];
            const seen = new Set();
            options.forEach(opt => {
                const key = `${opt.r}x${opt.c}`; // Keep orientation
                if (!seen.has(key)) {
                    seen.add(key);
                    unique.push(opt);
                }
            });

            return unique.slice(0, 10); // Return top 10
        }

        function populateDimensions() {
            const linesInput = document.getElementById('lines-input');
            const lines = parseInt(linesInput.value);
            let modulus = 8;
            if (checkPctSelect) modulus = parseInt(checkPctSelect.value);

            if (!lines) return;

            const options = calculateDimensionOptions(lines, modulus);

            if (dimensionsSelect) {
                dimensionsSelect.innerHTML = '';
                options.forEach(opt => {
                    const option = document.createElement('option');
                    // Format: "12 x 54 (Checks: 64, Fillers: 2)"
                    option.value = `${opt.r},${opt.c}`;
                    option.textContent = `${opt.r} x ${opt.c} (Checks: ${opt.checks}, Fillers: ${opt.fillers})`;
                    dimensionsSelect.appendChild(option);
                });

                // Trigger map update if options exist
                if (options.length > 0) {
                    runGeneration();
                }
            }
        }

        function populateLocationSelect(cnt) {
            if (!locationSelect) return;
            const currentVal = locationSelect.value;
            locationSelect.innerHTML = '';
            for (let i = 0; i < cnt; i++) {
                const opt = document.createElement('option');
                opt.value = i.toString();
                opt.textContent = `Loc ${i + 1}`;
                locationSelect.appendChild(opt);
            }
            // Try to keep previous selection, else 0
            if (currentVal && parseInt(currentVal) < cnt) {
                locationSelect.value = currentVal;
            } else {
                locationSelect.value = "0";
            }
        }

        function runGeneration() {
            try {
                const linesInput = document.getElementById('lines-input');
                const checkNameInput = document.getElementById('check-names');
                const locsInput = document.getElementById('l-input');
                const planterInput = document.getElementById('planter-input');
                const startPlotInput = document.getElementById('plot-start');
                const exptNameInput = document.getElementById('expt-name');
                const seedInput = document.getElementById('seed-input');

                // Get Dimensions from selection
                if (!dimensionsSelect || !dimensionsSelect.value) return;
                const [rows, cols] = dimensionsSelect.value.split(',').map(Number);

                // Get Modulus
                let modulus = 8;
                if (checkPctSelect) modulus = parseInt(checkPctSelect.value);

                const lines = linesInput.value;
                const checkNames = checkNameInput.value.split(',').map(s => s.trim());
                const l = locsInput.value ? parseInt(locsInput.value) : 1;
                const planter = planterInput.value;
                const startPlot = parseInt(startPlotInput.value);
                const name = exptNameInput.value;
                const seed = seedInput.value ? parseInt(seedInput.value) : null;

                const generator = new DiagonalGenerator(rows, cols, lines, checkNames, l, planter, seed, modulus);
                const data = generator.generate(startPlot, name);
                currentGenerator = generator;

                // Update Info
                if (document.getElementById('info-check-pct')) document.getElementById('info-check-pct').textContent = generator.info.checkPct;
                if (document.getElementById('info-total-plots')) document.getElementById('info-total-plots').textContent = generator.info.totalPlots;
                if (document.getElementById('info-fillers')) document.getElementById('info-fillers').textContent = generator.info.fillers;

                populateLocationSelect(generator.matrices.length);
                renderMatrix(generator.matrices[locationSelect ? parseInt(locationSelect.value) : 0]);
                renderTable(data);

                if (simulateBtn) simulateBtn.style.display = 'block';

            } catch (e) {
                console.error(e);
            }
        }

        generateBtn.addEventListener('click', () => {
            if (!window.requireAuth || !window.requireAuth()) {
                console.warn("Auth required");
                return;
            }
            // 1. Show results section
            if (resultsSection) {
                resultsSection.style.display = 'block';
                if (resultLayoutControls) resultLayoutControls.style.display = 'block';
                resultsSection.scrollIntoView({ behavior: 'smooth' });
            }
            // 2. Populate dimensions (which also triggers generation)
            populateDimensions();
        });

        if (checkPctSelect) {
            checkPctSelect.addEventListener('change', () => {
                populateDimensions();
            });
        }

        // Handle dimension change
        if (dimensionsSelect) {
            dimensionsSelect.addEventListener('change', () => {
                runGeneration();
            });
        }

        // Handle Location Change
        if (locationSelect) {
            locationSelect.addEventListener('change', function () {
                if (currentGenerator && currentGenerator.matrices) {
                    const locIdx = parseInt(this.value);
                    if (currentGenerator.matrices[locIdx]) {
                        renderMatrix(currentGenerator.matrices[locIdx]);
                    }
                }
            });
        }

        // ... Existing Render Helpers ...
        function renderMatrix(matrix) {
            if (!matrixWrapper) return;
            matrixWrapper.innerHTML = '';
            const rows = matrix.length;
            const cols = matrix[0].length;
            matrixWrapper.style.gridTemplateColumns = `repeat(${cols}, 45px)`;

            for (let r = rows - 1; r >= 0; r--) {
                for (let c = 0; c < cols; c++) {
                    const item = matrix[r][c];
                    const cell = document.createElement('div');
                    cell.className = `cell ${item.type.toLowerCase()}`;
                    if (item.type === 'Check') cell.classList.add('check');
                    else if (item.type === 'Filler') cell.classList.add('filler');
                    else cell.classList.add('line'); // Default

                    cell.innerHTML = `<span>${item.id || '-'}</span><span style="font-size: 8px; opacity: 0.6;">${item.type[0]}</span>`;
                    matrixWrapper.appendChild(cell);
                }
            }
        }

        // Keep existing Simulaton/Heatmap/Export logic
        if (simulateBtn) {
            simulateBtn.addEventListener('click', () => {
                if (!currentGenerator) return;
                const data = currentGenerator.simulate();
                renderTable(data);
                if (locationSelect) {
                    renderHeatmap(currentGenerator.matrices[parseInt(locationSelect.value)]);
                } else {
                    renderHeatmap(currentGenerator.matrices[0]);
                }
                if (heatmapTrigger) heatmapTrigger.style.display = 'block';
            });
        }

        function renderHeatmap(matrix) {
            if (!heatmapContainer) return;
            heatmapContainer.innerHTML = '';
            const grid = document.createElement('div');
            grid.className = 'matrix-grid';
            const rows = matrix.length;
            const cols = matrix[0].length;
            grid.style.gridTemplateColumns = `repeat(${cols}, 45px)`;

            const values = matrix.flat().map(i => parseFloat(i.value));
            const validValues = values.filter(v => !isNaN(v));

            let min = 0, max = 100;
            if (validValues.length > 0) {
                min = Math.min(...validValues);
                max = Math.max(...validValues);
            }

            for (let r = rows - 1; r >= 0; r--) {
                for (let c = 0; c < cols; c++) {
                    const item = matrix[r][c];
                    const val = parseFloat(item.value);
                    const cell = document.createElement('div');
                    cell.className = 'cell';

                    if (!isNaN(val)) {
                        const ratio = (val - min) / (max - min || 1);
                        cell.style.backgroundColor = `rgba(0, 166, 81, ${0.1 + ratio * 0.9})`;
                        cell.style.color = ratio > 0.5 ? 'white' : 'var(--text-dim)';
                        cell.style.border = '1px solid rgba(255,255,255,0.1)';
                        cell.innerHTML = `<span style="font-size: 0.6rem;">${val.toFixed(1)}</span>`;
                    } else {
                        cell.style.backgroundColor = '#ccc';
                    }
                    grid.appendChild(cell);
                }
            }
            heatmapContainer.appendChild(grid);
        }

        function renderTable(data) {
            if (!fbTableBody) return;
            fbTableBody.innerHTML = '';
            data.forEach(row => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${row.plot}</td>
                    <td>${Number(row.location.split(' ')[1])}</td>
                    <td>${row.row}</td>
                    <td>${row.col}</td>
                    <td>${row.entryId}</td>
                    <td>${row.type}</td>
                    <td><strong>${row.name}</strong></td>
                    ${row.yield ? `<td style="color: var(--secondary); font-weight: 700;">${row.yield}</td>` : ''}
                `;
                fbTableBody.appendChild(tr);
            });
        }

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

        if (exportBtn) {
            exportBtn.addEventListener('click', () => {
                if (!currentGenerator) return;
                const headers = ["Plot", "Location", "Row", "Col", "EntryID", "Type", "Name"];
                if (currentGenerator.fieldBook[0].yield) headers.push("Yield");
                const csv = [headers.join(","), ...currentGenerator.fieldBook.map(r => {
                    const row = [r.plot, r.location, r.row, r.col, r.entryId, r.type, r.name];
                    if (r.yield) row.push(r.yield);
                    return row.join(",");
                })].join("\n");
                const blob = new Blob([csv], { type: 'text/csv' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `diagonal_design_${Date.now()}.csv`;
                a.click();
            });
        }

        if (downloadMapBtn) {
            downloadMapBtn.addEventListener('click', () => {
                const container = document.getElementById('matrix-wrapper');
                if (!container || typeof html2canvas === 'undefined') return;
                html2canvas(container, {
                    backgroundColor: null,
                    scale: 3
                }).then(canvas => {
                    const a = document.createElement('a');
                    a.download = `diagonal_map_${Date.now()}.png`;
                    a.href = canvas.toDataURL("image/png");
                    a.click();
                });
            });
        }

    } catch (e) {
        console.error("Diagonal App Init Error: ", e);
    }
});
