/**
 * UI / Menu Logic Module
 * Features: Draggable Modals, Windows-Style Color Picker, Typography Controls, Event Handling
 */

let posX = 0, posY = 0, currentPickerVar = null;

// --- Modal & Window Handling ---
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

// --- Color Picker Logic ---
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

// --- Typography & Theme Persistence ---
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

    // Sync UI Inputs
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

// --- Interaction Hook ---
const buttonMetadata = {
    'btn-load': { icon: 'fa-solid fa-cloud-arrow-down', text: 'Laden', class: 'btn btn-secondary', title: 'Zuletzt gespeicherten Stand holen' },
    'btn-save': { icon: 'fa-solid fa-floppy-disk', text: 'Speichern', class: 'btn btn-secondary' },
    'btn-import': { icon: 'fa-solid fa-file-import', text: 'Importieren', class: 'btn btn-secondary' },
    'btn-export': { icon: 'fa-solid fa-file-export', text: 'Exportieren', class: 'btn btn-secondary' },
    'btn-github': { icon: 'fa-brands fa-github', text: 'Sync', class: 'btn btn-secondary', style: 'background:#24292e; color:white;' },
    'btn-info': { icon: 'fa-solid fa-circle-info', text: '', class: 'btn btn-secondary', title: 'Info & Shortcuts' },
    'btn-collapse-gaps': { icon: 'fa-solid fa-compress', text: 'Lücken schließen', class: 'btn btn-secondary', title: 'Alle Lücken im Raster entfernen' },
    'btn-add-row': { icon: 'fa-solid fa-layer-group', text: 'Neue Zeile', class: 'btn btn-secondary' },
    'btn-add-project': { icon: 'fa-solid fa-plus', text: 'Neue Fav. Gruppe', class: 'btn btn-accent' },
    'btn-settings': { icon: 'fa-solid fa-palette', text: 'Design', class: 'btn btn-secondary', title: 'Farben & Design', iconStyle: 'color:var(--primary-color)' }
};

const btnHandlers = {
    'btn-load': () => { if (confirm('Laden?')) init(); },
    'btn-save': () => saveData(),
    'btn-import': () => showModal('import-modal'),
    'btn-export': () => {
        const data = JSON.stringify({ rows: state.rows, config: state.config }, null, 2);
        const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([data], { type: 'application/json' })); a.download = 'favoriten_backup.json'; a.click();
    },
    'btn-github': async () => {
        const token = prompt('GitHub Token:', ghToken);
        if (token !== null) { localStorage.setItem('gh_token', token); ghToken = token; await loadFromGitHub(); }
    },
    'btn-info': () => showModal('info-modal'),
    'btn-reset': () => { if (confirm('Alles löschen?')) { state.rows = [{ id: generateId(), title: 'Hauptzeile', projects: [] }]; renderBoard(); saveData(); } },
    'btn-collapse-gaps': () => { state.rows.forEach(r => r.projects = r.projects.filter(s => !s.isSpacer)); renderBoard(); saveData(); },
    'btn-add-row': () => { state.rows.push({ id: generateId(), title: 'Neue Zeile', projects: [] }); renderBoard(); saveData(); },
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
    'btn-cancel-import': () => hideModal('import-modal'),
    'btn-confirm-import': () => {
        const file = document.getElementById('file-input').files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => { importFromHTML(e.target.result); hideModal('import-modal'); };
            reader.readAsText(file);
        }
    }
};

window.renderHeaderButtons = () => {
    const container = document.querySelector('.actions');
    if (!container) return;
    container.innerHTML = '';
    const order = state.config.buttonOrder || Object.keys(buttonMetadata);
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

        // Handlers direkt beim Erstellen zuweisen
        if (btnHandlers[id]) btn.onclick = btnHandlers[id];

        container.appendChild(btn);
    });
};

// --- Interaction Hook ---
window.setupUI = () => {
    renderHeaderButtons();

    // Fixe Event-Zuweisung für Elemente, die nicht dynamisch neu gezeichnet werden
    const btnMapSettings = {
        'btn-close-settings': btnHandlers['btn-close-settings'],
        'btn-close-info': btnHandlers['btn-close-info'],
        'btn-cancel-import': btnHandlers['btn-cancel-import'],
        'btn-confirm-import': btnHandlers['btn-confirm-import']
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

    // Window Init
    const setW = document.querySelector('#settings-modal .modal-content');
    const setH = document.querySelector('#settings-modal .modal-header');
    if (setW && setH) makeDraggable(setW, setH);

    const pickW = document.querySelector('#picker-modal .picker-window');
    const pickH = document.querySelector('#picker-modal .picker-header');
    if (pickW && pickH) makeDraggable(pickW, pickH);

    // Initialisiere SortableJS für die Buttons
    const actionsContainer = document.querySelector('.actions');
    if (actionsContainer && typeof Sortable !== 'undefined') {
        new Sortable(actionsContainer, {
            animation: 150,
            ghostClass: 'btn-ghost',
            onEnd: () => {
                const newOrder = Array.from(actionsContainer.querySelectorAll('button')).map(b => b.id);
                state.config.buttonOrder = newOrder;
                saveData(); // Speichert die neue Reihenfolge
            }
        });
    }
};

// Global shorthand for color update from picker grid
window.updateUIFromColor = updateUIFromColor;
