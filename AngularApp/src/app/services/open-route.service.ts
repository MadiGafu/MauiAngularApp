import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ItineraryPlace } from '../models/osm-place';

interface OsrmRouteResponse {
  code: string;
  routes: {
    distance: number;
    duration: number;
    geometry: {
      coordinates: [number, number][];
    };
  }[];
}

export interface PlannedRoute {
  distanceMeters: number;
  durationSeconds: number;
  coordinates: [number, number][];
}

@Injectable({ providedIn: 'root' })
export class OpenRouteService {
  private readonly routeUrl = 'https://router.project-osrm.org/route/v1/driving';

  constructor(private readonly http: HttpClient) {}

  async calculate(places: ItineraryPlace[]): Promise<PlannedRoute> {
    if (places.length < 2) {
      throw new Error('Pro výpočet trasy jsou potřeba alespoň dvě místa.');
    }

    const coordinates = places
      .map(place => `${place.longitude},${place.latitude}`)
      .join(';');
    const response = await firstValueFrom(
      this.http.get<OsrmRouteResponse>(
        `${this.routeUrl}/${coordinates}?overview=full&geometries=geojson&steps=false`,
      ),
    );

    const route = response.routes[0];
    if (response.code !== 'Ok' || !route) {
      throw new Error(`Služba OSRM nevrátila trasu (${response.code}).`);
    }

    return {
      distanceMeters: route.distance,
      durationSeconds: route.duration,
      coordinates: route.geometry.coordinates,
    };
  }
}
