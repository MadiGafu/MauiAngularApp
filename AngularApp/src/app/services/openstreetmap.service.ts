import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ItineraryPlace, OsmSearchResult, TripCity } from '../models/osm-place';
import { MauiBridgeService } from './maui-bridge.service';

@Injectable({ providedIn: 'root' })
export class OpenStreetMapService {
  private readonly searchUrl = 'https://nominatim.openstreetmap.org/search';
  private lastRequestAt = 0;

  constructor(
    private readonly http: HttpClient,
    private readonly maui: MauiBridgeService,
  ) {}

  async search(query: string, extraParams: Record<string, string> = {}): Promise<OsmSearchResult[]> {
    const waitMs = this.lastRequestAt
      ? Math.max(0, 1000 - (Date.now() - this.lastRequestAt))
      : 0;
    if (waitMs > 0) {
      await new Promise(resolve => setTimeout(resolve, waitMs));
    }

    this.lastRequestAt = Date.now();
    let params = new HttpParams()
      .set('q', query)
      .set('format', 'jsonv2')
      .set('addressdetails', '1')
      .set('extratags', '1')
      .set('namedetails', '1')
      .set('limit', '10');
    for (const [name, value] of Object.entries(extraParams)) {
      params = params.set(name, value);
    }

    return firstValueFrom(
      this.http.get<OsmSearchResult[]>(this.searchUrl, { params }),
    );
  }

  async searchCities(query: string): Promise<OsmSearchResult[]> {
    if (this.maui.isMaui) {
      return this.maui.searchCities(query);
    }

    const results = await this.search(query, { featuretype: 'city' });
    const supportedCityTypes = new Set(['city', 'town', 'village', 'municipality']);
    return results.filter(result =>
      (result.category === 'place' && supportedCityTypes.has(result.type)) ||
      (result.category === 'boundary' && result.type === 'administrative'),
    );
  }

  searchWithinCity(query: string, city: TripCity): Promise<OsmSearchResult[]> {
    if (this.maui.isMaui) {
      if (!city.boundingBox) {
        return Promise.reject(new Error('Vybrané město nemá platné geografické hranice.'));
      }

      const [south, north, west, east] = city.boundingBox;
      return this.maui.searchPlaces(query, city.name, { south, north, west, east });
    }

    if (!city.boundingBox) {
      return this.search(`${query}, ${city.name}`);
    }

    const [south, north, west, east] = city.boundingBox;
    return this.search(query, {
      viewbox: `${west},${north},${east},${south}`,
      bounded: '1',
    });
  }

  async findLinkedCzechWikipediaTitle(place: ItineraryPlace): Promise<string | null> {
    if (this.maui.isMaui) {
      return this.maui.findLinkedWikipediaTitle(place.osmType, place.osmId);
    }

    const results = await this.search(place.address || place.name);
    const matchingPlace = results.find(result =>
      result.osm_type === place.osmType && result.osm_id === place.osmId,
    );
    const wikipediaTag = matchingPlace?.extratags?.wikipedia?.trim();
    return wikipediaTag?.match(/^cs:(.+)$/i)?.[1]?.replace(/_/g, ' ').trim() ?? null;
  }
}
