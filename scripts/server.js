const express = require('express');
const path = require('path');
const app = express();
const PORT = 8787;

// Tarjoillaan projektin juurikansion staattiset tiedostot
app.use(express.static(path.join(__dirname, '..')));

app.listen(PORT, () => {
    console.log('--------------------------------------------------');
    console.log(`Lokaali palvelin käynnissä!`);
    console.log(`Avaa selain osoitteessa: http://localhost:${PORT}/brand-scanner.html`);
    console.log('--------------------------------------------------');
});
