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

    // Controls
    const modelTypeSelect = document.getElementById('model-type');
    const yColSelect = document.getElementById('y-col');
    const xSingleGroup = document.getElementById('x-single-group');
    const xMultiGroup = document.getElementById('x-multi-group');
    const xColSingle = document.getElementById('x-col-single');
    const xColMultiContainer = document.getElementById('x-col-multi');
    const polyDegreeGroup = document.getElementById('poly-degree-group');
    const polyDegreeInput = document.getElementById('poly-degree');
    const alphaInput = document.getElementById('alpha-input');
    const analyzeBtn = document.getElementById('analyze-btn');

    // State
    let headers = [];
    let fileObj = null;

    // Model Type Logic
    modelTypeSelect.addEventListener('change', () => {
        const type = modelTypeSelect.value;
        if (type === 'linear') {
            xSingleGroup.classList.remove('hidden');
            xMultiGroup.classList.add('hidden');
            polyDegreeGroup.classList.add('hidden');
        } else if (type === 'multiple') {
            xSingleGroup.classList.add('hidden');
            xMultiGroup.classList.remove('hidden');
            polyDegreeGroup.classList.add('hidden');
        } else if (type === 'polynomial') {
            xSingleGroup.classList.remove('hidden');
            xMultiGroup.classList.add('hidden');
            polyDegreeGroup.classList.remove('hidden');
        }
    });

    // File Handling
    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.style.borderColor = '#d63384'; });
    dropZone.addEventListener('dragleave', () => { dropZone.style.borderColor = 'rgba(255,255,255,0.2)'; });
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.style.borderColor = 'rgba(255,255,255,0.2)';
        if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
    });
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length) handleFile(e.target.files[0]);
    });

    function handleFile(file) {
        if (!file.name.endsWith('.csv')) { showError("Please upload a CSV file."); return; }
        fileObj = file;
        const reader = new FileReader();
        reader.onload = (e) => {
            const lines = e.target.result.split(/\r?\n/).filter(line => line.trim() !== '');
            if (lines.length < 2) { showError("File invalid."); return; }
            headers = lines[0].split(',').map(h => h.trim());
            populateSelectors(headers);
            configPanel.classList.remove('hidden');
            errorBox.style.display = 'none';
        };
        reader.readAsText(file);
        uploadMsg.innerHTML = `<p style="color: #4ade80;">✅ ${file.name}</p>`;
    }

    function populateSelectors(cols) {
        // Y Select
        yColSelect.innerHTML = cols.map(c => `<option value="${c}">${c}</option>`).join('');

        // X Single Select
        xColSingle.innerHTML = cols.map(c => `<option value="${c}">${c}</option>`).join('');

        // X Multi (Checkboxes)
        xColMultiContainer.innerHTML = cols.map(c => `
            <div class="multi-select-item">
                <input type="checkbox" value="${c}" id="chk-${c}">
                <label for="chk-${c}">${c}</label>
            </div>
        `).join('');
    }

    analyzeBtn.addEventListener('click', async () => {
        const y_col = yColSelect.value;
        const model_type = modelTypeSelect.value;
        const alpha = alphaInput.value;
        const degree = polyDegreeInput.value;

        let x_cols = "";
        if (model_type === 'linear' || model_type === 'polynomial') {
            x_cols = xColSingle.value;
        } else {
            const checked = Array.from(xColMultiContainer.querySelectorAll('input:checked')).map(i => i.value);
            if (checked.length === 0) { showError("Select at least one independent variable."); return; }
            x_cols = checked.join(",");
        }

        if (x_cols.split(',').includes(y_col)) {
            showError("Variable cannot be both Dependent and Independent.");
            return;
        }

        errorBox.style.display = 'none';
        loading.classList.remove('hidden');
        outputContent.classList.add('hidden');
        emptyState.classList.add('hidden');

        const formData = new FormData();
        formData.append('file', fileObj);
        formData.append('y_col', y_col);
        formData.append('x_cols', x_cols);
        formData.append('model_type', model_type);
        formData.append('degree', degree);
        formData.append('alpha', alpha);

        try {
            const resp = await fetch('http://localhost:8000/analyze_regression', { method: 'POST', body: formData });
            const res = await resp.json();
            loading.classList.add('hidden');

            if (res.status === 'success') {
                outputContent.classList.remove('hidden');
                renderResults(res);
                setupDownloads(formData);
                outputContent.scrollIntoView({ behavior: 'smooth' });
            } else {
                showError(res.message || "Regression fitting failed.");
            }
        } catch (e) {
            loading.classList.add('hidden');
            showError("Network error. Check backend connection.");
        }
    });

    function renderResults(res) {
        // 1. Summary
        document.getElementById('res-equation').innerText = res.summary.RegressionEquation;
        document.getElementById('res-r2').innerText = res.summary['R-Squared'].toFixed(4);
        document.getElementById('res-adj-r2').innerText = res.summary['Adj. R-Squared'].toFixed(4);
        document.getElementById('res-f-stat').innerText = res.summary['F-Statistic'].toFixed(4);
        document.getElementById('res-f-pval').innerText = res.summary['Prob (F-statistic)'].toExponential(4);
        document.getElementById('res-interpretation').innerText = res.interpretation;

        // 2. Coefficients
        const cBody = document.getElementById('coef-body');
        cBody.innerHTML = res.coefficients.map(c => `
            <tr>
                <td style="font-weight:600;">${c.Variable}</td>
                <td>${c.Coefficient.toFixed(4)}</td>
                <td>${c.StdError.toFixed(4)}</td>
                <td>${c.t_value.toFixed(4)}</td>
                <td style="color:${c.p_value < 0.05 ? '#4ade80' : 'inherit'}">${c.p_value.toFixed(4)}</td>
            </tr>
        `).join('');

        // 3. ANOVA
        const aBody = document.getElementById('anova-body');
        aBody.innerHTML = res.anova.map(a => `
            <tr>
                <td style="font-weight:600;">${a.Source}</td>
                <td>${a.df}</td>
                <td>${a.SS.toFixed(2)}</td>
                <td>${a.MS.toFixed(2)}</td>
                <td>${a.F ? a.F.toFixed(4) : '-'}</td>
                <td>${a.p ? a.p.toFixed(4) : '-'}</td>
            </tr>
        `).join('');
    }

    function setupDownloads(formData) {
        const btn = document.getElementById('dl-doc-btn');
        const newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);

        newBtn.addEventListener('click', async () => {
            newBtn.disabled = true;
            newBtn.innerText = "Generating...";
            try {
                const r = await fetch('http://localhost:8000/report_regression', { method: 'POST', body: formData });
                if (r.ok) {
                    const blob = await r.blob();
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `Regression_Report_${formData.get('y_col')}.docx`;
                    document.body.appendChild(a); a.click(); a.remove();
                }
            } catch (e) { alert("Download failed."); }
            finally { newBtn.disabled = false; newBtn.innerText = "Download Full Report (DOCX)"; }
        });
    }

    function showError(msg) {
        errorBox.textContent = msg;
        errorBox.style.display = 'block';
    }
});
