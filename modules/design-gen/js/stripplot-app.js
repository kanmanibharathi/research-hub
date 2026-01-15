/**
 * Strip Plot Design Logic
 * Implementation for Research Hub
 */
'use strict';

class StripPlotDesign {
    constructor() {
        this.initEventListeners();
        this.mulberry = null;
        this.lastData = null;
        this.lastInfo = null;
    }

    initEventListeners() {
        const genBtn = document.getElementById('generate-btn');
        const expBtn = document.getElementById('export-btn');
        const excelBtn = document.getElementById('download-excel-btn');

        if (genBtn) {
            genBtn.addEventListener('click', () => {
                if (!window.requireAuth || !window.requireAuth()) {
                    console.warn("Auth required");
                    return;
                }
                try {
                    this.generate();
                    // Show simulate and export buttons after generation
                    const simulateBtn = document.getElementById('simulate-btn');
                    const exportBtn = document.getElementById('export-btn');
                    if (simulateBtn) simulateBtn.classList.remove('d-none');
                    if (exportBtn) exportBtn.classList.remove('d-none');
                } catch (e) {
                    console.error(e);
                    alert("Error: " + e.message);
                }
            });
        }

        if (expBtn) {
            expBtn.addEventListener('click', () => this.exportCSV());
        }

        if (excelBtn) {
            excelBtn.addEventListener('click', () => this.exportCSV());
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

        const simBtn = document.getElementById('simulate-btn');
        if (simBtn) {
            simBtn.addEventListener('click', () => {
                this.simulate();
                const fbTab = document.querySelector('.tab[data-tab="field-book"]');
                if (fbTab) fbTab.click();
            });
        }

        const mapBtn = document.getElementById('download-map-btn');
        if (mapBtn) {
            mapBtn.addEventListener('click', () => this.exportMap(mapBtn));
        }
    }

    simulate() {
        if (!this.lastData) {
            alert("Please generate a design first.");
            return;
        }

        const traits = [
            { name: "Yield", unit: "kg/ha", mean: 4200, std: 450, decimals: 1 },
            { name: "Biomass", unit: "g/m2", mean: 850, std: 120, decimals: 1 },
            { name: "Height", unit: "cm", mean: 110, std: 12, decimals: 1 }
        ];

        this.lastData.forEach(row => {
            row.simulatedValues = {};
            traits.forEach(trait => {
                const u1 = Math.random();
                const u2 = Math.random();
                const z = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
                const val = trait.mean + (z * trait.std);
                row.simulatedValues[trait.name] = Math.max(0, val).toFixed(trait.decimals);
            });
        });

        this.lastTraits = traits;
        this.render();
    }

    exportMap(btn) {
        const container = document.getElementById('map-container');
        if (!container) return;

        const oldText = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Rendering...';

        if (typeof html2canvas !== 'function') {
            alert("Export library not loaded.");
            btn.innerHTML = oldText;
            return;
        }

        html2canvas(container, {
            backgroundColor: null,
            scale: 2,
            logging: false,
            onclone: (clonedDoc) => {
                const clonedContainer = clonedDoc.getElementById('map-container');
                if (clonedContainer) {
                    clonedContainer.style.background = 'transparent';
                    clonedContainer.style.border = 'none';
                    clonedContainer.style.color = '#000000';

                    // Enforce black text on all elements
                    const elements = clonedContainer.querySelectorAll('*');
                    elements.forEach(el => {
                        const style = window.getComputedStyle(el);
                        if (style.color !== 'rgba(0, 0, 0, 0)' && style.color !== 'transparent') {
                            el.style.color = '#000000';
                        }
                    });

                    // Remove Site Block borders
                    const siteBlocks = clonedContainer.querySelectorAll('.site-block');
                    siteBlocks.forEach(sb => sb.style.border = 'none');

                    // Ensure Rep containers have BLACK border
                    const repContainers = clonedContainer.querySelectorAll('.rep-grid-container');
                    repContainers.forEach(rc => {
                        rc.style.border = '2px solid #000000';
                        rc.style.background = 'transparent';
                    });

                    // Ensure Plot units have BLACK border and transparent bg
                    const plots = clonedContainer.querySelectorAll('.plot-unit');
                    plots.forEach(p => {
                        p.style.border = '1px solid #000000'; // Show plot border
                        p.style.background = 'transparent';
                        p.style.color = '#000000';
                        // Ensure internal text elements are black
                        const children = p.querySelectorAll('*');
                        children.forEach(c => c.style.color = '#000000');
                    });

                    // Handle Headers/Labels
                    const headers = clonedContainer.querySelectorAll('.rep-title, .site-title, .v-strip-label, .h-strip-label, .plot-id, .strip-header, .trt-label');
                    headers.forEach(h => h.style.color = '#000000');
                }
            }
        }).then(canvas => {
            const a = document.createElement('a');
            a.download = 'strip_plot_map.png';
            a.href = canvas.toDataURL();
            a.click();
            btn.innerHTML = oldText;
        }).catch(err => {
            console.error(err);
            alert("Error exporting map");
            btn.innerHTML = oldText;
        });
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
        let currentIndex = array.length, randomIndex;
        while (currentIndex !== 0) {
            randomIndex = Math.floor(this.mulberry() * currentIndex);
            currentIndex--;
            [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
        }
        return array;
    }

    parseInput(input, prefix) {
        if (!input || !input.trim()) return [];
        if (!isNaN(input)) {
            const n = parseInt(input);
            return Array.from({ length: n }, (_, i) => `${prefix}${i + 1}`);
        }
        return input.split(',').map(s => s.trim()).filter(s => s.length > 0);
    }

    generate() {
        const hInputEl = document.getElementById('h-input');
        const vInputEl = document.getElementById('v-input');
        const repsEl = document.getElementById('reps-input');
        const locEl = document.getElementById('loc-input');
        const layoutEl = document.getElementById('layout-input');
        const plotEl = document.getElementById('plot-input');
        const seedEl = document.getElementById('seed-input');
        const randHEl = document.getElementById('randH-input');
        const randVEl = document.getElementById('randV-input'); // Fixed ID based on previous usage

        if (!hInputEl || !vInputEl || !repsEl) return;

        const hInput = hInputEl.value;
        const vInput = vInputEl.value;
        const reps = parseInt(repsEl.value);
        const locations = parseInt(locEl.value);
        const planter = layoutEl.value; // serpentine / cartesian
        const startPlot = parseInt(plotEl.value);
        const rawSeed = seedEl.value;
        let seed = (rawSeed !== "" && rawSeed !== null) ? parseInt(rawSeed) : Math.floor(Math.random() * 999999);
        const randomizeHPerRep = randHEl ? randHEl.checked : false;
        const randomizeVPerRep = randVEl ? randVEl.checked : false;

        if (isNaN(seed)) seed = Math.floor(Math.random() * 999999);
        this.mulberry = this.mulberry32(seed);

        const hFactors = this.parseInput(hInput, 'H');
        const vFactors = this.parseInput(vInput, 'V');

        if (hFactors.length === 0 || vFactors.length === 0) {
            alert("Please provide valid factors for Horizontal and Vertical strips.");
            return;
        }

        const nH = hFactors.length;
        const nV = vFactors.length;
        const data = [];

        for (let l = 1; l <= locations; l++) {
            const locName = locations === 1 ? "Main Site" : `Location ${l}`;
            const sitePlotStart = startPlot + (l - 1) * 1000;

            // Randomize per location if requested
            let fixedH = this.shuffle([...hFactors]);
            let fixedV = this.shuffle([...vFactors]);

            for (let r = 1; r <= reps; r++) {
                const hRandom = randomizeHPerRep ? this.shuffle([...hFactors]) : fixedH;
                const vRandom = randomizeVPerRep ? this.shuffle([...vFactors]) : fixedV;

                // Strip Plot layout is a matrix (H strips crossed by V strips)
                // We need to generate plot numbers based on the planter layout
                let plotNums = [];
                for (let i = 0; i < nH; i++) {
                    let rowPlots = [];
                    for (let j = 0; j < nV; j++) {
                        rowPlots.push(0); // placeholder
                    }
                    plotNums.push(rowPlots);
                }

                let currentPlot = sitePlotStart + (r - 1) * 100; // Simplified offset per rep

                // Assign Plot numbers
                for (let i = 0; i < nH; i++) {
                    if (planter === 'serpentine' && i % 2 !== 0) {
                        for (let j = nV - 1; j >= 0; j--) {
                            plotNums[i][j] = currentPlot++;
                        }
                    } else {
                        for (let j = 0; j < nV; j++) {
                            plotNums[i][j] = currentPlot++;
                        }
                    }
                }

                // Create Data Rows
                for (let i = 0; i < nH; i++) {
                    for (let j = 0; j < nV; j++) {
                        data.push({
                            id: data.length + 1,
                            location: locName,
                            plot: plotNums[i][j],
                            rep: r,
                            h: hRandom[i],
                            v: vRandom[j],
                            row: i,
                            col: j,
                            trt: `${hRandom[i]} | ${vRandom[j]}`
                        });
                    }
                }
            }
        }

        this.lastData = data;
        this.lastInfo = {
            nH, nV, reps, locations, planter,
            total: data.length
        };

        this.render();
    }

    render() {
        const results = document.getElementById('results');
        if (results) results.style.display = 'block';

        if (document.getElementById('info-factors')) document.getElementById('info-factors').innerText = `${this.lastInfo.nH}H x ${this.lastInfo.nV}V`;
        if (document.getElementById('info-layout')) document.getElementById('info-layout').innerText = this.lastInfo.planter;
        if (document.getElementById('info-total')) document.getElementById('info-total').innerText = this.lastInfo.total;

        // Table
        const tbody = document.querySelector('#field-book-table tbody');
        if (tbody && this.lastData) {
            tbody.innerHTML = '';
            this.lastData.forEach(row => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${row.id}</td>
                    <td>${row.location}</td>
                    <td>${row.plot}</td>
                    <td>${row.rep}</td>
                    <td>${row.h}</td>
                    <td>${row.v}</td>
                    <td><span style="color: var(--primary); font-weight:700;">${row.trt}</span></td>
                `;
                tbody.appendChild(tr);
            });
        }

        this.renderMap();
    }

    renderMap() {
        const container = document.getElementById('map-container');
        if (!container || !this.lastData) return;
        container.innerHTML = '';

        const locations = [...new Set(this.lastData.map(d => d.location))];

        locations.forEach(loc => {
            const siteDiv = document.createElement('div');
            siteDiv.className = 'site-block';
            siteDiv.innerHTML = `<h2 class="site-title">${loc}</h2>`;

            const siteData = this.lastData.filter(d => d.location === loc);
            const reps = [...new Set(siteData.map(d => d.rep))];

            reps.forEach(rep => {
                const repDiv = document.createElement('div');
                repDiv.className = 'rep-grid-container';
                repDiv.innerHTML = `<div class="rep-title">Replicate ${rep}</div>`;

                const repData = siteData.filter(d => d.rep === rep);
                const grid = document.createElement('div');
                grid.className = 'strip-grid';
                grid.style.gridTemplateColumns = `repeat(${this.lastInfo.nV}, 120px)`;
                grid.style.marginLeft = '80px'; // Room for H-labels
                grid.style.marginTop = '40px'; // Room for V-labels

                // Add Vertical Strip Headers (Cross-Rep labels)
                // extract unique Vs without mutating repData order
                const uniqueV = [...new Set([...repData].sort((a, b) => a.col - b.col).map(d => d.v))];
                uniqueV.forEach((v, idx) => {
                    const label = document.createElement('div');
                    label.className = 'v-strip-label';
                    label.style.left = `${idx * 130}px`; // 120px + 10px gap
                    label.innerText = v;
                    grid.appendChild(label);
                });

                // Ensure Plot Rendering Order is Row-Major (Row 0, then Row 1...)
                // Sort by Row then Col
                const sortedPlots = [...repData].sort((a, b) => {
                    if (a.row !== b.row) return a.row - b.row;
                    return a.col - b.col;
                });

                // Add Plots
                sortedPlots.forEach(p => {
                    const plot = document.createElement('div');
                    plot.className = 'plot-unit';
                    plot.innerHTML = `
                        <div class="plot-id">${p.plot}</div>
                        <div class="strip-header">${p.h}</div>
                        <div class="trt-label">${p.v}</div>
                    `;

                    // Add horizontal label only once per row
                    if (p.col === 0) {
                        const hLabel = document.createElement('div');
                        hLabel.className = 'h-strip-label';
                        hLabel.innerText = p.h;
                        plot.appendChild(hLabel);
                    }

                    grid.appendChild(plot);
                });

                repDiv.appendChild(grid);
                siteDiv.appendChild(repDiv);
            });

            container.appendChild(siteDiv);
        });
    }

    exportCSV() {
        if (!this.lastData) return;
        let csv = "ID,LOCATION,PLOT,REP,H_STRIP,V_STRIP,COMBINED_TREATMENT\n";
        this.lastData.forEach(r => {
            csv += `${r.id},${r.location},${r.plot},${r.rep},"${r.h}","${r.v}","${r.trt}"\n`;
        });
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `strip_plot_design.csv`;
        a.click();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    try {
        if (document.getElementById('generate-btn')) {
            new StripPlotDesign();
        }
    } catch (e) {
        console.error("Strip Plot Init Error", e);
    }
});
