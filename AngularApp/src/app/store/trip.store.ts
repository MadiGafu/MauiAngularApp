import { Injectable, computed, signal } from '@angular/core';
import { Trip } from '../models/trip';
import { MauiBridgeService } from '../services/maui-bridge.service';

const KEY = 'itinerary.trips.v1';

@Injectable({ providedIn: 'root' })
export class TripStore {
  private readonly _trips = signal<Trip[]>([]);
  readonly trips = computed(() => this._trips());
  readonly hasTrips = computed(() => this._trips().length > 0);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly ready: Promise<void>;

  constructor(private readonly database: MauiBridgeService) {
    this.ready = this.initialize();
    void this.ready.catch(() => undefined);
  }

  async addEmpty(): Promise<Trip> {
    await this.ready;
    const trip: Trip = {
      id: crypto.randomUUID(),
      title: 'Nový itinerář',
      startDate: new Date().toISOString().slice(0, 10),
      endDate: new Date().toISOString().slice(0, 10),
      description: 'Nový výlet čeká na naplánování.',
      imageUrl: '/trip-cover.svg',
      destinations: [],
      places: [],
      tasks: [],
      budget: { currency: 'EUR', planned: 0, spent: 0 },
    };
    const trips = [trip, ...this._trips()];
    await this.persistTrips(trips);
    return trip;
  }

  async update(id: string, patch: Partial<Trip>): Promise<void> {
    await this.ready;
    const existing = this.byId(id);
    if (!existing) return;
    await this.upsert({ ...existing, ...patch });
  }

  async upsert(trip: Trip): Promise<void> {
    await this.ready;
    const trips = [...this._trips()];
    const index = trips.findIndex(item => item.id === trip.id);
    if (index >= 0) {
      trips[index] = trip;
    } else {
      trips.unshift(trip);
    }
    await this.persistTrips(trips);
  }

  async remove(id: string): Promise<void> {
    await this.ready;
    const trips = this._trips().filter(trip => trip.id !== id);
    if (this.database.isMaui) {
      await this.database.deleteTrip(id);
    } else {
      this.persistInBrowser(trips);
    }
    this._trips.set(trips);
  }

  byId(id: string): Trip | undefined {
    return this._trips().find(trip => trip.id === id);
  }

  private async initialize(): Promise<void> {
    try {
      if (this.database.isMaui) {
        const legacyTrips = this.readFromLocalStorage();
        const trips = await this.database.initialize(legacyTrips);
        localStorage.removeItem(KEY);
        this._trips.set(trips);
      } else if (typeof localStorage !== 'undefined') {
        this._trips.set(this.readFromLocalStorage());
      } else {
        this._trips.set([]);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Databázi itinerářů se nepodařilo načíst.';
      this.error.set(message);
      throw error;
    } finally {
      this.loading.set(false);
    }
  }

  private async persistTrips(trips: Trip[]): Promise<void> {
    if (this.database.isMaui) {
      await this.database.saveTrips(trips);
    } else {
      this.persistInBrowser(trips);
    }
    this._trips.set(trips);
  }

  private persistInBrowser(trips: Trip[]): void {
    localStorage.setItem(KEY, JSON.stringify(trips));
  }

  private readFromLocalStorage(): Trip[] {
    if (typeof localStorage === 'undefined') return [];
    const serialized = localStorage.getItem(KEY);
    if (!serialized) return [];

    const data: unknown = JSON.parse(serialized);
    if (!Array.isArray(data) || !data.every(isTrip)) {
      throw new Error('Uložená data itinerářů mají neplatný formát a nebyla změněna.');
    }

    return data.map(trip => ({
      ...trip,
      description: trip.description ?? trip.notes ?? '',
      imageUrl: trip.imageUrl || '/trip-cover.svg',
      destinations: trip.destinations ?? [],
      places: trip.places ?? [],
      tasks: trip.tasks ?? [],
    }));
  }
}

function isTrip(value: unknown): value is Trip {
  if (typeof value !== 'object' || value === null) return false;
  return 'id' in value
    && 'title' in value
    && 'startDate' in value
    && 'endDate' in value
    && typeof value.id === 'string'
    && typeof value.title === 'string'
    && typeof value.startDate === 'string'
    && typeof value.endDate === 'string';
}
