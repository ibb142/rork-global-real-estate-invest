-- CLEAN STOCK PHOTOS FROM JV_DEALS
-- Run this in Supabase SQL Editor to remove all fake/stock photos from existing deals
-- This replaces any photos array containing unsplash/pexels/stock URLs with empty array

-- Step 1: Show current state (what will be cleaned)
SELECT id, name, title,
  jsonb_array_length(COALESCE(photos, '[]'::jsonb)) as photo_count,
  photos::text as photos_preview
FROM jv_deals
WHERE photos IS NOT NULL
  AND photos::text != '[]'
  AND (
    photos::text ILIKE '%unsplash.com%'
    OR photos::text ILIKE '%pexels.com%'
    OR photos::text ILIKE '%pixabay.com%'
    OR photos::text ILIKE '%picsum.photos%'
    OR photos::text ILIKE '%placehold%'
    OR photos::text ILIKE '%stocksnap%'
    OR photos::text ILIKE '%dummyimage%'
    OR photos::text ILIKE '%fakeimg%'
    OR photos::text ILIKE '%loremflickr%'
    OR photos::text ILIKE '%lorempixel%'
  );

-- Step 2: Clean — set photos to empty array for deals with stock photos
UPDATE jv_deals
SET photos = '[]'::jsonb,
    updated_at = now()
WHERE photos IS NOT NULL
  AND photos::text != '[]'
  AND (
    photos::text ILIKE '%unsplash.com%'
    OR photos::text ILIKE '%pexels.com%'
    OR photos::text ILIKE '%pixabay.com%'
    OR photos::text ILIKE '%picsum.photos%'
    OR photos::text ILIKE '%placehold%'
    OR photos::text ILIKE '%stocksnap%'
    OR photos::text ILIKE '%dummyimage%'
    OR photos::text ILIKE '%fakeimg%'
    OR photos::text ILIKE '%loremflickr%'
    OR photos::text ILIKE '%lorempixel%'
  );

-- Step 3: Also clean landing_deals if it exists
UPDATE landing_deals
SET photos = '[]'::jsonb
WHERE photos IS NOT NULL
  AND photos::text != '[]'
  AND (
    photos::text ILIKE '%unsplash.com%'
    OR photos::text ILIKE '%pexels.com%'
    OR photos::text ILIKE '%pixabay.com%'
    OR photos::text ILIKE '%picsum.photos%'
    OR photos::text ILIKE '%placehold%'
  );

-- Step 4: Verify — show cleaned state
SELECT id, name, title,
  jsonb_array_length(COALESCE(photos, '[]'::jsonb)) as photo_count
FROM jv_deals
ORDER BY created_at DESC;
