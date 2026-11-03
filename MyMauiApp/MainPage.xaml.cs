using Microsoft.Maui.Controls;
using Microsoft.Maui.Devices;
using Microsoft.Maui.Storage;
using MyMauiApp.Data;
using System.Diagnostics;
using System.Net;
using System.Text;
using System.Text.Json;
#if WINDOWS
using Microsoft.UI.Xaml.Controls;
using Microsoft.Web.WebView2.Core;
#endif

namespace MyMauiApp;

public partial class MainPage : ContentPage
{
    private readonly TripDatabase _tripDatabase;

    public MainPage(TripDatabase tripDatabase)
    {
        _tripDatabase = tripDatabase;
        InitializeComponent();
#if ANDROID
        webView.Source = "file:///android_asset/wwwroot/index.html";
#elif IOS || MACCATALYST
        var indexPath = Path.Combine(FileSystem.AppPackageDirectory, "wwwroot", "index.html");
        webView.Source = new Uri(indexPath).AbsoluteUri;
#endif
    }

#if WINDOWS
    private async void OnWebViewLoaded(object sender, EventArgs e)
    {
        try
        {
            var assetsDirectory = Path.Combine(AppContext.BaseDirectory, "wwwroot");
            var indexPath = Path.Combine(assetsDirectory, "index.html");
            if (!File.Exists(indexPath))
            {
                throw new FileNotFoundException("Soubor Angular index.html nebyl nalezen.", indexPath);
            }

            if (webView.Handler?.PlatformView is not WebView2 platformView)
            {
                throw new InvalidOperationException("Ovládací prvek WebView2 není připraven.");
            }

            await platformView.EnsureCoreWebView2Async();
            platformView.CoreWebView2.Settings.UserAgent +=
                " MauiAngularApp/1.0 (+https://github.com/MadiGafu/MauiAngularApp)";
            await platformView.CoreWebView2.AddScriptToExecuteOnDocumentCreatedAsync(
                "window.__IS_MAUI_WEBVIEW__ = true;");
            platformView.CoreWebView2.SetVirtualHostNameToFolderMapping(
                "appassets.example",
                assetsDirectory,
                CoreWebView2HostResourceAccessKind.Allow);
            var tripImagesDirectory = Path.Combine(FileSystem.AppDataDirectory, "trip-images");
            Directory.CreateDirectory(tripImagesDirectory);
            platformView.CoreWebView2.SetVirtualHostNameToFolderMapping(
                "tripimages.example",
                tripImagesDirectory,
                CoreWebView2HostResourceAccessKind.Allow);
            webView.Source = "https://appassets.example/index.html";
        }
        catch (Exception ex)
        {
            ShowLoader(false);
            webViewError.Text = $"Nepodařilo se připravit rozhraní: {ex.Message}";
            webViewError.IsVisible = true;
        }
    }
#endif

    private static string JsString(string s) => JsonSerializer.Serialize(s);

    // MAUI -> Angular notify
    private async void OnSendToAngularClicked(object sender, EventArgs e)
    {
        var payload = new { type = "notify", payload = new { text = "Pozdrav z aplikace MAUI." } };
        await SendStructuredToAngular(payload);
    }

    private void OnRefreshClicked(object sender, EventArgs e)
    {
        webView.Reload();
    }

    private async void OnOpenDatabaseFolderClicked(object sender, EventArgs e)
    {
        var exists = File.Exists(_tripDatabase.DatabasePath);
        var message = $"Soubor: {_tripDatabase.DatabasePath}\n\n"
            + (exists
                ? "Databáze itinerářů je vytvořena."
                : "Databáze se vytvoří po načtení itinerářů.")
            + "\n\nChcete otevřít složku s databází?";
        if (!await DisplayAlertAsync("Umístění databáze", message, "Otevřít složku", "Zavřít"))
        {
            return;
        }

#if WINDOWS
        try
        {
            Process.Start(new ProcessStartInfo
            {
                FileName = "explorer.exe",
                Arguments = $"\"{FileSystem.AppDataDirectory}\"",
                UseShellExecute = true,
            });
        }
        catch (Exception ex)
        {
            await DisplayAlertAsync(
                "Složku se nepodařilo otevřít",
                $"Otevřete tuto cestu ručně:\n{FileSystem.AppDataDirectory}\n\n{ex.Message}",
                "OK");
        }
#else
        await DisplayAlertAsync(
            "Umístění databáze",
            $"Otevřete tuto složku ve správci souborů:\n{FileSystem.AppDataDirectory}",
            "OK");
#endif
    }

