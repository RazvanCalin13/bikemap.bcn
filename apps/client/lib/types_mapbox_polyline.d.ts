declare module "@mapbox/polyline" {
    export function decode(encoded: string, precision?: number): [number, number][];
    export function encode(coordinates: [number, number][], precision?: number): string;
    export function fromGeoJSON(geojson: any, precision?: number): string;
}
