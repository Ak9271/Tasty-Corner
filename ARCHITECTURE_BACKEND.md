# Architecture Backend et Données - TastyCorner

## Table des matières
1. [Vue d'ensemble](#vue-densemble)
2. [Fonctionnalités Backend](#fonctionnalités-backend)
3. [Architecture des données](#architecture-des-données)
4. [Schéma de base de données](#schéma-de-base-de-données)
5. [API Endpoints](#api-endpoints)

---

## Vue d'ensemble

TastyCorner est une application web de découverte et recherche de recettes culinaires. L'architecture backend est conçue pour offrir une expérience utilisateur fluide avec des fonctionnalités avancées de recherche, filtrage et recommandation.

### Technologies recommandées
- **Backend**: Node.js + Express.js
- **Base de données**: PostgreSQL (données relationnelles) + Redis (cache)
- **ORM**: Prisma ou Sequelize
- **API externe**: TheMealDB API (source de données actuelle)
- **Authentification**: JWT (JSON Web Tokens)

---

## Fonctionnalités Backend

### 1. Système de Recherche

#### 1.1 Recherche Full-Text
La recherche utilise une approche **multi-critères** combinant plusieurs sources :

**Fonctionnement actuel :**
```javascript
// Recherche combinée dans 3 dimensions
- Nom du plat (searchMeals)
- Ingrédients (getMealsByIngredient)
- Pays/Cuisine (getMealsByCountry)
```

**Architecture backend recommandée :**
- **PostgreSQL Full-Text Search** avec `tsvector` pour indexation
- **Pondération des résultats** selon la pertinence :
  - Correspondance exacte dans le titre : poids 4
  - Correspondance dans les ingrédients : poids 2
  - Correspondance dans le pays/catégorie : poids 1

**Exemple de requête SQL :**
```sql
SELECT m.*, 
       ts_rank(
         setweight(to_tsvector('french', m.name), 'A') || 
         setweight(to_tsvector('french', m.ingredients), 'B') || 
         setweight(to_tsvector('french', m.category), 'C'),
         plainto_tsquery('french', $1)
       ) as rank
FROM meals m
WHERE to_tsvector('french', m.name || ' ' || m.ingredients || ' ' || m.category) 
      @@ plainto_tsquery('french', $1)
ORDER BY rank DESC
LIMIT 20 OFFSET $2;
```

#### 1.2 Fuzzy Search (Recherche approximative)
Pour gérer les fautes de frappe et variations orthographiques :

- **Algorithme Levenshtein** avec distance maximale de 2
- **Trigram similarity** (extension `pg_trgm` de PostgreSQL)
- Suggestions automatiques après 3 caractères

**Exemple :**
```sql
SELECT name, similarity(name, $1) as sml
FROM meals
WHERE similarity(name, $1) > 0.3
ORDER BY sml DESC
LIMIT 5;
```

---

### 2. Système de Filtrage

#### 2.1 Filtrage par Pays/Cuisine
**Implémentation :**
- Index sur la colonne `area` pour performances optimales
- Cache Redis des listes de pays disponibles (TTL: 24h)

```javascript
// Endpoint: GET /api/meals?country=Italian
SELECT * FROM meals 
WHERE area = $1 
AND active = true
ORDER BY popularity DESC;
```

#### 2.2 Exclusion d'Ingrédients
**Logique métier :**
1. Normalisation des ingrédients (minuscules, trim)
2. Table de jonction `meal_ingredients` pour requêtes efficaces
3. Recherche inversée (NOT IN)

```sql
SELECT DISTINCT m.* 
FROM meals m
LEFT JOIN meal_ingredients mi ON m.id = mi.meal_id
LEFT JOIN ingredients i ON mi.ingredient_id = i.id
WHERE m.id NOT IN (
  SELECT mi2.meal_id 
  FROM meal_ingredients mi2
  JOIN ingredients i2 ON mi2.ingredient_id = i2.id
  WHERE LOWER(i2.name) = ANY($1::text[])
)
ORDER BY m.created_at DESC;
```

#### 2.3 Filtrage Multiple
Combinaison de plusieurs filtres avec opérateur AND :
- Pays ET exclusions d'ingrédients ET catégorie
- Construction dynamique des requêtes SQL

---

### 3. Système de Tri

#### 3.1 Tri par Prix
**Génération du prix :**
Actuellement généré côté client, devrait être côté serveur :

```javascript
// Backend pricing algorithm
function calculatePrice(meal) {
  const basePrice = 8.99;
  const ingredientCount = countIngredients(meal);
  const categoryMultiplier = getCategoryMultiplier(meal.category);
  const areaMultiplier = getAreaMultiplier(meal.area);
  
  return (basePrice + (ingredientCount * 0.5)) * 
         categoryMultiplier * 
         areaMultiplier;
}
```

**Stockage :**
- Colonne `calculated_price` dans la table `meals`
- Recalcul automatique via trigger PostgreSQL lors de modification
- Index sur `calculated_price` pour tri rapide

```sql
-- Tri croissant
SELECT * FROM meals 
WHERE active = true 
ORDER BY calculated_price ASC 
LIMIT 20 OFFSET $1;

-- Tri décroissant
SELECT * FROM meals 
WHERE active = true 
ORDER BY calculated_price DESC 
LIMIT 20 OFFSET $1;
```

#### 3.2 Autres options de tri
- **Par popularité** : nombre de vues/favoris
- **Par date** : plats récemment ajoutés
- **Par note** : moyenne des évaluations utilisateurs

---

### 4. Pagination

**Stratégie :**
- Pagination offset-based pour la navigation standard
- Cursor-based pagination pour les feeds infinis

**Implémentation :**
```javascript
// Offset pagination
GET /api/meals?page=2&limit=20

// Backend
const page = parseInt(req.query.page) || 1;
const limit = parseInt(req.query.limit) || 20;
const offset = (page - 1) * limit;

const meals = await db.meals.findMany({
  take: limit,
  skip: offset,
  where: { active: true }
});

const total = await db.meals.count({ where: { active: true } });

return {
  data: meals,
  pagination: {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
    hasNext: page * limit < total,
    hasPrev: page > 1
  }
};
```

---

### 5. Système de Favoris

**Fonctionnement :**
1. Authentification requise (JWT)
2. Table de jonction `user_favorites`
3. Actions : ajouter, supprimer, lister

**Endpoints :**
```javascript
POST   /api/favorites/:mealId    // Ajouter aux favoris
DELETE /api/favorites/:mealId    // Retirer des favoris
GET    /api/favorites            // Lister mes favoris
GET    /api/favorites/check/:id  // Vérifier si en favori
```

**Requête SQL :**
```sql
-- Ajouter un favori
INSERT INTO user_favorites (user_id, meal_id, created_at)
VALUES ($1, $2, NOW())
ON CONFLICT (user_id, meal_id) DO NOTHING;

-- Lister les favoris
SELECT m.*, uf.created_at as favorited_at
FROM meals m
JOIN user_favorites uf ON m.id = uf.meal_id
WHERE uf.user_id = $1
ORDER BY uf.created_at DESC;
```

---

### 6. Plats Similaires / Recommandations

**Algorithme de similarité :**

#### 6.1 Critères de similarité
1. **Même catégorie** (poids: 40%)
2. **Même pays/cuisine** (poids: 30%)
3. **Ingrédients communs** (poids: 30%)

#### 6.2 Implémentation
```javascript
function findSimilarMeals(mealId, limit = 4) {
  return db.$queryRaw`
    WITH target_meal AS (
      SELECT category, area, 
             ARRAY_AGG(i.name) as ingredients
      FROM meals m
      JOIN meal_ingredients mi ON m.id = mi.meal_id
      JOIN ingredients i ON mi.ingredient_id = i.id
      WHERE m.id = ${mealId}
      GROUP BY m.id, m.category, m.area
    )
    SELECT m.*,
           (
             CASE WHEN m.category = tm.category THEN 40 ELSE 0 END +
             CASE WHEN m.area = tm.area THEN 30 ELSE 0 END +
             (
               SELECT COUNT(*) * 3 
               FROM meal_ingredients mi2
               JOIN ingredients i2 ON mi2.ingredient_id = i2.id
               WHERE mi2.meal_id = m.id 
               AND i2.name = ANY(tm.ingredients)
             )
           ) as similarity_score
    FROM meals m, target_meal tm
    WHERE m.id != ${mealId}
    AND m.active = true
    ORDER BY similarity_score DESC
    LIMIT ${limit};
  `;
}
```

#### 6.3 Machine Learning (évolution future)
- Recommandation collaborative basée sur les favoris des utilisateurs
- Analyse des patterns de consultation
- Utilisation de TensorFlow.js pour recommandations personnalisées

---

### 7. Système de Cache

**Stratégie Redis :**
```javascript
// Cache des plats populaires
Key: "meals:popular"
TTL: 1 heure
Value: JSON array des 50 plats les plus populaires

// Cache des résultats de recherche
Key: "search:{query}:{filters}"
TTL: 15 minutes
Value: JSON array des résultats

// Cache des pays disponibles
Key: "countries:list"
TTL: 24 heures
Value: JSON array des pays

// Cache des ingrédients
Key: "ingredients:all"
TTL: 12 heures
Value: JSON array de tous les ingrédients
```

---

## Architecture des Données

### Schéma de Base de Données

```
┌─────────────────┐
│     USERS       │
├─────────────────┤
│ id (PK)         │
│ email           │
│ password_hash   │
│ name            │
│ created_at      │
│ updated_at      │
└────────┬────────┘
         │
         │ 1:N
         │
┌────────▼────────────┐
│  USER_FAVORITES     │
├─────────────────────┤
│ id (PK)             │
│ user_id (FK)        │
│ meal_id (FK)        │
│ created_at          │
└──────────┬──────────┘
           │
           │ N:1
           │
┌──────────▼──────────┐       ┌───────────────────┐
│      MEALS          │       │   CATEGORIES      │
├─────────────────────┤       ├───────────────────┤
│ id (PK)             │◄──┐   │ id (PK)           │
│ name                │   │   │ name              │
│ category_id (FK)    │───┘   │ description       │
│ area_id (FK)        │───┐   └───────────────────┘
│ instructions        │   │
│ thumb_url           │   │   ┌───────────────────┐
│ youtube_url         │   └──►│     AREAS         │
│ calculated_price    │       ├───────────────────┤
│ view_count          │       │ id (PK)           │
│ favorite_count      │       │ name              │
│ active              │       │ description       │
│ created_at          │       └───────────────────┘
│ updated_at          │
└──────────┬──────────┘
           │
           │ N:M
           │
┌──────────▼──────────────┐
│   MEAL_INGREDIENTS      │
├─────────────────────────┤
│ id (PK)                 │
│ meal_id (FK)            │
│ ingredient_id (FK)      │
│ measure                 │
│ order                   │
└──────────┬──────────────┘
           │
           │ N:1
           │
┌──────────▼──────────┐
│    INGREDIENTS      │
├─────────────────────┤
│ id (PK)             │
│ name                │
│ normalized_name     │
│ created_at          │
└─────────────────────┘
```

---

### Description des Tables Principales

#### 1. Table `users`
Stocke les informations des utilisateurs.

```sql
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  CONSTRAINT email_format CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}$')
);

CREATE INDEX idx_users_email ON users(email);
```

#### 2. Table `meals`
Plat principal de l'application.

```sql
CREATE TABLE meals (
  id SERIAL PRIMARY KEY,
  external_id VARCHAR(50) UNIQUE, -- ID de TheMealDB
  name VARCHAR(255) NOT NULL,
  category_id INTEGER REFERENCES categories(id),
  area_id INTEGER REFERENCES areas(id),
  instructions TEXT,
  thumb_url TEXT,
  youtube_url TEXT,
  calculated_price DECIMAL(10,2),
  view_count INTEGER DEFAULT 0,
  favorite_count INTEGER DEFAULT 0,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  -- Index full-text search
  search_vector tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('french', coalesce(name, '')), 'A') ||
    setweight(to_tsvector('french', coalesce(instructions, '')), 'C')
  ) STORED
);

-- Index pour recherche
CREATE INDEX idx_meals_search ON meals USING GIN(search_vector);
CREATE INDEX idx_meals_category ON meals(category_id);
CREATE INDEX idx_meals_area ON meals(area_id);
CREATE INDEX idx_meals_price ON meals(calculated_price);
CREATE INDEX idx_meals_popularity ON meals(favorite_count DESC, view_count DESC);
```

#### 3. Table `categories`
Catégories de plats (Dessert, Seafood, Chicken, etc.)

```sql
CREATE TABLE categories (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) UNIQUE NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_categories_slug ON categories(slug);
```

#### 4. Table `areas`
Pays/cuisines (Italian, French, Chinese, etc.)

```sql
CREATE TABLE areas (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) UNIQUE NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_areas_slug ON areas(slug);
```

#### 5. Table `ingredients`
Liste de tous les ingrédients.

```sql
CREATE TABLE ingredients (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  normalized_name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  
  CONSTRAINT unique_normalized UNIQUE(normalized_name)
);

CREATE INDEX idx_ingredients_normalized ON ingredients(normalized_name);
```

#### 6. Table `meal_ingredients`
Relation N:M entre plats et ingrédients.

```sql
CREATE TABLE meal_ingredients (
  id SERIAL PRIMARY KEY,
  meal_id INTEGER REFERENCES meals(id) ON DELETE CASCADE,
  ingredient_id INTEGER REFERENCES ingredients(id) ON DELETE CASCADE,
  measure VARCHAR(100), -- "1 cup", "200g", etc.
  order_index INTEGER DEFAULT 0, -- Ordre d'affichage
  created_at TIMESTAMP DEFAULT NOW(),
  
  CONSTRAINT unique_meal_ingredient UNIQUE(meal_id, ingredient_id)
);

CREATE INDEX idx_meal_ingredients_meal ON meal_ingredients(meal_id);
CREATE INDEX idx_meal_ingredients_ingredient ON meal_ingredients(ingredient_id);
```

#### 7. Table `user_favorites`
Favoris des utilisateurs.

```sql
CREATE TABLE user_favorites (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  meal_id INTEGER REFERENCES meals(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  
  CONSTRAINT unique_user_favorite UNIQUE(user_id, meal_id)
);

CREATE INDEX idx_favorites_user ON user_favorites(user_id);
CREATE INDEX idx_favorites_meal ON user_favorites(meal_id);
```

---

## API Endpoints

### 1. Endpoints Publics (sans authentification)

#### Recherche et listing
```
GET    /api/meals                    # Liste tous les plats (paginé)
GET    /api/meals/:id                # Détails d'un plat
GET    /api/meals/search?q=pasta     # Recherche
GET    /api/meals/similar/:id        # Plats similaires
GET    /api/categories               # Liste des catégories
GET    /api/areas                    # Liste des pays/cuisines
GET    /api/ingredients              # Liste des ingrédients
```

**Exemple de paramètres de requête :**
```
GET /api/meals?
  page=1&
  limit=20&
  country=Italian&
  excludeIngredients=cheese,milk&
  sortBy=price&
  sortOrder=asc
```

### 2. Endpoints Authentifiés

#### Authentification
```
POST   /api/auth/register            # Inscription
POST   /api/auth/login               # Connexion
POST   /api/auth/logout              # Déconnexion
GET    /api/auth/me                  # Profil utilisateur
```

#### Favoris
```
GET    /api/favorites                # Mes favoris
POST   /api/favorites/:mealId        # Ajouter un favori
DELETE /api/favorites/:mealId        # Retirer un favori
GET    /api/favorites/check/:mealId  # Vérifier si en favori
```

---

## Triggers et Fonctions PostgreSQL

### Trigger : Mise à jour automatique du compteur de favoris

```sql
CREATE OR REPLACE FUNCTION update_favorite_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE meals 
    SET favorite_count = favorite_count + 1 
    WHERE id = NEW.meal_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE meals 
    SET favorite_count = favorite_count - 1 
    WHERE id = OLD.meal_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_favorite_count
AFTER INSERT OR DELETE ON user_favorites
FOR EACH ROW EXECUTE FUNCTION update_favorite_count();
```

### Trigger : Recalcul du prix lors de modification

```sql
CREATE OR REPLACE FUNCTION recalculate_price()
RETURNS TRIGGER AS $$
DECLARE
  ingredient_count INTEGER;
  base_price DECIMAL(10,2) := 8.99;
BEGIN
  SELECT COUNT(*) INTO ingredient_count
  FROM meal_ingredients
  WHERE meal_id = NEW.id;
  
  NEW.calculated_price := base_price + (ingredient_count * 0.5);
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_recalculate_price
BEFORE INSERT OR UPDATE ON meals
FOR EACH ROW EXECUTE FUNCTION recalculate_price();
```

---

## Sécurité et Performance

### Sécurité
1. **Authentification JWT** avec refresh tokens
2. **Rate limiting** : 100 requêtes/minute par IP
3. **Validation des entrées** avec Joi/Zod
4. **Protection CSRF** pour les endpoints authentifiés
5. **CORS** configuré selon l'environnement
6. **SQL Injection** : utilisation de requêtes paramétrées
7. **XSS** : sanitization des entrées utilisateur

### Performance
1. **Index database** sur toutes les colonnes de recherche/tri
2. **Cache Redis** pour requêtes fréquentes
3. **CDN** pour images (CloudFlare/CloudFront)
4. **Lazy loading** des images
5. **Pagination** obligatoire sur les listes
6. **Connection pooling** PostgreSQL
7. **Compression gzip** des réponses API

---

## Migration des Données

### Synchronisation avec TheMealDB

Script de synchronisation quotidien :

```javascript
async function syncMealsFromAPI() {
  // 1. Récupérer tous les plats de l'API
  const letters = 'abcdefghijklmnopqrstuvwxyz'.split('');
  
  for (const letter of letters) {
    const meals = await fetchMealsByLetter(letter);
    
    for (const meal of meals) {
      // 2. Upsert meal
      await db.meals.upsert({
        where: { external_id: meal.idMeal },
        update: {
          name: meal.strMeal,
          instructions: meal.strInstructions,
          thumb_url: meal.strMealThumb,
          youtube_url: meal.strYoutube,
          updated_at: new Date()
        },
        create: {
          external_id: meal.idMeal,
          name: meal.strMeal,
          category: { connectOrCreate: { ... } },
          area: { connectOrCreate: { ... } },
          // ...
        }
      });
      
      // 3. Synchroniser les ingrédients
      await syncIngredients(meal);
    }
  }
  
  console.log('Synchronisation terminée');
}
```

---

## Monitoring et Logging

### Logs à implémenter
1. **Requêtes lentes** (> 1s)
2. **Erreurs API** externes
3. **Tentatives d'accès non autorisées**
4. **Statistiques d'utilisation** (recherches populaires, plats consultés)

### Métriques
- Temps de réponse moyen par endpoint
- Taux de succès/erreur
- Nombre de requêtes par minute
- Cache hit ratio
- Utilisation CPU/Mémoire

---

## Évolutions Futures

1. **Système de notation** : permettre aux utilisateurs de noter les plats
2. **Commentaires** : partager des avis et conseils
3. **Liste de courses** : générer automatiquement à partir des favoris
4. **Planning de repas** : calendrier hebdomadaire
5. **Partage social** : intégration Facebook, Instagram
6. **Traduction** : support multilingue
7. **Mode hors-ligne** : PWA avec cache local
8. **Recommandations ML** : basées sur l'historique utilisateur

---

## Conclusion

Cette architecture backend est conçue pour être :
- **Scalable** : capable de gérer des millions de plats et utilisateurs
- **Performante** : cache Redis, indexes optimisés
- **Maintenable** : code modulaire, documentation complète
- **Sécurisée** : authentification JWT, validation des données
- **Évolutive** : facile d'ajouter de nouvelles fonctionnalités

L'utilisation de PostgreSQL permet des requêtes complexes efficaces, tandis que Redis optimise les performances pour les données fréquemment consultées.
