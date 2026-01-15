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
    const checkSel = document.getElementById('col-check');
    const traitsCont = document.getElementById('traits-container');

    [femSel, maleSel, repSel, checkSel].forEach(s => s.innerHTML = '');
    traitsCont.innerHTML = '';

    cols.forEach(col => {
        const opt = `<option value="${col}">${col}</option>`;
        femSel.innerHTML += opt;
        maleSel.innerHTML += opt;
        repSel.innerHTML += opt;
        checkSel.innerHTML += opt;

        const div = document.createElement('div');
        div.innerHTML = `<label style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.2rem; cursor: pointer;">
            <input type="checkbox" name="traits" value="${col}"> ${col}
        </label>`;
        traitsCont.appendChild(div);
    });

    selectOptionIfMatches(femSel, ['female', 'p1', 'parent1']);
    selectOptionIfMatches(maleSel, ['male', 'p2', 'parent2']);
    selectOptionIfMatches(repSel, ['rep', 'replication', 'block']);
    selectOptionIfMatches(checkSel, ['check', 'type', 'entry']);
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
    const check = document.getElementById('col-check').value;
    const selectedTraits = Array.from(document.querySelectorAll('input[name="traits"]:checked')).map(cb => cb.value);

    if (selectedTraits.length === 0) {
        alert("Please select at least one trait.");
        return;
    }

    const formData = new FormData();
    formData.append('file', currentFile);
    formData.append('female_col', female);
    formData.append('male_col', male);
    formData.append('rep_col', rep);
    formData.append('check_col', check);
    formData.append('trait_cols', selectedTraits.join(','));

    document.getElementById('output-content').classList.add('hidden');
    document.getElementById('empty-state').classList.add('hidden');
    document.getElementById('loading').classList.remove('hidden');

    try {
        const response = await fetch('/analyze_griffing1_check', {
            method: 'POST',
            body: formData
        });

        const data = await response.json();
        if (data.status === 'success') {
            displayResults(data.results);
        } else {
            alert(data.message || "Analysis failed.");
            resetState();
        }
    } catch (err) {
        alert("Connection error.");
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

    renderTrait(traits[0], results[traits[0]]);
}

function renderTrait(traitName, res) {
    const container = document.getElementById('trait-results-container');
    container.innerHTML = '';

    const template = document.getElementById('trait-result-template').content.cloneNode(true);

    // ANOVA Genotypes
    const genoBody = template.querySelector('.anova-geno-table tbody');
    Object.entries(res.anova_geno).forEach(([src, d]) => {
        genoBody.innerHTML += `<tr>
            <td>${src}</td><td>${d.df}</td><td>${d.SS.toFixed(4)}</td>
            <td>${d.MS ? d.MS.toFixed(4) : '-'}</td><td>${d.F ? d.F.toFixed(4) : '-'}</td>
            <td>${d.P !== null ? d.P.toFixed(4) : '-'}</td>
            <td style="color: #d63384; font-weight: bold;">${d.sig}</td>
        </tr>`;
    });

    // Combining Ability ANOVA
    const combBody = template.querySelector('.anova-comb-table tbody');
    Object.entries(res.anova_comb).forEach(([src, d]) => {
        combBody.innerHTML += `<tr>
            <td>${src}</td><td>${d.df}</td><td>${d.SS.toFixed(4)}</td>
            <td>${d.MS ? d.MS.toFixed(4) : '-'}</td><td>${d.F ? d.F.toFixed(4) : '-'}</td>
            <td>${d.P !== null ? d.P.toFixed(4) : '-'}</td>
            <td style="color: #d63384; font-weight: bold;">${d.sig}</td>
        </tr>`;
    });

    // GCA Effects
    const gcaBody = template.querySelector('.gca-table tbody');
    res.gca_effects.forEach(g => {
        gcaBody.innerHTML += `<tr>
            <td>${g.parent}</td><td>${g.effect.toFixed(4)}</td>
            <td>${g.t.toFixed(4)}</td><td style="color: #d63384;">${getSigStars(g.p)}</td>
        </tr>`;
    });

    // Matrix for SCA
    template.querySelector('.sem-sca-badge').innerText = `SE(s_ij): ${res.se_sca.toFixed(4)}`;
    const scaMatCont = template.querySelector('.sca-matrix-container');
    scaMatCont.appendChild(createMatrixTable(res.parents, res.sca_matrix));

    // Heterosis
    const hBody = template.querySelector('.heterosis-table tbody');
    Object.entries(res.std_heterosis).forEach(([cross, h]) => {
        hBody.innerHTML += `<tr>
            <td>${cross}</td><td>${h.val.toFixed(2)}</td><td>${h.t.toFixed(2)}</td>
            <td style="color:#d63384;">${getSigStars(h.p)}</td>
        </tr>`;
    });

    // Genetic Params
    template.querySelector('.h2-broad-val').innerText = res.variances.h2_broad.toFixed(4);
    template.querySelector('.h2-narrow-val').innerText = res.variances.h2_narrow.toFixed(4);
    template.querySelector('.pred-ratio-val').innerText = res.variances.predictability.toFixed(4);

    container.appendChild(template);
}

function createMatrixTable(parents, matrix) {
    const table = document.createElement('table');
    table.className = 'matrix-table';
    let head = '<tr><th>P1 \\ P2</th>';
    parents.forEach(p => head += `<th>${p}</th>`);
    head += '</tr>';
    table.innerHTML = head;
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

function resetState() {
    document.getElementById('loading').classList.add('hidden');
    document.getElementById('empty-state').classList.remove('hidden');
}

// Downloads
document.getElementById('download-doc').onclick = () => downloadReport('doc');
document.getElementById('download-excel').onclick = () => downloadReport('excel');

async function downloadReport(type) {
    const female = document.getElementById('col-female').value;
    const male = document.getElementById('col-male').value;
    const rep = document.getElementById('col-rep').value;
    const check = document.getElementById('col-check').value;
    const selectedTraits = Array.from(document.querySelectorAll('input[name="traits"]:checked')).map(cb => cb.value);

    const formData = new FormData();
    formData.append('file', currentFile);
    formData.append('female_col', female);
    formData.append('male_col', male);
    formData.append('rep_col', rep);
    formData.append('check_col', check);
    formData.append('trait_cols', selectedTraits.join(','));

    const endpoint = type === 'doc' ? 'report_griffing1_check_doc' : 'report_griffing1_check_excel';

    try {
        const response = await fetch(`/${endpoint}`, { method: 'POST', body: formData });
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = type === 'doc' ? 'Griffing_Method1_WithCheck_Report.docx' : 'Griffing_Method1_WithCheck_Output.xlsx';
        document.body.appendChild(a);
        a.click();
        a.remove();
    } catch (err) { alert("Download failed."); }
}
