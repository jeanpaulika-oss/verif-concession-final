console.log("APP JS CHARGÉ ✅");

const map = L.map('map').setView([46.6, 2.4], 6);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

let reseau = null;
let marker = null;

console.log("Chargement du JSON...");

/* =======================
   CHARGEMENT DES DONNÉES
   ======================= */

fetch("rrn_concession.json")
    .then(response => {
        if (!response.ok) {
            throw new Error("Fichier rrn_concession.json introuvable");
        }
        return response.json();
    })
    .then(data => {

        console.log("JSON chargé ✅");
        console.log("TYPE =", data.type);

        reseau = data;

        if (!reseau.features) {
            console.error("❌ reseau.features n'existe PAS");
            console.log("Contenu reçu :", reseau);
            alert("Erreur structure JSON");
            return;
        }

        console.log("Nombre de segments :", reseau.features.length);

        // Affichage visuel du réseau
        L.geoJSON(reseau, {
            style: {
                color: "#3498db",
                weight: 1,
                opacity: 0.3
            }
        }).addTo(map);

    })
    .catch(err => {
        console.error("ERREUR FETCH ❌", err);
        alert("Impossible de charger rrn_concession.json");
    });

/* =======================
   FONCTION DE VÉRIFICATION
   ======================= */

function verifier() {

    console.log("Vérification lancée 🚀");

    const input = document.getElementById("location").value;
    const resultDiv = document.getElementById("result");

    console.log("Input =", input);

    const matches = input.match(/-?\d+\.\d+/g);

    if (!matches || matches.length < 2) {
        resultDiv.innerHTML = "❌ Format incorrect";
        resultDiv.style.background = "#ffcccc";
        resultDiv.style.color = "black";
        console.warn("Format invalide ❌");
        return;
    }

    const lat = parseFloat(matches[0]);
    const lon = parseFloat(matches[1]);

    console.log("Coordonnées :", lat, lon);

    if (marker) map.removeLayer(marker);

    marker = L.marker([lat, lon]).addTo(map);
    map.setView([lat, lon], 15);

    if (!reseau) {
        console.warn("⚠️ Données non chargées");
        resultDiv.innerText = "⚠️ Données non chargées";
        resultDiv.style.background = "#f39c12";
        resultDiv.style.color = "white";
        return;
    }

    const point = turf.point([lon, lat]);

    console.log("Point Turf :", point);

    // Buffer LARGE pour test sécurisé
    const zoneRecherche = turf.buffer(point, 1, { units: 'kilometers' });

    console.log("Zone recherche créée ✅");

    let segmentTrouve = null;

    segmentTrouve = reseau.features.find(f => {

        if (!f.geometry) return false;

        // Gestion MultiLineString (TRÈS IMPORTANT)
        if (f.geometry.type === "MultiLineString") {

            return f.geometry.coordinates.some(line => {

                const ligne = turf.lineString(line);

                return !turf.booleanDisjoint(zoneRecherche, ligne);
            });

        } else {

            return !turf.booleanDisjoint(zoneRecherche, f);
        }
    });

    console.log("Segment trouvé :", segmentTrouve);

    if (segmentTrouve) {

        const p = segmentTrouve.properties;

        console.log("Propriétés :", p);

        const infos = Object.values(p);

        const estConcede =
            infos.includes("C") ||
            infos.includes("Concédé") ||
            infos.includes("Concede") ||
            p.concession === "C";

        if (estConcede) {
            resultDiv.style.background = "#e74c3c";
            resultDiv.innerHTML = "🔴 ROUTE CONCÉDÉE";
        } else {
            resultDiv.style.background = "#2ecc71";
            resultDiv.innerHTML = "✅ NON CONCÉDÉ";
        }

    } else {

        console.warn("Aucun segment trouvé ⚠️");

        resultDiv.style.background = "#95a5a6";
        resultDiv.innerHTML = "⚠️ Hors réseau national";
    }

    resultDiv.style.color = "white";
}
