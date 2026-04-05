

const API_URL = '/api/favorites';
const board = document.getElementById("board");

let ghToken = localStorage.getItem('gh_token') || '';
let ghOwner = 'Kinwipecode';
let ghRepo = 'Favoriten';
let ghPath = 'data/favorites.json';
let ghSha = null;

const state = {
    rows: [],
    searchTerm: "",
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
            'btn-pull-cloud', 'btn-save', 'btn-check-links', 'btn-import', 'btn-export', 'btn-github', 'btn-info', 'btn-collapse-gaps', 'btn-add-row', 'btn-sort-rows', 'btn-add-project', 'btn-move-mode', 'btn-multi-delete', 'btn-settings'
        ]
    },
    activeLinkId: null,
    activeProjectId: null,
    activeSlotId: null,
    activeRowId: null,
    activeEditingGroupId: null
};

const generateId = () => Math.random().toString(36).substr(2, 9);

async function init() {
    if (window.setupUI) setupUI();
    await loadData();
    if (window.renderHeaderButtons) renderHeaderButtons();
    renderBoard();

    // Check for Bookmarklet query params
    const params = new URLSearchParams(window.location.search);
    if (params.has('add_url')) {
        const u = params.get('add_url');
        const t = params.get('add_title') || "";
        // Remove params from URL to clean up
        window.history.replaceState({}, document.title, window.location.pathname);
        setTimeout(() => addItem(null, u, t), 500);
    }

    updateBookmarklet();
}

async function loadData() {
    const disp = document.getElementById('save-path-display');

    // 1. Probier den lokalen Server (mit Timeout)
    try {
        if (disp) { disp.textContent = '🔍 Prüfe lokalen Server...'; disp.style.color = '#636e72'; }
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000);
        const res = await fetch(API_URL, { signal: controller.signal }).catch(() => null);
        clearTimeout(timeoutId);

        if (res && res.ok) {
            const data = await res.json();
            state.rows = migrate(data);
            if (window.applyTheme) applyTheme();
            renderBoard();
            if (disp) { disp.textContent = '🏠 Server: ' + (data.savePath || 'Lokal'); disp.style.color = '#00b894'; }
            return;
        }
    } catch (e) {
        console.warn("Lokal nicht erreichbar.");
    }

    // 2. Fallback zu GitHub
    if (disp) { disp.textContent = '🌩️ Lade von GitHub...'; disp.style.color = '#0984e3'; }
    await loadFromGitHub();

    // 3. Letzte Rettung: Browser-Backup
    if (state.rows.length === 0 || (state.rows.length === 1 && state.rows[0].projects.length === 0)) {
        if (disp) { disp.textContent = '⚠️ GitHub fehlgeschlagen, prüfe Cache...'; }
        const l = localStorage.getItem('favoriten_backup');
        if (l) {
            state.rows = migrate(JSON.parse(l));
            renderBoard();
            showToast('Browser-Backup geladen.', 'info');
            if (disp) { disp.textContent = '📦 Browser-Cache (Backup)'; disp.style.color = '#fdcb6e'; }
        } else if (disp) {
            disp.textContent = '❌ Keine Daten gefunden (Offline)';
            disp.style.color = '#d63031';
        }
    }
}

