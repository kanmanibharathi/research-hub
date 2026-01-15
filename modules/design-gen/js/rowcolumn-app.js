/**
 * Row-Column Design Generator Logic
 * Implements a heuristic randomization approach for resolvable Row-Column designs.
 */
'use strict';

class RowColumnGenerator {
    constructor() {
        this.initEventListeners();
        this.mulberry = null;
        this.currentDesign = null;
        this.fieldBookData = null;
    }

    initEventListeners() {
        const genBtn = document.getElementById('generate-btn');
        const expBtn = document.getElementById('export-btn');

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

    generate() {
        const tInput = document.getElementById('t-input');
        const rowsInput = document.getElementById('rows-input');
        const repsInput = document.getElementById('reps-input');
        const locInput = document.getElementById('loc-input');
        const iterInput = document.getElementById('iter-input');
        const plotInput = document.getElementById('plot-input');
        const seedInput = document.getElementById('seed-input');
        const trtNamesInput = document.getElementById('trt-names');

        if (!tInput || !rowsInput || !repsInput) return;

        const t = parseInt(tInput.value);
        const rowsPerRep = parseInt(rowsInput.value);
        const r = parseInt(repsInput.value);
        const lCount = parseInt(locInput.value);
        const iterations = parseInt(iterInput.value);
        const startPlot = parseInt(plotInput.value);
        const rawSeed = seedInput.value;
        let seed = (rawSeed !== "" && rawSeed !== null) ? parseInt(rawSeed) : Math.floor(Math.random() * 999999);

        if (t % rowsPerRep !== 0) {
            alert(`Number of treatments (${t}) must be divisible by the number of rows (${rowsPerRep}).`);
            return;
        }

        const colsPerRep = t / rowsPerRep;
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

                let grid = [];
                for (let rIdx = 0; rIdx < rowsPerRep; rIdx++) {
                    grid.push(repTrts.slice(rIdx * colsPerRep, (rIdx + 1) * colsPerRep));
                }

                for (let iter = 0; iter < iterations / 100; iter++) {
                    const c = Math.floor(this.mulberry() * colsPerRep);
                    const r1 = Math.floor(this.mulberry() * rowsPerRep);
                    const r2 = Math.floor(this.mulberry() * rowsPerRep);
                    [grid[r1][c], grid[r2][c]] = [grid[r2][c], grid[r1][c]];
                }

                locReps.push(grid);
            }
            locationsData.push(locReps);
        }

        this.currentDesign = {
            t, rowsPerRep, colsPerRep, r, lCount, startPlot, seed, iterations, locationsData
        };

        this.render();
    }

    render() {
        if (!this.currentDesign) return;
        const { t, rowsPerRep, colsPerRep, r, lCount, startPlot, seed, locationsData } = this.currentDesign;

        if (document.getElementById('info-rows')) document.getElementById('info-rows').textContent = rowsPerRep;
        if (document.getElementById('info-cols')) document.getElementById('info-cols').textContent = colsPerRep;
        if (document.getElementById('info-total')) document.getElementById('info-total').textContent = t * r * lCount;

        const results = document.getElementById('results');
        if (results) results.style.display = 'block';

        const tbody = document.querySelector('#field-book-table tbody');
        if (tbody) {
            tbody.innerHTML = '';
            const fieldBookRows = [];

            let globalId = 1;
            locationsData.forEach((locReps, lIdx) => {
                let locStartPlot = startPlot + (lIdx * 1000);
                locReps.forEach((repGrid, rIdx) => {
                    const repId = rIdx + 1;
                    repGrid.forEach((row, rowIdx) => {
                        const rowNum = rowIdx + 1;
                        row.forEach((trt, colIdx) => {
                            const colNum = colIdx + 1;
                            const plot = locStartPlot + (rIdx * t) + (rowIdx * colsPerRep) + colIdx;

                            const tr = document.createElement('tr');
                            tr.innerHTML = `
                                <td>${globalId}</td>
                                <td>Loc ${lIdx + 1}</td>
                                <td>${plot}</td>
                                <td>${repId}</td>
                                <td>${rowNum}</td>
                                <td>${colNum}</td>
                                <td>${trt.entry}</td>
                                <td>${trt.name}</td>
                            `;
                            tbody.appendChild(tr);

                            fieldBookRows.push({
                                id: globalId++,
                                location: lIdx + 1,
                                plot: plot,
                                rep: repId,
                                row: rowNum,
                                column: colNum,
                                entry: trt.entry,
                                name: trt.name
                            });
                        });
                    });
                });
            });
            this.fieldBookData = fieldBookRows;
        }

        const mapContainer = document.getElementById('map-container');
        if (mapContainer) {
            mapContainer.innerHTML = '';

            locationsData.forEach((locReps, lIdx) => {
                const locHeader = document.createElement('h3');
                locHeader.style.margin = '2rem 0 1rem';
                locHeader.style.color = 'var(--text-dim)';
                locHeader.textContent = `Location ${lIdx + 1}`;
                mapContainer.appendChild(locHeader);

                locReps.forEach((repGrid, rIdx) => {
                    const repDiv = document.createElement('div');
                    repDiv.className = 'replicate-group';
                    repDiv.innerHTML = `<div class="replicate-title">Replicate ${rIdx + 1}</div>`;

                    const grid = document.createElement('div');
                    grid.className = 'matrix-grid';
                    grid.style.gridTemplateColumns = `repeat(${colsPerRep}, 1fr)`;

                    let locStartPlot = startPlot + (lIdx * 1000);
                    repGrid.forEach((row, rowIdx) => {
                        row.forEach((trt, colIdx) => {
                            const plot = locStartPlot + (rIdx * t) + (rowIdx * colsPerRep) + colIdx;
                            const cell = document.createElement('div');
                            cell.className = 'cell';
                            cell.innerHTML = `
                                <div class="cell-plot">${plot}</div>
                                <div class="trt-name">${trt.name}</div>
                            `;
                            grid.appendChild(cell);
                        });
                    });

                    repDiv.appendChild(grid);
                    mapContainer.appendChild(repDiv);
                });
            });
        }
    }

    exportCSV() {
        if (!this.fieldBookData) return;
        let csv = 'ID,Location,Plot,Rep,Row,Column,Entry,Treatment\n';
        this.fieldBookData.forEach(row => {
            csv += `${row.id},${row.location},${row.plot},${row.rep},${row.row},${row.column},${row.entry},"${row.name}"\n`;
        });
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'RowColumn_FieldBook.csv';
        a.click();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    try {
        if (document.getElementById('generate-btn')) {
            window.app = new RowColumnGenerator();
        }
    } catch (e) {
        console.error("Row Column Init Error", e);
    }
});
