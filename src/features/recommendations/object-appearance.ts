export const getBookThickness = (id: string) => {
  const hash = [...id].reduce(
    (value, character) => ((value * 31) + character.charCodeAt(0)) >>> 0,
    0,
  );
  return 0.38 + (hash % 5) * 0.055;
};
