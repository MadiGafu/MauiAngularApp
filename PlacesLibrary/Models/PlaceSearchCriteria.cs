namespace PlacesLibrary.Models;

public sealed class PlaceSearchCriteria
{
    public required string Query { get; init; }
    public required string CityName { get; init; }
    public required double South { get; init; }
    public required double North { get; init; }
    public required double West { get; init; }
    public required double East { get; init; }
}

public sealed class WikipediaSummary
{
    public required string Title { get; init; }
    public required string Extract { get; init; }
    public required string Url { get; init; }
}
