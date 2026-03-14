import { useState, useEffect, useCallback, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import createContextHook from '@nkzw/create-context-hook';
import { Lender, LenderStatus } from '@/types';
import { lenders as mockLenders } from '@/mocks/lenders';
import { DiscoveredLender } from '@/mocks/lender-discovery';
import { SECSearchResult } from '@/lib/sec-edgar-service';
import { supabase } from '@/lib/supabase';
import { getAuthUserId } from '@/lib/auth-store';
import { scopedKey } from '@/lib/project-storage';

const STORAGE_KEY = scopedKey('imported_lenders');

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

function lenderToSupabaseRow(lender: Lender, source: string, userId: string) {
  return {
    id: lender.id,
    user_id: userId,
    name: lender.name,
    type: lender.type,
    category: lender.category,
    contact_name: lender.contactName,
    contact_title: lender.contactTitle,
    email: lender.email,
    phone: lender.phone,
    website: lender.website || '',
    address: lender.address,
    city: lender.city,
    state: lender.state,
    country: lender.country,
    description: lender.description,
    aum: lender.aum,
    min_investment: lender.minInvestment,
    max_investment: lender.maxInvestment,
    preferred_property_types: lender.preferredPropertyTypes,
    preferred_regions: lender.preferredRegions,
    interest_rate: lender.interestRate,
    status: lender.status,
    total_invested: lender.totalInvested,
    properties_invested: lender.propertiesInvested,
    rating: lender.rating,
    tags: lender.tags,
    source,
    imported_at: new Date().toISOString(),
    created_at: lender.createdAt,
  };
}

function supabaseRowToRecord(row: any): ImportedLenderRecord {
  return {
    lender: {
      id: row.id,
      name: row.name,
      type: row.type,
      category: row.category,
      contactName: row.contact_name,
      contactTitle: row.contact_title,
      email: row.email,
      phone: row.phone,
      website: row.website,
      address: row.address,
      city: row.city,
      state: row.state,
      country: row.country,
      description: row.description,
      aum: row.aum,
      minInvestment: row.min_investment,
      maxInvestment: row.max_investment,
      preferredPropertyTypes: row.preferred_property_types || [],
      preferredRegions: row.preferred_regions || [],
      interestRate: row.interest_rate,
      status: row.status,
      totalInvested: row.total_invested || 0,
      propertiesInvested: row.properties_invested || 0,
      rating: row.rating || 3,
      tags: row.tags || [],
      createdAt: row.created_at,
    },
    source: row.source || 'discovery',
    importedAt: row.imported_at || row.created_at,
  };
}

export const [LenderProvider, useLenders] = createContextHook(() => {
  const queryClient = useQueryClient();
  const [importedLenders, setImportedLenders] = useState<ImportedLenderRecord[]>([]);

  const storedQuery = useQuery({
    queryKey: ['imported-lenders'],
    queryFn: async () => {
      const userId = getAuthUserId();

      if (userId) {
        try {
          const { data, error } = await supabase
            .from('imported_lenders')
            .select('*')
            .eq('user_id', userId);

          if (!error && data && data.length > 0) {
            console.log('[LenderContext] Loaded', data.length, 'lenders from Supabase');
            const records = data.map(supabaseRowToRecord);
            await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(records));
            return records;
          }
        } catch (e) {
          console.log('[LenderContext] Supabase fetch failed:', e);
        }
      }

      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored) as ImportedLenderRecord[];
          console.log('[LenderContext] Loaded', parsed.length, 'imported lenders from local');
          return parsed;
        }
      } catch (e) {
        console.log('[LenderContext] Error loading stored lenders:', e);
      }
      return [] as ImportedLenderRecord[];
    },
    staleTime: 1000 * 60 * 5,
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
      void queryClient.invalidateQueries({ queryKey: ['imported-lenders'] });
    },
  });

  const saveToSupabase = useCallback(async (lender: Lender, source: string) => {
    const userId = getAuthUserId();
    if (!userId) return;
    try {
      await supabase.from('imported_lenders').upsert(lenderToSupabaseRow(lender, source, userId));
      console.log('[LenderContext] Saved lender to Supabase:', lender.name);
    } catch (e) {
      console.log('[LenderContext] Supabase save failed:', e);
    }
  }, []);

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
    void saveToSupabase(lender, 'discovery');
    console.log('[LenderContext] Imported discovered lender:', discovered.name);
    return true;
  }, [importedLenders, saveMutation, saveToSupabase]);

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
    void saveToSupabase(lender, 'sec_edgar');
    console.log('[LenderContext] Imported SEC lender:', secResult.name);
    return true;
  }, [importedLenders, saveMutation, saveToSupabase]);

  const importMultipleDiscovered = useCallback((lenders: DiscoveredLender[]) => {
    let count = 0;
    const newRecords: ImportedLenderRecord[] = [];
    const existingNames = new Set(importedLenders.map(r => r.lender.name.toLowerCase()));

    for (const d of lenders) {
      if (existingNames.has(d.name.toLowerCase())) continue;
      existingNames.add(d.name.toLowerCase());
      const lender = discoveredToLender(d);
      newRecords.push({
        lender,
        source: 'discovery',
        importedAt: new Date().toISOString(),
      });
      void saveToSupabase(lender, 'discovery');
      count++;
    }

    if (count > 0) {
      const updated = [...importedLenders, ...newRecords];
      setImportedLenders(updated);
      saveMutation.mutate(updated);
      console.log('[LenderContext] Bulk imported', count, 'discovered lenders');
    }
    return count;
  }, [importedLenders, saveMutation, saveToSupabase]);

  const importMultipleSEC = useCallback((results: SECSearchResult[]) => {
    let count = 0;
    const newRecords: ImportedLenderRecord[] = [];
    const existingNames = new Set(importedLenders.map(r => r.lender.name.toLowerCase()));

    for (const s of results) {
      if (existingNames.has(s.name.toLowerCase())) continue;
      existingNames.add(s.name.toLowerCase());
      const lender = secResultToLender(s);
      newRecords.push({
        lender,
        source: 'sec_edgar',
        importedAt: new Date().toISOString(),
      });
      void saveToSupabase(lender, 'sec_edgar');
      count++;
    }

    if (count > 0) {
      const updated = [...importedLenders, ...newRecords];
      setImportedLenders(updated);
      saveMutation.mutate(updated);
      console.log('[LenderContext] Bulk imported', count, 'SEC lenders');
    }
    return count;
  }, [importedLenders, saveMutation, saveToSupabase]);

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

  return useMemo(() => ({
    allLenders,
    importedLenders,
    stats,
    isLoading: storedQuery.isLoading,
    backendSynced: true,
    importDiscoveredLender,
    importSECLender,
    importMultipleDiscovered,
    importMultipleSEC,
    isImported,
  }), [allLenders, importedLenders, stats, storedQuery.isLoading, importDiscoveredLender, importSECLender, importMultipleDiscovered, importMultipleSEC, isImported]);
});
