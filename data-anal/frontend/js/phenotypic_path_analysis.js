document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
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
    const dependentVarSelect = document.getElementById('dependent-var');
    const independentVarsContainer = document.getElementById('independent-vars');
    const analyzeBtn = document.getElementById('analyze-btn');

    // State
    let headers = [];
    let fileObj = null;

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
        dependentVarSelect.innerHTML = '<option value="">-- Select --</option>';
        independentVarsContainer.innerHTML = '';
        cols.forEach(col => {
            genotypeColSelect.add(new Option(col, col));
            repColSelect.add(new Option(col, col));
            dependentVarSelect.add(new Option(col, col));
            const div = document.createElement('div');
            div.className = 'check-item';
            div.innerHTML = `<input type="checkbox" value="${col}" id="chk-${col}"> <label for="chk-${col}">${col}</label>`;
            independentVarsContainer.appendChild(div);
        });
    }

    analyzeBtn.addEventListener('click', async () => {
        const genotype_col = genotypeColSelect.value;
        const rep_col = repColSelect.value;
        const dependent_var = dependentVarSelect.value;
        const independent_vars = Array.from(independentVarsContainer.querySelectorAll('input:checked')).map(i => i.value);

        if (!genotype_col || !rep_col || !dependent_var) { showError("Check column selections."); return; }
        if (independent_vars.length < 2) { showError("Select at least 2 traits."); return; }

        errorBox.style.display = 'none';
        loading.classList.remove('hidden');
        outputContent.classList.add('hidden');

        const formData = new FormData();
        formData.append('file', fileObj);
        formData.append('genotype_col', genotype_col);
        formData.append('rep_col', rep_col);
        formData.append('dependent_var', dependent_var);
        formData.append('independent_vars', independent_vars.join(','));

        try {
            const resp = await fetch('http://localhost:8000/analyze_phenotypic_path', { method: 'POST', body: formData });
            const res = await resp.json();
            loading.classList.add('hidden');
            if (res.status === 'success') {
                outputContent.classList.remove('hidden');
                renderResults(res);
                setupDownloads(formData);
            } else { showError(res.message); }
        } catch (e) { loading.classList.add('hidden'); showError("Server error."); }
    });

    function renderResults(res) {
        const table = res.path_table;
        const traits = res.traits;
        const dep = res.dependent;

        if (res.diagram) { document.getElementById('path-diagram').src = `data:image/png;base64,${res.diagram}`; }

        let headHtml = `<tr><th>Character</th><th>Direct Effect</th>`;
        traits.forEach(t => headHtml += `<th>via ${t}</th>`);
        headHtml += `<th>Total Indirect</th><th>rp with ${dep}</th></tr>`;
        document.getElementById('path-head').innerHTML = headHtml;

        let bodyHtml = "";
        table.forEach(row => {
            bodyHtml += `<tr><td><strong>${row.Trait}</strong></td>`;
            bodyHtml += `<td class="direct-effect">${row["Direct Effect"].toFixed(4)}</td>`;
            traits.forEach(t => {
                const cell = row[`via ${t}`];
                bodyHtml += `<td>${(typeof cell === 'string') ? '-' : cell.toFixed(4)}</td>`;
            });
            bodyHtml += `<td>${row["Total Indirect"].toFixed(4)}</td>`;
            bodyHtml += `<td><strong>${row[`r_p with ${dep}`].toFixed(4)}</strong></td></tr>`;
        });
        document.getElementById('path-body').innerHTML = bodyHtml;

        document.getElementById('stat-residual').textContent = res.residual.toFixed(4);
        document.getElementById('stat-explained').textContent = res.explained.toFixed(2) + "%";

        const topRow = table.reduce((prev, curr) => (Math.abs(curr["Direct Effect"]) > Math.abs(prev["Direct Effect"])) ? curr : prev);
        document.getElementById('interpretation').innerHTML = `
            <p>The Phenotypic Path Analysis reveals that <strong>${topRow.Trait}</strong> has the most prominent direct influence (${topRow["Direct Effect"].toFixed(4)}) on <strong>${dep}</strong>. 
            The residual effect of ${res.residual.toFixed(4)} shows that ${res.explained.toFixed(1)}% of the observable phenotypic variation in ${dep} is accounted for by the characters included in this model.</p>
        `;
    }

    function setupDownloads(formData) {
        const setupBtn = (id, endpoint, filename) => {
            const btn = document.getElementById(id);
            const newBtn = btn.cloneNode(true);
            btn.parentNode.replaceChild(newBtn, btn);
            newBtn.addEventListener('click', async () => {
                const r = await fetch(`http://localhost:8000/${endpoint}`, { method: 'POST', body: formData });
                if (r.ok) {
                    const blob = await r.blob();
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a'); a.href = url; a.download = filename;
                    document.body.appendChild(a); a.click(); a.remove();
                }
            });
        };
        setupBtn('dl-doc-btn', 'report_phenotypic_path_doc', 'Phenotypic_Path_Report.docx');
        setupBtn('dl-excel-btn', 'report_phenotypic_path_excel', 'Phenotypic_Path_Output.xlsx');
    }

    function showError(msg) { errorBox.textContent = msg; errorBox.style.display = 'block'; }
});
