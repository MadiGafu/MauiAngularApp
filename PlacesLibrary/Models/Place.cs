using System.Text.Json.Serialization;

namespace PlacesLibrary.Models;

public sealed class Place
{
    [JsonPropertyName("osm_type")]
    public required string OsmType { get; init; }

    [JsonPropertyName("osm_id")]
    public required long OsmId { get; init; }

    [JsonPropertyName("name")]
    public string? Name { get; init; }

    [JsonPropertyName("category")]
    public required string Category { get; init; }

    [JsonPropertyName("type")]
    public required string Type { get; init; }

    [JsonPropertyName("display_name")]
    public required string DisplayName { get; init; }

    [JsonPropertyName("lat")]
    public required string Latitude { get; init; }

    [JsonPropertyName("lon")]
    public required string Longitude { get; init; }

    [JsonPropertyName("boundingbox")]
    public string[]? BoundingBox { get; init; }

    [JsonPropertyName("extratags")]
    public PlaceExtraTags? ExtraTags { get; init; }

    [JsonPropertyName("namedetails")]
    public Dictionary<string, string>? NameDetails { get; init; }
}

public sealed class PlaceExtraTags
{
    [JsonPropertyName("wikipedia")]
    public string? Wikipedia { get; init; }

    [JsonPropertyName("wikidata")]
    public string? Wikidata { get; init; }
}
