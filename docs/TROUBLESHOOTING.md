# Fehlerbehebung

Die häufigsten Probleme, sortiert nach dem, was du siehst.

## Der Connector startet nicht

| Meldung | Ursache | Lösung |
|---|---|---|
| `Failed to start Lexware connector: Lexware API key is missing` | Der Key fehlt in der Umgebung oder im `env`-Block. | Key in der Konfiguration eintragen und die Anwendung neu starten. |
| `LEXOFFICE_API_KEY is not set. Nothing was sent.` (nur Live-Check) | Dasselbe Problem beim Skript. | Key in der aktuellen Sitzung setzen, siehe README. |
| `Failed to start Lexware connector` mit anderer Meldung | Meist ist Node.js zu alt oder ein Paket fehlt. | Node.js 22 oder neuer installieren, im Projekt `npm install` ausführen. |
| `npx` wird nicht gefunden | Node.js ist nicht installiert oder nicht im Suchpfad. | Node.js installieren und die Anwendung neu starten. |

## Die Tools erscheinen nicht

- Prüfe, ob der Eintrag in der Konfiguration exakt so aussieht wie in der README.
- Starte Claude Desktop vollständig neu. Ein Fenster schließen reicht oft nicht.
- In Claude Code: `claude mcp list` zeigt, ob `lexware-office` läuft.

## Lexware gibt einen Fehler zurück

| Status | Bedeutung | Lösung |
|---|---|---|
| 401 | Der Key ist ungültig, widerrufen oder abgelaufen. | Neuen Key in Lexware Office erzeugen und eintragen. |
| 403 | Der Key hat nicht die nötige Berechtigung oder der Account hat die Public API nicht freigeschaltet. | In Lexware Office prüfen, ob die Public API für den Account aktiv ist. |
| 429 | Zu viele Anfragen. Der Connector wiederholt automatisch bis zu dreimal. | Kurz warten und die Frage erneut stellen. Bei großen Zeiträumen einen kleineren wählen. |
| 400 bei großen Zeiträumen | Lexware begrenzt die Belegliste auf 10.000 Einträge pro Abfrage. | Zeitraum verkleinern, etwa quartalsweise abfragen. |
| 5xx | Störung auf Seiten von Lexware. | Später erneut versuchen. |

## Auswertungen sind leer oder fehlen

| Beobachtung | Ursache | Lösung |
|---|---|---|
| Alle Auswertungen sind leer | Alle Belege sind Entwürfe oder storniert. Entwürfe zählen nicht. | Rechnungen finalisieren. |
| Monat oder Altersklasse fehlt, `suppressed: true` | Weniger als fünf verschiedene Kunden in der Gruppe. | Bei Testdaten `LEXWARE_MIN_GROUP=1` setzen. Bei echten Daten so lassen. |
| Konzentration liefert nur `suppressed` | Weniger als fünf Kunden insgesamt. | Gleiche Ursache wie oben. |
| USt-Übersicht ist kleiner als die Belegliste | Rechnungen ohne Steuerzeilen fehlen in den Sätzen. | Die Liste `invoicesWithoutTaxRows` prüfen. Die Rechnungen steuerlich einordnen lassen. |
| Ein Steuersatz zeigt `net: null` | Weniger als fünf Rechnungen mit diesem Satz. | Gleiche Ursache wie oben. |

## Namen erscheinen nicht

Das ist die Standardeinstellung. Der Connector ersetzt Namen durch `Kontakt N`. Bei einer Suche nach einem Namen findet die Suche den Kontakt, die Antwort zeigt aber nur den Platzhalter. Für die Klartextansicht `LEXWARE_REDACT=0` setzen. Das solltest du nur bewusst tun, siehe [SECURITY-PRIVACY.md](SECURITY-PRIVACY.md).

## Claude nutzt die Tools nicht

- Frag ausdrücklich nach Lexware-Daten, zum Beispiel „Nutze die Lexware-Tools und zeige mir die offenen Posten.“
- Claude fragt bei jedem Tool-Aufruf nach Erlaubnis? Dann in den Einstellungen der Anwendung die Berechtigung für den Connector bestätigen.

## Der Live-Check bricht ab

- `fetch failed`: Keine Verbindung zu `api.lexware.io`. Firewall, Proxy oder fehlendes Netz prüfen.
- `Live check failed: Lexware API error 401`: Key prüfen, siehe oben.
- Die Ausgabe enthält `[entfernt]`: Das ist gewollt, die Steuer-IDs werden ausgeblendet.

## Wenn nichts davon passt

Erstelle ein Issue im Repository und beschreibe, was du gemacht hast, welche Meldung kam und welche Version du nutzt (`npm ls claude-lexware-office-connector`). Bitte keine Schlüssel, Namen oder Rechnungsdaten ins Issue kopieren.
