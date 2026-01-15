const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const configPanel = document.getElementById('config-panel');
const emptyState = document.getElementById('empty-state');
const outputContent = document.getElementById('output-content');
const loading = document.getElementById('loading');
const errorBox = document.getElementById('error-box');

let selectedFile = null;

// Drag and Drop
dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.style.borderColor = '#d63384'; });
dropZone.addEventListener('dragleave', () => { dropZone.style.borderColor = ''; });
dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.style.borderColor = '';
    if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
});

fileInput.addEventListener('change', (e) => { if (e.target.files.length) handleFile(e.target.files[0]); });

function handleFile(file) {
    if (file.type !== "text/csv" && !file.name.endsWith('.csv')) {
        showError("Please upload a valid CSV file.");
        return;
    }
    selectedFile = file;
    parseHeaders(file);
    configPanel.classList.remove('hidden');
    dropZone.classList.add('file-loaded');
    document.getElementById('upload-msg').innerHTML = `<p style="color:#00a651; font-weight:bold;">File Loaded:</p><p>${file.name}</p>`;
    hideError();
}

function parseHeaders(file) {
    const reader = new FileReader();
    reader.onload = function (e) {
        const text = e.target.result;
        const firstLine = text.split('\n')[0];
        const headers = firstLine.split(',').map(h => h.trim());
        populateSelects(headers);
    };
    reader.readAsText(file);
}

function populateSelects(headers) {
    const selects = ['col-a', 'col-b', 'col-c', 'col-resp'];
    selects.forEach(id => {
        const sel = document.getElementById(id);
        sel.innerHTML = '';
        headers.forEach(h => {
            const opt = document.createElement('option');
            opt.value = h;
            opt.textContent = h;
            sel.appendChild(opt);
        });
    });

    // Auto guess
    const guess = (id, kws) => {
        const sel = document.getElementById(id);
        const match = headers.find(h => kws.some(k => h.toLowerCase().includes(k)));
        if (match) sel.value = match;
    };

    guess('col-a', ['factor a', 'nitrogen', 'a_']);
    guess('col-b', ['factor b', 'variety', 'b_']);
    guess('col-c', ['factor c', 'time', 'c_']);
    guess('col-resp', ['yield', 'response', 'value']);
}

function showError(msg) {
    errorBox.textContent = msg;
    errorBox.style.display = 'block';
}

function hideError() {
    errorBox.style.display = 'none';
}

