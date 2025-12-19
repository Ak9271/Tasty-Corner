const express = require('express');
const path = require('path');

const app = express();
const DEFAULT_PORT = 8081;
const START_PORT = Number(process.env.PORT || DEFAULT_PORT);

// Middleware pour servir les fichiers statiques
app.use(express.static(__dirname));

// Route pour servir index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Route 404
app.use((req, res) => {
    res.status(404).send('404 - Page non trouvée');
});

// Démarrer le serveur
function startServer(port) {
    const server = app.listen(port, '0.0.0.0', () => {
        console.log(`Serveur lancé sur http://localhost:${port}`);
        console.log(`Accédez à http://localhost:${port} dans votre navigateur`);
        console.log('Appuyez sur Ctrl+C pour arrêter le serveur');
    });

    server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            const nextPort = port + 1;
            console.warn(`Port ${port} occupé. Tentative sur ${nextPort}...`);
            startServer(nextPort);
        } else {
            throw err;
        }
    });
}

startServer(START_PORT);

process.on('SIGINT', () => {
    console.log('\nServeur arrêté');
    process.exit(0);
});
