const API_URL = '/api/favorites';

const state = {
    projects: [] // Array of { id, title, items: [] } or nested structure
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

// --- Initialization ---
async function init() {
    await loadData();
    renderBoard();
}

async function loadData(retries = 5) {
    try {
        const res = await fetch(API_URL);
        if (!res.ok) throw new Error('Server antwortete mit ' + res.status);
        const data = await res.json();
        // Ensure data structure
        if (data.projects) {
            state.projects = data.projects;
        }
        if (data.savePath) {
            savePathDisplay.textContent = '💾 Speicherort: ' + data.savePath;
            savePathDisplay.style.color = '#00b894';
        } else {
            savePathDisplay.textContent = 'Pfad unbekannt (Bitte Server / start_app.bat neu starten)';
            savePathDisplay.style.color = '#ff7675';
        }
    } catch (err) {
        if (retries > 0) {
            savePathDisplay.textContent = `⏳ Verbinde mit Server... (${retries} Versuche übrig)`;
            savePathDisplay.style.color = '#fdcb6e';
            await new Promise(r => setTimeout(r, 1000));
            return loadData(retries - 1);
        }
        console.error('Failed to load data', err);
        savePathDisplay.textContent = '❌ Server nicht erreichbar. Bitte start_app.bat starten.';
        savePathDisplay.style.color = '#ff7675';
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
            if (data.savePath) {
                savePathDisplay.textContent = '💾 Server: ' + data.savePath;
                savePathDisplay.style.color = '#00b894';
            }
            showSavedFeedback();
        } else {
            throw new Error('Server-Speichern fehlgeschlagen');
        }
    } catch (err) {
        console.warn('Server nicht erreichbar, nutze Browser-Speicher (LocalStorage)...');
        localStorage.setItem('favoriten_backup', JSON.stringify(state.projects));
        savePathDisplay.textContent = '☁️ Browser-Zwischenspeicher (Lokal ohne Server)';
        savePathDisplay.style.color = '#0984e3';
        showSavedFeedback();
    }
}

function showSavedFeedback() {
    const btn = document.getElementById('btn-save');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-check"></i> Gespeichert!';
    setTimeout(() => btn.innerHTML = originalText, 2000);
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

    // Remove drop highlights
    document.querySelectorAll('.column-body').forEach(col => col.classList.remove('drag-over'));
}

function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const colBody = e.target.closest('.column-body');
    if (colBody) {
        colBody.classList.add('drag-over');
    }
}

function handleDragLeave(e) {
    const colBody = e.target.closest('.column-body');
    if (colBody) {
        colBody.classList.remove('drag-over');
    }
}

function handleDrop(e, targetProjectId) {
    e.preventDefault();
    const colBody = e.target.closest('.column-body');
    if (colBody) {
        colBody.classList.remove('drag-over');
    }

    if (!draggedItem || !draggedFromProject) return;

    const sourceProject = state.projects.find(p => p.id === draggedFromProject);
    const targetProject = state.projects.find(p => p.id === targetProjectId);

    if (!sourceProject || !targetProject) return;

    // Remove from source (recursive search & remove)
    let removed = false;
    function removeFromList(items) {
        for (let i = 0; i < items.length; i++) {
            if (items[i].id === draggedItem.id) {
                items.splice(i, 1);
                return true;
            }
            if (items[i].children) {
                if (removeFromList(items[i].children)) return true;
            }
        }
        return false;
    }

    removed = removeFromList(sourceProject.items);

    if (removed) {
        // Add to target
        targetProject.items.push(draggedItem);
        renderBoard();
        saveData();
    }
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
            <div class="column-body" id="col-${project.id}"
                    ondragover="handleDragOver(event)" 
                    ondragleave="handleDragLeave(event)"
                    ondrop="handleDrop(event, '${project.id}')">
                <!-- Items -->
            </div>
        `;

    const body = col.querySelector('.column-body');

    // Recursive render function
    function renderItems(items, container, level = 0) {
        items.forEach(item => {
            const elWrapper = document.createElement('div');
            // Setup Drag on the Item
            elWrapper.draggable = true;
            elWrapper.addEventListener('dragstart', (e) => handleDragStart(e, item, project.id));
            elWrapper.addEventListener('dragend', handleDragEnd);

            if (item.type === 'link') {
                const linkEl = createLinkItem(item);
                // Add indentation for nested items
                if (level > 0) {
                    linkEl.style.marginLeft = (level * 16) + 'px';
                    linkEl.style.width = `calc(100% - ${level * 16}px - 24px)`;
                }
                elWrapper.appendChild(linkEl);
            } else if (item.type === 'folder') {
                const folderEl = document.createElement('div');
                folderEl.style.padding = '8px 0';
                folderEl.style.fontWeight = 'bold';
                folderEl.style.borderBottom = '1px dashed #ccc';
                folderEl.style.marginBottom = '8px';
                folderEl.style.marginTop = '8px';
                folderEl.style.marginLeft = (level * 10) + 'px';
                folderEl.innerHTML = `
                    <span>📁 ${item.title}</span>
                    <button class="btn-text" onclick="event.stopPropagation(); deleteItem('${item.id}')" style="float:right"><i class="fa-solid fa-xmark"></i></button>
                `;
                elWrapper.appendChild(folderEl);
            }
            container.appendChild(elWrapper);

            if (item.type === 'folder' && item.children) {
                renderItems(item.children, container, level + 1);
            }
        });
    }

    renderItems(project.items, body);

    return col;
}

function createLinkItem(item) {
    const el = document.createElement('div');
    el.className = 'favorite-item';
    el.onclick = () => window.open(item.url, '_blank');

    // Icon (try to get favicon? generic for now)
    const iconUrl = `https://www.google.com/s2/favicons?domain=${new URL(item.url).hostname}&sz=32`;

    el.innerHTML = `
        <div class="fav-icon">
            <img src="${iconUrl}" onerror="this.src=''" style="width:16px;height:16px;">
        </div>
        <div class="fav-content">
            <div class="fav-title">${item.title}</div>
            <div class="fav-url">${item.url}</div>
        </div>
        <button class="btn-text" onclick="event.stopPropagation(); deleteItem('${item.id}')"><i class="fa-solid fa-xmark"></i></button>
    `;
    return el;
}

