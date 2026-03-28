import { Platform, Alert } from 'react-native';

function escapeCSV(value: string | number | boolean | null | undefined): string {
  const str = String(value ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function generateCSV(headers: string[], rows: (string | number | boolean | null | undefined)[][]): string {
  const headerLine = headers.map(escapeCSV).join(',');
  const dataLines = rows.map(row => row.map(escapeCSV).join(','));
  return [headerLine, ...dataLines].join('\n');
}

export async function exportCSV(
  headers: string[],
  rows: (string | number | boolean | null | undefined)[][],
  fileName: string = 'export'
): Promise<boolean> {
  const csv = generateCSV(headers, rows);

  try {
    if (Platform.OS === 'web') {
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${fileName}.csv`;
      link.click();
      URL.revokeObjectURL(url);
      console.log('[CSV] Downloaded:', fileName);
      return true;
    }

    const FileSystem = await import('expo-file-system');
    const cacheDir = (FileSystem as any).cacheDirectory ?? (FileSystem as any).documentDirectory ?? FileSystem.Paths.cache ?? '';
    const fileUri = `${cacheDir}${fileName}.csv`;
    await FileSystem.writeAsStringAsync(fileUri, csv);
    console.log('[CSV] Written to:', fileUri);

    const Sharing = await import('expo-sharing');
    const available = await Sharing.isAvailableAsync();
    if (available) {
      await Sharing.shareAsync(fileUri, {
        mimeType: 'text/csv',
        dialogTitle: `Export ${fileName}`,
      });
      return true;
    }

    Alert.alert('Export Complete', `File saved as ${fileName}.csv`);
    return true;
  } catch (error) {
    console.error('[CSV] Export error:', (error as Error)?.message);
    Alert.alert('Export Failed', 'Could not export data. Please try again.');
    return false;
  }
}
