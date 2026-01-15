/**
 * Alpha Lattice Design Generator
 * Implements Patterson and Williams (1976) cyclic shift construction
 * Enhanced with simulation and serpentine layout
 */

class AlphaLattice {
    constructor(t, k, r, l = 1, seed = null) {
        this.t = parseInt(t); // Total treatments
        this.k = parseInt(k); // Block size
        this.r = parseInt(r); // Replicates
        this.l = parseInt(l); // Locations
        this.s = this.t / this.k; // Blocks per replicate
        // If seed is 0, we want to allow it, so check for null/undefined explicitly or use provided value
        this.seed = (seed !== null && seed !== undefined && !isNaN(seed)) ? seed : Math.floor(Math.random() * 10000);

        this.fieldBook = [];
        this.info = {};

        this.validate();
    }

    validate() {
        if (this.t % this.k !== 0) {
            throw new Error(`Treatments (t=${this.t}) must be a multiple of Block Size (k=${this.k}).`);
        }
    }

    // Seeded random number generator
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

    generate(startPlot = 101, customNames = [], layout = 'serpentine') {
        let currentSeed = this.seed;
        this.fieldBook = [];
        let globalId = 1;

        for (let loc = 1; loc <= this.l; loc++) {
            const random = this.mulberry32(currentSeed++);

            // Treatments list
            const treatments = Array.from({ length: this.t }, (_, i) => {
                return {
                    id: i + 1,
                    name: customNames[i] || `G-${i + 1}`
                };
            });

            // Randomize initial treatment assignment to the design structure
            this.shuffle(treatments, random);

            for (let rep = 1; rep <= this.r; rep++) {
                let blocks = Array.from({ length: this.s }, () => []);

                // Alpha Lattice Shift Construction
                // Basic Alpha(0,1) design series
                for (let j = 0; j < this.k; j++) {
                    for (let i = 0; i < this.s; i++) {
                        const trtIdx = i + (this.s * j);
                        const trt = treatments[trtIdx];

                        // Shift rule
                        let shift = 0;
                        if (rep > 1) {
                            shift = (rep - 1) * j;
                        }
                        const blockIdx = (i + shift) % this.s;
                        blocks[blockIdx].push(trt);
                    }
                }

                // Randomize block order
                let blockIndices = Array.from({ length: this.s }, (_, i) => i);
                this.shuffle(blockIndices, random);

                let plotInRep = 1;
                blockIndices.forEach((bIdx, displayBlockNum) => {
                    let blockTrts = [...blocks[bIdx]];
                    this.shuffle(blockTrts, random);

                    blockTrts.forEach((trt, unitInBlock) => {
                        // Plot Numbering Logic
                        let plotNum;
                        if (layout === 'serpentine') {
                            if (displayBlockNum % 2 === 0) {
                                plotNum = startPlot + (rep - 1) * 1000 + (displayBlockNum * this.k) + unitInBlock;
                            } else {
                                plotNum = startPlot + (rep - 1) * 1000 + (displayBlockNum * this.k) + (this.k - 1 - unitInBlock);
                            }
                        } else {
                            plotNum = startPlot + (rep - 1) * 1000 + (displayBlockNum * this.k) + unitInBlock;
                        }

                        this.fieldBook.push({
                            id: globalId++,
                            plot: plotNum,
                            location: `Loc ${loc}`,
                            replicate: rep,
                            block: displayBlockNum + 1,
                            unit: unitInBlock + 1,
                            trtId: trt.id,
                            trtName: trt.name,
                            yield: null // To be simulated
                        });
                        plotInRep++;
                    });
                });
            }
        }

        this.calculateInfo();
        return this.fieldBook;
    }

    calculateInfo() {
        // Efficiency Factor (approximate)
        const lambda = this.r * (this.k - 1) / (this.t - 1);
        this.info = {
            s: this.s,
            totalUnits: this.t * this.r * this.l,
            efficiency: ((1 - 1 / this.k) / (1 - 1 / this.t)).toFixed(4),
            lambda: lambda.toFixed(4)
        };
    }

    simulate(min = 70, max = 120) {
        const random = this.mulberry32(this.seed + 99);
        this.fieldBook.forEach(row => {
            row.yield = (min + random() * (max - min)).toFixed(2);
        });
        return this.fieldBook;
    }
}

