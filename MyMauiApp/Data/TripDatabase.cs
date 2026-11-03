using Microsoft.Data.Sqlite;
using System.Text.Json;

namespace MyMauiApp.Data;

public sealed class TripDatabase
{
    private const int CurrentSchemaVersion = 3;
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        PropertyNameCaseInsensitive = true,
    };

    private readonly string _databasePath = Path.Combine(FileSystem.AppDataDirectory, "itineraries.db");
    private readonly SemaphoreSlim _gate = new(1, 1);

    public string DatabasePath => _databasePath;

    public async Task<string> InitializeAndLoadAsync(string legacyTripsJson)
    {
        await _gate.WaitAsync();
        try
        {
            await using var connection = await OpenConnectionAsync();
            await EnsureSchemaAsync(connection);

            var tripCountCommand = connection.CreateCommand();
            tripCountCommand.CommandText = "SELECT COUNT(*) FROM Trips;";
            var tripCount = Convert.ToInt64(await tripCountCommand.ExecuteScalarAsync());
            if (tripCount == 0)
            {
                var legacyTrips = JsonSerializer.Deserialize<List<TripDto>>(legacyTripsJson, JsonOptions)
                    ?? throw new JsonException("Data itinerářů v localStorage mají neplatný formát.");
                if (legacyTrips.Count > 0)
                {
                    await SaveTripsAsync(connection, legacyTrips);
                }
            }

            var trips = await LoadTripsAsync(connection);
            return JsonSerializer.Serialize(trips, JsonOptions);
        }
        finally
        {
            _gate.Release();
        }
    }

    public async Task SaveTripsAsync(string tripsJson)
    {
        var trips = JsonSerializer.Deserialize<List<TripDto>>(tripsJson, JsonOptions)
            ?? throw new JsonException("Data itinerářů mají neplatný formát.");

        await _gate.WaitAsync();
        try
        {
            await using var connection = await OpenConnectionAsync();
            await EnsureSchemaAsync(connection);
            await SaveTripsAsync(connection, trips);
        }
        finally
        {
            _gate.Release();
        }
    }

    public async Task DeleteTripAsync(string tripId)
    {
        await _gate.WaitAsync();
        try
        {
            await using var connection = await OpenConnectionAsync();
            await EnsureSchemaAsync(connection);
            var command = connection.CreateCommand();
            command.CommandText = "DELETE FROM Trips WHERE Id = $id;";
            command.Parameters.AddWithValue("$id", tripId);
            await command.ExecuteNonQueryAsync();
        }
        finally
        {
            _gate.Release();
        }
    }

    private async Task<SqliteConnection> OpenConnectionAsync()
    {
        var connection = new SqliteConnection($"Data Source={_databasePath}");
        await connection.OpenAsync();
        var foreignKeys = connection.CreateCommand();
        foreignKeys.CommandText = "PRAGMA foreign_keys = ON;";
        await foreignKeys.ExecuteNonQueryAsync();
        return connection;
    }

    private static async Task EnsureSchemaAsync(SqliteConnection connection)
    {
        var versionCommand = connection.CreateCommand();
        versionCommand.CommandText = "PRAGMA user_version;";
        var version = Convert.ToInt32(await versionCommand.ExecuteScalarAsync());
        if (version > CurrentSchemaVersion)
        {
            throw new InvalidOperationException(
                $"Databáze je ve verzi {version}, kterou tato verze aplikace nepodporuje.");
        }

        if (version == 1)
        {
            await using var transaction = await connection.BeginTransactionAsync();
            var migrateCommand = connection.CreateCommand();
            migrateCommand.Transaction = (SqliteTransaction)transaction;
            migrateCommand.CommandText = """
                ALTER TABLE Trips ADD COLUMN Description TEXT;
                ALTER TABLE Trips ADD COLUMN ImageUrl TEXT;
                UPDATE Trips SET Description = COALESCE(Notes, '');
                PRAGMA user_version = 2;
                """;
            await migrateCommand.ExecuteNonQueryAsync();
            await transaction.CommitAsync();
            version = 2;
        }

        if (version == 2)
        {
            await using var transaction = await connection.BeginTransactionAsync();
            var migrateCommand = connection.CreateCommand();
            migrateCommand.Transaction = (SqliteTransaction)transaction;
            migrateCommand.CommandText = """
                ALTER TABLE Trips ADD COLUMN SelectedCityJson TEXT;
                PRAGMA user_version = 3;
                """;
            await migrateCommand.ExecuteNonQueryAsync();
            await transaction.CommitAsync();
            version = 3;
        }

        if (version == CurrentSchemaVersion)
        {
            return;
        }

        var schemaCommand = connection.CreateCommand();
        schemaCommand.CommandText = """
            CREATE TABLE IF NOT EXISTS Trips (
                Id TEXT NOT NULL PRIMARY KEY,
                Position INTEGER NOT NULL,
                Title TEXT NOT NULL,
                StartDate TEXT NOT NULL,
                EndDate TEXT NOT NULL,
                Description TEXT,
                ImageUrl TEXT,
                SelectedCityJson TEXT,
                Notes TEXT,
                BudgetCurrency TEXT,
                BudgetPlanned REAL,
                BudgetSpent REAL
            );

            CREATE TABLE IF NOT EXISTS TripDestinations (
                TripId TEXT NOT NULL,
                Position INTEGER NOT NULL,
                Name TEXT NOT NULL,
                PRIMARY KEY (TripId, Position),
                FOREIGN KEY (TripId) REFERENCES Trips(Id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS Places (
                Id TEXT NOT NULL PRIMARY KEY,
                TripId TEXT NOT NULL,
                Position INTEGER NOT NULL,
                OsmType TEXT NOT NULL,
                OsmId INTEGER NOT NULL,
                Name TEXT NOT NULL,
                Category TEXT NOT NULL,
                Address TEXT NOT NULL,
                Latitude REAL NOT NULL,
                Longitude REAL NOT NULL,
                WikipediaPageTitle TEXT,
                WikidataId TEXT,
                WikipediaTitle TEXT,
                WikipediaExtract TEXT,
                WikipediaUrl TEXT,
                UNIQUE (TripId, OsmType, OsmId),
                FOREIGN KEY (TripId) REFERENCES Trips(Id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS Tasks (
                Id TEXT NOT NULL PRIMARY KEY,
                TripId TEXT NOT NULL,
                Position INTEGER NOT NULL,
                Text TEXT NOT NULL,
                IsDone INTEGER NOT NULL,
                FOREIGN KEY (TripId) REFERENCES Trips(Id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS IX_Places_TripId_Position
                ON Places(TripId, Position);
            CREATE INDEX IF NOT EXISTS IX_Tasks_TripId_Position
                ON Tasks(TripId, Position);

            PRAGMA user_version = 3;
            """;
        await schemaCommand.ExecuteNonQueryAsync();
    }

    private static async Task SaveTripsAsync(SqliteConnection connection, IEnumerable<TripDto> trips)
    {
        await using var transaction = await connection.BeginTransactionAsync();
        var position = 0;
        foreach (var trip in trips)
        {
            var saveTrip = connection.CreateCommand();
            saveTrip.Transaction = (SqliteTransaction)transaction;
            saveTrip.CommandText = """
                INSERT INTO Trips (Id, Position, Title, StartDate, EndDate, Description, ImageUrl, SelectedCityJson, Notes, BudgetCurrency, BudgetPlanned, BudgetSpent)
                VALUES ($id, $position, $title, $startDate, $endDate, $description, $imageUrl, $city, $notes, $currency, $planned, $spent)
                ON CONFLICT(Id) DO UPDATE SET
                    Position = excluded.Position,
                    Title = excluded.Title,
                    StartDate = excluded.StartDate,
                    EndDate = excluded.EndDate,
                    Description = excluded.Description,
                    ImageUrl = excluded.ImageUrl,
                    SelectedCityJson = excluded.SelectedCityJson,
                    Notes = excluded.Notes,
                    BudgetCurrency = excluded.BudgetCurrency,
                    BudgetPlanned = excluded.BudgetPlanned,
                    BudgetSpent = excluded.BudgetSpent;
                """;
            saveTrip.Parameters.AddWithValue("$id", trip.Id);
            saveTrip.Parameters.AddWithValue("$position", position++);
            saveTrip.Parameters.AddWithValue("$title", trip.Title);
            saveTrip.Parameters.AddWithValue("$startDate", trip.StartDate);
            saveTrip.Parameters.AddWithValue("$endDate", trip.EndDate);
            saveTrip.Parameters.AddWithValue("$description", (object?)trip.Description ?? DBNull.Value);
            saveTrip.Parameters.AddWithValue("$imageUrl", (object?)trip.ImageUrl ?? DBNull.Value);
            saveTrip.Parameters.AddWithValue("$city", trip.City is null
                ? DBNull.Value
                : JsonSerializer.Serialize(trip.City, JsonOptions));
            saveTrip.Parameters.AddWithValue("$notes", (object?)trip.Notes ?? DBNull.Value);
            saveTrip.Parameters.AddWithValue("$currency", (object?)trip.Budget?.Currency ?? DBNull.Value);
            saveTrip.Parameters.AddWithValue("$planned", (object?)trip.Budget?.Planned ?? DBNull.Value);
            saveTrip.Parameters.AddWithValue("$spent", (object?)trip.Budget?.Spent ?? DBNull.Value);
            await saveTrip.ExecuteNonQueryAsync();

            foreach (var childTable in new[] { "TripDestinations", "Places", "Tasks" })
            {
                var deleteChildren = connection.CreateCommand();
                deleteChildren.Transaction = (SqliteTransaction)transaction;
                deleteChildren.CommandText = $"DELETE FROM {childTable} WHERE TripId = $tripId;";
                deleteChildren.Parameters.AddWithValue("$tripId", trip.Id);
                await deleteChildren.ExecuteNonQueryAsync();
            }

            for (var index = 0; index < trip.Destinations.Count; index++)
            {
                var destination = connection.CreateCommand();
                destination.Transaction = (SqliteTransaction)transaction;
                destination.CommandText =
                    "INSERT INTO TripDestinations (TripId, Position, Name) VALUES ($tripId, $position, $name);";
                destination.Parameters.AddWithValue("$tripId", trip.Id);
                destination.Parameters.AddWithValue("$position", index);
                destination.Parameters.AddWithValue("$name", trip.Destinations[index]);
                await destination.ExecuteNonQueryAsync();
            }

            for (var index = 0; index < trip.Places.Count; index++)
            {
                var place = trip.Places[index];
                var insertPlace = connection.CreateCommand();
                insertPlace.Transaction = (SqliteTransaction)transaction;
                insertPlace.CommandText = """
                    INSERT INTO Places (
                        Id, TripId, Position, OsmType, OsmId, Name, Category, Address, Latitude, Longitude,
                        WikipediaPageTitle, WikidataId, WikipediaTitle, WikipediaExtract, WikipediaUrl
                    )
                    VALUES (
                        $id, $tripId, $position, $osmType, $osmId, $name, $category, $address, $latitude,
                        $longitude, $wikipediaPageTitle, $wikidataId, $wikipediaTitle, $wikipediaExtract, $wikipediaUrl
                    );
                    """;
                insertPlace.Parameters.AddWithValue("$id", place.Id);
                insertPlace.Parameters.AddWithValue("$tripId", trip.Id);
                insertPlace.Parameters.AddWithValue("$position", index);
                insertPlace.Parameters.AddWithValue("$osmType", place.OsmType);
                insertPlace.Parameters.AddWithValue("$osmId", place.OsmId);
                insertPlace.Parameters.AddWithValue("$name", place.Name);
                insertPlace.Parameters.AddWithValue("$category", place.Category);
                insertPlace.Parameters.AddWithValue("$address", place.Address);
                insertPlace.Parameters.AddWithValue("$latitude", place.Latitude);
                insertPlace.Parameters.AddWithValue("$longitude", place.Longitude);
                insertPlace.Parameters.AddWithValue("$wikipediaPageTitle", (object?)place.WikipediaPageTitle ?? DBNull.Value);
                insertPlace.Parameters.AddWithValue("$wikidataId", (object?)place.WikidataId ?? DBNull.Value);
                insertPlace.Parameters.AddWithValue("$wikipediaTitle", (object?)place.Wikipedia?.Title ?? DBNull.Value);
                insertPlace.Parameters.AddWithValue("$wikipediaExtract", (object?)place.Wikipedia?.Extract ?? DBNull.Value);
                insertPlace.Parameters.AddWithValue("$wikipediaUrl", (object?)place.Wikipedia?.Url ?? DBNull.Value);
                await insertPlace.ExecuteNonQueryAsync();
            }

            for (var index = 0; index < trip.Tasks.Count; index++)
            {
                var task = trip.Tasks[index];
                var insertTask = connection.CreateCommand();
                insertTask.Transaction = (SqliteTransaction)transaction;
                insertTask.CommandText =
                    "INSERT INTO Tasks (Id, TripId, Position, Text, IsDone) VALUES ($id, $tripId, $position, $text, $isDone);";
                insertTask.Parameters.AddWithValue("$id", task.Id);
                insertTask.Parameters.AddWithValue("$tripId", trip.Id);
                insertTask.Parameters.AddWithValue("$position", index);
                insertTask.Parameters.AddWithValue("$text", task.Text);
                insertTask.Parameters.AddWithValue("$isDone", task.Done ? 1 : 0);
                await insertTask.ExecuteNonQueryAsync();
            }
        }

        await transaction.CommitAsync();
    }

    private static async Task<List<TripDto>> LoadTripsAsync(SqliteConnection connection)
    {
        var trips = new List<TripDto>();
        var selectTrips = connection.CreateCommand();
        selectTrips.CommandText = "SELECT Id, Title, StartDate, EndDate, Description, ImageUrl, SelectedCityJson, Notes, BudgetCurrency, BudgetPlanned, BudgetSpent FROM Trips ORDER BY Position;";
        await using (var reader = await selectTrips.ExecuteReaderAsync())
        {
            while (await reader.ReadAsync())
            {
                trips.Add(new TripDto
                {
                    Id = reader.GetString(0),
                    Title = reader.GetString(1),
                    StartDate = reader.GetString(2),
                    EndDate = reader.GetString(3),
                    Description = reader.IsDBNull(4) ? null : reader.GetString(4),
                    ImageUrl = reader.IsDBNull(5) ? null : reader.GetString(5),
                    City = reader.IsDBNull(6)
                        ? null
                        : JsonSerializer.Deserialize<CityDto>(reader.GetString(6), JsonOptions)
                            ?? throw new JsonException("Uložené město itineráře má neplatný formát."),
                    Notes = reader.IsDBNull(7) ? null : reader.GetString(7),
                    Budget = reader.IsDBNull(8)
                        ? null
                        : new BudgetDto
                        {
                            Currency = reader.GetString(8),
                            Planned = reader.IsDBNull(9) ? 0 : reader.GetDouble(9),
                            Spent = reader.IsDBNull(10) ? 0 : reader.GetDouble(10),
                        },
                });
            }
        }

        foreach (var trip in trips)
        {
            var destinations = connection.CreateCommand();
            destinations.CommandText = "SELECT Name FROM TripDestinations WHERE TripId = $tripId ORDER BY Position;";
            destinations.Parameters.AddWithValue("$tripId", trip.Id);
            await using (var reader = await destinations.ExecuteReaderAsync())
            {
                while (await reader.ReadAsync())
                {
                    trip.Destinations.Add(reader.GetString(0));
                }
            }

            var places = connection.CreateCommand();
            places.CommandText = """
                SELECT Id, OsmType, OsmId, Name, Category, Address, Latitude, Longitude,
                       WikipediaPageTitle, WikidataId, WikipediaTitle, WikipediaExtract, WikipediaUrl
                FROM Places WHERE TripId = $tripId ORDER BY Position;
                """;
            places.Parameters.AddWithValue("$tripId", trip.Id);
            await using (var reader = await places.ExecuteReaderAsync())
            {
                while (await reader.ReadAsync())
                {
                    var place = new PlaceDto
                    {
                        Id = reader.GetString(0),
                        OsmType = reader.GetString(1),
                        OsmId = reader.GetInt64(2),
                        Name = reader.GetString(3),
                        Category = reader.GetString(4),
                        Address = reader.GetString(5),
                        Latitude = reader.GetDouble(6),
                        Longitude = reader.GetDouble(7),
                        WikipediaPageTitle = reader.IsDBNull(8) ? null : reader.GetString(8),
                        WikidataId = reader.IsDBNull(9) ? null : reader.GetString(9),
                    };
                    if (!reader.IsDBNull(10))
                    {
                        place.Wikipedia = new WikipediaDto
                        {
                            Title = reader.GetString(10),
                            Extract = reader.GetString(11),
                            Url = reader.GetString(12),
                        };
                    }
                    trip.Places.Add(place);
                }
            }

            var tasks = connection.CreateCommand();
            tasks.CommandText = "SELECT Id, Text, IsDone FROM Tasks WHERE TripId = $tripId ORDER BY Position;";
            tasks.Parameters.AddWithValue("$tripId", trip.Id);
            await using (var reader = await tasks.ExecuteReaderAsync())
            {
                while (await reader.ReadAsync())
                {
                    trip.Tasks.Add(new TaskDto
                    {
                        Id = reader.GetString(0),
                        Text = reader.GetString(1),
                        Done = reader.GetInt64(2) != 0,
                    });
                }
            }
        }

        return trips;
    }

    private sealed class TripDto
    {
        public string Id { get; set; } = string.Empty;
        public string Title { get; set; } = string.Empty;
        public string StartDate { get; set; } = string.Empty;
        public string EndDate { get; set; } = string.Empty;
        public string? Description { get; set; }
        public string? ImageUrl { get; set; }
        public CityDto? City { get; set; }
        public List<string> Destinations { get; set; } = [];
        public List<PlaceDto> Places { get; set; } = [];
        public string? Notes { get; set; }
        public List<TaskDto> Tasks { get; set; } = [];
        public BudgetDto? Budget { get; set; }
    }

    private sealed class CityDto
    {
        public string OsmType { get; set; } = string.Empty;
        public long OsmId { get; set; }
        public string Name { get; set; } = string.Empty;
        public string Address { get; set; } = string.Empty;
        public double Latitude { get; set; }
        public double Longitude { get; set; }
        public double[]? BoundingBox { get; set; }
        public string? WikipediaPageTitle { get; set; }
        public string? WikidataId { get; set; }
        public WikipediaDto? Wikipedia { get; set; }
    }

    private sealed class PlaceDto
    {
        public string Id { get; set; } = string.Empty;
        public string OsmType { get; set; } = string.Empty;
        public long OsmId { get; set; }
        public string Name { get; set; } = string.Empty;
        public string Category { get; set; } = string.Empty;
        public string Address { get; set; } = string.Empty;
        public double Latitude { get; set; }
        public double Longitude { get; set; }
        public string? WikipediaPageTitle { get; set; }
        public string? WikidataId { get; set; }
        public WikipediaDto? Wikipedia { get; set; }
    }

    private sealed class WikipediaDto
    {
        public string Title { get; set; } = string.Empty;
        public string Extract { get; set; } = string.Empty;
        public string Url { get; set; } = string.Empty;
    }

    private sealed class TaskDto
    {
        public string Id { get; set; } = string.Empty;
        public string Text { get; set; } = string.Empty;
        public bool Done { get; set; }
    }

    private sealed class BudgetDto
    {
        public string Currency { get; set; } = string.Empty;
        public double Planned { get; set; }
        public double Spent { get; set; }
    }
}
