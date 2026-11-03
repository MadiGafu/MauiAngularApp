import { Component } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { TripStore } from '../store/trip.store';

@Component({
  selector: 'trip-list',
  standalone: true,
  imports: [RouterModule],
  template: `
    <section class="projects-page">
      <header class="projects-header">
        <div>
          <p class="eyebrow">PLÁNOVAČ CEST</p>
          <h1>Moje projekty</h1>
          <p class="projects-intro">Vytvářejte výlety, plánujte místa a mějte vše na jednom místě.</p>
        </div>
        <button class="primary-button" (click)="create()" [disabled]="store.loading() || isCreating">
          {{ isCreating ? 'Vytvářím…' : '+ Nový projekt' }}
        </button>
      </header>

      @if (storageError || store.error()) {
        <p role="alert" class="project-error">{{ storageError || store.error() }}</p>
      }
      @if (store.loading()) {
        <p role="status">Načítám projekty…</p>
      } @else if (store.hasTrips()) {
        <div class="project-grid">
          @for (trip of store.trips(); track trip.id) {
            <article class="project-card">
              <img
                class="project-cover"
                [src]="trip.imageUrl || defaultCover"
                [alt]="'Obrázek projektu ' + trip.title"
                (error)="useFallbackImage($event)"
              />
              <div class="project-card-content">
                <h2>{{ trip.title }}</h2>
                <p class="project-dates">
                  {{ formatDate(trip.startDate) }} – {{ formatDate(trip.endDate) }}
                </p>
                <p class="project-description">
                  {{ trip.description || 'Krátký popis zatím nebyl přidán.' }}
                </p>
                <div class="project-actions">
                  <a class="primary-button" [routerLink]="['/trip', trip.id]">Upravit projekt</a>
                  <button
                    class="secondary-button"
                    (click)="del(trip.id)"
                    [disabled]="store.loading()"
                    [attr.aria-label]="'Odstranit projekt ' + trip.title"
                  >Odstranit</button>
                </div>
              </div>
            </article>
          }
        </div>
      } @else {
        <div class="projects-empty">
          <div class="empty-illustration" aria-hidden="true">✦</div>
          <h2>Začněte plánovat svou další cestu</h2>
          <p>Založte projekt a přidejte termín, popis i místa, která chcete navštívit.</p>
          <button class="primary-button" (click)="create()" [disabled]="isCreating">
            {{ isCreating ? 'Vytvářím…' : 'Vytvořit první projekt' }}
          </button>
        </div>
      }
    </section>
  `,
})
export class TripListComponent {
  readonly defaultCover = '/trip-cover.svg';
  storageError = '';
  isCreating = false;

  constructor(public store: TripStore, private router: Router) {}

  async create() {
    if (this.isCreating) return;
    this.isCreating = true;
    try {
      const trip = await this.store.addEmpty();
      const navigated = await this.router.navigate(['/trip', trip.id]);
      if (!navigated) throw new Error('Editor projektu se nepodařilo otevřít.');
    } catch (error) {
      this.storageError = error instanceof Error ? error.message : 'Projekt se nepodařilo vytvořit.';
    } finally {
      this.isCreating = false;
    }
  }

  async del(id: string) {
    try {
      await this.store.remove(id);
      this.storageError = '';
    } catch (error) {
      this.storageError = error instanceof Error ? error.message : 'Projekt se nepodařilo odstranit.';
    }
  }

  formatDate(value: string): string {
    const [year, month, day] = value.split('-').map(Number);
    if (!year || !month || !day) return value;
    return new Date(year, month - 1, day).toLocaleDateString('cs-CZ');
  }

  useFallbackImage(event: Event) {
    const image = event.currentTarget;
    if (image instanceof HTMLImageElement && !image.src.endsWith(this.defaultCover)) {
      image.src = this.defaultCover;
    }
  }
}