// UI Controller
document.addEventListener('DOMContentLoaded', () => {
    const generateBtn = document.getElementById('generate-btn');
    const simulateBtn = document.getElementById('simulate-btn');
    const exportBtn = document.getElementById('export-btn');
    // const copyBtn = document.getElementById('copy-btn'); // Not used in HTML
    const resultsSection = document.getElementById('results');
    const fbTableBody = document.querySelector('#field-book-table tbody');
    const mapContainer = document.getElementById('map-container');
    const downloadMapBtn = document.getElementById('download-map-btn');
    const tabs = document.querySelectorAll('.tab');

    const tInput = document.getElementById('t-input');
    const kInput = document.getElementById('k-input');
    const rInput = document.getElementById('r-input');
    const lInput = document.getElementById('l-input');
    const plotInput = document.getElementById('plot-input');
    const seedInput = document.getElementById('seed-input');
    const layoutInput = document.getElementById('layout-input');
    const trtNamesArea = document.getElementById('trt-names');

    let currentDesignObj = null;

    // Auto-suggest k based on divisors of t
    if (tInput) {
        tInput.addEventListener('change', () => {
            const t = parseInt(tInput.value);
            const divisors = [];
            for (let i = 2; i <= Math.sqrt(t); i++) {
                if (t % i === 0) {
                    divisors.push(i);
                    if (i * i !== t) divisors.push(t / i);
                }
            }
            divisors.sort((a, b) => a - b);

            if (divisors.length > 0) {
                // Pick a divisor close to sqrt(t)
                const target = Math.sqrt(t);
                let best = divisors[0];
                divisors.forEach(d => {
                    if (Math.abs(d - target) < Math.abs(best - target)) best = d;
                });
                if (kInput) kInput.value = best;
            }
        });
    }

    if (generateBtn) {
        generateBtn.addEventListener('click', () => {
            try {
                const t = parseInt(tInput.value);
                const k = parseInt(kInput.value);
                const r = parseInt(rInput.value);
                const l = parseInt(lInput.value);
                const startPlot = parseInt(plotInput.value);
                // Handle seed input correctly: if empty, random; if 0, use 0
                const rawSeed = seedInput.value;
                const seed = (rawSeed !== "" && rawSeed !== null) ? parseInt(rawSeed) : Math.floor(Math.random() * 100000);
                const layout = layoutInput.value;

                const customNames = trtNamesArea.value ? trtNamesArea.value.split('\n').map(n => n.trim()).filter(n => n !== "") : [];

                const design = new AlphaLattice(t, k, r, l, seed);
                design.generate(startPlot, customNames, layout);
                currentDesignObj = design;

                updateUI(design);

                // Show results
                if (resultsSection) {
                    resultsSection.style.display = 'block';
                    resultsSection.scrollIntoView({ behavior: 'smooth' });
                }

                if (simulateBtn) simulateBtn.style.display = 'block';

            } catch (error) {
                console.error("Design Generation Error:", error);
                alert("Error: " + error.message);
            }
        });
    }

    if (simulateBtn) {
        simulateBtn.addEventListener('click', () => {
            if (!currentDesignObj) return;
            const data = currentDesignObj.simulate();
            renderTable(data);
            alert("Simulation successful! Yield data added to field book.");
        });
    }

    function updateUI(design) {
        const infoS = document.getElementById('info-s');
        const infoEff = document.getElementById('info-eff');
        const infoTotal = document.getElementById('info-total');

        if (infoS) infoS.textContent = design.s;
        if (infoEff) infoEff.textContent = design.info.efficiency;
        if (infoTotal) infoTotal.textContent = design.info.totalUnits;

        renderTable(design.fieldBook);
        renderMap(design);
    }

    function renderTable(data) {
        if (!fbTableBody) return;
        fbTableBody.innerHTML = '';
        data.forEach(row => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${row.plot}</td>
                <td>${row.location}</td>
                <td>${row.replicate}</td>
                <td>${row.block}</td>
                <td>${row.trtId}</td>
                <td><span style="color: #2ecc71; font-weight: 600;">${row.trtName}</span></td>
                ${row.yield ? `<td>${row.yield}</td>` : ''}
            `;
            // Add header for yield if not exists and data has yield
            const headerRow = document.querySelector('#field-book-table thead tr');
            if (row.yield && headerRow && headerRow.cells.length < 7) {
                const th = document.createElement('th');
                th.textContent = "Yield";
                headerRow.appendChild(th);
            }
            fbTableBody.appendChild(tr);
        });
    }

    function renderMap(design) {
        if (!mapContainer) return;
        mapContainer.innerHTML = '';
        const data = design.fieldBook;
        const s = design.s;
        const k = design.k;

        const reps = [...new Set(data.map(d => d.replicate))];
        reps.forEach(repNum => {
            // Filter only Loc 1 for visualization if multiple exists
            const repData = data.filter(d => d.replicate === repNum && (d.location === 'Loc 1' || d.location.endsWith(' 1')));
            // Only show map for Loc 1 to avoid clutter? Or show all?
            // Existing logic showed only Loc 1. If Loc > 1, maybe show first loc only.

            const repBox = document.createElement('div');
            repBox.className = 'replicate-box';

            const repTitle = document.createElement('div');
            repTitle.className = 'replicate-title';
            repTitle.textContent = `Replicate ${repNum}`;
            repBox.appendChild(repTitle);

            const grid = document.createElement('div');
            grid.className = 'blocks-grid';

            for (let b = 1; b <= s; b++) {
                const blockRow = document.createElement('div');
                blockRow.className = 'block-row';

                const label = document.createElement('div');
                label.className = 'block-label';
                label.textContent = `B-${b}`;
                blockRow.appendChild(label);

                const blockTrts = repData.filter(d => d.block === b);
                // Sort by plot number to respect serpentine visual order
                blockTrts.sort((a, b) => a.plot - b.plot);

                blockTrts.forEach(plt => {
                    const plotDiv = document.createElement('div');
                    plotDiv.className = 'plot';

                    const inner = document.createElement('div');
                    inner.style.textAlign = 'center';
                    inner.innerHTML = `<div style="font-size: 8px; opacity: 0.7;">P${plt.plot}</div><div>${plt.trtId}</div>`;

                    plotDiv.appendChild(inner);
                    plotDiv.setAttribute('data-trt', plt.trtName);
                    blockRow.appendChild(plotDiv);
                });
                grid.appendChild(blockRow);
            }
            repBox.appendChild(grid);
            mapContainer.appendChild(repBox);
        });
    }

    // Export logic
    if (exportBtn) {
        exportBtn.addEventListener('click', () => {
            if (!currentDesignObj) return;
            const data = currentDesignObj.fieldBook;
            const headers = ["Plot", "Location", "Replicate", "Block", "Unit", "TreatmentID", "TreatmentName"];
            if (data[0].yield) headers.push("Yield");

            const csv = [
                headers.join(","),
                ...data.map(r => {
                    const row = [r.plot, r.location, r.replicate, r.block, r.unit, r.trtId, r.trtName];
                    if (r.yield) row.push(r.yield);
                    return row.join(",");
                })
            ].join("\n");

            const blob = new Blob([csv], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `alpha_lattice_${Date.now()}.csv`;
            a.click();
        });
    }

    // Download Map Image
    if (downloadMapBtn) {
        downloadMapBtn.addEventListener('click', () => {
            if (typeof html2canvas === 'undefined') {
                alert("html2canvas library not loaded. Cannot export image.");
                return;
            }

            const btn = downloadMapBtn;
            const oldText = btn.innerHTML;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Rendering...';
            btn.disabled = true;

            html2canvas(document.getElementById('map-container'), {
                backgroundColor: "#1f2122",
                scale: 2,
                logging: false,
                useCORS: true
            }).then(canvas => {
                const link = document.createElement('a');
                link.download = `alpha_lattice_map_${Date.now()}.png`;
                link.href = canvas.toDataURL();
                link.click();
                btn.innerHTML = oldText;
                btn.disabled = false;
            }).catch(err => {
                console.error(err);
                btn.innerHTML = oldText;
                btn.disabled = false;
                alert('Error generating image');
            });
        });
    }

    // Tab logic
    if (tabs) {
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const target = tab.getAttribute('data-tab');
                const targetContent = document.getElementById(target);

                if (targetContent) {
                    tabs.forEach(t => t.classList.remove('active'));
                    tab.classList.add('active');

                    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                    targetContent.classList.add('active');
                }
            });
        });
    }
});
