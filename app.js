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
