import { Platform } from 'react-native';

export async function safeSetString(text: string): Promise<boolean> {
  try {
    if (Platform.OS === 'web') {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(textarea);
      console.log('[SafeClipboard] Fallback copy result:', ok);
      return ok;
    }
    const Clipboard = await import('expo-clipboard');
    await Clipboard.setStringAsync(text);
    return true;
  } catch (e) {
    console.log('[SafeClipboard] Copy failed:', e);
    return false;
  }
}
