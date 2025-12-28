# Architecture Backend - TastyCorner

## 1. Architecture Actuelle du Projet

### 1.1 Technologies Utilisées
- **Serveur web** : Node.js + Express.js (port 8081)
- **Frontend** : HTML5, CSS3, JavaScript vanilla
- **API externe** : TheMealDB API (www.themealdb.com)
- **Pas de base de données** : Toutes les données viennent directement de TheMealDB

### 1.2 Comment ça fonctionne
Votre projet est une **application web côté client** (frontend) qui interroge directement l'API TheMealDB.

```
Navigateur → recettes.js → TheMealDB API → Données JSON → Affichage
```

**Pas de backend complexe** : Le serveur Express sert juste les fichiers HTML/CSS/JS. Tout le traitement (recherche, filtrage, tri) se fait dans le navigateur de l'utilisateur.

---

## 2. Serveur Express (main.js)

Votre serveur est **très simple** et fait 3 choses :

```javascript
// 1. Servir les fichiers statiques (HTML, CSS, JS, images)
app.use(express.static(__dirname));

// 2. Afficher index.html quand on va sur http://localhost:8081
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// 3. Gérer les erreurs 404
app.use((req, res) => {
    res.status(404).send('404 - Page non trouvée');
});
```

**Pourquoi c'est suffisant ?** Parce que tout le travail est fait côté client avec JavaScript.

---

## 3. Fonctions JavaScript (recettes.js)

Ce fichier contient toutes les fonctions pour communiquer avec TheMealDB :

### 3.1 Recherche par nom
```javascript
async function searchMeals(query) {
    const url = `https://www.themealdb.com/api/json/v1/1/search.php?s=${query}`;
    const response = await fetch(url);
    const data = await response.json();
    return data.meals || [];
}
```

### 3.2 Recherche par ingrédient
```javascript
async function getMealsByIngredient(ingredient) {
    const url = `https://www.themealdb.com/api/json/v1/1/filter.php?i=${ingredient}`;
    // Retourne les plats contenant cet ingrédient
}
```

### 3.3 Recherche par pays
```javascript
async function getMealsByCountry(country) {
    const url = `https://www.themealdb.com/api/json/v1/1/filter.php?a=${country}`;
    // Retourne les plats de ce pays
}
```

### 3.4 Détails d'un plat
```javascript
async function getMealDetails(mealId) {
    const url = `https://www.themealdb.com/api/json/v1/1/lookup.php?i=${mealId}`;
    // Retourne tous les détails (ingrédients, instructions, vidéo)
}
```

### 3.5 Charger tous les plats
```javascript
async function getAllMeals() {
    // Parcourt toutes les lettres de A à Z
    for (const letter of 'abcdefghijklmnopqrstuvwxyz') {
        const meals = await getMealsByLetter(letter);
        allMeals.push(...meals);
    }
}
```

---

## 4. Fonctionnalités Côté Client (index.html)

Tout se passe dans le navigateur de l'utilisateur :

### 4.1 Recherche
Quand l'utilisateur tape "pasta" et clique sur Rechercher :
1. JavaScript appelle `searchCombined("pasta")`
2. Cette fonction interroge TheMealDB (nom + ingrédient + pays)
3. Les résultats sont combinés et dédupliqués
4. Affichage dans la grille

### 4.2 Filtrage par pays
```javascript
async function applyFilters() {
    const country = countryFilter.value;  // Ex: "Italian"
    
    if (country) {
        const meals = await getMealsByCountry(country);
        displayMeals(meals);
    }
}
```

### 4.3 Exclusion d'ingrédients
```javascript
// L'utilisateur sélectionne "cheese" et "milk"
const excludedIngredients = ['cheese', 'milk'];

// On filtre les plats pour enlever ceux qui contiennent ces ingrédients
const filteredMeals = allMeals.filter(meal => {
    // Vérifier les 20 ingrédients possibles
    for (let i = 1; i <= 20; i++) {
        const ingredient = meal[`strIngredient${i}`];
        if (ingredient && excludedIngredients.includes(ingredient.toLowerCase())) {
            return false;  // Exclure ce plat
        }
    }
    return true;  // Garder ce plat
});
```

### 4.4 Tri par prix
Le prix est calculé côté client selon le nombre d'ingrédients :

```javascript
function calculatePrice(meal) {
    let ingredientCount = 0;
    for (let i = 1; i <= 20; i++) {
        if (meal[`strIngredient${i}`]) {
            ingredientCount++;
        }
    }
    return 8.99 + (ingredientCount * 0.50);
}

