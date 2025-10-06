import { Routes } from '@angular/router';
import { TripListComponent } from './pages/trip-list.component';
import { TripEditorComponent } from './pages/trip-editor.component';

export const routes: Routes = [
  { path: '', component: TripListComponent },
  { path: 'trip/:id', component: TripEditorComponent },
  { path: '**', redirectTo: '' }
];
