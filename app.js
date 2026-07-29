/* ============================================================
   CONFIGURATION ET CHARGEMENT
   ============================================================ */

const map = L.map('map').setView([46.6, 2.4], 6);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

let reseau = null;
let marker = null;
let dateReferenceMax = null; // Amélioration E : date de fraîcheur des données RRN

// ------------------------------------------------------------
// Amélioration D : seuils de tolérance différenciés.
// Les autoroutes/RN "principales" ont une emprise large (chaussées
// séparées comprises), un seuil de 30 m reste pertinent.
// Les bretelles (entrées/sorties, péages, aires de service) sont
// des tronçons courts et étroits, souvent à quelques mètres d'un
// autre tronçon de statut différent (analyse faite sur le jeu de
// données : 61 couples de segments à statut C/N opposé à moins de
// 40 m les uns des autres, presque tous sur des bretelles). Un
// seuil trop large sur les bretelles fait migrer le clic vers le
// mauvais tronçon.
// ------------------------------------------------------------
const SEUIL_MAINLINE = 30;
const SEUIL_BRETELLE = 15;

// Marge de recherche en degrés pour le pré-filtrage bbox (~0.01° ≈ 1,1 km,
// largement suffisant même avec le plus grand des deux seuils ci-dessus).
const MARGE_BBOX = 0.01;

function getSeuil(classifica) {
    if (!classifica) return SEUIL_MAINLINE;
    return classifica.toLowerCase().includes("bretelle") ? SEUIL_BRETELLE : SEUIL_MAINLINE;
}

// Un tronçon est considéré "axe principal" s'il ne s'agit pas d'une bretelle
// (Autoroute, Route Nationale, Route Départementale...). Amélioration B :
// en cas d'ambiguïté, on privilégie la réponse de l'axe principal plutôt
// que celle d'une bretelle de raccordement.
function estAxePrincipal(classifica) {
    if (!classifica) return false;
    return !classifica.toLowerCase().includes("bretelle");
}

// ------------------------------------------------------------
// Amélioration C : le champ "concession" (statut au début du tronçon)
// et "concessi_1" (statut à la fin du tronçon) ne sont pas toujours
// identiques (33 tronçons sur ~17000 changent de statut en cours de
// route). L'ancien code ne lisait que "concession". On détermine ici
// le statut le plus probable en regardant si le point recherché est
// plus proche du début ou de la fin du tronçon.
// ------------------------------------------------------------
function statutSegment(feature, point) {
    const p = feature.properties;
    const debutStatut = String(p.concession || "").trim().toUpperCase();
    const finStatut = String(p.concessi_1 || debutStatut).trim().toUpperCase();

    if (debutStatut === finStatut || !feature.geometry) {
        return debutStatut;
    }

    const coordsFlat = feature.geometry.type === "MultiLineString"
        ? feature.geometry.coordinates.flat()
        : feature.geometry.coordinates;

    const debut = turf.point(coordsFlat[0]);
    const fin = turf.point(coordsFlat[coordsFlat.length - 1]);
    const dDebut = turf.distance(point, debut);
    const dFin = turf.distance(point, fin);

    return dDebut <= dFin ? debutStatut : finStatut;
}

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

        // Amélioration E : on calcule la date de référence la plus récente
        // du jeu de données pour informer l'utilisateur de sa fraîcheur.
        data.features.forEach(f => {
            const d = f.properties.dateRefere;
            if (d && (!dateReferenceMax || d > dateReferenceMax)) {
                dateReferenceMax = d;
            }
        });
        afficherFraicheurDonnees();

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

