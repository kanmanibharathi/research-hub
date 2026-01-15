/**
 * Augmented Randomized Complete Block Design (ARCBD) Design Generator
 * Implementation based on FielDHub ARCBD logic.
 */
'use strict';

class ARCBDGenerator {
    constructor() {
        this.initEventListeners();
        this.mulberry = null;
        this.currentDesign = null;
        this.fieldBookData = null;
    }

    initEventListeners() {
        const generateBtn = document.getElementById('generate-btn');
        const exportBtn = document.getElementById('export-btn');
        const importRadios = document.getElementsByName('import-entries');
        const viewLocSelect = document.getElementById('view-location-select');

        // Toggle File Input Visibility
        if (importRadios) {
            importRadios.forEach(radio => {
                radio.addEventListener('change', (e) => {
                    const fileInput = document.getElementById('file-input');
                    if (fileInput) {
                        fileInput.style.display = (e.target.value === 'yes') ? 'block' : 'none';
                    }
                });
            });
        }

        // View Location Change
        if (viewLocSelect) {
            viewLocSelect.addEventListener('change', (e) => {
                this.render(e.target.value);
            });
        }

        if (generateBtn) generateBtn.addEventListener('click', () => {
            if (!window.requireAuth || !window.requireAuth()) {
                console.warn("Auth required");
                return;
            }
            try {
                this.generate(false); // Normal generation
            } catch (e) {
                console.error(e);
                alert("Error generating design: " + e.message);
            }
        });

        const simulateBtn = document.getElementById('simulate-btn');
        if (simulateBtn) simulateBtn.addEventListener('click', () => {
            try {
                this.generate(true); // Simulation mode
            } catch (e) {
                console.error(e);
                alert("Error simulating design: " + e.message);
            }
        });

        if (exportBtn) exportBtn.addEventListener('click', () => this.exportCSV());

        // Listeners for Inputs (Optional auto-calc logic check, keeping basic validators or no-ops)
        // Since we are manual mode, we might just validate or do nothing.

        const tabs = document.querySelectorAll('.tab');
        if (tabs) {
            tabs.forEach(tab => {
                tab.addEventListener('click', () => {
                    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
                    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                    tab.classList.add('active');
                    const targetId = tab.getAttribute('data-tab');
                    const content = document.getElementById(targetId);
                    if (content) content.classList.add('active');
                });
            });
        }

        const dimsSelect = document.getElementById('dimensions-select');
        if (dimsSelect) {
            dimsSelect.addEventListener('change', () => this.render(this.currentDesign?.selectedLocName));
        }

        const dlMapBtn = document.getElementById('download-map-btn');
        if (dlMapBtn) {
            dlMapBtn.addEventListener('click', () => {
                const element = document.getElementById('map-container');
                if (!element) return;
                html2canvas(element, {
                    backgroundColor: null,
                    scale: 3,
                    useCORS: true,
                    logging: false
                }).then(canvas => {
                    const link = document.createElement('a');
                    link.download = 'ARCBD_Map.png';
                    link.href = canvas.toDataURL('image/png', 1.0);
                    link.click();
                });
            });
        }

        const dlExcelTableBtn = document.getElementById('download-excel-table-btn');
        if (dlExcelTableBtn) {
            dlExcelTableBtn.addEventListener('click', () => this.exportCSV());
        }
    }

    getFactors(n) {
        const factors = [];
        for (let i = 1; i <= Math.sqrt(n); i++) {
            if (n % i === 0) {
                factors.push({ r: i, c: n / i });
                if (i !== n / i) {
                    factors.push({ r: n / i, c: i });
                }
            }
        }
        // Sort by Rows ascending
        return factors.sort((a, b) => a.r - b.r);
    }

    // Mulberry32 PRNG
    mulberry32(a) {
        return function () {
            let t = a += 0x6D2B79F5;
            t = Math.imul(t ^ t >>> 15, t | 1);
            t ^= t + Math.imul(t ^ t >>> 7, t | 61);
            return ((t ^ t >>> 14) >>> 0) / 4294967296;
        }
    }

