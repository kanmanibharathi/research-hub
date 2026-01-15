/**
 * Sparse & P-Rep Allocation Logic
 * Distributes lines across locations and randomizes each location.
 */
'use strict';

class AllocationDesign {
    constructor(lines, locations, copies, checks, checkReps, type = 'sparse', seed = null) {
        this.lines = parseInt(lines);
        this.L = parseInt(locations);
        this.C = parseInt(copies);
        this.checks = parseInt(checks);
        this.checkReps = parseInt(checkReps);
        this.type = type;
        this.seed = (seed !== null && seed !== undefined && !isNaN(seed)) ? seed : Math.floor(Math.random() * 1000000);

        this.allocationMatrix = []; // [lineIndex][locIndex] = count
        this.locationEntries = []; // Each element is array of {id, name, type}
        this.fieldBooks = {}; // {locName: data}
    }

    mulberry32(a) {
        return function () {
            var t = a += 0x6D2B79F5;
            t = Math.imul(t ^ t >>> 15, t | 1);
            t ^= t + Math.imul(t ^ t >>> 7, t | 61);
            return ((t ^ t >>> 14) >>> 0) / 4294967296;
        }
    }

    allocate() {
        const random = this.mulberry32(this.seed);

        // 1. Initialize Matrix
        this.allocationMatrix = Array.from({ length: this.lines }, () => Array(this.L).fill(0));

        // 2. Distribute copies of each line across locations
        let offset = 0;
        for (let i = 0; i < this.lines; i++) {
            for (let j = 0; j < this.C; j++) {
                const locIdx = (offset + j) % this.L;
                this.allocationMatrix[i][locIdx] = 1;
            }
            offset = (offset + this.C) % this.L;
        }

        // Randomize the allocation (permute lines)
        let lineIndices = Array.from({ length: this.lines }, (_, i) => i);
        for (let i = lineIndices.length - 1; i > 0; i--) {
            const j = Math.floor(random() * (i + 1));
            [lineIndices[i], lineIndices[j]] = [lineIndices[j], lineIndices[i]];
        }

        const finalMatrix = Array.from({ length: this.lines }, () => Array(this.L).fill(0));
        lineIndices.forEach((oldIdx, newIdx) => {
            finalMatrix[newIdx] = [...this.allocationMatrix[oldIdx]];
        });
        this.allocationMatrix = finalMatrix;

        // 3. Prepare entries per location
        this.locationEntries = Array.from({ length: this.L }, () => []);

        for (let loc = 0; loc < this.L; loc++) {
            // Add Checks (repeated checkReps times)
            for (let c = 1; c <= this.checks; c++) {
                for (let r = 0; r < this.checkReps; r++) {
                    this.locationEntries[loc].push({
                        id: c,
                        name: `CH-${c}`,
                        type: 'Check'
                    });
                }
            }

            // Add assigned lines
            for (let i = 0; i < this.lines; i++) {
                if (this.allocationMatrix[i][loc] === 1) {
                    this.locationEntries[loc].push({
                        id: this.checks + i + 1,
                        name: `G-${i + 1}`,
                        type: 'Line'
                    });
                }
            }
        }
    }

    // Secondary randomization for a specific location
    generateLocationLayout(locIdx, planter = 'serpentine') {
        const entries = this.locationEntries[locIdx];
        const random = this.mulberry32(this.seed + locIdx + 100);

        const N = entries.length;
        // Determine Rows x Cols: approx square
        let rows = Math.floor(Math.sqrt(N * 1.2)); // Add some space for fillers
        let cols = Math.ceil(N / rows);
        while (rows * cols < N) cols++;

        let matrix = Array.from({ length: rows }, () => Array(cols).fill(null));

        let positions = [];
        for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) positions.push({ r, c });

        for (let i = positions.length - 1; i > 0; i--) {
            const j = Math.floor(random() * (i + 1));
            [positions[i], positions[j]] = [positions[j], positions[i]];
        }

        entries.forEach((ent, idx) => {
            const pos = positions[idx];
            matrix[pos.r][pos.c] = ent;
        });

        for (let i = entries.length; i < positions.length; i++) {
            const pos = positions[i];
            matrix[pos.r][pos.c] = { id: 0, name: 'Filler', type: 'Filler' };
        }

        return { matrix, rows, cols, entries };
    }
}

