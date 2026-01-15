document.addEventListener('DOMContentLoaded', () => {
    // UI Elements
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const uploadMsg = document.getElementById('upload-msg');
    const configPanel = document.getElementById('config-panel');
    const loading = document.getElementById('loading');
    const outputContent = document.getElementById('output-content');
    const emptyState = document.getElementById('empty-state');
    const errorBox = document.getElementById('error-box');

    const genotypeColSelect = document.getElementById('genotype-col');
    const repColSelect = document.getElementById('rep-col');
    const traitColsContainer = document.getElementById('trait-cols');
    const selectAllBtn = document.getElementById('select-all-btn');
    const analyzeBtn = document.getElementById('analyze-btn');

    // State
    let headers = [];
    let fileObj = null;
    let analysisResult = null;

    // File Handling
    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.style.borderColor = '#4ade80'; });
    dropZone.addEventListener('dragleave', () => { dropZone.style.borderColor = 'rgba(255,255,255,0.2)'; });
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.style.borderColor = 'rgba(255,255,255,0.2)';
        if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
    });
    fileInput.addEventListener('change', (e) => { if (e.target.files.length) handleFile(e.target.files[0]); });

    function handleFile(file) {
        if (!file.name.endsWith('.csv')) { showError("Please upload a CSV file."); return; }
        fileObj = file;
        const reader = new FileReader();
        reader.onload = (e) => {
            const lines = e.target.result.split(/\r?\n/).filter(line => line.trim() !== '');
            if (lines.length < 2) { showError("File is empty."); return; }
            headers = lines[0].split(',').map(h => h.trim());
            populateSelectors(headers);
            configPanel.classList.remove('hidden');
        };
        reader.readAsText(file);
        uploadMsg.innerHTML = `<p style="color: #4ade80;">✅ ${file.name}</p>`;
    }

    function populateSelectors(cols) {
        genotypeColSelect.innerHTML = '<option value="">-- Select --</option>';
        repColSelect.innerHTML = '<option value="">-- Select --</option>';
        traitColsContainer.innerHTML = '';

        cols.forEach(col => {
            genotypeColSelect.add(new Option(col, col));
            repColSelect.add(new Option(col, col));
            const div = document.createElement('div');
            div.className = 'check-item';
            div.innerHTML = `<input type="checkbox" value="${col}" id="trait-${col}"> <label for="trait-${col}">${col}</label>`;
            traitColsContainer.appendChild(div);
        });

        // Smart selection
        const gIdx = cols.findIndex(c => c.toLowerCase().includes('geno'));
        if (gIdx != -1) genotypeColSelect.selectedIndex = gIdx + 1;
    }

    selectAllBtn.addEventListener('click', () => {
        const checks = traitColsContainer.querySelectorAll('input[type="checkbox"]');
        const allChecked = Array.from(checks).every(c => c.checked);
        checks.forEach(c => c.checked = !allChecked);
        selectAllBtn.textContent = allChecked ? "Select All Variables" : "Deselect All";
    });

    analyzeBtn.addEventListener('click', async () => {
        const genotype_col = genotypeColSelect.value;
        const rep_col = repColSelect.value;
        const trait_cols = Array.from(traitColsContainer.querySelectorAll('input:checked')).map(i => i.value);

        if (!genotype_col || !rep_col || trait_cols.length < 3) {
            showError("Select Genotype, Replication and at least 3 traits.");
            return;
        }

        errorBox.style.display = 'none';
        loading.classList.remove('hidden');
        outputContent.classList.add('hidden');
        emptyState.classList.add('hidden');

        const formData = new FormData();
        formData.append('file', fileObj);
        formData.append('genotype_col', genotype_col);
        formData.append('rep_col', rep_col);
        formData.append('trait_cols', trait_cols.join(','));

        try {
            const resp = await fetch('http://localhost:8000/analyze_mahalanobis_d2', { method: 'POST', body: formData });
            const res = await resp.json();
            loading.classList.add('hidden');

            if (res.status === 'success') {
                analysisResult = res;
                outputContent.classList.remove('hidden');
                renderUI(res);
                setupDownloads(formData);
            } else { showError(res.message); }
        } catch (e) {
            loading.classList.add('hidden');
            showError("Server error. Check backend connection.");
        }
    });

    function renderUI(res) {
        // 1. Clusters
        const list = document.getElementById('cluster-list');
        list.innerHTML = '';
        Object.entries(res.clusters).forEach(([name, members]) => {
            const card = document.createElement('div');
            card.className = 'cluster-card';
            card.innerHTML = `<h3>${name} (${members.length})</h3><p style="opacity: 0.8;">${members.join(', ')}</p>`;
            list.appendChild(card);
        });

        // 2. Contributions
        const contBody = document.getElementById('contribution-body');
        contBody.innerHTML = '';
        res.trait_contributions.forEach(item => {
            const perc = item['Contribution %'] || 0;
            const row = `<tr><td>${item.Trait || 'N/A'}</td><td>${item.Count || 0}</td><td>${Number(perc).toFixed(2)}%</td></tr>`;
            contBody.insertAdjacentHTML('beforeend', row);
        });

        // 3. Visuals
        if (res.dendrogram) document.getElementById('dendro-img').src = `data:image/png;base64,${res.dendrogram}`;
        if (res.cluster_plot) document.getElementById('plot-img').src = `data:image/png;base64,${res.cluster_plot}`;

        // 4. Dynamic Table
        updateDynamicTable('intra-inter');
        document.getElementById('table-selector').onchange = (e) => updateDynamicTable(e.target.value);

        // 5. Interpretation
        const interDist = res.inter_distances;
        let maxVal = 0, clusterPair = "";
        if (interDist) {
            Object.keys(interDist).forEach(c1 => {
                Object.keys(interDist[c1]).forEach(c2 => {
                    const v = Number(interDist[c1][c2]);
                    if (v > maxVal) {
                        maxVal = v;
                        clusterPair = `${c1} and ${c2}`;
                    }
                });
            });
        }

        const topTrait = res.trait_contributions[0] || { Trait: 'N/A', 'Contribution %': 0 };
        document.getElementById('interpretation-text').innerHTML = `
            The most significant genetic divergence was quantified as <strong>D² = ${maxVal.toFixed(2)}</strong>, observed between 
            <strong>${clusterPair || '---'}</strong>. The physiological character <strong>${topTrait.Trait}</strong> contributed 
            the highest percentage (${Number(topTrait['Contribution %']).toFixed(1)}%) to total divergence. 
            Selection of parents from these widely separated clusters is likely to produce transgressive segregants in breeding populations.
        `;
    }

    function updateDynamicTable(type) {
        if (!analysisResult) return;
        const head = document.getElementById('dynamic-head');
        const body = document.getElementById('dynamic-body');
        head.innerHTML = ''; body.innerHTML = '';

        const fmt = (v) => (v !== undefined && v !== null) ? Number(v).toFixed(2) : '0.00';

        if (type === 'intra-inter') {
            const clusters = Object.keys(analysisResult.clusters || {});
            head.innerHTML = `<tr><th>Cluster</th>${clusters.map(c => `<th>${c}</th>`).join('')}</tr>`;
            clusters.forEach(c1 => {
                let row = `<tr><td><strong>${c1}</strong></td>`;
                clusters.forEach(c2 => {
                    const val = (c1 === c2) ? (analysisResult.intra_distances[c1] || 0) : analysisResult.inter_distances[c1][c2];
                    row += `<td style="${c1 === c2 ? 'color:#4ade80; font-weight:bold;' : ''}">${fmt(val)}</td>`;
                });
                body.insertAdjacentHTML('beforeend', row + '</tr>');
            });
        } else if (type === 'means') {
            const firstCluster = Object.values(analysisResult.cluster_means || {})[0] || {};
            const traits = Object.keys(firstCluster);
            head.innerHTML = `<tr><th>Cluster</th>${traits.map(t => `<th>${t}</th>`).join('')}</tr>`;
            Object.entries(analysisResult.cluster_means || {}).forEach(([name, traitsData]) => {
                let row = `<tr><td><strong>${name}</strong></td>`;
                traits.forEach(t => row += `<td>${fmt(traitsData[t])}</td>`);
                body.insertAdjacentHTML('beforeend', row + '</tr>');
            });
        } else if (type === 'd2') {
            const genos = Object.keys(analysisResult.d2_matrix || {});
            head.innerHTML = `<tr><th>Genotype</th>${genos.map(g => `<th>${g}</th>`).join('')}</tr>`;
            genos.forEach(g1 => {
                let row = `<tr><td><strong>${g1}</strong></td>`;
                genos.forEach(g2 => row += `<td>${fmt(analysisResult.d2_matrix[g1][g2])}</td>`);
                body.insertAdjacentHTML('beforeend', row + '</tr>');
            });
        }
    }

    function setupDownloads(formData) {
        const dl = (id, ep, fn) => {
            const btn = document.getElementById(id);
            const newBtn = btn.cloneNode(true);
            btn.parentNode.replaceChild(newBtn, btn);
            newBtn.addEventListener('click', async () => {
                newBtn.disabled = true;
                const r = await fetch(`http://localhost:8000/${ep}`, { method: 'POST', body: formData });
                if (r.ok) {
                    const blob = await r.blob();
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a'); a.href = url; a.download = fn;
                    document.body.appendChild(a); a.click(); a.remove();
                }
                newBtn.disabled = false;
            });
        };
        dl('dl-doc-btn', 'report_mahalanobis_d2_doc', 'Mahalanobis_D2_Clustering.docx');
        dl('dl-excel-btn', 'report_mahalanobis_d2_excel', 'Genetic_Divergence_Output.xlsx');
    }

    function showError(msg) { errorBox.textContent = msg; errorBox.style.display = 'block'; }
});
