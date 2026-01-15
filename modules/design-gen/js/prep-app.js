/**
 * Spatial Partially Replicated (P-Rep) Design Logic
 */
'use strict';

class PRepGenerator {
    constructor(rows, cols, groups, planter = 'serpentine', seed = null) {
        this.rows = parseInt(rows);
        this.cols = parseInt(cols);
        this.groups = groups; // Array of {gens, units}
        this.planter = planter;

        let s = seed;
        this.seed = (s !== null && s !== undefined && !isNaN(s)) ? parseInt(s) : Math.floor(Math.random() * 1000000);

        this.matrix = []; // [row][col] containing {id, name, type}
        this.fieldBook = [];
        this.score = 0;
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

    getDistance(p1, p2) {
        // Euclidean distance
        return Math.sqrt(Math.pow(p1.r - p2.r, 2) + Math.pow(p1.c - p2.c, 2));
    }

    calculateObjective(matrix) {
        // Objective: Minimize clustering of same varieties
        // We calculate the minimum distance between copies of same variety
        let totalMinDist = 0;
        let replicatedCount = 0;

        const varietyPos = {}; // id -> [{r, c}]
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                const cell = matrix[r][c];
                if (!cell || cell.type === 'Filler') continue;
                if (!varietyPos[cell.id]) varietyPos[cell.id] = [];
                varietyPos[cell.id].push({ r, c });
            }
        }

        for (let id in varietyPos) {
            const positions = varietyPos[id];
            if (positions.length > 1) {
                let minDist = Infinity;
                for (let i = 0; i < positions.length; i++) {
                    for (let j = i + 1; j < positions.length; j++) {
                        const d = this.getDistance(positions[i], positions[j]);
                        if (d < minDist) minDist = d;
                    }
                }
                totalMinDist += minDist;
                replicatedCount++;
            }
        }
        return replicatedCount === 0 ? 0 : totalMinDist / replicatedCount;
    }

    generate(startPlot = 101) {
        const random = this.mulberry32(this.seed);
        const totalUnits = this.groups.reduce((acc, g) => acc + g.gens * g.units, 0);
        const capacity = this.rows * this.cols;

        if (totalUnits > capacity) {
            throw new Error(`Field capacity (${capacity}) is less than total units required (${totalUnits}).`);
        }

        // 1. Create all units
        let allUnits = [];
        let genId = 1;
        this.groups.forEach(group => {
            for (let i = 0; i < group.gens; i++) {
                const type = group.units > 1 ? `rep${group.units}` : 'unrep';
                const name = group.units > 1 ? `R-${genId}` : `G-${genId}`;
                for (let j = 0; j < group.units; j++) {
                    allUnits.push({ id: genId, name: name, type, repIdx: j + 1 });
                }
                genId++;
            }
        });

        // Add Fillers
        while (allUnits.length < capacity) {
            allUnits.push({ id: 0, name: 'Filler', type: 'filler', repIdx: 1 });
        }

        // 2. Initial Random Placement
        this.shuffle(allUnits, random);
        let flatMatrix = [...allUnits];

        // 3. Simple Optimization (Hill Climbing / Swap)
        const maxIter = 1000; // Heuristic iterations

        let matrix2D = [];
        const to2D = (flat) => {
            let m = [];
            for (let r = 0; r < this.rows; r++) m.push(flat.slice(r * this.cols, (r + 1) * this.cols));
            return m;
        };

        matrix2D = to2D(flatMatrix);
        let currentScore = this.calculateObjective(matrix2D);

        for (let i = 0; i < maxIter; i++) {
            const idx1 = Math.floor(random() * flatMatrix.length);
            const idx2 = Math.floor(random() * flatMatrix.length);
            if (flatMatrix[idx1].id === flatMatrix[idx2].id) continue;

            // Swap
            [flatMatrix[idx1], flatMatrix[idx2]] = [flatMatrix[idx2], flatMatrix[idx1]];
            let nextMatrix = to2D(flatMatrix);
            let nextScore = this.calculateObjective(nextMatrix);

            if (nextScore >= currentScore) {
                currentScore = nextScore;
                matrix2D = nextMatrix;
            } else {
                // Revert
                [flatMatrix[idx1], flatMatrix[idx2]] = [flatMatrix[idx2], flatMatrix[idx1]];
            }
        }

        this.matrix = matrix2D;
        this.score = currentScore;

        // 4. Field Book
        this.fieldBook = [];
        let plotNum = startPlot;
        for (let r = 0; r < this.rows; r++) {
            let colsIter = Array.from({ length: this.cols }, (_, i) => i);
            if (this.planter === 'serpentine' && r % 2 !== 0) colsIter.reverse();

            colsIter.forEach(c => {
                const item = this.matrix[r][c];
                this.fieldBook.push({
                    plot: plotNum++,
                    row: r + 1,
                    col: c + 1,
                    entryId: item.id,
                    name: item.name,
                    type: item.type,
                    repIdx: item.repIdx
                });
            });
        }

        return this.fieldBook;
    }
}

