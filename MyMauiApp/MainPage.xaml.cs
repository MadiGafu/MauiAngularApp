using Microsoft.Maui.Controls;
using Microsoft.Maui.Devices;
using Microsoft.Maui.Storage;
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
    public MainPage()
    {
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
            await platformView.CoreWebView2.AddScriptToExecuteOnDocumentCreatedAsync(
                "window.__IS_MAUI_WEBVIEW__ = true;");
            platformView.CoreWebView2.SetVirtualHostNameToFolderMapping(
                "appassets.example",
                assetsDirectory,
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

            var type = root.GetProperty("type").GetString();
            var id = root.TryGetProperty("id", out var idProp) ? idProp.GetString() : null;

            switch (type)
            {
                case "ping":
                    await SendStructuredToAngular(new { type = "pong", id, payload = new { serverTime = DateTime.UtcNow.ToString("u") } });
                    break;

                case "getDevice":
                    await SendStructuredToAngular(new
                    {
                        type = "deviceInfo",
                        id,
                        payload = new { platform = DeviceInfo.Platform.ToString(), osVersion = DeviceInfo.VersionString }
                    });
                    break;

                case "notify":
                    await SendStructuredToAngular(new { type = "notify", payload = new { text = "MAUI: zpráva byla přijata." } });
                    break;

                default:
                    await SendStructuredToAngular(new { type = "notify", payload = new { text = $"MAUI: neznámý typ zprávy '{type}'." } });
                    break;
            }
        }
        catch (Exception ex)
        {
            await SendStructuredToAngular(new { type = "notify", payload = new { text = $"Chyba MAUI: {ex.Message}" } });
        }
    }

    private async Task SendStructuredToAngular(object obj)
    {
        var json = JsonSerializer.Serialize(obj);
        var b64 = Convert.ToBase64String(Encoding.UTF8.GetBytes(json));
        await webView.EvaluateJavaScriptAsync($"angularReceiveStructured({JsString(b64)})");
    }

    private static string ExtractHostPayload(string url)
    {
        var rest = url.Substring("maui://".Length);
        if (string.IsNullOrEmpty(rest)) return string.Empty;
        var end = rest.IndexOfAny(new[] { '/', '?', '#' });
        var host = end >= 0 ? rest[..end] : rest;
        return WebUtility.UrlDecode(host);
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
