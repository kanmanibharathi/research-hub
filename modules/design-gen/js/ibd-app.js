/**
 * Resolvable Incomplete Block Design (IBD) Logic
 * Enhanced with Efficiency Estimation and Re-randomization
 */
'use strict';

class IBDGenerator {
    constructor(t, k, r, locations, seed = null) {
        this.t = parseInt(t);
        this.k = parseInt(k);
        this.r = parseInt(r);
        this.L = parseInt(locations);
        this.seed = (seed !== null && seed !== undefined && !isNaN(seed)) ? seed : Math.floor(Math.random() * 1000000);

        this.fieldBook = [];
        this.info = {};
        this.treatments = Array.from({ length: this.t }, (_, i) => i + 1);
        this.designStructure = [];
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
        const s = this.t / this.k; // Blocks per rep

        if (this.t % this.k !== 0) {
            throw new Error(`Treatments (t=${this.t}) must be divisible by Block Size (k=${this.k}).`);
        }

        this.fieldBook = [];
        let globalId = 1;

        // Store design structure separately for efficiency calculation
        // designStructure[rep][block] = [trts]
        this.designStructure = [];

        for (let loc = 1; loc <= this.L; loc++) {
            let plotNum = startPlot + (loc - 1) * 1000;
            let siteDesigns = [];

            for (let rep = 1; rep <= this.r; rep++) {
                let repTrts = [...this.treatments];
                this.shuffle(repTrts, random);

                let blocks = [];
                for (let b = 1; b <= s; b++) {
                    const blockTrts = repTrts.slice((b - 1) * this.k, b * this.k);
                    blocks.push(blockTrts);
                    blockTrts.forEach(trt => {
                        this.fieldBook.push({
                            id: globalId++,
                            location: `Loc${loc}`,
                            siteIdx: loc,
                            plot: plotNum++,
                            rep: rep,
                            iblock: b,
                            entry: trt,
                            treatment: `G-${trt}`
                        });
                    });
                }
                siteDesigns.push(blocks);
            }
            this.designStructure.push(siteDesigns);
        }

        const efficiencies = this.calculateEfficiencies();

        this.info = {
            totalUnits: this.t * this.r * this.L,
            blocksPerRep: s,
            aEff: efficiencies.aEff.toFixed(4),
            dEff: efficiencies.dEff.toFixed(4)
        };

        return this.fieldBook;
    }

    rerandomize() {
        // Keeps the same treatment IDs but shuffles the physical labels
        // Logic similar to R's rerandomize_ibd
        const random = this.mulberry32(Math.floor(Math.random() * 999999));

        // Map old treatments to new labels
        let newLabels = [...this.treatments];
        this.shuffle(newLabels, random);
        const mapping = {};
        this.treatments.forEach((old, i) => {
            mapping[old] = newLabels[i];
        });

        // Update Field Book
        this.fieldBook.forEach(row => {
            const newTrt = mapping[row.entry];
            row.entry = newTrt;
            row.treatment = `G-${newTrt}`;
        });

        return this.fieldBook;
    }

    calculateEfficiencies() {
        const t = this.t;
        const r = this.r;
        const k = this.k;

        if (!this.designStructure || this.designStructure.length === 0) return { aEff: 0, dEff: 0 };
        const design = this.designStructure[0];

        // 1. Build N (t x b) matrix, where b = r * s (blocks across all reps)
        // But we actually need NN' (t x t)
        // (NN')_ij = count of blocks containing both i and j
        const lambda = Array.from({ length: t }, () => new Float64Array(t).fill(0));

        design.forEach(rep => {
            rep.forEach(block => {
                for (let i = 0; i < block.length; i++) {
                    for (let j = 0; j < block.length; j++) {
                        lambda[block[i] - 1][block[j] - 1]++;
                    }
                }
            });
        });

        const C = Array.from({ length: t }, () => new Float64Array(t));
        for (let i = 0; i < t; i++) {
            for (let j = 0; j < t; j++) {
                if (i === j) {
                    C[i][j] = r * (k - 1) / k;
                } else {
                    C[i][j] = -lambda[i][j] / k;
                }
            }
        }

        const eigs = this.getEigenvalues(C);
        eigs.sort((a, b) => b - a);
        const activeEigs = eigs.slice(0, t - 1);
        const effFactors = activeEigs.map(mu => mu / r);

        let sumInv = 0;
        let sumLog = 0;
        effFactors.forEach(e => {
            if (e > 1e-9) {
                sumInv += 1 / e;
                sumLog += Math.log(e);
            }
        });

        const aEff = (t - 1) / sumInv;
        const dEff = Math.exp(sumLog / (t - 1));

        return { aEff: isFinite(aEff) ? aEff : 0, dEff: isFinite(dEff) ? dEff : 0 };
    }

