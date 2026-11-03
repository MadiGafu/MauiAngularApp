import { AfterViewInit, Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import * as L from 'leaflet';
import { TripStore } from '../store/trip.store';
import { Trip } from '../models/trip';
import { ItineraryPlace, OsmSearchResult, TripCity } from '../models/osm-place';
import { MauiDatabaseService } from '../services/maui-database.service';
import { OpenStreetMapService } from '../services/openstreetmap.service';
import { OpenRouteService, PlannedRoute } from '../services/open-route.service';
import { WikipediaService } from '../services/wikipedia.service';

@Component({
  selector: 'trip-editor',
  standalone: true,
  imports: [RouterModule, FormsModule],
  template: `
  @if (storageError || formError) {
    <p role="alert" style="color:#b00020">{{ storageError || formError }}</p>
  }
  @if (trip) {
    <div style="display:flex; gap:16px; flex-wrap:wrap">
      <div style="flex:1; min-width:260px">
        <h3>Projekt cesty</h3>
        <label>Název projektu<br><input [(ngModel)]="trip.title" /></label><br><br>
        <label>Datum od<br><input type="date" [(ngModel)]="trip.startDate" /></label><br><br>
        <label>Datum do<br><input type="date" [(ngModel)]="trip.endDate" /></label><br><br>
        <label>Krátký popis<br>
          <textarea rows="3" maxlength="240" [(ngModel)]="trip.description"></textarea>
        </label><br><br>
        <input
          #imageFileInput
          class="visually-hidden"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          (change)="onImageSelected($event)"
          aria-label="Vybrat obrázek projektu"
        />
        <div class="image-picker-actions">
          <button type="button" (click)="chooseImage(imageFileInput)" [disabled]="isChoosingImage">
            {{ isChoosingImage ? 'Načítám obrázek…' : 'Vybrat obrázek z počítače' }}
          </button>
          <button type="button" (click)="removeImage()">Odebrat obrázek</button>
        </div>
        <p class="field-hint">Podporované formáty: JPG, PNG a WebP. Obrázek se uloží s projektem.</p>
        @if (imageError) {
          <p role="alert" style="color:#b00020">{{ imageError }}</p>
        }
        <img
          class="editor-project-cover"
          [src]="trip.imageUrl || defaultCover"
          [alt]="'Náhled projektu ' + trip.title"
          (error)="useFallbackImage($event)"
        />
        <label>Poznámky<br><textarea rows="4" [(ngModel)]="trip.notes"></textarea></label>
      </div>

      <div style="flex:1; min-width:260px">
        <h3>Úkoly</h3>
        <div style="display:flex; gap:8px">
          <input [(ngModel)]="newTask" placeholder="Nový úkol" (keyup.enter)="addTask()"/>
          <button (click)="addTask()">Přidat</button>
        </div>
        <ul style="margin-top:8px; padding-left:18px">
          @for (t of trip.tasks; track t.id) {
            <li>
              <label><input type="checkbox" [(ngModel)]="t.done"/> {{t.text}}</label>
              <button (click)="removeTask(t.id)" style="margin-left:8px">×</button>
            </li>
          }
        </ul>
      </div>

      <div style="flex:1; min-width:260px">
        <h3>Rozpočet</h3>
        Měna: <input style="width:80px" [(ngModel)]="trip.budget!.currency"/><br><br>
        Plán: <input type="number" [(ngModel)]="trip.budget!.planned"/> —
        Utraceno: <input type="number" [(ngModel)]="trip.budget!.spent"/>
        <div style="margin-top:8px">Zbývá: <b>{{ (trip.budget!.planned || 0) - (trip.budget!.spent || 0) }}</b></div>
      </div>
    </div>

    <div style="margin-top:16px; display:flex; gap:8px">
      <button (click)="save()" [disabled]="isSaving">
        {{ isSaving ? 'Ukládám…' : 'Uložit' }}
      </button>
      <button (click)="back()">Zpět na itineráře</button>
    </div>

    <section class="trip-planning-section">
      <h3 style="margin-top:0">1. Vyberte město</h3>
      <div style="display:flex; gap:8px; flex-wrap:wrap">
        <input
          [(ngModel)]="cityQuery"
          (keyup.enter)="searchCities()"
          placeholder="Např. Praha nebo Paříž"
          aria-label="Hledat město"
        />
        <button (click)="searchCities()" [disabled]="isSearchingCities">
          {{ isSearchingCities ? 'Hledám města…' : 'Hledat město' }}
        </button>
      </div>
      @if (citySearchMessage) {
        <p role="status">{{ citySearchMessage }}</p>
      }
      @if (citySearchError) {
        <p role="alert" style="color:#b00020">{{ citySearchError }}</p>
      }
      @if (citySearchResults.length) {
        <ul style="padding-left:18px">
          @for (result of citySearchResults; track result.osm_type + result.osm_id) {
            <li style="margin:12px 0">
              <strong>{{ result.name || result.display_name }}</strong>
              <small>{{ result.display_name }}</small><br>
              <button (click)="selectCity(result)">Vybrat toto město</button>
            </li>
          }
        </ul>
      }
      @if (trip.city; as city) {
        <section class="selected-city-card" aria-label="Vybrané město">
          <div class="selected-city-heading">
            <div>
              <p class="eyebrow">VYBRANÁ DESTINACE</p>
              <h4>{{ city.name }}</h4>
              <small>{{ city.address }}</small>
            </div>
            <button type="button" class="secondary-button" (click)="changeCity()">Změnit město</button>
          </div>
          @if (city.wikipedia) {
            <p>{{ city.wikipedia.extract }}</p>
            <small>
              <a [href]="city.wikipedia.url" target="_blank" rel="noopener noreferrer">
                {{ city.wikipedia.title }} – Wikipedia
              </a>
              · Text pod licencí
              <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener noreferrer">
                CC BY-SA 4.0
              </a>.
            </small>
          } @else if (cityWikiLoading) {
            <p role="status">Načítám informace o městě z Wikipedie…</p>
          } @else if (cityWikiMessage) {
            <p role="status">{{ cityWikiMessage }}</p>
          }
        </section>

        <h3>2. Najděte místa ve městě {{ city.name }}</h3>
        <div style="display:flex; gap:8px; flex-wrap:wrap">
          <input
            [(ngModel)]="placeQuery"
            (keyup.enter)="searchPlaces()"
            placeholder="Např. Louvre, Eiffelova věž nebo muzeum"
            aria-label="Hledat zajímavá místa ve vybraném městě"
          />
          <button (click)="searchPlaces()" [disabled]="isSearching">
            {{ isSearching ? 'Hledám místa…' : 'Hledat místa ve městě' }}
          </button>
        </div>
        @if (searchMessage) {
          <p role="status">{{ searchMessage }}</p>
        }
        @if (searchError) {
          <p role="alert" style="color:#b00020">{{ searchError }}</p>
        }
        @if (searchResults.length) {
          <ul style="padding-left:18px">
            @for (result of searchResults; track result.osm_type + result.osm_id) {
              <li style="margin:12px 0">
                <strong>{{ result.name || result.display_name }}</strong>
                <div>{{ result.category }} · {{ result.type }}</div>
                <small>{{ result.display_name }}</small><br>
                <button (click)="addPlace(result)">Přidat do itineráře</button>
              </li>
            }
          </ul>
        }
      } @else {
        <p class="field-hint">Po výběru města se zde zobrazí informace z Wikipedie a vyhledávání míst.</p>
      }
      <div class="places-map-layout">
        <section class="selected-places-panel">
          <h4>Seznam míst k návštěvě</h4>
          @if (trip.places?.length) {
            <ol class="selected-places-list">
              @for (place of trip.places; track place.id; let index = $index) {
                <li class="selected-place">
                  <div class="selected-place-heading">
                    <span class="place-number">{{ index + 1 }}</span>
                    <strong>{{ place.name }}</strong>
                  </div>
                  <small>{{ place.address }}</small>
                  @if (place.wikipedia) {
                    <button
                      (click)="toggleWikipediaSummary(place.id)"
                      [attr.aria-expanded]="!collapsedWikipediaPlaceIds.has(place.id)"
                    >
                      {{ collapsedWikipediaPlaceIds.has(place.id) ? 'Zobrazit informace' : 'Skrýt informace' }}
                    </button>
                    @if (!collapsedWikipediaPlaceIds.has(place.id)) {
                      <p>{{ place.wikipedia.extract }}</p>
                      <a [href]="place.wikipedia.url" target="_blank" rel="noopener noreferrer">
                        {{ place.wikipedia.title }} – Wikipedia
                      </a>.
                      <small>
                        Text Wikipedie je dostupný pod licencí
                        <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener noreferrer">
                          CC BY-SA 4.0
                        </a>.
                      </small>
                    }
                  } @else {
                    <button
                      (click)="loadWikipediaSummary(place)"
                      [disabled]="wikiLoadingPlaceId === place.id"
                    >
                      {{ wikiLoadingPlaceId === place.id ? 'Načítám Wikipedii…' : 'Informace z Wikipedie' }}
                    </button>
                  }
                  @if (wikiMessages[place.id]) {
                    <p role="status">{{ wikiMessages[place.id] }}</p>
                  }
                  <div class="place-actions">
                    <button
                      (click)="movePlace(place.id, -1)"
                      [disabled]="index === 0"
                      [attr.aria-label]="'Přesunout ' + place.name + ' nahoru'"
                    >↑</button>
                    <button
                      (click)="movePlace(place.id, 1)"
                      [disabled]="index === (trip.places?.length ?? 0) - 1"
                      [attr.aria-label]="'Přesunout ' + place.name + ' dolů'"
                    >↓</button>
                    <button (click)="removePlace(place.id)">Odebrat</button>
                  </div>
                </li>
              }
            </ol>
          } @else {
            <p>Zatím nebyla přidána žádná místa.</p>
          }
        </section>

        <section class="trip-map-panel">
          <h3>Mapa cesty</h3>
          <div
            #routeMap
            role="application"
            aria-label="Mapa míst v itineráři"
            class="itinerary-map"
          ></div>
          @if ((trip.places?.length ?? 0) < 2) {
            <p>Pro výpočet trasy přidejte alespoň dvě místa.</p>
          } @else {
            <button (click)="calculateRoute()" [disabled]="isCalculatingRoute">
              {{ isCalculatingRoute ? 'Počítám trasu…' : 'Vypočítat trasu v tomto pořadí' }}
            </button>
          }
          @if (routeSummary) {
            <p role="status">
              Trasa: {{ formatDistance(routeSummary.distanceMeters) }},
              přibližně {{ formatDuration(routeSummary.durationSeconds) }}.
            </p>
          }
          @if (routeError) {
            <p role="alert" style="color:#b00020">{{ routeError }}</p>
          }
        </section>
      </div>
      <small>
        Mapa ©
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">
          přispěvatelé OpenStreetMap
        </a>
        · Trasa z veřejné demonstrační služby OSRM; dostupnost není garantována.
      </small>
      <small>
        Data ©
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">
          přispěvatelé OpenStreetMap
        </a>
      </small>
    </section>
  } @else if (isStoreLoading) {
    <p role="status">Načítám itinerář…</p>
  } @else {
    <div>Itinerář nebyl nalezen.</div>
  }
  `
})
export class TripEditorComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('routeMap') private routeMapElement?: ElementRef<HTMLDivElement>;

  readonly defaultCover = '/trip-cover.svg';
  trip?: Trip;
  cityQuery = '';
  citySearchResults: OsmSearchResult[] = [];
  citySearchMessage = '';
  citySearchError = '';
  isSearchingCities = false;
  cityWikiLoading = false;
  cityWikiMessage = '';
  newTask = '';
  placeQuery = '';
  searchResults: OsmSearchResult[] = [];
  searchMessage = '';
  searchError = '';
  isSearching = false;
  routeSummary?: PlannedRoute;
  routeError = '';
  isCalculatingRoute = false;
  wikiLoadingPlaceId: string | null = null;
  wikiMessages: Record<string, string> = {};
  collapsedWikipediaPlaceIds = new Set<string>();
  isSaving = false;
  storageError = '';
  formError = '';
  imageError = '';
  isChoosingImage = false;

  private map?: L.Map;
  private placeMarkers?: L.LayerGroup;
  private routeLine?: L.GeoJSON;

  get isStoreLoading(): boolean {
    return this.store.loading();
  }

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private store: TripStore,
    private database: MauiDatabaseService,
    private openStreetMap: OpenStreetMapService,
    private openRoute: OpenRouteService,
    private wikipedia: WikipediaService,
  ) {}

  ngOnInit() {
    if (!this.store.loading()) {
      this.loadTrip();
      return;
    }

    void this.store.ready
      .then(() => this.loadTrip())
      .catch(error => {
        this.storageError = error instanceof Error ? error.message : 'Itineráře se nepodařilo načíst.';
      });
  }

  private loadTrip() {
    const id = this.route.snapshot.paramMap.get('id')!;
    const trip = this.store.byId(id);
    if (trip) {
      this.trip = JSON.parse(JSON.stringify(trip)) as Trip;
      this.trip.description ??= this.trip.notes ?? '';
      this.trip.imageUrl ||= this.defaultCover;
      this.trip.destinations ||= [];
      this.trip.places ||= [];
      this.trip.tasks ||= [];
      this.trip.budget ||= { currency: 'EUR', planned: 0, spent: 0 };
      this.initializeMap();
    }
  }

  ngAfterViewInit() {
    this.initializeMap();
  }

  private initializeMap() {
    if (!this.trip || !this.routeMapElement || this.map) return;

    this.map = L.map(this.routeMapElement.nativeElement).setView([49.8, 15.5], 7);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(this.map);
    this.placeMarkers = L.layerGroup().addTo(this.map);
    this.updateMapMarkers();
  }

  useFallbackImage(event: Event) {
    const image = event.currentTarget;
    if (image instanceof HTMLImageElement && !image.src.endsWith(this.defaultCover)) {
      image.src = this.defaultCover;
    }
  }

  async chooseImage(fileInput: HTMLInputElement) {
    this.imageError = '';
    if (!this.trip || this.isChoosingImage) return;

    if (!this.database.isMaui) {
      fileInput.click();
      return;
    }

    this.isChoosingImage = true;
    try {
      const imageUrl = await this.database.pickTripImage();
      if (imageUrl) this.trip.imageUrl = imageUrl;
    } catch (error) {
      this.imageError = error instanceof Error ? error.message : 'Obrázek se nepodařilo načíst.';
    } finally {
      this.isChoosingImage = false;
    }
  }

  async onImageSelected(event: Event) {
    const input = event.currentTarget;
    if (!(input instanceof HTMLInputElement)) return;
    const file = input.files?.[0];
    input.value = '';
    this.imageError = '';
    if (!file || !this.trip) return;

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      this.imageError = 'Vyberte obrázek ve formátu JPG, PNG nebo WebP.';
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      this.imageError = 'Soubor je příliš velký. Maximální velikost je 20 MB.';
      return;
    }

    this.isChoosingImage = true;
    try {
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, 1200 / bitmap.width, 800 / bitmap.height);
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Obrázek se nepodařilo zpracovat.');
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();

      let blob = await canvasToJpeg(canvas, 0.82);
      if (blob.size > 750 * 1024) blob = await canvasToJpeg(canvas, 0.65);
      if (blob.size > 750 * 1024) {
        throw new Error('Obrázek je příliš velký i po zmenšení. Vyberte menší obrázek.');
      }

      this.trip.imageUrl = await readAsDataUrl(blob);
    } catch (error) {
      console.error('Zpracování obrázku projektu selhalo.', error);
      this.imageError = error instanceof Error ? error.message : 'Obrázek se nepodařilo načíst.';
    } finally {
      this.isChoosingImage = false;
    }
  }

  removeImage() {
    if (this.trip) this.trip.imageUrl = this.defaultCover;
    this.imageError = '';
  }

  ngOnDestroy() {
    this.map?.remove();
  }


  addTask() {
    const text = this.newTask.trim();
    if (!text || !this.trip) return;
    this.trip.tasks.push({ id: crypto.randomUUID(), text, done: false });
    this.newTask = '';
  }

  removeTask(id: string) {
    if (!this.trip) return;
    this.trip.tasks = this.trip.tasks.filter(t => t.id !== id);
  }

  async searchPlaces() {
    const query = this.placeQuery.trim();
    if (this.isSearching) return;
    const city = this.trip?.city;
    if (!city) {
      this.searchError = 'Nejprve vyberte město, ve kterém chcete hledat.';
      return;
    }
    if (!query) {
      this.searchError = 'Zadejte název zajímavého místa.';
      this.searchMessage = '';
      this.searchResults = [];
      return;
    }

    this.isSearching = true;
    this.searchError = '';
    this.searchMessage = '';
    this.searchResults = [];

    try {
      this.searchResults = await this.openStreetMap.searchWithinCity(query, city);
      this.searchMessage = this.searchResults.length
        ? `Nalezeno míst: ${this.searchResults.length}.`
        : 'Pro zadaný dotaz nebyla nalezena žádná místa.';
    } catch (error) {
      console.error('Vyhledávání míst v OpenStreetMap selhalo.', error);
      this.searchError = 'Místa se nepodařilo načíst. Zkontrolujte připojení k internetu a zkuste to znovu.';
    } finally {
      this.isSearching = false;
    }
  }

  async searchCities() {
    const query = this.cityQuery.trim();
    if (this.isSearchingCities) return;
    if (!query) {
      this.citySearchError = 'Zadejte název města.';
      this.citySearchMessage = '';
      this.citySearchResults = [];
      return;
    }

    this.isSearchingCities = true;
    this.citySearchError = '';
    this.citySearchMessage = '';
    this.citySearchResults = [];
    try {
      this.citySearchResults = await this.openStreetMap.searchCities(query);
      this.citySearchMessage = this.citySearchResults.length
        ? `Nalezená města: ${this.citySearchResults.length}. Vyberte správné město.`
        : 'Město nebylo nalezeno. Zkuste upravit dotaz.';
    } catch (error) {
      console.error('Vyhledávání měst v OpenStreetMap selhalo.', error);
      this.citySearchError = 'Města se nepodařilo načíst. Zkontrolujte připojení k internetu a zkuste to znovu.';
    } finally {
      this.isSearchingCities = false;
    }
  }

  selectCity(result: OsmSearchResult) {
    if (!this.trip) return;
    const linkedWikipediaPage = result.extratags?.wikipedia?.trim();
    const wikipediaPageTitle = linkedWikipediaPage?.match(/^cs:(.+)$/i)?.[1]
      ?.replace(/_/g, ' ')
      .trim();
    const boundingBox = result.boundingbox?.map(Number);
    this.trip.city = {
      osmType: result.osm_type,
      osmId: result.osm_id,
      name: result.namedetails?.['name:cs']?.trim()
        || result.name?.trim()
        || result.display_name.split(',')[0],
      address: result.display_name,
      latitude: Number(result.lat),
      longitude: Number(result.lon),
      ...(boundingBox?.length === 4 && boundingBox.every(Number.isFinite)
        ? { boundingBox: boundingBox as [number, number, number, number] }
        : {}),
      ...(wikipediaPageTitle ? { wikipediaPageTitle } : {}),
      ...(result.extratags?.wikidata ? { wikidataId: result.extratags.wikidata } : {}),
    };
    this.citySearchResults = [];
    this.citySearchMessage = '';
    this.cityWikiMessage = '';
    this.placeQuery = '';
    this.searchResults = [];
    this.searchMessage = '';
    this.searchError = '';
    this.cityWikiLoading = true;
    void this.loadCityWikipediaSummary();
  }

  changeCity() {
    if (!this.trip) return;
    this.trip.city = undefined;
    this.cityWikiLoading = false;
    this.cityWikiMessage = '';
    this.searchResults = [];
    this.searchMessage = '';
    this.searchError = '';
  }

  private async loadCityWikipediaSummary() {
    const city = this.trip?.city;
    if (!city) return;
    try {
      const summary = await this.wikipedia.findSummary(city.name, city.wikipediaPageTitle);
      if (this.trip?.city !== city) return;
      city.wikipedia = summary ?? undefined;
      this.cityWikiMessage = city.wikipedia
        ? ''
        : 'Český článek o tomto městě na Wikipedii nebyl nalezen.';
    } catch (error) {
      if (this.trip?.city !== city) return;
      console.error(`Načtení článku Wikipedie pro město "${city.name}" selhalo.`, error);
      this.cityWikiMessage = 'Informace z Wikipedie se nepodařilo načíst.';
    } finally {
      if (this.trip?.city === city) this.cityWikiLoading = false;
    }
  }

  addPlace(result: OsmSearchResult) {
    if (!this.trip) return;

    const id = `${result.osm_type}/${result.osm_id}`;
    if (this.trip.places?.some(place => place.id === id)) {
      this.searchMessage = 'Toto místo už v itineráři je.';
      return;
    }

    const wikipediaTag = result.extratags?.wikipedia?.trim();
    const wikipediaPageTitle = wikipediaTag?.match(/^cs:(.+)$/i)?.[1]?.replace(/_/g, ' ').trim();
    const place: ItineraryPlace = {
      id,
      osmType: result.osm_type,
      osmId: result.osm_id,
      name: result.namedetails?.['name:cs']?.trim() || result.name?.trim() || result.display_name.split(',')[0],
      category: `${result.category} · ${result.type}`,
      address: result.display_name,
      latitude: Number(result.lat),
      longitude: Number(result.lon),
      ...(wikipediaPageTitle ? { wikipediaPageTitle } : {}),
      ...(result.extratags?.wikidata ? { wikidataId: result.extratags.wikidata } : {}),
    };

    this.trip.places = [...(this.trip.places ?? []), place];
    this.invalidateRoute();
    this.updateMapMarkers();
    this.searchMessage = 'Místo bylo přidáno. Nezapomeňte itinerář uložit.';
  }

  removePlace(id: string) {
    if (!this.trip) return;
    this.trip.places = (this.trip.places ?? []).filter(place => place.id !== id);
    this.invalidateRoute();
    this.updateMapMarkers();
    this.searchMessage = 'Místo bylo odebráno. Uložte itinerář, aby se změna zachovala.';
  }

  movePlace(id: string, direction: -1 | 1) {
    if (!this.trip?.places) return;

    const currentIndex = this.trip.places.findIndex(place => place.id === id);
    const targetIndex = currentIndex + direction;
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= this.trip.places.length) return;

    const places = [...this.trip.places];
    [places[currentIndex], places[targetIndex]] = [places[targetIndex], places[currentIndex]];
    this.trip.places = places;
    this.invalidateRoute();
    this.updateMapMarkers();
    this.searchMessage = 'Pořadí míst bylo změněno. Uložte itinerář, aby se změna zachovala.';
  }

  async loadWikipediaSummary(place: ItineraryPlace) {
    if (!this.trip || this.wikiLoadingPlaceId) return;

    this.wikiLoadingPlaceId = place.id;
    this.wikiMessages[place.id] = '';

    try {
      const currentPlace = this.trip.places?.find(item => item.id === place.id);
      if (!currentPlace) return;

      if (!currentPlace.wikipediaPageTitle) {
        currentPlace.wikipediaPageTitle =
          await this.openStreetMap.findLinkedCzechWikipediaTitle(currentPlace) ?? undefined;
      }
      const summary = await this.wikipedia.findSummary(
        place.name,
        currentPlace.wikipediaPageTitle,
      );

      if (summary) {
        currentPlace.wikipedia = summary;
        this.trip.places = [...(this.trip.places ?? [])];
        this.wikiMessages[place.id] = 'Informace byly načteny. Uložte itinerář, aby se zachovaly.';
      } else {
        this.wikiMessages[place.id] = 'Český článek na Wikipedii nebyl nalezen.';
      }
    } catch (error) {
      console.error(`Načtení článku Wikipedie pro místo "${place.name}" selhalo.`, error);
      this.wikiMessages[place.id] = 'Informace z Wikipedie se nepodařilo načíst. Zkontrolujte připojení.';
    } finally {
      this.wikiLoadingPlaceId = null;
    }
  }

  toggleWikipediaSummary(placeId: string) {
    const collapsed = new Set(this.collapsedWikipediaPlaceIds);
    if (collapsed.has(placeId)) {
      collapsed.delete(placeId);
    } else {
      collapsed.add(placeId);
    }
    this.collapsedWikipediaPlaceIds = collapsed;
  }

  async calculateRoute() {
    const places = this.trip?.places ?? [];
    if (places.length < 2 || this.isCalculatingRoute) return;

    this.isCalculatingRoute = true;
    this.routeError = '';
    this.routeSummary = undefined;

    try {
      this.routeSummary = await this.openRoute.calculate(places);
      this.drawRoute(this.routeSummary);
    } catch (error) {
      console.error('Výpočet trasy pomocí OSRM selhal.', error);
      this.routeError = 'Trasu se nepodařilo vypočítat. Zkontrolujte připojení nebo zkuste jiná místa.';
      this.clearRouteLine();
    } finally {
      this.isCalculatingRoute = false;
    }
  }

  formatDistance(distanceMeters: number): string {
    return distanceMeters >= 1000
      ? `${(distanceMeters / 1000).toLocaleString('cs-CZ', { maximumFractionDigits: 1 })} km`
      : `${Math.round(distanceMeters)} m`;
  }

  formatDuration(durationSeconds: number): string {
    const minutes = Math.round(durationSeconds / 60);
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return hours ? `${hours} h ${remainingMinutes} min` : `${remainingMinutes} min`;
  }

  private updateMapMarkers() {
    if (!this.map || !this.placeMarkers || !this.trip) return;

    this.placeMarkers.clearLayers();
    const places = this.trip.places ?? [];
    places.forEach((place, index) => {
      L.marker([place.latitude, place.longitude], {
        icon: L.divIcon({
          className: 'itinerary-map-marker',
          html: `<span>${index + 1}</span>`,
          iconSize: [30, 30],
          iconAnchor: [15, 15],
        }),
      })
        .bindPopup(`<strong>${index + 1}. ${this.escapeHtml(place.name)}</strong>`)
        .addTo(this.placeMarkers!);
    });

    if (places.length > 1) {
      this.map.fitBounds(
        L.latLngBounds(places.map(place => [place.latitude, place.longitude])),
        { padding: [24, 24] },
      );
    } else if (places.length === 1) {
      this.map.setView([places[0].latitude, places[0].longitude], 14);
    } else {
      this.map.setView([49.8, 15.5], 7);
    }
  }

  private drawRoute(route: PlannedRoute) {
    if (!this.map) return;
    this.clearRouteLine();
    const geometry: GeoJSON.LineString = {
      type: 'LineString',
      coordinates: route.coordinates,
    };
    this.routeLine = L.geoJSON(geometry, {
      style: { color: '#1769aa', weight: 5, opacity: 0.8 },
    }).addTo(this.map);
    this.map.fitBounds(this.routeLine.getBounds(), { padding: [24, 24] });
  }

  private invalidateRoute() {
    this.routeSummary = undefined;
    this.routeError = '';
    this.clearRouteLine();
  }

  private clearRouteLine() {
    if (this.routeLine) {
      this.map?.removeLayer(this.routeLine);
      this.routeLine = undefined;
    }
  }

  private escapeHtml(value: string): string {
    return value.replace(/[&<>"']/g, character => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    })[character]!);
  }

  async save() {
    if (!this.trip || this.isSaving) return;
    const title = this.trip.title.trim();
    const description = this.trip.description?.trim() ?? '';
    if (!title) {
      this.formError = 'Zadejte název projektu.';
      return;
    }
    if (!description) {
      this.formError = 'Doplňte krátký popis projektu.';
      return;
    }
    if (!this.trip.startDate || !this.trip.endDate || this.trip.endDate < this.trip.startDate) {
      this.formError = 'Zkontrolujte datum od a datum do.';
      return;
    }
    const imageUrl = this.trip.imageUrl?.trim();
    const validImageUrl = /^https?:\/\/\S+$/i.test(imageUrl ?? '');
    const validLocalImage = /^data:image\/(?:jpeg|png|webp);base64,[a-z0-9+/]+=*$/i.test(imageUrl ?? '');
    if (imageUrl && imageUrl !== this.defaultCover && !validImageUrl && !validLocalImage) {
      this.formError = 'Vyberte platný obrázek nebo zadejte adresu začínající na http:// či https://.';
      return;
    }

    this.isSaving = true;
    this.storageError = '';
    this.formError = '';
    try {
      this.trip.title = title;
      this.trip.description = description;
      this.trip.imageUrl = imageUrl || this.defaultCover;
      await this.store.upsert(this.trip);
      alert('Projekt byl uložen.');
    } catch (error) {
      this.storageError = error instanceof Error ? error.message : 'Projekt se nepodařilo uložit.';
    } finally {
      this.isSaving = false;
    }
  }

  back() { this.router.navigateByUrl('/'); }
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      blob => blob ? resolve(blob) : reject(new Error('Obrázek se nepodařilo zpracovat.')),
      'image/jpeg',
      quality,
    );
  });
}

function readAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('Obrázek se nepodařilo načíst.'));
    };
    reader.onerror = () => reject(new Error('Obrázek se nepodařilo načíst.'));
    reader.readAsDataURL(blob);
  });
}
