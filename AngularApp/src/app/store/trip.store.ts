import { Injectable, signal, computed } from '@angular/core';
import { Trip } from '../models/trip';

const KEY = 'itinerary.trips.v1';

@Injectable({ providedIn: 'root' })
export class TripStore {
  private _trips = signal<Trip[]>(this.loadFromLocal());
  trips = computed(() => this._trips());
  hasTrips = computed(() => this._trips().length > 0);

  addEmpty(): Trip {
    const t: Trip = {
      id: crypto.randomUUID(),
      title: 'Новая поездка',
      startDate: new Date().toISOString().slice(0,10),
      endDate: new Date().toISOString().slice(0,10),
      destinations: [],
      tasks: [],
      budget: { currency: 'EUR', planned: 0, spent: 0 }
    };
    this._trips.update(arr => [t, ...arr]);
    this.persist();
    return t;
  }

  update(id: string, patch: Partial<Trip>) {
    this._trips.update(arr => arr.map(t => t.id === id ? ({ ...t, ...patch }) : t));
    this.persist();
  }

  upsert(trip: Trip) {
    this._trips.update(arr => {
      const i = arr.findIndex(t => t.id === trip.id);
      if (i >= 0) { const copy = arr.slice(); copy[i] = trip; return copy; }
      return [trip, ...arr];
    });
    this.persist();
  }

  remove(id: string) {
    this._trips.update(arr => arr.filter(t => t.id !== id));
    this.persist();
  }

  byId(id: string) { return this._trips().find(t => t.id === id); }

  private persist() { localStorage.setItem(KEY, JSON.stringify(this._trips())); }
  private loadFromLocal(): Trip[] {
    try { return JSON.parse(localStorage.getItem(KEY) ?? '[]') as Trip[]; }
    catch { return []; }
  }
}
