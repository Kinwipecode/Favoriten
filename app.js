

const API_URL = '/api/favorites';
const board = document.getElementById("board");

let ghToken = localStorage.getItem('gh_token') || '';
let ghOwner = 'Kinwipecode';
let ghRepo = 'Favoriten';
let ghPath = 'data/favorites.json';
let ghSha = null;

const state = {
    rows: [],
    moveMode: { active: false, type: null, selectedIds: [] },
    deleteMode: { active: false, type: null, selectedIds: [] },
    config: {
        primary: '#6c5ce7',
        bg: '#dfe6e9',
        headerBg: '#f8f9fa',
        headerText: '#2d3436',
        link: '#2d3436',
        rowBg: 'rgba(255, 255, 255, 0.4)',
        itemBg: '#ffffff',
        buttonOrder: [
            'btn-pull-cloud', 'btn-save', 'btn-import', 'btn-export', 'btn-github', 'btn-info', 'btn-collapse-gaps', 'btn-add-row', 'btn-sort-rows', 'btn-add-project', 'btn-move-mode', 'btn-multi-delete', 'btn-settings'
        ]
    }
};

const generateId = () => Math.random().toString(36).substr(2, 9);

async function init() {
    if (window.setupUI) setupUI();
    await loadData();
    if (window.renderHeaderButtons) renderHeaderButtons();
    renderBoard();
}

async function loadData() {
    try {
        const res = await fetch(API_URL).catch(() => null);
        if (res && res.ok) {
            const data = await res.json();
            state.rows = migrate(data);
            if (window.applyTheme) applyTheme();
            const disp = document.getElementById('save-path-display');
            if (disp) { disp.textContent = '🏠 Server: ' + (data.savePath || 'Lokal'); disp.style.color = '#00b894'; }
        } else throw new Error("Offline");
    } catch (e) {
        if (ghToken) await loadFromGitHub();
        else {
            const l = localStorage.getItem('favoriten_backup');
            if (l) state.rows = migrate(JSON.parse(l));
        }
    }
}

async function loadFromGitHub() {
    const url = `https://api.github.com/repos/${ghOwner}/${ghRepo}/contents/${ghPath}?t=${Date.now()}`;
    try {
        const res = await fetch(url, { headers: { 'Authorization': `token ${ghToken}` } });
        if (res.ok) {
            const data = await res.json(); ghSha = data.sha;
            const content = JSON.parse(decodeURIComponent(escape(atob(data.content))));
            state.rows = migrate(content);
            if (window.applyTheme) applyTheme();
            renderBoard();
            const disp = document.getElementById('save-path-display');
            if (disp) { disp.textContent = '☁️ GitHub Sync'; disp.style.color = '#0984e3'; }
        }
    } catch (e) { console.error(e); }
}

async function saveData() {
    const payload = { rows: state.rows, config: state.config };
    const btn = document.getElementById('btn-save');
    if (btn) btn.disabled = true;

    try {
        const res = await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (res.ok) {
            showSavedFeedback();
            if (btn) btn.disabled = false;
            return;
        }
    } catch (e) {
        // Fallback for online mode
    }

    if (ghToken) {
        const success = await saveToGitHub();
        if (success) showSavedFeedback();
        else alert('GitHub Speicherung fehlgeschlagen. Bitte Token prüfen!');
    } else {
        localStorage.setItem('favoriten_backup', JSON.stringify(payload));
        alert('Kein Server/Token gefunden. Daten im Browser-Cache gesichert.');
    }
    if (btn) btn.disabled = false;
}

