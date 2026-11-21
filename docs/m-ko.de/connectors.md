# Connectors für deutsche Mittelstands-Software

*Entwurf für die Projektseite auf m-ko.de. Quelle hier im Repo, Veröffentlichung auf der Website.*

Viele kleine und mittlere Unternehmen möchten Claude oder ChatGPT mit ihren Systemen verbinden: Buchhaltung, Warenwirtschaft, Shop, Personal. Für die deutschen Systeme gibt es aber kaum gepflegte Connectoren. Die großen Anbieter bauen sie nicht.

Hier entsteht eine Sammlung von Connectoren für diese Systeme. Jeder Connector ist ein **MCP-Server** (Model Context Protocol). Damit kann Claude sicher auf die Daten zugreifen, die du freigibst.

## Verfügbare Connectoren

### Lexware Office (lexoffice)

**Status:** Version 0.1, lesend, kostenlos, MIT-Lizenz.
**Repo:** [github.com/muka-dev/claude-lexware-office-connector](https://github.com/muka-dev/claude-lexware-office-connector)

**Was er kann**

- Firmenprofil, Kunden und Lieferanten suchen
- Rechnungen, Gutschriften, Angebote und Auftragsbestätigungen auflisten und einzeln abrufen
- Artikel suchen
- Auswertungen: offene Posten nach Fälligkeit, Umsatz je Monat, Kundenkonzentration (nur Anteilsklassen, keine Namen), Umsatzsteuer nach Steuersätzen. Gruppen mit weniger als fünf Kunden werden ausgeblendet.

**Was er bewusst nicht kann**

- Keine Schreibzugriffe: nichts anlegen, ändern oder finalisieren
- Keine Eingangsbelege und keine Buchungsbelege. Lohn- und Gehaltsdaten sind nicht abrufbar.

**Datenschutz**

- Der Connector läuft lokal auf deinem Rechner. Dein API-Key und deine Daten gehen nicht über einen Server von uns.
- Sobald Claude die Ergebnisse verarbeitet, gehen sie an den Modell-Anbieter. Bitte prüfe, ob das für deine Daten passt.

**Installation**

Voraussetzungen: Node.js 22 oder neuer und ein API-Key aus Lexware Office. Die Schritt-für-Schritt-Anleitung steht im [README](https://github.com/muka-dev/claude-lexware-office-connector#installation). Die Tool-Referenz steht in der [API-Dokumentation](https://github.com/muka-dev/claude-lexware-office-connector/blob/main/docs/API.md).

**Beispiel-Fragen an Claude**

- „Welche Rechnungen sind seit mehr als 30 Tagen überfällig?“
- „Wie hat sich der Umsatz im ersten Quartal entwickelt?“
- „Wer sind meine fünf größten Kunden dieses Jahr?“

## Weitere Connectoren

In Planung, ohne Zusage zur Reihenfolge: sevDesk, DATEV, JTL, Shopware, weclapp, Personio.

## Kontakt und Feedback

Wenn du einen Connector für dein System brauchst oder Feedback zu einem bestehenden hast, melde dich über [m-ko.de](https://m-ko.de).

---

*Lexware und lexoffice sind Marken der Lexware GmbH & Co. KG. m-ko.de ist nicht mit Lexware verbunden.*
