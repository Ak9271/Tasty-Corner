// Équivalent JavaScript de recettes.py

/**
 * Récupère les plats commençant par une lettre
 */
async function getMealsByLetter(letter) {
    try {
        const url = `https://www.themealdb.com/api/json/v1/1/search.php?f=${letter}`;
        const response = await fetch(url);
        const data = await response.json();
        return data.meals || [];
    } catch (error) {
        console.error('Erreur:', error);
        return [];
    }
}

/**
 * Récupère tous les plats de plusieurs lettres
 */
async function getAllMeals() {
    const allMeals = [];
    const letters = 'abcdefghijklmnopqrstuvwxyz'.split('');
    
    for (const letter of letters) {
        const meals = await getMealsByLetter(letter);
        allMeals.push(...meals);
    }
    
    return allMeals;
}

/**
 * Recherche les plats par nom
 */
async function searchMeals(query) {
    try {
        const url = `https://www.themealdb.com/api/json/v1/1/search.php?s=${query}`;
        const response = await fetch(url);
        const data = await response.json();
        return data.meals || [];
    } catch (error) {
        console.error('Erreur:', error);
        return [];
    }
}

/**
 * Récupère les plats par ingrédient
 */
async function getMealsByIngredient(ingredient) {
    try {
        const url = `https://www.themealdb.com/api/json/v1/1/filter.php?i=${ingredient}`;
        const response = await fetch(url);
        const data = await response.json();
        return data.meals || [];
    } catch (error) {
        console.error('Erreur:', error);
        return [];
    }
}

/**
 * Récupère les plats par pays/cuisine
 */
async function getMealsByCountry(country) {
    try {
        const url = `https://www.themealdb.com/api/json/v1/1/filter.php?a=${country}`;
        const response = await fetch(url);
        const data = await response.json();
        return data.meals || [];
    } catch (error) {
        console.error('Erreur:', error);
        return [];
    }
}

/**
 * Recherche combinée dans le nom, les ingrédients et le pays
 */
async function searchCombined(query) {
    // Utiliser Set pour stocker les IDs uniques
    const resultIds = new Set();
    const uniqueMeals = {};
    
    try {
        // Recherche par nom
        const mealsByName = await searchMeals(query);
        if (mealsByName) {
            mealsByName.forEach(meal => {
                resultIds.add(meal.idMeal);
                uniqueMeals[meal.idMeal] = meal;
            });
        }
        
        // Recherche par ingrédient
        const mealsByIngredient = await getMealsByIngredient(query);
        if (mealsByIngredient) {
            mealsByIngredient.forEach(meal => {
                resultIds.add(meal.idMeal);
                uniqueMeals[meal.idMeal] = meal;
            });
        }
        
        // Recherche par pays
        const mealsByCountry = await getMealsByCountry(query);
        if (mealsByCountry) {
            mealsByCountry.forEach(meal => {
                resultIds.add(meal.idMeal);
                uniqueMeals[meal.idMeal] = meal;
            });
        }
        
        // Retourner les valeurs uniques
        return Object.values(uniqueMeals);
    } catch (error) {
        console.error('Erreur:', error);
        return [];
    }
}

/**
 * Récupère les détails complets d'un repas par ID
 */
async function getMealDetails(mealId) {
    try {
        const url = `https://www.themealdb.com/api/json/v1/1/lookup.php?i=${mealId}`;
        const response = await fetch(url);
        const data = await response.json();
        return data.meals ? data.meals[0] : null;
    } catch (error) {
        console.error('Erreur:', error);
        return null;
    }
}
