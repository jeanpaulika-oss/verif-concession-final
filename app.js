/* ============================================================
   CONFIGURATION INITIALE DE LA CARTE
   ============================================================ */

// Initialisation de la carte centrée sur la France
const map = L.map('map').setView([46.6, 2.4], 6);

// Chargement des tuiles OpenStreetMap
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

let reseau = null;
let marker = null;

/* ============================================================
   CHARGEMENT DES DONNÉES GÉOGRAPHIQUES (JSON)
   ============================================================ */

console.log("Chargement du réseau routier...");

fetch("rrn_concession.json")
    .then(response => {
        if (!response.ok) {
            throw new Error("Fichier rrn_concession.json introuvable au racine du site");
        }
        return response.json();
    })
    .then(data => {
        console.log("Données chargées avec succès");
        reseau = data;

        // Affichage léger du réseau sur la carte pour repère visuel
        L.geoJSON(reseau, {
            style: {
                color: "#3498db",
                weight: 2,
                opacity: 0.2
            }
        }).addTo(map);
    })
    .catch(err => {
        console.error("Erreur lors du chargement :", err);
        alert("Erreur critique : Impossible de charger la base de données du réseau routier.");
    });

/* ============================================================
   FONCTION PRINCIPALE DE VÉRIFICATION
   ============================================================ */

function verifier() {
    const input = document.getElementById("location").value;
    const resultDiv = document.getElementById("result");
    const resultText = document.getElementById("result-text");

    // Extraction des coordonnées (Latitude, Longitude) via RegEx
    const matches = input.match(/-?\d+\.\d+/g);

    if (!matches || matches.length < 2) {
        afficherErreur("Format incorrect. Utilisez : Latitude, Longitude");
        return;
    }

    const lat = parseFloat(matches[0]);
    const lon = parseFloat(matches[1]);

    // Mise à jour du marqueur sur la carte
    if (marker) map.removeLayer(marker);
    marker = L.marker([lat, lon]).addTo(map);
    map.setView([lat, lon], 15);

    if (!reseau) {
        afficherErreur("Base de données en cours de chargement...");
        return;
    }

    // Création d'un point Turf et d'une zone tampon (buffer) de 200 mètres
    const point = turf.point([lon, lat]);
    const zoneRecherche = turf.buffer(point, 0.020, { units: 'kilometers' });

    // Recherche du segment de route correspondant dans le GeoJSON
    let segmentTrouve = reseau.features.find(f => {
        if (!f.geometry) return false;

        // Gestion des routes complexes (MultiLineString)
        if (f.geometry.type === "MultiLineString") {
            return f.geometry.coordinates.some(line => {
                const ligne = turf.lineString(line);
                return !turf.booleanDisjoint(zoneRecherche, ligne);
            });
        } else {
            return !turf.booleanDisjoint(zoneRecherche, f);
        }
    });

    // Affichage des résultats avec le nouveau design
    resultDiv.classList.remove("hidden");

    if (segmentTrouve) {
        const p = segmentTrouve.properties;
        
        // Vérification du statut de concession (C = Concédé, N = Non concédé)
        // On vérifie plusieurs propriétés possibles selon la source du JSON
        const estConcede = 
            p.concession === "C" || 
            p.statut === "Concédé" || 
            Object.values(p).includes("C");

        if (estConcede) {
            resultDiv.className = "mt-6 p-4 rounded-xl text-center bg-red-100 text-red-700 border border-red-200";
            resultText.innerHTML = "🔴 ROUTE CONCÉDÉE (SOCIÉTÉ PRIVÉE)";
        } else {
            resultDiv.className = "mt-6 p-4 rounded-xl text-center bg-green-100 text-green-700 border border-green-200";
            resultText.innerHTML = "✅ RÉSEAU ÉTAT (DIR - PUBLIC)";
        }
    } else {
        resultDiv.className = "mt-6 p-4 rounded-xl text-center bg-slate-100 text-slate-700 border border-slate-200";
        resultText.innerHTML = "⚪️ HORS RÉSEAU NATIONAL";
    }
}

/* ============================================================
   FONCTION UTILITAIRE : AFFICHAGE ERREUR
   ============================================================ */

function afficherErreur(message) {
    const resultDiv = document.getElementById("result");
    const resultText = document.getElementById("result-text");
    
    resultDiv.classList.remove("hidden");
    resultDiv.className = "mt-6 p-4 rounded-xl text-center bg-orange-100 text-orange-700 border border-orange-200";
    resultText.innerHTML = "⚠️ " + message;
}

