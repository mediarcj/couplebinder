// File: binder-editor/src/sections.js
// Description: Shared section labels and options for binder editor
// Notes: Keep keys in sync with server-side PDF export and layout JSON

export const SECTION_LABELS = {
  // I am keeping the `overview` field in this object so the receiving code can read that value by its expected name.
  overview: 'Our Story Overview',
  // I am keeping the `photos` field in this object so the receiving code can read that value by its expected name.
  photos: 'Photos Together',
  // I am keeping the `trips` field in this object so the receiving code can read that value by its expected name.
  trips: 'Trips & Visits',
  // I am keeping the `family` field in this object so the receiving code can read that value by its expected name.
  family: 'Family & Friends',
  // I am keeping the `chats` field in this object so the receiving code can read that value by its expected name.
  chats: 'Screenshots & Chats / Calls',
  // I am keeping the `receipts` field in this object so the receiving code can read that value by its expected name.
  receipts: 'Receipts / Support / Financial'
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
};

// I am exporting this value here so another module can deliberately reuse the completed piece from sections.js.
export const SECTION_OPTIONS = [
  // I am keeping this line here because the surrounding sections.js workflow expects this value or operation before it continues.
  { value: 'overview', label: SECTION_LABELS.overview },
  // I am keeping this line here because the surrounding sections.js workflow expects this value or operation before it continues.
  { value: 'photos', label: SECTION_LABELS.photos },
  // I am keeping this line here because the surrounding sections.js workflow expects this value or operation before it continues.
  { value: 'trips', label: SECTION_LABELS.trips },
  // I am keeping this line here because the surrounding sections.js workflow expects this value or operation before it continues.
  { value: 'family', label: SECTION_LABELS.family },
  // I am keeping this line here because the surrounding sections.js workflow expects this value or operation before it continues.
  { value: 'chats', label: SECTION_LABELS.chats },
  // I am keeping this line here because the surrounding sections.js workflow expects this value or operation before it continues.
  { value: 'receipts', label: SECTION_LABELS.receipts }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
];

