
const API_URL = '/api/favorites';
const board = document.getElementById("board");

let ghToken = localStorage.getItem('gh_token') || '';
let ghOwner = 'Kinwipecode';
let ghRepo = 'Favoriten';
let ghPath = 'data/favorites.json';
let ghSha = null;

const state = {
    isReadOnly: false,
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
    loadLocalSettings();
    await loadData();
    if (window.renderHeaderButtons) renderHeaderButtons();
    renderBoard();

    // Check for Bookmarklet query params
    const params = new URLSearchParams(window.location.search);
    if (params.has('add_url')) {
        const u = params.get('add_url');
        const t = params.get('add_title') || "";
        window.history.replaceState({}, document.title, window.location.pathname);
        setTimeout(() => addItem(null, u, t), 500);
    }
    updateBookmarklet();
}

async function loadData() {
    const disp = document.getElementById('save-path-display');
    try {
        if (disp) { disp.textContent = '🔍 Prüfe lokalen Server...'; disp.style.color = '#636e72'; }
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000);
        const res = await fetch(API_URL, { signal: controller.signal }).catch(() => null);
        clearTimeout(timeoutId);

        if (res && res.ok) {
            const data = await res.json();
            state.rows = migrate(data);
            state.isReadOnly = false;
            if (window.applyTheme) applyTheme();
            renderBoard();
            if (disp) { disp.innerHTML = '<i class="fa-solid fa-door-open"></i> Vollversion (Lokal)'; }
            return;
        }
    } catch (e) {
        console.warn("Lokal nicht erreichbar.");
    }
    await loadFromGitHub();
}

async function loadFromGitHub() {
    const disp = document.getElementById('save-path-display');
    if (ghToken) {
        try {
            const url = `https://api.github.com/repos/${ghOwner}/${ghRepo}/contents/${ghPath}?t=${Date.now()}`;
            const res = await fetch(url, { headers: { 'Authorization': `token ${ghToken}` } });
            if (res.ok) {
                const data = await res.json();
                ghSha = data.sha;
                const content = JSON.parse(decodeURIComponent(escape(atob(data.content))));
                state.rows = migrate(content);
                state.isReadOnly = false;
                if (window.applyTheme) applyTheme();
                renderBoard();
                if (disp) { disp.innerHTML = '<i class="fa-solid fa-door-open"></i> Vollversion (GitHub)'; }
                return;
            }
        } catch (e) { console.error("GitHub API Fehler:", e); }
    }
    const branches = ['main', 'master'];
    for (const branch of branches) {
        try {
            const publicUrl = `https://raw.githubusercontent.com/${ghOwner}/${ghRepo}/${branch}/${ghPath}?t=${Date.now()}`;
            const res = await fetch(publicUrl);
            if (res.ok) {
                const content = await res.json();
                state.rows = migrate(content);
                state.isReadOnly = true;
                if (window.applyTheme) applyTheme();
                renderBoard();
                if (disp) { disp.innerHTML = '<i class="fa-solid fa-book-open"></i> Leseberechtigt'; }
                return;
            }
        } catch (e) { console.warn(`Versuch über ${branch} fehlgeschlagen.`, e); }
    }
}

async function saveData(isSilent = false) {
    const payload = { rows: state.rows, config: state.config };
    const btn = document.getElementById('btn-save');
    if (btn) btn.disabled = true;

    try {
        const res = await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (res.ok) {
            if (!isSilent) showSavedFeedback();
            if (btn) btn.disabled = false;
            return;
        }
    } catch (e) { console.warn("Local server offline, trying GitHub/Cache..."); }

    if (ghToken) {
        const success = await saveToGitHub();
        if (success) { if (!isSilent) showSavedFeedback(); }
        else if (!isSilent) showToast('GitHub Speicherung fehlgeschlagen.', 'error');
    } else {
        localStorage.setItem('favoriten_backup', JSON.stringify(payload));
    }
    if (btn) btn.disabled = false;
}

