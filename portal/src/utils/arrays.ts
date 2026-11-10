export function bisect<T>(
  array: T[],
  condition: (item: T) => boolean | undefined | null
): { fit: T[]; unfit: T[] } {
  const fit = [];
  const unfit = [];
  for (const item of array) {
    if (condition(item)) {
      fit.push(item);
    } else {
      unfit.push(item);
    }
  }
  return { fit, unfit };
}
