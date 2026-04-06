const API_URL = '/api/favorites';
const board = document.getElementById("board");

let ghToken = localStorage.getItem('gh_token') || '';
let ghOwner = 'Kinwipecode';
let ghRepo = 'Favoriten';
let ghPath = 'data/favorites.json';
let ghSha = null;

function encodeBase64Utf8(text) {
    try {
        const bytes = new TextEncoder().encode(text);
        let binary = '';
        bytes.forEach((b) => { binary += String.fromCharCode(b); });
        return btoa(binary);
    } catch (_) {
        return btoa(unescape(encodeURIComponent(text)));
    }
}

function decodeBase64Utf8(base64Text) {
    try {
        const binary = atob(base64Text);
        const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
        return new TextDecoder().decode(bytes);
    } catch (_) {
        return decodeURIComponent(escape(atob(base64Text)));
    }
}

async function fetchGitHubFileMeta() {
    const url = `https://api.github.com/repos/${ghOwner}/${ghRepo}/contents/${ghPath}?t=${Date.now()}`;
    const res = await fetch(url, { headers: { 'Authorization': `token ${ghToken}` } });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`GitHub metadata request failed (${res.status})`);
    return await res.json();
}

const state = {
    isReadOnly: false,
    rows: [],
    searchTerm: "",
    isDragging: false,
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
    activeEditingGroupId: null,
    lastContextMenuTime: 0,
    searchMatches: [],
    currentSearchIndex: -1
};

const generateId = () => Math.random().toString(36).substr(2, 9);

