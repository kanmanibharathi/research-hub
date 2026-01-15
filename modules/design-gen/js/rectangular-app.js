/**
 * Rectangular Lattice Design Generator
 * Validates t = s(s-1) and k = s-1
 */
'use strict';

class RectangularLatticeGenerator {
    constructor() {
        this.initEventListeners();
        this.mulberry = null;
        this.currentDesign = null;
        this.fieldBookData = null;
    }

    initEventListeners() {
        const tInput = document.getElementById('t-input');
        const kInput = document.getElementById('k-input');
        const genBtn = document.getElementById('generate-btn');
        const expBtn = document.getElementById('export-btn');

        if (tInput && kInput) {
            tInput.addEventListener('input', () => {
                const t = parseInt(tInput.value);
                const s = Math.round(Math.sqrt(t)) + 1; // Solve t = s(s-1) approx
                if (s * (s - 1) === t) {
                    kInput.value = s - 1;
                    if (document.getElementById('t-validation')) document.getElementById('t-validation').style.display = 'none';
                } else {
                    if (document.getElementById('t-validation')) document.getElementById('t-validation').style.display = 'block';
                }
            });
        }

        if (genBtn) {
            genBtn.addEventListener('click', () => {
                if (!window.requireAuth || !window.requireAuth()) {
                    console.warn("Auth required");
                    return;
                }
                try {
                    this.generate();
                } catch (e) {
                    console.error(e);
                    alert("Error: " + e.message);
                }
            });
        }

        if (expBtn) {
            expBtn.addEventListener('click', () => this.exportCSV());
        }

        const dlExcelBtn = document.getElementById('download-excel-btn');
        if (dlExcelBtn) {
            dlExcelBtn.addEventListener('click', () => this.exportCSV());
        }

        const simBtn = document.getElementById('simulate-btn');
        if (simBtn) {
            simBtn.addEventListener('click', () => this.simulate());
        }

        const dlMapBtn = document.getElementById('download-map-btn');
        if (dlMapBtn) {
            dlMapBtn.addEventListener('click', () => this.downloadMap());
        }

        const locSelect = document.getElementById('location-select');
        if (locSelect) {
            locSelect.addEventListener('change', () => this.render());
        }

        const layoutSelect = document.getElementById('map-layout-select');
        if (layoutSelect) {
            layoutSelect.addEventListener('change', () => this.render());
        }

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
    }

    populateLocationSelect(count) {
        const select = document.getElementById('location-select');
        const controls = document.getElementById('location-controls');
        if (!select || !controls) return;

        select.innerHTML = '';
        for (let i = 1; i <= count; i++) {
            const option = document.createElement('option');
            option.value = i;
            option.textContent = `Location ${i}`;
            select.appendChild(option);
        }

        if (count > 0) {
            controls.style.display = 'flex';
            select.value = 1;
        } else {
            controls.style.display = 'none';
        }
    }

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

    simulate() {
        if (!this.fieldBookData) return;
        this.fieldBookData.forEach(row => {
            row.value = (Math.random() * 40 + 10).toFixed(1);
        });
        this.render();
        alert("Simulation completed! Values added to Field Book.");
        const fbTab = document.querySelector('.tab[data-tab="field-book"]');
        if (fbTab) fbTab.click();
    }

    downloadMap() {
        const mapContainer = document.getElementById('map-container');
        if (!mapContainer || mapContainer.innerHTML === '') {
            alert("No map to download.");
            return;
        }
        html2canvas(mapContainer, {
            backgroundColor: null,
            scale: 2,
            logging: false,
            useCORS: true
        }).then(canvas => {
            const link = document.createElement('a');
            link.download = 'rectangular_lattice_map.png';
            link.href = canvas.toDataURL('image/png');
            link.click();
        });
    }

