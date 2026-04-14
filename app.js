/* ============================================================
   CONFIGURATION ET CHARGEMENT
   ============================================================ */

const map = L.map('map').setView([46.6, 2.4], 6);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

let reseau = null;
let marker = null;

fetch("rrn_concession.json")
    .then(response => response.json())
    .then(data => {
        reseau = data;
        console.log("Base de données chargée ✅");
        // Optionnel : affiche le réseau en bleu très clair pour vérification
        L.geoJSON(reseau, { style: { color: "#3498db", weight: 1, opacity: 0.1 } }).addTo(map);
    })
    .catch(err => alert("Erreur de chargement du fichier JSON"));

/* ============================================================
   FONCTION DE VÉRIFICATION OPTIMISÉE
   ============================================================ */

function verifier() {
    const input = document.getElementById("location").value;
    const resultDiv = document.getElementById("result");
    const resultText = document.getElementById("result-text");

    // Extraction des coordonnées
    const matches = input.match(/-?\d+\.\d+/g);
    if (!matches || matches.length < 2) {
        alert("Format invalide. Utilisez 'Latitude, Longitude'");
        return;
    }

    const lat = parseFloat(matches[0]);
    const lon = parseFloat(matches[1]);

    // Mise à jour visuelle de la carte
    if (marker) map.removeLayer(marker);
    marker = L.marker([lat, lon]).addTo(map);
    map.setView([lat, lon], 16); // Zoom plus proche pour vérification

    if (!reseau) return;

    // Création du point et d'un buffer de 3 mètres (0.003 km) pour plus de précision
    const point = turf.point([lon, lat]);
    const zoneRecherche = turf.buffer(point, 0.001, { units: 'kilometers' });

    // Recherche du segment
    let segmentTrouve = reseau.features.find(f => {
        if (!f.geometry) return false;
        if (f.geometry.type === "MultiLineString") {
            return f.geometry.coordinates.some(line => {
                const ligne = turf.lineString(line);
                return !turf.booleanDisjoint(zoneRecherche, ligne);
            });
        }
        return !turf.booleanDisjoint(zoneRecherche, f);
    });

    // Affichage des résultats
    resultDiv.classList.remove("hidden");

    if (segmentTrouve) {
        const p = segmentTrouve.properties;
        
        // Extraction et nettoyage des propriétés pour éviter les erreurs de saisie dans le JSON
        const concessionVal = String(p.concession || "").trim().toUpperCase();
        const statutVal = String(p.statut || "").trim().toUpperCase();

        // On considère concédé si on trouve "C" ou le mot "CONCEDE"
        const estConcede = (concessionVal === "C" || statutVal.includes("CONCEDE") || statutVal.includes("CONCÉDÉ"));

        if (estConcede) {
            resultDiv.className = "mt-6 p-4 rounded-xl text-center bg-red-100 text-red-700 border border-red-200";
            resultText.innerHTML = "🔴 ROUTE CONCÉDÉE (GESTION PRIVÉE)";
        } else {
            resultDiv.className = "mt-6 p-4 rounded-xl text-center bg-green-100 text-green-700 border border-green-200";
            resultText.innerHTML = "✅ RÉSEAU ÉTAT (DIR - PUBLIC)";
        }
    } else {
        // Cas où la route n'est pas dans le fichier (ex: départementale)
        resultDiv.className = "mt-6 p-4 rounded-xl text-center bg-slate-100 text-slate-700 border border-slate-200";
        resultText.innerHTML = "⚪️ HORS RÉSEAU NATIONAL (DÉPARTEMENTALE OU COMMUNALE)";
    }
}