async function saveToGitHub() {
    const url = `https://api.github.com/repos/${ghOwner}/${ghRepo}/contents/${ghPath}`;
    const content = btoa(unescape(encodeURIComponent(JSON.stringify({ rows: state.rows, config: state.config }, null, 2))));
    try {
        const res = await fetch(url, { method: 'PUT', headers: { 'Authorization': `token ${ghToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ message: 'Update', content, sha: ghSha }) });
        if (res.ok) {
            const d = await res.json();
            ghSha = d.content.sha;
            return true;
        }
        return false;
    } catch (e) {
        console.error(e);
        return false;
    }
}

function migrate(data) {
    if (data.config) {
        state.config = { ...state.config, ...data.config };
        // Force remove unwanted buttons from existing config
        if (state.config.buttonOrder) {
            state.config.buttonOrder = state.config.buttonOrder.filter(id => id !== 'btn-load' && id !== 'btn-add-spacer');
        }
    }
    if (data.rows && data.rows.length > 0) {
        data.rows.forEach((r, index) => {
            if (!r.projects) r.projects = [];
            if (r.order === undefined) r.order = (index + 1) * 10;
            if (r.collapsed === undefined) r.collapsed = false;
            r.projects = r.projects.map(p => (p.projects && Array.isArray(p.projects)) ? p : (p.isSpacer ? { id: generateId(), isSpacer: true, projects: [] } : { id: generateId(), isSpacer: false, projects: [p] }));
        });
        return data.rows;
    }
    return [{ id: generateId(), title: 'Hauptzeile', projects: [], order: 10, collapsed: false }];
}

function renderBoard() {
    if (!board) return;
    board.innerHTML = "";

    // Sort rows by order
    const sortedRows = [...state.rows].sort((a, b) => (a.order || 0) - (b.order || 0));

    sortedRows.forEach(row => {
        const rowEl = document.createElement("div");
        rowEl.className = `board-row ${row.collapsed ? "collapsed" : ""}`;
        rowEl.oncontextmenu = (e) => showContextMenu(e, 'row', row.id);
        rowEl.innerHTML = `<div class="row-header">
                <div class="row-header-main" onclick="if(!event.target.closest('button') && (!event.target.closest('input') || event.target.type === 'checkbox')) toggleRowCollapse('${row.id}')" style="cursor:pointer;">
                    <input type="checkbox" ${row.collapsed ? "checked" : ""} readonly>
                    <input type="number" class="row-order-input" value="${row.order || 0}" onchange="updateRowOrder('${row.id}', this.value)" title="Sortier-Nummer">
                    <input type="text" class="row-title-input" value="${row.title}" oninput="this.style.width = (this.value.length + 2) + 'ch'" style="width: ${(row.title.length + 2)}ch" onchange="updateRowTitle('${row.id}', this.value)">
                </div>
                <div class="row-actions">
                    <button class="btn-icon" onclick="collapseRow('${row.id}')" title="Lücken in dieser Zeile schließen"><i class="fa-solid fa-compress"></i></button>
                    <button class="btn-icon" onclick="deleteRow('${row.id}')"><i class="fa-solid fa-trash"></i></button>
                </div>
            </div>
            <div class="row-projects" ondragover="event.preventDefault()" ondrop="handleRowDrop(event, '${row.id}')"></div>`;
        const container = rowEl.querySelector(".row-projects");
        row.projects.forEach(slot => {
            const slotEl = document.createElement("div"); slotEl.className = "grid-slot";
            slotEl.ondragover = (e) => { e.preventDefault(); slotEl.classList.add("drag-over-slot"); };
            slotEl.ondragleave = () => slotEl.classList.remove("drag-over-slot");
            slotEl.ondrop = (e) => { e.stopPropagation(); handleRowDrop(e, row.id, slot.id); };

            // Move Target for Groups
            if (state.moveMode.active && state.moveMode.type === 'group' && state.moveMode.selectedIds.length > 0) {
                const moveBtn = document.createElement('button');
                moveBtn.className = 'move-target-btn';
                moveBtn.innerHTML = '<i class="fa-solid fa-download"></i> Hierher';
                moveBtn.onclick = (e) => { e.stopPropagation(); applyMove('group', row.id, slot.id); };
                slotEl.appendChild(moveBtn);
            }

            if (slot.isSpacer) {
                slotEl.innerHTML += `<div class="column spacer" ondragover="event.preventDefault(); this.classList.add('drag-over');" ondragleave="this.classList.remove('drag-over');" ondrop="event.stopPropagation(); handleRowDrop(event, '${row.id}', '${slot.id}')"><div class="spacer-actions"><button class="btn-create-group" onclick="addGroupAtSlot('${slot.id}')" title="Gruppe hier erstellen"><i class="fa-solid fa-plus"></i></button><button class="btn-delete-slot" onclick="deleteProject('${slot.id}')" title="Lücke löschen">×</button></div></div>`;
            } else {
                slot.projects.forEach(p => {
                    const col = document.createElement("div");
                    col.dataset.projectId = p.id;
                    col.oncontextmenu = (e) => { e.stopPropagation(); showContextMenu(e, 'group', p.id); };
                    const moveSelected = state.moveMode.active && state.moveMode.type === 'group' && state.moveMode.selectedIds.includes(p.id);
                    const deleteSelected = state.deleteMode.active && state.deleteMode.type === 'group' && state.deleteMode.selectedIds.includes(p.id);

                    col.className = `column ${p.collapsed ? "collapsed" : ""} ${moveSelected ? 'selected-for-move' : ''} ${deleteSelected ? 'selected-for-delete' : ''}`;
                    col.draggable = !state.moveMode.active && !state.deleteMode.active;
                    col.ondragstart = (e) => handleColDragStart(e, p.id);
                    col.ondragend = handleDragEnd;
                    col.ondragover = (e) => { if (!state.moveMode.active) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; col.classList.add('drag-over-external'); } };
                    col.ondragleave = () => col.classList.remove('drag-over-external');
                    col.ondrop = (e) => { col.classList.remove('drag-over-external'); handleExternalDrop(e, p.id); };
                    col.onclick = (e) => {
                        if (state.moveMode.active) { e.stopPropagation(); toggleMoveSelect('group', p.id); }
                        else if (state.deleteMode.active) { e.stopPropagation(); toggleDeleteSelect('group', p.id); }
                    };

                    col.innerHTML = `<div class="column-header" onclick="if(!state.moveMode.active && !state.deleteMode.active && !event.target.closest('button') && (!event.target.closest('input') || event.target.type === 'checkbox')) toggleCollapse('${p.id}')" style="cursor:pointer;"><div class="header-left"><input type="checkbox" ${p.collapsed ? "checked" : ""} readonly><span>${p.title}</span>${(state.moveMode.active && state.moveMode.type === 'link' && state.moveMode.selectedIds.length > 0) ? `<button class="move-target-btn" onclick="event.stopPropagation(); applyMove('link', '${p.id}')">Hierher</button>` : ''}</div><div class="column-actions"><button onclick="event.stopPropagation(); addItem('${p.id}')"><i class="fa-solid fa-plus"></i></button><button onclick="event.stopPropagation(); deleteProject('${p.id}')"><i class="fa-solid fa-trash"></i></button></div></div><div class="column-body"></div>`;
                    const b = col.querySelector(".column-body");
                    p.items.forEach(it => {
                        const i = document.createElement("div");
                        i.dataset.id = it.id;
                        i.oncontextmenu = (e) => { e.stopPropagation(); showContextMenu(e, 'link', it.id); };
                        const mSel = state.moveMode.active && state.moveMode.type === 'link' && state.moveMode.selectedIds.includes(it.id);
                        const dSel = state.deleteMode.active && state.deleteMode.type === 'link' && state.deleteMode.selectedIds.includes(it.id);

                        i.className = `favorite-item ${mSel ? 'selected-for-move' : ''} ${dSel ? 'selected-for-delete' : ''}`;
                        i.onclick = (e) => {
                            if (state.moveMode.active) { e.stopPropagation(); toggleMoveSelect('link', it.id); }
                            else if (state.deleteMode.active) { e.stopPropagation(); toggleDeleteSelect('link', it.id); }
                            else { window.open(it.url); }
                        };
                        i.innerHTML = `<span>${it.title}</span><div class="item-actions"><button class="btn-text" onclick="event.stopPropagation(); editItem('${it.id}')" title="Bearbeiten"><i class="fa-solid fa-pen" style="font-size:0.7rem;"></i></button><button class="btn-text" onclick="event.stopPropagation(); deleteItem('${it.id}')" title="Löschen">×</button></div>`;
                        b.appendChild(i);
                    });
                    slotEl.appendChild(col);
                });
            }
            container.appendChild(slotEl);
        });
        board.appendChild(rowEl);
    });
    if (window.initSortable) initSortable();
}

async function handleExternalDrop(e, projectId) {
    const url = e.dataTransfer.getData('URL') || e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain');
    if (url && (url.startsWith('http') || url.startsWith('www'))) {
        e.preventDefault();
        e.stopPropagation();

        const finalUrl = url.startsWith('www') ? 'https://' + url : url;
        let title = finalUrl;

        const html = e.dataTransfer.getData('text/html');
        if (html) {
            const doc = new DOMParser().parseFromString(html, 'text/html');
            const a = doc.querySelector('a');
            if (a) title = a.textContent.trim() || finalUrl;
        }

        const p = findProject(projectId);
        if (p) {
            p.items.push({ id: generateId(), title: title.substring(0, 100), url: finalUrl });
            renderBoard(); saveData();
        }
    }
}


window.importFromHTML = (html, targetRowId) => {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const headings = [...doc.querySelectorAll('h3, h1, dt > h3')];

    let targetRow;
    if (targetRowId === 'new' || !targetRowId) {
        const nextOrder = state.rows.length > 0 ? Math.max(...state.rows.map(r => r.order || 0)) + 10 : 10;
        targetRow = { id: generateId(), title: 'Import ' + new Date().toLocaleDateString(), projects: [], order: nextOrder };
        state.rows.push(targetRow);
    } else {
        targetRow = state.rows.find(r => r.id === targetRowId);
        if (!targetRow) {
            const nextOrder = state.rows.length > 0 ? Math.max(...state.rows.map(r => r.order || 0)) + 10 : 10;
            targetRow = { id: generateId(), title: 'Import', projects: [], order: nextOrder };
            state.rows.push(targetRow);
        }
    }

    headings.forEach(h => {
        const title = h.textContent.trim();
        const container = h.closest('dt') || h.parentElement;
        const links = [...container.querySelectorAll('a')].filter(a => a.closest('dl') === h.nextElementSibling || a.parentElement === container);
        if (links.length > 0 && title && !['Bookmarks', 'Lesezeichen'].includes(title)) {
            targetRow.projects.push({ id: generateId(), isSpacer: false, projects: [{ id: generateId(), title, items: links.map(a => ({ id: generateId(), title: a.textContent.trim(), url: a.href })), collapsed: true }] });
        }
    });
    renderBoard(); saveData();
};

function showSavedFeedback() {
    const btn = document.getElementById('btn-save');
    if (!btn) return;

    // Store original HTML if NOT already in OK state
    if (!btn.dataset.originalHtml) {
        btn.dataset.originalHtml = btn.innerHTML;
    }

    btn.innerHTML = '✅ OK';
    btn.classList.add('btn-success-anim'); // Add visual feedback if needed

    // Clear any existing timeout to avoid premature resets or getting stuck
    if (btn.feedbackTimeout) clearTimeout(btn.feedbackTimeout);

    btn.feedbackTimeout = setTimeout(() => {
        btn.innerHTML = btn.dataset.originalHtml;
        delete btn.dataset.originalHtml;
        btn.feedbackTimeout = null;
    }, 2000);
}
let draggedItem = null, draggedProjectId = null;
function handleColDragStart(e, projectId) { draggedProjectId = projectId; e.target.classList.add("dragging-col"); }
function handleDragEnd(e) { e.target.classList.remove("dragging-col"); draggedProjectId = null; document.querySelectorAll(".column, .row-projects, .grid-slot").forEach(el => el.classList.remove("drag-over", "drag-over-slot")); }
function handleRowDrop(e, targetRowId, explicitSlotId = null) {
    if (!draggedProjectId) return;
    const row = state.rows.find(r => r.id === targetRowId);
    let slot = explicitSlotId ? row.projects.find(s => s.id === explicitSlotId) : null;
    if (!slot) {
        const c = e.currentTarget.closest(".row-projects");
        const idx = getGridSlotIndex(c, e.clientX, e.clientY);
        while (row.projects.length <= idx) row.projects.push({ id: generateId(), isSpacer: true, projects: [] });
        slot = row.projects[idx];
    }
    const p = findProjectAndClear(draggedProjectId); if (!p) return;
    if (slot.isSpacer) { slot.isSpacer = false; slot.projects = [p]; } else slot.projects.push(p);
    renderBoard(); saveData();
}
function getGridSlotIndex(container, x, y) { const slots = [...container.children]; for (let i = 0; i < slots.length; i++) { const b = slots[i].getBoundingClientRect(); if (x >= b.left && x <= b.right && y >= b.top && y <= b.bottom) return i; } return slots.length; }

function findProjectAndClear(id) {
    for (const r of state.rows) {
        const sIdx = r.projects.findIndex(s => s.isSpacer ? s.id === id : s.projects.some(p => p.id === id));
        if (sIdx !== -1) {
            const s = r.projects[sIdx];
            if (s.isSpacer) return r.projects.splice(sIdx, 1)[0];
            const pIdx = s.projects.findIndex(p => p.id === id);
            const p = s.projects.splice(pIdx, 1)[0];
            if (s.projects.length === 0) r.projects[sIdx] = { id: generateId(), isSpacer: true, projects: [] };
            return p;
        }
    }
}
function findProject(id) { for (const r of state.rows) for (const s of r.projects) if (!s.isSpacer) { const p = s.projects.find(x => x.id === id); if (p) return p; } }
window.updateRowTitle = (id, val) => { const r = state.rows.find(x => x.id === id); if (r) r.title = val; saveData(); };
window.updateRowOrder = (id, val) => { const r = state.rows.find(x => x.id === id); if (r) r.order = parseInt(val) || 0; saveData(); };
window.sortRows = () => { renderBoard(); };
window.deleteRow = (id) => { if (confirm('Reihe löschen?')) { state.rows = state.rows.filter(r => r.id !== id); renderBoard(); saveData(); } };
window.toggleRowCollapse = (id) => { const r = state.rows.find(x => x.id === id); if (r) { r.collapsed = !r.collapsed; renderBoard(); saveData(); } };
window.collapseRow = (id) => { const r = state.rows.find(x => x.id === id); if (r) { r.projects = r.projects.filter(s => !s.isSpacer); renderBoard(); saveData(); } };
window.toggleCollapse = (id) => { const p = findProject(id); if (p) { p.collapsed = !p.collapsed; renderBoard(); saveData(); } };
window.deleteProject = (id) => { findProjectAndClear(id); renderBoard(); saveData(); };
window.addItem = (id) => { const t = prompt('Titel:'), u = prompt('URL:'); if (t && u) { const p = findProject(id); if (p) { p.items.push({ id: generateId(), title: t, url: u.startsWith('http') ? u : 'https://' + u }); renderBoard(); saveData(); } } };
window.deleteItem = (id) => { for (const r of state.rows) for (const s of r.projects) if (!s.isSpacer) for (const p of s.projects) { const idx = p.items.findIndex(it => it.id === id); if (idx !== -1) { p.items.splice(idx, 1); renderBoard(); saveData(); return; } } };

window.toggleMoveMode = () => {
    state.moveMode.active = !state.moveMode.active;
    if (!state.moveMode.active) {
        state.moveMode.selectedIds = [];
        state.moveMode.type = null;
        document.body.classList.remove('move-mode-active');
    } else {
        if (state.deleteMode.active) toggleDeleteMode();
        document.body.classList.add('move-mode-active');
    }
    updateMoveToolbar();
    renderBoard();
};

window.toggleDeleteMode = () => {
    state.deleteMode.active = !state.deleteMode.active;
    if (!state.deleteMode.active) {
        state.deleteMode.selectedIds = [];
        state.deleteMode.type = null;
        document.body.classList.remove('delete-mode-active');
    } else {
        if (state.moveMode.active) toggleMoveMode();
        document.body.classList.add('delete-mode-active');
    }
    updateDeleteToolbar();
    renderBoard();
};

function toggleMoveSelect(type, id) {
    if (state.moveMode.type && state.moveMode.type !== type && state.moveMode.selectedIds.length > 0) {
        alert("Du kannst nur Gruppen ODER Links gleichzeitig markieren.");
        return;
    }
    state.moveMode.type = type;
    const idx = state.moveMode.selectedIds.indexOf(id);
    if (idx === -1) state.moveMode.selectedIds.push(id);
    else {
        state.moveMode.selectedIds.splice(idx, 1);
        if (state.moveMode.selectedIds.length === 0) state.moveMode.type = null;
    }
    updateMoveToolbar();
    renderBoard();
}

function toggleDeleteSelect(type, id) {
    if (state.deleteMode.type && state.deleteMode.type !== type && state.deleteMode.selectedIds.length > 0) {
        alert("Du kannst nur Gruppen ODER Links gleichzeitig markieren.");
        return;
    }
    state.deleteMode.type = type;
    const idx = state.deleteMode.selectedIds.indexOf(id);
    if (idx === -1) state.deleteMode.selectedIds.push(id);
    else {
        state.deleteMode.selectedIds.splice(idx, 1);
        if (state.deleteMode.selectedIds.length === 0) state.deleteMode.type = null;
    }
    updateDeleteToolbar();
    renderBoard();
}

function updateMoveToolbar() {
    const bar = document.getElementById('move-toolbar');
    const count = document.getElementById('move-count');
    const btn = document.getElementById('btn-confirm-move');
    if (!bar) return;

    if (state.moveMode.active) {
        bar.classList.remove('hidden');
        const typeName = state.moveMode.type === 'group' ? 'Gruppen' : (state.moveMode.type === 'link' ? 'Links' : 'Elemente');
        count.textContent = `${state.moveMode.selectedIds.length} ${typeName} ausgewählt`;
        if (count) count.textContent = `${state.moveMode.selectedIds.length} ${typeName} ausgewählt`;
        if (btn) btn.disabled = state.moveMode.selectedIds.length === 0;
    } else {
        bar.classList.add('hidden');
    }
}

function updateDeleteToolbar() {
    const bar = document.getElementById('delete-toolbar');
    const count = document.getElementById('delete-count');
    const btn = document.getElementById('btn-confirm-delete');
    if (!bar) return;

    if (state.deleteMode.active) {
        bar.classList.remove('hidden');
        const typeName = state.deleteMode.type === 'group' ? 'Gruppen' : (state.deleteMode.type === 'link' ? 'Links' : 'Elemente');
        if (count) count.textContent = `${state.deleteMode.selectedIds.length} ${typeName} zum Löschen markiert`;
        if (btn) btn.disabled = state.deleteMode.selectedIds.length === 0;
    } else {
        bar.classList.add('hidden');
    }
}

function applyDelete() {
    if (state.deleteMode.selectedIds.length === 0) return;
    if (!confirm(`${state.deleteMode.selectedIds.length} Elemente wirklich löschen?`)) return;

    if (state.deleteMode.type === 'group') {
        state.deleteMode.selectedIds.forEach(id => findProjectAndClear(id));
    } else if (state.deleteMode.type === 'link') {
        state.deleteMode.selectedIds.forEach(id => {
            for (const r of state.rows) {
                for (const s of r.projects) {
                    if (!s.isSpacer) {
                        for (const p of s.projects) {
                            const idx = p.items.findIndex(it => it.id === id);
                            if (idx !== -1) { p.items.splice(idx, 1); break; }
                        }
                    }
                }
            }
        });
    }

    toggleDeleteMode();
    renderBoard();
    saveData();
}

function applyMove(targetType, targetId, slotId = null) {
    if (state.moveMode.type === 'group') {
        const row = state.rows.find(r => r.id === targetId);
        const slot = row.projects.find(s => s.id === slotId);

        state.moveMode.selectedIds.forEach(id => {
            const p = findProjectAndClear(id);
            if (p) {
                if (slot.isSpacer) { slot.isSpacer = false; slot.projects = [p]; }
                else slot.projects.push(p);
            }
        });
    } else if (state.moveMode.type === 'link') {
        const targetProject = findProject(targetId);
        if (!targetProject) return;

        state.moveMode.selectedIds.forEach(id => {
            let foundItem = null;
            for (const r of state.rows) {
                for (const s of r.projects) {
                    if (!s.isSpacer) {
                        for (const p of s.projects) {
                            const idx = p.items.findIndex(it => it.id === id);
                            if (idx !== -1) {
                                foundItem = p.items.splice(idx, 1)[0];
                                break;
                            }
                        }
                    }
                    if (foundItem) break;
                }
                if (foundItem) break;
            }
            if (foundItem) targetProject.items.push(foundItem);
        });
    }

    toggleMoveMode();
    renderBoard();
    saveData();
}

window.addGroupAtSlot = (slotId) => {
    const t = prompt('Projekt Name:');
    if (t) {
        for (const r of state.rows) {
            const s = r.projects.find(x => x.id === slotId);
            if (s && s.isSpacer) {
                s.isSpacer = false;
                s.projects = [{ id: generateId(), title: t, items: [], collapsed: true }];
                renderBoard(); saveData();
                break;
            }
        }
    }
};

window.showContextMenu = (e, type, id) => {
    e.preventDefault();
    const menu = document.getElementById('context-menu');
    if (!menu) return;

    menu.innerHTML = '';
    let items = [];

    if (type === 'row') {
        const row = state.rows.find(r => r.id === id);
        items = [
            { title: row.title, type: 'header' },
            { icon: 'fa-rotate', text: 'Lokal laden', action: () => loadData().then(() => renderBoard()) },
            { icon: 'fa-compress', text: 'Lücken schließen', action: () => collapseRow(id) },
            {
                icon: 'fa-plus', text: 'Neue Fav. Gruppe', action: () => {
                    const t = prompt('Projekt Name:');
                    if (t) {
                        row.projects.push({ id: generateId(), isSpacer: false, projects: [{ id: generateId(), title: t, items: [], collapsed: true }] });
                        renderBoard(); saveData();
                    }
                }
            },
            {
                icon: 'fa-plus-square', text: 'Lücke einfügen', action: () => {
                    row.projects.push({ id: generateId(), isSpacer: true, projects: [] });
                    renderBoard(); saveData();
                }
            },
            { icon: 'fa-file-import', text: 'Importieren', action: () => btnHandlers['btn-import']() },
            {
                icon: 'fa-file-export', text: 'Exportieren hieraus', action: () => {
                    const html = convertToHTMLBookmarks([row]);
                    const a = document.createElement('a');
                    a.href = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
                    a.download = `favoriten_${row.title.replace(/\s+/g, '_')}.html`;
                    a.click();
                }
            },
            { divider: true },
            { icon: 'fa-trash', text: 'Reihe löschen', action: () => deleteRow(id), class: 'danger' }
        ];
    } else if (type === 'group') {
        const p = findProject(id);
        items = [
            { title: p.title, type: 'header' },
            { icon: 'fa-plus', text: 'Favorit hinzufügen', action: () => addItem(id) },
            {
                icon: 'fa-paste', text: 'Link aus Zwischenablage', action: async () => {
                    try {
                        const text = await navigator.clipboard.readText();
                        if (text && (text.startsWith('http') || text.startsWith('www'))) {
                            const u = text.startsWith('www') ? 'https://' + text : text;
                            p.items.push({ id: generateId(), title: u, url: u });
                            renderBoard(); saveData();
                        } else alert('Keine gültige URL in der Zwischenablage.');
                    } catch (e) { alert('Zugriff auf Zwischenablage verweigert.'); }
                }
            },
            { icon: 'fa-arrows-up-down-left-right', text: 'Verschieben Modus', action: () => toggleMoveMode() },
            { divider: true },
            { icon: 'fa-trash', text: 'Gruppe löschen', action: () => deleteProject(id), class: 'danger' }
        ];
    } else if (type === 'link') {
        items = [
            { icon: 'fa-pen', text: 'Bearbeiten', action: () => editItem(id) },
            { icon: 'fa-trash', text: 'Löschen', action: () => deleteItem(id), class: 'danger' }
        ];
    }

    items.forEach(item => {
        if (item.divider) {
            const div = document.createElement('div'); div.className = 'context-menu-divider';
            menu.appendChild(div);
        } else if (item.type === 'header') {
            const title = document.createElement('div'); title.className = 'context-menu-title';
            title.textContent = item.title;
            menu.appendChild(title);
        } else {
            const el = document.createElement('div');
            el.className = `context-menu-item ${item.class || ''}`;
            el.innerHTML = `<i class="fa-solid ${item.icon}"></i> ${item.text}`;
            el.onclick = () => { item.action(); hideContextMenu(); };
            menu.appendChild(el);
        }
    });

    menu.classList.remove('hidden');

    // Position menu
    const x = e.clientX, y = e.clientY;
    const w = window.innerWidth, h = window.innerHeight;
    const mw = menu.offsetWidth, mh = menu.offsetHeight;

    menu.style.left = (x + mw > w ? x - mw : x) + 'px';
    menu.style.top = (y + mh > h ? y - mh : y) + 'px';
};

window.hideContextMenu = () => {
    document.getElementById('context-menu')?.classList.add('hidden');
};

document.addEventListener('click', hideContextMenu);
document.addEventListener('scroll', hideContextMenu, true);

init();
