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

    // Selectors
    const genotypeColSelect = document.getElementById('genotype-col');
    const repColSelect = document.getElementById('rep-col');
    const traitVarsContainer = document.getElementById('trait-vars');
    const selectAllBtn = document.getElementById('select-all-btn');
    const deselectAllBtn = document.getElementById('deselect-all-btn');
    const analyzeBtn = document.getElementById('analyze-btn');

    // State
    let headers = [];
    let fileObj = null;

    // File Handling
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.style.borderColor = '#d63384';
    });
    dropZone.addEventListener('dragleave', () => {
        dropZone.style.borderColor = 'rgba(255,255,255,0.2)';
    });
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.style.borderColor = 'rgba(255,255,255,0.2)';
        if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
    });
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length) handleFile(e.target.files[0]);
    });

    function handleFile(file) {
        if (!file.name.endsWith('.csv')) {
            showError("Please upload a CSV file.");
            return;
        }
        fileObj = file;
        const reader = new FileReader();
        reader.onload = (e) => {
            const text = e.target.result;
            const lines = text.split(/\r?\n/).filter(line => line.trim() !== '');
            if (lines.length < 2) {
                showError("File is empty or invalid.");
                return;
            }
            headers = lines[0].split(',').map(h => h.trim());
            populateSelectors(headers);
            configPanel.classList.remove('hidden');
            errorBox.style.display = 'none';
        };
        reader.readAsText(file);
        uploadMsg.innerHTML = `<p style="color: #4ade80;">✅ ${file.name}</p>`;
    }

    function populateSelectors(cols) {
        genotypeColSelect.innerHTML = '<option value="">-- Select Genotype --</option>';
        repColSelect.innerHTML = '<option value="">-- Select Replication --</option>';
        traitVarsContainer.innerHTML = '';

        cols.forEach(col => {
            const opt1 = document.createElement('option');
            opt1.value = col; opt1.textContent = col;
            genotypeColSelect.appendChild(opt1);

            const opt2 = document.createElement('option');
            opt2.value = col; opt2.textContent = col;
            repColSelect.appendChild(opt2);

            const div = document.createElement('div');
            div.className = 'check-item';
            div.innerHTML = `<input type="checkbox" value="${col}" id="chk-${col}"> <label for="chk-${col}">${col}</label>`;
            traitVarsContainer.appendChild(div);
        });

        // Smart defaults
        const gIdx = cols.findIndex(c => c.toLowerCase().includes('genotype') || c.toLowerCase() === 'geno');
        if (gIdx !== -1) genotypeColSelect.selectedIndex = gIdx + 1;

        const rIdx = cols.findIndex(c => c.toLowerCase().includes('rep') || c.toLowerCase().includes('block'));
        if (rIdx !== -1) repColSelect.selectedIndex = rIdx + 1;
    }

    selectAllBtn.addEventListener('click', () => {
        traitVarsContainer.querySelectorAll('input').forEach(i => i.checked = true);
    });
    deselectAllBtn.addEventListener('click', () => {
        traitVarsContainer.querySelectorAll('input').forEach(i => i.checked = false);
    });

    analyzeBtn.addEventListener('click', async () => {
        const genotype_col = genotypeColSelect.value;
        const rep_col = repColSelect.value;
        const trait_cols = Array.from(traitVarsContainer.querySelectorAll('input:checked')).map(i => i.value);

        if (!genotype_col || !rep_col) { showError("Please select Genotype and Replication columns."); return; }
        if (trait_cols.length < 2) { showError("Please select at least 2 traits."); return; }

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
            const resp = await fetch('http://localhost:8000/analyze_genotypic_correlation', {
                method: 'POST', body: formData
            });
            const res = await resp.json();
            loading.classList.add('hidden');

            if (res.status === 'success') {
                outputContent.classList.remove('hidden');
                renderResults(res);
                setupDownloads(formData);
                outputContent.scrollIntoView({ behavior: 'smooth' });
            } else {
                showError(res.message || "Analysis failed.");
            }
        } catch (e) {
            loading.classList.add('hidden');
            showError("Network error. Ensure the backend is running.");
        }
    });

    function renderResults(res) {
        const traits = res.traits;
        const corr = res.corr_matrix;
        const sig = res.sig_matrix;

        // 1. Matrix
        const thead = document.getElementById('matrix-head');
        const tbody = document.getElementById('matrix-body');
        thead.innerHTML = '<tr><th>Trait</th>' + traits.map(t => `<th>${t}</th>`).join('') + '</tr>';
        tbody.innerHTML = '';

        traits.forEach(rTrait => {
            const tr = document.createElement('tr');
            let cols = `<td>${rTrait}</td>`;
            traits.forEach(cTrait => {
                const rVal = corr[rTrait][cTrait];
                const pVal = sig[rTrait][cTrait];
                let sigText = "";
                if (rTrait !== cTrait) {
                    if (pVal <= 0.01) sigText = "**";
                    else if (pVal <= 0.05) sigText = "*";
                }

                // Heatmap color
                let bg = "";
                if (rTrait === cTrait) bg = "rgba(255,255,255,0.1)";
                else {
                    if (rVal > 0) bg = `rgba(220, 38, 38, ${Math.abs(rVal) * 0.7})`;
                    else bg = `rgba(37, 99, 235, ${Math.abs(rVal) * 0.7})`;
                }

                cols += `<td style="background: ${bg}; color: white; text-shadow: 0 1px 2px black;">${rVal.toFixed(3)}${sigText}</td>`;
            });
            tr.innerHTML = cols;
            tbody.appendChild(tr);
        });

        // 2. Variances
        const vBody = document.getElementById('variance-body');
        vBody.innerHTML = '';
        traits.forEach(t => {
            const v = res.variances[t];
            vBody.innerHTML += `<tr>
                <td>${t}</td>
                <td>${v.MS_G.toFixed(4)}</td>
                <td>${v.MS_E.toFixed(4)}</td>
                <td><strong>${v.sigma2_g.toFixed(4)}</strong></td>
            </tr>`;
        });

        // 3. Interpretation
        const interpList = document.getElementById('interpretation-list');
        interpList.innerHTML = res.interpretations.map(text => `<p style="margin-bottom: 0.5rem;">• ${text}</p>`).join('');
    }

    function setupDownloads(formData) {
        const setupBtn = (id, endpoint, filename) => {
            const btn = document.getElementById(id);
            const newBtn = btn.cloneNode(true);
            btn.parentNode.replaceChild(newBtn, btn);
            newBtn.addEventListener('click', async () => {
                newBtn.disabled = true;
                const oldText = newBtn.innerText;
                newBtn.innerText = "Generating...";
                try {
                    const r = await fetch(`http://localhost:8000/${endpoint}`, { method: 'POST', body: formData });
                    if (r.ok) {
                        const blob = await r.blob();
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url; a.download = filename;
                        document.body.appendChild(a); a.click(); a.remove();
                    } else alert("Error generating file.");
                } catch (e) { alert("Download failed."); }
                finally { newBtn.disabled = false; newBtn.innerText = oldText; }
            });
        };
        setupBtn('dl-doc-btn', 'report_genotypic_correlation_doc', 'Genotypic_Correlation_Report.docx');
        setupBtn('dl-excel-btn', 'report_genotypic_correlation_excel', 'Genotypic_Correlation_Output.xlsx');
    }

    function showError(msg) {
        errorBox.textContent = msg;
        errorBox.style.display = 'block';
    }
});
