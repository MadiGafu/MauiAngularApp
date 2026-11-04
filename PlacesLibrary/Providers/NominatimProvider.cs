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

    public Task<IReadOnlyList<Place>> SearchWithinCityAsync(
        string query,
        PlaceSearchCriteria criteria,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(query))
        {
            throw new ArgumentException("Zadejte název hledaného místa.", nameof(query));
        }

        var uri = new UriBuilder("https://nominatim.openstreetmap.org/search")
        {
            Query = string.Join("&", new Dictionary<string, string>
            {
                ["q"] = query.Trim(),
                ["format"] = "jsonv2",
                ["addressdetails"] = "1",
                ["extratags"] = "1",
                ["namedetails"] = "1",
                ["limit"] = "10",
                ["viewbox"] = string.Join(",", new[]
                {
                    Format(criteria.West),
                    Format(criteria.North),
                    Format(criteria.East),
                    Format(criteria.South),
                }),
                ["bounded"] = "1",
            }.Select(parameter =>
                $"{WebUtility.UrlEncode(parameter.Key)}={WebUtility.UrlEncode(parameter.Value)}")),
        };

        ValidateBounds(criteria);
        return GetSearchResultsAsync(uri.Uri, cancellationToken);
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
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeout.CancelAfter(TimeSpan.FromSeconds(10));
        await _requestGate.WaitAsync(timeout.Token);
        try
        {
            var wait = TimeSpan.FromSeconds(1) - (DateTimeOffset.UtcNow - _lastRequestAt);
            if (_lastRequestAt != default && wait > TimeSpan.Zero)
            {
                await Task.Delay(wait, timeout.Token);
            }

            using var response = await httpClient.GetAsync(uri, timeout.Token);
            _lastRequestAt = DateTimeOffset.UtcNow;
            response.EnsureSuccessStatusCode();
            await using var stream = await response.Content.ReadAsStreamAsync(timeout.Token);
            return await JsonSerializer.DeserializeAsync<List<Place>>(stream, JsonOptions, timeout.Token)
                ?? [];
        }
        catch (OperationCanceledException exception) when (!cancellationToken.IsCancellationRequested)
        {
            throw new TimeoutException("Vyhledávání míst přes Nominatim překročilo časový limit 10 sekund.", exception);
        }
        finally
        {
            _requestGate.Release();
        }
    }

    private static string Format(double value) => value.ToString("0.######", CultureInfo.InvariantCulture);

    private static void ValidateBounds(PlaceSearchCriteria criteria)
    {
        if (!double.IsFinite(criteria.South) || !double.IsFinite(criteria.North) ||
            !double.IsFinite(criteria.West) || !double.IsFinite(criteria.East) ||
            criteria.South >= criteria.North || criteria.West >= criteria.East ||
            criteria.South < -90 || criteria.North > 90 ||
            criteria.West < -180 || criteria.East > 180)
        {
            throw new ArgumentException("Hranice vybraného města nejsou platné.", nameof(criteria));
        }
    }
}
