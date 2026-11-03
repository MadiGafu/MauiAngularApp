using PlacesLibrary.Models;

namespace PlacesLibrary.Providers;

public interface IPlaceProvider
{
    Task<IReadOnlyList<Place>> SearchAsync(
        PlaceSearchCriteria criteria,
        CancellationToken cancellationToken = default);
}
