import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { NgFor } from '@angular/common';
import { TripStore } from '../store/trip.store';
import { Trip } from '../models/trip';

@Component({
  selector: 'trip-editor',
  standalone: true,
  imports: [RouterModule, FormsModule],
  template: `
  @if (trip) {
    <div style="display:flex; gap:16px; flex-wrap:wrap">
      <div style="flex:1; min-width:260px">
        <h3>Základní údaje</h3>
        <label>Název<br><input [(ngModel)]="trip.title" /></label><br><br>
        <label>Začátek<br><input type="date" [(ngModel)]="trip.startDate" /></label><br><br>
        <label>Konec<br><input type="date" [(ngModel)]="trip.endDate" /></label><br><br>
        <label>Destinace (oddělené čárkou)<br>
          <input [(ngModel)]="destinationsStr" (change)="applyDestinations()"/>
        </label><br><br>
        <label>Poznámky<br><textarea rows="4" [(ngModel)]="trip.notes"></textarea></label>
      </div>

      <div style="flex:1; min-width:260px">
        <h3>Úkoly</h3>
        <div style="display:flex; gap:8px">
          <input [(ngModel)]="newTask" placeholder="Nový úkol" (keyup.enter)="addTask()"/>
          <button (click)="addTask()">Přidat</button>
        </div>
        <ul style="margin-top:8px; padding-left:18px">
          @for (t of trip.tasks; track t.id) {
            <li>
              <label><input type="checkbox" [(ngModel)]="t.done"/> {{t.text}}</label>
              <button (click)="removeTask(t.id)" style="margin-left:8px">×</button>
            </li>
          }
        </ul>
      </div>

      <div style="flex:1; min-width:260px">
        <h3>Rozpočet</h3>
        Měna: <input style="width:80px" [(ngModel)]="trip.budget!.currency"/><br><br>
        Plán: <input type="number" [(ngModel)]="trip.budget!.planned"/> —
        Utraceno: <input type="number" [(ngModel)]="trip.budget!.spent"/>
        <div style="margin-top:8px">Zbývá: <b>{{ (trip.budget!.planned || 0) - (trip.budget!.spent || 0) }}</b></div>
      </div>
    </div>

    <div style="margin-top:16px; display:flex; gap:8px">
      <button (click)="save()">Uložit</button>
      <button (click)="back()">Zpět na itineráře</button>
    </div>

    <div style="margin-top:16px; border:1px dashed #ddd; padding:12px; border-radius:8px">
      <h3 style="margin-top:0">Mapa a trasa</h3>
      <div style="opacity:.7">Vyhledávání míst a optimalizace trasy budou doplněny v dalších etapách.</div>
    </div>
  } @else {
    <div>Itinerář nebyl nalezen.</div>
  }
  `
})
export class TripEditorComponent implements OnInit {
  trip?: Trip;
  destinationsStr = '';
  newTask = '';

  constructor(private route: ActivatedRoute, private router: Router, private store: TripStore) {}

  ngOnInit() {
  const id = this.route.snapshot.paramMap.get('id')!;
  const t = this.store.byId(id);
  if (t) {
    // копия исходника
    this.trip = JSON.parse(JSON.stringify(t)) as Trip;

    // безопасные значения
    this.trip.destinations ||= [];
    this.trip.tasks ||= [];
    this.trip.budget ||= { currency: 'EUR', planned: 0, spent: 0 };

    // → TS без ошибок (trip точно есть)
    this.destinationsStr = this.trip.destinations.join(', ');
  }
}


  applyDestinations() {
    if (!this.trip) return;
    this.trip.destinations = this.destinationsStr.split(',')
      .map(s => s.trim()).filter(Boolean);
  }

  addTask() {
    const text = this.newTask.trim();
    if (!text || !this.trip) return;
    this.trip.tasks.push({ id: crypto.randomUUID(), text, done: false });
    this.newTask = '';
  }

  removeTask(id: string) {
    if (!this.trip) return;
    this.trip.tasks = this.trip.tasks.filter(t => t.id !== id);
  }

  save() {
    if (!this.trip) return;
    this.store.upsert(this.trip);
    alert('Itinerář byl uložen.');
  }

  back() { this.router.navigateByUrl('/'); }
}
