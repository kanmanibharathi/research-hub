/**
 * RBD Design Generator
 * Implements Randomized Block Design logic based on specific user requirements.
 * 
 * Algorithm:
 * 1. Fix number of blocks (r).
 * 2. For each block, shuffle treatments independently.
 * 3. Assign to plots.
 */
'use strict';

class RBDGenerator {
    constructor(t, blocks, loc = "Field-1", seed = null) {
        this.t = parseInt(t);
        this.blocks = parseInt(blocks);
        this.loc = loc;
        // Use provided seed or generate random one
        this.seed = (seed !== null && seed !== undefined && !isNaN(seed)) ? parseInt(seed) : Math.floor(Math.random() * 1000000);

        this.fieldBook = []; // Flat array for table
        this.layout = [];    // Structured array for visualization: [{block: 1, plots:[]}, ...]
        this.info = {};
    }

    // Seeded Random Generator (Mulberry32)
    mulberry32(a) {
        return function () {
            var t = a += 0x6D2B79F5;
            t = Math.imul(t ^ t >>> 15, t | 1);
            t ^= t + Math.imul(t ^ t >>> 7, t | 61);
            return ((t ^ t >>> 14) >>> 0) / 4294967296;
        }
    }

    // Fisher-Yates Shuffle
    shuffle(array, randomFunc) {
        let currentIndex = array.length, randomIndex;
        // While there remain elements to shuffle.
        while (currentIndex != 0) {
            // Pick a remaining element.
            randomIndex = Math.floor(randomFunc() * currentIndex);
            currentIndex--;
            // And swap it with the current element.
            [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
        }
        return array;
    }

    generate(startPlot = 101, customNames = [], plotOrder = 'cartesian') {
        const random = this.mulberry32(this.seed);
        this.fieldBook = [];
        this.layout = [];

        // Prepare Treatments
        let treatments = [];
        for (let i = 1; i <= this.t; i++) {
            treatments.push({
                id: i,
                name: customNames[i - 1] || `T-${i}`
            });
        }

        let globalPlotCount = 0;

        // Core Algorithm: Iterate blocks -> Shuffle -> Assign
        for (let b = 1; b <= this.blocks; b++) {
            let blockPlotStart = startPlot + ((b - 1) * this.t);
            // Note: Conventional RBD numbering often jumps, e.g. 101..105, 201..205. 
            // But strict sequence requested? "Total plots = t * r". 
            // We'll stick to sequential ID based on Start Plot.

            // 1. Shuffle treatments independently for this block
            let shuffled = this.shuffle([...treatments], random);

            // 2. Assign to plots
            let blockPlots = [];

            shuffled.forEach((trt, idx) => {
                let plotNum;
                // Simple sequential numbering
                plotNum = startPlot + globalPlotCount;
                globalPlotCount++;

                const plotObj = {
                    plot: plotNum,
                    block: b,
                    trtId: trt.id,
                    trtName: trt.name,
                    location: this.loc
                };

                blockPlots.push(plotObj);

                // Add to flat field book
                this.fieldBook.push(plotObj);
            });

            // Handle Serpentine Data Logic if strictly requested for *data* order?
            // "Plots arranged in zig-zag order".
            // Typically this affects the *map*, not the *list* of plots (Plot 1 is still Plot 1).
            // But if Plot 10 is physically next to Plot 11 in a snake, 
            // usually typical field numbering accounts for this (101->110, then 120<-111).
            // We will keep Plot IDs sequential (101, 102...) but rendering will zig-zag.

            this.layout.push({
                block: b,
                plots: blockPlots
            });
        }

        this.info = {
            totalUnits: this.t * this.blocks,
            seed: this.seed
        };
    }

    // 6. Correctness Validator
    validate() {
        if (!this.layout || this.layout.length === 0) return { valid: false, error: "No layout generated" };

        // Check each block
        for (let bData of this.layout) {
            // Check 1: Size
            if (bData.plots.length !== this.t) return { valid: false, error: `Block ${bData.block} size mismatch` };

            // Check 2: All treatments present exactly once
            const seen = new Set();
            for (let p of bData.plots) {
                if (seen.has(p.trtId)) return { valid: false, error: `Duplicate Treatment ${p.trtId} in Block ${bData.block}` };
                seen.add(p.trtId);
            }
            if (seen.size !== this.t) return { valid: false, error: `Missing treatments in Block ${bData.block}` };
        }
        return { valid: true };
    }

    simulate(min = 10, max = 100) {
        const random = this.mulberry32(this.seed + 999);
        this.fieldBook.forEach(p => {
            // Add some block effect + treatment effect simulation if we wanted to be fancy
            // But simple random is requested
            p.yield = (min + random() * (max - min)).toFixed(2);
        });
        return this.fieldBook;
    }
}

// UI Controller
document.addEventListener('DOMContentLoaded', () => {
    // Inputs
    const tInput = document.getElementById('t-input');
    const rInput = document.getElementById('reps-input');
    const locInput = document.getElementById('loc-input');
    const plotInput = document.getElementById('plot-input');
    const seedInput = document.getElementById('seed-input');
    const trtInput = document.getElementById('trt-names'); // TextArea
    const layoutInput = document.getElementById('layout-input'); // Serpentine/Cartesian
    const orientInput = document.getElementById('orientation-input'); // Row/Col

    // Buttons
    const generateBtn = document.getElementById('generate-btn');
    const simulateBtn = document.getElementById('simulate-btn');
    const exportBtn = document.getElementById('export-btn');
    const dlExcelBtn = document.getElementById('download-excel-btn');
    const dlMapBtn = document.getElementById('download-map-btn');

    // Outputs
    const resultsSection = document.getElementById('results');
    const mapContainer = document.getElementById('map-container');
    const tableBody = document.querySelector('#field-book-table tbody');

    let currentGenerator = null;

    if (generateBtn) {
        generateBtn.addEventListener('click', () => {
            if (!window.requireAuth || !window.requireAuth()) {
                console.warn("Auth required");
                return;
            }
            try {
                // Parse Inputs
                const t = parseInt(tInput.value);
                const r = parseInt(rInput.value);
                const startPlot = parseInt(plotInput.value);
                const seedRaw = seedInput.value;
                const seed = (seedRaw && seedRaw.trim() !== "") ? parseInt(seedRaw) : null;
                const orientation = orientInput ? orientInput.value : 'row';
                const plotOrder = layoutInput ? layoutInput.value : 'cartesian';

                // Treatment Names
                let customNames = [];
                if (trtInput && trtInput.value.trim() !== "") {
                    customNames = trtInput.value.split('\n').map(s => s.trim()).filter(s => s !== "");
                }

                // Init Generator
                const gen = new RBDGenerator(t, r, locInput ? locInput.value : "Field-1", seed);
                gen.generate(startPlot, customNames, plotOrder);

                // Validation
                const val = gen.validate();
                if (!val.valid) {
                    throw new Error("Validation Failed: " + val.error);
                }

                currentGenerator = gen;

                // Update Stats
                if (document.getElementById('info-total')) document.getElementById('info-total').textContent = gen.info.totalUnits;
                if (document.getElementById('info-seed')) document.getElementById('info-seed').textContent = gen.info.seed;

                // Render
                renderTable(gen.fieldBook);
                renderMap(gen, orientation, plotOrder);

                // Show Results
                if (resultsSection) {
                    resultsSection.style.display = 'block';
                    resultsSection.scrollIntoView({ behavior: 'smooth' });
                }
                if (simulateBtn) {
                    simulateBtn.classList.remove('d-none'); // Ensure visibility logic matches CSS
                    simulateBtn.style.display = 'inline-flex';
                }
                if (exportBtn) {
                    exportBtn.classList.remove('d-none');
                    exportBtn.style.display = 'inline-flex';
                }

            } catch (e) {
                alert(e.message);
                console.error(e);
            }
        });
    }

    if (orientInput) {
        orientInput.addEventListener('change', () => {
            if (currentGenerator) {
                renderMap(currentGenerator, orientInput.value, layoutInput ? layoutInput.value : 'cartesian');
            }
        });
    }

    // Simulate
    if (simulateBtn) {
        simulateBtn.addEventListener('click', () => {
            if (!currentGenerator) return;
            currentGenerator.simulate();
            renderTable(currentGenerator.fieldBook);
            alert("Simulation Data Generated!");
        });
    }

    // Export CSV
    if (exportBtn || dlExcelBtn) {
        const handler = () => {
            if (!currentGenerator) return;
            const data = currentGenerator.fieldBook;
            // CSV CSV
            const headers = ["Plot", "Block", "Treatment", "Yield"];
            let csvContent = "data:text/csv;charset=utf-8,";
            csvContent += headers.join(",") + "\n";
            data.forEach(row => {
                csvContent += `${row.plot},${row.block},${row.trtName},${row.yield || ""}\n`;
            });
            const encodedUri = encodeURI(csvContent);
            const link = document.createElement("a");
            link.setAttribute("href", encodedUri);
            link.setAttribute("download", "rbd_data.csv");
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        };
        if (exportBtn) exportBtn.addEventListener('click', handler);
        if (dlExcelBtn) dlExcelBtn.addEventListener('click', handler);
    }

    // Download Map
    if (dlMapBtn) {
        dlMapBtn.addEventListener('click', () => {
            if (!mapContainer) return;
            const target = mapContainer.querySelector('.map-grid-wrapper') || mapContainer;
            html2canvas(target, {
                backgroundColor: null,
                scale: 3,
                useCORS: true,
                logging: false
            }).then(canvas => {
                const link = document.createElement('a');
                link.download = `rbd_map_${Date.now()}.png`;
                link.href = canvas.toDataURL('image/png', 1.0);
                link.click();
            });
        });
    }

    // Helper: Golden Angle Color
    function getColor(index) {
        const hue = (index * 137.508) % 360;
        return `hsla(${hue}, 70%, 80%, 0.8)`; // High opacity for blocks
    }

    function renderTable(data) {
        if (!tableBody) return;
        tableBody.innerHTML = '';
        data.forEach(d => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${d.plot}</td>
                <td>${d.location}</td>
                <td>${d.block}</td>
                <td>${d.trtId}</td>
                <td style="font-weight:600; color: #2ecc71;">${d.trtName}</td>
            `;
            // Add yield if exists
            if (d.yield) {
                const td = document.createElement('td');
                td.textContent = d.yield;
                tr.appendChild(td);
            }
            tableBody.appendChild(tr);
        });

        // Handle Header for Yield (Dynamic)
        const thead = document.querySelector('#field-book-table thead tr');
        if (thead && data.length > 0) {
            const hasYield = !!data[0].yield;
            const currentHeaders = thead.children.length;
            // Basic cols = 5. if 6, yield exists.
            if (hasYield && currentHeaders === 5) {
                const th = document.createElement('th');
                th.textContent = "Yield";
                thead.appendChild(th);
            }
        }
    }

    function renderMap(gen, orientation, plotOrder) {
        if (!mapContainer) return;
        mapContainer.innerHTML = '';

        const grid = document.createElement('div');
        grid.className = 'map-grid-wrapper';
        grid.style.display = 'grid';
        grid.style.gap = '15px';

        // Ensure scroll
        grid.style.width = 'max-content';
        grid.style.minWidth = '100%';

        // Visualization Logic
        // orientation 'row': Blocks are Rows.
        // orientation 'col': Blocks are Cols.

        if (orientation === 'row') {
            // Blocks stacked vertically.
            // Grid Rows = r.
            // Grid Cols = 1 (Label) + t (Treatments).
            // Template: Auto Auto ...
            grid.style.gridTemplateColumns = `100px repeat(${gen.t}, 80px)`;
            grid.style.gridAutoFlow = 'row'; // Fill row by row

            gen.layout.forEach(bData => {
                // 1. Label
                const label = document.createElement('div');
                label.className = 'block-label';
                label.style.fontWeight = 'bold';
                label.style.display = 'flex';
                label.style.alignItems = 'center';
                label.style.justifyContent = 'center';
                label.style.color = '#fff';
                label.textContent = `Block ${bData.block}`;
                grid.appendChild(label);

                // 2. Plots
                // Serpentine Logic: Reverse even blocks (2, 4...) for display
                let plotsToShow = [...bData.plots];
                if (plotOrder === 'serpentine' && bData.block % 2 === 0) {
                    plotsToShow.reverse();
                }

                plotsToShow.forEach(p => {
                    grid.appendChild(createPlotDiv(p));
                });
            });

        } else {
            // Blocks side-by-side (Cols)
            // Grid Cols = r.
            // Grid Rows = 1 (Label) + t.
            grid.style.gridTemplateColumns = `repeat(${gen.blocks}, 100px)`;
            grid.style.gridTemplateRows = `40px repeat(${gen.t}, 80px)`;
            grid.style.gridAutoFlow = 'column'; // Fill col by col

            gen.layout.forEach(bData => {
                // 1. Label (Header)
                const label = document.createElement('div');
                label.className = 'block-label';
                label.style.fontWeight = 'bold';
                label.style.textAlign = 'center';
                label.style.color = '#fff';
                label.textContent = `Block ${bData.block}`;
                grid.appendChild(label);

                // 2. Plots
                // Serpentine Logic? "Zig Zag".
                // In Columnar layout, zig zag means Down Block 1, Up Block 2?
                let plotsToShow = [...bData.plots];
                if (plotOrder === 'serpentine' && bData.block % 2 === 0) {
                    plotsToShow.reverse();
                }

                plotsToShow.forEach(p => {
                    grid.appendChild(createPlotDiv(p));
                });
            });
        }

        mapContainer.appendChild(grid);
    }

    function createPlotDiv(p) {
        const div = document.createElement('div');
        div.className = 'plot';
        div.innerHTML = `
            <div class="plot-num">${p.plot}</div>
            <div class="plot-trt">${p.trtName}</div>
        `;
        div.style.backgroundColor = getColor(p.trtId);
        div.style.border = '1px solid rgba(255,255,255,0.2)';

        return div;
    }

    // Tab Switching Logic
    const tabs = document.querySelectorAll('.tab');
    const tabContents = document.querySelectorAll('.tab-content');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            // Remove active class from all tabs
            tabs.forEach(t => t.classList.remove('active'));
            // Add active class to clicked tab
            tab.classList.add('active');

            // Hide all tab contents
            tabContents.forEach(content => content.classList.remove('active'));

            // Show target tab content
            const targetId = tab.getAttribute('data-tab');
            const targetContent = document.getElementById(targetId);
            if (targetContent) {
                targetContent.classList.add('active');
            }
        });
    });
});
