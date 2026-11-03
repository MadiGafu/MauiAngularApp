# Databázový návrh

## Zvolená technologie

Pro desktopovou aplikaci je použita SQLite přes balíček `Microsoft.Data.Sqlite`.
Databázový soubor `itineraries.db` se vytváří v aplikačním datovém adresáři MAUI,
proto jeho instalace nevyžaduje samostatný databázový server ani další instalátor.
Přístup k databázi zajišťuje .NET část aplikace; Angular komunikuje s MAUI přes
asynchronní WebView bridge.

V desktopové verzi lze umístění databáze zobrazit a otevřít tlačítkem
„Databáze“ v horní liště aplikace.

## ER diagram

```mermaid
erDiagram
    TRIPS ||--o{ TRIP_DESTINATIONS : obsahuje
    TRIPS ||--o{ PLACES : planuje
    TRIPS ||--o{ TASKS : eviduje

    TRIPS {
        TEXT id PK
        INTEGER position
        TEXT title
        TEXT start_date
        TEXT end_date
        TEXT description
        TEXT image_url
        TEXT selected_city_json
        TEXT notes
        TEXT budget_currency
        REAL budget_planned
        REAL budget_spent
    }

    TRIP_DESTINATIONS {
        TEXT trip_id PK, FK
        INTEGER position PK
        TEXT name
    }

    PLACES {
        TEXT id PK
        TEXT trip_id FK
        INTEGER position
        TEXT osm_type
        INTEGER osm_id
        TEXT name
        TEXT category
        TEXT address
        REAL latitude
        REAL longitude
        TEXT wikipedia_page_title
        TEXT wikidata_id
        TEXT wikipedia_title
        TEXT wikipedia_extract
        TEXT wikipedia_url
    }

    TASKS {
        TEXT id PK
        TEXT trip_id FK
        INTEGER position
        TEXT text
        INTEGER is_done
    }
```

## Omezení a integrita

- Odstranění itineráře odstraní také jeho destinace, místa a úkoly (`ON DELETE CASCADE`).
- Pořadí destinací, míst a úkolů je uloženo ve sloupci `position`.
- OSM objekt je v rámci jednoho itineráře jednoznačný podle typu a OSM ID.
- Změna itineráře a přepsání jeho podřízených záznamů probíhá v jedné transakci.
- Verze schématu je evidována pomocí `PRAGMA user_version`; nové změny schématu
  se budou přidávat jako navazující migrace.
- Tabulka `TRIPS` uchovává také krátký popis projektu a URL titulního obrázku.
- Tabulka `TRIPS` uchovává vybrané město včetně geografického ohraničení a článku
  Wikipedie jako JSON; jeho hranice se používají k omezení hledání míst.
- Při prvním otevření databáze se existující data z `localStorage` jednorázově
  importují. Původní data se odstraní z `localStorage` až po úspěšné odpovědi databáze.
- Migrace schématu z verze 2 přidá uložené vybrané město projektu.
