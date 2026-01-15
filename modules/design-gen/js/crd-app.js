/**
 * CRD Design Generator
 * Implements simple random permutation with enhanced simulation and layout options
 */
'use strict';

class CRDGenerator {
    constructor(t, reps, loc = "Location 1", seed = null) {
        this.t = parseInt(t);
        this.reps = parseInt(reps);
        this.loc = loc;
        this.seed = (seed !== null && seed !== undefined && !isNaN(seed)) ? seed : Math.floor(Math.random() * 100000);
        this.fieldBook = [];
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

    generate(startPlot = 101, customNames = [], layout = 'serpentine', widthMode = 't_cols') {
        const random = this.mulberry32(this.seed);
        const totalUnits = this.t * this.reps;

        // Prepare list of treatments with their repetitions
        let units = [];
        for (let i = 1; i <= this.t; i++) {
            const trtName = customNames[i - 1] || `G-${i}`;
            for (let r = 1; r <= this.reps; r++) {
                units.push({
                    trtId: i,
                    trtName: trtName,
                    repId: r
                });
            }
        }

        // Randomize the entire sequence
        this.shuffle(units, random);

        // Assign plot numbers (supporting serpentine visual layout)
        // Since CRD is just a sequence, serpentine vs cartesian only affects the indexing
        const width = (widthMode === 'r_cols') ? this.reps : this.t;
        this.generatedWidth = width; // Store for map rendering

        this.fieldBook = units.map((unit, index) => {
            let plotNum;
            if (layout === 'serpentine') {
                const row = Math.floor(index / width);
                const col = index % width;
                if (row % 2 !== 0) { // Serpentine on odd rows (0-indexed)
                    plotNum = startPlot + (row * width) + (width - 1 - col);
                } else {
                    plotNum = startPlot + index;
                }
            } else {
                plotNum = startPlot + index;
            }

            return {
                id: index + 1,
                plot: plotNum,
                row: Math.floor(index / width) + 1,
                col: (index % width) + 1,
                location: this.loc || "Field-1",
                repId: unit.repId,
                trtId: unit.trtId,
                trtName: unit.trtName,
                yield: null
            };
        });

        this.info = {
            totalUnits: totalUnits,
            seed: this.seed
        };

        return this.fieldBook;
    }

    simulate(min = 50, max = 150) {
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
        const generateBtn = document.getElementById('generate-btn');
        const simulateBtn = document.getElementById('simulate-btn');
        const exportBtn = document.getElementById('export-btn');
        const downloadExcelBtn = document.getElementById('download-excel-btn');
        const downloadMapBtn = document.getElementById('download-map-btn');
        const resultsSection = document.getElementById('results');
        const fbTableBody = document.querySelector('#field-book-table tbody');
        const fbTableHeader = document.querySelector('#field-book-table thead tr');
        const mapContainer = document.getElementById('map-container');
        const tabs = document.querySelectorAll('.tab');

        // Inputs
        const locInput = document.getElementById('loc-input');
        const tInput = document.getElementById('t-input');
        const repsInput = document.getElementById('reps-input');
        const plotInput = document.getElementById('plot-input');
        const seedInput = document.getElementById('seed-input');
        const layoutInput = document.getElementById('layout-input');
        const layoutDesc = document.getElementById('layout-desc');
        const trtNamesArea = document.getElementById('trt-names');

        // Check for essential elements
        if (!generateBtn || !tInput || !repsInput) return;

        let currentGenerator = null;

        if (layoutInput && layoutDesc) {
            layoutInput.addEventListener('change', () => {
                if (layoutInput.value === 'serpentine') {
                    layoutDesc.textContent = "Serpentine – Plots arranged in a zig-zag order for continuous field movement.";
                } else {
                    layoutDesc.textContent = "Cartesian – Plots arranged in a standard row–column grid order.";
                }
            });
        }

        const statsDimensionsInput = document.getElementById('dimensions-input');
        if (statsDimensionsInput) {
            statsDimensionsInput.addEventListener('change', () => {
                if (!currentGenerator) return;

                // We need to re-run generate logic for the layout recalculation 
                // but preserve the randomization seed/sequence if possible.
                // However, the generate function shuffles. To change ONLY width, we need to know the width.
                // Simpler approach: Rerun generate with SAME seed.

                // Or better: just update the width logic in renderMap?
                // The plot numbers depend on width if we want them physically correct (e.g. serpentine).
                // So yes, we must re-call generate or a layout update method.

                // Let's re-trigger the generate button click logic programmatically OR extract the logic.
                // Re-calling generate with same seed is safest to preserve "same experiment, different view" feel
                // IF we pass the existing seed back in.

                // Actually, currentGenerator has the seed.
                const startPlot = parseInt(plotInput.value);
                const trtNames = trtNamesArea ? trtNamesArea.value.split('\n').map(n => n.trim()).filter(n => n !== "") : [];
                const layout = layoutInput ? layoutInput.value : 'serpentine';
                const widthMode = statsDimensionsInput.value;

                // Re-generate with stored seed to keep randomization consistent but change shape
                currentGenerator.generate(startPlot, trtNames, layout, widthMode);

                renderMap(currentGenerator.fieldBook);
                renderTable(currentGenerator.fieldBook);
            });
        }

        generateBtn.addEventListener('click', () => {
            if (!window.requireAuth || !window.requireAuth()) {
                console.warn("Auth required");
                return;
            }
            try {
                const t = parseInt(tInput.value);
                const reps = parseInt(repsInput.value);
                const startPlot = parseInt(plotInput.value);

                const rawSeed = seedInput.value;
                const seed = (rawSeed !== "" && rawSeed !== null) ? parseInt(rawSeed) : Math.floor(Math.random() * 100000);

                const layout = layoutInput ? layoutInput.value : 'serpentine';
                // Element moved to results section, query it freshly
                const dimensionsInput = document.getElementById('dimensions-input');
                const widthMode = dimensionsInput ? dimensionsInput.value : 't_cols';

                const trtNames = trtNamesArea ? trtNamesArea.value.split('\n').map(n => n.trim()).filter(n => n !== "") : [];
                const location = locInput ? locInput.value : "Field-1";

                const generator = new CRDGenerator(t, reps, location, seed);
                generator.generate(startPlot, trtNames, layout, widthMode);
                currentGenerator = generator;

                // Update UI
                if (document.getElementById('info-total')) document.getElementById('info-total').textContent = generator.info.totalUnits;
                if (document.getElementById('info-seed')) document.getElementById('info-seed').textContent = generator.info.seed;

                renderTable(generator.fieldBook);
                renderMap(generator.fieldBook);

                if (resultsSection) {
                    resultsSection.style.display = 'block';
                    resultsSection.scrollIntoView({ behavior: 'smooth' });
                }

                if (simulateBtn) simulateBtn.style.display = 'inline-flex';
                if (exportBtn) exportBtn.style.display = 'inline-flex';

            } catch (e) {
                console.error("Generator Error:", e);
                alert(e.message);
            }
        });

        if (simulateBtn) {
            simulateBtn.addEventListener('click', () => {
                if (!currentGenerator) return;
                const data = currentGenerator.simulate();
                renderTable(data);
                alert("Data simulation successful!");
            });
        }

        function renderTable(data) {
            if (!fbTableBody) return;
            fbTableBody.innerHTML = '';

            // Reset header if needed
            if (fbTableHeader && fbTableHeader.cells.length > 5) {
                fbTableHeader.removeChild(fbTableHeader.lastChild);
            }

            if (data[0] && data[0].yield !== null && fbTableHeader) {
                const th = document.createElement('th');
                th.textContent = "Yield";
                fbTableHeader.appendChild(th);
            }

            data.forEach(row => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${row.plot}</td>
                    <td>${row.location}</td>
                    <td>${row.repId}</td>
                    <td>${row.trtId}</td>
                    <td><span style="color: #2ecc71; font-weight: 600;">${row.trtName}</span></td>
                    ${row.yield !== null ? `<td>${row.yield}</td>` : ''}
                `;
                fbTableBody.appendChild(tr);
            });
        }

        function renderMap(data) {
            if (!mapContainer) return;
            mapContainer.innerHTML = '';
            const grid = document.createElement('div');
            grid.className = 'map-grid-wrapper';
            // Simple grid for visualization
            // Use the stored generatedWidth to determine columns, regardless of t or reps
            const width = currentGenerator && currentGenerator.generatedWidth ? currentGenerator.generatedWidth : (currentGenerator ? currentGenerator.t : Math.ceil(Math.sqrt(data.length)));
            grid.style.display = 'grid';
            grid.style.gridTemplateColumns = `repeat(${width}, 100px)`;
            grid.style.gap = '10px';

            // Do NOT sort by plot number; use the fieldBook order to respect serpentine/cartesian traversal
            const displayData = [...data];

            // Helper to generate consistent mild colors based on index
            function getColor(index) {
                const hue = (index * 137.508) % 360; // Golden angle approximation
                return `hsla(${hue}, 70%, 80%, 0.5)`;
            }

            displayData.forEach(plt => {
                const plotDiv = document.createElement('div');
                plotDiv.className = 'plot';

                // Decide what to show: Name if user provided specific names (not the auto G-1 etc), else ID
                // We assume if trtName differs from `G-${trtId}`, IT IS a user provided name.
                // Or simplistic check: if trtName starts with 'G-', show ID for brevity, else show Name.
                // Better approach: check if trtName matches expected default format.
                const isDefaultName = plt.trtName === `G-${plt.trtId}`;
                const displayContent = isDefaultName ? plt.trtId : plt.trtName;

                // If the name is very long, we might want to truncate or keep it small.
                // For now, let's just use it.

                plotDiv.innerHTML = `
                    <div class="plot-num">${plt.plot}</div>
                    <div class="plot-trt" style="font-size: ${isDefaultName ? '1rem' : '0.8rem'}; word-break: break-word;">${displayContent}</div>
                    <div class="plot-rep">Rep ${plt.repId}</div>
                `;

                // Assign consistent color based on treatment ID
                const bgColor = getColor(plt.trtId);
                plotDiv.style.backgroundColor = bgColor;

                // Adjust border to be a slightly stronger version of the bg, or keep uniform
                // plotDiv.style.border = '1px solid #00a651'; // Old border
                plotDiv.style.border = `1px solid hsla(${(plt.trtId * 137.508) % 360}, 70%, 40%, 0.6)`; // Matching darker border

                plotDiv.style.padding = '10px';
                plotDiv.style.borderRadius = '8px';
                plotDiv.style.textAlign = 'center';

                // Ensure text is readable (dark text on light bg is usually fine with these params)
                plotDiv.style.color = '#000';

                grid.appendChild(plotDiv);
            });

            mapContainer.appendChild(grid);
        }

        // Tab Switching
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

        // Exports
        if (exportBtn) {
            exportBtn.addEventListener('click', () => {
                if (!currentGenerator) return;
                const data = currentGenerator.fieldBook;
                const headers = ["Plot", "Location", "RepID", "TreatmentID", "TreatmentName"];
                if (data[0].yield !== null) headers.push("Yield");

                const csv = [
                    headers.join(","),
                    ...data.map(r => {
                        const base = [r.plot, r.location, r.repId, r.trtId, r.trtName];
                        if (r.yield !== null) base.push(r.yield);
                        return base.join(",");
                    })
                ].join("\n");

                const blob = new Blob([csv], { type: 'text/csv' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `crd_design_${Date.now()}.csv`;
                a.click();
            });
        }

        if (downloadExcelBtn) {
            downloadExcelBtn.addEventListener('click', () => {
                if (!currentGenerator) return;
                const data = currentGenerator.fieldBook;
                const headers = ["Plot", "Location", "RepID", "TreatmentID", "TreatmentName"];
                if (data[0].yield !== null) headers.push("Yield");

                const csv = [
                    headers.join(","),
                    ...data.map(r => {
                        const base = [r.plot, r.location, r.repId, r.trtId, r.trtName];
                        if (r.yield !== null) base.push(r.yield);
                        return base.join(",");
                    })
                ].join("\n");

                const blob = new Blob([csv], { type: 'text/csv' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `crd_field_book_${Date.now()}.csv`;
                a.click();
            });
        }

        if (downloadMapBtn) {
            downloadMapBtn.addEventListener('click', () => {
                if (!currentGenerator || !mapContainer) return;
                const btn = downloadMapBtn;
                const oldText = btn.innerHTML;

                if (typeof html2canvas !== 'function') {
                    alert('html2canvas library not loaded');
                    return;
                }

                btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Rendering...';
                btn.disabled = true;

                // Capture the inner wrapper to get full size without scrollbars or container borders
                const elementToCapture = mapContainer.querySelector('.map-grid-wrapper') || mapContainer;

                html2canvas(elementToCapture, {
                    backgroundColor: null,
                    scale: 3,
                    logging: false,
                    useCORS: true
                }).then(canvas => {
                    const link = document.createElement('a');
                    link.download = `crd_field_map_${Date.now()}.png`;
                    link.href = canvas.toDataURL('image/png', 1.0);
                    link.click();
                    btn.innerHTML = oldText;
                    btn.disabled = false;
                }).catch((err) => {
                    console.error(err);
                    btn.innerHTML = oldText;
                    btn.disabled = false;
                });
            });
        }

    } catch (err) {
        console.error("Initialization Error:", err);
    }
});
