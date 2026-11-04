# Knihovna pro vyhledávání míst

## Architektura

`PlacesLibrary` je samostatná knihovna .NET 10 bez závislosti na MAUI. Aplikace
ji používá přes `PlaceAggregator`, který sjednocuje poskytovatele dat:

- `NominatimProvider` vyhledává města a načítá jejich geografické hranice.
- `OverpassProvider` vyhledává pojmenovaná turistická a kulturní místa uvnitř
  hranic vybraného města.
- `WikipediaProvider` načítá české shrnutí článku a Nominatim dohledá odkaz na
  českou Wikipedii u OSM objektu.
- `PlaceAggregator` slučuje duplicity podle typu a ID OSM, ID Wikidata nebo
  shodného normalizovaného názvu a vzdálenosti souřadnic do 30 metrů. Při sloučení
  zachová dostupné doplňující informace, řadí výsledky podle odkazů na Wikipedii
  a Wikidata a omezuje seznam na 50 míst.

V aplikaci MAUI posílají Angular služby požadavky přes
`MauiBridgeService`. `MainPage` přijímá pouze požadavky z lokálně hostovaného
rozhraní WebView a předává je do `PlaceAggregator`. Při otevření Angular
rozhraní v běžném prohlížeči zůstává dostupné přímé vyhledávání Nominatim pro
vývoj; desktopová aplikace používá .NET knihovnu a Overpass.

## Release bez `ng serve`

Z kořenové složky repozitáře:

```powershell
dotnet build .\MyMauiApp\MyMauiApp.csproj -c Release -f net10.0-windows10.0.19041.0
dotnet run --project .\MyMauiApp\MyMauiApp.csproj -c Release -f net10.0-windows10.0.19041.0
```

MSBuild při sestavení spustí `npm run build` a zahrne statické soubory Angularu
do MAUI balíčku. Node.js/npm jsou potřeba při sestavení; při spuštění hotové
aplikace ani vývojový server Angularu potřeby nejsou.

## Veřejné datové služby

Vyhledávání používá veřejné endpointy Nominatim, Overpass API a české Wikipedie,
proto vyžaduje připojení k internetu. Poskytovatel Nominatim omezuje frekvenci
na jeden požadavek za sekundu a odesílá identifikaci aplikace. Overpass omezuje
dotaz hranicemi vybraného města; aplikace čeká na Overpass nejdéle 5 sekund a
při nedostupnosti použije omezené vyhledávání Nominatim. Veřejné služby mají
vlastní pravidla dostupnosti a používání; při růstu zátěže bude potřeba vlastní
nebo smluvně zajištěný endpoint.