// UI Controller
document.addEventListener('DOMContentLoaded', () => {
    try {
        const repsContainer = document.getElementById('reps-container');
        const addRepBtn = document.getElementById('add-rep-btn');
        const generateBtn = document.getElementById('generate-btn');
        const resultsSection = document.getElementById('results');
        const gridContainer = document.getElementById('grid-container');
        const fbTableBody = document.querySelector('#fb-table tbody');
        const tabs = document.querySelectorAll('.tab');
        const seedInputEl = document.getElementById('seed-input');
        const exportCsvBtn = document.getElementById('export-csv');
        const downloadPngBtn = document.getElementById('download-png');

        let currentGenerator = null;

        if (addRepBtn && repsContainer) {
            addRepBtn.addEventListener('click', () => {
                const div = document.createElement('div');
                div.className = 'rep-entry-row';
                div.innerHTML = `
                    <div>
                        <label>Genotypes</label>
                        <input type="number" class="rep-gens" value="10">
                    </div>
                    <div>
                        <label>Reps/Gen</label>
                        <input type="number" class="rep-units" value="3">
                    </div>
                    <div class="remove-btn"><i class="fas fa-trash"></i></div>
                `;
                div.querySelector('.remove-btn').onclick = () => div.remove();
                repsContainer.appendChild(div);
            });
        }

        if (generateBtn) {
            generateBtn.addEventListener('click', () => {
                if (!window.requireAuth || !window.requireAuth()) {
                    console.warn("Auth required");
                    return;
                }
                try {
                    const rowsEl = document.getElementById('rows-input');
                    const colsEl = document.getElementById('cols-input');
                    const planterEl = document.getElementById('planter-input');

                    if (!rowsEl || !colsEl) return;

                    const rows = rowsEl.value;
                    const cols = colsEl.value;
                    const planter = planterEl.value;
                    const seedVal = seedInputEl ? seedInputEl.value : null;

                    const groups = [];
                    document.querySelectorAll('.rep-entry-row').forEach(row => {
                        const gensInput = row.querySelector('.rep-gens');
                        const unitsInput = row.querySelector('.rep-units');
                        if (gensInput && unitsInput) {
                            const gens = parseInt(gensInput.value);
                            const units = parseInt(unitsInput.value);
                            if (gens > 0 && units > 0) groups.push({ gens, units });
                        }
                    });

                    if (groups.length === 0) {
                        alert("Please add at least one group of genotypes.");
                        return;
                    }

                    const gen = new PRepGenerator(rows, cols, groups, planter, seedVal);
                    gen.generate();
                    currentGenerator = gen;

                    // Stats
                    if (document.getElementById('stat-total')) document.getElementById('stat-total').textContent = rows * cols;

                    const repUnitsAll = groups.filter(g => g.units > 1).reduce((a, b) => a + b.gens * b.units, 0);
                    if (document.getElementById('stat-rep-perc')) document.getElementById('stat-rep-perc').textContent = `${((repUnitsAll / (rows * cols)) * 100).toFixed(1)}%`;
                    if (document.getElementById('stat-dist')) document.getElementById('stat-dist').textContent = gen.score.toFixed(2);

                    renderGrid(gen);
                    renderTable(gen.fieldBook);

                    if (resultsSection) {
                        resultsSection.style.display = 'block';
                        resultsSection.scrollIntoView({ behavior: 'smooth' });
                    }

                } catch (e) {
                    console.error(e);
                    alert(e.message);
                }
            });
        }

        function renderGrid(gen) {
            if (!gridContainer) return;
            gridContainer.innerHTML = '';
            gridContainer.style.gridTemplateColumns = `repeat(${gen.cols}, 42px)`;

            // Render Row 1 at bottom for spatial consistency
            for (let r = gen.rows - 1; r >= 0; r--) {
                for (let c = 0; c < gen.cols; c++) {
                    const item = gen.matrix[r][c];
                    const cell = document.createElement('div');
                    const typeClass = item.type.includes('rep') ? (parseInt(item.type.replace('rep', '')) > 3 ? 'repX' : item.type) : 'unrep';
                    cell.className = `cell ${typeClass}`;
                    if (item.id === 0) cell.classList.add('filler');

                    const fbEntry = gen.fieldBook.find(fb => fb.row === r + 1 && fb.col === c + 1);
                    cell.innerHTML = `
                        <div class="p-num">${fbEntry.plot}</div>
                        ${item.id !== 0 ? item.id : ''}
                    `;
                    cell.title = `${item.name} | Plot ${fbEntry.plot} (R${r + 1} C${c + 1})`;
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
                    <td>${row.repIdx}</td>
                `;
                fbTableBody.appendChild(tr);
            });
        }

        // Tabs
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                tabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                const target = tab.getAttribute('data-tab');
                if (!target) return;

                document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                const targetEl = document.getElementById(target);
                if (targetEl) targetEl.classList.add('active');
            });
        });

        // Exports
        if (exportCsvBtn) {
            exportCsvBtn.onclick = () => {
                if (!currentGenerator) return;
                const headers = ["Plot", "Row", "Col", "Entry", "Name", "RepIdx"];
                const csv = [headers.join(",")];
                currentGenerator.fieldBook.forEach(row => {
                    csv.push([row.plot, row.row, row.col, row.entryId, row.name, row.repIdx].join(","));
                });
                const blob = new Blob([csv.join("\n")], { type: 'text/csv' });
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = `prep_design_${Date.now()}.csv`;
                a.click();
            };
        }

        if (downloadPngBtn) {
            downloadPngBtn.onclick = () => {
                const container = document.getElementById('map-capture');
                if (!container || typeof html2canvas === 'undefined') {
                    alert("Map container missing or library error");
                    return;
                }
                html2canvas(container, { backgroundColor: null, scale: 3 }).then(canvas => {
                    const a = document.createElement('a');
                    a.download = `prep_field_map_${Date.now()}.png`;
                    a.href = canvas.toDataURL();
                    a.click();
                });
            };
        }
    } catch (e) {
        console.error("Prep App Init Error", e);
    }
});
