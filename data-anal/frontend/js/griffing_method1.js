let currentData = null;
let currentFile = null;
let columns = [];
let analysisResults = null;

document.getElementById('file-input').addEventListener('change', handleFileSelect);

// Drag & Drop
const dropZone = document.getElementById('drop-zone');
dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    if (e.dataTransfer.files.length) {
        currentFile = e.dataTransfer.files[0];
        processFile(currentFile);
    }
});

function handleFileSelect(e) {
    if (e.target.files.length) {
        currentFile = e.target.files[0];
        processFile(currentFile);
    }
}

function processFile(file) {
    const reader = new FileReader();
    reader.onload = function (e) {
        const text = e.target.result;
        const rows = text.split('\n').map(r => r.trim()).filter(r => r);
        if (rows.length < 2) return;

        columns = rows[0].split(',').map(c => c.trim().replace(/^"|"$/g, ''));
        populateSelectors(columns);

        document.getElementById('config-panel').classList.remove('hidden');
        document.getElementById('upload-msg').innerHTML = `<p>✅ ${file.name}</p><p style="font-size:0.8rem; opacity:0.6;">Ready for mapping</p>`;
    };
    reader.readAsText(file);
}

function populateSelectors(cols) {
    const femSel = document.getElementById('col-female');
    const maleSel = document.getElementById('col-male');
    const repSel = document.getElementById('col-rep');
    const traitsCont = document.getElementById('traits-container');

    femSel.innerHTML = '';
    maleSel.innerHTML = '';
    repSel.innerHTML = '';
    traitsCont.innerHTML = '';

    cols.forEach(col => {
        const opt = `<option value="${col}">${col}</option>`;
        femSel.innerHTML += opt;
        maleSel.innerHTML += opt;
        repSel.innerHTML += opt;

        // Add checkbox for traits
        const div = document.createElement('div');
        div.innerHTML = `<label style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.2rem; cursor: pointer;">
            <input type="checkbox" name="traits" value="${col}"> ${col}
        </label>`;
        traitsCont.appendChild(div);
    });

    // Auto-select defaults
    selectOptionIfMatches(femSel, ['female', 'p1', 'parent1', 'row']);
    selectOptionIfMatches(maleSel, ['male', 'p2', 'parent2', 'col']);
    selectOptionIfMatches(repSel, ['rep', 'replication', 'block']);
}

function selectOptionIfMatches(sel, terms) {
    for (let opt of sel.options) {
        if (terms.some(t => opt.value.toLowerCase().includes(t))) {
            sel.value = opt.value;
            break;
        }
    }
}

document.getElementById('analyze-btn').addEventListener('click', async () => {
    const female = document.getElementById('col-female').value;
    const male = document.getElementById('col-male').value;
    const rep = document.getElementById('col-rep').value;
    const selectedTraits = Array.from(document.querySelectorAll('input[name="traits"]:checked')).map(cb => cb.value);

    if (selectedTraits.length === 0) {
        showError("Please select at least one numeric trait.");
        return;
    }

    const formData = new FormData();
    formData.append('file', currentFile);
    formData.append('female_col', female);
    formData.append('male_col', male);
    formData.append('rep_col', rep);
    formData.append('trait_cols', selectedTraits.join(','));

    hideError();
    document.getElementById('output-content').classList.add('hidden');
    document.getElementById('empty-state').classList.add('hidden');
    document.getElementById('loading').classList.remove('hidden');

    try {
        const response = await fetch('http://127.0.0.1:8000/analyze_griffing1', {
            method: 'POST',
            body: formData
        });

        const data = await response.json();
        if (data.status === 'success') {
            analysisResults = data.results;
            displayResults(data.results);
        } else {
            showError(data.message || "Analysis failed.");
            resetState();
        }
    } catch (err) {
        showError("Connection error. Check if backend is running.");
        resetState();
    }
});

function displayResults(results) {
    document.getElementById('loading').classList.add('hidden');
    document.getElementById('output-content').classList.remove('hidden');

    const tabsCont = document.getElementById('trait-tabs');
    tabsCont.innerHTML = '';

    const traits = Object.keys(results);
    traits.forEach((trait, index) => {
        const btn = document.createElement('div');
        btn.className = `trait-tab ${index === 0 ? 'active' : ''}`;
        btn.innerText = trait;
        btn.onclick = () => {
            document.querySelectorAll('.trait-tab').forEach(t => t.classList.remove('active'));
            btn.classList.add('active');
            renderTrait(trait, results[trait]);
        };
        tabsCont.appendChild(btn);
    });

    // Render first trait by default
    renderTrait(traits[0], results[traits[0]]);
}