// Amélioration E (suite) : affichage de la fraîcheur des données dans le panneau d'aide.
function afficherFraicheurDonnees() {
    const el = document.getElementById("data-freshness");
    if (!el || !dateReferenceMax) return;
    const d = new Date(dateReferenceMax);
    const texte = d.toLocaleDateString("fr-FR", { year: "numeric", month: "long", day: "numeric" });
    el.textContent = `Données RRN à jour au ${texte}. Vérifiez data.gouv.fr si une version plus récente existe.`;
}

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

    // ------------------------------------------------------------
    // Amélioration A : au lieu de ne garder QUE le segment le plus
    // proche, on collecte TOUS les segments dont la distance est
    // sous leur seuil respectif (variable selon le type, cf. D).
    // Cela permet de détecter les zones où plusieurs statuts
    // coexistent à proximité immédiate (échangeurs, gares de péage,
    // aires de service) au lieu de trancher aveuglément.
    // ------------------------------------------------------------
    const candidats = [];       // segments dans leur seuil de tolérance
    let plusProcheGlobal = null; // pour le message "hors réseau" informatif
    let distanceGlobaleMin = Infinity;

    for (const f of reseau.features) {
        if (!f.geometry || !f._bbox) continue;

        // Filtrage rapide par bounding box avant le calcul précis
        const [minLon, minLat, maxLon, maxLat] = f._bbox;
        if (lon < minLon - MARGE_BBOX || lon > maxLon + MARGE_BBOX ||
            lat < minLat - MARGE_BBOX || lat > maxLat + MARGE_BBOX) {
            continue;
        }

        const lignes = f.geometry.type === "MultiLineString"
            ? f.geometry.coordinates.map(c => turf.lineString(c))
            : [turf.lineString(f.geometry.coordinates)];

        let distanceSegment = Infinity;
        for (const ligne of lignes) {
            const d = turf.pointToLineDistance(point, ligne, { units: 'meters' });
            if (d < distanceSegment) distanceSegment = d;
        }

        if (distanceSegment < distanceGlobaleMin) {
            distanceGlobaleMin = distanceSegment;
            plusProcheGlobal = f;
        }

        const seuil = getSeuil(f.properties.classifica);
        if (distanceSegment <= seuil) {
            candidats.push({
                feature: f,
                distance: distanceSegment,
                statut: statutSegment(f, point),
                classifica: f.properties.classifica,
                route: f.properties.route
            });
        }
    }

    resultDiv.classList.remove("hidden");

    // Aucun segment dans la tolérance -> hors réseau national
    if (candidats.length === 0) {
        resultDiv.className = "mt-6 p-4 rounded-xl text-center bg-slate-100 text-slate-700 border border-slate-200";
        const infoProche = plusProcheGlobal
            ? ` (segment le plus proche : ${plusProcheGlobal.properties.route || '?'} à ${Math.round(distanceGlobaleMin)} m)`
            : "";
        resultText.innerHTML = `⚪️ HORS RÉSEAU NATIONAL (DÉPARTEMENTALE OU COMMUNALE)<br><span class="text-xs font-normal opacity-75">${infoProche}</span>`;
        return;
    }

    // ------------------------------------------------------------
    // Amélioration B : en cas de candidats multiples, on privilégie
    // l'axe principal (Autoroute / Route Nationale...) plutôt qu'une
    // bretelle de raccordement, car c'est statistiquement la réponse
    // la plus pertinente pour l'utilisateur.
    // ------------------------------------------------------------
    const candidatsAxePrincipal = candidats.filter(c => estAxePrincipal(c.classifica));
    const poolPrincipal = candidatsAxePrincipal.length > 0 ? candidatsAxePrincipal : candidats;

    const candidatFinal = poolPrincipal.reduce((a, b) => (a.distance < b.distance ? a : b));

    // Détection d'un statut différent parmi les autres candidats proches
    const candidatsDivergents = candidats.filter(c => c !== candidatFinal && c.statut !== candidatFinal.statut);
    const ambigu = candidatsDivergents.length > 0;

    const estConcede = candidatFinal.statut === "C";
    const distanceTxt = `${Math.round(candidatFinal.distance)} m`;
    const routeTxt = candidatFinal.route ? ` — ${candidatFinal.route}` : "";

    // Cas le plus incertain : aucun axe principal trouvé, uniquement des
    // bretelles, ET ces bretelles ont des statuts différents entre elles.
    // Ici on ne peut pas trancher de façon fiable -> on l'affiche clairement
    // plutôt que de donner une fausse certitude.
    const uniquementBretelles = candidatsAxePrincipal.length === 0;
    const tousStatuts = new Set(candidats.map(c => c.statut));

    if (uniquementBretelles && tousStatuts.size > 1) {
        const plusProcheDivergent = candidatsDivergents.reduce((a, b) => (a.distance < b.distance ? a : b));
        resultDiv.className = "mt-6 p-4 rounded-xl text-center bg-amber-100 text-amber-800 border border-amber-200";
        resultText.innerHTML = `🟠 STATUT INCERTAIN — ZONE D'ÉCHANGEUR / PÉAGE<br>
            <span class="text-xs font-normal opacity-90">
                Plusieurs bretelles à statuts différents se trouvent à proximité immédiate :<br>
                ${candidatFinal.route || '?'} (${candidatFinal.classifica}) à ${distanceTxt} — ${estConcede ? "concédé" : "non concédé"}<br>
                ${plusProcheDivergent.route || '?'} (${plusProcheDivergent.classifica}) à ${Math.round(plusProcheDivergent.distance)} m — ${plusProcheDivergent.statut === "C" ? "concédé" : "non concédé"}<br>
                Vérifiez la signalisation sur place.
            </span>`;
        return;
    }

    // Réponse normale (rouge/vert), avec éventuellement une note
    // d'avertissement non bloquante si un tronçon voisin diverge.
    if (estConcede) {
        resultDiv.className = "mt-6 p-4 rounded-xl text-center bg-red-100 text-red-700 border border-red-200";
        resultText.innerHTML = `🔴 ROUTE CONCÉDÉE (GESTION PRIVÉE)<br><span class="text-xs font-normal opacity-75">${routeTxt} (segment à ${distanceTxt})</span>`;
    } else {
        resultDiv.className = "mt-6 p-4 rounded-xl text-center bg-green-100 text-green-700 border border-green-200";
        resultText.innerHTML = `✅ RÉSEAU ÉTAT (DIR - PUBLIC)<br><span class="text-xs font-normal opacity-75">${routeTxt} (segment à ${distanceTxt})</span>`;
    }

    if (ambigu) {
        const plusProcheDivergent = candidatsDivergents.reduce((a, b) => (a.distance < b.distance ? a : b));
        resultText.innerHTML += `<br><span class="block mt-2 text-xs font-normal text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">
            ⚠️ À proximité d'un échangeur : le tronçon ${plusProcheDivergent.route || '?'} (${plusProcheDivergent.classifica}) à ${Math.round(plusProcheDivergent.distance)} m a un statut différent (${plusProcheDivergent.statut === "C" ? "concédé" : "non concédé"}).
        </span>`;
    }
}
