const map = L.map('map').setView([46.6, 2.4], 6);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

let reseau;
let marker;

// --- CETTE PARTIE ÉTAIT MANQUANTE : CHARGEMENT DES DONNÉES ---
fetch("rrn_concession.json")
    .then(response => {
        if (!response.ok) throw new Error("Fichier rrn_concession.json introuvable");
        return response.json();
    })
    .then(data => {
        reseau = data;
        console.log("Données chargées avec succès");
        // Affiche le réseau en bleu très clair pour confirmer le chargement visuel
        L.geoJSON(data, {style: {color: "#3498db", weight: 1, opacity: 0.3}}).addTo(map);
    })
    .catch(err => {
        console.error(err);
        alert("Erreur : Le fichier rrn_concession.json ne peut pas être lu.");
    });
// -----------------------------------------------------------

function verifier() {
    const input = document.getElementById("location").value;
    const resultDiv = document.getElementById("result");
    
    const matches = input.match(/-?\d+\.\d+/g);
    if (!matches || matches.length < 2) {
        resultDiv.innerHTML = "❌ Format incorrect";
        resultDiv.style.background = "#ffcccc";
        resultDiv.style.color = "black";
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

    // Utilisation d'un buffer de 200m pour les zones d'échangeurs
    const zoneRecherche = turf.buffer(point, 0.2, {units: 'kilometers'});

    // On cherche le segment correspondant
    segmentTrouve = reseau.features.find(f => {
        return !turf.booleanDisjoint(zoneRecherche, f);
    });

    if (segmentTrouve) {
        const p = segmentTrouve.properties;
        
        // Vérification de la concession dans les propriétés du fichier
        const infos = Object.values(p);
        const estConcede = infos.includes("C") || infos.includes("Concédé") || p.concession === "C";

        if (estConcede) {
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
