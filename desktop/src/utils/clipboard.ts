import { writeText } from '@tauri-apps/plugin-clipboard-manager';

/**
 * Copies text to system clipboard using Tauri clipboard plugin with fallback to browser API.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (!text) return false;
  try {
    await writeText(text);
    return true;
  } catch (err) {
    console.warn('Tauri writeText failed, attempting navigator.clipboard fallback:', err);
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (fallbackErr) {
      console.error('All clipboard write methods failed:', fallbackErr);
    }
    return false;
  }
}
