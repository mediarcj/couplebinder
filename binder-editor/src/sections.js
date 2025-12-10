// File: binder-editor/src/sections.js
// Description: Shared section labels and options for binder editor
// Notes: Keep keys in sync with server-side PDF export and layout JSON

export const SECTION_LABELS = {
  overview: 'Our Story Overview',
  photos: 'Photos Together',
  trips: 'Trips & Visits',
  family: 'Family & Friends',
  chats: 'Screenshots & Chats / Calls',
  receipts: 'Receipts / Support / Financial'
};

export const SECTION_OPTIONS = [
  { value: 'overview', label: SECTION_LABELS.overview },
  { value: 'photos', label: SECTION_LABELS.photos },
  { value: 'trips', label: SECTION_LABELS.trips },
  { value: 'family', label: SECTION_LABELS.family },
  { value: 'chats', label: SECTION_LABELS.chats },
  { value: 'receipts', label: SECTION_LABELS.receipts }
];