async function init() {
    if (window.setupUI) setupUI();
    loadLocalSettings();
    await loadData();
    if (window.renderHeaderButtons) renderHeaderButtons();
    renderBoard();

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
            const data = await fetchGitHubFileMeta();
            if (data) {
                ghSha = data.sha;
                const content = JSON.parse(decodeBase64Utf8(data.content));
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
    const content = encodeBase64Utf8(JSON.stringify({ rows: state.rows, config: state.config }, null, 2));

    const putWithSha = async (shaValue) => {
        return await fetch(url, {
            method: 'PUT',
            headers: { 'Authorization': `token ${ghToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: 'Update', content, ...(shaValue ? { sha: shaValue } : {}) })
        });
    };

    try {
        if (!ghSha) {
            const meta = await fetchGitHubFileMeta();
            ghSha = meta ? meta.sha : null;
        }

        let res = await putWithSha(ghSha);

        if (res.status === 409 || res.status === 422) {
            const meta = await fetchGitHubFileMeta();
            ghSha = meta ? meta.sha : null;
            res = await putWithSha(ghSha);
        }

        if (res.ok) {
            const d = await res.json(); ghSha = d.content.sha;
            return true;
        }
        const err = await res.text().catch(() => 'Unknown GitHub error');
        console.error('GitHub save failed:', res.status, err);
        return false;
    } catch (e) { console.error(e); return false; }
}

function migrate(data) {
    if (data.config) state.config = { ...state.config, ...data.config };
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
                    p.items.forEach(it => { if (it.title.toLowerCase().includes(term) || it.url.toLowerCase().includes(term)) forceShowBySearch = true; });
                });
            });
        }
        if (isHiddenGlobally && !forceShowBySearch) return;

        const rowEl = document.createElement("div");
        rowEl.className = `board-row ${row.collapsed ? "collapsed" : ""}`;
        rowEl.dataset.id = row.id;

        const triggerContext = (e) => {
            if (isRead) return; if (e.preventDefault) e.preventDefault();
            if (e.stopPropagation) e.stopPropagation();
            state.lastContextMenuTime = Date.now();
            showContextMenu(e, 'row', row.id);
        };
        rowEl.oncontextmenu = (e) => { triggerContext(e); return false; };

        rowEl.innerHTML = `
            <div class="row-header">
                <div class="row-header-main" onclick="if(!state.isDragging && Date.now() - state.lastContextMenuTime > 500 && !event.target.closest('button')) toggleRowCollapse('${row.id}')" style="cursor:pointer;">
                    ${isRead ? `<span class="row-order-display">${row.order || 0}</span>` : `<input type="number" class="row-order-input" value="${row.order || 0}" onchange="updateRowOrder('${row.id}', this.value)" onclick="event.stopPropagation()" onmousedown="event.stopPropagation()">`}
                    <i class="fa-solid fa-chevron-${row.collapsed ? 'right' : 'down'}" style="width:20px; opacity:0.5;"></i>
                    ${isRead ? `<span>${row.title}</span>` : `<input type="text" class="row-title-input" value="${row.title}" oninput="this.style.width = (this.value.length + 2) + 'ch'" style="width: ${(row.title.length + 2)}ch" onchange="updateRowTitle('${row.id}', this.value)">`}
                </div>
                <div class="row-actions">
                    ${!isRead ? `<button class="btn-icon" onclick="collapseRow('${row.id}')"><i class="fa-solid fa-compress"></i></button><button class="btn-icon delete" onclick="deleteRow('${row.id}')"><i class="fa-solid fa-trash-can"></i></button>` : ''}
                </div>
            </div>
            <div class="row-projects"></div>
        `;

        const container = rowEl.querySelector(".row-projects");
        let slotNo = 0;
        row.projects.forEach(slot => {
            slotNo += 1;
            if (!slot.id) slot.id = generateId();
            const slotEl = document.createElement("div");
            slotEl.className = `slot ${slot.isSpacer ? "spacer" : ""} ${isRead ? "read-only" : ""}`;
            slotEl.dataset.slotId = slot.id;

            const slotBadge = document.createElement("div");
            slotBadge.className = "slot-index";
            slotBadge.textContent = `#${slotNo}`;
            slotEl.appendChild(slotBadge);

            if (!slot.isSpacer) {
                slot.projects.forEach(p => {
                    const isSelected = state.moveMode.selectedIds.includes(p.id) || state.deleteMode.selectedIds.includes(p.id);
                    const col = document.createElement("div");
                    col.className = `column ${p.collapsed ? "collapsed" : ""} ${isSelected ? "selected-for-move" : ""}`;
                    col.dataset.projectId = p.id;

                    const triggerProjContext = (e) => {
                        if (isRead) return; if (e.preventDefault) e.preventDefault();
                        if (e.stopPropagation) e.stopPropagation();
                        state.lastContextMenuTime = Date.now();
                        showContextMenu(e, 'project', p.id);
                    };

                    col.innerHTML = `
                        <div class="column-header" onclick="if(!state.isDragging && Date.now() - state.lastContextMenuTime > 500 && !event.target.closest('button')) { if (state.moveMode.active || state.deleteMode.active) toggleSelection('${p.id}'); else toggleCollapse('${p.id}'); }">
                            <div class="header-left"><i class="fa-solid fa-folder${p.collapsed ? '' : '-open'}"></i> <span>${p.title}</span></div>
                            <div class="column-actions">
                                <button class="btn-text" onclick="event.stopPropagation(); addItem('${p.id}')"><i class="fa-solid fa-plus"></i></button>
                                <button class="btn-text" onclick="event.stopPropagation(); deleteProject('${p.id}')"><i class="fa-solid fa-trash-can"></i></button>
                            </div>
                        </div>
                        <div class="column-body"></div>
                    `;
                    const body = col.querySelector(".column-body");
                    body.oncontextmenu = (e) => { triggerProjContext(e); return false; };

                    p.items.forEach(it => {
                        const match = isSearching && (it.title.toLowerCase().includes(term) || it.url.toLowerCase().includes(term));
                        const itSelected = state.moveMode.selectedIds.includes(it.id) || state.deleteMode.selectedIds.includes(it.id);
                        const itEl = document.createElement("div");
                        itEl.className = `favorite-item ${match ? 'search-highlight' : ''} ${isSearching && !match ? 'search-dim' : ''} ${itSelected ? "selected-for-move" : ""}`;
                        itEl.setAttribute('data-id', it.id);
                        itEl.dataset.id = it.id;
                        itEl.setAttribute('ondragstart', 'return false;');

                        const triggerItemContext = (e) => {
                            if (isRead) return; if (e.preventDefault) e.preventDefault();
                            if (e.stopPropagation) e.stopPropagation();
                            state.lastContextMenuTime = Date.now();
                            showContextMenu(e, 'item', it.id);
                        };
                        itEl.oncontextmenu = (e) => { triggerItemContext(e); return false; };

                        itEl.innerHTML = `<a href="${it.url}" target="_blank" class="item-link-wrapper" draggable="false" ondragstart="return false;" data-id="${it.id}" onclick="if(state.isDragging) { event.preventDefault(); return false; } if(Date.now() - state.lastContextMenuTime < 300) { event.preventDefault(); return false; } if(state.moveMode.active || state.deleteMode.active) { event.preventDefault(); toggleSelection('${it.id}'); return false; }"><span>${it.title}</span>
                        ${!isRead ? `<div class="item-actions"><button class="btn-text" onclick="event.stopPropagation(); event.preventDefault(); editItem('${it.id}')">✎</button><button class="btn-text" onclick="event.stopPropagation(); event.preventDefault(); deleteItem('${it.id}')">×</button></div>` : ''}
                        </a>`;
                        body.appendChild(itEl);
                    });
                    slotEl.appendChild(col);

                    const h = col.querySelector('.column-header');
                    if (h && !isRead) { h.oncontextmenu = (e) => { triggerProjContext(e); return false; }; }
                });
            } else if (!isRead) {
                const actions = document.createElement('div');
                actions.className = 'spacer-actions';
                actions.style.opacity = '0.2';
                actions.innerHTML = `<button class="btn-create-group" onclick="addItemToSpacer('${slot.id}')">+</button><button class="btn-delete-slot" onclick="deleteSlot('${slot.id}')">×</button>`;
                slotEl.appendChild(actions);
                slotEl.onmouseenter = () => { actions.style.opacity = '1'; };
                slotEl.onmouseleave = () => { actions.style.opacity = '0.2'; };
            }
            container.appendChild(slotEl);
        });
        board.appendChild(rowEl);
    });

    if (typeof Sortable !== 'undefined' && !isRead) {
        new Sortable(board, {
            animation: 150, handle: '.row-header', forceFallback: true, fallbackOnBody: true,
            onStart: () => state.isDragging = true,
            onEnd: (e) => {
                const sortedRows = [...state.rows].sort((a, b) => (a.order || 0) - (b.order || 0));
                const [movedRow] = sortedRows.splice(e.oldIndex, 1);
                sortedRows.splice(e.newIndex, 0, movedRow);
                sortedRows.forEach((r, i) => r.order = (i + 1) * 10);
                state.rows = sortedRows; saveData();
                setTimeout(() => { state.isDragging = false; renderBoard(); }, 10);
            }
        });

        document.querySelectorAll('.slot').forEach(el => {
            new Sortable(el, {
                group: 'columns', animation: 150, handle: '.column-header', filter: 'button, input',
                forceFallback: true, fallbackOnBody: true, fallbackClass: "sortable-fallback",
                onStart: () => state.isDragging = true,
                onEnd: (e) => {
                    const fromR = state.rows.find(r => r.id === e.from.closest('.board-row').dataset.id);
                    const toR = state.rows.find(r => r.id === e.to.closest('.board-row').dataset.id);
                    if (fromR && toR) {
                        const fromSlot = fromR.projects.find(s => s.id === e.from.dataset.slotId);
                        const toSlot = toR.projects.find(s => s.id === e.to.dataset.slotId);
                        const projId = e.item.dataset.projectId;
                        const proj = findProjectAndClear(projId);
                        if (proj && toSlot) { toSlot.isSpacer = false; toSlot.projects.splice(e.newIndex, 0, proj); }
                        saveData(); setTimeout(() => { state.isDragging = false; renderBoard(); }, 10);
                    }
                }
            });
        });

        document.querySelectorAll('.column-body').forEach(el => {
            new Sortable(el, {
                group: 'items', animation: 150, filter: '.item-actions',
                forceFallback: true, fallbackClass: "sortable-fallback", fallbackOnBody: true, fallbackTolerance: 3,
                onStart: () => { state.isDragging = true; document.body.classList.add('is-dragging-item'); },
                onEnd: (e) => {
                    document.body.classList.remove('is-dragging-item');
                    const tCol = e.to.closest('.column');
                    if (!tCol) { state.isDragging = false; renderBoard(); return; }
                    const tId = tCol.getAttribute('data-project-id') || tCol.dataset.projectId;
                    const itId = e.item.getAttribute('data-id') || e.item.dataset.id;

                    if (state.moveMode.active) {
                        const result = moveSelectedItemsToProject(tId, e.newIndex, itId);
                        if (result.moved > 0) {
                            state.moveMode.active = false;
                            state.activeProjectId = null;
                            saveData();
                        }
                        setTimeout(() => {
                            state.isDragging = false;
                            renderBoard();
                        }, 80);
                        return;
                    }

                    const item = findItemAndClear(itId);
                    const tP = findProject(tId);
                    if (item && tP) {
                        if (!tP.items) tP.items = [];
                        tP.items.splice(e.newIndex, 0, item);
                    }
                    saveData();
                    setTimeout(() => {
                        state.isDragging = false;
                        renderBoard();
                    }, 80);
                }
            });
        });
    }
    updateToolbars();
    updateSearchControls();
}

function cleanTitle(str) {
    if (!str) return "";
    let clean = str.trim().replace(/^https?:\/\//i, '').replace(/^www\./i, '');
    const isUrl = /^[a-zA-Z0-9-]+\.[a-zA-Z]{2,}/.test(clean);
    if (isUrl) {
        const splitIndex = clean.search(/\/|\?|#/);
        if (splitIndex !== -1) clean = clean.substring(0, splitIndex);

        const parts = clean.split('.').filter(Boolean);
        if (parts.length >= 2) {
            const last = parts[parts.length - 1].toLowerCase();
            if (/^[a-z]{2,}$/.test(last)) {
                parts.pop();
                const secondLast = parts[parts.length - 1] ? parts[parts.length - 1].toLowerCase() : '';
                if (['co', 'com', 'org', 'net', 'gov', 'edu'].includes(secondLast) && parts.length > 1) {
                    parts.pop();
                }
            }
            clean = parts.join('.');
        }
    }
    return clean.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ').substring(0, 80);
}

function extractUrlFromText(text) {
    if (!text) return '';
    const raw = String(text).trim();
    if (!raw) return '';

    const direct = raw.match(/https?:\/\/[^\s"'<>]+/i);
    if (direct) return direct[0];

    const token = raw.split(/\s+/).find(t => /^(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)+(\/[^\s"'<>]*)?$/i.test(t));
    return token || '';
}

function findProjectAndClear(id) {
    for (const r of state.rows) {
        const sIdx = r.projects.findIndex(s => s.isSpacer ? s.id === id : s.projects.some(p => p.id === id));
        if (sIdx !== -1) {
            const s = r.projects[sIdx];
            if (s.isSpacer) return r.projects.splice(sIdx, 1)[0];
            const pIdx = s.projects.findIndex(p => p.id === id);
            const p = s.projects.splice(pIdx, 1)[0];
            if (s.projects.length === 0) s.isSpacer = true;
            return p;
        }
    }
}

function findItemAndClear(id) {
    if (!id) return null;
    for (const r of state.rows) {
        if (!r.projects) continue;
        for (const s of r.projects) {
            if (!s.isSpacer && s.projects) {
                for (const p of s.projects) {
                    if (!p.items) continue;
                    const idx = p.items.findIndex(it => it.id === id);
                    if (idx !== -1) return p.items.splice(idx, 1)[0];
                }
            }
        }
    }
    return null;
}

function findProject(id) {
    if (!id) return null;
    for (const r of state.rows) {
        if (!r.projects) continue;
        for (const s of r.projects) {
            if (!s.isSpacer && s.projects) {
                const p = s.projects.find(x => x.id === id);
                if (p) return p;
            }
        }
    }
    return null;
}
function findItem(id) { for (const r of state.rows) for (const s of r.projects) if (!s.isSpacer) for (const p of s.projects) { const item = p.items.find(x => x.id === id); if (item) return item; } }

function findProjectLocation(projectId) {
    for (const r of state.rows) {
        for (const s of (r.projects || [])) {
            if (s.isSpacer || !s.projects) continue;
            if (s.projects.some(p => p.id === projectId)) {
                return { row: r, slot: s };
            }
        }
    }
    return null;
}

function findProjectByItemId(itemId) {
    if (!itemId) return null;
    for (const r of state.rows) {
        for (const s of (r.projects || [])) {
            if (s.isSpacer || !s.projects) continue;
            for (const p of s.projects) {
                if ((p.items || []).some(it => it.id === itemId)) {
                    return p;
                }
            }
        }
    }
    return null;
}

function getProjectOptions() {
    const rowsSorted = [...state.rows].sort((a, b) => (a.order || 0) - (b.order || 0));
    const options = [];
    rowsSorted.forEach(r => {
        (r.projects || []).forEach(s => {
            if (s.isSpacer || !s.projects) return;
            s.projects.forEach(p => options.push({ rowTitle: r.title, projectId: p.id, projectTitle: p.title }));
        });
    });
    return options;
}

function getOrderedItemIds() {
    const ids = [];
    state.rows.forEach(r => {
        r.projects.forEach(s => {
            if (s.isSpacer || !s.projects) return;
            s.projects.forEach(p => {
                (p.items || []).forEach(it => ids.push(it.id));
            });
        });
    });
    return ids;
}

function moveSelectedItemsToProject(targetProjectId, insertIndex = null, fallbackDraggedId = null) {
    const targetProject = findProject(targetProjectId);
    if (!targetProject) return { moved: 0, ignored: 0 };

    let selectedIds = [...state.moveMode.selectedIds];
    if (fallbackDraggedId) {
        if (selectedIds.length === 0 || !selectedIds.includes(fallbackDraggedId)) {
            selectedIds = [fallbackDraggedId];
        }
    }

    const selectedSet = new Set(selectedIds);
    const orderedAllItemIds = getOrderedItemIds();
    const orderedItemIds = orderedAllItemIds.filter(id => selectedSet.has(id));
    const ignored = selectedIds.length - orderedItemIds.length;

    if (orderedItemIds.length === 0) return { moved: 0, ignored };

    const targetIdsBefore = (targetProject.items || []).map(it => it.id);
    const safeIndex = Number.isInteger(insertIndex) ? Math.max(0, insertIndex) : (targetProject.items || []).length;
    const removedBeforeIndex = orderedItemIds.reduce((acc, id) => {
        const idx = targetIdsBefore.indexOf(id);
        return acc + ((idx !== -1 && idx < safeIndex) ? 1 : 0);
    }, 0);
    const finalInsertIndex = Math.max(0, safeIndex - removedBeforeIndex);

    const movedItems = [];
    orderedItemIds.forEach(id => {
        const item = findItemAndClear(id);
        if (item) movedItems.push(item);
    });

    if (!targetProject.items) targetProject.items = [];
    targetProject.items.splice(finalInsertIndex, 0, ...movedItems);
    state.moveMode.selectedIds = [];

    return { moved: movedItems.length, ignored };
}

window.updateGroupTitle = (id, val) => { const p = findProject(id); if (p) p.title = val; saveData(); };
window.updateRowTitle = (id, val) => { const r = state.rows.find(x => x.id === id); if (r) r.title = val; saveData(); };
window.updateRowOrder = (id, val) => { const r = state.rows.find(x => x.id === id); if (r) r.order = parseInt(val) || 0; saveData(); };
window.sortRows = () => {
    state.rows.sort((a, b) => (a.order || 0) - (b.order || 0));
    renderBoard();
    saveData();
};

window.deleteRow = async (id) => { if (await showConfirm('Reihe löschen?')) { state.rows = state.rows.filter(r => r.id !== id); renderBoard(); saveData(); } };
window.deleteProject = async (id) => { if (await showConfirm('Ordner löschen?')) { findProjectAndClear(id); renderBoard(); saveData(); } };
window.deleteItem = async (id) => { if (await showConfirm('Favorit löschen?')) { findItemAndClear(id); renderBoard(); saveData(); } };
window.deleteSlot = (id) => { state.rows.forEach(r => { r.projects = r.projects.filter(s => s.id !== id); }); renderBoard(); saveData(); };

window.toggleRowCollapse = (id) => { const r = state.rows.find(x => x.id === id); if (r) { r.collapsed = !r.collapsed; renderBoard(); saveData(); } };
window.collapseRow = (id) => { const r = state.rows.find(x => x.id === id); if (r) { r.projects = r.projects.filter(s => !s.isSpacer); renderBoard(); saveData(); } };
window.toggleCollapse = (id) => { const p = findProject(id); if (p) { p.collapsed = !p.collapsed; renderBoard(); saveData(); } };

window.addItem = async (projectId, preUrl = "", preTitle = "") => {
    if (!checkAuth()) return;
    const nt = preTitle || await showInputDialog({ title: 'Favorit hinzufuegen', label: 'Titel', value: preUrl ? cleanTitle(preUrl) : '', placeholder: 'Titel eingeben', confirmText: 'Weiter' });
    if (nt === null) return;
    const nu = preUrl || await showInputDialog({ title: 'Favorit hinzufuegen', label: 'URL', value: '', placeholder: 'https://beispiel.de', confirmText: 'Speichern' });
    if (!nu) return;
    const p = findProject(projectId); if (p) p.items.push({ id: generateId(), title: nt, url: nu });
    renderBoard(); saveData();
}

window.addItemFromClipboard = async (projectId) => {
    if (!checkAuth()) return;
    const p = findProject(projectId);
    if (!p) return;

    let clip = '';
    try {
        if (navigator.clipboard && navigator.clipboard.readText) {
            clip = await navigator.clipboard.readText();
        }
    } catch (_) { }

    let url = extractUrlFromText(clip);
    if (!url) {
        url = await showInputDialog({
            title: 'Favorit aus Zwischenablage',
            label: 'URL',
            value: clip || '',
            placeholder: 'https://beispiel.de',
            confirmText: 'Weiter'
        });
        if (!url) return;
    }

    url = String(url).trim();
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;

    const suggestedTitle = cleanTitle(url);
    const title = await showInputDialog({
        title: 'Favorit aus Zwischenablage',
        label: 'Titel',
        value: suggestedTitle,
        placeholder: 'Titel eingeben',
        confirmText: 'Speichern'
    });
    if (title === null) return;

    p.items.push({
        id: generateId(),
        title: (title || '').trim() || suggestedTitle,
        url
    });

    renderBoard();
    saveData();
    showToast('Favorit aus Zwischenablage hinzugefuegt.', 'success');
}

window.editItem = async (id) => {
    const item = findItem(id);
    if (!item) return;

    const result = await showEditLinkDialog({
        modalTitle: 'Link bearbeiten',
        title: item.title,
        url: item.url,
        confirmText: 'Speichern'
    });
    if (!result) return;

    item.title = result.title;
    item.url = result.url;
    renderBoard();
    saveData();
}

window.moveItemViaMenu = async (itemId) => {
    const item = findItem(itemId);
    if (!item) {
        showToast('Favorit nicht gefunden.', 'error');
        return;
    }

    const currentProject = findProjectByItemId(itemId);
    let options = getProjectOptions();
    if (currentProject) options = options.filter(o => o.projectId !== currentProject.id);

    if (options.length === 0) {
        showToast('Keine Zielgruppe verfuegbar.', 'error');
        return;
    }

    const selection = await showSelectDialog({
        title: 'Favorit verschieben',
        label: 'In welche Gruppe verschieben?',
        options: options.map(o => ({ value: o.projectId, label: `${o.rowTitle} / ${o.projectTitle}` })),
        confirmText: 'Verschieben'
    });
    if (!selection) return;

    const target = findProject(selection);
    if (!target) {
        showToast('Zielgruppe nicht gefunden.', 'error');
        return;
    }

    const moved = findItemAndClear(itemId);
    if (!moved) {
        showToast('Favorit konnte nicht verschoben werden.', 'error');
        return;
    }

    if (!target.items) target.items = [];
    target.items.push(moved);
    renderBoard();
    saveData();
    showToast(`Verschoben nach: ${target.title}`, 'success');
}

window.moveProjectViaMenu = async (projectId) => {
    const project = findProject(projectId);
    if (!project) {
        showToast('Gruppe nicht gefunden.', 'error');
        return;
    }

    const source = findProjectLocation(projectId);
    const rowsSorted = [...state.rows].sort((a, b) => (a.order || 0) - (b.order || 0));
    const options = [];

    rowsSorted.forEach(r => {
        let spacerNo = 0;
        (r.projects || []).forEach(s => {
            if (!s.isSpacer) return;
            spacerNo += 1;
            if (source && source.slot && source.slot.id === s.id) return;
            options.push({ value: s.id, label: `${r.title} / Luecke ${spacerNo}` });
        });
    });

    if (options.length === 0) {
        showToast('Keine Ziel-Luecke verfuegbar.', 'error');
        return;
    }

    const targetSlotId = await showSelectDialog({
        title: 'Gruppe verschieben',
        label: 'Ziel (Zeile / Luecken-Nummer) waehlen',
        options,
        confirmText: 'Verschieben'
    });
    if (!targetSlotId) return;

    let targetSlot = null;
    for (const r of state.rows) {
        targetSlot = (r.projects || []).find(s => s.id === targetSlotId);
        if (targetSlot) break;
    }
    if (!targetSlot || !targetSlot.isSpacer) {
        showToast('Ziel-Luecke nicht gefunden.', 'error');
        return;
    }

    const movedProject = findProjectAndClear(projectId);
    if (!movedProject) {
        showToast('Gruppe konnte nicht verschoben werden.', 'error');
        return;
    }

    targetSlot.isSpacer = false;
    targetSlot.projects = [movedProject];
    renderBoard();
    saveData();
    showToast(`Gruppe verschoben: ${movedProject.title}`, 'success');
}

window.importFromHTML = (html, targetRowId, newRowName) => {
    const parser = new DOMParser(); const doc = parser.parseFromString(html, 'text/html'); const dl = doc.querySelector('dl');
    if (!dl) { showToast('Keine Lesezeichen.', 'error'); return; }
    let target = (targetRowId === 'new') ? { id: generateId(), title: newRowName || 'Import', projects: [], order: 999 } : state.rows.find(r => r.id === targetRowId);
    if (!target) return; if (targetRowId === 'new') state.rows.push(target);
    const process = (l, folder) => {
        const links = Array.from(l.children).filter(dt => dt.tagName === 'DT').map(dt => dt.querySelector(':scope > a')).filter(a => a);
        if (links.length > 0) {
            let p = { id: generateId(), title: folder || 'Import', items: [], collapsed: true };
            target.projects.push({ id: generateId(), isSpacer: false, projects: [p] });
            links.forEach(a => p.items.push({ id: generateId(), title: a.textContent.trim(), url: a.href }));
        }
        Array.from(l.children).forEach(dt => { const h3 = dt.querySelector(':scope > h3'), sDl = dt.querySelector(':scope > dl'); if (h3 && sDl) process(sDl, h3.textContent); });
    };
    process(dl, null); renderBoard(); saveData(); showToast('Import fertig!');
};

function updateToolbars() {
    const mt = document.getElementById('move-toolbar'), dt = document.getElementById('delete-toolbar');
    if (mt) mt.classList.toggle('hidden', !state.moveMode.active);
    if (dt) dt.classList.toggle('hidden', !state.deleteMode.active);

    const moveCount = document.getElementById('move-count');
    const delCount = document.getElementById('delete-count');
    const btnConfirmMove = document.getElementById('btn-confirm-move');

    if (moveCount) moveCount.textContent = `${state.moveMode.selectedIds.length} Elemente ausgewaehlt`;
    if (delCount) delCount.textContent = `${state.deleteMode.selectedIds.length} Elemente zum Loeschen ausgewaehlt`;
    if (btnConfirmMove) {
        const hasSelection = state.moveMode.selectedIds.length > 0;
        const hasTarget = !!state.activeProjectId;
        btnConfirmMove.disabled = !(hasSelection && hasTarget);
        btnConfirmMove.title = hasTarget ? 'Auswahl in die Zielgruppe verschieben' : 'Per Rechtsklick auf eine Gruppe zuerst Ziel setzen';
    }
}

window.toggleMoveMode = () => {
    state.moveMode.active = !state.moveMode.active;
    state.moveMode.selectedIds = [];
    state.activeProjectId = null;
    state.deleteMode.active = false;
    renderBoard();
};
window.toggleDeleteMode = () => {
    state.deleteMode.active = !state.deleteMode.active;
    state.deleteMode.selectedIds = [];
    state.moveMode.active = false;
    state.activeProjectId = null;
    renderBoard();
};
window.toggleSelection = (id) => { const l = state.moveMode.active ? state.moveMode.selectedIds : state.deleteMode.selectedIds; const i = l.indexOf(id); if (i === -1) l.push(id); else l.splice(i, 1); renderBoard(); };

window.setMoveTarget = (projectId) => {
    const p = findProject(projectId);
    if (!p) return;
    state.activeProjectId = projectId;
    updateToolbars();
    showToast(`Ziel gesetzt: ${p.title}`, 'info');
};

window.applyMove = () => {
    if (!state.moveMode.active) return;
    if (!state.activeProjectId) {
        showToast('Bitte zuerst ein Ziel per Rechtsklick auf eine Gruppe waehlen.', 'error');
        return;
    }

    const result = moveSelectedItemsToProject(state.activeProjectId);
    if (result.moved === 0) {
        showToast('Keine verschiebbaren Favoriten ausgewaehlt.', 'error');
        return;
    }

    state.moveMode.active = false;
    state.activeProjectId = null;
    renderBoard();
    saveData();

    if (result.ignored > 0) showToast(`${result.moved} Favoriten verschoben (${result.ignored} nicht kompatible Elemente ignoriert).`, 'info');
    else showToast(`${result.moved} Favoriten verschoben.`, 'success');
};

window.applyDelete = async () => { if (state.deleteMode.selectedIds.length > 0 && await showConfirm('Löschen?')) { state.deleteMode.selectedIds.forEach(id => { if (!findItemAndClear(id)) findProjectAndClear(id); }); state.deleteMode.active = false; state.deleteMode.selectedIds = []; renderBoard(); saveData(); } };

window.showToast = (msg, type = 'info') => {
    const c = document.getElementById('toast-container'); rotateDot(); if (!c) return;
    const t = document.createElement('div'); t.className = `toast toast-${type}`; t.innerHTML = `<span>${msg}</span>`;
    c.appendChild(t); setTimeout(() => t.remove(), 3000);
};
function rotateDot() { }

window.showConfirm = (msg) => new Promise(res => {
    const m = document.getElementById('confirm-modal'); if (!m) return res(confirm(msg));
    document.getElementById('confirm-message').textContent = msg; m.classList.remove('hidden');
    document.getElementById('btn-confirm-ok').onclick = () => { m.classList.add('hidden'); res(true); };
    document.getElementById('btn-confirm-cancel').onclick = () => { m.classList.add('hidden'); res(false); };
});

window.showEditLinkDialog = ({ modalTitle = 'Link bearbeiten', title = '', url = '', confirmText = 'Speichern' } = {}) => new Promise(res => {
    const m = document.getElementById('edit-link-modal');
    if (!m) return res(null);

    const modalTitleEl = document.getElementById('edit-link-title');
    const titleInput = document.getElementById('edit-link-name');
    const urlInput = document.getElementById('edit-link-url');
    const targetGroupWrap = document.getElementById('target-group-wrapper');
    const saveBtn = document.getElementById('btn-save-link');
    const cancelBtn = m.querySelector('.modal-actions .btn.btn-secondary');
    const closeBtn = m.querySelector('.modal-header .btn-text');

    if (!titleInput || !urlInput || !saveBtn) return res(null);

    if (modalTitleEl) modalTitleEl.innerHTML = `<i class="fa-solid fa-pen-to-square"></i> ${modalTitle}`;
    titleInput.value = title || '';
    urlInput.value = url || '';
    if (targetGroupWrap) targetGroupWrap.style.display = 'none';
    saveBtn.textContent = confirmText;

    const cleanup = () => {
        saveBtn.onclick = null;
        if (cancelBtn) cancelBtn.onclick = null;
        if (closeBtn) closeBtn.onclick = null;
        titleInput.onkeydown = null;
        urlInput.onkeydown = null;
        m.classList.add('hidden');
    };

    const close = (value) => {
        cleanup();
        res(value);
    };

    const submit = () => {
        const nextTitle = (titleInput.value || '').trim();
        const nextUrl = (urlInput.value || '').trim();
        if (!nextUrl) {
            showToast('URL darf nicht leer sein.', 'error');
            urlInput.focus();
            return;
        }
        close({ title: nextTitle || cleanTitle(nextUrl), url: nextUrl });
    };

    saveBtn.onclick = submit;
    if (cancelBtn) cancelBtn.onclick = () => close(null);
    if (closeBtn) closeBtn.onclick = () => close(null);
    titleInput.onkeydown = (e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') close(null); };
    urlInput.onkeydown = (e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') close(null); };

    m.classList.remove('hidden');
    setTimeout(() => titleInput.focus(), 10);
});

window.showInputDialog = ({ title = 'Eingabe', label = 'Wert', value = '', placeholder = '', confirmText = 'OK' } = {}) => new Promise(res => {
    const m = document.getElementById('input-modal');
    if (!m) return res(prompt(`${label}:`, value));

    const t = document.getElementById('input-modal-title');
    const l = document.getElementById('input-modal-label');
    const i = document.getElementById('input-modal-field');
    const ok = document.getElementById('btn-input-ok');
    const cancel = document.getElementById('btn-input-cancel');
    const closeBtn = document.getElementById('btn-input-close');

    if (t) t.textContent = title;
    if (l) l.textContent = label;
    if (i) {
        i.value = value || '';
        i.placeholder = placeholder || '';
    }
    if (ok) ok.textContent = confirmText;

    const close = (val) => {
        m.classList.add('hidden');
        if (ok) ok.onclick = null;
        if (cancel) cancel.onclick = null;
        if (closeBtn) closeBtn.onclick = null;
        if (i) i.onkeydown = null;
        res(val);
    };

    if (ok) ok.onclick = () => close(i ? i.value : '');
    if (cancel) cancel.onclick = () => close(null);
    if (closeBtn) closeBtn.onclick = () => close(null);
    if (i) i.onkeydown = (e) => { if (e.key === 'Enter') close(i.value); if (e.key === 'Escape') close(null); };

    m.classList.remove('hidden');
    if (i) setTimeout(() => i.focus(), 10);
});

window.showSelectDialog = ({ title = 'Auswahl', label = 'Bitte waehlen', options = [], confirmText = 'OK' } = {}) => new Promise(res => {
    const m = document.getElementById('select-modal');
    if (!m) {
        const txt = options.map((o, i) => `${i + 1}: ${o.label}`).join('\n');
        const input = prompt(`${label}\n\n${txt}`, '1');
        if (input === null) return res(null);
        const idx = parseInt(input, 10) - 1;
        return res((idx >= 0 && idx < options.length) ? options[idx].value : null);
    }

    const t = document.getElementById('select-modal-title');
    const l = document.getElementById('select-modal-label');
    const s = document.getElementById('select-modal-list');
    const f = document.getElementById('select-modal-filter');
    const ok = document.getElementById('btn-select-ok');
    const cancel = document.getElementById('btn-select-cancel');
    const closeBtn = document.getElementById('btn-select-close');

    if (t) t.textContent = title;
    if (l) l.textContent = label;
    if (ok) ok.textContent = confirmText;

    let filtered = [...options];
    const renderOptions = () => {
        if (!s) return;
        s.innerHTML = filtered.map(o => `<option value="${o.value}">${o.label}</option>`).join('');
        if (s.options.length > 0) s.selectedIndex = 0;
    };

    const close = (val) => {
        m.classList.add('hidden');
        if (ok) ok.onclick = null;
        if (cancel) cancel.onclick = null;
        if (closeBtn) closeBtn.onclick = null;
        if (f) f.oninput = null;
        if (s) s.ondblclick = null;
        if (s) s.onkeydown = null;
        res(val);
    };

    if (f) {
        f.value = '';
        f.oninput = () => {
            const q = f.value.toLowerCase().trim();
            filtered = q ? options.filter(o => o.label.toLowerCase().includes(q)) : [...options];
            renderOptions();
        };
    }

    renderOptions();

    if (ok) ok.onclick = () => close((s && s.value) ? s.value : null);
    if (cancel) cancel.onclick = () => close(null);
    if (closeBtn) closeBtn.onclick = () => close(null);
    if (s) s.ondblclick = () => close(s.value || null);
    if (s) s.onkeydown = (e) => { if (e.key === 'Enter') close(s.value || null); if (e.key === 'Escape') close(null); };

    m.classList.remove('hidden');
    if (f) setTimeout(() => f.focus(), 10);
});

window.showContextMenu = (e, type, id) => {
    e.preventDefault(); const menu = document.getElementById('context-menu'); if (!menu) return;
    menu.classList.remove('hidden'); let html = '';
    if (type === 'row') {
        const r = state.rows.find(x => x.id === id);
        html = `<div class="context-menu-title">Zeile: ${r ? r.title : ''}</div>
        <div class="context-menu-item" onclick="addSlotToRow('${id}')">Gruppe hinzufuegen</div>
        <div class="context-menu-item" onclick="addRowSpacer('${id}')">Luecke hinzufuegen</div>
        <div class="context-menu-divider"></div>
        <div class="context-menu-item danger" onclick="deleteRow('${id}')">Zeile loeschen</div>`;
    }
    else if (type === 'project') {
        const p = findProject(id);
        const moveEntry = state.moveMode.active ? `<div class="context-menu-item" onclick="setMoveTarget('${id}')">Als Verschiebe-Ziel setzen</div>` : '';
        const selectMove = state.moveMode.active ? `<div class="context-menu-item" onclick="toggleSelection('${id}')">Auswahl ein/aus</div>` : '';
        const selectDelete = state.deleteMode.active ? `<div class="context-menu-item" onclick="toggleSelection('${id}')">Zum Loeschen markieren</div>` : '';
        html = `<div class="context-menu-title">Gruppe: ${p ? p.title : ''}</div>
        <div class="context-menu-item" onclick="addItem('${id}')">Favorit hinzufuegen</div>
        <div class="context-menu-item" onclick="addItemFromClipboard('${id}')">Favorit aus Arbeitspeicher</div>
        <div class="context-menu-item" onclick="moveProjectViaMenu('${id}')">Gruppe verschieben...</div>
        ${moveEntry}
        ${selectMove}
        ${selectDelete}
        <div class="context-menu-divider"></div>
        <div class="context-menu-item danger" onclick="deleteProject('${id}')">Gruppe loeschen</div>`;
    }
    else if (type === 'item') {
        const item = findItem(id);
        const selectMove = state.moveMode.active ? `<div class="context-menu-item" onclick="toggleSelection('${id}')">Auswahl ein/aus</div>` : '';
        const selectDelete = state.deleteMode.active ? `<div class="context-menu-item" onclick="toggleSelection('${id}')">Zum Loeschen markieren</div>` : '';
        html = `<div class="context-menu-title">Favorit: ${item ? item.title : ''}</div>
        <div class="context-menu-item" onclick="editItem('${id}')">Bearbeiten</div>
        <div class="context-menu-item" onclick="moveItemViaMenu('${id}')">Verschieben in Gruppe...</div>
        ${selectMove}
        ${selectDelete}
        <div class="context-menu-divider"></div>
        <div class="context-menu-item danger" onclick="deleteItem('${id}')">Loeschen</div>`;
    }
    menu.innerHTML = html;
    menu.onclick = (evt) => {
        if (evt.target.closest('.context-menu-item')) {
            menu.classList.add('hidden');
            document.removeEventListener('mousedown', close);
        }
    };
    let x = e.clientX, y = e.clientY; const rect = menu.getBoundingClientRect();
    if (x + rect.width > window.innerWidth) x = window.innerWidth - rect.width - 10;
    if (y + rect.height > window.innerHeight) y = window.innerHeight - rect.height - 10;
    menu.style.left = Math.max(10, x) + 'px'; menu.style.top = Math.max(10, y) + 'px';
    const close = (evt) => { if (!menu.contains(evt.target)) { menu.classList.add('hidden'); document.removeEventListener('mousedown', close); } };
    setTimeout(() => document.addEventListener('mousedown', close), 10);
};

window.addSlotToRow = (rowId) => { const r = state.rows.find(x => x.id === rowId); if (r) { const slotId = generateId(); r.projects.push({ id: slotId, isSpacer: true, projects: [] }); renderBoard(); addItemToSpacer(slotId); saveData(); } };
window.addRowSpacer = (rowId) => {
    const r = state.rows.find(x => x.id === rowId);
    if (!r) return;
    r.projects.push({ id: generateId(), isSpacer: true, projects: [] });
    renderBoard();
    saveData();
};
window.addItemToSpacer = async (slotId) => {
    const t = await showInputDialog({ title: 'Gruppe erstellen', label: 'Name', value: '', placeholder: 'Gruppenname', confirmText: 'Erstellen' });
    if (!t) return;
    for (const r of state.rows) {
        const s = r.projects.find(x => x.id === slotId);
        if (s) {
            s.isSpacer = false;
            s.projects = [{ id: generateId(), title: t, items: [], collapsed: false }];
            break;
        }
    }
    renderBoard();
    saveData();
};

window.handleSearch = (val) => { state.searchTerm = val; renderBoard(); };
window.clearSearch = () => { const i = document.getElementById('board-search'); if (i) { i.value = ''; handleSearch(''); } };
window.nextSearchMatch = (direction = 1) => {
    if (!state.searchMatches.length) return;
    const len = state.searchMatches.length;
    state.currentSearchIndex = (state.currentSearchIndex + direction + len) % len;
    const active = state.searchMatches[state.currentSearchIndex];
    state.searchMatches.forEach(el => el.classList.remove('search-active'));
    active.classList.add('search-active');
    active.scrollIntoView({ behavior: 'smooth', block: 'center' });
};

function updateSearchControls() {
    const controls = document.getElementById('search-controls');
    const counter = document.getElementById('search-match-count');
    const hasSearch = !!(state.searchTerm && state.searchTerm.trim());

    state.searchMatches = hasSearch ? Array.from(document.querySelectorAll('.favorite-item.search-highlight')) : [];

    if (!hasSearch || state.searchMatches.length === 0) {
        state.currentSearchIndex = -1;
        state.searchMatches.forEach(el => el.classList.remove('search-active'));
        if (counter) counter.textContent = '0/0';
        if (controls) controls.classList.add('hidden');
        return;
    }

    if (state.currentSearchIndex < 0 || state.currentSearchIndex >= state.searchMatches.length) {
        state.currentSearchIndex = 0;
    }

    state.searchMatches.forEach(el => el.classList.remove('search-active'));
    const active = state.searchMatches[state.currentSearchIndex];
    if (active) active.classList.add('search-active');

    if (counter) counter.textContent = `${state.currentSearchIndex + 1}/${state.searchMatches.length}`;
    if (controls) controls.classList.remove('hidden');
}

window.checkAuth = () => !state.isReadOnly || !!ghToken;
window.loadLocalSettings = () => {
    const s = localStorage.getItem('favoriten_app_settings');
    if (s) {
        try {
            Object.assign(localSettings, JSON.parse(s));
        } catch (e) { }
    }
    applyLocalSettings();
    syncLocalSettingsUI();
};

window.applyLocalSettings = () => {
    document.body.classList.toggle('compact-view', !!localSettings.compactMode);
    document.body.classList.toggle('no-animations', !localSettings.animations);
    document.body.classList.toggle('fixed-header', !!localSettings.fixedHeader);

    const darkMode = localSettings.darkMode || 'system';
    let themeValue = null;
    if (darkMode === 'dark') themeValue = 'dark';
    if (darkMode === 'light') themeValue = 'light';
    if (darkMode === 'system') {
        themeValue = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    document.documentElement.setAttribute('data-theme', themeValue);
};

window.updateLocalSettings = () => {
    const dark = document.getElementById('local-dark-mode');
    const compact = document.getElementById('local-compact-mode');
    const animations = document.getElementById('local-animations');
    const fixed = document.getElementById('local-fixed-header');

    if (dark) localSettings.darkMode = dark.value;
    if (compact) localSettings.compactMode = !!compact.checked;
    if (animations) localSettings.animations = !!animations.checked;
    if (fixed) localSettings.fixedHeader = !!fixed.checked;

    localStorage.setItem('favoriten_app_settings', JSON.stringify(localSettings));
    applyLocalSettings();
    renderBoard();
};

function syncLocalSettingsUI() {
    const dark = document.getElementById('local-dark-mode');
    const compact = document.getElementById('local-compact-mode');
    const animations = document.getElementById('local-animations');
    const fixed = document.getElementById('local-fixed-header');

    if (dark) dark.value = localSettings.darkMode || 'system';
    if (compact) compact.checked = !!localSettings.compactMode;
    if (animations) animations.checked = localSettings.animations !== false;
    if (fixed) fixed.checked = !!localSettings.fixedHeader;
}

window.checkAllLinks = async () => {
    const allItems = [];
    state.rows.forEach(r => r.projects.forEach(s => {
        if (!s.isSpacer) s.projects.forEach(p => p.items.forEach(it => allItems.push(it)));
    }));

    if (allItems.length === 0) {
        showToast('Keine Links zum Pruefen gefunden.', 'info');
        return;
    }

    showToast(`Link-Check gestartet (${allItems.length} Links)`, 'info');
    let okCount = 0;
    let failCount = 0;

    const workers = 6;
    let index = 0;
    async function runWorker() {
        while (index < allItems.length) {
            const current = allItems[index++];
            try {
                const res = await fetch('/api/check-link', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ url: current.url })
                });
                const data = await res.json();
                if (data.ok) okCount++;
                else failCount++;
            } catch (e) {
                failCount++;
            }
        }
    }

    await Promise.all(Array.from({ length: workers }, () => runWorker()));
    showToast(`Link-Check fertig: ${okCount} OK, ${failCount} fehlerhaft`, failCount ? 'error' : 'success');
};

window.cleanAllLinkTitles = () => {
    let changed = 0;
    state.rows.forEach(r => r.projects.forEach(s => {
        if (!s.isSpacer) s.projects.forEach(p => p.items.forEach(it => {
            const source = (it.url && it.url.trim()) ? it.url : (it.title || '');
            const cleaned = cleanTitle(source);
            if (cleaned && cleaned !== it.title) {
                it.title = cleaned;
                changed++;
            }
        }));
    }));

    if (changed > 0) {
        renderBoard();
        saveData();
    }
    showToast(`${changed} Titel bereinigt.`, 'success');
};

const localSettings = {
    hiddenRowIds: [],
    compactMode: false,
    darkMode: 'system',
    animations: true,
    fixedHeader: false
};
window.localSettings = localSettings;
window.state = state;
window.generateId = generateId;
window.saveData = saveData;
window.renderBoard = renderBoard;

window.updateBookmarklet = () => {
    const l = document.getElementById('bookmarklet-link'); if (l) l.href = `javascript:(function(){window.open('${window.location.origin}${window.location.pathname}?add_url='+encodeURIComponent(window.location.href)+'&add_title='+encodeURIComponent(document.title),'_blank');})();`;
};

window.showSavedFeedback = () => { const b = document.getElementById('btn-save'); if (b) { const old = b.innerHTML; b.innerHTML = '<i class="fa-solid fa-check"></i>'; setTimeout(() => b.innerHTML = old, 1500); } };

init();
