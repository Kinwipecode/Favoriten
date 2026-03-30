const API_URL = '/api/favorites';

// --- GitHub Config (for Client-Side / Internet-Mode) ---
let ghToken = localStorage.getItem('gh_token') || '';
let ghOwner = 'Kinwipecode';
let ghRepo = 'Favoriten';
let ghPath = 'data/favorites.json';
let ghSha = null;

const state = {
    projects: [] // Array of { id, title, items: [] }
};

// Utils
const generateId = () => Math.random().toString(36).substr(2, 9);

// DOM Elements
const board = document.getElementById('board');
const btnSave = document.getElementById('btn-save');
const btnImport = document.getElementById('btn-import');
const btnAddProject = document.getElementById('btn-add-project');
const modal = document.getElementById('import-modal');
const fileInput = document.getElementById('file-input');
const btnConfirmImport = document.getElementById('btn-confirm-import');
const btnCancelImport = document.getElementById('btn-cancel-import');
const btnLoad = document.getElementById('btn-load');
const savePathDisplay = document.getElementById('save-path-display');
const btnGithubSync = document.getElementById('btn-github');

// --- Initialization ---
async function init() {
    console.log('App Initialisierung...');
    await loadData();
    renderBoard();
}

async function loadData() {
    try {
        const res = await fetch(API_URL);
        if (!res.ok) throw new Error('Server offline');
        const data = await res.json();
        state.projects = data.projects || [];
        savePathDisplay.textContent = '🏠 Server: ' + (data.savePath || 'Lokal');
        savePathDisplay.style.color = '#00b894';
    } catch (err) {
        // --- FALLBACK to GITHUB API (Internet Mode) ---
        if (ghToken) {
            await loadFromGitHub();
        } else {
            savePathDisplay.textContent = '❌ Offline. Bitte GitHub Sync (🔑) oben einrichten.';
            savePathDisplay.style.color = '#ff7675';
        }
    }
}

async function loadFromGitHub() {
    const url = `https://api.github.com/repos/${ghOwner}/${ghRepo}/contents/${ghPath}?t=${Date.now()}`;
    try {
        const res = await fetch(url, {
            headers: { 'Authorization': `token ${ghToken}` }
        });
        if (res.ok) {
            const data = await res.json();
            ghSha = data.sha;
            // Decode Base64
            const content = JSON.parse(decodeURIComponent(escape(atob(data.content))));
            state.projects = content.projects || [];
            savePathDisplay.textContent = '☁️ Cloud: GitHub Sync aktiv';
            savePathDisplay.style.color = '#0984e3';
        } else {
            throw new Error('GitHub Load failed');
        }
    } catch (err) {
        console.error('GitHub Laden fehlgeschlagen:', err);
    }
}

async function saveData() {
    try {
        const res = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ projects: state.projects })
        });

        if (res.ok) {
            const data = await res.json();
            if (data.savePath) savePathDisplay.textContent = '🏠 Server: ' + data.savePath;
            savePathDisplay.style.color = '#00b894';
            showSavedFeedback();
            return;
        }
        throw new Error('Server failure');
    } catch (err) {
        if (ghToken) {
            await saveToGitHub();
        } else {
            localStorage.setItem('favoriten_backup', JSON.stringify(state.projects));
            alert('Lokal gespeichert (Browser-Cache)');
            showSavedFeedback();
        }
    }
}