// Trier du moins cher au plus cher
meals.sort((a, b) => calculatePrice(a) - calculatePrice(b));
```


### Structure d'un plat retourné par l'API :
```javascript
{
    "idMeal": "52772",
    "strMeal": "Teriyaki Chicken",
    "strCategory": "Chicken",
    "strArea": "Japanese",
    "strInstructions": "Mix ingredients...",
    "strMealThumb": "https://themealdb.com/.../chicken.jpg",
    "strYoutube": "https://youtube.com/watch?v=abc123",
    "strIngredient1": "soy sauce",
    "strMeasure1": "3 tbs",
    "strIngredient2": "water",
    "strMeasure2": "3 tbs",
    // ... jusqu'à strIngredient20
}
```

**Champs importants** :
- `idMeal` : Identifiant unique
- `strMeal` : Nom du plat
- `strCategory` : Catégorie (Chicken, Dessert, etc.)
- `strArea` : Pays d'origine
- `strInstructions` : Étapes de préparation
- `strMealThumb` : Photo
- `strYoutube` : Lien vidéo
- `strIngredient1` à `strIngredient20` : Liste des ingrédients
- `strMeasure1` à `strMeasure20` : Quantités

---

## 6. Pages HTML

### 6.1 index.html
**Page principale** avec :
- Barre de recherche
- Filtres (pays, ingrédients à exclure, tri par prix)
- Grille de plats (cartes avec photo, nom, prix)
- Bouton pour voir les détails

### 6.2 details.html
**Page détails** d'une recette :
- Layout 2 colonnes : Image + Ingrédients
- Vidéo YouTube embarquée (si disponible)
- Étapes de préparation complètes

**Navigation** : `details.html?id=52772` (passe l'ID dans l'URL)

---

## 7. Avantages et Inconvénients de l'Architecture Actuelle

### ✅ Avantages
- **Simple** : Pas besoin de gérer une base de données
- **Gratuit** : TheMealDB est gratuit
- **Rapide à développer** : Moins de code
- **Pas de maintenance** : Les données sont maintenues par TheMealDB

### ❌ Inconvénients
- **Dépendance** : Si TheMealDB tombe, votre site ne marche plus
- **Pas de favoris** : Impossible de sauvegarder les favoris sans backend
- **Lenteur** : Chaque recherche fait un appel à l'API (pas de cache)
- **Limites API** : TheMealDB peut limiter le nombre de requêtes

---

## 8. Évolution vers un Vrai Backend

Si je veux améliorer le projet avec un vrai backend :

### 8.1 Ajouter une base de données MongoDB
```javascript
// Créer 3 collections
- users : { email, password, name }
- meals : { copie des données TheMealDB + price, viewCount }
- favorites : { userId, mealId, createdAt }
```

### 8.2 Créer des routes API Express
```javascript
// Routes publiques
app.get('/api/meals', getAllMeals);           // Liste
app.get('/api/meals/:id', getMealDetails);    // Détails
app.get('/api/search', searchMeals);          // Recherche

// Routes authentifiées
app.post('/api/auth/register', register);     // Inscription
app.post('/api/auth/login', login);           // Connexion
app.post('/api/favorites/:id', addFavorite);  // Ajouter favori
```

### 8.3 Synchronisation quotidienne
Script qui tourne chaque nuit pour copier TheMealDB dans votre base :
```javascript
// À 1h du matin
cron.schedule('0 1 * * *', async () => {
    const meals = await fetchAllMealsFromTheMealDB();
    await saveMealsToMongoDB(meals);
});
```

### 8.4 Avantages du vrai backend
- **Indépendance** : Votre propre copie des données
- **Favoris** : Sauvegarder les préférences utilisateurs
- **Cache** : Réponses plus rapides
- **Sécurité** : Authentification, validation
- **Analytics** : Tracker les plats populaires

---

## 9. Résumé de Votre Architecture

**Architecture actuelle** : Application web statique + API externe

```
┌─────────────┐
│  Navigateur │
│  (Client)   │
└──────┬──────┘
       │
       ├─────→ index.html / details.html (Pages)
       ├─────→ style.css (Design)
       ├─────→ recettes.js (Fonctions API)
       │
       └─────→ TheMealDB API (Données)
                └─ Recherche, filtres, détails
```

**Serveur Express** (main.js) : Sert juste les fichiers, n'intervient pas dans la logique

**Pas de base de données** : Tout vient de TheMealDB en temps réel
