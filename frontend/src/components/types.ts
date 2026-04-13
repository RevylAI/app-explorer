export interface Element {
  label: string;
  element_type: string;
  explored: boolean;
  leads_to: string | null;
  notes: string | null;
}

export interface Screen {
  screen_id: string;
  title: string;
  screenshot: string;
  elements: Element[];
  notes: string | null;
}

export interface Transition {
  from_screen: string;
  to_screen: string;
  action: string;
}

export interface ScreenMap {
  app_name: string;
  platform: string;
  screens: Screen[];
  transitions: Transition[];
}
