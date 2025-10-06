import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { NgFor } from '@angular/common';
import { TripStore } from '../store/trip.store';
import { Trip } from '../models/trip';

@Component({
  selector: 'trip-editor',
  standalone: true,
  imports: [RouterModule, FormsModule, NgFor],
  template: `
  @if (trip) {
    <div style="display:flex; gap:16px; flex-wrap:wrap">
      <div style="flex:1; min-width:260px">
        <h3>Основное</h3>
        <label>Название<br><input [(ngModel)]="trip.title" /></label><br><br>
        <label>Начало<br><input type="date" [(ngModel)]="trip.startDate" /></label><br><br>
        <label>Конец<br><input type="date" [(ngModel)]="trip.endDate" /></label><br><br>
        <label>Направления (через запятую)<br>
          <input [(ngModel)]="destinationsStr" (change)="applyDestinations()"/>
        </label><br><br>
        <label>Заметки<br><textarea rows="4" [(ngModel)]="trip.notes"></textarea></label>
      </div>

      <div style="flex:1; min-width:260px">
        <h3>Задачи</h3>
        <div style="display:flex; gap:8px">
          <input [(ngModel)]="newTask" placeholder="Добавить задачу" (keyup.enter)="addTask()"/>
          <button (click)="addTask()">Добавить</button>
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
        <h3>Бюджет</h3>
        Валюта: <input style="width:80px" [(ngModel)]="trip.budget!.currency"/><br><br>
        План: <input type="number" [(ngModel)]="trip.budget!.planned"/> —
        Потрачено: <input type="number" [(ngModel)]="trip.budget!.spent"/>
        <div style="margin-top:8px">Остаток: <b>{{ (trip.budget!.planned || 0) - (trip.budget!.spent || 0) }}</b></div>
      </div>
    </div>

    <div style="margin-top:16px; display:flex; gap:8px">
      <button (click)="save()">Сохранить</button>
      <button (click)="back()">Назад к списку</button>
    </div>

    <div style="margin-top:16px; border:1px dashed #ddd; padding:12px; border-radius:8px">
      <h3 style="margin-top:0">Карта / Маршрут (плейсхолдер)</h3>
      <div style="opacity:.7">web-карт и оптимизацию маршрута.</div>
    </div>
  } @else {
    <div>Поездка не найдена.</div>
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
    alert('Сохранено');
  }

  back() { this.router.navigateByUrl('/'); }
}
