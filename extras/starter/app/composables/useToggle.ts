// Exports from app/composables are auto-imported. Delete this file when you don't need it.
export function useToggle(initial = false) {
  const value = ref(initial);
  const toggle = () => (value.value = !value.value);
  return { value, toggle };
}
