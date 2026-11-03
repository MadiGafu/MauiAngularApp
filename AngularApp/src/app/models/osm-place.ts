export interface OsmSearchResult {
  osm_type: string;
  osm_id: number;
  name?: string;
  category: string;
  type: string;
  display_name: string;
  lat: string;
  lon: string;
  extratags?: {
    wikipedia?: string;
    wikidata?: string;
  };
  namedetails?: Record<string, string>;
}

export interface ItineraryPlace {
  id: string;
  osmType: string;
  osmId: number;
  name: string;
  category: string;
  address: string;
  latitude: number;
  longitude: number;
  wikipediaPageTitle?: string;
  wikidataId?: string;
  wikipedia?: WikipediaSummary;
}

export interface WikipediaSummary {
  title: string;
  extract: string;
  url: string;
}
