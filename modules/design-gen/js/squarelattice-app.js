/**
 * Square Lattice Design Logic
 * Implementation for Research Hub
 */
'use strict';

class SquareLatticeDesign {
    constructor() {
        this.initEventListeners();
        this.mulberry = null;
        this.lastData = null;
        this.lastInfo = null;
    }

    initEventListeners() {
        const genBtn = document.getElementById('generate-btn');
        const expBtn = document.getElementById('export-btn');
        const simBtn = document.getElementById('simulate-btn');
        const dlExcelBtn = document.getElementById('download-excel-btn');
        const tInput = document.getElementById('t-input');
        const kInput = document.getElementById('k-input');

        // Sync logic: Only update k from t
        if (tInput && kInput) {
            tInput.addEventListener('input', () => {
                const t = parseInt(tInput.value);
                if (!isNaN(t) && t > 0) {
                    const k = Math.sqrt(t);
                    // Update regardless of integer status to provide feedback
                    // Use max 2 decimals if float
                    kInput.value = Number.isInteger(k) ? k : k.toFixed(2);
                }
            });
            // Removed kInput listener as per user request
        }

        if (genBtn) {
            genBtn.addEventListener('click', () => {
                try {
                    this.generate();
                } catch (e) {
                    console.error(e);
                    alert("Error generating design: " + e.message);
                }
            });
        }

        if (expBtn) {
            expBtn.addEventListener('click', () => this.exportCSV());
        }

        if (simBtn) {
            simBtn.addEventListener('click', () => this.simulate());
        }

        if (dlExcelBtn) {
            dlExcelBtn.addEventListener('click', () => this.exportCSV());
        }

        const dlMapBtn = document.getElementById('download-map-btn');
        if (dlMapBtn) {
            dlMapBtn.addEventListener('click', () => this.downloadMap());
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

    downloadMap() {
        const mapContainer = document.getElementById('map-container');
        if (!mapContainer || mapContainer.innerHTML === '') {
            alert("No map to download. Please generate a design first.");
            return;
        }

        // Use html2canvas to capture the map with transparent background
        html2canvas(mapContainer, {
            backgroundColor: null, // Ensure transparency
            scale: 2, // Higher quality
            logging: false,
            useCORS: true
        }).then(canvas => {
            const link = document.createElement('a');
            link.download = 'square_lattice_map.png';
            link.href = canvas.toDataURL('image/png');
            link.click();
        }).catch(err => {
            console.error("Map Download Error:", err);
            alert("Failed to download map. See console for details.");
        });
    }

    // ... (mulberry32 and shuffle methods remain unchanged)

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
        if (!this.lastData) return;

        // Generate random values (e.g., Yield)
        // Using a simple normal-ish distribution or range
        this.lastData.forEach(row => {
            // Random value between 10 and 50 with 1 decimal
            row.value = (Math.random() * 40 + 10).toFixed(1);
        });

        this.render();
        alert("Simulation completed! Values added to Field Book.");

        // Switch to Field Book tab to show results
        const fbTab = document.querySelector('.tab[data-tab="field-book"]');
        if (fbTab) fbTab.click();
    }

    generate() {
        // ... (existing generate logic)
        // Inputs
        const tInputEl = document.getElementById('t-input');
        const rInputEl = document.getElementById('r-input');
        const locInputEl = document.getElementById('loc-input');
        const plotInputEl = document.getElementById('plot-input');
        const seedInputEl = document.getElementById('seed-input');
        const dataInputEl = document.getElementById('data-input');

        if (!tInputEl || !rInputEl) return;

        const tInput = parseInt(tInputEl.value);
        const rInput = parseInt(rInputEl.value);
        const lCount = parseInt(locInputEl.value);
        const startPlot = parseInt(plotInputEl.value);

        const rawSeed = seedInputEl.value;
        let seed = (rawSeed !== "" && rawSeed !== null) ? parseInt(rawSeed) : Math.floor(Math.random() * 999999);
        const dataInput = dataInputEl ? dataInputEl.value : "";

        // Validation
        if (isNaN(tInput) || tInput < 4) {
            alert("Number of treatments must be at least 4.");
            return;
        }
        const k = Math.sqrt(tInput);
        if (k % 1 !== 0) {
            alert("Number of treatments must be a square number (4, 9, 16, 25, 49, 64, 81, 100, etc.)");
            return;
        }

        if (isNaN(seed)) seed = Math.floor(Math.random() * 999999);
        this.mulberry = this.mulberry32(seed);

        // Prepare Treatments
        let treatments = [];
        if (dataInput.trim().length > 0) {
            treatments = dataInput.split(',').map(s => s.trim()).filter(s => s.length > 0);
            if (treatments.length !== tInput) {
                alert(`Treatment list length (${treatments.length}) does not match Total Treatments (${tInput}).`);
                return;
            }
        } else {
            treatments = Array.from({ length: tInput }, (_, i) => `G-${i + 1}`);
        }

        const data = [];
        const entryMap = treatments.map((t, i) => ({ entry: i + 1, label: t }));

        for (let l = 1; l <= lCount; l++) {
            const locName = lCount === 1 ? "Main Site" : `Location ${l}`;
            let plotCounter = startPlot + (l - 1) * 1000;

            for (let r = 1; r <= rInput; r++) {
                // For a Square Lattice k x k
                // We create k blocks of size k
                let blocks = [];

                if (r === 1) {
                    for (let i = 0; i < k; i++) {
                        blocks.push(entryMap.slice(i * k, (i + 1) * k));
                    }
                } else if (r === 2) {
                    for (let j = 0; j < k; j++) {
                        let block = [];
                        for (let i = 0; i < k; i++) {
                            block.push(entryMap[i * k + j]);
                        }
                        blocks.push(block);
                    }
                } else {
                    let shuffled = this.shuffle([...entryMap]);
                    for (let i = 0; i < k; i++) {
                        blocks.push(shuffled.slice(i * k, (i + 1) * k));
                    }
                }

                blocks = blocks.map(b => this.shuffle([...b]));
                const randomizedBlocks = this.shuffle([...blocks]);

                randomizedBlocks.forEach((block, bIdx) => {
                    const blockId = bIdx + 1;
                    block.forEach(entry => {
                        data.push({
                            id: data.length + 1,
                            location: locName,
                            plot: plotCounter++,
                            rep: r,
                            iblock: blockId,
                            entry: entry.entry,
                            treatment: entry.label,
                            value: "" // Initialize empty
                        });
                    });
                });
            }
        }

        this.lastData = data;
        this.lastInfo = { t: tInput, k: k, r: rInput, l: lCount, total: data.length };
        this.render();
    }

    render() {
        const results = document.getElementById('results');
        if (results) results.style.display = 'block';

        const actionRow = document.getElementById('action-buttons-row');
        if (actionRow) actionRow.classList.remove('d-none');

        // Update Info
        if (document.getElementById('info-k')) document.getElementById('info-k').innerText = this.lastInfo.k;
        if (document.getElementById('info-blocks')) document.getElementById('info-blocks').innerText = this.lastInfo.k;
        if (document.getElementById('info-total')) document.getElementById('info-total').innerText = this.lastInfo.total;

        // Table
        const table = document.querySelector('#field-book-table');
        const thead = table.querySelector('thead tr');
        const tbody = table.querySelector('tbody');

        if (tbody && this.lastData) {
            // Update Header if simulated
            const hasValue = this.lastData.some(row => row.value !== "");

            // Reset header
            thead.innerHTML = `
                <th>ID</th>
                <th>Location</th>
                <th>Plot</th>
                <th>Replicate</th>
                <th>I-Block</th>
                <th>Entry</th>
                <th>Treatment</th>
                ${hasValue ? '<th>Value</th>' : ''}
            `;

            tbody.innerHTML = '';
            this.lastData.forEach(row => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${row.id}</td>
                    <td>${row.location}</td>
                    <td>${row.plot}</td>
                    <td>${row.rep}</td>
                    <td>${row.iblock}</td>
                    <td>${row.entry}</td>
                    <td><span style="color: var(--primary); font-weight: 600;">${row.treatment}</span></td>
                    ${hasValue ? `<td>${row.value}</td>` : ''}
                `;
                tbody.appendChild(tr);
            });
        }

        this.renderMap();
    }

    // ... (renderMap remains unchanged)
    renderMap() {
        const container = document.getElementById('map-container');
        if (!container || !this.lastData) return;
        container.innerHTML = '';

        const locations = [...new Set(this.lastData.map(d => d.location))];

        locations.forEach(loc => {
            const siteDiv = document.createElement('div');
            siteDiv.className = 'site-block';
            siteDiv.innerHTML = `<h2 class="site-title">${loc}</h2>`;

            const locData = this.lastData.filter(d => d.location === loc);
            const reps = [...new Set(locData.map(d => d.rep))];

            reps.forEach(rep => {
                const repDiv = document.createElement('div');
                repDiv.className = 'rep-grid-container';
                repDiv.innerHTML = `<div class="rep-title">Replicate ${rep}</div>`;

                const repData = locData.filter(d => d.rep === rep);
                const iblocks = [...new Set(repData.map(d => d.iblock))];

                const latticeGrid = document.createElement('div');
                latticeGrid.className = 'lattice-grid';
                latticeGrid.style.gridTemplateColumns = `repeat(auto-fit, minmax(140px, 1fr))`;

                iblocks.forEach(ib => {
                    const blockData = repData.filter(d => d.iblock === ib);
                    const ibUnit = document.createElement('div');
                    ibUnit.className = 'iblock-unit';
                    ibUnit.innerHTML = `<div class="iblock-label">I-Block ${ib}</div>`;

                    blockData.forEach(p => {
                        const trtUnit = document.createElement('div');
                        trtUnit.className = 'trt-unit';
                        trtUnit.innerHTML = `<span class="plot-num">Plot ${p.plot}</span><b>${p.treatment}</b>`;
                        ibUnit.appendChild(trtUnit);
                    });

                    latticeGrid.appendChild(ibUnit);
                });

                repDiv.appendChild(latticeGrid);
                siteDiv.appendChild(repDiv);
            });

            container.appendChild(siteDiv);
        });
    }

    exportCSV() {
        if (!this.lastData) return;
        const hasValue = this.lastData.some(row => row.value !== "");

        let header = "ID,LOCATION,PLOT,REPLICATE,IBLOCK,ENTRY,TREATMENT";
        if (hasValue) header += ",VALUE";
        let csv = header + "\n";

        this.lastData.forEach(r => {
            let row = `${r.id},${r.location},${r.plot},${r.rep},${r.iblock},${r.entry},"${r.treatment}"`;
            if (hasValue) row += `,${r.value}`;
            csv += row + "\n";
        });

        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'square_lattice_design.csv';
        a.click();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    try {
        if (document.getElementById('generate-btn')) {
            new SquareLatticeDesign();
        }
    } catch (e) {
        console.error("Square Lattice Init Error", e);
    }
});
