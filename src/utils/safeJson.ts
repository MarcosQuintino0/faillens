export function toJsonSafe(value: unknown): unknown {
  const seen = new WeakSet<object>();
  const serialized = JSON.stringify(value, (_key, current: unknown) => {
      if (typeof current === "bigint") return current.toString();
      if (typeof current === "function" || typeof current === "symbol") return undefined;
      if (current instanceof Error) {
        return { name: current.name, message: current.message, stack: current.stack };
      }
      if (current && typeof current === "object") {
        if (seen.has(current)) return "[Circular]";
        seen.add(current);
      }
      return current;
    });
  return serialized === undefined ? undefined : JSON.parse(serialized);
}

export function stringifyForDisplay(value: unknown): string {
  if (value === undefined) return "—";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