async function loadFromGitHub() {
    const disp = document.getElementById('save-path-display');

    // API Abruf mit Token (wenn vorhanden)
    if (ghToken) {
        try {
            const url = `https://api.github.com/repos/${ghOwner}/${ghRepo}/contents/${ghPath}?t=${Date.now()}`;
            const res = await fetch(url, { headers: { 'Authorization': `token ${ghToken}` } });
            if (res.ok) {
                const data = await res.json();
                ghSha = data.sha;
                const content = JSON.parse(decodeURIComponent(escape(atob(data.content))));
                state.rows = migrate(content);
                if (window.applyTheme) applyTheme();
                renderBoard();
                if (disp) { disp.textContent = '☁️ GitHub Sync'; disp.style.color = '#0984e3'; }
                return;
            }
        } catch (e) { console.error("GitHub API Fehler:", e); }
    }

    // Öffentlicher Abruf (RAW) ohne Token
    const branches = ['main', 'master'];
    for (const branch of branches) {
        try {
            if (disp) disp.textContent = `🌨️ GitHub (Branch: ${branch})...`;
            const publicUrl = `https://raw.githubusercontent.com/${ghOwner}/${ghRepo}/${branch}/${ghPath}?t=${Date.now()}`;
            const res = await fetch(publicUrl);
            if (res.ok) {
                const content = await res.json();
                state.rows = migrate(content);
                if (window.applyTheme) applyTheme();
                renderBoard();
                if (disp) { disp.textContent = '📖 GitHub (Nur Lesen)'; disp.style.color = '#e17055'; }
                showToast('Nur Lese-Modus aktiviert.', 'info');
                return;
            } else {
                console.warn(`Fetch für ${branch} ergab Status ${res.status}`);
            }
        } catch (e) { console.warn(`Versuch über ${branch} fehlgeschlagen.`, e); }
    }
}