// --- Actions ---

// Modal Elements
const addItemModal = document.getElementById('add-item-modal');
const inputItemTitle = document.getElementById('input-item-title');
const inputItemUrl = document.getElementById('input-item-url');
const btnCancelAdd = document.getElementById('btn-cancel-add');
const btnConfirmAdd = document.getElementById('btn-confirm-add');

let currentAddProjectId = null;

window.addItem = (projectId) => {
    currentAddProjectId = projectId;
    inputItemTitle.value = '';
    inputItemUrl.value = '';
    addItemModal.classList.remove('hidden');
    inputItemTitle.focus();
};

btnCancelAdd.onclick = () => {
    addItemModal.classList.add('hidden');
    currentAddProjectId = null;
};

btnConfirmAdd.onclick = () => {
    if (!currentAddProjectId) return;
    const project = state.projects.find(p => p.id === currentAddProjectId);
    if (!project) return;

    const title = inputItemTitle.value.trim() || 'Neuer Link';
    let url = inputItemUrl.value.trim();

    if (!url) {
        alert('Bitte eine URL eingeben');
        return;
    }

    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
    }

    project.items.push({
        id: generateId(),
        type: 'link',
        title: title,
        url: url,
        addDate: Math.floor(Date.now() / 1000)
    });

    addItemModal.classList.add('hidden');
    renderBoard();
    saveData();
};

window.addFolder = (projectId) => {
    const project = state.projects.find(p => p.id === projectId);
    if (!project) return;

    const title = prompt('Name des neuen Ordners:');
    if (!title) return;

    project.items.push({
        id: generateId(),
        type: 'folder',
        title: title,
        children: []
    });
    renderBoard();
    saveData();
};

window.deleteProject = (id) => {
    if (confirm('Projekt wirklich löschen?')) {
        state.projects = state.projects.filter(p => p.id !== id);
        renderBoard();
        saveData();
    }
};

window.deleteItem = (id) => {
    if (!confirm('Eintrag wirklich löschen?')) return;

    let deleted = false;

    // Helper to recursively find and delete
    function removeRecursive(items) {
        for (let i = 0; i < items.length; i++) {
            if (items[i].id === id) {
                items.splice(i, 1);
                return true;
            }
            if (items[i].children) {
                if (removeRecursive(items[i].children)) return true;
            }
        }
        return false;
    }

    // Iterate over all projects
    state.projects.forEach(project => {
        if (!deleted) {
            deleted = removeRecursive(project.items);
        }
    });

    if (deleted) {
        renderBoard();
        saveData();
    }
};

btnAddProject.onclick = () => {
    const title = prompt('Name des Projekts:');
    if (title) {
        state.projects.push({
            id: generateId(),
            title: title,
            items: []
        });
        renderBoard();
    }
};

document.getElementById('btn-reset').onclick = () => {
    if (confirm('WARNUNG: Alle Spalten und Favoriten werden gelöscht!\nFortfahren?')) {
        state.projects = [];
        renderBoard();
        saveData();
    }
};

btnSave.onclick = saveData;

