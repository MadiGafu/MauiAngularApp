using Microsoft.Maui.Hosting;
using MyMauiApp.Data;
using PlacesLibrary.Providers;
using PlacesLibrary.Services;

namespace MyMauiApp;

public static class MauiProgram
{
    public static MauiApp CreateMauiApp()
    {
        var builder = MauiApp.CreateBuilder();
        builder
            .UseMauiApp<App>()
            .ConfigureFonts(fonts =>
            {
                fonts.AddFont("OpenSans-Regular.ttf", "OpenSansRegular");
                fonts.AddFont("OpenSans-Semibold.ttf", "OpenSansSemibold");
            });

        builder.Services.AddSingleton<TripDatabase>();
        builder.Services.AddSingleton<HttpClient>(_ =>
        {
            var client = new HttpClient { Timeout = TimeSpan.FromSeconds(35) };
            client.DefaultRequestHeaders.UserAgent.ParseAdd(
                "MauiAngularApp/1.0 (+https://github.com/MadiGafu/MauiAngularApp)");
            client.DefaultRequestHeaders.AcceptLanguage.ParseAdd("cs,en;q=0.8");
            return client;
        });
        builder.Services.AddSingleton<NominatimProvider>();
        builder.Services.AddSingleton<IPlaceProvider, OverpassProvider>();
        builder.Services.AddSingleton<WikipediaProvider>();
        builder.Services.AddSingleton<PlaceAggregator>();
        builder.Services.AddSingleton<MainPage>();
        builder.Services.AddSingleton<AppShell>();

        return builder.Build();
    }
}
