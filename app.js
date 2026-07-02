/* ============================================================
   CONFIGURATION ET CHARGEMENT
   ============================================================ */

const map = L.map('map').setView([46.6, 2.4], 6);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

let reseau = null;
let marker = null;

// Tolérance de recherche : distance max (en mètres) entre le point saisi
// et un segment du RRN pour qu'on considère qu'ils correspondent.
// Les tracés du RRN sont des lignes centrales généralisées, et une
// autoroute a souvent 2 chaussées séparées : une valeur trop faible
// (l'ancien code utilisait 1 m) fait rater des points pourtant bien
// sur l'autoroute. 30 m est un bon compromis, à ajuster si besoin.
const SEUIL_METRES = 30;

fetch("rrn_concession.json")
    .then(response => response.json())
    .then(data => {
        // Pré-calcul d'une bounding box par segment pour un filtrage rapide
        // avant le calcul de distance précis (perf : évite de calculer
        // pointToLineDistance sur les ~17000 segments à chaque clic).
        data.features.forEach(f => {
            if (!f.geometry) return;
            const coordsFlat = f.geometry.type === "MultiLineString"
                ? f.geometry.coordinates.flat()
                : f.geometry.coordinates;
            let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
            coordsFlat.forEach(([lon, lat]) => {
                if (lon < minLon) minLon = lon;
                if (lon > maxLon) maxLon = lon;
                if (lat < minLat) minLat = lat;
                if (lat > maxLat) maxLat = lat;
            });
            f._bbox = [minLon, minLat, maxLon, maxLat];
        });

        reseau = data;
        console.log(`Base de données chargée ✅ (${data.features.length} segments)`);

        // Affiche tout le réseau coloré par statut : rouge = concédé, vert = état
        L.geoJSON(reseau, {
            style: (feature) => {
                const c = String(feature.properties.concession || "").trim().toUpperCase();
                return {
                    color: c === "C" ? "#dc2626" : "#16a34a",
                    weight: 2,
                    opacity: 0.7
                };
            },
            onEachFeature: (feature, layer) => {
                const p = feature.properties;
                const statut = String(p.concession || "").trim().toUpperCase() === "C" ? "Concédé" : "Réseau État";
                layer.bindPopup(`<b>${p.route || "Route inconnue"}</b><br>${statut}<br>${p.classifica || ""}`);
            }
        }).addTo(map);
    })
    .catch(err => alert("Erreur de chargement du fichier JSON"));

/* ============================================================
   FONCTION DE VÉRIFICATION PONCTUELLE
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
    map.setView([lat, lon], 16);

    if (!reseau) {
        alert("La base de données n'est pas encore chargée, réessayez dans un instant.");
        return;
    }

    const point = turf.point([lon, lat]);

    // Marge de recherche en degrés pour le pré-filtrage bbox (~0.01° ≈ 1,1 km,
    // largement suffisant pour ne jamais rater un segment à SEUIL_METRES près).
    const marge = 0.01;

    let meilleurSegment = null;
    let distanceMin = Infinity;

    for (const f of reseau.features) {
        if (!f.geometry || !f._bbox) continue;

        // Filtrage rapide par bounding box avant le calcul précis
        const [minLon, minLat, maxLon, maxLat] = f._bbox;
        if (lon < minLon - marge || lon > maxLon + marge ||
            lat < minLat - marge || lat > maxLat + marge) {
            continue;
        }

        const lignes = f.geometry.type === "MultiLineString"
            ? f.geometry.coordinates.map(c => turf.lineString(c))
            : [turf.lineString(f.geometry.coordinates)];

        for (const ligne of lignes) {
            const d = turf.pointToLineDistance(point, ligne, { units: 'meters' });
            if (d < distanceMin) {
                distanceMin = d;
                meilleurSegment = f;
            }
        }
    }

    // Affichage des résultats
    resultDiv.classList.remove("hidden");

    if (meilleurSegment && distanceMin <= SEUIL_METRES) {
        const p = meilleurSegment.properties;
        const concessionVal = String(p.concession || "").trim().toUpperCase();
        const estConcede = concessionVal === "C";
        const distanceTxt = `${Math.round(distanceMin)} m`;
        const routeTxt = p.route ? ` — ${p.route}` : "";

        if (estConcede) {
            resultDiv.className = "mt-6 p-4 rounded-xl text-center bg-red-100 text-red-700 border border-red-200";
            resultText.innerHTML = `🔴 ROUTE CONCÉDÉE (GESTION PRIVÉE)<br><span class="text-xs font-normal opacity-75">${routeTxt} (segment à ${distanceTxt})</span>`;
        } else {
            resultDiv.className = "mt-6 p-4 rounded-xl text-center bg-green-100 text-green-700 border border-green-200";
            resultText.innerHTML = `✅ RÉSEAU ÉTAT (DIR - PUBLIC)<br><span class="text-xs font-normal opacity-75">${routeTxt} (segment à ${distanceTxt})</span>`;
        }
    } else {
        resultDiv.className = "mt-6 p-4 rounded-xl text-center bg-slate-100 text-slate-700 border border-slate-200";
        const infoProche = meilleurSegment
            ? ` (segment le plus proche : ${meilleurSegment.properties.route || '?'} à ${Math.round(distanceMin)} m)`
            : "";
        resultText.innerHTML = `⚪️ HORS RÉSEAU NATIONAL (DÉPARTEMENTALE OU COMMUNALE)<br><span class="text-xs font-normal opacity-75">${infoProche}</span>`;
    }
}