async function saveToGitHub() {
    const url = `https://api.github.com/repos/${ghOwner}/${ghRepo}/contents/${ghPath}`;
    try {
        // Encode Base64 UTF-8
        const content = btoa(unescape(encodeURIComponent(JSON.stringify({ projects: state.projects }, null, 2))));
        const body = {
            message: 'Update from Web App',
            content: content,
            sha: ghSha
        };

        const res = await fetch(url, {
            method: 'PUT',
            headers: { 'Authorization': `token ${ghToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        if (res.ok) {
            const data = await res.json();
            ghSha = data.content.sha;
            savePathDisplay.textContent = '☁️ Cloud: Gesichert auf GitHub';
            savePathDisplay.style.color = '#0984e3';
            showSavedFeedback();
        } else {
            alert('Speichern fehlgeschlagen. Token prüfen.');
        }
    } catch (err) {
        console.error(err);
    }
}

function showSavedFeedback() {
    const btn = document.getElementById('btn-save');
    if (!btn) return;
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-check"></i> Gespeichert!';
    setTimeout(() => btn.innerHTML = originalText, 2000);
}

// GitHub Settings Button Click
const btnSync = document.getElementById('btn-github');
if (btnSync) {
    btnSync.addEventListener('click', (e) => {
        e.preventDefault();
        console.log('Sync geklickt');
        const token = prompt('GitHub Personal Access Token (🔑) eingeben:', ghToken);
        if (token !== null) {
            ghToken = token.trim();
            localStorage.setItem('gh_token', ghToken);
            if (ghToken) {
                loadFromGitHub().then(() => renderBoard());
                alert('GitHub Token gespeichert! Versuche Synchronisation...');
            } else {
                alert('GitHub Sync deaktiviert.');
            }
        }
    });
}

// --- Drag & Drop ---
let draggedItem = null;
let draggedFromProject = null;

function handleDragStart(e, item, projectId) {
    draggedItem = item;
    draggedFromProject = projectId;
    e.target.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
}

function handleDragEnd(e) {
    e.target.classList.remove('dragging');
    draggedItem = null;
    draggedFromProject = null;
    document.querySelectorAll('.column-body').forEach(col => col.classList.remove('drag-over'));
}

function handleDragOver(e) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; const colBody = e.target.closest('.column-body'); if (colBody) colBody.classList.add('drag-over'); }
function handleDragLeave(e) { const colBody = e.target.closest('.column-body'); if (colBody) colBody.classList.remove('drag-over'); }

function handleDrop(e, targetProjectId) {
    e.preventDefault();
    const colBody = e.target.closest('.column-body');
    if (colBody) colBody.classList.remove('drag-over');
    if (!draggedItem || !draggedFromProject) return;
    const sourceProject = state.projects.find(p => p.id === draggedFromProject);
    const targetProject = state.projects.find(p => p.id === targetProjectId);
    if (!sourceProject || !targetProject) return;
    let removed = false;
    function removeFromList(items) {
        for (let i = 0; i < items.length; i++) {
            if (items[i].id === draggedItem.id) { items.splice(i, 1); return true; }
            if (items[i].children && removeFromList(items[i].children)) return true;
        }
        return false;
    }
    removed = removeFromList(sourceProject.items);
    if (removed) { targetProject.items.push(draggedItem); renderBoard(); saveData(); }
}

// --- Rendering ---
function renderBoard() {
    board.innerHTML = '';
    state.projects.forEach(project => {
        const col = createColumn(project);
        board.appendChild(col);
    });
}

function createColumn(project) {
    const col = document.createElement('div');
    col.className = 'column';
    col.innerHTML = `
            <div class="column-header">
                <span>${project.title}</span>
                <div class="column-actions">
                    <button class="btn-icon" title="Link hinzufügen" onclick="addItem('${project.id}')"><i class="fa-solid fa-plus"></i></button>
                    <button class="btn-icon" title="Ordner hinzufügen" onclick="addFolder('${project.id}')"><i class="fa-solid fa-folder-plus"></i></button>
                    <button class="btn-icon" title="Projekt löschen" onclick="deleteProject('${project.id}')"><i class="fa-solid fa-trash"></i></button>
                </div>
            </div>
            <div class="column-body" id="col-${project.id}" ondragover="handleDragOver(event)" ondragleave="handleDragLeave(event)" ondrop="handleDrop(event, '${project.id}')">
            </div>
        `;
    const body = col.querySelector('.column-body');
    function renderItems(items, container, level = 0) {
        items.forEach(item => {
            const elWrapper = document.createElement('div');
            elWrapper.draggable = true;
            elWrapper.addEventListener('dragstart', (e) => handleDragStart(e, item, project.id));
            elWrapper.addEventListener('dragend', handleDragEnd);
            if (item.type === 'link') {
                const linkEl = createLinkItem(item);
                if (level > 0) { linkEl.style.marginLeft = (level * 16) + 'px'; linkEl.style.width = `calc(100% - ${level * 16}px - 24px)`; }
                elWrapper.appendChild(linkEl);
            } else if (item.type === 'folder') {
                const folderEl = document.createElement('div');
                folderEl.style.padding = '8px 0'; folderEl.style.fontWeight = 'bold'; folderEl.style.borderBottom = '1px dashed #ccc';
                folderEl.style.marginBottom = '8px'; folderEl.style.marginTop = '8px'; folderEl.style.marginLeft = (level * 10) + 'px';
                folderEl.innerHTML = `<span>📁 ${item.title}</span><button class="btn-text" onclick="event.stopPropagation(); deleteItem('${item.id}')" style="float:right"><i class="fa-solid fa-xmark"></i></button>`;
                elWrapper.appendChild(folderEl);
            }
            container.appendChild(elWrapper);
            if (item.type === 'folder' && item.children) renderItems(item.children, container, level + 1);
        });
    }
    renderItems(project.items, body);
    return col;
}

function createLinkItem(item) {
    const el = document.createElement('div');
    el.className = 'favorite-item';
    el.onclick = () => window.open(item.url, '_blank');
    const iconUrl = `https://www.google.com/s2/favicons?domain=${new URL(item.url).hostname}&sz=32`;
    el.innerHTML = `<div class="fav-icon"><img src="${iconUrl}" onerror="this.src=''" style="width:16px;height:16px;"></div><div class="fav-content"><div class="fav-title">${item.title}</div><div class="fav-url">${item.url}</div></div><button class="btn-text" onclick="event.stopPropagation(); deleteItem('${item.id}')"><i class="fa-solid fa-xmark"></i></button>`;
    return el;
}

// --- Actions Modals ---
const addItemModal = document.getElementById('add-item-modal');
const inputItemTitle = document.getElementById('input-item-title');
const inputItemUrl = document.getElementById('input-item-url');
const btnCancelAdd = document.getElementById('btn-cancel-add');
const btnConfirmAdd = document.getElementById('btn-confirm-add');
let currentAddProjectId = null;

window.addItem = (projectId) => { currentAddProjectId = projectId; inputItemTitle.value = ''; inputItemUrl.value = ''; addItemModal.classList.remove('hidden'); inputItemTitle.focus(); };
btnCancelAdd.onclick = () => addItemModal.classList.add('hidden');
btnConfirmAdd.onclick = () => { if (!currentAddProjectId) return; const p = state.projects.find(x => x.id === currentAddProjectId); if (p) { let url = inputItemUrl.value.trim(); if (!url) return alert('URL?'); if (!url.startsWith('http')) url = 'https://' + url; p.items.push({ id: generateId(), type: 'link', title: inputItemTitle.value.trim() || 'Link', url }); addItemModal.classList.add('hidden'); renderBoard(); saveData(); } };

window.addFolder = (projectId) => { const p = state.projects.find(x => x.id === projectId); if (p) { const t = prompt('Ordner:'); if (t) { p.items.push({ id: generateId(), type: 'folder', title: t, children: [] }); renderBoard(); saveData(); } } };
window.deleteProject = (id) => { if (confirm('Löschen?')) { state.projects = state.projects.filter(p => p.id !== id); renderBoard(); saveData(); } };
window.deleteItem = (id) => { if (!confirm('Löschen?')) return; let del = false; function rec(items) { for (let i = 0; i < items.length; i++) { if (items[i].id === id) { items.splice(i, 1); return true; } if (items[i].children && rec(items[i].children)) return true; } return false; } state.projects.forEach(p => { if (!del) del = rec(p.items); }); if (del) { renderBoard(); saveData(); } };

btnAddProject.onclick = () => { const t = prompt('Projekt:'); if (t) { state.projects.push({ id: generateId(), title: t, items: [] }); renderBoard(); } };
document.getElementById('btn-reset').onclick = () => { if (confirm('LÖSCHEN?')) { state.projects = []; renderBoard(); saveData(); } };

btnSave.onclick = saveData;
btnLoad.onclick = async () => { if (confirm('Laden?')) { await loadData(); renderBoard(); } };
document.getElementById('btn-info').onclick = () => document.getElementById('info-modal').classList.remove('hidden');
document.getElementById('btn-close-info').onclick = () => document.getElementById('info-modal').classList.add('hidden');

document.addEventListener('keydown', (e) => { if (e.ctrlKey && e.key === 's') { e.preventDefault(); saveData(); } if (e.key === 'Escape') { modal.classList.add('hidden'); addItemModal.classList.add('hidden'); document.getElementById('info-modal').classList.add('hidden'); } });

btnImport.onclick = () => document.getElementById('import-modal').classList.remove('hidden');
document.getElementById('btn-cancel-import').onclick = () => document.getElementById('import-modal').classList.add('hidden');
fileInput.onchange = () => document.getElementById('btn-confirm-import').disabled = !fileInput.files.length;
document.getElementById('btn-confirm-import').onclick = () => { const f = fileInput.files[0]; if (f) { const r = new FileReader(); r.onload = (e) => { parseBookmarks(e.target.result); document.getElementById('import-modal').classList.add('hidden'); renderBoard(); saveData(); }; r.readAsText(f); } };

function parseBookmarks(html) { try { const p = new DOMParser(); const d = p.parseFromString(html, 'text/html'); const dl = d.querySelector('dl'); if (!dl) return alert('Keine Lesezeichen.'); function proc(x) { const items = []; Array.from(x.children).forEach(n => { if (n.tagName === 'DT') { const a = Array.from(n.children).find(c => c.tagName === 'A'); const h3 = Array.from(n.children).find(c => c.tagName === 'H3'); if (a) items.push({ id: generateId(), type: 'link', title: a.textContent, url: a.href }); else if (h3) { const cDl = n.querySelector('dl') || n.nextElementSibling?.tagName === 'DL' ? n.nextElementSibling : null; items.push({ id: generateId(), type: 'folder', title: h3.textContent, children: cDl ? proc(cDl) : [] }); } } }); return items; } const raw = proc(dl); const projs = []; let rItems = raw.length === 1 && raw[0].type === 'folder' ? raw[0].children : raw; function flat(items, curr) { items.forEach(i => { if (i.type === 'link') curr.push(i); else { const n = []; projs.push({ id: generateId(), title: i.title, items: n }); flat(i.children, n); } }); } const loose = []; flat(rItems, loose); if (loose.length) projs.unshift({ id: generateId(), title: 'Weitere', items: loose }); state.projects = projs; renderBoard(); saveData(); } catch (e) { alert('Fehler'); } }

init();
