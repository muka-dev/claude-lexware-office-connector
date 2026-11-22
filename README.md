# claude-lexware-office-connector

Ein MCP-Connector, mit dem Claude Belege, Kunden und Auswertungen aus **Lexware Office** (ehemals lexoffice) lesen kann. Gebaut von [m-ko.de](https://m-ko.de).

- **Nur lesend.** Keine Rechnungen anlegen, ändern oder finalisieren.
- **Läuft auf deinem Rechner.** Dein API-Key geht nur an die Lexware-API, nirgendwo anders hin. Es gibt keinen Server von uns dazwischen.
- **Standardmäßig datensparsam.** Namen werden durch Platzhalter ersetzt, Adressen und Steuer-IDs entfernt, kleine Gruppen ausgeblendet.
- **Kostenlos, MIT-lizenziert.**

> **Wichtig:** Was Claude aus dem Connector erhält, geht an den Modell-Anbieter, sobald Claude es verarbeitet. Der Connector verringert, was dabei an Personendaten übertragen wird. Er macht die Daten nicht anonym. Details: [docs/SECURITY-PRIVACY.md](docs/SECURITY-PRIVACY.md).

## Inhalt

- [Schnellstart](#schnellstart)
- [Konfiguration](#konfiguration)
- [Was der Connector kann](#was-der-connector-kann)
- [Datenschutz in Kürze](#datenschutz-in-kürze)
- [Grenzen](#grenzen)
- [Entwicklung und Tests](#entwicklung-und-tests)
- [Weitere Dokumentation](#weitere-dokumentation)

## Schnellstart

Du brauchst **Node.js 22 oder neuer** und einen **Lexware-Office-API-Key**.

1. **API-Key erzeugen:** In Lexware Office unter [app.lexware.de/addons/public-api](https://app.lexware.de/addons/public-api). Der Key gibt Lesezugriff auf deine Firmendaten. Behandle ihn wie ein Passwort.
2. **Claude einrichten.** Ein Eintrag in der Konfiguration von Claude Desktop:

   ```json
   {
     "mcpServers": {
       "lexware-office": {
         "command": "npx",
         "args": ["-y", "claude-lexware-office-connector"],
         "env": { "LEXOFFICE_API_KEY": "DEIN_API_KEY" }
       }
     }
   }
   ```

   Den Speicherort der Datei `claude_desktop_config.json` findest du in den Einstellungen der Desktop-App unter dem Punkt für Entwickler bzw. MCP-Server. Die Bezeichnungen können je nach Version abweichen. Danach Claude Desktop neu starten.

3. **Oder mit Claude Code:**

   ```bash
   claude mcp add --env LEXOFFICE_API_KEY=DEIN_API_KEY lexware-office -- npx -y claude-lexware-office-connector
   ```

4. **Ausprobieren:** Frag Claude zum Beispiel „Welche Rechnungen sind überfällig?“ oder „Wie hat sich der Umsatz im ersten Quartal entwickelt?“.

Ob die Verbindung steht, siehst du in der Tool-Liste der Anwendung. Dort müssen die Tools `lexware_*` erscheinen. Wenn nicht, hilft [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md).

## Konfiguration

Alles wird über Umgebungsvariablen gesteuert. Nur `LEXOFFICE_API_KEY` ist Pflicht.

| Variable | Standard | Wirkung |
|---|---|---|
| `LEXOFFICE_API_KEY` | – | Pflicht. Der API-Key aus Lexware Office. Ohne ihn startet der Connector nicht. |
| `LEXWARE_REDACT` | an | Namen werden zu Platzhaltern (`Kontakt 1`), Straße, Adresszusatz, PLZ, Steuernummer und USt-IdNr. werden entfernt. Auf `0`, `false`, `no` oder `off` setzen, um es abzuschalten. |
| `LEXWARE_MIN_GROUP` | `5` | Mindestzahl verschiedener Kunden (bei USt: Rechnungen), damit eine Auswertung angezeigt wird. `1` schaltet die Schwelle aus. Ungültige Werte fallen auf `5` zurück. |

Die Werte stehen im `env`-Block der Konfiguration, zum Beispiel:

```json
"env": {
  "LEXOFFICE_API_KEY": "DEIN_API_KEY",
  "LEXWARE_MIN_GROUP": "5"
}
```

Der Connector liest die Variablen beim Start. Nach einer Änderung muss die Anwendung neu gestartet werden.

## Was der Connector kann

Die vollständige Referenz mit Parametern und Antwortformen steht in [docs/API.md](docs/API.md).

| Bereich | Tools |
|---|---|
| Stammdaten | `lexware_profile`, `lexware_search_contacts`, `lexware_get_contact`, `lexware_search_articles` |
| Belege | `lexware_list_vouchers`, `lexware_get_invoice` |
| Auswertungen | `lexware_aging_report`, `lexware_revenue_by_month`, `lexware_customer_concentration`, `lexware_vat_summary` |

Der Connector liest nur Ausgangsbelege. Eingangsbelege, Buchungsbelege, Gehaltsbuchungen und Lohndaten sind über die Tools nicht abrufbar.

**Beispiele:**
- „Welche offenen Posten sind älter als 30 Tage?“ → `lexware_aging_report`
- „Wie hängt der Umsatz von wenigen Kunden ab?“ → `lexware_customer_concentration`, liefert nur Anteilsklassen
- „Erstelle eine USt-Übersicht für Q1.“ → `lexware_vat_summary`, mit separater Liste der Rechnungen ohne Steuerzeilen

## Datenschutz in Kürze

| Was | Standard | Details |
|---|---|---|
| Namen | Platzhalter (`Kontakt 1`) | Ein Name bekommt in einem Prozess immer denselben Platzhalter. |
| Adressen | Straße, Adresszusatz und PLZ entfernt | Ort und Land bleiben für regionale Auswertungen. |
| Steuer-IDs | entfernt | Steuernummer und USt-IdNr. |
| Freitext | E-Mail, IBAN, Telefon und USt-IdNr. ersetzt | Gilt für alle Textfelder, auch Notizen. |
| Kleine Gruppen | ausgeblendet | Unter fünf Kunden bzw. Rechnungen wird nichts angezeigt. |
| Speicherung | keine | Pseudonyme und Cache nur im Arbeitsspeicher des laufenden Prozesses. Keine Logdateien, keine Telemetrie. |

Die vollständige Beschreibung, inklusive Datenflüssen und bekannter Lücken, steht in [docs/SECURITY-PRIVACY.md](docs/SECURITY-PRIVACY.md).

## Grenzen

- **Freitext-Namen** wie „Rücksprache mit Frau Musterfrau“ werden nicht erkannt.
- **Lexware-IDs, Rechnungsnummern, Datumsangaben und Beträge** bleiben in den Antworten. Zusammen können sie bei kleinen Kundenstämmen auf eine Firma hinweisen.
- **Pseudonyme** sind keine Anonymisierung im rechtlichen Sinn. Pseudonymisierte Daten bleiben personenbezogen.
- **Rate Limit:** Lexware erlaubt etwa zwei Anfragen pro Sekunde. Der Connector drosselt sich selbst und wiederholt bei HTTP 429.
- **Große Zeiträume:** Lexware begrenzt die Belegliste auf 10.000 Einträge pro Abfrage. Bei mehr Belegen den Zeitraum verkleinern.
- **USt-Übersicht:** Sie ist eine Vorbereitungshilfe, keine steuerliche Beurteilung. Rechnungen ohne Steuerzeilen werden getrennt ausgewiesen, nicht stillschweigend ausgelassen.
- **Kein Schreibzugriff** in dieser Version.

## Entwicklung und Tests

```bash
git clone https://github.com/muka-dev/claude-lexware-office-connector.git
cd claude-lexware-office-connector
npm install
npm test          # Unit- und Integrationstests, ohne echte API
npm run typecheck
npm run build
```

Die Tests laufen ohne API-Key und ohne Netzzugriff. Der Connector ist mit Vitest getestet: Client, Auswertungen, Tool-Schicht, Redaktion, Schwellen und der MCP-Server über einen In-Memory-Transport.

Architektur und Entscheidungen stehen in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

### Live-Check gegen die echte API

`scripts/live-check.mjs` ruft nur lesend Profil, Belege und Auswertungen ab. Es gibt Summen, Feldnamen und Rechnungsnummern aus, keine Namen, Adressen oder E-Mail-Adressen.

```bash
npm run build
node scripts/live-check.mjs 2026-01-01 2026-12-31
```

Ohne `LEXOFFICE_API_KEY` bricht das Skript ab und sendet nichts.

## Weitere Dokumentation

- [docs/API.md](docs/API.md): Tool-Referenz mit Parametern und Antwortformen
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): Aufbau, Datenfluss und Entscheidungen, mit Diagrammen
- [docs/SECURITY-PRIVACY.md](docs/SECURITY-PRIVACY.md): Datenflüsse, Schutzmaßnahmen und bekannte Lücken
- [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md): Fehlerbilder und Lösungen

## Lizenz

MIT, siehe [LICENSE](LICENSE).

Lexware und lexoffice sind Marken der Lexware GmbH & Co. KG. Dieses Projekt ist nicht mit Lexware verbunden.