function renderTrait(traitName, res) {
    const container = document.getElementById('trait-results-container');
    container.innerHTML = '';

    const template = document.getElementById('trait-result-template').content.cloneNode(true);

    // 1. ANOVA Genotypes
    const genoBody = template.querySelector('.anova-geno-table tbody');
    Object.entries(res.anova_geno).forEach(([src, d]) => {
        const row = `<tr>
            <td>${src}</td>
            <td>${d.df}</td>
            <td>${d.SS.toFixed(4)}</td>
            <td>${d.MS ? d.MS.toFixed(4) : '-'}</td>
            <td>${d.F ? d.F.toFixed(4) : '-'}</td>
            <td>${d.P !== null ? d.P.toFixed(4) : '-'}</td>
            <td style="color: #d63384; font-weight: bold;">${d.sig}</td>
        </tr>`;
        genoBody.innerHTML += row;
    });

    // 2. Combining Ability ANOVA
    const combBody = template.querySelector('.anova-comb-table tbody');
    Object.entries(res.anova_comb).forEach(([src, d]) => {
        const row = `<tr>
            <td>${src}</td>
            <td>${d.df}</td>
            <td>${d.SS.toFixed(4)}</td>
            <td>${d.MS ? d.MS.toFixed(4) : '-'}</td>
            <td>${d.F ? d.F.toFixed(4) : '-'}</td>
            <td>${d.P !== null ? d.P.toFixed(4) : '-'}</td>
            <td style="color: #d63384; font-weight: bold;">${d.sig}</td>
        </tr>`;
        combBody.innerHTML += row;
    });

    // 3. GCA Effects
    const gcaBody = template.querySelector('.gca-table tbody');
    res.gca_effects.forEach(g => {
        const row = `<tr>
            <td>${g.parent}</td>
            <td>${g.effect.toFixed(4)}</td>
            <td>${g.t.toFixed(4)}</td>
            <td style="color: #d63384; font-weight: bold;">${getSigStars(g.p)}</td>
        </tr>`;
        gcaBody.innerHTML += row;
    });

    // 4. Matrix for SCA
    template.querySelector('.sem-sca-badge').innerText = `SE(s_ij): ${res.se_sca.toFixed(4)}`;
    const scaMatCont = template.querySelector('.sca-matrix-container');
    scaMatCont.appendChild(createMatrixTable(res.parents, res.sca_matrix));

    // 5. Matrix for RCA
    template.querySelector('.sem-rca-badge').innerText = `SE(r_ij): ${res.se_rca.toFixed(4)}`;
    const rcaMatCont = template.querySelector('.rca-matrix-container');
    rcaMatCont.appendChild(createMatrixTable(res.parents, res.rca_matrix));

    // 6. Heterosis
    const mphBody = template.querySelector('.mph-table tbody');
    Object.entries(res.heterosis.mph).forEach(([cross, d]) => {
        mphBody.innerHTML += `<tr><td>${cross}</td><td>${d.val.toFixed(2)}</td><td style="color:#d63384;">${getSigStars(d.p)}</td></tr>`;
    });

    const hbBody = template.querySelector('.hb-table tbody');
    Object.entries(res.heterosis.hb).forEach(([cross, d]) => {
        hbBody.innerHTML += `<tr><td>${cross}</td><td>${d.val.toFixed(2)}</td><td style="color:#d63384;">${getSigStars(d.p)}</td></tr>`;
    });

    // 7. Genetic Params
    template.querySelector('.h2-broad-val').innerText = res.variances.h2_broad.toFixed(4);
    template.querySelector('.h2-narrow-val').innerText = res.variances.h2_narrow.toFixed(4);
    template.querySelector('.pred-ratio-val').innerText = res.variances.predictability.toFixed(4);

    container.appendChild(template);
}

function createMatrixTable(parents, matrix) {
    const table = document.createElement('table');
    table.className = 'matrix-table';

    // Header
    let head = '<tr><th>P1 \\ P2</th>';
    parents.forEach(p => head += `<th>${p}</th>`);
    head += '</tr>';
    table.innerHTML += head;

    // Rows
    parents.forEach((p, i) => {
        let row = `<tr><td>${p}</td>`;
        parents.forEach((p2, j) => {
            row += `<td>${matrix[i][j].toFixed(4)}</td>`;
        });
        row += '</tr>';
        table.innerHTML += row;
    });

    return table;
}

function getSigStars(p) {
    if (p <= 0.01) return "**";
    if (p <= 0.05) return "*";
    return "ns";
}

function showError(msg) {
    const err = document.getElementById('error-box');
    err.innerText = msg;
    err.style.display = 'block';
}

function hideError() {
    document.getElementById('error-box').style.display = 'none';
}

function resetState() {
    document.getElementById('loading').classList.add('hidden');
    document.getElementById('empty-state').classList.remove('hidden');
}

// Download Handlers
document.getElementById('download-doc').onclick = () => downloadReport('doc');
document.getElementById('download-excel').onclick = () => downloadReport('excel');

async function downloadReport(type) {
    const female = document.getElementById('col-female').value;
    const male = document.getElementById('col-male').value;
    const rep = document.getElementById('col-rep').value;
    const selectedTraits = Array.from(document.querySelectorAll('input[name="traits"]:checked')).map(cb => cb.value);

    const formData = new FormData();
    formData.append('file', currentFile);
    formData.append('female_col', female);
    formData.append('male_col', male);
    formData.append('rep_col', rep);
    formData.append('trait_cols', selectedTraits.join(','));

    const endpoint = type === 'doc' ? 'report_griffing1_doc' : 'report_griffing1_excel';

    try {
        const response = await fetch(`http://127.0.0.1:8000/${endpoint}`, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) throw new Error("Report generation failed");

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = type === 'doc' ? 'Griffing_Method1_Report.docx' : 'Griffing_Method1_Output.xlsx';
        document.body.appendChild(a);
        a.click();
        a.remove();
    } catch (err) {
        alert("Error downloading report.");
    }
}
