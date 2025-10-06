import { Component, signal } from '@angular/core';
import { RouterModule } from '@angular/router';
import { NgFor } from '@angular/common';
import { TripStore } from '../store/trip.store';

@Component({
  selector: 'trip-list',
  standalone: true,
  imports: [RouterModule, NgFor],
  template: `
  <div style="display:flex; justify-content:space-between; align-items:center">
    <h3 style="margin:0">Поездки</h3>
    <button (click)="create()">+ Новая</button>
  </div>

  @if (store.hasTrips()) {
    <ul style="margin-top:12px; padding-left:18px; line-height:1.7">
      @for (t of store.trips(); track t.id) {
        <li>
          <a [routerLink]="['/trip', t.id]">{{t.title}}</a>
          <small> ({{t.startDate}} → {{t.endDate}})</small>
          <button (click)="del(t.id)" style="margin-left:8px">Удалить</button>
        </li>
      }
    </ul>
  } @else {
    <div style="opacity:.7; margin-top:8px">пока пусто — нажмите «Новая»</div>
  }
  `
})
export class TripListComponent {
  constructor(public store: TripStore) {}
  create() { const t = this.store.addEmpty(); location.assign(`/trip/${t.id}`); }
  del(id: string) { this.store.remove(id); }
}
