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

    // Utilisation d'un buffer légèrement plus large (200m) pour les zones d'échangeurs
    const zoneRecherche = turf.buffer(point, 0.2, {units: 'kilometers'});

    // On utilise find pour s'arrêter au premier segment trouvé
    segmentTrouve = reseau.features.find(f => {
        return !turf.booleanDisjoint(zoneRecherche, f);
    });

    if (segmentTrouve) {
        const p = segmentTrouve.properties;
        
        // On cherche la valeur 'C' ou 'Concédé' dans n'importe quelle colonne
        // C'est plus sûr si Mapshaper a renommé les colonnes
        const infos = Object.values(p);
        const estConcede = infos.includes("C") || infos.includes("Concédé") || p.concessionPr === "C";

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