    private void ShowLoader(bool on)
    {
        spinner.IsVisible = spinner.IsRunning = on;
    }

    private async void OnWebViewNavigated(object sender, WebNavigatedEventArgs e)
    {
        ShowLoader(false);
        if (e.Result != WebNavigationResult.Success)
        {
            webViewError.Text = $"Nepodařilo se načíst rozhraní ({e.Result}).";
            webViewError.IsVisible = true;
            return;
        }

        webViewError.IsVisible = false;
        await webView.EvaluateJavaScriptAsync("window.__IS_MAUI_WEBVIEW__ = true");
    }

    private async void OnWebViewNavigating(object sender, WebNavigatingEventArgs e)
    {
        var url = e.Url ?? string.Empty;

        if (!url.StartsWith("maui://", StringComparison.OrdinalIgnoreCase))
        {
            ShowLoader(true);
            return;
        }

        e.Cancel = true;

        string? requestId = null;
        string? requestType = null;
        try
        {
            var base64url = ExtractHostPayload(url);
            if (string.IsNullOrWhiteSpace(base64url))
            {
                await SendStructuredToAngular(new { type = "notify", payload = new { text = "Chyba MAUI: prázdná zpráva." } });
                return;
            }

            var json = FromBase64Url(base64url);

            using var doc = JsonDocument.Parse(json);
            var root = doc.RootElement;

            requestType = root.GetProperty("type").GetString();
            requestId = root.TryGetProperty("id", out var idProp) ? idProp.GetString() : null;

            switch (requestType)
            {
                case "ping":
                    await SendStructuredToAngular(new { type = "pong", id = requestId, payload = new { serverTime = DateTime.UtcNow.ToString("u") } });
                    break;

                case "getDevice":
                    await SendStructuredToAngular(new
                    {
                        type = "deviceInfo",
                        id = requestId,
                        payload = new { platform = DeviceInfo.Platform.ToString(), osVersion = DeviceInfo.VersionString }
                    });
                    break;

                case "databaseRequest":
                    if (string.IsNullOrWhiteSpace(requestId))
                    {
                        throw new JsonException("Databázový požadavek neobsahuje ID.");
                    }
                    if (!IsTrustedAppPage())
                    {
                        throw new UnauthorizedAccessException("Databázi mohou používat pouze lokální stránky aplikace.");
                    }
                    await HandleDatabaseRequest(requestId, root.GetProperty("payload"));
                    break;

                case "notify":
                    await SendStructuredToAngular(new { type = "notify", payload = new { text = "MAUI: zpráva byla přijata." } });
                    break;

                default:
                    await SendStructuredToAngular(new { type = "notify", payload = new { text = $"MAUI: neznámý typ zprávy '{requestType}'." } });
                    break;
            }
        }
        catch (Exception ex)
        {
            if (requestType == "databaseRequest" && !string.IsNullOrWhiteSpace(requestId))
            {
                await SendStructuredToAngular(new
                {
                    type = "databaseResponse",
                    id = requestId,
                    payload = new { error = ex.Message },
                });
            }
            else
            {
                await SendStructuredToAngular(new { type = "notify", payload = new { text = $"Chyba MAUI: {ex.Message}" } });
            }
        }
    }

    private async Task HandleDatabaseRequest(string requestId, JsonElement payload)
    {
        var action = payload.GetProperty("action").GetString();
        switch (action)
        {
            case "initialize":
            {
                var legacyTrips = payload.GetProperty("legacyTripsJson").GetString()
                    ?? throw new JsonException("Chybí data pro migraci itinerářů.");
                var tripsJson = await _tripDatabase.InitializeAndLoadAsync(legacyTrips);
                using var tripsDocument = JsonDocument.Parse(tripsJson);
                await SendStructuredToAngular(new
                {
                    type = "databaseResponse",
                    id = requestId,
                    payload = new { result = tripsDocument.RootElement },
                });
                break;
            }
            case "saveTrips":
                await _tripDatabase.SaveTripsAsync(payload.GetProperty("trips").GetRawText());
                await SendStructuredToAngular(new
                {
                    type = "databaseResponse",
                    id = requestId,
                    payload = new { result = true },
                });
                break;
            case "deleteTrip":
                await _tripDatabase.DeleteTripAsync(payload.GetProperty("tripId").GetString()
                    ?? throw new JsonException("Chybí ID itineráře."));
                await SendStructuredToAngular(new
                {
                    type = "databaseResponse",
                    id = requestId,
                    payload = new { result = true },
                });
                break;
            case "pickTripImage":
            {
                var imageUrl = await PickTripImageAsync();
                await SendStructuredToAngular(new
                {
                    type = "databaseResponse",
                    id = requestId,
                    payload = new { result = imageUrl },
                });
                break;
            }
            default:
                throw new JsonException($"Neznámá databázová operace '{action}'.");
        }
    }

