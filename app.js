/**
 * Core Application Logic
 * Features: State Management, Data Persistence, Board Rendering, HTML Import
 */

const API_URL = '/api/favorites';
const board = document.getElementById("board");

let ghToken = localStorage.getItem('gh_token') || '';
let ghOwner = 'Kinwipecode';
let ghRepo = 'Favoriten';
let ghPath = 'data/favorites.json';
let ghSha = null;

const state = {
    rows: [],
    config: {
        primary: '#6c5ce7',
        bg: '#dfe6e9',
        headerBg: '#f8f9fa',
        headerText: '#2d3436',
        link: '#2d3436',
        rowBg: 'rgba(255, 255, 255, 0.4)',
        itemBg: '#ffffff',
        buttonOrder: [
            'btn-load', 'btn-save', 'btn-import', 'btn-export', 'btn-github', 'btn-info', 'btn-collapse-gaps', 'btn-add-row', 'btn-add-project', 'btn-settings'
        ]
    }
};

const generateId = () => Math.random().toString(36).substr(2, 9);

async function init() {
    if (window.setupUI) setupUI(); // From ui.js
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
            state.rows = migrate(JSON.parse(decodeURIComponent(escape(atob(data.content)))));
            if (window.applyTheme) applyTheme();
            const disp = document.getElementById('save-path-display');
            if (disp) { disp.textContent = '☁️ GitHub Sync'; disp.style.color = '#0984e3'; }
        }
    } catch (e) { console.error(e); }
}

async function saveData() {
    const payload = { rows: state.rows, config: state.config };
    try {
        await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    } catch (e) {
        if (ghToken) await saveToGitHub();
        else localStorage.setItem('favoriten_backup', JSON.stringify(payload));
    }
    showSavedFeedback();
}

