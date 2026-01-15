let currentFile = null;
let columns = [];

document.getElementById('file-input').addEventListener('change', (e) => {
    if (e.target.files.length) {
        currentFile = e.target.files[0];
        const reader = new FileReader();
        reader.onload = (e) => {
            const rows = e.target.result.split('\n').filter(r => r.trim());
            columns = rows[0].split(',').map(c => c.trim());
            populateSelectors();
            document.getElementById('config-panel').classList.remove('hidden');
            document.getElementById('upload-msg').innerText = "✅ " + currentFile.name;
        };
        reader.readAsText(currentFile);
    }
});

function populateSelectors() {
    const sels = ['col-female', 'col-male', 'col-rep'];
    sels.forEach(id => {
        const el = document.getElementById(id);
        el.innerHTML = '';
        columns.forEach(c => el.innerHTML += `<option value="${c}">${c}</option>`);
    });
    const cont = document.getElementById('traits-container');
    cont.innerHTML = '';
    columns.forEach(c => {
        cont.innerHTML += `<label style="display:block; margin-bottom:5px;"><input type="checkbox" name="traits" value="${c}"> ${c}</label>`;
    });
}

document.getElementById('analyze-btn').addEventListener('click', async () => {
    const selectedTraits = Array.from(document.querySelectorAll('input[name="traits"]:checked')).map(cb => cb.value);
    if (!selectedTraits.length) return alert("Select traits");

    const fd = new FormData();
    fd.append('file', currentFile);
    fd.append('female_col', document.getElementById('col-female').value);
    fd.append('male_col', document.getElementById('col-male').value);
    fd.append('rep_col', document.getElementById('col-rep').value);
    fd.append('trait_cols', selectedTraits.join(','));

    document.getElementById('empty-state').classList.add('hidden');
    document.getElementById('loading').classList.remove('hidden');

    try {
        const resp = await fetch('/analyze_griffing2', { method: 'POST', body: fd });
        const data = await resp.json();
        if (data.status === 'success') {
            displayResults(data.results);
        } else {
            alert(data.message);
            document.getElementById('loading').classList.add('hidden');
            document.getElementById('empty-state').classList.remove('hidden');
        }
    } catch (e) { alert("Analysis error"); }
});

function displayResults(results) {
    document.getElementById('loading').classList.add('hidden');
    document.getElementById('output-content').classList.remove('hidden');
    const tabs = document.getElementById('trait-tabs');
    tabs.innerHTML = '';
    const traitNames = Object.keys(results);
    traitNames.forEach((t, i) => {
        const btn = document.createElement('div');
        btn.className = `trait-tab ${i === 0 ? 'active' : ''}`;
        btn.innerText = t;
        btn.onclick = () => {
            document.querySelectorAll('.trait-tab').forEach(x => x.classList.remove('active'));
            btn.classList.add('active');
            renderTrait(t, results[t]);
        };
        tabs.appendChild(btn);
    });
    renderTrait(traitNames[0], results[traitNames[0]]);
}

function renderTrait(name, res) {
    const cont = document.getElementById('trait-results-container');
    cont.innerHTML = '';
    const temp = document.getElementById('trait-result-template').content.cloneNode(true);

    // Fill Tables
    const fill = (tbody, data) => {
        Object.entries(data).forEach(([k, v]) => {
            tbody.innerHTML += `<tr><td>${k}</td><td>${v.df}</td><td>${v.SS.toFixed(4)}</td><td>${v.MS ? v.MS.toFixed(4) : '-'}</td><td>${v.F ? v.F.toFixed(4) : '-'}</td><td>${v.P ? v.P.toFixed(4) : '-'}</td><td>${v.sig || ''}</td></tr>`;
        });
    };
    fill(temp.querySelector('.anova-geno-table tbody'), res.anova_geno);
    fill(temp.querySelector('.anova-comb-table tbody'), res.anova_comb);

    res.gca_effects.forEach(g => {
        temp.querySelector('.gca-table tbody').innerHTML += `<tr><td>${g.parent}</td><td>${g.effect.toFixed(4)}</td><td>${g.t.toFixed(4)}</td><td>${getSig(g.p)}</td></tr>`;
    });

    const mCont = temp.querySelector('.sca-matrix-container');
    const matTable = document.createElement('table'); matTable.className = 'matrix-table';
    let hRow = '<tr><th>P1\\P2</th>'; res.parents.forEach(p => hRow += `<th>${p}</th>`); hRow += '</tr>';
    matTable.innerHTML = hRow;
    res.parents.forEach((p, i) => {
        let r = `<tr><td>${p}</td>`;
        res.parents.forEach((p2, j) => { r += `<td>${res.sca_matrix[i][j].toFixed(4)}</td>`; });
        r += '</tr>'; matTable.innerHTML += r;
    });
    mCont.appendChild(matTable);

    temp.querySelector('.h2-broad-val').innerText = res.variances.h2_broad.toFixed(4);
    temp.querySelector('.h2-narrow-val').innerText = res.variances.h2_narrow.toFixed(4);
    temp.querySelector('.pred-ratio-val').innerText = res.variances.predictability.toFixed(4);

    cont.appendChild(temp);
}

function getSig(p) { if (p <= 0.01) return "**"; if (p <= 0.05) return "*"; return "ns"; }

document.getElementById('download-doc').onclick = () => download('doc');
document.getElementById('download-excel').onclick = () => download('excel');

async function download(type) {
    const selectedTraits = Array.from(document.querySelectorAll('input[name="traits"]:checked')).map(cb => cb.value);
    const fd = new FormData();
    fd.append('file', currentFile);
    fd.append('female_col', document.getElementById('col-female').value);
    fd.append('male_col', document.getElementById('col-male').value);
    fd.append('rep_col', document.getElementById('col-rep').value);
    fd.append('trait_cols', selectedTraits.join(','));
    const resp = await fetch(`/report_griffing2_${type}`, { method: 'POST', body: fd });
    const blob = await resp.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `Griffing_Method2_${type === 'doc' ? 'Report.docx' : 'Output.xlsx'}`;
    a.click();
}
