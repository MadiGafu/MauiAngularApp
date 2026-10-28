import { Component } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { TripStore } from '../store/trip.store';

@Component({
  selector: 'trip-list',
  standalone: true,
  imports: [RouterModule],
  template: `
  <div style="display:flex; justify-content:space-between; align-items:center">
    <h3 style="margin:0">Itineráře</h3>
    <button (click)="create()">+ Nový itinerář</button>
  </div>

  @if (store.hasTrips()) {
    <ul style="margin-top:12px; padding-left:18px; line-height:1.7">
      @for (t of store.trips(); track t.id) {
        <li>
          <a [routerLink]="['/trip', t.id]">{{t.title}}</a>
          <small> ({{t.startDate}} → {{t.endDate}})</small>
          <button (click)="del(t.id)" style="margin-left:8px">Smazat</button>
        </li>
      }
    </ul>
  } @else {
    <div style="opacity:.7; margin-top:8px">Zatím zde nejsou žádné itineráře. Vytvořte nový.</div>
  }
  `
})
export class TripListComponent {
  constructor(public store: TripStore, private router: Router) {}
  create() {
    const trip = this.store.addEmpty();
    void this.router.navigate(['/trip', trip.id]);
  }
  del(id: string) { this.store.remove(id); }
}