async function saveToGitHub() {
    const url = `https://api.github.com/repos/${ghOwner}/${ghRepo}/contents/${ghPath}`;
    const content = btoa(unescape(encodeURIComponent(JSON.stringify({ rows: state.rows, config: state.config }, null, 2))));
    try {
        const res = await fetch(url, { method: 'PUT', headers: { 'Authorization': `token ${ghToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ message: 'Update v4.9', content, sha: ghSha }) });
        if (res.ok) {
            const d = await res.json();
            ghSha = d.content.sha;
            return true;
        }
        return false;
    } catch (e) { console.error(e); return false; }
}

function migrate(data) {
    if (data.config) {
        state.config = { ...state.config, ...data.config };
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

/* --- BOARD RENDERING --- */
function renderBoard() {
    if (!board) return;
    board.innerHTML = "";
    const isRead = state.isReadOnly;
    const isSearching = !!state.searchTerm;
    const term = state.searchTerm.toLowerCase();
    const sortedRows = [...state.rows].sort((a, b) => (a.order || 0) - (b.order || 0));

    sortedRows.forEach(row => {
        const isHiddenGlobally = localSettings.hiddenRowIds && localSettings.hiddenRowIds.includes(row.id);
        let forceShowBySearch = false;

        if (isSearching) {
            row.projects.forEach(slot => {
                if (!slot.isSpacer) slot.projects.forEach(p => {
                    if (p.title.toLowerCase().includes(term)) forceShowBySearch = true;
                    p.items.forEach(it => {
                        if (it.title.toLowerCase().includes(term) || it.url.toLowerCase().includes(term)) {
                            forceShowBySearch = true;
                        }
                    });
                });
            });
        }

        if (isHiddenGlobally && !forceShowBySearch) return;

        const rowEl = document.createElement("div");
        rowEl.className = `board-row ${row.collapsed ? "collapsed" : ""}`;
        if (!isRead) rowEl.oncontextmenu = (e) => showContextMenu(e, 'row', row.id);

        rowEl.innerHTML = `
            <div class="row-header">
                <div class="row-header-main" onclick="if(!event.target.closest('button') && !event.target.closest('input')) toggleRowCollapse('${row.id}')" style="cursor:pointer;">
                    <i class="fa-solid fa-chevron-${row.collapsed ? 'right' : 'down'}" style="font-size:0.8rem; width:20px; opacity:0.5;"></i>
                    ${isRead ?
                `<span class="row-order-display">${row.order || 0}</span>
                         <span class="row-title-display">${row.title}</span>` :
                `<input type="number" class="row-order-input" value="${row.order || 0}" onchange="updateRowOrder('${row.id}', this.value)" title="Sortier-Nummer">
                         <input type="text" class="row-title-input" value="${row.title}" oninput="this.style.width = (this.value.length + 2) + 'ch'" style="width: ${(row.title.length + 2)}ch" onchange="updateRowTitle('${row.id}', this.value)">`
            }
                </div>
                <div class="row-actions">
                    ${!isRead ? `
                    <button class="btn-icon" onclick="collapseRow('${row.id}')" title="Lücken in dieser Zeile schließen"><i class="fa-solid fa-compress"></i></button>
                    <button class="btn-icon delete" onclick="deleteRow('${row.id}')" title="Zeile löschen"><i class="fa-solid fa-trash-can"></i></button>` : ''}
                </div>
            </div>
            <div class="row-projects"></div>
        `;

        const container = rowEl.querySelector(".row-projects");
        row.projects.forEach(slot => {
            const slotEl = document.createElement("div");
            slotEl.className = `slot ${slot.isSpacer ? "spacer" : ""} ${isRead ? "read-only" : ""}`;

            if (!slot.isSpacer) {
                slot.projects.forEach(p => {
                    const col = document.createElement("div");
                    col.className = `column ${p.collapsed ? "collapsed" : ""}`;
                    col.innerHTML = `
                            <div class="column-header" 
                                 onclick="if(!state.moveMode.active && !state.deleteMode.active && !event.target.closest('button') && !event.target.closest('input')) toggleCollapse('${p.id}')"
                                 oncontextmenu="if(!isRead) { showContextMenu(event, 'project', '${p.id}'); return false; }">
                            <div class="header-left">
                                <i class="fa-solid fa-folder${p.collapsed ? '' : '-open'}" style="font-size:0.8rem; margin-right:8px; opacity:0.5;"></i>
                                ${isRead ? `<span style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${p.title}</span>` : `<input type="text" class="group-title-input" value="${p.title}" oninput="this.style.width = (this.value.length + 2) + 'ch'" style="width: ${(p.title.length + 2)}ch" onchange="updateGroupTitle('${p.id}', this.value)">`}
                            </div>
                            ${!isRead ? `<div class="column-actions">
                                ${state.moveMode.active ? `<button class="move-target-btn" onclick="event.stopPropagation(); applyMove('${p.id}')">Hier einfügen</button>` : ''}
                                <button class="btn-text" onclick="event.stopPropagation(); addItem('${p.id}')" title="Favorit hinzufügen"><i class="fa-solid fa-plus" style="font-size:0.7rem;"></i></button>
                                <button class="btn-text" onclick="event.stopPropagation(); deleteProject('${p.id}')" title="Gruppe löschen"><i class="fa-solid fa-trash-can" style="font-size:0.7rem;"></i></button>
                            </div>` : ''}
                        </div>
                        <div class="column-body"></div>
                    `;
                    const body = col.querySelector(".column-body");
                    p.items.forEach(it => {
                        const match = isSearching && (it.title.toLowerCase().includes(term) || it.url.toLowerCase().includes(term));
                        const isMoving = state.moveMode.active;
                        const isDeleting = state.deleteMode.active;
                        const isSelected = (isMoving && state.moveMode.selectedIds.includes(it.id)) || (isDeleting && state.deleteMode.selectedIds.includes(it.id));

                        const itemEl = document.createElement("div");
                        itemEl.className = `favorite-item ${match ? 'search-highlight' : ''} ${isSearching && !match ? 'search-dim' : ''} ${isMoving && isSelected ? 'selected-for-move' : ''} ${isDeleting && isSelected ? 'selected-for-delete' : ''}`;

                        itemEl.innerHTML = `<a href="${it.url}" target="_blank" class="item-link-wrapper" onclick="if(state.moveMode.active || state.deleteMode.active) { event.preventDefault(); toggleSelection('${it.id}'); return false; }"><span>${it.title}</span>${!isRead ? `<div class="item-actions"><button class="btn-text" onclick="event.stopPropagation(); event.preventDefault(); editItem('${it.id}')">✎</button><button class="btn-text" onclick="event.stopPropagation(); event.preventDefault(); deleteItem('${it.id}')">×</button></div>` : ''}</a>`;
                        body.appendChild(itemEl);
                    });
                    slotEl.appendChild(col);
                });
            }
            container.appendChild(slotEl);
        });
        board.appendChild(rowEl);
    });
    document.body.classList.toggle('move-mode-active', state.moveMode.active);
    document.body.classList.toggle('delete-mode-active', state.deleteMode.active);
}

function cleanTitle(str) {
    if (!str) return "";
    let clean = str.trim().replace(/^https?:\/\//i, '').replace(/^www\./i, '');
    const isUrl = /^[a-zA-Z0-9-]+\.[a-zA-Z]{2,}/.test(clean);
    if (isUrl) {
        const splitIndex = clean.search(/\/|\?|#/);
        if (splitIndex !== -1) clean = clean.substring(0, splitIndex);
    }
    const suffixes = [/ - Google Search$/i, / - YouTube$/i, / \| YouTube$/i, / - Wikipedia$/i, /\.(html|php|asp|aspx|jsp)$/i];
    suffixes.forEach(regex => { clean = clean.replace(regex, ''); });
    clean = clean.replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim();
    return clean.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ').substring(0, 80);
}

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

window.updateGroupTitle = (id, val) => { const p = findProject(id); if (p) p.title = val; saveData(); };
window.updateRowTitle = (id, val) => { const r = state.rows.find(x => x.id === id); if (r) r.title = val; saveData(); };
window.updateRowOrder = (id, val) => { const r = state.rows.find(x => x.id === id); if (r) r.order = parseInt(val) || 0; saveData(); };
window.deleteRow = async (id) => { if (await showConfirm('Reihe wirklich löschen?')) { state.rows = state.rows.filter(r => r.id !== id); renderBoard(); saveData(); } };
window.toggleRowCollapse = (id) => { const r = state.rows.find(x => x.id === id); if (r) { r.collapsed = !r.collapsed; renderBoard(); saveData(null, true); } };
window.collapseRow = (id) => { const r = state.rows.find(x => x.id === id); if (r) { r.projects = r.projects.filter(s => !s.isSpacer); renderBoard(); saveData(null, true); } };
window.toggleCollapse = (id) => { const p = findProject(id); if (p) { p.collapsed = !p.collapsed; renderBoard(); saveData(null, true); } };
window.deleteProject = (id) => { findProjectAndClear(id); renderBoard(); saveData(); };

window.addItem = (projectId, preUrl = "", preTitle = "") => {
    if (!checkAuth()) return;
    const nameInp = document.getElementById('edit-link-name');
    const urlInp = document.getElementById('edit-link-url');
    const groupSel = document.getElementById('edit-link-group');
    if (nameInp && urlInp && groupSel) {
        nameInp.value = preTitle || (preUrl ? cleanTitle(preUrl) : "");
        urlInp.value = preUrl || "";
        groupSel.innerHTML = '';
        state.rows.forEach(row => row.projects.forEach(slot => {
            if (!slot.isSpacer) slot.projects.forEach(proj => {
                const opt = document.createElement('option');
                opt.value = proj.id; opt.textContent = `${row.title} > ${proj.title}`;
                if (proj.id === projectId) opt.selected = true;
                groupSel.appendChild(opt);
            });
        }));
        state.activeLinkId = null;
        state.activeProjectId = projectId;
        showModal('edit-link-modal');
        if (preUrl) nameInp.focus(); else urlInp.focus();
    }
};

window.editItem = (id) => {
    if (!checkAuth()) return;
    const item = findItem(id); if (!item) return;
    const nameInp = document.getElementById('edit-link-name'), urlInp = document.getElementById('edit-link-url');
    if (nameInp && urlInp) {
        nameInp.value = item.title; urlInp.value = item.url;
        state.activeLinkId = id; state.activeProjectId = null;
        showModal('edit-link-modal');
    }
};

document.getElementById('btn-save-link')?.addEventListener('click', () => {
    const nt = document.getElementById('edit-link-name').value.trim(), nuRaw = document.getElementById('edit-link-url').value.trim();
    if (!nuRaw) return;
    let nu = (nuRaw.startsWith('http') || nuRaw.startsWith('www')) ? (nuRaw.startsWith('www') ? 'https://' + nuRaw : nuRaw) : 'https://' + nuRaw;
    if (state.activeLinkId) { const item = findItem(state.activeLinkId); if (item) { item.title = nt || cleanTitle(nu); item.url = nu; } }
    else { const gid = document.getElementById('edit-link-group')?.value || state.activeProjectId; if (gid) { const p = findProject(gid); if (p) p.items.push({ id: generateId(), title: nt || cleanTitle(nu), url: nu }); } }
    hideModal('edit-link-modal'); renderBoard(); saveData();
});

let tooltipTimer = null;
function startTooltip(text, e) {
    if (tooltipTimer) clearTimeout(tooltipTimer);
    const x = e.clientX, y = e.clientY;
    tooltipTimer = setTimeout(() => {
        const el = document.getElementById('custom-tooltip');
        if (!el) return;
        el.textContent = text;
        el.classList.remove('hidden'); el.style.left = (x + 15) + 'px'; el.style.top = (y + 15) + 'px';
    }, 500);
}
function hideTooltip() { if (tooltipTimer) clearTimeout(tooltipTimer); document.getElementById('custom-tooltip')?.classList.add('hidden'); }

function showSavedFeedback() {
    const btn = document.getElementById('btn-save'); if (!btn) return;
    const old = btn.innerHTML; btn.innerHTML = '<i class="fa-solid fa-check"></i>';
    setTimeout(() => { btn.innerHTML = old; }, 2000);
}

window.updateBookmarklet = () => {
    const link = document.getElementById('bookmarklet-link'); if (!link) return;
    link.href = `javascript:(function(){var u=window.location.href;var t=document.title;window.open('${window.location.origin}${window.location.pathname}?add_url='+encodeURIComponent(u)+'&add_title='+encodeURIComponent(t),'_blank');})();`;
};

window.checkAuth = () => (state.isReadOnly && !ghToken) ? false : true;

window.handleSearch = (val) => {
    state.searchTerm = val.toLowerCase();
    const clearBtn = document.getElementById('search-clear');
    if (clearBtn) { if (val) clearBtn.classList.remove('hidden'); else clearBtn.classList.add('hidden'); }
    renderBoard();
};

window.clearSearch = () => { const inp = document.getElementById('board-search'); if (inp) { inp.value = ''; handleSearch(''); inp.focus(); } };

window.showToast = (msg, type = 'info') => {
    const container = document.getElementById('toast-container'); if (!container) return;
    const toast = document.createElement('div'); toast.className = `toast toast-${type}`;
    toast.innerHTML = `<span>${msg}</span>`;
    container.appendChild(toast); setTimeout(() => toast.remove(), 3000);
};

window.showConfirm = (msg) => new Promise(res => {
    const modal = document.getElementById('confirm-modal');
    if (!modal) return res(false);
    document.getElementById('confirm-message').textContent = msg;
    modal.classList.remove('hidden');
    document.getElementById('btn-confirm-ok').onclick = () => { modal.classList.add('hidden'); res(true); };
    document.getElementById('btn-confirm-cancel').onclick = () => { modal.classList.add('hidden'); res(false); };
});

const localSettings = { darkMode: 'system', compactMode: false, animations: true, fixedHeader: false, hiddenRowIds: [] };

window.toggleViewDropdown = (e) => {
    if (e) e.stopPropagation();
    const content = document.getElementById('view-dropdown-content');
    if (!content) return;
    const isHidden = content.classList.contains('hidden');
    document.querySelectorAll('.dropdown-content').forEach(d => d.classList.add('hidden'));
    if (isHidden) {
        content.classList.remove('hidden');
        renderRowVisibilityList();
        setTimeout(() => {
            document.addEventListener('click', () => content.classList.add('hidden'), { once: true });
        }, 10);
    }
};

window.renderRowVisibilityList = () => {
    const list = document.getElementById('row-visibility-list'); if (!list) return;
    list.innerHTML = state.rows.map(r => {
        const isHidden = localSettings.hiddenRowIds.includes(r.id);
        return `
        <div class="visibility-item" onclick="event.stopPropagation(); toggleRowVisibility('${r.id}')">
            <input type="checkbox" ${!isHidden ? 'checked' : ''} onclick="event.preventDefault();">
            <span>${r.title || 'Reihe ohne Titel'}</span>
        </div>
    `;
    }).join('') || 'Keine Reihen.';
};

window.toggleRowVisibility = (id) => {
    const idx = localSettings.hiddenRowIds.indexOf(id);
    if (idx === -1) localSettings.hiddenRowIds.push(id); else localSettings.hiddenRowIds.splice(idx, 1);
    localStorage.setItem('favoriten_app_settings', JSON.stringify(localSettings));
    renderRowVisibilityList(); renderBoard();
};

window.loadLocalSettings = () => {
    const saved = localStorage.getItem('favoriten_app_settings');
    if (saved) { try { Object.assign(localSettings, JSON.parse(saved)); applyLocalSettings(); } catch (e) { } }
};

window.updateLocalSettings = () => {
    localSettings.darkMode = document.getElementById('local-dark-mode')?.value || 'system';
    localSettings.compactMode = document.getElementById('local-compact-mode')?.checked || false;
    localSettings.animations = document.getElementById('local-animations')?.checked || true;
    localSettings.fixedHeader = document.getElementById('local-fixed-header')?.checked || false;
    localStorage.setItem('favoriten_app_settings', JSON.stringify(localSettings));
    applyLocalSettings();
};

window.applyLocalSettings = () => {
    const root = document.documentElement;
    if (localSettings.darkMode === 'dark') root.setAttribute('data-theme', 'dark');
    else if (localSettings.darkMode === 'light') root.setAttribute('data-theme', 'light');
    else root.removeAttribute('data-theme');
    document.body.classList.toggle('compact-view', localSettings.compactMode);
    document.body.classList.toggle('no-animations', !localSettings.animations);
    document.body.classList.toggle('fixed-header', localSettings.fixedHeader);
};

window.toggleActionsDrawer = () => {
    const drawer = document.getElementById('actions-drawer');
    const btn = document.getElementById('toggle-actions-btn');
    if (!drawer || !btn) return;
    drawer.classList.toggle('hidden');
    const isOpen = !drawer.classList.contains('hidden');
    btn.classList.toggle('btn-primary', isOpen);
    btn.classList.toggle('btn-secondary', !isOpen);
    localStorage.removeItem('actions_drawer_open');
};

window.toggleMoveMode = () => {
    state.moveMode.active = !state.moveMode.active;
    state.moveMode.selectedIds = [];
    if (state.moveMode.active) state.deleteMode.active = false;
    renderBoard(); updateToolbars();
};

window.toggleDeleteMode = () => {
    state.deleteMode.active = !state.deleteMode.active;
    state.deleteMode.selectedIds = [];
    if (state.deleteMode.active) state.moveMode.active = false;
    renderBoard(); updateToolbars();
};

window.toggleSelection = (id) => {
    const list = state.moveMode.active ? state.moveMode.selectedIds : state.deleteMode.selectedIds;
    const idx = list.indexOf(id);
    if (idx === -1) list.push(id); else list.splice(idx, 1);
    renderBoard(); updateToolbars();
};

function updateToolbars() {
    const mt = document.getElementById('move-toolbar'), dt = document.getElementById('delete-toolbar');
    if (mt) mt.classList.toggle('hidden', !state.moveMode.active);
    if (dt) dt.classList.toggle('hidden', !state.deleteMode.active);
    const mc = document.getElementById('move-count'), dc = document.getElementById('delete-count');
    if (mc) mc.textContent = `${state.moveMode.selectedIds.length} Favoriten ausgewählt`;
    if (dc) dc.textContent = `${state.deleteMode.selectedIds.length} Favoriten zum Löschen`;
}

window.applyDelete = async () => {
    if (state.deleteMode.selectedIds.length === 0) return;
    if (await showConfirm(`${state.deleteMode.selectedIds.length} Favoriten wirklich löschen?`)) {
        state.deleteMode.selectedIds.forEach(id => findItemAndClear(id));
        state.deleteMode.active = false; state.deleteMode.selectedIds = [];
        renderBoard(); updateToolbars(); saveData();
    }
};

window.applyMove = (targetProjectId) => {
    if (state.moveMode.selectedIds.length === 0) return;
    const targetProj = findProject(targetProjectId);
    if (!targetProj) return;
    state.moveMode.selectedIds.forEach(id => {
        const item = findItemAndClear(id);
        if (item) targetProj.items.push(item);
    });
    state.moveMode.active = false; state.moveMode.selectedIds = [];
    renderBoard(); updateToolbars(); saveData();
};

function findItemAndClear(id) {
    for (const r of state.rows) for (const s of r.projects) if (!s.isSpacer) for (const p of s.projects) {
        const idx = p.items.findIndex(it => it.id === id);
        if (idx !== -1) return p.items.splice(idx, 1)[0];
    }
    return null;
}

window.showContextMenu = (e, type, id) => {
    e.preventDefault();
    const menu = document.getElementById('context-menu');
    if (!menu) return;
    menu.style.left = e.clientX + 'px'; menu.style.top = e.clientY + 'px';
    menu.classList.remove('hidden');
    let html = '';
    if (type === 'row') {
        const r = state.rows.find(x => x.id === id);
        html = `
            <div class="context-menu-title">Zeile: ${r ? r.title : 'Unbekannt'}</div>
            <div class="context-menu-item" onclick="addSlotToRow('${id}')"><i class="fa-solid fa-plus"></i> Gruppe hinzufügen</div>
            <div class="context-menu-divider"></div>
            <div class="context-menu-item danger" onclick="deleteRow('${id}')"><i class="fa-solid fa-trash"></i> Zeile löschen</div>
        `;
    } else if (type === 'project') {
        const p = findProject(id);
        html = `
            <div class="context-menu-title">Gruppe: ${p ? p.title : 'Unbekannt'}</div>
            <div class="context-menu-item" onclick="addItem('${id}')"><i class="fa-solid fa-link"></i> Favorit hinzufügen</div>
            <div class="context-menu-item" onclick="pasteFromClipboard('${id}')"><i class="fa-solid fa-paste"></i> Link aus Ablage einfügen</div>
            <div class="context-menu-item" onclick="toggleCollapse('${id}')"><i class="fa-solid fa-compress"></i> Ein-/Ausklappen</div>
            <div class="context-menu-divider"></div>
            <div class="context-menu-item danger" onclick="deleteProject('${id}')"><i class="fa-solid fa-trash"></i> Gruppe löschen</div>
        `;
    }
    menu.innerHTML = html;
    const close = () => { menu.classList.add('hidden'); document.removeEventListener('click', close); };
    setTimeout(() => document.addEventListener('click', close), 10);
};

window.pasteFromClipboard = async (projectId) => {
    try {
        const text = await navigator.clipboard.readText();
        if (text && (text.includes('http') || text.includes('www'))) addItem(projectId, text);
        else showToast('Keine Link-URL in der Ablage gefunden.', 'error');
    } catch (e) { showToast('Zugriff auf Ablage verweigert.', 'error'); }
};

window.addSlotToRow = (rowId) => {
    const r = state.rows.find(x => x.id === rowId);
    if (r) { r.projects.push({ id: generateId(), isSpacer: true, projects: [] }); renderBoard(); saveData(); }
};

init();
