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

Rozhraní používá češtinu a hash routing, aby interní navigace fungovala i při načtení z lokálního balíčku.
