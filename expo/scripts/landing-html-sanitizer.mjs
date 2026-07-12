function findAllOccurrences(input, needle) {
  const positions = [];
  let cursor = 0;

  while (cursor < input.length) {
    const index = input.indexOf(needle, cursor);
    if (index === -1) {
      break;
    }
    positions.push(index);
    cursor = index + needle.length;
  }

  return positions;
}

function hasStableSpacing(positions) {
  if (positions.length < 3) {
    return true;
  }

  const distances = [];
  for (let index = 1; index < positions.length; index += 1) {
    distances.push(positions[index] - positions[index - 1]);
  }

  const baseline = distances[0] ?? 0;
  return distances.every((distance) => Math.abs(distance - baseline) <= 1024);
}

export function sanitizeLandingHtml(html) {
  const normalizedHtml = typeof html === 'string' ? html : '';
  if (!normalizedHtml) {
    return {
      html: normalizedHtml,
      duplicateBlockCount: 0,
      markerOccurrences: 0,
    };
  }

  const startMarker = 'function formatCurrency(';
  const verificationMarker = 'function renderDeals(deals) {';
  const startPositions = findAllOccurrences(normalizedHtml, startMarker);
  const verificationPositions = findAllOccurrences(normalizedHtml, verificationMarker);

  const isDuplicatedRuntime = startPositions.length > 1
    && startPositions.length === verificationPositions.length
    && hasStableSpacing(startPositions)
    && hasStableSpacing(verificationPositions);

  if (!isDuplicatedRuntime) {
    return {
      html: normalizedHtml,
      duplicateBlockCount: 0,
      markerOccurrences: startPositions.length,
    };
  }

  const cleanedHtml = normalizedHtml.slice(0, startPositions[0]) + normalizedHtml.slice(startPositions[startPositions.length - 1]);

  return {
    html: cleanedHtml,
    duplicateBlockCount: startPositions.length - 1,
    markerOccurrences: startPositions.length,
  };
}
