using System.Globalization;
using System.Text;
using System.Text.Json;
using PlacesLibrary.Models;
using PlacesLibrary.Providers;

namespace PlacesLibrary.Services;

public sealed class PlaceAggregator(
    NominatimProvider nominatim,
    IPlaceProvider overpass,
    WikipediaProvider wikipedia)
{
    private const double CoordinateCellSize = 0.0005;
    private const double DuplicateDistanceMeters = 30;

    public Task<IReadOnlyList<Place>> SearchCitiesAsync(
        string query,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(query))
        {
            throw new ArgumentException("Zadejte název města.", nameof(query));
        }

        return nominatim.SearchCitiesAsync(query.Trim(), cancellationToken);
    }

    public async Task<IReadOnlyList<Place>> SearchPlacesAsync(
        PlaceSearchCriteria criteria,
        CancellationToken cancellationToken = default)
    {
        IReadOnlyList<Place> results;
        try
        {
            results = await overpass.SearchAsync(criteria, cancellationToken);
        }
        catch (HttpRequestException) when (!cancellationToken.IsCancellationRequested)
        {
            results = await SearchWithFallbackAsync(criteria, cancellationToken);
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            results = await SearchWithFallbackAsync(criteria, cancellationToken);
        }
        catch (JsonException) when (!cancellationToken.IsCancellationRequested)
        {
            results = await SearchWithFallbackAsync(criteria, cancellationToken);
        }

        return MergeDuplicates(results)
            .OrderByDescending(Score)
            .ThenBy(place => place.Name, StringComparer.CurrentCultureIgnoreCase)
            .Take(50)
            .ToArray();
    }

    private async Task<IReadOnlyList<Place>> SearchWithFallbackAsync(
        PlaceSearchCriteria criteria,
        CancellationToken cancellationToken)
    {
        try
        {
            return await nominatim.SearchWithinCityAsync(criteria.Query, criteria, cancellationToken);
        }
        catch (HttpRequestException exception) when (!cancellationToken.IsCancellationRequested)
        {
            throw new InvalidOperationException(
                "Vyhledávání míst je momentálně nedostupné. Overpass ani záložní vyhledávání Nominatim neodpovídají.",
                exception);
        }
        catch (TimeoutException exception) when (!cancellationToken.IsCancellationRequested)
        {
            throw new InvalidOperationException(
                "Vyhledávání míst je momentálně přetížené. Zkuste to prosím za chvíli.",
                exception);
        }
        catch (OperationCanceledException exception) when (!cancellationToken.IsCancellationRequested)
        {
            throw new InvalidOperationException(
                "Vyhledávání míst bylo přerušeno. Zkuste to prosím znovu.",
                exception);
        }
    }

    public Task<string?> FindLinkedWikipediaTitleAsync(
        string osmType,
        long osmId,
        CancellationToken cancellationToken = default) =>
        nominatim.FindLinkedCzechWikipediaTitleAsync(osmType, osmId, cancellationToken);

    public Task<WikipediaSummary?> FindWikipediaSummaryAsync(
        string placeName,
        string? linkedPageTitle,
        CancellationToken cancellationToken = default) =>
        wikipedia.FindSummaryAsync(placeName, linkedPageTitle, cancellationToken);

    private static int Score(Place place)
    {
        var score = string.IsNullOrWhiteSpace(place.Name) ? 0 : 1;
        if (!string.IsNullOrWhiteSpace(place.ExtraTags?.Wikipedia)) score += 4;
        if (!string.IsNullOrWhiteSpace(place.ExtraTags?.Wikidata)) score += 2;
        if (place.Type is "museum" or "castle" or "monument" or "attraction" or "artwork")
        {
            score += 1;
        }
        return score;
    }

    private static IReadOnlyList<Place> MergeDuplicates(IReadOnlyList<Place> places)
    {
        var parents = Enumerable.Range(0, places.Count).ToArray();
        var osmIndexes = new Dictionary<(string Type, long Id), int>();
        var wikidataIndexes = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        var coordinateIndexes = new Dictionary<(string Name, int Latitude, int Longitude), List<int>>();

        int Find(int index)
        {
            if (parents[index] != index)
            {
                parents[index] = Find(parents[index]);
            }

            return parents[index];
        }

        void Union(int first, int second)
        {
            var firstRoot = Find(first);
            var secondRoot = Find(second);
            if (firstRoot != secondRoot)
            {
                parents[secondRoot] = firstRoot;
            }
        }

        for (var index = 0; index < places.Count; index++)
        {
            var place = places[index];
            var osmKey = (place.OsmType, place.OsmId);
            if (osmIndexes.TryGetValue(osmKey, out var sameOsmIndex))
            {
                Union(index, sameOsmIndex);
            }
            else
            {
                osmIndexes.Add(osmKey, index);
            }

            var wikidataId = place.ExtraTags?.Wikidata?.Trim();
            if (!string.IsNullOrEmpty(wikidataId))
            {
                if (wikidataIndexes.TryGetValue(wikidataId, out var sameWikidataIndex))
                {
                    Union(index, sameWikidataIndex);
                }
                else
                {
                    wikidataIndexes.Add(wikidataId, index);
                }
            }

            var normalizedName = NormalizeName(place.Name);
            if (normalizedName.Length == 0 ||
                !double.TryParse(place.Latitude, CultureInfo.InvariantCulture, out var latitude) ||
                !double.TryParse(place.Longitude, CultureInfo.InvariantCulture, out var longitude))
            {
                continue;
            }

            var latitudeCell = (int)Math.Floor(latitude / CoordinateCellSize);
            var longitudeCell = (int)Math.Floor(longitude / CoordinateCellSize);
            for (var latitudeOffset = -1; latitudeOffset <= 1; latitudeOffset++)
            {
                for (var longitudeOffset = -1; longitudeOffset <= 1; longitudeOffset++)
                {
                    var nearbyKey = (normalizedName, latitudeCell + latitudeOffset, longitudeCell + longitudeOffset);
                    if (!coordinateIndexes.TryGetValue(nearbyKey, out var nearbyIndexes))
                    {
                        continue;
                    }

                    foreach (var nearbyIndex in nearbyIndexes)
                    {
                        if (DistanceInMeters(latitude, longitude, places[nearbyIndex]) <= DuplicateDistanceMeters)
                        {
                            Union(index, nearbyIndex);
                        }
                    }
                }
            }

            var coordinateKey = (normalizedName, latitudeCell, longitudeCell);
            if (!coordinateIndexes.TryGetValue(coordinateKey, out var indexes))
            {
                indexes = [];
                coordinateIndexes.Add(coordinateKey, indexes);
            }
            indexes.Add(index);
        }

        return Enumerable.Range(0, places.Count)
            .GroupBy(Find)
            .Select(group => MergePlace(group.Select(index => places[index])))
            .ToArray();
    }

    private static Place MergePlace(IEnumerable<Place> group)
    {
        var candidates = group.OrderByDescending(Score).ToArray();
        var best = candidates[0];
        var nameDetails = candidates
            .Where(place => place.NameDetails is not null)
            .SelectMany(place => place.NameDetails!)
            .GroupBy(pair => pair.Key, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(items => items.Key, items => items.First().Value, StringComparer.OrdinalIgnoreCase);

        return new Place
        {
            OsmType = best.OsmType,
            OsmId = best.OsmId,
            Name = FirstValue(candidates.Select(place => place.Name)),
            Category = FirstValue(candidates.Select(place => place.Category)) ?? best.Category,
            Type = FirstValue(candidates.Select(place => place.Type)) ?? best.Type,
            DisplayName = FirstValue(candidates.Select(place => place.DisplayName)) ?? best.DisplayName,
            Latitude = FirstValue(candidates.Select(place => place.Latitude)) ?? best.Latitude,
            Longitude = FirstValue(candidates.Select(place => place.Longitude)) ?? best.Longitude,
            BoundingBox = candidates.Select(place => place.BoundingBox).FirstOrDefault(box => box is not null),
            ExtraTags = new PlaceExtraTags
            {
                Wikipedia = FirstValue(candidates.Select(place => place.ExtraTags?.Wikipedia)),
                Wikidata = FirstValue(candidates.Select(place => place.ExtraTags?.Wikidata)),
            },
            NameDetails = nameDetails.Count > 0 ? nameDetails : null,
        };
    }

    private static string? FirstValue(IEnumerable<string?> values) =>
        values.FirstOrDefault(value => !string.IsNullOrWhiteSpace(value));

    private static string NormalizeName(string? name)
    {
        if (string.IsNullOrWhiteSpace(name))
        {
            return string.Empty;
        }

        var normalized = name.Normalize(NormalizationForm.FormD);
        return string.Concat(normalized
                .Where(character => CharUnicodeInfo.GetUnicodeCategory(character) != UnicodeCategory.NonSpacingMark))
            .Trim()
            .ToLowerInvariant();
    }

    private static double DistanceInMeters(double latitude, double longitude, Place other)
    {
        if (!double.TryParse(other.Latitude, CultureInfo.InvariantCulture, out var otherLatitude) ||
            !double.TryParse(other.Longitude, CultureInfo.InvariantCulture, out var otherLongitude))
        {
            return double.MaxValue;
        }

        const double earthRadius = 6_371_000;
        var latitudeDelta = DegreesToRadians(otherLatitude - latitude);
        var longitudeDelta = DegreesToRadians(otherLongitude - longitude);
        var haversine = Math.Pow(Math.Sin(latitudeDelta / 2), 2)
            + Math.Cos(DegreesToRadians(latitude))
            * Math.Cos(DegreesToRadians(otherLatitude))
            * Math.Pow(Math.Sin(longitudeDelta / 2), 2);
        return earthRadius * 2 * Math.Asin(Math.Sqrt(haversine));
    }

    private static double DegreesToRadians(double degrees) => degrees * Math.PI / 180;
}
