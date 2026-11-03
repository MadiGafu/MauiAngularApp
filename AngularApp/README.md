# Plánovač itinerářů – Angular

Angularová část hybridní aplikace postavená na Angular CLI 20.3.1. Produkční sestavení se ukládá do `AngularApp/dist/maui-wwwroot` a MAUI je následně vloží do výsledného balíčku.

## Vývoj Angularu

Pro samostatný vývoj webového rozhraní lze spustit vývojový server:

```bash
npm ci
npm start
```

Vývojový server je určen pouze pro vývoj. K běhu sestavené desktopové aplikace není potřeba.

## Sestavení desktopové aplikace

Na počítači s nainstalovanými .NET MAUI workloady a Node.js nejprve nainstalujte npm závislosti:

```bash
npm ci
```

Poté sestavte MAUI projekt:

```bash
dotnet build ..\MyMauiApp\MyMauiApp.csproj -f net10.0-windows10.0.19041.0
```

MSBuild při sestavení automaticky spustí produkční `ng build`, jeho statické soubory zahrne mezi MAUI assety a WebView otevře lokální `wwwroot/index.html`. Není proto nutné ručně spouštět `ng serve` ani konfigurovat adresu lokálního serveru.

## Testy

```bash
npm test -- --watch=false
```

Rozhraní používá češtinu a hash routing s cestou `index.html`, aby interní navigace i obnovení editoru fungovaly z lokálního balíčku bez webového serveru.

## Vyhledávání míst

Vyhledávání používá veřejné rozhraní Nominatim projektu OpenStreetMap. Dotazy se odesílají až po stisknutí tlačítka (nejde o automatické našeptávání), požadavky jsou omezeny na nejvýše jeden za sekundu a odpovědi obsahují odkaz na atribuci OpenStreetMap. Desktopová aplikace identifikuje požadavky vlastním User-Agentem. Veřejná služba vyžaduje připojení k internetu, odesílá jí zadaný vyhledávací dotaz a může uplatňovat vlastní limity dostupnosti.

Vybraná místa lze v itineráři řadit tlačítky nahoru a dolů. Přidání, odebrání i změna pořadí se trvale uloží po stisknutí tlačítka „Uložit“.

## Mapa a plánování trasy

Mapa používá Leaflet a dlaždice OpenStreetMap s uvedením zdroje přímo v mapě. Tlačítko pro výpočet trasy odesílá souřadnice míst v aktuálním pořadí do veřejné demonstrační služby OSRM (profil jízdy autem) a zobrazuje získanou geometrii, vzdálenost a odhad času. Výsledek trasy se počítá znovu podle uložených míst a není trvale uložen; OSRM demo server nemá záruku dostupnosti. Zobrazení mapy a výpočet trasy vyžadují připojení k internetu.

## Informace z Wikipedie

U každého vybraného místa lze vyhledat český článek na Wikipedii podle přesného názvu. Pokud přesný článek neexistuje, aplikace nezobrazí podobně pojmenovanou stránku z jiné lokality. Shrnutí lze v rozhraní skrýt a znovu zobrazit; načtená informace se uloží do itineráře po stisknutí tlačítka „Uložit“. Text je označen licencí CC BY-SA 4.0 a odkazuje na původní článek. Vyhledání a načtení článku probíhá přes veřejné API Wikipedie a vyžaduje internetové připojení.
