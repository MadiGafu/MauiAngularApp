export interface Trip {
  id: string;
  title: string;
  startDate: string;  // ISO yyyy-mm-dd
  endDate: string;    // ISO
  destinations: string[]; // города/локации
  notes?: string;
  tasks: { id: string; text: string; done: boolean }[];
  budget?: { currency: string; planned: number; spent: number };
}
