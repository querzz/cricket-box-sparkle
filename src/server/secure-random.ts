export function secureRandomUnit(): number {
  const values = new Uint32Array(2);
  crypto.getRandomValues(values);
  return (values[0]! * 2 ** 21 + (values[1]! >>> 11)) / 2 ** 53;
}