document.addEventListener('DOMContentLoaded', () => {
    try {
        const generateBtn = document.getElementById('generate-btn');
        const resultsSection = document.getElementById('results');
        const allocTableBody = document.querySelector('#allocation-table tbody');
        const allocHeader = document.getElementById('alloc-header');
        const locTabsContainer = document.getElementById('loc-tabs-container');
        const locMatrixGrid = document.getElementById('loc-matrix');
        const downloadLocBtn = document.getElementById('download-loc-btn');
        const exportFullCsv = document.getElementById('export-full-csv');

        if (!generateBtn) return;

        let currentDesign = null;
        let selectedLocIdx = 0;

        generateBtn.addEventListener('click', () => {
            if (!window.requireAuth || !window.requireAuth()) {
                console.warn("Auth required");
                return;
            }
            const linesInput = document.getElementById('lines-input');
            const locationsInput = document.getElementById('locations-input');
            const copiesInput = document.getElementById('copies-input');
            const checksInput = document.getElementById('checks-count');
            const checkRepsInput = document.getElementById('checks-reps');
            const typeInput = document.getElementById('design-type');

            const lines = linesInput.value;
            const locations = locationsInput.value;
            const copies = copiesInput.value;
            const checks = checksInput.value;
            const checkReps = checkRepsInput.value;
            const type = typeInput.value;

            try {
                const design = new AllocationDesign(lines, locations, copies, checks, checkReps, type);
                design.allocate();
                currentDesign = design;

                // Stats
                if (document.getElementById('stat-avg')) document.getElementById('stat-avg').textContent = (lines * copies / locations).toFixed(1);
                if (document.getElementById('stat-total') && design.locationEntries[0]) document.getElementById('stat-total').textContent = design.locationEntries[0].length * locations;
                if (document.getElementById('stat-plots') && design.locationEntries[0]) document.getElementById('stat-plots').textContent = design.locationEntries[0].length;

                renderAllocation(design);
                renderTabs(design.L);
                showLocation(0);

                if (resultsSection) {
                    resultsSection.style.display = 'block';
                    resultsSection.scrollIntoView({ behavior: 'smooth' });
                }

            } catch (e) {
                console.error(e);
                alert(e.message);
            }
        });

        function renderAllocation(design) {
            if (!allocTableBody || !allocHeader) return;
            // Clear the table first
            allocTableBody.innerHTML = '';

            // Set headers for locations
            allocHeader.innerHTML = '<th>Line</th>';
            for (let i = 1; i <= design.L; i++) {
                const th = document.createElement('th');
                th.textContent = `L${i}`;
                allocHeader.appendChild(th);
            }

            // Render rows
            design.allocationMatrix.slice(0, 20).forEach((row, lineIdx) => {
                const tr = document.createElement('tr');
                tr.innerHTML = `<td>G-${lineIdx + 1}</td>` + row.map(v =>
                    `<td style="color: ${v ? 'var(--accent)' : 'var(--text-dim)'}; font-weight: ${v ? 800 : 400};">
                        ${v ? '<i class="fas fa-check-circle"></i>' : '-'}
                    </td>`
                ).join('');
                allocTableBody.appendChild(tr);
            });

            if (design.lines > 20) {
                const tr = document.createElement('tr');
                tr.innerHTML = `<td colspan="${design.L + 1}" style="text-align: center; color: var(--text-dim); font-size: 0.7rem;">... Showing first 20 lines ...</td>`;
                allocTableBody.appendChild(tr);
            }
        }

        function renderTabs(count) {
            if (!locTabsContainer) return;
            locTabsContainer.innerHTML = '';
            for (let i = 0; i < count; i++) {
                const tab = document.createElement('div');
                tab.className = `loc-tab ${i === 0 ? 'active' : ''}`;
                tab.textContent = `Location ${i + 1}`;
                tab.onclick = () => showLocation(i);
                locTabsContainer.appendChild(tab);
            }
        }

        function showLocation(idx) {
            if (!currentDesign || !locMatrixGrid) return;
            selectedLocIdx = idx;
            document.querySelectorAll('.loc-tab').forEach((t, i) => t.classList.toggle('active', i === idx));
            const titleEl = document.getElementById('active-loc-title');
            if (titleEl) titleEl.textContent = `Field Layout: Location ${idx + 1}`;

            const { matrix, rows, cols } = currentDesign.generateLocationLayout(idx);

            locMatrixGrid.innerHTML = '';
            locMatrixGrid.style.gridTemplateColumns = `repeat(${cols}, 40px)`;

            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    const item = matrix[r][c];
                    const cell = document.createElement('div');
                    cell.className = `cell ${item ? item.type.toLowerCase() : 'filler'}`;
                    cell.innerHTML = item ? item.id : '-';
                    cell.title = item ? `${item.type}: ${item.name}` : 'Empty';
                    locMatrixGrid.appendChild(cell);
                }
            }
        }

        if (downloadLocBtn) {
            downloadLocBtn.addEventListener('click', () => {
                const container = document.getElementById('map-wrapper');
                if (!container || typeof html2canvas !== 'function') {
                    alert("Cannot export map.");
                    return;
                }
                html2canvas(container, {
                    backgroundColor: null,
                    scale: 3
                }).then(canvas => {
                    const a = document.createElement('a');
                    a.download = `location_${selectedLocIdx + 1}_map.png`;
                    a.href = canvas.toDataURL();
                    a.click();
                });
            });
        }

        if (exportFullCsv) {
            exportFullCsv.addEventListener('click', () => {
                if (!currentDesign) return;
                let csv = "Location,Plot,EntryID,Name,Type\n";

                for (let loc = 0; loc < currentDesign.L; loc++) {
                    const { matrix } = currentDesign.generateLocationLayout(loc);
                    let plot = 101;
                    matrix.forEach((row) => {
                        row.forEach((item) => {
                            if (item) {
                                csv += `Location_${loc + 1},${plot++},${item.id},${item.name},${item.type}\n`;
                            } else {
                                plot++;
                            }
                        });
                    });
                }

                const blob = new Blob([csv], { type: 'text/csv' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `consolidated_field_book.csv`;
                a.click();
            });
        }
    } catch (e) {
        console.error("Sparse App Init Error", e);
    }
});