    getEigenvalues(M) {
        const n = M.length;
        const A = M.map(row => new Float64Array(row));
        const maxIter = 100;
        const eps = 1e-9;

        for (let iter = 0; iter < maxIter; iter++) {
            let maxVal = 0;
            let p = 0, q = 0;

            for (let i = 0; i < n; i++) {
                for (let j = i + 1; j < n; j++) {
                    if (Math.abs(A[i][j]) > maxVal) {
                        maxVal = Math.abs(A[i][j]);
                        p = i;
                        q = j;
                    }
                }
            }

            if (maxVal < eps) break;

            const theta = (A[q][q] - A[p][p]) / (2 * A[p][q]);
            const t = Math.sign(theta) / (Math.abs(theta) + Math.sqrt(1 + theta * theta));
            const c = 1 / Math.sqrt(1 + t * t);
            const s = c * t;

            const app = A[p][p];
            const aqq = A[q][q];
            const apq = A[p][q];

            A[p][p] = app - t * apq;
            A[q][q] = aqq + t * apq;
            A[p][q] = 0;
            A[q][p] = 0;

            for (let i = 0; i < n; i++) {
                if (i !== p && i !== q) {
                    const aip = A[i][p];
                    const aiq = A[i][q];
                    A[i][p] = c * aip - s * aiq;
                    A[p][i] = A[i][p];
                    A[i][q] = c * aiq + s * aip;
                    A[q][i] = A[i][q];
                }
            }
        }
        return A.map((row, i) => row[i]);
    }
}

