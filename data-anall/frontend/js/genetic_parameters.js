document.addEventListener('DOMContentLoaded', () => {
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const uploadMsg = document.getElementById('upload-msg');
    const configPanel = document.getElementById('config-panel');
    const analyzeBtn = document.getElementById('analyze-btn');
    const loading = document.getElementById('loading');
    const outputContent = document.getElementById('output-content');
    const emptyState = document.getElementById('empty-state');
    const errorBox = document.getElementById('error-box');

    const genotypeCol = document.getElementById('genotype-col');
    const repCol = document.getElementById('rep-col');
    const traitChecks = document.getElementById('trait-checks');

    let fileObj = null;
    let headers = [];
    let analysisResult = null;

    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.style.borderColor = '#d63384'; });
    dropZone.addEventListener('dragleave', () => { dropZone.style.borderColor = 'rgba(255,255,255,0.2)'; });
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.style.borderColor = 'rgba(255,255,255,0.2)';
        if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
    });
    fileInput.addEventListener('change', (e) => { if (e.target.files.length) handleFile(e.target.files[0]); });

    function handleFile(file) {
        if (!file.name.endsWith('.csv')) { alert("CSV file required."); return; }
        fileObj = file;
        const reader = new FileReader();
        reader.onload = (e) => {
            const lines = e.target.result.split(/\r?\n/).filter(line => line.trim() !== '');
            headers = lines[0].split(',').map(h => h.trim());
            populateUI(headers);
            configPanel.classList.remove('hidden');
            uploadMsg.innerHTML = `<p style="color: #4ade80;">✅ ${file.name}</p>`;
        };
        reader.readAsText(file);
    }

    function populateUI(cols) {
        genotypeCol.innerHTML = '<option value="">-- Select --</option>';
        repCol.innerHTML = '<option value="">-- Select --</option>';
        traitChecks.innerHTML = '';
        cols.forEach(col => {
            genotypeCol.add(new Option(col, col));
            repCol.add(new Option(col, col));
            const div = document.createElement('div');
            div.className = 'check-item';
            div.innerHTML = `<input type="checkbox" value="${col}" id="chk-${col}"> <label for="chk-${col}">${col}</label>`;
            traitChecks.appendChild(div);
        });
    }

    analyzeBtn.addEventListener('click', async () => {
        const gCol = genotypeCol.value;
        const rCol = repCol.value;
        const selectedTraits = Array.from(traitChecks.querySelectorAll('input:checked')).map(i => i.value);

        if (!gCol || !rCol || selectedTraits.length === 0) {
            errorBox.textContent = "Please select Genotype, Replication and at least one trait.";
            errorBox.style.display = 'block';
            return;
        }

        errorBox.style.display = 'none';
        loading.classList.remove('hidden');
        outputContent.classList.add('hidden');
        emptyState.classList.add('hidden');

        const formData = new FormData();
        formData.append('file', fileObj);
        formData.append('genotype_col', gCol);
        formData.append('rep_col', rCol);
        formData.append('traits', selectedTraits.join(','));

        try {
            const resp = await fetch('http://localhost:8000/analyze_genetic_parameters', { method: 'POST', body: formData });
            const data = await resp.json();
            loading.classList.add('hidden');

            if (data.status === 'success') {
                analysisResult = data;
                outputContent.classList.remove('hidden');
                renderTabs(Object.keys(data.results));
                setupDownloads(formData);
            } else {
                errorBox.textContent = data.message;
                errorBox.style.display = 'block';
            }
        } catch (e) {
            loading.classList.add('hidden');
            errorBox.textContent = "Network error. Check if backend is running.";
            errorBox.style.display = 'block';
        }
    });

    function renderTabs(traits) {
        const container = document.getElementById('tab-container');
        container.innerHTML = '';
        traits.forEach((trait, idx) => {
            const tab = document.createElement('div');
            tab.className = `trait-tab ${idx === 0 ? 'active' : ''}`;
            tab.textContent = trait;
            tab.onclick = () => {
                document.querySelectorAll('.trait-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                renderTraitDetail(trait);
            };
            container.appendChild(tab);
        });
        renderTraitDetail(traits[0]);
    }

    function renderTraitDetail(trait) {
        const res = analysisResult.results[trait];
        const p = res.parameters;

        document.getElementById('h2-val').textContent = p.h2.toFixed(3);
        document.getElementById('gam-val').textContent = p.GAM.toFixed(2) + "%";
        document.getElementById('gcv-val').textContent = p.GCV.toFixed(2);
        document.getElementById('pcv-val').textContent = p.PCV.toFixed(2);

        if (res.plot) {
            document.getElementById('variability-plot').src = `data:image/png;base64,${res.plot}`;
        }

        // ANOVA
        const anovaBody = document.getElementById('anova-body');
        anovaBody.innerHTML = '';
        const sources = ['Replication', 'Genotype', 'Error', 'Total'];
        const a = res.anova;
        for (let i = 0; i < 4; i++) {
            const row = `<tr>
                <td><strong>${sources[i]}</strong></td>
                <td>${a.DF[i]}</td>
                <td>${a.SS[i].toFixed(4)}</td>
                <td>${a.MS[i] ? a.MS[i].toFixed(4) : '-'}</td>
                <td>${a.F[i] ? a.F[i].toFixed(4) : '-'}</td>
                <td>${a.P[i] ? a.P[i].toFixed(4) : '-'}</td>
            </tr>`;
            anovaBody.insertAdjacentHTML('beforeend', row);
        }

        // Means
        const meansBody = document.getElementById('means-body');
        meansBody.innerHTML = '';
        res.means.forEach(m => {
            const gColName = genotypeCol.value;
            const row = `<tr>
                <td><strong>${m[gColName]}</strong></td>
                <td>${m.mean.toFixed(4)}</td>
                <td>${m.sem.toFixed(4)}</td>
                <td style="color: #4ade80; font-weight: bold;">${m.group}</td>
            </tr>`;
            meansBody.insertAdjacentHTML('beforeend', row);
        });
    }

    function setupDownloads(formData) {
        const dl = (id, ep, fn) => {
            const btn = document.getElementById(id);
            const newBtn = btn.cloneNode(true);
            btn.parentNode.replaceChild(newBtn, btn);
            newBtn.addEventListener('click', async () => {
                const r = await fetch(`http://localhost:8000/${ep}`, { method: 'POST', body: formData });
                if (r.ok) {
                    const blob = await r.blob();
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a'); a.href = url; a.download = fn;
                    document.body.appendChild(a); a.click(); a.remove();
                }
            });
        };
        dl('dl-doc-btn', 'report_genetic_parameters_doc', 'Genetic_Parameters_Report.docx');
        dl('dl-excel-btn', 'report_genetic_parameters_excel', 'Genetic_Parameters_Output.xlsx');
    }
});
