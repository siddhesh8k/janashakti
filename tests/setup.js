import '@testing-library/jest-dom';

// Global test setup for Vitest (jsdom). These mocks are convenience defaults for the new
// component / AI-generated tests. The EXISTING src tests self-mock Firebase / Gemini
// inline (per-file vi.mock takes precedence), so they're unaffected by these.

// Mock the app's Firebase module (avoids real SDK init / env reads).
vi.mock('../src/firebase', () => ({
  auth: {
    currentUser: { uid: 'test-user-123', displayName: 'Test Citizen', photoURL: null, email: 'test@janashakti.app' },
    onAuthStateChanged: vi.fn(),
  },
  db: {},
  storage: {},
  signInWithGoogle: vi.fn(),
  signInAsGuest: vi.fn(),
  signUpWithEmail: vi.fn(),
  signInWithEmail: vi.fn(),
  logOut: vi.fn(),
  createUserProfile: vi.fn(),
  completeRedirectSignIn: vi.fn(() => Promise.resolve(null)),
}));

// Mock Firestore SDK.
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  doc: vi.fn(),
  getDoc: vi.fn(() => Promise.resolve({ exists: () => false, data: () => ({}) })),
  getDocs: vi.fn(() => Promise.resolve({ docs: [], size: 0 })),
  getCountFromServer: vi.fn(() => Promise.resolve({ data: () => ({ count: 0 }) })),
  setDoc: vi.fn(),
  addDoc: vi.fn(() => Promise.resolve({ id: 'mock-doc-123' })),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  onSnapshot: vi.fn((q, cb) => { cb({ docs: [] }); return vi.fn(); }),
  query: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  increment: vi.fn((n) => n),
  arrayUnion: vi.fn(),
  serverTimestamp: vi.fn(() => new Date()),
  runTransaction: vi.fn(),
}));

// Mock Firebase Auth SDK.
vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(),
  onAuthStateChanged: vi.fn((auth, cb) => { cb({ uid: 'test-user-123', displayName: 'Test Citizen' }); return vi.fn(); }),
  GoogleAuthProvider: vi.fn(),
  signInWithPopup: vi.fn(),
  signInWithRedirect: vi.fn(),
  getRedirectResult: vi.fn(() => Promise.resolve(null)),
  signInAnonymously: vi.fn(),
  createUserWithEmailAndPassword: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  signOut: vi.fn(),
}));

// jsdom lacks these browser APIs the app touches — stub them so component tests don't crash.
const mockGeolocation = {
  getCurrentPosition: vi.fn((success) => success({ coords: { latitude: 12.9716, longitude: 77.5946, accuracy: 10 } })),
  watchPosition: vi.fn(() => 1),
  clearWatch: vi.fn(),
};
if (!('geolocation' in navigator)) {
  Object.defineProperty(navigator, 'geolocation', { value: mockGeolocation, configurable: true });
} else {
  navigator.geolocation.getCurrentPosition = mockGeolocation.getCurrentPosition;
  navigator.geolocation.watchPosition = mockGeolocation.watchPosition;
  navigator.geolocation.clearWatch = mockGeolocation.clearWatch;
}

vi.stubGlobal('SpeechRecognition', vi.fn());
vi.stubGlobal('webkitSpeechRecognition', vi.fn());
vi.stubGlobal('speechSynthesis', { speak: vi.fn(), cancel: vi.fn(), getVoices: vi.fn(() => []) });

if (!window.matchMedia) {
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches: false, media: query, onchange: null,
    addEventListener: vi.fn(), removeEventListener: vi.fn(),
    addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
  }));
}
