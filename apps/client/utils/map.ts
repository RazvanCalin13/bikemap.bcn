// Generate color based on bike type
export function getColorFromBikeType(rideableType: string): string {
  // Electric bikes: light blue (#60a5fa - blue-400)
  if (rideableType === 'electric_bike') {
    return '#60a5fa';
  }
  // Classic bikes: gray (rgb(160, 160, 160))
  if (rideableType === 'classic_bike') {
    return 'rgb(160, 160, 160)';
  }
  // Fallback to gray
  return 'rgb(160, 160, 160)';
}

