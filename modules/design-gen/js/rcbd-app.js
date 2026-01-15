/**
 * Randomized Complete Block Design (RCBD) Logic
 */
'use strict';

class RCBDGenerator {
    constructor(treatments, reps, locations, planter = 'serpentine', seed = null) {
        this.treatments = treatments; // Array of names
        this.reps = parseInt(reps);
        this.locations = parseInt(locations);
        this.planter = planter;
        // Correct seed handling
        this.seed = (seed !== null && seed !== undefined && !isNaN(seed)) ? seed : Math.floor(Math.random() * 1000000);

        this.fieldBook = [];
        this.layoutData = {}; // loc -> [rep][plot]
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

    generate(startPlot = 101) {
        const random = this.mulberry32(this.seed);
        this.fieldBook = [];
        this.layoutData = {};

        let globalId = 1;

        for (let l = 1; l <= this.locations; l++) {
            const locName = `LOC-${l}`;
            this.layoutData[locName] = [];

            let currentPlot = startPlot + ((l - 1) * 1000); // Standard FielDHub logic

            for (let r = 1; r <= this.reps; r++) {
                // Every block (rep) must contain all treatments
                let blockTreats = this.treatments.map((name, idx) => ({
                    id: idx + 1,
                    name: name
                }));

                // Randomize treatments within the block
                this.shuffle(blockTreats, random);

                // Determine plot order (serpentine vs cartesian)
                // For RCBD, we often think of a block as a row or a group.
                // We'll treat each block as a "row" in the visual output.
                let plotsInBlock = [];

                let plots = blockTreats.map((t, i) => {
                    return { ...t, plot: currentPlot + i };
                });

                // If serpentine, reverse plots in even blocks (rows)
                if (this.planter === 'serpentine' && (r % 2 === 0)) {
                    // Logic check: r goes 1..reps. Even reps reverse? 
                    // Usually we visualize blocks stacked. 
                    // Let's reverse plots logical order for "sowing" direction visualization
                    plots.reverse();
                    // Note: Plot numbers usually stay sequential in space, but treatment assignment follows path.
                    // But here we assigned plot numbers sequentially then reversed the array.
                    // This means plots[0] has highest plot number.
                    // Let's re-assign plot numbers to match spatial position?
                    // Typically 'Plot Number' is the ID of the unit in ground.
                    // If we walk serpentine, we walk 101, 102, 103... then turn and walk 203, 202, 201?
                    // Or we walk 101..110, then 120..111? 
                    // Let's simple keep plot numbers monotonic increasing by block index for simplicity,
                    // but the *treatments* filling them are reversed if we thought of them filling array.
                    // Actually, let's keep it simple: Plot number = unique ID.
                    // Serpentine affects how we *view* them or walk them.
                    // The previous code reversed the 'plots' array which contained plot numbers. 
                    // That implies plot numbers are not spatially monotonic left-to-right?
                    // We will stick to the previous logic but ensure consistent rendering.
                }

                // If we reversed, the plot numbers in the objects are also reversed order. 
                // e.g. [ {p:105}, {p:104} ... ]

                plots.forEach((p, i) => {
                    const entry = {
                        id: globalId++,
                        location: locName,
                        plot: p.plot,
                        rep: r,
                        treatmentId: p.id,
                        treatmentName: p.name
                    };
                    this.fieldBook.push(entry);
                    plotsInBlock.push(entry);
                });

                this.layoutData[locName].push(plotsInBlock);
                currentPlot += blockTreats.length;
            }
        }
        return this.fieldBook;
    }

    simulate(min = 50, max = 150) {
        // Add random yield data
        const random = this.mulberry32(this.seed + 12345);
        this.fieldBook.forEach(row => {
            row.yield = (min + random() * (max - min)).toFixed(2);
        });
        return this.fieldBook;
    }
}

// UI Controller
document.addEventListener('DOMContentLoaded', () => {
    try {
        const treatmentsInput = document.getElementById('treatments-input'); // Textarea
        const tInput = document.getElementById('t-input'); // Number input (New)
        const repsInput = document.getElementById('reps-input');
        const locationsInput = document.getElementById('locations-input'); // RCBD specific
        const planterInput = document.getElementById('planter-input');
        const plotStartInput = document.getElementById('plot-start');
        const seedInput = document.getElementById('seed-input');
        const generateBtn = document.getElementById('generate-btn');
        const simulateBtn = document.getElementById('simulate-btn');
        const exportBtn = document.getElementById('export-btn');
        const dimensionsInput = document.getElementById('dimensions-input'); // New

        const resultsSection = document.getElementById('results');
        const mapContainer = document.getElementById('map-container'); // Updated ID
        const fbTableBody = document.querySelector('#fb-table tbody');
        const locPillsContainer = document.getElementById('location-pills');
        const tabs = document.querySelectorAll('.tab');

        if (!generateBtn) return;

        // Dynamic Description for Layout
        if (planterInput) {
            const descEl = document.getElementById('layout-desc');
            const descriptions = {
                'serpentine': 'Serpentine – Plots arranged in a zig-zag order for continuous field movement.',
                'cartesian': 'Cartesian – Plots arranged in a standard row–column grid order.'
            };
            planterInput.addEventListener('change', () => {
                if (descEl) descEl.textContent = descriptions[planterInput.value];
            });
        }

        let currentGenerator = null;
        let selectedLoc = null;

        // Visual Helper: Golden Angle Color
        function getColor(index) {
            const hue = (index * 137.508) % 360;
            return `hsla(${hue}, 70%, 80%, 0.5)`;
        }

        if (dimensionsInput) {
            dimensionsInput.addEventListener('change', () => {
                if (!currentGenerator || !selectedLoc) return;
                // Re-render map with new dimension
                renderMap(selectedLoc);
            });
        }

        generateBtn.addEventListener('click', () => {
            if (!window.requireAuth || !window.requireAuth()) {
                console.warn("Auth required");
                return;
            }
            try {
                // Logic: Treatment List vs No of Treatments
                // If list provided, use list. If empty, use T-input to generate.
                let trtNames = [];
                const rawList = treatmentsInput.value.split(/[\n,]+/).map(t => t.trim()).filter(t => t.length > 0);

                if (rawList.length > 0) {
                    trtNames = rawList;
                    // Update t-input to match
                    if (tInput) tInput.value = trtNames.length;
                } else {
                    // Use count from t-input
                    const count = parseInt(tInput.value) || 10;
                    if (count < 2) throw new Error("Please specify at least 2 treatments.");
                    for (let i = 1; i <= count; i++) {
                        trtNames.push(`T-${i}`);
                    }
                }

                if (trtNames.length < 2) {
                    alert('Please enter at least 2 treatments.');
                    return;
                }

                const reps = parseInt(repsInput.value);
                const locations = parseInt(locationsInput.value);
                const planter = planterInput ? planterInput.value : 'serpentine';
                const plotStart = parseInt(plotStartInput.value);

                const rawSeed = seedInput.value;
                const seedValue = (rawSeed !== "" && rawSeed !== null) ? parseInt(rawSeed) : Math.floor(Math.random() * 1000000);

                const gen = new RCBDGenerator(trtNames, reps, locations, planter, seedValue);
                gen.generate(plotStart);
                currentGenerator = gen;

                // Stats
                if (document.getElementById('stat-plots')) document.getElementById('stat-plots').textContent = trtNames.length * reps * locations;
                if (document.getElementById('stat-treats')) document.getElementById('stat-treats').textContent = trtNames.length;
                if (document.getElementById('stat-blocks')) document.getElementById('stat-blocks').textContent = reps;
                if (document.getElementById('info-seed')) document.getElementById('info-seed').textContent = seedValue; // if element exists (RCBD didn't have it, but consistent to add logic check)

                // Location Pills
                if (locPillsContainer) {
                    locPillsContainer.innerHTML = '';
                    if (locations > 1) { // Only show pills if > 1 location? Or always? Always is safer for "SelectedLoc"
                        Object.keys(gen.layoutData).forEach((loc, idx) => {
                            const pill = document.createElement('div');
                            pill.className = `loc-pill ${idx === 0 ? 'active' : ''}`;
                            pill.textContent = loc;
                            pill.onclick = () => {
                                document.querySelectorAll('.loc-pill').forEach(p => p.classList.remove('active'));
                                pill.classList.add('active');
                                selectedLoc = loc;
                                renderMap(loc);
                            };
                            locPillsContainer.appendChild(pill);
                        });
                    }
                    // Default selection
                    selectedLoc = Object.keys(gen.layoutData)[0];
                } else {
                    selectedLoc = Object.keys(gen.layoutData)[0];
                }

                renderMap(selectedLoc);
                renderTable(gen.fieldBook);

                if (resultsSection) {
                    resultsSection.style.display = 'block';
                    resultsSection.scrollIntoView({ behavior: 'smooth' });
                }

                // Show action buttons
                if (simulateBtn) {
                    simulateBtn.classList.remove('d-none');
                    simulateBtn.style.display = 'inline-flex';
                }
                if (exportBtn) {
                    exportBtn.classList.remove('d-none');
                    exportBtn.style.display = 'inline-flex';
                }

            } catch (err) {
                console.error(err);
                alert("Error: " + err.message);
            }
        });

        // Simulate
        if (simulateBtn) {
            simulateBtn.addEventListener('click', () => {
                if (!currentGenerator) return;
                currentGenerator.simulate();
                renderTable(currentGenerator.fieldBook);
                alert("Data simulation complete!");
            });
        }

        // CSV Export
        if (exportBtn) {
            exportBtn.addEventListener('click', () => {
                const dlExcelBtn = document.getElementById('download-excel');
                if (dlExcelBtn) dlExcelBtn.click();
            });
        }

        function renderMap(loc) {
            if (!currentGenerator || !mapContainer) return;
            mapContainer.innerHTML = '';

            const blocksData = currentGenerator.layoutData[loc]; // Array of arrays (blocks)
            const t = parseInt(tInput.value) || currentGenerator.treatments.length;
            const reps = parseInt(repsInput.value); // Number of blocks

            // Dimension Logic
            const widthMode = dimensionsInput ? dimensionsInput.value : 't_cols';

            const grid = document.createElement('div');
            grid.className = 'map-grid-wrapper';
            grid.style.display = 'grid';
            grid.style.gap = '10px';
            // grid.style.justifyContent = 'center'; // Removed to allow horizontal scroll

            // We will inject a Label Cell ("Block 1") before each block's data
            // Scenario A: t_cols (Reps as Rows) -> Standard
            // Grid: [Label] [P1] [P2]...
            // Rows = Reps. Cols = 1 + t.

            // Scenario B: r_cols (Reps as Columns)
            // Grid:
            // [Label] [Label]
            // [P1]    [P1]
            // [P2]    [P2]
            // Flow: Column Major.

            if (widthMode === 't_cols') {
                // ROWS layout
                grid.style.gridTemplateColumns = `80px repeat(${t}, 80px)`; // Label + T columns
                grid.style.gridAutoFlow = 'row'; // Default

                // Add data block by block
                blocksData.forEach((block, idx) => {
                    // 1. Label
                    const label = document.createElement('div');
                    label.className = 'map-label';
                    label.textContent = `Block ${idx + 1}`;
                    grid.appendChild(label);

                    // 2. Plots (Respect serpentine logic in data)
                    // Note: block is already sorted/ordered by generate() logic.
                    // If serpentine, the 'plot' numbers might be reversed, but the Array order implies visual sequence?
                    // In previous logic steps, we established that block array order = visual order
                    // (even if plot IDs are 104, 103... visually we place them L->R).
                    block.forEach(plt => {
                        grid.appendChild(createPlotDiv(plt));
                    });
                });

            } else {
                // COLS layout (Reps x Treatments)
                // Reps are columns.
                // Grid Cols = Reps.
                // Grid Rows = 1 (Header) + t (Treatments).
                grid.style.gridTemplateColumns = `repeat(${reps}, 100px)`;
                grid.style.gridTemplateRows = `40px repeat(${t}, 80px)`;
                grid.style.gridAutoFlow = 'column'; // Fill columns first!

                blocksData.forEach((block, idx) => {
                    // 1. Label (Header of the column)
                    const label = document.createElement('div');
                    label.className = 'map-label';
                    label.textContent = `Block ${idx + 1}`;
                    grid.appendChild(label);

                    // 2. Plots
                    block.forEach(plt => {
                        grid.appendChild(createPlotDiv(plt));
                    });
                });
            }

            mapContainer.appendChild(grid);
        }

        function createPlotDiv(plt) {
            const plotDiv = document.createElement('div');
            plotDiv.className = 'plot';
            plotDiv.innerHTML = `
                <div class="plot-num">${plt.plot}</div>
                <div class="plot-trt" style="font-size: 0.8rem; word-break: break-word;">${plt.treatmentName}</div>
                <div class="plot-rep">Blk ${plt.rep}</div>
            `;
            // Color
            const bgColor = getColor(plt.treatmentId);
            plotDiv.style.backgroundColor = bgColor;
            plotDiv.style.border = `1px solid hsla(${(plt.treatmentId * 137.508) % 360}, 70%, 40%, 0.6)`;
            return plotDiv;
        }

        function renderTable(data) {
            if (!fbTableBody) return;
            fbTableBody.innerHTML = '';

            // Check for Yield
            const hasYield = data.length > 0 && data[0].yield !== undefined;
            // Update Header
            const thead = document.querySelector('#fb-table thead tr');
            if (thead) {
                if (thead.lastChild.textContent === 'Yield' && !hasYield) thead.lastChild.remove();
                if (hasYield && thead.lastChild.textContent !== 'Yield') {
                    const th = document.createElement('th');
                    th.textContent = 'Yield';
                    thead.appendChild(th);
                }
            }

            data.forEach(row => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${row.id}</td>
                    <td><span class="loc-pill" style="pointer-events:none; padding:4px 8px; font-size:0.8rem;">${row.location}</span></td>
                    <td><strong>${row.plot}</strong></td>
                    <td>${row.rep}</td>
                    <td style="font-weight:600; color: #2ecc71;">${row.treatmentName}</td>
                    ${hasYield ? `<td>${row.yield}</td>` : ''}
                `;
                fbTableBody.appendChild(tr);
            });
        }

        if (tabs) {
            tabs.forEach(tab => {
                tab.addEventListener('click', () => {
                    const targetId = tab.getAttribute('data-tab');
                    const targetContent = document.getElementById(targetId);
                    if (targetContent) {
                        tabs.forEach(t => t.classList.remove('active'));
                        tab.classList.add('active');
                        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                        targetContent.classList.add('active');
                    }
                });
            });
        }

        const dlExcelBtn = document.getElementById('download-excel');
        if (dlExcelBtn) {
            dlExcelBtn.onclick = () => {
                if (!currentGenerator) return;
                const docHead = ["ID", "Location", "Plot", "Block", "Treatment"];
                if (currentGenerator.fieldBook.length > 0 && currentGenerator.fieldBook[0].yield) docHead.push("Yield");
                const csv = [docHead.join(",")];
                currentGenerator.fieldBook.forEach(r => {
                    let row = [r.id, r.location, r.plot, r.rep, `"${r.treatmentName}"`];
                    if (r.yield) row.push(r.yield);
                    csv.push(row.join(","));
                });
                const blob = new Blob([csv.join("\n")], { type: 'text/csv' });
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = 'rcbd_field_book.csv';
                a.click();
            };
        }

        const dlMapBtn = document.getElementById('download-map-btn');
        if (dlMapBtn) {
            dlMapBtn.addEventListener('click', () => {
                if (!mapContainer) return;
                const btn = dlMapBtn;
                const oldContent = btn.innerHTML;
                btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
                btn.disabled = true;

                const elementToCapture = mapContainer.querySelector('.map-grid-wrapper') || mapContainer;

                html2canvas(elementToCapture, {
                    backgroundColor: null,
                    scale: 3,
                    logging: false,
                    useCORS: true
                }).then(canvas => {
                    const link = document.createElement('a');
                    link.download = 'rcbd_design_map.png';
                    link.href = canvas.toDataURL('image/png', 1.0);
                    link.click();
                    btn.innerHTML = oldContent;
                    btn.disabled = false;
                }).catch(err => {
                    console.error(err);
                    alert('Screenshot failed');
                    btn.innerHTML = oldContent;
                    btn.disabled = false;
                });
            });
        }

    } catch (e) {
        console.error("RCBD Init Error", e);
    }
});
