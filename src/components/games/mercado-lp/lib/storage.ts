/**
 * LocalStorage utilities for persisting game state
 */

const STORAGE_KEY = 'mercado-lp-game-state';
const STORAGE_VERSION = '2.0';

interface StorageData {
  version: string;
  player: any;
  pools: any[];
  tokens: any[];
  currentLevel: number;
  showMap: boolean;
  lastSaved: number;
}

export const saveGameState = (data: Omit<StorageData, 'version' | 'lastSaved'>) => {
  try {
    const storageData: StorageData = {
      ...data,
      version: STORAGE_VERSION,
      lastSaved: Date.now(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(storageData));
    return true;
  } catch (error) {
    console.error('Error saving game state:', error);
    return false;
  }
};

export const loadGameState = (): StorageData | null => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;

    const data = JSON.parse(stored) as StorageData;

    // Version check - if version mismatch, discard old data
    if (data.version !== STORAGE_VERSION) {
      console.warn('Storage version mismatch, clearing old data');
      clearGameState();
      return null;
    }

    return data;
  } catch (error) {
    console.error('Error loading game state:', error);
    return null;
  }
};

export const clearGameState = () => {
  try {
    localStorage.removeItem(STORAGE_KEY);
    return true;
  } catch (error) {
    console.error('Error clearing game state:', error);
    return false;
  }
};

export const hasStoredGame = (): boolean => {
  return localStorage.getItem(STORAGE_KEY) !== null;
};