    generate() {
        const tInput = document.getElementById('t-input');
        const rInput = document.getElementById('r-input');
        const locInput = document.getElementById('loc-input');
        const plotInput = document.getElementById('plot-input');
        const seedInput = document.getElementById('seed-input');
        const trtNamesInput = document.getElementById('data-input'); // Changed ID in HTML

        if (!tInput || !rInput) return;

        const t = parseInt(tInput.value);
        const r = parseInt(rInput.value);
        const lCount = parseInt(locInput.value);
        const startPlot = parseInt(plotInput.value);

        const rawSeed = seedInput.value;
        let seed = (rawSeed !== "" && rawSeed !== null) ? parseInt(rawSeed) : Math.floor(Math.random() * 999999);

        // Calculate s from t = s(s-1)
        const s = (1 + Math.sqrt(1 + 4 * t)) / 2;
        if (s % 1 !== 0) {
            alert("Invalid number of treatments. t must satisfy t = s(s-1). Examples: 6, 12, 20, 30, 42, 56, 72...");
            return;
        }

        const k = s - 1;
        if (isNaN(seed)) seed = Math.floor(Math.random() * 999999);
        this.mulberry = this.mulberry32(seed);

        const trtNamesRaw = trtNamesInput ? trtNamesInput.value.split('\n').filter(x => x.trim() !== '') : [];
        const treatments = [];
        for (let i = 1; i <= t; i++) {
            treatments.push({
                entry: i,
                name: trtNamesRaw[i - 1] || `G-${i}`
            });
        }

        const locationsData = [];
        for (let loc = 1; loc <= lCount; loc++) {
            const locReps = [];
            for (let repNum = 1; repNum <= r; repNum++) {
                let repTrts = [...treatments];
                this.shuffle(repTrts);

                const iblocks = [];
                for (let i = 0; i < s; i++) {
                    const blockTrts = repTrts.slice(i * k, (i + 1) * k);
                    iblocks.push(blockTrts);
                }
                locReps.push(iblocks);
            }
            locationsData.push(locReps);
        }

        const lambda = (r * (k - 1)) / (t - 1);

        this.currentDesign = {
            t, r, k, s, lCount, startPlot, seed, lambda, locationsData
        };

        // Populate Select
        this.populateLocationSelect(lCount);

        // Initialize FieldBookData here to consistent state
        let tempFB = [];
        let globalId = 1;
        locationsData.forEach((locReps, lIdx) => {
            let currentPlot = startPlot + (lIdx * 1000);
            locReps.forEach((rep, rIdx) => {
                rep.forEach((block, bIdx) => {
                    block.forEach((trt, pIdx) => {
                        tempFB.push({
                            id: globalId++,
                            location: lIdx + 1,
                            plot: currentPlot++,
                            rep: rIdx + 1,
                            iblock: bIdx + 1,
                            entry: trt.entry,
                            name: trt.name,
                            value: ""
                        });
                    });
                });
            });
        });
        this.fieldBookData = tempFB;

        this.render();
    }