    shuffle(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(this.mulberry() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    }

    hasAdjacentChecks(array) {
        for (let i = 0; i < array.length - 1; i++) {
            if (array[i].type === 'Check' && array[i + 1].type === 'Check') {
                return true;
            }
        }
        return false;
    }

    // Helper for strict distance check (Chebyshev distance >= 2)
    // Ensures no horizontal, vertical, or diagonal adjacency
    farEnough(p1, p2) {
        return Math.max(Math.abs(p1.r - p2.r), Math.abs(p1.c - p2.c)) >= 2;
    }

    // Helper to generate dispersed positions
    generateCheckPositions(rows, cols, nChecks) {
        let positions = [];
        let attempts = 0;
        const maxAttempts = 5000;

        while (positions.length < nChecks && attempts < maxAttempts) {
            attempts++;
            const p = {
                r: Math.floor(this.mulberry() * rows),
                c: Math.floor(this.mulberry() * cols)
            };

            // Check against existing
            if (positions.every(q => this.farEnough(p, q))) {
                positions.push(p);
            }
        }

        // If failed, try resetting (simple retry logic handled by caller or fallback)
        if (positions.length < nChecks) return null;
        return positions;
    }

    calculateAutoDefaults() {
        const linesInput = document.getElementById('lines-input');
        const checksInput = document.getElementById('checks-input');
        const maxPlotsInput = document.getElementById('max-plots-input');

        if (!linesInput || !checksInput || !maxPlotsInput) return;

        const nT = parseInt(linesInput.value) || 0;
        const nC = parseInt(checksInput.value) || 0;

        if (nT === 0) return;

        // Dynamic Rule Implementation
        let target;
        if (nT <= 20) target = 9;
        else if (nT <= 50) target = 11;
        else if (nT <= 100) target = 14;
        else if (nT <= 200) target = 17;
        else target = 20;

        // Safety check
        if (target <= nC) target = nC + 2;

        // Set Max Plots Input
        maxPlotsInput.value = target;

        // Calculate and Log Blocks (optional for UI feedback, but computation happens in generate)
        // const blocks = Math.ceil(nT / (target - nC));
        // console.log(`Auto-calculated: MaxPlots=${target}, Blocks=${blocks}`);
    }

    generate(isSimulation = false) {
        const linesInput = document.getElementById('lines-input');
        const checksInput = document.getElementById('checks-input');
        const blocksInput = document.getElementById('blocks-input');
        const maxPlotsInput = document.getElementById('max-plots-input');
        const locationsInput = document.getElementById('locations-input');
        const plotInput = document.getElementById('plot-input');
        const planterInput = document.getElementById('planter-input');
        const seedInput = document.getElementById('seed-input');

        // New Inputs
        const importEntries = document.querySelector('input[name="import-entries"]:checked')?.value === 'yes';
        const fileInput = document.getElementById('file-input');
        const nExptInput = document.getElementById('nexpt-input');
        const randomizeInput = document.getElementById('randomize-input');
        const exptNameInput = document.getElementById('experiment-name');
        const locationNameInput = document.getElementById('location-name');

        if (!linesInput || !checksInput) return;

        const linesCount = parseInt(linesInput.value);
        const checksCount = parseInt(checksInput.value);
        const lCount = parseInt(locationsInput.value);
        const startPlot = parseInt(plotInput.value);
        const planter = planterInput ? planterInput.value : 'serpentine';
        const mode = 'manual'; // Default from hidden or implicit
        const nExpt = nExptInput ? parseInt(nExptInput.value) : 1;
        const randomize = randomizeInput ? randomizeInput.checked : true;
        const exptName = exptNameInput ? exptNameInput.value : 'Expt1';
        const baseLocName = locationNameInput ? locationNameInput.value : 'Loc';

        const rawSeed = seedInput.value;
        let seed = (rawSeed !== "" && rawSeed !== null) ? parseInt(rawSeed) : Math.floor(Math.random() * 999999);

        if (isNaN(seed)) seed = Math.floor(Math.random() * 999999);
        this.mulberry = this.mulberry32(seed);

        // Core Block Calculation Logic
        let bCount = 0;
        let maxPlots = 0;

        if (mode === 'auto') {
            const userMax = parseInt(maxPlotsInput.value);
            if (userMax <= checksCount) {
                throw new Error(`Max plots per block (${userMax}) must be greater than number of checks (${checksCount}).`);
            }
            const capacityPerBlock = userMax - checksCount;
            bCount = Math.ceil(linesCount / capacityPerBlock);
            maxPlots = userMax;
        } else {
            bCount = parseInt(blocksInput.value);
            if (bCount < 1) throw new Error("Number of blocks must be at least 1.");
            maxPlots = Math.ceil((linesCount + (checksCount * bCount)) / bCount);
        }

        // R-Script aligned calculations
        const allGenotypes = linesCount + (checksCount * bCount);
        const plotsPerBlock = Math.ceil(allGenotypes / bCount); // Match R's: base::ceiling(all_genotypes/b)
        // lines_per_plot in R seems to mean "test lines per block" (max capacity)
        const maxTestLinesPerBlock = plotsPerBlock - checksCount;

        const excedent = plotsPerBlock * bCount;
        const fillerCount = excedent - allGenotypes;
        const finalPlotsPerBlock = plotsPerBlock; // Consistent naming
        const totalFieldPlots = excedent;

        // Create Treatments
        let checks = [];
        let lines = [];
        let totalLines = 0;

        if (importEntries && fileInput && fileInput.files.length > 0) {
            alert("CSV import currently requires async processing. Using manual entry count for now.");
            totalLines = linesCount;
            for (let i = 1; i <= checksCount; i++) {
                checks.push({ entry: i, name: `Check ${i}`, type: 'Check' });
            }
            for (let i = 1; i <= totalLines; i++) {
                lines.push({ entry: checksCount + i, name: `Line ${checksCount + i}`, type: 'Test' });
            }
        } else {
            totalLines = linesCount;
            for (let i = 1; i <= checksCount; i++) {
                checks.push({ entry: (i), name: `Check ${i}`, type: 'Check' });
            }
            for (let i = 1; i <= totalLines; i++) {
                lines.push({ entry: (checksCount + i), name: `Line ${checksCount + i}`, type: 'Test' });
            }
        }

        // Multi-location Logic
        const layoutData = {};

        // Helper to split vectors into chunks (simulating R's split_vectors)
        const splitVectors = (array, lengths) => {
            const chunks = [];
            let index = 0;
            for (const len of lengths) {
                chunks.push(array.slice(index, index + len));
                index += len;
            }
            return chunks;
        };

        for (let l = 1; l <= lCount; l++) {
            const locName = lCount > 1 ? `${baseLocName} ${l}` : baseLocName;
            const locBlocks = [];

            for (let e = 1; e <= nExpt; e++) {
                // R Logic: len_cuts calculation
                let lenCuts = new Array(bCount - 1).fill(maxTestLinesPerBlock);
                const currentSum = lenCuts.reduce((a, b) => a + b, 0);
                lenCuts.push(linesCount - currentSum);

                let currentExptLines = [...lines];
                if (randomize) {
                    this.shuffle(currentExptLines);
                    // Shuffle lenCuts (R: rand_len_cuts <- sample(len_cuts))
                    // This distributes the "short" block randomly
                    this.shuffle(lenCuts);
                }

                // Distribute lines into blocks based on (randomized) capacities
                const linesBlocks = splitVectors(currentExptLines, lenCuts);

                // Construct each block
                // 🧩 STEP 1 — Define FINAL FIELD GRID (Per Block Basis for consistency)
                let bCols = Math.ceil(Math.sqrt(finalPlotsPerBlock));
                if (bCols < 2) bCols = finalPlotsPerBlock;
                const bRows = Math.ceil(finalPlotsPerBlock / bCols);

                // 🧩 STEP 2 & 3 — Place CHECKS FIRST (Global/Base Pattern)
                // We generate ONE valid constraint-satisfying pattern for the block dimensions.
                // This ensures internal validity.
                let baseCheckPositions = this.generateCheckPositions(bRows, bCols, checksCount);

                // Fallback if strict generation failed
                if (!baseCheckPositions) {
                    baseCheckPositions = [];
                    const slots = Array.from({ length: finalPlotsPerBlock }, (_, k) => k);
                    if (randomize) this.shuffle(slots);
                    for (let c = 0; c < checksCount; c++) {
                        const s = slots[c];
                        baseCheckPositions.push({ r: Math.floor(s / bCols), c: s % bCols });
                    }
                }

                for (let i = 0; i < bCount; i++) {
                    // 1. Prepare Tests & Fillers
                    const blockTests = linesBlocks[i] || [];
                    const neededFillers = finalPlotsPerBlock - checksCount - blockTests.length;
                    let blockFillers = [];
                    for (let f = 0; f < neededFillers; f++) blockFillers.push({ entry: 0, name: 'Filler', type: 'Filler' });

                    let availableTests = [...blockTests, ...blockFillers];
                    if (randomize) this.shuffle(availableTests);

                    // 🧩 STEP 4 — Offset Check Positions Across Blocks
                    // Apply deterministic shifts to prevent alignment across blocks.
                    // Shift rule: Row + i, Col + i (Diagonal shift per block)
                    // Using modulo to wrap around valid grid dimensions.
                    let currentCheckPositions = baseCheckPositions.map(pos => ({
                        r: (pos.r + i) % bRows,
                        c: (pos.c + i) % bCols // Simple shift; could be distinct primes for better scatter
                    }));

                    // 🧩 STEP 5 — Lock Check Positions
                    // Checks are now fixed for this block.

                    // 3. Build 2D Grid & Place
                    const grid = Array(bRows).fill(null).map(() => Array(bCols).fill(null));
                    const blockChecks = [...checks];
                    // We do NOT shuffle blockChecks identities here if we want consistent check order? 
                    // Usually we want random assignment of WHICH check goes to WHICH pos.
                    if (randomize) this.shuffle(blockChecks);

                    // Place Checks
                    // Scientific Justification: Checks were spatially dispersed using restricted randomization 
                    // at the field level to avoid adjacency and minimize local competition effects.
                    currentCheckPositions.forEach((pos, idx) => {
                        if (idx < blockChecks.length) {
                            // Handle collision if wrapping caused overlap (unlikely with sparse checks but possible)
                            // If slot occupied, find next empty.
                            let r = pos.r;
                            let c = pos.c;
                            while (grid[r][c]) {
                                c++;
                                if (c >= bCols) { c = 0; r++; }
                                if (r >= bRows) r = 0;
                            }
                            grid[r][c] = blockChecks[idx];
                        }
                    });

                    // 🧩 STEP 6 — Fill Remaining Plots with Tests
                    let testIter = 0;
                    for (let r = 0; r < bRows; r++) {
                        for (let c = 0; c < bCols; c++) {
                            if (r * bCols + c >= finalPlotsPerBlock) continue;
                            if (!grid[r][c]) {
                                grid[r][c] = availableTests[testIter++] || { entry: 0, name: 'Filler', type: 'Filler' };
                            }
                        }
                    }

                    // Flatten row-by-row (Cartesian Order)
                    const blockContent = [];
                    for (let r = 0; r < bRows; r++) {
                        for (let c = 0; c < bCols; c++) {
                            if (grid[r][c]) blockContent.push(grid[r][c]);
                        }
                    }

                    if (isSimulation) {
                        blockContent.forEach(item => {
                            item.expt = e;
                            item.simulatedValue = (Math.random() * 50 + 50).toFixed(2);
                        });
                    } else {
                        blockContent.forEach(item => {
                            item.expt = e;
                            delete item.simulatedValue;
                        });
                    }
                    locBlocks.push(blockContent);
                }
            }
            layoutData[locName] = locBlocks;
        }

        this.currentDesign = {
            layoutData, // Store all layouts
            plotsPerBlock: finalPlotsPerBlock,
            totalFieldPlots: totalFieldPlots * nExpt,
            fillerCount: fillerCount * nExpt,
            seed,
            locations: lCount,
            startPlot,
            planter,
            mode,
            mode,
            bCount: bCount * nExpt,
            isSimulation // Store mode
        };

        // Populate View Location Dropdown FIRST
        const viewLocSelect = document.getElementById('view-location-select');
        let firstLoc = null;
        if (viewLocSelect) {
            viewLocSelect.innerHTML = '';
            Object.keys(layoutData).forEach((loc, index) => {
                if (index === 0) firstLoc = loc;
                const opt = document.createElement('option');
                opt.value = loc;
                opt.textContent = loc;
                viewLocSelect.appendChild(opt);
            });
            if (firstLoc) viewLocSelect.value = firstLoc;
        }

        // Show simulate and export buttons
        const simulateBtn = document.getElementById('simulate-btn');
        const exportBtn = document.getElementById('export-btn');
        if (simulateBtn) simulateBtn.classList.remove('d-none');
        if (exportBtn) exportBtn.classList.remove('d-none');


        // Populate Dimensions Dropdown
        const totalPlotsAll = totalFieldPlots * nExpt;
        const totalPlotsPerLoc = finalPlotsPerBlock * bCount * nExpt;

        const dimsSelect = document.getElementById('dimensions-select');
        const dimsGroup = document.getElementById('dimensions-group');
        let bestCols = finalPlotsPerBlock; // Default fall back

        if (dimsSelect && dimsGroup) {
            dimsGroup.style.display = 'block';
            dimsSelect.innerHTML = '';

            // Add "Separate Blocks" option as default
            const defOpt = document.createElement('option');
            defOpt.value = 'separate';
            defOpt.textContent = 'Separate Blocks';
            dimsSelect.appendChild(defOpt);

            const factors = this.getFactors(totalPlotsPerLoc);

            // Filter for scientifically valid dimensions:
            const validFactors = factors.filter(f =>
                (f.c % finalPlotsPerBlock === 0) || (finalPlotsPerBlock % f.c === 0)
            );

            // Also include factors that "fit" nicely even if not perfectly aligned with blocks?
            // User requested explicit options like 10*20 etc. 
            // So we provide all valid factors of totalPlotsPerLoc.
            factors.forEach(f => {
                const opt = document.createElement('option');
                opt.value = `${f.r}x${f.c}`;
                opt.textContent = `${f.r} Rows x ${f.c} Cols`;
                dimsSelect.appendChild(opt);
                if (f.c === finalPlotsPerBlock) bestCols = f.c;
            });

            // Default to 'separate'
            dimsSelect.value = 'separate';
        }

        // Render with explicit first location
        this.render(firstLoc);
    }

    render(selectedLocName = null) {
        if (!this.currentDesign) return;
        const { layoutData, plotsPerBlock, totalFieldPlots, fillerCount, seed, startPlot, planter, locations } = this.currentDesign;

        // Default to Loc 1 if none selected
        if (!selectedLocName) {
            const viewLocSelect = document.getElementById('view-location-select');
            if (viewLocSelect && viewLocSelect.value) {
                selectedLocName = viewLocSelect.value;
            } else {
                selectedLocName = Object.keys(layoutData)[0];
            }
        }

        this.currentDesign.selectedLocName = selectedLocName;

        // Update Stats
        const elPpB = document.getElementById('info-plots-per-block');
        const elTot = document.getElementById('info-total-plots');
        const elFil = document.getElementById('info-fillers');
        const elSeed = document.getElementById('info-seed');
        const resultsEl = document.getElementById('results');

        if (elPpB) elPpB.textContent = `${plotsPerBlock} (x ${this.currentDesign.bCount} blocks)`;
        if (elTot) elTot.textContent = totalFieldPlots * locations;
        if (elFil) elFil.textContent = fillerCount * locations;
        if (elSeed) elSeed.textContent = seed;

        if (resultsEl) {
            resultsEl.style.display = 'block';
            resultsEl.scrollIntoView({ behavior: 'smooth' });
        }

        // Location Pills
        const pillsContainer = document.getElementById('location-pills');
        if (pillsContainer) pillsContainer.innerHTML = '';

        const blocks = layoutData[selectedLocName];
        if (!blocks) {
            console.warn(`No blocks found for location: ${selectedLocName}`);
            return;
        }

        const tbody = document.querySelector('#field-book-table tbody');
        const thead = document.querySelector('#field-book-table thead tr');

        if (tbody && thead) {
            // Manage Yield Header dynamically
            let yieldTh = thead.querySelector('.yield-header');
            if (this.currentDesign.isSimulation) {
                if (!yieldTh) {
                    yieldTh = document.createElement('th');
                    yieldTh.className = 'yield-header';
                    yieldTh.textContent = 'Yield';
                    thead.appendChild(yieldTh);
                }
            } else {
                if (yieldTh) {
                    yieldTh.remove();
                }
            }

            tbody.innerHTML = '';
            const fieldBookData = [];

            Object.keys(layoutData).forEach(locName => {
                const locBlocks = layoutData[locName];
                let currentPlot = startPlot;

                locBlocks.forEach((block, bIdx) => {
                    const blockId = bIdx + 1;
                    let blockPlots = [...block];

                    blockPlots.forEach((item) => {
                        if (locName === selectedLocName) {
                            const tr = document.createElement('tr');
                            tr.innerHTML = `
                                <td>${currentPlot}</td>
                                <td>${blockId}</td>
                                <td><span class="badge ${item.type.toLowerCase()}">${item.type}</span></td>
                                <td>${item.entry > 0 ? item.entry : '-'}</td>
                                <td>${item.name}</td>
                                ${this.currentDesign.isSimulation ? `<td>${item.simulatedValue}</td>` : ''}
                            `;
                            tbody.appendChild(tr);
                        }

                        const rowObj = {
                            location: locName,
                            plot: currentPlot,
                            block: blockId,
                            type: item.type,
                            entry: item.entry,
                            name: item.name,
                            expt: item.expt || 1
                        };

                        if (this.currentDesign.isSimulation) {
                            rowObj.yield = item.simulatedValue;
                        }

                        fieldBookData.push(rowObj);
                        currentPlot++;
                    });
                });
            });
            this.fieldBookData = fieldBookData;
        }

        // Render Map based on Selection
        const dimsSelect = document.getElementById('dimensions-select');
        const layoutMode = (dimsSelect && dimsSelect.value) ? dimsSelect.value : 'separate';

        const mapContainer = document.getElementById('map-container');
        if (mapContainer) {
            mapContainer.innerHTML = '';
            if (layoutMode === 'separate') {
                this.renderSeparateBlocks(blocks, mapContainer, planter);
            } else {
                this.renderUnifiedGrid(blocks, mapContainer, planter, layoutMode);
            }
        }
    }

    renderSeparateBlocks(blocks, container, planter) {
        // Container for all blocks
        const fieldWrapper = document.createElement('div');
        fieldWrapper.className = 'field-wrapper';
        fieldWrapper.style.display = 'flex';
        fieldWrapper.style.flexWrap = 'wrap';
        fieldWrapper.style.gap = '2rem';
        fieldWrapper.style.justifyContent = 'center';
        fieldWrapper.style.alignItems = 'flex-start';

        blocks.forEach((block, bIdx) => {
            // Individual Block Wrapper (Label + Grid)
            const uniqueBlockWrapper = document.createElement('div');
            uniqueBlockWrapper.className = 'unique-block-wrapper';
            uniqueBlockWrapper.style.display = 'flex';
            uniqueBlockWrapper.style.flexDirection = 'column';
            uniqueBlockWrapper.style.alignItems = 'center';
            uniqueBlockWrapper.style.gap = '0.5rem';

            // Label
            const label = document.createElement('div');
            label.innerHTML = `<span style="color:var(--text-dim); font-size:0.8rem;">BLOCK</span> <span style="font-size:1.2rem; font-weight:700; color:var(--accent);">${bIdx + 1}</span>`;
            uniqueBlockWrapper.appendChild(label);

            // Grid for this block
            const blockGrid = document.createElement('div');
            blockGrid.className = 'block-container';

            // Determine internal grid shape
            const pCount = block.length;
            let bCols = Math.ceil(Math.sqrt(pCount));
            if (bCols < 2) bCols = pCount;

            blockGrid.style.gridTemplateColumns = `repeat(${bCols}, 1fr)`;

            // Render plots
            let plotsToShow = [...block];

            if (planter === 'serpentine') {
                const rowsCount = Math.ceil(pCount / bCols);
                const gridCells = [];
                for (let r = 0; r < rowsCount; r++) {
                    let chunk = plotsToShow.slice(r * bCols, (r + 1) * bCols);
                    if (r % 2 !== 0) chunk.reverse();
                    gridCells.push(...chunk);
                }
                plotsToShow = gridCells;
            }

            plotsToShow.forEach(item => {
                const cell = document.createElement('div');
                cell.className = `cell ${item.type.toLowerCase()}`;
                if (item.type === 'Filler') cell.style.opacity = '0.3';

                cell.innerHTML = `
                     <div class="plot-id">${item.entry > 0 ? item.entry : '-'}</div>
                    <div class="trt-name" title="${item.name}">${item.name}</div>
                `;
                blockGrid.appendChild(cell);
            });

            uniqueBlockWrapper.appendChild(blockGrid);
            fieldWrapper.appendChild(uniqueBlockWrapper);
        });

        container.appendChild(fieldWrapper);
    }

    renderUnifiedGrid(blocks, container, planter, dimensions) {
        const [rows, cols] = dimensions.split('x').map(Number);

        const matrixGrid = document.createElement('div');
        matrixGrid.className = 'matrix-grid';
        matrixGrid.style.display = 'grid';
        matrixGrid.style.gap = '6px';
        matrixGrid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
        // Force width to fit
        matrixGrid.style.width = 'max-content';
        matrixGrid.style.maxWidth = '100%';

        // Flatten logic
        const allPlots = [];
        // Important: In a Field Map, plots fill the field linearly.
        blocks.forEach((block, bIdx) => {
            block.forEach(p => {
                p._blockId = bIdx + 1;
                allPlots.push(p);
            });
        });

        // Loop rows
        for (let r = 0; r < rows; r++) {
            const start = r * cols;
            let rowPlots = allPlots.slice(start, start + cols);
            const rowIsReversed = (planter === 'serpentine' && r % 2 !== 0);

            if (rowIsReversed) {
                rowPlots.reverse();
            }

            rowPlots.forEach(item => {
                if (!item) {
                    // Empty
                    const empty = document.createElement('div');
                    matrixGrid.appendChild(empty);
                    return;
                }

                const cell = document.createElement('div');
                cell.className = `cell ${item.type.toLowerCase()}`;
                if (item.type === 'Filler') cell.style.opacity = '0.3';

                // Block differentiation
                const hue = (item._blockId * 137) % 360;
                cell.style.boxShadow = `inset 0 0 0 2px hsla(${hue}, 70%, 50%, 0.5)`;
                cell.title = `Block ${item._blockId} - ${item.name}`;

                cell.innerHTML = `
                        <div style="font-size:0.55rem; position:absolute; top:2px; right:2px; opacity:0.8; color:var(--accent);">B${item._blockId}</div>
                        <div class="plot-id">${item.entry > 0 ? item.entry : '-'}</div>
                    <div class="trt-name" title="${item.name}">${item.name}</div>
                `;
                cell.style.position = 'relative';

                matrixGrid.appendChild(cell);
            });
        }

        container.appendChild(matrixGrid);
    }

    exportCSV() {
        if (!this.fieldBookData) return;

        const isSim = this.currentDesign && this.currentDesign.isSimulation;
        let csv = isSim
            ? 'Location,Plot,Block,Type,Entry,Name,Experiment,Yield\n'
            : 'Location,Plot,Block,Type,Entry,Name,Experiment\n';

        this.fieldBookData.forEach(row => {
            csv += `"${row.location}",${row.plot},${row.block},${row.type},${row.entry},"${row.name}",${row.expt || 1}`;
            if (isSim) csv += `,${row.yield}`;
            csv += `\n`;
        });

        const blob = new Blob([csv], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = 'ARCBD_FieldBook.csv';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }
}

// Global initialization
document.addEventListener('DOMContentLoaded', () => {
    try {
        if (document.getElementById('generate-btn')) {
            window.app = new ARCBDGenerator();
        }
    } catch (e) {
        console.error("ARCBD Init Error", e);
    }
});
