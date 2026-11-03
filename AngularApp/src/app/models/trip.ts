import { ItineraryPlace } from './osm-place';

export interface Trip {
  id: string;
  title: string;
  startDate: string;  // ISO yyyy-mm-dd
  endDate: string;    // ISO
  description?: string;
  imageUrl?: string;
  destinations: string[]; // города/локации
  places?: ItineraryPlace[];
  notes?: string;
  tasks: { id: string; text: string; done: boolean }[];
  budget?: { currency: string; planned: number; spent: number };
}
