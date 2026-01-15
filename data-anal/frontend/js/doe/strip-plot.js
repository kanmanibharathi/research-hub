const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const configPanel = document.getElementById('config-panel');
const emptyState = document.getElementById('empty-state');
const outputContent = document.getElementById('output-content');
const loading = document.getElementById('loading');
const errorBox = document.getElementById('error-box');

let selectedFile = null;

// Drag and Drop (Reused theme colors)
dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.style.borderColor = '#d63384';
});

dropZone.addEventListener('dragleave', () => {
    dropZone.style.borderColor = '';
});

dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.style.borderColor = '';
    if (e.dataTransfer.files.length) {
        handleFile(e.dataTransfer.files[0]);
    }
});

fileInput.addEventListener('change', (e) => {
    if (e.target.files.length) {
        handleFile(e.target.files[0]);
    }
});

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
    const selects = ['col-rep', 'col-a', 'col-b', 'col-resp'];

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

    // Auto-guess
    guessSelection('col-rep', headers, ['rep', 'replication', 'block', 'r']);
    guessSelection('col-a', headers, ['factor_a', 'horizontal', 'nitrogen', 'main', 'a']);
    guessSelection('col-b', headers, ['factor_b', 'vertical', 'variety', 'sub', 'b']);
    guessSelection('col-resp', headers, ['yield', 'height', 'response', 'y']);
}

function guessSelection(id, headers, keywords) {
    const sel = document.getElementById(id);
    const match = headers.find(h => keywords.some(k => h.toLowerCase().includes(k)));
    if (match) sel.value = match;
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
    formData.append('rep_col', document.getElementById('col-rep').value);
    formData.append('a_col', document.getElementById('col-a').value);
    formData.append('b_col', document.getElementById('col-b').value);
    formData.append('resp_col', document.getElementById('col-resp').value);
    formData.append('alpha', document.getElementById('alpha').value);
    formData.append('post_hoc', document.getElementById('post-hoc').value);
    formData.append('mean_order', document.getElementById('mean-order').value);

    try {
        const response = await fetch('/analyze_strip_plot', {
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
        showError("An error occurred during analysis: " + e.message);
        loading.classList.add('hidden');
    }
});

function renderResults(data) {
    loading.classList.add('hidden');
    outputContent.classList.remove('hidden');

    // ANOVA Table
    const anovaBody = document.querySelector('#anova-table tbody');
    anovaBody.innerHTML = '';

    const ordering = ["Replication", "Factor A", "Error A", "Factor B", "Error B", "Interaction AxB", "Error C", "Total"];

    ordering.forEach(src => {
        if (!data.anova[src]) return;
        const row = data.anova[src];
        const tr = document.createElement('tr');

        let sigHtml = '';
        if (row.sig) {
            const cls = row.sig === '**' ? 'badge badge-high' : (row.sig === '*' ? 'badge badge-star' : 'badge badge-ns');
            sigHtml = `<span class="${cls}">${row.sig}</span>`;
        }

        tr.innerHTML = `
            <td>${src}</td>
            <td>${row.df}</td>
            <td>${row.SS.toFixed(4)}</td>
            <td>${row.MS ? row.MS.toFixed(4) : '-'}</td>
            <td>${row.F ? row.F.toFixed(4) : '-'}</td>
            <td>${row.P ? row.P.toFixed(4) : '-'}</td>
            <td>${sigHtml}</td>
        `;
        anovaBody.appendChild(tr);
    });

    // Means and Post-hoc
    const container = document.getElementById('means-container');
    container.innerHTML = '';

    for (const [factorName, result] of Object.entries(data.post_hoc)) {
        const wrapper = document.createElement('div');
        wrapper.style.marginTop = '2rem';

        const title = document.createElement('h3');
        title.textContent = factorName;
        wrapper.appendChild(title);

        const tableWrapper = document.createElement('div');
        tableWrapper.style.overflowX = 'auto';

        const table = document.createElement('table');
        table.innerHTML = `
            <thead>
                <tr>
                    <th>Level</th>
                    <th>Mean</th>
                    <th>Std Dev</th>
                    <th>Std Err</th>
                    <th>Group</th>
                </tr>
            </thead>
            <tbody></tbody>
        `;

        const tbody = table.querySelector('tbody');
        result.means.forEach(m => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${m.level}</td>
                <td>${m.mean.toFixed(4)}</td>
                <td>${m.sd.toFixed(4)}</td>
                <td>${m.se.toFixed(4)}</td>
                <td style="font-weight:bold; color: #d63384;">${m.group}</td>
            `;
            tbody.appendChild(tr);
        });

        tableWrapper.appendChild(table);
        wrapper.appendChild(tableWrapper);

        // Stats Cards (Image 2 Design)
        const statsGrid = document.createElement('div');
        statsGrid.style.display = 'grid';
        statsGrid.style.gridTemplateColumns = 'repeat(auto-fit, minmax(150px, 1fr))';
        statsGrid.style.gap = '1rem';
        statsGrid.style.marginTop = '1.5rem';

        const createCard = (label, value) => {
            const card = document.createElement('div');
            card.style.background = '#151b2b'; // Darker blue/black
            card.style.padding = '1rem';
            card.style.borderRadius = '1rem';
            card.style.textAlign = 'center';
            card.style.border = '1px solid rgba(148, 163, 184, 0.1)';

            card.innerHTML = `
                <div style="color: #94a3b8; font-size: 0.85rem; margin-bottom: 0.5rem; text-transform: uppercase;">${label}</div>
                <div style="color: #f8fafc; font-size: 1.5rem; font-weight: 700;">${value}</div>
            `;
            return card;
        };

        statsGrid.appendChild(createCard('SE(m)', result.se.toFixed(4)));
        statsGrid.appendChild(createCard('SE(d)', result.sed.toFixed(4)));
        statsGrid.appendChild(createCard('CD (' + document.getElementById('alpha').value + ')', result.cd ? result.cd.toFixed(4) : 'NS'));
        statsGrid.appendChild(createCard('CV%', result.cv.toFixed(2)));

        wrapper.appendChild(statsGrid);

        container.appendChild(wrapper);
    }
}

document.getElementById('download-btn').addEventListener('click', async () => {
    if (!selectedFile) return;

    const btn = document.getElementById('download-btn');
    const originalText = btn.textContent;
    btn.textContent = "Generating Report...";

    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('rep_col', document.getElementById('col-rep').value);
    formData.append('a_col', document.getElementById('col-a').value);
    formData.append('b_col', document.getElementById('col-b').value);
    formData.append('resp_col', document.getElementById('col-resp').value);
    formData.append('alpha', document.getElementById('alpha').value);
    formData.append('post_hoc', document.getElementById('post-hoc').value);
    formData.append('mean_order', document.getElementById('mean-order').value);

    try {
        const response = await fetch('/report_strip_plot', {
            method: 'POST',
            body: formData
        });

        if (response.ok) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = "StripPlot_Analysis_Report.docx";
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
        btn.textContent = originalText;
    }
});