    private static async Task<string?> PickTripImageAsync()
    {
        var image = await FilePicker.Default.PickAsync(new PickOptions
        {
            PickerTitle = "Vyberte obrázek projektu",
            FileTypes = FilePickerFileType.Images,
        });
        if (image is null)
        {
            return null;
        }

        var extension = Path.GetExtension(image.FileName).ToLowerInvariant();
        var contentType = extension switch
        {
            ".jpg" or ".jpeg" => "image/jpeg",
            ".png" => "image/png",
            ".webp" => "image/webp",
            _ => throw new InvalidOperationException("Vyberte obrázek ve formátu JPG, PNG nebo WebP."),
        };
        const long maximumImageSize = 12 * 1024 * 1024;
        var imagesDirectory = Path.Combine(FileSystem.AppDataDirectory, "trip-images");
        Directory.CreateDirectory(imagesDirectory);
        var fileName = $"{Guid.NewGuid():N}{extension}";
        var destinationPath = Path.Combine(imagesDirectory, fileName);
        var temporaryPath = destinationPath + ".tmp";

        try
        {
            await using var source = await image.OpenReadAsync();
            await using var destination = new FileStream(
                temporaryPath,
                FileMode.CreateNew,
                FileAccess.Write,
                FileShare.None,
                81920,
                useAsync: true);
            var buffer = new byte[81920];
            long totalBytes = 0;
            int bytesRead;
            while ((bytesRead = await source.ReadAsync(buffer)) > 0)
            {
                totalBytes += bytesRead;
                if (totalBytes > maximumImageSize)
                {
                    throw new InvalidOperationException("Obrázek je příliš velký. Maximální velikost je 12 MB.");
                }
                await destination.WriteAsync(buffer.AsMemory(0, bytesRead));
            }
            await destination.FlushAsync();

            if (DeviceInfo.Platform == DevicePlatform.WinUI)
            {
                return $"https://tripimages.example/{Uri.EscapeDataString(fileName)}";
            }

            var imageBytes = await File.ReadAllBytesAsync(temporaryPath);
            return $"data:{contentType};base64,{Convert.ToBase64String(imageBytes)}";
        }
        catch
        {
            if (File.Exists(temporaryPath))
            {
                File.Delete(temporaryPath);
            }
            throw;
        }
        finally
        {
            if (File.Exists(temporaryPath))
            {
                File.Move(temporaryPath, destinationPath);
            }
        }
    }

    private bool IsTrustedAppPage()
    {
#if WINDOWS
        var source = (webView.Handler?.PlatformView as WebView2)?.CoreWebView2?.Source;
        return Uri.TryCreate(source, UriKind.Absolute, out var uri)
            && uri.Scheme == Uri.UriSchemeHttps
            && uri.Host.Equals("appassets.example", StringComparison.OrdinalIgnoreCase);
#else
        return webView.Source is UrlWebViewSource localPage
            && Uri.TryCreate(localPage.Url, UriKind.Absolute, out var uri)
            && uri.IsFile;
#endif
    }

    private async Task SendStructuredToAngular(object obj)
    {
        var json = JsonSerializer.Serialize(obj);
        var b64 = Convert.ToBase64String(Encoding.UTF8.GetBytes(json));
        await webView.EvaluateJavaScriptAsync($"angularReceiveStructured({JsString(b64)})");
    }

    private static string ExtractHostPayload(string url)
    {
        const string prefix = "maui://request/";
        if (!url.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
        {
            return string.Empty;
        }

        var payload = url[prefix.Length..];
        var end = payload.IndexOfAny(new[] { '?', '#' });
        if (end >= 0)
        {
            payload = payload[..end];
        }
        return WebUtility.UrlDecode(payload);
    }

    private static string FromBase64Url(string base64url)
    {
        var b64 = base64url.Replace('-', '+').Replace('_', '/');
        var pad = b64.Length % 4;
        if (pad == 2) b64 += "==";
        else if (pad == 3) b64 += "=";
        else if (pad == 1) throw new FormatException("Invalid base64url length");
        var bytes = Convert.FromBase64String(b64);
        return Encoding.UTF8.GetString(bytes);
    }
}
