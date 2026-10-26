/** Deep copy of plain serialisable data (sim state is always plain data). */
export function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