btnLoad.onclick = async () => {
    if (confirm('Willst du wirklich die zuletzt gespeicherten Daten vom Server holen? \nNicht gespeicherte Änderungen gehen verloren!')) {
        await loadData();
        renderBoard();
        alert('Daten erfolgreich geladen!');
    }
};

// Info Modal
const infoModal = document.getElementById('info-modal');
document.getElementById('btn-info').onclick = () => infoModal.classList.remove('hidden');
document.getElementById('btn-close-info').onclick = () => infoModal.classList.add('hidden');

// Global Shortcuts
document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 's') {
        e.preventDefault();
        saveData();
    }
    if (e.key === 'Escape') {
        modal.classList.add('hidden');
        addItemModal.classList.add('hidden');
        infoModal.classList.add('hidden');
    }
});

// --- Import Logic ---
btnImport.onclick = () => modal.classList.remove('hidden');
btnCancelImport.onclick = () => modal.classList.add('hidden');

fileInput.onchange = () => {
    btnConfirmImport.disabled = !fileInput.files.length;
};

btnConfirmImport.onclick = () => {
    const file = fileInput.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        const html = e.target.result;
        parseBookmarks(html);
        modal.classList.add('hidden');
        renderBoard();
        saveData();
    };
    reader.readAsText(file);
};

function parseBookmarks(html) {
    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const rootDl = doc.querySelector('dl');

        if (!rootDl) {
            alert('Fehler: Die Datei konnte nicht als Lesezeichen-Datei erkannt werden. Keine Lesezeichen gefunden.');
            return;
        }

        // --- Robust Parser Start ---
        function processList(dl) {
            const items = [];
            const children = Array.from(dl.children);

            for (let i = 0; i < children.length; i++) {
                const node = children[i];
                if (node.tagName === 'DT') {
                    // Check direct children to avoid grabbing deeply nested links
                    const a = Array.from(node.children).find(c => c.tagName === 'A');
                    const h3 = Array.from(node.children).find(c => c.tagName === 'H3');

                    if (a) {
                        items.push({
                            id: generateId(),
                            type: 'link',
                            title: a.textContent,
                            url: a.href,
                            addDate: a.getAttribute('add_date')
                        });
                    } else if (h3) {
                        const title = h3.textContent;
                        let childDl = node.querySelector('dl');

                        // Robust search for the child DL (sometimes nested in DD, sometimes sibling)
                        if (!childDl) {
                            let next = node.nextElementSibling;
                            while (next) {
                                if (next.tagName === 'DT') break; // Next item
                                if (next.tagName === 'DD') {
                                    const found = next.querySelector('dl');
                                    if (found) {
                                        childDl = found;
                                        break;
                                    }
                                } else if (next.tagName === 'DL') {
                                    childDl = next; // Direct sibling
                                    break;
                                }
                                next = next.nextElementSibling;
                            }
                        }

                        items.push({
                            id: generateId(),
                            type: 'folder',
                            title: title,
                            children: childDl ? processList(childDl) : []
                        });
                    }
                }
            }
            return items;
        }
        // --- Robust Parser End ---

        const rawTree = processList(rootDl);
        const projects = [];

        // --- NEW LOGIC: Every folder becomes a project (flat list) ---
        let rootItems = rawTree;
        // Unwrap top-level generic folders like "Lesezeichenleiste" if they are the only root item
        if (rootItems.length === 1 && rootItems[0].type === 'folder') {
            rootItems = rootItems[0].children;
        }

        const looseLinks = [];

        function flattenFoldersToProjects(items, currentProjectItems) {
            items.forEach(item => {
                if (item.type === 'link') {
                    currentProjectItems.push(item);
                } else if (item.type === 'folder') {
                    const newProjectLinks = [];
                    // Create a new column/project for this folder
                    projects.push({
                        id: generateId(),
                        title: item.title,
                        items: newProjectLinks
                    });
                    // Recursively process this folder's children
                    flattenFoldersToProjects(item.children, newProjectLinks);
                }
            });
        }

        flattenFoldersToProjects(rootItems, looseLinks);

        if (looseLinks.length > 0) {
            projects.unshift({
                id: generateId(),
                title: 'Weitere Favoriten',
                items: looseLinks
            });
        }
        // ---------------------------------------------------------

        if (projects.length === 0) {
            alert('Import erfolgreich, aber keine Projekte erstellt. Struktur leer?');
        } else {
            state.projects = projects;
            renderBoard();
            saveData();
            alert(`Import abgeschlossen. ${state.projects.length} Spalten erstellt.`);
        }

    } catch (err) {
        console.error('Import Error:', err);
        alert('Es ist ein Fehler beim Import aufgetreten:\n' + err.message);
    }
}

// Start the app!
init();