async function saveData(isSilent = false) {
    const payload = { rows: state.rows, config: state.config };
    const btn = document.getElementById('btn-save');
    if (btn) btn.disabled = true;

    try {
        // 1. Try local server
        const res = await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (res.ok) {
            if (!isSilent) showSavedFeedback();
            if (btn) btn.disabled = false;
            return;
        }
    } catch (e) {
        console.warn("Local server offline, trying direct GitHub save...");
    }

    // 2. If local fails, try direct GitHub (requires token)
    if (ghToken) {
        const success = await saveToGitHub();
        if (success) { if (!isSilent) showSavedFeedback(); }
        else if (!isSilent) showToast('GitHub Speicherung fehlgeschlagen. Bitte Token prüfen!', 'error');
    } else {
        localStorage.setItem('favoriten_backup', JSON.stringify(payload));
        if (!isSilent) {
            showToast('Kein Server/Token: Daten nur im Browser-Cache!', 'warning');
            showModal('github-token-modal');
        }
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
    const isSearching = !!state.searchTerm;
    board.innerHTML = "";

    // Sort rows by order
    const sortedRows = [...state.rows].sort((a, b) => (a.order || 0) - (b.order || 0));

    sortedRows.forEach(row => {
        if (state.searchTerm) {
            const hasMatch = row.projects.some(s => !s.isSpacer && s.projects.some(p => {
                const pMatch = p.title.toLowerCase().includes(state.searchTerm);
                const iMatch = p.items.some(it => it.title.toLowerCase().includes(state.searchTerm) || it.url.toLowerCase().includes(state.searchTerm));
                return pMatch || iMatch;
            }));
            if (!hasMatch) return;
        }
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
            if (isSearching) {
                if (slot.isSpacer) return;
                const hasMatch = slot.projects.some(p => {
                    const pMatch = p.title.toLowerCase().includes(state.searchTerm);
                    const iMatch = p.items.some(it => it.title.toLowerCase().includes(state.searchTerm) || it.url.toLowerCase().includes(state.searchTerm));
                    return pMatch || iMatch;
                });
                if (!hasMatch) return;
            }
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
                slotEl.innerHTML += `<div class="column spacer" ondragover="if(!document.body.classList.contains('is-dragging-item')) { event.preventDefault(); this.classList.add('drag-over'); }" ondragleave="this.classList.remove('drag-over');" ondrop="if(!document.body.classList.contains('is-dragging-item')) { event.stopPropagation(); this.classList.remove('drag-over'); handleRowDrop(event, '${row.id}', '${slot.id}') }"><div class="spacer-actions"><button class="btn-create-group" onclick="addGroupAtSlot('${slot.id}')" title="Gruppe hier erstellen"><i class="fa-solid fa-plus"></i></button><button class="btn-delete-slot" onclick="deleteProject('${slot.id}')" title="Lücke löschen">×</button></div></div>`;
            } else {
                slot.projects.forEach(p => {
                    const col = document.createElement("div");
                    col.dataset.projectId = p.id;
                    col.oncontextmenu = (e) => { e.stopPropagation(); showContextMenu(e, 'group', p.id); };
                    const moveSelected = state.moveMode.active && state.moveMode.type === 'group' && state.moveMode.selectedIds.includes(p.id);
                    const deleteSelected = state.deleteMode.active && state.deleteMode.type === 'group' && state.deleteMode.selectedIds.includes(p.id);

                    col.className = `column ${p.collapsed ? "collapsed" : ""} ${moveSelected ? 'selected-for-move' : ''} ${deleteSelected ? 'selected-for-delete' : ''}`;
                    col.draggable = !state.moveMode.active && !state.deleteMode.active;
                    col.ondragstart = (e) => {
                        if (e.target.closest('.favorite-item')) return;
                        handleColDragStart(e, p.id);
                    };
                    col.ondragend = handleDragEnd;
                    col.ondragover = (e) => {
                        if (!state.moveMode.active && !document.body.classList.contains('is-dragging-item')) {
                            e.preventDefault();
                            e.dataTransfer.dropEffect = 'copy';
                            col.classList.add('drag-over-external');
                        }
                    };
                    col.ondragleave = () => col.classList.remove('drag-over-external');
                    col.ondrop = (e) => {
                        if (!document.body.classList.contains('is-dragging-item')) {
                            col.classList.remove('drag-over-external');
                            handleExternalDrop(e, p.id);
                        }
                    };
                    col.onclick = (e) => {
                        if (state.moveMode.active) { e.stopPropagation(); toggleMoveSelect('group', p.id); }
                        else if (state.deleteMode.active) { e.stopPropagation(); toggleDeleteSelect('group', p.id); }
                    };

                    col.innerHTML = `<div class="column-header" onclick="if(!state.moveMode.active && !state.deleteMode.active && !event.target.closest('button') && (!event.target.closest('input') || event.target.type === 'checkbox')) toggleCollapse('${p.id}')" style="cursor:pointer;"><div class="header-left"><input type="checkbox" ${p.collapsed ? "checked" : ""} readonly><span>${p.title}</span>${(state.moveMode.active && state.moveMode.type === 'link' && state.moveMode.selectedIds.length > 0) ? `<button class="move-target-btn" onclick="event.stopPropagation(); applyMove('link', '${p.id}')">Hierher</button>` : ''}</div><div class="column-actions"><button onclick="event.stopPropagation(); addItem('${p.id}')"><i class="fa-solid fa-plus"></i></button><button onclick="event.stopPropagation(); deleteProject('${p.id}')"><i class="fa-solid fa-trash"></i></button></div></div><div class="column-body"></div>`;
                    const b = col.querySelector(".column-body");
                    p.items.forEach(it => {
                        const match = isSearching && (it.title.toLowerCase().includes(state.searchTerm) || it.url.toLowerCase().includes(state.searchTerm));
                        const i = document.createElement("div");
                        i.dataset.id = it.id;
                        i.oncontextmenu = (e) => { e.stopPropagation(); showContextMenu(e, 'link', it.id); };
                        const mSel = state.moveMode.active && state.moveMode.type === 'link' && state.moveMode.selectedIds.includes(it.id);
                        const dSel = state.deleteMode.active && state.deleteMode.type === 'link' && state.deleteMode.selectedIds.includes(it.id);

                        i.onmouseenter = (e) => startTooltip(it.title, e);
                        i.onmousemove = (e) => startTooltip(it.title, e);
                        i.onmouseleave = hideTooltip;
                        i.className = `favorite-item ${mSel ? 'selected-for-move' : ''} ${dSel ? 'selected-for-delete' : ''} ${match ? 'search-highlight' : ''} ${isSearching && !match ? 'search-dim' : ''}`;
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

        title = cleanTitle(title);

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
            targetRow.projects.push({ id: generateId(), isSpacer: false, projects: [{ id: generateId(), title, items: links.map(a => ({ id: generateId(), title: cleanTitle(a.textContent.trim()), url: a.href })), collapsed: true }] });
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
        if (idx >= row.projects.length) {
            // Drop outside slots - don't move or add spacer
            renderBoard();
            return;
        }
        slot = row.projects[idx];
    }

    if (!slot) { renderBoard(); return; }

    const p = findProjectAndClear(draggedProjectId);
    if (!p) { renderBoard(); return; }

    if (slot.isSpacer) {
        slot.isSpacer = false;
        slot.projects = [p];
    } else {
        slot.projects.push(p);
    }
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
function findItem(id) { for (const r of state.rows) for (const s of r.projects) if (!s.isSpacer) for (const p of s.projects) { const item = p.items.find(x => x.id === id); if (item) return item; } }
window.updateRowTitle = (id, val) => { const r = state.rows.find(x => x.id === id); if (r) r.title = val; saveData(); };
window.updateRowOrder = (id, val) => { const r = state.rows.find(x => x.id === id); if (r) r.order = parseInt(val) || 0; saveData(); };
window.sortRows = () => { renderBoard(); };
window.deleteRow = async (id) => { if (await showConfirm('Reihe wirklich löschen?')) { state.rows = state.rows.filter(r => r.id !== id); renderBoard(); saveData(); } };
window.toggleRowCollapse = (id) => { const r = state.rows.find(x => x.id === id); if (r) { r.collapsed = !r.collapsed; renderBoard(); saveData(true); } };
window.collapseRow = (id) => { const r = state.rows.find(x => x.id === id); if (r) { r.projects = r.projects.filter(s => !s.isSpacer); renderBoard(); saveData(true); } };
window.toggleCollapse = (id) => { const p = findProject(id); if (p) { p.collapsed = !p.collapsed; renderBoard(); saveData(true); } };
window.deleteProject = (id) => { findProjectAndClear(id); renderBoard(); saveData(); };
window.addItem = (projectId, preUrl = "", preTitle = "") => {
    if (!checkAuth()) return;
    const nameInp = document.getElementById('edit-link-name');
    const urlInp = document.getElementById('edit-link-url');
    const title = document.getElementById('edit-link-title');
    const groupSel = document.getElementById('edit-link-group');
    const groupWrap = document.getElementById('target-group-wrapper');

    if (nameInp && urlInp && title && groupSel) {
        // If preUrl is provided but preTitle is not, or we want auto-cleaning:
        if (preUrl && (!preTitle || preTitle === preUrl)) {
            preTitle = cleanTitle(preUrl);
        } else if (preTitle) {
            preTitle = cleanTitle(preTitle);
        }

        nameInp.value = preTitle;
        urlInp.value = preUrl;
        title.innerHTML = '<i class="fa-solid fa-plus-circle"></i> Link hinzufügen';

        // Populate groups
        groupSel.innerHTML = '';
        state.rows.forEach(row => {
            row.projects.forEach(slot => {
                if (!slot.isSpacer) {
                    slot.projects.forEach(proj => {
                        const opt = document.createElement('option');
                        opt.value = proj.id;
                        opt.textContent = `${row.title} > ${proj.title}`;
                        if (proj.id === projectId) opt.selected = true;
                        groupSel.appendChild(opt);
                    });
                }
            });
        });

        if (groupWrap) groupWrap.style.display = 'block';
        state.activeLinkId = null;
        state.activeProjectId = projectId;
        showModal('edit-link-modal');
        if (preUrl) nameInp.focus(); else urlInp.focus();
    }
};

window.deleteItem = (id) => { for (const r of state.rows) for (const s of r.projects) if (!s.isSpacer) for (const p of s.projects) { const idx = p.items.findIndex(it => it.id === id); if (idx !== -1) { p.items.splice(idx, 1); renderBoard(); saveData(); return; } } };

window.editItem = (id) => {
    if (!checkAuth()) return;
    const item = findItem(id);
    if (!item) return;

    const nameInp = document.getElementById('edit-link-name');
    const urlInp = document.getElementById('edit-link-url');
    const title = document.getElementById('edit-link-title');
    const groupWrap = document.getElementById('target-group-wrapper');

    if (nameInp && urlInp && title) {
        nameInp.value = item.title;
        urlInp.value = item.url;
        title.innerHTML = '<i class="fa-solid fa-pen-to-square"></i> Link bearbeiten';
        if (groupWrap) groupWrap.style.display = 'none';
        state.activeLinkId = id;
        state.activeProjectId = null;
        showModal('edit-link-modal');
        nameInp.focus();
    }
};

document.getElementById('btn-save-link')?.addEventListener('click', () => {
    const nt = document.getElementById('edit-link-name').value.trim();
    let nu = document.getElementById('edit-link-url').value.trim();
    const targetGroupId = document.getElementById('edit-link-group')?.value;

    if (!nu) return;

    if (!nu.startsWith('http') && !nu.startsWith('www')) nu = 'https://' + nu;
    else if (nu.startsWith('www')) nu = 'https://' + nu;

    if (state.activeLinkId) {
        // Mode: Edit
        const item = findItem(state.activeLinkId);
        if (item) {
            item.title = nt || cleanTitle(nu);
            item.url = nu;
        }
    } else {
        // Mode: Add (either from context or global)
        const finalGroupId = targetGroupId || state.activeProjectId;
        if (finalGroupId) {
            const p = findProject(finalGroupId);
            if (p) {
                p.items.push({ id: generateId(), title: nt || cleanTitle(nu), url: nu });
            }
        } else {
            showToast('Keine Zielgruppe ausgewählt.', 'error');
            return;
        }
    }

    hideModal('edit-link-modal');
    renderBoard();
    saveData();
});

let tooltipTimer = null;
function startTooltip(text, e) {
    if (tooltipTimer) clearTimeout(tooltipTimer);
    const x = e.clientX, y = e.clientY;
    tooltipTimer = setTimeout(() => { showTooltip(text, x, y); }, 500);
}

function showTooltip(text, x, y) {
    const el = document.getElementById('custom-tooltip');
    if (!el) return;
    el.textContent = text;
    el.classList.remove('hidden');
    el.classList.remove('visible');
    setTimeout(() => el.classList.add('visible'), 10);
    positionTooltip(el, x, y);
}

function hideTooltip() {
    if (tooltipTimer) clearTimeout(tooltipTimer);
    const el = document.getElementById('custom-tooltip');
    if (!el) return;
    el.classList.remove('visible');
    setTimeout(() => { if (!el.classList.contains('visible')) el.classList.add('hidden'); }, 200);
}

function positionTooltip(el, x, y) {
    const margin = 20;
    let tx = x + 15;
    let ty = y + 15;
    if (tx + el.offsetWidth > window.innerWidth) tx = window.innerWidth - el.offsetWidth - margin;
    if (ty + el.offsetHeight > window.innerHeight) ty = window.innerHeight - el.offsetHeight - margin;
    el.style.left = tx + 'px';
    el.style.top = ty + 'px';
}

window.cleanAllLinkTitles = async () => {
    if (!await showConfirm('Möchtest du wirklich ALLE Link-Namen automatisch bereinigen? (Gilt für das gesamte Board)', 'Board-Optimierung')) return;

    state.rows.forEach(row => {
        row.projects.forEach(slot => {
            if (!slot.isSpacer) {
                slot.projects.forEach(project => {
                    project.items.forEach(item => {
                        item.title = cleanTitle(item.title || item.url);
                    });
                });
            }
        });
    });

    renderBoard();
    saveData();
    showToast('Alle Namen wurden erfolgreich bereinigt!', 'success');
};

function cleanTitlesInGroup(projectId) {
    const p = findProject(projectId);
    if (p) {
        p.items.forEach(item => {
            item.title = cleanTitle(item.title || item.url);
        });
        renderBoard(); saveData();
    }
}

function cleanTitlesInRow(rowId) {
    const row = state.rows.find(r => r.id === rowId);
    if (row) {
        row.projects.forEach(slot => {
            if (!slot.isSpacer) {
                slot.projects.forEach(project => {
                    project.items.forEach(item => {
                        item.title = cleanTitle(item.title || item.url);
                    });
                });
            }
        });
        renderBoard(); saveData();
    }
}

function cleanTitle(str) {
    if (!str) return "";

    let clean = str.trim();

    // 1. Remove protocols and www
    clean = clean.replace(/^https?:\/\//i, '').replace(/^www\./i, '');

    // 2. Identify if it's a raw URL (contains domain patterns)
    const isUrl = /^[a-zA-Z0-9-]+\.[a-zA-Z]{2,}/.test(clean);

    if (isUrl) {
        // If it looks like a URL, split at first path separator to get the domain
        const splitIndex = clean.search(/\/|\?|#/);
        if (splitIndex !== -1) {
            clean = clean.substring(0, splitIndex);
        }
    }

    // 3. Remove common messy suffixes (case insensitive)
    const suffixes = [
        / - Google Search$/i,
        / - YouTube$/i,
        / \| YouTube$/i,
        / - Wikipedia$/i,
        / - Home$/i,
        / \| Home$/i,
        / - Login$/i,
        / \| Login$/i,
        / - Sign In$/i,
        / \| Sign In$/i,
        / - Startseite$/i,
        / \| Startseite$/i,
        /\.(html|php|asp|aspx|jsp)$/i
    ];
    suffixes.forEach(regex => { clean = clean.replace(regex, ''); });

    // 4. Replace separators with spaces
    clean = clean.replace(/[-_]/g, ' ');

    // 5. Multi-spaces to single space
    clean = clean.replace(/\s+/g, ' ').trim();

    // 6. Title Case for each word, but keep uppercase if it was already mixed case
    clean = clean.split(' ').map(word => {
        if (!word) return '';
        // If word is all lowercase, capitalize first letter
        if (word === word.toLowerCase()) {
            return word.charAt(0).toUpperCase() + word.slice(1);
        }
        // If it's all uppercase but longer than 3 letters, capitalize first only
        if (word === word.toUpperCase() && word.length > 3) {
            return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
        }
        // Otherwise (mixed case), leave it alone
        return word;
    }).join(' ');

    return clean.substring(0, 80);
}

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
        showToast("Du kannst nur Gruppen ODER Links gleichzeitig markieren.", "error");
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
        showToast("Du kannst nur Gruppen ODER Links gleichzeitig markieren.", "error");
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

async function applyDelete() {
    if (state.deleteMode.selectedIds.length === 0) return;
    if (!await showConfirm(`${state.deleteMode.selectedIds.length} Elemente wirklich löschen?`, 'Massen-Löschen')) return;

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
    const nameInp = document.getElementById('edit-group-name');
    const title = document.getElementById('edit-group-title');
    if (nameInp && title) {
        nameInp.value = "";
        title.innerHTML = '<i class="fa-solid fa-folder-plus"></i> Gruppe erstellen';
        state.activeSlotId = slotId;
        state.activeRowId = null;
        state.activeEditingGroupId = null;
        showModal('edit-group-modal');
        nameInp.focus();
    }
};

window.editGroupName = (id) => {
    if (!checkAuth()) return;
    const p = findProject(id);
    if (!p) return;
    const nameInp = document.getElementById('edit-group-name');
    const title = document.getElementById('edit-group-title');
    if (nameInp && title) {
        nameInp.value = p.title;
        title.innerHTML = '<i class="fa-solid fa-pen-to-square"></i> Gruppe umbenennen';
        state.activeSlotId = null;
        state.activeRowId = null;
        state.activeEditingGroupId = id;
        showModal('edit-group-modal');
        nameInp.focus();
    }
};

document.getElementById('btn-save-group')?.addEventListener('click', () => {
    const t = document.getElementById('edit-group-name').value.trim();
    if (!t) return;

    if (state.activeEditingGroupId) {
        const p = findProject(state.activeEditingGroupId);
        if (p) p.title = t;
    } else if (state.activeSlotId) {
        for (const r of state.rows) {
            const s = r.projects.find(x => x.id === state.activeSlotId);
            if (s && s.isSpacer) {
                s.isSpacer = false;
                s.projects = [{ id: generateId(), title: t, items: [], collapsed: true }];
                break;
            }
        }
    } else if (state.activeRowId) {
        const row = state.rows.find(r => r.id === state.activeRowId);
        if (row) {
            row.projects.push({ id: generateId(), isSpacer: false, projects: [{ id: generateId(), title: t, items: [], collapsed: true }] });
        }
    } else {
        // Fallback: Global add (last row)
        if (state.rows.length === 0) state.rows.push({ id: generateId(), title: 'Hauptzeile', projects: [] });
        const p = { id: generateId(), title: t, items: [], collapsed: true };
        state.rows[state.rows.length - 1].projects.push({ id: generateId(), isSpacer: false, projects: [p] });
    }

    hideModal('edit-group-modal');
    renderBoard();
    saveData();
});

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
                    const nameInp = document.getElementById('edit-group-name');
                    const title = document.getElementById('edit-group-title');
                    if (nameInp && title) {
                        nameInp.value = "";
                        title.innerHTML = '<i class="fa-solid fa-folder-plus"></i> Neue Gruppe in Zeile';
                        state.activeRowId = id;
                        state.activeSlotId = null;
                        showModal('edit-group-modal');
                        nameInp.focus();
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
            { icon: 'fa-magic', text: 'Namen in Zeile bereinigen', action: () => cleanTitlesInRow(id) },
            { divider: true },
            { icon: 'fa-trash', text: 'Reihe löschen', action: () => deleteRow(id), class: 'danger' }
        ];
    } else if (type === 'group') {
        const p = findProject(id);
        items = [
            { title: p.title, type: 'header' },
            { icon: 'fa-pen', text: 'Gruppe umbenennen', action: () => editGroupName(id) },
            { icon: 'fa-plus', text: 'Favorit hinzufügen', action: () => addItem(id) },
            {
                icon: 'fa-paste', text: 'Link aus Zwischenablage', action: async () => {
                    let text = "";
                    try {
                        if (navigator.clipboard && navigator.clipboard.readText) {
                            text = await navigator.clipboard.readText();
                        }
                    } catch (e) { console.warn("Clipboard access denied, using prompt instead."); }

                    if (!text || !text.includes('.')) {
                        text = prompt('Link einfügen (Strg+V oder URL eintippen):');
                    }

                    if (text) {
                        text = text.trim();
                        if (text.includes('.') || text.startsWith('http')) {
                            const u = (text.startsWith('http') || text.startsWith('www')) ?
                                (text.startsWith('www') ? 'https://' + text : text) :
                                'https://' + text;

                            const p = findProject(id);
                            if (p) {
                                p.items.push({ id: generateId(), title: cleanTitle(u), url: u });
                                renderBoard(); saveData();
                            }
                        }
                    }
                }
            },
            { icon: 'fa-arrows-up-down-left-right', text: 'Verschieben Modus', action: () => toggleMoveMode() },
            { icon: 'fa-magic', text: 'Namen in Gruppe bereinigen', action: () => cleanTitlesInGroup(id) },
            { divider: true },
            { icon: 'fa-trash', text: 'Gruppe löschen', action: () => deleteProject(id), class: 'danger' }
        ];
    } else if (type === 'link') {
        items = [
            {
                icon: 'fa-magic', text: 'Name bereinigen', action: () => {
                    const item = findItem(id);
                    if (item) { item.title = cleanTitle(item.title || item.url); renderBoard(); saveData(); }
                }
            },
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

window.handleSearch = (val) => {
    state.searchTerm = val.toLowerCase();
    const clearBtn = document.getElementById('search-clear');
    if (clearBtn) {
        if (val) clearBtn.classList.remove('hidden');
        else clearBtn.classList.add('hidden');
    }
    renderBoard();
};

window.clearSearch = () => {
    const inp = document.getElementById('board-search');
    if (inp) {
        inp.value = '';
        handleSearch('');
        inp.focus();
    }
};

window.showToast = (msg, type = 'info', duration = 3000) => {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    const icon = type === 'success' ? 'fa-circle-check' : (type === 'error' ? 'fa-triangle-exclamation' : 'fa-circle-info');
    toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${msg}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
        toast.classList.add('fade-out');
        setTimeout(() => toast.remove(), 500);
    }, duration);
};

window.showConfirm = (msg, title = 'Bitte bestätigen') => {
    return new Promise((resolve) => {
        const modal = document.getElementById('confirm-modal');
        const msgEl = document.getElementById('confirm-message');
        const titleEl = document.getElementById('confirm-title');
        const btnOk = document.getElementById('btn-confirm-ok');
        const btnCancel = document.getElementById('btn-confirm-cancel');
        if (!modal || !msgEl) return resolve(false);
        msgEl.textContent = msg;
        if (titleEl) titleEl.textContent = title;
        modal.classList.remove('hidden');
        const cleanup = (val) => { modal.classList.add('hidden'); btnOk.onclick = null; btnCancel.onclick = null; resolve(val); };
        btnOk.onclick = () => cleanup(true);
        btnCancel.onclick = () => cleanup(false);
    });
};

window.checkAllLinks = async () => {
    const links = [];
    state.rows.forEach(r => r.projects.forEach(s => { if (!s.isSpacer) s.projects.forEach(p => p.items.forEach(it => links.push(it))); }));

    if (links.length === 0) return showToast('Keine Links zum Prüfen vorhanden.', 'info');
    if (!await showConfirm(`Möchtest du alle ${links.length} Links auf Erreichbarkeit prüfen?`, 'Link-Check')) return;

    showToast(`Prüfung von ${links.length} Links gestartet...`, 'info', 5000);

    // Create status indicators in DOM
    document.querySelectorAll('.favorite-item').forEach(el => {
        const existing = el.querySelector('.status-dot');
        if (existing) existing.remove();
        const dot = document.createElement('div');
        dot.className = 'status-dot checking';
        el.appendChild(dot);
    });

    let brokenCount = 0;
    for (const item of links) {
        try {
            const resp = await fetch('/api/check-link', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: item.url })
            });
            const data = await resp.json();
            const el = document.querySelector(`.favorite-item[onclick*="${item.id}"]`);
            if (el) {
                const dot = el.querySelector('.status-dot');
                if (dot) {
                    dot.className = `status-dot ${data.ok ? 'ok' : 'broken'}`;
                    if (!data.ok) brokenCount++;
                }
            }
        } catch (e) {
            console.error('Check failed for', item.url, e);
        }
    }

    if (brokenCount > 0) showToast(`${brokenCount} defekte Links gefunden!`, 'error', 10000);
    else showToast('Alle Links sind erreichbar!', 'success');
};

window.updateBookmarklet = () => {
    const link = document.getElementById('bookmarklet-link');
    if (!link) return;
    const base = window.location.origin + window.location.pathname;
    const code = `javascript:(function(){var u=window.location.href;var t=document.title;window.open('${base}?add_url='+encodeURIComponent(u)+'&add_title='+encodeURIComponent(t),'_blank');})();`;
    link.href = code;
};

window.checkAuth = () => {
    const disp = document.getElementById('save-path-display');
    const isReadOnly = disp && disp.textContent.includes('Nur Lesen');
    if (isReadOnly && !ghToken) {
        showToast('Aktion erfordert Token (Nur-Lese-Modus)', 'warning');
        showModal('github-token-modal');
        return false;
    }
    return true;
};

window.toggleActionsDrawer = () => {
    const drawer = document.getElementById('actions-drawer');
    const btn = document.getElementById('toggle-actions-btn');
    if (!drawer || !btn) return;

    drawer.classList.toggle('hidden');
    const isOpen = !drawer.classList.contains('hidden');
    btn.classList.toggle('btn-primary', isOpen);
    btn.classList.toggle('btn-secondary', !isOpen);

    // Remember state
    localStorage.setItem('actions_drawer_open', isOpen);
};

// Auto-open if it was open last time
window.addEventListener('DOMContentLoaded', () => {
    if (localStorage.getItem('actions_drawer_open') === 'true') {
        setTimeout(toggleActionsDrawer, 100);
    }
});

init();
