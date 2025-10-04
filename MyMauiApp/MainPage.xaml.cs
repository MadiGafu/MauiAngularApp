using Microsoft.Maui.Controls;
using Microsoft.Maui.Devices;
using System.Net;                 // WebUtility
using System.Text;
using System.Text.Json;

namespace MyMauiApp;

public partial class MainPage : ContentPage
{
    public MainPage()
    {
        InitializeComponent();
    }

    // Безопасная строка для встраивания в JS
    private static string JsString(string s) => JsonSerializer.Serialize(s);

    // ===== MAUI -> Angular: notify =====
    private async void OnSendToAngularClicked(object sender, EventArgs e)
    {
        var payload = new { type = "notify", payload = new { text = "Привет из MAUI 🚀" } };
        await SendStructuredToAngular(payload);
    }

    // После загрузки страницы помечаем WebView
    private async void OnWebViewNavigated(object sender, WebNavigatedEventArgs e)
    {
        await webView.EvaluateJavaScriptAsync("window.__IS_MAUI_WEBVIEW__ = true");
    }

        // ----- Angular -> MAUI -----
    private async void OnWebViewNavigating(object sender, WebNavigatingEventArgs e)
    {
        var url = e?.Url ?? string.Empty;
        if (!url.StartsWith("maui://", StringComparison.OrdinalIgnoreCase))
            return;

        e.Cancel = true;

        try
        {
            // 1) достаём base64 из query ?m=... ИЛИ из path /<base64>
            var base64 = ExtractBase64FromMauiUrl(url);
            if (string.IsNullOrWhiteSpace(base64))
            {
                await SendStructuredToAngular(new { type = "notify", payload = new { text = "MAUI error: empty payload" } });
                return;
            }

            // 2) base64 -> JSON
            var json = FromBase64Safe(base64);
            using var doc = JsonDocument.Parse(json);
            var root = doc.RootElement;

            var type = root.GetProperty("type").GetString();
            var id = root.TryGetProperty("id", out var idProp) ? idProp.GetString() : null;

            switch (type)
            {
                case "ping":
                {
                    var pong = new { type = "pong", id, payload = new { serverTime = DateTime.Now.ToString("u") } };
                    await SendStructuredToAngular(pong);
                    break;
                }
                case "getDevice":
                {
                    var platform = DeviceInfo.Platform.ToString();
                    var version = DeviceInfo.VersionString;
                    var deviceInfo = new { type = "deviceInfo", id, payload = new { platform, osVersion = version } };
                    await SendStructuredToAngular(deviceInfo);
                    break;
                }
                default:
                {
                    var notify = new { type = "notify", payload = new { text = $"MAUI: неизвестный тип '{type}'" } };
                    await SendStructuredToAngular(notify);
                    break;
                }
            }
        }
        catch (Exception ex)
        {
            await SendStructuredToAngular(new { type = "notify", payload = new { text = $"MAUI error: {ex.Message}" } });
        }
    }

    // ----- helpers -----
    private static string ExtractBase64FromMauiUrl(string url)
    {
        // Принимаем ВСЕ варианты:
        // 1) maui://<base64>                (host = base64)  <-- рекомендуемый
        // 2) maui://bridge/<base64>         (path payload)
        // 3) maui://bridge?m=<base64>       (query payload)

        // убираем схему
        var s = url.Substring("maui://".Length); // может быть "<base64>" ИЛИ "bridge/..." ИЛИ "bridge?..."
        if (string.IsNullOrWhiteSpace(s)) return string.Empty;

        // --- Вариант 1: host = base64 ---
        // host — это до первого '/'
        var firstSlash = s.IndexOf('/');
        var host = firstSlash >= 0 ? s.Substring(0, firstSlash) : s;
        var hostDecoded = WebUtility.UrlDecode(host);
        if (!string.IsNullOrWhiteSpace(hostDecoded) &&
            !hostDecoded.Equals("bridge", StringComparison.OrdinalIgnoreCase))
        {
            return hostDecoded; // это и есть base64
        }

        // --- Вариант 2: query m=... ---
        var qMark = s.IndexOf('?');
        if (qMark >= 0 && qMark + 1 < s.Length)
        {
            var query = s[(qMark + 1)..];
            foreach (var part in query.Split('&', StringSplitOptions.RemoveEmptyEntries))
            {
                var kv = part.Split('=', 2);
                if (kv.Length == 2 && kv[0].Equals("m", StringComparison.OrdinalIgnoreCase))
                    return WebUtility.UrlDecode(kv[1]);
            }
        }

        // --- Вариант 3: path после "bridge/" ---
        if (host.Equals("bridge", StringComparison.OrdinalIgnoreCase) && firstSlash >= 0)
        {
            var rest = s[(firstSlash + 1)..]; // то, что после "bridge/"
            if (!string.IsNullOrWhiteSpace(rest))
                return WebUtility.UrlDecode(rest);
        }

        return string.Empty;
    }


    private static string FromBase64Safe(string base64)
    {
        // нормализуем: пробелы -> '+', добиваем паддинг '='
        base64 = base64.Replace(' ', '+');
        var mod = base64.Length % 4;
        if (mod == 2) base64 += "==";
        else if (mod == 3) base64 += "=";
        else if (mod == 1) throw new FormatException("Invalid Base64 length");

        var bytes = Convert.FromBase64String(base64);
        return Encoding.UTF8.GetString(bytes);
    }

    private async Task SendStructuredToAngular(object obj)
    {
        var json = JsonSerializer.Serialize(obj);
        var base64 = Convert.ToBase64String(Encoding.UTF8.GetBytes(json));
        await webView.EvaluateJavaScriptAsync($"angularReceiveStructured({JsString(base64)})");
    }


    
}
