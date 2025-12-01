// Generate a blue-ish color from an ID (using a hash function)
export function getColorFromId(id: string | number): string {
  // Convert ID to string and hash it
  const str = String(id);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  // Generate blue-ish RGB values
  // Red: low (0-80) for blue tones
  const r = Math.abs(hash) % 80;
  // Green: moderate (80-180) for cyan-blue variations
  const g = 80 + (Math.abs(hash >> 8) % 100);
  // Blue: high (150-255) for strong blue
  const b = 150 + (Math.abs(hash >> 16) % 105);
  return `rgb(${r}, ${g}, ${b})`;
}

