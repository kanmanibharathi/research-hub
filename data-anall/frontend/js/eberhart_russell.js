document.addEventListener('DOMContentLoaded', () => {
    const fileInput = document.getElementById('file-input');
    const dropZone = document.getElementById('drop-zone');
    const configPanel = document.getElementById('config-panel');
    const analyzeBtn = document.getElementById('analyze-btn');
    const dlDocBtn = document.getElementById('dl-doc-btn');
    const loading = document.getElementById('loading');
    const emptyState = document.getElementById('empty-state');
    const outputContent = document.getElementById('output-content');
    const errorBox = document.getElementById('error-box');

    const genotypeCol = document.getElementById('genotype-col');
    const envCol = document.getElementById('env-col');
    const repCol = document.getElementById('rep-col');
    const traitCol = document.getElementById('trait-col');
    const modelType = document.getElementById('model-type');

    let currentFile = null;

    // File Handling
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleFile(e.target.files[0]);
        }
    });

    function handleFile(file) {
        currentFile = file;
        document.getElementById('upload-msg').innerHTML = `<p>✅ ${file.name}</p>`;

        const reader = new FileReader();
        reader.onload = (e) => {
            const text = e.target.result;
            const lines = text.split('\n');
            if (lines.length > 0) {
                const headers = lines[0].split(',').map(h => h.trim());
                populateSelectors(headers);
                configPanel.classList.remove('hidden');
            }
        };
        reader.readAsText(file);
    }

    function populateSelectors(headers) {
        [genotypeCol, envCol, repCol, traitCol].forEach(select => {
            select.innerHTML = headers.map(h => `<option value="${h}">${h}</option>`).join('');
        });

        // Smarter defaults
        const h_lower = headers.map(h => h.toLowerCase());
        const find = (keywords) => headers[h_lower.findIndex(h => keywords.some(k => h.includes(k)))];

        const g = find(['gen', 'entry', 'variety']);
        const e = find(['env', 'loc', 'year', 'site']);
        const r = find(['rep', 'block']);
        const t = headers.find(h => !['gen', 'env', 'rep', 'loc', 'year', 'site', 'entry', 'variety', 'block'].some(k => h.toLowerCase().includes(k)));

        if (g) genotypeCol.value = g;
        if (e) envCol.value = e;
        if (r) repCol.value = r;
        if (t) traitCol.value = t;
    }

    analyzeBtn.addEventListener('click', async () => {
        if (!currentFile) return;

        errorBox.style.display = 'none';
        loading.classList.remove('hidden');
        emptyState.classList.add('hidden');
        outputContent.classList.add('hidden');

        const formData = new FormData();
        formData.append('file', currentFile);
        formData.append('geno_col', genotypeCol.value);
        formData.append('env_col', envCol.value);
        formData.append('rep_col', repCol.value);
        formData.append('trait_col', traitCol.value);
        formData.append('model_type', modelType.value);

        try {
            const response = await fetch('http://127.0.0.1:8000/analyze_eberhart_russell', {
                method: 'POST',
                body: formData
            });

            const data = await response.json();

            if (data.status === 'success') {
                renderResults(data);
                loading.classList.add('hidden');
                outputContent.classList.remove('hidden');
            } else {
                throw new Error(data.message || 'Analysis failed');
            }
        } catch (err) {
            loading.classList.add('hidden');
            emptyState.classList.remove('hidden');
            errorBox.textContent = err.message;
            errorBox.style.display = 'block';
        }
    });

    function renderResults(data) {
        // Bartlett Message
        const b = data.bartlett;
        const msg = `Bartlett's Test (Error Var. Homogeneity): \u03C7\u00B2 = ${b.stat.toFixed(3)}, p = ${b.p.toExponential(2)} (${b.p > 0.05 ? 'Homogeneous' : 'Heterogeneous'})`;
        document.getElementById('bartlett-msg').textContent = msg;

        // Pooled ANOVA
        const pooledBody = document.getElementById('pooled-anova-body');
        pooledBody.innerHTML = Object.entries(data.pooled_anova).map(([src, v]) => `
            <tr>
                <td style="text-align: left; padding-left: 1.5rem;">${src}</td>
                <td>${v.df}</td>
                <td>${v.SS.toFixed(3)}</td>
                <td>${v.MS.toFixed(3)}</td>
                <td>${v.F > 0 ? v.F.toFixed(3) : '-'}</td>
                <td class="sig-star">${v.sig}</td>
            </tr>
        `).join('');

        // Stability ANOVA
        const stabBody = document.getElementById('stability-anova-body');
        stabBody.innerHTML = Object.entries(data.stability_anova).map(([src, v]) => `
            <tr>
                <td style="text-align: left; padding-left: 1.5rem;">${src}</td>
                <td>${v.df}</td>
                <td>${v.SS.toFixed(3)}</td>
                <td>${v.MS.toFixed(3)}</td>
                <td>${v.F > 0 ? v.F.toFixed(3) : '-'}</td>
                <td class="sig-star">${v.sig}</td>
            </tr>
        `).join('');

        // Environmental Index
        const envBody = document.getElementById('env-index-body');
        envBody.innerHTML = data.env_indices.map(item => `
            <tr>
                <td>${item.env}</td>
                <td>${item.mean.toFixed(3)}</td>
                <td>${item.index.toFixed(3)}</td>
            </tr>
        `).join('');

        // Parameters
        const paramsBody = document.getElementById('params-body');
        paramsBody.innerHTML = data.stability_parameters.map(p => {
            const infClass = p.inference.toLowerCase().includes('stable') ? 'stable' :
                p.inference.toLowerCase().includes('responsive') ? 'responsive' :
                    p.inference.toLowerCase().includes('unstable') ? 'unstable' : 'average';

            return `
            <tr>
                <td>${p.genotype}</td>
                <td>${p.mean.toFixed(3)}</td>
                <td>${p.bi.toFixed(3)}</td>
                <td>${p.se_bi.toFixed(4)}</td>
                <td>${p.s2di.toFixed(3)}</td>
                <td class="${p.p_b1 < 0.05 ? 'sig-star' : ''}">${p.p_b1 < 0.05 ? '*' : 'ns'}</td>
                <td class="${p.p_s2di < 0.05 ? 'sig-star' : ''}">${p.p_s2di < 0.05 ? '*' : 'ns'}</td>
                <td><span class="inference-badge ${infClass}">${p.inference}</span></td>
            </tr>
            `;
        }).join('');
    }

    dlDocBtn.addEventListener('click', async () => {
        if (!currentFile) return;

        const formData = new FormData();
        formData.append('file', currentFile);
        formData.append('geno_col', genotypeCol.value);
        formData.append('env_col', envCol.value);
        formData.append('rep_col', repCol.value);
        formData.append('trait_col', traitCol.value);
        formData.append('model_type', modelType.value);

        try {
            const response = await fetch('http://127.0.0.1:8000/report_eberhart_russell', {
                method: 'POST',
                body: formData
            });

            if (response.ok) {
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `Eberhart_Russell_Stability_Report_${traitCol.value}.docx`;
                document.body.appendChild(a);
                a.click();
                a.remove();
            } else {
                alert('Failed to download report');
            }
        } catch (err) {
            alert('Error downloading report: ' + err.message);
        }
    });

    // Drag and Drop
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.style.background = 'rgba(255, 255, 255, 0.1)';
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.style.background = 'transparent';
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.style.background = 'transparent';
        if (e.dataTransfer.files.length > 0) {
            handleFile(e.dataTransfer.files[0]);
        }
    });
});
