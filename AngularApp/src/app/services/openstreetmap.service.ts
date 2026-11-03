import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ItineraryPlace, OsmSearchResult } from '../models/osm-place';

@Injectable({ providedIn: 'root' })
export class OpenStreetMapService {
  private readonly searchUrl = 'https://nominatim.openstreetmap.org/search';
  private lastRequestAt = 0;

  constructor(private readonly http: HttpClient) {}

  async search(query: string): Promise<OsmSearchResult[]> {
    const waitMs = this.lastRequestAt
      ? Math.max(0, 1000 - (Date.now() - this.lastRequestAt))
      : 0;
    if (waitMs > 0) {
      await new Promise(resolve => setTimeout(resolve, waitMs));
    }

    this.lastRequestAt = Date.now();
    const params = new HttpParams()
      .set('q', query)
      .set('format', 'jsonv2')
      .set('addressdetails', '1')
      .set('extratags', '1')
      .set('namedetails', '1')
      .set('limit', '10');

    return firstValueFrom(
      this.http.get<OsmSearchResult[]>(this.searchUrl, { params }),
    );
  }

  async findLinkedCzechWikipediaTitle(place: ItineraryPlace): Promise<string | null> {
    const results = await this.search(place.address || place.name);
    const matchingPlace = results.find(result =>
      result.osm_type === place.osmType && result.osm_id === place.osmId,
    );
    const wikipediaTag = matchingPlace?.extratags?.wikipedia?.trim();
    return wikipediaTag?.match(/^cs:(.+)$/i)?.[1]?.replace(/_/g, ' ').trim() ?? null;
  }
}
