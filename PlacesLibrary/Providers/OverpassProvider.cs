using System.Globalization;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using PlacesLibrary.Models;

namespace PlacesLibrary.Providers;

public sealed class OverpassProvider(HttpClient httpClient) : IPlaceProvider
{
    private const string Endpoint = "https://overpass-api.de/api/interpreter";
    private static readonly TimeSpan RequestTimeout = TimeSpan.FromSeconds(5);

    public async Task<IReadOnlyList<Place>> SearchAsync(
        PlaceSearchCriteria criteria,
        CancellationToken cancellationToken = default)
    {
        ValidateCriteria(criteria);
        var escapedQuery = Regex.Escape(criteria.Query.Trim())
            .Replace("\\ ", " ")
            .Replace("\\", "\\\\")
            .Replace("\"", "\\\"");
        var south = Format(criteria.South);
        var north = Format(criteria.North);
        var west = Format(criteria.West);
        var east = Format(criteria.East);
        var query = $$"""
            [out:json][timeout:25];
            (
              nwr["name"~"{{escapedQuery}}",i]["tourism"]({{south}},{{west}},{{north}},{{east}});
              nwr["name"~"{{escapedQuery}}",i]["historic"]({{south}},{{west}},{{north}},{{east}});
              nwr["name"~"{{escapedQuery}}",i]["amenity"~"^(museum|arts_centre|theatre|place_of_worship|restaurant|cafe)$"]({{south}},{{west}},{{north}},{{east}});
              nwr["name"~"{{escapedQuery}}",i]["leisure"~"^(park|garden|stadium|water_park)$"]({{south}},{{west}},{{north}},{{east}});
            );
            out center tags;
            """;

        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeout.CancelAfter(RequestTimeout);
        using var content = new StringContent(
            $"data={Uri.EscapeDataString(query)}",
            Encoding.UTF8,
            "application/x-www-form-urlencoded");
        using var response = await httpClient.PostAsync(Endpoint, content, timeout.Token);
        response.EnsureSuccessStatusCode();
        await using var stream = await response.Content.ReadAsStreamAsync(timeout.Token);
        using var document = await JsonDocument.ParseAsync(stream, cancellationToken: timeout.Token);
        var places = new List<Place>();

        if (!document.RootElement.TryGetProperty("elements", out var elements))
        {
            throw new JsonException("Odpověď Overpass neobsahuje seznam nalezených objektů.");
        }

        foreach (var element in elements.EnumerateArray())
        {
            var place = MapElement(element, criteria.CityName);
            if (place is not null)
            {
                places.Add(place);
            }
        }

        return places;
    }

    private static Place? MapElement(JsonElement element, string cityName)
    {
        if (!element.TryGetProperty("tags", out var tags) ||
            !tags.TryGetProperty("name", out var nameElement) ||
            !element.TryGetProperty("type", out var typeElement) ||
            !element.TryGetProperty("id", out var idElement))
        {
            return null;
        }

        var name = nameElement.GetString();
        if (string.IsNullOrWhiteSpace(name))
        {
            return null;
        }

        var osmType = typeElement.GetString()!;
        var osmId = idElement.GetInt64();
        var (latitude, longitude) = GetCoordinates(element, osmType);
        var (category, type) = GetCategory(tags);
        var address = BuildAddress(tags, name, cityName);
        var wikipedia = GetTag(tags, "wikipedia");
        var wikidata = GetTag(tags, "wikidata");

        return new Place
        {
            OsmType = osmType,
            OsmId = osmId,
            Name = name,
            Category = category,
            Type = type,
            DisplayName = address,
            Latitude = latitude.ToString(CultureInfo.InvariantCulture),
            Longitude = longitude.ToString(CultureInfo.InvariantCulture),
            ExtraTags = wikipedia is not null || wikidata is not null
                ? new PlaceExtraTags { Wikipedia = wikipedia, Wikidata = wikidata }
                : null,
        };
    }

    private static (double Latitude, double Longitude) GetCoordinates(JsonElement element, string osmType)
    {
        var coordinates = element;
        if (osmType != "node")
        {
            if (!element.TryGetProperty("center", out coordinates))
            {
                throw new JsonException("Odpověď Overpass neobsahuje souřadnice objektu.");
            }
        }

        if (!coordinates.TryGetProperty("lat", out var latitude) ||
            !coordinates.TryGetProperty("lon", out var longitude))
        {
            throw new JsonException("Odpověď Overpass obsahuje neplatné souřadnice.");
        }

        return (latitude.GetDouble(), longitude.GetDouble());
    }

    private static string BuildAddress(JsonElement tags, string name, string cityName)
    {
        var street = GetTag(tags, "addr:street");
        var city = GetTag(tags, "addr:city") ?? cityName;
        return string.Join(", ", new[] { name, street, city }.Where(value => !string.IsNullOrWhiteSpace(value)));
    }

    private static (string Category, string Type) GetCategory(JsonElement tags)
    {
        foreach (var category in new[] { "tourism", "historic", "amenity", "leisure" })
        {
            var value = GetTag(tags, category);
            if (!string.IsNullOrWhiteSpace(value))
            {
                return (category, value);
            }
        }

        return ("tourism", "attraction");
    }

    private static string? GetTag(JsonElement tags, string name) =>
        tags.TryGetProperty(name, out var value) ? value.GetString() : null;

    private static string Format(double value) => value.ToString("0.######", CultureInfo.InvariantCulture);

    private static void ValidateCriteria(PlaceSearchCriteria criteria)
    {
        if (string.IsNullOrWhiteSpace(criteria.Query))
        {
            throw new ArgumentException("Zadejte název hledaného místa.", nameof(criteria));
        }

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
