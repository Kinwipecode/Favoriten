

let posX = 0, posY = 0, currentPickerVar = null;


window.makeDraggable = (content, header) => {
    header.onmousedown = (e) => {
        if (e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT') return;
        e.preventDefault();
        posX = e.clientX; posY = e.clientY;
        document.onmouseup = () => { document.onmousemove = null; document.onmouseup = null; header.style.cursor = 'grab'; };
        document.onmousemove = (e) => {
            e.preventDefault();
            const dx = posX - e.clientX; const dy = posY - e.clientY;
            posX = e.clientX; posY = e.clientY;
            content.style.top = (content.offsetTop - dy) + 'px';
            content.style.left = (content.offsetLeft - dx) + 'px';
            content.style.margin = '0';
            header.style.cursor = 'grabbing';
        };
    };
};

window.initSortable = () => {
    document.querySelectorAll('.column-body').forEach(el => {
        if (el.sortable) return;
        el.sortable = new Sortable(el, {
            group: 'shared',
            animation: 150,
            onEnd: (evt) => {
                try {
                    const itemEl = evt.item;
                    const fromCol = evt.from.closest('.column');
                    const toCol = evt.to.closest('.column');

                    if (!fromCol || !toCol) {
                        renderBoard();
                        return;
                    }

                    const itemId = itemEl.dataset.id;
                    const fromProjectId = fromCol.dataset.projectId;
                    const toProjectId = toCol.dataset.projectId;

                    const fromProject = findProject(fromProjectId);
                    const toProject = findProject(toProjectId);

                    if (fromProject && toProject) {
                        const itemIdx = fromProject.items.findIndex(it => it.id === itemId);
                        if (itemIdx !== -1) {
                            const [item] = fromProject.items.splice(itemIdx, 1);
                            toProject.items.splice(evt.newIndex, 0, item);
                            saveData();
                        }
                    }
                    // Always re-render to sync DOM with data (especially for invalid drops)
                    renderBoard();
                } catch (err) {
                    console.error("Sortable error:", err);
                    renderBoard();
                }
            }
        });
    });
};

window.showModal = (id) => {
    const m = document.getElementById(id);
    if (m) {
        m.classList.remove('hidden');
        if (id === 'settings-modal' || id === 'picker-modal') {
            const content = m.querySelector('.modal-content') || m.querySelector('.picker-window');
            if (content && !content.style.top) {
                content.style.top = '20px';
                content.style.left = 'auto';
                content.style.right = '20px';
                content.style.transform = 'none';
                content.style.margin = '0';
            }
        }
    }
};

window.hideModal = (id) => {
    document.getElementById(id)?.classList.add('hidden');
};


window.openPicker = (varName) => {
    currentPickerVar = varName;
    const color = state.config[varName] || '#ffffff';
    renderClassicGrid();
    updateUIFromColor(color);
    showModal('picker-modal');
};

window.closePicker = () => hideModal('picker-modal');

window.confirmPicker = () => {
    const r = parseInt(document.getElementById('inp-r').value);
    const g = parseInt(document.getElementById('inp-g').value);
    const b = parseInt(document.getElementById('inp-b').value);
    const hex = `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
    state.config[currentPickerVar] = hex;
    applyTheme();
    saveData();
    closePicker();
};

function updateUIFromColor(hex) {
    const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    document.getElementById('inp-r').value = r;
    document.getElementById('inp-g').value = g;
    document.getElementById('inp-b').value = b;
    document.getElementById('current-color-preview').style.background = hex;
}

function renderClassicGrid() {
    const colors = [
        '#800000', '#808000', '#008000', '#008080', '#000080', '#800080', '#808040', '#004040', '#0080ff', '#004080', '#4000ff', '#804000',
        '#ff0000', '#ffff00', '#00ff00', '#00ffff', '#0000ff', '#ff00ff', '#ffff80', '#00ff80', '#80ffff', '#8080ff', '#ff0080', '#ff8040',
        '#ffffff', '#c0c0c0', '#808080', '#404040', '#000000'
    ];
    const grid = document.getElementById('classic-picker-grid');
    if (grid) {
        grid.innerHTML = colors.map(c => `<div onclick="updateUIFromColor('${c}')" style="background:${c}"></div>`).join('');
    }
}


window.applyTheme = () => {
    const root = document.documentElement; const c = state.config;
    console.log("Applying Theme Config:", c);
    root.style.setProperty('--primary-color', c.primary);
    document.body.style.background = c.bg;
    root.style.setProperty('--card-header-bg', c.headerBg);
    root.style.setProperty('--card-header-text', c.headerText);
    root.style.setProperty('--link-text-color', c.link);
    root.style.setProperty('--row-bg-color', c.rowBg);
    root.style.setProperty('--item-bg', c.itemBg || '#ffffff');
    root.style.setProperty('--item-font-size', c.itemFontSize || '0.85rem');
    root.style.setProperty('--item-font-weight', c.itemFontWeight || '500');
    root.style.setProperty('--item-font-style', c.itemFontStyle || 'normal');
    root.style.setProperty('--row-title-color', c.rowTitleColor || c.primary);
    root.style.setProperty('--group-font-size', c.groupFontSize || '0.95rem');
    root.style.setProperty('--row-font-size', c.rowFontSize || '1.5rem');

    Object.keys(c).forEach(k => { const s = document.getElementById(`swatch-${k}`); if (s) s.style.background = c[k]; });


    const ifs = document.getElementById('inp-font-size'); if (ifs) ifs.value = c.itemFontSize || '0.85rem';
    const igs = document.getElementById('inp-group-size'); if (igs) igs.value = c.groupFontSize || '0.95rem';
    const irs = document.getElementById('inp-row-size'); if (irs) irs.value = c.rowFontSize || '1.5rem';
    const ib = document.getElementById('inp-bold'); if (ib) ib.checked = (c.itemFontWeight === 'bold');
    const ii = document.getElementById('inp-italic'); if (ii) ii.checked = (c.itemFontStyle === 'italic');
};

window.updateFontConfig = () => {
    const fix = (v) => (v && !isNaN(v)) ? v + 'px' : v;
    state.config.itemFontSize = fix(document.getElementById('inp-font-size').value);
    state.config.groupFontSize = fix(document.getElementById('inp-group-size').value);
    state.config.rowFontSize = fix(document.getElementById('inp-row-size').value);
    state.config.itemFontWeight = document.getElementById('inp-bold').checked ? 'bold' : '500';
    state.config.itemFontStyle = document.getElementById('inp-italic').checked ? 'italic' : 'normal';
    applyTheme();
    saveData();
};

window.setTheme = (type) => {
    const themes = {
        'dark': { primary: '#6c5ce7', bg: '#2d3436', headerBg: '#353b48', headerText: '#ffffff', link: '#dfe6e9', rowBg: '#2d3436', itemBg: '#353b48', rowTitleColor: '#6c5ce7' },
        'ocean': { primary: '#00cec9', bg: '#0984e3', headerBg: '#74b9ff', headerText: '#ffffff', link: '#2d3436', rowBg: 'rgba(255,255,255,0.2)', itemBg: '#ffffff', rowTitleColor: '#ffffff' },
        'forest': { primary: '#00b894', bg: '#2ecc71', headerBg: '#55efc4', headerText: '#ffffff', link: '#2d3436', rowBg: 'rgba(255,255,255,0.2)', itemBg: '#ffffff', rowTitleColor: '#ffffff' },
        'neon': { primary: '#00d2ff', bg: '#121212', headerBg: '#6c5ce7', headerText: '#ffffff', link: '#00d2ff', rowBg: '#1a1a1a', itemBg: '#1a1a1a', rowTitleColor: '#00d2ff' }
    };
    if (themes[type]) { state.config = { ...themes[type] }; applyTheme(); saveData(); }
};


const buttonMetadata = {
    'btn-pull-cloud': { icon: 'fa-solid fa-cloud-arrow-down', text: 'Cloud Download', class: 'btn btn-secondary', title: 'Daten von GitHub auf diesen PC laden (überschreibt lokal)' },
    'btn-save': { icon: 'fa-solid fa-floppy-disk', text: 'Speichern', class: 'btn btn-secondary' },
    'btn-import': { icon: 'fa-solid fa-file-import', text: 'Importieren', class: 'btn btn-secondary', title: 'HTML Bookmarks Datei importieren' },
    'btn-export': { icon: 'fa-solid fa-file-export', text: 'Exportieren', class: 'btn btn-secondary' },
    'btn-github': { icon: 'fa-brands fa-github', text: 'Sync-Token', class: 'btn btn-secondary', style: 'background:#24292e; color:white;' },
    'btn-info': { icon: 'fa-solid fa-circle-info', text: '', class: 'btn btn-secondary', title: 'Info & Shortcuts' },
    'btn-collapse-gaps': { icon: 'fa-solid fa-compress-arrows-alt', text: 'Lücken schließen', class: 'btn btn-secondary', title: 'Alle Lücken in allen Zeilen gleichzeitig entfernen' },
    'btn-add-row': { icon: 'fa-solid fa-layer-group', text: 'Neue Zeile', class: 'btn btn-secondary', title: 'Eine neue horizontale Zeile hinzufügen' },
    'btn-add-project': { icon: 'fa-solid fa-plus', text: 'Neue Fav. Gruppe', class: 'btn btn-accent' },
    'btn-move-mode': { icon: 'fa-solid fa-arrows-up-down-left-right', text: 'Verschieben', class: 'btn btn-secondary', title: 'Mehrere Gruppen oder Links verschieben' },
    'btn-multi-delete': { icon: 'fa-solid fa-eraser', text: 'Mehrere Löschen', class: 'btn btn-secondary', title: 'Mehrere Gruppen oder Links gleichzeitig löschen' },
    'btn-settings': { icon: 'fa-solid fa-palette', text: 'Design', class: 'btn btn-secondary', title: 'Farben & Design', iconStyle: 'color:var(--primary-color)' },
    'btn-sort-rows': { icon: 'fa-solid fa-sort-numeric-down', text: 'Zeilen sortieren', class: 'btn btn-secondary', title: 'Zeilen nach Nummern sortieren' }
};

const btnHandlers = {
    'btn-load': () => { if (confirm('Lokal laden?')) init(); },
    'btn-pull-cloud': async () => { if (confirm('Daten von GitHub laden? Lokale Änderungen auf diesem PC werden überschrieben!')) await pullFromCloud(); },
    'btn-save': () => saveData(),
    'btn-import': () => {
        const select = document.getElementById('import-row-select');
        if (select) {
            select.innerHTML = '<option value="new">-- Neue Zeile erstellen --</option>';
            state.rows.forEach(r => {
                select.innerHTML += `<option value="${r.id}">${r.title}</option>`;
            });
        }
        showModal('import-modal');
    },
    'btn-export': () => {
        const select = document.getElementById('export-row-select');
        if (select) {
            select.innerHTML = '<option value="all">-- Alles exportieren --</option>';
            state.rows.forEach(r => {
                select.innerHTML += `<option value="${r.id}">${r.title}</option>`;
            });
        }
        showModal('export-modal');
    },
    'btn-cancel-export': () => hideModal('export-modal'),
    'btn-confirm-export': () => {
        const rowId = document.getElementById('export-row-select').value;
        let exportRows = state.rows;
        let filename = 'favoriten_chrome.html';

        if (rowId !== 'all') {
            const row = state.rows.find(r => r.id === rowId);
            if (row) {
                exportRows = [row];
                filename = `favoriten_${row.title.replace(/\s+/g, '_')}.html`;
            }
        }

        const html = convertToHTMLBookmarks(exportRows);
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
        a.download = filename;
        a.click();
        hideModal('export-modal');
    },
    'btn-confirm-import': () => {
        const file = document.getElementById('file-input').files[0];
        const rowId = document.getElementById('import-row-select').value;
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => { importFromHTML(e.target.result, rowId); hideModal('import-modal'); };
            reader.readAsText(file);
        }
    },
    'btn-move-mode': () => toggleMoveMode(),
    'btn-multi-delete': () => toggleDeleteMode(),
    'btn-cancel-move': () => toggleMoveMode(),
    'btn-cancel-delete': () => toggleDeleteMode(),
    'btn-confirm-delete': () => applyDelete(),
    'btn-github': async () => {
        const token = prompt('GitHub Token:', ghToken);
        if (token !== null) { localStorage.setItem('gh_token', token); ghToken = token; await loadFromGitHub(); }
    },
    'btn-info': () => showModal('info-modal'),
    'btn-reset': () => { if (confirm('Alles löschen?')) { state.rows = [{ id: generateId(), title: 'Hauptzeile', projects: [], order: 10 }]; renderBoard(); saveData(); } },
    'btn-collapse-gaps': () => { state.rows.forEach(r => r.projects = r.projects.filter(s => !s.isSpacer)); renderBoard(); saveData(); },
    'btn-add-row': () => {
        const nextOrder = state.rows.length > 0 ? Math.max(...state.rows.map(r => r.order || 0)) + 10 : 10;
        state.rows.push({ id: generateId(), title: 'Neue Zeile', projects: [], order: nextOrder });
        renderBoard(); saveData();
    },
    'btn-sort-rows': () => sortRows(),
    'btn-add-spacer': () => {
        if (state.rows.length === 0) state.rows.push({ id: generateId(), title: 'Hauptzeile', projects: [] });
        state.rows[state.rows.length - 1].projects.push({ id: generateId(), isSpacer: true, projects: [] });
        renderBoard(); saveData();
    },
    'btn-add-project': () => {
        const t = prompt('Projekt Name:');
        if (t) {
            if (state.rows.length === 0) state.rows.push({ id: generateId(), title: 'Hauptzeile', projects: [] });
            const p = { id: generateId(), title: t, items: [], collapsed: true };
            state.rows[state.rows.length - 1].projects.push({ id: generateId(), isSpacer: false, projects: [p] });
            renderBoard(); saveData();
        }
    },
    'btn-close-settings': () => hideModal('settings-modal'),
    'btn-close-info': () => hideModal('info-modal'),
    'btn-cancel-import': () => hideModal('import-modal')
};

function convertToHTMLBookmarks(rows) {
    let html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<!-- This is an automatically generated file.
     It will be read and rewritten.
     DO NOT EDIT! -->
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
    <DT><H3 PERSONAL_TOOLBAR_FOLDER="true">Lesezeichenleiste</H3>
    <DL><p>\n`;

    const allProjects = [];
    rows.forEach(row => {
        row.projects.forEach(slot => {
            if (!slot.isSpacer) {
                slot.projects.forEach(project => {
                    allProjects.push(project);
                });
            }
        });
    });

    allProjects.sort((a, b) => a.title.localeCompare(b.title));

    allProjects.forEach(project => {
        html += `        <DT><H3>${project.title}</H3>\n        <DL><p>\n`;
        project.items.forEach(item => {
            html += `            <DT><A HREF="${item.url}">${item.title}</A>\n`;
        });
        html += `        </DL><p>\n`;
    });

    html += `    </DL><p>\n</DL><p>\n`;
    return html;
}

window.renderHeaderButtons = () => {
    const container = document.querySelector('.actions');
    if (!container) return;
    container.innerHTML = '';
    let order = state.config.buttonOrder || Object.keys(buttonMetadata);

    // Ensure all currently available metadata buttons are included
    Object.keys(buttonMetadata).forEach(id => {
        if (!order.includes(id)) order.push(id);
    });

    if (!order.includes('btn-save')) order = ['btn-save', ...order];

    order.forEach(id => {
        const meta = buttonMetadata[id];
        if (!meta) return;
        const btn = document.createElement('button');
        btn.id = id;
        btn.className = meta.class;
        if (meta.title) btn.title = meta.title;
        if (meta.style) btn.style.cssText = meta.style;
        let iconStyle = meta.iconStyle ? ` style="${meta.iconStyle}"` : '';
        btn.innerHTML = `<i class="${meta.icon}"${iconStyle}></i> ${meta.text}`;

        if (btnHandlers[id]) btn.onclick = btnHandlers[id];

        container.appendChild(btn);
    });
};


window.setupUI = () => {
    renderHeaderButtons();


    const btnMapSettings = {
        'btn-close-settings': btnHandlers['btn-close-settings'],
        'btn-close-info': btnHandlers['btn-close-info'],
        'btn-cancel-import': btnHandlers['btn-cancel-import'],
        'btn-confirm-import': btnHandlers['btn-confirm-import'],
        'btn-cancel-export': btnHandlers['btn-cancel-export'],
        'btn-confirm-export': btnHandlers['btn-confirm-export'],
        'btn-cancel-move': btnHandlers['btn-cancel-move'],
        'btn-cancel-delete': btnHandlers['btn-cancel-delete'],
        'btn-confirm-delete': btnHandlers['btn-confirm-delete']
    };

    Object.keys(btnMapSettings).forEach(id => {
        const btn = document.getElementById(id);
        if (btn) btn.onclick = btnMapSettings[id];
    });

    const fIn = document.getElementById('file-input');
    const fLab = document.getElementById('file-label');
    if (fIn) {
        fIn.onchange = () => {
            const btn = document.getElementById('btn-confirm-import');
            if (btn) btn.disabled = !fIn.files.length;
            if (fLab && fIn.files[0]) fLab.textContent = 'Datei: ' + fIn.files[0].name;
        };
    }


    const setW = document.querySelector('#settings-modal .modal-content');
    const setH = document.querySelector('#settings-modal .modal-header');
    if (setW && setH) makeDraggable(setW, setH);

    const pickW = document.querySelector('#picker-modal .picker-window');
    const pickH = document.querySelector('#picker-modal .picker-header');
    if (pickW && pickH) makeDraggable(pickW, pickH);


    const actionsContainer = document.querySelector('.actions');
    if (actionsContainer && typeof Sortable !== 'undefined') {
        new Sortable(actionsContainer, {
            animation: 150,
            ghostClass: 'btn-ghost',
            onEnd: () => {
                const newOrder = Array.from(actionsContainer.querySelectorAll('button')).map(b => b.id);
                state.config.buttonOrder = newOrder;
                saveData();
            }
        });
    }
};


window.updateUIFromColor = updateUIFromColor;

async function pullFromCloud() {
    try {
        const resp = await fetch('/api/github/pull', { method: 'POST' });
        const data = await resp.json();
        if (resp.ok) {
            state.rows = data.rows;
            state.config = data.config || state.config;
            renderBoard();
            alert('Geladen! Die Daten von GitHub wurden auf diesen PC übertragen und lokal gespeichert.');
        } else {
            alert('Fehler beim Laden von GitHub: ' + data.error);
        }
    } catch (e) {
        alert('Verbindungsfehler zum lokalen Server.');
    }
}
