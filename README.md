# claude-lexware-office-connector

Ein **MCP-Connector für Lexware Office** (ehemals lexoffice), damit Claude Kennzahlen, Kunden, Rechnungen und Auswertungen lesen kann. Gebaut von [m-ko.de](https://m-ko.de), Teil der Connector-Reihe für deutsche Mittelstands-Software.

- **Nur lesend.** Keine Rechnungen anlegen, ändern oder finalisieren.
- **Läuft lokal.** Dein API-Key und deine Daten bleiben auf deinem Rechner. Es gibt keinen Server von uns dazwischen.
- **Ohne Eingangs- und Buchungsbelege.** Lohn- und Buchungsdaten sind über diesen Connector nicht abrufbar.
- **Kostenlos und MIT-lizenziert.**

> **Datenschutz-Hinweis:** Lokal heißt: Connector und API-Key bleiben bei dir. Sobald Claude die Ergebnisse einer Abfrage verarbeitet, gehen diese Daten an den Modell-Anbieter Anthropic. Prüfe vor dem Einsatz, ob das für deine Daten zulässig ist.

## Voraussetzungen

1. **Node.js 22 oder neuer** (`node -v`)
2. **Einen Lexware-Office-API-Key.** Erzeuge ihn in Lexware Office unter [app.lexware.de/addons/public-api](https://app.lexware.de/addons/public-api). Der Key ist privat und gibt Lesezugriff auf deine Firmendaten. Behandle ihn wie ein Passwort.

## Installation

Der Connector läuft über `npx` und braucht keine Installation. Trage ihn in deiner Claude-Konfiguration ein.

### Claude Desktop

Öffne die Datei `claude_desktop_config.json`. Den Weg dorthin findest du in den Einstellungen der Desktop-App unter dem Punkt für Entwickler bzw. MCP-Server; die Menübezeichnungen können je nach Version abweichen. Ergänze:

```json
{
  "mcpServers": {
    "lexware-office": {
      "command": "npx",
      "args": ["-y", "claude-lexware-office-connector"],
      "env": {
        "LEXOFFICE_API_KEY": "DEIN_API_KEY"
      }
    }
  }
}
```

Starte Claude Desktop danach neu.

### Claude Code

```bash
claude mcp add --env LEXOFFICE_API_KEY=DEIN_API_KEY lexware-office -- npx -y claude-lexware-office-connector
```

## Was Claude damit kann

Die vollständige Tool-Referenz mit Parametern steht in [docs/API.md](docs/API.md).

| Bereich | Tools |
|---|---|
| Stammdaten | `lexware_profile`, `lexware_search_contacts`, `lexware_get_contact`, `lexware_search_articles` |
| Belege | `lexware_list_vouchers`, `lexware_get_invoice` |
| Auswertungen | `lexware_aging_report`, `lexware_revenue_by_month`, `lexware_top_customers`, `lexware_vat_summary` |

Beispiel-Fragen:

- „Welche Rechnungen sind seit mehr als 30 Tagen überfällig?“
- „Wie hat sich der Umsatz im ersten Quartal entwickelt?“
- „Wer sind meine fünf größten Kunden dieses Jahr?“
- „Erstelle eine Umsatzsteuer-Übersicht nach Steuersätzen für Q1.“

## Grenzen

- **Rate Limit:** Lexware erlaubt etwa 2 Anfragen pro Sekunde. Der Connector drosselt automatisch und wiederholt bei HTTP 429.
- **Große Zeiträume:** Für Netto- und USt-Auswertungen lädt der Connector je Rechnung ein Detail nach. Bei vielen Rechnungen dauert das. Nutze kürzere Zeiträume.
- **Kein Schreibzugriff** in dieser Version.

## Entwicklung

```bash
git clone https://github.com/muka-dev/claude-lexoffice-connector.git
cd claude-lexoffice-connector
npm install
npm test          # Unit- und Integrationstests, ohne echte API
npm run typecheck
npm run build
```

Die Tests laufen ohne API-Key. Ein Live-Test gegen die echte API ist in dieser Version nicht enthalten.

## Lizenz

MIT, siehe [LICENSE](LICENSE).

## Weitere Informationen

- Projektseite und weitere Connectoren: [m-ko.de](https://m-ko.de)
- Offizielle Lexware-API-Doku: [developers.lexware.io](https://developers.lexware.io/docs/#lexware-api-documentation)
- Kein offizielles Produkt von Lexware. Lexware und lexoffice sind Marken der Lexware GmbH & Co. KG.
