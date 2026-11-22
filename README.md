# Falling Ghost

Ein-Tasten-Spiel: halten = steigen, loslassen = fallen. Läuft als Web-App (auch "Zum Homescreen").

## 3D-Ansicht
- `ghost3d.js` rendert die Tinten-Wände mit three.js als echte 3D-Körper (Glanzlack-Lippe, Relief,
  Schatten auf dem Papier, schwebende Tintentropfen, rotes Geisterlicht, blaues Near-Miss-Licht).
- Die Spiellogik/Kollision bleibt 2D in der Ebene z=0. Eine Off-Axis-Kamera bildet diese Ebene
  immer pixelgenau ab → sichtbarer Spaltrand = Kollisionsrand, nur die Tiefe drumherum bewegt sich.
- Button "3D an/aus" schaltet auf die klassische 2D-Ansicht (Einstellung wird gespeichert).
  Ohne WebGL fällt das Spiel automatisch auf 2D zurück. Bei langsamen Geräten wird die Auflösung adaptiv gesenkt.
- `vendor/three.min.js` ist ein minimales three.js-r186.1-Bundle (MIT), gebaut aus `vendor/three-entry.js`:
  `npx esbuild vendor/three-entry.js --bundle --minify --format=esm --outfile=vendor/three.min.js`

## Testmodus
- `index.html?bot` – Autopilot
- `index.html?bot&m=1250` – Autopilot ab 1250 m (Texturwechsel bei 600 m / 1200 m)