// UI Controller
document.addEventListener('DOMContentLoaded', () => {
    try {
        const generateBtn = document.getElementById('generate-btn');
        const rerandBtn = document.getElementById('rerand-btn');
        const resultsSection = document.getElementById('results');
        const fbTableBody = document.querySelector('#fb-table tbody');
        const locContainer = document.getElementById('loc-container');
        const tabs = document.querySelectorAll('.tab');
        const exportBtn = document.getElementById('export-btn');
        const dlPngBtn = document.getElementById('download-png');

        if (!generateBtn) return;

        let currentGenerator = null;

        generateBtn.addEventListener('click', () => {
            if (!window.requireAuth || !window.requireAuth()) {
                console.warn("Auth required");
                return;
            }
            const tInput = document.getElementById('t-input');
            const kInput = document.getElementById('k-input');
            const rInput = document.getElementById('r-input');
            const locsInput = document.getElementById('loc-input');
            const plotStartInput = document.getElementById('plot-start');
            const seedInput = document.getElementById('seed-input');

            if (!tInput || !kInput || !rInput) return;

            const t = tInput.value;
            const k = kInput.value;
            const r = rInput.value;
            const locs = locsInput.value;
            const plotStart = parseInt(plotStartInput.value);

            const rawSeed = seedInput.value;
            const seed = (rawSeed !== "" && rawSeed !== null) ? parseInt(rawSeed) : null;

            try {
                const generator = new IBDGenerator(t, k, r, locs, seed);
                const data = generator.generate(plotStart);
                currentGenerator = generator;

                updateSummary(generator);
                renderFieldMap(generator);
                renderTable(data);

                if (resultsSection) {
                    resultsSection.style.display = 'block';
                    resultsSection.scrollIntoView({ behavior: 'smooth' });
                }
                if (rerandBtn) rerandBtn.style.display = 'block';

            } catch (e) {
                console.error(e);
                alert("Error: " + e.message);
            }
        });

        if (rerandBtn) {
            rerandBtn.addEventListener('click', () => {
                if (!currentGenerator) return;
                const data = currentGenerator.rerandomize();
                renderFieldMap(currentGenerator);
                renderTable(data);
                if (resultsSection) {
                    resultsSection.style.opacity = '0.5';
                    setTimeout(() => resultsSection.style.opacity = '1', 200);
                }
            });
        }

        function updateSummary(gen) {
            if (document.getElementById('sum-aeff')) document.getElementById('sum-aeff').textContent = gen.info.aEff;
            if (document.getElementById('sum-deff')) document.getElementById('sum-deff').textContent = gen.info.dEff;
        }

        function renderFieldMap(gen) {
            if (!locContainer) return;
            locContainer.innerHTML = '';

            for (let l = 1; l <= gen.L; l++) {
                const locDiv = document.createElement('div');
                locDiv.innerHTML = `<h2 style="margin-bottom: 2rem; border-left: 4px solid var(--primary); padding-left: 1rem;">Location ${l}</h2>`;

                for (let r = 1; r <= gen.r; r++) {
                    const repDiv = document.createElement('div');
                    repDiv.className = 'rep-container';
                    repDiv.innerHTML = `<div class="rep-title">Replicate ${r}</div>`;

                    const blocksGrid = document.createElement('div');
                    blocksGrid.className = 'blocks-grid';

                    const repData = gen.fieldBook.filter(d => d.siteIdx === l && d.rep === r);
                    const s = gen.info.blocksPerRep;

                    for (let b = 1; b <= s; b++) {
                        const blockBox = document.createElement('div');
                        blockBox.className = 'iblock-box';
                        blockBox.innerHTML = `<div class="iblock-title">Incomplete Block ${b}</div>`;

                        const unitsGrid = document.createElement('div');
                        unitsGrid.className = 'units-grid';

                        const blockData = repData.filter(d => d.iblock === b);
                        blockData.forEach(plot => {
                            unitsGrid.innerHTML += `
                                <div class="unit-cell">
                                    <small>P${plot.plot}</small>
                                    ${plot.entry}
                                </div>
                            `;
                        });

                        blockBox.appendChild(unitsGrid);
                        blocksGrid.appendChild(blockBox);
                    }

                    repDiv.appendChild(blocksGrid);
                    locDiv.appendChild(repDiv);
                }
                locContainer.appendChild(locDiv);
            }
        }

        function renderTable(data) {
            if (!fbTableBody) return;
            fbTableBody.innerHTML = '';
            data.forEach(row => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${row.id}</td>
                    <td>${row.location}</td>
                    <td>${row.plot}</td>
                    <td>${row.rep}</td>
                    <td>${row.iblock}</td>
                    <td>${row.entry}</td>
                    <td><strong>${row.treatment}</strong></td>
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

        if (exportBtn) {
            exportBtn.addEventListener('click', () => {
                if (!currentGenerator) return;
                const headers = ["ID", "Location", "Plot", "Rep", "IBlock", "Entry", "Treatment"];
                const csv = [headers.join(",")];
                currentGenerator.fieldBook.forEach(row => {
                    csv.push([row.id, row.location, row.plot, row.rep, row.iblock, row.entry, row.treatment].join(","));
                });
                const blob = new Blob([csv.join("\n")], { type: 'text/csv' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `ibd_design_${Date.now()}.csv`;
                a.click();
            });
        }

        if (dlPngBtn) {
            dlPngBtn.addEventListener('click', () => {
                const container = document.getElementById('map-capture');
                if (!container || typeof html2canvas !== 'function') {
                    alert("Cannot export map.");
                    return;
                }
                html2canvas(container, {
                    backgroundColor: "#1f2122",
                    scale: 2
                }).then(canvas => {
                    const a = document.createElement('a');
                    a.download = `ibd_field_map_${Date.now()}.png`;
                    a.href = canvas.toDataURL();
                    a.click();
                });
            });
        }
    } catch (err) {
        console.error("IBD App Init Error", err);
    }
});
