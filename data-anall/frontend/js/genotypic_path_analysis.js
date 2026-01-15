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
    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.style.borderColor = '#d63384'; });
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
            const opt1 = document.createElement('option'); opt1.value = col; opt1.textContent = col;
            genotypeColSelect.appendChild(opt1);
            const opt2 = document.createElement('option'); opt2.value = col; opt2.textContent = col;
            repColSelect.appendChild(opt2);
            const opt3 = document.createElement('option'); opt3.value = col; opt3.textContent = col;
            dependentVarSelect.appendChild(opt3);

            const div = document.createElement('div');
            div.className = 'check-item';
            div.innerHTML = `<input type="checkbox" value="${col}" id="chk-${col}"> <label for="chk-${col}">${col}</label>`;
            independentVarsContainer.appendChild(div);
        });

        // Smart selection
        const gIdx = cols.findIndex(c => c.toLowerCase().includes('geno'));
        if (gIdx != -1) genotypeColSelect.selectedIndex = gIdx + 1;
        const rIdx = cols.findIndex(c => c.toLowerCase().includes('rep'));
        if (rIdx != -1) repColSelect.selectedIndex = rIdx + 1;
        const dIdx = cols.findIndex(c => c.toLowerCase().includes('yield') || c.toLowerCase().includes('total'));
        if (dIdx != -1) dependentVarSelect.selectedIndex = dIdx + 1;
    }

    analyzeBtn.addEventListener('click', async () => {
        const genotype_col = genotypeColSelect.value;
        const rep_col = repColSelect.value;
        const dependent_var = dependentVarSelect.value;
        const independent_vars = Array.from(independentVarsContainer.querySelectorAll('input:checked')).map(i => i.value);

        if (!genotype_col || !rep_col || !dependent_var) { showError("Genotype, Replication, and Dependent variables are required."); return; }
        if (independent_vars.length < 2) { showError("Select at least 2 independent traits."); return; }
        if (independent_vars.includes(dependent_var)) { showError("Dependent variable cannot be an independent variable."); return; }

        errorBox.style.display = 'none';
        loading.classList.remove('hidden');
        outputContent.classList.add('hidden');
        emptyState.classList.add('hidden');

        const formData = new FormData();
        formData.append('file', fileObj);
        formData.append('genotype_col', genotype_col);
        formData.append('rep_col', rep_col);
        formData.append('dependent_var', dependent_var);
        formData.append('independent_vars', independent_vars.join(','));

        try {
            const resp = await fetch('http://localhost:8000/analyze_genotypic_path', { method: 'POST', body: formData });
            const res = await resp.json();
            loading.classList.add('hidden');

            if (res.status === 'success') {
                outputContent.classList.remove('hidden');
                renderResults(res);
                setupDownloads(formData);
                outputContent.scrollIntoView({ behavior: 'smooth' });
            } else {
                showError(res.message);
            }
        } catch (e) {
            loading.classList.add('hidden');
            showError("Network error. Backend might be offline.");
        }
    });

    function renderResults(res) {
        const table = res.path_table;
        const traits = res.traits;
        const dep = res.dependent;

        // Path Diagram
        if (res.diagram) {
            document.getElementById('path-diagram').src = `data:image/png;base64,${res.diagram}`;
        }

        // Path Table Headers
        let headHtml = `<tr><th>Character</th><th>Direct Effect</th>`;
        traits.forEach(t => headHtml += `<th>via ${t}</th>`);
        headHtml += `<th>Total Indirect</th><th>rg with ${dep}</th></tr>`;
        document.getElementById('path-head').innerHTML = headHtml;

        // Path Table Body
        let bodyHtml = "";
        table.forEach((row, i) => {
            bodyHtml += `<tr><td><strong>${row.Trait}</strong></td>`;
            bodyHtml += `<td class="direct-effect">${row["Direct Effect"].toFixed(4)}</td>`;
            traits.forEach(t => {
                const cell = row[`via ${t}`];
                if (typeof cell === 'string' && cell.startsWith('(')) {
                    bodyHtml += `<td style="opacity: 0.5;">-</td>`; // don't show via itself in row
                } else {
                    bodyHtml += `<td>${cell.toFixed(4)}</td>`;
                }
            });
            bodyHtml += `<td>${row["Total Indirect"].toFixed(4)}</td>`;
            bodyHtml += `<td><strong>${row[`r_g with ${dep}`].toFixed(4)}</strong></td></tr>`;
        });
        document.getElementById('path-body').innerHTML = bodyHtml;

        // States
        document.getElementById('stat-residual').textContent = res.residual.toFixed(4);
        document.getElementById('stat-explained').textContent = res.explained.toFixed(2) + "%";
        document.getElementById('stat-unexplained').textContent = res.unexplained.toFixed(2) + "%";

        // Interpretation
        const topRow = table.reduce((prev, current) => (Math.abs(current["Direct Effect"]) > Math.abs(prev["Direct Effect"])) ? current : prev);
        document.getElementById('interpretation').innerHTML = `
            <p>The trait <strong>${topRow.Trait}</strong> showed the highest direct contribution (${topRow["Direct Effect"].toFixed(4)}) toward <strong>${dep}</strong>. 
            The residual effect is <strong>${res.residual.toFixed(4)}</strong>, indicating that <strong>${res.explained.toFixed(1)}%</strong> of the genotypic variation 
            in ${dep} is explained by these ${traits.length} component traits.</p>
        `;
    }

    function setupDownloads(formData) {
        const setupBtn = (id, endpoint, filename) => {
            const btn = document.getElementById(id);
            const newBtn = btn.cloneNode(true);
            btn.parentNode.replaceChild(newBtn, btn);
            newBtn.addEventListener('click', async () => {
                newBtn.disabled = true;
                newBtn.textContent = "Generating...";
                const r = await fetch(`http://localhost:8000/${endpoint}`, { method: 'POST', body: formData });
                if (r.ok) {
                    const blob = await r.blob();
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a'); a.href = url; a.download = filename;
                    document.body.appendChild(a); a.click(); a.remove();
                }
                newBtn.disabled = false;
                newBtn.textContent = (id === 'dl-doc-btn') ? "📄 Download Detailed Report (DOC)" : "📗 Download Result (Excel)";
            });
        };
        setupBtn('dl-doc-btn', 'report_genotypic_path_doc', 'Genotypic_Path_Report.docx');
        setupBtn('dl-excel-btn', 'report_genotypic_path_excel', 'Genotypic_Path_Output.xlsx');
    }

    function showError(msg) {
        errorBox.textContent = msg; errorBox.style.display = 'block';
    }
});
