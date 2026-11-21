# Tool-Referenz: claude-lexware-office-connector

Alle Tools sind **nur lesend** (`readOnlyHint: true`). Datumsangaben im Format `yyyy-MM-dd`. Ohne `from`/`to` gilt das laufende Kalenderjahr bis heute.

Auswertungen unterdrücken Gruppen mit weniger als 5 Kunden (`LEXWARE_MIN_GROUP`, `1` schaltet das ab). Personendaten in den Antworten werden standardmäßig reduziert (Pseudonyme für Namen, Adressen und Steuer-IDs entfernt). Abschalten nur mit `LEXWARE_REDACT=0`, siehe README.

Antworten kommen als JSON-Text. Fehler kommen als Tool-Fehler mit `isError: true` und einer Meldung ohne Schlüssel oder Zugangsdaten.

Lexware-Endpunkte, auf denen die Tools aufbauen, stehen in der [offiziellen Doku](https://developers.lexware.io/docs/#lexware-api-documentation).

---

## Stammdaten

### `lexware_profile`

Firmenprofil des verbundenen Lexware-Office-Kontos.

| Parameter | Typ | Pflicht | Beschreibung |
|---|---|---|---|
| – | – | – | keine |

Antwort (gekürzt): `companyName`, `taxType` (`net`, `gross`, `vatfree`), `smallBusiness`, `businessFeatures`.

Basis: `GET /v1/profile`

### `lexware_search_contacts`

Kunden und Lieferanten suchen. Gibt bis zu 25 Treffer zurück.

| Parameter | Typ | Pflicht | Beschreibung |
|---|---|---|---|
| `name` | string | nein | Name oder Teil des Namens |
| `number` | integer | nein | Kundennummer |
| `email` | string | nein | E-Mail-Adresse |
| `customer` | boolean | nein | nur Kunden (`true`) |
| `vendor` | boolean | nein | nur Lieferanten (`true`) |
| `page` | integer ≥ 0 | nein | Seite, 0-basiert |

Basis: `GET /v1/contacts`

### `lexware_get_contact`

Einen Kontakt per ID abrufen.

| Parameter | Typ | Pflicht | Beschreibung |
|---|---|---|---|
| `id` | UUID | ja | Lexware-Kontakt-ID |

Basis: `GET /v1/contacts/{id}`

### `lexware_search_articles`

Artikel (Produkte und Dienstleistungen) suchen. Gibt bis zu 25 Treffer zurück.

| Parameter | Typ | Pflicht | Beschreibung |
|---|---|---|---|
| `articleNumber` | string | nein | Artikelnummer |
| `gtin` | string | nein | GTIN / EAN |
| `type` | `PRODUCT`, `SERVICE`, `MATERIAL` | nein | Artikeltyp |
| `page` | integer ≥ 0 | nein | Seite, 0-basiert |

Basis: `GET /v1/articles`

---

## Belege

### `lexware_list_vouchers`

Ausgangsbelege aus der Voucherlist, gefiltert nach Typ, Status und Zeitraum. Holt alle Seiten bis zu einer festen Obergrenze.

| Parameter | Typ | Pflicht | Beschreibung |
|---|---|---|---|
| `voucherType` | Liste aus `invoice`, `creditnote`, `downpaymentinvoice`, `quotation`, `orderconfirmation`, `deliverynote` | nein | Standard: alle genannten Typen |
| `voucherStatus` | `draft`, `open`, `paid`, `paidoff`, `voided`, `overdue`, `sepadebit`, `transferred`, `accepted`, `rejected`, `unchecked` | nein | Standard: `any` |
| `from` | Datum | nein | Belegdatum ab |
| `to` | Datum | nein | Belegdatum bis |

Lexware begrenzt die Voucherlist auf maximal 10.000 Einträge pro Abfrage (Fehler „Maximum search window size exceeded“). Bei großen Datenmengen den Zeitraum verkleinern.

Antwort pro Beleg: `id`, `voucherType`, `voucherStatus`, `voucherNumber`, `voucherDate`, `dueDate`, `contactId`, `contactName`, `totalAmount`, `openAmount`, `currency`, `archived`.

Basis: `GET /v1/voucherlist`

> Eingangsbelege (`purchaseinvoice`, `purchasecreditnote`) und Buchungsbelege (`salesinvoice`, `salescreditnote`, `/v1/vouchers`) sind absichtlich nicht wählbar.

### `lexware_get_invoice`

Eine Rechnung mit Positionen, Summen, Steuerbeträgen und Zahlungsbedingungen.

| Parameter | Typ | Pflicht | Beschreibung |
|---|---|---|---|
| `id` | UUID | ja | Lexware-Rechnungs-ID |

Antwort (gekürzt): `voucherNumber`, `voucherStatus`, `address`, `lineItems` (Menge, Einzelpreis netto/brutto, Steuersatz, Rabatt), `totalPrice`, `taxAmounts`, `paymentConditions`.

Basis: `GET /v1/invoices/{id}`

---

## Auswertungen

Alle Auswertungen laufen lokal im Connector. Die Daten kommen aus der Voucherlist, bei der USt-Übersicht zusätzlich aus den Rechnungsdetails.

### `lexware_aging_report`

Offene Posten nach Tagen seit Fälligkeit. Berücksichtigt Rechnungen, Gutschriften und Anzahlungsrechnungen mit offenem Betrag. Entwürfe, bezahlte und stornierte Belege werden ausgelassen.

| Parameter | Typ | Pflicht | Beschreibung |
|---|---|---|---|
| `from` | Datum | nein | Belegdatum ab |
| `to` | Datum | nein | Belegdatum bis |

Antwort: `buckets` mit `notDue`, `1-30`, `31-60`, `61-90`, `over90` (je `total` und `count`), dazu `grandTotal` und `count`. Ein Bucket mit weniger als 5 verschiedenen Kunden liefert `total: null, count: null, suppressed: true`.

### `lexware_revenue_by_month`

Brutto-Umsatz je Kalendermonat aus Rechnungen abzüglich Gutschriften. Entwürfe und stornierte Belege sind ausgenommen. Angebote zählen nicht.

| Parameter | Typ | Pflicht | Beschreibung |
|---|---|---|---|
| `from` | Datum | nein | Belegdatum ab |
| `to` | Datum | nein | Belegdatum bis |

Antwort: Liste aus `{ month: "YYYY-MM", gross, count }`. Ein Monat mit weniger als 5 verschiedenen Kunden liefert `gross: null, count: null, suppressed: true`.

### `lexware_customer_concentration`

Wie stark der Umsatz von wenigen Kunden abhängt. Liefert die Anzahl der Kunden und die Anteile der drei größten als Klassen von 10 Prozentpunkten (z. B. „40–50 %“). Keine Namen, keine Beträge.

| Parameter | Typ | Pflicht | Beschreibung |
|---|---|---|---|
| `from` | Datum | nein | Belegdatum ab |
| `to` | Datum | nein | Belegdatum bis |

Antwort: `customerCount`, `topShares` als Liste aus `{ rank, shareBand }`. Unter der Mindestgruppengröße: `suppressed: true`.

### `lexware_vat_summary`

Netto- und Steuerbeträge je Steuersatz für Umsatzsteuer-Übersichten. Lädt je Rechnung das Detail nach (mit Cache innerhalb einer Sitzung). Bei mehr als 200 Rechnungen im Zeitraum bricht das Tool mit einer Fehlermeldung ab. Dann den Zeitraum verkleinern.

| Parameter | Typ | Pflicht | Beschreibung |
|---|---|---|---|
| `from` | Datum | nein | Belegdatum ab |
| `to` | Datum | nein | Belegdatum bis |

Antwort: Liste aus `{ taxRatePercentage, net, tax }`. Ein Steuersatz mit weniger als 5 Rechnungen liefert `net: null, tax: null, suppressed: true`. Entwürfe und stornierte Belege sind ausgenommen.

> Die Übersicht ist eine Hilfe für die Vorbereitung, kein Steuerbescheid. Prüfe sie mit deiner Steuerberatung.

---

## Rate Limit und Fehler

- Lexware erlaubt etwa 2 Anfragen pro Sekunde. Der Connector drosselt automatisch.
- Bei HTTP 429 wiederholt der Connector bis zu dreimal mit Backoff (bzw. `Retry-After`).
- Bei HTTP 401 ist der API-Key ungültig oder abgelaufen. Erzeuge ihn in Lexware Office neu und trage ihn erneut ein.

---

Projektseite: [m-ko.de](https://m-ko.de) · Lizenz: MIT