    render() {
        if (!this.currentDesign || !this.fieldBookData) return;
        const { t, r, k, s, lCount, startPlot, seed, lambda } = this.currentDesign;

        if (document.getElementById('info-s')) document.getElementById('info-s').textContent = s;
        if (document.getElementById('info-k')) document.getElementById('info-k').textContent = k;
        if (document.getElementById('info-lambda')) document.getElementById('info-lambda').textContent = lambda.toFixed(4);
        if (document.getElementById('info-total')) document.getElementById('info-total').textContent = t * r * lCount;

        const results = document.getElementById('results');
        if (results) results.style.display = 'block';

        const actionRow = document.getElementById('action-buttons-row');
        if (actionRow) actionRow.classList.remove('d-none');

        // Filter by Location
        const locSelect = document.getElementById('location-select');
        let selectedLoc = 1;
        if (locSelect && locSelect.value) {
            selectedLoc = parseInt(locSelect.value);
        }

        const filteredData = this.fieldBookData.filter(d => d.location === selectedLoc);

        // Get Map Layout
        const layoutSelect = document.getElementById('map-layout-select');
        const layout = layoutSelect ? layoutSelect.value : 'horizontal';

        // Render Table
        const table = document.getElementById('field-book-table');
        const thead = table.querySelector('thead tr');
        const tbody = table.querySelector('tbody');

        if (tbody) {
            const hasValue = filteredData.some(row => row.value !== "");
            thead.innerHTML = `
                <th>ID</th>
                <th>Location</th>
                <th>Plot</th>
                <th>Replicate</th>
                <th>IBlock</th>
                <th>Entry</th>
                <th>Treatment</th>
                ${hasValue ? '<th>Value</th>' : ''}
            `;

            tbody.innerHTML = '';
            filteredData.forEach(row => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${row.id}</td>
                    <td>Loc ${row.location}</td>
                    <td>${row.plot}</td>
                    <td>${row.rep}</td>
                    <td>${row.iblock}</td>
                    <td>${row.entry}</td>
                    <td>${row.name}</td>
                    ${hasValue ? `<td>${row.value}</td>` : ''}
                `;
                tbody.appendChild(tr);
            });
        }

        // Render Map
        const mapContainer = document.getElementById('map-container');
        if (mapContainer) {
            mapContainer.innerHTML = '';

            // Render selected location only
            const locDiv = document.createElement('div');
            locDiv.innerHTML = `<h3 class="site-title">Location ${selectedLoc}</h3>`;

            const repsContainer = document.createElement('div');
            repsContainer.className = 'reps-container';

            // Group by Rep using filteredData
            const reps = [...new Set(filteredData.map(d => d.rep))];

            reps.forEach(r => {
                const repGroup = document.createElement('div');
                repGroup.className = 'replicate-group';
                repGroup.innerHTML = `<div class="replicate-title">Replicate ${r}</div>`;

                const blocksGrid = document.createElement('div');
                blocksGrid.className = 'blocks-grid';

                // Apply Layout to Blocks
                if (layout === 'horizontal') {
                    blocksGrid.style.display = 'flex';
                    blocksGrid.style.flexWrap = 'wrap';
                    blocksGrid.style.flexDirection = 'row';
                } else {
                    blocksGrid.style.display = 'grid'; // Default vertical stack
                    blocksGrid.style.gridTemplateColumns = '1fr';
                }

                const repData = filteredData.filter(d => d.rep === r);
                const blocks = [...new Set(repData.map(d => d.iblock))];

                blocks.forEach(b => {
                    const blockData = repData.filter(d => d.iblock === b);
                    const blockRow = document.createElement('div');
                    blockRow.className = 'block-row';
                    blockRow.innerHTML = `<div class="block-label">Block ${b}</div>`;

                    const plotsContainer = document.createElement('div');
                    plotsContainer.className = 'plots-container';

                    // Apply Block Orientation
                    if (layout === 'horizontal') {
                        // Blocks are Columns (Plots stacked vertically)
                        blockRow.style.flexDirection = 'column';
                        plotsContainer.style.flexDirection = 'column';
                    } else {
                        // Blocks are Rows (Plots side-by-side)
                        blockRow.style.flexDirection = 'row';
                        plotsContainer.style.flexDirection = 'row';
                    }

                    blockData.forEach(p => {
                        const cell = document.createElement('div');
                        cell.className = 'plot-cell';
                        cell.innerHTML = `
                            <div class="plot-num">${p.entry}</div>
                            <div class="trt-name">${p.name}</div>
                       `;
                        plotsContainer.appendChild(cell);
                    });

                    blockRow.appendChild(plotsContainer);
                    blocksGrid.appendChild(blockRow);
                });

                repGroup.appendChild(blocksGrid);
                repsContainer.appendChild(repGroup);
            });

            locDiv.appendChild(repsContainer);
            mapContainer.appendChild(locDiv);
        }
    }

    exportCSV() {
        if (!this.fieldBookData) return;
        const hasValue = this.fieldBookData.some(row => row.value !== "");
        let csv = 'ID,Location,Plot,Replicate,IBlock,Entry,Treatment';
        if (hasValue) csv += ',Value';
        csv += '\n';

        this.fieldBookData.forEach(row => {
            csv += `${row.id},${row.location},${row.plot},${row.rep},${row.iblock},${row.entry},"${row.name}"`;
            if (hasValue) csv += `,${row.value}`;
            csv += '\n';
        });
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'Rectangular_Lattice_FieldBook.csv';
        a.click();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    try {
        if (document.getElementById('generate-btn')) {
            window.app = new RectangularLatticeGenerator();
        }
    } catch (e) {
        console.error("Rectangular Lattice Init Error", e);
    }
});
