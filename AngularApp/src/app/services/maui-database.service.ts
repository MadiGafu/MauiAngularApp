import { Injectable } from '@angular/core';
import { Trip } from '../models/trip';

declare global {
  interface Window {
    __IS_MAUI_WEBVIEW__?: boolean;
    angularReceiveStructured?: (b64: string) => void;
  }
}

interface DatabaseResponse<T> {
  result?: T;
  error?: string;
}

@Injectable({ providedIn: 'root' })
export class MauiDatabaseService {
  private readonly pendingRequests = new Map<
    string,
    { resolve: (value: unknown) => void; reject: (error: Error) => void; timeout: number }
  >();

  constructor() {
    if (typeof window === 'undefined') return;

    window.addEventListener('maui-database-response', event => {
      const response = (event as CustomEvent<{ id?: string; payload?: DatabaseResponse<unknown> }>).detail;
      if (!response.id) return;

      const pending = this.pendingRequests.get(response.id);
      if (!pending) return;
      window.clearTimeout(pending.timeout);
      this.pendingRequests.delete(response.id);

      if (response.payload?.error) {
        pending.reject(new Error(response.payload.error));
      } else {
        pending.resolve(response.payload?.result);
      }
    });
  }

  get isMaui(): boolean {
    return typeof window !== 'undefined' && (
      window.__IS_MAUI_WEBVIEW__ === true ||
      window.location.protocol === 'file:' ||
      window.location.hostname === 'appassets.example'
    );
  }

  initialize(legacyTrips: Trip[]): Promise<Trip[]> {
    return this.request<Trip[]>('initialize', {
      legacyTripsJson: JSON.stringify(legacyTrips),
    });
  }

  saveTrips(trips: Trip[]): Promise<boolean> {
    return this.request<boolean>('saveTrips', { trips });
  }

  deleteTrip(tripId: string): Promise<boolean> {
    return this.request<boolean>('deleteTrip', { tripId });
  }

  pickTripImage(): Promise<string | null> {
    return this.request<string | null>('pickTripImage', {}, 120000);
  }

  private request<T>(action: string, data: object, timeoutMs = 15000): Promise<T> {
    if (!this.isMaui || typeof window === 'undefined') {
      return Promise.reject(new Error('Databázové operace jsou dostupné pouze v aplikaci MAUI.'));
    }

    const id = crypto.randomUUID();
    const message = JSON.stringify({ type: 'databaseRequest', id, payload: { action, ...data } });
    const base64Url = btoa(unescape(encodeURIComponent(message)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    return new Promise<T>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error('Databáze MAUI neodpověděla včas.'));
      }, timeoutMs);
      this.pendingRequests.set(id, {
        resolve: value => resolve(value as T),
        reject,
        timeout,
      });

      try {
        window.location.href = `maui://request/${base64Url}`;
      } catch (error) {
        window.clearTimeout(timeout);
        this.pendingRequests.delete(id);
        reject(error instanceof Error ? error : new Error('Požadavek databázi MAUI se nepodařilo odeslat.'));
      }
    });
  }
}
