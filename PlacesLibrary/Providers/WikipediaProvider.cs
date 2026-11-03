using System.Net;
using System.Globalization;
using System.Text;
using System.Text.Json;
using PlacesLibrary.Models;

namespace PlacesLibrary.Providers;

public sealed class WikipediaProvider(HttpClient httpClient)
{
    public async Task<WikipediaSummary?> FindSummaryAsync(
        string placeName,
        string? linkedPageTitle = null,
        CancellationToken cancellationToken = default)
    {
        var title = string.IsNullOrWhiteSpace(linkedPageTitle) ? placeName.Trim() : linkedPageTitle.Trim();
        if (string.IsNullOrWhiteSpace(title))
        {
            throw new ArgumentException("Název místa nesmí být prázdný.", nameof(placeName));
        }

        var query = new Dictionary<string, string>
        {
            ["action"] = "query",
            ["prop"] = "extracts|info|pageprops",
            ["exintro"] = "1",
            ["explaintext"] = "1",
            ["inprop"] = "url",
            ["redirects"] = "1",
            ["titles"] = title,
            ["format"] = "json",
        };
        var queryString = string.Join("&", query.Select(pair =>
            $"{WebUtility.UrlEncode(pair.Key)}={WebUtility.UrlEncode(pair.Value)}"));
        using var response = await httpClient.GetAsync(
            $"https://cs.wikipedia.org/w/api.php?{queryString}",
            cancellationToken);
        response.EnsureSuccessStatusCode();
        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
        using var document = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken);

        if (!document.RootElement.TryGetProperty("query", out var queryElement) ||
            !queryElement.TryGetProperty("pages", out var pagesElement))
        {
            return null;
        }

        var page = pagesElement.EnumerateObject().Select(item => item.Value).FirstOrDefault();
        if (page.ValueKind == JsonValueKind.Undefined ||
            page.TryGetProperty("missing", out _) ||
            (page.TryGetProperty("pageprops", out var pageProps) &&
             pageProps.TryGetProperty("disambiguation", out _)) ||
            !page.TryGetProperty("extract", out var extractElement))
        {
            return null;
        }

        var extract = extractElement.GetString();
        var pageTitle = page.TryGetProperty("title", out var titleElement)
            ? titleElement.GetString()
            : null;
        if (string.IsNullOrWhiteSpace(extract) || string.IsNullOrWhiteSpace(pageTitle))
        {
            return null;
        }

        if (string.IsNullOrWhiteSpace(linkedPageTitle) &&
            !NormalizeTitle(pageTitle).Equals(NormalizeTitle(placeName), StringComparison.Ordinal))
        {
            return null;
        }

        var url = page.TryGetProperty("fullurl", out var urlElement)
            ? urlElement.GetString()
            : null;
        return new WikipediaSummary
        {
            Title = pageTitle,
            Extract = extract,
            Url = url ?? $"https://cs.wikipedia.org/wiki/{Uri.EscapeDataString(pageTitle.Replace(' ', '_'))}",
        };
    }

    private static string NormalizeTitle(string title) =>
        string.Concat(title.Normalize(NormalizationForm.FormD)
                .Where(character => CharUnicodeInfo.GetUnicodeCategory(character) != UnicodeCategory.NonSpacingMark))
            .Replace('_', ' ')
            .Trim()
            .ToLowerInvariant();
}