document.getElementById('analyze-btn').addEventListener('click', async () => {
    if (!selectedFile) return;

    emptyState.classList.add('hidden');
    outputContent.classList.add('hidden');
    loading.classList.remove('hidden');
    hideError();

    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('a_col', document.getElementById('col-a').value);
    formData.append('b_col', document.getElementById('col-b').value);
    formData.append('c_col', document.getElementById('col-c').value);
    formData.append('resp_col', document.getElementById('col-resp').value);
    formData.append('alpha', document.getElementById('alpha').value);
    formData.append('post_hoc', document.getElementById('post-hoc').value);
    formData.append('mean_order', document.getElementById('mean-order').value);

    try {
        const response = await fetch('/analyze_three_factor_crd', {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        if (data.status === 'error') {
            showError(data.message);
            loading.classList.add('hidden');
        } else {
            renderResults(data);
        }
    } catch (e) {
        showError("An error occurred: " + e.message);
        loading.classList.add('hidden');
    }
});

function renderResults(data) {
    loading.classList.add('hidden');
    outputContent.classList.remove('hidden');

    // ANOVA
    const anovaBody = document.querySelector('#anova-table tbody');
    anovaBody.innerHTML = '';
    const sources = [
        "Factor A", "Factor B", "Factor C",
        "Interaction AxB", "Interaction AxC", "Interaction BxC",
        "Interaction AxBxC", "Error", "Total"
    ];

    sources.forEach(src => {
        if (!data.anova[src]) return;
        const row = data.anova[src];
        const tr = document.createElement('tr');

        let sigHtml = '';
        if (row.sig) {
            const cls = row.sig.includes('**') ? 'badge badge-high' : (row.sig === '*' ? 'badge badge-star' : 'badge badge-ns');
            sigHtml = `<span class="${cls}">${row.sig}</span>`;
        }

        tr.innerHTML = `
            <td>${src}</td>
            <td>${row.df}</td>
            <td>${row.SS ? row.SS.toFixed(4) : '-'}</td>
            <td>${row.MS ? row.MS.toFixed(4) : '-'}</td>
            <td>${row.F ? row.F.toFixed(4) : '-'}</td>
            <td>${row.P ? row.P.toFixed(4) : '-'}</td>
            <td>${sigHtml}</td>
        `;
        anovaBody.appendChild(tr);
    });

    // Means Tables
    const container = document.getElementById('means-results-container');
    container.innerHTML = '';

    const tables = [
        ["Factor A", "Factor A Means"],
        ["Factor B", "Factor B Means"],
        ["Factor C", "Factor C Means"],
        ["Interaction AxB", "AxB Means"],
        ["Interaction AxC", "AxC Means"],
        ["Interaction BxC", "BxC Means"],
        ["Interaction AxBxC", "AxBxC Means"]
    ];

    tables.forEach(([key, title]) => {
        if (!data.results[key]) return;

        const res = data.results[key];
        const wrapper = document.createElement('div');
        wrapper.style.marginBottom = '3rem';

        wrapper.innerHTML = `<h3>${title}</h3>
            <div style="overflow-x: auto;">
                <table class="means-table">
                    <thead>
                        <tr><th>Level</th><th>Mean</th><th>Std Err</th><th>Group</th></tr>
                    </thead>
                    <tbody>
                        ${res.means.map(m => `
                            <tr>
                                <td>${m.level}</td>
                                <td>${m.mean.toFixed(4)}</td>
                                <td>${m.se.toFixed(4)}</td>
                                <td style="font-weight:bold; color: #d63384;">${m.group}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
            
            <div class="stats-grid" style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 1.5rem; margin-top: 2rem;">
                 <div style="background: #1e293b; border-radius: 16px; padding: 1.5rem; text-align: center; border: 1px solid rgba(255,255,255,0.05); box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
                    <div style="color: #94a3b8; font-size: 0.8rem; font-weight: 600; letter-spacing: 1px; margin-bottom: 0.5rem; text-transform: uppercase;">SE(m)</div>
                    <div style="color: #ffffff; font-size: 1.8rem; font-weight: 800;">${res.se_pooled.toFixed(4)}</div>
                 </div>
                 <div style="background: #1e293b; border-radius: 16px; padding: 1.5rem; text-align: center; border: 1px solid rgba(255,255,255,0.05); box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
                    <div style="color: #94a3b8; font-size: 0.8rem; font-weight: 600; letter-spacing: 1px; margin-bottom: 0.5rem; text-transform: uppercase;">SE(d)</div>
                    <div style="color: #ffffff; font-size: 1.8rem; font-weight: 800;">${res.sed.toFixed(4)}</div>
                 </div>
                 <div style="background: #1e293b; border-radius: 16px; padding: 1.5rem; text-align: center; border: 1px solid rgba(255,255,255,0.05); box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
                    <div style="color: #94a3b8; font-size: 0.8rem; font-weight: 600; letter-spacing: 1px; margin-bottom: 0.5rem; text-transform: uppercase;">CD (${document.getElementById('alpha').value})</div>
                    <div style="color: #ffffff; font-size: 1.8rem; font-weight: 800;">${res.cd ? res.cd.toFixed(4) : 'NS'}</div>
                 </div>
                 <div style="background: #1e293b; border-radius: 16px; padding: 1.5rem; text-align: center; border: 1px solid rgba(255,255,255,0.05); box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
                    <div style="color: #94a3b8; font-size: 0.8rem; font-weight: 600; letter-spacing: 1px; margin-bottom: 0.5rem; text-transform: uppercase;">CV%</div>
                    <div style="color: #ffffff; font-size: 1.8rem; font-weight: 800;">${res.cv.toFixed(2)}</div>
                 </div>
            </div>
        `;
        container.appendChild(wrapper);
    });
}

document.getElementById('download-btn').addEventListener('click', async () => {
    if (!selectedFile) return;
    const btn = document.getElementById('download-btn');
    btn.textContent = "Generating...";

    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('a_col', document.getElementById('col-a').value);
    formData.append('b_col', document.getElementById('col-b').value);
    formData.append('c_col', document.getElementById('col-c').value);
    formData.append('resp_col', document.getElementById('col-resp').value);
    formData.append('alpha', document.getElementById('alpha').value);
    formData.append('post_hoc', document.getElementById('post-hoc').value);
    formData.append('mean_order', document.getElementById('mean-order').value);

    try {
        const response = await fetch('/report_three_factor_crd', {
            method: 'POST',
            body: formData
        });

        if (response.ok) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = "ThreeFactorCRD_Report.docx";
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        } else {
            alert("Failed to generate report.");
        }
    } catch (e) {
        console.error(e);
        alert("Error downloading report.");
    } finally {
        btn.textContent = "Download Report (DOCX)";
    }
});
