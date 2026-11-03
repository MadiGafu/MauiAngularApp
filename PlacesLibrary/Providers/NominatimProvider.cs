using System.Globalization;
using System.Net;
using System.Text.Json;
using PlacesLibrary.Models;

namespace PlacesLibrary.Providers;

public sealed class NominatimProvider(HttpClient httpClient)
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        PropertyNameCaseInsensitive = true,
    };
    private static readonly HashSet<string> SupportedCityTypes =
        ["city", "town", "village", "municipality"];
    private readonly SemaphoreSlim _requestGate = new(1, 1);
    private DateTimeOffset _lastRequestAt;

    public async Task<IReadOnlyList<Place>> SearchCitiesAsync(
        string query,
        CancellationToken cancellationToken = default)
    {
        var uri = new UriBuilder("https://nominatim.openstreetmap.org/search")
        {
            Query = $"q={Uri.EscapeDataString(query)}&format=jsonv2&addressdetails=1&extratags=1&namedetails=1&limit=10&featuretype=city",
        };
        var results = await GetSearchResultsAsync(uri.Uri, cancellationToken);
        return results
            .Where(place =>
                (place.Category == "place" && SupportedCityTypes.Contains(place.Type)) ||
                (place.Category == "boundary" && place.Type == "administrative"))
            .ToArray();
    }

    public async Task<string?> FindLinkedCzechWikipediaTitleAsync(
        string osmType,
        long osmId,
        CancellationToken cancellationToken = default)
    {
        var osmPrefix = osmType.ToLowerInvariant() switch
        {
            "node" => "N",
            "way" => "W",
            "relation" => "R",
            _ => throw new ArgumentException("Neznámý typ OSM objektu.", nameof(osmType)),
        };
        var uri = new UriBuilder("https://nominatim.openstreetmap.org/lookup")
        {
            Query = $"osm_ids={osmPrefix}{osmId.ToString(CultureInfo.InvariantCulture)}&format=jsonv2&extratags=1",
        };
        var results = await GetSearchResultsAsync(uri.Uri, cancellationToken);
        var wikipediaTag = results.FirstOrDefault()?.ExtraTags?.Wikipedia?.Trim();
        return wikipediaTag?.StartsWith("cs:", StringComparison.OrdinalIgnoreCase) == true
            ? wikipediaTag[3..].Replace('_', ' ').Trim()
            : null;
    }

    private async Task<IReadOnlyList<Place>> GetSearchResultsAsync(
        Uri uri,
        CancellationToken cancellationToken)
    {
        await _requestGate.WaitAsync(cancellationToken);
        try
        {
            var wait = TimeSpan.FromSeconds(1) - (DateTimeOffset.UtcNow - _lastRequestAt);
            if (_lastRequestAt != default && wait > TimeSpan.Zero)
            {
                await Task.Delay(wait, cancellationToken);
            }

            using var response = await httpClient.GetAsync(uri, cancellationToken);
            _lastRequestAt = DateTimeOffset.UtcNow;
            response.EnsureSuccessStatusCode();
            await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
            return await JsonSerializer.DeserializeAsync<List<Place>>(stream, JsonOptions, cancellationToken)
                ?? [];
        }
        finally
        {
            _requestGate.Release();
        }
    }
}
