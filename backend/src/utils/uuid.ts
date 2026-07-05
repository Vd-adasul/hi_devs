export function objectIdToUuid(objectId: string): string {
  // A MongoDB ObjectId is 24 hex characters
  // A UUID is 8-4-4-4-12 = 32 hex characters with dashes
  // We can prepend "00000000" (8 chars) to make it 32 characters, then insert dashes
  const padded = '00000000' + objectId; // 32 characters
  return [
    padded.slice(0, 8),
    padded.slice(8, 12),
    padded.slice(12, 16),
    padded.slice(16, 20),
    padded.slice(20, 32)
  ].join('-');
}
