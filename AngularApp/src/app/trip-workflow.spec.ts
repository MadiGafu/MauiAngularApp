import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { LocationStrategy } from '@angular/common';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { IndexFileHashLocationStrategy } from './app-location.strategy';
import { routes } from './app.routes';
import { TripEditorComponent } from './pages/trip-editor.component';
import { TripListComponent } from './pages/trip-list.component';
import { MauiBridgeService } from './services/maui-bridge.service';
import { OpenStreetMapService } from './services/openstreetmap.service';
import { WikipediaService } from './services/wikipedia.service';
import { TripStore } from './store/trip.store';

describe('Itinerary workflow', () => {
  const storageKey = 'itinerary.trips.v1';

  beforeEach(async () => {
    localStorage.removeItem(storageKey);
    await TestBed.configureTestingModule({
      providers: [
        provideRouter(routes),
        { provide: LocationStrategy, useClass: IndexFileHashLocationStrategy },
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    }).compileComponents();
  });

  afterEach(() => {
    delete window.__IS_MAUI_WEBVIEW__;
    localStorage.removeItem(storageKey);
    TestBed.resetTestingModule();
  });

  it('creates a new itinerary from the list and navigates to its editor', async () => {
    const harness = await RouterTestingHarness.create();
    const list = await harness.navigateByUrl('/', TripListComponent);
    await list.store.ready;

    await list.create();

    expect(TestBed.inject(Router).url).toMatch(/^\/trip\/.+/);
    expect(list.store.trips().length).toBe(1);
  });

  it('selects and saves a local image as a compressed project cover', async () => {
    const store = TestBed.inject(TripStore);
    const trip = await store.addEmpty();
    const harness = await RouterTestingHarness.create();
    const editor = await harness.navigateByUrl(`/trip/${trip.id}`, TripEditorComponent);
    await harness.fixture.whenStable();
    harness.fixture.detectChanges();

    const canvas = document.createElement('canvas');
    canvas.width = 2;
    canvas.height = 2;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#176b4d';
    context.fillRect(0, 0, canvas.width, canvas.height);
    const imageBlob = await new Promise<Blob>(resolve => canvas.toBlob(blob => resolve(blob!), 'image/png'));
    const imageFile = new File([imageBlob], 'cover.png', { type: 'image/png' });
    const fileInput = harness.routeNativeElement!.querySelector<HTMLInputElement>('input[type="file"]')!;
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(imageFile);
    fileInput.files = dataTransfer.files;
    await editor.onImageSelected({ currentTarget: fileInput } as unknown as Event);
    harness.fixture.detectChanges();

    expect(editor.imageError).toBe('');
    expect(editor.trip?.imageUrl).toMatch(/^data:image\/jpeg;base64,/);
    expect(harness.routeNativeElement?.querySelector('.editor-project-cover')?.getAttribute('src'))
      .toBe(editor.trip?.imageUrl);
    spyOn(window, 'alert');
    await editor.save();
    expect(store.byId(trip.id)?.imageUrl).toBe(editor.trip?.imageUrl);
  });

  it('keeps the same OSM place in separate itinerary records', async () => {
    const store = TestBed.inject(TripStore);
    const firstTrip = await store.addEmpty();
    const secondTrip = await store.addEmpty();
    const samePlace = {
      id: 'node/98765',
      osmType: 'node',
      osmId: 98765,
      name: 'Pražský hrad',
      category: 'tourism · castle',
      address: 'Pražský hrad, Praha, Česko',
      latitude: 50.091,
      longitude: 14.401,
    };

    await store.upsert({ ...firstTrip, places: [samePlace] });
    await store.upsert({ ...secondTrip, places: [samePlace] });

    expect(store.byId(firstTrip.id)?.places?.[0].id).toBe('node/98765');
    expect(store.byId(secondTrip.id)?.places?.[0].id).toBe('node/98765');
    const savedTrips = JSON.parse(localStorage.getItem(storageKey)!) as Array<{
      id: string;
      places: { id: string }[];
    }>;
    expect(savedTrips.filter(item => item.places.some(place => place.id === 'node/98765')).length)
      .toBe(2);
  });

  it('initializes Leaflet when a saved itinerary loads after the map view', async () => {
    const trip = {
      id: 'delayed-trip',
      title: 'Uložená cesta',
      startDate: '2026-11-03',
      endDate: '2026-11-04',
      destinations: [],
      places: [],
      tasks: [],
      budget: { currency: 'EUR', planned: 0, spent: 0 },
    };
    let resolveReady!: () => void;
    const ready = new Promise<void>(resolve => { resolveReady = resolve; });
    const delayedStore = {
      loading: signal(true),
      ready,
      byId: jasmine.createSpy('byId').and.returnValue(trip),
    };
    TestBed.overrideProvider(TripStore, { useValue: delayedStore });

    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(`/trip/${trip.id}`, TripEditorComponent);
    harness.fixture.detectChanges();
    expect(harness.routeNativeElement?.querySelector('.leaflet-container')).toBeNull();

    resolveReady();
    await harness.fixture.whenStable();
    harness.fixture.detectChanges();

    expect(harness.routeNativeElement?.querySelector('.leaflet-container')).not.toBeNull();
  });

  it('routes place and Wikipedia searches through the MAUI bridge in the desktop app', async () => {
    window.__IS_MAUI_WEBVIEW__ = true;
    const bridge = TestBed.inject(MauiBridgeService);
    const place = {
      osm_type: 'node',
      osm_id: 98765,
      name: 'Pražský hrad',
      category: 'tourism',
      type: 'castle',
      display_name: 'Pražský hrad, Praha',
      lat: '50.091',
      lon: '14.401',
    };
    spyOn(bridge, 'searchCities').and.resolveTo([place]);
    spyOn(bridge, 'searchPlaces').and.resolveTo([place]);
    spyOn(bridge, 'findWikipediaSummary').and.resolveTo({
      title: 'Pražský hrad',
      extract: 'Historický hrad.',
      url: 'https://cs.wikipedia.org/wiki/Pra%C5%BEsk%C3%BD_hrad',
    });

    const osm = TestBed.inject(OpenStreetMapService);
    const city = {
      osmType: 'relation',
      osmId: 1,
      name: 'Praha',
      address: 'Praha, Česko',
      latitude: 50.08,
      longitude: 14.43,
      boundingBox: [50, 50.2, 14.2, 14.7] as [number, number, number, number],
    };
    expect(await osm.searchCities('Praha')).toEqual([place]);
    expect(await osm.searchWithinCity('hrad', city)).toEqual([place]);
    expect(bridge.searchCities).toHaveBeenCalledWith('Praha');
    expect(bridge.searchPlaces).toHaveBeenCalledWith('hrad', 'Praha', {
      south: 50,
      north: 50.2,
      west: 14.2,
      east: 14.7,
    });

    const summary = await TestBed.inject(WikipediaService).findSummary('Pražský hrad');
    expect(summary?.title).toBe('Pražský hrad');
    expect(bridge.findWikipediaSummary).toHaveBeenCalledWith('Pražský hrad', undefined);
  });

  it('creates, saves, reloads, and deletes an itinerary', async () => {
    const harness = await RouterTestingHarness.create();
    const list = await harness.navigateByUrl('/', TripListComponent);
    await list.store.ready;
    harness.fixture.detectChanges();
    expect(list.store.hasTrips()).toBeFalse();
    expect(harness.routeNativeElement?.textContent).toContain('Začněte plánovat svou další cestu');

    const trip = await list.store.addEmpty();
    const tripId = trip.id;
    const editor = await harness.navigateByUrl(`/trip/${tripId}`, TripEditorComponent);
    await harness.fixture.whenStable();
    harness.fixture.detectChanges();
    const editorElement = harness.routeNativeElement!;

    expect(editor.trip?.id).toBe(tripId);
    expect(editorElement.textContent).not.toContain('Destinace (oddělené čárkou)');
    expect(editorElement.querySelector('input[type="file"]')?.getAttribute('accept'))
      .toBe('image/jpeg,image/png,image/webp');
    const pagePath = document.location.pathname;
    const indexPath = pagePath.endsWith('/index.html')
      ? pagePath
      : `${pagePath.replace(/\/$/, '')}/index.html`;
    expect(TestBed.inject(LocationStrategy).prepareExternalUrl(`/trip/${tripId}`))
      .toBe(`${indexPath}#/trip/${tripId}`);
    const setValue = (element: HTMLInputElement | HTMLTextAreaElement, value: string) => {
      element.value = value;
      element.dispatchEvent(new Event('input', { bubbles: true }));
    };
    const titleInput = editorElement.querySelector<HTMLInputElement>('label input')!;
    const descriptionInput = Array.from(editorElement.querySelectorAll('label'))
      .find(label => label.textContent?.includes('Krátký popis'))!
      .querySelector<HTMLTextAreaElement>('textarea')!;
    const notesInput = Array.from(editorElement.querySelectorAll('label'))
      .find(label => label.textContent?.includes('Poznámky'))!
      .querySelector<HTMLTextAreaElement>('textarea')!;
    const taskInput = editorElement.querySelector<HTMLInputElement>('input[placeholder="Nový úkol"]')!;
    const plannedBudgetInput = editorElement.querySelector<HTMLInputElement>('input[type="number"]')!;
    const citySearchInput =
      editorElement.querySelector<HTMLInputElement>('input[placeholder="Např. Praha nebo Paříž"]')!;
    const citySearchButton = Array.from(editorElement.querySelectorAll('button'))
      .find(button => button.textContent?.includes('Hledat město'))!;

    setValue(titleInput, 'Víkend v Praze');
    setValue(descriptionInput, 'Historické památky a dobré jídlo.');
    editor.trip!.imageUrl = 'https://example.test/prague.jpg';
    setValue(notesInput, 'Navštívit historické centrum');
    setValue(taskInput, 'Rezervovat vlak');
    setValue(plannedBudgetInput, '250');
    setValue(citySearchInput, 'Praha');
    citySearchButton.click();
    const http = TestBed.inject(HttpTestingController);
    const cityRequest = http.expectOne(request =>
      request.url === 'https://nominatim.openstreetmap.org/search' &&
      request.params.get('q') === 'Praha' &&
      request.params.get('featuretype') === 'city' &&
      request.params.get('format') === 'jsonv2',
    );
    cityRequest.flush([{
      osm_type: 'relation',
      osm_id: 435514,
      name: 'Praha',
      category: 'boundary',
      type: 'administrative',
      display_name: 'Praha, Česko',
      lat: '50.087',
      lon: '14.421',
      boundingbox: ['49.94', '50.18', '14.22', '14.71'],
      extratags: { wikipedia: 'cs:Praha', wikidata: 'Q1085' },
    }, {
      osm_type: 'node',
      osm_id: 999,
      name: 'Muzeum',
      category: 'tourism',
      type: 'museum',
      display_name: 'Muzeum, Praha, Česko',
      lat: '50.08',
      lon: '14.42',
    }]);
    await harness.fixture.whenStable();
    harness.fixture.detectChanges();
    expect(editor.citySearchResults.length).toBe(1);

    Array.from(editorElement.querySelectorAll('button'))
      .find(button => button.textContent?.includes('Vybrat toto město'))!
      .click();
    const cityWikipediaRequest = http.expectOne(request =>
      request.url === 'https://cs.wikipedia.org/w/api.php' &&
      request.params.get('titles') === 'Praha',
    );
    cityWikipediaRequest.flush({
      query: {
        pages: {
          '123': {
            title: 'Praha',
            extract: 'Praha je hlavní město Česka.',
            fullurl: 'https://cs.wikipedia.org/wiki/Praha',
          },
        },
      },
    });
    await harness.fixture.whenStable();
    harness.fixture.detectChanges();
    expect(editor.trip?.city?.wikipedia?.title).toBe('Praha');

    await new Promise(resolve => setTimeout(resolve, 1000));
    const placeSearchInput =
      editorElement.querySelector<HTMLInputElement>('input[placeholder="Např. Louvre, Eiffelova věž nebo muzeum"]')!;
    const searchButton = Array.from(editorElement.querySelectorAll('button'))
      .find(button => button.textContent?.includes('Hledat místa ve městě'))!;
    searchButton.click();
    harness.fixture.detectChanges();
    expect(editorElement.querySelector('[role="alert"]')?.textContent)
      .toContain('Zadejte název zajímavého místa');
    setValue(placeSearchInput, 'muzeum');
    harness.fixture.detectChanges();

    searchButton.click();
    const searchRequest = http.expectOne(request =>
      request.url === 'https://nominatim.openstreetmap.org/search' &&
      request.params.get('q') === 'muzeum' &&
      request.params.get('format') === 'jsonv2' &&
      request.params.get('extratags') === '1' &&
      request.params.get('namedetails') === '1' &&
      request.params.get('viewbox') === '14.22,50.18,14.71,49.94' &&
      request.params.get('bounded') === '1',
    );
    searchRequest.flush([
      {
        osm_type: 'node',
        osm_id: 123,
        name: 'Staroměstská radnice',
        category: 'tourism',
        type: 'museum',
        display_name: 'Staroměstská radnice, Praha, Česko',
        lat: '50.087',
        lon: '14.421',
      },
      {
        osm_type: 'node',
        osm_id: 456,
        name: 'Pražský hrad',
        category: 'tourism',
        type: 'castle',
        display_name: 'Pražský hrad, Praha, Česko',
        lat: '50.091',
        lon: '14.401',
        extratags: { wikipedia: 'cs:Pražský_hrad' },
      },
    ]);
    await harness.fixture.whenStable();
    harness.fixture.detectChanges();
    const addPlaceButtons = Array.from(editorElement.querySelectorAll('button'))
      .filter(button => button.textContent?.trim() === 'Přidat do itineráře');
    expect(editorElement.textContent).toContain('Staroměstská radnice');
    expect(addPlaceButtons.length).toBe(2);
    addPlaceButtons[0].click();
    addPlaceButtons[1].click();
    harness.fixture.detectChanges();

    const moveCastleUpButton =
      editorElement.querySelector<HTMLButtonElement>('[aria-label="Přesunout Pražský hrad nahoru"]')!;
    expect(moveCastleUpButton.disabled).toBeFalse();
    moveCastleUpButton.click();
    harness.fixture.detectChanges();
    expect(editor.trip?.places?.map(place => place.name)).toEqual([
      'Pražský hrad',
      'Staroměstská radnice',
    ]);

    const wikipediaButton = Array.from(editorElement.querySelectorAll('button'))
      .find(button => button.textContent?.includes('Informace z Wikipedie'))!;
    wikipediaButton.click();
    const wikipediaRequest = http.expectOne(request =>
      request.url === 'https://cs.wikipedia.org/w/api.php' &&
      request.params.get('titles') === 'Pražský hrad' &&
      request.params.get('prop') === 'extracts|info|pageprops',
    );
    wikipediaRequest.flush({
      query: {
        pages: {
          '6728': {
            title: 'Pražský hrad',
            extract: 'Pražský hrad je významná památka v Praze.',
            fullurl: 'https://cs.wikipedia.org/wiki/Pra%C5%BDsk%C3%BD_hrad',
          },
        },
      },
    });
    await harness.fixture.whenStable();
    harness.fixture.detectChanges();
    expect(editor.trip?.places?.[0].wikipedia?.title).toBe('Pražský hrad');
    expect(editorElement.textContent).toContain('Skrýt informace');

    const collapseButton = Array.from(editorElement.querySelectorAll('button'))
      .find(button => button.textContent?.includes('Skrýt informace'))!;
    expect(collapseButton).toBeDefined();
    collapseButton.click();
    harness.fixture.detectChanges();
    expect(editorElement.textContent).not.toContain('Pražský hrad je významná památka');
    const expandButton = Array.from(editorElement.querySelectorAll('button'))
      .find(button => button.textContent?.includes('Zobrazit informace'))!;
    expandButton.click();
    harness.fixture.detectChanges();
    expect(editorElement.textContent).toContain('Pražský hrad je významná památka');

    spyOn(window, 'alert');
    Array.from(editorElement.querySelectorAll('button'))
      .find(button => button.textContent?.trim() === 'Přidat')!
      .click();
    harness.fixture.detectChanges();
    Array.from(editorElement.querySelectorAll('button'))
      .find(button => button.textContent?.trim() === 'Uložit')!
      .click();
      await harness.fixture.whenStable();

      const savedTrip = TestBed.inject(TripStore).byId(tripId);
    expect(savedTrip).toEqual(jasmine.objectContaining({
      id: tripId,
      title: 'Víkend v Praze',
      description: 'Historické památky a dobré jídlo.',
      imageUrl: 'https://example.test/prague.jpg',
      notes: 'Navštívit historické centrum',
      destinations: [],
      places: [
        jasmine.objectContaining({
          id: 'node/456',
          name: 'Pražský hrad',
          latitude: 50.091,
          longitude: 14.401,
          wikipedia: jasmine.objectContaining({
            title: 'Pražský hrad',
            extract: 'Pražský hrad je významná památka v Praze.',
          }),
        }),
        jasmine.objectContaining({
          id: 'node/123',
          name: 'Staroměstská radnice',
          latitude: 50.087,
          longitude: 14.421,
        }),
      ],
      tasks: [jasmine.objectContaining({ text: 'Rezervovat vlak', done: false })],
      budget: jasmine.objectContaining({ planned: 250 }),
    }));

    await harness.navigateByUrl('/', TripListComponent);
    expect(harness.routeNativeElement?.textContent).toContain('Víkend v Praze');
    expect(harness.routeNativeElement?.textContent).toContain('Historické památky a dobré jídlo.');
    expect(harness.routeNativeElement?.querySelector('.project-cover')?.getAttribute('src'))
      .toBe('https://example.test/prague.jpg');

    const reopenedEditor = await harness.navigateByUrl(`/trip/${tripId}`, TripEditorComponent);
    await harness.fixture.whenStable();
    harness.fixture.detectChanges();
    const reopenedEditorElement = harness.routeNativeElement!;
    const reopenedTitleInput =
      reopenedEditorElement.querySelector<HTMLInputElement>('label input')!;
    expect(reopenedEditor.trip?.title).toBe('Víkend v Praze');
    expect(reopenedEditor.trip?.description).toBe('Historické památky a dobré jídlo.');
    expect(reopenedEditor.trip?.imageUrl).toBe('https://example.test/prague.jpg');
    expect(reopenedEditor.trip?.city).toEqual(jasmine.objectContaining({
      name: 'Praha',
      boundingBox: [49.94, 50.18, 14.22, 14.71],
      wikipedia: jasmine.objectContaining({ title: 'Praha' }),
    }));
    expect(reopenedEditor.trip?.destinations).toEqual([]);
    expect(reopenedEditor.trip?.tasks[0].text).toBe('Rezervovat vlak');
    expect(reopenedEditor.trip?.places?.map(place => place.name)).toEqual([
      'Pražský hrad',
      'Staroměstská radnice',
    ]);
    expect(reopenedEditor.trip?.places?.[0].id).toBe('node/456');
    expect(reopenedEditor.trip?.places?.[0].wikipedia?.extract)
      .toBe('Pražský hrad je významná památka v Praze.');
    expect(reopenedEditor.trip?.budget?.planned).toBe(250);
    expect(reopenedTitleInput.value).toBe('Víkend v Praze');

    const calculateRouteButton = Array.from(reopenedEditorElement.querySelectorAll('button'))
      .find(button => button.textContent?.includes('Vypočítat trasu'))!;
    calculateRouteButton.click();
    const routeRequest = http.expectOne(request =>
      request.urlWithParams.startsWith(
        'https://router.project-osrm.org/route/v1/driving/14.401,50.091;14.421,50.087?',
      ),
    );
    routeRequest.flush({
      code: 'Ok',
      routes: [{
        distance: 3330.4,
        duration: 434.2,
        geometry: {
          coordinates: [
            [14.401, 50.091],
            [14.421, 50.087],
          ],
        },
      }],
    });
    await harness.fixture.whenStable();
    harness.fixture.detectChanges();
    expect(reopenedEditor.routeSummary?.distanceMeters).toBe(3330.4);
    expect(reopenedEditorElement.querySelector('[role="status"]')?.textContent)
      .toContain('3,3 km');

    await harness.navigateByUrl('/', TripListComponent);
    harness.routeNativeElement?.querySelectorAll('button')[1].click();
    await harness.fixture.whenStable();
    harness.fixture.detectChanges();
    expect(TestBed.inject(TripStore).byId(tripId)).toBeUndefined();
    expect(harness.routeNativeElement?.textContent).not.toContain('Víkend v Praze');

    http.verify();
  });

  it('does not show an unrelated Wikipedia article with a similar name', async () => {
    const wikipedia = TestBed.inject(WikipediaService);
    const lookup = wikipedia.findSummary('Praha');
    const request = TestBed.inject(HttpTestingController).expectOne(request =>
      request.params.get('titles') === 'Praha',
    );
    request.flush({
      query: {
        pages: {
          '98765': {
            title: 'Nová Praha',
            extract: 'Město ve Spojených státech amerických.',
            fullurl: 'https://cs.wikipedia.org/wiki/Nov%C3%A1_Praha',
          },
        },
      },
    });

    await expectAsync(lookup).toBeResolvedTo(null);
  });

  it('uses the Czech Wikipedia page linked from OpenStreetMap metadata', async () => {
    const trip = await TestBed.inject(TripStore).addEmpty();
    const harness = await RouterTestingHarness.create();
    const editor = await harness.navigateByUrl(`/trip/${trip.id}`, TripEditorComponent);
    editor.addPlace({
      osm_type: 'relation',
      osm_id: 435514,
      name: 'Prague',
      category: 'boundary',
      type: 'administrative',
      display_name: 'Prague, Czechia',
      lat: '50.087',
      lon: '14.421',
      extratags: { wikipedia: 'cs:Praha', wikidata: 'Q1085' },
      namedetails: { 'name:cs': 'Praha' },
    });

    const place = editor.trip!.places![0];
    expect(place.name).toBe('Praha');
    expect(place.wikipediaPageTitle).toBe('Praha');
    expect(place.wikidataId).toBe('Q1085');

    const lookup = editor.loadWikipediaSummary(place);
    const request = TestBed.inject(HttpTestingController).expectOne(request =>
      request.params.get('titles') === 'Praha' &&
      request.params.get('prop') === 'extracts|info|pageprops',
    );
    request.flush({
      query: {
        pages: {
          '123': {
            title: 'Praha',
            extract: 'Praha je hlavní město Česka.',
            fullurl: 'https://cs.wikipedia.org/wiki/Praha',
          },
        },
      },
    });
    await lookup;

    expect(place.wikipedia?.extract).toBe('Praha je hlavní město Česka.');
    await editor.save();
    expect(TestBed.inject(TripStore).byId(trip.id)?.places?.[0]).toEqual(jasmine.objectContaining({
      name: 'Praha',
      wikipediaPageTitle: 'Praha',
      wikidataId: 'Q1085',
      wikipedia: jasmine.objectContaining({ title: 'Praha' }),
    }));
    TestBed.inject(HttpTestingController).verify();
  });

  it('rejects a Wikipedia disambiguation page', async () => {
    const wikipedia = TestBed.inject(WikipediaService);
    const lookup = wikipedia.findSummary('Prague');
    const request = TestBed.inject(HttpTestingController).expectOne(request =>
      request.params.get('titles') === 'Prague' &&
      request.params.get('prop') === 'extracts|info|pageprops',
    );
    request.flush({
      query: {
        pages: {
          '456': {
            title: 'Prague',
            extract: 'Název Prague (česky Praha) může znamenat několik míst.',
            pageprops: { disambiguation: '' },
          },
        },
      },
    });

    await expectAsync(lookup).toBeResolvedTo(null);
  });

  it('resolves a Wikipedia link for a place saved before OSM metadata was available', async () => {
    const store = TestBed.inject(TripStore);
    const trip = await store.addEmpty();
    const legacyPlace = {
      id: 'relation/435514',
      osmType: 'relation',
      osmId: 435514,
      name: 'Prague',
      category: 'boundary · administrative',
      address: 'Prague, Czechia',
      latitude: 50.087,
      longitude: 14.421,
    };
    trip.places = [legacyPlace];
    await store.upsert(trip);

    const harness = await RouterTestingHarness.create();
    const editor = await harness.navigateByUrl(`/trip/${trip.id}`, TripEditorComponent);
    const lookup = editor.loadWikipediaSummary(legacyPlace);
    const http = TestBed.inject(HttpTestingController);
    const osmRequest = http.expectOne(request =>
      request.url === 'https://nominatim.openstreetmap.org/search' &&
      request.params.get('q') === 'Prague, Czechia' &&
      request.params.get('extratags') === '1',
    );
    osmRequest.flush([{
      osm_type: 'relation',
      osm_id: 435514,
      name: 'Praha',
      category: 'boundary',
      type: 'administrative',
      display_name: 'Praha, Česko',
      lat: '50.087',
      lon: '14.421',
      extratags: { wikipedia: 'cs:Praha' },
    }]);
    await harness.fixture.whenStable();

    const wikipediaRequest = http.expectOne(request =>
      request.url === 'https://cs.wikipedia.org/w/api.php' &&
      request.params.get('titles') === 'Praha',
    );
    wikipediaRequest.flush({
      query: {
        pages: {
          '123': {
            title: 'Praha',
            extract: 'Praha je hlavní město Česka.',
            fullurl: 'https://cs.wikipedia.org/wiki/Praha',
          },
        },
      },
    });
    await lookup;

    expect(editor.trip!.places![0]).toEqual(jasmine.objectContaining({
      wikipediaPageTitle: 'Praha',
      wikipedia: jasmine.objectContaining({ title: 'Praha' }),
    }));
    http.verify();
  });
});
