import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { WikipediaSummary } from '../models/osm-place';

interface WikipediaPage {
  title: string;
  extract?: string;
  fullurl?: string;
  missing?: boolean;
  pageprops?: {
    disambiguation?: string;
  };
}

interface WikipediaPageResponse {
  query?: {
    pages?: Record<string, WikipediaPage>;
  };
}

@Injectable({ providedIn: 'root' })
export class WikipediaService {
  private readonly apiUrl = 'https://cs.wikipedia.org/w/api.php';
  private readonly cache = new Map<string, WikipediaSummary | null>();

  constructor(private readonly http: HttpClient) {}

  async findSummary(placeName: string, linkedPageTitle?: string): Promise<WikipediaSummary | null> {
    const title = linkedPageTitle?.trim() || placeName.trim();
    const cacheKey = title.toLocaleLowerCase('cs-CZ');
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    const params = new HttpParams()
      .set('action', 'query')
      .set('prop', 'extracts|info|pageprops')
      .set('exintro', '1')
      .set('explaintext', '1')
      .set('inprop', 'url')
      .set('redirects', '1')
      .set('titles', title)
      .set('format', 'json')
      .set('origin', '*');
    const response = await firstValueFrom(
      this.http.get<WikipediaPageResponse>(this.apiUrl, { params }),
    );
    const page = Object.values(response.query?.pages ?? {})[0];
    if (
      !page ||
      page.missing ||
      page.pageprops?.disambiguation !== undefined ||
      (!linkedPageTitle && this.normalizeTitle(page.title) !== this.normalizeTitle(placeName)) ||
      !page.extract?.trim()
    ) {
      this.cache.set(cacheKey, null);
      return null;
    }

    const summary = {
      title: page.title,
      extract: page.extract,
      url: page.fullurl
        ?? `https://cs.wikipedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, '_'))}`,
    };
    this.cache.set(cacheKey, summary);
    return summary;
  }

  private normalizeTitle(title: string): string {
    return title
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/_/g, ' ')
      .trim()
      .replace(/\s+/g, ' ')
      .toLocaleLowerCase('cs-CZ');
  }
}
