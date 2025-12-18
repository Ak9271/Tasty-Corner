const express = require('express');
const path = require('path');

const app = express();
const PORT = 8081;

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
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Serveur lancé sur http://localhost:${PORT}`);
    console.log(`Accédez à http://localhost:${PORT} dans votre navigateur`);
    console.log('Appuyez sur Ctrl+C pour arrêter le serveur');
});

process.on('SIGINT', () => {
    console.log('\nServeur arrêté');
    process.exit(0);
});
