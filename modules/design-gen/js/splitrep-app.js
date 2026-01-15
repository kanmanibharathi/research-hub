/**
 * Split Population (Split Families) Logic
 * Implementation of random distribution of genotypes into multiple locations 
 * while maintaining family balance.
 */
'use strict';

class SplitPopulation {
    constructor() {
        this.initEventListeners();
        this.mulberry = null;
        this.lastResults = null;
    }

    initEventListeners() {
        const splitBtn = document.getElementById('split-btn');
        const sampleBtn = document.getElementById('sample-btn');
        const exportBtn = document.getElementById('export-btn');
        const excelBtn = document.getElementById('download-excel-btn');

        if (splitBtn) {
            splitBtn.addEventListener('click', () => {
                if (window.requireAuth && !window.requireAuth()) return;
                try {
                    this.runSplit();
                    // Show Load Data and export buttons after generation
                    const sampleBtn = document.getElementById('sample-btn');
                    const exportBtn = document.getElementById('export-btn');
                    if (sampleBtn) sampleBtn.classList.remove('d-none');
                    if (exportBtn) exportBtn.classList.remove('d-none');
                } catch (e) {
                    console.error(e);
                    alert("Error: " + e.message);
                }
            });
        }
        if (sampleBtn) sampleBtn.addEventListener('click', () => this.loadExample());
        if (exportBtn) exportBtn.addEventListener('click', () => this.exportResults());
        if (excelBtn) excelBtn.addEventListener('click', () => this.exportResults());
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

    sampleUnique(min, max, count) {
        let pool = [];
        for (let i = min; i <= max; i++) pool.push(i);
        this.shuffle(pool);
        return pool.slice(0, count);
    }

    loadExample() {
        const families = 10;
        const n = 100;
        let data = "";
        for (let i = 1; i <= n; i++) {
            const f = Math.floor(Math.random() * families) + 1;
            data += `${1000 + i},SB-${i},F-${f}\n`;
        }
        if (document.getElementById('data-input')) document.getElementById('data-input').value = data;
    }

    parseInput() {
        if (!document.getElementById('data-input')) return null;
        const raw = document.getElementById('data-input').value.trim();
        if (!raw) {
            alert("Please provide entry data.");
            return null;
        }

        const lines = raw.split('\n');
        const entries = [];

        for (let line of lines) {
            const parts = line.split(',').map(s => s.trim());
            if (parts.length >= 3) {
                entries.push({
                    entry: parts[0],
                    name: parts[1],
                    family: parts[2]
                });
            }
        }

        if (entries.length === 0) {
            alert("Could not parse data. Ensure it follows ENTRY,NAME,FAMILY format.");
            return null;
        }

        return entries;
    }

    runSplit() {
        const lCountEl = document.getElementById('locations-input');
        const seedEl = document.getElementById('seed-input');

        if (!lCountEl) return;

        const lCount = parseInt(lCountEl.value);
        if (isNaN(lCount) || lCount < 1) {
            alert("Invalid number of locations.");
            return;
        }

        const entries = this.parseInput();
        if (!entries) return;

        let seed = parseInt(seedEl.value);
        if (isNaN(seed)) seed = Math.floor(Math.random() * 999999);
        this.mulberry = this.mulberry32(seed);

        // Group by family
        const families = {};
        entries.forEach(e => {
            if (!families[e.family]) families[e.family] = [];
            families[e.family].push(e);
        });

        const locationBuckets = Array.from({ length: lCount }, () => []);
        const familyLevels = Object.keys(families);

        familyLevels.forEach(fmly => {
            let population = [...families[fmly]];
            this.shuffle(population);
            const sj = population.length;

            if (sj < lCount) {
                // Case 1: Fewer individuals than locations
                const lOptions = this.sampleUnique(0, lCount - 1, sj);
                population.forEach((indiv, idx) => {
                    locationBuckets[lOptions[idx]].push(indiv);
                });
            } else {
                // Case 2 & 3: Individuals >= locations
                const baseReps = Math.floor(sj / lCount);
                const remainder = sj % lCount;

                // Distribute base reps evenly
                let pIdx = 0;
                for (let l = 0; l < lCount; l++) {
                    for (let r = 0; r < baseReps; r++) {
                        locationBuckets[l].push(population[pIdx++]);
                    }
                }

                // Distribute remainder randomly across locations
                if (remainder > 0) {
                    const lRes = this.sampleUnique(0, lCount - 1, remainder);
                    for (let r = 0; r < remainder; r++) {
                        locationBuckets[lRes[r]].push(population[pIdx++]);
                    }
                }
            }
        });

        this.lastResults = locationBuckets;
        this.render();
    }

    render() {
        const buckets = this.lastResults;
        const resultsSection = document.getElementById('results');
        const summaryGrid = document.getElementById('summary-grid');
        const summaryTableBody = document.querySelector('#summary-table tbody');
        const resultsTableBody = document.querySelector('#results-table tbody');

        if (resultsSection) resultsSection.style.display = 'block';
        if (summaryGrid) {
            summaryGrid.innerHTML = '';
            const totalEntries = buckets.reduce((acc, curr) => acc + curr.length, 0);
            summaryGrid.innerHTML = `
                <div class="info-item">
                    <div class="info-label">Total Locations</div>
                    <div class="info-value">${buckets.length}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">Total Genotypes</div>
                    <div class="info-value">${totalEntries}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">Families Detected</div>
                    <div class="info-value">${new Set(buckets.flat().map(e => e.family)).size}</div>
                </div>
            `;
        }

        if (summaryTableBody) summaryTableBody.innerHTML = '';
        if (resultsTableBody) resultsTableBody.innerHTML = '';

        // Summary Table & Results Table
        buckets.forEach((bucket, idx) => {
            const locName = `Location ${idx + 1}`;

            // Add to summary table
            if (summaryTableBody) {
                const sRow = document.createElement('tr');
                sRow.innerHTML = `<td>${locName}</td><td>${bucket.length}</td>`;
                summaryTableBody.appendChild(sRow);
            }

            // Add to results table
            if (resultsTableBody) {
                bucket.forEach(e => {
                    const rRow = document.createElement('tr');
                    rRow.innerHTML = `
                        <td>${e.entry}</td>
                        <td>${e.name}</td>
                        <td>${e.family}</td>
                        <td><span class="badge" style="background: var(--accent)">${locName}</span></td>
                    `;
                    resultsTableBody.appendChild(rRow);
                });
            }
        });
    }

    exportResults() {
        if (!this.lastResults) return;
        let csv = 'ENTRY,NAME,FAMILY,LOCATION\n';
        this.lastResults.forEach((bucket, idx) => {
            const locName = `Location ${idx + 1}`;
            bucket.forEach(e => {
                csv += `${e.entry},${e.name},${e.family},${locName}\n`;
            });
        });

        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'split_population_results.csv';
        a.click();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    try {
        if (document.getElementById('split-btn')) {
            window.app = new SplitPopulation();
        }
    } catch (e) {
        console.error("Split Pop Init Error", e);
    }
});
