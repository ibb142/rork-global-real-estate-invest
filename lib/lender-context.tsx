import { useState, useEffect, useCallback, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import createContextHook from '@nkzw/create-context-hook';
import { Lender, LenderCategory, LenderStatus } from '@/types';
import { lenders as mockLenders, getLenderStats as getMockStats } from '@/mocks/lenders';
import { DiscoveredLender } from '@/mocks/lender-discovery';
import { SECSearchResult } from '@/lib/sec-edgar-service';
import { trpc } from '@/lib/trpc';

const STORAGE_KEY = 'ipx_imported_lenders';

interface ImportedLenderRecord {
  lender: Lender;
  source: 'discovery' | 'sec_edgar';
  importedAt: string;
}

function discoveredToLender(d: DiscoveredLender): Lender {
  return {
    id: `imported-${d.id}`,
    name: d.name,
    type: d.type,
    category: d.category,
    contactName: d.contactName,
    contactTitle: d.contactTitle,
    email: d.email,
    phone: d.phone,
    website: d.website,
    address: d.address,
    city: d.city,
    state: d.state,
    country: d.country,
    description: d.description,
    aum: d.aum,
    minInvestment: d.minInvestment,
    maxInvestment: d.maxInvestment,
    preferredPropertyTypes: d.preferredPropertyTypes,
    preferredRegions: d.preferredRegions,
    interestRate: d.interestRate,
    status: 'prospect' as LenderStatus,
    totalInvested: 0,
    propertiesInvested: 0,
    rating: Math.min(5, Math.max(1, Math.round(d.confidence / 20))),
    tags: [...d.tags, `source:${d.source}`, 'imported'],
    createdAt: new Date().toISOString(),
  };
}

function secResultToLender(s: SECSearchResult): Lender {
  return {
    id: `sec-imported-${s.cik}`,
    name: s.name,
    type: s.type,
    category: s.category,
    contactName: s.contactName,
    contactTitle: s.contactTitle,
    email: s.email,
    phone: s.phone,
    website: s.sourceUrl,
    address: '',
    city: s.city,
    state: s.state,
    country: s.country,
    description: s.description,
    aum: s.aum,
    minInvestment: 1000000,
    maxInvestment: Math.round(s.aum * 0.05),
    preferredPropertyTypes: ['commercial', 'residential'],
    preferredRegions: ['North America'],
    status: 'prospect' as LenderStatus,
    totalInvested: 0,
    propertiesInvested: 0,
    rating: Math.min(5, Math.max(1, Math.round(s.confidence / 20))),
    tags: [...s.tags, 'sec-imported', 'real-data'],
    createdAt: new Date().toISOString(),
  };
}

export const [LenderProvider, useLenders] = createContextHook(() => {
  const queryClient = useQueryClient();
  const [importedLenders, setImportedLenders] = useState<ImportedLenderRecord[]>([]);
  const [backendSynced, setBackendSynced] = useState(false);

  const syncConfigQuery = trpc.lenderSync.getSyncConfig.useQuery(undefined, {
    enabled: true,
    retry: 1,
    staleTime: 300000,
  });

  useEffect(() => {
    if (syncConfigQuery.data) {
      setBackendSynced(true);
      console.log('[LenderContext] Backend sync config loaded, auto-sync:', syncConfigQuery.data.autoSyncEnabled);
    } else if (syncConfigQuery.error) {
      console.log('[LenderContext] Backend not available, using local data only');
    }
  }, [syncConfigQuery.data, syncConfigQuery.error]);

  const storedQuery = useQuery({
    queryKey: ['imported-lenders'],
    queryFn: async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored) as ImportedLenderRecord[];
          console.log('[LenderContext] Loaded', parsed.length, 'imported lenders from storage');
          return parsed;
        }
      } catch (e) {
        console.log('[LenderContext] Error loading stored lenders:', e);
      }
      return [] as ImportedLenderRecord[];
    },
  });

  useEffect(() => {
    if (storedQuery.data) {
      setImportedLenders(storedQuery.data);
    }
  }, [storedQuery.data]);

  const saveMutation = useMutation({
    mutationFn: async (records: ImportedLenderRecord[]) => {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(records));
      return records;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['imported-lenders'] });
    },
  });

  const allLenders = useMemo(() => {
    const imported = importedLenders.map(r => r.lender);
    const importedIds = new Set(imported.map(l => l.name.toLowerCase()));
    const filtered = mockLenders.filter(l => !importedIds.has(l.name.toLowerCase()));
    return [...filtered, ...imported];
  }, [importedLenders]);

  const importDiscoveredLender = useCallback((discovered: DiscoveredLender) => {
    const exists = importedLenders.some(
      r => r.lender.name.toLowerCase() === discovered.name.toLowerCase()
    );
    if (exists) {
      console.log('[LenderContext] Lender already imported:', discovered.name);
      return false;
    }

    const lender = discoveredToLender(discovered);
    const record: ImportedLenderRecord = {
      lender,
      source: 'discovery',
      importedAt: new Date().toISOString(),
    };
    const updated = [...importedLenders, record];
    setImportedLenders(updated);
    saveMutation.mutate(updated);
    console.log('[LenderContext] Imported discovered lender:', discovered.name);
    return true;
  }, [importedLenders, saveMutation]);

  const importSECLender = useCallback((secResult: SECSearchResult) => {
    const exists = importedLenders.some(
      r => r.lender.name.toLowerCase() === secResult.name.toLowerCase()
    );
    if (exists) {
      console.log('[LenderContext] SEC lender already imported:', secResult.name);
      return false;
    }

    const lender = secResultToLender(secResult);
    const record: ImportedLenderRecord = {
      lender,
      source: 'sec_edgar',
      importedAt: new Date().toISOString(),
    };
    const updated = [...importedLenders, record];
    setImportedLenders(updated);
    saveMutation.mutate(updated);
    console.log('[LenderContext] Imported SEC lender:', secResult.name);
    return true;
  }, [importedLenders, saveMutation]);

  const importMultipleDiscovered = useCallback((lenders: DiscoveredLender[]) => {
    let count = 0;
    const newRecords: ImportedLenderRecord[] = [];
    const existingNames = new Set(importedLenders.map(r => r.lender.name.toLowerCase()));

    for (const d of lenders) {
      if (existingNames.has(d.name.toLowerCase())) continue;
      existingNames.add(d.name.toLowerCase());
      newRecords.push({
        lender: discoveredToLender(d),
        source: 'discovery',
        importedAt: new Date().toISOString(),
      });
      count++;
    }

    if (count > 0) {
      const updated = [...importedLenders, ...newRecords];
      setImportedLenders(updated);
      saveMutation.mutate(updated);
      console.log('[LenderContext] Bulk imported', count, 'discovered lenders');
    }
    return count;
  }, [importedLenders, saveMutation]);

  const importMultipleSEC = useCallback((results: SECSearchResult[]) => {
    let count = 0;
    const newRecords: ImportedLenderRecord[] = [];
    const existingNames = new Set(importedLenders.map(r => r.lender.name.toLowerCase()));

    for (const s of results) {
      if (existingNames.has(s.name.toLowerCase())) continue;
      existingNames.add(s.name.toLowerCase());
      newRecords.push({
        lender: secResultToLender(s),
        source: 'sec_edgar',
        importedAt: new Date().toISOString(),
      });
      count++;
    }

    if (count > 0) {
      const updated = [...importedLenders, ...newRecords];
      setImportedLenders(updated);
      saveMutation.mutate(updated);
      console.log('[LenderContext] Bulk imported', count, 'SEC lenders');
    }
    return count;
  }, [importedLenders, saveMutation]);

  const isImported = useCallback((name: string) => {
    return importedLenders.some(r => r.lender.name.toLowerCase() === name.toLowerCase()) ||
      mockLenders.some(l => l.name.toLowerCase() === name.toLowerCase());
  }, [importedLenders]);

  const stats = useMemo(() => {
    const publicCount = allLenders.filter(l => l.type === 'public').length;
    const privateCount = allLenders.filter(l => l.type === 'private').length;
    const activeCount = allLenders.filter(l => ['active', 'interested', 'committed'].includes(l.status)).length;
    const totalInvested = allLenders.reduce((sum, l) => sum + l.totalInvested, 0);
    const secCount = importedLenders.filter(r => r.source === 'sec_edgar').length;
    const discoveryCount = importedLenders.filter(r => r.source === 'discovery').length;

    return {
      totalLenders: allLenders.length,
      publicLenders: publicCount,
      privateLenders: privateCount,
      activeLenders: activeCount,
      totalInvested,
      importedFromSEC: secCount,
      importedFromDiscovery: discoveryCount,
      totalImported: importedLenders.length,
    };
  }, [allLenders, importedLenders]);

  return {
    allLenders,
    importedLenders,
    stats,
    isLoading: storedQuery.isLoading,
    backendSynced,
    importDiscoveredLender,
    importSECLender,
    importMultipleDiscovered,
    importMultipleSEC,
    isImported,
  };
});
