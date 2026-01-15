/**
 * Latin Square Design Logic
 * Implements randomized Latin Square generation for NxN grids.
 */
'use strict';

class LatinSquareGenerator {
    constructor(t, reps, planter = 'serpentine', seed = null) {
        this.t = parseInt(t); // Max 10
        this.reps = parseInt(reps);
        this.planter = planter;
        // Correct seed handling
        this.seed = (seed !== null && seed !== undefined && !isNaN(seed)) ? seed : Math.floor(Math.random() * 1000000);
        this.fieldBook = [];
        this.squares = []; // Array of 2D matrices [rep][row][col]
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

    generate(startPlot = 101, locationName = '', isSim = false) {
        const random = this.mulberry32(this.seed);
        this.fieldBook = [];
        this.squares = [];
        this.isSim = isSim;

        for (let r = 0; r < this.reps; r++) {
            // 1. Create standard latin square
            let square = Array.from({ length: this.t }, (_, i) =>
                Array.from({ length: this.t }, (_, j) => (i + j) % this.t)
            );

            // 2. Randomize rows
            let rowIndices = Array.from({ length: this.t }, (_, i) => i);
            this.shuffle(rowIndices, random);
            let rowP = rowIndices.map(i => square[i]);

            // 3. Randomize columns
            let colIndices = Array.from({ length: this.t }, (_, i) => i);
            this.shuffle(colIndices, random);
            let colP = Array.from({ length: this.t }, () => Array(this.t));
            for (let i = 0; i < this.t; i++) {
                for (let j = 0; j < this.t; j++) {
                    colP[i][j] = rowP[i][colIndices[j]];
                }
            }

            // 4. Randomize treatment labels
            let trtIndices = Array.from({ length: this.t }, (_, i) => i);
            this.shuffle(trtIndices, random);

            let finalSquare = colP.map(row => row.map(val => trtIndices[val] + 1));
            this.squares.push(finalSquare);

            // 5. Generate field book entries
            let plotNum = startPlot + (r * this.t * this.t);

            for (let ri = 0; ri < this.t; ri++) {
                let colsIter = Array.from({ length: this.t }, (_, i) => i);
                if (this.planter === 'serpentine' && ri % 2 !== 0) {
                    colsIter.reverse();
                }

                colsIter.forEach(ci => {
                    const entry = {
                        id: this.fieldBook.length + 1,
                        location: locationName || `Loc 1`,
                        plot: plotNum++,
                        square: r + 1,
                        row: ri + 1,
                        column: ci + 1,
                        treatment: finalSquare[ri][ci],
                        treatmentLabel: `T${finalSquare[ri][ci]}`
                    };

                    if (isSim) {
                        entry.yield = (Math.random() * 50 + 50).toFixed(2);
                    }

                    this.fieldBook.push(entry);
                });
            }
        }
        return this.fieldBook;
    }
}

// UI Controller
document.addEventListener('DOMContentLoaded', () => {
    try {
        const generateBtn = document.getElementById('generate-btn');
        const simulateBtn = document.getElementById('simulate-btn');
        const exportBtn = document.getElementById('export-csv');
        const locInput = document.getElementById('loc-input');

        const resultsSection = document.getElementById('results');
        const fbTableBody = document.querySelector('#fb-table tbody');
        const lsContainer = document.getElementById('ls-container');
        const squarePillsContainer = document.getElementById('square-pills-container');
        const tabs = document.querySelectorAll('.tab');

        if (!generateBtn) return;

        let currentGenerator = null;
        let selectedSqIdx = 0;

        function triggerGeneration(isSim) {
            try {
                const tInput = document.getElementById('t-input');
                const repsInput = document.getElementById('reps-input');
                const planterInput = document.getElementById('planter-input');
                const plotStartInput = document.getElementById('plot-start');
                const seedInput = document.getElementById('seed-input');

                const t = parseInt(tInput.value);
                const reps = parseInt(repsInput.value);
                const planter = planterInput ? planterInput.value : 'serpentine';
                const plotStart = parseInt(plotStartInput.value);
                const locationName = locInput ? locInput.value : '';

                const rawSeed = seedInput.value;
                const seed = (rawSeed !== "" && rawSeed !== null) ? parseInt(rawSeed) : Math.floor(Math.random() * 1000000);

                if (t > 10) { alert('Max 10 treatments allowed for Latin Square.'); return; }

                const generator = new LatinSquareGenerator(t, reps, planter, seed);
                generator.generate(plotStart, locationName, isSim);
                currentGenerator = generator;

                renderPills(reps);
                showSquare(0);
                renderTable(generator.fieldBook, isSim);

                // Update Summary
                const summarySeed = document.getElementById('summary-seed');
                const summaryPlots = document.getElementById('summary-plots');
                if (summarySeed) summarySeed.textContent = seed;
                if (summaryPlots) summaryPlots.textContent = generator.fieldBook.length;

                if (resultsSection) {
                    resultsSection.style.display = 'block';
                    resultsSection.scrollIntoView({ behavior: 'smooth' });
                }

                // Show buttons
                if (simulateBtn) {
                    simulateBtn.classList.remove('d-none');
                }
                if (exportBtn) {
                    exportBtn.classList.remove('d-none');
                }

            } catch (e) {
                console.error(e);
                alert(e.message);
            }
        }

        generateBtn.addEventListener('click', () => {
            if (window.requireAuth && window.requireAuth()) {
                triggerGeneration(false);
            } else if (!window.requireAuth) {
                // Fallback if auth system not loaded
                console.warn("Auth system missing, allowing generation");
                triggerGeneration(false);
            }
        });

        if (simulateBtn) {
            simulateBtn.addEventListener('click', () => triggerGeneration(true));
        }

        function renderPills(count) {
            if (!squarePillsContainer) return;
            squarePillsContainer.innerHTML = '';
            for (let i = 0; i < count; i++) {
                const pill = document.createElement('div');
                pill.className = `pill ${i === 0 ? 'active' : ''}`;
                pill.textContent = `Square ${i + 1}`;
                pill.onclick = () => {
                    document.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
                    pill.classList.add('active');
                    showSquare(i);
                };
                squarePillsContainer.appendChild(pill);
            }
        }

        function showSquare(idx) {
            if (!lsContainer || !currentGenerator) return;
            selectedSqIdx = idx;
            const square = currentGenerator.squares[idx];
            const t = currentGenerator.t;
            const fb = currentGenerator.fieldBook.filter(d => d.square === idx + 1);

            lsContainer.innerHTML = '';
            lsContainer.style.gridTemplateColumns = `repeat(${t}, 75px)`;

            // We use the field book to get plots for the specific row/col
            for (let r = 0; r < t; r++) {
                for (let c = 0; c < t; c++) {
                    const trt = square[r][c];
                    const entry = fb.find(d => d.row === r + 1 && d.column === c + 1);
                    if (!entry) continue;

                    const cell = document.createElement('div');
                    cell.className = `ls-cell treatment-color-${trt}`;
                    cell.innerHTML = `
                        <div class="p-num">P${entry.plot}</div>
                        T${trt}
                        <div class="row-col">R${r + 1} C${c + 1}</div>
                    `;
                    cell.title = `Row ${r + 1}, Col ${c + 1}, Plot ${entry.plot}`;
                    lsContainer.appendChild(cell);
                }
            }
        }

        function renderTable(data, isSim) {
            if (!fbTableBody) return;
            const thead = document.querySelector('#fb-table thead tr');
            if (thead) {
                // Reset headers
                thead.innerHTML = `
                    <th>ID</th>
                    <th>Location</th>
                    <th>Plot</th>
                    <th>Square</th>
                    <th>Row</th>
                    <th>Column</th>
                    <th>Treatment</th>
                    ${isSim ? '<th>Yield</th>' : ''}
                `;
            }

            fbTableBody.innerHTML = '';
            data.forEach(row => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${row.id}</td>
                    <td>${row.location}</td>
                    <td style="font-weight: 700;">${row.plot}</td>
                    <td>${row.square}</td>
                    <td>${row.row}</td>
                    <td>${row.column}</td>
                    <td>${row.treatmentLabel}</td>
                    ${isSim ? `<td>${row.yield}</td>` : ''}
                `;
                fbTableBody.appendChild(tr);
            });
        }

        // Tabs
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
        // Exports
        if (exportBtn) {
            exportBtn.addEventListener('click', () => {
                if (!currentGenerator) return;
                const isSim = currentGenerator.isSim;

                const headers = ["ID", "Location", "Plot", "Square", "Row", "Column", "Treatment"];
                if (isSim) headers.push("Yield");

                const csv = [headers.join(",")];
                currentGenerator.fieldBook.forEach(row => {
                    const line = [row.id, row.location, row.plot, row.square, row.row, row.column, row.treatmentLabel];
                    if (isSim) line.push(row.yield);
                    csv.push(line.join(","));
                });

                const blob = new Blob([csv.join("\n")], { type: 'text/csv' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `latin_square_design_${Date.now()}.csv`;
                a.click();
            });
        }

        const downloadExcelBtn = document.getElementById('download-excel-btn');
        if (downloadExcelBtn) {
            downloadExcelBtn.addEventListener('click', () => {
                if (!currentGenerator) return;
                const isSim = currentGenerator.isSim;

                const headers = ["ID", "Location", "Plot", "Square", "Row", "Column", "Treatment"];
                if (isSim) headers.push("Yield");

                const csv = [headers.join(",")];
                currentGenerator.fieldBook.forEach(row => {
                    const line = [row.id, row.location, row.plot, row.square, row.row, row.column, row.treatmentLabel];
                    if (isSim) line.push(row.yield);
                    csv.push(line.join(","));
                });

                const blob = new Blob([csv.join("\n")], { type: 'text/csv' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `latin_square_field_book_${Date.now()}.csv`;
                a.click();
            });
        }

        const dlPngBtn = document.getElementById('download-png');
        if (dlPngBtn) {
            dlPngBtn.addEventListener('click', () => {
                const container = document.getElementById('ls-container');
                if (!container || typeof html2canvas !== 'function') {
                    alert('Cannot export image.');
                    return;
                }
                const oldText = dlPngBtn.innerHTML;
                dlPngBtn.innerHTML = "Processing...";
                dlPngBtn.disabled = true;

                html2canvas(container, {
                    backgroundColor: null,
                    scale: 3
                }).then(canvas => {
                    const a = document.createElement('a');
                    a.download = `latin_square_rep${selectedSqIdx + 1}.png`;
                    a.href = canvas.toDataURL();
                    a.click();
                    dlPngBtn.innerHTML = oldText;
                    dlPngBtn.disabled = false;
                }).catch(e => {
                    console.error(e);
                    alert("Export failed");
                    dlPngBtn.innerHTML = oldText;
                    dlPngBtn.disabled = false;
                });
            });
        }
    } catch (err) {
        console.error("Latin App Init Error", err);
    }
});
