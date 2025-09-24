using Microsoft.Maui.Controls;
using System.Text.Json;

namespace MyMauiApp;

public partial class MainPage : ContentPage
{
    public MainPage()
    {
        InitializeComponent();
    }

    // Безопасно сериализуем строку в JS-литерал
    private static string JsString(string s) => JsonSerializer.Serialize(s);

    private async void OnSendToAngularClicked(object sender, EventArgs e)
    {
        var message = "Привет из MAUI ";
        await MainThread.InvokeOnMainThreadAsync(async () =>
        {
            // MAUI -> Angular
            await webView.EvaluateJavaScriptAsync($"receiveMessage({JsString(message)})");
        });
    }

    // Angular -> MAUI через схему maui://<urlencoded>
    private async void OnWebViewNavigating(object sender, WebNavigatingEventArgs e)
    {
        var url = e?.Url ?? string.Empty;
        if (url.StartsWith("maui://", StringComparison.OrdinalIgnoreCase))
        {
            e.Cancel = true; // не уходим со страницы
            var payload = Uri.UnescapeDataString(url.Substring("maui://".Length));

            // Показать приём
            await DisplayAlert("Из Angular", payload, "OK");

            // Ответить обратно в Angular
            var reply = $"MAUI получил: {payload}";
            await MainThread.InvokeOnMainThreadAsync(async () =>
            {
                await webView.EvaluateJavaScriptAsync($"receiveMessage({JsString(reply)})");
            });
        }
    }

    // Ставим флаг, что это WebView MAUI, уже ПОСЛЕ загрузки страницы
    private async void OnWebViewNavigated(object sender, WebNavigatedEventArgs e)
    {
        await MainThread.InvokeOnMainThreadAsync(async () =>
        {
            if (webView != null)
            {
                await webView.EvaluateJavaScriptAsync("window.__IS_MAUI_WEBVIEW__ = true");
            }
        });
    }
}