async function saveToGitHub() {
    const url = `https://api.github.com/repos/${ghOwner}/${ghRepo}/contents/${ghPath}`;
    const content = btoa(unescape(encodeURIComponent(JSON.stringify({ rows: state.rows, config: state.config }, null, 2))));
    try {
        const res = await fetch(url, { method: 'PUT', headers: { 'Authorization': `token ${ghToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ message: 'Update', content, sha: ghSha }) });
        if (res.ok) { const d = await res.json(); ghSha = d.content.sha; }
    } catch (e) { console.error(e); }
}

function migrate(data) {
    if (data.config) state.config = { ...state.config, ...data.config };
    if (data.rows && data.rows.length > 0) {
        data.rows.forEach(r => {
            if (!r.projects) r.projects = [];
            r.projects = r.projects.map(p => (p.projects && Array.isArray(p.projects)) ? p : (p.isSpacer ? { id: generateId(), isSpacer: true, projects: [] } : { id: generateId(), isSpacer: false, projects: [p] }));
        });
        return data.rows;
    }
    return [{ id: generateId(), title: 'Hauptzeile', projects: [] }];
}

function renderBoard() {
    if (!board) return;
    board.innerHTML = "";
    state.rows.forEach(row => {
        const rowEl = document.createElement("div"); rowEl.className = "board-row";
        rowEl.innerHTML = `<div class="row-header"><input type="text" value="${row.title}" onchange="updateRowTitle('${row.id}', this.value)"><button class="btn-icon" onclick="deleteRow('${row.id}')"><i class="fa-solid fa-trash"></i></button></div><div class="row-projects" ondragover="event.preventDefault()" ondrop="handleRowDrop(event, '${row.id}')"></div>`;
        const container = rowEl.querySelector(".row-projects");
        row.projects.forEach(slot => {
            const slotEl = document.createElement("div"); slotEl.className = "grid-slot";
            slotEl.ondragover = (e) => { e.preventDefault(); slotEl.classList.add("drag-over-slot"); };
            slotEl.ondragleave = () => slotEl.classList.remove("drag-over-slot");
            slotEl.ondrop = (e) => { e.stopPropagation(); handleRowDrop(e, row.id, slot.id); };

            if (slot.isSpacer) {
                slotEl.innerHTML = `<div class="column spacer" ondragover="event.preventDefault(); this.classList.add('drag-over');" ondragleave="this.classList.remove('drag-over');" ondrop="event.stopPropagation(); handleRowDrop(event, '${row.id}', '${slot.id}')"><button class="btn-text" onclick="deleteProject('${slot.id}')">×</button></div>`;
            } else {
                slot.projects.forEach(p => {
                    const col = document.createElement("div"); col.className = `column ${p.collapsed ? "collapsed" : ""}`;
                    col.draggable = true; col.ondragstart = (e) => handleColDragStart(e, p.id); col.ondragend = handleDragEnd;
                    // Drops auf Gruppen erlauben sie im selben Slot zu stapeln
                    col.ondragover = (e) => { e.preventDefault(); slotEl.classList.add("drag-over-slot"); };
                    col.ondrop = (e) => { e.stopPropagation(); handleRowDrop(e, row.id, slot.id); };

                    col.innerHTML = `<div class="column-header" onclick="if(!event.target.closest('button') && !event.target.closest('input')) toggleCollapse('${p.id}')" style="cursor:pointer;"><div class="header-left"><input type="checkbox" ${p.collapsed ? "checked" : ""} readonly><span>${p.title}</span></div><div class="column-actions"><button onclick="event.stopPropagation(); addItem('${p.id}')"><i class="fa-solid fa-plus"></i></button><button onclick="event.stopPropagation(); deleteProject('${p.id}')"><i class="fa-solid fa-trash"></i></button></div></div><div class="column-body"></div>`;
                    const b = col.querySelector(".column-body");
                    p.items.forEach(it => {
                        const i = document.createElement("div"); i.className = "favorite-item"; i.onclick = () => window.open(it.url);
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
}

window.importFromHTML = (html) => {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const headings = [...doc.querySelectorAll('h3, h1, dt > h3')];
    if (state.rows.length === 0) state.rows.push({ id: generateId(), title: 'Import', projects: [] });
    headings.forEach(h => {
        const title = h.textContent.trim();
        const container = h.closest('dt') || h.parentElement;
        const links = [...container.querySelectorAll('a')].filter(a => a.closest('dl') === h.nextElementSibling || a.parentElement === container);
        if (links.length > 0 && title && !['Bookmarks', 'Lesezeichen'].includes(title)) {
            state.rows[0].projects.push({ id: generateId(), isSpacer: false, projects: [{ id: generateId(), title, items: links.map(a => ({ id: generateId(), title: a.textContent.trim(), url: a.href })), collapsed: true }] });
        }
    });
    renderBoard(); saveData();
};

function showSavedFeedback() { const btn = document.getElementById('btn-save'); if (btn) { const o = btn.innerHTML; btn.innerHTML = '✅ OK'; setTimeout(() => btn.innerHTML = o, 1500); } }
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
window.deleteRow = (id) => { if (confirm('Reihe löschen?')) { state.rows = state.rows.filter(r => r.id !== id); renderBoard(); saveData(); } };
window.toggleCollapse = (id) => { const p = findProject(id); if (p) { p.collapsed = !p.collapsed; renderBoard(); saveData(); } };
window.deleteProject = (id) => { findProjectAndClear(id); renderBoard(); saveData(); };
window.addItem = (id) => { const t = prompt('Titel:'), u = prompt('URL:'); if (t && u) { const p = findProject(id); if (p) { p.items.push({ id: generateId(), title: t, url: u.startsWith('http') ? u : 'https://' + u }); renderBoard(); saveData(); } } };
window.deleteItem = (id) => { for (const r of state.rows) for (const s of r.projects) if (!s.isSpacer) for (const p of s.projects) { const idx = p.items.findIndex(it => it.id === id); if (idx !== -1) { p.items.splice(idx, 1); renderBoard(); saveData(); return; } } };

init();
