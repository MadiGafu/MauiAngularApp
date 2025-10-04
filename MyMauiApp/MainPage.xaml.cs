using Microsoft.Maui.Controls;
using Microsoft.Maui.Devices;
using System.Net;
using System.Text;
using System.Text.Json;

namespace MyMauiApp;

public partial class MainPage : ContentPage
{
    public MainPage()
    {
        InitializeComponent();
    }

    private static string JsString(string s) => JsonSerializer.Serialize(s);

    // MAUI -> Angular notify
    private async void OnSendToAngularClicked(object sender, EventArgs e)
    {
        var payload = new { type = "notify", payload = new { text = "Привет из MAUI 🚀" } };
        await SendStructuredToAngular(payload);
    }

    private void OnRefreshClicked(object sender, EventArgs e)
    {
        webView.Reload();
    }

    // Показать лоадер при обычной навигации (не maui://)
    private void ShowLoader(bool on)
    {
        spinner.IsVisible = spinner.IsRunning = on;
    }

    private async void OnWebViewNavigated(object sender, WebNavigatedEventArgs e)
    {
        ShowLoader(false);
        // флаг для Angular
        await webView.EvaluateJavaScriptAsync("window.__IS_MAUI_WEBVIEW__ = true");
    }

    private async void OnWebViewNavigating(object sender, WebNavigatingEventArgs e)
    {
        var url = e?.Url ?? string.Empty;

        if (!url.StartsWith("maui://", StringComparison.OrdinalIgnoreCase))
        {
            ShowLoader(true);
            return;
        }

        // кастомная схема → перехватываем
        e.Cancel = true;

        try
        {
            var base64url = ExtractHostPayload(url);
            if (string.IsNullOrWhiteSpace(base64url))
            {
                await SendStructuredToAngular(new { type = "notify", payload = new { text = "MAUI error: empty payload" } });
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
                    // опционально можно что-то сделать на стороне MAUI
                    await SendStructuredToAngular(new { type = "notify", payload = new { text = "MAUI: notify принят" } });
                    break;

                default:
                    await SendStructuredToAngular(new { type = "notify", payload = new { text = $"MAUI: неизвестный тип '{type}'" } });
                    break;
            }
        }
        catch (Exception ex)
        {
            await SendStructuredToAngular(new { type = "notify", payload = new { text = $"MAUI error: {ex.Message}" } });
        }
    }

    // ===== helpers =====
    private async Task SendStructuredToAngular(object obj)
    {
        var json = JsonSerializer.Serialize(obj);
        var b64 = Convert.ToBase64String(Encoding.UTF8.GetBytes(json));
        await webView.EvaluateJavaScriptAsync($"angularReceiveStructured({JsString(b64)})");
    }

    // maui://<PAYLOAD>[/...]
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
