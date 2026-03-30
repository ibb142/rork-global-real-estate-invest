export interface SqlScript {
  id: string;
  fileName: string;
  title: string;
  category: string;
  lineCount: number;
  content: string;
  version: string;
  updatedAt: string;
}

export const SQL_SCRIPTS: SqlScript[] = [];
export const SQL_CATEGORIES: string[] = [];
export const SCRIPTS_VERSION = 'v2.0-live';
