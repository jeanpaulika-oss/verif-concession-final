const map = L.map('map').setView([46.6, 2.4], 6);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

let reseau;
let marker;

// CHANGER LE NOM ICI SI TON FICHIER EST .JSON OU .GEOJSON
const NOM_FICHIER = "rrn_concession.json"; 

fetch(NOM_FICHIER + "?v=" + Date.now())
    .then(response => {
        if (!response.ok) throw new Error("Fichier introuvable sur le serveur");
        return response.json();
    })
    .then(data => {
        reseau = data;
        console.log("Données chargées avec succès");
        // Affiche le réseau en bleu très clair pour confirmer le chargement
        L.geoJSON(data, {style: {color: "#3498db", weight: 1, opacity: 0.3}}).addTo(map);
    })
    .catch(err => {
        console.error(err);
        alert("Erreur : Le fichier " + NOM_FICHIER + " ne peut pas être lu. Vérifiez le nom sur GitHub.");
    });

function verifier() {
    const input = document.getElementById("location").value;
    const resultDiv = document.getElementById("result");
    
    // Extraction des coordonnées (accepte virgules et points)
    const matches = input.match(/-?\d+\.\d+/g);
    if (!matches || matches.length < 2) {
        resultDiv.innerHTML = "❌ Format incorrect";
        resultDiv.style.background = "#ffcccc";
        return;
    }

    const lat = parseFloat(matches[0]);
    const lon = parseFloat(matches[1]);

    if (marker) map.removeLayer(marker);
    marker = L.marker([lat, lon]).addTo(map);
    map.setView([lat, lon], 15);

    if (!reseau) {
        resultDiv.innerText = "⚠️ Données non chargées";
        return;
    }

    const point = turf.point([lon, lat]);
    let segmentTrouve = null;

    // Buffer de 150m pour compenser l'imprécision GPS
    const zoneRecherche = turf.buffer(point, 0.15, {units: 'kilometers'});

    reseau.features.forEach(f => {
        if (!turf.booleanDisjoint(zoneRecherche, f)) {
            segmentTrouve = f;
        }
    });

    if (segmentTrouve) {
        const p = segmentTrouve.properties;
        // On teste tous les noms de colonnes possibles
        const c = p.concessionPr || p.concession || p.CONCESSION || p.statut || "N";

        if (c === "C" || c === "Concédé") {
            resultDiv.style.background = "#e74c3c";
            resultDiv.innerHTML = "🔴 ROUTE CONCÉDÉE";
        } else {
            resultDiv.style.background = "#2ecc71";
            resultDiv.innerHTML = "✅ NON CONCÉDÉ";
        }
    } else {
        resultDiv.style.background = "#95a5a6";
        resultDiv.innerHTML = "⚠️ Hors réseau national";
    }
    resultDiv.style.color = "white";
}