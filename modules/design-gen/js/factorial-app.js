/**
 * Full Factorial Design Logic
 * Handles N factors, Combinations, and RCBD/CRD Randomization
 */
'use strict';

class FactorialGenerator {
    constructor(factors, reps, locations, type = 'RCBD', seed = null) {
        this.factors = factors; // Array of {name, levels: [l1, l2]}
        this.reps = parseInt(reps);
        this.L = parseInt(locations);
        this.type = type; // RCBD (2) or CRD (1)
        // Correct seed handling: permit 0, otherwise random
        this.seed = (seed !== null && seed !== undefined && !isNaN(seed)) ? seed : Math.floor(Math.random() * 1000000);

        this.combinations = [];
        this.fieldBook = [];
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

    generateCombinations() {
        if (!this.factors || this.factors.length === 0) return [];

        const result = [[]];
        this.factors.forEach(factor => {
            const temp = [];
            result.forEach(combination => {
                if (factor.levels && factor.levels.length > 0) {
                    factor.levels.forEach(level => {
                        temp.push([...combination, { factorName: factor.name, level: level }]);
                    });
                }
            });
            result.length = 0;
            result.push(...temp);
        });
        this.combinations = result;
        return result;
    }

    generate(startPlot = 101) {
        const random = this.mulberry32(this.seed);
        this.generateCombinations();
        this.fieldBook = [];

        if (this.combinations.length === 0) return [];

        for (let loc = 1; loc <= this.L; loc++) {
            let plotNum = startPlot + (loc - 1) * 1000;

            if (this.type === 'RCBD') {
                for (let rep = 1; rep <= this.reps; rep++) {
                    const repCombs = JSON.parse(JSON.stringify(this.combinations));
                    this.shuffle(repCombs, random);

                    repCombs.forEach(comb => {
                        this.fieldBook.push({
                            location: `Loc${loc}`,
                            plot: plotNum++,
                            rep: rep,
                            combination: comb,
                            combString: comb.map(c => c.level).join('*')
                        });
                    });
                }
            } else {
                const allUnits = [];
                for (let rep = 1; rep <= this.reps; rep++) {
                    this.combinations.forEach(comb => {
                        allUnits.push({ rep: rep, combination: comb });
                    });
                }
                this.shuffle(allUnits, random);

                allUnits.forEach(unit => {
                    this.fieldBook.push({
                        location: `Loc${loc}`,
                        plot: plotNum++,
                        rep: unit.rep,
                        combination: unit.combination,
                        combString: unit.combination.map(c => c.level).join('*')
                    });
                });
            }
        }
        return this.fieldBook;
    }

    simulate(traitName = "Yield", min = 20, max = 80) {
        this.fieldBook.forEach(row => {
            if (!row.simulatedValues) row.simulatedValues = {};
            row.simulatedValues[traitName] = (Math.random() * (max - min) + min).toFixed(2);
        });
    }
}

// UI Controller
document.addEventListener('DOMContentLoaded', () => {
    try {
        const factorsContainer = document.getElementById('factors-container');
        const addFactorBtn = document.getElementById('add-factor');
        const generateBtn = document.getElementById('generate-btn');
        const resultsSection = document.getElementById('results');
        const blocksContainer = document.getElementById('blocks-container');
        const locPills = document.getElementById('loc-pills');
        const fbTable = document.querySelector('#fb-table tbody');
        const fbHeader = document.getElementById('fb-header');

        // Critical elements check
        if (!factorsContainer || !addFactorBtn || !generateBtn) {
            console.warn("Critical elements missing from page, Factorial App not initializing fully.");
            // We return early only if essential generators parts are missing.
            // If just output containers are missing, we might want to log it but not crash.
            if (!generateBtn) return;
        }

        let currentGenerator = null;
        let selectedLoc = "Loc1";

        function addFactorUI(name = '', levels = '') {
            if (!factorsContainer) return;

            const div = document.createElement('div');
            div.className = 'factor-item';
            div.innerHTML = `
                <i class="fas fa-times remove-factor"></i>
                <div class="form-group">
                    <label>Factor Name</label>
                    <input type="text" class="factor-name" value="${name}" placeholder="e.g. Variety">
                </div>
                <div class="form-group mb-0">
                    <label>Levels (comma separated)</label>
                    <input type="text" class="factor-levels" value="${levels}" placeholder="v1, v2, v3">
                </div>
            `;
            // Add close handler
            const closeBtn = div.querySelector('.remove-factor');
            if (closeBtn) {
                closeBtn.onclick = () => {
                    if (factorsContainer.children.length > 1) {
                        div.remove();
                    } else {
                        alert("Minimum 1 factor required.");
                    }
                };
            }
            factorsContainer.appendChild(div);
        }

        // Initialize with default factors if container exists
        if (factorsContainer) {
            addFactorUI('Factor A', 'a1, a2');
            addFactorUI('Factor B', 'b1, b2, b3');
        }

        // Event Listeners
        if (addFactorBtn) {
            addFactorBtn.addEventListener('click', (e) => {
                e.preventDefault(); // Safety
                addFactorUI();
            });
        }

        if (generateBtn) {
            generateBtn.addEventListener('click', () => {
                if (!window.requireAuth || !window.requireAuth()) {
                    console.warn("Auth required");
                    return;
                }
                try {
                    const factorElements = document.querySelectorAll('.factor-item');
                    const factors = [];
                    factorElements.forEach(el => {
                        const nameInput = el.querySelector('.factor-name');
                        const levelsInput = el.querySelector('.factor-levels');

                        const name = nameInput ? (nameInput.value || 'Factor') : 'Factor';
                        const levels = levelsInput ? levelsInput.value.split(',').map(s => s.trim()).filter(s => s !== '') : [];

                        if (levels.length > 0) factors.push({ name, levels });
                    });

                    if (factors.length < 2) {
                        alert('Please define at least 2 factors.');
                        return;
                    }

                    const repsInput = document.getElementById('reps-input');
                    const locsInput = document.getElementById('locs-input');
                    const envType = document.getElementById('env-type');
                    const plotStartInput = document.getElementById('plot-start');
                    const seedInput = document.getElementById('seed-input');

                    const repsVal = repsInput ? repsInput.value : 3;
                    const locsVal = locsInput ? locsInput.value : 1;
                    const type = (envType && envType.value === '2') ? 'RCBD' : 'CRD';
                    const plotStartVal = plotStartInput ? plotStartInput.value : 101;
                    const rawSeed = seedInput ? seedInput.value : "";

                    const reps = parseInt(repsVal) || 3;
                    const locs = parseInt(locsVal) || 1;
                    const plotStart = parseInt(plotStartVal) || 101;
                    const seed = (rawSeed !== "" && rawSeed !== null) ? parseInt(rawSeed) : null;

                    const generator = new FactorialGenerator(factors, reps, locs, type, seed);
                    generator.generate(plotStart);
                    currentGenerator = generator;

                    // Stats
                    const statComb = document.getElementById('stat-comb');
                    const statTotal = document.getElementById('stat-total');
                    const statType = document.getElementById('stat-type');

                    if (statComb) statComb.textContent = generator.combinations.length;
                    if (statTotal) statTotal.textContent = generator.fieldBook.length;
                    if (statType) statType.textContent = type;

                    renderLocPills(locs);
                    renderVisualMap("Loc1");
                    renderTable(generator);

                    if (resultsSection) {
                        resultsSection.style.display = 'block';
                        resultsSection.scrollIntoView({ behavior: 'smooth' });
                    }
                    const simulateBtn = document.getElementById('simulate-btn');
                    const exportBtn = document.getElementById('export-csv');
                    if (simulateBtn) simulateBtn.classList.remove('d-none');
                    if (exportBtn) exportBtn.classList.remove('d-none');

                } catch (genError) {
                    console.error("Generation Error:", genError);
                    alert("Error generating design: " + genError.message);
                }
            });
        }

        function renderLocPills(count) {
            if (!locPills) return;
            locPills.innerHTML = '';
            for (let i = 1; i <= count; i++) {
                const pill = document.createElement('div');
                pill.className = `pill ${i === 1 ? 'active' : ''}`;
                pill.textContent = `Location ${i}`;
                pill.onclick = () => {
                    document.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
                    pill.classList.add('active');
                    renderVisualMap(`Loc${i}`);
                };
                locPills.appendChild(pill);
            }
        }

        function renderVisualMap(locName) {
            if (!blocksContainer || !currentGenerator) return;

            selectedLoc = locName;
            blocksContainer.innerHTML = '';
            const data = currentGenerator.fieldBook.filter(r => r.location === locName);

            if (currentGenerator.type === 'RCBD') {
                for (let r = 1; r <= currentGenerator.reps; r++) {
                    const blockDiv = document.createElement('div');
                    blockDiv.className = `block-unit`;
                    blockDiv.innerHTML = `<div class="block-title">Block (Rep) ${r} <span style="font-weight:normal;opacity:0.7">(${locName})</span></div>`;
                    const grid = document.createElement('div');
                    grid.className = 'plots-grid';

                    const repData = data.filter(d => d.rep === r);
                    repData.sort((a, b) => a.plot - b.plot);

                    repData.forEach(plot => {
                        const colorClass = `crd-color-${(r - 1) % 5 + 1}`;
                        grid.innerHTML += `
                            <div class="plot-card ${colorClass}">
                                <div class="p-num">Plot ${plot.plot}</div>
                                <div class="p-comb">${plot.combString}</div>
                            </div>
                        `;
                    });
                    blockDiv.appendChild(grid);
                    blocksContainer.appendChild(blockDiv);
                }
            } else {
                const blockDiv = document.createElement('div');
                blockDiv.className = 'block-unit';
                blockDiv.innerHTML = `<div class="block-title">Completely Randomized Design <span style="font-weight:normal;opacity:0.7">(${locName})</span></div>`;

                const grid = document.createElement('div');
                grid.className = 'plots-grid';

                // Square Grid Calculation
                // Rectangular Grid Calculation (Reps x Combinations)
                // Maps Replicates to Rows, Treatments to Columns for a filled grid.
                const layoutVal = document.getElementById('reps-layout')?.value || 'vertical';
                let cols;

                if (layoutVal === 'horizontal') {
                    // Wide Grid: Columns = Treatments (Rows = Reps)
                    cols = currentGenerator.combinations.length;

                    // Specific fix: If user wants "Horizontal Stack" of Reps? 
                    // But usually "Horizontal" implies Wide Grid.
                } else {
                    // Vertical/Default: Tall Grid: Columns = Reps (Rows = Treatments)
                    // This creates a Tall strip.
                    cols = currentGenerator.reps;
                }

                grid.style.display = 'grid';
                grid.style.gridTemplateColumns = `repeat(${cols}, 80px)`;
                grid.style.gap = '8px';
                // Remove center justify to prevent clipping on overflow
                grid.style.justifyContent = 'start';

                // Sort by plot number
                data.sort((a, b) => a.plot - b.plot);

                data.forEach(plot => {
                    const colorClass = `crd-color-${(plot.rep - 1) % 5 + 1}`;
                    grid.innerHTML += `
                        <div class="crd-plot-card ${colorClass}">
                            <div class="p-top">${plot.combString}</div>
                            <div class="p-main">${plot.plot}</div>
                            <div class="p-bottom">Rep ${plot.rep}</div>
                        </div>
                    `;
                });
                blockDiv.appendChild(grid);
                blocksContainer.appendChild(blockDiv);
            }
        }

        function renderTable(gen) {
            if (!fbHeader || !fbTable) return;

            let headers = '<th>ID</th><th>Location</th><th>Plot</th><th>Rep</th>';
            gen.factors.forEach(f => {
                headers += `<th>${f.name}</th>`;
            });
            headers += '<th>Combination</th>';

            let simTraits = [];
            if (gen.fieldBook.length > 0 && gen.fieldBook[0].simulatedValues) {
                simTraits = Object.keys(gen.fieldBook[0].simulatedValues);
                simTraits.forEach(t => headers += `<th>${t}</th>`);
            }
            fbHeader.innerHTML = headers;

            fbTable.innerHTML = '';
            gen.fieldBook.forEach((row, idx) => {
                const tr = document.createElement('tr');
                let html = `<td>${idx + 1}</td><td>${row.location}</td><td>${row.plot}</td><td>${row.rep}</td>`;
                row.combination.forEach(c => {
                    html += `<td>${c.level}</td>`;
                });
                html += `<td><strong>${row.combString}</strong></td>`;

                simTraits.forEach(t => {
                    html += `<td>${row.simulatedValues[t]}</td>`;
                });

                tr.innerHTML = html;
                fbTable.appendChild(tr);
            });
        }

        // Tabs
        document.querySelectorAll('.tab').forEach(tab => {
            tab.onclick = () => {
                document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                tab.classList.add('active');
                const target = document.getElementById(tab.dataset.tab);
                if (target) target.classList.add('active');
            };
        });

        // Toggle Export
        const exportCsvBtn = document.getElementById('export-csv');
        if (exportCsvBtn) {
            exportCsvBtn.onclick = () => {
                if (!currentGenerator) return;

                let simTraits = [];
                if (currentGenerator.fieldBook.length > 0 && currentGenerator.fieldBook[0].simulatedValues) {
                    simTraits = Object.keys(currentGenerator.fieldBook[0].simulatedValues);
                }

                const headers = ["Location", "Plot", "Rep", ...currentGenerator.factors.map(f => f.name), "Combination", ...simTraits];
                const csv = [headers.join(',')];
                currentGenerator.fieldBook.forEach(row => {
                    const simVals = simTraits.map(t => row.simulatedValues[t]);
                    const line = [row.location, row.plot, row.rep, ...row.combination.map(c => c.level), row.combString, ...simVals];
                    csv.push(line.join(','));
                });
                const blob = new Blob([csv.join('\n')], { type: 'text/csv' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `factorial_design_${Date.now()}.csv`;
                a.click();
            };
        }

        const simBtn = document.getElementById('simulate-btn');
        if (simBtn) {
            simBtn.onclick = () => {
                if (!currentGenerator) return;
                // Switch tabs to Field Book to show results
                const fbTab = document.querySelector('.tab[data-tab="field-book"]');
                if (fbTab) fbTab.click();

                currentGenerator.simulate();
                renderTable(currentGenerator);
            };
        }

        const dlMapBtn = document.getElementById('download-png');
        if (dlMapBtn) {
            dlMapBtn.onclick = () => {
                const container = document.getElementById('blocks-container');
                if (typeof html2canvas === 'function' && container) {
                    const btn = dlMapBtn;
                    const oldText = btn.innerHTML;
                    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Rendering...';
                    btn.disabled = true;

                    html2canvas(container, {
                        backgroundColor: null,
                        scale: 3,
                        logging: false,
                        useCORS: true,
                        onclone: (clonedDoc) => {
                            // No special background processing needed for content container
                        }
                    }).then(canvas => {
                        const a = document.createElement('a');
                        a.download = `factorial_${selectedLoc}_map.png`;
                        a.href = canvas.toDataURL('image/png', 1.0);
                        a.click();

                        btn.innerHTML = oldText;
                        btn.disabled = false;
                    }).catch(err => {
                        console.error("Map export error:", err);
                        alert("Error exporting map.");
                        btn.innerHTML = oldText;
                        btn.disabled = false;
                    });
                } else {
                    alert('Image export library not loaded or map container missing.');
                }
            };
        }

        const repsLayoutSelect = document.getElementById('reps-layout');
        if (repsLayoutSelect) {
            repsLayoutSelect.onchange = () => {
                const container = document.getElementById('blocks-container');
                if (!container) return;

                // Reset styles
                container.style.flexDirection = '';
                container.style.flexWrap = '';

                if (repsLayoutSelect.value === 'horizontal') {
                    container.classList.add('horizontal-mode');
                } else {
                    container.classList.remove('horizontal-mode');
                }

                // For CRD, we must re-render to change Grid Layout
                if (currentGenerator && currentGenerator.type !== 'RCBD') {
                    renderVisualMap(selectedLoc);
                }
            };
        }

    } catch (error) {
        console.error("Factorial App Initialization Error:", error);
        alert("An error occurred initializing the application. Please refresh.");
    }
});
