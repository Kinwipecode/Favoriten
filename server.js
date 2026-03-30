const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;
const DATA_FILE = path.resolve(__dirname, 'data', 'favorites.json');

const CONFIG_PATH = path.resolve(__dirname, 'github_config.json');

// Get GitHub config
function getGHConfig() {
    if (fs.existsSync(CONFIG_PATH)) {
        return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    }
    return null;
}

// Push to GitHub Helper
async function pushToGitHub(data) {
    const cf = getGHConfig();
    if (!cf || !cf.github_token || cf.github_token.includes('token_hier')) return;

    try {
        const url = `https://api.github.com/repos/${cf.github_owner}/${cf.github_repo}/contents/${cf.github_path}`;

        // 1. Get current SHA if file exists
        let sha = null;
        const resGet = await fetch(url, { headers: { 'Authorization': `token ${cf.github_token}` } });
        if (resGet.ok) {
            const current = await resGet.json();
            sha = current.sha;
        }

        // 2. Put new content
        const body = {
            message: 'Auto-sync from Favoriten Manager',
            content: Buffer.from(JSON.stringify(data, null, 2)).toString('base64'),
            sha: sha
        };

        const resPut = await fetch(url, {
            method: 'PUT',
            headers: { 'Authorization': `token ${cf.github_token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        if (resPut.ok) console.log('☁️ GitHub Sync: ERFOLGREICH gesichert!');
        else console.error('☁️ GitHub Sync: FEHLER beim Hochladen.');
    } catch (err) {
        console.error('☁️ GitHub Sync: Netzwerk-Fehler.', err.message);
    }
}

console.log('--- SERVER STARTING ---');
console.log('Speicherort:', DATA_FILE);
console.log('------------------------');

app.use(cors());
app.use(bodyParser.json({ limit: '50mb' })); // Limit increased for large HTML imports if needed
app.use(express.static(path.join(__dirname, 'public')));

// Ensure data directory exists
if (!fs.existsSync(path.dirname(DATA_FILE))) {
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
}

// Ensure favorites.json exists
if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({ projects: [] }, null, 2));
}

// API: Get all favorites
app.get('/api/favorites', (req, res) => {
    if (!fs.existsSync(DATA_FILE)) {
        return res.json({ projects: [], savePath: DATA_FILE });
    }

    fs.readFile(DATA_FILE, 'utf8', (err, data) => {
        if (err) {
            console.error('FEHLER beim Lesen:', err);
            return res.status(500).json({ error: 'Datei konnte nicht gelesen werden' });
        }

        try {
            const parsedData = data ? JSON.parse(data) : { projects: [] };
            parsedData.savePath = DATA_FILE;
            res.json(parsedData);
        } catch (parseErr) {
            console.error('FEHLER: favorites.json ist beschädigt.');
            res.json({ projects: [], savePath: DATA_FILE });
        }
    });
});

// API: Save all favorites
app.post('/api/favorites', (req, res) => {
    const newData = req.body;

    // Save locally
    fs.writeFile(DATA_FILE, JSON.stringify(newData, null, 2), (err) => {
        if (err) return res.status(500).json({ error: 'Lokal speichern fehlgeschlagen' });

        // Save to GitHub in background
        pushToGitHub(newData);

        res.json({ success: true, savePath: DATA_FILE });
    });
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
    console.log('Synchronisation bereit (checke github_config.json)');
});
