# Falling Ghost

Ein-Tasten-Spiel im Pixel-Art-Stil: halten = steigen, loslassen = fallen.

- Pixel-Look: Szene wird in Pixelauflösung (Höhe/255) gezeichnet und hart hochskaliert.
- Wände: schwarze Tinte mit Wirbeln und Goldsprenkeln, blaue Tropf-Zapfen oben, blaue Zacken unten,
  Tinten-Spritzer. Wellen-Locken an der Kante sind Hindernisse (mit Kollision).
- Münzen: +10 Punkte. Score = Meter + Münzen×10. 3 Leben (Herzen), kurze Unverwundbarkeit nach Treffer.
- Pause-Button (auch P/Esc), Auto-Pause im Hintergrund. Bestwert wird lokal gespeichert.

## Testmodus
- `index.html?bot` – Autopilot, `index.html?bot&m=1250` – Autopilot ab 1250 m
